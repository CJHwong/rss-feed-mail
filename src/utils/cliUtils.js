import readline from 'readline';

/**
 * Get a value from command line arguments
 * @param {string[]} args - Command line arguments
 * @param {string} flag - Flag to look for (like '--max-retries')
 * @param {any} defaultValue - Default value if flag not found
 * @returns {any} - The value
 */
export function getArgValue(args, flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index !== -1 && index < args.length - 1) {
    const value = parseInt(args[index + 1]);
    return isNaN(value) ? defaultValue : value;
  }
  return defaultValue;
}

/**
 * Check if a flag is present in command line arguments
 * @param {string[]} args - Command line arguments
 * @param {string} flag - Flag to look for
 * @returns {boolean} - True if flag is present
 */
export function hasFlag(args, flag) {
  return args.includes(flag);
}

/**
 * Prompts the user for a yes/no confirmation
 * @param {string} question - The question to display to the user
 * @returns {Promise<boolean>} - True if the user confirms, false otherwise
 */
export function promptForConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
