import {
  BRANCH_CAPACITY,
  Bird,
  BirdSpeciesId,
  Branch,
  BranchSide,
  LevelConfig,
} from './types';

// Hard caps so even Level 100+ stays smooth, fair, and lightweight on weak Android devices
const MAX_COLORS = 8;
const MAX_SLEEPING = 12;
const MAX_VANISHING = 3;
const MIN_TIMER_SEC = 85;
const MAX_REWARD_COINS = 120;

const PROCEDURAL_TITLES = [
  'Заповедная тропа',
  'Изумрудная крона',
  'Шёпот листвы',
  'Туманный овраг',
  'Янтарный рассвет',
  'Кедровый склон',
  'Серебряный ручей',
  'Вихрь перьев',
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getLevelConfig(level: number): LevelConfig {
  const L = Math.max(1, Math.floor(level));

  // Levels 1-25: Hand-tuned starter & progression curve
  if (L === 1) {
    return {
      level: 1,
      numColors: 4,
      emptyBranches: 2,
      sleepingCount: 0,
      vanishCount: 0,
      timeLimitSec: null,
      rewardCoins: 25,
      title: 'Утренняя роща',
    };
  }
  if (L <= 3) {
    return {
      level: L,
      numColors: 4,
      emptyBranches: 2,
      sleepingCount: 0,
      vanishCount: 0,
      timeLimitSec: null,
      rewardCoins: 30,
      title: L === 2 ? 'Первые трели' : 'Солнечные ветки',
    };
  }
  if (L <= 7) {
    return {
      level: L,
      numColors: 5,
      emptyBranches: 2,
      sleepingCount: L === 4 ? 2 : L <= 6 ? 3 : 4,
      vanishCount: 0,
      timeLimitSec: null,
      rewardCoins: 35,
      title: L === 4 ? 'Сонные пташки' : 'Лесная чаща',
    };
  }
  if (L <= 12) {
    const isTimed = L === 10 || L === 12;
    return {
      level: L,
      numColors: 6,
      emptyBranches: 2,
      sleepingCount: 4 + (L % 3),
      vanishCount: L === 11 || L === 12 ? 1 : 0,
      timeLimitSec: isTimed ? 115 : null,
      rewardCoins: isTimed ? 50 : 40,
      title: isTimed ? 'Наперегонки с ветром' : 'Высокие кроны',
    };
  }
  if (L <= 18) {
    const isTimed = L === 15 || L === 17 || L === 18;
    return {
      level: L,
      numColors: 7,
      emptyBranches: 2,
      sleepingCount: 5 + (L % 4),
      vanishCount: L >= 14 ? (L % 2 === 0 ? 2 : 1) : 0,
      timeLimitSec: isTimed ? 125 : null,
      rewardCoins: isTimed ? 60 : 45,
      title: L >= 14 ? 'Хрупкие ветки' : 'Певчий лес',
    };
  }
  if (L <= 25) {
    const isTimed = L % 3 === 0;
    return {
      level: L,
      numColors: 8,
      emptyBranches: 2,
      sleepingCount: Math.min(10, 6 + Math.floor((L - 18) / 2)),
      vanishCount: L % 2 === 0 ? 2 : 1,
      timeLimitSec: isTimed ? 135 : null,
      rewardCoins: isTimed ? 70 : 55,
      title: isTimed ? 'Королевский вихрь' : 'Заповедный край',
    };
  }

  // Levels 26+: Infinite procedural scaling with smooth caps
  const extraLvl = L - 25;
  const rng = mulberry32(L * 6151 + 109);

  // Vary color count gently (mostly 7-8, occasional 6-color fast timed sprint)
  const isSprintStage = L % 5 === 0;
  const numColors = isSprintStage
    ? 6 + (L % 2)
    : Math.min(MAX_COLORS, 7 + (rng() > 0.3 ? 1 : 0));

  // Smoothly increase sleeping birds up to MAX_SLEEPING (12)
  const sleepingBase = 6 + Math.floor(extraLvl / 5);
  const sleepingCount = Math.min(
    MAX_SLEEPING,
    numColors * 2 - 2,
    sleepingBase + (L % 3)
  );

  // Vanishing branches scale up to MAX_VANISHING (3)
  const vanishCap = Math.min(MAX_VANISHING, numColors - 3);
  const vanishRaw = 1 + Math.floor(extraLvl / 15) + (L % 2 === 0 ? 1 : 0);
  const vanishCount = Math.min(vanishCap, vanishRaw);

  // Timed challenge stages every 3rd level (or sprint stages), floored at MIN_TIMER_SEC
  const isTimed = L % 3 === 0 || isSprintStage;
  const baseTime = isSprintStage ? 110 : 138;
  const timeReduction = Math.floor(extraLvl * 0.65);
  const timeLimitSec = isTimed ? Math.max(MIN_TIMER_SEC, baseTime - timeReduction) : null;

  // Reward coins scale up to MAX_REWARD_COINS
  const rewardBase = 55 + Math.floor(extraLvl / 3) + (isTimed ? 15 : 0);
  const rewardCoins = Math.min(MAX_REWARD_COINS, rewardBase);

  const titleIdx = (L + Math.floor(rng() * 3)) % PROCEDURAL_TITLES.length;

  return {
    level: L,
    numColors,
    emptyBranches: 2,
    sleepingCount,
    vanishCount,
    timeLimitSec,
    rewardCoins,
    title: `${PROCEDURAL_TITLES[titleIdx]}`,
  };
}

interface SimBird {
  s: BirdSpeciesId;
  sl: boolean;
}

interface SimBranch {
  b: SimBird[];
  vanish: boolean;
  gone: boolean;
}

function cloneSim(state: SimBranch[]): SimBranch[] {
  const out: SimBranch[] = new Array(state.length);
  for (let i = 0; i < state.length; i++) {
    const src = state[i];
    const bCopy: SimBird[] = new Array(src.b.length);
    for (let j = 0; j < src.b.length; j++) {
      bCopy[j] = { s: src.b[j].s, sl: src.b[j].sl };
    }
    out[i] = { b: bCopy, vanish: src.vanish, gone: src.gone };
  }
  return out;
}

function simKey(state: SimBranch[]): string {
  const parts: string[] = new Array(state.length);
  for (let i = 0; i < state.length; i++) {
    const br = state[i];
    if (br.gone) {
      parts[i] = 'X';
    } else {
      let s = br.vanish ? 'V:' : 'N:';
      for (let j = 0; j < br.b.length; j++) {
        if (j > 0) s += ',';
        s += br.b[j].s + (br.b[j].sl ? 's' : '');
      }
      parts[i] = s;
    }
  }
  parts.sort();
  return parts.join('|');
}

function isSimSolved(state: SimBranch[]): boolean {
  for (let i = 0; i < state.length; i++) {
    if (!state[i].gone && state[i].b.length > 0) return false;
  }
  return true;
}

function topGroupCount(b: SimBird[]): number {
  if (b.length === 0) return 0;
  const top = b[b.length - 1];
  if (top.sl) return 0;
  let c = 1;
  for (let i = b.length - 2; i >= 0; i--) {
    if (!b[i].sl && b[i].s === top.s) c++;
    else break;
  }
  return c;
}

function countInitialLegalMoves(state: SimBranch[]): number {
  let moves = 0;
  for (let i = 0; i < state.length; i++) {
    const src = state[i];
    if (src.gone || src.b.length === 0) continue;
    const g = topGroupCount(src.b);
    if (g === 0) continue;
    const topS = src.b[src.b.length - 1].s;
    for (let j = 0; j < state.length; j++) {
      if (i === j) continue;
      const dst = state[j];
      if (dst.gone || dst.b.length >= BRANCH_CAPACITY) continue;
      if (dst.b.length === 0 || (!dst.b[dst.b.length - 1].sl && dst.b[dst.b.length - 1].s === topS)) {
        moves++;
      }
    }
  }
  return moves;
}

function isSolvable(initial: SimBranch[]): boolean {
  if (countInitialLegalMoves(initial) < 2) return false;

  const visited = new Set<string>();
  const stack: { state: SimBranch[]; score: number }[] = [
    { state: cloneSim(initial), score: 0 },
  ];
  let expansions = 0;
  const MAX_EXPANSIONS = 1800;

  while (stack.length > 0 && expansions < MAX_EXPANSIONS) {
    let bestIdx = stack.length - 1;
    let bestScore = stack[bestIdx].score;
    const scanStart = Math.max(0, stack.length - 16);
    for (let i = scanStart; i < stack.length; i++) {
      if (stack[i].score > bestScore) {
        bestScore = stack[i].score;
        bestIdx = i;
      }
    }
    const current = stack.splice(bestIdx, 1)[0].state;
    if (isSimSolved(current)) return true;

    const key = simKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    expansions++;

    const candidates: { state: SimBranch[]; score: number }[] = [];

    for (let i = 0; i < current.length; i++) {
      const src = current[i];
      if (src.gone || src.b.length === 0) continue;
      const gCount = topGroupCount(src.b);
      if (gCount === 0) continue;
      const topS = src.b[src.b.length - 1].s;
      const isPureSrc = gCount === src.b.length;

      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        const dst = current[j];
        if (dst.gone || dst.b.length >= BRANCH_CAPACITY) continue;

        if (dst.b.length === 0) {
          if (isPureSrc) continue;
        } else {
          const dstTop = dst.b[dst.b.length - 1];
          if (dstTop.sl || dstTop.s !== topS) continue;
        }

        const free = BRANCH_CAPACITY - dst.b.length;
        const moveN = Math.min(gCount, free);
        const next = cloneSim(current);
        const moved = next[i].b.splice(next[i].b.length - moveN, moveN);
        for (let m = 0; m < moved.length; m++) {
          next[j].b.push(moved[m]);
        }

        if (next[i].b.length > 0 && next[i].b[next[i].b.length - 1].sl) {
          next[i].b[next[i].b.length - 1].sl = false;
        }

        let moveScore = 0;
        if (
          next[j].b.length === BRANCH_CAPACITY &&
          next[j].b.every((x) => !x.sl && x.s === topS)
        ) {
          next[j].b = [];
          if (next[j].vanish) next[j].gone = true;
          moveScore += 50;
        } else if (dst.b.length > 0) {
          moveScore += 15 + moveN * 4;
        } else {
          moveScore += 1;
        }

        if (next[i].b.length === 0) moveScore += 8;
        if (src.b.length > moveN && src.b[src.b.length - moveN - 1].sl) moveScore += 12;

        candidates.push({ state: next, score: moveScore });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    for (let c = 0; c < candidates.length; c++) {
      stack.push(candidates[c]);
    }

    // Keep frontier bounded for low memory usage on weak phones
    if (stack.length > 600) {
      stack.splice(0, stack.length - 400);
    }
  }

  return false;
}

export function generateLevelBranches(config: LevelConfig): Branch[] {
  const totalBranches = config.numColors + config.emptyBranches;

  const allSpecies: BirdSpeciesId[] = [0, 1, 2, 3, 4, 5, 6, 7];
  const baseRng = mulberry32(config.level * 9371 + 42);
  const chosenSpecies: BirdSpeciesId[] =
    config.level <= 3
      ? allSpecies.slice(0, config.numColors)
      : [...allSpecies].sort(() => baseRng() - 0.5).slice(0, config.numColors);

  let selectedLayout: SimBranch[] | null = null;

  for (let attempt = 0; attempt < 30; attempt++) {
    const rng = mulberry32(config.level * 7919 + attempt * 313 + 17);

    const pool: BirdSpeciesId[] = [];
    for (let sIdx = 0; sIdx < chosenSpecies.length; sIdx++) {
      const sp = chosenSpecies[sIdx];
      for (let k = 0; k < BRANCH_CAPACITY; k++) pool.push(sp);
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    if (config.level === 1 && attempt === 0) {
      pool.length = 0;
      const s = chosenSpecies;
      pool.push(
        s[0], s[0], s[1], s[1],
        s[1], s[1], s[2], s[2],
        s[2], s[2], s[3], s[3],
        s[3], s[3], s[0], s[0]
      );
    }

    const sim: SimBranch[] = [];
    for (let b = 0; b < totalBranches; b++) {
      if (b < config.numColors) {
        const birds: SimBird[] = [];
        for (let slot = 0; slot < BRANCH_CAPACITY; slot++) {
          birds.push({ s: pool[b * BRANCH_CAPACITY + slot], sl: false });
        }
        sim.push({ b: birds, vanish: false, gone: false });
      } else {
        sim.push({ b: [], vanish: false, gone: false });
      }
    }

    // Reject if any branch starts pre-solved (4 identical) or too clustered on harder levels
    let invalidStart = false;
    for (let b = 0; b < config.numColors; b++) {
      const arr = sim[b].b;
      if (arr[0].s === arr[1].s && arr[1].s === arr[2].s && arr[2].s === arr[3].s) {
        invalidStart = true;
        break;
      }
      if (config.level >= 20 && arr[1].s === arr[2].s && arr[2].s === arr[3].s && attempt < 15) {
        invalidStart = true;
        break;
      }
    }
    if (invalidStart) continue;

    // Assign sleeping birds in deeper slots (slot 0, or slot 1 on level 9+)
    if (config.sleepingCount > 0) {
      const deepPositions: { bIdx: number; slot: number }[] = [];
      for (let b = 0; b < config.numColors; b++) {
        deepPositions.push({ bIdx: b, slot: 0 });
        if (config.level >= 9) {
          deepPositions.push({ bIdx: b, slot: 1 });
        }
      }
      for (let i = deepPositions.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = deepPositions[i];
        deepPositions[i] = deepPositions[j];
        deepPositions[j] = tmp;
      }
      const count = Math.min(config.sleepingCount, deepPositions.length);
      for (let k = 0; k < count; k++) {
        const pos = deepPositions[k];
        sim[pos.bIdx].b[pos.slot].sl = true;
      }
    }

    // Assign vanishing branches on initially filled branches
    if (config.vanishCount > 0) {
      const indices = Array.from({ length: config.numColors }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
      }
      for (let k = 0; k < Math.min(config.vanishCount, indices.length); k++) {
        sim[indices[k]].vanish = true;
      }
    }

    if (isSolvable(sim)) {
      selectedLayout = sim;
      break;
    }
  }

  // Guaranteed-solvable cyclic pair fallback if all random attempts failed solver budget
  if (!selectedLayout) {
    selectedLayout = [];
    for (let b = 0; b < totalBranches; b++) {
      if (b < config.numColors) {
        const nextB = (b + 1) % config.numColors;
        const prevB = (b + config.numColors - 1) % config.numColors;
        selectedLayout.push({
          b: [
            { s: chosenSpecies[b], sl: config.sleepingCount > b },
            { s: chosenSpecies[prevB], sl: false },
            { s: chosenSpecies[b], sl: false },
            { s: chosenSpecies[nextB], sl: false },
          ],
          vanish: b < config.vanishCount,
          gone: false,
        });
      } else {
        selectedLayout.push({ b: [], vanish: false, gone: false });
      }
    }
  }

  const rngLayout = mulberry32(config.level * 4099 + 9);
  const filled = selectedLayout.filter((br) => br.b.length > 0);
  const empties = selectedLayout.filter((br) => br.b.length === 0);
  for (let i = filled.length - 1; i > 0; i--) {
    const j = Math.floor(rngLayout() * (i + 1));
    const tmp = filled[i];
    filled[i] = filled[j];
    filled[j] = tmp;
  }
  const ordered = [...filled, ...empties];

  // Reset UID counter per level so IDs stay small and bounded across infinite levels
  let localBirdUid = 1;
  const branches: Branch[] = ordered.map((simBr, idx) => {
    const side: BranchSide = idx % 2 === 0 ? 'left' : 'right';
    const row = Math.floor(idx / 2);
    const birds: Bird[] = simBr.b.map((sb, sIdx) => ({
      uid: localBirdUid++,
      species: sb.s,
      sleeping: sb.sl,
      breathOffset: (idx * 0.9 + sIdx * 1.3) % (Math.PI * 2),
      blinkTimer: 1.5 + ((idx * 1.7 + sIdx * 2.1) % 3.5),
      wakeAnim: 0,
    }));

    return {
      id: idx + 1,
      side,
      row,
      birds,
      vanishOnComplete: simBr.vanish,
      removed: false,
      isExtra: false,
      completing: false,
      shakeTime: 0,
      swayVel: 0,
      swayAngle: 0,
      x: 0,
      y: 0,
      length: 0,
    };
  });

  return branches;
}
