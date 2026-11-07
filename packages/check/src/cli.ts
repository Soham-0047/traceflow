import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runPipelineOnJson, ValidationError } from '@traceflow/core';
import { checkPullRequest } from './gate.js';
import type { CheckResult } from './gate.js';

/**
 * traceflow-check: gate a pull request on decision provenance.
 *
 * Exit codes: 0 = pass, 1 = fail (verdict), 2 = usage or data error.
 *
 * Usage:
 *   traceflow-check --graph ./graph.json --pr pr-31 [--json]
 */

export interface CliOutcome {
  code: 0 | 1 | 2;
  text: string;
  result?: CheckResult;
}

const USAGE = `usage: traceflow-check --graph <path-to-orggraph.json> --pr <id> [--json]

Checks one pull request against an OrgGraph export:
  pass  the change traces to recorded work, and no linked work implements a superseded decision
  fail  no work item links to the change, or linked work implements a superseded decision

Exit codes: 0 pass, 1 fail, 2 usage or data error.`;

function human(result: CheckResult): string {
  const lines = [
    `${result.pr.title} (${result.pr.source}:${result.pr.id}): ${result.verdict}`,
  ];
  for (const reason of result.reasons) {
    lines.push(`${reason.level === 'error' ? 'ERROR' : 'info'}: ${reason.message}`);
    for (const e of reason.evidence) {
      lines.push(`  evidence: ${e.source}:${e.id} — ${e.title}`);
    }
  }
  return lines.join('\n');
}

/** Parse arguments, load the graph, run the gate. No process side effects. */
export function main(argv: string[]): CliOutcome {
  let graphPath = '';
  let prId = '';
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--graph' && argv[i + 1]) graphPath = argv[++i] ?? '';
    else if (arg === '--pr' && argv[i + 1]) prId = argv[++i] ?? '';
    else if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') return { code: 0, text: USAGE };
    else return { code: 2, text: `Unknown argument: ${arg}\n\n${USAGE}` };
  }

  if (!graphPath || !prId) {
    return { code: 2, text: `Both --graph and --pr are required.\n\n${USAGE}` };
  }

  let graphText: string;
  try {
    graphText = readFileSync(graphPath, 'utf8');
  } catch (err) {
    return {
      code: 2,
      text: `Cannot read the OrgGraph at ${graphPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // The export goes through the validation pipeline: byte cap, JSON parse,
  // full OrgGraph validation. A gate must never run on silently-corrupt data,
  // so this is strict — every issue is listed with its path.
  try {
    const { graph } = runPipelineOnJson(graphText, { context: graphPath });
    const result = checkPullRequest(graph, prId);
    return {
      code: result.verdict === 'pass' ? 0 : 1,
      text: json ? JSON.stringify(result, null, 2) : human(result),
      result,
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { code: 2, text: `The OrgGraph at ${graphPath} is not valid:\n${err.message}` };
    }
    return { code: 2, text: err instanceof Error ? err.message : String(err) };
  }
}

// Run as a bin script (the esbuild bundle keeps this guard intact).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = main(process.argv.slice(2));
  if (outcome.text) console.log(outcome.text);
  process.exitCode = outcome.code;
}
