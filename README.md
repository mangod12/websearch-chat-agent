# chat agent

A chat agent with one tool: **web search**. It answers fast, cites its sources,
and remembers what you asked and when - so you can ask things like:

- "What did I ask you on 3 November?"
- "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"
- "Is your answer still correct today?"

## Run it

```bash
npm install
cp .env.example .env   # fill in your keys
npm run dev
```

Open http://localhost:3000 and chat.

Requires Node 18.17+. No build step, no framework dependencies - `npm install`
installs nothing.

## Keys (all listed in `.env.example`)

- `OPENAI_API_KEY` - any OpenAI-compatible chat API (override `OPENAI_BASE_URL`
  and `MODEL` for other providers).
- One search key: `BRAVE_API_KEY` or `TAVILY_API_KEY`.

## Test

```bash
npm test
```

## How it works

See [DESIGN.md](DESIGN.md).
