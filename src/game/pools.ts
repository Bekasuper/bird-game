import { Bird, DepartingFlock, FlyingBird, Particle } from './types';

export class ParticlePool {
  public readonly items: Particle[];
  public activeCount = 0;
  public readonly capacity: number;

  constructor(capacity = 96) {
    this.capacity = capacity;
    this.items = new Array<Particle>(capacity);
    for (let i = 0; i < capacity; i++) {
      this.items[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 6,
        alpha: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        kind: 'sparkle',
        rotation: 0,
        rotSpeed: 0,
      };
    }
  }

  public spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    maxLife: number,
    color: string,
    kind: Particle['kind'],
    rotation: number,
    rotSpeed: number
  ) {
    // If pool is full, overwrite the oldest active particle slot (index 0 swapped out)
    let p: Particle;
    if (this.activeCount < this.capacity) {
      p = this.items[this.activeCount];
      this.activeCount++;
    } else {
      p = this.items[0];
    }

    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.alpha = 1;
    p.life = 0;
    p.maxLife = maxLife;
    p.color = color;
    p.kind = kind;
    p.rotation = rotation;
    p.rotSpeed = rotSpeed;
  }

  public update(dt: number, width: number, height: number) {
    let i = 0;
    while (i < this.activeCount) {
      const p = this.items[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.kind === 'feather' || p.kind === 'leaf') {
        p.vy += 45 * dt;
        p.vx *= 0.98;
      }

      p.rotation += p.rotSpeed * dt;
      p.alpha = 1 - p.life / p.maxLife;

      // Remove if expired OR left visible screen bounds
      const outOfBounds =
        p.x < -36 || p.x > width + 36 || p.y < -48 || p.y > height + 36;

      if (p.life >= p.maxLife || outOfBounds) {
        // In-place swap-with-last removal (zero array allocations)
        const lastIdx = this.activeCount - 1;
        if (i !== lastIdx) {
          const temp = this.items[i];
          this.items[i] = this.items[lastIdx];
          this.items[lastIdx] = temp;
        }
        this.activeCount--;
        continue;
      }
      i++;
    }
  }

  public clear() {
    this.activeCount = 0;
  }
}

export class FlyingBirdPool {
  public readonly items: FlyingBird[];
  public activeCount = 0;
  public readonly capacity: number;

  constructor(capacity = 16) {
    this.capacity = capacity;
    this.items = new Array<FlyingBird>(capacity);
    const dummyBird: Bird = {
      uid: 0,
      species: 0,
      sleeping: false,
      breathOffset: 0,
      blinkTimer: 2,
      wakeAnim: 0,
    };
    for (let i = 0; i < capacity; i++) {
      this.items[i] = {
        bird: dummyBird,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        fromDir: 1,
        toDir: 1,
        progress: 0,
        duration: 0.27,
        delay: 0,
        targetBranchId: 0,
        targetSlot: 0,
      };
    }
  }

  public spawn(
    bird: Bird,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fromDir: 1 | -1,
    toDir: 1 | -1,
    delay: number,
    duration: number,
    targetBranchId: number,
    targetSlot: number
  ) {
    if (this.activeCount >= this.capacity) return;
    const fb = this.items[this.activeCount];
    this.activeCount++;
    fb.bird = bird;
    fb.fromX = fromX;
    fb.fromY = fromY;
    fb.toX = toX;
    fb.toY = toY;
    fb.fromDir = fromDir;
    fb.toDir = toDir;
    fb.delay = delay;
    fb.duration = duration;
    fb.progress = delay > 0 ? -delay / duration : 0;
    fb.targetBranchId = targetBranchId;
    fb.targetSlot = targetSlot;
  }

  public removeAt(index: number) {
    const lastIdx = this.activeCount - 1;
    if (index !== lastIdx) {
      const temp = this.items[index];
      this.items[index] = this.items[lastIdx];
      this.items[lastIdx] = temp;
    }
    this.activeCount--;
  }

  public clear() {
    this.activeCount = 0;
  }
}

export class DepartingFlockPool {
  public readonly items: DepartingFlock[];
  public activeCount = 0;
  public readonly capacity: number;

  constructor(capacity = 8) {
    this.capacity = capacity;
    this.items = new Array<DepartingFlock>(capacity);
    for (let i = 0; i < capacity; i++) {
      this.items[i] = {
        birds: [],
        branchId: 0,
        startX: 0,
        startY: 0,
        dir: 1,
        slotXs: [0, 0, 0, 0],
        elapsed: 0,
        celebrateDuration: 0.36,
        flyDuration: 0.58,
        vanishAfter: false,
      };
    }
  }

  public spawn(
    birds: Bird[],
    branchId: number,
    startX: number,
    startY: number,
    dir: 1 | -1,
    slotXs: number[],
    vanishAfter: boolean
  ) {
    if (this.activeCount >= this.capacity) return;
    const flock = this.items[this.activeCount];
    this.activeCount++;
    flock.birds = birds;
    flock.branchId = branchId;
    flock.startX = startX;
    flock.startY = startY;
    flock.dir = dir;
    for (let i = 0; i < 4; i++) {
      flock.slotXs[i] = slotXs[i] ?? startX;
    }
    flock.elapsed = 0;
    flock.celebrateDuration = 0.36;
    flock.flyDuration = 0.58;
    flock.vanishAfter = vanishAfter;
  }

  public removeAt(index: number) {
    const flock = this.items[index];
    flock.birds = []; // Release bird references promptly
    const lastIdx = this.activeCount - 1;
    if (index !== lastIdx) {
      const temp = this.items[index];
      this.items[index] = this.items[lastIdx];
      this.items[lastIdx] = temp;
    }
    this.activeCount--;
  }

  public clear() {
    for (let i = 0; i < this.activeCount; i++) {
      this.items[i].birds = [];
    }
    this.activeCount = 0;
  }
}
