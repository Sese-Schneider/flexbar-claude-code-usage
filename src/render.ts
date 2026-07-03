import { Image, SKRSContext2D, createCanvas, loadImage } from '@napi-rs/canvas';

import { CLAWD_PNG_BASE64 } from './clawd';
import { MetricSnapshot, formatTimeUntilReset } from './usage';

const KEY_HEIGHT = 60;

const COLORS = {
  background: '#1c1917',
  label: '#a8a29e',
  text: '#fafaf9',
  chipText: '#e7e5e4',
  barTrack: '#3f3b38',
  chipBg: '#2e2a27',
  claude: '#d97757',
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

let clawdImage: Promise<Image> | null = null;

/**
 * The official Clawd artwork (background removed), decoded once.
 * Image decoding in @napi-rs/canvas is asynchronous — drawing in the same
 * tick as `img.src = ...` silently produces nothing, hence loadImage.
 */
function getClawdImage(): Promise<Image> {
  if (!clawdImage) {
    clawdImage = loadImage(Buffer.from(CLAWD_PNG_BASE64, 'base64'));
  }
  return clawdImage;
}

/** Renders Clawd as a standalone square icon (transparent background). */
export async function renderClawdIcon(size: number): Promise<Buffer> {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = await getClawdImage();
  const scale = Math.min(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toBuffer('image/png');
}

/** Draws the tag chip right-aligned at rightX; returns its left edge. */
function drawChip(
  ctx: SKRSContext2D,
  rightX: number,
  y: number,
  label: string
): number {
  ctx.font = `bold 12px ${FONT}`;
  const textWidth = ctx.measureText(label).width;
  const padX = 9;
  const height = 22;
  const width = textWidth + padX * 2;
  const x = rightX - width;

  ctx.fillStyle = COLORS.chipBg;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.strokeStyle = COLORS.barTrack;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = COLORS.chipText;
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
export async function renderUsageKey(
  width: number,
  snapshot: MetricSnapshot,
  options: RenderOptions
): Promise<string> {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = options.bgColor || COLORS.background;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);

  const padding = 12;
  let contentX = padding;

  if (options.showClawd) {
    const img = await getClawdImage();
    const clawdHeight = 34;
    const clawdWidth = (img.width / img.height) * clawdHeight;
    ctx.drawImage(
      img,
      padding - 2,
      (KEY_HEIGHT - clawdHeight) / 2,
      clawdWidth,
      clawdHeight
    );
    contentX = padding - 2 + clawdWidth + 14;
  }

  // tag chip, top right
  const chipX = drawChip(ctx, width - padding, 7, snapshot.label);

  // percentage, prominent
  const textBaseline = 28;
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const percentText = `${snapshot.percent}%`;
  ctx.fillText(percentText, contentX, textBaseline);
  const percentWidth = ctx.measureText(percentText).width;

  // reset countdown, right of the percentage; moves below the bar when the
  // top row is too tight (e.g. with Clawd on a narrow key)
  if (options.showResetTime) {
    const reset = formatTimeUntilReset(snapshot.resetsAt);
    if (reset) {
      const resetX = contentX + percentWidth + 10;
      const maxWidth = chipX - resetX - 8;
      ctx.fillStyle = COLORS.label;
      ctx.font = `12px ${FONT}`;
      const text = `Resets ${reset}`;
      if (ctx.measureText(text).width <= maxWidth) {
        ctx.fillText(text, resetX, textBaseline);
      } else {
        ctx.font = `11px ${FONT}`;
        ctx.fillText(text, contentX, 58);
      }
    }
  }

  // progress bar
  const barHeight = 8;
  const barY = 38;
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
