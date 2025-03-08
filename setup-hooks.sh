#!/bin/bash

# Install additional dependencies needed for hooks
npm install --save-dev @commitlint/cli @commitlint/config-conventional

# Set up Husky
npm run prepare

# Make the hooks executable
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg

echo "Git hooks have been set up successfully!"
echo "Pre-commit hook will run ESLint and Prettier"
echo "Commit-msg hook will validate commit message format"
