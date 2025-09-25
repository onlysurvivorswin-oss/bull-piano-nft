import { put } from '@vercel/blob';

// Top NFT collections for consistent market-wide analysis
const TOP_COLLECTIONS = [
  '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // Bored Ape Yacht Club
  '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB', // CryptoPunks
  '0xED5AF388653567Af2F388E6224dC7C4b3241C544', // Azuki
  '0x23581767a106ae21c074b2276D25e5C3e136a68b', // Moonbirds
  '0x60E4d786628Fea6478F785A6d7e704777c86a7c6', // Mutant Ape Yacht Club
  '0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e', // Doodles
  '0x49cF6f5d44E70224e2E23fDcdd2C053F30aDA28B'  // CloneX
];

// Market state thresholds (user-specified ETH volume ranges)
const VOLUME_THRESHOLDS = {
  capitulation: 2000,    // <2000 ETH
  stagnation: 4000,      // 2000-4000 ETH  
  resilience: 7000,      // 4000-7000 ETH
  euphoria: Infinity     // 7000+ ETH
};

export default async function handler(req, res) {
  // Protect endpoint with secret (for Vercel cron)
  const cronSecret = req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  
  if (cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Scheduled sentiment refresh starting...');
    const startTime = Date.now();
    
    // Validate API key
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    if (!ALCHEMY_API_KEY) {
      throw new Error('ALCHEMY_API_KEY not configured');
    }

    // Calculate 24-hour cutoff timestamp
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    console.log(`Analyzing market data from ${new Date(twentyFourHoursAgo).toISOString()} to ${new Date(now).toISOString()}`);

    // Fetch consistent 24h data from all collections
    const baseUrl = 'https://eth-mainnet.g.alchemy.com/nft/v2';
    const headers = { 'Accept': 'application/json' };
    
    let totalVolume24h = 0;
    let totalSales24h = 0;
    const collectionResults = [];
    
    for (const contractAddress of TOP_COLLECTIONS) {
      try {
        console.log(`Fetching 24h data for ${contractAddress.slice(0, 6)}...`);
        
        // Fetch sales with pagination until we hit 24h cutoff
        let pageKey = null;
        let collectionVolume = 0;
        let collectionSales = 0;
        let pageCount = 0;
        const maxPages = 10; // Limit to prevent timeouts
        
        do {
          const url = `${baseUrl}/${ALCHEMY_API_KEY}/getNFTSales?contractAddress=${contractAddress}&order=desc&limit=100${pageKey ? `&pageKey=${pageKey}` : ''}`;
          
          const response = await fetch(url, { headers });
          if (!response.ok) {
            console.warn(`Failed to fetch sales for ${contractAddress}: ${response.status}`);
            break;
          }
          
          const data = await response.json();
          const sales = data.nftSales || [];
          
          // Process sales within 24h window
          let hitCutoff = false;
          for (const sale of sales) {
            const saleTimestamp = new Date(sale.blockTimestamp).getTime();
            
            if (saleTimestamp < twentyFourHoursAgo) {
              hitCutoff = true;
              break;
            }
            
            // Extract price in ETH (consistent calculation)
            const sellerFee = parseFloat(sale.sellerFee?.amount || '0');
            const protocolFee = parseFloat(sale.protocolFee?.amount || '0'); 
            const royaltyFee = parseFloat(sale.royaltyFee?.amount || '0');
            const priceETH = sellerFee + protocolFee + royaltyFee;
            
            if (priceETH > 0) {
              collectionVolume += priceETH;
              collectionSales++;
            }
          }
          
          pageKey = data.pageKey;
          pageCount++;
          
          // Stop if we hit time cutoff or page limit
          if (hitCutoff || pageCount >= maxPages || !pageKey) {
            break;
          }
          
        } while (pageKey);
        
        totalVolume24h += collectionVolume;
        totalSales24h += collectionSales;
        
        collectionResults.push({
          contract: contractAddress,
          volume_24h: Math.round(collectionVolume * 1000) / 1000,
          sales_24h: collectionSales,
          pages_fetched: pageCount
        });
        
        console.log(`  ${contractAddress.slice(0, 6)}: ${collectionVolume.toFixed(3)} ETH, ${collectionSales} sales`);
        
      } catch (error) {
        console.error(`Error fetching data for ${contractAddress}:`, error.message);
        // Continue with other collections
      }
    }
    
    // Determine market state based on total 24h volume
    let market_state;
    if (totalVolume24h < VOLUME_THRESHOLDS.capitulation) {
      market_state = 'capitulation';
    } else if (totalVolume24h < VOLUME_THRESHOLDS.stagnation) {
      market_state = 'stagnation';
    } else if (totalVolume24h < VOLUME_THRESHOLDS.resilience) {
      market_state = 'resilience'; 
    } else {
      market_state = 'euphoria';
    }
    
    // Calculate sentiment score (0-1 scale)
    const maxVolume = 10000; // ETH
    const sentiment_score = Math.min(totalVolume24h / maxVolume, 1);
    
    // Build comprehensive snapshot
    const snapshot = {
      version: '1.0.0',
      asOf: new Date().toISOString(),
      timestamp: now,
      market_state,
      sentiment_score: Math.round(sentiment_score * 1000) / 1000,
      indicators: {
        total_volume_24h: Math.round(totalVolume24h * 1000) / 1000,
        total_sales_24h: totalSales24h,
        active_collections: collectionResults.length,
        average_sale_price: totalSales24h > 0 ? Math.round((totalVolume24h / totalSales24h) * 1000) / 1000 : 0,
        market_activity_score: Math.min(totalSales24h / 500, 1)
      },
      raw_data: {
        collections_analyzed: TOP_COLLECTIONS.length,
        total_volume_eth: Math.round(totalVolume24h * 1000) / 1000,
        total_sales: totalSales24h,
        collection_breakdown: collectionResults,
        time_window: {
          start: new Date(twentyFourHoursAgo).toISOString(),
          end: new Date(now).toISOString(),
          duration_hours: 24
        }
      },
      metadata: {
        computed_at: new Date().toISOString(),
        computation_time_ms: Date.now() - startTime,
        thresholds: VOLUME_THRESHOLDS
      }
    };
    
    // Store snapshot in Vercel Blob
    const blob = await put('market/sentiment.json', JSON.stringify(snapshot, null, 2), {
      access: 'public',
      contentType: 'application/json'
    });
    
    console.log(`Market sentiment computed: ${market_state} (${totalVolume24h.toFixed(3)} ETH, ${totalSales24h} sales)`);
    console.log(`Snapshot saved to blob: ${blob.url}`);
    
    res.status(200).json({
      success: true,
      snapshot: {
        market_state,
        total_volume_24h: snapshot.indicators.total_volume_24h,
        total_sales_24h: totalSales24h,
        computation_time_ms: snapshot.metadata.computation_time_ms
      },
      blob_url: blob.url
    });
    
  } catch (error) {
    console.error('Scheduled sentiment refresh failed:', error);
    res.status(500).json({ 
      error: 'Failed to refresh sentiment data',
      message: error.message 
    });
  }
}