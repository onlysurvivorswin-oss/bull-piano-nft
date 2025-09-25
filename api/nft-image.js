import { list } from '@vercel/blob';

// Asset URLs for each market state
const ASSET_URLS = {
  capitulation: 'https://6txiabgkdvd5nenuupzxtp7lbxcvx4vw3kra4ly7blafm2mproda.arweave.net/9O6ABModR9aRtKPzeb_rDcVb8rbaog4vHwrAVmmPi4Y',
  stagnation: 'https://r4vsc7esu3z27xxgh2bqrocs3jz4pin44ahw4hwk3ilabk2o2vwq.arweave.net/jyshfJKm86_e5j6DCLhS2nPHobzgD24eytoWAKtO1W0',
  resilience: 'https://lgwaa4z6aegrwftnh3v2zdaxjgvvxyv5g7orzbzufbpc5hgqnm5q.arweave.net/WawAcz4BDRsWbT7rrIwXSatb4r033RyHNCheLpzQazs',
  euphoria: 'https://tkf3ssqdvpe3bnk25od6twbu3rioxksaxmedvldcs3nbs4ickpoq.arweave.net/mou5SgOrybC1WuuH6dg03FDrqkC7CDqsYpbaGXECU90'
};

export default async function handler(req, res) {
  console.log('NFT image endpoint - serving cached data only');
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check for manual override first (for testing)
    const forceState = req.query.force;
    if (forceState && forceState in ASSET_URLS) {
      console.log(`Manual override: forcing ${forceState} state`);
      res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
      return res.redirect(302, ASSET_URLS[forceState]);
    }
    
    // Read cached sentiment data from Vercel Blob
    const { blobs } = await list({
      prefix: 'market/',
      limit: 1
    });
    
    if (blobs.length === 0) {
      // No cached data available - fallback to stagnation
      console.warn('No cached sentiment data found, falling back to stagnation');
      res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
      return res.redirect(302, ASSET_URLS.stagnation);
    }
    
    // Fetch the latest cached data
    const latestBlob = blobs[0];
    const response = await fetch(latestBlob.url);
    
    if (!response.ok) {
      console.error(`Failed to fetch cached data: ${response.status}`);
      res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
      return res.redirect(302, ASSET_URLS.stagnation);
    }
    
    const cachedData = await response.json();
    const market_state = cachedData.market_state;
    
    // Validate market state
    if (!market_state || !(market_state in ASSET_URLS)) {
      console.error(`Invalid market state in cached data: ${market_state}`);
      res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
      return res.redirect(302, ASSET_URLS.stagnation);
    }
    
    // Check if data is stale (older than 36 hours)
    const dataAge = Date.now() - cachedData.timestamp;
    const isStale = dataAge > (36 * 60 * 60 * 1000); // 36 hours
    
    if (isStale) {
      console.warn(`Cached data is stale (${Math.round(dataAge / (60 * 60 * 1000))} hours old), but serving anyway`);
    }
    
    console.log(`Serving cached market state: ${market_state} (data age: ${Math.round(dataAge / (60 * 60 * 1000))}h)`);
    
    // Set cache headers for 12-hour caching
    res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
    res.setHeader('ETag', `"${market_state}-${latestBlob.downloadUrl.split('/').pop()}"`);
    
    // Redirect to appropriate image
    return res.redirect(302, ASSET_URLS[market_state]);
    
  } catch (error) {
    console.error('Error serving cached NFT image:', error);
    
    // Fallback to stagnation on any error
    res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
    return res.redirect(302, ASSET_URLS.stagnation);
  }
}