import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Line, Settings } from './lib/types';
import { analyzeAll, buildLines, deriveTimeline, distribute } from './lib/analyze';
import { SAMPLE_SCRIPT, fmt, parseTranscript, toSrt } from './lib/parse';
import { renderFrame, H, W } from './lib/render';
import { Sfx } from './lib/sfx';
import { transcribe } from './lib/asr';
import LineCard from './components/LineCard';

const ACCENTS = [
  { name: 'Lime', v: '#C8FF2E' },
  { name: 'Electric blue', v: '#2F6BFF' },
  { name: 'Orange', v: '#FF6A1A' },
  { name: 'Red', v: '#FF3B3B' },
  { name: 'Yellow', v: '#FFD60A' },
];

const PREVIEW_SCALE = 0.6;
type Tab = 'source' | 'script' | 'timeline' | 'style';

const sfx = new Sfx();

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function App() {
  const [lines, setLines] = useState<Line[]>(() => analyzeAll(parseTranscript(SAMPLE_SCRIPT, 0), 1));
  const [settings, setSettings] = useState<Settings>({
    accent: ACCENTS[0].v,
    faceTop: 0.18,
    faceBottom: 0.5,
    sfx: true,
    cutDead: true,
    captions: true,
    intensity: 1,
    showGuard: false,
  });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [vdur, setVdur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [tab, setTab] = useState<Tab>('source');
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [model, setModel] = useState('Xenova/whisper-tiny.en');
  const [asr, setAsr] = useState<{ busy: boolean; msg: string; pct: number; err: string }>({
    busy: false,
    msg: '',
    pct: 0,
    err: '',
  });
  const [exp, setExp] = useState<{ busy: boolean; pct: number; done: string }>({ busy: false, pct: 0, done: '' });

  const hasVideo = !!videoUrl;
  const tl = useMemo(() => deriveTimeline(lines), [lines]);
  const duration = hasVideo ? vdur : lines.length ? lines[lines.length - 1].end + 1.5 : 8;
  const last = lines[lines.length - 1];
  const endT = lines.length ? Math.min(duration || 1e9, last.end + (last.cta ? 1.7 : 0.9)) : duration;
  const startT = settings.cutDead && lines.length ? Math.max(0, lines[0].start - 0.15) : 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const R = useRef({ lines, tl, settings, hasVideo, endT, startT });
  R.current = { lines, tl, settings, hasVideo, endT, startT };
  const playingRef = useRef(false);
  const vt = useRef(0);
  const lastPerf = useRef(0);
  const lastT = useRef(-1);
  const lastJump = useRef(0);
  const lastUi = useRef(0);
  const exportingRef = useRef(false);
  const expRef = useRef<{ rec: MediaRecorder; mime: string; startT: number } | null>(null);

  /* ----------------------------- transport ----------------------------- */

  const setT = useCallback((x: number) => {
    const v = videoRef.current;
    if (R.current.hasVideo && v) v.currentTime = x;
    else vt.current = x;
    lastT.current = x;
    setTime(x);
  }, []);

  const pausePlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    videoRef.current?.pause();
  }, []);

  const finishPlayback = useCallback(() => {
    pausePlayback();
    const e = expRef.current;
    if (e) setTimeout(() => e.rec.state !== 'inactive' && e.rec.stop(), 500);
  }, [pausePlayback]);

  const startPlayback = useCallback(() => {
    sfx.init();
    const v = videoRef.current;
    if (R.current.hasVideo && v) {
      sfx.hook(v);
      void v.play();
    } else lastPerf.current = performance.now();
    playingRef.current = true;
    setPlaying(true);
  }, []);

  const togglePlay = () => {
    if (playingRef.current) return pausePlayback();
    const cur = R.current.hasVideo && videoRef.current ? videoRef.current.currentTime : vt.current;
    if (cur >= R.current.endT - 0.05 || cur < R.current.startT - 0.01) setT(R.current.startT);
    startPlayback();
  };

  // render / playback loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = canvasRef.current;
      if (!c) return;
      const r = R.current;
      const v = videoRef.current;
      let t: number;
      if (r.hasVideo && v) t = v.currentTime;
      else {
        if (playingRef.current) {
          const n = performance.now();
          vt.current += (n - lastPerf.current) / 1000;
          lastPerf.current = n;
        }
        t = vt.current;
      }

      if (playingRef.current) {
        // dead-air removal: skip silent gaps between lines
        if (r.settings.cutDead && r.lines.length && performance.now() - lastJump.current > 250) {
          const j = r.lines.findIndex((L) => L.start > t);
          let target: number | null = null;
          if (j === 0) target = r.lines[0].start - t > 0.5 ? r.lines[0].start - 0.15 : null;
          else if (j > 0) {
            const gap = r.lines[j].start - r.lines[j - 1].end;
            if (gap > 0.7 && t > r.lines[j - 1].end + 0.25 && r.lines[j].start - t > 0.2) target = r.lines[j].start - 0.15;
          }
          if (target !== null) {
            lastJump.current = performance.now();
            if (r.hasVideo && v) v.currentTime = target;
            else vt.current = target;
            t = target;
            lastT.current = target;
          }
        }
        if (t >= r.endT) finishPlayback();
        // synchronized sound design
        if (r.settings.sfx && sfx.ctx && t - lastT.current < 0.4 && t > lastT.current) {
          for (const ev of r.tl.events) {
            if (ev.t > lastT.current && ev.t <= t) sfx.play(ev.kind);
            else if (ev.t > t) break;
          }
        }
      }
      lastT.current = t;

      const sc = exportingRef.current ? 1 : PREVIEW_SCALE;
      const cw = Math.round(W * sc);
      if (c.width !== cw) {
        c.width = cw;
        c.height = Math.round(H * sc);
      }
      const ctx = c.getContext('2d');
      if (ctx) {
        renderFrame(
          ctx,
          {
            video: r.hasVideo ? v : null,
            lines: r.lines,
            tl: r.tl,
            settings: r.settings,
            guard: r.settings.showGuard && !exportingRef.current,
          },
          t,
          sc,
        );
      }

      const now = performance.now();
      if (now - lastUi.current > 90) {
        lastUi.current = now;
        setTime(t);
        if (exportingRef.current && expRef.current) {
          const s0 = expRef.current.startT;
          setExp((e) => ({ ...e, pct: clamp01((t - s0) / Math.max(0.1, r.endT - s0)) }));
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finishPlayback]);

  useEffect(() => {
    void document.fonts?.load('900 100px Inter');
    void document.fonts?.load('800 50px Inter');
    void document.fonts?.load('700 50px Inter');
    void document.fonts?.load('700 20px "JetBrains Mono"');
  }, []);

  /* ------------------------------ source ------------------------------- */

  const onVideo = (f: File | null) => {
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    pausePlayback();
    setVideoFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setLines([]);
    setTime(0);
    lastT.current = -1;
    setAsr({ busy: false, msg: '', pct: 0, err: '' });
  };

  const applyLines = (ls: Line[], intensity = settings.intensity) => {
    const out = analyzeAll(ls, intensity);
    setLines(out);
    setTab('timeline');
    setT(out.length ? Math.max(0, out[0].start - 0.15) : 0);
  };

  const runAsr = async () => {
    if (!videoFile) return;
    setAsr({ busy: true, msg: 'Starting…', pct: 1, err: '' });
    try {
      const words = await transcribe(videoFile, model, (msg, pct) => setAsr({ busy: true, msg, pct, err: '' }));
      if (!words.length) throw new Error('No speech was detected in this file.');
      applyLines(buildLines(words));
      setAsr({ busy: false, msg: 'Done', pct: 100, err: '' });
    } catch (e) {
      setAsr({
        busy: false,
        msg: '',
        pct: 0,
        err:
          (e as Error).message +
          ' — if the model could not load (offline / blocked CDN), paste your transcript in the Script tab instead.',
      });
    }
  };

  const buildFromScript = () => {
    const ls = parseTranscript(script, hasVideo ? vdur : 0);
    if (!ls.length) return;
    applyLines(ls);
  };

  /* ------------------------------ editing ------------------------------ */

  const patchLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((L) => (L.id === id ? { ...L, ...patch } : L)));

  const retext = (id: string, text: string) => {
    const toks = text.split(/\s+/).filter(Boolean);
    setLines((ls) => {
      const i = ls.findIndex((L) => L.id === id);
      if (i < 0) return ls;
      const L = ls[i];
      const tw = distribute(toks, L.start, Math.max(L.start + 0.3, L.end - 0.05));
      const nl: Line = { ...L, words: tw.map((x) => ({ w: x.w, s: x.s, e: x.e, key: false })) };
      const copy = ls.map((x, k) => (k === i ? nl : x));
      const res = analyzeAll(copy, R.current.settings.intensity);
      return copy.map((x, k) => (k === i ? { ...res[k], zoom: res[k].zoom } : x));
    });
  };

  const toggleKey = (id: string, wi: number) =>
    setLines((ls) =>
      ls.map((L) =>
        L.id === id ? { ...L, words: L.words.map((w, k) => (k === wi ? { ...w, key: !w.key } : w)) } : L,
      ),
    );

  const deleteLine = (id: string) => setLines((ls) => ls.filter((L) => L.id !== id));

  const upd = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }));

  const setIntensity = (n: 0 | 1 | 2) => {
    upd({ intensity: n });
    if (lines.length) setLines((ls) => analyzeAll(ls, n));
  };

  /* ------------------------------ export ------------------------------- */

  const startExport = async () => {
    if (expRef.current || !canvasRef.current) return;
    const c = canvasRef.current;
    const v = videoRef.current;
    sfx.init();
    if (R.current.hasVideo && v) sfx.hook(v);
    pausePlayback();
    sfx.monitor.gain.value = 0;
    exportingRef.current = true;
    setExp({ busy: true, pct: 0, done: '' });
    await new Promise((r) => setTimeout(r, 120));

    const s0 = R.current.startT;
    if (R.current.hasVideo && v) {
      await new Promise<void>((res) => {
        const done = () => {
          v.removeEventListener('seeked', done);
          res();
        };
        v.addEventListener('seeked', done);
        v.currentTime = s0;
        setTimeout(done, 1500);
      });
    } else vt.current = s0;
    lastT.current = s0 - 0.001;

    const stream = c.captureStream(30);
    sfx.rec.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const mimes = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const ext = (rec.mimeType || mime).includes('mp4') ? 'mp4' : 'webm';
      const name = `reel-edit-1080x1920.${ext}`;
      download(name, new Blob(chunks, { type: rec.mimeType || mime }));
      sfx.monitor.gain.value = 1;
      exportingRef.current = false;
      expRef.current = null;
      setExp({ busy: false, pct: 1, done: name });
    };
    expRef.current = { rec, mime, startT: s0 };
    rec.start(500);
    lastPerf.current = performance.now();
    startPlayback();
  };

  const cancelExport = () => {
    const e = expRef.current;
    pausePlayback();
    if (e && e.rec.state !== 'inactive') e.rec.stop();
  };

  /* -------------------------------- UI --------------------------------- */

  const accent = settings.accent;
  const activeIdx = lines.findIndex((L) => time >= L.start - 0.05 && time <= L.end + 0.1);
  const stats = {
    lines: lines.length,
    callouts: lines.filter((L) => L.primary).length,
    numbers: lines.filter((L) => L.num).length,
    graphics: lines.filter((L) => L.gfx !== 'none').length,
    steps: lines.filter((L) => L.step).length,
    zooms: lines.filter((L) => L.zoom > 1.02).length,
    cta: lines.some((L) => L.cta),
    cut: lines.reduce((a, L, i) => (i > 0 ? a + Math.max(0, L.start - lines[i - 1].end - 0.3) : a), 0),
  };

  const tabs: [Tab, string][] = [
    ['source', '1 · Source'],
    ['script', '2 · Script'],
    ['timeline', '3 · Timeline'],
    ['style', '4 · Style & export'],
  ];

  return (
    <div className="min-h-screen bg-[#08090b] text-zinc-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-black text-black" style={{ background: accent }}>
          R
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">Reel Director</div>
          <div className="text-[11px] text-zinc-500">Speech-driven motion design for talking-head video · 9:16 · 1080×1920 · 30 fps</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {exp.busy ? (
            <button onClick={cancelExport} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5">
              Stop &amp; save ({Math.round(exp.pct * 100)}%)
            </button>
          ) : (
            <button
              onClick={startExport}
              disabled={!lines.length}
              className="rounded-lg px-4 py-2 text-xs font-bold text-black transition-opacity disabled:opacity-30"
              style={{ background: accent }}
            >
              Render &amp; download
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-6 p-5 lg:grid-cols-[auto_1fr]">
        {/* ------------------------- preview column ------------------------- */}
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-3 lg:mx-0">
          <div
            className="relative overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-2xl shadow-black/60"
            style={{ height: 'min(76vh, 760px)', aspectRatio: '9 / 16' }}
          >
            <canvas ref={canvasRef} className="h-full w-full" />
            <video
              ref={videoRef}
              src={videoUrl ?? undefined}
              playsInline
              preload="auto"
              className="pointer-events-none absolute h-px w-px opacity-0"
              onLoadedMetadata={(e) => {
                const d = (e.target as HTMLVideoElement).duration;
                setVdur(isFinite(d) ? d : 0);
              }}
              onEnded={finishPlayback}
            />
            {exp.busy && (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center font-mono text-[11px] text-zinc-200">
                Rendering in real time — keep this tab open · {Math.round(exp.pct * 100)}%
                <div className="mt-2 h-1 overflow-hidden rounded bg-white/10">
                  <div className="h-full" style={{ width: `${exp.pct * 100}%`, background: accent }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex w-full items-center gap-3">
            <button
              onClick={togglePlay}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black"
              style={{ background: accent }}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.02}
              value={Math.min(time, duration || 0)}
              onChange={(e) => setT(parseFloat(e.target.value))}
              className="w-full"
              style={{ accentColor: accent }}
            />
            <div className="w-[88px] shrink-0 text-right font-mono text-[11px] text-zinc-400">
              {fmt(time)} / {fmt(duration)}
            </div>
          </div>
          {exp.done && !exp.busy && <div className="text-[11px] text-zinc-400">Saved {exp.done}</div>}
        </div>

        {/* ------------------------- control column ------------------------- */}
        <div className="min-w-0">
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={tab === k ? { background: accent, color: '#0a0a0a' } : { color: 'rgba(255,255,255,0.55)' }}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === 'source' && (
            <Section title="Load the talking-head footage" hint="Your clip is processed locally in your browser — nothing is uploaded.">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-6 py-10 text-center hover:border-white/40">
                <div className="text-sm font-semibold">{videoFile ? videoFile.name : 'Choose a 9:16 video file'}</div>
                <div className="text-xs text-zinc-500">
                  {videoFile ? `${fmt(vdur)} · speaker, voice and timing stay untouched` : 'MP4 / MOV / WebM'}
                </div>
                <input type="file" accept="video/*" className="hidden" onChange={(e) => onVideo(e.target.files?.[0] ?? null)} />
              </label>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold">Transcribe what is actually said</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Runs a Whisper speech model in your browser to get word-level timing. Every caption, callout, number and graphic is then
                  built from those real words — nothing is invented.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-xs"
                  >
                    <option value="Xenova/whisper-tiny.en">Tiny (fast, ~40 MB)</option>
                    <option value="Xenova/whisper-base.en">Base (more accurate, ~80 MB)</option>
                  </select>
                  <button
                    onClick={runAsr}
                    disabled={!videoFile || asr.busy}
                    className="rounded-lg px-4 py-2 text-xs font-bold text-black disabled:opacity-30"
                    style={{ background: accent }}
                  >
                    {asr.busy ? 'Working…' : 'Transcribe & auto-direct'}
                  </button>
                </div>
                {asr.busy && (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] text-zinc-400">{asr.msg}</div>
                    <div className="h-1 overflow-hidden rounded bg-white/10">
                      <div className="h-full transition-all" style={{ width: `${asr.pct}%`, background: accent }} />
                    </div>
                  </div>
                )}
                {asr.err && <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{asr.err}</div>}
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold">No footage yet?</div>
                <p className="mt-1 text-xs text-zinc-400">
                  Preview the motion system on a stand-in stage using a clearly-labelled sample script. It is placeholder text, not a claim from
                  your video.
                </p>
                <button
                  onClick={() => {
                    setScript(SAMPLE_SCRIPT);
                    applyLines(parseTranscript(SAMPLE_SCRIPT, 0));
                  }}
                  className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                >
                  Load demo stage + sample script
                </button>
              </div>
            </Section>
          )}

          {tab === 'script' && (
            <Section
              title="Transcript"
              hint="Prefer your own words? Paste a transcript. Formats: SRT, lines like “0:03 Your sentence”, or plain text (timed evenly across the clip)."
            >
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={12}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs leading-relaxed outline-none focus:border-white/30"
                spellCheck={false}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={buildFromScript} className="rounded-lg px-4 py-2 text-xs font-bold text-black" style={{ background: accent }}>
                  Build edit from script
                </button>
                <button
                  onClick={() => lines.length && setScript(lines.map((L) => `${fmt(L.start)} ${L.words.map((w) => w.w).join(' ')}`).join('\n'))}
                  className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                >
                  Load current timeline as text
                </button>
              </div>
            </Section>
          )}

          {tab === 'timeline' && (
            <Section
              title="Edit timeline"
              hint="Everything the auto-director decided is a separate, editable layer: caption emphasis, kinetic word, graphic, punch-in."
            >
              {!lines.length ? (
                <Empty onGo={() => setTab('source')} />
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat k="Caption lines" v={stats.lines} />
                    <Stat k="Kinetic callouts" v={stats.callouts} />
                    <Stat k="Number counters" v={stats.numbers} />
                    <Stat k="Concept graphics" v={stats.graphics} />
                    <Stat k="Step markers" v={stats.steps} />
                    <Stat k="Punch-ins" v={stats.zooms} />
                    <Stat k="CTA found" v={stats.cta ? 'Yes' : 'No'} />
                    <Stat k="Dead air cut" v={settings.cutDead ? `${stats.cut.toFixed(1)}s` : 'Off'} />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {lines.map((L, i) => (
                      <LineCard
                        key={L.id}
                        line={L}
                        index={i}
                        active={i === activeIdx}
                        accent={accent}
                        onPatch={patchLine}
                        onRetext={retext}
                        onToggleKey={toggleKey}
                        onDelete={deleteLine}
                        onSeek={setT}
                      />
                    ))}
                  </div>
                </>
              )}
            </Section>
          )}

          {tab === 'style' && (
            <Section title="Brand system" hint="One accent colour, one typeface, one callout vocabulary.">
              <Label>Accent colour</Label>
              <div className="mb-5 flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.v}
                    onClick={() => upd({ accent: a.v })}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: settings.accent === a.v ? a.v : 'rgba(255,255,255,0.1)' }}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.v }} />
                    {a.name}
                  </button>
                ))}
              </div>

              <Label>Edit intensity</Label>
              <div className="mb-5 grid grid-cols-3 gap-2">
                {(['Calm', 'Standard', 'Punchy'] as const).map((n, i) => (
                  <button
                    key={n}
                    onClick={() => setIntensity(i as 0 | 1 | 2)}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={
                      settings.intensity === i
                        ? { background: accent, color: '#0a0a0a', borderColor: accent }
                        : { borderColor: 'rgba(255,255,255,0.1)' }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="-mt-3 mb-5 text-[11px] text-zinc-500">Changing intensity re-runs the auto-director (manual overrides are reset).</p>

              <Label>
                Face guard — graphics never enter this band ({Math.round(settings.faceTop * 100)}% – {Math.round(settings.faceBottom * 100)}% of height)
              </Label>
              <div className="mb-2 flex items-center gap-3">
                <span className="w-10 text-[11px] text-zinc-500">Top</span>
                <input
                  type="range"
                  min={0.08}
                  max={0.4}
                  step={0.01}
                  value={settings.faceTop}
                  onChange={(e) => upd({ faceTop: Math.min(parseFloat(e.target.value), settings.faceBottom - 0.1) })}
                  className="w-full"
                  style={{ accentColor: accent }}
                />
              </div>
              <div className="mb-3 flex items-center gap-3">
                <span className="w-10 text-[11px] text-zinc-500">Bottom</span>
                <input
                  type="range"
                  min={0.3}
                  max={0.62}
                  step={0.01}
                  value={settings.faceBottom}
                  onChange={(e) => upd({ faceBottom: Math.max(parseFloat(e.target.value), settings.faceTop + 0.1) })}
                  className="w-full"
                  style={{ accentColor: accent }}
                />
              </div>

              <div className="mb-6 mt-4 grid gap-2 sm:grid-cols-2">
                <Toggle on={settings.showGuard} onChange={(v) => upd({ showGuard: v })} label="Show face-guard overlay (preview only)" accent={accent} />
                <Toggle on={settings.captions} onChange={(v) => upd({ captions: v })} label="Burned-in captions" accent={accent} />
                <Toggle on={settings.sfx} onChange={(v) => upd({ sfx: v })} label="Synced sound design (pops, whooshes, impacts)" accent={accent} />
                <Toggle on={settings.cutDead} onChange={(v) => upd({ cutDead: v })} label="Remove dead air between lines" accent={accent} />
              </div>

              <Label>Hand-off to a human editor</Label>
              <div className="flex flex-wrap gap-2">
                <Ghost
                  onClick={() =>
                    download('reel-project.json', new Blob([JSON.stringify({ version: 1, settings, lines }, null, 2)], { type: 'application/json' }))
                  }
                  disabled={!lines.length}
                >
                  Project JSON
                </Ghost>
                <Ghost onClick={() => download('captions.srt', new Blob([toSrt(lines)], { type: 'text/plain' }))} disabled={!lines.length}>
                  Captions .srt
                </Ghost>
                <label className="cursor-pointer rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold hover:bg-white/5">
                  Import project JSON
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const p = JSON.parse(await f.text());
                        if (p.settings) setSettings({ ...settings, ...p.settings });
                        if (Array.isArray(p.lines)) setLines(p.lines);
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </label>
              </div>
              <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
                Render captures the preview canvas at 1080×1920 / 30 fps together with the original audio and the sound-design bus (MP4 where the
                browser supports it, otherwise WebM). Rendering runs in real time, so keep the tab visible until it finishes.
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ small parts ------------------------------ */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {hint && <p className="mb-4 mt-1 text-xs leading-relaxed text-zinc-500">{hint}</p>}
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{children}</div>;
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="text-lg font-bold leading-none">{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">{k}</div>
    </div>
  );
}

function Toggle({ on, onChange, label, accent }: { on: boolean; onChange: (v: boolean) => void; label: string; accent: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/[0.03]"
    >
      <span className="relative h-4 w-7 shrink-0 rounded-full transition-colors" style={{ background: on ? accent : 'rgba(255,255,255,0.15)' }}>
        <span className="absolute top-0.5 h-3 w-3 rounded-full bg-black transition-all" style={{ left: on ? 14 : 2 }} />
      </span>
      {label}
    </button>
  );
}

function Ghost({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold hover:bg-white/5 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Empty({ onGo }: { onGo: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">
      No timeline yet. Load a video and transcribe it, paste a script, or load the demo.
      <div>
        <button onClick={onGo} className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold hover:bg-white/5">
          Go to Source
        </button>
      </div>
    </div>
  );
}
