// Persistent memory: a JSON document store on disk.
//
// Two kinds of memory:
//  1. messages  - the raw conversation, every turn timestamped.
//  2. qaRecords - one record per answered user question: the question, a short
//     answer summary, the factual claims the answer depended on, the sources
//     used, and when it was answered. Recheck questions ("is that still true?")
//     re-verify these claims against the live web instead of starting over.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'store.json');
    this.state = { messages: [], qaRecords: [], searchCache: {} };
    if (fs.existsSync(this.file)) {
      try {
        this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
      } catch { /* start clean on a corrupt file rather than crash */ }
    }
    this._writeTimer = null;
    this.cacheTtlMs = 6 * 60 * 60 * 1000;
  }

  _save() {
    // Debounced write so a burst of turns costs one disk write.
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => {
      const temporary = this.file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2));
      fs.renameSync(temporary, this.file);
    }, 50);
  }

  addMessage(role, content, ts = Date.now()) {
    const msg = { role, content, ts };
    this.state.messages.push(msg);
    this._save();
    return msg;
  }

  addQaRecord(rec) {
    this.state.qaRecords.push(rec);
    this._save();
    return rec;
  }

  recentMessages(limit = 12) {
    return this.state.messages.slice(-limit);
  }

  // Find past Q&A records, optionally constrained to a day, ranked by keyword overlap.
  findQaRecords({ keywords = [], dayStart = null, dayEnd = null, limit = 5 } = {}) {
    const kw = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 2);
    const scored = [];
    for (const rec of this.state.qaRecords) {
      if (dayStart != null && (rec.ts < dayStart || rec.ts >= dayEnd)) continue;
      const hay = `${rec.question} ${rec.answerSummary}`.toLowerCase();
      let score = 0;
      for (const k of kw) if (hay.includes(k)) score += 1;
      if (kw.length === 0) score = 0.5;
      if (score > 0) scored.push([score, rec]);
    }
    scored.sort((a, b) => b[0] - a[0] || b[1].ts - a[1].ts);
    return scored.slice(0, limit).map(([, r]) => r);
  }

  cacheGet(key) {
    const hit = this.state.searchCache[key];
    if (!hit) return null;
    if (Date.now() - hit.ts > this.cacheTtlMs) return null;
    return hit.results;
  }

  cacheSet(key, results, ttlMs) {
    this.cacheTtlMs = ttlMs;
    this.state.searchCache[key] = { ts: Date.now(), results };
    // Bound the cache so the file stays small.
    const keys = Object.keys(this.state.searchCache);
    if (keys.length > 500) {
      keys.sort((a, b) => this.state.searchCache[a].ts - this.state.searchCache[b].ts);
      for (const k of keys.slice(0, keys.length - 500)) delete this.state.searchCache[k];
    }
    this._save();
  }
}
