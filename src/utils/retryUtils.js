/**
 * Retry an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in ms
 * @param {Function} isRetryable - Function to determine if error is retryable
 * @returns {Promise<any>} - Result of the operation
 */
export async function retryOperation(operation, maxRetries, initialDelay, isRetryable) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && isRetryable(error)) {
        console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Check if an error is a temporary email sending error
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's a temporary error
 */
export function isTemporaryEmailError(error) {
  // Check for temporary SMTP errors (4xx codes are temporary)
  return error && error.responseCode && error.responseCode >= 400 && error.responseCode < 500;
}
