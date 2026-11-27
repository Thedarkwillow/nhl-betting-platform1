'use strict';
const { createHash } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { check, quota } = require('./esports-zero-credit-coverage.cjs');
const { assertPrizePicksApiAllowed } = require('../src/prizepicksapi-november-quota-lock.cjs');
const { exactOffsetTime } = require('./pickfinder-quote-features.cjs');
const leagues = ['NBA', 'NHL', 'NFL'];
const LIMIT = 1000, RESERVE = 100, MAX_PAGES = 36, PER_LEAGUE = 12;
const countable = x => Number.isSafeInteger(x) && x >= 0;
const requestUnit = q => ['request', 'requests'].includes(q?.usageUnit);
const date = () => new Date().toISOString();
const time = x => typeof x === 'string' ? exactOffsetTime(x) : NaN;
const validClock = (t, now) => Number.isFinite(t) && t <= now && now - t <= 900000;
const cursorOk = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(x);
function defaultLock(now) { try { return assertPrizePicksApiAllowed(now); } catch { return false; } }
async function readPage(response) {
  const reader = response.body.getReader(), parts = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.length;
      if (total > 8_000_000) { await reader.cancel(); throw Error('payload_limit'); }
      parts.push(Buffer.from(chunk.value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function capture({ key, approveRequests = false, clock = date, client = fetch,
  coverage = check, unlocked = defaultLock, pause = sleep } = {}) {
  const receipt = { source: 'PrizePicksAPI', startedAt: clock(), coverageAttempts: 0,
    projectionAttempts: 0, protectedRequestReserve: RESERVE, maxProjectionRequests: MAX_PAGES,
    originalAppVerified: false, rawRowsPublished: 0,
    boards: leagues.map(league => ({ league, status: 'not_attempted', attempts: 0, rowsReceived: 0 })) };
  const boards = {};
  const finish = status => ({ receipt: { ...receipt, status, finishedAt: clock() }, boards });
  if (!key) return finish('missing_api_secret');
  receipt.coverageAttempts++;
  const c = await coverage('PrizePicks', key, client);
  if (c?.status !== 'authenticated_independent_metadata' || ![0, null].includes(c.chargedCredits))
    return finish('coverage_unverified');
  let balance = c.quota?.remainingRequests;
  const reset = time(c.quota?.resetAt);
  for (const board of receipt.boards) {
    const rows = c.traditionalSportRows?.filter(r => r.code === board.league) ?? [];
    const r = rows.length === 1 ? rows[0] : null;
    board.coverageCount = countable(r?.offers) ? r.offers : null;
    board.coverageFresh = r?.freshnessVerified === true && !['partial', 'stale', 'aging', 'unavailable'].includes(r.sourceStatus);
    board.estimatedPages = board.coverageFresh && board.coverageCount !== null ?
      Math.max(1, Math.ceil(board.coverageCount / LIMIT)) : null;
  }
  const ready = receipt.boards.filter(b => b.estimatedPages !== null && b.estimatedPages <= PER_LEAGUE);
  receipt.estimatedProjectionRequests = ready.reduce((sum, b) => sum + b.estimatedPages, 0);
  receipt.quotaUnit = c.quota?.usageUnit ?? null;
  receipt.remainingRequestsBefore = countable(balance) ? balance : null;
  if (!approveRequests) return finish('coverage_only');
  if (!unlocked(clock())) return finish('november_quota_lock');
  if (!requestUnit(c.quota) || !countable(balance) || !(reset > time(clock())))
    return finish('request_quota_unverified');
  if (balance < RESERVE + receipt.estimatedProjectionRequests) return finish('protected_reserve');
  let halt = false;
  for (const b of receipt.boards) {
    if (halt) { b.status = 'stopped_after_provider_error'; continue; }
    if (!ready.includes(b)) { b.status = 'coverage_unverified_or_above_cap'; continue; }
    const rows = [], ids = new Set(), cursors = new Set();
    let cursor = null, sourceAt = null;
    let status = 'pagination_cap';
    while (b.attempts < PER_LEAGUE && receipt.projectionAttempts < MAX_PAGES) {
      if (balance <= RESERVE || !(reset > time(clock()))) { status = 'protected_reserve_or_reset'; halt = true; break; }
      if (receipt.projectionAttempts > 0) await pause(1100);
      if (!(reset > time(clock()))) { status = 'protected_reserve_or_reset'; halt = true; break; }
      const url = new URL('https://prizepicksapi.com/api/v1/projections');
      url.search = new URLSearchParams({ league: b.league, view: 'compact', limit: String(LIMIT), status: 'active' });
      if (cursor !== null) url.searchParams.set('cursor', cursor);
      b.attempts++; receipt.projectionAttempts++;
      try {
        const response = await client(url.toString(), { headers: { Authorization: 'Bearer ' + key,
          Accept: 'application/json', 'X-User-Request': 'Capture the full NBA, NHL and NFL prop boards' },
          redirect: 'error', signal: AbortSignal.timeout(25000) });
        if (!response.ok) {
          status = 'projection_http_failure'; b.httpStatus = response.status; halt = true; break;
        }
        const usage = quota(response.headers);
        const costs = ['X-Credits-Cost', 'X-Credits-Charged'].map(h => response.headers.get(h)).filter(v => v !== null);
        if (!requestUnit(usage) || !countable(usage.remainingRequests) || usage.remainingRequests < RESERVE ||
            ![balance - 1, balance].includes(usage.remainingRequests) || costs.some(v => v !== '0')) {
          status = 'projection_quota_unverified'; halt = true; break;
        }
        balance = usage.remainingRequests;
        receipt.remainingRequestsAfter = balance;
        const doc = await readPage(response), m = doc?.meta, snapshot = time(m?.observed_at);
        if (m?.mode !== 'live' || m.is_demo === true || m.source_status !== 'fresh' ||
            !validClock(snapshot, time(clock())) || !Array.isArray(doc.data) || doc.data.length > LIMIT) {
          status = 'source_not_fresh_or_invalid'; break;
        }
        if (sourceAt !== null && sourceAt !== snapshot) { status = 'provider_refresh_during_pagination'; break; }
        sourceAt = snapshot;
        const next = m.next_cursor;
        if (next !== null && (!cursorOk(next) || cursors.has(next) || doc.data.length === 0)) {
          status = 'invalid_or_repeated_cursor'; break;
        }
        let bad = false;
        for (const row of doc.data) {
          if (!row || (row.league ?? row.sport) !== b.league || row.status !== 'active' ||
              row.is_demo === true || (row.source != null && row.source !== 'prizepicks') ||
              typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)) { bad = true; break; }
          ids.add(row.id);
        }
        if (bad) { status = 'invalid_scope_or_duplicate_offer'; break; }
        rows.push(...doc.data); b.rowsReceived = rows.length;
        if (next === null) {
          if (!rows.length && b.coverageCount !== 0) { status = 'unexpected_empty_board'; break; }
          // Compare counts only when coverage refers to the same provider observation.
          const baseline = c.traditionalSportRows.find(r => r.code === b.league);
          if (time(baseline.observedAt) === snapshot && b.coverageCount !== rows.length) {
            status = 'same_snapshot_coverage_count_mismatch'; break;
          }
          status = rows.length ? 'complete_provider_board' : 'verified_empty_provider_board';
          b.providerObservedAt = new Date(snapshot).toISOString();
          b.sourceDigest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
          b.tierCounts = { standard: 0, goblin: 0, demon: 0, otherOrUnspecified: 0 };
          for (const row of rows) {
            const tier = ['standard', 'goblin', 'demon'].includes(row.tier) ? row.tier : 'otherOrUnspecified';
            b.tierCounts[tier]++;
          }
          boards[b.league] = rows;
          break;
        }
        cursors.add(next); cursor = next;
      } catch {
        status = 'projection_transport_or_schema_failure'; halt = true; break;
      }
    }
    b.status = status;
  }
  return finish(Object.keys(boards).length === leagues.length ? 'complete_provider_boards' : 'incomplete_provider_boards');
}
module.exports = { capture };
if (require.main === module) {
  const fs = require('node:fs');
  const approved = process.env.APPROVE_PRIZEPICKS_REQUESTS === 'true';
  if (approved && (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1')) {
    console.error('Live capture unavailable outside a first-attempt main dispatch'); process.exitCode = 1;
  } else capture({ key: process.env.PRIZEPICKSAPI_KEY, approveRequests: approved }).then(({ receipt }) => {
    fs.writeFileSync(process.argv[2], JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(receipt));
    if (receipt.status !== (approved ? 'complete_provider_boards' : 'coverage_only')) process.exitCode = 1;
  }).catch(() => { console.error('PrizePicksAPI capture failed without retry'); process.exitCode = 1; });
}
