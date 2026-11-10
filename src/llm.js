// Thin OpenAI-compatible chat client. No SDK: one fetch, a timeout, one retry.
import { config } from './config.js';

export async function chat({ messages, model = config.model, temperature = 0.2, stream = false, onToken = null }) {
  const body = { model, messages, temperature, stream };
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openaiApiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
      if (!stream) {
        const json = await res.json();
        return json.choices[0].message.content;
      }
      return await readStream(res, onToken);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function readStream(res, onToken) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) { full += delta; onToken?.(delta); }
      } catch { /* partial JSON line, ignore */ }
    }
  }
  return full;
}

// Small structured call: asks the fast model for JSON and parses it leniently.
export async function chatJson({ messages, model = config.fastModel }) {
  const out = await chat({ messages, model, temperature: 0 });
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('model did not return JSON');
  return JSON.parse(m[0]);
}
