import Parser from 'rss-parser';

// Create a singleton parser instance
const parser = new Parser();

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
 * @returns {Promise<Object>} - Feed result with filtered items
 */
export async function getFeedItems(feedUrl, sinceDate, fallbackTitle) {
  try {
    const parsedFeed = await parseFeed(feedUrl);
    const title = parsedFeed.title || fallbackTitle;

    // Filter items newer than sinceDate
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
    console.error(`Error getting items from feed ${feedUrl}:`, error);
    return null;
  }
}
