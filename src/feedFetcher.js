import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

import { extractFeeds } from './utils/feedUtils.js';
import { getFeedItems } from './utils/rssUtils.js';

/**
 * Fetch all feeds from the configuration that have updates since the cursor
 * @param {Object} feedConfig - The feed configuration
 * @param {Object} cursor - The cursor with the last fetch dates
 * @returns {Promise<Object>} - Feed results with new items
 */
export async function fetchFeeds(feedConfig, cursor) {
  const results = {};
  const feedsToFetch = extractFeeds(feedConfig);

  // Process feeds in parallel with a limit to avoid overloading
  const fetchPromises = feedsToFetch.map((feed) => fetchFeedWithRetry(feed, cursor));
  const fetchResults = await Promise.all(fetchPromises);

  // Combine results
  fetchResults.forEach((result) => {
    if (result && result.items && result.items.length > 0) {
      results[result.url] = {
        title: result.title,
        items: result.items,
      };
    }
  });

  return results;
}

/**
 * Fetch a single feed with retry logic
 * @param {Object} feed - The feed to fetch
 * @param {Object} cursor - The cursor with last fetch dates
 * @returns {Promise<Object|null>} - The feed result or null on error
 */
async function fetchFeedWithRetry(feed, cursor) {
  try {
    const sinceDate = cursor[feed.url] || null;
    return await getFeedItems(feed.url, sinceDate, feed.title);
  } catch (error) {
    console.error(`Error fetching feed ${feed.url}:`, error);
    return null;
  }
}

/**
 * Fetch the full content of an article from its URL
 * @param {string} url - The URL to fetch content from
 * @returns {Promise<string|null>} - The HTML content or null on error
 */
export async function fetchFullContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return extractMainContent(html);
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error);
    return null;
  }
}

/**
 * Extract main content from HTML
 * @param {string} html - The HTML content
 * @returns {string} - The extracted main content
 */
function extractMainContent(html) {
  const $ = cheerio.load(html);

  // Common content selectors
  const contentSelectors = [
    'article',
    '.article',
    '.post-content',
    '.entry-content',
    '.content',
    '#content',
    'main',
    '.main',
  ];

  // Try each selector until we find content
  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      return element.html() || '';
    }
  }

  // If we didn't find content with the selectors, clean up body
  $('script, style, nav, header, footer, aside, .sidebar').remove();
  return $('body').html() || '';
}
