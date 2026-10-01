// Centralized receipt service for generating receipt numbers and tokens

/**
 * Generate a cryptographically secure receipt token
 * @returns {string} 24-character random token
 */
export function generateReceiptToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  // Use crypto for better randomness
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  
  for (let i = 0; i < 24; i++) {
    const index = randomBytes[i] % chars.length;
    result += chars.charAt(index);
  }
  
  return result;
}

/**
 * Generate a receipt number based on date and count
 * Format: OD-YYYYMMDD-XXX
 * @param {Date} date - The date for the receipt
 * @param {number} count - Today's sequential count
 * @returns {string} Formatted receipt number
 */
export function generateReceiptNumber(date = new Date(), count = 1) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dayCode = `${year}${month}${day}`;
  const countStr = String(count).padStart(3, '0');
  
  return `OD-${dayCode}-${countStr}`;
}

/**
 * Get today's date string in YYYY-MM-DD format for Africa/Nairobi timezone
 * @returns {string} Date string
 */
export function getTodayDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
