/**
 * Constants for email labels and formatting
 */
export const MAIL_LABELS = {
  RSS_FEED: 'RSS Feeds',
  UNCATEGORIZED: 'Uncategorized',
};

/**
 * Subject formatting patterns
 */
export const SUBJECT_PATTERNS = {
  GROUP_PREFIX: (group) => `[${group}]`,
  DEFAULT_SUBJECT: 'RSS Feeds Update',
};

/**
 * Extract all feeds from the nested group structure
 * @param {Object} feedConfig - The feed configuration
 * @param {string} parentPath - The parent path for nesting
 * @returns {Array} - The list of flattened feeds with metadata
 */
export function extractFeeds(feedConfig, parentPath = '') {
  let feeds = [];

  if (feedConfig.groups) {
    for (const group of feedConfig.groups) {
      const groupPath = parentPath ? `${parentPath}/${group.name}` : group.name;

      // Add feeds in this group
      if (group.feeds) {
        feeds.push(
          ...group.feeds.map((feed) => ({
            ...feed,
            groupPath,
          }))
        );
      }

      // Add feeds from subgroups
      if (group.groups) {
        feeds.push(...extractFeeds(group, groupPath));
      }
    }
  }

  return feeds;
}

/**
 * Find the group path for a feed URL in the config
 * @param {string} feedUrl - The URL to find
 * @param {Object} feedConfig - The feed configuration
 * @returns {string} - The path or 'Uncategorized'
 */
export function findGroupPathForFeed(feedUrl, feedConfig) {
  const result = { path: null };

  function searchGroups(groups, parentPath = '') {
    for (const group of groups || []) {
      const currentPath = parentPath ? `${parentPath}/${group.name}` : group.name;

      // Check if this group contains the feed
      if (group.feeds && group.feeds.some((feed) => feed.url === feedUrl)) {
        result.path = currentPath;
        return true;
      }

      // Check subgroups recursively
      if (group.groups && searchGroups(group.groups, currentPath)) {
        return true;
      }
    }
    return false;
  }

  searchGroups(feedConfig.groups);
  return result.path || MAIL_LABELS.UNCATEGORIZED;
}

/**
 * Format the group hierarchy for the email subject
 * Example: "Technology/Programming" becomes "[Technology][Programming]"
 * @param {string} groupPath - The group path
 * @returns {string} - Formatted string for email subject
 */
export function formatGroupHierarchyForSubject(groupPath) {
  if (!groupPath || groupPath === MAIL_LABELS.UNCATEGORIZED) {
    return SUBJECT_PATTERNS.GROUP_PREFIX(MAIL_LABELS.UNCATEGORIZED);
  }

  // Split the path and wrap each part in square brackets
  const parts = groupPath.split('/');
  return parts.map((part) => SUBJECT_PATTERNS.GROUP_PREFIX(part)).join('');
}

/**
 * Get the standard mail labels for RSS feeds
 * @returns {Array<string>} - Array of labels to apply
 */
export function getMailLabels() {
  return [MAIL_LABELS.RSS_FEED];
}

/**
 * Generate a standardized email subject for RSS feed emails
 * @param {string} groupPath - The group path
 * @param {string} customTitle - Optional custom title
 * @returns {string} - Formatted email subject
 */
export function generateEmailSubject(groupPath, customTitle = null) {
  const groupPrefix = formatGroupHierarchyForSubject(groupPath);
  const title = customTitle || SUBJECT_PATTERNS.DEFAULT_SUBJECT;
  return `${groupPrefix} ${title}`;
}
