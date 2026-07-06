import { logger, plugin } from '@eniac/flexdesigner';

import { UsageError, fetchUsage } from './api';
import { renderMessageKey, renderUsageKey } from './render';
import { Config, Metric, UsageData } from './types';
import { formatTimeUntilReset, getMetricSnapshot } from './usage';

const USAGE_CID = 'dev.sese.flexbar_claude_code_usage.usage';
const DEFAULT_POLL_INTERVAL = 180;
const MIN_POLL_INTERVAL = 60;
// Minimum gap between any two usage requests, so key presses and page
// switches cannot burst against the rate-limited endpoint
const MIN_FETCH_GAP_MS = 30_000;
// Fallback lockout when a 429 comes without a Retry-After header
const DEFAULT_LOCKOUT_SECONDS = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Key = any;

const aliveKeys = new Map<string, Key[]>();

let config: Config | null = null;
let lastUsage: UsageData | null = null;
let lastError: string | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let lockedUntil: number | null = null;
let lockTicker: NodeJS.Timeout | null = null;
let lastFetchAt = 0;
let inFlight: Promise<void> | null = null;

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

// FlexDesigner default background colors, which we replace with our own theme
const DEFAULT_BG_COLORS = ['#000000', '#040404', '#424242', '#4b4b4b'];

function userBgColor(key: Key): string | undefined {
  const bgColor = key.style?.bgColor;
  if (typeof bgColor !== 'string' || !bgColor) return undefined;
  if (DEFAULT_BG_COLORS.includes(bgColor.toLowerCase())) return undefined;
  return bgColor;
}

async function drawKey(serialNumber: string, key: Key) {
  let image: string;

  if (lockedUntil && Date.now() < lockedUntil) {
    const lift = formatTimeUntilReset(new Date(lockedUntil).toISOString());
    image = renderMessageKey(
      keyWidth(key),
      'Rate limited',
      `Usage data returns in ${lift}`
    );
  } else if (lastUsage) {
    const metric: Metric = key.data?.metric || 'session';
    const snapshot = getMetricSnapshot(lastUsage, metric);
    image = snapshot
      ? await renderUsageKey(keyWidth(key), snapshot, {
          showResetTime: key.data?.showResetTime !== false,
          showClawd: key.data?.showClawd === true,
          bgColor: userBgColor(key),
        })
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

async function drawAll() {
  for (const [serialNumber, keys] of aliveKeys) {
    for (const key of keys) {
      await drawKey(serialNumber, key);
    }
  }
}

function clearLock() {
  lockedUntil = null;
  if (lockTicker) {
    clearInterval(lockTicker);
    lockTicker = null;
  }
}

/**
 * Enters lockout for the given duration: no requests are made until it
 * expires (the window counts down server-side regardless of further
 * requests), and a ticker keeps the countdown on the keys fresh.
 */
function setLock(seconds: number) {
  lockedUntil = Date.now() + seconds * 1000;
  logger?.warn(`Usage endpoint rate limited, backing off for ${seconds}s`);
  if (lockTicker) clearInterval(lockTicker);
  lockTicker = setInterval(async () => {
    if (lockedUntil && Date.now() >= lockedUntil) {
      clearLock();
      await refresh();
    } else {
      await drawAll();
    }
  }, 15_000);
}

function hasAliveKeys(): boolean {
  for (const keys of aliveKeys.values()) {
    if (keys.length > 0) return true;
  }
  return false;
}

function refresh(): Promise<void> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function doRefresh() {
  const now = Date.now();
  if (lockedUntil && now < lockedUntil) {
    await drawAll();
    return;
  }
  if (now - lastFetchAt < MIN_FETCH_GAP_MS) return;
  if (!hasAliveKeys()) return;
  lastFetchAt = now;

  const cfg = await getConfigCached();
  try {
    lastUsage = await fetchUsage(cfg.credentialsPath);
    lastError = null;
    clearLock();
  } catch (error) {
    lastError = error instanceof UsageError ? error.message : `${error}`;
    logger?.error('Failed to fetch Claude usage:', error);
    if (error instanceof UsageError && error.code === 'rate-limited') {
      setLock(error.retryAfterSeconds ?? DEFAULT_LOCKOUT_SECONDS);
    } else {
      lastUsage = null;
    }
  }
  await drawAll();
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
    await drawAll();
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
    if (lockedUntil && Date.now() < lockedUntil) {
      const lift = formatTimeUntilReset(new Date(lockedUntil).toISOString());
      return { success: false, error: `Rate limited, retry in ${lift}` };
    }
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
