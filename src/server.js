// HTTP layer: a tiny static chat page plus one SSE endpoint.
// Zero web-framework dependencies - Node's built-in http is enough,
// and "npm install && npm run dev" staying instant is a feature.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertConfig } from './config.js';
import { Store } from './store.js';
import { makeSearcher } from './search.js';
import { makeAgent } from './agent.js';

assertConfig();
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const store = new Store(config.dataDir);
const searcher = makeSearcher(store);
const agent = makeAgent({ store, searcher });

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(path.join(root, 'public', 'index.html')));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    sendJson(res, 200, { messages: store.recentMessages(100) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let message;
      try {
        message = JSON.parse(body || '{}').message;
      } catch { /* fall through */ }
      if (typeof message !== 'string' || !message.trim() || message.length > 20000) return sendJson(res, 400, { error: 'message required' });

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      try {
        const history = store.recentMessages(12);
        store.addMessage('user', message);
        const intent = await agent.route(message, history);
        emit('intent', { intent });

        if (intent === 'RECALL') {
          const { records, when } = agent.handleRecall(message);
          let msg;
          if (records.length === 0) {
            msg = when
              ? `I don't have anything you asked me on ${when.label}. Want me to look something up fresh?`
              : "I don't have a memory of that. Can you give me a bit more - a keyword, or roughly when?";
          } else {
            msg = records.map((r) => {
              const d = new Date(r.ts).toLocaleString('en-GB', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              });
              return `On ${d} you asked: "${r.question}"\nMy answer was: ${r.answerSummary}`;
            }).join('\n\n');
          }
          emit('token', { token: msg });
          emit('done', { answer: msg, sources: [] });
          store.addMessage('assistant', msg);
          return res.end();
        }

        const onToken = (token) => emit('token', { token });
        const result = intent === 'RECHECK'
          ? await agent.handleRecheck(message, onToken)
          : await agent.handleFresh(message, onToken);
        store.addMessage('assistant', result.answer);
        emit('done', { answer: result.answer, sources: result.sources || [] });
        res.end();
      } catch (err) {
        emit('error', { error: String(err.message || err) });
        res.end();
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`chat agent ready at http://localhost:${config.port} (search: ${searcher.provider || 'NONE - set a key'})`);
});
