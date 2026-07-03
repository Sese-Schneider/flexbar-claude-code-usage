import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = 'Claude Code-credentials';

function candidatePaths(customPath?: string): string[] {
  const paths: string[] = [];
  if (customPath) paths.push(customPath);
  if (process.env.CLAUDE_CREDENTIALS_PATH) {
    paths.push(process.env.CLAUDE_CREDENTIALS_PATH);
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    paths.push(join(process.env.CLAUDE_CONFIG_DIR, '.credentials.json'));
  }
  paths.push(join(homedir(), '.claude', '.credentials.json'));
  return paths;
}

function extractAccessToken(json: string): string | null {
  const parsed = JSON.parse(json);
  if (typeof parsed.accessToken === 'string') return parsed.accessToken;
  for (const value of Object.values(parsed)) {
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).accessToken === 'string'
    ) {
      return (value as Record<string, string>).accessToken;
    }
  }
  return null;
}

async function readTokenFromKeychain(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-w',
    ]);
    const raw = stdout.trim();
    if (!raw) return null;
    // Keychain stores the same JSON blob as .credentials.json
    if (raw.startsWith('{')) return extractAccessToken(raw);
    return raw;
  } catch {
    return null;
  }
}

/**
 * Resolves the Claude Code OAuth access token.
 *
 * Tokens rotate roughly every hour (Claude Code refreshes the store itself),
 * so this must be called on every poll rather than cached.
 */
export async function getAccessToken(
  customPath?: string
): Promise<string | null> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  for (const path of candidatePaths(customPath)) {
    try {
      const token = extractAccessToken(await readFile(path, 'utf-8'));
      if (token) return token;
    } catch {
      // file missing or unreadable, try next candidate
    }
  }

  if (process.platform === 'darwin') {
    return readTokenFromKeychain();
  }

  return null;
}
