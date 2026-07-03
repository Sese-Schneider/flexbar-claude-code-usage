import { SKRSContext2D, createCanvas } from '@napi-rs/canvas';

import { MetricSnapshot, formatTimeUntilReset } from './usage';

const KEY_HEIGHT = 60;

const COLORS = {
  background: '#1c1917',
  label: '#a8a29e',
  text: '#fafaf9',
  subtext: '#78716c',
  barTrack: '#3f3b38',
  chipBg: '#2e2a27',
  claude: '#d97757',
  eye: '#1c1917',
};

// Bar color stops: green at 0%, orange at 75%, red at 100%
const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [0x61, 0xaa, 0x5c]],
  [75, [0xe0, 0x8c, 0x3c]],
  [100, [0xd9, 0x53, 0x4f]],
];

const FONT = 'Arial, "Segoe UI", "Helvetica Neue", sans-serif';

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

/** Draws a small Claude robot mascot into the given square area. */
export function drawRobot(ctx: SKRSContext2D, x: number, y: number, size: number) {
  const s = size / 40; // designed on a 40x40 grid

  // antenna
  ctx.strokeStyle = COLORS.claude;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(x + 20 * s, y + 9 * s);
  ctx.lineTo(x + 20 * s, y + 4 * s);
  ctx.stroke();
  ctx.fillStyle = COLORS.claude;
  ctx.beginPath();
  ctx.arc(x + 20 * s, y + 3.5 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.beginPath();
  ctx.roundRect(x + 6 * s, y + 9 * s, 28 * s, 22 * s, 6 * s);
  ctx.fill();

  // eyes
  ctx.fillStyle = COLORS.eye;
  ctx.beginPath();
  ctx.roundRect(x + 13 * s, y + 15 * s, 4 * s, 9 * s, 2 * s);
  ctx.roundRect(x + 23 * s, y + 15 * s, 4 * s, 9 * s, 2 * s);
  ctx.fill();

  // feet
  ctx.fillStyle = COLORS.claude;
  ctx.beginPath();
  ctx.roundRect(x + 10 * s, y + 32 * s, 7 * s, 5 * s, 2.5 * s);
  ctx.roundRect(x + 23 * s, y + 32 * s, 7 * s, 5 * s, 2.5 * s);
  ctx.fill();
}

/** Renders the Claude robot as a standalone icon (transparent background). */
export function renderRobotIcon(size: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawRobot(ctx, 0, 0, size);
  return canvas.toBuffer('image/png');
}

function drawChip(ctx: SKRSContext2D, rightX: number, y: number, label: string) {
  ctx.font = `bold 10px ${FONT}`;
  const textWidth = ctx.measureText(label).width;
  const padX = 6;
  const height = 16;
  const width = textWidth + padX * 2;
  const x = rightX - width;

  ctx.fillStyle = COLORS.chipBg;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  ctx.strokeStyle = COLORS.barTrack;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = COLORS.label;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padX, y + height / 2 + 1);
}

export type RenderOptions = {
  showResetTime: boolean;
  showRobot: boolean;
};

/**
 * Renders a usage meter key face, clawdmeter style: optional robot mascot on
 * the left, a prominent percentage above the progress bar, the reset
 * countdown below it, and a tag chip naming the limit in the top right.
 */
export function renderUsageKey(
  width: number,
  snapshot: MetricSnapshot,
  options: RenderOptions
): string {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);

  const padding = 10;
  let contentX = padding;

  if (options.showRobot) {
    const robotSize = 40;
    drawRobot(ctx, padding - 2, (KEY_HEIGHT - robotSize) / 2, robotSize);
    contentX = padding + robotSize + 6;
  }

  // percentage, prominent
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${snapshot.percent}%`, contentX, 3);

  // tag chip, top right
  drawChip(ctx, width - padding, 6, snapshot.label);

  // progress bar
  const barHeight = 7;
  const barY = 33;
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

  // reset countdown, below the bar
  if (options.showResetTime) {
    const reset = formatTimeUntilReset(snapshot.resetsAt);
    if (reset) {
      ctx.fillStyle = COLORS.subtext;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Resets ${reset}`, contentX, 46);
    }
  }

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
