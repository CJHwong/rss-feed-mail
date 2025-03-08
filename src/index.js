import { fetchFeedConfig, updateCursor } from './config.js';
import { sendEmailWithRetry } from './emailer.js';
import { fetchFeeds, fetchFullContent } from './feedFetcher.js';
import { createLabels } from './gmailLabels.js';
import { getArgValue, hasFlag, promptForConfirmation } from './utils/cliUtils.js';
import { findGroupPathForFeed, formatGroupHierarchyForSubject } from './utils/feedUtils.js';

/**
 * Main function to check RSS feeds and send emails
 */
async function main() {
  try {
    console.log('Starting RSS feed check...');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = parseCommandLineOptions(args);

    // Get feed configuration and cursor
    const { feedConfig, cursor, cursorExists } = await fetchFeedConfig();

    // Fetch all feeds
    const feedResults = await fetchFeeds(feedConfig, cursor);

    // Handle command line options
    if (options.updateCursorOnly) {
      await handleCursorOnlyUpdate(feedResults, cursorExists);
      return;
    }

    // Create Gmail labels if needed
    if (options.createLabels) {
      await handleLabelCreation(feedConfig);
      return;
    }

    // Process feeds and send emails
    await processFeedsAndSendEmails(feedResults, feedConfig, options);

    // Update cursor with the latest item dates
    if (Object.keys(feedResults).length > 0) {
      await updateCursor(feedResults);
    }

    console.log('RSS feed check completed successfully.');
  } catch (error) {
    console.error('Error in RSS feed processing:', error);
  }
}

/**
 * Parse command line options
 * @param {string[]} args - Command line arguments
 * @returns {Object} - Parsed options
 */
function parseCommandLineOptions(args) {
  return {
    createLabels: hasFlag(args, '--create-labels'),
    updateCursorOnly: hasFlag(args, '--update-cursor-only'),
    fetchFullContent: hasFlag(args, '--try-load-full-content'),
    maxRetries: getArgValue(args, '--max-retries', 3),
    initialRetryDelay: getArgValue(args, '--retry-delay', 5000),
  };
}

/**
 * Handle cursor-only update operation
 * @param {Object} feedResults - The feed results
 * @param {boolean} cursorExists - Whether cursor file exists
 * @returns {Promise<void>}
 */
async function handleCursorOnlyUpdate(feedResults, cursorExists) {
  if (Object.keys(feedResults).length > 0) {
    if (cursorExists) {
      const shouldContinue = await promptForConfirmation(
        'Existing cursor file found. This will update the cursor and may skip previously ' +
          'unprocessed items. Continue? (y/n): '
      );
      if (!shouldContinue) {
        console.log('Operation cancelled by user.');
        return;
      }
    }
    console.log('Updating cursor to latest entries without sending emails...');
    await updateCursor(feedResults);
    console.log('Cursor updated successfully.');
  } else {
    console.log('No new items found. Cursor remains unchanged.');
  }
}

/**
 * Handle creation of Gmail labels
 * @param {Object} feedConfig - The feed configuration
 * @returns {Promise<void>}
 */
async function handleLabelCreation(feedConfig) {
  try {
    const labelMap = await createLabels(feedConfig);
    console.log(`Labels and filters created for ${Object.keys(labelMap).length} feeds`);
  } catch (error) {
    console.warn('Warning: Error creating labels or filters:', error.message);
  }
}

/**
 * Process feeds and send emails
 * @param {Object} feedResults - The feed results
 * @param {Object} feedConfig - The feed configuration
 * @param {Object} options - Command line options
 * @returns {Promise<Object>} - Email sending results
 */
async function processFeedsAndSendEmails(feedResults, feedConfig, options) {
  // Extract items from feed results
  const items = await extractItemsFromFeeds(feedResults, feedConfig, options.fetchFullContent);

  if (items.length === 0) {
    console.log('No new items to send');
    return { sent: 0, failed: 0 };
  }

  // Send emails
  return await sendEmails(items, options.maxRetries, options.initialRetryDelay);
}

/**
 * Extract items from feed results
 * @param {Object} feedResults - The feed results
 * @param {Object} feedConfig - The feed configuration
 * @param {boolean} fetchFullContentFlag - Whether to fetch full content
 * @returns {Promise<Array>} - Items to send
 */
async function extractItemsFromFeeds(feedResults, feedConfig, fetchFullContentFlag) {
  const items = [];

  for (const [feedUrl, result] of Object.entries(feedResults)) {
    if (result.items && result.items.length > 0) {
      // Find the group path for this feed
      const groupPath = findGroupPathForFeed(feedUrl, feedConfig);

      // Process each item individually
      for (const item of result.items) {
        // For items with short content, fetch full content if the flag is enabled
        if (fetchFullContentFlag && item.contentSnippet && item.contentSnippet.split(' ').length < 30) {
          item.fullContent = await fetchFullContent(item.link);
        }

        // Generate subject line with group hierarchy
        const hierarchyPrefix = formatGroupHierarchyForSubject(groupPath);
        const subject = `${hierarchyPrefix} ${item.feedTitle}: ${item.title}`;

        items.push({ item, subject, groupPath });
      }
    }
  }

  return items;
}

/**
 * Send emails for each item
 * @param {Array} items - Items to send
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} initialRetryDelay - Initial retry delay
 * @returns {Promise<Object>} - Send results
 */
async function sendEmails(items, maxRetries, initialRetryDelay) {
  const results = { sent: 0, failed: 0, failedItems: [] };

  if (items.length > 0) {
    console.log(`Attempting to send ${items.length} emails with max ${maxRetries} retries...`);

    for (const { item, subject, groupPath } of items) {
      try {
        await sendEmailWithRetry([item], subject, groupPath, maxRetries, initialRetryDelay);
        results.sent++;
      } catch (error) {
        console.error(`Failed to send email after ${maxRetries} retries:`, error.message);
        results.failed++;
        results.failedItems.push({ subject, error: error.message });
      }
    }

    console.log(`Email sending complete: ${results.sent} sent, ${results.failed} failed`);

    if (results.failed > 0) {
      console.log('Failed items:', results.failedItems.map((item) => item.subject).join('\n'));
    }
  }

  return results;
}

// Run the main function
main();
