// Market sentiment analysis Netlify Function
import { z } from "zod";

// Validation schemas
const marketSentimentSchema = z.object({
  sentiment_score: z.number(),
  market_state: z.enum(['capitulation', 'stagnation', 'resilience', 'euphoria']),
  indicators: z.object({
    floor_price_trend: z.number(),
    sales_volume_ratio: z.number(),
    active_traders: z.number(),
    price_volatility: z.number(),
    market_cap_change: z.number()
  }),
  raw_data: z.object({
    floor_price: z.number().optional(),
    volume_24h: z.number().optional(),
    volume_30d: z.number().optional(),
    sales_count: z.number().optional(),
    unique_holders: z.number().optional()
  })
});

// Simple in-memory cache (note: each function invocation starts fresh)
const cache = new Map();
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

export default async (request, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Cache-Control': 'public, max-age=43200'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(request.url);
    const contractAddress = url.searchParams.get('contract');
    
    console.log('Market sentiment endpoint called with contract:', contractAddress);
    
    // Validate required environment variables
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    console.log('ALCHEMY_API_KEY exists:', !!ALCHEMY_API_KEY);
    
    if (!ALCHEMY_API_KEY) {
      return new Response(JSON.stringify({ error: 'ALCHEMY_API_KEY not configured' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    if (!contractAddress) {
      return new Response(JSON.stringify({ error: 'contract parameter is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Check cache first
    const cacheKey = `sentiment-${contractAddress}`;
    const cached = cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch multiple data points from Alchemy API
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
    
    // Calculate comprehensive market sentiment
    const sentimentAnalysis = calculateMarketSentiment(floorData, salesData);
    
    // Validate response data
    try {
      marketSentimentSchema.parse(sentimentAnalysis);
    } catch (error) {
      console.error('Sentiment validation error:', error);
      return new Response(JSON.stringify({ error: 'Invalid sentiment data format' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Cache the response
    cache.set(cacheKey, {
      data: sentimentAnalysis,
      timestamp: Date.now()
    });
    
    return new Response(JSON.stringify(sentimentAnalysis), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in market-sentiment function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
};

// Market sentiment calculation function
function calculateMarketSentiment(floorData, salesData) {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  
  // Extract base metrics - use OpenSea floor price as primary
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
    indicators,
    raw_data: {
      floor_price: currentFloorPrice,
      volume_24h: volume24h,
      volume_30d: volume30d,
      sales_count: sales24h.length,
      unique_holders: new Set([
        ...sales24h.map(s => s.buyerAddress).filter(Boolean),
        ...sales24h.map(s => s.sellerAddress).filter(Boolean)
      ]).size
    }
  };
}

// Helper function for standard deviation
function getStandardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}