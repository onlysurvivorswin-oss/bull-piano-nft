import type { Express } from "express";
import { createServer, type Server } from "http";
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
    volume_7d: z.number().optional(),
    sales_count: z.number().optional(),
    unique_holders: z.number().optional()
  })
});

// In-memory cache for API responses
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// Asset URLs for each market state
const ASSET_URLS = {
  capitulation: 'https://6txiabgkdvd5nenuupzxtp7lbxcvx4vw3kra4ly7blafm2mproda.arweave.net/9O6ABModR9aRtKPzeb_rDcVb8rbaog4vHwrAVmmPi4Y',
  stagnation: 'https://r4vsc7esu3z27xxgh2bqrocs3jz4pin44ahw4hwk3ilabk2o2vwq.arweave.net/jyshfJKm86_e5j6DCLhS2nPHobzgD24eytoWAKtO1W0',
  resilience: 'https://lgwaa4z6aegrwftnh3v2zdaxjgvvxyv5g7orzbzufbpc5hgqnm5q.arweave.net/WawAcz4BDRsWbT7rrIwXSatb4r033RyHNCheLpzQazs',
  euphoria: 'https://tkf3ssqdvpe3bnk25od6twbu3rioxksaxmedvldcs3nbs4ickpoq.arweave.net/mou5SgOrybC1WuuH6dg03FDrqkC7CDqsYpbaGXECU90'
};

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS middleware
  app.use((req, res, next) => {
    const allowOrigin = process.env.ALLOW_ORIGIN || '*';
    res.header('Access-Control-Allow-Origin', allowOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    
    next();
  });

  // Market sentiment analysis endpoint
  app.get('/api/market-sentiment', async (req, res) => {
    console.log('Market sentiment endpoint called with query:', req.query);
    try {
      const contractAddress = req.query.contract as string;
      console.log('Contract address:', contractAddress);
      
      // Validate required environment variables
      const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
      console.log('ALCHEMY_API_KEY exists:', !!ALCHEMY_API_KEY);
      
      if (!ALCHEMY_API_KEY) {
        return res.status(500).json({ 
          error: 'ALCHEMY_API_KEY not configured' 
        });
      }
      
      if (!contractAddress) {
        return res.status(400).json({ 
          error: 'contract parameter is required' 
        });
      }
      
      // Check cache first
      const cacheKey = `sentiment-${contractAddress}`;
      const cached = cache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        res.set('Cache-Control', 'public, max-age=43200');
        return res.json(cached.data);
      }
      
      // Fetch multiple data points from Alchemy API
      const baseUrl = 'https://eth-mainnet.g.alchemy.com/nft/v3';
      const headers = {
        'Accept': 'application/json'
      };
      
      const [floorPriceRes, salesRes] = await Promise.allSettled([
        fetch(`${baseUrl}/${ALCHEMY_API_KEY}/getFloorPrice?contractAddress=${contractAddress}`, { headers }),
        fetch(`${baseUrl}/${ALCHEMY_API_KEY}/getNftSales?contractAddress=${contractAddress}&limit=100`, { headers })
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
        return res.status(500).json({
          error: 'Invalid sentiment data format'
        });
      }
      
      // Cache the response
      cache.set(cacheKey, {
        data: sentimentAnalysis,
        timestamp: Date.now()
      });
      
      // Set cache headers
      res.set('Cache-Control', 'public, max-age=43200');
      res.json(sentimentAnalysis);
      
    } catch (error) {
      console.error('Error in /api/market-sentiment:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  });

  // Market sentiment calculation function
  function calculateMarketSentiment(floorData: any, salesData: any) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    // Extract base metrics
    const currentFloorPrice = floorData?.floorPrice?.priceCurrency?.native || 0;
    const sales = salesData?.nftSales || [];
    
    // Calculate time-based metrics
    const sales24h = sales.filter((sale: any) => 
      new Date(sale.blockTimestamp).getTime() > oneDayAgo
    );
    const sales7d = sales.filter((sale: any) => 
      new Date(sale.blockTimestamp).getTime() > sevenDaysAgo
    );
    
    // Volume calculations
    const volume24h = sales24h.reduce((sum: number, sale: any) => 
      sum + parseFloat(sale.sellerFee?.amount || 0), 0
    );
    const volume7d = sales7d.reduce((sum: number, sale: any) => 
      sum + parseFloat(sale.sellerFee?.amount || 0), 0
    );
    
    // Calculate sentiment indicators (0-1 scale)
    const indicators = {
      // Floor price trend (comparing to historical average)
      floor_price_trend: Math.min(Math.max((currentFloorPrice / 1) * 0.5, 0), 1),
      
      // Sales volume ratio (24h vs 7d average)
      sales_volume_ratio: volume7d > 0 ? Math.min((volume24h / (volume7d / 7)) * 0.5, 1) : 0,
      
      // Active traders (unique addresses in recent sales)
      active_traders: Math.min(sales24h.length / 50, 1),
      
      // Price volatility (lower volatility = higher confidence)
      price_volatility: sales24h.length > 0 ? 
        Math.max(1 - (getStandardDeviation(sales24h.map((s: any) => parseFloat(s.sellerFee?.amount || 0))) / currentFloorPrice), 0) : 0.5,
      
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
      (score, [key, value]) => score + value * weights[key as keyof typeof weights], 
      0
    );
    
    // Determine market state based on sentiment score
    let market_state: 'capitulation' | 'stagnation' | 'resilience' | 'euphoria';
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
        volume_7d: volume7d,
        sales_count: sales24h.length,
        unique_holders: new Set(sales24h.map((s: any) => s.from)).size
      }
    };
  }
  
  // Helper function for standard deviation
  function getStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // Simple NFT image endpoint - redirects to appropriate Arweave URL based on market sentiment
  app.get('/api/nft-image', async (req, res) => {
    console.log('NFT image endpoint called with query:', req.query);
    try {
      const contractAddress = req.query.contract as string || '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'; // Default to BAYC
      const forceState = req.query.force as string;
      
      // Check for manual override first
      if (forceState && forceState in ASSET_URLS) {
        res.set('Cache-Control', 'public, max-age=43200');
        return res.redirect(302, ASSET_URLS[forceState as keyof typeof ASSET_URLS]);
      }
      
      // Validate API key
      const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
      if (!ALCHEMY_API_KEY) {
        // Fallback to default state if API not configured
        return res.redirect(302, ASSET_URLS.stagnation);
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
          const headers = { 'Accept': 'application/json' };
          
          const [floorPriceRes, salesRes] = await Promise.allSettled([
            fetch(`${baseUrl}/${ALCHEMY_API_KEY}/getFloorPrice?contractAddress=${contractAddress}`, { headers }),
            fetch(`${baseUrl}/${ALCHEMY_API_KEY}/getNftSales?contractAddress=${contractAddress}&limit=100`, { headers })
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
          return res.redirect(302, ASSET_URLS.stagnation);
        }
      }
      
      // Get the appropriate image URL
      const imageUrl = ASSET_URLS[sentimentData.market_state as keyof typeof ASSET_URLS] || ASSET_URLS.stagnation;
      
      // Set cache headers and redirect to the Arweave URL
      res.set('Cache-Control', 'public, max-age=43200');
      res.redirect(302, imageUrl);
      
    } catch (error) {
      console.error('Error in /api/nft-image:', error);
      // Fallback to default state on any error
      res.redirect(302, ASSET_URLS.stagnation);
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      cache_size: cache.size
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
