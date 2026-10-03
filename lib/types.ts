export type Word = { w: string; s: number; e: number; key: boolean };

export type GfxType =
  | 'none'
  | 'money'
  | 'time'
  | 'growth'
  | 'decline'
  | 'problem'
  | 'solution'
  | 'mistake'
  | 'process'
  | 'repeat'
  | 'speed'
  | 'choice'
  | 'question'
  | 'focus'
  | 'app'
  | 'data'
  | 'compare'
  | 'arrow'
  | 'ring';

export const GFX_TYPES: GfxType[] = [
  'none',
  'money',
  'time',
  'growth',
  'decline',
  'problem',
  'solution',
  'mistake',
  'process',
  'repeat',
  'speed',
  'choice',
  'question',
  'focus',
  'app',
  'data',
  'compare',
  'arrow',
  'ring',
];

export const GFX_NAME: Record<GfxType, string> = {
  none: '',
  money: 'MONEY',
  time: 'TIME',
  growth: 'GROWTH',
  decline: 'DECLINE',
  problem: 'WARNING',
  solution: 'SOLUTION',
  mistake: 'MISTAKE',
  process: 'PROCESS',
  repeat: 'LOOP',
  speed: 'SPEED',
  choice: 'CHOICE',
  question: 'QUESTION',
  focus: 'KEY POINT',
  app: 'DIGITAL',
  data: 'DATA',
  compare: 'COMPARE',
  arrow: 'LOOK',
  ring: 'FOCUS',
};

export type NumInfo = {
  text: string; // as spoken (for static / word numbers)
  value: number | null; // numeric value when spoken as digits
  decimals: number;
  prefix: string;
  suffix: string;
  wordIdx: number;
  label: string;
};

export type Line = {
  id: string;
  start: number;
  end: number;
  words: Word[];
  gfx: GfxType;
  gfxWord: number;
  gfxLabel: string;
  primary: string; // uppercase key phrase ('' = none)
  primaryWord: number;
  zoom: number;
  pan: number;
  impact: boolean;
  wipe: boolean;
  num: NumInfo | null;
  step: boolean;
  stepLabel: string;
  cta: boolean;
  side: 0 | 1;
};

export type Settings = {
  accent: string;
  faceTop: number; // fraction of height
  faceBottom: number;
  sfx: boolean;
  cutDead: boolean;
  captions: boolean;
  intensity: 0 | 1 | 2;
  showGuard: boolean;
};

export type TimedWord = { w: string; s: number; e: number; br?: boolean };
