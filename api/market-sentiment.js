import { list } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    console.log('Market sentiment endpoint - serving cached data only');
    
    // Read cached sentiment data from Vercel Blob
    const { blobs } = await list({
      prefix: 'market/',
      limit: 1
    });
    
    if (blobs.length === 0) {
      // No cached data available - return fallback
      console.warn('No cached sentiment data found, returning fallback');
      return res.status(200).json({
        sentiment_score: 0.5,
        market_state: 'stagnation',
        indicators: {
          total_volume_24h: 0,
          total_sales_24h: 0,
          active_collections: 0,
          average_sale_price: 0,
          market_activity_score: 0
        },
        raw_data: {
          collections_analyzed: 0,
          total_volume_eth: 0,
          total_sales: 0,
          note: 'Fallback data - no cached sentiment available'
        },
        cached: false,
        fallback: true
      });
    }
    
    // Fetch the latest cached data
    const latestBlob = blobs[0];
    const response = await fetch(latestBlob.url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch cached data: ${response.status}`);
    }
    
    const cachedData = await response.json();
    
    // Check if data is stale (older than 36 hours - allows some buffer beyond 12h refresh)
    const dataAge = Date.now() - cachedData.timestamp;
    const isStale = dataAge > (36 * 60 * 60 * 1000); // 36 hours
    
    if (isStale) {
      console.warn(`Cached data is stale (${Math.round(dataAge / (60 * 60 * 1000))} hours old)`);
    }
    
    // Set cache headers for 12-hour caching
    res.setHeader('Cache-Control', 'public, max-age=43200'); // 12 hours
    res.setHeader('ETag', `"${latestBlob.downloadUrl.split('/').pop()}"`);
    
    // Return cached sentiment data with metadata
    res.status(200).json({
      ...cachedData,
      cached: true,
      data_age_hours: Math.round(dataAge / (60 * 60 * 1000)),
      is_stale: isStale,
      blob_url: latestBlob.url
    });
    
  } catch (error) {
    console.error('Error serving cached sentiment data:', error);
    
    // Return fallback data on error
    res.status(200).json({
      sentiment_score: 0.5,
      market_state: 'stagnation',
      indicators: {
        total_volume_24h: 0,
        total_sales_24h: 0,
        active_collections: 0,
        average_sale_price: 0,
        market_activity_score: 0
      },
      raw_data: {
        collections_analyzed: 0,
        total_volume_eth: 0,
        total_sales: 0,
        error: error.message
      },
      cached: false,
      fallback: true
    });
  }
}