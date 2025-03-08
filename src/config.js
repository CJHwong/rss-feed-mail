import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Get directory paths for local files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cursorFilePath = path.join(rootDir, 'cursor.json');

// Load environment variables
function loadEnvironmentVariables() {
  const result = dotenv.config({ path: path.join(rootDir, '.env') });

  if (result.error) {
    console.error('Error loading .env file:', result.error);
  }

  console.log('Environment variables loaded');
}

loadEnvironmentVariables();

// Export loaded configuration
export const config = {
  email: {
    recipient: process.env.EMAIL_RECIPIENT,
    from: process.env.EMAIL_FROM,
  },
  gmail: {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
    accessToken: process.env.ACCESS_TOKEN,
  },
  github: {
    feedConfigRepo: process.env.FEED_CONFIG_REPO,
    feedConfigBranch: process.env.FEED_CONFIG_BRANCH,
  },
  settings: {
    checkIntervalHours: process.env.CHECK_INTERVAL_HOURS,
  },
  paths: {
    rootDir,
    cursorFilePath,
  },
};

/**
 * Get the URL for the feed configuration file
 * @returns {string} The URL to the feed configuration file
 */
function getConfigUrl() {
  const repoPath = process.env.FEED_CONFIG_REPO.split('github.com/')[1];
  return `https://raw.githubusercontent.com/${repoPath}/${process.env.FEED_CONFIG_BRANCH}/feed-config.json`;
}

/**
 * Fetch the feed configuration from GitHub and load local cursor
 * @returns {Promise<Object>} The feed configuration and cursor
 */
export async function fetchFeedConfig() {
  try {
    // Fetch feed configuration
    const feedConfig = await fetchFeedConfigFromGitHub();

    // Load cursor
    const { cursor, exists } = await loadCursorFile();

    return { feedConfig, cursor, cursorExists: exists };
  } catch (error) {
    console.error('Error fetching configuration:', error);
    throw error;
  }
}

/**
 * Fetch the feed configuration from GitHub
 * @returns {Promise<Object>} The feed configuration
 */
async function fetchFeedConfigFromGitHub() {
  const FEED_CONFIG_URL = getConfigUrl();
  const response = await fetch(FEED_CONFIG_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch feed config: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Load the cursor file from disk
 * @returns {Promise<Object>} The cursor and whether it exists
 */
async function loadCursorFile() {
  try {
    const cursorData = await fs.readFile(cursorFilePath, 'utf8');
    const cursor = JSON.parse(cursorData);
    console.log('Cursor file loaded successfully');
    return { cursor, exists: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No cursor file found. Will create one after processing feeds.');
      return { cursor: {}, exists: false };
    } else {
      console.error('Error reading cursor file:', error);
      return { cursor: {}, exists: false };
    }
  }
}

/**
 * Update the cursor file with the latest feed items
 * @param {Object} feedResults - The feed results
 * @returns {Promise<Object>} The updated cursor
 */
export async function updateCursor(feedResults) {
  try {
    // Try to read existing cursor file
    const { cursor } = await loadCursorFile();

    // Update cursor with latest feed items
    for (const [feedUrl, result] of Object.entries(feedResults)) {
      if (result.items && result.items.length > 0) {
        // Use the latest item's date
        const latestItem = result.items[0];
        cursor[feedUrl] = latestItem.isoDate || new Date().toISOString();
      }
    }

    // Write updated cursor to local file
    await fs.writeFile(cursorFilePath, JSON.stringify(cursor, null, 2), 'utf8');
    console.log('Cursor file updated successfully');

    return cursor;
  } catch (error) {
    console.error('Error updating cursor:', error);
    throw error;
  }
}
