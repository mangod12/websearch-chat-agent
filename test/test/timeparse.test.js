import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatePhrase, contentKeywords, startOfDay } from '../src/timeparse.js';

// Reference "now": Tuesday 10 November 2026, 20:00 local.
const NOW = new Date(2026, 10, 10, 20, 0).getTime();
const day = (y, m, d) => new Date(y, m, d).getTime();

test('explicit "3 November" resolves to 3 Nov this year', () => {
  const r = resolveDatePhrase('What did I ask you on 3 November?', NOW);
  assert.equal(r.dayStart, day(2026, 10, 3));
  assert.equal(r.dayEnd, day(2026, 10, 4));
});

test('"November 3" word order also works', () => {
  const r = resolveDatePhrase('what did I ask on November 3rd', NOW);
  assert.equal(r.dayStart, day(2026, 10, 3));
});

test('future date this year falls back to last year', () => {
  const r = resolveDatePhrase('what did I ask on 25 December?', NOW);
  assert.equal(r.dayStart, day(2025, 11, 25));
});

test('"last Tuesday" from a Tuesday is a week ago', () => {
  const r = resolveDatePhrase('Last Tuesday I asked you about Postgres hosting', NOW);
  assert.equal(r.dayStart, day(2026, 10, 3)); // Tue 3 Nov
});

test('"on Monday" means the most recent Monday', () => {
  const r = resolveDatePhrase('On Monday we shortlisted 5 CRM tools', NOW);
  assert.equal(r.dayStart, day(2026, 10, 9)); // Mon 9 Nov
});

test('today and yesterday', () => {
  assert.equal(resolveDatePhrase('what did I ask today', NOW).dayStart, startOfDay(NOW));
  assert.equal(resolveDatePhrase('what did I ask yesterday', NOW).dayStart, startOfDay(NOW) - 86400000);
});

test('no date phrase returns null', () => {
  assert.equal(resolveDatePhrase('what is the price of rice', NOW), null);
});

test('content keywords drop time filler and stopwords', () => {
  assert.deepEqual(contentKeywords('What did I ask you on 3 November about Postgres hosting?'), ['postgres', 'hosting']);
});

 test('compound recall and recheck prioritizes the original date over today', () => {
  const r = resolveDatePhrase('What did I ask on 3 November? Is your answer still correct today?', NOW);
  assert.equal(r.dayStart, day(2026, 10, 3));
});
