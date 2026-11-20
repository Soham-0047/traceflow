import { describe, expect, it } from 'vitest';
import { SiteRequestError, createTokenRequester, normalizeSiteUrl, tokenSiteFromEnv } from '../src/index.js';

function recordingFetch(status = 200, body: unknown = { ok: true }, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      headers: { get: (name: string) => headers[name] ?? null },
      json: async () => body,
    };
  }) as unknown as typeof fetch;
  return { fake, calls };
}

describe('the API-token site requester', () => {
  it('sends Basic auth to the site origin and returns the JSON body', async () => {
    const { fake, calls } = recordingFetch(200, { issues: [] });
    const requester = createTokenRequester({ siteUrl: 'https://s.atlassian.net/', email: 'me@example.com', apiToken: 'tok', fetch: fake });
    await expect(requester.jira('/rest/api/3/search/jql?jql=x')).resolves.toEqual({ issues: [] });
    expect(calls[0]!.url).toBe('https://s.atlassian.net/rest/api/3/search/jql?jql=x');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa('me@example.com:tok')}`);
    expect(calls[0]!.init.redirect).toBe('error');
  });

  it('refuses paths that could send the token elsewhere', async () => {
    const { fake, calls } = recordingFetch();
    const requester = createTokenRequester({ siteUrl: 'https://s.atlassian.net', email: 'e', apiToken: 't', fetch: fake });
    await expect(requester.jira('https://evil.example/rest/x')).rejects.toThrow(/Refusing/);
    await expect(requester.jira('//evil.example/rest/x')).rejects.toThrow(/Refusing/);
    await expect(requester.confluence('/rest/api/3/myself')).rejects.toThrow(/Refusing/);
    expect(calls).toHaveLength(0);
  });

  it('maps failures to status errors without leaking the token', async () => {
    const { fake } = recordingFetch(401, {});
    const requester = createTokenRequester({ siteUrl: 'https://s.atlassian.net', email: 'e', apiToken: 'secret-token', fetch: fake, retry: false });
    const error = await requester.confluence('/wiki/api/v2/pages?limit=1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteRequestError);
    expect((error as SiteRequestError).status).toBe(401);
    expect(String((error as Error).message)).not.toContain('secret-token');
  });

  it('accepts only https site URLs without credentials', () => {
    expect(normalizeSiteUrl(' https://s.atlassian.net/wiki ')).toBe('https://s.atlassian.net');
    expect(() => normalizeSiteUrl('http://s.atlassian.net')).toThrow(/https/);
    expect(() => normalizeSiteUrl('https://u:p@s.atlassian.net')).toThrow(/credentials/);
    expect(() => normalizeSiteUrl('not a url')).toThrow(/Not a URL/);
  });

  it('reads all three variables from the environment, or none', () => {
    expect(tokenSiteFromEnv({})).toBeUndefined();
    expect(tokenSiteFromEnv({ ATLASSIAN_SITE_URL: 'https://s', ATLASSIAN_EMAIL: 'e', ATLASSIAN_API_TOKEN: 't' })).toEqual({
      siteUrl: 'https://s',
      email: 'e',
      apiToken: 't',
    });
    expect(() => tokenSiteFromEnv({ ATLASSIAN_SITE_URL: 'https://s' })).toThrow(/missing: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN/);
  });
});
