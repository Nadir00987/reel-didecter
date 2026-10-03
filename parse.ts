import type { Line, TimedWord } from './types';
import { buildLines, distribute } from './analyze';

const TS = /^\s*\[?\(?(\d{1,2}:)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\]?\)?\s*[-–—:]?\s*(.*)$/;

function toSec(h: string | undefined, m: string, s: string, ms?: string) {
  return (h ? parseInt(h) * 3600 : 0) + parseInt(m) * 60 + parseInt(s) + (ms ? parseInt(ms.padEnd(3, '0')) / 1000 : 0);
}

export const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

type Seg = { s: number | null; text: string };

/** Parse SRT, "mm:ss text" lines, or plain text into timed caption lines. */
export function parseTranscript(raw: string, duration: number): Line[] {
  const text = raw.replace(/\r/g, '').trim();
  if (!text) return [];
  const segs: Seg[] = [];
  let explicitEnds: (number | null)[] = [];

  if (text.includes('-->')) {
    text.split(/\n\s*\n/).forEach((block) => {
      const rows = block.split('\n').filter(Boolean);
      const ti = rows.findIndex((r) => r.includes('-->'));
      if (ti < 0) return;
      const m = rows[ti].match(
        /(?:(\d+):)?(\d+):(\d+)[.,](\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)[.,](\d+)/,
      );
      if (!m) return;
      segs.push({ s: toSec(m[1], m[2], m[3], m[4]), text: rows.slice(ti + 1).join(' ') });
      explicitEnds.push(toSec(m[5], m[6], m[7], m[8]));
    });
  } else {
    const rows = text.split('\n').map((r) => r.trim()).filter(Boolean);
    const parsed = rows.map((r) => {
      const m = r.match(TS);
      return m && m[5] ? { s: toSec(m[1], m[2], m[3], m[4]), text: m[5] } : { s: null, text: r };
    });
    const allTimed = parsed.every((p) => p.s !== null);
    parsed.forEach((p) => segs.push({ s: allTimed ? p.s : null, text: p.text }));
    explicitEnds = segs.map(() => null);
  }

  const words: TimedWord[] = [];
  const timed = segs.every((s) => s.s !== null);
  if (timed) {
    segs.forEach((seg, i) => {
      const toks = seg.text.split(/\s+/).filter(Boolean);
      if (!toks.length) return;
      const s = seg.s as number;
      const nextS = segs[i + 1]?.s ?? null;
      let e = explicitEnds[i] ?? (nextS !== null ? nextS - 0.08 : s + toks.length * 0.36);
      if (nextS !== null && e > nextS) e = nextS - 0.05;
      if (e <= s + 0.2) e = s + toks.length * 0.3;
      const tw = distribute(toks, s, e);
      tw[tw.length - 1].br = true;
      words.push(...tw);
    });
  } else {
    const totalWords = segs.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
    const dur = duration > 1 ? duration : totalWords * 0.38 + 1;
    const start = 0.25;
    const span = Math.max(1, dur - start - 0.6);
    let t = start;
    segs.forEach((seg) => {
      const toks = seg.text.split(/\s+/).filter(Boolean);
      if (!toks.length) return;
      const d = (span * toks.length) / totalWords;
      const tw = distribute(toks, t, t + d);
      tw[tw.length - 1].br = true;
      words.push(...tw);
      t += d;
    });
  }
  return buildLines(words);
}

export function toSrt(lines: Line[]): string {
  const f = (t: number) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    const p = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
  };
  return lines
    .map((L, i) => `${i + 1}\n${f(L.start)} --> ${f(L.end)}\n${L.words.map((w) => w.w).join(' ')}\n`)
    .join('\n');
}

export const SAMPLE_SCRIPT = `0:00 Stop wasting hours doing this manually.
0:02.6 Most teams lose 20 hours every week on repetitive tasks.
0:06.4 First, map your process.
0:08.6 Second, automate the boring steps.
0:11.2 Third, track the results.
0:13.6 That one change can double your output.
0:16.4 Why does this work?
0:18 Because your time belongs to the work that matters.
0:21.2 Follow for more simple systems.`;
