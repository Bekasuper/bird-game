/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Feather,
  Grid2x2,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Star,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { sound } from './game/audio';
import { generateLevelBranches, getLevelConfig } from './game/levels';
import { DepartingFlockPool, FlyingBirdPool, ParticlePool } from './game/pools';
import {
  RendererCache,
  computeBranchLayout,
  getBirdSlotPosition,
  renderGameFrame,
} from './game/renderer';
import {
  AmbientMote,
  BIRD_SPECIES,
  BRANCH_CAPACITY,
  Bird,
  BoosterCounts,
  Branch,
  GameScreenState,
  GameSnapshot,
  LevelConfig,
  Particle,
  SaveData,
} from './game/types';

const STORAGE_KEY = 'bird_sort_2_save_v1';
const MAX_DPR = 1.5;
const MAX_UNDO_SNAPSHOTS = 20;
const LEVELS_PER_PAGE = 24;

const BOOSTER_COSTS = {
  undo: 15,
  addBranch: 40,
  shuffle: 30,
  freeMove: 35,
} as const;

const DEFAULT_SAVE: SaveData = {
  unlockedLevel: 1,
  currentLevel: 1,
  coins: 150,
  boosters: {
    undo: 2,
    addBranch: 2,
    shuffle: 2,
    freeMove: 2,
  },
  soundEnabled: true,
  bestStars: {},
};

function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVE;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      unlockedLevel: Math.max(1, parsed.unlockedLevel ?? 1),
      currentLevel: Math.max(1, parsed.currentLevel ?? 1),
      coins: typeof parsed.coins === 'number' ? Math.max(0, parsed.coins) : DEFAULT_SAVE.coins,
      boosters: {
        undo: parsed.boosters?.undo ?? DEFAULT_SAVE.boosters.undo,
        addBranch: parsed.boosters?.addBranch ?? DEFAULT_SAVE.boosters.addBranch,
        shuffle: parsed.boosters?.shuffle ?? DEFAULT_SAVE.boosters.shuffle,
        freeMove: parsed.boosters?.freeMove ?? DEFAULT_SAVE.boosters.freeMove,
      },
      soundEnabled: parsed.soundEnabled ?? true,
      bestStars: parsed.bestStars ?? {},
    };
  } catch {
    return DEFAULT_SAVE;
  }
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

const TIMER_NORMAL_CLASS =
  'min-h-[36px] px-2.5 rounded-xl flex items-center gap-1.5 border tabular-nums text-sm font-bold transition-colors bg-emerald-950/70 border-emerald-300/15 text-amber-200';
const TIMER_WARN_CLASS =
  'min-h-[36px] px-2.5 rounded-xl flex items-center gap-1.5 border tabular-nums text-sm font-bold transition-colors bg-red-950/80 border-red-400/50 text-red-200';

export default function App() {
  const [save, setSave] = useState<SaveData>(() => {
    const data = loadSaveData();
    sound.enabled = data.soundEnabled;
    return data;
  });

  const [screen, setScreen] = useState<GameScreenState>('TITLE');
  const [levelConfig, setLevelConfig] = useState<LevelConfig>(() =>
    getLevelConfig(loadSaveData().currentLevel)
  );
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [freeMoveActive, setFreeMoveActive] = useState(false);
  const [extraAddedCount, setExtraAddedCount] = useState(0);
  const [toastText, setToastText] = useState<string | null>(null);
  const [wonReward, setWonReward] = useState<{ coins: number; stars: number }>({
    coins: 25,
    stars: 3,
  });
  const [levelsPage, setLevelsPage] = useState<number>(() =>
    Math.floor((loadSaveData().currentLevel - 1) / LEVELS_PER_PAGE)
  );

  // Direct DOM refs for zero-React-rerender timer updates
  const timerBoxRef = useRef<HTMLDivElement | null>(null);
  const timerTextRef = useRef<HTMLSpanElement | null>(null);
  const lastDisplayedSecRef = useRef<number>(-1);
  const lastWarnStateRef = useRef<boolean>(false);

  // Canvas & container refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 390,
    height: 660,
    dpr: 1,
  });

  // Pre-allocated engine resources & Object Pools
  const rendererCacheRef = useRef<RendererCache | null>(null);
  if (!rendererCacheRef.current) {
    rendererCacheRef.current = new RendererCache();
  }
  const particlePoolRef = useRef<ParticlePool | null>(null);
  if (!particlePoolRef.current) {
    particlePoolRef.current = new ParticlePool(96);
  }
  const flyingPoolRef = useRef<FlyingBirdPool | null>(null);
  if (!flyingPoolRef.current) {
    flyingPoolRef.current = new FlyingBirdPool(16);
  }
  const departingPoolRef = useRef<DepartingFlockPool | null>(null);
  if (!departingPoolRef.current) {
    departingPoolRef.current = new DepartingFlockPool(8);
  }

  const branchesRef = useRef<Branch[]>([]);
  const selectedBranchIdRef = useRef<number | null>(null);
  const selectedGroupCountRef = useRef<number>(0);
  const freeMoveRef = useRef<boolean>(false);
  const undoStackRef = useRef<GameSnapshot[]>([]);
  const motesRef = useRef<AmbientMote[]>([]);
  const movesCountRef = useRef<number>(0);
  const extraAddedRef = useRef<number>(0);
  const screenRef = useRef<GameScreenState>(screen);
  const timeLeftRef = useRef<number | null>(null);
  const configRef = useRef<LevelConfig>(levelConfig);
  const winTriggeredRef = useRef<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);
  const returnScreenRef = useRef<GameScreenState>('TITLE');

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    freeMoveRef.current = freeMoveActive;
  }, [freeMoveActive]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Ignore storage quota errors
    }
  }, [save]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastText(msg);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToastText(null);
    }, 2200);
  }, []);

  const syncTimerDom = useCallback((sec: number | null) => {
    if (sec === null) {
      lastDisplayedSecRef.current = -1;
      lastWarnStateRef.current = false;
      return;
    }
    const ceilSec = Math.max(0, Math.ceil(sec));
    if (ceilSec !== lastDisplayedSecRef.current && timerTextRef.current) {
      lastDisplayedSecRef.current = ceilSec;
      timerTextRef.current.textContent = formatTime(ceilSec);
    }
    const isWarn = ceilSec <= 15;
    if (isWarn !== lastWarnStateRef.current && timerBoxRef.current) {
      lastWarnStateRef.current = isWarn;
      timerBoxRef.current.className = isWarn ? TIMER_WARN_CLASS : TIMER_NORMAL_CLASS;
    }
  }, []);

  const spawnBurst = useCallback(
    (
      x: number,
      y: number,
      color: string,
      count: number,
      kinds: Particle['kind'][]
    ) => {
      const pool = particlePoolRef.current;
      if (!pool) return;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 115;
        const kind = kinds[i % kinds.length];
        pool.spawn(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - (kind === 'note' || kind === 'heart' ? 45 : 20),
          kind === 'sparkle' ? 5 + Math.random() * 4 : 6 + Math.random() * 5,
          0.55 + Math.random() * 0.5,
          color,
          kind,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 6
        );
      }
    },
    []
  );

  const clearTransientPools = useCallback(() => {
    flyingPoolRef.current?.clear();
    departingPoolRef.current?.clear();
    particlePoolRef.current?.clear();
    undoStackRef.current.length = 0;
  }, []);

  const startLevel = useCallback(
    (targetLevel: number, nextScreen: GameScreenState = 'PLAYING') => {
      clearTransientPools();

      // Explicitly release all previous level branch & bird references from RAM
      const oldBranches = branchesRef.current;
      for (let i = 0; i < oldBranches.length; i++) {
        oldBranches[i].birds.length = 0;
      }
      oldBranches.length = 0;

      const cfg = getLevelConfig(targetLevel);
      const branches = generateLevelBranches(cfg);
      computeBranchLayout(branches, sizeRef.current.width, sizeRef.current.height);

      branchesRef.current = branches;
      selectedBranchIdRef.current = null;
      selectedGroupCountRef.current = 0;
      freeMoveRef.current = false;
      movesCountRef.current = 0;
      extraAddedRef.current = 0;
      winTriggeredRef.current = false;

      configRef.current = cfg;
      timeLeftRef.current = cfg.timeLimitSec;
      lastDisplayedSecRef.current = -1;
      lastWarnStateRef.current = false;

      setLevelConfig(cfg);
      setUndoAvailable(false);
      setFreeMoveActive(false);
      setExtraAddedCount(0);
      setScreen(nextScreen);
      setSave((prev) => ({ ...prev, currentLevel: cfg.level }));

      if (cfg.timeLimitSec !== null) {
        // Sync timer DOM right after state commit
        window.requestAnimationFrame(() => syncTimerDom(cfg.timeLimitSec));
      }

      if (nextScreen === 'PLAYING') {
        if (cfg.level === 4) {
          showToast('Тёмные птички спят — откройте их, убрав крайних!');
        } else if (cfg.vanishCount > 0 && cfg.level === 11) {
          showToast('Золотые ветки исчезают после вылета стаи');
        } else if (cfg.timeLimitSec !== null) {
          showToast(`Уровень на время: ${formatTime(cfg.timeLimitSec)}`);
        }
      }
    },
    [clearTransientPools, showToast, syncTimerDom]
  );

  // Initialize current level on mount & clean up all resources on unmount
  useEffect(() => {
    startLevel(save.currentLevel, 'TITLE');

    // Initialize fixed pool of 14 lightweight ambient forest motes
    const motes: AmbientMote[] = new Array<AmbientMote>(14);
    for (let i = 0; i < 14; i++) {
      motes[i] = {
        x: Math.random() * sizeRef.current.width,
        y: Math.random() * sizeRef.current.height,
        r: 1.3 + Math.random() * 2.1,
        vx: (Math.random() - 0.5) * 10,
        vy: -4 - Math.random() * 9,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.25 + Math.random() * 0.42,
      };
    }
    motesRef.current = motes;

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      clearTransientPools();
      branchesRef.current = [];
      motesRef.current = [];
      rendererCacheRef.current?.dispose();
      sound.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observe canvas container resize with capped DPR (max 1.5 for weak Android WebViews)
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      sizeRef.current.width = rect.width;
      sizeRef.current.height = rect.height;
      sizeRef.current.dpr = dpr;
      computeBranchLayout(branchesRef.current, rect.width, rect.height);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, []);

  const pushSnapshot = useCallback(() => {
    const snap: GameSnapshot = {
      branches: branchesRef.current.map((b) => ({
        id: b.id,
        side: b.side,
        row: b.row,
        birds: b.birds.map((bird) => ({ ...bird })),
        vanishOnComplete: b.vanishOnComplete,
        removed: b.removed,
        isExtra: b.isExtra,
      })),
      movesCount: movesCountRef.current,
      extraBranchesAdded: extraAddedRef.current,
    };
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > MAX_UNDO_SNAPSHOTS) {
      undoStackRef.current.shift();
    }
    setUndoAvailable(true);
  }, []);

  const checkBranchCompletion = useCallback(
    (branch: Branch) => {
      if (branch.completing || branch.removed) return;
      if (branch.birds.length !== BRANCH_CAPACITY) return;
      const firstSpecies = branch.birds[0].species;
      for (let i = 0; i < BRANCH_CAPACITY; i++) {
        const b = branch.birds[i];
        if (b.sleeping || b.species !== firstSpecies) return;
      }

      branch.completing = true;
      const { width } = sizeRef.current;
      const slotXs = [0, 0, 0, 0];
      for (let idx = 0; idx < BRANCH_CAPACITY; idx++) {
        slotXs[idx] = getBirdSlotPosition(branch, idx, width).x;
      }
      const startY = getBirdSlotPosition(branch, 0, width).y;
      const dir: 1 | -1 = branch.side === 'left' ? 1 : -1;

      const completedBirds = branch.birds.splice(0, branch.birds.length);
      departingPoolRef.current?.spawn(
        completedBirds,
        branch.id,
        branch.x,
        startY,
        dir,
        slotXs,
        branch.vanishOnComplete
      );

      sound.flockComplete();

      const spColor = BIRD_SPECIES[firstSpecies].bodyMain;
      for (let i = 0; i < 4; i++) {
        spawnBurst(slotXs[i], startY - 22, spColor, 5, ['sparkle', 'note', 'heart', 'feather']);
      }
    },
    [spawnBurst]
  );

  // Main animation & game loop with WebView visibility lifecycle management
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let isPaused = document.hidden;

    const tick = (now: number) => {
      if (isPaused) {
        rafId = 0;
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      const timeSec = now / 1000;
      const { width, height, dpr } = sizeRef.current;

      // Update timer directly on DOM text node (zero React re-renders)
      if (
        screenRef.current === 'PLAYING' &&
        timeLeftRef.current !== null &&
        !winTriggeredRef.current
      ) {
        timeLeftRef.current = Math.max(0, timeLeftRef.current - dt);
        syncTimerDom(timeLeftRef.current);
        if (timeLeftRef.current <= 0) {
          undoStackRef.current.length = 0;
          setUndoAvailable(false);
          screenRef.current = 'LOST';
          setScreen('LOST');
          sound.gameOver();
        }
      }

      // Update ambient forest motes in-place
      const motes = motesRef.current;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -10) {
          m.y = height + 10;
          m.x = Math.random() * width;
        }
        if (m.x < -10) m.x = width + 10;
        else if (m.x > width + 10) m.x = -10;
      }

      // Update branches physics and bird timers in-place
      const branches = branchesRef.current;
      for (let bIdx = 0; bIdx < branches.length; bIdx++) {
        const br = branches[bIdx];
        if (br.removed) continue;
        if (br.shakeTime > 0) {
          br.shakeTime = Math.max(0, br.shakeTime - dt);
        }
        const acc = -140 * br.swayAngle - 10 * br.swayVel;
        br.swayVel += acc * dt;
        br.swayAngle += br.swayVel * dt;

        for (let j = 0; j < br.birds.length; j++) {
          const bird = br.birds[j];
          bird.blinkTimer -= dt;
          if (bird.blinkTimer <= 0) {
            bird.blinkTimer = 2.2 + Math.random() * 3.8;
          }
          if (bird.wakeAnim > 0) {
            bird.wakeAnim = Math.max(0, bird.wakeAnim - dt * 1.9);
          }
        }
      }

      // Update pooled flying birds in-place
      const flyingPool = flyingPoolRef.current!;
      let fIdx = 0;
      while (fIdx < flyingPool.activeCount) {
        const fb = flyingPool.items[fIdx];
        if (fb.delay > 0) {
          fb.delay -= dt;
          fIdx++;
          continue;
        }
        fb.progress += dt / fb.duration;
        if (fb.progress >= 1) {
          let dst: Branch | undefined;
          for (let b = 0; b < branches.length; b++) {
            if (branches[b].id === fb.targetBranchId) {
              dst = branches[b];
              break;
            }
          }
          if (dst) {
            dst.swayVel += 0.35;
            const landPos = getBirdSlotPosition(dst, fb.targetSlot, width);
            const spColor = BIRD_SPECIES[fb.bird.species].bodyMain;
            spawnBurst(landPos.x, landPos.y - 6, spColor, 3, ['feather', 'sparkle']);

            let moreFlyingToDst = false;
            for (let k = 0; k < flyingPool.activeCount; k++) {
              if (k === fIdx) continue;
              const other = flyingPool.items[k];
              if (other.targetBranchId === dst.id && other.progress < 1) {
                moreFlyingToDst = true;
                break;
              }
            }
            if (!moreFlyingToDst) {
              checkBranchCompletion(dst);
            }
          }
          flyingPool.removeAt(fIdx);
          continue;
        }
        fIdx++;
      }

      // Update pooled departing flocks in-place
      const departingPool = departingPoolRef.current!;
      let dIdx = 0;
      while (dIdx < departingPool.activeCount) {
        const flock = departingPool.items[dIdx];
        flock.elapsed += dt;
        const totalDur = flock.celebrateDuration + flock.flyDuration + 0.22;
        if (flock.elapsed >= totalDur) {
          for (let b = 0; b < branches.length; b++) {
            const br = branches[b];
            if (br.id === flock.branchId) {
              br.completing = false;
              if (flock.vanishAfter) {
                br.removed = true;
                spawnBurst(
                  br.x + (br.side === 'left' ? 50 : -50),
                  br.y,
                  '#fbbf24',
                  10,
                  ['leaf', 'sparkle']
                );
                computeBranchLayout(branches, width, height);
              }
              break;
            }
          }
          departingPool.removeAt(dIdx);
          continue;
        }
        dIdx++;
      }

      // Update pooled particles in-place (auto-culls off-screen and expired)
      const particlePool = particlePoolRef.current!;
      particlePool.update(dt, width, height);

      // Check win condition without array allocations
      if (
        screenRef.current === 'PLAYING' &&
        !winTriggeredRef.current &&
        flyingPool.activeCount === 0 &&
        departingPool.activeCount === 0 &&
        branches.length > 0
      ) {
        let allEmpty = true;
        for (let b = 0; b < branches.length; b++) {
          if (!branches[b].removed && branches[b].birds.length > 0) {
            allEmpty = false;
            break;
          }
        }
        if (allEmpty) {
          winTriggeredRef.current = true;
          undoStackRef.current.length = 0;
          setUndoAvailable(false);

          const cfg = configRef.current;
          const timeBonus =
            cfg.timeLimitSec !== null && timeLeftRef.current !== null
              ? Math.round(timeLeftRef.current * 0.25)
              : 0;
          const earned = cfg.rewardCoins + timeBonus;
          const idealMoves = cfg.numColors * 2.5;
          const stars =
            movesCountRef.current <= idealMoves + 4
              ? 3
              : movesCountRef.current <= idealMoves + 11
              ? 2
              : 1;

          setWonReward({ coins: earned, stars });
          setSave((prev) => ({
            ...prev,
            coins: prev.coins + earned,
            unlockedLevel: Math.max(prev.unlockedLevel, cfg.level + 1),
            bestStars: {
              ...prev.bestStars,
              [cfg.level]: Math.max(prev.bestStars[cfg.level] ?? 0, stars),
            },
          }));
          sound.victory();
          screenRef.current = 'WON';
          setScreen('WON');
        }
      }

      // Render Canvas
      const canvas = canvasRef.current;
      const cache = rendererCacheRef.current;
      if (canvas && cache) {
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderGameFrame(ctx, cache, {
            width,
            height,
            dpr,
            time: timeSec,
            branches,
            selectedBranchId: selectedBranchIdRef.current,
            selectedGroupCount: selectedGroupCountRef.current,
            freeMoveActive: freeMoveRef.current,
            flyingPool,
            departingPool,
            particlePool,
            motes,
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        sound.suspend();
      } else {
        isPaused = false;
        lastTime = performance.now();
        if (rafId === 0) {
          rafId = requestAnimationFrame(tick);
        }
      }
    };

    const handlePageHide = () => {
      isPaused = true;
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      sound.suspend();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    if (!isPaused) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [checkBranchCompletion, spawnBurst, syncTimerDom]);

  const canAffordBooster = (key: keyof BoosterCounts): boolean => {
    if (save.boosters[key] > 0) return true;
    return save.coins >= BOOSTER_COSTS[key];
  };

  const spendBooster = useCallback((key: keyof BoosterCounts) => {
    setSave((prev) => {
      if (prev.boosters[key] > 0) {
        return {
          ...prev,
          boosters: {
            ...prev.boosters,
            [key]: prev.boosters[key] - 1,
          },
        };
      }
      return {
        ...prev,
        coins: Math.max(0, prev.coins - BOOSTER_COSTS[key]),
      };
    });
  }, []);

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      sound.unlock();
      if (screenRef.current !== 'PLAYING') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { width } = sizeRef.current;
      const branches = branchesRef.current;

      let tapped: Branch | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < branches.length; i++) {
        const br = branches[i];
        if (br.removed || br.completing) continue;
        const minX = br.side === 'left' ? 0 : width - br.length - 36;
        const maxX = br.side === 'left' ? br.length + 36 : width;
        if (px < minX || px > maxX) continue;
        const dy = py - br.y;
        if (dy >= -54 && dy <= 34) {
          const dist = Math.abs(dy + 10);
          if (dist < bestDist) {
            bestDist = dist;
            tapped = br;
          }
        }
      }

      if (!tapped) {
        if (selectedBranchIdRef.current !== null) {
          selectedBranchIdRef.current = null;
          selectedGroupCountRef.current = 0;
        }
        return;
      }

      // Prevent interacting with a branch while a bird is still landing onto it
      const flyingPool = flyingPoolRef.current!;
      for (let i = 0; i < flyingPool.activeCount; i++) {
        if (flyingPool.items[i].targetBranchId === tapped.id) return;
      }

      // Case 1: Select source branch
      if (selectedBranchIdRef.current === null) {
        if (tapped.birds.length === 0) return;

        const topBird = tapped.birds[tapped.birds.length - 1];
        if (topBird.sleeping) {
          topBird.sleeping = false;
          topBird.wakeAnim = 1;
        }

        let groupCount = 1;
        for (let i = tapped.birds.length - 2; i >= 0; i--) {
          const b = tapped.birds[i];
          if (!b.sleeping && b.species === topBird.species) groupCount++;
          else break;
        }

        selectedBranchIdRef.current = tapped.id;
        selectedGroupCountRef.current = groupCount;
        sound.chirp(topBird.species);
        return;
      }

      // Case 2: Deselect
      if (selectedBranchIdRef.current === tapped.id) {
        selectedBranchIdRef.current = null;
        selectedGroupCountRef.current = 0;
        return;
      }

      // Case 3: Move from src -> dst
      let src: Branch | undefined;
      for (let i = 0; i < branches.length; i++) {
        if (branches[i].id === selectedBranchIdRef.current) {
          src = branches[i];
          break;
        }
      }
      if (!src || src.birds.length === 0) {
        selectedBranchIdRef.current = null;
        selectedGroupCountRef.current = 0;
        return;
      }

      const dst = tapped;
      const freeSlots = BRANCH_CAPACITY - dst.birds.length;
      const srcTop = src.birds[src.birds.length - 1];

      const isNormalLegal =
        freeSlots >= 1 &&
        (dst.birds.length === 0 ||
          (!dst.birds[dst.birds.length - 1].sleeping &&
            dst.birds[dst.birds.length - 1].species === srcTop.species));

      const isWildLegal = freeMoveRef.current && freeSlots >= 1 && !isNormalLegal;

      if (!isNormalLegal && !isWildLegal) {
        dst.shakeTime = 0.28;
        sound.invalidMove();
        selectedBranchIdRef.current = null;
        selectedGroupCountRef.current = 0;
        return;
      }

      pushSnapshot();

      const moveCount = isWildLegal
        ? 1
        : Math.min(selectedGroupCountRef.current, freeSlots);

      const startSrcSlot = src.birds.length - moveCount;
      const movedBirds: Bird[] = src.birds.splice(startSrcSlot, moveCount);

      if (src.birds.length > 0 && src.birds[src.birds.length - 1].sleeping) {
        const woken = src.birds[src.birds.length - 1];
        woken.sleeping = false;
        woken.wakeAnim = 1;
        const wPos = getBirdSlotPosition(src, src.birds.length - 1, width);
        spawnBurst(wPos.x, wPos.y - 16, '#fde047', 8, ['sparkle']);
        sound.wakeUp();
      }

      const startDstSlot = dst.birds.length;
      for (let i = 0; i < movedBirds.length; i++) {
        dst.birds.push(movedBirds[i]);
      }
      movesCountRef.current += 1;

      for (let idx = 0; idx < movedBirds.length; idx++) {
        const bird = movedBirds[idx];
        const fromPos = getBirdSlotPosition(src, startSrcSlot + idx, width);
        const toSlot = startDstSlot + idx;
        const toPos = getBirdSlotPosition(dst, toSlot, width);
        const delay = idx * 0.055;
        flyingPool.spawn(
          bird,
          fromPos.x,
          fromPos.y - 16,
          toPos.x,
          toPos.y,
          fromPos.dir,
          toPos.dir,
          delay,
          0.27,
          dst.id,
          toSlot
        );
        sound.flapAndLand(delay);
      }

      src.swayVel -= 0.22;

      if (isWildLegal) {
        spendBooster('freeMove');
        freeMoveRef.current = false;
        setFreeMoveActive(false);
        sound.boosterUse();
      }

      selectedBranchIdRef.current = null;
      selectedGroupCountRef.current = 0;
    },
    [pushSnapshot, spawnBurst, spendBooster]
  );

  // Booster 1: Undo
  const handleUndo = () => {
    sound.unlock();
    if (screen !== 'PLAYING' || undoStackRef.current.length === 0) return;
    if (!canAffordBooster('undo')) {
      showToast('Недостаточно монет для отмены хода');
      sound.invalidMove();
      return;
    }

    const snap = undoStackRef.current.pop()!;
    spendBooster('undo');

    flyingPoolRef.current?.clear();
    departingPoolRef.current?.clear();
    selectedBranchIdRef.current = null;
    selectedGroupCountRef.current = 0;
    freeMoveRef.current = false;
    setFreeMoveActive(false);

    branchesRef.current = snap.branches.map((sb) => ({
      ...sb,
      birds: sb.birds.map((b) => ({ ...b })),
      completing: false,
      shakeTime: 0,
      swayVel: 0,
      swayAngle: 0,
      x: 0,
      y: 0,
      length: 0,
    }));
    movesCountRef.current = snap.movesCount;
    extraAddedRef.current = snap.extraBranchesAdded;
    setExtraAddedCount(snap.extraBranchesAdded);
    setUndoAvailable(undoStackRef.current.length > 0);

    computeBranchLayout(
      branchesRef.current,
      sizeRef.current.width,
      sizeRef.current.height
    );
    sound.boosterUse();
  };

  // Booster 2: Add Empty Branch
  const handleAddBranch = () => {
    sound.unlock();
    if (screen !== 'PLAYING') return;
    if (extraAddedRef.current >= 2) {
      showToast('Максимум +2 доп. ветки на уровне');
      sound.invalidMove();
      return;
    }
    if (!canAffordBooster('addBranch')) {
      showToast('Недостаточно монет (+Ветка)');
      sound.invalidMove();
      return;
    }

    spendBooster('addBranch');
    const branches = branchesRef.current;
    let leftCount = 0;
    let rightCount = 0;
    let maxLeftRow = -1;
    let maxRightRow = -1;
    let maxId = 0;

    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      if (b.id > maxId) maxId = b.id;
      if (b.removed) continue;
      if (b.side === 'left') {
        leftCount++;
        if (b.row > maxLeftRow) maxLeftRow = b.row;
      } else {
        rightCount++;
        if (b.row > maxRightRow) maxRightRow = b.row;
      }
    }

    const chooseLeft = leftCount <= rightCount;
    const targetSide = chooseLeft ? 'left' : 'right';
    const nextRow = chooseLeft ? maxLeftRow + 1 : maxRightRow + 1;

    const newBr: Branch = {
      id: maxId + 1,
      side: targetSide,
      row: nextRow,
      birds: [],
      vanishOnComplete: false,
      removed: false,
      isExtra: true,
      completing: false,
      shakeTime: 0,
      swayVel: 0.3,
      swayAngle: 0,
      x: 0,
      y: 0,
      length: 0,
    };

    branches.push(newBr);
    extraAddedRef.current += 1;
    setExtraAddedCount(extraAddedRef.current);
    computeBranchLayout(branches, sizeRef.current.width, sizeRef.current.height);

    spawnBurst(
      newBr.x + (newBr.side === 'left' ? 60 : -60),
      newBr.y,
      '#4ade80',
      12,
      ['leaf', 'sparkle']
    );
    sound.boosterUse();
  };

  // Booster 3: Shuffle awake birds
  const handleShuffle = () => {
    sound.unlock();
    if (screen !== 'PLAYING') return;
    if (
      (flyingPoolRef.current?.activeCount ?? 0) > 0 ||
      (departingPoolRef.current?.activeCount ?? 0) > 0
    ) {
      return;
    }

    const awakeSlots: { br: Branch; idx: number; bird: Bird }[] = [];
    const branches = branchesRef.current;
    for (let b = 0; b < branches.length; b++) {
      const br = branches[b];
      if (br.removed || br.completing) continue;
      for (let idx = 0; idx < br.birds.length; idx++) {
        const bird = br.birds[idx];
        if (!bird.sleeping) {
          awakeSlots.push({ br, idx, bird });
        }
      }
    }

    const uniqueSpecies = new Set(awakeSlots.map((s) => s.bird.species));
    if (awakeSlots.length < 2 || uniqueSpecies.size < 2) {
      showToast('Некого перемешивать');
      sound.invalidMove();
      return;
    }

    if (!canAffordBooster('shuffle')) {
      showToast('Недостаточно монет (Перемешать)');
      sound.invalidMove();
      return;
    }

    pushSnapshot();
    spendBooster('shuffle');

    const speciesPool = awakeSlots.map((s) => s.bird.species);
    for (let attempt = 0; attempt < 10; attempt++) {
      for (let i = speciesPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [speciesPool[i], speciesPool[j]] = [speciesPool[j], speciesPool[i]];
      }
      if (awakeSlots.some((s, idx) => s.bird.species !== speciesPool[idx])) break;
    }

    const { width } = sizeRef.current;
    for (let i = 0; i < awakeSlots.length; i++) {
      const slot = awakeSlots[i];
      slot.bird.species = speciesPool[i];
      const pos = getBirdSlotPosition(slot.br, slot.idx, width);
      spawnBurst(
        pos.x,
        pos.y - 14,
        BIRD_SPECIES[slot.bird.species].bodyMain,
        4,
        ['feather', 'sparkle']
      );
      slot.br.swayVel += (Math.random() - 0.5) * 0.25;
    }

    selectedBranchIdRef.current = null;
    selectedGroupCountRef.current = 0;

    for (let b = 0; b < branches.length; b++) {
      checkBranchCompletion(branches[b]);
    }

    sound.boosterUse();
    sound.flapAndLand(0.05);
  };

  // Booster 4: Toggle Free Move
  const handleToggleFreeMove = () => {
    sound.unlock();
    if (screen !== 'PLAYING') return;
    if (freeMoveActive) {
      setFreeMoveActive(false);
      sound.uiClick();
      return;
    }
    if (!canAffordBooster('freeMove')) {
      showToast('Недостаточно монет (Свободный ход)');
      sound.invalidMove();
      return;
    }
    setFreeMoveActive(true);
    sound.boosterUse();
  };

  const handleToggleSound = () => {
    const next = !save.soundEnabled;
    sound.enabled = next;
    if (next) {
      sound.unlock();
      sound.uiClick();
    } else {
      sound.suspend();
    }
    setSave((prev) => ({ ...prev, soundEnabled: next }));
  };

  const maxPage = Math.max(1, Math.floor((save.unlockedLevel + 3) / LEVELS_PER_PAGE));
  const clampedPage = Math.min(levelsPage, maxPage);
  const pageStartLevel = clampedPage * LEVELS_PER_PAGE + 1;

  const openLevelsModal = useCallback(() => {
    sound.unlock();
    sound.uiClick();
    if (screenRef.current !== 'LEVELS') {
      returnScreenRef.current = screenRef.current;
    }
    setLevelsPage(Math.floor((configRef.current.level - 1) / LEVELS_PER_PAGE));
    setScreen('LEVELS');
  }, []);

  return (
    <div className="w-full h-[100dvh] bg-[#0a1d14] flex items-center justify-center sm:p-4 overflow-hidden">
      {/* 9:16 Mobile Game Frame */}
      <div className="relative w-full h-full sm:h-[min(94dvh,860px)] sm:w-auto sm:aspect-[9/16] sm:max-w-[440px] sm:rounded-[30px] sm:shadow-[0_24px_70px_rgba(0,0,0,0.65)] sm:border sm:border-emerald-800/50 overflow-hidden flex flex-col bg-[#133829]">
        {/* TOP HUD BAR */}
        <header className="shrink-0 h-[54px] px-3 bg-[#0d261b]/88 backdrop-blur-md border-b border-emerald-200/10 flex items-center justify-between gap-2 z-20 text-emerald-50">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={openLevelsModal}
              className="min-h-[40px] px-2.5 rounded-xl bg-emerald-900/70 hover:bg-emerald-800/80 active:scale-95 transition flex items-center gap-1.5 border border-emerald-300/15 cursor-pointer"
              aria-label="Выбор уровня"
            >
              <Grid2x2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="text-sm font-bold tracking-tight whitespace-nowrap tabular-nums">
                Ур. {levelConfig.level}
              </span>
            </button>

            {levelConfig.timeLimitSec !== null && (
              <div ref={timerBoxRef} className={TIMER_NORMAL_CLASS}>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span ref={timerTextRef}>
                  {formatTime(levelConfig.timeLimitSec)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className="min-h-[36px] px-2.5 rounded-xl bg-amber-950/55 border border-amber-400/25 flex items-center gap-1.5 text-amber-200"
              title="Монеты"
            >
              <Coins className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-bold tabular-nums">{save.coins}</span>
            </div>

            <button
              type="button"
              onClick={handleToggleSound}
              className="w-10 h-10 rounded-xl bg-emerald-900/60 hover:bg-emerald-800/80 active:scale-95 transition flex items-center justify-center border border-emerald-300/15 cursor-pointer"
              aria-label={save.soundEnabled ? 'Выключить звук' : 'Включить звук'}
            >
              {save.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-200" />
              ) : (
                <VolumeX className="w-4 h-4 text-emerald-400/60" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sound.unlock();
                sound.uiClick();
                startLevel(levelConfig.level, 'PLAYING');
              }}
              className="w-10 h-10 rounded-xl bg-emerald-900/60 hover:bg-emerald-800/80 active:scale-95 transition flex items-center justify-center border border-emerald-300/15 cursor-pointer"
              aria-label="Перезапустить уровень"
              title="Перезапустить уровень"
            >
              <RotateCcw className="w-4 h-4 text-emerald-200" />
            </button>
          </div>
        </header>

        {/* GAMEPLAY CANVAS AREA */}
        <main ref={containerRef} className="relative flex-1 min-h-0 w-full overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            className="block w-full h-full cursor-pointer touch-none"
          />

          {screen === 'PLAYING' && freeMoveActive && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3.5 py-2 rounded-2xl bg-amber-950/90 border border-amber-300/45 text-amber-100 text-xs font-semibold shadow-lg flex items-center gap-2 whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Свободный ход: посадите птицу на любую ветку</span>
              <button
                type="button"
                onClick={handleToggleFreeMove}
                className="ml-1 underline text-amber-300 cursor-pointer"
              >
                Отмена
              </button>
            </div>
          )}

          {screen === 'PLAYING' && !freeMoveActive && toastText && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[90%] px-3.5 py-2 rounded-2xl bg-[#0b2318]/88 border border-emerald-300/25 text-emerald-50 text-xs font-medium text-center shadow-lg pointer-events-none">
              {toastText}
            </div>
          )}

          {/* TITLE OVERLAY */}
          {screen === 'TITLE' && (
            <div className="absolute inset-0 z-30 bg-[#081911]/72 backdrop-blur-sm flex items-center justify-center p-5">
              <div className="w-full max-w-[340px] rounded-3xl bg-[#133325]/95 border border-emerald-300/20 shadow-2xl p-6 text-center text-emerald-50">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg animate-gentle-float">
                  <Feather className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  Bird Sort 2
                </h1>
                <p className="mt-1 text-sm text-emerald-200/85">
                  Лесная головоломка с птичками
                </p>

                <div className="mt-5 space-y-2.5 text-left text-xs text-emerald-100/90 bg-[#0b2117]/75 rounded-2xl p-4 border border-emerald-300/10">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/25 text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>Пересаживайте птиц одного цвета на пустые ветки или к таким же птицам.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/25 text-amber-300 font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>Соберите 4 одинаковые птицы на ветке — стая улетит!</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-sky-500/25 text-sky-300 font-bold flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span>На сложных этапах ждут спящие птицы, таймер и хрупкие ветки.</span>
                  </div>
                </div>

                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      sound.unlock();
                      sound.uiClick();
                      startLevel(save.currentLevel, 'PLAYING');
                    }}
                    className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 font-extrabold text-base shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Играть — Уровень {save.currentLevel}</span>
                  </button>

                  <button
                    type="button"
                    onClick={openLevelsModal}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-900/75 hover:bg-emerald-800/80 active:scale-[0.98] text-emerald-100 font-semibold text-sm border border-emerald-300/15 transition cursor-pointer"
                  >
                    Выбрать уровень
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LEVEL SELECT OVERLAY (Paginated for Infinite Levels) */}
          {screen === 'LEVELS' && (
            <div className="absolute inset-0 z-30 bg-[#081911]/88 backdrop-blur-md flex flex-col p-4 text-emerald-50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-extrabold text-white">Карта уровней</h2>
                  <p className="text-xs text-emerald-300/80">
                    Открыто: {save.unlockedLevel} · {pageStartLevel <= 25 ? 'Основа' : 'Бесконечный лес'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sound.uiClick();
                    setScreen(returnScreenRef.current);
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-sm font-bold border border-emerald-300/20 cursor-pointer"
                >
                  Назад
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  disabled={clampedPage === 0}
                  onClick={() => {
                    sound.uiClick();
                    setLevelsPage((p) => Math.max(0, p - 1));
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-emerald-900/70 disabled:opacity-35 hover:bg-emerald-800 border border-emerald-300/15 flex items-center gap-1 text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Пред.</span>
                </button>

                <span className="text-xs font-bold text-emerald-200 tabular-nums">
                  Уровни {pageStartLevel}–{pageStartLevel + LEVELS_PER_PAGE - 1}
                </span>

                <button
                  type="button"
                  disabled={clampedPage >= maxPage}
                  onClick={() => {
                    sound.uiClick();
                    setLevelsPage((p) => Math.min(maxPage, p + 1));
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-emerald-900/70 disabled:opacity-35 hover:bg-emerald-800 border border-emerald-300/15 flex items-center gap-1 text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>След.</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-4 gap-2.5 content-start pb-4">
                {Array.from({ length: LEVELS_PER_PAGE }, (_, i) => pageStartLevel + i).map((lvl) => {
                  const unlocked = lvl <= save.unlockedLevel;
                  const cfg = getLevelConfig(lvl);
                  const stars = save.bestStars[lvl] ?? 0;
                  const isCurrent = lvl === levelConfig.level;

                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => {
                        sound.unlock();
                        sound.uiClick();
                        startLevel(lvl, 'PLAYING');
                      }}
                      className={`min-h-[68px] rounded-2xl p-2 flex flex-col items-center justify-center border transition ${
                        unlocked
                          ? isCurrent
                            ? 'bg-amber-500/25 border-amber-400 text-white shadow-md cursor-pointer'
                            : 'bg-emerald-900/70 hover:bg-emerald-800/80 border-emerald-300/20 text-emerald-50 active:scale-95 cursor-pointer'
                          : 'bg-emerald-950/50 border-emerald-900/40 text-emerald-600/50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-base font-extrabold tabular-nums">{lvl}</span>
                        {cfg.timeLimitSec !== null && unlocked && (
                          <Clock className="w-3 h-3 text-amber-300" />
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 mt-1">
                        {[1, 2, 3].map((s) => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${
                              s <= stars
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-emerald-700/60'
                            }`}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* VICTORY MODAL */}
          {screen === 'WON' && (
            <div className="absolute inset-0 z-30 bg-[#081911]/75 backdrop-blur-sm flex items-center justify-center p-5">
              <div className="w-full max-w-[330px] rounded-3xl bg-[#133325]/96 border border-amber-300/30 shadow-2xl p-6 text-center text-emerald-50">
                <div className="flex justify-center gap-2 mb-3">
                  {[1, 2, 3].map((s) => (
                    <Star
                      key={s}
                      className={`w-9 h-9 transition-transform ${
                        s <= wonReward.stars
                          ? 'text-amber-400 fill-amber-400 scale-105 drop-shadow'
                          : 'text-emerald-800'
                      }`}
                    />
                  ))}
                </div>

                <h2 className="text-2xl font-extrabold text-white">
                  Уровень {levelConfig.level} пройден!
                </h2>
                <p className="mt-1 text-sm text-emerald-200/85">
                  {levelConfig.title}
                </p>

                <div className="mt-4 py-3 px-4 rounded-2xl bg-[#0b2117]/80 border border-amber-400/20 flex items-center justify-center gap-2">
                  <Coins className="w-5 h-5 text-amber-400" />
                  <span className="text-lg font-extrabold text-amber-200 tabular-nums">
                    +{wonReward.coins} монет
                  </span>
                </div>

                <div className="mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      sound.unlock();
                      sound.uiClick();
                      startLevel(levelConfig.level + 1, 'PLAYING');
                    }}
                    className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 font-extrabold text-base shadow-lg transition cursor-pointer whitespace-nowrap"
                  >
                    Следующий уровень
                  </button>

                  <button
                    type="button"
                    onClick={openLevelsModal}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-900/75 hover:bg-emerald-800/80 text-emerald-100 font-semibold text-sm border border-emerald-300/15 transition cursor-pointer"
                  >
                    Все уровни
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TIME OUT / LOST MODAL */}
          {screen === 'LOST' && (
            <div className="absolute inset-0 z-30 bg-[#081911]/80 backdrop-blur-sm flex items-center justify-center p-5">
              <div className="w-full max-w-[320px] rounded-3xl bg-[#27181c]/95 border border-rose-400/30 shadow-2xl p-6 text-center text-rose-50">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center">
                  <Clock className="w-7 h-7 text-rose-300" />
                </div>
                <h2 className="text-2xl font-extrabold text-white">Время вышло!</h2>
                <p className="mt-1.5 text-sm text-rose-200/85">
                  Не расстраивайтесь — попробуйте уровень {levelConfig.level} ещё раз.
                </p>

                <div className="mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      sound.unlock();
                      sound.uiClick();
                      startLevel(levelConfig.level, 'PLAYING');
                    }}
                    className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 font-extrabold text-base shadow-lg transition cursor-pointer"
                  >
                    Попробовать снова
                  </button>
                  <button
                    type="button"
                    onClick={openLevelsModal}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-rose-100 font-semibold text-sm transition cursor-pointer"
                  >
                    Выбор уровня
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* BOTTOM BOOSTER BAR (Thumb Zone) */}
        <footer className="shrink-0 h-[74px] px-2.5 py-2 bg-[#0d261b]/90 backdrop-blur-md border-t border-emerald-200/10 grid grid-cols-4 gap-2 z-20">
          <BoosterButton
            label="Отмена"
            icon={<Undo2 className="w-5 h-5" />}
            charges={save.boosters.undo}
            cost={BOOSTER_COSTS.undo}
            coins={save.coins}
            disabled={screen !== 'PLAYING' || !undoAvailable || !canAffordBooster('undo')}
            onClick={handleUndo}
          />

          <BoosterButton
            label="+Ветка"
            icon={<Plus className="w-5 h-5" />}
            charges={save.boosters.addBranch}
            cost={BOOSTER_COSTS.addBranch}
            coins={save.coins}
            disabled={
              screen !== 'PLAYING' ||
              extraAddedCount >= 2 ||
              !canAffordBooster('addBranch')
            }
            onClick={handleAddBranch}
          />

          <BoosterButton
            label="Мешать"
            icon={<Shuffle className="w-5 h-5" />}
            charges={save.boosters.shuffle}
            cost={BOOSTER_COSTS.shuffle}
            coins={save.coins}
            disabled={screen !== 'PLAYING' || !canAffordBooster('shuffle')}
            onClick={handleShuffle}
          />

          <BoosterButton
            label="Свободно"
            icon={<Sparkles className="w-5 h-5" />}
            charges={save.boosters.freeMove}
            cost={BOOSTER_COSTS.freeMove}
            coins={save.coins}
            active={freeMoveActive}
            disabled={screen !== 'PLAYING' || (!freeMoveActive && !canAffordBooster('freeMove'))}
            onClick={handleToggleFreeMove}
          />
        </footer>
      </div>
    </div>
  );
}

interface BoosterButtonProps {
  label: string;
  icon: React.ReactNode;
  charges: number;
  cost: number;
  coins: number;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}

function BoosterButton({
  label,
  icon,
  charges,
  cost,
  coins,
  disabled,
  active,
  onClick,
}: BoosterButtonProps) {
  const hasFree = charges > 0;
  const affordable = hasFree || coins >= cost;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative min-h-[54px] rounded-2xl px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 border transition active:scale-95 ${
        active
          ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.45)] cursor-pointer'
          : disabled
          ? 'bg-emerald-950/55 border-emerald-800/40 text-emerald-500/45 cursor-not-allowed'
          : 'bg-emerald-900/75 hover:bg-emerald-800/85 border-emerald-300/20 text-emerald-50 cursor-pointer'
      }`}
    >
      <div className="relative flex items-center justify-center">
        {icon}
        <span
          className={`absolute -top-1.5 -right-4 px-1 min-w-[18px] h-[16px] rounded-md text-[10px] font-extrabold leading-none flex items-center justify-center tabular-nums ${
            active
              ? 'bg-slate-950 text-amber-300'
              : hasFree
              ? 'bg-emerald-400 text-emerald-950'
              : affordable
              ? 'bg-amber-400/90 text-slate-950'
              : 'bg-emerald-950 text-emerald-500/70'
          }`}
        >
          {hasFree ? `×${charges}` : cost}
        </span>
      </div>
      <span className="text-[11px] font-bold tracking-tight whitespace-nowrap leading-none mt-1">
        {label}
      </span>
    </button>
  );
}
