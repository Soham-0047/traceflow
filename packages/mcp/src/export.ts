import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SITE_ENV,
  createTokenRequester,
  loadSiteGraph,
  runPipeline,
  tokenSiteFromEnv,
} from '@traceflow/core';
import type { OrgGraph, SiteLoadReport } from '@traceflow/core';

/*
 * traceflow-export: read a live Atlassian Cloud site with an API token and
 * write an OrgGraph export — the file the MCP server (TRACEFLOW_GRAPH) and the
 * check gate (--graph) consume. With --raw it also writes every raw REST
 * response, which is what spike S1 needs to diff the real payloads against
 * the shapes the loader was written from.
 *
 * The export passes the STRICT pipeline before it is written: a file that
 * would make a gate's verdict depend on silently dropped records is never
 * produced.
 */

export const EXPORT_USAGE = `Usage: traceflow-export [--out graph.json] [--raw DIR] [--jql "JQL"] [--max-issues N] [--max-pages N]

Reads a live Atlassian Cloud site and writes an OrgGraph export (stdout by default).

Environment (all three required):
  ${SITE_ENV.siteUrl}   https://your-site.atlassian.net
  ${SITE_ENV.email}      the account the API token belongs to
  ${SITE_ENV.apiToken}  https://id.atlassian.com/manage-profile/security/api-tokens

Options:
  --out FILE        write the export to FILE instead of stdout
  --raw DIR         also write every raw REST response to DIR (spike S1).
                    Raw responses contain your site's data: never commit them.
  --jql "JQL"       a bounded JQL query (default: issues updated in the last two years)
  --max-issues N    issue cap (default 500)
  --max-pages N     Confluence page cap (default 500)
  --help            show this help

Reads run with the token owner's permissions. Exit codes: 0 written, 1 read failed, 2 usage.`;

export interface ExportIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  writeFile: (path: string, text: string) => void;
  mkdir: (path: string) => void;
  fetch?: typeof fetch;
}

export const nodeIo: ExportIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  writeFile: (path, text) => writeFileSync(path, text),
  mkdir: (path) => mkdirSync(path, { recursive: true }),
};

interface ExportArgs {
  out?: string;
  raw?: string;
  jql?: string;
  maxIssues?: number;
  maxPages?: number;
  help?: boolean;
}

function parseArgs(argv: string[]): ExportArgs {
  const args: ExportArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
      return v;
    };
    const count = () => {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 1 || n > 50_000) throw new Error(`${flag} must be a whole number from 1 to 50000`);
      return n;
    };
    switch (flag) {
      case '--out':
        args.out = value();
        break;
      case '--raw':
        args.raw = value();
        break;
      case '--jql':
        args.jql = value();
        break;
      case '--max-issues':
        args.maxIssues = count();
        break;
      case '--max-pages':
        args.maxPages = count();
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return args;
}

/** A filesystem-safe name for one raw response. */
export function rawFileName(index: number, source: string, path: string): string {
  const slug = path
    .split('?')[0]!
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${String(index).padStart(4, '0')}-${source}-${slug}.json`;
}

export function formatReport(report: SiteLoadReport): string {
  const lines = [
    `traceflow-export: ${report.issues} issues, ${report.pages} pages, ${report.people} people (${report.calls.jira} Jira + ${report.calls.confluence} Confluence calls)`,
    ...report.truncated.map((t) => `traceflow-export: limit: ${t}`),
    ...report.warnings.map((w) => `traceflow-export: warning: ${w}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Run the export; returns the exit code. */
export async function runExport(argv: string[], env: Record<string, string | undefined>, io: ExportIo = nodeIo): Promise<number> {
  let args: ExportArgs;
  let site;
  try {
    args = parseArgs(argv);
    if (args.help) {
      io.stdout(`${EXPORT_USAGE}\n`);
      return 0;
    }
    site = tokenSiteFromEnv(env);
    if (!site) throw new Error(`Set ${Object.values(SITE_ENV).join(', ')} (see --help).`);
  } catch (err) {
    io.stderr(`traceflow-export: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let requester;
  try {
    requester = createTokenRequester({ ...site, ...(io.fetch ? { fetch: io.fetch } : {}) });
  } catch (err) {
    io.stderr(`traceflow-export: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let rawIndex = 0;
  if (args.raw) io.mkdir(args.raw);
  let graph: OrgGraph;
  try {
    const limits = {
      ...(args.maxIssues ? { maxIssues: args.maxIssues } : {}),
      ...(args.maxPages ? { maxPages: args.maxPages } : {}),
    };
    const result = await loadSiteGraph(requester, {
      siteUrl: site.siteUrl,
      ...(args.jql ? { jql: args.jql } : {}),
      limits,
      ...(args.raw
        ? {
            onResponse: (source: 'jira' | 'confluence', path: string, body: unknown) => {
              io.writeFile(join(args.raw!, rawFileName(++rawIndex, source, path)), `${JSON.stringify({ path, body }, null, 2)}\n`);
            },
          }
        : {}),
    });
    io.stderr(formatReport(result.report));
    graph = runPipeline(result.graph, { mode: 'strict', context: 'site export' }).graph;
  } catch (err) {
    io.stderr(`traceflow-export: the site could not be read: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const text = `${JSON.stringify(graph, null, 2)}\n`;
  if (args.out) {
    io.writeFile(args.out, text);
    io.stderr(`traceflow-export: wrote ${args.out}${args.raw ? ` and ${rawIndex} raw response(s) to ${args.raw}` : ''}\n`);
  } else {
    io.stdout(text);
  }
  return 0;
}
