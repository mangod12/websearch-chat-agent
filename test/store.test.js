import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-store-'));
  return new Store(dir);
}

test('messages and QA records persist across instances', async () => {
  const s = tmpStore();
  s.addMessage('user', 'hello', 1000);
  s.addQaRecord({ ts: 2000, question: 'q1', answerSummary: 'a1', claims: ['c1'], sources: [] });
  await new Promise((r) => setTimeout(r, 120)); // debounced write
  const s2 = new Store(s.dir);
  assert.equal(s2.state.messages.length, 1);
  assert.equal(s2.state.qaRecords.length, 1);
  assert.equal(s2.state.qaRecords[0].question, 'q1');
});

test('findQaRecords ranks by keyword overlap and filters by day', () => {
  const s = tmpStore();
  const base = new Date(2026, 10, 3, 12, 0).getTime();
  s.addQaRecord({ ts: base, question: 'best Postgres hosting', answerSummary: 'x', claims: [], sources: [] });
  s.addQaRecord({ ts: base + 86400000, question: 'best CRM tools', answerSummary: 'y', claims: [], sources: [] });
  const on3rd = s.findQaRecords({ keywords: ['postgres'], dayStart: new Date(2026, 10, 3).getTime(), dayEnd: new Date(2026, 10, 4).getTime() });
  assert.equal(on3rd.length, 1);
  assert.equal(on3rd[0].question, 'best Postgres hosting');
  const all = s.findQaRecords({ keywords: ['crm'] });
  assert.equal(all[0].question, 'best CRM tools');
});

test('search cache expires', () => {
  const s = tmpStore();
  s.cacheSet('k', ['r'], 1000);
  assert.deepEqual(s.cacheGet('k'), ['r']);
  s.state.searchCache.k.ts = Date.now() - 2000;
  assert.equal(s.cacheGet('k'), null);
});
