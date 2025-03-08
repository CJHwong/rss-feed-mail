import { google } from 'googleapis';
import nodemailer from 'nodemailer';

import { config } from './config.js';
import { MAIL_LABELS } from './utils/feedUtils.js';
import { retryOperation, isTemporaryEmailError } from './utils/retryUtils.js';

/**
 * Send an email with RSS feed items
 * @param {Array} items - The feed items to include
 * @param {string} subject - The email subject
 * @param {string} labelPath - The Gmail label path
 * @returns {Promise<Object>} - The send mail result
 */
export async function sendEmail(items, subject, labelPath) {
  try {
    const transport = await createEmailTransport();
    const htmlContent = formatEmailContent(items);
    const labelString = buildLabelString(labelPath);

    const mailOptions = createMailOptions(subject, htmlContent, labelString);

    const result = await transport.sendMail(mailOptions);
    console.log(`Email sent for ${labelPath}: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Send an email with retry capability
 * @param {Array} items - Feed items to include
 * @param {string} subject - Email subject
 * @param {string} labelPath - Gmail label path
 * @param {number} maxRetries - Max retry attempts
 * @param {number} retryDelay - Initial retry delay in ms
 * @returns {Promise<Object>} - Send result
 */
export async function sendEmailWithRetry(items, subject, labelPath, maxRetries = 3, retryDelay = 5000) {
  return retryOperation(() => sendEmail(items, subject, labelPath), maxRetries, retryDelay, isTemporaryEmailError);
}

/**
 * Create a configured email transport
 * @returns {Promise<Object>} - The nodemailer transport
 */
async function createEmailTransport() {
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
  const tokens = await oAuth2Client.refreshAccessToken();
  const accessToken = tokens.credentials.access_token;

  // Create email transport
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: config.email.recipient,
      clientId: config.gmail.clientId,
      clientSecret: config.gmail.clientSecret,
      refreshToken: config.gmail.refreshToken,
      accessToken,
    },
  });
}

/**
 * Create mail options for nodemailer
 * @param {string} subject - Email subject
 * @param {string} htmlContent - Email HTML content
 * @param {string} labelString - Gmail labels string
 * @returns {Object} - Mail options
 */
function createMailOptions(subject, htmlContent, labelString) {
  return {
    from: config.email.from,
    to: config.email.recipient,
    subject: subject,
    html: htmlContent,
    headers: {
      'X-GM-LABELS': labelString,
    },
  };
}

/**
 * Format the email content from feed items
 * @param {Array} items - The feed items
 * @returns {string} - Formatted HTML content
 */
function formatEmailContent(items) {
  let content = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
    h1 { color: #444; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    h2 { color: #666; margin-top: 25px; }
    .item { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
    .meta { font-size: 0.8em; color: #888; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .content { margin-top: 10px; }
  </style>
</head>
<body>
  <h1>RSS Feed Updates</h1>`;

  for (const item of items) {
    content += formatEmailItem(item);
  }

  content += `
</body>
</html>`;

  return content;
}

/**
 * Format a single feed item for the email
 * @param {Object} item - The feed item
 * @returns {string} - Formatted HTML for the item
 */
function formatEmailItem(item) {
  return `
  <div class="item">
    <h2><a href="${item.link}">${item.title}</a></h2>
    <div class="meta">
      <span>From: ${item.feedTitle}</span>
      ${item.isoDate ? `<span> • ${new Date(item.isoDate).toLocaleString()}</span>` : ''}
      ${item.creator ? `<span> • By ${item.creator}</span>` : ''}
    </div>
    <div class="content">
      ${item.fullContent || item.content || item.contentSnippet || 'No content available'}
    </div>
  </div>`;
}

/**
 * Build the Gmail label string for the X-GM-LABELS header
 * @param {string} labelPath - The label path
 * @returns {string} - Comma-separated label string
 */
function buildLabelString(labelPath) {
  // Base label is always from MAIL_LABELS.RSS_FEED
  let labels = [MAIL_LABELS.RSS_FEED];

  // Add path components
  const pathComponents = labelPath.split('/');
  let currentPath = MAIL_LABELS.RSS_FEED;

  for (const component of pathComponents) {
    currentPath += `/${component}`;
    labels.push(currentPath);
  }

  return labels.join(',');
}
