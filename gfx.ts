import type { GfxType } from './types';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, s = 1.4) => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

export const FONT_SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

type P = [number, number];

function partial(ctx: CanvasRenderingContext2D, pts: P[], p: number): { end: P; ang: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let remain = total * clamp(p);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  let end: P = pts[0];
  let ang = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (remain >= lens[i - 1]) {
      ctx.lineTo(b[0], b[1]);
      end = b;
      remain -= lens[i - 1];
    } else {
      const f = remain / lens[i - 1];
      end = [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
      ctx.lineTo(end[0], end[1]);
      break;
    }
  }
  ctx.stroke();
  return { end, ang };
}

function arrowHead(ctx: CanvasRenderingContext2D, at: P, ang: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(at[0] + Math.cos(ang + 2.5) * size, at[1] + Math.sin(ang + 2.5) * size);
  ctx.lineTo(at[0], at[1]);
  ctx.lineTo(at[0] + Math.cos(ang - 2.5) * size, at[1] + Math.sin(ang - 2.5) * size);
  ctx.stroke();
}

/**
 * Draws a minimalist vector icon in a 120x120 box centred on (cx, cy).
 * p = draw-on progress (0..1), t = running time (for micro-animation).
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  type: GfxType,
  cx: number,
  cy: number,
  size: number,
  p: number,
  t: number,
  accent: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 120, size / 120);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  const W = 'rgba(255,255,255,0.95)';
  const Wd = 'rgba(255,255,255,0.32)';
  p = clamp(p);

  switch (type) {
    case 'money': {
      ctx.strokeStyle = Wd;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
      ctx.globalAlpha = p;
      ctx.fillStyle = W;
      ctx.font = `800 58px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 3);
      break;
    }
    case 'time': {
      ctx.strokeStyle = Wd;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
      ctx.globalAlpha = p;
      const a = -Math.PI / 2 + t * 2.4;
      const h = -Math.PI / 2 + t * 0.2;
      ctx.strokeStyle = W;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 33, Math.sin(a) * 33);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(h) * 20, Math.sin(h) * 20);
      ctx.stroke();
      ctx.fillStyle = W;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'growth':
    case 'decline': {
      const up = type === 'growth';
      ctx.strokeStyle = Wd;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-52, -48);
      ctx.lineTo(-52, 48);
      ctx.lineTo(54, 48);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.strokeStyle = accent;
      const base: P[] = [
        [-44, 32],
        [-18, 10],
        [0, 20],
        [24, -10],
        [46, -34],
      ];
      const pts = up ? base : base.map(([x, y]) => [x, -y + 4] as P);
      const { end, ang } = partial(ctx, pts, p);
      if (p > 0.92) arrowHead(ctx, end, ang, 14);
      break;
    }
    case 'problem': {
      const s = 1 + 0.035 * Math.sin(t * 5);
      ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.lineTo(50, 38);
      ctx.lineTo(-50, 38);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = W;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 12);
      ctx.stroke();
      ctx.fillStyle = W;
      ctx.beginPath();
      ctx.arc(0, 26, 4.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'solution': {
      ctx.strokeStyle = Wd;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p * 1.6));
      ctx.stroke();
      ctx.strokeStyle = W;
      ctx.lineWidth = 9;
      partial(ctx, [[-20, 2], [-6, 16], [22, -14]], clamp((p - 0.35) / 0.65));
      break;
    }
    case 'mistake': {
      ctx.strokeStyle = Wd;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p * 1.6));
      ctx.stroke();
      ctx.strokeStyle = W;
      ctx.lineWidth = 9;
      partial(ctx, [[-19, -19], [19, 19]], clamp((p - 0.35) / 0.35));
      partial(ctx, [[19, -19], [-19, 19]], clamp((p - 0.6) / 0.4));
      break;
    }
    case 'process': {
      const nodes: P[] = [[-42, 28], [0, 0], [42, -28]];
      ctx.strokeStyle = Wd;
      partial(ctx, nodes, p);
      nodes.forEach(([x, y], i) => {
        const on = p > (i + 0.2) / 3;
        ctx.beginPath();
        ctx.arc(x, y, i === 2 ? 13 : 10, 0, Math.PI * 2);
        if (i === 2) {
          ctx.fillStyle = accent;
          ctx.globalAlpha = on ? 1 : 0;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#111';
          ctx.fill();
          ctx.strokeStyle = on ? W : Wd;
          ctx.stroke();
        }
      });
      break;
    }
    case 'repeat': {
      ctx.rotate(t * 1.3);
      ctx.globalAlpha = p;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0.25, Math.PI - 0.55);
      ctx.stroke();
      let a = Math.PI - 0.55;
      arrowHead(ctx, [Math.cos(a) * 40, Math.sin(a) * 40], a + Math.PI / 2, 12);
      ctx.strokeStyle = W;
      ctx.beginPath();
      ctx.arc(0, 0, 40, Math.PI + 0.25, Math.PI * 2 - 0.55);
      ctx.stroke();
      a = Math.PI * 2 - 0.55;
      arrowHead(ctx, [Math.cos(a) * 40, Math.sin(a) * 40], a + Math.PI / 2, 12);
      break;
    }
    case 'speed': {
      ctx.globalAlpha = p;
      const rows = [-26, 0, 26];
      rows.forEach((y, i) => {
        ctx.strokeStyle = i === 1 ? accent : Wd;
        ctx.setLineDash([26 - i * 4, 16]);
        ctx.lineDashOffset = -t * (90 + i * 25);
        ctx.beginPath();
        ctx.moveTo(-56, y);
        ctx.lineTo(i === 1 ? 34 : 14, y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.strokeStyle = W;
      arrowHead(ctx, [52, 0], 0, 18);
      break;
    }
    case 'choice': {
      ctx.strokeStyle = accent;
      const { end } = partial(ctx, [[-52, 0], [-14, 0], [16, -28], [48, -28]], p);
      ctx.strokeStyle = Wd;
      partial(ctx, [[-14, 0], [16, 28], [48, 28]], p);
      ctx.fillStyle = W;
      ctx.beginPath();
      ctx.arc(-52, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      if (p > 0.9) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(end[0], end[1], 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'question': {
      ctx.strokeStyle = Wd;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
      ctx.globalAlpha = p;
      ctx.fillStyle = W;
      ctx.font = `800 62px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 4);
      break;
    }
    case 'focus': {
      ctx.strokeStyle = accent;
      const d = 46 - (1 - p) * 14;
      const l = 20;
      ctx.globalAlpha = p;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(sx * d, sy * (d - l));
        ctx.lineTo(sx * d, sy * d);
        ctx.lineTo(sx * (d - l), sy * d);
        ctx.stroke();
      });
      ctx.fillStyle = W;
      const pulse = 1 + 0.18 * Math.sin(t * 4);
      ctx.beginPath();
      ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = Wd;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + 4 * Math.sin(t * 4), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'app': {
      ctx.strokeStyle = W;
      ctx.lineWidth = 4.5;
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.beginPath();
      ctx.roundRect(-52, -44, 104, 88, 11);
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = Wd;
      ctx.beginPath();
      ctx.moveTo(-52, -24);
      ctx.lineTo(52, -24);
      ctx.stroke();
      [accent, W, W].forEach((c, i) => {
        ctx.fillStyle = i === 0 ? c : Wd;
        ctx.beginPath();
        ctx.arc(-40 + i * 11, -34, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = clamp((p - 0.3) / 0.4);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(-40, -12, 32, 42, 6);
      ctx.fill();
      ctx.strokeStyle = W;
      ctx.lineWidth = 5;
      [-6, 8, 22].forEach((y, i) => {
        ctx.globalAlpha = clamp((p - 0.45 - i * 0.12) / 0.2) * 0.8;
        ctx.beginPath();
        ctx.moveTo(4, y);
        ctx.lineTo(i === 1 ? 30 : 40, y);
        ctx.stroke();
      });
      break;
    }
    case 'data': {
      const hs = [28, 50, 38, 74];
      ctx.strokeStyle = Wd;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-54, 48);
      ctx.lineTo(54, 48);
      ctx.stroke();
      hs.forEach((h, i) => {
        const k = easeOutCubic(clamp((p - i * 0.14) / 0.5));
        ctx.fillStyle = i === 3 ? accent : 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.roundRect(-45 + i * 28, 44 - h * k, 18, h * k, 3);
        ctx.fill();
      });
      break;
    }
    case 'compare': {
      const k = easeOutCubic(p);
      ctx.strokeStyle = Wd;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.roundRect(-56 - (1 - k) * 12, -42, 48, 84, 9);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(8 + (1 - k) * 12, -42, 48, 84, 9);
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.font = `800 20px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VS', 32, 0);
      break;
    }
    case 'arrow': {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 8;
      const dx = Math.sin(t * 4) * 6;
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.moveTo(-46 + dx, 0);
      ctx.lineTo(42 + dx, 0);
      ctx.stroke();
      arrowHead(ctx, [46 + dx, 0], 0, 28);
      break;
    }
    case 'ring': {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
      ctx.fillStyle = W;
      ctx.beginPath();
      ctx.arc(0, 0, 7 + Math.sin(t * 4), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
