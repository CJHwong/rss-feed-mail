import https from 'https';

import Parser from 'rss-parser';

// Create custom HTTPS agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Ignore certificate errors
});

// Configure parser with custom request function
const parser = new Parser({
  customFields: {
    feed: [],
    item: ['media:content'],
  },
  requestOptions: {
    agent: httpsAgent,
  },
});

// Add this constant at the top with other constants
const MAX_REDIRECTS = 5;

/**
 * Parse an RSS feed from a URL
 * @param {string} feedUrl - URL of the feed to parse
 * @returns {Promise<Object>} - Parsed feed data
 */
export async function parseFeed(feedUrl) {
  try {
    const parsedFeed = await parser.parseURL(feedUrl);
    return parsedFeed;
  } catch (error) {
    console.error(`Error parsing feed ${feedUrl}:`, error.message);
    throw error;
  }
}

/**
 * Get the title of an RSS feed
 * @param {string} feedUrl - URL of the feed
 * @param {string} fallbackTitle - Title to use if fetching fails
 * @returns {Promise<string>} - The feed title
 */
export async function getFeedTitle(feedUrl, fallbackTitle) {
  try {
    const parsedFeed = await parseFeed(feedUrl);
    return parsedFeed.title || fallbackTitle;
  } catch (error) {
    console.warn(`Could not fetch title for feed ${feedUrl}, using fallback: ${fallbackTitle}`);
    return fallbackTitle;
  }
}

/**
 * Get items from an RSS feed that are newer than a specific date
 * @param {string} feedUrl - URL of the feed
 * @param {Date} sinceDate - Date to filter items from
 * @param {string} fallbackTitle - Title to use if feed doesn't provide one
 * @param {Object} options - Additional options for fetching
 * @returns {Promise<Object>} - Feed result with filtered items
 */
export async function getFeedItems(feedUrl, sinceDate, fallbackTitle, options = {}) {
  try {
    // Configure parser with custom options including redirect support
    const customParser = new Parser({
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'RSS Feed Reader Bot/1.0', // Custom user agent
      },
      maxRedirects: MAX_REDIRECTS,
      requestOptions: {
        agent: httpsAgent,
      },
      ...options,
    });

    // Try to parse the feed
    const parsedFeed = await customParser.parseURL(feedUrl);
    const title = parsedFeed.title || fallbackTitle;

    // Filter and sort items
    let items = parsedFeed.items || [];
    if (sinceDate) {
      const lastFetchDate = new Date(sinceDate);
      items = items.filter((item) => {
        const itemDate = item.isoDate ? new Date(item.isoDate) : new Date();
        return itemDate > lastFetchDate;
      });
    }

    // Sort by date, newest first
    items.sort((a, b) => {
      return new Date(b.isoDate || 0) - new Date(a.isoDate || 0);
    });

    // Add feed metadata to items
    const itemsWithMetadata = items.map((item) => ({
      ...item,
      feedTitle: title,
      feedUrl: feedUrl,
    }));

    return {
      url: feedUrl,
      title: title,
      items: itemsWithMetadata,
    };
  } catch (error) {
    // Update error handling to ignore certificate errors
    if (error.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
      console.log(`Ignoring certificate validation for: ${feedUrl}`);
      // Retry the request with certificate validation disabled
      return getFeedItems(feedUrl, sinceDate, fallbackTitle, {
        ...options,
        requestOptions: { agent: httpsAgent },
      });
    }

    // Add redirect-specific error handling
    if (error.message.includes('Too many redirects')) {
      console.warn(`Feed redirect limit (${MAX_REDIRECTS}) exceeded: ${feedUrl}`);
    } else if (error.message.includes('Status code 301') || error.message.includes('Status code 302')) {
      console.log(`Feed has moved: ${feedUrl}`);
    } else if (error.message.includes('Status code 403') || error.message.includes('Status code 404')) {
      console.log(`Feed unavailable (${error.message.slice(-3)}): ${feedUrl}`);
    }
    // Handle other specific error types with more detail
    else if (error.message.includes('Feed not recognized')) {
      console.warn(`Invalid feed format: ${feedUrl}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.warn(`Feed request timed out: ${feedUrl}`);
    } else {
      console.error(`Error getting items from feed ${feedUrl}:`, error);
    }
    throw error;
  }
}
