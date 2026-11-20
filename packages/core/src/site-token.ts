import { SiteRequestError, parseRetryAfter, withRetry } from './site-loader.js';
import type { SiteRequester } from './site-loader.js';

/*
 * A SiteRequester for Atlassian Cloud's REST APIs with an API token (Basic auth
 * as email:token), for hosts that run outside Forge: the export CLI, the MCP
 * server's live source, and spike S1's raw-payload dump. Reads run with the
 * token owner's permissions.
 *
 * Uses the platform `fetch` (Node 18+, browsers), so the engine keeps its one
 * runtime dependency. The token is only ever placed in the Authorization
 * header: it never appears in an error message, a log line or a URL.
 *
 * UNVERIFIED against a live site until spike S1 (docs/SPIKES.md).
 */

export interface TokenSiteOptions {
  /** https://your-site.atlassian.net (https only: the token must never cross plain http). */
  siteUrl: string;
  email: string;
  apiToken: string;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Retry rate limits (default true). */
  retry?: boolean;
}

/** Normalize and check a site URL: https, no credentials, no path beyond '/'. */
export function normalizeSiteUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`Not a URL: ${raw}`);
  }
  if (url.protocol !== 'https:') throw new Error('The site URL must use https (an API token must never cross plain http).');
  if (url.username || url.password) throw new Error('The site URL must not contain credentials.');
  return url.origin;
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createTokenRequester(options: TokenSiteOptions): SiteRequester {
  const origin = normalizeSiteUrl(options.siteUrl);
  if (!options.email || !options.apiToken) throw new Error('An Atlassian account email and API token are required.');
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('No fetch implementation is available (Node 18+ is required).');
  const authorization = `Basic ${base64(`${options.email}:${options.apiToken}`)}`;

  const get = async (prefix: '/rest/' | '/wiki/', path: string): Promise<unknown> => {
    // Site-relative paths only: a crafted absolute URL could send the token elsewhere.
    if (!path.startsWith(prefix) || path.includes('://') || path.startsWith('//')) {
      throw new Error(`Refusing a path outside ${prefix}: ${path}`);
    }
    const response = await doFetch(`${origin}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: authorization },
      redirect: 'error',
    });
    if (!response.ok) {
      throw new SiteRequestError(
        response.status,
        path,
        `Upstream request failed: ${response.status} ${response.statusText} (${path.split('?')[0]})`,
        parseRetryAfter(response.headers.get('Retry-After')),
      );
    }
    return response.json();
  };

  const requester: SiteRequester = {
    jira: (path) => get('/rest/', path),
    confluence: (path) => get('/wiki/', path),
  };
  return options.retry === false ? requester : withRetry(requester);
}

/** The environment variables every token host reads. */
export const SITE_ENV = {
  siteUrl: 'ATLASSIAN_SITE_URL',
  email: 'ATLASSIAN_EMAIL',
  apiToken: 'ATLASSIAN_API_TOKEN',
} as const;

/** Read token-site options from an environment; undefined when none of the variables is set. */
export function tokenSiteFromEnv(env: Record<string, string | undefined>): TokenSiteOptions | undefined {
  const siteUrl = env[SITE_ENV.siteUrl];
  const email = env[SITE_ENV.email];
  const apiToken = env[SITE_ENV.apiToken];
  if (!siteUrl && !email && !apiToken) return undefined;
  const missing = Object.entries(SITE_ENV)
    .filter(([key]) => !{ siteUrl, email, apiToken }[key as keyof typeof SITE_ENV])
    .map(([, name]) => name);
  if (missing.length > 0) throw new Error(`Set all of ${Object.values(SITE_ENV).join(', ')}; missing: ${missing.join(', ')}.`);
  return { siteUrl: siteUrl!, email: email!, apiToken: apiToken! };
}
