import { Metric, UsageData, UsageLimit } from './types';

export type MetricSnapshot = {
  percent: number;
  resetsAt: string | null;
  label: string;
};

function fromLimit(limit: UsageLimit, label: string): MetricSnapshot {
  return {
    percent: Math.max(0, Math.min(100, Math.round(limit.percent))),
    resetsAt: limit.resets_at,
    label,
  };
}

/**
 * Extracts the requested metric from a usage response. Prefers the rich
 * `limits` array and falls back to the flat `five_hour`/`seven_day` windows
 * for older/newer response shapes.
 */
export function getMetricSnapshot(
  usage: UsageData,
  metric: Metric
): MetricSnapshot | null {
  const limits = usage.limits ?? [];

  if (metric === 'session') {
    const limit = limits.find(l => l.kind === 'session');
    if (limit) return fromLimit(limit, 'SESSION');
    if (usage.five_hour) {
      return {
        percent: Math.round(usage.five_hour.utilization),
        resetsAt: usage.five_hour.resets_at,
        label: 'SESSION',
      };
    }
    return null;
  }

  if (metric === 'weekly') {
    const limit = limits.find(l => l.kind === 'weekly_all');
    if (limit) return fromLimit(limit, 'WEEKLY');
    if (usage.seven_day) {
      return {
        percent: Math.round(usage.seven_day.utilization),
        resetsAt: usage.seven_day.resets_at,
        label: 'WEEKLY',
      };
    }
    return null;
  }

  // weekly_model: the model-scoped weekly bucket (e.g. Opus/Fable)
  const scoped = limits.find(l => l.kind === 'weekly_scoped');
  if (scoped) {
    const model = scoped.scope?.model?.display_name;
    return fromLimit(scoped, model ? model.toUpperCase() : 'MODEL');
  }
  const window = usage.seven_day_opus ?? usage.seven_day_sonnet;
  if (window) {
    return {
      percent: Math.round(window.utilization),
      resetsAt: window.resets_at,
      label: usage.seven_day_opus ? 'OPUS' : 'SONNET',
    };
  }
  return null;
}

/** Formats the remaining time until a reset as a compact "3h 12m" string. */
export function formatTimeUntilReset(resetsAt: string | null): string {
  if (!resetsAt) return '';
  const remaining = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(remaining) || remaining <= 0) return 'now';

  const minutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
