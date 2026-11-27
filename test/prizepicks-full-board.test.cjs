'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { capture, approvedOneTimeContext } = require('../scripts/prizepicks-full-board.cjs');
const AT = '2026-12-02T14:00:00.000Z', SOURCE = '2026-12-02T13:59:00.000Z';
const makeRow = (league, id, tier) => ({ league, id, tier, status: 'active', source: 'prizepicks', private: 'never_public' });
function fixture({ change, counts = [2, 1, 0], balance = 180, unit = 'requests', locked = false, approve = true, once = false, at = AT, source = SOURCE } = {}) {
  const calls = [];
  return { calls, async run() { return capture({
    key: 'test-secret', approveRequests: approve, oneTimeApproved: once, clock: () => at, unlocked: () => !locked, pause: async () => {},
    coverage: async () => ({ status: 'authenticated_independent_metadata', chargedCredits: null,
      quota: { remainingRequests: balance, usageUnit: unit, resetAt: '2027-01-01T00:00:00Z' },
      traditionalSportRows: ['NBA','NHL','NFL'].map((code, i) =>
        ({ code, freshnessVerified: true, offers: counts[i], sourceStatus: 'fresh', observedAt: source })) }),
    client: async (path, options) => {
      const url = new URL(path), league = url.searchParams.get('league'), cursor = url.searchParams.get('cursor');
      calls.push({ url, options });
      const doc = { meta: { mode: 'live', source_status: 'fresh', observed_at: source, next_cursor: null },
        data: league === 'NFL' ? [] : [makeRow(league, cursor ? 'next' : 'first', cursor ? 'demon' : 'standard')] };
      if (league === 'NHL') doc.data[0].tier = 'goblin';
      if (league === 'NBA' && cursor === null) doc.meta.next_cursor = 'next';
      const headers = { 'X-Usage-Unit': 'requests', 'X-Requests-Remaining': String(balance - calls.length), 'X-Credits-Cost': '0' };
      change?.({ doc, league, cursor, headers });
      return new Response(JSON.stringify(doc), { headers });
    }
  }); } };
}
test('walks all three leagues with identical filters and no market, tier or time exclusions', async () => {
  const f = fixture(), { receipt, boards } = await f.run();
  assert.equal(receipt.status, 'complete_provider_boards');
  assert.deepEqual(f.calls.map(x => [...x.url.searchParams.values()]), [
    ['NBA','compact','1000','active'], ['NBA','compact','1000','active','next'],
    ['NHL','compact','1000','active'], ['NFL','compact','1000','active']]);
  assert.deepEqual(boards.NBA.map(r => r.id), ['first','next']);
  assert.equal(receipt.boards[0].tierCounts.demon, 1);
  assert.equal(receipt.boards[1].tierCounts.goblin, 1);
  assert.equal(receipt.boards[2].status, 'verified_empty_provider_board');
  assert.doesNotMatch(JSON.stringify(receipt), /never_public|test-secret/);
  assert.equal(receipt.remainingRequestsAfter, 176);
});
test('no projections on coverage-only, the November lock, unverified plan, or protected reserve', async () => {
  for (const [input, status] of [[{approve:false}, 'coverage_only'], [{locked:true}, 'november_quota_lock'],
    [{unit:'credits'}, 'request_quota_unverified'], [{balance:102}, 'protected_reserve']]) {
    const f = fixture(input), { receipt, boards } = await f.run();
    assert.equal(receipt.status, status); assert.equal(f.calls.length, 0); assert.deepEqual(boards, {});
  }
});
test('invalid NBA traversals release no NBA rows and leave other leagues independently checkable', async () => {
  for (const [mutate, expected] of [
    [d => { d.meta.observed_at = AT; }, 'provider_refresh_during_pagination'],
    [d => { d.meta.next_cursor = 'next'; }, 'invalid_or_repeated_cursor'],
    [d => { delete d.meta.next_cursor; }, 'invalid_or_repeated_cursor'],
    [d => { d.data[0].id = 'first'; }, 'invalid_scope_or_duplicate_offer'],
    [d => { d.data[0].league = 'NFL'; }, 'invalid_scope_or_duplicate_offer'],
    [d => { d.meta.source_status = 'partial'; }, 'source_not_fresh_or_invalid'],
    [d => { d.data.push(makeRow('NBA','unexpected','standard')); }, 'same_snapshot_coverage_count_mismatch']
  ]) {
    const { receipt, boards } = await fixture({
      change: ({ doc, league, cursor }) => { if (league === 'NBA' && cursor) mutate(doc); }
    }).run();
    assert.equal(receipt.status, 'incomplete_provider_boards'); assert.equal(receipt.boards[0].status, expected);
    assert.equal(boards.NBA, undefined); assert.equal(boards.NHL.length, 1);
  }
});
test('nonzero charge or unverified request consumption stops all further requests', async () => {
  const f = fixture({change: ({ headers }) => { headers['X-Credits-Cost'] = '10'; }});
  const { receipt, boards } = await f.run();
  assert.equal(f.calls.length, 1); assert.deepEqual(boards, {});
  assert.deepEqual(receipt.boards.map(b => b.status), [
    'projection_quota_unverified','stopped_after_provider_error','stopped_after_provider_error']);
});
test('unbounded cursors cannot exhaust the protected allowance', async () => {
  let id = 0;
  const f = fixture({change: ({ doc, league }) => {
    if (league === 'NBA') { doc.meta.next_cursor = 'page_' + (++id); doc.data[0].id = doc.meta.next_cursor; }
  }});
  const { receipt, boards } = await f.run();
  assert.equal(receipt.boards[0].status, 'pagination_cap');
  assert.equal(receipt.boards[0].attempts, 12);
  assert.equal(boards.NBA, undefined);
  assert.equal(f.calls.length, 14);
});
const nov = { once: true, at: '2026-11-27T15:00:00Z', source: '2026-11-27T14:59:00Z', balance: 100, locked: true };
test('one-time exception is confined to the approved Pacific date and push workflow', async () => {
  const env = { PRIZEPICKS_ONCE: '2026-11-27-20-80', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_WORKFLOW_REF: 'Thedarkwillow/nhl-betting-platform1/.github/workflows/prizepicks-full-board-once-20261127.yml@refs/heads/main' };
  assert.equal(approvedOneTimeContext(env, nov.at), true);
  assert.equal(approvedOneTimeContext(env, '2026-11-28T07:59:59Z'), true);
  assert.equal(approvedOneTimeContext(env, '2026-11-28T08:00:00Z'), false);
  for (const key of Object.keys(env)) assert.equal(approvedOneTimeContext({ ...env, [key]: '' }, nov.at), false);
  const good = await fixture(nov).run();
  assert.equal(good.receipt.status, 'complete_provider_boards');
  assert.equal(good.receipt.protectedRequestReserve, 80);
  assert.equal(good.receipt.maxProjectionRequests, 20);
  assert.equal((await fixture({ ...nov, balance: 82 }).run()).receipt.status, 'protected_reserve');
  assert.equal((await fixture({ ...nov, counts: [11000,10000,0] }).run()).receipt.status, 'estimated_requests_above_cap');
  assert.equal((await fixture({once:true}).run()).receipt.status, 'one_time_authorization_expired');
});
test('one-time request accounting never proceeds past 20 requests or below its 80 reserve', async () => {
  let id = 0;
  const f = fixture({ ...nov, change: ({doc}) => {
    doc.meta.next_cursor = 'page_' + (++id); doc.data[0] ??= makeRow('NFL','next','standard');
    doc.data[0].id = doc.meta.next_cursor;
  }});
  const {receipt, boards} = await f.run();
  assert.equal(receipt.projectionAttempts, 20);
  assert.equal(f.calls.length, 20);
  assert.equal(receipt.remainingRequestsAfter, 80);
  assert.deepEqual(boards, {});
});
