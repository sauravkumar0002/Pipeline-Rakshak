/**
 * Date/time utilities — all times displayed in IST (Asia/Kolkata, UTC+5:30).
 */

const IST_LOCALE = 'en-IN';
const IST_TZ    = 'Asia/Kolkata';

/**
 * Format a timestamp for display in inspection tables / detail views.
 * Output: "24/05/2026, 05:45:00 PM IST"
 * @param {string|Date|null} dateStr
 * @returns {string}
 */
export function formatIST(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    const formatted = date.toLocaleString(IST_LOCALE, {
      timeZone: IST_TZ,
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return `${formatted} IST`;
  } catch {
    return '—';
  }
}

/**
 * Format a Date for the Navbar live clock.
 * Output: "24 May 2026 | 05:45 PM IST"
 * @param {Date} [date]  defaults to now
 * @returns {string}
 */
export function formatNavDate(date = new Date()) {
  const day = date.toLocaleString('en-IN', { timeZone: IST_TZ, day: 'numeric' });
  const month = date.toLocaleString('en-IN', { timeZone: IST_TZ, month: 'long' });
  const year = date.toLocaleString('en-IN', { timeZone: IST_TZ, year: 'numeric' });
  const time = date.toLocaleString('en-IN', {
    timeZone: IST_TZ,
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toUpperCase();
  return `${day} ${month} ${year} | ${time} IST`;
}
