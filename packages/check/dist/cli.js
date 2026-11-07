#!/usr/bin/env node

// src/cli.ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// src/gate.ts
function checkPullRequest(graph, prId) {
  const pr = graph.pullRequests.find(
    (p) => p.ref.id.toLowerCase() === prId.trim().toLowerCase()
  );
  if (!pr) {
    const known = graph.pullRequests.map((p) => p.ref.id).join(", ") || "none";
    throw new Error(
      `No pull request matches '${prId}' in the connected data. Known pull requests: ${known}.`
    );
  }
  const linkedItems = graph.workItems.filter(
    (w) => (w.linkedPullRequestIds ?? []).some((id) => id.toLowerCase() === pr.ref.id.toLowerCase())
  );
  const reasons = [];
  if (linkedItems.length === 0) {
    reasons.push({
      level: "error",
      message: "No work item links to this pull request, so the change has no recorded provenance from code to intent.",
      evidence: [pr.ref]
    });
  } else {
    reasons.push({
      level: "info",
      message: `The change is linked to ${linkedItems.length} work item(s): ${linkedItems.map((w) => w.ref.id).join(", ")}.`,
      evidence: linkedItems.map((w) => w.ref)
    });
    for (const item of linkedItems) {
      const decisions = graph.decisions.filter(
        (d) => (d.linkedWorkItemIds ?? []).some((id) => id === item.ref.id)
      );
      const superseded = decisions.filter((d) => d.status === "superseded");
      const live = decisions.filter((d) => d.status !== "superseded");
      if (superseded.length > 0) {
        for (const decision of superseded) {
          reasons.push({
            level: "error",
            message: `${item.ref.id} implements '${decision.ref.title}', but that decision is superseded: the code is built on a replaced intent.`,
            evidence: [item.ref, decision.ref]
          });
        }
      }
      if (live.length > 0) {
        reasons.push({
          level: "info",
          message: `${item.ref.id} is covered by ${live.length} live decision(s): ${live.map((d) => `${d.ref.title} (${d.status})`).join("; ")}.`,
          evidence: live.map((d) => d.ref)
        });
      }
      if (decisions.length === 0) {
        reasons.push({
          level: "info",
          message: `${item.ref.id} is not linked to any recorded decision; intent is the work item itself.`,
          evidence: [item.ref]
        });
      }
    }
  }
  return {
    pr: pr.ref,
    verdict: reasons.some((r) => r.level === "error") ? "fail" : "pass",
    reasons
  };
}

// src/cli.ts
var USAGE = `usage: traceflow-check --graph <path-to-orggraph.json> --pr <id> [--json]

Checks one pull request against an OrgGraph export:
  pass  the change traces to recorded work, and no linked work implements a superseded decision
  fail  no work item links to the change, or linked work implements a superseded decision

Exit codes: 0 pass, 1 fail, 2 usage or data error.`;
function human(result) {
  const lines = [
    `${result.pr.title} (${result.pr.source}:${result.pr.id}): ${result.verdict}`
  ];
  for (const reason of result.reasons) {
    lines.push(`${reason.level === "error" ? "ERROR" : "info"}: ${reason.message}`);
    for (const e of reason.evidence) {
      lines.push(`  evidence: ${e.source}:${e.id} \u2014 ${e.title}`);
    }
  }
  return lines.join("\n");
}
function main(argv) {
  let graphPath = "";
  let prId = "";
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--graph" && argv[i + 1]) graphPath = argv[++i] ?? "";
    else if (arg === "--pr" && argv[i + 1]) prId = argv[++i] ?? "";
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") return { code: 0, text: USAGE };
    else return { code: 2, text: `Unknown argument: ${arg}

${USAGE}` };
  }
  if (!graphPath || !prId) {
    return { code: 2, text: `Both --graph and --pr are required.

${USAGE}` };
  }
  let graph;
  try {
    graph = JSON.parse(readFileSync(graphPath, "utf8"));
  } catch (err) {
    return {
      code: 2,
      text: `Cannot read the OrgGraph at ${graphPath}: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  try {
    const result = checkPullRequest(graph, prId);
    return {
      code: result.verdict === "pass" ? 0 : 1,
      text: json ? JSON.stringify(result, null, 2) : human(result),
      result
    };
  } catch (err) {
    return { code: 2, text: err instanceof Error ? err.message : String(err) };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = main(process.argv.slice(2));
  if (outcome.text) console.log(outcome.text);
  process.exitCode = outcome.code;
}
export {
  main
};
