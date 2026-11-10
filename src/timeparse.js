// Turns phrases like "3 November", "last Tuesday", "on Monday" into absolute
// day ranges, resolved against "now". Memory questions are time questions, so
// this has to be exact, and it is unit-tested.
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const WEEKDAYS = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Returns { dayStart, dayEnd, label } or null when no date phrase is found.
export function resolveDatePhrase(text, now = Date.now()) {
  const t = text.toLowerCase();
  const todayStart = startOfDay(now);



  // "last Tuesday" / "on Tuesday": most recent past occurrence of that weekday.
  // Bare "on Monday" in a past-tense question means the Monday that just passed.
  const wd = t.match(/\b(?:last\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    const nowDay = new Date(todayStart).getDay();
    let delta = (nowDay - target + 7) % 7;
    if (delta === 0 || wd[0].startsWith('last')) delta = delta === 0 ? 7 : delta; // "last Monday" on a Monday = a week ago
    if (delta === 0) delta = 7; // referring to today by weekday name in a memory question means the previous one
    const ts = todayStart - delta * DAY;
    return range(ts, `last ${wd[1]}`);
  }

  // "3 November" / "November 3" / "3rd Nov" - nearest past occurrence (this or last year).
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  const md = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  const m = dm || md;
  if (m) {
    const day = Number(dm ? m[1] : m[2]);
    const month = MONTHS[dm ? m[2] : m[1]];
    const nowD = new Date(todayStart);
    let year = nowD.getFullYear();
    let candidate = new Date(year, month, day).getTime();
    if (candidate > todayStart) candidate = new Date(year - 1, month, day).getTime();
    return range(candidate, new Date(candidate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }));
  }

  if (/\byesterday\b/.test(t)) return range(todayStart - DAY, 'yesterday');
  if (/\btoday\b/.test(t)) return range(todayStart, 'today');
  return null;
}

function range(dayStart, label) {
  return { dayStart, dayEnd: dayStart + DAY, label };
}

// Words worth matching memory records on: content words minus time filler.
export function contentKeywords(text) {
  const stop = new Set(['what', 'did', 'ask', 'you', 'the', 'on', 'a', 'an', 'is', 'it', 'still',
    'correct', 'today', 'has', 'have', 'any', 'of', 'them', 'changed', 'change', 'since', 'then',
    'about', 'your', 'answer', 'last', 'we', 'i', 'me', 'my', 'and', 'or', 'to', 'in', 'for',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'yesterday',
    'november', 'october', 'december', 'january', 'february', 'march', 'april', 'june', 'july',
    'august', 'september', 'pricing', 'price']);
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w));
}
