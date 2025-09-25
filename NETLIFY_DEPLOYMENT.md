# Netlify Deployment Guide for Bull & Piano NFT

## Quick Setup Instructions

### 1. File Structure
Your project now has these Netlify-ready files:
```
/
├── netlify/functions/
│   ├── market-sentiment.js     # Market analysis endpoint
│   └── nft-image.js            # Image redirect endpoint
├── public/
│   └── index.html              # Your NFT display page
├── netlify.toml                # Netlify configuration
└── netlify-package.json        # Dependencies for deployment
```

### 2. Deploy to Netlify

#### Option A: Deploy from Git (Recommended)
1. **Push to GitHub/GitLab**
   ```bash
   git add .
   git commit -m "Add Netlify Functions"
   git push origin main
   ```

2. **Connect to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub/GitLab account
   - Select this repository

3. **Configure Build Settings**
   - Build command: `echo "No build needed"`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`

4. **Set Environment Variables**
   - In Netlify dashboard → Site settings → Environment variables
   - Add: `ALCHEMY_API_KEY` = your actual Alchemy API key

#### Option B: Manual Deploy via CLI
1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login and Deploy**
   ```bash
   netlify login
   netlify init
   netlify deploy --prod
   ```

3. **Set Environment Variables**
   ```bash
   netlify env:set ALCHEMY_API_KEY your_actual_api_key_here
   ```

### 3. Your Live URLs

After deployment, your NFT will be accessible at:
- **Main URL**: `https://yoursite.netlify.app/`
- **API endpoints**: 
  - `https://yoursite.netlify.app/api/nft-image`
  - `https://yoursite.netlify.app/api/market-sentiment`

### 4. Testing

Test the deployment:
```bash
# Test the image endpoint
curl https://yoursite.netlify.app/api/nft-image

# Test with different contract
curl "https://yoursite.netlify.app/api/nft-image?contract=0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"

# Test market sentiment API
curl "https://yoursite.netlify.app/api/market-sentiment?contract=0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"
```

## Cost Benefits

**Netlify vs Server Hosting:**
- ✅ **Free tier**: 125,000 function invocations/month
- ✅ **No monthly fees** (unless you exceed limits)
- ✅ **Automatic scaling**
- ✅ **Global CDN**
- ✅ **Built-in SSL**

## How It Works

1. **User visits your NFT**: `https://yoursite.netlify.app/`
2. **HTML loads** with JavaScript that calls `/api/nft-image`
3. **Netlify Function** analyzes market sentiment via Alchemy API
4. **Function redirects** to appropriate Arweave image URL
5. **User sees** dynamic image that reflects current market sentiment

## Local Development

To test locally:
```bash
# Copy the Netlify package.json
cp netlify-package.json package.json

# Install dependencies
npm install

# Start local dev server
netlify dev
```

Your local site will be at `http://localhost:8888`

## Environment Variables Needed

- `ALCHEMY_API_KEY`: Your Alchemy API key for market data

## Fallback Behavior

If the API fails or times out:
- ✅ Automatically shows "stagnation" image
- ✅ Your NFT never breaks completely
- ✅ Users always see something

## Custom Domain (Optional)

After deployment, you can add a custom domain in Netlify:
1. Go to Site settings → Domain management
2. Add custom domain
3. Configure DNS settings
4. SSL automatically enabled

Your NFT will then be accessible at your custom domain!