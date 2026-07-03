import { SKRSContext2D, createCanvas } from '@napi-rs/canvas';

import { MetricSnapshot, formatTimeUntilReset } from './usage';

const KEY_HEIGHT = 60;

const COLORS = {
  background: '#1c1917',
  label: '#a8a29e',
  text: '#fafaf9',
  barTrack: '#3f3b38',
  chipBg: '#2e2a27',
  claude: '#d97757',
  dark: '#1c1917',
};

// Bar color stops: green at 0%, orange at 75%, red at 100%
const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [0x61, 0xaa, 0x5c]],
  [75, [0xe0, 0x8c, 0x3c]],
  [100, [0xd9, 0x53, 0x4f]],
];

const FONT = 'Arial, "Segoe UI", "Helvetica Neue", sans-serif';
const DEG = Math.PI / 180;

/** Interpolates the bar color along the green -> orange -> red gradient. */
export function percentToColor(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  let [lowStop, lowColor] = COLOR_STOPS[0];
  for (const [stop, color] of COLOR_STOPS) {
    if (p <= stop) {
      const range = stop - lowStop;
      const t = range === 0 ? 0 : (p - lowStop) / range;
      const mix = lowColor.map((c, i) => Math.round(c + (color[i] - c) * t));
      return `#${mix.map(c => c.toString(16).padStart(2, '0')).join('')}`;
    }
    lowStop = stop;
    lowColor = color;
  }
  return '#d9534f';
}

/** Draws Clawd, the Claude Code crab, into the given square area. */
export function drawClawd(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  size: number
) {
  const s = size / 40; // designed on a 40x40 grid
  ctx.fillStyle = COLORS.claude;
  ctx.strokeStyle = COLORS.claude;
  ctx.lineCap = 'round';

  // legs, three per side
  ctx.lineWidth = 2 * s;
  for (const [x1, y1, x2, y2] of [
    [12, 27, 6, 30],
    [13, 30, 8, 35],
    [16, 32, 13, 37],
    [28, 27, 34, 30],
    [27, 30, 32, 35],
    [24, 32, 27, 37],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + x1 * s, y + y1 * s);
    ctx.lineTo(x + x2 * s, y + y2 * s);
    ctx.stroke();
  }

  // arms up to the claws
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.moveTo(x + 13 * s, y + 20 * s);
  ctx.lineTo(x + 9 * s, y + 15 * s);
  ctx.moveTo(x + 27 * s, y + 20 * s);
  ctx.lineTo(x + 31 * s, y + 15 * s);
  ctx.stroke();

  // claws: pincer circles with an open wedge as the mouth
  ctx.beginPath();
  ctx.moveTo(x + 8 * s, y + 11 * s);
  ctx.arc(x + 8 * s, y + 11 * s, 6 * s, -50 * DEG, -130 * DEG);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 32 * s, y + 11 * s);
  ctx.arc(x + 32 * s, y + 11 * s, 6 * s, -50 * DEG, -130 * DEG);
  ctx.closePath();
  ctx.fill();

  // body
  ctx.beginPath();
  ctx.ellipse(x + 20 * s, y + 24 * s, 11 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.fillStyle = COLORS.dark;
  ctx.beginPath();
  ctx.roundRect(x + 15 * s, y + 19 * s, 3.2 * s, 8 * s, 1.6 * s);
  ctx.roundRect(x + 21.8 * s, y + 19 * s, 3.2 * s, 8 * s, 1.6 * s);
  ctx.fill();
}

/** Renders Clawd as a standalone icon (transparent background). */
export function renderClawdIcon(size: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawClawd(ctx, 0, 0, size);
  return canvas.toBuffer('image/png');
}

/** Draws the tag chip right-aligned at rightX; returns its left edge. */
function drawChip(
  ctx: SKRSContext2D,
  rightX: number,
  y: number,
  label: string
): number {
  ctx.font = `bold 11px ${FONT}`;
  const textWidth = ctx.measureText(label).width;
  const padX = 8;
  const height = 20;
  const width = textWidth + padX * 2;
  const x = rightX - width;

  ctx.fillStyle = COLORS.chipBg;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 5);
  ctx.fill();
  ctx.strokeStyle = COLORS.barTrack;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = COLORS.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + width / 2, y + height / 2 + 1);
  return x;
}

export type RenderOptions = {
  showResetTime: boolean;
  showClawd: boolean;
  bgColor?: string;
};

/**
 * Renders a usage meter key face, clawdmeter style: optional Clawd mascot on
 * the left, a prominent percentage with the reset countdown next to it, a tag
 * chip naming the limit in the top right, and the progress bar underneath.
 */
export function renderUsageKey(
  width: number,
  snapshot: MetricSnapshot,
  options: RenderOptions
): string {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = options.bgColor || COLORS.background;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);

  const padding = 12;
  let contentX = padding;

  if (options.showClawd) {
    const clawdSize = 40;
    drawClawd(ctx, padding - 4, (KEY_HEIGHT - clawdSize) / 2, clawdSize);
    contentX = padding + clawdSize + 4;
  }

  // tag chip, top right
  const chipX = drawChip(ctx, width - padding, 8, snapshot.label);

  // percentage, prominent
  const textBaseline = 28;
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const percentText = `${snapshot.percent}%`;
  ctx.fillText(percentText, contentX, textBaseline);
  const percentWidth = ctx.measureText(percentText).width;

  // reset countdown, right of the percentage
  if (options.showResetTime) {
    const reset = formatTimeUntilReset(snapshot.resetsAt);
    if (reset) {
      const resetX = contentX + percentWidth + 10;
      const maxWidth = chipX - resetX - 8;
      if (maxWidth > 20) {
        ctx.fillStyle = COLORS.label;
        ctx.font = `12px ${FONT}`;
        ctx.fillText(`Resets ${reset}`, resetX, textBaseline, maxWidth);
      }
    }
  }

  // progress bar
  const barHeight = 8;
  const barY = 40;
  const barWidth = width - padding - contentX;
  ctx.fillStyle = COLORS.barTrack;
  ctx.beginPath();
  ctx.roundRect(contentX, barY, barWidth, barHeight, barHeight / 2);
  ctx.fill();

  const fillWidth = Math.max(barHeight, (barWidth * snapshot.percent) / 100);
  ctx.fillStyle = percentToColor(snapshot.percent);
  ctx.beginPath();
  ctx.roundRect(contentX, barY, fillWidth, barHeight, barHeight / 2);
  ctx.fill();

  return canvas.toDataURL('image/png');
}

/** Renders an error/placeholder key face with a short message. */
export function renderMessageKey(
  width: number,
  title: string,
  message: string
): string {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);

  ctx.fillStyle = COLORS.claude;
  ctx.font = `600 13px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(title, 10, 10, width - 20);

  ctx.fillStyle = COLORS.label;
  ctx.font = `12px ${FONT}`;
  ctx.fillText(message, 10, 32, width - 20);

  return canvas.toDataURL('image/png');
}
