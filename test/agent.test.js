import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { makeAgent } from '../src/agent.js';

function tmpStore() {
  return new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-')));
}

// Fake LLM that answers each pipeline step by looking at the system prompt.
function fakeLlm() {
  const calls = [];
  const chatJson = async ({ messages }) => {
    calls.push(messages[0].content);
    const sys = messages[0].content;
    if (sys.includes('You classify one user message')) {
      const target = messages[1].content;
      if (/still correct|changed|change/i.test(target)) return { intent: 'RECHECK' };
      if (/what did (i|we) (ask|say)/i.test(target)) return { intent: 'RECALL' };
      return { intent: 'FRESH' };
    }
    if (sys.includes('Turn the user question into')) return { queries: ['postgres hosting pricing 2026'] };
    if (sys.includes('Extract memory from this Q&A')) {
      return { summary: 'Neon free tier is best for small apps.', claims: ['Neon has a free tier', 'Supabase free tier paused after 7 days'] };
    }
    throw new Error('unexpected chatJson call');
  };
  const chat = async ({ stream, onToken }) => {
    const out = 'streamed answer [1]';
    if (stream && onToken) for (const tok of out.split(' ')) onToken(tok + ' ');
    return out;
  };
  return { chat, chatJson, calls };
}

function fakeSearcher(store) {
  const searches = [];
  return {
    searches,
    search: async (query, opts = {}) => {
      searches.push({ query, fresh: !!opts.fresh });
      return { query, results: [{ title: 'Neon pricing', url: 'https://neon.tech/pricing', snippet: 'Free tier available' }], cached: false };
    },
  };
}

test('FRESH turn searches in parallel, cites, and stores a claim-bearing memory', async () => {
  const store = tmpStore();
  const agent = makeAgent({ store, searcher: fakeSearcher(store), llm: fakeLlm() });
  const tokens = [];
  const intent = await agent.route('what is the best postgres hosting right now?', []);
  assert.equal(intent, 'FRESH');
  const { answer, sources } = await agent.handleFresh('what is the best postgres hosting right now?', (t) => tokens.push(t));
  assert.ok(answer.includes('[1]'));
  assert.equal(sources.length, 1);
  assert.ok(tokens.length > 0);
  assert.equal(store.state.qaRecords.length, 1);
  assert.equal(store.state.qaRecords[0].claims.length, 2);
});

test('RECALL finds a past answer by date phrase and keyword', async () => {
  const store = tmpStore();
  const ts = new Date(2026, 10, 3, 15, 0).getTime(); // 3 Nov 2026
  store.addQaRecord({ ts, question: 'best postgres hosting', answerSummary: 'Neon', claims: [], sources: [] });
  const agent = makeAgent({ store, searcher: fakeSearcher(store), llm: fakeLlm() });
  const { records, when } = agent.handleRecall('what did I ask you on 3 November about hosting?');
  assert.equal(when.dayStart, new Date(2026, 10, 3).getTime());
  assert.equal(records.length, 1);
  assert.equal(records[0].answerSummary, 'Neon');
});

test('RECHECK bypasses the cache (fresh searches) and cites fresh evidence', async () => {
  const store = tmpStore();
  const searcher = fakeSearcher(store);
  store.addQaRecord({
    ts: Date.now() - 86400000,
    question: 'best postgres hosting',
    answerSummary: 'Neon free tier is best',
    claims: ['Neon has a free tier'],
    sources: [],
  });
  const agent = makeAgent({ store, searcher, llm: fakeLlm() });
  const res = await agent.handleRecheck('is your answer about postgres hosting still correct today?', () => {});
  assert.equal(res.rechecked, true);
  assert.ok(searcher.searches.length >= 1);
  assert.ok(searcher.searches.every((s) => s.fresh)); // the whole point: live web, no cache
});

test('RECHECK with no memory says so instead of inventing', async () => {
  const store = tmpStore();
  const agent = makeAgent({ store, searcher: fakeSearcher(store), llm: fakeLlm() });
  const res = await agent.handleRecheck('has the CRM pricing changed since Monday?', () => {});
  assert.equal(res.rechecked, false);
  assert.match(res.answer, /don't have an earlier answer/);
});
