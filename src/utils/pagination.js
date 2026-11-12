/**
 * Pagination query parser for GET /api/products (see SPEC.md §2).
 *
 * Strict: a present value must be a string of ASCII digits with no leading
 * zeros (only "0" itself may start with 0) and nothing else, within range.
 * Absent values take the defaults. Everything else is rejected.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// No `m` flag: `$` must match only at the end of the input.
const DIGITS = /^(0|[1-9][0-9]*)$/;

const LIMIT_ERROR = `limit must be an integer between 1 and ${MAX_LIMIT}`;
const OFFSET_ERROR = `offset must be an integer between 0 and ${Number.MAX_SAFE_INTEGER}`;

// Returns the parsed integer, the default when absent, or null when invalid.
function parseParam(value, defaultValue, min, max) {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !DIGITS.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

function parsePagination(query) {
  const limit = parseParam(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  if (limit === null) return { error: LIMIT_ERROR };

  const offset = parseParam(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  if (offset === null) return { error: OFFSET_ERROR };

  return { limit, offset };
}

module.exports = { parsePagination, DEFAULT_LIMIT, MAX_LIMIT };
