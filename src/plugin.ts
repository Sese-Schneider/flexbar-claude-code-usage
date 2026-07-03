import { logger, plugin } from '@eniac/flexdesigner';

import { UsageError, fetchUsage } from './api';
import { renderMessageKey, renderUsageKey } from './render';
import { Config, Metric, UsageData } from './types';
import { getMetricSnapshot } from './usage';

const USAGE_CID = 'dev.sese.flexbar_claude_code_usage.usage';
const DEFAULT_POLL_INTERVAL = 180;
const MIN_POLL_INTERVAL = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Key = any;

const aliveKeys = new Map<string, Key[]>();

let config: Config | null = null;
let lastUsage: UsageData | null = null;
let lastError: string | null = null;
let pollTimer: NodeJS.Timeout | null = null;

async function getConfigCached(): Promise<Config> {
  if (config) return config;
  try {
    config = ((await plugin.getConfig()) as Config) ?? {};
  } catch (error) {
    logger?.warn('Could not load plugin config, using defaults:', error);
    return {};
  }
  return config;
}

function keyWidth(key: Key): number {
  return key.width || key.style?.width || 240;
}

function drawKey(serialNumber: string, key: Key) {
  let image: string;

  if (lastUsage) {
    const metric: Metric = key.data?.metric || 'session';
    const snapshot = getMetricSnapshot(lastUsage, metric);
    image = snapshot
      ? renderUsageKey(
          keyWidth(key),
          snapshot,
          key.data?.showResetTime !== false
        )
      : renderMessageKey(
          keyWidth(key),
          'Claude Code',
          'No data for this limit'
        );
  } else {
    image = renderMessageKey(
      keyWidth(key),
      'Claude Code',
      lastError ?? 'Loading…'
    );
  }

  try {
    plugin.draw(serialNumber, key, 'base64', image);
  } catch (error) {
    logger?.error('Error drawing key:', error);
  }
}

function drawAll() {
  for (const [serialNumber, keys] of aliveKeys) {
    for (const key of keys) {
      drawKey(serialNumber, key);
    }
  }
}

async function refresh() {
  const cfg = await getConfigCached();
  try {
    lastUsage = await fetchUsage(cfg.credentialsPath);
    lastError = null;
  } catch (error) {
    lastError = error instanceof UsageError ? error.message : `${error}`;
    logger?.error('Failed to fetch Claude usage:', error);
    if (!(error instanceof UsageError && error.code === 'rate-limited')) {
      lastUsage = null;
    }
  }
  drawAll();
}

function pollIntervalMs(): number {
  const seconds = Number(config?.pollInterval) || DEFAULT_POLL_INTERVAL;
  return Math.max(MIN_POLL_INTERVAL, seconds) * 1000;
}

function ensurePolling(restart = false) {
  if (pollTimer && !restart) return;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, pollIntervalMs());
}

/**
 * Called when a plugin key is loaded onto a device page
 */
plugin.on('plugin.alive', async payload => {
  const keys = payload.keys.filter((key: Key) => key.cid === USAGE_CID);
  aliveKeys.set(payload.serialNumber, keys);
  if (keys.length === 0) return;

  ensurePolling();
  if (lastUsage) {
    drawAll();
  } else {
    await refresh();
  }
});

/**
 * Called when the user presses a key: force an immediate refresh
 */
plugin.on('plugin.data', async payload => {
  if (payload.data?.key?.cid !== USAGE_CID) return;
  await refresh();
});

/**
 * Called when received message from UI send by this.$fd.sendToBackend
 */
plugin.on('ui.message', async payload => {
  logger?.info('Received message from UI:', payload.data);

  if (payload.data === 'test-connection') {
    try {
      const usage = await fetchUsage(payload.config?.credentialsPath);
      const session = getMetricSnapshot(usage, 'session');
      const weekly = getMetricSnapshot(usage, 'weekly');
      return {
        success: true,
        session: session?.percent ?? null,
        weekly: weekly?.percent ?? null,
      };
    } catch (error) {
      const message = error instanceof UsageError ? error.message : `${error}`;
      return { success: false, error: message };
    }
  }
});

/**
 * Called when the global plugin config changes
 */
plugin.on('plugin.config.updated', async (payload: { config?: Config }) => {
  config = payload?.config ?? {};
  ensurePolling(true);
  await refresh();
});

// Connect to flexdesigner and start the plugin
plugin.start();
