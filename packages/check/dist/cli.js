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

// ../core/src/eval.ts
var EVAL_CORPUS = [
  /* ---------------- top risks ---------------- */
  { question: "What are the biggest knowledge risks right now?", expect: { understood: true, intent: "top-risks" } },
  { question: "Who are the riskiest people here?", expect: { understood: true, intent: "top-risks" } },
  { question: "Rank everyone by knowledge risk", expect: { understood: true, intent: "top-risks" } },
  { question: "Show me the top risks", expect: { understood: true, intent: "top-risks" } },
  { question: "Who is most at risk?", expect: { understood: true, intent: "top-risks" } },
  { question: "What are our main knowledge-continuity risks?", expect: { understood: true, intent: "top-risks" } },
  { question: "give me a ranking of people by risk", expect: { understood: true, intent: "top-risks" } },
  { question: "highest risk people", expect: { understood: true, intent: "top-risks" } },
  { question: "who should we worry about?", expect: { understood: true, intent: "top-risks" } },
  { question: "worst knowledge risks on the team", expect: { understood: true, intent: "top-risks" } },
  { question: "list the knowledge risks", expect: { understood: true, intent: "top-risks" } },
  { question: "anyone at risk around here?", expect: { understood: true, intent: "top-risks" } },
  /* ---------------- person risk ---------------- */
  { question: "What is the risk around Alex Rivera?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "risk around alex rivera", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "Tell me about alex", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "What is the risk around alex?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "How much risk does Sam Chen carry?", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "Risk report for Priya Nair", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  { question: "what do we know about priya", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  { question: "give me the risk profile for rivera", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "what is the risk around Alexs Rivera?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "risk around alex riveria", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "tell me about sam chen", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "sam chen risk", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "what is priya nair exposure to risk", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  { question: "knowledge risk for alex?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "how risky is sam?", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "who is alex rivera?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  /* ---------------- person impact ---------------- */
  { question: "What breaks if Alex leaves?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "What happens if Priya Nair leaves the team?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what do we lose if sam resigns?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "What breaks if Alex Rivera is unavailable?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "blast radius for alex", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "impact of losing priya", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "if alex got hit by a bus, what breaks?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "we are offboarding sam chen - what is affected?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "succession risk for alex", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what happens without alex rivera?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what would break if alexandra rivera left?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "handover plan for priya - what stalls?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what breaks if alex departs?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is affected if sam leaves?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if alex leaves tomorrow?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what happens to the open work if priya leaves?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  /* ---------------- epic lineage ---------------- */
  { question: "Trace the epic PAY-1", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "Show me the lineage of Payments reliability", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "trace pay-1", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "What is behind the Onboarding revamp epic?", expect: { understood: true, intent: "epic-lineage", epicId: "ONB-1" } },
  { question: "lineage for ONB-1", expect: { understood: true, intent: "epic-lineage", epicId: "ONB-1" } },
  { question: "Trace the onboarding revamp epic", expect: { understood: true, intent: "epic-lineage", epicId: "ONB-1" } },
  { question: "show me the intent behind the auth hardening epic", expect: { understood: true, intent: "epic-lineage", epicId: "AUTH-1" } },
  { question: "whats behind payments reliability?", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "trace the epic payments reliablity", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "lineage of the auth hardening epic", expect: { understood: true, intent: "epic-lineage", epicId: "AUTH-1" } },
  /* ---------------- epic impact ---------------- */
  { question: "What breaks if the Payments reliability epic changes?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "What happens if we cancel the onboarding revamp?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "impact of changing the auth hardening epic", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "What if PAY-1 gets descoped?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is affected if the payments epic changes?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "What are the top knowledge-continuity risks in the Payments reliability epic?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "blast radius of the auth hardening epic", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "what breaks if the onboarding revamp is cancelled?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "what happens to the work if auth hardening changes scope?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "risks in the payments reliability epic", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  /* ---------------- decision trace ---------------- */
  { question: "What is the status of the idempotency decision?", expect: { understood: true, intent: "decision-trace", decisionId: "d3" } },
  { question: "Tell me about the queue vs cron for retries decision", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "what happened with the token format decision?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "trace decision d2", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "status of decision d3?", expect: { understood: true, intent: "decision-trace", decisionId: "d3" } },
  { question: "what is the token format decision status?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "tell me about the idempotency key scope decision", expect: { understood: true, intent: "decision-trace", decisionId: "d3" } },
  { question: "what does the queue vs cron decision say?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "show me the retries decision", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "explain the idempotency decision", expect: { understood: true, intent: "decision-trace", decisionId: "d3" } },
  /* ---------------- decision impact ---------------- */
  { question: "What happens if the idempotency key scope decision changes?", expect: { understood: true, intent: "decision-impact", decisionId: "d3" } },
  { question: "What breaks if the token format decision changes?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "impact of superseding the queue vs cron decision", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "what if we reverse the idempotency key scope decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d3" } },
  { question: "what happens if decision d1 is superseded?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "blast radius of the token format decision", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "if the idempotency decision is reversed, what breaks?", expect: { understood: true, intent: "decision-impact", decisionId: "d3" } },
  { question: "what work is affected by a change to the queue vs cron decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  /* ---------------- overview ---------------- */
  { question: "Give me an overview of the organization", expect: { understood: true, intent: "overview" } },
  { question: "summarize the org for me", expect: { understood: true, intent: "overview" } },
  { question: "How healthy is the team?", expect: { understood: true, intent: "overview" } },
  { question: "state of the org", expect: { understood: true, intent: "overview" } },
  { question: "how are we doing?", expect: { understood: true, intent: "overview" } },
  { question: "give me a summary", expect: { understood: true, intent: "overview" } },
  { question: "show me the big picture", expect: { understood: true, intent: "overview" } },
  { question: "overview", expect: { understood: true, intent: "overview" } },
  { question: "give me a snapshot of the org", expect: { understood: true, intent: "overview" } },
  { question: "tell me about the team", expect: { understood: true, intent: "overview" } },
  /* ---------------- honest misses (correct behavior = refuse) ---------------- */
  { question: "what is the weather on mars?", expect: { understood: false } },
  { question: "who is the ceo?", expect: { understood: false } },
  { question: "what is for lunch?", expect: { understood: false } },
  { question: "tell me a joke", expect: { understood: false } },
  { question: "what is the meaning of life?", expect: { understood: false } },
  { question: "how do i deploy the payments service?", expect: { understood: false } },
  { question: "what breaks if the epic changes?", expect: { understood: false } },
  { question: "What is the risk around Zed?", expect: { understood: false } },
  { question: "trace the epic", expect: { understood: false } },
  { question: "what is the status of the decision?", expect: { understood: false } },
  { question: "who let the dogs out?", expect: { understood: false } },
  // Two surnames from different people: the engine must ask, not guess.
  { question: "what is alex chen's risk?", expect: { understood: false } },
  // Two people named at once: ambiguous, must ask.
  { question: "compare alex and priya", expect: { understood: false } },
  { question: "what is the risk around Alx?", expect: { understood: true, intent: "person-risk", personId: "alex" } }
];
var EVAL_CORPUS_HARD = [
  // Unanswerable-but-plausible: the engine must refuse these honestly.
  { question: "who owns the auth service runbook?", expect: { understood: false } },
  { question: "who knows about the payments retry design?", expect: { understood: false } },
  { question: "what is the status of the key decision?", expect: { understood: false } },
  { question: "who reviewed pr-31?", expect: { understood: false } },
  { question: "where is the spec for the webhook replay bug?", expect: { understood: false } },
  { question: "who reviewed the idempotency middleware?", expect: { understood: false } },
  { question: "how stale is our documentation?", expect: { understood: false } },
  { question: "how many decisions are pending?", expect: { understood: false } },
  { question: "list everyone who touches the payments code", expect: { understood: false } },
  // Indirect but answerable phrasings the engine should map.
  { question: "what did alex work on last sprint?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "what is alex working on right now?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "what is sam's score?", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "which pages does alex alone own?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "which decisions are waiting on alex?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "should we reassign sam's tickets before he leaves?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who depends on priya?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what are the consequences of priya leaving?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "if alex leaves, who takes over the payments epic?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what happens to the epic if sam quits?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "when was the token format decision superseded?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "what is d1 about?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "who can approve the idempotency decision?", expect: { understood: true, intent: "decision-trace", decisionId: "d3" } },
  { question: "who needs to know about the token format decision?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "why is the auth hardening epic stalled?", expect: { understood: true, intent: "epic-lineage", epicId: "AUTH-1" } },
  { question: "what is the risk of the auth hardening epic being cancelled?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "summarize the payments reliability epic for the offsite", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "explain the blast radius of the onboarding revamp", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "what is the bus factor of the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "give me the top 5 riskiest people", expect: { understood: true, intent: "top-risks" } },
  { question: "what should we do about knowledge risk?", expect: { understood: true, intent: "top-risks" } },
  { question: "what are priya's biggest risks?", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  // Documented synonym gaps: an ideal engine would answer these; the
  // current deterministic one does not map them (see the doc comment above).
  { question: "who is our most critical person?", expect: { understood: true, intent: "top-risks" } },
  { question: "is anyone about to become a single point of failure?", expect: { understood: true, intent: "top-risks" } },
  { question: "do we have a succession plan?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is the highest-impact thing we could lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "any single points of failure on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "what's the damage if priya quits?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who is the bottleneck on the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who is irreplaceable on this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who holds the most institutional knowledge?", expect: { understood: true, intent: "top-risks" } },
  /* ------- session 9: regression cases for the closed gaps and new lanes ------- */
  // Consequence, bottleneck and damage wording now score as impact.
  { question: "what are the consequences of sam resigning?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who is the bottleneck on the payments epic?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "what's the damage of losing sam?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  // Risk synonyms: SPOF, irreplaceable, institutional knowledge, bus factor.
  { question: "who is our single point of failure?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is irreplaceable here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who holds the most institutional knowledge on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "how do we lower our bus factor?", expect: { understood: true, intent: "top-risks" } },
  // A SPOF question naming one person is that person's risk profile, not
  // the ranking; a capitalized phrase mid-sentence must not read as a name.
  { question: "is priya a single point of failure?", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  { question: "Who is our Single Point of Failure?", expect: { understood: true, intent: "top-risks" } },
  // Indirect impact phrasings.
  { question: "do we have a succession plan for alex?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who should alex hand off to before he leaves?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "which epics would suffer if priya left?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what happens to tribal knowledge if alex leaves?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  // Decision slang: "made the call on X" rides the title-in-question lane.
  { question: "who made the call on the token format?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  /* ------- session 9: commands are refused, not answered ------- */
  // A request to schedule or send something names a person; without the
  // command guard the engine would answer that person's risk profile.
  { question: "can you schedule a 1:1 with alex?", expect: { understood: false } },
  { question: "book a meeting with priya nair", expect: { understood: false } },
  { question: "please ping sam chen about the handover", expect: { understood: false } },
  { question: "can you message alex?", expect: { understood: false } },
  { question: "send an email to priya about the offsite", expect: { understood: false } },
  /* ------- session 9: more unanswerable-but-plausible, must refuse ------- */
  // Topic-knowledge and workload questions: the records cannot rank who
  // "knows" a system or who is busiest, so the engine must say so.
  { question: "who has the most context on the payments system?", expect: { understood: false } },
  { question: "who knows the most about the auth service?", expect: { understood: false } },
  { question: "who is drowning in work right now?", expect: { understood: false } },
  // Plural-epic ranking: the engine cannot rank epics directly, and
  // answering with the people ranking would be confidently wrong.
  { question: "which epics are most at risk right now?", expect: { understood: false } },
  /* ------- session 9 frontier, closed in session 10 (regression cases) -------
   * These nine phrasings were the documented session-9 gaps; the lexicon
   * expansion (ranking synonyms weakest-link/liability/carrying-context,
   * availability wording out-sick/on-leave in the if-lane, "lost", coverage
   * as an overview signal) plus the decide-verb domain phrases and the
   * inflectional token lane closed them. They stay in the corpus so a
   * lexicon regression fails CI. */
  { question: "who is our weakest link?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most dangerous liability?", expect: { understood: true, intent: "top-risks" } },
  { question: "who's carrying the most context these days?", expect: { understood: true, intent: "top-risks" } },
  { question: "how exposed are we if sam is out sick?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if we lost alex tomorrow?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what is our knowledge coverage?", expect: { understood: true, intent: "overview" } },
  { question: "what did the team decide about the retry mechanism?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "what did we decide on retries?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "why did we move away from the queue approach?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  /* ------- session 10: regression cases for the closures and new lanes ------- */
  // The new ranking synonyms work in real sentence shapes, not just the
  // documented phrasings.
  { question: "who is the weakest link on the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "our biggest liability?", expect: { understood: true, intent: "top-risks" } },
  // A ranking synonym naming ONE person is that person's risk profile
  // (mirrors "is priya a single point of failure?").
  { question: "is sam a liability?", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "who is carrying the most context on the team?", expect: { understood: true, intent: "top-risks" } },
  // Availability wording and "lost" inside and around the if-lane.
  { question: "what if we lost priya tomorrow?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what breaks if sam is on leave?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who is exposed if alex calls in sick?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  // Coverage as an overview question.
  { question: "how is our knowledge coverage?", expect: { understood: true, intent: "overview" } },
  // Decide-verb questions resolve the right decision through the domain
  // phrases and the inflectional token lane ("retry" -> "retries").
  { question: "what did we decide about the token format?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "why did we move away from cron?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  { question: "what did the team decide on the idempotency key scope?", expect: { understood: true, intent: "decision-trace", decisionId: "d3" } },
  { question: "who made the call on retries?", expect: { understood: true, intent: "decision-trace", decisionId: "d1" } },
  /* ------- session 10: boundary refusals for the new signals ------- */
  // The decide-verb and carrying-context signals must stay tight: a decide
  // question about something with no recorded decision refuses, and the
  // carrying-context phrase is not any "carrying" question.
  { question: "what did we decide about the offsite?", expect: { understood: false } },
  { question: "who is carrying the team?", expect: { understood: false } },
  /* ------- session 10: more unanswerable-but-plausible, must refuse ------- */
  // Workload, sentiment and assignment questions: the records cannot show
  // burnout, ticket load, pager duty or happiness.
  { question: "who is about to burn out?", expect: { understood: false } },
  { question: "who has the most open tickets?", expect: { understood: false } },
  { question: "did anyone update the runbook?", expect: { understood: false } },
  { question: "who should pick up the payments pager?", expect: { understood: false } },
  { question: "who is the happiest person on the team?", expect: { understood: false } },
  /* ------- session 11: the eleven session-10 gaps, closed and locked ------- */
  // The lexicon expansion (ranking synonyms linchpin / key persons /
  // indispensable / tribal knowledge / spread thin / never-want-to-lose,
  // fallout as consequence wording, deprioritize forms) plus the epic domain
  // phrases (a scoped "payments single point of failure", "bottleneck") and
  // the who-subject escape in the no-entity arbitration. They stay in the
  // corpus so a lexicon regression fails CI.
  { question: "who is our linchpin?", expect: { understood: true, intent: "top-risks" } },
  { question: "who are our key persons?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most indispensable engineer?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is the fallout of priya leaving?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who are the guardians of our tribal knowledge?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is spread the thinnest across epics?", expect: { understood: true, intent: "top-risks" } },
  { question: "who do we never want to lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if we deprioritize the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "what if the payments epic gets deprioritized?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is the payments single point of failure?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  // Relabeled: the payments work has TWO decisions proposed against it (d1
  // and d3). The honest closure names both with their statuses through the
  // recorded links — the scope join — instead of guessing one.
  { question: "which decision is blocking the payments work?", expect: { understood: false, messageIncludes: ["d1", "d3", "queue vs cron", "idempotency key scope"] } },
  /* ------- session 11: regression cases for the closures and new lanes ------- */
  // The new signals work in real sentence shapes, not just the documented
  // phrasings; the decision scope join resolves candidates through the
  // recorded links — the same linkage traceDecision uses — in both directions.
  { question: "who is the linchpin of the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who are our key people?", expect: { understood: true, intent: "top-risks" } },
  { question: "is alex indispensable?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "who is irreplaceable on the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is spread too thin?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is the fallout if sam quits?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what happens if the auth epic gets deprioritized?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who is the payments bottleneck?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is the onboarding single point of failure?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "what is at stake if the auth epic is descoped?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "what would we lose if the onboarding epic slipped?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  // The scope join: one candidate traces it, none says so informed, several
  // are named with statuses — never guessed.
  { question: "which decision is blocking the auth work?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "which decision is holding up the auth work?", expect: { understood: true, intent: "decision-trace", decisionId: "d2" } },
  { question: "what did the team decide about the payments work?", expect: { understood: false, messageIncludes: ["d1", "d3"] } },
  { question: "which decision is blocking the onboarding work?", expect: { understood: false, messageIncludes: ["no decision is linked"] } },
  /* ------- session 11: boundary checks for the new signals ------- */
  // The new phrasings must stay tight: "never" carries the lose idiom, "key
  // persons" is not every "key engineer" word, "spread thin" needs the spread,
  // and a deprioritized STATE outside the if-lane stays out of impact.
  { question: "who do we want to lose?", expect: { understood: false } },
  { question: "who are our key engineers?", expect: { understood: false } },
  { question: "who is the thinnest person on the team?", expect: { understood: false } },
  { question: "what is the status of the auth epic after it was deprioritized?", expect: { understood: true, intent: "epic-lineage", epicId: "AUTH-1" } },
  /* ------- session 11: more unanswerable-but-plausible, must refuse ------- */
  // Skill, performance, org-structure, history and load questions: the
  // records cannot show experience, quality, reporting lines, dates or load.
  { question: "who is the most experienced person here?", expect: { understood: false } },
  { question: "who is the best engineer on the team?", expect: { understood: false } },
  { question: "who has the most direct reports?", expect: { understood: false } },
  { question: "when did the team start using retries?", expect: { understood: false } },
  { question: "who wrote the most pages last month?", expect: { understood: false } },
  { question: "which epics are in the worst shape?", expect: { understood: false } },
  { question: "who is the most overloaded person here?", expect: { understood: false } },
  /* ------- session 12: the fourteen session-11 gaps, closed and locked ------- */
  // The lexicon expansion (most important / afford-to-lose / glue / miss
  // the most / takes-the-most-with-them / never lose / backbone / go-to
  // person as ranking synonyms; implications and in-the-loop as impact
  // wording; drop as a change action; the when-lane extended to person
  // names and "out of office") plus the backbone epic domain phrase and
  // the keep-in-the-loop command guard. Every closure was verified end to
  // end against the full AnswerResult before the case moved here, and they
  // stay in the corpus so a lexicon regression fails CI.
  { question: "who is the most important person here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who are the people we cannot afford to lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the glue that holds this team together?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the team's most valuable player?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the person we would miss the most?", expect: { understood: true, intent: "top-risks" } },
  { question: "who takes the most with them if they leave?", expect: { understood: true, intent: "top-risks" } },
  { question: "who must we never lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the team's backbone?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the person everyone goes to with questions?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if we drop the onboarding revamp?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "what are the implications of the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "who is exposed when alex is out of office?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "how bad would it be if sam quit?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who needs to be in the loop on the payments work?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  /* ------- session 12: regression cases for the closures and new lanes ------- */
  // The new signals work in real sentence shapes, not just the documented
  // phrasings. Every label was probed end to end against the full
  // AnswerResult before it was baked in here.
  { question: "who is the most important person on the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most important engineer?", expect: { understood: true, intent: "top-risks" } },
  { question: "who can we not afford to lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the person we can least afford to lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the glue of this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the glue on the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most valuable player this quarter?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the one we would miss the most?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would we miss the most if they left?", expect: { understood: true, intent: "top-risks" } },
  { question: "who takes the most knowledge with them if they leave?", expect: { understood: true, intent: "top-risks" } },
  { question: "who must we never lose on this team?", expect: { understood: true, intent: "top-risks" } },
  // A scoped backbone anchors the epic like bottleneck/SPOF: naming an
  // epic's distinctive token with the load-bearing idiom asks for that
  // epic's blast radius. An unscoped backbone stays the people ranking.
  { question: "who is the backbone of the payments team?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is the backbone of the auth work?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who is the payments backbone?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is the go-to person on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is everyone's go-to person?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if we drop the payments epic?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "what are the implications of the token format decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "what are the implications of superseding the idempotency decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d3" } },
  { question: "who is exposed if priya is out of office?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "how bad would it be if the payments epic got cancelled?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who needs to be in the loop on the auth work?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who should be in the loop on the onboarding work?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "who else needs to be in the loop on the payments work?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  // The keep QUESTION is the same ask as "who needs to be in the loop" with
  // a different verb; the keep IMPERATIVE is a command (refused below).
  { question: "who should we keep in the loop on the payments work?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who takes over the payments work if sam resigns?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what would we lose if the token format decision is reversed?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "what is the single biggest risk on the team?", expect: { understood: true, intent: "top-risks" } },
  // Availability wording that already worked through the when-lane and the
  // what-happens signals, locked here so a regression fails CI.
  { question: "what breaks when priya goes on sabbatical?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what happens to the auth epic if we sunset it?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "what happens if sam disappears?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  /* ------- session 12: boundary checks for the new signals ------- */
  // The new phrasings must stay tight: "miss the most" keeps the verb
  // singular ("misses the most standups" is an attendance question), the
  // important/valuable family needs a person noun ("most important epic"
  // and "most valuable feature" refuse), the afford-to-lose idiom does not
  // cross the plural-epic guard, and the keep IMPERATIVE is a notification
  // request, not a question.
  { question: "who misses the most standups?", expect: { understood: false } },
  { question: "who is the most important epic on the board?", expect: { understood: false } },
  { question: "which epics can we not afford to lose?", expect: { understood: false } },
  { question: "what is the most valuable feature?", expect: { understood: false } },
  { question: "keep alex in the loop on the payments work", expect: { understood: false } },
  { question: "keep me in the loop on the payments work", expect: { understood: false } },
  /* ------- session 12: more unanswerable-but-plausible, must refuse ------- */
  // Scheduling, promotion, participation, customer-sentiment, trivia and
  // pair questions: the records cannot answer them, and the matcher must
  // not hallucinate a person out of an ordinary word ("at the same time"
  // once matched Sam Chen through the symmetric prefix lane — fixed in
  // session 12, and this case keeps it fixed).
  { question: "who is out of the office next week?", expect: { understood: false } },
  { question: "who deserves a promotion?", expect: { understood: false } },
  { question: "what did we decide?", expect: { understood: false } },
  { question: "who is the funniest person on the team?", expect: { understood: false } },
  { question: "who volunteered for the on-call rotation?", expect: { understood: false } },
  { question: "what are our customers saying about payments?", expect: { understood: false } },
  { question: "who has the answers to everything?", expect: { understood: false } },
  { question: "who is the one person who knows the payments system end to end?", expect: { understood: false } },
  { question: "which two people should never be on vacation at the same time?", expect: { understood: false } },
  /* ------- session 12: the next documented frontier (open gaps) ------- */
  // Ideal behavior an ideal engine would have; the current one misses —
  // this is the honest headroom that keeps the measured number in band.
  // Two families: (a) ranking-synonym leftovers (impossible to replace,
  // keys to the kingdom, knowledge hoarders, secret weapon, most central,
  // institutional memory, most relied-upon, biggest vulnerability, biggest
  // shoes to fill, struggle without the most, weak spot, load-bearing,
  // unreasonable load); (b) impact wording gaps (the while-lane with a
  // person name, ripple effects as consequence wording, parental leave and
  // poached inside the if-lane).
  { question: "who would be impossible to replace?", expect: { understood: true, intent: "top-risks" } },
  { question: "who has the keys to the kingdom?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is exposed while alex is on vacation?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what are the ripple effects of the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "who are our knowledge hoarders?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our secret weapon?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most central person on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if priya goes on parental leave?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who is the institutional memory of the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most relied-upon person here?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is our biggest vulnerability as a team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would have the biggest shoes to fill?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if alex gets poached?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who would the team struggle without the most?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our weak spot?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most load-bearing person on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is carrying an unreasonable load?", expect: { understood: true, intent: "top-risks" } }
];
var EVAL_CORPUS_ALL = [...EVAL_CORPUS, ...EVAL_CORPUS_HARD];

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
