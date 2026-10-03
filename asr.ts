import type { TimedWord } from './types';

type Progress = (msg: string, pct: number) => void;

/** Decode the audio track of the video file to 16 kHz mono Float32. */
async function decodeAudio(file: File): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  void ctx.close();
  const length = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, length, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/**
 * In-browser speech recognition (Whisper via transformers.js, loaded from CDN on demand).
 * Returns word-level timestamps of what is actually said in the file.
 */
export async function transcribe(file: File, model: string, onProgress: Progress): Promise<TimedWord[]> {
  onProgress('Decoding audio…', 3);
  const audio = await decodeAudio(file);

  onProgress('Loading speech model (first run downloads it)…', 6);
  const url = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tf: any = await import(/* @vite-ignore */ url);
  const files: Record<string, number> = {};
  const asr = await tf.pipeline('automatic-speech-recognition', model, {
    progress_callback: (p: { status: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file) {
        files[p.file] = p.progress ?? 0;
        const vals = Object.values(files);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        onProgress(`Downloading model… ${Math.round(avg)}%`, 6 + avg * 0.5);
      }
    },
  });

  onProgress('Listening to the speech…', 60);
  const out = await asr(audio, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const chunks: { text: string; timestamp: [number, number | null] }[] = out.chunks ?? [];
  onProgress('Building timeline…', 95);
  const words: TimedWord[] = [];
  chunks.forEach((c) => {
    const w = c.text.trim();
    if (!w) return;
    const s = c.timestamp[0] ?? 0;
    const e = c.timestamp[1] ?? s + 0.3;
    words.push({ w, s, e: Math.max(e, s + 0.08) });
  });
  return words;
}
