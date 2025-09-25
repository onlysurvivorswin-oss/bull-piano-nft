// Market-wide NFT sentiment analysis Vercel Function
// ES Module version for Vercel deployment

export default async function handler(req, res) {
  console.log('Market sentiment endpoint called');
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, max-age=1800'); // 30 minutes

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate API key
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    if (!ALCHEMY_API_KEY) {
      return res.status(500).json({ error: 'ALCHEMY_API_KEY not configured' });
    }

    console.log('Analyzing market-wide NFT sentiment...');

    // Major NFT collections for market analysis
    const collections = [
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
      '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb', // CryptoPunks  
      '0xED5AF388653567Af2F388E6224dC7C4b3241C544', // Azuki
      '0x23581767a106ae21c074b2276D25e5C3e136a68b', // Moonbirds
      '0x60E4d786628Fea6478F785A6d7e704777c86a7c6', // MAYC
      '0x8a90CAb2b38dba80c64b7734e58Ee1Db38B8992e', // Doodles
      '0x49cF6f5d44E70224e2E23fDcdd2C053F30aDA28B'  // CloneX
    ];

    let totalVolume = 0;
    let totalSales = 0;
    let activeCollections = 0;

    // Fetch sales data with timeout protection
    const fetchPromises = collections.map(async (contractAddress) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        
        const response = await fetch(
          `https://eth-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_API_KEY}/getNFTSales?contractAddress=${contractAddress}&order=desc&limit=50`,
          { 
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`API error for ${contractAddress}: ${response.status}`);
          return { volume: 0, sales: 0 };
        }

        const data = await response.json();
        const sales = data.nftSales || [];
        
        // Calculate volume from sales
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

        console.log(`${contractAddress.slice(0,6)}: ${sales.length} sales, ${volume.toFixed(1)} ETH`);
        return { volume, sales: sales.length };
        
      } catch (error) {
        console.error(`Error fetching ${contractAddress}:`, error.message);
        return { volume: 0, sales: 0 };
      }
    });

    // Execute all fetches
    const results = await Promise.allSettled(fetchPromises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const { volume, sales } = result.value;
        totalVolume += volume;
        totalSales += sales;
        if (sales > 0) activeCollections++;
      }
    });

    console.log(`Market data: ${totalVolume.toFixed(1)} ETH volume, ${totalSales} sales, ${activeCollections} active collections`);

    // Determine market state based on ETH volume thresholds
    let market_state;
    if (totalVolume < 2000) market_state = 'capitulation';      // <2000 ETH
    else if (totalVolume < 4000) market_state = 'stagnation';   // 2000-4000 ETH  
    else if (totalVolume < 7000) market_state = 'resilience';   // 4000-7000 ETH
    else market_state = 'euphoria';                             // 7000+ ETH

    // Calculate normalized indicators
    const indicators = {
      total_volume_24h: Math.min(totalVolume / 10000, 1),
      volume_trend_ratio: 1,
      active_collections: activeCollections / collections.length,
      total_sales_count: Math.min(totalSales / 1000, 1),
      market_activity_score: Math.min((totalVolume * totalSales) / 100000, 1)
    };

    const sentiment_score = (
      indicators.total_volume_24h * 0.4 +
      indicators.active_collections * 0.3 +
      indicators.total_sales_count * 0.2 +
      indicators.market_activity_score * 0.1
    );

    console.log(`Market sentiment: ${market_state} (volume: ${totalVolume.toFixed(1)} ETH)`);

    const response = {
      sentiment_score: Math.round(sentiment_score * 1000) / 1000,
      market_state,
      indicators,
      raw_data: {
        collections_analyzed: collections.length,
        total_volume_eth: Math.round(totalVolume * 100) / 100,
        total_sales: totalSales,
        average_sale_price: totalSales > 0 ? Math.round((totalVolume / totalSales) * 1000) / 1000 : 0,
        active_collections: activeCollections
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in market-sentiment function:', error);
    
    // Fallback response
    return res.status(200).json({
      sentiment_score: 0.5,
      market_state: 'stagnation',
      indicators: {
        total_volume_24h: 0.5,
        volume_trend_ratio: 1,
        active_collections: 0.5,
        total_sales_count: 0.5,
        market_activity_score: 0.5
      },
      raw_data: {
        collections_analyzed: 7,
        total_volume_eth: 0,
        total_sales: 0,
        average_sale_price: 0,
        active_collections: 0
      }
    });
  }
}