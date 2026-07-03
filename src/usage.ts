import { Metric, UsageData, UsageLimit } from './types';

export type MetricSnapshot = {
  percent: number;
  severity: 'normal' | 'warning' | 'critical';
  resetsAt: string | null;
  label: string;
};

function severityFromPercent(percent: number): MetricSnapshot['severity'] {
  if (percent >= 90) return 'critical';
  if (percent >= 70) return 'warning';
  return 'normal';
}

function normalizeSeverity(limit: UsageLimit): MetricSnapshot['severity'] {
  if (limit.severity === 'warning' || limit.severity === 'critical') {
    return limit.severity;
  }
  if (limit.severity === 'normal') return 'normal';
  return severityFromPercent(limit.percent);
}

function fromLimit(limit: UsageLimit, label: string): MetricSnapshot {
  return {
    percent: Math.max(0, Math.min(100, Math.round(limit.percent))),
    severity: normalizeSeverity(limit),
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
        severity: severityFromPercent(usage.five_hour.utilization),
        resetsAt: usage.five_hour.resets_at,
        label: 'SESSION',
      };
    }
    return null;
  }

  if (metric === 'weekly') {
    const limit = limits.find(l => l.kind === 'weekly_all');
    if (limit) return fromLimit(limit, 'WEEK');
    if (usage.seven_day) {
      return {
        percent: Math.round(usage.seven_day.utilization),
        severity: severityFromPercent(usage.seven_day.utilization),
        resetsAt: usage.seven_day.resets_at,
        label: 'WEEK',
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
      severity: severityFromPercent(window.utilization),
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
