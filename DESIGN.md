# DESIGN

A chat agent with one tool (web search) that answers fast, gets things right,
and remembers what you asked and when.

## How it works

Every turn is routed into one of three shapes by the fast model
(`FRESH` / `RECALL` / `RECHECK`), because each wants a different pipeline and
mixing them is how agents get slow or wrong:

- **FRESH** (a new question): plan 1-3 search queries, run them **in parallel**,
  answer from the evidence with inline citations, streamed token-by-token. Then
  a cheap second pass extracts **memory**: a one-line summary plus the atomic
  *claims* the answer depends on ("HubSpot raised its Sales Hub price to $X"),
  stored with the sources and a timestamp.
- **RECALL** ("what did I ask on 3 November?"): pure memory lookup, no search.
  Date phrases are resolved by a small hand-written parser
  (`timeparse.js`, unit-tested) into an absolute day range - "3 November",
  "last Tuesday", "on Monday" all mean a specific day - and past Q&As are
  ranked by keyword overlap within that day.
- **RECHECK** ("is that still correct?", "has anything changed since?"): the
  interesting one. The old answer's *claims* are pulled from memory, each is
  re-searched against the **live web with the cache bypassed**, and the model
  diffs old claims against fresh evidence: holds / changed / can't confirm,
  per claim, then a one-line verdict. Memory is what makes this cheap: instead
  of redoing the whole research task, the agent re-verifies up to six short claims.

## Why this way

- **Memory is structured, not a transcript replay.** Storing claims (not just
  chat text) is what turns "is my answer still correct?" from an expensive
  redo into four targeted searches. The timestamp on every record is what
  makes "since then" computable.
- **Two models, one cheap.** Routing, query planning and claim extraction run
  on `FAST_MODEL`; only the user-facing answer uses the main model. Searches are parallel; real latency is not yet benchmarked.
- **Caching with an escape hatch.** Repeated searches can reuse results within six hours, but RECHECK always goes live - a cache that
  serves stale data on a "did it change?" question is worse than no cache.
- **Zero dependencies.** Plain Node (18.17+), built-in `http`, hand-rolled
  `.env` parsing, JSON-file persistence. `npm install` installs nothing and
  `npm run dev` starts immediately. For a single-agent tool, Express +
  an ORM + a vector DB would be machinery without payoff.

## Considered and rejected

- **Vector DB / embeddings for memory.** Overkill at conversation scale;
  keyword-overlap on structured records is inspectable, and has no
  extra infra. Would revisit at 10k+ records.
- **Keyword rules for intent routing.** Brittle - "has any of them changed
  pricing?" has no memory keyword. A one-line prompt on the fast model is
  more robust and nearly free.
- **A single generic ReAct loop** (model picks tools each turn). Simpler to
  write, but slower (extra model round-trips), harder to make rechecks
  rigorous, and harder to reason about. Explicit pipelines win on both speed
  and correctness here.
- **WebSocket.** SSE is one-directional and enough for token streaming.

## With another week

- Fetch and read full pages for the top results, not just snippets (a second
  read-only "fetch" capability, still under the one-search-tool spirit).
- Per-claim rechecks that search in the claim's own language/timezone and
  quote the exact conflicting line.
- Session memory compaction and a real DB once records grow.
- Evals: a fixed set of FRESH/RECALL/RECHECK questions with expected
  behaviour, run in CI against a mocked search layer.

## Current limits and verification

16 deterministic tests pass with mocked model/search responses; no real API-key
end-to-end evaluation has been run. This is a prototype, not a production service.
Memory is single-user, server-local time, keyword-based and limited to five matches;
ambiguous references and synonyms need a better retrieval layer. Search snippets
can omit decisive details, so an unconfirmed claim must stay unconfirmed.
