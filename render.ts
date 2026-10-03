import type { Line, Settings } from './types';
import { GFX_NAME } from './types';
import { gfxWin, numWin, primaryWin, type Timeline } from './analyze';
import {
  FONT_MONO,
  FONT_SANS,
  clamp,
  drawIcon,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
} from './gfx';

export const W = 1080;
export const H = 1920;

export type RenderInput = {
  video: HTMLVideoElement | null;
  lines: Line[];
  tl: Timeline;
  settings: Settings;
  guard: boolean;
};

type Ctx = CanvasRenderingContext2D;

const setLS = (ctx: Ctx, px: number) => {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
};

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

type Cam = { z: number; px: number; py: number };

function camAt(lines: Line[], t: number, shake: boolean): Cam {
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].start - 0.05 <= t) i = k;
    else break;
  }
  if (i < 0) return { z: 1, px: 0, py: 0 };
  const L = lines[i];
  const pz = i > 0 ? lines[i - 1].zoom : 1;
  const pp = i > 0 ? lines[i - 1].pan : 0;
  const dt = t - (L.start - 0.05);
  const up = L.zoom > pz;
  const k = clamp(dt / (up ? 0.3 : 0.9));
  const e = up ? easeOutBack(k, 1.1) : easeInOutCubic(k);
  const z = lerp(pz, L.zoom, e);
  const px = lerp(pp, L.pan, e) * 22;
  const py = -(z - 1) * 90;
  let sx = 0;
  let sy = 0;
  if (shake && L.impact && dt < 0.3) {
    const amp = 7 * Math.pow(1 - dt / 0.3, 2);
    sx = Math.sin(dt * 75) * amp;
    sy = Math.cos(dt * 90) * amp * 0.6;
  }
  return { z, px: px + sx, py: py + sy };
}

function drawPlaceholder(ctx: Ctx, S: RenderInput, t: number) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#242a36');
  g.addColorStop(1, '#0b0d12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // window light
  const lg = ctx.createLinearGradient(W, 0, W * 0.4, H * 0.5);
  lg.addColorStop(0, 'rgba(255,255,255,0.10)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  const faceMid = ((S.settings.faceTop + S.settings.faceBottom) / 2) * H;
  const sway = Math.sin(t * 1.3) * 6;
  ctx.fillStyle = '#3a4150';
  ctx.beginPath();
  ctx.ellipse(W / 2 + sway, faceMid + 330, 380, 300, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a5264';
  ctx.beginPath();
  ctx.ellipse(W / 2 + sway * 1.2, faceMid, 150, 190, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `500 24px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setLS(ctx, 4);
  ctx.fillText('DEMO STAGE — LOAD YOUR VIDEO', W / 2, H * 0.935);
  setLS(ctx, 0);
}

function drawSource(ctx: Ctx, S: RenderInput, t: number) {
  const v = S.video;
  if (v && v.readyState >= 2 && v.videoWidth) {
    const s = Math.max(W / v.videoWidth, H / v.videoHeight);
    const dw = v.videoWidth * s;
    const dh = v.videoHeight * s;
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    drawPlaceholder(ctx, S, t);
  }
}

function drawCam(ctx: Ctx, S: RenderInput, cam: Cam, oy: number, t: number) {
  ctx.save();
  ctx.translate(W / 2 + cam.px, oy + cam.py);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-W / 2, -oy);
  drawSource(ctx, S, t);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Top-zone graphics                                                   */
/* ------------------------------------------------------------------ */

function drawChip(ctx: Ctx, S: RenderInput, L: Line, t: number, gs: number, ge: number, acc: string) {
  const h = 168;
  const p = clamp((t - gs) / 0.5);
  const out = clamp((ge - t) / 0.25);
  const alpha = easeOutCubic(clamp((t - gs) / 0.25)) * out;
  if (alpha <= 0) return;
  const eyebrow = GFX_NAME[L.gfx];
  ctx.font = `700 20px ${FONT_MONO}`;
  setLS(ctx, 4);
  const ew = ctx.measureText(eyebrow).width;
  setLS(ctx, 0);
  ctx.font = `800 40px ${FONT_SANS}`;
  const lw = Math.min(380, ctx.measureText(L.gfxLabel).width);
  const tw = Math.max(ew, lw);
  const w = 26 + 120 + 20 + tw + 34;
  const top = clamp(S.settings.faceTop * H - h - 30, 28, 130);
  const slide = (1 - easeOutBack(p, 1.1)) * (L.side ? 70 : -70);
  const x = (L.side ? W - 64 - w : 64) + slide;
  const y = top + Math.sin(t * 2) * 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30;
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = 'rgba(12,13,16,0.66)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // accent notch
  ctx.fillStyle = acc;
  rr(ctx, x + 14, y + 38, 4, h - 76, 2);
  ctx.fill();
  drawIcon(ctx, L.gfx, x + 26 + 66, y + h / 2, 118, p, t - gs, acc);
  const tx = x + 26 + 120 + 20;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = acc;
  ctx.font = `700 20px ${FONT_MONO}`;
  setLS(ctx, 4);
  ctx.fillText(eyebrow, tx, y + h / 2 - 28);
  setLS(ctx, 0);
  ctx.fillStyle = '#fff';
  ctx.font = `800 40px ${FONT_SANS}`;
  ctx.fillText(L.gfxLabel, tx, y + h / 2 + 14, 380);
  ctx.restore();
}

function drawSteps(ctx: Ctx, S: RenderInput, idx: number, t: number, acc: string) {
  const group = S.tl.stepGroup[idx].slice(-4);
  const rowH = 56;
  const y0 = Math.max(28, S.settings.faceTop * H - 28 - group.length * rowH);
  const x = 64;
  const out = clamp((S.tl.stepEnd[idx] - t) / 0.3);
  const all = S.tl.stepGroup[idx];
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14;
  group.forEach((li, r) => {
    const SL = S.lines[li];
    const isCur = li === idx;
    const no = all.indexOf(li) + 1;
    const p = easeOutCubic(clamp((t - SL.start) / 0.4));
    const a = p * out * (isCur ? 1 : 0.4);
    const y = y0 + r * rowH + rowH / 2 + (1 - p) * 14;
    ctx.globalAlpha = a;
    if (isCur) {
      ctx.fillStyle = acc;
      rr(ctx, x - 4, y - 20, 5, 40, 2);
      ctx.fill();
    }
    ctx.fillStyle = acc;
    ctx.font = `700 ${isCur ? 28 : 24}px ${FONT_MONO}`;
    ctx.fillText(String(no).padStart(2, '0'), x + 18, y);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${isCur ? 38 : 30}px ${FONT_SANS}`;
    setLS(ctx, 1);
    ctx.fillText(SL.stepLabel || `POINT ${no}`, x + 18 + 62, y, 640);
    setLS(ctx, 0);
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Lower-zone kinetic typography                                       */
/* ------------------------------------------------------------------ */

function drawPrimary(
  ctx: Ctx,
  L: Line,
  i: number,
  t: number,
  ps: number,
  pe: number,
  acc: string,
  yP: number,
) {
  const words = L.primary.split(' ');
  const fit = (txt: string, size: number) => {
    ctx.font = `900 ${size}px ${FONT_SANS}`;
    return ctx.measureText(txt).width;
  };
  let size = 210;
  let rows = [L.primary];
  if (fit(L.primary, size) > 940 && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    rows = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    size = 180;
  }
  const maxw = Math.max(...rows.map((r) => fit(r, size)));
  if (maxw > 940) size = Math.floor((size * 940) / maxw);
  const lineH = size * 0.96;
  const blockH = rows.length * lineH;
  const blockW = Math.min(940, Math.max(...rows.map((r) => fit(r, size))));

  const p = clamp((t - ps) / 0.42);
  const out = clamp((pe - t) / 0.22);
  const a = easeOutCubic(clamp((t - ps) / 0.2)) * out;
  if (a <= 0) return;
  const variant = i === 0 ? 1 : i % 4;
  const color = L.impact ? acc : '#ffffff';
  const exitY = -(1 - out) * 18;

  const paint = (offX: number, offY: number, sc: number, alpha: number, ls: number, shadow: boolean) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 + offX, yP + offY + exitY);
    ctx.scale(sc, sc);
    ctx.font = `900 ${size}px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 30;
    }
    setLS(ctx, ls);
    rows.forEach((r, k) => ctx.fillText(r, 0, (k - (rows.length - 1) / 2) * lineH));
    setLS(ctx, 0);
    ctx.restore();
  };

  if (variant === 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 - blockW / 2 - 50, yP - blockH / 2 - 24, blockW + 100, blockH + 48);
    ctx.clip();
    paint(0, (1 - easeOutCubic(p)) * size * 0.95, 1, out, 0, true);
    ctx.restore();
  } else if (variant === 1) {
    const sc = 0.8 + 0.2 * easeOutBack(p, 1.3);
    if (p < 1) {
      for (const g of [3, 2, 1]) paint(0, 0, sc * (1 + g * 0.055 * (1 - p)), a * 0.14 * (1 - p), 0, false);
    }
    paint(0, 0, sc, a, 0, true);
  } else if (variant === 2) {
    paint((1 - easeOutBack(p, 1.0)) * -190, 0, 1, a, 0, true);
  } else {
    paint(0, 0, 1, a, (1 - easeOutCubic(p)) * 30, true);
  }

  if (L.impact || i % 2 === 0) {
    const uw = blockW * easeOutCubic(clamp((t - ps - 0.12) / 0.4));
    ctx.save();
    ctx.globalAlpha = out;
    ctx.fillStyle = L.impact ? '#fff' : acc;
    rr(ctx, W / 2 - uw / 2, yP + blockH / 2 + 12 + exitY, uw, 10, 5);
    ctx.fill();
    ctx.restore();
  }
}

function drawNumber(ctx: Ctx, L: Line, t: number, ns: number, ne: number, acc: string, yP: number) {
  const num = L.num;
  if (!num) return;
  const fmt = (v: number) =>
    num.prefix +
    v.toLocaleString('en-US', { minimumFractionDigits: num.decimals, maximumFractionDigits: num.decimals }) +
    num.suffix;
  const finalText = num.value !== null ? fmt(num.value) : num.text.toUpperCase();
  const q = easeOutCubic(clamp((t - ns) / 0.9));
  const text = num.value !== null ? fmt(num.value * q) : finalText;
  let size = 300;
  ctx.font = `900 ${size}px ${FONT_SANS}`;
  const fw = ctx.measureText(finalText).width;
  if (fw > 920) size = Math.floor((size * 920) / fw);
  ctx.font = `900 ${size}px ${FONT_SANS}`;
  const tw = ctx.measureText(finalText).width;
  const out = clamp((ne - t) / 0.25);
  const a = easeOutCubic(clamp((t - ns) / 0.2)) * out;
  if (a <= 0) return;
  const sc = 0.86 + 0.14 * easeOutBack(clamp((t - ns) / 0.45), 1.5);
  const cy = yP - 30;

  // landing ring
  const rp = clamp((t - ns - 0.5) / 0.6);
  if (rp > 0 && rp < 1) {
    ctx.save();
    ctx.globalAlpha = (1 - rp) * 0.5 * out;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, cy, 160 + easeOutCubic(rp) * 360, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, cy - (1 - out) * 16);
  ctx.scale(sc, sc);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillText(text, -tw / 2, 0);
  ctx.restore();

  // label
  const lp = easeOutCubic(clamp((t - ns - 0.25) / 0.4));
  ctx.save();
  ctx.globalAlpha = lp * out;
  const barY = cy + size * 0.5 + 18;
  ctx.fillStyle = acc;
  rr(ctx, W / 2 - 50, barY, 100 * lp, 6, 3);
  ctx.fill();
  if (num.label) {
    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    setLS(ctx, 7);
    ctx.fillText(num.label, W / 2, barY + 46 + (1 - lp) * 10, 960);
    setLS(ctx, 0);
  }
  ctx.restore();
}

function drawCta(ctx: Ctx, L: Line, t: number, ps: number, pe: number, acc: string, onAcc: string, yP: number) {
  let size = 84;
  const mk = () => `900 ${size}px ${FONT_SANS}`;
  ctx.font = mk();
  let tw = ctx.measureText(L.primary).width;
  while (tw + 58 * 2 + 80 > 960 && size > 40) {
    size -= 4;
    ctx.font = mk();
    tw = ctx.measureText(L.primary).width;
  }
  const padX = 58;
  const arrowW = 70;
  const w = tw + padX * 2 + arrowW;
  const h = size + 70;
  const p = clamp((t - ps) / 0.55);
  const out = clamp((pe - t) / 0.3);
  const a = easeOutCubic(clamp((t - ps) / 0.25)) * out;
  if (a <= 0) return;
  const sc = (0.82 + 0.18 * easeOutBack(p, 1.3)) * (1 + 0.012 * Math.sin(t * 3));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, yP);
  ctx.scale(sc, sc);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 40;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = acc;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = onAcc;
  ctx.font = mk();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(L.primary, -w / 2 + padX, 3);
  // arrow
  const ax = w / 2 - padX - 20 + Math.sin(t * 4) * 4;
  ctx.strokeStyle = onAcc;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax - 38, 0);
  ctx.lineTo(ax + 6, 0);
  ctx.moveTo(ax - 12, -20);
  ctx.lineTo(ax + 8, 0);
  ctx.lineTo(ax - 12, 20);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */

function drawCaptions(ctx: Ctx, L: Line, t: number, acc: string, onAcc: string, yC: number) {
  const fs = 54;
  const gap = 18;
  const maxW = 900;
  const rowH = 80;
  const toks = L.words.map((w) => {
    const txt = w.key ? w.w.toUpperCase().replace(/[.,;:]+$/, '') : w.w;
    ctx.font = `${w.key ? 900 : 700} ${fs}px ${FONT_SANS}`;
    return { w, txt, width: ctx.measureText(txt).width + (w.key ? 30 : 0) };
  });
  const rows: (typeof toks)[] = [[]];
  let rw = 0;
  toks.forEach((k) => {
    const add = k.width + (rows[rows.length - 1].length ? gap : 0);
    if (rw + add > maxW && rows[rows.length - 1].length) {
      rows.push([k]);
      rw = k.width;
    } else {
      rows[rows.length - 1].push(k);
      rw += add;
    }
  });
  const inP = clamp((t - (L.start - 0.08)) / 0.16);
  const outP = clamp((L.end + 0.22 - t) / 0.16);
  const alpha = inP * outP;
  if (alpha <= 0) return;
  const top = yC - (rows.length * rowH) / 2 + (1 - easeOutCubic(inP)) * 14;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  rows.forEach((row, r) => {
    const total = row.reduce((a, k) => a + k.width, 0) + gap * (row.length - 1);
    let x = W / 2 - total / 2;
    const y = top + r * rowH + rowH / 2;
    row.forEach((k) => {
      const spoken = t >= k.w.s - 0.03;
      const cx = x + k.width / 2;
      if (k.w.key) {
        const on = t >= k.w.s - 0.08;
        if (on) {
          const pop = clamp((t - (k.w.s - 0.08)) / 0.3);
          const sc = 1 + 0.07 * Math.sin(pop * Math.PI);
          ctx.save();
          ctx.translate(cx, y);
          ctx.scale(sc, sc);
          ctx.fillStyle = acc;
          rr(ctx, -k.width / 2, -fs * 0.64, k.width, fs * 1.28, 12);
          ctx.fill();
          ctx.fillStyle = onAcc;
          ctx.font = `900 ${fs}px ${FONT_SANS}`;
          ctx.fillText(k.txt, 0, 3);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = `900 ${fs}px ${FONT_SANS}`;
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 14;
          ctx.fillText(k.txt, cx, y + 3);
          ctx.shadowBlur = 0;
        }
      } else {
        ctx.font = `700 ${fs}px ${FONT_SANS}`;
        ctx.fillStyle = spoken ? '#ffffff' : 'rgba(255,255,255,0.5)';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 14;
        ctx.fillText(k.txt, cx, y + 3);
        ctx.shadowBlur = 0;
      }
      x += k.width + gap;
    });
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

function drawWipe(ctx: Ctx, k: number, acc: string) {
  const e = easeInOutCubic(clamp(k));
  const x = lerp(-W * 0.5, W * 1.35, e);
  ctx.save();
  const g = ctx.createLinearGradient(x - 460, 0, x, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 460, 0, 460, H);
  ctx.fillStyle = acc;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(x + 70, 0);
  ctx.lineTo(x + 130, 0);
  ctx.lineTo(x + 60, H);
  ctx.lineTo(x, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function renderFrame(ctx: Ctx, S: RenderInput, t: number, scale: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const st = S.settings;
  const acc = st.accent;
  const onAcc = lum(acc) > 0.45 ? '#0a0a0a' : '#ffffff';
  const oy = ((st.faceTop + st.faceBottom) / 2) * H;
  const lines = S.lines;

  // 1 — footage with camera
  const cam = camAt(lines, t, true);
  const prev = camAt(lines, t - 1 / 40, false);
  drawCam(ctx, S, cam, oy, t);
  if (Math.abs(cam.z - prev.z) > 0.004) {
    ctx.globalAlpha = 0.4;
    drawCam(ctx, S, { z: prev.z, px: cam.px, py: cam.py }, oy, t);
    ctx.globalAlpha = 1;
  }

  // 2 — depth treatment
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.28, W / 2, H * 0.45, H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, H * 0.55, 0, H);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  const tg = ctx.createLinearGradient(0, 0, 0, H * 0.2);
  tg.addColorStop(0, 'rgba(0,0,0,0.35)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, W, H * 0.2);

  // layout anchors (face-safe)
  const yP = clamp(Math.max(H * 0.585, st.faceBottom * H + 150), H * 0.5, H * 0.66);
  const yC = H * 0.755;

  // 3 — top-zone graphics (steps take priority over chips)
  let stepIdx = -1;
  lines.forEach((L, i) => {
    if (L.step && t >= L.start - 0.05 && t <= S.tl.stepEnd[i]) stepIdx = i;
  });
  if (stepIdx >= 0) drawSteps(ctx, S, stepIdx, t, acc);
  else {
    let gi = -1;
    lines.forEach((L, i) => {
      if (L.gfx === 'none') return;
      const [gs, ge] = gfxWin(L);
      if (t >= gs && t <= ge) gi = i;
    });
    if (gi >= 0) {
      const [gs, ge] = gfxWin(lines[gi]);
      drawChip(ctx, S, lines[gi], t, gs, ge, acc);
    }
  }

  // 4 — lower-zone kinetic typography (number > CTA > primary)
  let pi = -1;
  let kind = 'primary' as 'num' | 'cta' | 'primary';
  lines.forEach((L, i) => {
    if (L.num) {
      const [s, e] = numWin(L);
      if (t >= s && t <= e) {
        pi = i;
        kind = 'num';
      }
    } else if (L.primary) {
      const [s, e] = primaryWin(L);
      if (t >= s && t <= e) {
        pi = i;
        kind = L.cta ? 'cta' : 'primary';
      }
    }
  });
  if (pi >= 0) {
    const L = lines[pi];
    if (kind === 'num') {
      const [s, e] = numWin(L);
      drawNumber(ctx, L, t, s, e, acc, yP);
    } else {
      const [s, e] = primaryWin(L);
      if (kind === 'cta') drawCta(ctx, L, t, s, e, acc, onAcc, yP);
      else drawPrimary(ctx, L, pi, t, s, e, acc, yP);
    }
  }

  // 5 — captions
  if (st.captions) {
    const ci = lines.findIndex((L) => t >= L.start - 0.08 && t <= L.end + 0.22);
    if (ci >= 0) drawCaptions(ctx, lines[ci], t, acc, onAcc, yC);
  }

  // 6 — transitions
  if (lines.length) {
    const h0 = Math.max(0, lines[0].start - 0.15);
    const hk = (t - h0) / 0.45;
    if (hk > 0 && hk < 1) drawWipe(ctx, hk, acc);
  }
  lines.forEach((L, i) => {
    if (!L.wipe || i === 0) return;
    const k = (t - (L.start - 0.12)) / 0.5;
    if (k > 0 && k < 1) drawWipe(ctx, k, acc);
  });

  // 7 — editor guides
  if (S.guard) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,60,90,0.07)';
    ctx.fillRect(0, st.faceTop * H, W, (st.faceBottom - st.faceTop) * H);
    ctx.strokeStyle = 'rgba(255,60,90,0.8)';
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 3;
    ctx.strokeRect(2, st.faceTop * H, W - 4, (st.faceBottom - st.faceTop) * H);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,60,90,0.95)';
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    setLS(ctx, 3);
    ctx.fillText('FACE GUARD — NO TEXT', 20, st.faceTop * H + 12);
    setLS(ctx, 0);
    ctx.restore();
  }
}
