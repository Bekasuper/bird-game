import { DepartingFlockPool, FlyingBirdPool, ParticlePool } from './pools';
import {
  AmbientMote,
  BIRD_SPECIES,
  BRANCH_CAPACITY,
  Bird,
  Branch,
} from './types';

export interface RenderContextState {
  width: number;
  height: number;
  dpr: number;
  time: number;
  branches: Branch[];
  selectedBranchId: number | null;
  selectedGroupCount: number;
  freeMoveActive: boolean;
  flyingPool: FlyingBirdPool;
  departingPool: DepartingFlockPool;
  particlePool: ParticlePool;
  motes: AmbientMote[];
}

const Z_FONT_SMALL = '700 10px system-ui, sans-serif';
const Z_FONT_LARGE = '700 12px system-ui, sans-serif';
const NOTE_FONT_MIN = 10;
const NOTE_FONT_MAX = 26;
const NOTE_FONTS: string[] = [];
for (let sz = NOTE_FONT_MIN; sz <= NOTE_FONT_MAX; sz++) {
  NOTE_FONTS[sz] = `700 ${sz}px system-ui, sans-serif`;
}

export class RendererCache {
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgWidth = 0;
  private bgHeight = 0;
  private bgDpr = 0;

  private initializedForCtx: CanvasRenderingContext2D | null = null;
  public woodNormalGrad: CanvasGradient | null = null;
  public woodVanishGrad: CanvasGradient | null = null;
  public sleepGrad: CanvasGradient | null = null;
  public speciesBodyGrads: CanvasGradient[] = [];
  public sunbeamGrad: CanvasGradient | null = null;
  private sunbeamHeight = 0;

  public readonly inFlightUids = new Set<number>();

  public ensureCtxResources(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    if (this.initializedForCtx !== ctx) {
      this.initializedForCtx = ctx;

      const wn = ctx.createLinearGradient(0, -10, 0, 10);
      wn.addColorStop(0, '#8d6e63');
      wn.addColorStop(0.5, '#6d4c41');
      wn.addColorStop(1, '#4e342e');
      this.woodNormalGrad = wn;

      const wv = ctx.createLinearGradient(0, -10, 0, 10);
      wv.addColorStop(0, '#d97706');
      wv.addColorStop(0.55, '#b45309');
      wv.addColorStop(1, '#78350f');
      this.woodVanishGrad = wv;

      const sg = ctx.createLinearGradient(0, -34, 0, 0);
      sg.addColorStop(0, '#475569');
      sg.addColorStop(1, '#1e293b');
      this.sleepGrad = sg;

      this.speciesBodyGrads = new Array<CanvasGradient>(BIRD_SPECIES.length);
      for (let i = 0; i < BIRD_SPECIES.length; i++) {
        const sp = BIRD_SPECIES[i];
        const bg = ctx.createRadialGradient(4, -22, 3, 0, -16, 22);
        bg.addColorStop(0, sp.bodyMain);
        bg.addColorStop(1, sp.bodyShade);
        this.speciesBodyGrads[i] = bg;
      }

      this.sunbeamHeight = 0;
    }

    if (this.sunbeamHeight !== height || !this.sunbeamGrad) {
      this.sunbeamHeight = height;
      const beam = ctx.createLinearGradient(0, 0, 90, height * 0.85);
      beam.addColorStop(0, 'rgba(254, 240, 138, 0.09)');
      beam.addColorStop(0.6, 'rgba(254, 249, 195, 0.04)');
      beam.addColorStop(1, 'rgba(254, 249, 195, 0)');
      this.sunbeamGrad = beam;
    }

    if (
      !this.bgCanvas ||
      this.bgWidth !== width ||
      this.bgHeight !== height ||
      this.bgDpr !== dpr
    ) {
      this.rebuildBackgroundCache(width, height, dpr);
    }
  }

  private rebuildBackgroundCache(width: number, height: number, dpr: number) {
    if (!this.bgCanvas) {
      this.bgCanvas = document.createElement('canvas');
    }
    this.bgWidth = width;
    this.bgHeight = height;
    this.bgDpr = dpr;

    this.bgCanvas.width = Math.max(1, Math.round(width * dpr));
    this.bgCanvas.height = Math.max(1, Math.round(height * dpr));

    const bctx = this.bgCanvas.getContext('2d');
    if (!bctx) return;

    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Sunlit emerald-jade forest sky & glade gradient
    const skyGrad = bctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#133829');
    skyGrad.addColorStop(0.28, '#1f4e3b');
    skyGrad.addColorStop(0.68, '#2b664b');
    skyGrad.addColorStop(1, '#183d2c');
    bctx.fillStyle = skyGrad;
    bctx.fillRect(0, 0, width, height);

    // Soft warm clearing glow in upper-center
    const sunGlow = bctx.createRadialGradient(
      width * 0.52,
      height * 0.22,
      10,
      width * 0.52,
      height * 0.28,
      width * 0.85
    );
    sunGlow.addColorStop(0, 'rgba(253, 230, 138, 0.22)');
    sunGlow.addColorStop(0.45, 'rgba(134, 239, 172, 0.10)');
    sunGlow.addColorStop(1, 'rgba(20, 83, 45, 0)');
    bctx.fillStyle = sunGlow;
    bctx.fillRect(0, 0, width, height);

    // Distant misty tree silhouettes
    bctx.fillStyle = 'rgba(15, 46, 33, 0.45)';
    const distantTrees = [0.16, 0.34, 0.51, 0.68, 0.84];
    for (let idx = 0; idx < distantTrees.length; idx++) {
      const cx = width * distantTrees[idx];
      const tw = width * (0.045 + (idx % 2) * 0.015);
      bctx.fillRect(cx - tw * 0.5, 0, tw, height);
      bctx.beginPath();
      bctx.arc(cx, height * (0.14 + (idx % 3) * 0.06), width * 0.16, 0, Math.PI * 2);
      bctx.fill();
    }

    // Midground foliage hills at bottom
    bctx.fillStyle = 'rgba(14, 42, 30, 0.65)';
    bctx.beginPath();
    bctx.moveTo(0, height);
    bctx.lineTo(0, height - 48);
    bctx.quadraticCurveTo(width * 0.25, height - 86, width * 0.5, height - 54);
    bctx.quadraticCurveTo(width * 0.78, height - 28, width, height - 68);
    bctx.lineTo(width, height);
    bctx.closePath();
    bctx.fill();

    // Left & Right main tree trunks
    const trunkW = Math.max(16, width * 0.042);

    const leftGrad = bctx.createLinearGradient(0, 0, trunkW + 4, 0);
    leftGrad.addColorStop(0, '#3e2723');
    leftGrad.addColorStop(0.65, '#5d4037');
    leftGrad.addColorStop(1, '#4e342e');
    bctx.fillStyle = leftGrad;
    bctx.fillRect(0, 0, trunkW, height);

    const rightGrad = bctx.createLinearGradient(width - trunkW - 4, 0, width, 0);
    rightGrad.addColorStop(0, '#4e342e');
    rightGrad.addColorStop(0.35, '#5d4037');
    rightGrad.addColorStop(1, '#3e2723');
    bctx.fillStyle = rightGrad;
    bctx.fillRect(width - trunkW, 0, trunkW, height);

    // Subtle bark lines on trunks
    bctx.strokeStyle = 'rgba(30, 18, 12, 0.32)';
    bctx.lineWidth = 1.5;
    for (let y = 24; y < height; y += 54) {
      bctx.beginPath();
      bctx.moveTo(trunkW * 0.4, y);
      bctx.quadraticCurveTo(trunkW * 0.6, y + 18, trunkW * 0.35, y + 36);
      bctx.stroke();

      bctx.beginPath();
      bctx.moveTo(width - trunkW * 0.45, y + 12);
      bctx.quadraticCurveTo(width - trunkW * 0.65, y + 30, width - trunkW * 0.4, y + 46);
      bctx.stroke();
    }

    // Upper canopy leaf framing
    bctx.globalAlpha = 0.55;
    bctx.fillStyle = '#15803d';
    bctx.beginPath();
    bctx.arc(0, 12, 44, 0, Math.PI * 2);
    bctx.arc(width, 12, 44, 0, Math.PI * 2);
    bctx.fill();

    bctx.fillStyle = '#16a34a';
    bctx.beginPath();
    bctx.arc(34, 4, 34, 0, Math.PI * 2);
    bctx.arc(width - 34, 4, 34, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 1;
  }

  public getBackgroundCanvas(): HTMLCanvasElement | null {
    return this.bgCanvas;
  }

  public dispose() {
    if (this.bgCanvas) {
      this.bgCanvas.width = 0;
      this.bgCanvas.height = 0;
      this.bgCanvas = null;
    }
    this.initializedForCtx = null;
    this.woodNormalGrad = null;
    this.woodVanishGrad = null;
    this.sleepGrad = null;
    this.speciesBodyGrads = [];
    this.sunbeamGrad = null;
    this.inFlightUids.clear();
  }
}

export function computeBranchLayout(branches: Branch[], width: number, height: number) {
  let activeCount = 0;
  let leftCount = 0;
  let rightCount = 0;
  let maxRowIndex = 2;

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (b.removed) continue;
    activeCount++;
    if (b.side === 'left') leftCount++;
    else rightCount++;
    if (b.row > maxRowIndex) maxRowIndex = b.row;
  }

  const maxRows = Math.max(leftCount, rightCount, 3);
  const topMargin = Math.max(66, height * 0.13);
  const bottomMargin = Math.max(36, height * 0.065);
  const usableHeight = Math.max(240, height - topMargin - bottomMargin);

  const trunkWidth = Math.max(16, width * 0.042);
  const branchLength = Math.min(width * 0.4, 178);

  const totalRows = Math.max(maxRows, maxRowIndex + 1, Math.ceil(activeCount / 2));
  const effectiveStep = Math.min(106, usableHeight / totalRows);
  const effectiveStartY = topMargin + (usableHeight - (totalRows - 1) * effectiveStep) * 0.55;

  for (let i = 0; i < branches.length; i++) {
    const br = branches[i];
    if (br.removed) continue;
    br.x = br.side === 'left' ? trunkWidth - 4 : width - trunkWidth + 4;
    br.y = effectiveStartY + br.row * effectiveStep;
    br.length = branchLength;
  }
}

export function getBirdSlotPosition(
  branch: Branch,
  slotIndex: number,
  totalWidth: number,
  outPos?: { x: number; y: number; dir: 1 | -1 }
): { x: number; y: number; dir: 1 | -1 } {
  const dir: 1 | -1 = branch.side === 'left' ? 1 : -1;
  const len = branch.length || totalWidth * 0.39;
  const padInner = Math.max(24, len * 0.17);
  const padOuter = Math.max(20, len * 0.14);
  const span = len - padInner - padOuter;
  const step = span / (BRANCH_CAPACITY - 1);
  const offset = padInner + slotIndex * step;
  const x = branch.x + dir * offset;
  const tipDip = (slotIndex / (BRANCH_CAPACITY - 1)) * 3;
  const y = branch.y - 6 + tipDip;

  if (outPos) {
    outPos.x = x;
    outPos.y = y;
    outPos.dir = dir;
    return outPos;
  }
  return { x, y, dir };
}

export function getBirdScale(width: number, height: number, branchCount: number): number {
  const base = Math.min(width / 390, height / 660);
  const densityFactor = branchCount > 10 ? 0.86 : branchCount > 8 ? 0.93 : 1;
  return Math.max(0.68, Math.min(1.12, base * densityFactor));
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
  veinColor: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.55, -size * 0.5, size, 0);
  ctx.quadraticCurveTo(size * 0.55, size * 0.5, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.1, 0);
  ctx.lineTo(size * 0.85, 0);
  ctx.strokeStyle = veinColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawDynamicAtmosphere(
  ctx: CanvasRenderingContext2D,
  cache: RendererCache,
  width: number,
  height: number,
  time: number,
  motes: AmbientMote[]
) {
  // Draw cached static forest backdrop in a single drawImage call
  const bg = cache.getBackgroundCanvas();
  if (bg) {
    ctx.drawImage(bg, 0, 0, width, height);
  }

  // Animated sunbeams reusing single cached gradient via translation
  if (cache.sunbeamGrad) {
    ctx.fillStyle = cache.sunbeamGrad;
    for (let i = 0; i < 3; i++) {
      const beamShift = Math.sin(time * 0.35 + i * 1.4) * 14;
      const bx = width * (0.22 + i * 0.26) + beamShift;
      ctx.save();
      ctx.translate(bx, 0);
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(36, 0);
      ctx.lineTo(150, height * 0.88);
      ctx.lineTo(54, height * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Ambient floating forest motes / pollen
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    const pulse = 0.55 + 0.45 * Math.sin(time * 1.8 + m.phase);
    ctx.globalAlpha = m.alpha * pulse;
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBranch(
  ctx: CanvasRenderingContext2D,
  cache: RendererCache,
  branch: Branch,
  isSelected: boolean,
  isValidTarget: boolean,
  time: number
) {
  if (branch.removed) return;

  const dir = branch.side === 'left' ? 1 : -1;
  const len = branch.length;
  const shakeX = branch.shakeTime > 0 ? Math.sin(branch.shakeTime * 48) * 5 : 0;

  ctx.save();
  ctx.translate(branch.x + shakeX, branch.y);
  ctx.rotate(branch.swayAngle * dir);

  if (isSelected) {
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.55)';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dir * len, 3);
    ctx.stroke();
  } else if (isValidTarget) {
    const pulse = 0.25 + 0.15 * Math.sin(time * 5);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dir * len, 3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Drop shadow under branch
  ctx.fillStyle = 'rgba(7, 24, 16, 0.28)';
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.quadraticCurveTo(dir * len * 0.55, 11, dir * len, 7);
  ctx.lineTo(dir * len, 11);
  ctx.quadraticCurveTo(dir * len * 0.55, 16, 0, 17);
  ctx.closePath();
  ctx.fill();

  // Cached branch wood gradient
  ctx.fillStyle = branch.vanishOnComplete
    ? cache.woodVanishGrad || '#b45309'
    : cache.woodNormalGrad || '#6d4c41';

  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(dir * len * 0.5, -7, dir * len, -4);
  ctx.arc(dir * len, 0, 4, -Math.PI / 2, Math.PI / 2, dir === -1);
  ctx.quadraticCurveTo(dir * len * 0.5, 6, 0, 10);
  ctx.closePath();
  ctx.fill();

  // Top bark highlight
  ctx.strokeStyle = branch.vanishOnComplete
    ? 'rgba(253, 230, 138, 0.45)'
    : 'rgba(215, 204, 200, 0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(dir * 6, -6.5);
  ctx.quadraticCurveTo(dir * len * 0.5, -5, dir * (len - 8), -2.5);
  ctx.stroke();

  if (branch.vanishOnComplete) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(dir * (len - 2), 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const leafMain = branch.vanishOnComplete ? '#f59e0b' : branch.isExtra ? '#34d399' : '#4ade80';
  const leafVein = branch.vanishOnComplete ? '#b45309' : '#15803d';
  const leafAlt = branch.vanishOnComplete ? '#fbbf24' : branch.isExtra ? '#10b981' : '#22c55e';

  const swayLeaf = Math.sin(time * 2.1 + branch.id) * 0.08;
  drawLeaf(ctx, dir * 18, 9, (dir === 1 ? 0.65 : Math.PI - 0.65) + swayLeaf, 14, leafMain, leafVein);
  drawLeaf(ctx, dir * (len - 10), -3, (dir === 1 ? -0.55 : Math.PI + 0.55) - swayLeaf, 13, leafAlt, leafVein);
  drawLeaf(ctx, dir * (len - 4), 2, (dir === 1 ? 0.35 : Math.PI - 0.35) + swayLeaf, 11, leafMain, leafVein);

  ctx.restore();
}

export function drawBird(
  ctx: CanvasRenderingContext2D,
  cache: RendererCache,
  x: number,
  y: number,
  bird: Bird,
  scale: number,
  dir: 1 | -1,
  time: number,
  selected: boolean,
  flying: boolean,
  wingPhase: number,
  celebrating: boolean
) {
  const sp = BIRD_SPECIES[bird.species];

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * scale, scale);

  if (bird.wakeAnim > 0) {
    ctx.globalAlpha = bird.wakeAnim * 0.9;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -18, (1 - bird.wakeAnim) * 32 + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (selected) {
    ctx.fillStyle = 'rgba(254, 249, 195, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, -16, 22, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const breath = flying ? 0 : Math.sin(time * 3.1 + bird.breathOffset);
  ctx.scale(1 - breath * 0.018, 1 + breath * 0.028);

  if (!flying) {
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.lineTo(-5, 3);
    ctx.moveTo(-8, 3);
    ctx.lineTo(-2, 3);
    ctx.moveTo(5, -2);
    ctx.lineTo(5, 3);
    ctx.moveTo(2, 3);
    ctx.lineTo(8, 3);
    ctx.stroke();
  }

  if (bird.sleeping) {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-12, -10);
    ctx.lineTo(-24, -15);
    ctx.lineTo(-21, -7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = cache.sleepGrad || '#334155';
    ctx.beginPath();
    ctx.ellipse(0, -16, 16, 15.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(-3, -14, 10, 7, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(6.5, -20, 3.6, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(13, -18);
    ctx.lineTo(18, -16.5);
    ctx.lineTo(13, -14.5);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.scale(dir, 1);
    const zFloat = Math.sin(time * 2.4 + bird.breathOffset) * 2.5;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.font = Z_FONT_SMALL;
    ctx.fillText('z', 5 * dir, -34 + zFloat);
    ctx.font = Z_FONT_LARGE;
    ctx.fillText('Z', 10 * dir, -41 - zFloat * 0.6);
    ctx.restore();

    ctx.restore();
    return;
  }

  // Tail feathers
  ctx.fillStyle = sp.bodyShade;
  ctx.beginPath();
  ctx.moveTo(-11, -11);
  ctx.lineTo(-26, -18);
  ctx.lineTo(-24, -12);
  ctx.lineTo(-27, -8);
  ctx.lineTo(-12, -6);
  ctx.closePath();
  ctx.fill();

  // Head Crest / Ears
  ctx.fillStyle = sp.crest;
  if (sp.crestStyle === 'pointed') {
    ctx.beginPath();
    ctx.moveTo(-4, -31);
    ctx.lineTo(-10, -45);
    ctx.lineTo(4, -33);
    ctx.closePath();
    ctx.fill();
  } else if (sp.crestStyle === 'tuft') {
    ctx.beginPath();
    ctx.arc(-1, -35, 5.5, 0, Math.PI * 2);
    ctx.arc(4, -34, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (sp.crestStyle === 'double') {
    ctx.beginPath();
    ctx.moveTo(-2, -31);
    ctx.quadraticCurveTo(-8, -44, -12, -41);
    ctx.quadraticCurveTo(-5, -35, 1, -32);
    ctx.moveTo(2, -32);
    ctx.quadraticCurveTo(-1, -43, -5, -43);
    ctx.quadraticCurveTo(2, -36, 5, -31);
    ctx.fill();
  } else if (sp.crestStyle === 'round') {
    ctx.beginPath();
    ctx.ellipse(1, -33, 9, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (sp.crestStyle === 'crown') {
    ctx.beginPath();
    ctx.moveTo(-6, -30);
    ctx.lineTo(-7, -41);
    ctx.lineTo(-1, -35);
    ctx.lineTo(2, -43);
    ctx.lineTo(5, -35);
    ctx.lineTo(9, -40);
    ctx.lineTo(7, -30);
    ctx.closePath();
    ctx.fill();
  } else if (sp.crestStyle === 'curl') {
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.bezierCurveTo(-10, -46, -16, -34, -8, -32);
    ctx.closePath();
    ctx.fill();
  } else if (sp.crestStyle === 'toucan') {
    ctx.beginPath();
    ctx.ellipse(-2, -33, 7, 3.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (sp.crestStyle === 'owl') {
    ctx.beginPath();
    ctx.moveTo(-10, -28);
    ctx.lineTo(-14, -40);
    ctx.lineTo(-4, -32);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -32);
    ctx.lineTo(10, -40);
    ctx.lineTo(11, -28);
    ctx.closePath();
    ctx.fill();
  }

  // Main rounded body using cached species gradient
  ctx.fillStyle = cache.speciesBodyGrads[bird.species] || sp.bodyMain;
  ctx.beginPath();
  ctx.ellipse(0, -17, 16.5, 16.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Belly patch
  ctx.fillStyle = sp.belly;
  ctx.beginPath();
  ctx.ellipse(4.5, -11, 10.5, 9.5, -0.15, 0, Math.PI * 2);
  ctx.fill();

  if (sp.crestStyle === 'owl') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6.5, -21, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sp.crest;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (sp.crestStyle === 'pointed') {
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(9, -20.5, 6.2, 4.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beak
  ctx.fillStyle = sp.beak;
  const mouthOpen = celebrating || selected ? 2.2 : 0;
  if (sp.crestStyle === 'toucan') {
    ctx.beginPath();
    ctx.moveTo(14, -23);
    ctx.quadraticCurveTo(28, -23, 27, -15 - mouthOpen * 0.4);
    ctx.lineTo(14, -15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(24.5, -17.5, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (sp.crestStyle === 'round') {
    ctx.beginPath();
    ctx.moveTo(14, -22);
    ctx.quadraticCurveTo(23, -21, 21, -13);
    ctx.quadraticCurveTo(17, -16, 14, -16);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(14, -21.5);
    ctx.lineTo(22.5, -18.5 - mouthOpen * 0.5);
    ctx.lineTo(14, -17);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -17.5);
    ctx.lineTo(21, -16.5 + mouthOpen);
    ctx.lineTo(14, -14.5);
    ctx.closePath();
    ctx.fill();
  }

  // Cheek blush
  ctx.fillStyle = sp.cheek;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.ellipse(4.5, -15.5, 3.4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Eye
  const isBlinking = !flying && !celebrating && bird.blinkTimer < 0.12;
  if (celebrating) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(7.5, -20.5, 3.5, Math.PI + 0.25, -0.25);
    ctx.stroke();
  } else if (isBlinking) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4.5, -21);
    ctx.lineTo(10.5, -21);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(7.5, -21.5, sp.crestStyle === 'owl' ? 3.8 : 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8.6, -22.6, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6.6, -20.6, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wing
  ctx.save();
  ctx.translate(-3, -16);
  const flapAngle = flying
    ? Math.sin(wingPhase) * 0.95 - 0.35
    : celebrating
    ? Math.sin(time * 18 + bird.breathOffset) * 0.65 - 0.25
    : -0.08 + breath * 0.04;
  ctx.rotate(flapAngle);
  ctx.fillStyle = sp.wing;
  ctx.beginPath();
  ctx.ellipse(-3, 2, 10.5, 6.2, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, pool: ParticlePool) {
  const items = pool.items;
  const count = pool.activeCount;
  for (let i = 0; i < count; i++) {
    const p = items[i];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.alpha < 0 ? 0 : p.alpha > 1 ? 1 : p.alpha;

    if (p.kind === 'sparkle') {
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(0, 0, s, 0);
      ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0);
      ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fill();
    } else if (p.kind === 'feather') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.1, p.size * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'leaf') {
      drawLeaf(ctx, -p.size * 0.5, 0, 0, p.size, p.color, 'rgba(0,0,0,0.2)');
    } else if (p.kind === 'note') {
      ctx.fillStyle = p.color;
      const fontIdx = Math.max(NOTE_FONT_MIN, Math.min(NOTE_FONT_MAX, Math.round(p.size * 2.1)));
      ctx.font = NOTE_FONTS[fontIdx];
      ctx.textAlign = 'center';
      ctx.fillText('♪', 0, 0);
    } else if (p.kind === 'heart') {
      ctx.fillStyle = p.color;
      const s = p.size * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.6);
      ctx.bezierCurveTo(-s * 1.4, -s * 0.4, -s * 0.7, -s * 1.5, 0, -s * 0.5);
      ctx.bezierCurveTo(s * 0.7, -s * 1.5, s * 1.4, -s * 0.4, 0, s * 0.6);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Reusable scratch object to avoid per-bird allocation in renderGameFrame
const scratchPos: { x: number; y: number; dir: 1 | -1 } = { x: 0, y: 0, dir: 1 };

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  cache: RendererCache,
  state: RenderContextState
) {
  const {
    width,
    height,
    dpr,
    time,
    branches,
    selectedBranchId,
    selectedGroupCount,
    freeMoveActive,
    flyingPool,
    departingPool,
    particlePool,
    motes,
  } = state;

  cache.ensureCtxResources(ctx, width, height, dpr);
  drawDynamicAtmosphere(ctx, cache, width, height, time, motes);

  let activeCount = 0;
  let selectedBranch: Branch | undefined;
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (!b.removed) activeCount++;
    if (b.id === selectedBranchId) selectedBranch = b;
  }

  const birdScale = getBirdScale(width, height, activeCount);
  const selectedTopSpecies =
    selectedBranch && selectedBranch.birds.length > 0
      ? selectedBranch.birds[selectedBranch.birds.length - 1].species
      : null;

  // Draw all branches
  for (let i = 0; i < branches.length; i++) {
    const br = branches[i];
    if (br.removed) continue;
    let isValidTarget = false;
    if (selectedBranch && br.id !== selectedBranch.id && !br.completing && br.birds.length < BRANCH_CAPACITY) {
      if (freeMoveActive) {
        isValidTarget = true;
      } else if (
        br.birds.length === 0 ||
        (selectedTopSpecies !== null && br.birds[br.birds.length - 1].species === selectedTopSpecies)
      ) {
        isValidTarget = true;
      }
    }
    drawBranch(ctx, cache, br, br.id === selectedBranchId, isValidTarget, time);
  }

  // Build O(1) lookup set for flying bird UIDs without closure allocations
  cache.inFlightUids.clear();
  for (let i = 0; i < flyingPool.activeCount; i++) {
    cache.inFlightUids.add(flyingPool.items[i].bird.uid);
  }

  // Draw perched birds
  for (let bIdx = 0; bIdx < branches.length; bIdx++) {
    const br = branches[bIdx];
    if (br.removed) continue;
    const shakeX = br.shakeTime > 0 ? Math.sin(br.shakeTime * 48) * 5 : 0;

    for (let i = 0; i < br.birds.length; i++) {
      const bird = br.birds[i];
      if (cache.inFlightUids.has(bird.uid)) continue;

      getBirdSlotPosition(br, i, width, scratchPos);
      const isSelectedBird =
        br.id === selectedBranchId && i >= br.birds.length - selectedGroupCount;

      const liftY = isSelectedBird
        ? -16 - Math.abs(Math.sin(time * 5.2)) * 4
        : 0;

      const distFromTrunk = Math.abs(scratchPos.x - br.x);
      const swayY = Math.sin(br.swayAngle) * distFromTrunk * 0.6;

      drawBird(
        ctx,
        cache,
        scratchPos.x + shakeX,
        scratchPos.y + liftY + swayY,
        bird,
        birdScale,
        scratchPos.dir,
        time,
        isSelectedBird,
        false,
        0,
        br.completing
      );
    }
  }

  // Draw departing flocks
  for (let fIdx = 0; fIdx < departingPool.activeCount; fIdx++) {
    const flock = departingPool.items[fIdx];
    const t = flock.elapsed;
    for (let i = 0; i < flock.birds.length; i++) {
      const b = flock.birds[i];
      const baseX = flock.slotXs[i];
      const baseY = flock.startY;

      if (t < flock.celebrateDuration) {
        const p = t / flock.celebrateDuration;
        const hop = Math.abs(Math.sin(p * Math.PI * 3 + i * 0.5)) * 18;
        drawBird(ctx, cache, baseX, baseY - hop, b, birdScale, flock.dir, time, false, false, 0, true);
      } else {
        const flyT = Math.max(0, (t - flock.celebrateDuration - i * 0.055) / flock.flyDuration);
        const eased = flyT * flyT;
        const centerX = width * 0.5;
        const curX = baseX + (centerX - baseX) * Math.min(1, flyT * 0.65) + Math.sin(flyT * 8 + i) * 14;
        const curY = baseY - eased * (baseY + 110);
        const flyDir: 1 | -1 = centerX >= baseX ? 1 : -1;
        drawBird(
          ctx,
          cache,
          curX,
          curY,
          b,
          birdScale * (1 - Math.min(0.25, flyT * 0.25)),
          flyDir,
          time,
          false,
          true,
          time * 28 + i * 1.1,
          true
        );
      }
    }
  }

  // Draw birds currently flying along parabolic arc
  for (let i = 0; i < flyingPool.activeCount; i++) {
    const fb = flyingPool.items[i];
    if (fb.progress < 0) continue;
    const t = fb.progress > 1 ? 1 : fb.progress;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = fb.fromX + (fb.toX - fb.fromX) * ease;
    const linearY = fb.fromY + (fb.toY - fb.fromY) * ease;
    const dist = Math.hypot(fb.toX - fb.fromX, fb.toY - fb.fromY);
    const arcHeight = Math.min(115, Math.max(46, dist * 0.34));
    const y = linearY - Math.sin(t * Math.PI) * arcHeight;

    const travelDir: 1 | -1 =
      Math.abs(fb.toX - fb.fromX) > 6
        ? fb.toX > fb.fromX
          ? 1
          : -1
        : fb.toDir;

    drawBird(
      ctx,
      cache,
      x,
      y,
      fb.bird,
      birdScale * (1 + Math.sin(t * Math.PI) * 0.08),
      travelDir,
      time,
      false,
      true,
      time * 32 + fb.bird.uid,
      false
    );
  }

  drawParticles(ctx, particlePool);
}
