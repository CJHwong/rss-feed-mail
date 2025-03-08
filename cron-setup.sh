#!/bin/bash

# Get absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create a cron job to run the script every 2 hours
CRON_JOB="0 */2 * * * cd $SCRIPT_DIR && /usr/bin/node $SCRIPT_DIR/src/index.js >> $SCRIPT_DIR/logs/rss-feed.log 2>&1"

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Add the cron job to the current user's crontab
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "Cron job has been set up to run every 2 hours."
echo "You can check the logs at $SCRIPT_DIR/logs/rss-feed.log"
