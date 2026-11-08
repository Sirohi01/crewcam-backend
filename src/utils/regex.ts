/**
 * Helpers for turning user input into safe MongoDB regex patterns.
 *
 * Raw query strings must never reach `$regex` / `new RegExp` unescaped: a crafted
 * pattern like `(a+)+$` causes catastrophic backtracking (ReDoS) on the database,
 * and an invalid one like `(` makes `new RegExp` throw and the request 500.
 */

const MAX_SEARCH_LENGTH = 100;

export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Normalises a search term from `req.query` (which may be a string, an array or
 * undefined), trims it, caps its length and escapes it for literal matching.
 * Returns '' when there is nothing to search for.
 */
export const toSearchPattern = (value: unknown, maxLength = MAX_SEARCH_LENGTH): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return '';
  return escapeRegex(String(raw).trim().slice(0, maxLength));
};
