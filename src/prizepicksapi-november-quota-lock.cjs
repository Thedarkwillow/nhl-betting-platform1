"use strict";
/**
 * Protect a free PrizePicksAPI.com (independent provider) account after the
 * November 19, 2026 80%-usage warning (800/1000 requests used).
 *
 * This blocks paid /board, /projections, and historical API collection
 * before December 1, 2026 00:00 UTC (November 30, 4 PM Pacific).
 * Only the workflow CLI entrypoints call this guard; offline research,
 * cached data, official NHL stats, and independent partner-source
 * collections continue without this API.
 *
 * Automatic expiry is strictly a calendar boundary, not proof that the
 * provider has reset the allowance. Existing quota preflight must still pass.
 */
const RESET_AT_UTC = "2026-12-01T00:00:00.000Z";
function assertPrizePicksApiAllowed(now = new Date().toISOString()) {
  const time = Date.parse(now);
  if (!Number.isFinite(time)) throw new Error("Invalid clock for PrizePicksAPI spending lock");
  if (time < Date.parse(RESET_AT_UTC)) {
    const error = new Error(
      "PrizePicksAPI November allowance protected: no metered vendor request " +
      "until 2026-12-01T00:00:00Z. Continue cached and free-source NHL/NFL research."
    );
    error.code = "PRIZEPICKSAPI_NOVEMBER_QUOTA_LOCK";
    throw error;
  }
  return true;
}
module.exports = { RESET_AT_UTC, assertPrizePicksApiAllowed };
