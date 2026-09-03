/**
 * Format timestamp into a clean, readable time format (e.g. "10:30 AM")
 * @param {string | Date} timestamp 
 * @returns {string}
 */
export function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  
  if (isNaN(date.getTime())) {
    return '';
  }

  // Format as 12-hour time with AM/PM (e.g., "02:45 PM")
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
