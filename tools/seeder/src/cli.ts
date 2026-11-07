import { sampleGraph } from '@traceflow/core';
import { AtlassianClient } from './atlassian';
import { planSeed, summarizeOps } from './plan';
import type { SeederConfig } from './atlassian';
import { storyFromGraph } from './story';

/**
 * Seed a dev site with the TraceFlow demo story (TF-05).
 *
 * Dry run (default):  npm run seed -w @traceflow/seeder
 * Apply for real:     npm run seed -w @traceflow/seeder -- --apply
 *
 * Environment:
 *   SEED_SITE        e.g. https://your-site.atlassian.net
 *   SEED_EMAIL       the Atlassian account email
 *   SEED_API_TOKEN   an API token for that account (never commit it)
 *   SEED_PROJECT_KEY Jira project that receives the issues (create it first)
 *   SEED_SPACE_KEY   Confluence space that receives the pages (create it first)
 *   SEED_MAP         optional "alex=<accountId>,sam=<accountId>" for assignees
 */

function readEnv(): { config: SeederConfig; map: Record<string, string> } {
  const required = ['SEED_SITE', 'SEED_EMAIL', 'SEED_API_TOKEN', 'SEED_PROJECT_KEY', 'SEED_SPACE_KEY'] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}. See the header of src/cli.ts.`);
    process.exit(1);
  }
  const map: Record<string, string> = {};
  for (const pair of (process.env.SEED_MAP ?? '').split(',').filter(Boolean)) {
    const [person, accountId] = pair.split('=').map((s) => s.trim());
    if (person && accountId) map[person] = accountId;
  }
  return {
    config: {
      site: process.env.SEED_SITE!.replace(/\/$/, ''),
      email: process.env.SEED_EMAIL!,
      apiToken: process.env.SEED_API_TOKEN!,
      projectKey: process.env.SEED_PROJECT_KEY!,
      spaceKey: process.env.SEED_SPACE_KEY!,
    },
    map,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const { config, map } = readEnv();
  const client = new AtlassianClient(config);

  console.log(`Reading the current state of ${config.site} (project ${config.projectKey}, space ${config.spaceKey})...`);
  const state = await client.fetchState();

  const story = storyFromGraph(sampleGraph);
  const ops = planSeed(story, state, { map });

  if (ops.length === 0) {
    console.log('Nothing to do: the site already holds the full demo story.');
    return;
  }

  console.log(`Plan (${ops.length} operation(s)):`);
  for (const [op, count] of Object.entries(summarizeOps(ops))) {
    console.log(`  ${op}: ${count}`);
  }
  for (const op of ops) {
    const detail =
      op.op === 'create-page'
        ? `"${op.title}"`
        : op.op === 'create-issue'
          ? `${op.issue.type}: ${op.issue.summary}`
          : op.op === 'assign-issue'
            ? `${op.key} (${op.summary})`
            : op.op === 'transition-issue'
              ? `${op.key} (${op.summary}) to done`
              : `${op.key} (${op.summary}) -> "${op.pageTitle}"`;
    console.log(`  - ${op.op}: ${detail}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to create the missing records.');
    return;
  }

  console.log('\nApplying...');
  const log = await client.apply(ops, map);
  for (const line of log) console.log(`  ${line}`);
  console.log(`\nDone: ${log.length} record(s) touched. Re-run any time; it will not duplicate.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
