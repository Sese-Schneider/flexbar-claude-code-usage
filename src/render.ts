import { createCanvas } from '@napi-rs/canvas';

import { MetricSnapshot, formatTimeUntilReset } from './usage';

const KEY_HEIGHT = 60;

const COLORS = {
  background: '#1c1917',
  label: '#a8a29e',
  text: '#fafaf9',
  subtext: '#78716c',
  barTrack: '#3f3b38',
  normal: '#61aa5c',
  warning: '#e08c3c',
  critical: '#d9534f',
  claude: '#d97757',
};

const FONT = 'Arial, "Segoe UI", "Helvetica Neue", sans-serif';

function severityColor(severity: MetricSnapshot['severity']): string {
  if (severity === 'critical') return COLORS.critical;
  if (severity === 'warning') return COLORS.warning;
  return COLORS.normal;
}

/**
 * Renders a usage meter key face: label + reset countdown on the left,
 * a large percentage on the right, and a progress bar along the bottom.
 */
export function renderUsageKey(
  width: number,
  snapshot: MetricSnapshot,
  showResetTime: boolean
): string {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);

  const padding = 10;
  const barHeight = 6;
  const barY = KEY_HEIGHT - barHeight - 6;
  const barWidth = width - padding * 2;

  // label
  ctx.fillStyle = COLORS.label;
  ctx.font = `600 13px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(snapshot.label, padding, 7, width / 2);

  // reset countdown
  if (showResetTime) {
    const reset = formatTimeUntilReset(snapshot.resetsAt);
    if (reset) {
      ctx.fillStyle = COLORS.subtext;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(`resets ${reset}`, padding, 25, width / 2);
    }
  }

  // percentage
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${snapshot.percent}%`, width - padding, 6);

  // progress bar
  ctx.fillStyle = COLORS.barTrack;
  ctx.beginPath();
  ctx.roundRect(padding, barY, barWidth, barHeight, barHeight / 2);
  ctx.fill();

  const fillWidth = Math.max(barHeight, (barWidth * snapshot.percent) / 100);
  ctx.fillStyle = severityColor(snapshot.severity);
  ctx.beginPath();
  ctx.roundRect(padding, barY, fillWidth, barHeight, barHeight / 2);
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
