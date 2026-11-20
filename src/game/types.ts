export const BRANCH_CAPACITY = 4;

export type BirdSpeciesId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BirdSpecies {
  id: BirdSpeciesId;
  name: string;
  bodyMain: string;
  bodyShade: string;
  belly: string;
  wing: string;
  crest: string;
  beak: string;
  cheek: string;
  crestStyle: 'pointed' | 'tuft' | 'double' | 'round' | 'crown' | 'curl' | 'toucan' | 'owl';
  pitchHz: number;
}

export const BIRD_SPECIES: BirdSpecies[] = [
  {
    id: 0,
    name: 'Кардинал',
    bodyMain: '#EF4444',
    bodyShade: '#B91C1C',
    belly: '#FCA5A5',
    wing: '#991B1B',
    crest: '#DC2626',
    beak: '#F59E0B',
    cheek: '#F87171',
    crestStyle: 'pointed',
    pitchHz: 1180,
  },
  {
    id: 1,
    name: 'Канарейка',
    bodyMain: '#FACC15',
    bodyShade: '#CA8A04',
    belly: '#FEF9C3',
    wing: '#EAB308',
    crest: '#F59E0B',
    beak: '#EA580C',
    cheek: '#FB923C',
    crestStyle: 'tuft',
    pitchHz: 1420,
  },
  {
    id: 2,
    name: 'Сиалия',
    bodyMain: '#38BDF8',
    bodyShade: '#0284C7',
    belly: '#E0F2FE',
    wing: '#0369A1',
    crest: '#0EA5E9',
    beak: '#F59E0B',
    cheek: '#7DD3FC',
    crestStyle: 'double',
    pitchHz: 1290,
  },
  {
    id: 3,
    name: 'Попугайчик',
    bodyMain: '#22C55E',
    bodyShade: '#15803D',
    belly: '#DCFCE7',
    wing: '#166534',
    crest: '#FACC15',
    beak: '#F97316',
    cheek: '#FB7185',
    crestStyle: 'round',
    pitchHz: 1050,
  },
  {
    id: 4,
    name: 'Зяблик',
    bodyMain: '#A855F7',
    bodyShade: '#7E22CE',
    belly: '#F3E8FF',
    wing: '#6B21A8',
    crest: '#C084FC',
    beak: '#FBBF24',
    cheek: '#F472B6',
    crestStyle: 'crown',
    pitchHz: 1520,
  },
  {
    id: 5,
    name: 'Зарянка',
    bodyMain: '#F472B6',
    bodyShade: '#DB2777',
    belly: '#FCE7F3',
    wing: '#BE185D',
    crest: '#EC4899',
    beak: '#FBBF24',
    cheek: '#FDA4AF',
    crestStyle: 'curl',
    pitchHz: 1640,
  },
  {
    id: 6,
    name: 'Туканчик',
    bodyMain: '#14B8A6',
    bodyShade: '#0F766E',
    belly: '#CCFBF1',
    wing: '#115E59',
    crest: '#2DD4BF',
    beak: '#F97316',
    cheek: '#5EEAD4',
    crestStyle: 'toucan',
    pitchHz: 940,
  },
  {
    id: 7,
    name: 'Совёнок',
    bodyMain: '#E2E8F0',
    bodyShade: '#94A3B8',
    belly: '#FFFFFF',
    wing: '#475569',
    crest: '#64748B',
    beak: '#F59E0B',
    cheek: '#CBD5E1',
    crestStyle: 'owl',
    pitchHz: 860,
  },
];

export interface Bird {
  uid: number;
  species: BirdSpeciesId;
  sleeping: boolean;
  breathOffset: number;
  blinkTimer: number;
  wakeAnim: number; // 0..1 when just woken up
}

export type BranchSide = 'left' | 'right';

export interface Branch {
  id: number;
  side: BranchSide;
  row: number;
  birds: Bird[];
  vanishOnComplete: boolean;
  removed: boolean;
  isExtra: boolean;
  completing: boolean;
  shakeTime: number; // >0 when invalid tap shake
  swayVel: number;
  swayAngle: number;
  x: number;
  y: number;
  length: number;
}

export interface FlyingBird {
  bird: Bird;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromDir: 1 | -1;
  toDir: 1 | -1;
  progress: number;
  duration: number;
  delay: number;
  targetBranchId: number;
  targetSlot: number;
  isWakeOnLand?: boolean;
  onLandChecked?: boolean;
}

export interface DepartingFlock {
  birds: Bird[];
  branchId: number;
  startX: number;
  startY: number;
  dir: 1 | -1;
  slotXs: number[];
  elapsed: number;
  celebrateDuration: number;
  flyDuration: number;
  vanishAfter: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'feather' | 'sparkle' | 'note' | 'heart' | 'leaf' | 'zzz';
  rotation: number;
  rotSpeed: number;
}

export interface AmbientMote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  alpha: number;
}

export interface LevelConfig {
  level: number;
  numColors: number;
  emptyBranches: number;
  sleepingCount: number;
  vanishCount: number;
  timeLimitSec: number | null;
  rewardCoins: number;
  title: string;
}

export type GameScreenState = 'TITLE' | 'PLAYING' | 'WON' | 'LOST' | 'LEVELS';

export interface BoosterCounts {
  undo: number;
  addBranch: number;
  shuffle: number;
  freeMove: number;
}

export interface GameSnapshot {
  branches: {
    id: number;
    side: BranchSide;
    row: number;
    birds: Bird[];
    vanishOnComplete: boolean;
    removed: boolean;
    isExtra: boolean;
  }[];
  movesCount: number;
  extraBranchesAdded: number;
}

export interface SaveData {
  unlockedLevel: number;
  currentLevel: number;
  coins: number;
  boosters: BoosterCounts;
  soundEnabled: boolean;
  bestStars: Record<number, number>;
}
