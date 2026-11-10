// Config: loads .env by hand (zero-dependency) and exports settings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadDotenv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadDotenv();

export const config = {
  port: Number(process.env.PORT || 3000),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  model: process.env.MODEL || 'gpt-4o-mini',
  fastModel: process.env.FAST_MODEL || process.env.MODEL || 'gpt-4o-mini',
  braveApiKey: process.env.BRAVE_API_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  dataDir: path.join(root, 'data'),
  // Search results are cached this long. Short enough that "has anything changed"
  // questions still hit the live web (rechecks bypass the cache entirely).
  searchCacheTtlMs: 6 * 60 * 60 * 1000,
};

export function assertConfig() {
  const missing = [];
  if (!config.openaiApiKey) missing.push('OPENAI_API_KEY');
  if (!config.braveApiKey && !config.tavilyApiKey) missing.push('BRAVE_API_KEY or TAVILY_API_KEY');
  if (missing.length) {
    console.error(`Missing required environment: ${missing.join(', ')}. See .env.example.`);
    process.exit(1);
  }
}
