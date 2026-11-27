'use strict';
const { createHash } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { check, quota } = require('./esports-zero-credit-coverage.cjs');
const { assertPrizePicksApiAllowed } = require('../src/prizepicksapi-november-quota-lock.cjs');
const { pacific } = require('./pacific-morning-capture-gate.cjs');
const { exactOffsetTime } = require('./pickfinder-quote-features.cjs');
const leagues = ['NBA', 'NHL', 'NFL'];
const LIMIT = 1000, PER_LEAGUE = 12;
const NOV_27 = '2026-11-27';
const regular = Object.freeze({ reserve: 100, maxPages: 36 });
const oneTime = Object.freeze({ reserve: 80, maxPages: 20 });
const workflowRoot = 'Thedarkwillow/nhl-betting-platform1/.github/workflows/';
const uncappedWorkflow = workflowRoot + 'prizepicks-full-board-provider-quota-20261127.yml@refs/heads/main';
function approvedUncappedContext(env, now) {
  return env.PRIZEPICKS_ONCE === '2026-11-27-provider-quota' && env.GITHUB_WORKFLOW_REF === uncappedWorkflow &&
    env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_RUN_ATTEMPT === '1' && pacific(now).day === NOV_27;
}
function approvedOneTimeContext(env, now) {
  return env.PRIZEPICKS_ONCE === '2026-11-27-20-80' &&
    env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_RUN_ATTEMPT === '1' &&
    env.GITHUB_WORKFLOW_REF === 'Thedarkwillow/nhl-betting-platform1/.github/workflows/prizepicks-full-board-once-20261127.yml@refs/heads/main' &&
    pacific(now).day === NOV_27;
}
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
  coverage = check, unlocked = defaultLock, pause = sleep, oneTimeApproved = false, providerAllowanceOnly = false } = {}) {
  const now = clock();
  const exception = (oneTimeApproved || providerAllowanceOnly) && pacific(now).day === NOV_27;
  const uncapped = providerAllowanceOnly && exception;
  const { reserve, maxPages } = uncapped ? { reserve: 0, maxPages: Infinity } : exception ? oneTime : regular;
  const leagueLimit = uncapped ? Infinity : PER_LEAGUE;
  const receipt = { source: 'PrizePicksAPI', startedAt: now, coverageAttempts: 0,
    projectionAttempts: 0, protectedRequestReserve: reserve, maxProjectionRequests: uncapped ? null : maxPages, providerAllowanceOnly: uncapped, oneTimeNovemberException: exception,
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
  const ready = receipt.boards.filter(b => b.estimatedPages !== null && b.estimatedPages <= leagueLimit);
  receipt.estimatedProjectionRequests = ready.reduce((sum, b) => sum + b.estimatedPages, 0);
  receipt.quotaUnit = c.quota?.usageUnit ?? null;
  receipt.remainingRequestsBefore = countable(balance) ? balance : null;
  if (!approveRequests) return finish('coverage_only');
  if ((oneTimeApproved || providerAllowanceOnly) && !exception) return finish('one_time_authorization_expired');
  if (!exception && !unlocked(clock())) return finish('november_quota_lock');
  if (!requestUnit(c.quota) || !countable(balance) || !(reset > time(clock())))
    return finish('request_quota_unverified');
  if (receipt.estimatedProjectionRequests > maxPages) return finish('estimated_requests_above_cap');
  if (!uncapped && balance < reserve + receipt.estimatedProjectionRequests) return finish('protected_reserve');
  // In this owner-approved run the authenticated allowance is the only page budget.
  // If a live board refreshes during paging, finish the other leagues and restart
  // the affected league from page one if enough of that allowance remains.
  const budget = uncapped ? balance : maxPages;
  let halt = false;
  const queue = [...receipt.boards];
  for (const b of queue) {
    if (halt) { b.status = 'stopped_after_provider_error'; continue; }
    if (!ready.includes(b)) { b.status = 'coverage_unverified_or_above_cap'; continue; }
    if (b.restarts && (balance < b.estimatedPages || budget - receipt.projectionAttempts < b.estimatedPages)) continue;
    const rows = [], ids = new Set(), cursors = new Set();
    let cursor = null, sourceAt = null;
    let status = uncapped ? 'provider_allowance_exhausted' : 'pagination_cap';
    b.rowsReceived = 0;
    while (b.attempts < leagueLimit && receipt.projectionAttempts < budget) {
      if (balance <= reserve || !(reset > time(clock()))) { status = 'protected_reserve_or_reset'; halt = true; break; }
      if (receipt.projectionAttempts > 0) await pause(1100);
      if (exception && pacific(clock()).day !== NOV_27) { status = 'one_time_authorization_expired'; halt = true; break; }
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
        if (!requestUnit(usage) || !countable(usage.remainingRequests) || usage.remainingRequests < reserve ||
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
    if (uncapped && status === 'provider_refresh_during_pagination' && !b.restarts) {
      b.restarts = 1;
      queue.push(b);
    }
  }
  return finish(Object.keys(boards).length === leagues.length ? 'complete_provider_boards' : 'incomplete_provider_boards');
}
module.exports = { capture, approvedOneTimeContext, approvedUncappedContext };
if (require.main === module) {
  const fs = require('node:fs');
  const once = approvedOneTimeContext(process.env, date());
  const uncapped = approvedUncappedContext(process.env, date());
  const approved = once || uncapped || process.env.APPROVE_PRIZEPICKS_REQUESTS === 'true';
  if (process.env.PRIZEPICKS_ONCE && !once && !uncapped) {
    console.error('One-time authorization is unavailable or expired'); process.exitCode = 1;
  } else if (approved && !once && !uncapped && (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1')) {
    console.error('Live capture unavailable outside a first-attempt main dispatch'); process.exitCode = 1;
  } else capture({ key: process.env.PRIZEPICKSAPI_KEY, approveRequests: approved, oneTimeApproved: once, providerAllowanceOnly: uncapped }).then(({ receipt }) => {
    fs.writeFileSync(process.argv[2], JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(receipt));
    if (receipt.status !== (approved ? 'complete_provider_boards' : 'coverage_only')) process.exitCode = 1;
  }).catch(() => { console.error('PrizePicksAPI capture failed'); process.exitCode = 1; });
}
