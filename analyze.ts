import type { GfxType, Line, NumInfo, TimedWord, Word } from './types';

/* ------------------------------------------------------------------ */
/* Lexicons                                                            */
/* ------------------------------------------------------------------ */

const STOP = new Set(
  (
    'a an the and or but if so of to in on at by for with from as is are was were be been being am do does did done have has had having i me my we our you your he she it its they them their this that these those there here ' +
    'what which who whom whose when where why how not no yes can could would should will just very really also than then too about into over out up down off more most some any all each other such only own same ' +
    "don't doesn't didn't isn't aren't wasn't weren't won't can't couldn't wouldn't shouldn't i'm i've i'll i'd you're you've you'll you'd we're we've we'll they're they've it's that's there's what's let's " +
    'like get got going gonna thing things way lot much many even still well now actually basically literally maybe kind sort'
  ).split(' '),
);

const STRONG = new Set(
  (
    'never always stop wasting waste wasted mistake mistakes secret secrets free biggest best worst problem problems hours minutes days money time growth grow fast faster easy easily simple hard nobody everyone everything nothing impossible ' +
    'million billion thousand double triple truth wrong again zero lose losing lost win winning results profit revenue sales customers clients income save saving cost expensive cheap instantly automatically manually important key change ' +
    'trick hack system strategy process steps rule fail failing stuck broken scale launch quit start today only every must need worst fastest simplest powerful dangerous honest brutal ' +
    'attention focus risk lazy overnight guaranteed proven unlimited forever endless'
  ).split(' '),
);

const NUMW = new Set(
  'one two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion'.split(
    ' ',
  ),
);
const UNITS = new Set(
  'hours hour minutes minute seconds second days day weeks week months month years year percent dollars times x people customers clients steps ways mistakes users'.split(
    ' ',
  ),
);
const ORD = new Set(['first', 'firstly', 'second', 'secondly', 'third', 'thirdly', 'fourth', 'fifth', 'sixth']);
const CTA_RE =
  /^(follow|subscribe|comment|share|save|click|join|download|book|try|visit|tap|dm|send|like|check|grab|get|link|sign)$/;

const RULES: [GfxType, RegExp][] = [
  ['mistake', /^(mistakes?|errors?|myth|myths|wrong|avoid|stop|quit|never)$/],
  ['problem', /^(problems?|issues?|struggl\w*|stuck|pain|broken|risk|risky|danger\w*|warning|trouble|fail\w*|blocked|difficult|hard)$/],
  ['money', /^(money|cash|dollars?|revenue|profit|income|price|pay|paid|paying|salary|budget|costs?|sales|earn\w*|rich|afford|expensive|cheap|invest\w*)$/],
  ['time', /^(time|hours?|minutes?|days?|weeks?|months?|years?|deadline|schedule|late|clock|daily|slow|waiting|wait)$/],
  ['growth', /^(grow|growth|growing|increase\w*|scal(e|ing)|rise|rising|boost\w*|improv\w*|skyrocket\w*|double|triple|climb\w*)$/],
  ['decline', /^(drop\w*|decline\w*|decrease\w*|falling|losing|lose|lost|shrink\w*|plummet\w*)$/],
  ['repeat', /^(again|repeat\w*|loop|cycle|constantly|manually)$/],
  ['speed', /^(fast|faster|fastest|quick|quickly|instantly|instant|speed|immediately|rapid\w*|seconds|overnight)$/],
  ['process', /^(process|steps?|system|systems|workflow|pipeline|method|framework|strategy|plan|roadmap|routine|funnel)$/],
  ['solution', /^(solutions?|solve\w*|fix|fixed|answer|works|working|simple|easy|easily|success\w*|winning|win|results?|automate\w*|automatically|proven|correct|right)$/],
  ['choice', /^(choose|choice|choices|option|options|decide|decision|either|path|paths)$/],
  ['compare', /^(compare\w*|versus|vs|difference|between|before|after|instead)$/],
  ['data', /^(data|numbers|analytics|metrics?|stats|statistics|percentage|rates?|report|tracking|track|measure\w*|conversion\w*|traffic|views|followers|leads|customers|clients|audience|users)$/],
  ['app', /^(websites?|apps?|software|platform|tools?|dashboard|page|landing|online|site|ai|automation|tech|digital|internet|emails?|social|instagram|tiktok|youtube|linkedin|code)$/],
  ['focus', /^(important|key|focus|attention|critical|biggest|secret|truth|matters?|only|remember|essential|crucial|listen)$/],
  ['arrow', /^(below|link|bio|click)$/],
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
const display = (w: string) => w.replace(/[^\w%$€£'’-]/g, '').toUpperCase();

let uid = 0;
export const newId = () => `L${Date.now().toString(36)}${(uid++).toString(36)}`;

export function distribute(words: string[], s: number, e: number): TimedWord[] {
  if (!words.length) return [];
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const out: TimedWord[] = [];
  let t = s;
  words.forEach((w, i) => {
    const d = ((e - s) * weights[i]) / total;
    out.push({ w, s: t, e: t + d * 0.92 });
    t += d;
  });
  return out;
}

/** Group timed words into short caption lines (natural breaks). */
export function buildLines(words: TimedWord[]): Line[] {
  const lines: Line[] = [];
  let cur: TimedWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    const ws: Word[] = cur.map((x) => ({ w: x.w, s: x.s, e: Math.max(x.e, x.s + 0.08), key: false }));
    lines.push({
      id: newId(),
      start: ws[0].s,
      end: ws[ws.length - 1].e + 0.05,
      words: ws,
      gfx: 'none',
      gfxWord: 0,
      gfxLabel: '',
      primary: '',
      primaryWord: 0,
      zoom: 1,
      pan: 0,
      impact: false,
      wipe: false,
      num: null,
      step: false,
      stepLabel: '',
      cta: false,
      side: 0,
    });
    cur = [];
  };
  words.forEach((x, i) => {
    cur.push(x);
    const next = words[i + 1];
    const chars = cur.reduce((a, b) => a + b.w.length + 1, 0);
    const sentenceEnd = /[.!?]["')\]]*$/.test(x.w);
    const comma = /[,;:—-]$/.test(x.w);
    const gap = next ? next.s - x.e : 0;
    if (
      x.br ||
      sentenceEnd ||
      (comma && cur.length >= 5) ||
      cur.length >= 8 ||
      chars > 44 ||
      gap > 0.55
    ) {
      flush();
    }
  });
  flush();
  return lines;
}

/* ------------------------------------------------------------------ */
/* Per-word scoring                                                    */
/* ------------------------------------------------------------------ */

function scoreWord(w: string): number {
  const c = clean(w);
  if (!c) return 0;
  let s: number;
  if (/^[$€£]?\d/.test(w)) s = 4;
  else if (STRONG.has(c)) s = 3;
  else if (STOP.has(c)) return 0;
  else if (NUMW.has(c)) s = 1.5;
  else s = c.length >= 7 ? 1.5 : c.length >= 5 ? 1 : 0.5;
  if (w.length > 1 && /[A-Z]/.test(w) && w === w.toUpperCase() && !/\d/.test(w)) s += 1.5;
  if (/[.!?]$/.test(w)) s += 0.5;
  return s;
}

function findNumber(words: Word[]): NumInfo | null {
  for (let i = 0; i < words.length; i++) {
    const raw = words[i].w;
    const m = raw.match(/^([$€£]?)(\d[\d,]*(?:\.\d+)?)(%|k|m|x)?[.,!?;:]*$/i);
    if (m) {
      const num = parseFloat(m[2].replace(/,/g, ''));
      if (!isNaN(num)) {
        let suffix = m[3] ? m[3].toUpperCase() : '';
        let skip = 1;
        if (!suffix && clean(words[i + 1]?.w ?? '') === 'percent') {
          suffix = '%';
          skip = 2;
        }
        const isYear = num >= 1900 && num <= 2100 && !m[1] && !suffix && !m[2].includes(',');
        const decimals = m[2].includes('.') ? m[2].split('.')[1].length : 0;
        let label = words
          .slice(i + skip, i + skip + 3)
          .map((x) => display(x.w))
          .filter(Boolean)
          .join(' ');
        if (!label) {
          label = words
            .slice(Math.max(0, i - 2), i)
            .filter((x) => !STOP.has(clean(x.w)))
            .map((x) => display(x.w))
            .join(' ');
        }
        return {
          text: raw.replace(/[.,!?;:]+$/, ''),
          value: isYear ? null : num,
          decimals,
          prefix: m[1],
          suffix,
          wordIdx: i,
          label,
        };
      }
    }
    // spoken number words directly followed by a unit
    if (NUMW.has(clean(raw))) {
      let j = i;
      while (j + 1 < words.length && NUMW.has(clean(words[j + 1].w))) j++;
      const unit = clean(words[j + 1]?.w ?? '');
      if (UNITS.has(unit)) {
        const label = words
          .slice(j + 1, j + 4)
          .map((x) => display(x.w))
          .filter(Boolean)
          .join(' ');
        return {
          text: words
            .slice(i, j + 1)
            .map((x) => display(x.w))
            .join(' '),
          value: null,
          decimals: 0,
          prefix: '',
          suffix: '',
          wordIdx: i,
          label,
        };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Auto-director                                                       */
/* ------------------------------------------------------------------ */

export function analyzeAll(input: Line[], intensity: 0 | 1 | 2): Line[] {
  const N = [1, 2, 3][intensity];
  const zoomIn = [1.08, 1.1, 1.13][intensity];
  const n = input.length;
  let prevPrimary = false;
  let flat = 0;
  let sign = 1;
  let lastGfxStart = -99;

  return input.map((L, i) => {
    const words: Word[] = L.words.map((w) => ({ ...w, key: false }));
    const scores = words.map((w) => scoreWord(w.w));
    const idxs = scores
      .map((s, k) => ({ s, k }))
      .filter((x) => x.s >= 2)
      .sort((a, b) => b.s - a.s || a.k - b.k)
      .slice(0, N);
    const hook = i === 0;
    const last = i === n - 1;

    let best = idxs.length ? idxs[0].k : -1;
    let bestScore = idxs.length ? idxs[0].s : 0;
    if (best < 0 && (hook || last)) {
      const all = scores.map((s, k) => ({ s, k })).sort((a, b) => b.s - a.s || a.k - b.k);
      if (all.length && all[0].s >= 1) {
        best = all[0].k;
        bestScore = all[0].s;
        idxs.push(all[0]);
      }
    }
    idxs.forEach((x) => (words[x.k].key = true));

    const num = findNumber(words);
    if (num) {
      words[num.wordIdx].key = true;
    }

    // step detection
    let step = false;
    let stepLabel = '';
    const ordAt = ORD.has(clean(words[0]?.w ?? '')) ? 0 : ['number', 'step', 'and', 'then'].includes(clean(words[0]?.w ?? '')) && ORD.has(clean(words[1]?.w ?? '')) ? 1 : -1;
    if (ordAt >= 0) {
      step = true;
      const rest = words.slice(ordAt + 1).filter((w) => {
        const c = clean(w.w);
        return c && !STOP.has(c) && !['step', 'one', 'thing', 'point'].includes(c);
      });
      stepLabel = (rest.length ? rest : words.slice(ordAt + 1)).slice(0, 3).map((w) => display(w.w)).filter(Boolean).join(' ');
    }

    // CTA detection (last two lines only)
    let cta = false;
    let ctaIdx = 0;
    if (i >= n - 2) {
      const k = words.findIndex((w) => CTA_RE.test(clean(w.w)));
      if (k >= 0 && (i === n - 1 || k <= 1)) {
        cta = true;
        ctaIdx = k;
      }
    }

    // primary phrase
    let wantPrimary = hook || cta || bestScore >= 3 || (intensity === 2 && bestScore >= 2);
    if (step && bestScore < 4 && !hook) wantPrimary = false;
    if (num) wantPrimary = false;
    if (wantPrimary && prevPrimary && !(hook || cta || bestScore >= 4)) wantPrimary = false;
    if (wantPrimary && best < 0 && !cta) wantPrimary = false;

    let primary = '';
    let primaryWord = 0;
    if (cta) {
      primaryWord = ctaIdx;
      primary = words
        .slice(ctaIdx, ctaIdx + 3)
        .map((w) => display(w.w))
        .filter(Boolean)
        .join(' ');
    } else if (wantPrimary) {
      let l = best;
      let r = best;
      while (r - l < 2) {
        if (r + 1 < words.length && scores[r + 1] >= 1.5 && !STOP.has(clean(words[r + 1].w)) && r + 1 - l < 3) r++;
        else if (l - 1 >= 0 && scores[l - 1] >= 1.5 && !STOP.has(clean(words[l - 1].w))) l--;
        else break;
      }
      primaryWord = l;
      primary = words
        .slice(l, r + 1)
        .map((w) => display(w.w))
        .filter(Boolean)
        .join(' ');
      for (let k = l; k <= r; k++) words[k].key = true;
    }
    if (!primary) wantPrimary = false;

    // graphic (one per line, spaced out, tied to the trigger word)
    let gfx: GfxType = 'none';
    let gfxWord = 0;
    let gfxLabel = '';
    if (!step && !num && !cta) {
      for (let k = 0; k < words.length && gfx === 'none'; k++) {
        const c = clean(words[k].w);
        for (const [type, re] of RULES) {
          if (re.test(c)) {
            gfx = type;
            gfxWord = k;
            gfxLabel = display(words[k].w);
            break;
          }
        }
      }
      if (gfx === 'none' && /\?["')\]]*$/.test(words[words.length - 1]?.w ?? '')) {
        gfx = 'question';
        gfxWord = 0;
        gfxLabel = words
          .slice(0, 2)
          .map((w) => display(w.w))
          .join(' ');
      }
      if (gfx !== 'none' && words[gfxWord].s - lastGfxStart < 3.2) gfx = 'none';
      if (gfx !== 'none') lastGfxStart = words[gfxWord].s;
    }

    // camera
    let zoom = 1;
    if (hook) zoom = 1.12;
    else if (cta) zoom = 1;
    else if (wantPrimary || num) zoom = zoomIn;
    if (zoom === 1) {
      flat++;
      if (flat >= 3 && !cta && i < n - 1) {
        zoom = 1.05;
        flat = 0;
      }
    } else flat = 0;
    let pan = 0;
    if (zoom > 1) {
      sign = -sign;
      pan = sign;
    }
    prevPrimary = wantPrimary || !!num;
    const impact = hook || !!num || bestScore >= 5;
    const wipe =
      (step || cta || (i > 0 && L.start - input[i - 1].end > 1.0)) && !hook;

    return {
      ...L,
      words,
      gfx,
      gfxWord,
      gfxLabel,
      primary,
      primaryWord,
      zoom,
      pan,
      impact,
      wipe,
      num,
      step,
      stepLabel,
      cta,
      side: (i % 2) as 0 | 1,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Timeline derivation                                                 */
/* ------------------------------------------------------------------ */

export type Timeline = {
  stepGroup: number[][]; // for each line index (if step): indices of steps up to & including it
  stepEnd: number[]; // time until which the step panel stays visible
  events: { t: number; kind: 'pop' | 'tick' | 'whoosh' | 'impact' | 'swish' }[];
};

export const primaryWin = (L: Line): [number, number] => {
  const s = Math.max(L.start - 0.05, (L.words[L.primaryWord]?.s ?? L.start) - 0.05);
  const e = L.cta ? L.end + 1.6 : Math.max(s + 1.0, Math.min(s + 1.5, L.end + 0.4));
  return [s, e];
};
export const gfxWin = (L: Line): [number, number] => {
  const s = (L.words[L.gfxWord]?.s ?? L.start) - 0.05;
  return [s, s + Math.max(1.8, Math.min(2.6, L.end - s + 0.6))];
};
export const numWin = (L: Line): [number, number] => {
  const s = (L.words[L.num?.wordIdx ?? 0]?.s ?? L.start) - 0.05;
  return [s, s + Math.max(1.9, Math.min(2.6, L.end - s + 0.8))];
};

export function deriveTimeline(lines: Line[]): Timeline {
  const stepGroup: number[][] = lines.map(() => []);
  const stepEnd: number[] = lines.map(() => 0);
  let group: number[] = [];
  let lastStepT = -999;
  lines.forEach((L, i) => {
    if (!L.step) return;
    const isFirst = /^(first|firstly)/i.test(L.words[0]?.w.replace(/[^a-z]/gi, '') ?? '');
    if (isFirst || L.start - lastStepT > 30) group = [];
    group.push(i);
    lastStepT = L.start;
    stepGroup[i] = [...group];
  });
  lines.forEach((L, i) => {
    if (!L.step) return;
    let nextStart = L.end + 2.6;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].step) {
        nextStart = lines[j].start;
        break;
      }
    }
    stepEnd[i] = nextStart;
  });

  const events: Timeline['events'] = [];
  lines.forEach((L, i) => {
    if (L.wipe || i === 0) events.push({ t: Math.max(0.02, L.start - 0.1), kind: 'whoosh' });
    else if (i > 0 && L.zoom > lines[i - 1].zoom + 0.04) events.push({ t: L.start, kind: 'swish' });
    if (L.num) events.push({ t: numWin(L)[0] + 0.55, kind: 'impact' });
    else if (L.primary) events.push({ t: primaryWin(L)[0], kind: L.impact || L.cta ? 'impact' : 'pop' });
    if (L.gfx !== 'none') events.push({ t: gfxWin(L)[0] + 0.05, kind: 'tick' });
    if (L.step) events.push({ t: L.start, kind: 'tick' });
  });
  events.sort((a, b) => a.t - b.t);
  return { stepGroup, stepEnd, events };
}
