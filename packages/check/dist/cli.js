#!/usr/bin/env node

// src/cli.ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ../core/src/errors.ts
var TraceFlowError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TraceFlowError";
  }
};
var ValidationError = class extends TraceFlowError {
  issues;
  constructor(issues, context = "input") {
    super(`${issues.length} validation error(s) in ${context}:
${formatIssues(issues)}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
};
function formatIssues(issues, cap = 20) {
  const shown = issues.slice(0, cap);
  const lines = shown.map((i) => `  - ${i.path}: ${i.message}`);
  if (issues.length > cap) lines.push(`  - \u2026and ${issues.length - cap} more`);
  return lines.join("\n");
}

// ../core/src/validate.ts
var LIMITS = {
  /** OrgGraph JSON exports accepted by parseOrgGraphJson. */
  maxJsonBytes: 50 * 1024 * 1024,
  maxPeople: 1e4,
  maxWorkItems: 5e4,
  maxPages: 5e4,
  maxPullRequests: 25e3,
  maxDecisions: 25e3,
  /** Sum of all five collections. */
  maxRecordsTotal: 1e5,
  maxIdLength: 200,
  maxTitleLength: 500,
  maxNameLength: 300,
  maxUrlLength: 2e3,
  /** Per-record link lists (linkedPageIds, linkedPullRequestIds, linkedWorkItemIds). */
  maxLinkedIdsPerRecord: 200,
  maxContributorsPerPage: 500,
  maxReviewersPerPullRequest: 200,
  /** Issues listed in one ValidationError message. */
  maxIssuesInMessage: 20
};
var SOURCES = ["jira", "confluence", "bitbucket", "teamwork-graph"];
var WORK_TYPES = ["epic", "story", "task", "bug", "other"];
var WORK_STATUSES = ["open", "done"];
var PR_STATES = ["open", "merged", "declined"];
var DECISION_STATUSES = ["proposed", "approved", "superseded"];
var DANGEROUS_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function hasControlChars(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 31 || c === 127 || c >= 128 && c <= 159) return true;
  }
  return false;
}
function checkString(value, path, what, max, issues, opts = {}) {
  if (typeof value !== "string") {
    issues.push({ level: "error", path, message: `${what} must be a string, got ${typeof value}` });
    return false;
  }
  if (!opts.allowEmpty && value.length === 0) {
    issues.push({ level: "error", path, message: `${what} must not be empty` });
    return false;
  }
  if (value.length > max) {
    issues.push({ level: "error", path, message: `${what} is ${value.length} characters; the cap is ${max}` });
    return false;
  }
  if (hasControlChars(value)) {
    issues.push({ level: "error", path, message: `${what} contains control characters` });
    return false;
  }
  return true;
}
function checkEnum(value, path, what, allowed, issues) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      level: "error",
      path,
      message: `${what} must be one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`
    });
    return false;
  }
  return true;
}
function checkIdList(value, path, what, issues, max = LIMITS.maxLinkedIdsPerRecord) {
  if (!Array.isArray(value)) {
    issues.push({ level: "error", path, message: `${what} must be an array of ids` });
    return false;
  }
  if (value.length > max) {
    issues.push({ level: "error", path, message: `${what} has ${value.length} entries; the cap is ${max}` });
    return false;
  }
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    if (!checkString(value[i], `${path}[${i}]`, `${what} entry`, LIMITS.maxIdLength, issues)) ok = false;
  }
  return ok;
}
function checkDangerousKeys(obj, path, issues) {
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      issues.push({ level: "error", path: `${path}.${key}`, message: `dangerous property name '${key}' is not allowed` });
    }
  }
}
function checkRef(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ level: "error", path, message: "ref must be an object" });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = true;
  if (!checkEnum(value.source, `${path}.source`, "ref.source", SOURCES, issues)) ok = false;
  if (!checkString(value.id, `${path}.id`, "ref.id", LIMITS.maxIdLength, issues)) ok = false;
  if (!checkString(value.title, `${path}.title`, "ref.title", LIMITS.maxTitleLength, issues)) ok = false;
  if (value.url !== void 0 && !checkString(value.url, `${path}.url`, "ref.url", LIMITS.maxUrlLength, issues)) ok = false;
  return ok;
}
function checkPerson(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ level: "error", path, message: "person must be an object" });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = true;
  if (!checkString(value.id, `${path}.id`, "person.id", LIMITS.maxIdLength, issues)) ok = false;
  if (!checkString(value.name, `${path}.name`, "person.name", LIMITS.maxNameLength, issues)) ok = false;
  return ok;
}
function checkWorkItem(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ level: "error", path, message: "work item must be an object" });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (value.type !== void 0 && !checkEnum(value.type, `${path}.type`, "work item type", WORK_TYPES, issues)) ok = false;
  if (value.assigneeId !== void 0 && !checkString(value.assigneeId, `${path}.assigneeId`, "assigneeId", LIMITS.maxIdLength, issues)) ok = false;
  if (!checkEnum(value.status, `${path}.status`, "work item status", WORK_STATUSES, issues)) ok = false;
  if (value.epicId !== void 0 && !checkString(value.epicId, `${path}.epicId`, "epicId", LIMITS.maxIdLength, issues)) ok = false;
  if (value.linkedPageIds !== void 0 && !checkIdList(value.linkedPageIds, `${path}.linkedPageIds`, "linkedPageIds", issues)) ok = false;
  if (value.linkedPullRequestIds !== void 0 && !checkIdList(value.linkedPullRequestIds, `${path}.linkedPullRequestIds`, "linkedPullRequestIds", issues)) ok = false;
  return ok;
}
function checkPage(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ level: "error", path, message: "page must be an object" });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (!checkIdList(value.contributorIds, `${path}.contributorIds`, "contributorIds", issues, LIMITS.maxContributorsPerPage)) ok = false;
  return ok;
}
function checkPullRequest(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ level: "error", path, message: "pull request must be an object" });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (!checkString(value.authorId, `${path}.authorId`, "authorId", LIMITS.maxIdLength, issues)) ok = false;
  if (!checkEnum(value.state, `${path}.state`, "pull request state", PR_STATES, issues)) ok = false;
  if (!checkIdList(value.reviewerIds, `${path}.reviewerIds`, "reviewerIds", issues, LIMITS.maxReviewersPerPullRequest)) ok = false;
  return ok;
}
function checkDecision(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ level: "error", path, message: "decision must be an object" });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (!checkString(value.ownerId, `${path}.ownerId`, "ownerId", LIMITS.maxIdLength, issues)) ok = false;
  if (!checkEnum(value.status, `${path}.status`, "decision status", DECISION_STATUSES, issues)) ok = false;
  if (!checkIdList(value.pendingApproverIds, `${path}.pendingApproverIds`, "pendingApproverIds", issues)) ok = false;
  if (value.linkedWorkItemIds !== void 0 && !checkIdList(value.linkedWorkItemIds, `${path}.linkedWorkItemIds`, "linkedWorkItemIds", issues)) ok = false;
  return ok;
}
function validateGraph(input) {
  const errors = [];
  const warnings = [];
  const push = (issue) => {
    (issue.level === "error" ? errors : warnings).push(issue);
  };
  if (!isPlainObject(input)) {
    push({ level: "error", path: "$", message: `an OrgGraph must be an object, got ${typeof input}` });
    return { ok: false, errors, warnings };
  }
  checkDangerousKeys(input, "$", errors);
  const collection = (name, cap) => {
    const value = input[name];
    if (!Array.isArray(value)) {
      push({ level: "error", path: `$.${name}`, message: `${name} must be an array, got ${typeof value}` });
      return [];
    }
    if (value.length > cap) {
      push({ level: "error", path: `$.${name}`, message: `${name} has ${value.length} records; the cap is ${cap}` });
    }
    return value;
  };
  const people = collection("people", LIMITS.maxPeople);
  const workItems = collection("workItems", LIMITS.maxWorkItems);
  const pages = collection("pages", LIMITS.maxPages);
  const pullRequests = collection("pullRequests", LIMITS.maxPullRequests);
  const decisions = collection("decisions", LIMITS.maxDecisions);
  const total = people.length + workItems.length + pages.length + pullRequests.length + decisions.length;
  if (total > LIMITS.maxRecordsTotal) {
    push({ level: "error", path: "$", message: `graph has ${total} records in total; the cap is ${LIMITS.maxRecordsTotal}` });
  }
  const personOk = people.map((p, i) => checkPerson(p, `$.people[${i}]`, errors));
  const workOk = workItems.map((w, i) => checkWorkItem(w, `$.workItems[${i}]`, errors));
  const pageOk = pages.map((p, i) => checkPage(p, `$.pages[${i}]`, errors));
  const prOk = pullRequests.map((p, i) => checkPullRequest(p, `$.pullRequests[${i}]`, errors));
  const decisionOk = decisions.map((d, i) => checkDecision(d, `$.decisions[${i}]`, errors));
  const dupes = (records, okFlags, name, idOf) => {
    const seen = /* @__PURE__ */ new Map();
    records.forEach((record, i) => {
      if (!okFlags[i]) return;
      const id = idOf(record);
      if (typeof id !== "string") return;
      const first = seen.get(id);
      if (first === void 0) {
        seen.set(id, i);
      } else {
        push({
          level: "error",
          path: `$.${name}[${i}]`,
          message: `duplicate id '${id}' (first seen at $.${name}[${first}])`
        });
      }
    });
  };
  dupes(people, personOk, "people", (p) => p.id);
  dupes(workItems, workOk, "workItems", (w) => w.ref.id);
  dupes(pages, pageOk, "pages", (p) => p.ref.id);
  dupes(pullRequests, prOk, "pullRequests", (p) => p.ref.id);
  dupes(decisions, decisionOk, "decisions", (d) => d.ref.id);
  const personIds = /* @__PURE__ */ new Set();
  people.forEach((p, i) => {
    if (personOk[i]) personIds.add(p.id);
  });
  const workIds = /* @__PURE__ */ new Set();
  const epicIds = /* @__PURE__ */ new Set();
  workItems.forEach((w, i) => {
    if (!workOk[i]) return;
    const item = w;
    workIds.add(item.ref.id);
    if (item.type === "epic") epicIds.add(item.ref.id);
  });
  const pageOrDecisionIds = /* @__PURE__ */ new Set();
  pages.forEach((p, i) => {
    if (pageOk[i]) pageOrDecisionIds.add(p.ref.id);
  });
  decisions.forEach((d, i) => {
    if (decisionOk[i]) pageOrDecisionIds.add(d.ref.id);
  });
  const prIds = /* @__PURE__ */ new Set();
  pullRequests.forEach((p, i) => {
    if (prOk[i]) prIds.add(p.ref.id);
  });
  const warnDangling = (path, id, what) => {
    warnings.push({ level: "warning", path, message: `${what} '${id}' does not exist in this graph; the reference will be dropped` });
  };
  workItems.forEach((w, i) => {
    if (!workOk[i]) return;
    const item = w;
    if (item.assigneeId !== void 0 && !personIds.has(item.assigneeId)) {
      warnDangling(`$.workItems[${i}].assigneeId`, item.assigneeId, "assigneeId");
    }
    if (item.epicId !== void 0 && !epicIds.has(item.epicId)) {
      warnDangling(`$.workItems[${i}].epicId`, item.epicId, "epicId");
    }
    (item.linkedPageIds ?? []).forEach((id, j) => {
      if (!pageOrDecisionIds.has(id)) warnDangling(`$.workItems[${i}].linkedPageIds[${j}]`, id, "linked page or decision");
    });
    (item.linkedPullRequestIds ?? []).forEach((id, j) => {
      if (!prIds.has(id)) warnDangling(`$.workItems[${i}].linkedPullRequestIds[${j}]`, id, "linked pull request");
    });
  });
  decisions.forEach((d, i) => {
    if (!decisionOk[i]) return;
    const decision = d;
    if (decision.ownerId !== void 0 && !personIds.has(decision.ownerId)) {
      warnDangling(`$.decisions[${i}].ownerId`, decision.ownerId, "decision owner");
    }
    (decision.pendingApproverIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.decisions[${i}].pendingApproverIds[${j}]`, id, "pending approver");
    });
    (decision.linkedWorkItemIds ?? []).forEach((id, j) => {
      if (!workIds.has(id)) warnDangling(`$.decisions[${i}].linkedWorkItemIds[${j}]`, id, "linked work item");
    });
  });
  pages.forEach((p, i) => {
    if (!pageOk[i]) return;
    (p.contributorIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.pages[${i}].contributorIds[${j}]`, id, "contributor");
    });
  });
  pullRequests.forEach((p, i) => {
    if (!prOk[i]) return;
    const pr = p;
    if (pr.authorId !== void 0 && !personIds.has(pr.authorId)) {
      warnDangling(`$.pullRequests[${i}].authorId`, pr.authorId, "pull request author");
    }
    (pr.reviewerIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.pullRequests[${i}].reviewerIds[${j}]`, id, "reviewer");
    });
  });
  return { ok: errors.length === 0, errors, warnings };
}
function strictGraph(input, context = "input") {
  const report = validateGraph(input);
  if (!report.ok) throw new ValidationError(report.errors, context);
  return { graph: input, warnings: report.warnings };
}
function parseOrgGraphJson(text, context = "OrgGraph export") {
  if (typeof text !== "string") {
    throw new ValidationError([{ path: "$", message: `expected a JSON string, got ${typeof text}` }], context);
  }
  if (text.length > LIMITS.maxJsonBytes) {
    throw new ValidationError(
      [{ path: "$", message: `export is ${text.length} bytes; the cap is ${LIMITS.maxJsonBytes}` }],
      context
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(
      [{ path: "$", message: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` }],
      context
    );
  }
  const { graph, warnings } = strictGraph(parsed, context);
  return { graph, warnings };
}

// ../core/src/graph-index.ts
function pushTo(map, key, value) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}
function buildGraphIndex(graph) {
  const peopleById = /* @__PURE__ */ new Map();
  for (const person of graph.people) if (!peopleById.has(person.id)) peopleById.set(person.id, person);
  const workById = /* @__PURE__ */ new Map();
  const epics = [];
  const childrenByEpic = /* @__PURE__ */ new Map();
  const workByLinkedPageId = /* @__PURE__ */ new Map();
  const workByLinkedPullRequestId = /* @__PURE__ */ new Map();
  for (const item of graph.workItems) {
    if (!workById.has(item.ref.id)) workById.set(item.ref.id, item);
    if (item.type === "epic") {
      epics.push(item);
    } else if (item.epicId) {
      pushTo(childrenByEpic, item.epicId, item);
    }
    for (const pageId of item.linkedPageIds ?? []) pushTo(workByLinkedPageId, pageId, item);
    for (const prId of item.linkedPullRequestIds ?? []) pushTo(workByLinkedPullRequestId, prId, item);
  }
  const pagesById = /* @__PURE__ */ new Map();
  for (const page of graph.pages) if (!pagesById.has(page.ref.id)) pagesById.set(page.ref.id, page);
  const decisionsById = /* @__PURE__ */ new Map();
  const decisionsByLinkedWorkItemId = /* @__PURE__ */ new Map();
  for (const decision of graph.decisions) {
    if (!decisionsById.has(decision.ref.id)) decisionsById.set(decision.ref.id, decision);
    for (const workId of decision.linkedWorkItemIds ?? []) {
      pushTo(decisionsByLinkedWorkItemId, workId, decision);
    }
  }
  const pullRequestsById = /* @__PURE__ */ new Map();
  for (const pr of graph.pullRequests) {
    if (!pullRequestsById.has(pr.ref.id)) pullRequestsById.set(pr.ref.id, pr);
  }
  return {
    peopleById,
    workById,
    epics,
    childrenByEpic,
    pagesById,
    decisionsById,
    pullRequestsById,
    workByLinkedPageId,
    workByLinkedPullRequestId,
    decisionsByLinkedWorkItemId
  };
}
var INDEX_CACHE = /* @__PURE__ */ new WeakMap();
function getIndex(graph) {
  const cached = INDEX_CACHE.get(graph);
  if (cached) return cached;
  const index = buildGraphIndex(graph);
  INDEX_CACHE.set(graph, index);
  return index;
}
function fnv1a(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
var sortedUniq = (ids) => ids ? [...new Set(ids)].sort() : [];
function graphFingerprint(graph) {
  const key = (source, id) => `${source}:${id}`;
  const parts = [];
  const emit = (label, lines) => {
    lines.sort();
    parts.push(`${label}|${lines.length}|${lines.join(";")}`);
  };
  emit("people", graph.people.map((p) => `${p.id}=${p.name}`));
  emit("work", graph.workItems.map(
    (w) => JSON.stringify([
      key(w.ref.source, w.ref.id),
      w.ref.title,
      w.type ?? null,
      w.assigneeId ?? null,
      w.status,
      w.epicId ?? null,
      sortedUniq(w.linkedPageIds),
      sortedUniq(w.linkedPullRequestIds)
    ])
  ));
  emit("pages", graph.pages.map(
    (p) => JSON.stringify([key(p.ref.source, p.ref.id), p.ref.title, sortedUniq(p.contributorIds)])
  ));
  emit("prs", graph.pullRequests.map(
    (p) => JSON.stringify([
      key(p.ref.source, p.ref.id),
      p.ref.title,
      p.authorId,
      p.state,
      sortedUniq(p.reviewerIds)
    ])
  ));
  emit("decisions", graph.decisions.map(
    (d) => JSON.stringify([
      key(d.ref.source, d.ref.id),
      d.ref.title,
      d.ownerId,
      d.status,
      sortedUniq(d.pendingApproverIds),
      sortedUniq(d.linkedWorkItemIds)
    ])
  ));
  const canonical = parts.join("\n");
  return `${fnv1a(canonical, 2166136261)}${fnv1a(canonical, 16777619)}`;
}

// ../core/src/pipeline.ts
function runPipelineOnJson(text, options = {}) {
  const { graph, warnings } = parseOrgGraphJson(text, options.context ?? "OrgGraph export");
  return {
    graph,
    index: getIndex(graph),
    fingerprint: graphFingerprint(graph),
    warnings,
    rejected: []
  };
}

// ../core/src/query.ts
var ANSWERABLE_QUESTIONS = [
  { intent: "overview", example: "Give me an overview of the organization", description: "Record counts, top risks, epics by gaps, coverage caveats" },
  { intent: "top-risks", example: "What are the biggest knowledge risks right now?", description: "Everyone ranked by knowledge-risk score" },
  { intent: "person-risk", example: "What is the risk around Alex Rivera?", description: "One person: findings, points, suggested actions, caveats" },
  { intent: "person-impact", example: "What breaks if Alex leaves?", description: "The blast radius of one person: epics, work, pages, decisions, changes" },
  { intent: "epic-lineage", example: "Trace the epic PAY-1", description: "Intent, plan, work and code records behind an epic, plus gaps" },
  { intent: "decision-trace", example: "What is the status of the idempotency decision?", description: "One decision: linked work, people and roles, findings" }
];
var SUGGESTIONS = ANSWERABLE_QUESTIONS.map((q) => q.example);

// src/gate.ts
function checkPullRequest2(graph, prId) {
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
  let graphText;
  try {
    graphText = readFileSync(graphPath, "utf8");
  } catch (err) {
    return {
      code: 2,
      text: `Cannot read the OrgGraph at ${graphPath}: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  try {
    const { graph } = runPipelineOnJson(graphText, { context: graphPath });
    const result = checkPullRequest2(graph, prId);
    return {
      code: result.verdict === "pass" ? 0 : 1,
      text: json ? JSON.stringify(result, null, 2) : human(result),
      result
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { code: 2, text: `The OrgGraph at ${graphPath} is not valid:
${err.message}` };
    }
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
