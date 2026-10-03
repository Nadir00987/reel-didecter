import { useEffect, useState } from 'react';
import type { GfxType, Line } from '../lib/types';
import { GFX_NAME, GFX_TYPES } from '../lib/types';

type Props = {
  line: Line;
  index: number;
  active: boolean;
  accent: string;
  onPatch: (id: string, patch: Partial<Line>) => void;
  onRetext: (id: string, text: string) => void;
  onToggleKey: (id: string, wi: number) => void;
  onDelete: (id: string) => void;
  onSeek: (t: number) => void;
};

const label = 'text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500';
const field =
  'w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-white/30';

export default function LineCard({ line, index, active, accent, onPatch, onRetext, onToggleKey, onDelete, onSeek }: Props) {
  const text = line.words.map((w) => w.w).join(' ');
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);

  return (
    <div
      className="rounded-xl border bg-zinc-900/60 p-3 transition-colors"
      style={{ borderColor: active ? accent : 'rgba(255,255,255,0.08)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => onSeek(Math.max(0, line.start - 0.05))}
          className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-white/10"
          title="Jump to this line"
        >
          {String(index + 1).padStart(2, '0')} ▶
        </button>
        <input
          type="number"
          step={0.05}
          min={0}
          value={Number(line.start.toFixed(2))}
          onChange={(e) => onPatch(line.id, { start: parseFloat(e.target.value) || 0 })}
          className="w-[72px] rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 font-mono text-[11px] text-zinc-200 outline-none"
        />
        <span className="text-zinc-600">→</span>
        <input
          type="number"
          step={0.05}
          min={0}
          value={Number(line.end.toFixed(2))}
          onChange={(e) => onPatch(line.id, { end: parseFloat(e.target.value) || 0 })}
          className="w-[72px] rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 font-mono text-[11px] text-zinc-200 outline-none"
        />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {line.num && <Badge>NUMBER</Badge>}
          {line.step && <Badge>STEP</Badge>}
          {line.cta && <Badge>CTA</Badge>}
          {line.impact && <Badge>IMPACT</Badge>}
          {line.wipe && <Badge>WIPE</Badge>}
          <button
            onClick={() => onDelete(line.id)}
            className="ml-1 rounded-md px-1.5 py-1 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
            title="Delete line"
          >
            ✕
          </button>
        </div>
      </div>

      <input
        className={field}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && draft !== text && onRetext(line.id, draft)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />

      <div className="mt-2 flex flex-wrap gap-1">
        {line.words.map((w, wi) => (
          <button
            key={wi}
            onClick={() => onToggleKey(line.id, wi)}
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors"
            style={
              w.key
                ? { background: accent, color: '#0a0a0a' }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }
            }
            title="Toggle caption emphasis"
          >
            {w.w}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <div className={label}>Kinetic word</div>
          <input
            className={field}
            value={line.primary}
            placeholder="none"
            onChange={(e) => onPatch(line.id, { primary: e.target.value.toUpperCase() })}
          />
        </div>
        <div>
          <div className={label}>Graphic</div>
          <select
            className={field}
            value={line.gfx}
            onChange={(e) => {
              const g = e.target.value as GfxType;
              onPatch(line.id, {
                gfx: g,
                gfxLabel: line.gfxLabel || (line.words[line.gfxWord]?.w ?? '').replace(/[^\w']/g, '').toUpperCase(),
              });
            }}
          >
            {GFX_TYPES.map((g) => (
              <option key={g} value={g} className="bg-zinc-900">
                {g === 'none' ? 'None' : GFX_NAME[g]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={label}>Chip label</div>
          <input
            className={field}
            value={line.gfxLabel}
            onChange={(e) => onPatch(line.id, { gfxLabel: e.target.value.toUpperCase() })}
          />
        </div>
        <div>
          <div className={label}>Punch-in {line.zoom.toFixed(2)}×</div>
          <input
            type="range"
            min={1}
            max={1.15}
            step={0.01}
            value={line.zoom}
            onChange={(e) => onPatch(line.id, { zoom: parseFloat(e.target.value) })}
            className="mt-2 w-full"
            style={{ accentColor: accent }}
          />
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-zinc-400">
      {children}
    </span>
  );
}
