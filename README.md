# RSS Feed Mail

Turn Gmail into your personal RSS reader by receiving feed updates via email with automatic organization and labeling.

## Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/rss-feed-mail.git
   cd rss-feed-mail
   ```

2. Install and configure:

   ```bash
   npm install
   cp .env.example .env
   cp config-examples/feed-config.json feed-config.json
   ```

3. Edit `.env` with your Gmail API credentials and settings

4. Edit `feed-config.json` to add your RSS feeds

5. Run the application:

   ```bash
   node src/index.js
   ```

## Features

- Hierarchical feed organization with automatic Gmail label creation
- Content enhancement for short RSS items by fetching full articles
- Custom email subjects with group hierarchy prefixes
- Cursor-based tracking to avoid duplicate emails
- Scheduled email delivery at customizable intervals

## CLI Options

```
--create-labels           Create Gmail labels based on feed groups
--update-cursor-only      Update cursor without sending emails
--try-load-full-content   Fetch full content for short RSS items
--max-retries N           Set maximum retry attempts for failed operations (default: 3)
--retry-delay N           Set initial retry delay in milliseconds (default: 5000)
```

## Configuration

### Feed Structure

```json
{
  "groups": [
    {
      "name": "Technology",
      "emailSubject": "Tech News Updates",
      "feeds": [{ "title": "Hacker News", "url": "https://news.ycombinator.com/rss" }],
      "groups": [
        {
          "name": "Programming",
          "feeds": [{ "title": "Dev.to", "url": "https://dev.to/feed" }]
        }
      ]
    }
  ]
}
```

### Gmail API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable Gmail API
3. Create OAuth 2.0 credentials (Desktop application)
4. Configure the OAuth consent screen
5. Generate refresh tokens via [OAuth Playground](https://developers.google.com/oauthplayground/)

- Required scopes:
  - `https://mail.google.com`
  - `https://www.googleapis.com/auth/gmail.settings.basic`

## Scheduling

Set up automated checking:

```bash
chmod +x cron-setup.sh
./cron-setup.sh
```

This creates a cron job to run the script every 2 hours (configurable in `.env`).

## For Developers

### Commands

```bash
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run format       # Run Prettier formatting
npm run prepare      # Set up Husky Git hooks
```

### Project Structure

- `src/index.js`: Main entry point
- `src/config.js`: Configuration loading and cursor management
- `src/feedFetcher.js`: RSS feed fetching and processing
- `src/emailer.js`: Email composition and delivery
- `src/gmailLabels.js`: Gmail label management
- `src/utils/`: Utility functions

## License

MIT
