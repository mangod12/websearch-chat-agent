// The agent's one tool: web search. Two providers behind one interface,
// picked by whichever API key is set. Results are cached briefly because
// asking the same thing twice in a conversation should be instant; recheck
// questions always bypass the cache and hit the live web.
import crypto from 'node:crypto';
import { config } from './config.js';

function cacheKey(query) {
  return crypto.createHash('sha1').update(query.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex');
}

export function makeSearcher(store) {
  const provider = config.braveApiKey ? 'brave' : config.tavilyApiKey ? 'tavily' : null;

  async function search(query, { fresh = false, count = 6 } = {}) {
    const key = cacheKey(query);
    if (!fresh) {
      const hit = store.cacheGet(key);
      if (hit) return { query, results: hit, cached: true, provider };
    }
    let results;
    if (provider === 'brave') results = await brave(query, count);
    else if (provider === 'tavily') results = await tavily(query, count);
    else throw new Error('No search provider configured (set BRAVE_API_KEY or TAVILY_API_KEY)');
    store.cacheSet(key, results, config.searchCacheTtlMs);
    return { query, results, cached: false, provider };
  }

  return { search, provider };
}

async function brave(query, count) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
    headers: { accept: 'application/json', 'x-subscription-token': config.braveApiKey },
  });
  if (!res.ok) throw new Error(`Brave ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.web?.results || []).map((r) => ({
    title: r.title, url: r.url, snippet: r.description || '', age: r.age || null,
  }));
}

async function tavily(query, count) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: config.tavilyApiKey, query, max_results: count }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.results || []).map((r) => ({
    title: r.title, url: r.url, snippet: r.content || '', age: null,
  }));
}
