// NFT Image Vercel Function - ES Module version
// Redirects to appropriate Arweave URL based on market sentiment

const ASSET_URLS = {
  capitulation: 'https://6txiabgkdvd5nenuupzxtp7lbxcvx4vw3kra4ly7blafm2mproda.arweave.net/9O6ABModR9aRtKPzeb_rDcVb8rbaog4vHwrAVmmPi4Y',
  stagnation: 'https://r4vsc7esu3z27xxgh2bqrocs3jz4pin44ahw4hwk3ilabk2o2vwq.arweave.net/jyshfJKm86_e5j6DCLhS2nPHobzgD24eytoWAKtO1W0',
  resilience: 'https://lgwaa4z6aegrwftnh3v2zdaxjgvvxyv5g7orzbzufbpc5hgqnm5q.arweave.net/WawAcz4BDRsWbT7rrIwXSatb4r033RyHNCheLpzQazs',
  euphoria: 'https://tkf3ssqdvpe3bnk25od6twbu3rioxksaxmedvldcs3nbs4ickpoq.arweave.net/mou5SgOrybC1WuuH6dg03FDrqkC7CDqsYpbaGXECU90'
};

export default async function handler(req, res) {
  console.log('NFT image endpoint called');
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { force: forceState } = req.query;
    
    // Check for manual override first (for testing)
    if (forceState && forceState in ASSET_URLS) {
      console.log(`Force override: ${forceState}`);
      res.writeHead(302, { 'Location': ASSET_URLS[forceState] });
      return res.end();
    }
    
    // Validate API key
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    if (!ALCHEMY_API_KEY) {
      console.warn('ALCHEMY_API_KEY not configured, falling back to stagnation');
      res.writeHead(302, { 'Location': ASSET_URLS.stagnation });
      return res.end();
    }
    
    console.log('Calculating market sentiment for image selection...');
    
    // Quick market sentiment calculation using top 3 collections for speed
    const collections = [
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
      '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb', // CryptoPunks  
      '0xED5AF388653567Af2F388E6224dC7C4b3241C544'  // Azuki
    ];

    let totalVolume = 0;
    let successfulCalls = 0;
    
    // Fetch from top 3 collections for faster response
    const fetchPromises = collections.map(async (contractAddress) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
        
        const response = await fetch(
          `https://eth-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_API_KEY}/getNFTSales?contractAddress=${contractAddress}&order=desc&limit=30`,
          { 
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) return 0;

        const data = await response.json();
        const sales = data.nftSales || [];
        
        let volume = 0;
        sales.forEach(sale => {
          try {
            const sellerFee = BigInt(sale.sellerFee?.amount || '0');
            const protocolFee = BigInt(sale.protocolFee?.amount || '0');
            const royaltyFee = BigInt(sale.royaltyFee?.amount || '0');
            const totalWei = sellerFee + protocolFee + royaltyFee;
            volume += Number(totalWei) / 1e18;
          } catch (e) {
            // Skip invalid sales
          }
        });

        successfulCalls++;
        return volume;
        
      } catch (error) {
        console.error(`Error fetching ${contractAddress}:`, error.message);
        return 0;
      }
    });

    // Execute all fetches with timeout
    const results = await Promise.allSettled(fetchPromises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        totalVolume += result.value;
      }
    });

    // Extrapolate to full market volume (scale up to 7 collections)
    if (successfulCalls > 0) {
      totalVolume = totalVolume * (7 / Math.max(successfulCalls, 1));
    }

    console.log(`Estimated market volume: ${totalVolume.toFixed(1)} ETH`);

    // Determine market state based on ETH volume thresholds
    let market_state;
    if (totalVolume < 2000) market_state = 'capitulation';      // <2000 ETH
    else if (totalVolume < 4000) market_state = 'stagnation';   // 2000-4000 ETH  
    else if (totalVolume < 7000) market_state = 'resilience';   // 4000-7000 ETH
    else market_state = 'euphoria';                             // 7000+ ETH

    // Get the appropriate image URL
    const imageUrl = ASSET_URLS[market_state] || ASSET_URLS.stagnation;
    
    console.log(`Market state: ${market_state}, redirecting to: ${imageUrl}`);
    
    // Redirect to the Arweave URL
    res.writeHead(302, { 'Location': imageUrl });
    return res.end();
    
  } catch (error) {
    console.error('Error in nft-image function:', error);
    
    // Always fallback to stagnation on any error
    res.writeHead(302, { 'Location': ASSET_URLS.stagnation });
    return res.end();
  }
}