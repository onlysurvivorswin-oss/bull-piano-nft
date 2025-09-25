import { Octokit } from '@octokit/rest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

let connectionSettings;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

export async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Function to get all files recursively, excluding certain directories
function getAllFiles(dirPath, basePath = dirPath) {
  const files = [];
  const items = readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = join(dirPath, item);
    const stat = statSync(fullPath);
    
    // Skip certain directories and files
    if (item.startsWith('.') || 
        item === 'node_modules' || 
        item === 'dist' || 
        item === 'build' ||
        item === 'tmp' ||
        item.endsWith('.log')) {
      continue;
    }
    
    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, basePath));
    } else {
      const relativePath = relative(basePath, fullPath);
      files.push({
        path: relativePath.replace(/\\/g, '/'), // Ensure forward slashes
        content: readFileSync(fullPath, 'base64'),
        encoding: 'base64'
      });
    }
  }
  
  return files;
}

// Push all files to GitHub repository
export async function pushToGitHub() {
  try {
    const octokit = await getUncachableGitHubClient();
    const owner = 'onlysurvivorswin-oss';
    const repo = 'bull-piano-nft';
    
    console.log('Getting repository information...');
    
    // Get the current repository
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo
    });
    
    // Get the current branch (usually 'main' or 'master')
    const defaultBranch = repoData.default_branch;
    
    // Try to get the current commit SHA, handle empty repo
    let currentCommitSha = null;
    let isEmptyRepo = false;
    
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`
      });
      currentCommitSha = refData.object.sha;
    } catch (error) {
      if (error.status === 409 && error.message.includes('Git Repository is empty')) {
        console.log('Repository is empty, creating initial commit...');
        isEmptyRepo = true;
      } else {
        throw error;
      }
    }
    
    // Get all files from current directory
    console.log('Reading project files...');
    const files = getAllFiles('.');
    
    console.log(`Found ${files.length} files to upload`);
    
    // Create blobs for each file
    console.log('Creating blobs...');
    const blobs = [];
    for (const file of files) {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: file.encoding
      });
      
      blobs.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }
    
    // Create a tree
    console.log('Creating tree...');
    const { data: tree } = await octokit.rest.git.createTree({
      owner,
      repo,
      tree: blobs
    });
    
    // Create a commit
    console.log('Creating commit...');
    const commitData = {
      owner,
      repo,
      message: 'Deploy Bull & Piano NFT with Netlify Functions - Convert to Vercel format',
      tree: tree.sha
    };
    
    // Only add parents if not an empty repo
    if (!isEmptyRepo && currentCommitSha) {
      commitData.parents = [currentCommitSha];
    }
    
    const { data: commit } = await octokit.rest.git.createCommit(commitData);
    
    // Update or create the reference
    console.log('Updating reference...');
    if (isEmptyRepo) {
      // Create the reference for empty repo
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${defaultBranch}`,
        sha: commit.sha
      });
    } else {
      // Update existing reference
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
        sha: commit.sha
      });
    }
    
    console.log('Successfully pushed to GitHub!');
    console.log(`Repository: https://github.com/${owner}/${repo}`);
    console.log(`Commit: ${commit.sha}`);
    
    return {
      success: true,
      commitSha: commit.sha,
      repoUrl: `https://github.com/${owner}/${repo}`
    };
    
  } catch (error) {
    console.error('Error pushing to GitHub:', error);
    throw error;
  }
}