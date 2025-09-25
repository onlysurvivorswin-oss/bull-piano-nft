// NFT Image Vercel Function - redirects to appropriate Arweave URL based on market sentiment

// Asset URLs for each market state
const ASSET_URLS = {
  capitulation: 'https://6txiabgkdvd5nenuupzxtp7lbxcvx4vw3kra4ly7blafm2mproda.arweave.net/9O6ABModR9aRtKPzeb_rDcVb8rbaog4vHwrAVmmPi4Y',
  stagnation: 'https://r4vsc7esu3z27xxgh2bqrocs3jz4pin44ahw4hwk3ilabk2o2vwq.arweave.net/jyshfJKm86_e5j6DCLhS2nPHobzgD24eytoWAKtO1W0',
  resilience: 'https://lgwaa4z6aegrwftnh3v2zdaxjgvvxyv5g7orzbzufbpc5hgqnm5q.arweave.net/WawAcz4BDRsWbT7rrIwXSatb4r033RyHNCheLpzQazs',
  euphoria: 'https://tkf3ssqdvpe3bnk25od6twbu3rioxksaxmedvldcs3nbs4ickpoq.arweave.net/mou5SgOrybC1WuuH6dg03FDrqkC7CDqsYpbaGXECU90'
};

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

module.exports = async function handler(req, res) {
  console.log('NFT image endpoint called');
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, max-age=43200');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.writeHead(302, { 'Location': ASSET_URLS.stagnation });
    return res.end();
  }

  try {
    const { contract: contractAddress = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', force: forceState } = req.query;
    
    console.log('Contract:', contractAddress, 'Force state:', forceState);
    
    // Check for manual override first
    if (forceState && forceState in ASSET_URLS) {
      res.writeHead(302, { 'Location': ASSET_URLS[forceState] });
      return res.end();
    }
    
    // Validate API key
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    if (!ALCHEMY_API_KEY) {
      // Fallback to default state if API not configured
      res.writeHead(302, { 'Location': ASSET_URLS.stagnation });
      return res.end();
    }
    
    // Check cache first
    const cacheKey = `sentiment-${contractAddress}`;
    const cached = cache.get(cacheKey);
    
    let sentimentData;
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      sentimentData = cached.data;
    } else {
      // Fetch fresh sentiment data
      try {
        const baseUrl = 'https://eth-mainnet.g.alchemy.com/nft/v3';
        const apiHeaders = { 'Accept': 'application/json' };
        
        const [floorPriceRes, salesRes] = await Promise.allSettled([
          fetch(`${baseUrl}/${ALCHEMY_API_KEY}/getFloorPrice?contractAddress=${contractAddress}`, { headers: apiHeaders }),
          fetch(`${baseUrl}/${ALCHEMY_API_KEY}/getNftSales?contractAddress=${contractAddress}&limit=100`, { headers: apiHeaders })
        ]);
        
        let floorData = null;
        let salesData = null;
        
        if (floorPriceRes.status === 'fulfilled' && floorPriceRes.value.ok) {
          floorData = await floorPriceRes.value.json();
        }
        
        if (salesRes.status === 'fulfilled' && salesRes.value.ok) {
          salesData = await salesRes.value.json();
        }
        
        sentimentData = calculateMarketSentiment(floorData, salesData);
        
        // Cache the result
        cache.set(cacheKey, {
          data: sentimentData,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error fetching sentiment data for image:', error);
        // Fallback to default state on error
        res.writeHead(302, { 'Location': ASSET_URLS.stagnation });
        return res.end();
      }
    }
    
    // Get the appropriate image URL
    const imageUrl = ASSET_URLS[sentimentData.market_state] || ASSET_URLS.stagnation;
    
    // Redirect to the Arweave URL
    res.writeHead(302, { 'Location': imageUrl });
    return res.end();
    
  } catch (error) {
    console.error('Error in nft-image function:', error);
    // Fallback to default state on any error
    res.writeHead(302, { 'Location': ASSET_URLS.stagnation });
    return res.end();
  }
}

// Market sentiment calculation function (duplicated for independence)
function calculateMarketSentiment(floorData, salesData) {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  
  // Extract base metrics
  const currentFloorPrice = floorData?.openSea?.floorPrice || floorData?.looksRare?.floorPrice || 0;
  const sales = salesData?.nftSales || [];
  
  // Calculate time-based metrics
  const sales24h = sales.filter(sale => 
    new Date(sale.blockTimestamp).getTime() > oneDayAgo
  );
  const sales30d = sales.filter(sale => 
    new Date(sale.blockTimestamp).getTime() > thirtyDaysAgo
  );
  
  // Volume calculations using correct Alchemy price fields
  const volume24h = sales24h.reduce((sum, sale) => {
    // Calculate total price from fee components (all in wei strings)
    const sellerFee = parseFloat(sale.sellerFee || 0);
    const protocolFee = parseFloat(sale.protocolFee || 0);
    const royaltyFee = parseFloat(sale.royaltyFee || 0);
    const totalPriceWei = sellerFee + protocolFee + royaltyFee;
    
    // Convert from wei to ETH (1 ETH = 10^18 wei)
    const priceEth = totalPriceWei / Math.pow(10, 18);
    return sum + priceEth;
  }, 0);
  
  const volume30d = sales30d.reduce((sum, sale) => {
    const sellerFee = parseFloat(sale.sellerFee || 0);
    const protocolFee = parseFloat(sale.protocolFee || 0);
    const royaltyFee = parseFloat(sale.royaltyFee || 0);
    const totalPriceWei = sellerFee + protocolFee + royaltyFee;
    const priceEth = totalPriceWei / Math.pow(10, 18);
    return sum + priceEth;
  }, 0);
  
  // Calculate sentiment indicators (0-1 scale)
  const indicators = {
    // Floor price trend (comparing to historical average)
    floor_price_trend: Math.min(Math.max((currentFloorPrice / 1) * 0.5, 0), 1),
    
    // Sales volume ratio (24h vs 30d average)
    sales_volume_ratio: volume30d > 0 ? Math.min((volume24h / (volume30d / 30)) * 0.5, 1) : 0,
    
    // Active traders (unique addresses in recent sales)
    active_traders: Math.min(sales24h.length / 50, 1),
    
    // Price volatility (lower volatility = higher confidence)
    price_volatility: sales24h.length > 0 ? 
      Math.max(1 - (getStandardDeviation(sales24h.map(s => {
        const sellerFee = parseFloat(s.sellerFee || 0);
        const protocolFee = parseFloat(s.protocolFee || 0);
        const royaltyFee = parseFloat(s.royaltyFee || 0);
        return (sellerFee + protocolFee + royaltyFee) / Math.pow(10, 18);
      })) / currentFloorPrice), 0) : 0.5,
    
    // Market cap change proxy (based on floor price and activity)
    market_cap_change: Math.min((currentFloorPrice * sales24h.length) / 1000, 1)
  };
  
  // Weighted sentiment score
  const weights = {
    floor_price_trend: 0.25,
    sales_volume_ratio: 0.25,
    active_traders: 0.20,
    price_volatility: 0.15,
    market_cap_change: 0.15
  };
  
  const sentiment_score = Object.entries(indicators).reduce(
    (score, [key, value]) => score + value * weights[key], 
    0
  );
  
  // Determine market state based on sentiment score
  let market_state;
  if (sentiment_score < 0.25) market_state = 'capitulation';
  else if (sentiment_score < 0.50) market_state = 'stagnation';
  else if (sentiment_score < 0.75) market_state = 'resilience';
  else market_state = 'euphoria';
  
  return {
    sentiment_score: Math.round(sentiment_score * 100) / 100,
    market_state,
    indicators
  };
}

// Helper function for standard deviation
function getStandardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}