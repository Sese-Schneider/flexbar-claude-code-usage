import { getAccessToken } from './credentials';
import { UsageData } from './types';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

// The usage endpoint sits behind the Claude Code OAuth beta; requests without
// a claude-code user agent land in an aggressively rate-limited bucket.
const HEADERS = {
  'anthropic-beta': 'oauth-2025-04-20',
  'Content-Type': 'application/json',
  'User-Agent': 'claude-code/2.1.5',
};

export class UsageError extends Error {
  constructor(
    message: string,
    public readonly code:
      'no-credentials' | 'unauthorized' | 'rate-limited' | 'http' | 'network',
    /** Seconds until the rate limit lifts, from the Retry-After header. */
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export async function fetchUsage(credentialsPath?: string): Promise<UsageData> {
  const token = await getAccessToken(credentialsPath);
  if (!token) {
    throw new UsageError(
      'No Claude Code credentials found. Log in with Claude Code first.',
      'no-credentials'
    );
  }

  let response: Response;
  try {
    response = await fetch(USAGE_URL, {
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    throw new UsageError(`Network error: ${error}`, 'network');
  }

  if (response.status === 401) {
    throw new UsageError(
      'Claude Code token expired — run any claude command in a terminal to refresh it.',
      'unauthorized'
    );
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new UsageError(
      'Rate limited by the usage endpoint.',
      'rate-limited',
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    );
  }
  if (!response.ok) {
    throw new UsageError(
      `Usage request failed with HTTP ${response.status}`,
      'http'
    );
  }

  return (await response.json()) as UsageData;
}
