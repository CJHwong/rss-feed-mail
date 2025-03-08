import { google } from 'googleapis';

import { config } from './config.js';
import { MAIL_LABELS } from './utils/feedUtils.js';
import { getFeedTitle } from './utils/rssUtils.js';

/**
 * Create Gmail labels based on feed configuration
 * @param {Object} feedConfig - The feed configuration
 * @returns {Promise<Object>} - Map of label paths to label IDs
 */
export async function createLabels(feedConfig) {
  try {
    const gmail = await getGmailClient();

    // First, ensure the root "RSS Feeds" label exists
    await ensureLabel(gmail, MAIL_LABELS.RSS_FEED);

    // Then create labels for all feed groups
    const labelMap = {};
    await createGroupLabels(gmail, feedConfig.groups, MAIL_LABELS.RSS_FEED, labelMap);

    // Create filters for the labels
    await createFilters(gmail, labelMap);

    console.log('Labels and filters created successfully');
    return labelMap;
  } catch (error) {
    console.error('Error creating Gmail labels:', error);
    throw error;
  }
}

/**
 * Get a Gmail API client with fresh OAuth token
 * @returns {Promise<Object>} - The Gmail API client
 */
async function getGmailClient() {
  // Configure Gmail OAuth2
  const oAuth2Client = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oAuth2Client.setCredentials({
    refresh_token: config.gmail.refreshToken,
    access_token: config.gmail.accessToken,
  });

  // Get a fresh access token
  await oAuth2Client.refreshAccessToken();

  // Create Gmail API client
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

/**
 * Create nested labels for feed groups
 * @param {Object} gmail - The Gmail API client
 * @param {Array} groups - The feed groups
 * @param {string} parentPath - The parent label path
 * @param {Object} labelMap - Map to store created labels
 * @returns {Promise<void>}
 */
async function createGroupLabels(gmail, groups, parentPath, labelMap = {}) {
  if (!groups?.length) return;

  for (const group of groups) {
    const labelPath = `${parentPath}/${group.name}`;
    const label = await ensureLabel(gmail, labelPath);

    // Add label to map with its ID for filter creation
    labelMap[labelPath] = label.id;

    // Create labels for each feed in the group
    if (group.feeds && group.feeds.length > 0) {
      for (const feed of group.feeds) {
        // Fetch the actual feed title from the RSS source
        const actualFeedTitle = await getFeedTitle(feed.url, feed.title);
        const feedLabelPath = `${labelPath}/${actualFeedTitle}`;
        const feedLabel = await ensureLabel(gmail, feedLabelPath);

        // Add feed label to map with its ID
        labelMap[feedLabelPath] = feedLabel.id;
      }
    }

    // Create labels for subgroups
    if (group.groups && group.groups.length > 0) {
      await createGroupLabels(gmail, group.groups, labelPath, labelMap);
    }
  }
}

/**
 * Check if a label exists and create it if it doesn't
 * @param {Object} gmail - The Gmail API client
 * @param {string} labelPath - The label path
 * @returns {Promise<Object>} - The label object
 */
async function ensureLabel(gmail, labelPath) {
  try {
    // List all user's labels
    const response = await gmail.users.labels.list({
      userId: 'me',
    });

    const labels = response.data.labels || [];

    // Check if the label already exists
    const existingLabel = labels.find((label) => label.name === labelPath);
    if (existingLabel) {
      return existingLabel;
    }

    // If not, create it
    const newLabel = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelPath,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });

    return newLabel.data;
  } catch (error) {
    console.error(`Error ensuring label ${labelPath}:`, error);
    throw error;
  }
}

/**
 * Create Gmail filters for each label path
 * @param {Object} gmail - The Gmail API client
 * @param {Object} labelMap - Map of label paths to label IDs
 * @returns {Promise<void>}
 */
async function createFilters(gmail, labelMap) {
  try {
    const existingFilters = await getExistingFilters(gmail);

    await createLabelSpecificFilters(gmail, labelMap, existingFilters);
  } catch (error) {
    console.error('Error creating Gmail filters:', error);
    throw error;
  }
}

/**
 * Get existing Gmail filters
 * @param {Object} gmail - The Gmail API client
 * @returns {Promise<Array>} - Existing filter criteria
 */
async function getExistingFilters(gmail) {
  const existingFilters = await gmail.users.settings.filters.list({
    userId: 'me',
  });

  return existingFilters.data.filter?.map((filter) => filter.criteria.subject || '') || [];
}

/**
 * Create filters for specific labels
 * @param {Object} gmail - The Gmail API client
 * @param {Object} labelMap - Map of label paths to label IDs
 * @param {Array} existingFilters - Existing filter criteria
 * @returns {Promise<void>}
 */
async function createLabelSpecificFilters(gmail, labelMap, existingFilters) {
  // Create filters for feed-specific labels (lowest level)
  await createFeedFilters(gmail, labelMap, existingFilters);

  // Create filters only for top-level group labels
  await createGroupFilters(gmail, labelMap, existingFilters);

  // Create general filter for RSS Feeds root label and to skip inbox
  await createGeneralSenderFilter(gmail, labelMap, existingFilters);
}

/**
 * Create filters for individual feed labels
 * @param {Object} gmail - The Gmail API client
 * @param {Object} labelMap - Map of label paths to label IDs
 * @param {Array} existingFilters - Existing filter criteria
 * @returns {Promise<void>}
 */
async function createFeedFilters(gmail, labelMap, existingFilters) {
  for (const [labelPath, labelId] of Object.entries(labelMap)) {
    const parts = labelPath.split('/').filter((part) => part !== MAIL_LABELS.RSS_FEED);
    if (parts.length === 0) continue; // Skip the root label

    // Only create filters for leaf node feed labels (not intermediate groups)
    // Check if this is a leaf node by verifying it's not a parent to any other label
    const isParentPath = Object.keys(labelMap).some((path) => path !== labelPath && path.startsWith(labelPath + '/'));

    if (isParentPath) continue;

    // Skip if there's only one part (it's a top-level group, handled separately)
    if (parts.length < 2) continue;

    // The last part is the feed title, everything before are groups
    const feedTitle = parts.pop();
    const groups = parts;

    // Format as [Group1][Group2]: Feed Title
    const subjectPattern = groups.map((group) => `[${group}]`).join('') + ': ' + feedTitle;

    // Skip if we already have a filter with this exact subject
    if (existingFilters.some((criteria) => criteria === subjectPattern)) {
      console.log(`Filter for subject "${subjectPattern}" already exists, skipping`);
      continue;
    }

    // Create a filter to apply this label and skip the inbox
    await gmail.users.settings.filters.create({
      userId: 'me',
      requestBody: {
        criteria: {
          subject: subjectPattern,
          from: config.email.from.replace(/^"([^"]*)".*$/, '$1'),
        },
        action: {
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX'],
        },
      },
    });

    console.log(`Created filter for subject "${subjectPattern}" to apply label "${labelPath}" and skip inbox`);
  }
}

/**
 * Create filters for group-level labels
 * @param {Object} gmail - The Gmail API client
 * @param {Object} labelMap - Map of label paths to label IDs
 * @param {Array} existingFilters - Existing filter criteria
 * @returns {Promise<void>}
 */
async function createGroupFilters(gmail, labelMap, existingFilters) {
  // Extract all group paths (including nested groups)
  const groupLabelPaths = Object.keys(labelMap).filter((path) => {
    // Check if this path is a parent to any feed label
    const hasChildFeeds = Object.keys(labelMap).some(
      // Not ending with slash (not another group)
      (otherPath) => otherPath !== path && otherPath.startsWith(path + '/') && !otherPath.endsWith('/')
    );

    return hasChildFeeds;
  });

  for (const groupPath of groupLabelPaths) {
    const labelId = labelMap[groupPath];
    const parts = groupPath.split('/').filter((part) => part !== MAIL_LABELS.RSS_FEED);

    // Skip the root label
    if (parts.length === 0) continue;

    // Create a filter pattern based on the group path with all parent groups included
    // For "RSS Feeds/Technology/Programming", filter should match "[Technology][Programming]"
    const subjectPattern = parts.map((part) => `[${part}]`).join('');

    // Skip if we already have a filter with this exact subject
    if (existingFilters.some((criteria) => criteria === subjectPattern)) {
      console.log(`Group filter for subject "${subjectPattern}" already exists, skipping`);
      continue;
    }

    // Create a filter to apply this label
    await gmail.users.settings.filters.create({
      userId: 'me',
      requestBody: {
        criteria: {
          subject: subjectPattern,
          from: config.email.from.replace(/^"([^"]*)".*$/, '$1'),
        },
        action: {
          addLabelIds: [labelId],
        },
      },
    });

    console.log(`Created group filter for subject "${subjectPattern}" to apply label "${groupPath}"`);
  }
}

/**
 * Create a general filter for the RSS email sender to apply root label and skip inbox
 * @param {Object} gmail - The Gmail API client
 * @param {Object} labelMap - Map of label paths to label IDs
 * @param {Array} existingFilters - Existing filter criteria
 * @returns {Promise<void>}
 */
async function createGeneralSenderFilter(gmail, labelMap, existingFilters) {
  const fromEmail = config.email.from.replace(/^"([^"]*)".*$/, '$1');

  // Get the root label ID
  const rootLabelId = labelMap[MAIL_LABELS.RSS_FEED];
  if (!rootLabelId) {
    console.log('Root RSS Feeds label ID not found, skipping root label application');
    return;
  }

  // Check if filter with exact sender criteria exists
  if (existingFilters.some((criteria) => criteria === fromEmail)) {
    console.log(`General filter for sender "${fromEmail}" already exists, skipping`);
    return;
  }

  // Create a single filter to both apply the RSS Feeds root label and skip inbox
  await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: {
      criteria: {
        from: fromEmail,
      },
      action: {
        addLabelIds: [rootLabelId], // Apply RSS Feeds label to all emails from this sender
        removeLabelIds: ['INBOX'], // Skip the inbox for all emails from this sender
      },
    },
  });

  console.log(`Created general filter for sender "${fromEmail}" to apply "RSS Feeds" label and skip inbox`);
}
