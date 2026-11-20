#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __export = (target, all4) => {
  for (var name in all4)
    __defProp(target, name, { get: all4[name], enumerable: true });
};

// src/cli.ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
var isPlainObject = (v2) => typeof v2 === "object" && v2 !== null && !Array.isArray(v2);
function hasControlChars(text) {
  for (let i3 = 0; i3 < text.length; i3++) {
    const c = text.charCodeAt(i3);
    if (c <= 31 || c === 127 || c >= 128 && c <= 159) return true;
  }
  return false;
}
function checkString(value, path, what, max3, issues, opts2 = {}) {
  if (typeof value !== "string") {
    issues.push({ level: "error", path, message: `${what} must be a string, got ${typeof value}` });
    return false;
  }
  if (!opts2.allowEmpty && value.length === 0) {
    issues.push({ level: "error", path, message: `${what} must not be empty` });
    return false;
  }
  if (value.length > max3) {
    issues.push({ level: "error", path, message: `${what} is ${value.length} characters; the cap is ${max3}` });
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
function checkIdList(value, path, what, issues, max3 = LIMITS.maxLinkedIdsPerRecord) {
  if (!Array.isArray(value)) {
    issues.push({ level: "error", path, message: `${what} must be an array of ids` });
    return false;
  }
  if (value.length > max3) {
    issues.push({ level: "error", path, message: `${what} has ${value.length} entries; the cap is ${max3}` });
    return false;
  }
  let ok = true;
  for (let i3 = 0; i3 < value.length; i3++) {
    if (!checkString(value[i3], `${path}[${i3}]`, `${what} entry`, LIMITS.maxIdLength, issues)) ok = false;
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
  const collection = (name, cap2) => {
    const value = input[name];
    if (!Array.isArray(value)) {
      push({ level: "error", path: `$.${name}`, message: `${name} must be an array, got ${typeof value}` });
      return [];
    }
    if (value.length > cap2) {
      push({ level: "error", path: `$.${name}`, message: `${name} has ${value.length} records; the cap is ${cap2}` });
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
  const personOk = people.map((p4, i3) => checkPerson(p4, `$.people[${i3}]`, errors));
  const workOk = workItems.map((w, i3) => checkWorkItem(w, `$.workItems[${i3}]`, errors));
  const pageOk = pages.map((p4, i3) => checkPage(p4, `$.pages[${i3}]`, errors));
  const prOk = pullRequests.map((p4, i3) => checkPullRequest(p4, `$.pullRequests[${i3}]`, errors));
  const decisionOk = decisions.map((d, i3) => checkDecision(d, `$.decisions[${i3}]`, errors));
  const dupes = (records, okFlags, name, idOf) => {
    const seen = /* @__PURE__ */ new Map();
    records.forEach((record, i3) => {
      if (!okFlags[i3]) return;
      const id = idOf(record);
      if (typeof id !== "string") return;
      const first = seen.get(id);
      if (first === void 0) {
        seen.set(id, i3);
      } else {
        push({
          level: "error",
          path: `$.${name}[${i3}]`,
          message: `duplicate id '${id}' (first seen at $.${name}[${first}])`
        });
      }
    });
  };
  dupes(people, personOk, "people", (p4) => p4.id);
  dupes(workItems, workOk, "workItems", (w) => w.ref.id);
  dupes(pages, pageOk, "pages", (p4) => p4.ref.id);
  dupes(pullRequests, prOk, "pullRequests", (p4) => p4.ref.id);
  dupes(decisions, decisionOk, "decisions", (d) => d.ref.id);
  const personIds = /* @__PURE__ */ new Set();
  people.forEach((p4, i3) => {
    if (personOk[i3]) personIds.add(p4.id);
  });
  const workIds = /* @__PURE__ */ new Set();
  const epicIds = /* @__PURE__ */ new Set();
  workItems.forEach((w, i3) => {
    if (!workOk[i3]) return;
    const item = w;
    workIds.add(item.ref.id);
    if (item.type === "epic") epicIds.add(item.ref.id);
  });
  const pageOrDecisionIds = /* @__PURE__ */ new Set();
  pages.forEach((p4, i3) => {
    if (pageOk[i3]) pageOrDecisionIds.add(p4.ref.id);
  });
  decisions.forEach((d, i3) => {
    if (decisionOk[i3]) pageOrDecisionIds.add(d.ref.id);
  });
  const prIds = /* @__PURE__ */ new Set();
  pullRequests.forEach((p4, i3) => {
    if (prOk[i3]) prIds.add(p4.ref.id);
  });
  const warnDangling = (path, id, what) => {
    warnings.push({ level: "warning", path, message: `${what} '${id}' does not exist in this graph; the reference will be dropped` });
  };
  workItems.forEach((w, i3) => {
    if (!workOk[i3]) return;
    const item = w;
    if (item.assigneeId !== void 0 && !personIds.has(item.assigneeId)) {
      warnDangling(`$.workItems[${i3}].assigneeId`, item.assigneeId, "assigneeId");
    }
    if (item.epicId !== void 0 && !epicIds.has(item.epicId)) {
      warnDangling(`$.workItems[${i3}].epicId`, item.epicId, "epicId");
    }
    (item.linkedPageIds ?? []).forEach((id, j) => {
      if (!pageOrDecisionIds.has(id)) warnDangling(`$.workItems[${i3}].linkedPageIds[${j}]`, id, "linked page or decision");
    });
    (item.linkedPullRequestIds ?? []).forEach((id, j) => {
      if (!prIds.has(id)) warnDangling(`$.workItems[${i3}].linkedPullRequestIds[${j}]`, id, "linked pull request");
    });
  });
  decisions.forEach((d, i3) => {
    if (!decisionOk[i3]) return;
    const decision = d;
    if (decision.ownerId !== void 0 && !personIds.has(decision.ownerId)) {
      warnDangling(`$.decisions[${i3}].ownerId`, decision.ownerId, "decision owner");
    }
    (decision.pendingApproverIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.decisions[${i3}].pendingApproverIds[${j}]`, id, "pending approver");
    });
    (decision.linkedWorkItemIds ?? []).forEach((id, j) => {
      if (!workIds.has(id)) warnDangling(`$.decisions[${i3}].linkedWorkItemIds[${j}]`, id, "linked work item");
    });
  });
  pages.forEach((p4, i3) => {
    if (!pageOk[i3]) return;
    (p4.contributorIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.pages[${i3}].contributorIds[${j}]`, id, "contributor");
    });
  });
  pullRequests.forEach((p4, i3) => {
    if (!prOk[i3]) return;
    const pr = p4;
    if (pr.authorId !== void 0 && !personIds.has(pr.authorId)) {
      warnDangling(`$.pullRequests[${i3}].authorId`, pr.authorId, "pull request author");
    }
    (pr.reviewerIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.pullRequests[${i3}].reviewerIds[${j}]`, id, "reviewer");
    });
  });
  return { ok: errors.length === 0, errors, warnings };
}
function strictGraph(input, context2 = "input") {
  const report = validateGraph(input);
  if (!report.ok) throw new ValidationError(report.errors, context2);
  return { graph: input, warnings: report.warnings };
}
function parseOrgGraphJson(text, context2 = "OrgGraph export") {
  if (typeof text !== "string") {
    throw new ValidationError([{ path: "$", message: `expected a JSON string, got ${typeof text}` }], context2);
  }
  if (text.length > LIMITS.maxJsonBytes) {
    throw new ValidationError(
      [{ path: "$", message: `export is ${text.length} bytes; the cap is ${LIMITS.maxJsonBytes}` }],
      context2
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(
      [{ path: "$", message: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` }],
      context2
    );
  }
  const { graph: graph2, warnings } = strictGraph(parsed, context2);
  return { graph: graph2, warnings };
}

// ../core/src/errors.ts
var TraceFlowError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TraceFlowError";
  }
};
var ValidationError = class extends TraceFlowError {
  issues;
  constructor(issues, context2 = "input") {
    super(`${issues.length} validation error(s) in ${context2}:
${formatIssues(issues)}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
};
function formatIssues(issues, cap2 = LIMITS.maxIssuesInMessage) {
  const shown = issues.slice(0, cap2);
  const lines = shown.map((i3) => `  - ${i3.path}: ${i3.message}`);
  if (issues.length > cap2) lines.push(`  - \u2026and ${issues.length - cap2} more`);
  return lines.join("\n");
}

// ../core/src/graph-index.ts
function pushTo(map2, key, value) {
  const bucket = map2.get(key);
  if (bucket) bucket.push(value);
  else map2.set(key, [value]);
}
function buildGraphIndex(graph2) {
  const peopleById = /* @__PURE__ */ new Map();
  for (const person of graph2.people) if (!peopleById.has(person.id)) peopleById.set(person.id, person);
  const workById = /* @__PURE__ */ new Map();
  const epics = [];
  const childrenByEpic = /* @__PURE__ */ new Map();
  const workByLinkedPageId = /* @__PURE__ */ new Map();
  const workByLinkedPullRequestId = /* @__PURE__ */ new Map();
  for (const item of graph2.workItems) {
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
  for (const page of graph2.pages) if (!pagesById.has(page.ref.id)) pagesById.set(page.ref.id, page);
  const decisionsById = /* @__PURE__ */ new Map();
  const decisionsByLinkedWorkItemId = /* @__PURE__ */ new Map();
  const workByDecisionId = /* @__PURE__ */ new Map();
  for (const decision of graph2.decisions) {
    if (!decisionsById.has(decision.ref.id)) decisionsById.set(decision.ref.id, decision);
    for (const workId of decision.linkedWorkItemIds ?? []) {
      pushTo(decisionsByLinkedWorkItemId, workId, decision);
    }
    const linked = /* @__PURE__ */ new Map();
    for (const item of workByLinkedPageId.get(decision.ref.id) ?? []) {
      linked.set(item.ref.id, item);
    }
    for (const wid of decision.linkedWorkItemIds ?? []) {
      const item = workById.get(wid);
      if (item) linked.set(item.ref.id, item);
    }
    workByDecisionId.set(
      decision.ref.id,
      [...linked.values()].sort((a, b2) => a.ref.id.localeCompare(b2.ref.id))
    );
  }
  const pullRequestsById = /* @__PURE__ */ new Map();
  for (const pr of graph2.pullRequests) {
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
    decisionsByLinkedWorkItemId,
    workByDecisionId
  };
}
var INDEX_CACHE = /* @__PURE__ */ new WeakMap();
function getIndex(graph2) {
  const cached = INDEX_CACHE.get(graph2);
  if (cached) return cached;
  const index3 = buildGraphIndex(graph2);
  INDEX_CACHE.set(graph2, index3);
  return index3;
}
function fnv1a(text, seed) {
  let h = seed >>> 0;
  for (let i3 = 0; i3 < text.length; i3++) {
    h ^= text.charCodeAt(i3);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
var sortedUniq = (ids) => ids ? [...new Set(ids)].sort() : [];
function graphFingerprint(graph2) {
  const key = (source, id) => `${source}:${id}`;
  const parts3 = [];
  const emit = (label, lines) => {
    lines.sort();
    parts3.push(`${label}|${lines.length}|${lines.join(";")}`);
  };
  emit("people", graph2.people.map((p4) => `${p4.id}=${p4.name}`));
  emit("work", graph2.workItems.map(
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
  emit("pages", graph2.pages.map(
    (p4) => JSON.stringify([key(p4.ref.source, p4.ref.id), p4.ref.title, sortedUniq(p4.contributorIds)])
  ));
  emit("prs", graph2.pullRequests.map(
    (p4) => JSON.stringify([
      key(p4.ref.source, p4.ref.id),
      p4.ref.title,
      p4.authorId,
      p4.state,
      sortedUniq(p4.reviewerIds)
    ])
  ));
  emit("decisions", graph2.decisions.map(
    (d) => JSON.stringify([
      key(d.ref.source, d.ref.id),
      d.ref.title,
      d.ownerId,
      d.status,
      sortedUniq(d.pendingApproverIds),
      sortedUniq(d.linkedWorkItemIds)
    ])
  ));
  const canonical = parts3.join("\n");
  return `${fnv1a(canonical, 2166136261)}${fnv1a(canonical, 16777619)}`;
}

// ../core/src/risk.ts
var DEFAULT_WEIGHTS = {
  solePage: 5,
  openWork: 2,
  openPullRequest: 4,
  pendingDecision: 6
};
var CAVEATS = [
  "Sole contributor is not the same as sole knowledge holder: activity data cannot prove who understands something.",
  "Findings come from Atlassian records only; knowledge shared in chat, meetings or code is not visible here."
];
var REPORT_CACHE = /* @__PURE__ */ new WeakMap();
var REPORT_CACHE_MAX = 2048;
function weightsCacheKey(weights) {
  return Object.keys(weights).sort().map((key) => `${key}=${weights[key]}`).join(",");
}
function levelFor(score) {
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  return "low";
}
function assessPersonRisk(graph2, personId, weights = DEFAULT_WEIGHTS) {
  const cacheKey = `${weightsCacheKey(weights)}|${personId}`;
  let reports = REPORT_CACHE.get(graph2);
  if (!reports) {
    reports = /* @__PURE__ */ new Map();
    REPORT_CACHE.set(graph2, reports);
  }
  const cached = reports.get(cacheKey);
  if (cached) return cached;
  const index3 = getIndex(graph2);
  const person = index3.peopleById.get(personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);
  const findings = [];
  const byId = (a, b2) => a.ref.id.localeCompare(b2.ref.id);
  const soloPages = graph2.pages.filter((p4) => p4.contributorIds.length === 1 && p4.contributorIds[0] === personId).sort(byId);
  if (soloPages.length > 0) {
    findings.push({
      kind: "sole-contributor-page",
      title: `${soloPages.length} page(s) where ${person.name} is the only contributor`,
      detail: "No other recorded editor, so nobody else has visibly worked on these pages.",
      confidence: "medium",
      evidence: soloPages.map((p4) => p4.ref),
      points: soloPages.length * weights.solePage,
      suggestedActions: [
        "Assign a backup owner for each page",
        "Schedule a knowledge-transfer session"
      ]
    });
  }
  const openWork = graph2.workItems.filter((w) => w.assigneeId === personId && w.status === "open").sort(byId);
  if (openWork.length > 0) {
    findings.push({
      kind: "open-work",
      title: `${openWork.length} unresolved issue(s) assigned to ${person.name}`,
      detail: "Open work items that will stall without a new assignee.",
      confidence: "high",
      evidence: openWork.map((w) => w.ref),
      points: openWork.length * weights.openWork,
      suggestedActions: ["Review and reassign unresolved work", "Close issues that are no longer needed"]
    });
  }
  const openPrs = graph2.pullRequests.filter((p4) => p4.authorId === personId && p4.state === "open").sort(byId);
  if (openPrs.length > 0) {
    findings.push({
      kind: "open-pull-request",
      title: `${openPrs.length} open pull request(s) authored by ${person.name}`,
      detail: "Unmerged implementation work that needs a new owner or a review decision.",
      confidence: "high",
      evidence: openPrs.map((p4) => p4.ref),
      points: openPrs.length * weights.openPullRequest,
      suggestedActions: ["Hand off or close each pull request", "Document the intent of each change"]
    });
  }
  const pending = graph2.decisions.filter(
    (d) => d.status !== "superseded" && d.pendingApproverIds.includes(personId)
  ).sort(byId);
  if (pending.length > 0) {
    findings.push({
      kind: "pending-decision",
      title: `${pending.length} decision(s) awaiting ${person.name}'s input`,
      detail: "Decisions that cannot be finalised without this person or a delegate.",
      confidence: "high",
      evidence: pending.map((d) => d.ref),
      points: pending.length * weights.pendingDecision,
      suggestedActions: ["Name a delegate approver", "Record the decision before the handover date"]
    });
  }
  const score = Math.min(100, findings.reduce((sum2, f2) => sum2 + f2.points, 0));
  const report = {
    personId,
    personName: person.name,
    score,
    level: levelFor(score),
    findings,
    caveats: CAVEATS
  };
  reports.set(cacheKey, report);
  if (reports.size > REPORT_CACHE_MAX) {
    reports.delete(reports.keys().next().value);
  }
  return report;
}
function rankPeopleByRisk(graph2, weights = DEFAULT_WEIGHTS) {
  return graph2.people.map((p4) => assessPersonRisk(graph2, p4.id, weights)).sort((a, b2) => b2.score - a.score || a.personName.localeCompare(b2.personName));
}

// ../core/src/lineage.ts
var nodeId = (ref) => `${ref.source}:${ref.id}`;
var LINEAGE_CAVEATS = [
  "A missing link means no link was found in Jira or Confluence; the connection may exist elsewhere (chat, email, code comments).",
  "Lineage reflects recorded links only. It is evidence of traceability, not proof that a process was followed."
];
var byRefId = (a, b2) => a.ref.id.localeCompare(b2.ref.id);
function decisionStateFindings(decision, linked) {
  const findings = [];
  const doneAgainstProposal = linked.filter((w) => w.status === "done");
  if (decision.status === "proposed" && doneAgainstProposal.length > 0) {
    findings.push({
      kind: "unapproved-decision",
      title: `Work was completed against a decision that is still only proposed`,
      detail: `"${decision.ref.title}" has no recorded approval, but ${doneAgainstProposal.length} linked item(s) are already done.`,
      confidence: "medium",
      evidence: [decision.ref, ...doneAgainstProposal.map((w) => w.ref)],
      points: 0,
      suggestedActions: ["Record the approval (or the reason it was not needed)", "Confirm the completed work still matches the final decision"]
    });
  }
  const openAgainstSuperseded = linked.filter((w) => w.status === "open");
  if (decision.status === "superseded" && openAgainstSuperseded.length > 0) {
    findings.push({
      kind: "superseded-decision-in-use",
      title: `Open work still references a superseded decision`,
      detail: `"${decision.ref.title}" was superseded, but ${openAgainstSuperseded.length} open item(s) still link to it, so they may be outdated.`,
      confidence: "medium",
      evidence: [decision.ref, ...openAgainstSuperseded.map((w) => w.ref)],
      points: 0,
      suggestedActions: ["Review each item against the superseding decision", "Update or close items that are no longer valid"]
    });
  }
  return findings;
}
var TRACE_EPIC_CACHE = /* @__PURE__ */ new WeakMap();
function traceEpic(graph2, epicId) {
  const epic = getIndex(graph2).workById.get(epicId);
  if (!epic || epic.type !== "epic") throw new Error(`Unknown epic: ${epicId}`);
  let perGraph = TRACE_EPIC_CACHE.get(graph2);
  if (!perGraph) {
    perGraph = /* @__PURE__ */ new Map();
    TRACE_EPIC_CACHE.set(graph2, perGraph);
  }
  const cached = perGraph.get(epicId);
  if (cached) return cached;
  const report = computeEpicTrace(graph2, epicId);
  perGraph.set(epicId, report);
  return report;
}
function computeEpicTrace(graph2, epicId) {
  const index3 = getIndex(graph2);
  const epic = index3.workById.get(epicId);
  if (!epic || epic.type !== "epic") throw new Error(`Unknown epic: ${epicId}`);
  const children = [...index3.childrenByEpic.get(epicId) ?? []].sort(byRefId);
  const members = [epic, ...children];
  const memberIds = new Set(members.map((m3) => m3.ref.id));
  const nodes = /* @__PURE__ */ new Map();
  const edges = /* @__PURE__ */ new Map();
  const addNode = (ref, lane, status) => {
    const id = nodeId(ref);
    if (!nodes.has(id)) nodes.set(id, { id, lane, ref, status });
    return id;
  };
  const addEdge = (from, to, kind) => {
    edges.set(`${from}|${to}|${kind}`, { from, to, kind });
  };
  const epicNode = addNode(epic.ref, "plan", epic.status);
  for (const child of children) {
    addEdge(epicNode, addNode(child.ref, "work", child.status), "contains");
  }
  for (const m3 of members) {
    const to = nodeId(m3.ref);
    for (const pid of [...new Set(m3.linkedPageIds ?? [])].sort()) {
      const decision = index3.decisionsById.get(pid);
      const page = index3.pagesById.get(pid);
      const target = decision?.ref ?? page?.ref;
      if (target) addEdge(addNode(target, "intent", decision?.status), to, "specifies");
    }
  }
  for (const wid of memberIds) {
    for (const decision of index3.decisionsByLinkedWorkItemId.get(wid) ?? []) {
      const member = members.find((m3) => m3.ref.id === wid);
      addEdge(addNode(decision.ref, "intent", decision.status), nodeId(member.ref), "specifies");
    }
  }
  for (const m3 of members) {
    for (const prId of m3.linkedPullRequestIds ?? []) {
      const pr = index3.pullRequestsById.get(prId);
      if (pr) addEdge(addNode(pr.ref, "code", pr.state), nodeId(m3.ref), "implements");
    }
  }
  const coverage = {
    confluence: graph2.pages.length + graph2.decisions.length > 0,
    code: graph2.pullRequests.length > 0
  };
  const gaps = [];
  const intentNodes = [...nodes.values()].filter((n2) => n2.lane === "intent");
  if (intentNodes.length === 0 && coverage.confluence) {
    gaps.push({
      kind: "no-recorded-spec",
      title: "No linked specification or decision for this epic",
      detail: "Neither the epic nor its issues link to a Confluence page or decision, so the original intent cannot be traced.",
      confidence: "medium",
      evidence: [epic.ref],
      points: 0,
      suggestedActions: ["Link the specification or decision page to the epic", "If none exists, write a short decision record"]
    });
  }
  if (coverage.code) {
    const doneNoPr = children.filter((c) => c.status === "done" && !c.linkedPullRequestIds?.length);
    if (doneNoPr.length > 0) {
      gaps.push({
        kind: "done-without-implementation",
        title: `${doneNoPr.length} finished issue(s) have no linked pull request`,
        detail: "These issues are done, but no implementation evidence is linked to them.",
        confidence: "medium",
        evidence: doneNoPr.map((c) => c.ref),
        points: 0,
        suggestedActions: ["Link the pull request that delivered each issue", "Note why no code change was needed, if that is the case"]
      });
    }
  }
  for (const node of intentNodes) {
    const decision = index3.decisionsById.get(node.ref.id);
    if (!decision) continue;
    const linked = members.filter((m3) => edges.has(`${node.id}|${nodeId(m3.ref)}|specifies`));
    gaps.push(...decisionStateFindings(decision, linked));
  }
  const caveats = [...LINEAGE_CAVEATS];
  if (!coverage.code) {
    caveats.push("No pull-request data is connected, so implementation evidence was not assessed.");
  }
  return {
    epic: epic.ref,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    gaps,
    coverage,
    caveats
  };
}
function traceDecision(graph2, decisionId) {
  const index3 = getIndex(graph2);
  const decision = index3.decisionsById.get(decisionId);
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);
  const linked = index3.workByDecisionId.get(decision.ref.id) ?? [];
  const roles = /* @__PURE__ */ new Map();
  const addRole = (personId, role) => {
    if (!personId) return;
    if (!roles.has(personId)) roles.set(personId, /* @__PURE__ */ new Set());
    roles.get(personId).add(role);
  };
  addRole(decision.ownerId, "decision owner");
  for (const id of decision.pendingApproverIds) addRole(id, "pending approver");
  for (const w of linked) {
    addRole(w.assigneeId, "assignee of linked work");
    for (const prId of w.linkedPullRequestIds ?? []) {
      const pr = index3.pullRequestsById.get(prId);
      addRole(pr?.authorId, "author of linked pull request");
    }
  }
  const people = graph2.people.filter((p4) => roles.has(p4.id)).map((person) => ({ person, roles: [...roles.get(person.id)] })).sort((a, b2) => a.person.id.localeCompare(b2.person.id));
  const findings = decisionStateFindings(decision, linked);
  if (decision.status !== "superseded" && decision.pendingApproverIds.length > 0) {
    const names = decision.pendingApproverIds.map((id) => index3.peopleById.get(id)?.name ?? id).join(", ");
    findings.push({
      kind: "pending-decision",
      title: "Decision is waiting on input",
      detail: `Outstanding approver(s): ${names}.`,
      confidence: "high",
      evidence: [decision.ref],
      points: 0,
      suggestedActions: ["Name a delegate for each outstanding approver", "Set a date to record the final decision"]
    });
  }
  return {
    decision: decision.ref,
    status: decision.status,
    linkedWork: linked.map((w) => w.ref),
    people,
    findings,
    caveats: LINEAGE_CAVEATS
  };
}

// ../core/src/overview.ts
var OVERVIEW_TOP_PEOPLE = 3;
var OVERVIEW_CAVEATS = [
  "Overview counts describe the connected Jira and Confluence records only; knowledge shared in chat, meetings or code review is not visible here.",
  "A sole-contributor page has one recorded editor; that cannot prove who else understands the content."
];
function buildOverview(graph2, weights = DEFAULT_WEIGHTS) {
  const index3 = getIndex(graph2);
  const counts = {
    people: graph2.people.length,
    epics: index3.epics.length,
    openWorkItems: graph2.workItems.filter((w) => w.status === "open").length,
    soleContributorPages: graph2.pages.filter((p4) => p4.contributorIds.length === 1).length,
    pendingDecisions: graph2.decisions.filter(
      (d) => d.status !== "superseded" && d.pendingApproverIds.length > 0
    ).length,
    openPullRequests: graph2.pullRequests.filter((p4) => p4.state === "open").length
  };
  const topPeople = rankPeopleByRisk(graph2, weights).slice(0, OVERVIEW_TOP_PEOPLE);
  const epics = index3.epics.map((w) => ({
    epic: w.ref,
    openWork: (index3.childrenByEpic.get(w.ref.id) ?? []).filter((c) => c.status === "open").length,
    gaps: traceEpic(graph2, w.ref.id).gaps.length
  })).sort((a, b2) => b2.gaps - a.gaps || b2.openWork - a.openWork || a.epic.id.localeCompare(b2.epic.id));
  return {
    counts,
    topPeople,
    epics,
    coverage: {
      confluence: graph2.pages.length + graph2.decisions.length > 0,
      code: graph2.pullRequests.length > 0
    },
    caveats: OVERVIEW_CAVEATS
  };
}

// ../core/src/impact.ts
var CAVEATS2 = [
  "Impact lists what the connected records show would lose an owner; knowledge shared outside Jira, Confluence and Bitbucket is not visible here.",
  "Sole contributor is not the same as sole knowledge holder: activity data cannot prove who understands something."
];
function impactedEpics(graph2, personId) {
  const index3 = getIndex(graph2);
  const result = [];
  for (const epic of index3.epics) {
    const items = (index3.childrenByEpic.get(epic.ref.id) ?? []).filter((item) => item.assigneeId === personId && item.status === "open").sort((a, b2) => a.ref.id.localeCompare(b2.ref.id));
    const ownsEpic = epic.assigneeId === personId && epic.status === "open";
    if (items.length > 0 || ownsEpic) result.push({ epic, items, ownsEpic });
  }
  return result;
}
function loneWork(graph2, personId) {
  const items = [];
  for (const item of graph2.workItems) {
    if (item.type === "epic" || item.epicId) continue;
    if (item.assigneeId === personId && item.status === "open") items.push(item);
  }
  return items.sort((a, b2) => a.ref.id.localeCompare(b2.ref.id));
}
function personImpact(graph2, personId) {
  const index3 = getIndex(graph2);
  const person = index3.peopleById.get(personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);
  const areas = [];
  const stalled = impactedEpics(graph2, personId).sort((a, b2) => a.epic.ref.id.localeCompare(b2.epic.ref.id));
  for (const { epic, items, ownsEpic } of stalled) {
    const evidence = [epic.ref, ...items.map((i3) => i3.ref)];
    const stalledTitle = items.length > 0 ? `${items.length} open issue(s) in ${epic.ref.title} stall with ${person.name}` : `${epic.ref.title} loses its recorded owner`;
    const stalledDetail = items.length > 0 ? `Open work in this epic is assigned to ${person.name}` + (ownsEpic ? `, who also owns the epic record itself, so it loses both its work and its driver.` : ". The epic loses its active work if they leave.") : `${person.name} owns this epic record; no other driver is recorded on it.`;
    areas.push({
      kind: "stalled-epic",
      title: stalledTitle,
      detail: stalledDetail,
      confidence: "high",
      evidence,
      suggestedActions: ["Reassign the open issues", "Record the intended next step on each issue"]
    });
  }
  for (const item of loneWork(graph2, personId)) {
    areas.push({
      kind: "stalled-work",
      title: `${item.ref.title} has no other recorded owner`,
      detail: `This open issue is assigned to ${person.name} and sits in no epic, so nobody else is tied to it.`,
      confidence: "high",
      evidence: [item.ref],
      suggestedActions: ["Move the issue into an epic or project", "Name a new assignee"]
    });
  }
  const soloPages = graph2.pages.filter((p4) => p4.contributorIds.length === 1 && p4.contributorIds[0] === personId).sort((a, b2) => a.ref.id.localeCompare(b2.ref.id));
  for (const page of soloPages) {
    areas.push({
      kind: "orphaned-page",
      title: page.ref.title,
      detail: `${person.name} is the only recorded contributor on this page. No other editor is tied to this knowledge.`,
      confidence: "medium",
      evidence: [page.ref],
      suggestedActions: ["Add a second contributor or reviewer", "Schedule a knowledge-transfer session"]
    });
  }
  const blocked = graph2.decisions.filter(
    (d) => d.status !== "superseded" && (d.ownerId === personId || d.pendingApproverIds.includes(personId))
  ).sort((a, b2) => a.ref.id.localeCompare(b2.ref.id));
  for (const decision of blocked) {
    const isOwner = decision.ownerId === personId;
    const isApprover = decision.pendingApproverIds.includes(personId);
    const reason13 = isOwner ? `${person.name} owns this decision; if they leave, nobody is recorded to drive it to approval.` : `${person.name} is an outstanding approver; the decision cannot be finalised without them or a delegate.`;
    areas.push({
      kind: "blocked-decision",
      title: decision.ref.title,
      detail: reason13 + (isOwner && isApprover ? " They are also still listed as an outstanding approver." : ""),
      confidence: "high",
      evidence: [decision.ref],
      suggestedActions: isOwner ? ["Name a new decision owner", "Record the decision before the handover date"] : ["Name a delegate approver", "Record the decision before the handover date"]
    });
  }
  const openPrs = graph2.pullRequests.filter((p4) => p4.authorId === personId && p4.state === "open").sort((a, b2) => a.ref.id.localeCompare(b2.ref.id));
  for (const pr of openPrs) {
    areas.push({
      kind: "unmerged-change",
      title: pr.ref.title,
      detail: `This pull request is authored by ${person.name} and still open. The change loses its author if they leave.`,
      confidence: "high",
      evidence: [pr.ref],
      suggestedActions: ["Hand the review to another engineer", "Close it if the intent is no longer current"]
    });
  }
  const counts = {
    stalledEpics: areas.filter((a) => a.kind === "stalled-epic").length,
    stalledWork: areas.filter((a) => a.kind === "stalled-work").length,
    orphanedPages: areas.filter((a) => a.kind === "orphaned-page").length,
    blockedDecisions: areas.filter((a) => a.kind === "blocked-decision").length,
    unmergedChanges: areas.filter((a) => a.kind === "unmerged-change").length
  };
  return {
    personId,
    personName: person.name,
    areas,
    counts,
    caveats: CAVEATS2
  };
}
var EPIC_IMPACT_CAVEATS = [
  "Impact assumes a change to the epic (a scope change or cancellation); the records cannot show which parts of the scope would actually change.",
  "Pages and decisions are listed because they link to the epic; the records cannot show whether their content is still accurate."
];
var byRefId2 = (a, b2) => a.ref.id.localeCompare(b2.ref.id);
var RoleBook = class {
  byId = /* @__PURE__ */ new Map();
  add(personId, role) {
    if (!personId) return;
    const roles = this.byId.get(personId);
    if (roles) roles.add(role);
    else this.byId.set(personId, /* @__PURE__ */ new Set([role]));
  }
  /** People in canonical id order, each with alphabetically sorted roles. */
  people(graph2) {
    return graph2.people.filter((p4) => this.byId.has(p4.id)).map((person) => ({ person, roles: [...this.byId.get(person.id)].sort() })).sort((a, b2) => a.person.id.localeCompare(b2.person.id));
  }
};
function epicImpact(graph2, epicId) {
  const index3 = getIndex(graph2);
  const epic = index3.workById.get(epicId);
  if (!epic || epic.type !== "epic") throw new Error(`Unknown epic: ${epicId}`);
  const children = [...index3.childrenByEpic.get(epicId) ?? []].sort(byRefId2);
  const openChildren = children.filter((c) => c.status === "open");
  const intent = /* @__PURE__ */ new Map();
  const linkedDecisions = /* @__PURE__ */ new Map();
  const members = [epic, ...children];
  for (const m3 of members) {
    for (const pid of [...new Set(m3.linkedPageIds ?? [])]) {
      const decision = index3.decisionsById.get(pid);
      const page = index3.pagesById.get(pid);
      if (decision) {
        intent.set(pid, { ref: decision.ref, status: decision.status });
        linkedDecisions.set(pid, decision);
      } else if (page) {
        intent.set(pid, { ref: page.ref });
      }
    }
  }
  for (const m3 of members) {
    for (const decision of index3.decisionsByLinkedWorkItemId.get(m3.ref.id) ?? []) {
      intent.set(decision.ref.id, { ref: decision.ref, status: decision.status });
      linkedDecisions.set(decision.ref.id, decision);
    }
  }
  const areas = [];
  for (const item of openChildren) {
    areas.push({
      kind: "orphaned-work",
      title: `${item.ref.title} loses its recorded plan`,
      detail: `This open issue sits in ${epic.ref.title}; if the epic's scope changes or it is cancelled, the issue loses the recorded plan it belongs to.`,
      confidence: "high",
      evidence: [epic.ref, item.ref],
      suggestedActions: ["Re-parent the issue, or record its new plan on the issue itself"]
    });
  }
  for (const { ref, status } of [...intent.values()].sort((a, b2) => a.ref.id.localeCompare(b2.ref.id))) {
    const statusText = status ? ` It is still recorded as ${status}.` : "";
    areas.push({
      kind: "stale-spec",
      title: ref.title,
      detail: `${ref.title} is linked to ${epic.ref.title}. A change to the epic makes it worth re-checking this record against the new plan.${statusText}`,
      confidence: "medium",
      evidence: [epic.ref, ref],
      suggestedActions: ["Review the record against the new plan", "Update or mark it superseded where it no longer applies"]
    });
  }
  const seenPrs = /* @__PURE__ */ new Set();
  for (const item of openChildren) {
    for (const prId of [...new Set(item.linkedPullRequestIds ?? [])].sort()) {
      const pr = index3.pullRequestsById.get(prId);
      if (!pr || pr.state !== "open" || seenPrs.has(prId)) continue;
      seenPrs.add(prId);
      areas.push({
        kind: "unreviewed-change",
        title: pr.ref.title,
        detail: `This open pull request implements ${item.ref.title} in ${epic.ref.title}. If the epic's scope changes, review whether the change still matches the recorded intent.`,
        confidence: "medium",
        evidence: [epic.ref, item.ref, pr.ref],
        suggestedActions: ["Re-review the change against the new plan", "Close it if the intent is no longer current"]
      });
    }
  }
  const roles = new RoleBook();
  roles.add(epic.assigneeId, "owns the epic record");
  for (const item of openChildren) roles.add(item.assigneeId, "holds open work in this epic");
  for (const decision of linkedDecisions.values()) {
    roles.add(decision.ownerId, "owns a decision linked to this epic");
    for (const id of decision.pendingApproverIds) {
      roles.add(id, "is still approving a decision linked to this epic");
    }
  }
  const counts = {
    orphanedWork: areas.filter((a) => a.kind === "orphaned-work").length,
    staleSpecs: areas.filter((a) => a.kind === "stale-spec").length,
    unreviewedChanges: areas.filter((a) => a.kind === "unreviewed-change").length
  };
  return {
    epic: epic.ref,
    areas,
    counts,
    people: roles.people(graph2),
    gaps: traceEpic(graph2, epicId).gaps,
    caveats: EPIC_IMPACT_CAVEATS
  };
}
var DECISION_IMPACT_CAVEATS = [
  "Impact assumes a change to the decision (a supersession or reversal); the records cannot show which conclusions would actually change.",
  "Work is listed because it links to the decision; the records cannot show how much of that work truly depends on it."
];
function decisionImpact(graph2, decisionId) {
  const index3 = getIndex(graph2);
  const decision = index3.decisionsById.get(decisionId);
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);
  const linked = index3.workByDecisionId.get(decision.ref.id) ?? [];
  const openLinked = linked.filter((w) => w.status === "open");
  const areas = [];
  for (const item of openLinked) {
    areas.push({
      kind: "outdated-work",
      title: `${item.ref.title} may no longer match the intent`,
      detail: `This open issue is linked to "${decision.ref.title}". If the decision is superseded or reversed, the work must be reviewed against the new decision.`,
      confidence: "high",
      evidence: [decision.ref, item.ref],
      suggestedActions: ["Review the work against the new decision", "Update or close it if it is no longer valid"]
    });
  }
  const seenPrs = /* @__PURE__ */ new Set();
  for (const item of openLinked) {
    for (const prId of [...new Set(item.linkedPullRequestIds ?? [])].sort()) {
      const pr = index3.pullRequestsById.get(prId);
      if (!pr || pr.state !== "open" || seenPrs.has(prId)) continue;
      seenPrs.add(prId);
      areas.push({
        kind: "outdated-change",
        title: pr.ref.title,
        detail: `This open pull request implements ${item.ref.title}, which is linked to "${decision.ref.title}". If the decision changes, the change may implement the wrong intent.`,
        confidence: "medium",
        evidence: [decision.ref, item.ref, pr.ref],
        suggestedActions: ["Re-review the change against the new decision", "Close it if the intent is no longer current"]
      });
    }
  }
  const roles = new RoleBook();
  roles.add(decision.ownerId, "owns this decision");
  for (const id of decision.pendingApproverIds) roles.add(id, "is still approving this decision");
  for (const item of openLinked) {
    roles.add(item.assigneeId, "holds open work linked to this decision");
    for (const prId of [...new Set(item.linkedPullRequestIds ?? [])].sort()) {
      const pr = index3.pullRequestsById.get(prId);
      if (pr?.state === "open") roles.add(pr.authorId, "authored an open change linked to this decision");
    }
  }
  const counts = {
    outdatedWork: areas.filter((a) => a.kind === "outdated-work").length,
    outdatedChanges: areas.filter((a) => a.kind === "outdated-change").length
  };
  return {
    decision: decision.ref,
    status: decision.status,
    areas,
    counts,
    people: roles.people(graph2),
    caveats: DECISION_IMPACT_CAVEATS
  };
}

// ../core/src/pipeline.ts
function runPipelineOnJson(text, options = {}) {
  const { graph: graph2, warnings } = parseOrgGraphJson(text, options.context ?? "OrgGraph export");
  return {
    graph: graph2,
    index: getIndex(graph2),
    fingerprint: graphFingerprint(graph2),
    warnings,
    rejected: []
  };
}

// ../core/src/text.ts
function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
  "if",
  "then",
  "than",
  "so",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "when",
  "where",
  "why",
  "how",
  "do",
  "does",
  "did",
  "done",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "me",
  "my",
  "our",
  "ours",
  "your",
  "you",
  "us",
  "we",
  "they",
  "them",
  "their",
  "he",
  "she",
  "his",
  "her",
  "him",
  "i"
]);
function tokens(text) {
  return normalize(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}
function editDistance(a, b2, max3 = Infinity) {
  if (a === b2) return 0;
  const lenA = a.length;
  const lenB = b2.length;
  if (Math.abs(lenA - lenB) > max3) return max3 + 1;
  let prevPrev = new Int32Array(lenB + 1);
  let prev = new Int32Array(lenB + 1);
  let curr = new Int32Array(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;
  for (let i3 = 1; i3 <= lenA; i3++) {
    curr[0] = i3;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i3 - 1);
    for (let j = 1; j <= lenB; j++) {
      const cb = b2.charCodeAt(j - 1);
      const substitution = prev[j - 1] + (ca === cb ? 0 : 1);
      const insertion = prev[j] + 1;
      const deletion = curr[j - 1] + 1;
      let best = Math.min(substitution, insertion, deletion);
      if (i3 > 1 && j > 1 && ca === b2.charCodeAt(j - 2) && a.charCodeAt(i3 - 2) === cb) {
        best = Math.min(best, prevPrev[j - 2] + 1);
      }
      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > max3) return max3 + 1;
    const recycle = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = recycle;
  }
  const result = prev[lenB];
  return result > max3 ? max3 + 1 : result;
}
function typoBudget(token) {
  if (token.length <= 3) return 0;
  if (token.length <= 7) return 1;
  if (token.length <= 11) return 2;
  return 3;
}
function inflectionalMatch(word, candidate) {
  if (word === candidate) return true;
  const sOrEs = (base, suffixed) => base.length >= 3 && (suffixed === `${base}s` || suffixed === `${base}es`);
  if (sOrEs(word, candidate) || sOrEs(candidate, word)) return true;
  const yToIes = (base, plural) => base.length >= 4 && base.endsWith("y") && !"aeiou".includes(base[base.length - 2]) && plural === `${base.slice(0, -1)}ies`;
  return yToIes(word, candidate) || yToIes(candidate, word);
}
function tokenSimilarity(a, b2) {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection2 = 0;
  for (const t of setA) if (setB.has(t)) intersection2++;
  const union = setA.size + setB.size - intersection2;
  return intersection2 / union;
}

// ../core/src/matcher.ts
var AMBIGUITY_MARGIN = 0.1;
var MIN_SCORE = 0.55;
var MATCHER_CACHE = /* @__PURE__ */ new WeakMap();
function buildMatcherIndex(graph2) {
  const personTokenHolders = /* @__PURE__ */ new Map();
  const personProfiles = [];
  for (const person of graph2.people) {
    const nameTokens = personNameTokens(person);
    personProfiles.push({ person, nameTokens, idWord: person.id.toLowerCase() });
    for (const token of nameTokens) {
      const holders = personTokenHolders.get(token) ?? /* @__PURE__ */ new Set();
      holders.add(person);
      personTokenHolders.set(token, holders);
    }
  }
  const epicRecords = getIndex(graph2).epics.map((epic) => ({
    id: epic.ref.id,
    titleTokens: titleTokens(epic.ref.title),
    titleLower: normalize(epic.ref.title)
  }));
  const decisionRecords = graph2.decisions.map((decision) => ({
    id: decision.ref.id,
    titleTokens: titleTokens(decision.ref.title),
    titleLower: normalize(decision.ref.title.replace(/^decision:\s*/i, ""))
  }));
  return {
    personTokenHolders,
    personProfiles,
    epicRecords,
    epicDistinctive: distinctiveTokens(epicRecords.map((r) => r.titleTokens)),
    decisionRecords,
    decisionDistinctive: distinctiveTokens(decisionRecords.map((r) => r.titleTokens))
  };
}
function getMatcherIndex(graph2) {
  const cached = MATCHER_CACHE.get(graph2);
  if (cached) return cached;
  const index3 = buildMatcherIndex(graph2);
  MATCHER_CACHE.set(graph2, index3);
  return index3;
}
function rank(candidates, keyOf) {
  return candidates.filter((c) => c.score >= MIN_SCORE).sort((a, b2) => b2.score - a.score || keyOf(a.item).localeCompare(keyOf(b2.item)));
}
function tiedLeaders(ranked) {
  const top = ranked[0].score;
  return ranked.filter((c) => top - c.score <= AMBIGUITY_MARGIN);
}
function rawWords(question2) {
  return question2.split(/[^A-Za-z0-9-]+/).filter((w) => w.length > 0).map((w) => w.toLowerCase());
}
function containsAsWord(lower, needle) {
  if (needle.length === 0) return false;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    const before2 = at > 0 && /[A-Za-z0-9]/.test(lower.charAt(at - 1));
    const after = at + needle.length < lower.length && /[A-Za-z0-9]/.test(lower.charAt(at + needle.length));
    if (!before2 && !after) return true;
    at = lower.indexOf(needle, at + 1);
  }
  return false;
}
function prefixMatch(word, candidate) {
  if (candidate.startsWith(word) && word.length >= 3) return true;
  if (word.startsWith(candidate) && candidate.length >= 4) return true;
  return false;
}
function nameTokenMatches(word, candidate) {
  if (word === candidate) return true;
  if (inflectionalMatch(word, candidate)) return true;
  if (prefixMatch(word, candidate)) return true;
  const shortFragment = word.length === 3 && candidate.length >= 4 ? 1 : 0;
  const budget = Math.max(Math.min(typoBudget(word), typoBudget(candidate)), shortFragment);
  if (budget === 0) return false;
  return editDistance(word, candidate, budget) <= budget;
}
function personNameTokens(person) {
  return tokens(person.name);
}
function matchPerson(graph2, question2) {
  const q = question2.trim();
  const lower = normalize(q);
  const qTokens = tokens(q);
  const words2 = new Set(rawWords(q));
  const index3 = getMatcherIndex(graph2);
  const tokenHolders = index3.personTokenHolders;
  const scored = [];
  for (const { person, nameTokens, idWord } of getMatcherIndex(graph2).personProfiles) {
    if (q === person.id) {
      scored.push({ item: person, score: 1 });
      continue;
    }
    let score = 0;
    if (containsAsWord(lower, normalize(person.name))) score = 0.95;
    else {
      if (words2.has(idWord) && idWord.length >= 3) score = 0.8;
      const matched = nameTokens.filter((t) => qTokens.some((w) => nameTokenMatches(w, t)));
      const allMatched = nameTokens.length > 0 && matched.length === nameTokens.length;
      if (allMatched) {
        const exact = nameTokens.filter((t) => qTokens.includes(t)).length;
        score = Math.max(score, 0.9 + 0.02 * Math.min(exact, 2));
      } else if (matched.length > 0) {
        const distinctive = matched.some((t) => tokenHolders.get(t)?.size === 1);
        score = Math.max(score, distinctive ? 0.75 : 0.6);
      }
    }
    if (score > 0) scored.push({ item: person, score });
  }
  const ranked = rank(scored, (p4) => p4.id);
  if (ranked.length === 0) return unmatchedPersonMention(question2);
  const leaders = tiedLeaders(ranked);
  if (leaders.length > 1) return { ambiguous: leaders.map((c) => c.item) };
  return { person: ranked[0].item };
}
var SENTENCE_START_GRAMMAR = /* @__PURE__ */ new Set([
  "what",
  "who",
  "whom",
  "whose",
  "when",
  "where",
  "why",
  "how",
  "which",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "does",
  "do",
  "did",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "may",
  "have",
  "has",
  "had",
  "in",
  "on",
  "at",
  "for",
  "about",
  "list",
  "show",
  "give",
  "tell",
  "get",
  "find",
  "trace",
  "rank"
]);
function unmatchedPersonMention(question2) {
  const raw = question2.split(/\s+/);
  for (const [i3, token] of raw.entries()) {
    const word = token.replace(/[^A-Za-z'-]/g, "");
    if (/^[A-Z][a-z']{2,}$/.test(word)) {
      if (i3 === 0 && SENTENCE_START_GRAMMAR.has(word.toLowerCase())) continue;
      return { unmatchedMention: word };
    }
  }
  return {};
}
var EPIC_DOMAIN_WORDS = /* @__PURE__ */ new Set([
  "epic",
  "lineage",
  "trace",
  "behind",
  "impact",
  "breaks",
  "changes",
  "cancel",
  "descoped",
  "risks",
  "risk",
  "work"
]);
var EPIC_DOMAIN_PHRASES = [
  /\bsingle\s+points?\s+of\s+failure\b/i,
  /\bbottlenecks?\b/i,
  // "backbone" (session 12) is the same shape: "who is the payments
  // backbone?" asks for that epic's blast radius, so the distinctive token
  // ("payments") may anchor. "who is the team's backbone?" carries no epic
  // token and stays the people ranking.
  /\bbackbones?\b/i,
  // "weak spot" and "lynchpin" (session 13) complete the scoped-risk-idiom
  // family: "who is the payments weak spot?" and "who is the payments
  // lynchpin?" anchor that epic's blast radius like bottleneck/SPOF, while
  // the unscoped forms stay the people ranking.
  /\bweak\s+spots?\b/i,
  /\bl(?:in|yn)chpins?\b/i
];
var DECISION_DOMAIN_WORDS = /* @__PURE__ */ new Set([
  "decision",
  "decisions",
  "adr",
  "status",
  "trace",
  "impact",
  "breaks",
  "changes",
  "supersede",
  "superseded",
  "superseding",
  "reverse",
  "reversed",
  "cancel",
  "approved",
  "approval"
]);
var DECISION_DOMAIN_PHRASES = [
  /\bdecid(?:e|es|ed|ing)\b/i,
  /\bmade\s+the\s+call\b/i,
  /\bmov(?:e|es|ed|ing)\s+away\s+from\b/i
];
function titleTokens(title) {
  return tokens(title.replace(/^decision:\s*/i, ""));
}
function scoreRecord(input) {
  const { words: words2, idLower, lower, qTokens, titleTokens: titleTokens2, titleLower, distinctive, hasDomainWord } = input;
  if (words2.has(idLower)) return 1;
  if (titleLower.length >= 3 && containsAsWord(lower, titleLower)) return 0.95;
  const matched = titleTokens2.filter((t) => qTokens.some((w) => nameTokenMatches(w, t)));
  if (titleTokens2.length > 0 && matched.length === titleTokens2.length) return 0.88;
  const anchor = matched.find((t) => distinctive.has(t) && t.length >= 4);
  if (hasDomainWord && anchor) return 0.75;
  return 0;
}
function distinctiveTokens(titleTokenLists) {
  const count = /* @__PURE__ */ new Map();
  for (const ts of titleTokenLists) {
    for (const t of new Set(ts)) count.set(t, (count.get(t) ?? 0) + 1);
  }
  return titleTokenLists.map((ts) => {
    const set = /* @__PURE__ */ new Set();
    for (const t of new Set(ts)) if (count.get(t) === 1) set.add(t);
    return set;
  });
}
function matchEpic(graph2, question2, options = {}) {
  const q = question2.trim();
  const lower = normalize(q);
  const qTokens = tokens(q);
  const words2 = new Set(rawWords(q));
  const hasDomainWord = options.assumeDomain === true || qTokens.some((t) => EPIC_DOMAIN_WORDS.has(t)) || EPIC_DOMAIN_PHRASES.some((re) => re.test(q));
  const matcherIndex = getMatcherIndex(graph2);
  const records = matcherIndex.epicRecords;
  const distinctive = matcherIndex.epicDistinctive;
  const scored = [];
  records.forEach((record, i3) => {
    const score = scoreRecord({
      lower,
      qTokens,
      words: words2,
      idLower: record.id.toLowerCase(),
      titleTokens: record.titleTokens,
      titleLower: record.titleLower,
      distinctive: distinctive[i3],
      hasDomainWord
    });
    if (score > 0) scored.push({ item: record.id, score });
  });
  const ranked = rank(scored, (id) => id);
  if (ranked.length === 0) return {};
  if (tiedLeaders(ranked).length > 1) return { ambiguous: true };
  return { epicId: ranked[0].item };
}
function matchDecision(graph2, question2, options = {}) {
  const q = question2.trim();
  const lower = normalize(q);
  const qTokens = tokens(q);
  const words2 = new Set(rawWords(q));
  const hasDomainWord = options.assumeDomain === true || qTokens.some((t) => DECISION_DOMAIN_WORDS.has(t)) || DECISION_DOMAIN_PHRASES.some((re) => re.test(q));
  const matcherIndex = getMatcherIndex(graph2);
  const records = matcherIndex.decisionRecords;
  const distinctive = matcherIndex.decisionDistinctive;
  const scored = [];
  records.forEach((record, i3) => {
    const score = scoreRecord({
      lower,
      qTokens,
      words: words2,
      idLower: record.id.toLowerCase(),
      titleTokens: record.titleTokens,
      titleLower: record.titleLower,
      distinctive: distinctive[i3],
      hasDomainWord
    });
    if (score > 0) scored.push({ item: record.id, score });
  });
  const ranked = rank(scored, (id) => id);
  if (ranked.length === 0) return {};
  if (tiedLeaders(ranked).length > 1) return { ambiguous: true };
  return { decisionId: ranked[0].item };
}
var resolveError = (code, message, candidates) => Object.assign(new Error(message), { code, candidates });
function resolvePerson(graph2, query) {
  const match2 = matchPerson(graph2, query);
  if (match2.person) return match2.person;
  const known = graph2.people.map((p4) => `${p4.name} (${p4.id})`).join(", ") || "none";
  if (match2.ambiguous) {
    throw resolveError(
      "ambiguous",
      `Multiple people match '${query}': ${match2.ambiguous.map((p4) => p4.name).join(", ")}. Use the exact name or id.`,
      match2.ambiguous.map((p4) => p4.name)
    );
  }
  throw resolveError("not-found", `No person matches '${query}'. Known people: ${known}.`, []);
}
function resolveEpic(graph2, query) {
  const index3 = getIndex(graph2);
  const match2 = matchEpic(graph2, query, { assumeDomain: true });
  if (match2.epicId) {
    const epic = index3.workById.get(match2.epicId);
    if (epic) return epic;
  }
  const known = index3.epics.map((e) => e.ref.id).join(", ") || "none";
  if (match2.ambiguous) {
    throw resolveError("ambiguous", `Multiple epics match '${query}'. Known epics: ${known}.`, []);
  }
  throw resolveError("not-found", `No epic matches '${query}'. Known epics: ${known}.`, []);
}
function resolveDecisionId(graph2, query) {
  const match2 = matchDecision(graph2, query, { assumeDomain: true });
  if (match2.decisionId) return match2.decisionId;
  const known = graph2.decisions.map((d) => d.ref.id).join(", ") || "none";
  if (match2.ambiguous) {
    throw resolveError("ambiguous", `Multiple decisions match '${query}'. Known decisions: ${known}.`, []);
  }
  throw resolveError("not-found", `No decision matches '${query}'. Known decisions: ${known}.`, []);
}

// ../../node_modules/compromise/src/API/world.js
var methods = {
  one: {},
  two: {},
  three: {},
  four: {}
};
var model = {
  one: {},
  two: {},
  three: {}
};
var compute = {};
var hooks = [];
var world_default = { methods, model, compute, hooks };

// ../../node_modules/compromise/src/API/methods/compute.js
var fns = {
  /** add metadata to term objects */
  compute: function(input, options) {
    const { world: world2 } = this;
    const compute4 = world2.compute;
    if (typeof input === "string" && Object.hasOwn(compute4, input)) {
      compute4[input](this, options);
    } else if (Array.isArray(input)) {
      input.forEach((name) => {
        if (Object.hasOwn(world2.compute, name)) {
          compute4[name](this, options);
        } else {
          console.warn("no compute:", input);
        }
      });
    } else if (typeof input === "function") {
      input(this, options);
    } else {
      console.warn("no compute:", input);
    }
    return this;
  }
};
var compute_default = fns;

// ../../node_modules/compromise/src/API/methods/loops.js
var wrap = (view, cb) => (ptr, i3) => cb(view.update([ptr]), i3);
var forEach = function(cb) {
  this.fullPointer.forEach(wrap(this, cb));
  return this;
};
var map = function(cb, empty2) {
  const run = wrap(this, cb);
  const res = this.fullPointer.map((ptr, i3) => {
    const out2 = run(ptr, i3);
    if (out2 === void 0) {
      return this.none();
    }
    return out2;
  });
  if (res.length === 0) {
    return empty2 || this.update([]);
  }
  if (res[0] !== void 0) {
    if (typeof res[0] === "string") {
      return res;
    }
    if (typeof res[0] === "object" && (res[0] === null || !res[0].isView)) {
      return res;
    }
  }
  let all4 = [];
  res.forEach((ptr) => {
    all4 = all4.concat(ptr.fullPointer);
  });
  return this.toView(all4);
};
var filter = function(cb) {
  return this.update(this.fullPointer.filter(wrap(this, cb)));
};
var find = function(cb) {
  const found = this.fullPointer.find(wrap(this, cb));
  if (found === void 0) {
    return this.update([]);
  }
  return this.update([found]);
};
var some = function(cb) {
  return this.fullPointer.some(wrap(this, cb));
};
var random = function(n2 = 1) {
  let ptrs = this.fullPointer;
  let r = Math.floor(Math.random() * ptrs.length);
  if (r + n2 > this.length) {
    r = this.length - n2;
    r = r < 0 ? 0 : r;
  }
  ptrs = ptrs.slice(r, r + n2);
  return this.update(ptrs);
};
var loops_default = { forEach, map, filter, find, some, random };

// ../../node_modules/compromise/src/API/_helpers.js
var rawPointer = (view) => view.pointer || view.docs.map((_d, n2) => [n2]);
var retag = function(view, computes) {
  view.compute([...computes, "freeze", "lexicon"]);
  if (view.world.compute.preTagger) {
    view.compute("preTagger");
  }
  view.compute("unfreeze");
  return view;
};

// ../../node_modules/compromise/src/API/methods/utils.js
var utils = {
  /** */
  termList: function() {
    return this.methods.one.termList(this.docs);
  },
  /** return individual terms*/
  terms: function(n2) {
    const m3 = this.match(".");
    return typeof n2 === "number" ? m3.eq(n2) : m3;
  },
  /** */
  groups: function(group) {
    if (group || group === 0) {
      return this.update(this._groups[group] || []);
    }
    const res = {};
    Object.keys(this._groups).forEach((k2) => {
      res[k2] = this.update(this._groups[k2]);
    });
    return res;
  },
  /** */
  eq: function(n2) {
    const ptr = rawPointer(this);
    if (ptr[n2]) {
      return this.update([ptr[n2]]);
    }
    return this.none();
  },
  /** */
  first: function() {
    return this.eq(0);
  },
  /** */
  last: function() {
    const n2 = this.fullPointer.length - 1;
    return this.eq(n2);
  },
  /** grab term[0] for every match */
  firstTerms: function() {
    return this.match("^.");
  },
  /** grab the last term for every match  */
  lastTerms: function() {
    return this.match(".$");
  },
  /** */
  slice: function(min2, max3) {
    return this.update(rawPointer(this).slice(min2, max3));
  },
  /** return a view of the entire document */
  all: function() {
    return this.update().toView();
  },
  /**  */
  fullSentences: function() {
    const ptrs = this.fullPointer.map((a) => [a[0]]);
    return this.update(ptrs).toView();
  },
  /** return a view of no parts of the document */
  none: function() {
    return this.update([]);
  },
  /** are these two views looking at the same words? */
  isDoc: function(b2) {
    if (!b2 || !b2.isView) {
      return false;
    }
    const aPtr = this.fullPointer;
    const bPtr = b2.fullPointer;
    if (aPtr.length !== bPtr.length) {
      return false;
    }
    return aPtr.every((ptr, i3) => bPtr[i3] && ptr[0] === bPtr[i3][0] && ptr[1] === bPtr[i3][1] && ptr[2] === bPtr[i3][2]);
  },
  /** how many seperate terms does the document have? */
  wordCount: function() {
    return this.docs.reduce((count, terms) => {
      count += terms.filter((t) => t.text !== "").length;
      return count;
    }, 0);
  },
  // is the pointer the full sentence?
  isFull: function() {
    const ptrs = this.pointer;
    if (!ptrs) {
      return true;
    }
    if (ptrs.length === 0 || ptrs[0][0] !== 0) {
      return false;
    }
    let wantTerms = 0;
    let haveTerms = 0;
    this.document.forEach((terms) => wantTerms += terms.length);
    this.docs.forEach((terms) => haveTerms += terms.length);
    return wantTerms === haveTerms;
  },
  // return the nth elem of a doc
  getNth: function(n2) {
    if (typeof n2 === "number") {
      return this.eq(n2);
    } else if (typeof n2 === "string") {
      return this.if(n2);
    }
    return this;
  }
};
utils.group = utils.groups;
utils.fullSentence = utils.fullSentences;
utils.sentence = utils.fullSentences;
utils.lastTerm = utils.lastTerms;
utils.firstTerm = utils.firstTerms;
var utils_default = utils;

// ../../node_modules/compromise/src/API/methods/index.js
var methods2 = { ...utils_default, ...compute_default, ...loops_default };
methods2.get = methods2.eq;
var methods_default = methods2;

// ../../node_modules/compromise/src/API/View.js
var View = class _View {
  constructor(document, pointer, groups2 = {}) {
    const props = [
      ["document", document],
      ["world", world_default],
      ["_groups", groups2],
      ["_cache", null]
    ];
    props.forEach((a) => {
      Object.defineProperty(this, a[0], {
        value: a[1],
        writable: true
      });
    });
    this.ptrs = pointer;
  }
  /* getters:  */
  get docs() {
    let docs = this.document;
    if (this.ptrs) {
      docs = world_default.methods.one.getDoc(this.ptrs, this.document);
    }
    return docs;
  }
  get pointer() {
    return this.ptrs;
  }
  get methods() {
    return this.world.methods;
  }
  get model() {
    return this.world.model;
  }
  get hooks() {
    return this.world.hooks;
  }
  get isView() {
    return true;
  }
  // is the view not-empty?
  get found() {
    return this.docs.length > 0;
  }
  // how many matches we have
  get length() {
    return this.docs.length;
  }
  // return a more-hackable pointer
  get fullPointer() {
    const { docs, ptrs, document } = this;
    const pointers = ptrs || docs.map((_d, n2) => [n2]);
    return pointers.map((a) => {
      let [n2, start2, end2, id, endId] = a;
      start2 ||= 0;
      end2 ||= (document[n2] || []).length;
      if (document[n2]?.[start2]) {
        id ||= document[n2][start2].id;
        if (document[n2][end2 - 1]) {
          endId ||= document[n2][end2 - 1].id;
        }
      }
      return [n2, start2, end2, id, endId];
    });
  }
  // create a new View, from this one
  update(pointer) {
    const m3 = new _View(this.document, pointer);
    if (this._cache && pointer?.length > 0) {
      const cache3 = [];
      pointer.forEach((ptr, i3) => {
        const [n2, start2, end2] = ptr;
        if (ptr.length === 1) {
          cache3[i3] = this._cache[n2];
        } else if (start2 === 0 && this.document[n2].length === end2) {
          cache3[i3] = this._cache[n2];
        }
      });
      if (cache3.length > 0) {
        m3._cache = cache3;
      }
    }
    m3.world = this.world;
    return m3;
  }
  // create a new View, from this one
  toView(pointer) {
    return new _View(this.document, pointer || this.pointer);
  }
  fromText(input) {
    const { methods: methods20 } = this;
    const document = methods20.one.tokenize.fromString(input, this.world);
    const doc = new _View(document);
    doc.world = this.world;
    return retag(doc, ["normal"]);
  }
  clone() {
    let document = this.document.slice(0);
    document = document.map((terms) => {
      return terms.map((term) => {
        term = { ...term };
        term.tags = new Set(term.tags);
        return term;
      });
    });
    const m3 = this.update(this.pointer);
    m3.document = document;
    m3._cache = this._cache;
    return m3;
  }
};
Object.assign(View.prototype, methods_default);
View.prototype.viewType = "View";
var View_default = View;

// ../../node_modules/compromise/src/_version.js
var version_default = "14.20.0";

// ../../node_modules/compromise/src/API/extend.js
var isObject = function(item) {
  return item && typeof item === "object" && !Array.isArray(item);
};
var isUnsafeKey = (key) => key === "__proto__" || key === "constructor" || key === "prototype";
function mergeDeep(model5, plugin7) {
  if (isObject(plugin7)) {
    for (const key in plugin7) {
      if (isUnsafeKey(key)) {
        continue;
      }
      if (isObject(plugin7[key])) {
        if (!model5[key]) {
          model5[key] = {};
        }
        mergeDeep(model5[key], plugin7[key]);
      } else if (Array.isArray(plugin7[key]) && Array.isArray(model5[key])) {
        model5[key] = model5[key].concat(plugin7[key]);
      } else {
        model5[key] = plugin7[key];
      }
    }
  }
  return model5;
}
function mergeQuick(model5, plugin7) {
  for (const key in plugin7) {
    if (isUnsafeKey(key)) continue;
    model5[key] ||= {};
    Object.assign(model5[key], plugin7[key]);
  }
  return model5;
}
var irregularForms = [
  ["pastTense", "Past"],
  ["presentTense", "Present"],
  ["gerund", "Gerund"],
  ["comparative", "Comparative"],
  ["superlative", "Superlative"]
];
var addIrregulars = function(model5, conj) {
  const m3 = model5.two.models || {};
  Object.keys(conj).forEach((k2) => {
    irregularForms.forEach(([prop, name]) => {
      const form = conj[k2][prop];
      if (!form) {
        return;
      }
      if (m3["to" + name]) {
        m3["to" + name].ex[k2] = form;
      }
      if (m3["from" + name]) {
        m3["from" + name].ex[form] = k2;
      }
    });
  });
};
var extend = function(plugin7, world2, View2, nlp3) {
  if (Array.isArray(plugin7)) {
    plugin7.forEach((p4) => extend(p4, world2, View2, nlp3));
    return;
  }
  const { methods: methods20, model: model5, compute: compute4, hooks: hooks2 } = world2;
  if (plugin7.methods) {
    mergeQuick(methods20, plugin7.methods);
  }
  if (plugin7.model) {
    mergeDeep(model5, plugin7.model);
  }
  if (plugin7.irregulars) {
    addIrregulars(model5, plugin7.irregulars);
  }
  if (plugin7.compute) {
    Object.assign(compute4, plugin7.compute);
  }
  if (hooks2) {
    world2.hooks = hooks2.concat(plugin7.hooks || []);
  }
  if (plugin7.onReplace) {
    methods20.one.onReplace = (methods20.one.onReplace || []).concat(plugin7.onReplace);
  }
  if (plugin7.api) {
    plugin7.api(View2);
  }
  if (plugin7.lib) {
    Object.keys(plugin7.lib).forEach((k2) => nlp3[k2] = plugin7.lib[k2]);
  }
  if (plugin7.tags) {
    nlp3.addTags(plugin7.tags);
  }
  if (plugin7.words) {
    nlp3.addWords(plugin7.words);
  }
  if (plugin7.frozen) {
    nlp3.addWords(plugin7.frozen, true);
  }
  if (plugin7.mutate) {
    plugin7.mutate(world2, nlp3);
  }
};
var extend_default = extend;

// ../../node_modules/compromise/src/API/_color.js
var color_exports = {};
__export(color_exports, {
  b: () => b,
  blue: () => blue,
  cyan: () => cyan,
  dim: () => dim,
  green: () => green,
  grey: () => grey,
  i: () => i,
  red: () => red,
  ul: () => ul,
  yellow: () => yellow
});
var off = typeof process !== "undefined" && Object.hasOwn(process.env || {}, "NO_COLOR");
var color = (code) => (s) => off ? s : "\x1B[" + code + "m" + s + "\x1B[0m";
var green = color(32);
var red = color(31);
var blue = color(34);
var cyan = color(36);
var yellow = color(33);
var dim = color(2);
var i = color(3);
var b = color(1);
var ul = color(4);
var grey = color(90);

// ../../node_modules/compromise/src/API/debug/debug.js
var env = globalThis.process?.env ?? globalThis.env ?? {};
var debug = { tags: Boolean(env.DEBUG_TAGS) };
var before = (term) => {
  if (debug.tags && (!debug.word || debug.word === (term.normal || term.text || term.implicit || "").toLowerCase())) {
    return [...term.tags];
  }
  return null;
};
var log = (term, previous, reason13 = "") => {
  if (!previous) {
    return;
  }
  const added = [...term.tags].filter((tag) => !previous.includes(tag));
  const removed = previous.filter((tag) => !term.tags.has(tag));
  if (!added.length && !removed.length) {
    return;
  }
  const text = term.text || term.implicit || "";
  const index3 = term.index?.join(":") || "?";
  const prefix6 = debug.prefix || "   ";
  if (debug.rule !== reason13) {
    const headingPrefix = debug.prefix ? prefix6.replace("\u2502  ", "\u2502 ") : "  ";
    console.log(`${headingPrefix}${dim((reason13 || "tag change") + ":")}`);
    debug.rule = reason13;
  }
  const print = (tags, sign, color2) => {
    if (!tags.length) {
      return;
    }
    const word = color2(`'${text}'`);
    const changes = tags.map((tag) => color2(`#${tag}`)).join(" ");
    console.log(`${prefix6}${color2(sign)} ${word} ${dim(index3.padEnd(9))} ${changes}`);
  };
  print(removed, "\u2212", red);
  print(added, "+", green);
};
debug.before = before;
debug.log = log;
var debug_default = debug;

// ../../node_modules/compromise/src/API/debug/match-debug.js
var matchDebug = (world2, options) => {
  const one = world2.methods.one;
  const match2 = one.match;
  const parse9 = one.parseMatch;
  const sources = /* @__PURE__ */ new WeakMap();
  const word = options.word?.toLowerCase();
  const includesWord = (terms) => !word || terms.some((term) => (term.normal || term.text || term.implicit || "").toLowerCase() === word);
  const parseLogged = function(...args) {
    const regs = parse9.apply(this, args);
    sources.set(regs, String(args[0]));
    return regs;
  };
  const matchLogged = function(docs, todo, cache3) {
    const result = match2.call(this, docs, todo, cache3);
    const pattern = todo.match || sources.get(todo.regs) || "[parsed pattern]";
    if (options.pattern !== void 0 && pattern !== options.pattern) {
      return result;
    }
    if (word && !docs.some(includesWord)) {
      return result;
    }
    const matches3 = result.ptrs.map(([n2, start2, end2]) => docs[n2].slice(start2, end2)).filter(includesWord);
    if (word && result.ptrs.length && !matches3.length) {
      return result;
    }
    debug_default.rule = void 0;
    const status = result.ptrs.length ? green("\u2713") : red("\u2717");
    const spans = matches3.map((terms) => {
      const text = terms.map((term) => term.text || term.implicit).join(" ");
      return `${green("'" + text + "'")} ${dim(terms[0]?.index?.join(":") || "?")}`;
    }).join(", ");
    const rule = pattern.length > 80 ? pattern.slice(0, 79) + "\u2026" : pattern;
    const words2 = spans ? spans + "  " : " ---         ";
    console.log(`${debug_default.prefix || "   "}${status} ${words2}${dim(i(rule))}`);
    return result;
  };
  one.parseMatch = parseLogged;
  one.match = matchLogged;
  return () => {
    if (one.parseMatch === parseLogged) {
      one.parseMatch = parse9;
    }
    if (one.match === matchLogged) {
      one.match = match2;
    }
  };
};
var match_debug_default = matchDebug;

// ../../node_modules/compromise/src/API/debug/hooks-debug.js
var colorSpec = (doc) => {
  return doc.docs.map((terms, index3) => {
    const plain = terms.map((t) => t.pre + t.text + t.post).join("").trim();
    const text = dim("'" + plain + "'");
    const spec = doc.update([[index3]]).out("spec");
    return text + grey(i(spec.slice(plain.length)));
  }).join("\n");
};
var hooksDebug = (headings) => (doc, hooks2) => {
  const width2 = Math.max("tokenize".length, ...hooks2.map((hook) => hook.length));
  const snapshot = (hook, nested = false) => {
    const output = colorSpec(doc);
    output.split("\n").forEach((line, index3, lines) => {
      if (nested) {
        const branch = index3 === lines.length - 1 ? " \u2570\u2500" : "\u2502 ";
        console.log(`  ${dim(branch)} ${line}`);
        return;
      }
      const label = (index3 === 0 ? hook : "").padEnd(width2);
      console.log(`  ${dim(label)}  ${line}`);
    });
  };
  snapshot("tokenize");
  hooks2.forEach((hook) => {
    const nested = headings;
    const prefix6 = debug_default.prefix;
    const rule = debug_default.rule;
    debug_default.rule = void 0;
    if (nested) {
      console.log(`  ${blue(b(ul(hook + ":")))}`);
      debug_default.prefix = dim("   \u2502  ");
    }
    try {
      doc.compute(hook);
      snapshot(hook, nested);
    } finally {
      debug_default.prefix = prefix6;
      debug_default.rule = rule;
    }
  });
};
var hooks_debug_default = hooksDebug;

// ../../node_modules/compromise/src/API/_lib.js
var restoreMatch;
var verbose = function(set = true, options = {}) {
  restoreMatch?.();
  restoreMatch = void 0;
  if (set === "match" || set === true) {
    restoreMatch = match_debug_default(this._world, options);
  }
  debug_default.hooks = set === "hooks" || set === true ? hooks_debug_default(set === true) : void 0;
  debug_default.word = options.word?.toLowerCase();
  debug_default.contractions = set === "contractions" || set === true;
  debug_default.rule = void 0;
  debug_default.tags = set === "tagger" || set === true;
  debug_default.spec = set === "spec" || set === true;
  return this;
};

// ../../node_modules/compromise/src/API/_is.js
var isObject2 = (val) => Object.prototype.toString.call(val) === "[object Object]";
var is_default = isObject2;

// ../../node_modules/compromise/src/API/inputs.js
var fromJson = function(json) {
  return json.map((o) => {
    return o.terms.map((term) => {
      if (Array.isArray(term.tags)) {
        term.tags = new Set(term.tags);
      }
      return term;
    });
  });
};
var preTokenized = function(arr) {
  return arr.map((a) => {
    return a.map((str) => {
      return {
        text: str,
        normal: str,
        //cleanup
        pre: "",
        post: " ",
        tags: /* @__PURE__ */ new Set()
      };
    });
  });
};
var inputs = function(input, View2, world2) {
  const { methods: methods20 } = world2;
  const doc = new View2([]);
  doc.world = world2;
  if (typeof input === "number") {
    input = String(input);
  }
  if (!input) {
    return doc;
  }
  if (typeof input === "string") {
    const document = methods20.one.tokenize.fromString(input, world2);
    return new View2(document);
  }
  if (is_default(input) && input.isView) {
    return new View2(input.document, input.ptrs);
  }
  if (Array.isArray(input)) {
    if (Array.isArray(input[0])) {
      const document2 = preTokenized(input);
      return new View2(document2);
    }
    const document = fromJson(input);
    return new View2(document);
  }
  return doc;
};
var inputs_default = inputs;

// ../../node_modules/compromise/src/nlp.js
var world = { ...world_default };
var preTag = ["alias", "normal", "machine", "contractions"];
var nlp = function nlp2(input, lex) {
  if (lex) {
    nlp2.addWords(lex);
  }
  const doc = inputs_default(input, View_default, world);
  if (input) {
    if (debug_default.hooks) {
      debug_default.hooks(doc, world.hooks);
    } else {
      doc.compute(world.hooks);
    }
  }
  return doc;
};
Object.defineProperty(nlp, "_world", {
  value: world,
  writable: true
});
nlp.tokenize = function(input, lex) {
  const { compute: compute4 } = this._world;
  if (lex) {
    nlp.addWords(lex);
  }
  const doc = inputs_default(input, View_default, world);
  if (debug_default.hooks) {
    debug_default.hooks(doc, compute4.contractions ? preTag : []);
  } else if (compute4.contractions) {
    doc.compute(preTag);
  }
  return doc;
};
nlp.plugin = function(plugin7) {
  extend_default(plugin7, this._world, View_default, this);
  return this;
};
nlp.extend = nlp.plugin;
nlp.world = function() {
  return this._world;
};
nlp.model = function() {
  return this._world.model;
};
nlp.methods = function() {
  return this._world.methods;
};
nlp.hooks = function() {
  return this._world.hooks;
};
nlp.verbose = verbose;
nlp.version = version_default;
var nlp_default = nlp;

// ../../node_modules/compromise/src/1-one/cache/methods/cacheDoc.js
var createCache = function(document) {
  const cache3 = document.map((terms) => {
    const items = /* @__PURE__ */ new Set();
    terms.forEach((term) => {
      if (term.normal !== "") {
        items.add(term.normal);
      }
      if (term.switch) {
        items.add(`%${term.switch}%`);
      }
      if (term.implicit) {
        items.add(term.implicit);
      }
      if (term.machine) {
        items.add(term.machine);
      }
      if (term.root) {
        items.add(term.root);
      }
      if (term.alias) {
        term.alias.forEach((str) => items.add(str));
      }
      term.tags.forEach((tag) => {
        items.add("#" + tag);
      });
    });
    return items;
  });
  return cache3;
};
var cacheDoc_default = createCache;

// ../../node_modules/compromise/src/1-one/cache/methods/index.js
var methods_default2 = {
  one: {
    cacheDoc: cacheDoc_default
  }
};

// ../../node_modules/compromise/src/1-one/cache/api.js
var methods3 = {
  /** */
  cache: function() {
    this._cache = this.methods.one.cacheDoc(this.document);
    return this;
  },
  /** */
  uncache: function() {
    this._cache = null;
    return this;
  }
};
var addAPI = function(View2) {
  Object.assign(View2.prototype, methods3);
};
var api_default = addAPI;

// ../../node_modules/compromise/src/1-one/cache/compute.js
var compute_default2 = {
  cache: function(view) {
    view._cache = view.methods.one.cacheDoc(view.document);
  }
};

// ../../node_modules/compromise/src/1-one/cache/plugin.js
var plugin_default = {
  api: api_default,
  compute: compute_default2,
  methods: methods_default2
};

// ../../node_modules/compromise/src/1-one/tokenize/compute/_lib.js
var eachTerm = (docs, fn) => {
  for (let n2 = 0; n2 < docs.length; n2 += 1) {
    const terms = docs[n2];
    for (let t = 0; t < terms.length; t += 1) {
      fn(terms[t], terms, t, n2);
    }
  }
};
var lib_default = eachTerm;

// ../../node_modules/compromise/src/1-one/change/api/case.js
var titleCase = (str) => str.replace(/^ *[a-z\u00C0-\u00FF]/, (x) => x.toUpperCase());
var mapText = function(view, fn) {
  view.termList().forEach((t) => {
    t.text = fn(t.text);
  });
  return view;
};
var case_default = {
  /** */
  toLowerCase: function() {
    return mapText(this, (str) => str.toLowerCase());
  },
  /** */
  toUpperCase: function() {
    return mapText(this, (str) => str.toUpperCase());
  },
  /** */
  toTitleCase: function() {
    return mapText(this, titleCase);
  },
  /** */
  toCamelCase: function() {
    lib_default(this.docs, (t, terms, i3) => {
      if (i3 !== 0) {
        t.text = titleCase(t.text);
      }
      if (i3 !== terms.length - 1) {
        t.post = "";
      }
    });
    return this;
  }
};

// ../../node_modules/compromise/src/1-one/change/api/lib/_case.js
var isTitleCase = (str) => new RegExp("^\\p{Lu}[\\p{Ll}'\u2019]", "u").test(str) || new RegExp("^\\p{Lu}$", "u").test(str);
var toTitleCase = (str) => str.replace(new RegExp("^\\p{Ll}", "u"), (x) => x.toUpperCase());
var toLowerCase = (str) => str.replace(new RegExp("^\\p{Lu}", "u"), (x) => x.toLowerCase());

// ../../node_modules/compromise/src/1-one/change/api/lib/insert.js
var spliceArr = (parent, index3, child) => {
  child.forEach((term) => term.dirty = true);
  if (parent) {
    parent.splice(index3, 0, ...child);
  }
  return parent;
};
var endSpace = function(terms) {
  const hasSpace2 = / $/;
  const hasDash3 = /[-–—]/;
  const lastTerm = terms.at(-1);
  if (lastTerm && !hasSpace2.test(lastTerm.post) && !hasDash3.test(lastTerm.post)) {
    lastTerm.post += " ";
  }
};
var movePunct = (source, end2, needle) => {
  const juicy = /[-.?!,;:)–—'"]/g;
  const wasLast = source[end2 - 1];
  if (!wasLast) {
    return;
  }
  const post = wasLast.post;
  if (juicy.test(post)) {
    const punct2 = post.match(juicy).join("");
    const last = needle.at(-1);
    last.post = punct2 + last.post;
    wasLast.post = wasLast.post.replace(juicy, "");
  }
};
var moveTitleCase = function(home, start2, needle) {
  const from = home[start2];
  if (start2 !== 0 || !isTitleCase(from.text)) {
    return;
  }
  needle[0].text = toTitleCase(needle[0].text);
  const old = home[start2];
  if (old.tags.has("ProperNoun") || old.tags.has("Acronym")) {
    return;
  }
  if (isTitleCase(old.text) && old.text.length > 1) {
    old.text = toLowerCase(old.text);
  }
};
var cleanPrepend = function(home, ptr, needle, document) {
  const [n2, start2, end2] = ptr;
  if (start2 === 0) {
    endSpace(needle);
  } else if (end2 === document[n2].length) {
    endSpace(needle);
  } else {
    endSpace(needle);
    endSpace([home[ptr[1]]]);
  }
  moveTitleCase(home, start2, needle);
  spliceArr(home, start2, needle);
};
var cleanAppend = function(home, ptr, needle, document) {
  const [n2, , end2] = ptr;
  const total = (document[n2] || []).length;
  if (end2 < total) {
    movePunct(home, end2, needle);
    endSpace(needle);
  } else if (total === end2) {
    endSpace(home);
    movePunct(home, end2, needle);
    if (document[n2 + 1]) {
      needle.at(-1).post += " ";
    }
  }
  spliceArr(home, ptr[2], needle);
  ptr[4] = needle.at(-1).id;
};

// ../../node_modules/compromise/src/1-one/change/compute/uuid.js
var index = 0;
var pad3 = (str) => str.padStart(3, "0");
var toId = function(term) {
  let [n2, i3] = term.index || [0, 0];
  index += 1;
  index = index > 46655 ? 0 : index;
  n2 = n2 > 46655 ? 0 : n2;
  i3 = i3 > 1294 ? 0 : i3;
  let id = pad3(index.toString(36));
  id += pad3(n2.toString(36));
  id += i3.toString(36).padStart(2, "0");
  const r = parseInt(Math.random() * 36, 10);
  id += r.toString(36);
  return term.normal + "|" + id.toUpperCase();
};
var uuid_default = toId;

// ../../node_modules/compromise/src/1-one/change/api/lib/_expand.js
var expandContraction = function(m3) {
  if (m3.has("@hasContraction") && m3.contractions) {
    m3.grow("@hasContraction").contractions().expand();
  }
};
var expand_default = expandContraction;

// ../../node_modules/compromise/src/1-one/change/api/insert.js
var addIds = function(terms) {
  terms = terms.map((term) => {
    term.id = uuid_default(term);
    return term;
  });
  return terms;
};
var getTerms = function(input, world2) {
  const { methods: methods20 } = world2;
  if (typeof input === "string") {
    return methods20.one.tokenize.fromString(input, world2)[0];
  }
  if (typeof input === "object" && input.isView) {
    return input.clone().docs[0] || [];
  }
  if (Array.isArray(input)) {
    return Array.isArray(input[0]) ? input[0] : input;
  }
  return [];
};
var insert = function(input, view, prepend) {
  const { document, world: world2 } = view;
  view.uncache();
  const ptrs = view.fullPointer;
  const selfPtrs = view.fullPointer;
  view.forEach((m3, i3) => {
    const ptr = m3.fullPointer[0];
    const [n2] = ptr;
    const home = document[n2];
    let terms = getTerms(input, world2);
    if (terms.length === 0) {
      return;
    }
    terms = addIds(terms);
    if (prepend) {
      expand_default(view.update([ptr]).firstTerm());
      cleanPrepend(home, ptr, terms, document);
    } else {
      expand_default(view.update([ptr]).lastTerm());
      cleanAppend(home, ptr, terms, document);
    }
    if (document[n2]?.[ptr[1]]) {
      ptr[3] = document[n2][ptr[1]].id;
    }
    selfPtrs[i3] = ptr;
    ptr[2] += terms.length;
    ptrs[i3] = ptr;
  });
  const doc = view.toView(ptrs);
  view.ptrs = selfPtrs;
  return retag(doc, ["id", "index"]);
};
var fns2 = {
  insertAfter: function(input) {
    return insert(input, this, false);
  },
  insertBefore: function(input) {
    return insert(input, this, true);
  }
};
fns2.append = fns2.insertAfter;
fns2.prepend = fns2.insertBefore;
fns2.insert = fns2.insertAfter;
var insert_default = fns2;

// ../../node_modules/compromise/src/1-one/change/api/replace.js
var dollarStub = /\$[0-9a-z]+/g;
var fns3 = {};
var replaceByFn = function(main2, fn, keep2) {
  const ptrs = [];
  main2.forEach((m3, i3) => {
    const out2 = m3.replaceWith(fn(m3, i3), keep2);
    ptrs.push(...out2.fullPointer);
  });
  if (main2.ptrs) {
    main2.ptrs = ptrs;
  }
  return main2;
};
var subDollarSign = function(input, main2, [n2, start2, end2]) {
  const groups2 = main2._groups;
  return input.replace(dollarStub, (a) => {
    const name = a.replace(/\$/, "");
    const ptrs = Object.hasOwn(groups2, name) ? groups2[name] : [];
    const found = ptrs.find((ptr) => ptr[0] === n2 && ptr[1] >= start2 && ptr[2] <= end2);
    if (found) {
      return main2.update([found]).text({ keepEndPunct: false });
    }
    return a;
  });
};
var getOriginal = function(terms) {
  const last = terms.at(-1);
  return {
    pre: terms[0].pre,
    post: last.post,
    isTitleCase: isTitleCase(terms[0].text),
    isPossessive: last.tags.has("Possessive"),
    tags: terms.map((term) => Array.from(term.tags))
  };
};
var restoreOriginal = function(terms, original, keep2) {
  const last = terms.at(-1);
  if (keep2.possessives && original.isPossessive && !last.tags.has("Possessive")) {
    last.text += "'s";
    last.normal += "'s";
    last.tags.add("Possessive");
  }
  if (original.pre) {
    terms[0].pre = original.pre;
  }
  if (original.post) {
    const post = last.post.trim();
    if (!post || post === original.post.trim()) {
      last.post = original.post;
    }
  }
};
fns3.replaceWith = function(input, keep2 = {}) {
  if (keep2 === true) {
    keep2 = {
      tags: true,
      case: true,
      possessives: true
    };
  }
  const main2 = this;
  this.uncache();
  if (!main2.found) {
    return main2;
  }
  if (typeof input === "function") {
    return replaceByFn(main2, input, keep2);
  }
  if (typeof input === "string" && input.includes("$") && Object.keys(main2._groups).length > 0) {
    const strs = main2.fullPointer.map((ptr) => subDollarSign(input, main2, ptr));
    return replaceByFn(main2, (_m, i3) => strs[i3], keep2);
  }
  const originals = main2.docs.map(getOriginal);
  const replacements = this.world.methods.one.onReplace && this.fullPointer.map(([n2, start2, end2]) => ({
    sentence: this.document[n2],
    before: new Set(this.document[n2]),
    oldTerms: this.document[n2].slice(start2, end2)
  }));
  const original = this.update(this.fullPointer);
  if (typeof input === "string") {
    input = this.fromText(input).compute("id");
  }
  main2.insertAfter(input);
  if (replacements) {
    replacements.forEach((group) => {
      const start2 = group.sentence.indexOf(group.oldTerms.at(-1)) + 1;
      group.newTerms = [];
      for (let i3 = start2; i3 < group.sentence.length && !group.before.has(group.sentence[i3]); i3 += 1) {
        group.newTerms.push(group.sentence[i3]);
      }
    });
  }
  if (original.has("@hasContraction") && main2.contractions) {
    const more = main2.grow("@hasContraction+");
    more.contractions().expand();
  }
  main2.delete(original);
  main2.docs.forEach((terms, i3) => restoreOriginal(terms, originals[i3], keep2));
  const m3 = retag(main2.toView(), ["index"]);
  if (keep2.tags) {
    m3.forEach((match2, i3) => {
      match2.terms().forEach((term, k2) => term.tagSafe(originals[i3].tags[k2]));
    });
  }
  if (keep2.case) {
    m3.docs.forEach((terms, i3) => {
      const transformCase = originals[i3].isTitleCase ? toTitleCase : toLowerCase;
      terms[0].text = transformCase(terms[0].text);
    });
  }
  if (m3.world.methods.one.onReplace) {
    replacements.forEach(({ oldTerms, newTerms }) => {
      m3.world.methods.one.onReplace.forEach((fn) => fn({ oldTerms, newTerms, document: m3.document }));
    });
  }
  return m3;
};
fns3.replace = function(match2, input, keep2) {
  if (match2 && !input) {
    return this.replaceWith(match2, keep2);
  }
  const m3 = this.match(match2);
  if (!m3.found) {
    return this;
  }
  this.soften();
  return m3.replaceWith(input, keep2);
};
var replace_default = fns3;

// ../../node_modules/compromise/src/1-one/change/api/lib/remove.js
var removeRunBefore = (str, run, following) => {
  let i3 = 0;
  while (i3 < str.length) {
    if (!run.includes(str[i3])) {
      i3++;
      continue;
    }
    const start2 = i3;
    while (i3 < str.length && run.includes(str[i3])) i3++;
    if (i3 < str.length && following.includes(str[i3])) {
      return str.slice(0, start2) + str.slice(i3);
    }
  }
  return str;
};
var repairPunct = function(terms, len) {
  const last = terms.length - 1;
  const from = terms[last];
  const to = terms[last - len];
  if (to && from) {
    to.post += from.post;
    to.post = removeRunBefore(to.post, " ", ".?!,;:");
    to.post = removeRunBefore(to.post, ",;:", ".?!");
  }
};
var pluckOut = function(document, nots) {
  nots.forEach((ptr) => {
    const [n2, start2, end2] = ptr;
    const len = end2 - start2;
    if (!document[n2]) {
      return;
    }
    if (end2 === document[n2].length && end2 > 1) {
      repairPunct(document[n2], len);
    }
    document[n2].splice(start2, len);
  });
  for (let i3 = document.length - 1; i3 >= 0; i3 -= 1) {
    if (document[i3].length === 0) {
      document.splice(i3, 1);
      if (i3 === document.length && document[i3 - 1]) {
        const terms = document[i3 - 1];
        const lastTerm = terms.at(-1);
        if (lastTerm) {
          lastTerm.post = lastTerm.post.trimEnd();
        }
      }
    }
  }
  return document;
};
var remove_default = pluckOut;

// ../../node_modules/compromise/src/1-one/change/api/remove.js
var getEmptied = function(gonePtrs, document) {
  return Object.keys(gonePtrs).map(Number).filter((n2) => {
    const count = gonePtrs[n2].reduce((sum2, no) => sum2 + no[2] - no[1], 0);
    return document[n2] && count >= document[n2].length;
  });
};
var fixPointers = function(ptrs, gonePtrs, emptied) {
  ptrs = ptrs.map((ptr) => {
    const [n2] = ptr;
    const gone = gonePtrs[n2] || [];
    gone.forEach((no) => {
      const len = no[2] - no[1];
      if (ptr[1] <= no[1] && ptr[2] >= no[2]) {
        ptr[2] -= len;
      } else if (ptr[1] >= no[2]) {
        ptr[1] -= len;
        ptr[2] -= len;
      }
    });
    ptr[0] -= emptied.filter((k2) => k2 < n2).length;
    ptr[3] = null;
    ptr[4] = null;
    return ptr;
  });
  return ptrs.filter((ptr) => ptr[2] - ptr[1] > 0);
};
var methods4 = {
  /** */
  remove: function(reg) {
    const { indexN: indexN2 } = this.methods.one.pointer;
    this.uncache();
    let self = this.all();
    let not = this;
    if (reg) {
      self = this;
      not = this.match(reg);
    }
    const isFull = !self.ptrs;
    expand_default(not);
    let ptrs = self.fullPointer;
    const nots = not.fullPointer.reverse();
    const gonePtrs = indexN2(nots);
    const emptied = getEmptied(gonePtrs, this.document);
    const document = remove_default(this.document, nots);
    ptrs = fixPointers(ptrs, gonePtrs, emptied);
    self.ptrs = ptrs;
    self.document = document;
    self.compute("index");
    if (isFull) {
      self.ptrs = void 0;
    }
    if (!reg) {
      this.ptrs = [];
      return self.none();
    }
    const res = self.toView(ptrs);
    return res;
  }
};
methods4.delete = methods4.remove;
var remove_default2 = methods4;

// ../../node_modules/compromise/src/1-one/change/api/whitespace.js
var setSide = function(view, side2, str, concat) {
  view.docs.forEach((terms) => {
    const term = side2 === "pre" ? terms[0] : terms.at(-1);
    if (concat === true) {
      term[side2] += str;
    } else {
      term[side2] = str;
    }
  });
  return view;
};
var wrap2 = function(view, start2, end2) {
  view.docs.forEach((terms) => {
    terms[0].pre = start2 + terms[0].pre;
    const last = terms.at(-1);
    last.post = end2 + last.post;
  });
  return view;
};
var methods5 = {
  /** add this punctuation or whitespace before each match: */
  pre: function(str, concat) {
    if (str === void 0 && this.found) {
      return this.docs[0][0].pre;
    }
    return setSide(this, "pre", str, concat);
  },
  /** add this punctuation or whitespace after each match: */
  post: function(str, concat) {
    if (str === void 0) {
      const last = this.docs.at(-1);
      return last.at(-1).post;
    }
    return setSide(this, "post", str, concat);
  },
  /** remove whitespace from start/end */
  trim: function() {
    if (!this.found) {
      return this;
    }
    const docs = this.docs;
    const start2 = docs[0][0];
    start2.pre = start2.pre.trimStart();
    const last = docs.at(-1);
    const end2 = last.at(-1);
    end2.post = end2.post.trimEnd();
    return this;
  },
  /** connect words with hyphen, and remove whitespace */
  hyphenate: function() {
    lib_default(this.docs, (t, terms, i3) => {
      if (i3 !== 0) {
        t.pre = "";
      }
      if (terms[i3 + 1]) {
        t.post = "-";
      }
    });
    return this;
  },
  /** remove hyphens between words, and set whitespace */
  dehyphenate: function() {
    const hasHyphen3 = /[-–—]/;
    lib_default(this.docs, (t) => {
      if (hasHyphen3.test(t.post)) {
        t.post = " ";
      }
    });
    return this;
  },
  /** add quotations around these matches */
  toQuotations: function(start2, end2) {
    return wrap2(this, start2 || '"', end2 || '"');
  },
  /** add brackets around these matches */
  toParentheses: function(start2, end2) {
    return wrap2(this, start2 || "(", end2 || ")");
  }
};
methods5.deHyphenate = methods5.dehyphenate;
methods5.toQuotation = methods5.toQuotations;
var whitespace_default = methods5;

// ../../node_modules/compromise/src/1-one/change/api/lib/_sort.js
var alpha = (a, b2) => {
  if (a.normal < b2.normal) {
    return -1;
  }
  if (a.normal > b2.normal) {
    return 1;
  }
  return 0;
};
var length = (a, b2) => b2.normal.trim().length - a.normal.trim().length;
var wordCount = (a, b2) => b2.words - a.words;
var sequential = (a, b2) => b2[0] - a[0] || (a[1] > b2[1] ? 1 : -1);
var byFreq = function(arr) {
  const counts = /* @__PURE__ */ Object.create(null);
  arr.forEach((o) => {
    counts[o.normal] ??= 0;
    counts[o.normal] += 1;
  });
  arr.sort((a, b2) => counts[b2.normal] - counts[a.normal]);
  return arr;
};
var sort_default = { alpha, length, wordCount, sequential, byFreq };

// ../../node_modules/compromise/src/1-one/change/api/sort.js
var seqNames = /* @__PURE__ */ new Set(["index", "sequence", "seq", "sequential", "chron", "chronological"]);
var freqNames = /* @__PURE__ */ new Set(["freq", "frequency", "topk", "repeats"]);
var alphaNames = /* @__PURE__ */ new Set(["alpha", "alphabetical"]);
var customSort = function(view, fn) {
  let ptrs = view.fullPointer;
  ptrs = ptrs.sort((a, b2) => {
    a = view.update([a]);
    b2 = view.update([b2]);
    return fn(a, b2);
  });
  view.ptrs = ptrs;
  return view;
};
var sort = function(input) {
  const { docs } = this;
  this.uncache();
  if (typeof input === "function") {
    return customSort(this, input);
  }
  input ||= "alpha";
  const ptrs = rawPointer(this);
  let arr = docs.map((terms, n2) => {
    return {
      index: n2,
      words: terms.length,
      normal: terms.map((t) => t.machine || t.normal || "").join(" "),
      pointer: ptrs[n2]
    };
  });
  if (seqNames.has(input)) {
    input = "sequential";
  }
  if (alphaNames.has(input)) {
    input = "alpha";
  }
  if (freqNames.has(input)) {
    arr = sort_default.byFreq(arr);
    return this.update(arr.map((o) => o.pointer));
  }
  if (typeof sort_default[input] === "function") {
    arr = arr.sort(sort_default[input]);
    return this.update(arr.map((o) => o.pointer));
  }
  return this;
};
var reverse = function() {
  const ptrs = [].concat(rawPointer(this)).reverse();
  if (this._cache) {
    this._cache = this._cache.reverse();
  }
  return this.update(ptrs);
};
var unique = function() {
  const already = /* @__PURE__ */ new Set();
  const res = this.filter((m3) => {
    const txt = m3.text("machine");
    if (already.has(txt)) {
      return false;
    }
    already.add(txt);
    return true;
  });
  return res;
};
var sort_default2 = { unique, reverse, sort };

// ../../node_modules/compromise/src/1-one/change/api/concat.js
var combineDocs = function(homeDocs, inputDocs) {
  if (homeDocs.length > 0) {
    const end2 = homeDocs.at(-1);
    const last = end2.at(-1);
    if (!/ /.test(last.post)) {
      last.post += " ";
    }
  }
  homeDocs = homeDocs.concat(inputDocs);
  return homeDocs;
};
var combineViews = function(home, input) {
  if (home.document === input.document) {
    const ptrs2 = home.fullPointer.concat(input.fullPointer);
    return home.toView(ptrs2).compute("index");
  }
  const ptrs = input.fullPointer;
  ptrs.forEach((a) => {
    a[0] += home.document.length;
  });
  home.document = combineDocs(home.document, input.docs);
  return home.all();
};
var concat_default = {
  // add string as new match/sentence
  concat: function(input) {
    if (typeof input === "string") {
      const more = this.fromText(input);
      if (!this.found || !this.ptrs) {
        this.document = this.document.concat(more.document);
      } else {
        const ptrs = this.fullPointer;
        const at = ptrs.at(-1)[0];
        this.document.splice(at, 0, ...more.document);
      }
      return this.all().compute("index");
    }
    if (typeof input === "object" && input.isView) {
      return combineViews(this, input);
    }
    if (Array.isArray(input)) {
      const docs = combineDocs(this.document, input);
      this.document = docs;
      return this.all();
    }
    return this;
  }
};

// ../../node_modules/compromise/src/1-one/change/api/harden.js
var harden = function() {
  this.ptrs = this.fullPointer;
  return this;
};
var soften = function() {
  let ptr = this.ptrs;
  if (!ptr || ptr.length === 0) {
    return this;
  }
  ptr = ptr.map((a) => a.slice(0, 3));
  this.ptrs = ptr;
  return this;
};
var harden_default = { harden, soften };

// ../../node_modules/compromise/src/1-one/change/api/index.js
var methods6 = { ...case_default, ...insert_default, ...replace_default, ...remove_default2, ...whitespace_default, ...sort_default2, ...concat_default, ...harden_default };
var addAPI2 = function(View2) {
  Object.assign(View2.prototype, methods6);
};
var api_default2 = addAPI2;

// ../../node_modules/compromise/src/1-one/change/compute/index.js
var compute2 = {
  id: function(view) {
    lib_default(view.docs, (term) => {
      term.id ||= uuid_default(term);
    });
  }
};
var compute_default3 = compute2;

// ../../node_modules/compromise/src/1-one/change/plugin.js
var plugin_default2 = {
  api: api_default2,
  compute: compute_default3
};

// ../../node_modules/compromise/src/1-one/contraction-one/model/contractions.js
var parse = (str, key) => str.trim().split("\n").map((s) => {
  const [k2, out2] = s.trim().split(":");
  return { [key]: k2, out: out2.split(" ") };
});
var contractions_default = [
  // that's and let's are decided here, before any tagging
  // (step 1 of the 's decision - the list is in 2-two/contraction-two/compute/index.js)
  // simple mappings
  ...parse(
    `
@:at
arent:are not
alot:a lot
brb:be right back
cannot:can not
dun:do not
can't:can not
shan't:should not
won't:will not
that's:that is
what's:what is
let's:let us
dunno:do not know
gonna:going to
gotta:have got to
gimme:give me
outta:out of
tryna:trying to
gtg:got to go
im:i am
imma:I will
imo:in my opinion
irl:in real life
ive:i have
rn:right now
tbh:to be honest
wanna:want to
c'mere:come here
c'mon:come on
shoulda:should have
coulda:could have
woulda:would have
musta:must have
tis:it is
twas:it was
y'know:you know
ne'er:never
o'er:over
  `,
    "word"
  ),
  // contraction-part mappings
  ...parse(
    `
ll:will
ve:have
re:are
m:am
  `,
    "after"
  ),
  // french contractions - t'aime
  ...parse(
    `
c:ce
m:me
n:ne
qu:que
s:se
t:tu
  `,
    "before"
  ),
  // missing apostrophes, apostrophe-d
  ...parse(
    `
shouldnt:should not
couldnt:could not
wouldnt:would not
hasnt:has not
wasnt:was not
isnt:is not
cant:can not
dont:do not
wont:will not
howd:how did
whatd:what did
whend:when did
whered:where did
  `,
    "word"
  )
];

// ../../node_modules/compromise/src/1-one/tokenize/model/_lib.js
var toList = (str) => str.trim().split("\n").map((s) => s.trim());
var toHash = (list5) => Object.fromEntries(list5.map((s) => [s, true]));

// ../../node_modules/compromise/src/1-one/contraction-one/model/number-suffix.js
var number_suffix_default = toHash(toList(`
st
nd
rd
th
am
pm
max
\xB0
s
e
er
\xE8re
\xE8me
`));

// ../../node_modules/compromise/src/1-one/contraction-one/model/index.js
var model_default = {
  one: {
    contractions: contractions_default,
    numberSuffixes: number_suffix_default
  }
};

// ../../node_modules/compromise/src/API/debug/contractions-debug.js
var contractionDebug = (term, expansion) => {
  if (!debug_default.contractions || debug_default.word && debug_default.word !== (term.normal || term.text).toLowerCase()) {
    return;
  }
  debug_default.rule = void 0;
  const result = expansion ? "[" + expansion.map((word) => yellow(`'${word}'`)).join(", ") + "]" : "possessive (kept)";
  console.log(`${debug_default.prefix || "   "}${yellow(JSON.stringify(term.text))} \u2192  ${result}`);
};
var contractions_debug_default = contractionDebug;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/_splice.js
var insertContraction = function(document, point, words2) {
  const [n2, w] = point;
  if (!words2 || words2.length === 0) {
    return;
  }
  words2 = words2.map((word, i3) => {
    word.implicit = word.text;
    word.machine = word.text;
    word.pre = "";
    word.post = "";
    word.text = "";
    word.normal = "";
    word.index = [n2, w + i3];
    return word;
  });
  if (words2[0]) {
    words2[0].pre = document[n2][w].pre;
    words2[words2.length - 1].post = document[n2][w].post;
    words2[0].text = document[n2][w].text;
    words2[0].normal = document[n2][w].normal;
  }
  document[n2].splice(w, 1, ...words2);
};
var splice_default = insertContraction;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/apostrophe-d.js
var hasContraction = /'/;
var alwaysDid = /* @__PURE__ */ new Set([
  "what",
  "how",
  "when",
  "where",
  "why"
]);
var useWould = /* @__PURE__ */ new Set([
  "be",
  "go",
  "start",
  "think",
  "need"
]);
var useHad = /* @__PURE__ */ new Set([
  "been",
  "gone"
]);
var _apostropheD = function(terms, i3) {
  const before2 = terms[i3].normal.split(hasContraction)[0];
  if (alwaysDid.has(before2)) {
    return [before2, "did"];
  }
  if (terms[i3 + 1]) {
    if (useHad.has(terms[i3 + 1].normal)) {
      return [before2, "had"];
    }
    if (useWould.has(terms[i3 + 1].normal)) {
      return [before2, "would"];
    }
  }
  return null;
};
var apostrophe_d_default = _apostropheD;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/apostrophe-t.js
var apostropheT = function(terms, i3) {
  if (terms[i3].normal === "ain't" || terms[i3].normal === "aint") {
    return null;
  }
  const before2 = terms[i3].normal.replace(/n't/, "");
  return [before2, "not"];
};
var apostrophe_t_default = apostropheT;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/double.js
var twoApostrophes = /^(.+)'(t|d|ll)'ve$/;
var doubled = function(terms, i3) {
  const m3 = terms[i3].normal.match(twoApostrophes);
  if (m3 === null) {
    return null;
  }
  const head = m3[1];
  if (m3[2] === "d") {
    return [head, "would", "have"];
  }
  if (m3[2] === "ll") {
    return [head, "will", "have"];
  }
  if (head === "can") {
    return ["can", "not", "have"];
  }
  if (head === "won") {
    return ["will", "not", "have"];
  }
  return [head.replace(/n$/, ""), "not", "have"];
};
var double_default = doubled;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/french.js
var hasContraction2 = /'/;
var isFeminine = /(e|é|aison|sion|tion)$/;
var isMasculine = /(age|isme|acle|ege|oire)$/;
var masculineE = /* @__PURE__ */ new Set(["homme", "arbre", "espace", "exemple", "ordre", "ange", "etre", "ete", "empire", "oncle", "angle", "article", "orchestre", "insecte", "episode"]);
var feminineEnd = /(eau|tion|sion)$/;
var getAfter = (terms, i3) => terms[i3].normal.split(hasContraction2)[1];
var preL = (terms, i3) => {
  const after = getAfter(terms, i3);
  if (after && (after.endsWith("e") && !masculineE.has(after) || feminineEnd.test(after))) {
    return ["la", after];
  }
  return ["le", after];
};
var preD = (terms, i3) => {
  const after = getAfter(terms, i3);
  if (after && isFeminine.test(after) && !isMasculine.test(after)) {
    return ["du", after];
  } else if (after && after.endsWith("s")) {
    return ["des", after];
  }
  return ["de", after];
};
var preJ = (terms, i3) => ["je", getAfter(terms, i3)];
var french_default = {
  preJ,
  preL,
  preD
};

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/number-range.js
var isRange = /^([0-9.]{1,4}[a-z]{0,2}) ?[-–—] ?([0-9]{1,4}[a-z]{0,2})$/i;
var timeRange = /^([0-9]{1,2}(:[0-9][0-9])?(am|pm)?) ?[-–—] ?([0-9]{1,2}(:[0-9][0-9])?(am|pm)?)$/i;
var phoneNum = /^[0-9]{3}-[0-9]{4}$/;
var numberRange = function(terms, i3) {
  const term = terms[i3];
  let parts3 = term.text.match(isRange);
  if (parts3 !== null) {
    if (term.tags.has("PhoneNumber") || phoneNum.test(term.text)) {
      return null;
    }
    return [parts3[1], "to", parts3[2]];
  } else {
    parts3 = term.text.match(timeRange);
    if (parts3 !== null) {
      return [parts3[1], "to", parts3[4]];
    }
  }
  return null;
};
var number_range_default = numberRange;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/number-unit.js
var numUnit = /^([+-]?[0-9][.,0-9]*)([a-z°²³µ/]+)$/;
var numberUnit = function(terms, i3, world2) {
  const notUnit = world2.model.one.numberSuffixes || {};
  const term = terms[i3];
  const parts3 = term.text.match(numUnit);
  if (parts3 !== null) {
    const unit2 = parts3[2].toLowerCase().trim();
    if (Object.hasOwn(notUnit, unit2)) {
      return null;
    }
    return [parts3[1], unit2];
  }
  return null;
};
var number_unit_default = numberUnit;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/contractions/index.js
var byApostrophe = /'/;
var numDash = /^[0-9][^-–—]*[-–—].*?[0-9]/;
var reIndex = function(terms) {
  terms.forEach((t, i3) => {
    if (t.index) {
      t.index[1] = i3;
    }
  });
};
var byEnd = {
  // ain't
  t: apostrophe_t_default,
  // how'd
  d: apostrophe_d_default
};
var byStart = {
  // j'aime
  j: french_default.preJ,
  // l'amour
  l: french_default.preL,
  // d'amerique
  d: french_default.preD
};
var knownOnes = function(list5, term, before2, after) {
  for (let i3 = 0; i3 < list5.length; i3 += 1) {
    const o = list5[i3];
    if (o.word === term.normal) {
      return o.out;
    } else if (after !== null && after === o.after) {
      return [before2].concat(o.out);
    } else if (before2 !== null && before2 === o.before && after && after.length > 2) {
      return o.out.concat(after);
    }
  }
  return null;
};
var expand = function(words2, view, document, n2, i3) {
  contractions_debug_default(document[n2][i3], words2);
  const doc = view.fromText(words2.join(" "));
  doc.compute(["id", "alias"]);
  words2 = doc.docs[0];
  splice_default(document, [n2, i3], words2);
  return words2;
};
var thereHas = function(terms, i3) {
  for (let k2 = i3 + 1; k2 < 5; k2 += 1) {
    if (!terms[k2]) {
      break;
    }
    if (terms[k2].normal === "been") {
      return ["there", "has"];
    }
  }
  return ["there", "is"];
};
var contractions = (view) => {
  const { world: world2, document } = view;
  const { model: model5, methods: methods20 } = world2;
  const list5 = model5.one.contractions || [];
  document.forEach((terms, n2) => {
    const len = terms.length;
    for (let i3 = terms.length - 1; i3 >= 0; i3 -= 1) {
      if (terms[i3].implicit) {
        continue;
      }
      let before2 = null;
      let after = null;
      if (byApostrophe.test(terms[i3].normal)) {
        const res = terms[i3].normal.split(byApostrophe);
        before2 = res[0];
        after = res[1];
      }
      let words2 = double_default(terms, i3) || knownOnes(list5, terms[i3], before2, after);
      if (!words2 && Object.hasOwn(byEnd, after)) {
        words2 = byEnd[after](terms, i3, world2);
      }
      if (!words2 && Object.hasOwn(byStart, before2)) {
        words2 = byStart[before2](terms, i3);
      }
      if (before2 === "there" && after === "s") {
        words2 = thereHas(terms, i3);
      }
      if (words2) {
        expand(words2, view, document, n2, i3);
        continue;
      }
      if (numDash.test(terms[i3].normal)) {
        words2 = number_range_default(terms, i3);
        if (words2) {
          words2 = expand(words2, view, document, n2, i3);
          methods20.one.setTag(words2, "NumberRange", world2);
          if (words2[2] && words2[2].tags.has("Time")) {
            methods20.one.setTag([words2[0]], "Time", world2, null, "time-range");
          }
        }
        continue;
      }
      words2 = number_unit_default(terms, i3, world2);
      if (words2) {
        words2 = expand(words2, view, document, n2, i3);
        methods20.one.setTag([words2[1]], "Unit", world2, null, "contraction-unit");
      }
    }
    if (terms.length !== len) {
      reIndex(terms);
    }
  });
};
var contractions_default2 = contractions;

// ../../node_modules/compromise/src/1-one/contraction-one/compute/index.js
var compute_default4 = { contractions: contractions_default2 };

// ../../node_modules/compromise/src/1-one/contraction-one/plugin.js
var plugin = {
  model: model_default,
  compute: compute_default4,
  hooks: ["contractions"]
};
var plugin_default3 = plugin;

// ../../node_modules/compromise/src/1-one/freeze/compute.js
var freeze = function(view) {
  const world2 = view.world;
  const { model: model5, methods: methods20 } = view.world;
  const setTag3 = methods20.one.setTag;
  const { frozenLex } = model5.one;
  const multi = model5.one._multiCache || {};
  lib_default(view.docs, (t, terms, i3) => {
    const word = t.machine || t.normal;
    if (multi[word] !== void 0 && terms[i3 + 1]) {
      const end2 = i3 + multi[word] - 1;
      for (let k2 = end2; k2 > i3; k2 -= 1) {
        const words2 = terms.slice(i3, k2 + 1);
        const str = words2.map((term) => term.machine || term.normal).join(" ");
        if (Object.hasOwn(frozenLex, str)) {
          setTag3(words2, frozenLex[str], world2, false, "1-frozen-multi-lexicon");
          words2.forEach((term) => term.frozen = true);
        }
      }
    }
    if (frozenLex[word] !== void 0 && Object.hasOwn(frozenLex, word)) {
      setTag3([t], frozenLex[word], world2, false, "1-freeze-lexicon");
      t.frozen = true;
    }
  });
};
var unfreeze = function(view) {
  lib_default(view.docs, (term) => {
    delete term.frozen;
  });
  return view;
};
var compute_default5 = { frozen: freeze, freeze, unfreeze };

// ../../node_modules/compromise/src/1-one/freeze/plugin.js
var plugin_default4 = {
  // add .compute('freeze')
  compute: compute_default5,
  mutate: (world2) => {
    const methods20 = world2.methods.one;
    methods20.termMethods.isFrozen = (term) => term.frozen === true;
    methods20.debug.freeze = (view) => methods20.debug.tags(view);
    methods20.debug.frozen = methods20.debug.freeze;
  },
  api: function(View2) {
    View2.prototype.freeze = function() {
      lib_default(this.docs, (term) => {
        term.frozen = true;
      });
      return this;
    };
    View2.prototype.unfreeze = function() {
      this.compute("unfreeze");
    };
    View2.prototype.isFrozen = function() {
      return this.match("@isFrozen+");
    };
  },
  // run it in init
  hooks: ["freeze"]
};

// ../../node_modules/compromise/src/1-one/lexicon/compute/multi-word.js
var multiWord = function(terms, start_i, world2) {
  const { model: model5, methods: methods20 } = world2;
  const setTag3 = methods20.one.setTag;
  const multi = model5.one._multiCache || {};
  const { lexicon: lexicon4 } = model5.one || {};
  const t = terms[start_i];
  const word = t.machine || t.normal;
  if (multi[word] !== void 0 && terms[start_i + 1]) {
    const end2 = start_i + multi[word] - 1;
    for (let i3 = end2; i3 > start_i; i3 -= 1) {
      const words2 = terms.slice(start_i, i3 + 1);
      if (words2.length <= 1) {
        return false;
      }
      const str = words2.map((term) => term.machine || term.normal).join(" ");
      if (Object.hasOwn(lexicon4, str)) {
        const tag = lexicon4[str];
        if (tag && tag.includes("PhrasalVerb") && words2[words2.length - 1].post === "-") {
          continue;
        }
        setTag3(words2, tag, world2, false, "1-multi-lexicon");
        if (tag && tag.length === 2 && (tag[0] === "PhrasalVerb" || tag[1] === "PhrasalVerb")) {
          setTag3([words2[1]], "Particle", world2, false, "1-phrasal-particle");
        }
        return true;
      }
    }
    return false;
  }
  return null;
};
var multi_word_default = multiWord;

// ../../node_modules/compromise/src/1-one/lexicon/compute/single-word.js
var prefix = /^(under|over|mis|re|un|dis|semi|pre|post)-?/;
var allowPrefix = /* @__PURE__ */ new Set(["Verb", "Infinitive", "PastTense", "Gerund", "PresentTense", "Adjective", "Participle"]);
var checkLexicon = function(terms, i3, world2) {
  const { model: model5, methods: methods20 } = world2;
  const setTag3 = methods20.one.setTag;
  const { lexicon: lexicon4 } = model5.one;
  const t = terms[i3];
  const word = t.machine || t.normal;
  if (lexicon4[word] !== void 0 && Object.hasOwn(lexicon4, word)) {
    setTag3([t], lexicon4[word], world2, false, "1-lexicon");
    return true;
  }
  if (t.machine && Object.hasOwn(lexicon4, t.normal)) {
    setTag3([t], lexicon4[t.normal], world2, false, "1-lexicon-normal");
    return true;
  }
  if (t.alias) {
    const found = t.alias.find((str) => Object.hasOwn(lexicon4, str));
    if (found) {
      setTag3([t], lexicon4[found], world2, false, "1-lexicon-alias");
      return true;
    }
  }
  if (prefix.test(word)) {
    const stem = word.replace(prefix, "");
    if (Object.hasOwn(lexicon4, stem) && stem.length > 3) {
      if (allowPrefix.has(lexicon4[stem])) {
        setTag3([t], lexicon4[stem], world2, false, "1-lexicon-prefix");
        return true;
      }
    }
  }
  return null;
};
var single_word_default = checkLexicon;

// ../../node_modules/compromise/src/1-one/lexicon/compute/index.js
var lexicon = function(view) {
  const world2 = view.world;
  lib_default(view.docs, (term, terms, i3) => {
    if (term.tags.size === 0) {
      let found = null;
      found ||= multi_word_default(terms, i3, world2);
      found ||= single_word_default(terms, i3, world2);
    }
  });
};
var compute_default6 = {
  lexicon
};

// ../../node_modules/compromise/src/1-one/lexicon/methods/expand.js
var expand2 = function(words2) {
  const lex = {};
  const _multi = {};
  Object.keys(words2).forEach((word) => {
    const tag = words2[word];
    word = word.toLowerCase().trim();
    word = word.replace(/'s\b/, "");
    const split4 = word.split(/ /);
    if (split4.length > 1) {
      if (_multi[split4[0]] === void 0 || split4.length > _multi[split4[0]]) {
        _multi[split4[0]] = split4.length;
      }
    }
    lex[word] ||= tag;
  });
  delete lex[""];
  delete lex[null];
  delete lex[" "];
  return { lex, _multi };
};
var expand_default2 = expand2;

// ../../node_modules/compromise/src/1-one/lexicon/methods/index.js
var methods_default3 = {
  one: {
    expandLexicon: expand_default2
  }
};

// ../../node_modules/compromise/src/1-one/lexicon/lib.js
var addWords = function(words2, isFrozen = false) {
  const world2 = this.world();
  const { methods: methods20, model: model5 } = world2;
  if (!words2) {
    return;
  }
  Object.entries(words2).forEach(([k2, v2]) => {
    if (typeof v2 === "string" && v2.startsWith("#")) {
      words2[k2] = v2.replace(/^#/, "");
    }
  });
  if (isFrozen === true) {
    const { lex: lex2, _multi: _multi2 } = methods20.one.expandLexicon(words2, world2);
    Object.assign(model5.one._multiCache, _multi2);
    Object.assign(model5.one.frozenLex, lex2);
    return;
  }
  if (methods20.two.expandLexicon) {
    const { lex: lex2, _multi: _multi2 } = methods20.two.expandLexicon(words2, world2);
    Object.assign(model5.one.lexicon, lex2);
    Object.assign(model5.one._multiCache, _multi2);
  }
  const { lex, _multi } = methods20.one.expandLexicon(words2, world2);
  Object.assign(model5.one.lexicon, lex);
  Object.assign(model5.one._multiCache, _multi);
};
var lib_default2 = { addWords };

// ../../node_modules/compromise/src/1-one/lexicon/plugin.js
var model2 = {
  one: {
    lexicon: {},
    //setup blank lexicon
    _multiCache: {},
    frozenLex: {}
    //2nd lexicon
  }
};
var plugin_default5 = {
  model: model2,
  methods: methods_default3,
  compute: compute_default6,
  lib: lib_default2,
  hooks: ["lexicon"]
};

// ../../node_modules/compromise/src/1-one/lookup/api/buildTrie/index.js
var tokenize = function(phrase, world2) {
  const { methods: methods20, model: model5 } = world2;
  const terms = methods20.one.tokenize.splitTerms(phrase, model5).map((t) => methods20.one.tokenize.splitWhitespace(t, model5));
  return terms.map((term) => term.text.toLowerCase());
};
var buildTrie = function(phrases, world2) {
  const goNext = [{}];
  const endAs = [null];
  const failTo = [0];
  const xs = [];
  let n2 = 0;
  phrases.forEach(function(phrase) {
    let curr = 0;
    const words2 = tokenize(phrase, world2);
    for (let i3 = 0; i3 < words2.length; i3++) {
      const word = words2[i3];
      if (goNext[curr] && Object.hasOwn(goNext[curr], word)) {
        curr = goNext[curr][word];
      } else {
        n2++;
        goNext[curr][word] = n2;
        goNext[n2] = {};
        curr = n2;
        endAs[n2] = null;
      }
    }
    endAs[curr] = [words2.length];
  });
  for (const word in goNext[0]) {
    n2 = goNext[0][word];
    failTo[n2] = 0;
    xs.push(n2);
  }
  while (xs.length > 0) {
    const r = xs.shift();
    const keys3 = Object.keys(goNext[r]);
    for (let i3 = 0; i3 < keys3.length; i3 += 1) {
      const word = keys3[i3];
      const s = goNext[r][word];
      xs.push(s);
      n2 = failTo[r];
      while (n2 > 0 && !Object.hasOwn(goNext[n2], word)) {
        n2 = failTo[n2];
      }
      if (Object.hasOwn(goNext, n2)) {
        const fs = goNext[n2][word];
        failTo[s] = fs;
        if (endAs[fs]) {
          endAs[s] ||= [];
          endAs[s] = endAs[s].concat(endAs[fs]);
        }
      } else {
        failTo[s] = 0;
      }
    }
  }
  return { goNext, endAs, failTo };
};
var buildTrie_default = buildTrie;

// ../../node_modules/compromise/src/1-one/lookup/api/scan.js
var scanWords = function(terms, trie, opts2) {
  let n2 = 0;
  const results = [];
  for (let i3 = 0; i3 < terms.length; i3++) {
    const word = terms[i3][opts2.form] || terms[i3].normal;
    while (n2 > 0 && (trie.goNext[n2] === void 0 || !Object.hasOwn(trie.goNext[n2], word))) {
      n2 = trie.failTo[n2] || 0;
    }
    if (!Object.hasOwn(trie.goNext[n2], word)) {
      continue;
    }
    n2 = trie.goNext[n2][word];
    if (trie.endAs[n2]) {
      const arr = trie.endAs[n2];
      for (let o = 0; o < arr.length; o++) {
        const len = arr[o];
        const term = terms[i3 - len + 1];
        const [no, start2] = term.index;
        results.push([no, start2, start2 + len, term.id]);
      }
    }
  }
  return results;
};
var cacheMiss = function(words2, cache3) {
  for (let i3 = 0; i3 < words2.length; i3 += 1) {
    if (cache3.has(words2[i3])) {
      return false;
    }
  }
  return true;
};
var scan = function(view, trie, opts2) {
  let results = [];
  opts2.form ||= "normal";
  const docs = view.docs;
  if (!trie.goNext || !trie.goNext[0]) {
    console.error("Compromise invalid lookup trie");
    return view.none();
  }
  const firstWords = Object.keys(trie.goNext[0]);
  for (let i3 = 0; i3 < docs.length; i3++) {
    if (view._cache && view._cache[i3] && cacheMiss(firstWords, view._cache[i3]) === true) {
      continue;
    }
    const terms = docs[i3];
    const found = scanWords(terms, trie, opts2);
    if (found.length > 0) {
      results = results.concat(found);
    }
  }
  return view.update(results);
};
var scan_default = scan;

// ../../node_modules/compromise/src/1-one/lookup/api/index.js
function api_default3(View2) {
  View2.prototype.lookup = function(input, opts2 = {}) {
    if (!input) {
      return this.none();
    }
    if (typeof input === "string") {
      input = [input];
    }
    const trie = is_default(input) ? input : buildTrie_default(input, this.world);
    let res = scan_default(this, trie, opts2);
    res = res.settle();
    return res;
  };
}

// ../../node_modules/compromise/src/1-one/lookup/api/buildTrie/compress.js
var truncate = (list5, val) => {
  for (let i3 = list5.length - 1; i3 >= 0; i3 -= 1) {
    if (list5[i3] !== val) {
      list5 = list5.slice(0, i3 + 1);
      return list5;
    }
  }
  return list5;
};
var compress = function(trie) {
  trie.goNext = trie.goNext.map((o) => {
    if (Object.keys(o).length === 0) {
      return void 0;
    }
    return o;
  });
  trie.goNext = truncate(trie.goNext, void 0);
  trie.failTo = truncate(trie.failTo, 0);
  trie.endAs = truncate(trie.endAs, null);
  return trie;
};
var compress_default = compress;

// ../../node_modules/compromise/src/1-one/lookup/plugin.js
var lib = {
  /** turn an array or object into a compressed trie*/
  buildTrie: function(input) {
    const trie = buildTrie_default(input, this.world());
    return compress_default(trie);
  }
};
lib.compile = lib.buildTrie;
var plugin_default6 = {
  api: api_default3,
  lib
};

// ../../node_modules/compromise/src/1-one/match/api/_lib.js
var relPointer = function(ptrs, parent) {
  if (!parent) {
    return ptrs;
  }
  ptrs.forEach((ptr) => {
    const n2 = ptr[0];
    if (parent[n2]) {
      ptr[0] = parent[n2][0];
      ptr[1] += parent[n2][1];
      ptr[2] += parent[n2][1];
    }
  });
  return ptrs;
};
var fixPointers2 = function(res, parent) {
  let { ptrs } = res;
  const { byGroup } = res;
  ptrs = relPointer(ptrs, parent);
  Object.keys(byGroup).forEach((k2) => {
    byGroup[k2] = relPointer(byGroup[k2], parent);
  });
  return { ptrs, byGroup };
};
var parseRegs = function(regs, opts2, world2) {
  const one = world2.methods.one;
  if (typeof regs === "number") {
    regs = String(regs);
  }
  if (typeof regs === "string") {
    regs = one.killUnicode(regs, world2);
    regs = one.parseMatch(regs, opts2, world2);
  }
  return regs;
};
var isView = (val) => val && is_default(val) && val.isView === true;
var isNet = (val) => val && is_default(val) && val.isNet === true;

// ../../node_modules/compromise/src/1-one/match/api/match.js
var noTag = { tagger: false };
var doMatch = (view, regs, group, opts2, justOne) => {
  regs = parseRegs(regs, opts2, view.world);
  return view.methods.one.match(view.docs, { regs, group, justOne }, view._cache);
};
var asView = (view, res) => {
  const { ptrs, byGroup } = fixPointers2(res, view.fullPointer);
  const out2 = view.toView(ptrs);
  out2._groups = byGroup;
  return out2;
};
var match = function(regs, group, opts2) {
  if (isView(regs)) {
    return this.intersection(regs);
  }
  if (isNet(regs)) {
    return this.sweep(regs, noTag).view.settle();
  }
  return asView(this, doMatch(this, regs, group, opts2));
};
var matchOne = function(regs, group, opts2) {
  if (isView(regs)) {
    return this.intersection(regs).eq(0);
  }
  if (isNet(regs)) {
    return this.sweep(regs, { tagger: false, matchOne: true }).view;
  }
  return asView(this, doMatch(this, regs, group, opts2, true));
};
var has = function(regs, group, opts2) {
  if (isView(regs)) {
    return this.intersection(regs).fullPointer.length > 0;
  }
  if (isNet(regs)) {
    return this.sweep(regs, noTag).view.found;
  }
  return doMatch(this, regs, group, opts2, true).ptrs.length > 0;
};
var ifBy = (want) => function(regs, group, opts2) {
  if (isView(regs)) {
    return this.filter((m3) => m3.intersection(regs).found === want);
  }
  if (isNet(regs)) {
    const m3 = this.sweep(regs, noTag).view.settle();
    return this.filter((v2) => v2.intersection(m3).found === want);
  }
  regs = parseRegs(regs, opts2, this.world);
  const todo = { regs, group, justOne: true };
  const cache3 = this._cache || [];
  const view = this.filter((m3, i3) => {
    return this.methods.one.match(m3.docs, todo, cache3[i3]).ptrs.length > 0 === want;
  });
  if (this._cache) {
    view._cache = view.ptrs.map((ptr) => cache3[ptr[0]]);
  }
  return view;
};
var match_default = { matchOne, match, has, if: ifBy(true), ifNo: ifBy(false) };

// ../../node_modules/compromise/src/1-one/match/api/lookaround.js
var lookaround = function(view, isAfter, regs, group, opts2) {
  const { indexN: indexN2 } = view.methods.one.pointer;
  const { document } = view;
  const dir = isAfter ? -1 : 1;
  const ptrs = [];
  const byN = indexN2(view.fullPointer);
  Object.keys(byN).forEach((k2) => {
    const [n2, start2, end2] = byN[k2].sort((a, b2) => a[1] > b2[1] ? dir : -dir)[0];
    if (isAfter) {
      if (end2 < document[n2].length) {
        ptrs.push([n2, end2, document[n2].length]);
      }
    } else if (start2 > 0) {
      ptrs.push([n2, 0, start2]);
    }
  });
  const words2 = view.toView(ptrs);
  if (!regs) {
    return words2;
  }
  return words2.match(regs, group, opts2);
};
var growSide = function(view, isRight, regs, group, opts2) {
  if (typeof regs === "string") {
    regs = view.world.methods.one.parseMatch(regs, opts2, view.world);
  }
  if (isRight) {
    regs[0].start = true;
  } else {
    regs[regs.length - 1].end = true;
  }
  const ptrs = view.fullPointer;
  view.forEach((m3, n2) => {
    const more = isRight ? m3.after(regs, group) : m3.before(regs, group);
    if (more.found) {
      const terms = more.terms();
      if (isRight) {
        ptrs[n2][2] += terms.length;
        ptrs[n2][4] = null;
      } else {
        ptrs[n2][1] -= terms.length;
        ptrs[n2][3] = terms.docs[0][0].id;
      }
    }
  });
  return view.update(ptrs);
};
var side = (fn, flag) => function(regs, group, opts2) {
  return fn(this, flag, regs, group, opts2);
};
var grow = function(regs, group, opts2) {
  return this.growRight(regs, group, opts2).growLeft(regs, group, opts2);
};
var lookaround_default = {
  before: side(lookaround, false),
  after: side(lookaround, true),
  growLeft: side(growSide, false),
  growRight: side(growSide, true),
  grow
};

// ../../node_modules/compromise/src/1-one/pointers/api/lib/_lib.js
var doesOverlap = function(a, b2) {
  if (a[0] !== b2[0]) {
    return false;
  }
  const [, startA, endA] = a;
  const [, startB, endB] = b2;
  if (startA <= startB && endA > startB) {
    return true;
  }
  if (startB <= startA && endB > startA) {
    return true;
  }
  return false;
};
var getExtent = function(ptrs) {
  let min2 = ptrs[0][1];
  let max3 = ptrs[0][2];
  ptrs.forEach((ptr) => {
    if (ptr[1] < min2) {
      min2 = ptr[1];
    }
    if (ptr[2] > max3) {
      max3 = ptr[2];
    }
  });
  return [ptrs[0][0], min2, max3];
};
var indexN = function(ptrs) {
  const byN = {};
  ptrs.forEach((ref) => {
    byN[ref[0]] ||= [];
    byN[ref[0]].push(ref);
  });
  return byN;
};
var uniquePtrs = function(arr) {
  const obj = {};
  for (let i3 = 0; i3 < arr.length; i3 += 1) {
    obj[arr[i3].join(",")] = arr[i3];
  }
  return Object.values(obj);
};
var getDoc = (reg, view, group) => {
  if (typeof reg === "string" || Array.isArray(reg)) {
    return view.match(reg, group);
  }
  if (!reg) {
    return view.none();
  }
  return reg;
};

// ../../node_modules/compromise/src/1-one/match/api/split.js
var combine = function(left, right) {
  return [left[0], left[1], right[2]];
};
var addIds2 = function(ptr, view) {
  const [n2, start2, end2] = ptr;
  if (view.document[n2]?.[start2]) {
    ptr[3] ||= view.document[n2][start2].id;
    if (view.document[n2][end2 - 1]) {
      ptr[4] ||= view.document[n2][end2 - 1].id;
    }
  }
  return ptr;
};
var split = function(view, m3, group, collect2) {
  const { splitAll: splitAll2 } = view.methods.one.pointer;
  const splits = getDoc(m3, view, group).fullPointer;
  const all4 = splitAll2(view.fullPointer, splits);
  const res = collect2(all4).filter((p4) => p4).map((p4) => addIds2(p4, view));
  return view.update(res);
};
var methods7 = {};
methods7.splitOn = function(m3, group) {
  return split(this, m3, group, (all4) => all4.flatMap((o) => [o.passthrough, o.before, o.match, o.after]));
};
methods7.splitBefore = function(m3, group) {
  return split(this, m3, group, (all4) => {
    for (let i3 = 0; i3 < all4.length; i3 += 1) {
      if (!all4[i3].after && all4[i3 + 1]?.before) {
        if (all4[i3].match && all4[i3].match[0] === all4[i3 + 1].before[0]) {
          all4[i3].after = all4[i3 + 1].before;
          delete all4[i3 + 1].before;
        }
      }
    }
    return all4.flatMap((o) => {
      if (o.match && o.after) {
        return [o.passthrough, o.before, combine(o.match, o.after)];
      }
      return [o.passthrough, o.before, o.match];
    });
  });
};
methods7.splitAfter = function(m3, group) {
  return split(this, m3, group, (all4) => all4.flatMap((o) => {
    if (o.before && o.match) {
      return [o.passthrough, combine(o.before, o.match), o.after];
    }
    return [o.passthrough, o.before, o.match, o.after];
  }));
};
methods7.split = methods7.splitAfter;
var split_default = methods7;

// ../../node_modules/compromise/src/1-one/match/api/join.js
var isNeighbour = function(ptrL, ptrR) {
  if (!ptrL || !ptrR) {
    return false;
  }
  if (ptrL[0] !== ptrR[0]) {
    return false;
  }
  return ptrL[2] === ptrR[1];
};
var mergeIf = function(doc, lMatch, rMatch) {
  const world2 = doc.world;
  const parseMatch = world2.methods.one.parseMatch;
  lMatch ||= ".$";
  rMatch ||= "^.";
  const leftMatch = parseMatch(lMatch, {}, world2);
  const rightMatch = parseMatch(rMatch, {}, world2);
  leftMatch[leftMatch.length - 1].end = true;
  rightMatch[0].start = true;
  const ptrs = doc.fullPointer;
  const res = [ptrs[0]];
  for (let i3 = 1; i3 < ptrs.length; i3 += 1) {
    const ptrL = res[res.length - 1];
    const ptrR = ptrs[i3];
    const left = doc.update([ptrL]);
    const right = doc.update([ptrR]);
    if (isNeighbour(ptrL, ptrR) && left.has(leftMatch) && right.has(rightMatch)) {
      res[res.length - 1] = [ptrL[0], ptrL[1], ptrR[2], ptrL[3], ptrR[4]];
    } else {
      res.push(ptrR);
    }
  }
  return doc.update(res);
};
var methods8 = {
  //  merge only if conditions are met
  joinIf: function(lMatch, rMatch) {
    return mergeIf(this, lMatch, rMatch);
  },
  // merge all neighbouring matches
  join: function() {
    return mergeIf(this);
  }
};
var join_default = methods8;

// ../../node_modules/compromise/src/1-one/match/api/index.js
var methods9 = { ...match_default, ...lookaround_default, ...split_default, ...join_default };
methods9.lookBehind = methods9.before;
methods9.lookBefore = methods9.before;
methods9.lookAhead = methods9.after;
methods9.lookAfter = methods9.after;
methods9.notIf = methods9.ifNo;
var matchAPI = function(View2) {
  Object.assign(View2.prototype, methods9);
};
var api_default4 = matchAPI;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/splitGroups.js
var prefix2 = new Set("!~[^");
var suffix = new Set("?]+*$~{},0123456789");
var whitespace = /\s/;
var splitGroups = (str) => {
  if (!str.includes("(") || !str.includes(")")) return [str];
  const length2 = str.length;
  const afterSuffix = new Uint32Array(length2 + 1);
  const bodyEnd = new Uint32Array(length2);
  const captureEnd = new Uint32Array(length2);
  afterSuffix[length2] = length2;
  let close = -1;
  let capture = 0;
  for (let i4 = length2 - 1; i4 >= 0; i4--) {
    afterSuffix[i4] = suffix.has(str[i4]) ? afterSuffix[i4 + 1] : i4;
    if (str[i4] === ")") close = i4;
    if (str[i4] === "(" && close >= i4 + 3 && str[close - 1] !== "\\") {
      const end2 = afterSuffix[close + 1];
      if (end2 === length2 || whitespace.test(str[end2])) bodyEnd[i4] = end2;
    }
    if (str[i4] === "<") {
      captureEnd[i4] = capture;
      capture = 0;
    } else if (str[i4] === ">" && !capture) {
      capture = bodyEnd[str[i4 + 1] === "!" ? i4 + 2 : i4 + 1] || 0;
    }
  }
  const parts3 = [];
  let previous = 0;
  let i3 = 0;
  while (i3 < length2) {
    const start2 = i3;
    while (i3 < length2 && prefix2.has(str[i3])) i3++;
    const end2 = str[i3] === "<" ? captureEnd[i3] : bodyEnd[i3];
    if (end2) {
      parts3.push(str.slice(previous, start2), str.slice(start2, end2));
      i3 = end2 < length2 ? end2 + 1 : end2;
      previous = i3;
    } else if (i3 === start2) {
      i3++;
    }
  }
  parts3.push(str.slice(previous));
  return parts3;
};
var splitGroups_default = splitGroups;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/splitRegs.js
var prefix3 = new Set("![^");
var suffix2 = new Set("?]+*$~");
var newline = new Set("\n\r\u2028\u2029");
var whitespace2 = /\s/;
var splitRegs = (str) => {
  if (!str.includes("/")) {
    return [str];
  }
  const length2 = str.length;
  const afterSuffix = new Uint32Array(length2 + 1);
  const ends = new Uint32Array(length2);
  afterSuffix[length2] = length2;
  let close = 0;
  let capture = 0;
  for (let i3 = length2 - 1; i3 >= 0; i3--) {
    if (str[i3] === "/") {
      ends[i3] = close;
    }
    afterSuffix[i3] = suffix2.has(str[i3]) ? afterSuffix[i3 + 1] : i3;
    if (newline.has(str[i3])) {
      close = 0;
    }
    if (str[i3 + 1] === "/" && str[i3] !== "/" && str[i3] !== "\\") {
      const end2 = afterSuffix[i3 + 2];
      if (end2 === length2 || whitespace2.test(str[end2])) {
        close = end2;
      }
    }
    if (str[i3] === "<") {
      ends[i3] = capture;
      capture = 0;
    } else if (str[i3] === ">" && !capture && str[i3 + 1] === "/") {
      capture = ends[i3 + 1];
    }
  }
  const parts3 = [];
  let previous = 0;
  for (let i3 = -1; i3 < length2; i3++) {
    if (i3 === -1 || whitespace2.test(str[i3])) {
      let start2 = i3 + 1;
      while (prefix3.has(str[start2])) {
        start2++;
      }
      const end2 = ends[start2];
      if (end2) {
        parts3.push(str.slice(previous, Math.max(i3, 0)), str.slice(i3 + 1, end2));
        previous = end2 + 1;
        i3 = end2 - 1;
      }
    }
  }
  parts3.push(str.slice(previous));
  return parts3;
};
var splitRegs_default = splitRegs;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/01-parseBlocks.js
var byWord = /\s+/;
var isBlock = (str) => {
  return /^[![^]*(<[^<]*>)?!?\(/.test(str) && /\)[?\]+*$~{},0-9]*$/.test(str);
};
var isReg = (str) => {
  return /^[![^]*(<[^<]*>)?\//.test(str) && /\/[?\]+*$~]*$/.test(str);
};
var never = () => false;
var cleanUp = function(arr) {
  arr = arr.map((str) => str.trim());
  arr = arr.filter((str) => str);
  return arr;
};
var parseBlocks = function(txt, opts2 = {}) {
  const isRegex = opts2.noRegex ? never : isReg;
  const arr = opts2.noRegex ? [txt] : splitRegs_default(txt);
  let res = [];
  arr.forEach((str) => {
    if (isRegex(str)) {
      res.push(str);
      return;
    }
    res = res.concat(splitGroups_default(str));
  });
  res = cleanUp(res);
  const final = res.flatMap((str) => {
    if (isBlock(str) || isRegex(str)) {
      return str;
    }
    return str.split(byWord);
  });
  return cleanUp(final);
};
var parseBlocks_default = parseBlocks;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/02-parseToken.js
var hasMinMax = /\{([0-9]+)?(, *[0-9]*)?\}/;
var andSign = /&&/;
var captureName = /^<\s*([^\s>]+)\s*>/;
var titleCase2 = (str) => str.charAt(0).toUpperCase() + str.substring(1);
var end = (str) => str.charAt(str.length - 1);
var start = (str) => str.charAt(0);
var stripStart = (str) => str.substring(1);
var stripEnd = (str) => str.substring(0, str.length - 1);
var stripBoth = function(str) {
  str = stripStart(str);
  str = stripEnd(str);
  return str;
};
var wrapped = (str, a, b2 = a) => start(str) === a && end(str) === b2;
var parseToken = function(w, opts2, aliases4) {
  const obj = {};
  for (let i3 = 0; i3 < 2; i3 += 1) {
    if (end(w) === "$") {
      obj.end = true;
      w = stripEnd(w);
    }
    if (start(w) === "^") {
      obj.start = true;
      w = stripStart(w);
    }
    if (end(w) === "?") {
      obj.optional = true;
      w = stripEnd(w);
    }
    if (start(w) === "[" || end(w) === "]") {
      obj.group = null;
      if (start(w) === "[") {
        obj.groupStart = true;
      }
      if (end(w) === "]") {
        obj.groupEnd = true;
      }
      w = w.replace(/^\[/, "");
      w = w.replace(/\]$/, "");
      if (start(w) === "<") {
        const res = captureName.exec(w);
        if (!res) {
          throw new SyntaxError("Invalid named capture: expected [<name> ...]");
        }
        if (res.length >= 2) {
          obj.group = res[1];
          w = w.replace(res[0], "");
        }
      }
    }
    if (end(w) === "+" && !w.endsWith("\\+")) {
      obj.greedy = true;
      w = stripEnd(w);
    }
    if (w !== "*" && end(w) === "*" && !w.endsWith("\\*")) {
      obj.greedy = true;
      obj.optional = true;
      w = stripEnd(w);
    }
    if (start(w) === "!") {
      obj.negative = true;
      w = stripStart(w);
    }
    if (wrapped(w, "~") && w.length > 2) {
      w = stripBoth(w);
      obj.fuzzy = true;
      obj.min = opts2.fuzzy ?? 0.85;
      if (!/\(/.test(w)) {
        obj.word = w;
        return obj;
      }
    }
    if (wrapped(w, "/") && w.length > 2 && !opts2.noRegex) {
      w = stripBoth(w);
      if (opts2.caseSensitive) {
        obj.use = "text";
      }
      obj.regex = new RegExp(w);
      return obj;
    }
    if (hasMinMax.test(w)) {
      w = w.replace(hasMinMax, (_a, b2, c) => {
        if (c === void 0) {
          obj.min = Number(b2);
          obj.max = Number(b2);
        } else {
          c = c.replace(/, */, "");
          if (b2 === void 0) {
            obj.min = 0;
            obj.max = Number(c);
          } else {
            obj.min = Number(b2);
            obj.max = Number(c || 999);
          }
        }
        obj.greedy = true;
        if (!obj.min) {
          obj.optional = true;
        }
        return "";
      });
    }
    if (wrapped(w, "(", ")")) {
      if (andSign.test(w)) {
        obj.choices = w.split(andSign);
        obj.operator = "and";
      } else {
        obj.choices = w.split("|");
        obj.operator = "or";
      }
      obj.choices[0] = stripStart(obj.choices[0]);
      const last = obj.choices.length - 1;
      obj.choices[last] = stripEnd(obj.choices[last]);
      obj.choices = obj.choices.map((s) => s.trim());
      obj.choices = obj.choices.filter((s) => s);
      obj.choices = obj.choices.map((str) => {
        return str.split(/\s+/).map((s) => parseToken(s, opts2, aliases4));
      });
      w = "";
    }
    if (wrapped(w, "{", "}")) {
      w = stripBoth(w);
      obj.root = w;
      if (/\//.test(w)) {
        const split4 = obj.root.split(/\//);
        obj.root = split4[0];
        obj.pos = split4[1];
        if (obj.pos === "adj") {
          obj.pos = "Adjective";
        }
        obj.pos = obj.pos.charAt(0).toUpperCase() + obj.pos.substr(1).toLowerCase();
        if (split4[2] !== void 0) {
          obj.sense = split4[2];
        }
      }
      return obj;
    }
    if (wrapped(w, "<", ">")) {
      w = stripBoth(w);
      obj.chunk = titleCase2(w);
      obj.greedy = true;
      return obj;
    }
    if (wrapped(w, "%")) {
      w = stripBoth(w);
      obj.switch = w;
      return obj;
    }
  }
  if (start(w) === "#") {
    const name = stripStart(w);
    obj.tag = aliases4?.[name];
    if (!obj.tag) {
      obj.tag = titleCase2(name);
      obj.tag = aliases4?.[obj.tag] || obj.tag;
    }
    return obj;
  }
  if (start(w) === "@") {
    obj.method = stripStart(w);
    return obj;
  }
  if (w === ".") {
    obj.anything = true;
    return obj;
  }
  if (w === "*") {
    obj.anything = true;
    obj.greedy = true;
    obj.optional = true;
    return obj;
  }
  if (w) {
    w = w.replace("\\*", "*");
    w = w.replace("\\.", ".");
    w = w.replace("\\+", "+");
    w = w.replace("\\/", "/");
    if (opts2.caseSensitive) {
      obj.use = "text";
    } else {
      w = w.toLowerCase();
    }
    obj.word = w;
  }
  return obj;
};
var parseToken_default = parseToken;

// ../../node_modules/compromise/src/1-one/tokenize/methods/web.js
var email = /^[\w.!#$%&'*+/=?^`{|}~-]+@(?:[\w-]+\.)+[a-z]{2,}$/i;
var explicitUrl = /^(?:https?:(?:\/\/)?|www\.)(?:[a-z0-9-]+\.)+[a-z]{2,}(?::[0-9]+)?(?:[/?#]\S*)?$/i;
var bareUrl = /^(?:[a-z0-9-]+\.)+(?:com|net|gov|org|ly|edu|info|biz|dev|ru|jp|de|in|uk|br|io|ai)(?::[0-9]+)?(?:[/?#]\S*)?$/i;
var isWebToken = function(str) {
  if (!str.includes(".")) {
    return false;
  }
  let start2 = 0;
  let end2 = str.length;
  while (start2 < end2 && /[\s("'“‘<]/.test(str[start2])) start2++;
  while (end2 > start2 && /[\s).,!?:;"'”’>]/.test(str[end2 - 1])) end2--;
  const text = str.slice(start2, end2);
  return email.test(text) || explicitUrl.test(text) || bareUrl.test(text);
};

// ../../node_modules/compromise/src/1-one/tokenize/methods/02-terms/01-hyphens.js
var hasHyphen = function(str, model5) {
  const parts3 = str.split(/[-–—]/);
  if (parts3.length <= 1) {
    return false;
  }
  if (isWebToken(str)) {
    return false;
  }
  const { prefixes: prefixes2, suffixes: suffixes6 } = model5.one;
  if (parts3[0].length === 1 && /[a-z]/i.test(parts3[0])) {
    return false;
  }
  if (Object.hasOwn(prefixes2, parts3[0])) {
    return false;
  }
  parts3[1] = parts3[1].trim().replace(/[.?!]$/, "");
  if (Object.hasOwn(suffixes6, parts3[1])) {
    return false;
  }
  const reg = /^([a-z\u00C0-\u00FF`"'/]+)[-–—]([a-z0-9\u00C0-\u00FF].*)/i;
  if (reg.test(str)) {
    return true;
  }
  const reg2 = /^[('"]?([0-9]{1,4})[-–—]([a-z\u00C0-\u00FF`"'/-]+[)'"]?$)/i;
  if (reg2.test(str)) {
    return true;
  }
  return false;
};
var splitHyphens = function(word) {
  const arr = [];
  const hyphens = word.split(/[-–—]/);
  let whichDash = "-";
  const found = word.match(/[-–—]/);
  if (found && found[0]) {
    whichDash = found;
  }
  for (let o = 0; o < hyphens.length; o++) {
    if (o === hyphens.length - 1) {
      arr.push(hyphens[o]);
    } else {
      arr.push(hyphens[o] + whichDash);
    }
  }
  return arr;
};

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/03-splitHyphens.js
var splitHyphens2 = function(regs, world2) {
  for (let i3 = regs.length - 1; i3 >= 0; i3 -= 1) {
    const reg = regs[i3];
    if (reg.word && hasHyphen(reg.word, world2.model)) {
      let words2 = reg.word.split(/[-–—]/g);
      words2 = words2.filter((w) => w).reverse();
      regs.splice(i3, 1);
      words2.forEach((w) => {
        const obj = { ...reg };
        obj.word = w;
        regs.splice(i3, 0, obj);
      });
    }
  }
  return regs;
};
var splitHyphens_default = splitHyphens2;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/04-inflect-root.js
var inflect = function(token, world2, kind, fallback2) {
  const { all: all4 } = world2.methods.two.transform[kind] || {};
  if (!all4) {
    return fallback2;
  }
  return all4(token.root, world2.model);
};
var byPos = { Verb: "verb", Noun: "noun", Adjective: "adjective" };
var inflectRoot = function(regs, world2) {
  regs = regs.map((token) => {
    if (token.root) {
      if (world2.methods.two && world2.methods.two.transform) {
        let choices = [];
        if (token.pos) {
          if (Object.hasOwn(byPos, token.pos)) {
            const kind = byPos[token.pos];
            choices = inflect(token, world2, kind, kind === "verb" ? [] : [token.root]);
          }
        } else {
          choices = [
            ...inflect(token, world2, "verb", []),
            ...inflect(token, world2, "noun", [token.root]),
            ...inflect(token, world2, "adjective", [token.root])
          ];
        }
        choices = choices.filter((str) => str);
        if (choices.length > 0) {
          token.operator = "or";
          token.fastOr = new Set(choices);
        }
      } else {
        token.machine = token.root;
        delete token.id;
        delete token.root;
      }
    }
    return token;
  });
  return regs;
};
var inflect_root_default = inflectRoot;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/05-postProcess.js
var nameGroups = function(regs) {
  let index3 = 0;
  let inGroup = null;
  for (let i3 = 0; i3 < regs.length; i3++) {
    const token = regs[i3];
    if (token.groupStart === true) {
      inGroup = token.group;
      if (inGroup === null) {
        inGroup = String(index3);
        index3 += 1;
      }
    }
    if (inGroup !== null) {
      token.group = inGroup;
    }
    if (token.groupEnd === true) {
      inGroup = null;
    }
  }
  return regs;
};
var doFastOrMode = function(tokens2) {
  return tokens2.map((token) => {
    if (token.choices !== void 0) {
      if (token.operator !== "or") {
        return token;
      }
      if (token.fuzzy === true) {
        return token;
      }
      const shouldPack = token.choices.every((block) => {
        if (block.length !== 1) {
          return false;
        }
        const reg = block[0];
        if (reg.fuzzy === true) {
          return false;
        }
        if (reg.start || reg.end) {
          return false;
        }
        if (reg.word !== void 0 && reg.negative !== true && reg.optional !== true && reg.method !== true) {
          return true;
        }
        return false;
      });
      if (shouldPack === true) {
        token.fastOr = /* @__PURE__ */ new Set();
        token.choices.forEach((block) => {
          token.fastOr.add(block[0].word);
        });
        delete token.choices;
      }
    }
    return token;
  });
};
var fuzzyOr = function(regs) {
  return regs.map((reg) => {
    if (reg.fuzzy && reg.choices) {
      reg.choices.forEach((r) => {
        if (r.length === 1 && r[0].word) {
          r[0].fuzzy = true;
          r[0].min = reg.min;
        }
      });
    }
    return reg;
  });
};
var postProcess = function(regs) {
  regs = nameGroups(regs);
  regs = doFastOrMode(regs);
  regs = fuzzyOr(regs);
  return regs;
};
var postProcess_default = postProcess;

// ../../node_modules/compromise/src/1-one/match/methods/parseMatch/index.js
var syntax = function(input, opts2, world2) {
  if (input === null || input === void 0 || input === "") {
    return [];
  }
  opts2 ||= {};
  if (typeof input === "number") {
    input = String(input);
  }
  let tokens2 = parseBlocks_default(input, opts2);
  tokens2 = tokens2.map((str) => parseToken_default(str, opts2, world2.model.one.tagAliases));
  tokens2 = splitHyphens_default(tokens2, world2);
  tokens2 = inflect_root_default(tokens2, world2);
  tokens2 = postProcess_default(tokens2, opts2);
  return tokens2;
};
var parseMatch_default = syntax;

// ../../node_modules/compromise/src/1-one/match/methods/match/01-failFast.js
var anyIntersection = function(setA, setB) {
  for (const elem of setB) {
    if (setA.has(elem)) {
      return true;
    }
  }
  return false;
};
var failFast = function(regs, cache3) {
  for (let i3 = 0; i3 < regs.length; i3 += 1) {
    const reg = regs[i3];
    if (reg.optional === true || reg.negative === true || reg.fuzzy === true) {
      continue;
    }
    if (reg.word !== void 0 && !cache3.has(reg.word)) {
      return true;
    }
    if (reg.tag !== void 0 && !cache3.has("#" + reg.tag)) {
      return true;
    }
    if (reg.fastOr !== void 0 && !anyIntersection(reg.fastOr, cache3)) {
      return true;
    }
  }
  return false;
};
var failFast_default = failFast;

// ../../node_modules/compromise/src/1-one/match/methods/match/term/_fuzzy.js
var editDistance2 = function(strA, strB) {
  const aLength = strA.length, bLength = strB.length;
  if (aLength === 0) {
    return bLength;
  }
  if (bLength === 0) {
    return aLength;
  }
  const limit = (bLength > aLength ? bLength : aLength) + 1;
  if (Math.abs(aLength - bLength) > (limit || 100)) {
    return limit || 100;
  }
  const matrix = [];
  for (let i3 = 0; i3 < limit; i3++) {
    matrix[i3] = [i3];
    matrix[i3].length = limit;
  }
  for (let i3 = 0; i3 < limit; i3++) {
    matrix[0][i3] = i3;
  }
  let j, a_index, b_index, cost, min2, t;
  for (let i3 = 1; i3 <= aLength; ++i3) {
    a_index = strA[i3 - 1];
    for (j = 1; j <= bLength; ++j) {
      if (i3 === j && matrix[i3][j] > 4) {
        return aLength;
      }
      b_index = strB[j - 1];
      cost = a_index === b_index ? 0 : 1;
      min2 = matrix[i3 - 1][j] + 1;
      if ((t = matrix[i3][j - 1] + 1) < min2) min2 = t;
      if ((t = matrix[i3 - 1][j - 1] + cost) < min2) min2 = t;
      const shouldUpdate = i3 > 1 && j > 1 && a_index === strB[j - 2] && strA[i3 - 2] === b_index && (t = matrix[i3 - 2][j - 2] + cost) < min2;
      if (shouldUpdate) {
        matrix[i3][j] = t;
      } else {
        matrix[i3][j] = min2;
      }
    }
  }
  return matrix[aLength][bLength];
};
var fuzzyMatch = function(strA, strB, minLength = 3) {
  if (strA === strB) {
    return 1;
  }
  if (strA.length < minLength || strB.length < minLength) {
    return 0;
  }
  const steps = editDistance2(strA, strB);
  const length2 = Math.max(strA.length, strB.length);
  const relative2 = length2 === 0 ? 0 : steps / length2;
  const similarity = 1 - relative2;
  return similarity;
};
var fuzzy_default = fuzzyMatch;

// ../../node_modules/compromise/src/1-one/match/methods/termMethods.js
var startQuote = /([\u0022\uFF02\u0027\u201C\u2018\u201F\u201B\u201E\u2E42\u201A\u00AB\u2039\u2035\u2036\u2037\u301D\u0060\u301F])/;
var endQuote = /([\u0022\uFF02\u0027\u201D\u2019\u00BB\u203A\u2032\u2033\u2034\u301E\u00B4])/;
var hasHyphen2 = /^[-–—]$/;
var hasDash = / [-–—]{1,3} /;
var hasPost = (term, punct2) => term.post.indexOf(punct2) !== -1;
var methods10 = {
  /** does it have a quotation symbol?  */
  hasQuote: (term) => startQuote.test(term.pre) || endQuote.test(term.post),
  /** does it have a comma?  */
  hasComma: (term) => hasPost(term, ","),
  /** does it end in a period? */
  hasPeriod: (term) => hasPost(term, ".") === true && hasPost(term, "...") === false,
  /** does it end in an exclamation */
  hasExclamation: (term) => hasPost(term, "!"),
  /** does it end with a question mark? */
  hasQuestionMark: (term) => hasPost(term, "?") || hasPost(term, "\xBF"),
  /** is there a ... at the end? */
  hasEllipses: (term) => hasPost(term, "..") || hasPost(term, "\u2026"),
  /** is there a semicolon after term word? */
  hasSemicolon: (term) => hasPost(term, ";"),
  /** is there a colon after term word? */
  hasColon: (term) => hasPost(term, ":"),
  /** is there a slash '/' in term word? */
  hasSlash: (term) => /\//.test(term.text),
  /** a hyphen connects two words like-term */
  hasHyphen: (term) => hasHyphen2.test(term.post) || hasHyphen2.test(term.pre),
  /** a dash separates words - like that */
  hasDash: (term) => hasDash.test(term.post) || hasDash.test(term.pre),
  /** is it multiple words combinded */
  hasContraction: (term) => Boolean(term.implicit),
  /** is it an acronym */
  isAcronym: (term) => term.tags.has("Acronym"),
  /** does it have any tags */
  isKnown: (term) => term.tags.size > 0,
  /** uppercase first letter, then a lowercase - also 'Tis */
  isTitleCase: (term) => new RegExp("^['\\u2019]?\\p{Lu}[a-z'\\u00C0-\\u00FF]", "u").test(term.text),
  /** uppercase all letters */
  isUpperCase: (term) => new RegExp("^\\p{Lu}+$", "u").test(term.text)
};
methods10.hasQuotation = methods10.hasQuote;
var termMethods_default = methods10;

// ../../node_modules/compromise/src/1-one/match/methods/match/term/doesMatch.js
var wrapMatch = function() {
};
var doesMatch = function(term, reg, index3, length2) {
  if (reg.anything === true) {
    return true;
  }
  if (reg.start === true && index3 !== 0) {
    return false;
  }
  if (reg.end === true && index3 !== length2 - 1) {
    return false;
  }
  if (reg.id !== void 0 && reg.id === term.id) {
    return true;
  }
  if (reg.word !== void 0) {
    if (reg.use) {
      return reg.word === term[reg.use];
    }
    if (term.machine !== null && term.machine === reg.word) {
      return true;
    }
    if (reg.fuzzy === true) {
      if (reg.word === term.root) {
        return true;
      }
      const score = fuzzy_default(reg.word, term.normal);
      if (score >= reg.min) {
        return true;
      }
    }
    if (term.alias && term.alias.some((str) => str === reg.word)) {
      return true;
    }
    return reg.word === term.text || reg.word === term.normal;
  }
  if (reg.tag !== void 0) {
    return term.tags.has(reg.tag);
  }
  if (reg.method !== void 0) {
    if (typeof termMethods_default[reg.method] === "function" && termMethods_default[reg.method](term) === true) {
      return true;
    }
    return false;
  }
  if (reg.pre !== void 0) {
    return term.pre && term.pre.includes(reg.pre);
  }
  if (reg.post !== void 0) {
    return term.post && term.post.includes(reg.post);
  }
  if (reg.regex !== void 0) {
    let str = term.normal;
    if (reg.use) {
      str = term[reg.use];
    }
    if (reg.regex.global || reg.regex.sticky) {
      const lastIndex = reg.regex.lastIndex;
      try {
        reg.regex.lastIndex = 0;
        return reg.regex.test(str);
      } finally {
        reg.regex.lastIndex = lastIndex;
      }
    }
    return reg.regex.test(str);
  }
  if (reg.chunk !== void 0) {
    return term.chunk === reg.chunk;
  }
  if (reg.switch !== void 0) {
    return term.switch === reg.switch;
  }
  if (reg.machine !== void 0) {
    return term.normal === reg.machine || term.machine === reg.machine || term.root === reg.machine;
  }
  if (reg.sense !== void 0) {
    return term.sense === reg.sense;
  }
  if (reg.fastOr !== void 0) {
    if (reg.pos && !term.tags.has(reg.pos)) {
      return null;
    }
    const str = term.root || term.implicit || term.machine || term.normal;
    return reg.fastOr.has(str) || reg.fastOr.has(term.text);
  }
  if (reg.choices !== void 0) {
    if (reg.operator === "and") {
      return reg.choices.every((r) => wrapMatch(term, r[0], index3, length2));
    }
    return reg.choices.some((r) => wrapMatch(term, r[0], index3, length2));
  }
  return false;
};
wrapMatch = function(t, reg, index3, length2) {
  const result = doesMatch(t, reg, index3, length2);
  if (reg.negative === true) {
    return !result;
  }
  return result;
};
var doesMatch_default = wrapMatch;

// ../../node_modules/compromise/src/1-one/match/methods/match/_lib.js
var getGroup = function(state, term_index) {
  if (!state.groups) {
    state.groups = {};
  }
  if (state.groups[state.inGroup]) {
    return state.groups[state.inGroup];
  }
  state.groups[state.inGroup] = {
    start: term_index,
    length: 0
  };
  return state.groups[state.inGroup];
};
var logGroup = function(state, startAt) {
  if (state.hasGroup === true && state.t > startAt) {
    getGroup(state, startAt).length += state.t - startAt;
  }
};
var matchAt = (state, reg, t) => doesMatch_default(state.terms[t], reg, state.start_i + t, state.phrase_length);
var noAnchors = (reg) => ({ ...reg, start: false, end: false });
var getMinLength = (regs) => regs.filter((reg) => reg.optional !== true && reg.negative !== true).length;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/logic/greedy.js
var getGreedy = function(state, endReg) {
  const reg = noAnchors(state.regs[state.r]);
  const start2 = state.t;
  for (; state.t < state.terms.length; state.t += 1) {
    const count = state.t - start2 + 1;
    if (endReg && matchAt(state, endReg, state.t)) {
      if (reg.min === void 0 || count >= reg.min) {
        return state.t;
      }
    }
    if (reg.max !== void 0 && count === reg.max) {
      return state.t;
    }
    if (matchAt(state, reg, state.t) === false) {
      if (reg.min !== void 0 && count < reg.min) {
        return null;
      }
      return state.t;
    }
  }
  if (reg.min !== void 0 && state.t - start2 + 1 < reg.min) {
    return null;
  }
  return state.t;
};
var greedyTo = function(state, nextReg) {
  let t = state.t;
  if (!nextReg) {
    return state.terms.length;
  }
  for (; t < state.terms.length; t += 1) {
    if (matchAt(state, nextReg, t) === true) {
      return t;
    }
  }
  return null;
};
var isEndGreedy = function(reg, state) {
  if (reg.end === true && reg.greedy === true) {
    if (state.start_i + state.t < state.phrase_length - 1) {
      const tmpReg = { ...reg, end: false };
      if (matchAt(state, tmpReg, state.t) === true) {
        return true;
      }
    }
  }
  return false;
};

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/astrix.js
var doAstrix = function(state) {
  const { regs } = state;
  const reg = regs[state.r];
  const skipto = greedyTo(state, regs[state.r + 1]);
  if (skipto === null || skipto === state.offset) {
    return null;
  }
  if (reg.min !== void 0 && skipto - state.t < reg.min) {
    return null;
  }
  if (reg.max !== void 0 && skipto - state.t > reg.max) {
    state.t = state.t + reg.max;
    return true;
  }
  if (state.hasGroup === true) {
    const g3 = getGroup(state, state.t);
    g3.length += skipto - state.t;
  }
  state.t = skipto;
  return true;
};
var astrix_default = doAstrix;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/logic/and-or.js
var tryChoice = function(state, regs, skipN) {
  let len = 0;
  for (let w = 0; w < regs.length; w += 1) {
    const cr = regs[w];
    const t = state.t + skipN + len;
    if (state.terms[t] === void 0) {
      return 0;
    }
    if (matchAt(state, cr, t) !== true) {
      return 0;
    }
    len += 1;
    if (cr.greedy === true) {
      const gr = noAnchors(cr);
      for (let i3 = t + 1; i3 < state.terms.length; i3 += 1) {
        if (matchAt(state, gr, i3) !== true) {
          break;
        }
        len += 1;
      }
    }
  }
  return len;
};
var tryChoices = function(state, skipN) {
  const block = state.regs[state.r];
  for (let c = 0; c < block.choices.length; c += 1) {
    const regs = block.choices[c];
    if (!Array.isArray(regs)) {
      return 0;
    }
    const len = tryChoice(state, regs, skipN);
    if (len > 0) {
      return len;
    }
  }
  return 0;
};
var tryAndBlock = function(state, skipN) {
  let longest = 0;
  const reg = state.regs[state.r];
  const allDidMatch = reg.choices.every((block) => {
    const allWords = block.every((cr, w_index) => {
      const tryTerm = state.t + skipN + w_index;
      if (state.terms[tryTerm] === void 0) {
        return false;
      }
      return matchAt(state, cr, tryTerm);
    });
    if (allWords === true && block.length > longest) {
      longest = block.length;
    }
    return allWords;
  });
  if (allDidMatch === true) {
    return longest;
  }
  return 0;
};
var repeatBlock = function(state, tryBlock) {
  const reg = state.regs[state.r];
  let skipN = tryBlock(state, 0);
  if (skipN === 0 || reg.greedy !== true) {
    return skipN;
  }
  const next = state.regs[state.r + 1];
  let count = 1;
  while (count !== reg.max) {
    const t = state.t + skipN;
    const term = state.terms[t];
    const hasMin = reg.min === void 0 || count >= reg.min;
    if (!term || next && hasMin && matchAt(state, next, t)) {
      break;
    }
    const more = tryBlock(state, skipN);
    if (more === 0) {
      break;
    }
    skipN += more;
    count += 1;
  }
  if (reg.min !== void 0 && count < reg.min) {
    return 0;
  }
  return skipN;
};
var doOrBlock = (state) => repeatBlock(state, tryChoices);
var doAndBlock = (state) => repeatBlock(state, tryAndBlock);

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/optional-match.js
var leaveForNext = function(state) {
  const next = state.regs[state.r + 1];
  if (!next || !matchAt(state, next, state.t)) {
    return false;
  }
  const nextTerm = state.terms[state.t + 1];
  return !nextTerm || !matchAt(state, next, state.t + 1);
};
var optional_match_default = leaveForNext;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/logic/negative-greedy.js
var negGreedy = function(state, reg, nextReg) {
  let skip = 0;
  for (let t = state.t; t < state.terms.length; t += 1) {
    let found = matchAt(state, reg, t);
    if (found) {
      break;
    }
    if (nextReg) {
      found = matchAt(state, nextReg, t);
      if (found) {
        break;
      }
    }
    skip += 1;
    if (reg.max !== void 0 && skip === reg.max) {
      break;
    }
  }
  if (skip === 0) {
    return reg.optional === true;
  }
  if (reg.min && reg.min > skip) {
    return false;
  }
  state.t += skip;
  return true;
};
var negative_greedy_default = negGreedy;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/logic/negative-block.js
var negativeBlock = function(state) {
  const reg = state.regs[state.r];
  const startAt = state.t;
  let alive = true;
  if (reg.greedy === true) {
    alive = negative_greedy_default(state, noAnchors({ ...reg, negative: false }), state.regs[state.r + 1]);
  } else if (!reg.optional) {
    state.t += 1;
  }
  logGroup(state, startAt);
  return alive;
};
var negative_block_default = negativeBlock;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/_block.js
var makeBlock = (tryBlock) => function(state) {
  const { regs } = state;
  const reg = regs[state.r];
  const skipNum = tryBlock(state);
  if (skipNum) {
    if (reg.negative === true) {
      return reg.optional === true && reg.greedy === true;
    }
    if (reg.optional === true && optional_match_default(state)) {
      return true;
    }
    if (state.hasGroup === true) {
      const g3 = getGroup(state, state.t);
      g3.length += skipNum;
    }
    if (reg.end === true) {
      const end2 = state.phrase_length;
      if (state.t + state.start_i + skipNum !== end2) {
        return null;
      }
    }
    state.t += skipNum;
    return true;
  }
  if (reg.negative === true) {
    return negative_block_default(state);
  }
  if (!reg.optional) {
    return null;
  }
  return true;
};
var block_default = makeBlock;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/or-block.js
var or_block_default = block_default(doOrBlock);

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/and-block.js
var and_block_default = block_default(doAndBlock);

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/negative.js
var doNegative = function(state) {
  const { regs } = state;
  const reg = regs[state.r];
  const startAt = state.t;
  const tmpReg = { ...reg };
  tmpReg.negative = false;
  const found = matchAt(state, tmpReg, state.t);
  if (found) {
    return reg.optional === true && reg.greedy === true;
  }
  if (reg.greedy) {
    const alive = negative_greedy_default(state, noAnchors(tmpReg), regs[state.r + 1]);
    logGroup(state, startAt);
    return alive;
  }
  if (reg.optional) {
    const nextReg = regs[state.r + 1];
    if (nextReg) {
      const fNext = matchAt(state, nextReg, state.t);
      if (fNext) {
        return true;
      }
      if (nextReg.optional && regs[state.r + 2]) {
        const fNext2 = matchAt(state, regs[state.r + 2], state.t);
        if (fNext2) {
          return true;
        }
      }
    }
  }
  state.t += 1;
  logGroup(state, startAt);
  return true;
};
var negative_default = doNegative;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/greedy-match.js
var greedyMatch = function(state) {
  const { regs, phrase_length } = state;
  const reg = regs[state.r];
  state.t = getGreedy(state, regs[state.r + 1]);
  if (state.t === null) {
    return null;
  }
  if (reg.end === true && state.start_i + state.t !== phrase_length) {
    return null;
  }
  return true;
};
var greedy_match_default = greedyMatch;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/contraction-skip.js
var contractionSkip = function(state) {
  const term = state.terms[state.t];
  const reg = state.regs[state.r];
  if (!term.implicit || !state.terms[state.t + 1]?.implicit) {
    return;
  }
  if (reg.word === term.normal || reg.method === "hasContraction") {
    let next = state.terms[state.t + 1];
    while (next && next.implicit && next.text === "") {
      state.t += 1;
      next = state.terms[state.t + 1];
    }
  }
};
var contraction_skip_default = contractionSkip;

// ../../node_modules/compromise/src/1-one/match/methods/match/steps/simple-match.js
var setGroup = function(state, startAt) {
  const reg = state.regs[state.r];
  const g3 = getGroup(state, startAt);
  if (state.t - state.offset > 1 && reg.greedy) {
    g3.length += state.t - startAt;
  } else {
    g3.length++;
  }
};
var simpleMatch = function(state) {
  const { regs } = state;
  const reg = regs[state.r];
  const term = state.terms[state.t];
  const startAt = state.t;
  if (reg.optional && regs[state.r + 1] && reg.negative) {
    return true;
  }
  if (reg.optional && optional_match_default(state)) {
    return true;
  }
  if (term.implicit && state.terms[state.t + 1]) {
    contraction_skip_default(state);
  }
  state.t += 1;
  if (reg.end === true && state.t !== state.terms.length && reg.greedy !== true) {
    return null;
  }
  if (reg.greedy === true) {
    const alive = greedy_match_default(state);
    if (!alive) {
      return null;
    }
  }
  if (state.hasGroup === true) {
    setGroup(state, startAt);
  }
  return true;
};
var simple_match_default = simpleMatch;

// ../../node_modules/compromise/src/1-one/match/methods/match/02-from-here.js
var pickStep = function(reg, state) {
  if (reg.anything === true && reg.greedy === true) {
    return astrix_default;
  }
  if (reg.choices !== void 0 && reg.operator === "or") {
    return or_block_default;
  }
  if (reg.choices !== void 0 && reg.operator === "and") {
    return and_block_default;
  }
  if (reg.anything === true) {
    if (reg.negative) {
      return null;
    }
    return simple_match_default;
  }
  if (isEndGreedy(reg, state) === true) {
    return simple_match_default;
  }
  if (reg.negative) {
    return negative_default;
  }
  if (matchAt(state, reg, state.t) === true) {
    return simple_match_default;
  }
  if (reg.optional === true) {
    return void 0;
  }
  return null;
};
var tryHere = function(terms, regs, start_i, phrase_length, offset2 = 0) {
  if (offset2 >= terms.length || regs.length === 0) {
    return null;
  }
  const origin = start_i - offset2;
  const state = {
    t: offset2,
    offset: offset2,
    terms,
    r: 0,
    regs,
    groups: null,
    start_i: origin,
    phrase_length,
    inGroup: null
  };
  for (; state.r < regs.length; state.r += 1) {
    const reg = regs[state.r];
    state.hasGroup = Boolean(reg.group);
    state.inGroup = state.hasGroup ? reg.group : null;
    if (!state.terms[state.t]) {
      const alive = regs.slice(state.r).some((remain) => !remain.optional);
      if (alive === false) {
        break;
      }
      return null;
    }
    const step = pickStep(reg, state);
    if (step === null) {
      return null;
    }
    if (step && !step(state)) {
      return null;
    }
  }
  const pntr = [null, start_i, state.t + origin];
  if (pntr[1] === pntr[2]) {
    return null;
  }
  const groups2 = {};
  if (state.groups) {
    Object.keys(state.groups).forEach((k2) => {
      const o = state.groups[k2];
      const start2 = origin + o.start;
      groups2[k2] = [null, start2, start2 + o.length];
    });
  }
  return { pointer: pntr, groups: groups2 };
};
var from_here_default = tryHere;

// ../../node_modules/compromise/src/1-one/match/methods/match/03-getGroup.js
var getGroup2 = function(res, group) {
  const ptrs = [];
  const byGroup = {};
  if (typeof group === "number") {
    group = String(group);
  }
  if (group) {
    res.forEach((r) => {
      if (r.groups[group]) {
        ptrs.push(r.groups[group]);
      }
    });
  } else {
    res.forEach((r) => {
      ptrs.push(r.pointer);
      Object.entries(r.groups).forEach(([k2, ptr]) => {
        byGroup[k2] ||= [];
        byGroup[k2].push(ptr);
      });
    });
  }
  return { ptrs, byGroup };
};
var getGroup_default = getGroup2;

// ../../node_modules/compromise/src/1-one/match/methods/match/03-notIf.js
var notIf = function(results, not, docs) {
  return results.filter((res) => {
    const [n2, start2, end2] = res.pointer;
    const terms = docs[n2].slice(start2, end2);
    return !terms.some((_t, i3) => from_here_default(terms, not, i3, terms.length, i3) !== null);
  });
};
var notIf_default = notIf;

// ../../node_modules/compromise/src/1-one/match/methods/match/_fixed.js
var isFixed = (regs) => regs.every((reg) => !reg.optional && !reg.greedy && !reg.negative && !reg.choices && !reg.anything && (reg.word !== void 0 || reg.tag !== void 0 || reg.switch !== void 0 || reg.fastOr !== void 0));
var fromFixed = (terms, regs, start2, length2, offset2 = 0) => {
  if (offset2 + regs.length > terms.length) {
    return null;
  }
  for (let r = 0; r < regs.length; r += 1) {
    const term = terms[offset2 + r];
    if (term.implicit) {
      return from_here_default(terms, regs, start2, length2, offset2);
    }
    if (doesMatch_default(term, regs[r], start2 + r, length2) !== true) {
      return null;
    }
  }
  const groups2 = {};
  for (let r = 0; r < regs.length; r += 1) {
    const name = regs[r].group;
    if (name) {
      if (!groups2[name]) {
        groups2[name] = [null, start2 + r, start2 + r];
      }
      groups2[name][2] += 1;
    }
  }
  return { pointer: [null, start2, start2 + regs.length], groups: groups2 };
};

// ../../node_modules/compromise/src/1-one/match/methods/match/index.js
var addSentence = function(res, n2) {
  res.pointer[0] = n2;
  Object.keys(res.groups).forEach((k2) => {
    res.groups[k2][0] = n2;
  });
  return res;
};
var handleStart = function(terms, regs, n2, attempt) {
  let res = attempt(terms, regs, 0, terms.length);
  if (res) {
    res = addSentence(res, n2);
    return res;
  }
  return null;
};
var runMatch = function(docs, todo, cache3) {
  cache3 ||= [];
  const { regs, group, justOne, checkFirst } = todo;
  let results = [];
  if (!regs || regs.length === 0) {
    return { ptrs: [], byGroup: {} };
  }
  const attempt = todo.fixed ?? isFixed(regs) ? fromFixed : from_here_default;
  let minLength = todo.minLength;
  if (minLength === void 0) {
    minLength = getMinLength(regs);
  }
  docs: for (let n2 = 0; n2 < docs.length; n2 += 1) {
    const terms = docs[n2];
    if (cache3[n2] && failFast_default(regs, cache3[n2])) {
      continue;
    }
    if (regs[0].start === true) {
      const foundStart = handleStart(terms, regs, n2, attempt);
      if (foundStart) {
        results.push(foundStart);
      }
      continue;
    }
    for (let i3 = 0; i3 < terms.length; i3 += 1) {
      if (terms.length - i3 < minLength) {
        break;
      }
      if (checkFirst && !doesMatch_default(terms[i3], regs[0], i3, terms.length)) {
        continue;
      }
      let res = attempt(terms, regs, i3, terms.length, i3);
      if (res) {
        res = addSentence(res, n2);
        results.push(res);
        if (justOne === true) {
          break docs;
        }
        const end2 = res.pointer[2];
        if (Math.abs(end2 - 1) > i3) {
          i3 = Math.abs(end2 - 1);
        }
      }
    }
  }
  if (regs[regs.length - 1].end === true) {
    results = results.filter((res) => {
      const n2 = res.pointer[0];
      return docs[n2].length === res.pointer[2];
    });
  }
  if (todo.notIf) {
    results = notIf_default(results, todo.notIf, docs);
  }
  results = getGroup_default(results, group);
  results.ptrs.forEach((ptr) => {
    const [n2, start2, end2] = ptr;
    ptr[3] = docs[n2][start2].id;
    ptr[4] = docs[n2][end2 - 1].id;
  });
  return results;
};
var match_default2 = runMatch;

// ../../node_modules/compromise/src/1-one/match/methods/index.js
var methods11 = {
  one: {
    termMethods: termMethods_default,
    parseMatch: parseMatch_default,
    match: match_default2
  }
};
var methods_default4 = methods11;

// ../../node_modules/compromise/src/1-one/match/lib.js
var lib_default3 = {
  /** pre-parse any match statements */
  parseMatch: function(str, opts2) {
    const world2 = this.world();
    const killUnicode2 = world2.methods.one.killUnicode;
    if (killUnicode2) {
      str = killUnicode2(str, world2);
    }
    return world2.methods.one.parseMatch(str, opts2, world2);
  }
};

// ../../node_modules/compromise/src/1-one/match/plugin.js
var plugin_default7 = {
  api: api_default4,
  methods: methods_default4,
  lib: lib_default3
};

// ../../node_modules/compromise/src/1-one/output/api/html.js
var isClass = /^\../;
var isId = /^#./;
var escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
var escapeXml = (str) => str.replace(/[&<>"']/g, (c) => escapes[c]);
var toTag = function(k2) {
  let start2 = "";
  let end2 = "</span>";
  k2 = escapeXml(k2);
  if (isClass.test(k2)) {
    start2 = `<span class="${k2.replace(/^\./, "")}"`;
  } else if (isId.test(k2)) {
    start2 = `<span id="${k2.replace(/^#/, "")}"`;
  } else {
    start2 = `<${k2}`;
    end2 = `</${k2}>`;
  }
  start2 += ">";
  return { start: start2, end: end2 };
};
var getIndex2 = function(doc, obj) {
  const starts = {};
  const ends = {};
  Object.keys(obj).forEach((k2) => {
    let res = obj[k2];
    const tag = toTag(k2);
    if (typeof res === "string") {
      res = doc.match(res);
    }
    res.docs.forEach((terms) => {
      if (terms.every((t) => t.implicit)) {
        return;
      }
      const a = terms[0].id;
      starts[a] ||= [];
      starts[a].push(tag.start);
      const b2 = terms.at(-1).id;
      ends[b2] ||= [];
      ends[b2].push(tag.end);
    });
  });
  return { starts, ends };
};
var html = function(obj) {
  const { starts, ends } = getIndex2(this, obj);
  let out2 = "";
  lib_default(this.docs, (t) => {
    if (Object.hasOwn(starts, t.id)) {
      out2 += starts[t.id].join("");
    }
    out2 += t.pre || "";
    out2 += t.text || "";
    if (Object.hasOwn(ends, t.id)) {
      out2 += ends[t.id].join("");
    }
    out2 += t.post || "";
  });
  return out2;
};
var html_default = { html };

// ../../node_modules/compromise/src/1-one/output/api/_text.js
var endPunctuation = /[,:;)\]*.?~!\u0022\uFF02\u201D\u2019\u00BB\u203A\u2032\u2033\u2034\u301E\u00B4—-]/;
var trimEnd = (str) => {
  let end2 = str.length;
  while (end2 > 0 && endPunctuation.test(str[end2 - 1])) end2--;
  return str.slice(0, end2);
};
var trimStart = /^[(['"*~\uFF02\u201C\u2018\u201F\u201B\u201E\u2E42\u201A\u00AB\u2039\u2035\u2036\u2037\u301D\u0060\u301F]+/;
var punctToKill = /[,:;)('"\uFF02\u201D\u2019\u00BB\u203A\u2032\u2033\u2034\u301E\u00B4\]]/;
var isHyphen = /^[-–—]$/;
var hasSpace = / /;
var rawText = (terms) => terms.reduce((str, t) => str + t.pre + t.text + t.post, "").trim();
var textFromTerms = function(terms, opts2, keepSpace = true) {
  let txt = "";
  terms.forEach((t, i3) => {
    let pre = t.pre || "";
    let post = t.post || "";
    if (opts2.punctuation === "some") {
      pre = pre.replace(/[,،]/g, "");
      pre = pre.replace(trimStart, "");
      if (isHyphen.test(post)) {
        post = " ";
      }
      post = post.replace(punctToKill, "");
      post = post.replace(/\?!+/, "?");
      post = post.replace(/!+/, "!");
      post = post.replace(/\?+/, "?");
      post = post.replace(/[,،…]|\.{2,}/g, "");
      if (t.tags.has("Abbreviation")) {
        post = post.replace(/\./, "");
      }
    }
    if (opts2.whitespace === "some") {
      pre = pre.replace(/\s/, "");
      post = post.replace(/\s+/, " ");
    }
    if (!opts2.keepPunct) {
      pre = pre.replace(trimStart, "");
      if (post === "-") {
        post = " ";
      } else {
        post = trimEnd(post);
      }
    }
    let word = t[opts2.form || "text"] || t.normal || "";
    if (opts2.form === "implicit") {
      word = t.implicit || t.text;
    }
    if (opts2.form === "root" && t.implicit) {
      word = t.root || t.implicit || t.normal;
    }
    if ((opts2.form === "machine" || opts2.form === "implicit" || opts2.form === "root") && t.implicit && i3 < terms.length - 1) {
      if (!post || !hasSpace.test(post)) {
        post += " ";
      }
    }
    txt += pre + word + post;
  });
  if (keepSpace === false) {
    txt = txt.trim();
  }
  if (opts2.lowerCase === true) {
    txt = txt.toLowerCase();
  }
  return txt;
};
var textFromDoc = function(docs, opts2) {
  let text = "";
  if (!docs || !docs[0] || !docs[0][0]) {
    return text;
  }
  for (let i3 = 0; i3 < docs.length; i3 += 1) {
    text += textFromTerms(docs[i3], opts2, true);
  }
  if (!opts2.keepSpace) {
    text = text.trim();
  }
  if (opts2.keepEndPunct === false) {
    if (!docs[0][0].tags.has("Emoticon")) {
      text = text.replace(trimStart, "");
    }
    const last = docs.at(-1);
    if (!last.at(-1).tags.has("Emoticon")) {
      text = trimEnd(text);
      if (!opts2.keepSpace) {
        text = text.trimEnd();
      }
    }
    if (text.endsWith(`'`) && !text.endsWith(`s'`)) {
      text = text.replace(/'/, "");
    }
  }
  if (opts2.cleanWhitespace === true) {
    text = text.trim();
  }
  return text;
};

// ../../node_modules/compromise/src/1-one/output/api/_fmts.js
var some2 = {
  whitespace: "some",
  punctuation: "some",
  unicode: "some"
};
var fmts = {
  text: {
    form: "text"
  },
  normal: {
    ...some2,
    case: "some",
    form: "normal"
  },
  machine: {
    ...some2,
    keepSpace: false,
    case: "none",
    form: "machine"
  },
  root: {
    ...some2,
    keepSpace: false,
    case: "some",
    form: "root"
  },
  implicit: {
    form: "implicit"
  }
};
fmts.clean = fmts.normal;
fmts.reduced = fmts.root;
var fmts_default = fmts;

// ../../node_modules/compromise/src/1-one/output/methods/hash.js
var k = [];
var i2 = 0;
for (; i2 < 64; i2++) {
  k[i2] = 0 | Math.sin((i2 + 1) % Math.PI) * 4294967296;
}
var md5 = function(s) {
  let b2, c, d, j = decodeURI(encodeURI(s)) + "\x80", a = j.length;
  const h = [b2 = 1732584193, c = 4023233417, ~b2, ~c], words2 = [];
  s = --a / 4 + 2 | 15;
  words2[--s] = a * 8;
  for (; ~a; ) {
    words2[a >> 2] |= j.charCodeAt(a) << 8 * a--;
  }
  for (i2 = j = 0; i2 < s; i2 += 16) {
    a = h;
    for (; j < 64; a = [
      d = a[3],
      b2 + ((d = a[0] + [b2 & c | ~b2 & d, d & b2 | ~d & c, b2 ^ c ^ d, c ^ (b2 | ~d)][a = j >> 4] + k[j] + ~~words2[i2 | [j, 5 * j + 1, 3 * j + 5, 7 * j][a] & 15]) << (a = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21][4 * a + j++ % 4]) | d >>> -a),
      b2,
      c
    ]) {
      b2 = a[1] | 0;
      c = a[2];
    }
    for (j = 4; j; ) h[--j] += a[j];
  }
  for (s = ""; j < 32; ) {
    s += (h[j >> 3] >> (1 ^ j++) * 4 & 15).toString(16);
  }
  return s;
};
var hash_default = md5;

// ../../node_modules/compromise/src/1-one/output/api/json.js
var defaults = {
  text: true,
  terms: true
};
var opts = { case: "none", unicode: "some", form: "machine", punctuation: "some" };
var punct = (terms, fmt2) => textFromTerms(terms, { ...fmt2, keepPunct: true }, false);
var fns4 = {
  text: (terms) => punct(terms),
  normal: (terms) => punct(terms, fmts_default.normal),
  implicit: (terms) => punct(terms, fmts_default.implicit),
  machine: (terms) => textFromTerms(terms, opts, false),
  root: (terms) => textFromTerms(terms, { ...opts, form: "root" }, false),
  hash: (terms) => hash_default(punct(terms)),
  offset: (terms) => {
    const len = fns4.text(terms).length;
    const raw = terms[0].pre + terms[0].text;
    const lead = terms[0].pre.length - (raw.length - raw.trimStart().length);
    return {
      index: terms[0].offset.index,
      start: terms[0].offset.start - lead,
      length: len
    };
  },
  terms: (terms) => {
    return terms.map((t) => ({ ...t, tags: [...t.tags] }));
  },
  confidence: (_terms, view, i3) => view.eq(i3).confidence(),
  syllables: (_terms, view, i3) => view.eq(i3).syllables(),
  sentence: (_terms, view, i3) => view.eq(i3).fullSentence().text(),
  dirty: (terms) => terms.some((t) => t.dirty === true)
};
fns4.sentences = fns4.sentence;
fns4.clean = fns4.normal;
fns4.reduced = fns4.root;
var toJSON = function(view, option) {
  option ||= {};
  if (typeof option === "string") {
    option = {};
  }
  option = { ...defaults, ...option };
  if (option.offset) {
    view.compute("offset");
  }
  return view.docs.map((terms, i3) => {
    const res = {};
    Object.keys(option).forEach((k2) => {
      if (option[k2] && fns4[k2]) {
        res[k2] = fns4[k2](terms, view, i3);
      }
    });
    return res;
  });
};
var methods12 = {
  /** return data */
  json: function(n2) {
    const res = toJSON(this, n2);
    if (typeof n2 === "number") {
      return res[n2];
    }
    return res;
  }
};
methods12.data = methods12.json;
var json_default = methods12;

// ../../node_modules/compromise/src/1-one/output/api/debug.js
var debug2 = function(fmt2) {
  const debugMethods = this.methods.one.debug || {};
  if (!fmt2 || !Object.hasOwn(debugMethods, fmt2)) {
    fmt2 = "tags";
  }
  debugMethods[fmt2](this);
  return this;
};
var debug_default2 = debug2;

// ../../node_modules/compromise/src/1-one/output/api/wrap.js
var toText = function(term) {
  const pre = term.pre || "";
  const post = term.post || "";
  return pre + term.text + post;
};
var findStarts = function(doc, obj) {
  const starts = {};
  Object.keys(obj).forEach((reg) => {
    const m3 = doc.match(reg);
    m3.fullPointer.forEach((a) => {
      starts[a[3]] = { fn: obj[reg], end: a[2] };
    });
  });
  return starts;
};
var wrap3 = function(doc, obj) {
  const starts = findStarts(doc, obj);
  let text = "";
  doc.docs.forEach((terms, n2) => {
    for (let i3 = 0; i3 < terms.length; i3 += 1) {
      const t = terms[i3];
      if (Object.hasOwn(starts, t.id)) {
        const { fn, end: end2 } = starts[t.id];
        const m3 = doc.update([[n2, i3, end2]]);
        text += terms[i3].pre || "";
        text += fn(m3);
        i3 = end2 - 1;
        text += terms[i3].post || "";
      } else {
        text += toText(t);
      }
    }
  });
  return text;
};
var wrap_default = wrap3;

// ../../node_modules/compromise/src/1-one/output/api/_spec.js
var attributeTags = /* @__PURE__ */ new Set(["Hyphenated", "Prefix", "SlashedTerm"]);
var rootOf = function(tag, tagSet) {
  const entry = tagSet[tag];
  if (!entry || !entry.parents || entry.parents.length === 0) {
    return tag;
  }
  for (let i3 = 0; i3 < entry.parents.length; i3 += 1) {
    const p4 = entry.parents[i3];
    if (tagSet[p4] && (!tagSet[p4].parents || tagSet[p4].parents.length === 0)) {
      return p4;
    }
  }
  return entry.parents.at(-1);
};
var slotForTerm = function(term, tagSet) {
  const tags = Array.from(term.tags || []);
  if (tags.length === 0) {
    return "-";
  }
  const primary = tags.find((t) => !attributeTags.has(rootOf(t, tagSet))) || tags[0];
  return rootOf(primary, tagSet);
};
var makeAliases = function(tagSet, registered) {
  const aliases4 = /* @__PURE__ */ Object.create(null);
  for (const tag in tagSet) {
    const entry = tagSet[tag];
    const preferred = entry.aliases === void 0 ? entry.alias : entry.aliases[0];
    if (preferred && registered[preferred] === tag) {
      aliases4[tag] = preferred;
    }
  }
  return aliases4;
};
var toSpec = function(doc, world2) {
  const tagSet = world2.model.one.tagSet;
  const aliases4 = makeAliases(tagSet, world2.model.one.tagAliases);
  return doc.docs.map((terms) => {
    const text = rawText(terms);
    const tags = terms.map((t) => {
      const tag = slotForTerm(t, tagSet);
      return aliases4[tag] || tag;
    }).join(",");
    return `${text} {${tags}}`;
  }).join("\n");
};
var spec_default = toSpec;

// ../../node_modules/compromise/src/1-one/output/api/out.js
var topk = function(arr) {
  const counts = /* @__PURE__ */ new Map();
  arr.forEach((word) => {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  });
  const res = Array.from(counts, ([normal, count]) => ({ normal, count }));
  return res.sort((a, b2) => b2.count - a.count);
};
var outputs = {
  // text formats
  text: (view) => view.text(),
  normal: (view) => view.text("normal"),
  root: (view) => view.text("root"),
  machine: (view) => view.text("machine"),
  hash: (view) => hash_default(view.text()),
  // tagged-sentence format for LLMs (see docs/spec-format.md)
  spec: (view) => spec_default(view, view.world),
  // json data formats
  json: (view) => view.json(),
  offset: (view) => {
    view.compute("offset");
    return view.json({ offset: true });
  },
  array: (view) => view.docs.map(rawText).filter((str) => str),
  // return terms sorted by frequency
  freq: (view) => topk(view.json({ normal: true }).map((o) => o.normal)),
  // some handy ad-hoc outputs
  terms: (view) => view.docs.flatMap((terms) => terms.map((t) => t.text).filter(Boolean)),
  tags: (view) => {
    return view.docs.map((terms) => {
      return terms.reduce((h, t) => {
        h[t.implicit || t.normal] = Array.from(t.tags);
        return h;
      }, {});
    });
  },
  "best-tag": (view) => {
    view.compute("tagRank");
    return view.docs.map((ts) => {
      return ts.map((t) => t.tagRank?.[0] ? `#${t.tagRank[0]}` : "").join(" ");
    }).join("\n");
  },
  debug: (view) => view.debug()
  //allow
};
outputs.reduced = outputs.machine;
outputs.md5 = outputs.hash;
outputs.offsets = outputs.offset;
outputs.frequency = outputs.freq;
outputs.topk = outputs.freq;
var out = function(method) {
  if (is_default(method)) {
    return wrap_default(this, method);
  }
  if (Object.hasOwn(outputs, method)) {
    return outputs[method](this);
  }
  return this.text();
};
var methods13 = {
  /** */
  debug: debug_default2,
  /** */
  out,
  /** */
  wrap: function(obj) {
    return wrap_default(this, obj);
  }
};
var out_default = methods13;

// ../../node_modules/compromise/src/1-one/output/api/text.js
var spacedDash = /^\s+[-—]\s+$/;
var text_default = {
  /** */
  text: function(fmt2) {
    let opts2 = {};
    if (fmt2 && typeof fmt2 === "string" && Object.hasOwn(fmts_default, fmt2)) {
      opts2 = { ...fmts_default[fmt2] };
    } else if (fmt2 && is_default(fmt2)) {
      opts2 = { ...fmt2 };
    }
    if (opts2.keepSpace === void 0 && !this.isFull()) {
      opts2.keepSpace = false;
    }
    if (opts2.keepEndPunct === void 0 && this.pointer) {
      const ptr = this.pointer[0];
      const lastTerm = this.docs.at(-1)?.at(-1);
      if (ptr?.[1] || spacedDash.test(lastTerm?.post)) {
        opts2.keepEndPunct = false;
      } else {
        opts2.keepEndPunct = true;
      }
    }
    if (opts2.keepPunct === void 0) {
      opts2.keepPunct = true;
    }
    if (opts2.keepSpace === void 0) {
      opts2.keepSpace = true;
    }
    return textFromDoc(this.docs, opts2);
  }
};

// ../../node_modules/compromise/src/1-one/output/api/index.js
var methods14 = { ...out_default, ...text_default, ...json_default, ...html_default };
var addAPI3 = function(View2) {
  Object.assign(View2.prototype, methods14);
};
var api_default5 = addAPI3;

// ../../node_modules/compromise/src/1-one/output/methods/debug/tags.js
var tagString = function(tags, model5) {
  if (model5.one.tagSet) {
    tags = tags.map((tag) => {
      if (!Object.hasOwn(model5.one.tagSet, tag)) {
        return tag;
      }
      const c = model5.one.tagSet[tag].color || "blue";
      return color_exports[c](tag);
    });
  }
  return tags.join(", ");
};
var showClient = function(view) {
  console.log("%c -=-=- ", "background-color:#6699cc;");
  view.forEach((m3) => {
    console.groupCollapsed(m3.text());
    const out2 = m3.docs[0].map((t) => {
      const text = t.implicit ? "[" + t.implicit + "]" : t.text || "-";
      return { text, tags: "[" + Array.from(t.tags).join(", ") + "]" };
    });
    console.table(out2, ["text", "tags"]);
    console.groupEnd();
  });
};
var showTags = function(view) {
  if (typeof window !== "undefined" && window.document) {
    showClient(view);
    return;
  }
  const { docs, model: model5 } = view;
  if (docs.length === 0) {
    console.log(blue("\n     \u2500\u2500\u2500\u2500\u2500\u2500"));
  }
  docs.forEach((terms) => {
    console.log(blue("\n  \u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    terms.forEach((t) => {
      const tags = [...t.tags || []];
      let text = t.text || "-";
      if (t.sense) {
        text = `{${t.normal}/${t.sense}}`;
      }
      if (t.implicit) {
        text = "[" + t.implicit + "]";
      }
      text = yellow(text);
      let word = "'" + text + "'";
      if (t.frozen === true) {
        word += " \u2744\uFE0F";
      }
      if (t.reference) {
        const str2 = view.update([t.reference]).text("normal");
        word += ` - ${dim(i("[" + str2 + "]"))}`;
      }
      word = word.padEnd(18);
      const str = blue("  \u2502 ") + i(word) + "  - " + tagString(tags, model5);
      console.log(str);
    });
  });
  console.log("\n");
};
var tags_default = showTags;

// ../../node_modules/compromise/src/1-one/output/methods/debug/chunks.js
var colors = { Noun: blue, Verb: green, Adjective: yellow, Pivot: red };
var showChunks = (view) => {
  console.log("");
  view.docs.forEach((terms) => {
    const out2 = terms.map((term) => {
      const text = term.implicit || term.normal;
      if (Object.hasOwn(colors, term.chunk)) {
        return colors[term.chunk](text);
      }
      return text;
    });
    console.log(out2.join(" "), "\n");
  });
  console.log("\n");
};
var chunks_default = showChunks;

// ../../node_modules/compromise/src/1-one/output/methods/debug/highlight.js
var width = 55;
var half = 27;
var dots = "\u2026";
var fit = (arr, max3, fromStart) => {
  let cut = false;
  const size = () => (fromStart ? arr.join("").trimStart() : arr.join("").trimEnd()).length + (cut ? 2 : 0);
  while (arr.length > 0 && size() > max3) {
    if (fromStart) {
      arr.shift();
    } else {
      arr.pop();
    }
    cut = true;
  }
  return cut;
};
var parts = (terms, start2, end2) => {
  const arrs = [[], [], []];
  terms.forEach((t, i3) => {
    const str = (t.pre + t.text + t.post).replace(/\s+/g, " ");
    const arr = arrs[(i3 >= start2 ? 1 : 0) + (i3 >= end2 ? 1 : 0)];
    if (str.trim() === "" && arr.length > 0) {
      arr[arr.length - 1] = (arr.at(-1) + str).replace(/\s+/g, " ");
    } else {
      arr.push(str);
    }
  });
  const [before2, match2, after] = arrs;
  const left = (fit(before2, half, true) ? dots + " " : "") + before2.join("").trimStart();
  let mid = match2.join("");
  const cutR = fit(after, width - half - mid.length, false);
  const right = after.join("").trimEnd() + (cutR ? " " + dots : "");
  if (right === "") {
    mid = mid.trimEnd();
  }
  return [" ".repeat(Math.max(0, half - left.length)) + left, mid, right];
};
var showHighlight = function(view) {
  const client = typeof window !== "undefined" && window.document;
  view.fullPointer.forEach(([n2, s, e]) => {
    const [left, mid, right] = parts(view.document[n2], s, e);
    if (client) {
      console.log("%c" + left + "%c" + mid + "%c" + right, "color:grey", "color:green", "color:grey");
    } else {
      console.log(grey(left) + green(mid) + (right ? grey(right) : ""));
    }
  });
};
var highlight_default = showHighlight;

// ../../node_modules/compromise/src/1-one/output/methods/debug/index.js
var debug3 = {
  tags: tags_default,
  chunks: chunks_default,
  highlight: highlight_default
};
var debug_default3 = debug3;

// ../../node_modules/compromise/src/1-one/output/_spec-failures.js
var specFailures = (doc, slots, patterns, aliases4) => {
  const terms = doc.docs.flat();
  const failures = [];
  if (terms.length !== slots.length) {
    failures.push({
      code: "length",
      expected: slots.length,
      actual: terms.length,
      message: `expected ${slots.length} terms, got ${terms.length}`
    });
  }
  doc.compute("tagRank");
  slots.forEach((slot, i3) => {
    const term = terms[i3];
    const actual = term ? Array.from(term.tags) : [];
    const detail = { term: i3 + 1, word: term?.implicit || term?.text || "", expected: slot, actual };
    if (patterns[i3] === null) {
      failures.push({ ...detail, code: "syntax", message: `term ${i3 + 1}: invalid slot ${slot.join("|")}` });
      return;
    }
    if (!term) {
      return;
    }
    const problems = [];
    slot.forEach((value) => {
      if (value === ".") {
        return;
      }
      const negative = value.startsWith("!");
      const tag = value.replace(/^!?#?/, "");
      const present = term.tags.has(aliases4[tag] || tag);
      if (negative && present) {
        problems.push(`unexpected #${tag}`);
      } else if (!negative && !present) {
        problems.push(`missing #${tag}`);
      }
    });
    if (problems.length > 0) {
      const best = term.tagRank?.[0] || actual.at(-1) || "Untagged";
      failures.push({
        ...detail,
        code: "tags",
        message: `term ${i3 + 1} '${detail.word}': #${best}, ${problems.join(", ")}`
      });
    }
  });
  if (failures.length === 0) {
    failures.push({ code: "match", message: "tags align, but the sentence pattern did not match" });
  }
  return failures;
};
var spec_failures_default = specFailures;

// ../../node_modules/compromise/src/1-one/output/_spec-log.js
var logSpec = (doc, slots, failures, aliases4) => {
  const terms = doc.docs.flat();
  const wrong = new Set(failures.filter((failure) => failure.term).map((failure) => failure.term - 1));
  const invalid2 = new Set(failures.filter((failure) => failure.code === "syntax").map((failure) => failure.term - 1));
  const unmatched = failures.some((failure) => failure.code === "match");
  let visible = 0;
  terms.forEach((term, i3) => {
    if (term.text) {
      visible = i3;
    }
    if (wrong.has(i3) || i3 >= slots.length || unmatched) {
      wrong.add(visible);
    }
  });
  const text = terms.map((term, i3) => {
    const word = wrong.has(i3) && term.text ? red(term.text) : term.text;
    return term.pre + word + term.post;
  }).join("").trim();
  const tags = slots.map((slot, i3) => {
    const term = terms[i3];
    if (!term || invalid2.has(i3) || unmatched) {
      return red(slot.join("|"));
    }
    return slot.map((value) => {
      if (value === ".") {
        return value;
      }
      const negative = value.startsWith("!");
      const tag = value.replace(/^!?#?/, "");
      const present = term.tags.has(aliases4[tag] || tag);
      return present === negative ? red(value) : value;
    }).join("|");
  }).join(",");
  const block = slots.length === 0 ? red("{}") : `{${tags}}`;
  return `${text} ${block}`;
};
var logLine = (text, tags, detail) => {
  const block = tags === null ? "" : ` {${tags.map((slot) => slot.join("|")).join(",")}}`;
  if (detail) {
    return `${red("\u2717")} ${text}${dim(block)} - ${red(detail)}`;
  }
  return `${green("\u2713")} ${green(dim(text))}${dim(block)}`;
};

// ../../node_modules/compromise/src/1-one/output/_spec-lib.js
var lastBrace = /\{(?=[^{]*$)/;
var comment = /\}[ \t]*#.*$/s;
var parseLine = function(line = "") {
  let [text, tags] = line.split(lastBrace);
  if (tags === void 0) {
    return { text: text.replace(/\s#.*$/s, "").trimEnd(), tags: null };
  }
  tags = tags.replace(comment, "}");
  tags = tags.split(",").map((tag) => tag.trim());
  const lastTag = tags[tags.length - 1];
  tags[tags.length - 1] = lastTag.replace(/\}$/, "");
  tags = tags.map((tag) => tag.split("|").map((t) => t.trim()));
  if (tags.length === 1 && tags[0].length === 1 && tags[0][0] === "") {
    tags = [];
  }
  return { text, tags };
};
var toMatchString = function(tags, aliases4) {
  if (tags.some((slot) => slot.some((tag) => tag !== "." && !/^!?#?[a-z][a-z0-9]*$/i.test(tag)))) {
    return null;
  }
  return tags.map((arr) => {
    arr = arr.map((str) => {
      if (str === ".") {
        return ".";
      }
      const negative = str.startsWith("!");
      const tag = str.replace(/^!?#?/, "");
      const prefix6 = negative ? "!#" : "#";
      return prefix6 + (aliases4[tag] || tag);
    });
    if (arr.length > 1) {
      return `(${arr.join(" && ")})`;
    }
    return arr[0];
  }).join(" ");
};
var applyTags = (doc, slots, aliases4) => {
  const terms = doc.terms();
  doc.docs.flat().forEach((term) => term.tags.clear());
  slots?.forEach((slot, i3) => {
    const tags = slot.filter((tag) => tag !== "." && !tag.startsWith("!")).map((tag) => {
      tag = tag.replace(/^#/, "");
      return aliases4[tag] || tag;
    });
    terms.eq(i3).tag(tags, "fromSpec");
  });
};

// ../../node_modules/compromise/src/1-one/output/fromSpec.js
var fromSpec = function(spec, { tags: tagMode = "ignore", failures: failureMode = "ignore", verbose: verbose2 = false } = {}) {
  if (!["ignore", "use"].includes(tagMode) || !["ignore", "throw", "retain", "log"].includes(failureMode)) {
    throw new Error("Invalid fromSpec options");
  }
  const aliases4 = this.world().model.one.tagAliases;
  const result = this("");
  result.failures = [];
  spec.split("\n").forEach((line, index3) => {
    if (!line.trim() || /^\s*#/.test(line)) {
      return;
    }
    const { text, tags } = parseLine(line);
    const doc = tagMode === "use" ? this.tokenize(text) : this(text);
    let failures = [];
    if (tags !== null && (tagMode === "use" || failureMode !== "ignore")) {
      const count = doc.docs.reduce((sum2, terms) => sum2 + terms.length, 0);
      const patterns = tags.map((slot) => toMatchString([slot], aliases4));
      const pattern = toMatchString(tags, aliases4);
      const canApply = count === tags.length && pattern !== null;
      if (tagMode === "use" && !canApply && failureMode !== "log") {
        const invalid2 = spec_failures_default(doc, tags, patterns, aliases4);
        throw new Error(`${text.trim()} - ${invalid2.map((failure) => failure.message).join("; ")}`);
      }
      if (tagMode === "use") {
        applyTags(doc, canApply ? tags : null, aliases4);
      }
      if (failureMode !== "ignore" && (count !== tags.length || pattern === null || !doc.has(pattern))) {
        failures = spec_failures_default(doc, tags, patterns, aliases4).map((failure) => ({ line: index3 + 1, text: text.trim(), ...failure }));
        result.failures.push(...failures);
      }
    } else if (tagMode === "use") {
      applyTags(doc, null, aliases4);
    }
    const detail = failures.map((failure) => failure.message).join("; ");
    if (failureMode === "log" && failures.length > 0) {
      console.error(logSpec(doc, tags, failures, aliases4));
    } else if (verbose2 || debug_default.spec) {
      console.log(logLine(text, tags, detail));
    }
    if (failures.length > 0 && failureMode === "throw") {
      throw new Error(`${text.trim()} - ${detail}`);
    }
    if (failureMode === "retain" && tags !== null && failures.length === 0) {
      return;
    }
    if (doc.found) {
      const previous = result.document.at(-1)?.at(-1);
      if (previous) {
        previous.post += "\n";
      }
      result.document.push(...doc.docs);
    }
  });
  return result;
};
var testSpec = function(spec, verbose2 = true, throwError = false) {
  const result = this.fromSpec(spec, { tags: "ignore", failures: "retain", verbose: verbose2 });
  if (throwError && result.failures.length > 0) {
    const failure = result.failures[0];
    throw new Error(`${failure.text} - ${failure.message}`);
  }
  return result;
};

// ../../node_modules/compromise/src/1-one/output/plugin.js
var plugin_default8 = {
  lib: {
    fromSpec,
    testSpec
  },
  api: api_default5,
  methods: {
    one: {
      hash: hash_default,
      debug: debug_default3
    }
  }
};

// ../../node_modules/compromise/src/1-one/pointers/api/lib/split.js
var pivotBy = function(full, m3) {
  const [n2, start2] = full;
  const mStart = m3[1];
  const mEnd = m3[2];
  const res = {};
  if (start2 < mStart) {
    const end2 = mStart < full[2] ? mStart : full[2];
    res.before = [n2, start2, end2];
  }
  res.match = m3;
  if (full[2] > mEnd) {
    res.after = [n2, mEnd, full[2]];
  }
  return res;
};
var doesMatch2 = function(full, m3) {
  return full[1] <= m3[1] && m3[2] <= full[2];
};
var splitAll = function(full, m3) {
  const byN = indexN(m3);
  const res = [];
  full.forEach((ptr) => {
    const [n2] = ptr;
    let matches3 = byN[n2] || [];
    matches3 = matches3.filter((p4) => doesMatch2(ptr, p4));
    if (matches3.length === 0) {
      res.push({ passthrough: ptr });
      return;
    }
    matches3 = matches3.sort((a, b2) => a[1] - b2[1]);
    let carry = ptr;
    matches3.forEach((p4, i3) => {
      const found = pivotBy(carry, p4);
      if (!matches3[i3 + 1]) {
        res.push(found);
      } else {
        res.push({ before: found.before, match: found.match });
        if (found.after) {
          carry = found.after;
        }
      }
    });
  });
  return res;
};
var split_default2 = splitAll;

// ../../node_modules/compromise/src/1-one/pointers/methods/getDoc.js
var max = 20;
var blindSweep = function(id, doc, n2) {
  for (let i3 = 0; i3 < max; i3 += 1) {
    for (const k2 of [n2 - i3, n2 + i3]) {
      if (doc[k2]) {
        const index3 = doc[k2].findIndex((term) => term.id === id);
        if (index3 !== -1) {
          return [k2, index3];
        }
      }
    }
  }
  return null;
};
var repairEnding = function(ptr, document) {
  const [n2, start2, , , endId] = ptr;
  const terms = document[n2];
  const newEnd = terms.findIndex((t) => t.id === endId);
  if (newEnd === -1) {
    ptr[2] = document[n2].length;
    ptr[4] = terms.length > 0 ? terms[terms.length - 1].id : null;
  } else {
    ptr[2] = newEnd + 1;
  }
  return document[n2].slice(start2, ptr[2]);
};
var getDoc2 = function(ptrs, document) {
  let doc = [];
  ptrs.forEach((ptr, i3) => {
    if (!ptr) {
      return;
    }
    let [n2, start2, end2, id, endId] = ptr;
    let terms = document[n2] || [];
    if (start2 === void 0) {
      start2 = 0;
    }
    if (end2 === void 0) {
      end2 = terms.length;
    }
    if (id && (!terms[start2] || terms[start2].id !== id)) {
      const wild = blindSweep(id, document, n2);
      if (wild !== null) {
        const len = end2 - start2;
        terms = document[wild[0]].slice(wild[1], wild[1] + len);
        const startId = terms[0] ? terms[0].id : null;
        endId = document[wild[0]].some((term) => term.id === endId) ? endId : void 0;
        ptr = [wild[0], wild[1], wild[1] + len, startId, endId];
        ptrs[i3] = ptr;
      } else {
        terms = terms.slice(start2, end2);
        ptr[3] = terms[0] ? terms[0].id : null;
      }
    } else {
      terms = terms.slice(start2, end2);
    }
    if (terms.length === 0) {
      return;
    }
    if (start2 === end2) {
      return;
    }
    if (endId && terms[terms.length - 1].id !== endId) {
      terms = repairEnding(ptr, document);
    }
    doc.push(terms);
  });
  doc = doc.filter((a) => a.length > 0);
  return doc;
};
var getDoc_default = getDoc2;

// ../../node_modules/compromise/src/1-one/pointers/methods/index.js
var termList = (docs) => docs.flat();
var methods_default5 = {
  one: {
    termList,
    getDoc: getDoc_default,
    pointer: {
      indexN,
      splitAll: split_default2
    }
  }
};

// ../../node_modules/compromise/src/1-one/pointers/api/lib/union.js
var getUnion = function(a, b2) {
  const both = a.concat(b2);
  const byN = indexN(both);
  let res = [];
  both.forEach((ptr) => {
    const [n2] = ptr;
    if (byN[n2].length === 1) {
      res.push(ptr);
      return;
    }
    const hmm = byN[n2].filter((m3) => doesOverlap(ptr, m3));
    hmm.push(ptr);
    const range = getExtent(hmm);
    res.push(range);
  });
  res = uniquePtrs(res);
  return res;
};
var union_default = getUnion;

// ../../node_modules/compromise/src/1-one/pointers/api/lib/difference.js
var subtract = function(refs, not) {
  const res = [];
  const found = split_default2(refs, not);
  found.forEach((o) => {
    if (o.passthrough) {
      res.push(o.passthrough);
    }
    if (o.before) {
      res.push(o.before);
    }
    if (o.after) {
      res.push(o.after);
    }
  });
  return res;
};
var difference_default = subtract;

// ../../node_modules/compromise/src/1-one/pointers/api/lib/intersection.js
var intersection = function(a, b2) {
  const start2 = a[1] < b2[1] ? b2[1] : a[1];
  const end2 = a[2] > b2[2] ? b2[2] : a[2];
  if (start2 < end2) {
    return [a[0], start2, end2];
  }
  return null;
};
var getIntersection = function(a, b2) {
  const byN = indexN(b2);
  const res = [];
  a.forEach((ptr) => {
    let hmm = byN[ptr[0]] || [];
    hmm = hmm.filter((p4) => doesOverlap(ptr, p4));
    if (hmm.length === 0) {
      return;
    }
    hmm.forEach((h) => {
      const overlap = intersection(ptr, h);
      if (overlap) {
        res.push(overlap);
      }
    });
  });
  return res;
};
var intersection_default = getIntersection;

// ../../node_modules/compromise/src/1-one/pointers/api/index.js
var addIds3 = function(ptrs, docs) {
  return ptrs.map((ptr) => {
    const [n2, start2] = ptr;
    if (docs[n2] && docs[n2][start2]) {
      ptr[3] = docs[n2][start2].id;
    }
    return ptr;
  });
};
var toView = (view, ptrs) => view.toView(addIds3(ptrs, view.document));
var setOp = (fn) => function(m3) {
  m3 = getDoc(m3, this);
  return toView(this, fn(this.fullPointer, m3.fullPointer));
};
var methods15 = {};
methods15.union = setOp(union_default);
methods15.and = methods15.union;
methods15.intersection = setOp(intersection_default);
methods15.not = setOp(difference_default);
methods15.difference = methods15.not;
methods15.complement = function() {
  return toView(this, difference_default(this.all().fullPointer, this.fullPointer));
};
methods15.settle = function() {
  let ptrs = this.fullPointer;
  ptrs.forEach((ptr) => {
    ptrs = union_default(ptrs, [ptr]);
  });
  ptrs = addIds3(ptrs, this.document);
  return this.update(ptrs);
};
var addAPI4 = function(View2) {
  Object.assign(View2.prototype, methods15);
};
var api_default6 = addAPI4;

// ../../node_modules/compromise/src/1-one/pointers/plugin.js
var plugin_default9 = {
  methods: methods_default5,
  api: api_default6
};

// ../../node_modules/compromise/src/1-one/sweep/lib.js
var lib_default4 = {
  // compile a list of matches into a match-net
  buildNet: function(matches3) {
    const methods20 = this.methods();
    const net3 = methods20.one.buildNet(matches3, this.world());
    net3.isNet = true;
    return net3;
  }
};

// ../../node_modules/compromise/src/1-one/sweep/api.js
var api = function(View2) {
  View2.prototype.sweep = function(net3, opts2 = {}) {
    const { world: world2, docs } = this;
    const { methods: methods20 } = world2;
    let found = methods20.one.bulkMatch(docs, net3, this.methods, opts2);
    if (opts2.tagger !== false) {
      methods20.one.bulkTagger(found, docs, this.world);
    }
    found = found.map((o) => {
      const ptr = o.pointer;
      const term = docs[ptr[0]][ptr[1]];
      const len = ptr[2] - ptr[1];
      if (term.index) {
        o.pointer = [
          term.index[0],
          term.index[1],
          ptr[1] + len
        ];
      }
      return o;
    });
    const ptrs = found.map((o) => o.pointer);
    found = found.map((obj) => {
      obj.view = this.update([obj.pointer]);
      delete obj.regs;
      delete obj.needs;
      delete obj.pointer;
      delete obj._expanded;
      return obj;
    });
    return {
      view: this.update(ptrs),
      found
    };
  };
};
var api_default7 = api;

// ../../node_modules/compromise/src/1-one/tag/methods/_lib.js
var sets = /* @__PURE__ */ new WeakMap();
var empty = /* @__PURE__ */ new Set();
var getTagSet = (tags) => {
  if (!tags || tags.length === 0) {
    return empty;
  }
  let set = sets.get(tags);
  if (!set) {
    set = new Set(tags);
    sets.set(tags, set);
  }
  return set;
};
var resolveTag = (tag, aliases4) => {
  tag = tag.replace(/^#/, "");
  return aliases4?.[tag] || tag;
};
var lib_default5 = getTagSet;

// ../../node_modules/compromise/src/1-one/sweep/methods/buildNet/aliases.js
var resolveAliases = (rule, aliases4) => {
  const tag = (value) => {
    if (Array.isArray(value)) {
      return value.map(tag);
    }
    if (typeof value !== "string") {
      return value;
    }
    return value.trim().split(/ +/).map((name) => resolveTag(name, aliases4)).join(" ");
  };
  const hook = (value) => {
    if (typeof value === "string" && value.startsWith("#")) {
      return "#" + tag(value);
    }
    return value;
  };
  if (rule.tag !== void 0) {
    rule.tag = tag(rule.tag);
  }
  if (rule.unTag !== void 0) {
    rule.unTag = tag(rule.unTag);
  }
  if (rule.hook !== void 0) {
    rule.hook = hook(rule.hook);
  }
  if (rule.ifNo !== void 0) {
    rule.ifNo = [rule.ifNo].flat().map(hook);
  }
};
var aliases_default = resolveAliases;

// ../../node_modules/compromise/src/1-one/sweep/methods/buildNet/_lib.js
var canCheck = (reg) => Boolean(reg && !reg.optional && !reg.negative && !reg.greedy && !reg.choices && !reg.anything && !reg.regex && !reg.method);
var getBoundary = (reg, boundary2) => {
  if (!canCheck(reg) || !reg[boundary2]) {
    return null;
  }
  return reg;
};

// ../../node_modules/compromise/src/1-one/sweep/methods/buildNet/01-parse.js
var getTokenNeeds = function(reg) {
  if (reg.optional === true || reg.negative === true) {
    return null;
  }
  if (reg.tag) {
    return "#" + reg.tag;
  }
  if (reg.word) {
    return reg.word;
  }
  if (reg.switch) {
    return `%${reg.switch}%`;
  }
  return null;
};
var hasRequiredHook = function(regs, hook) {
  return regs.some((reg) => {
    if (reg.optional || reg.negative) {
      return false;
    }
    if (getTokenNeeds(reg) === hook) {
      return true;
    }
    return reg.operator === "and" && reg.choices && reg.choices.some((side2) => hasRequiredHook(side2, hook));
  });
};
var getNeeds = function(regs) {
  const needs = [];
  regs.forEach((reg) => {
    needs.push(getTokenNeeds(reg));
    if (reg.operator === "and" && reg.choices && !reg.optional && !reg.negative) {
      reg.choices.forEach((oneSide) => {
        oneSide.forEach((r) => {
          needs.push(getTokenNeeds(r));
        });
      });
    }
  });
  return needs.filter((str) => str);
};
var getWants = function(regs) {
  const wants = [];
  let count = 0;
  regs.forEach((reg) => {
    if (reg.operator === "or" && !reg.optional && !reg.negative) {
      if (reg.fastOr) {
        Array.from(reg.fastOr).forEach((w) => {
          wants.push(w);
        });
      }
      if (reg.choices) {
        reg.choices.forEach((rs) => {
          rs.forEach((r) => {
            const n2 = getTokenNeeds(r);
            if (n2) {
              wants.push(n2);
            }
          });
        });
      }
      count += 1;
    }
  });
  return { wants, count };
};
var parse2 = function(matches3, world2) {
  const parseMatch = world2.methods.one.parseMatch;
  matches3.forEach((obj) => {
    aliases_default(obj, world2.model.one.tagAliases);
    obj.regs = parseMatch(obj.match, {}, world2);
    obj.fixed = isFixed(obj.regs);
    obj.checkFirst = canCheck(obj.regs[0]);
    obj.startTerm = getBoundary(obj.regs[0], "start");
    obj.endTerm = getBoundary(obj.regs[obj.regs.length - 1], "end");
    if (obj.notIf) {
      obj.notIf = parseMatch(obj.notIf, {}, world2);
    }
    obj.needs = getNeeds(obj.regs);
    if (obj.hook !== void 0) {
      if (typeof obj.hook !== "string" || !obj.needs.includes(obj.hook) || !hasRequiredHook(obj.regs, obj.hook)) {
        throw new Error(`Invalid hook "${obj.hook}" for match "${obj.match}": use a required word, #Tag, or %Switch%.`);
      }
    }
    const { wants, count } = getWants(obj.regs);
    obj.wants = wants;
    obj.minWant = count;
    obj.minWords = obj.regs.filter((o) => !o.optional).length;
    obj.minLength = getMinLength(obj.regs);
  });
  return matches3;
};
var parse_default = parse2;

// ../../node_modules/compromise/src/1-one/sweep/methods/buildNet/02-index.js
var buildIndex = function(matches3, hooks2, hookOrder) {
  const index3 = /* @__PURE__ */ Object.create(null);
  const seen = /* @__PURE__ */ new Set();
  const lastRank = Object.keys(hooks2).length;
  matches3.forEach((rule, order) => {
    if (seen.has(rule)) {
      return;
    }
    seen.add(rule);
    let anchor = null;
    let rank2 = lastRank;
    for (let i3 = 0; i3 < rule.needs.length; i3 += 1) {
      const key = rule.needs[i3];
      if (anchor === null || hooks2[key].length < hooks2[anchor].length) {
        anchor = key;
      }
      rank2 = Math.min(rank2, hookOrder[key]);
    }
    if (rule.hook !== void 0) {
      anchor = rule.hook;
    }
    const earlier = [...new Set(rule.wants)].filter((key) => hookOrder[key] < rank2).sort((a, b2) => hookOrder[a] - hookOrder[b2]);
    const keys3 = anchor === null ? [...new Set(rule.wants)] : [anchor];
    const needs = [...new Set(rule.needs)].filter((key) => key !== anchor);
    const entry = { rule, order, rank: rank2, earlier, needs, single: keys3.length === 1 };
    for (let i3 = 0; i3 < keys3.length; i3 += 1) {
      const key = keys3[i3];
      index3[key] ||= [];
      index3[key].push(entry);
    }
  });
  return index3;
};
var index_default = buildIndex;

// ../../node_modules/compromise/src/1-one/sweep/methods/buildNet/index.js
var buildNet = function(matches3, world2) {
  matches3 = parse_default(matches3, world2);
  const hooks2 = {};
  matches3.forEach((obj) => {
    obj.needs.concat(obj.wants).forEach((str) => {
      hooks2[str] = Array.isArray(hooks2[str]) ? hooks2[str] : [];
      hooks2[str].push(obj);
    });
  });
  const hookOrder = /* @__PURE__ */ Object.create(null);
  Object.keys(hooks2).forEach((k2, i3) => {
    hookOrder[k2] = i3;
    const already = /* @__PURE__ */ new Set();
    hooks2[k2] = hooks2[k2].filter((obj) => {
      if (already.has(obj)) {
        return false;
      }
      already.add(obj);
      return true;
    });
  });
  const always = matches3.filter((o) => o.needs.length === 0 && o.wants.length === 0);
  return {
    hooks: hooks2,
    hookOrder,
    index: index_default(matches3, hooks2, hookOrder),
    always
  };
};
var buildNet_default = buildNet;

// ../../node_modules/compromise/src/1-one/sweep/methods/sweep/_lib.js
var canMatch = (obj, haves, terms, needs = obj.needs) => {
  const termCount = terms.length;
  if (!(termCount >= obj.minWords)) {
    return false;
  }
  for (let j = 0; j < needs.length; j += 1) {
    if (!haves.has(needs[j])) {
      return false;
    }
  }
  if (obj.ifNo !== void 0) {
    for (let j = 0; j < obj.ifNo.length; j += 1) {
      if (haves.has(obj.ifNo[j])) {
        return false;
      }
    }
  }
  if (obj.wants.length > 0) {
    let count = 0;
    for (let j = 0; j < obj.wants.length; j += 1) {
      if (haves.has(obj.wants[j])) {
        count += 1;
        if (count >= obj.minWant) {
          break;
        }
      }
    }
    if (!(count >= obj.minWant)) {
      return false;
    }
  }
  if (termCount && obj.startTerm && !doesMatch_default(terms[0], obj.startTerm, 0, termCount)) {
    return false;
  }
  if (termCount && obj.endTerm && !doesMatch_default(terms[termCount - 1], obj.endTerm, termCount - 1, termCount)) {
    return false;
  }
  return true;
};
var lib_default6 = canMatch;

// ../../node_modules/compromise/src/1-one/sweep/methods/sweep/01-getHooks.js
var getIndexed = function(set, index3, hookOrder, terms) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  set.forEach((key) => {
    const bucket = index3[key];
    if (!Array.isArray(bucket)) {
      return;
    }
    for (let i3 = 0; i3 < bucket.length; i3 += 1) {
      const entry = bucket[i3];
      if (entry.single !== true) {
        if (seen.has(entry)) {
          continue;
        }
        seen.add(entry);
      }
      if (!lib_default6(entry.rule, set, terms, entry.needs)) {
        continue;
      }
      let rank2 = entry.rank;
      for (let j = 0; j < entry.earlier.length; j += 1) {
        const earlier = entry.earlier[j];
        if (set.has(earlier)) {
          rank2 = hookOrder[earlier];
          break;
        }
      }
      if (rank2 === entry.rank) {
        found.push(entry);
      } else {
        found.push({ rule: entry.rule, rank: rank2, order: entry.order });
      }
    }
  });
  found.sort((a, b2) => a.rank - b2.rank || a.order - b2.order);
  return found.map((entry) => entry.rule);
};
var getHooks = function(docCaches, net3, document) {
  const { hooks: hooks2, index: index3, always } = net3;
  let { hookOrder } = net3;
  if (!hookOrder) {
    hookOrder = /* @__PURE__ */ Object.create(null);
    Object.keys(hooks2).forEach((k2, i3) => {
      hookOrder[k2] = i3;
    });
  }
  const lists = docCaches.map((set, n2) => {
    if (index3) {
      return getIndexed(set, index3, hookOrder, document[n2]);
    }
    const keys3 = [];
    set.forEach((k2) => {
      if (typeof hookOrder[k2] === "number") {
        keys3.push(k2);
      }
    });
    keys3.sort((a, b2) => hookOrder[a] - hookOrder[b2]);
    const maybe = [];
    const already = /* @__PURE__ */ new Set();
    for (let i3 = 0; i3 < keys3.length; i3 += 1) {
      const bucket = hooks2[keys3[i3]];
      for (let j = 0; j < bucket.length; j += 1) {
        const m3 = bucket[j];
        if (!already.has(m3)) {
          already.add(m3);
          if (lib_default6(m3, set, document[n2])) {
            maybe.push(m3);
          }
        }
      }
    }
    return maybe;
  });
  lists.forEach((list5, n2) => {
    for (let i3 = 0; i3 < always.length; i3 += 1) {
      if (lib_default6(always[i3], docCaches[n2], document[n2])) {
        list5.push(always[i3]);
      }
    }
  });
  return lists;
};
var getHooks_default = getHooks;

// ../../node_modules/compromise/src/1-one/sweep/methods/sweep/04-runMatch.js
var runMatch2 = function(maybeList, document, methods20, opts2) {
  const results = [];
  for (let n2 = 0; n2 < maybeList.length; n2 += 1) {
    const sentence = [document[n2]];
    for (let i3 = 0; i3 < maybeList[n2].length; i3 += 1) {
      const m3 = maybeList[n2][i3];
      const res = methods20.one.match(sentence, m3);
      if (res.ptrs.length > 0) {
        res.ptrs.forEach((ptr) => {
          ptr[0] = n2;
          results.push({ ...m3, pointer: ptr });
        });
        if (opts2.matchOne === true) {
          return [results[0]];
        }
      }
    }
  }
  return results;
};
var runMatch_default = runMatch2;

// ../../node_modules/compromise/src/1-one/sweep/methods/sweep/index.js
var sweep = function(document, net3, methods20, opts2 = {}) {
  const docCache = methods20.one.cacheDoc(document);
  const maybeList = getHooks_default(docCache, net3, document);
  const results = runMatch_default(maybeList, document, methods20, opts2);
  return results;
};
var sweep_default = sweep;

// ../../node_modules/compromise/src/1-one/tag/methods/canBe.js
var canBe = function(term, tag, tagSet) {
  if (!Object.hasOwn(tagSet, tag)) {
    return true;
  }
  const conflicts = lib_default5(tagSet[tag].not);
  if (conflicts.size === 0) {
    return true;
  }
  for (const existing of term.tags) {
    if (conflicts.has(existing)) {
      return false;
    }
  }
  return true;
};
var canBe_default = canBe;

// ../../node_modules/compromise/src/1-one/sweep/methods/tagger/canBe.js
var canBe2 = (terms, tag, model5) => terms.every((term) => canBe_default(term, tag, model5.one.tagSet));
var canBe_default2 = canBe2;

// ../../node_modules/compromise/src/1-one/sweep/methods/tagger/index.js
var tagger = function(list5, document, world2) {
  const { model: model5, methods: methods20 } = world2;
  const { getDoc: getDoc3, setTag: setTag3, unTag: unTag2 } = methods20.one;
  const looksPlural2 = methods20.two.looksPlural;
  if (list5.length === 0) {
    return list5;
  }
  return list5.map((todo) => {
    if (!todo.tag && !todo.chunk && !todo.unTag) {
      return;
    }
    const reason13 = todo.reason || todo.match;
    const terms = getDoc3([todo.pointer], document)[0];
    let validated;
    if (todo.safe === true) {
      if (canBe_default2(terms, todo.tag, model5) === false) {
        return;
      }
      if (terms[terms.length - 1].post === "-") {
        return;
      }
      if (typeof todo.tag === "string" && Object.hasOwn(model5.one.tagSet, todo.tag)) {
        validated = model5.one.tagSet[todo.tag];
      }
    }
    if (todo.tag !== void 0) {
      setTag3(terms, todo.tag, world2, todo.safe, `[post] '${reason13}'`, validated);
      if (todo.tag === "Noun" && looksPlural2) {
        const term = terms[terms.length - 1];
        if (looksPlural2(term.text)) {
          setTag3([term], "Plural", world2, todo.safe, "quick-plural");
        } else {
          setTag3([term], "Singular", world2, todo.safe, "quick-singular");
        }
      }
      if (todo.freeze === true) {
        terms.forEach((term) => term.frozen = true);
      }
    }
    if (todo.unTag !== void 0) {
      unTag2(terms, todo.unTag, model5.one.tagSet, reason13);
    }
    if (todo.chunk) {
      terms.forEach((t) => t.chunk = todo.chunk);
    }
  });
};
var tagger_default = tagger;

// ../../node_modules/compromise/src/1-one/sweep/methods/index.js
var methods_default6 = {
  buildNet: buildNet_default,
  bulkMatch: sweep_default,
  bulkTagger: tagger_default
};

// ../../node_modules/compromise/src/1-one/sweep/plugin.js
var plugin_default10 = {
  lib: lib_default4,
  api: api_default7,
  methods: {
    one: methods_default6
  }
};

// ../../node_modules/compromise/src/1-one/tag/methods/setTag.js
var isMulti = / /;
var addChunk = function(term, tag) {
  if (tag === "Noun" || tag === "Verb") {
    term.chunk = tag;
  }
};
var tagTerm = function(term, tag, tagSet, isSafe, validated, reason13) {
  if (term.tags.has(tag)) {
    return null;
  }
  if (tag === ".") {
    return null;
  }
  if (term.frozen === true) {
    isSafe = true;
  }
  const previous = debug_default.tags ? debug_default.before(term) : null;
  const known = tagSet[tag];
  if (known) {
    if (known !== validated && known.not && known.not.length > 0) {
      const conflicts = lib_default5(known.not);
      for (const existing of term.tags) {
        if (conflicts.has(existing)) {
          if (isSafe === true) {
            return null;
          }
          term.tags.delete(existing);
        }
      }
    }
    if (known.parents && known.parents.length > 0) {
      for (let o = 0; o < known.parents.length; o += 1) {
        term.tags.add(known.parents[o]);
        addChunk(term, known.parents[o]);
      }
    }
  }
  term.tags.add(tag);
  term.dirty = true;
  addChunk(term, tag);
  if (previous) {
    debug_default.log(term, previous, reason13);
  }
  return true;
};
var multiTag = function(terms, tagString2, tagSet, aliases4, isSafe, reason13) {
  const tags = tagString2.split(isMulti);
  terms.forEach((term, i3) => {
    const tag = tags[i3];
    if (tag) {
      tagTerm(term, resolveTag(tag, aliases4), tagSet, isSafe, void 0, reason13);
    }
  });
};
var setTag = function(terms, tag, world2 = {}, isSafe, reason13, validated) {
  const tagSet = world2.model.one.tagSet || {};
  if (!tag) {
    return;
  }
  if (Array.isArray(tag)) {
    tag.forEach((tg) => setTag(terms, tg, world2, isSafe, reason13));
    return;
  }
  if (typeof tag !== "string") {
    console.warn(`compromise: Invalid tag '${tag}'`);
    return;
  }
  tag = tag.trim();
  if (isMulti.test(tag)) {
    multiTag(terms, tag, tagSet, world2.model.one.tagAliases, isSafe, reason13);
    return;
  }
  tag = resolveTag(tag, world2.model.one.tagAliases);
  for (let i3 = 0; i3 < terms.length; i3 += 1) {
    tagTerm(terms[i3], tag, tagSet, isSafe, validated, reason13);
  }
};
var setTag_default = setTag;

// ../../node_modules/compromise/src/1-one/tag/methods/unTag.js
var unTag = function(terms, tag, tagSet, reason13 = "untag") {
  tag = tag.trim().replace(/^#/, "");
  const children = lib_default5(tagSet[tag]?.children);
  for (let i3 = 0; i3 < terms.length; i3 += 1) {
    const term = terms[i3];
    if (term.frozen === true) {
      continue;
    }
    const previous = debug_default.tags ? debug_default.before(term) : null;
    if (tag === "*") {
      term.tags.clear();
      if (previous) {
        debug_default.log(term, previous, reason13);
      }
      continue;
    }
    if (children.size > 0) {
      for (const existing of term.tags) {
        if (children.has(existing)) {
          term.tags.delete(existing);
        }
      }
    }
    term.tags.delete(tag);
    if (previous) {
      debug_default.log(term, previous, reason13);
    }
  }
};
var unTag_default = unTag;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/input/_validate.js
var validate = function(node) {
  node.children = node.children || [];
  node._cache = node._cache || {};
  node.props = node.props || {};
  node._cache.parents = node._cache.parents || [];
  return node;
};
var validate_default = validate;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/input/check-cycles.js
var checkCycles = (roots) => {
  const states = /* @__PURE__ */ new Map();
  const stack = roots.map((node) => [node, false]);
  for (; stack.length > 0; ) {
    const [node, done] = stack.pop();
    if (done) {
      states.set(node, 2);
    } else if (states.get(node) === 1) {
      throw new Error("[Grad] - cyclic input");
    } else if (!states.has(node)) {
      states.set(node, 1);
      stack.push([node, true]);
      for (const child of node.children || []) {
        stack.push([child, false]);
      }
    }
  }
  return states.keys();
};
var check_cycles_default = checkCycles;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/input/from-array.js
var fromArray = function(rows) {
  const index3 = /* @__PURE__ */ new Map();
  rows.forEach((node) => {
    validate_default(node);
    index3.set(node.id, node);
  });
  const root = validate_default({});
  rows.forEach((node) => {
    if (node.parent) {
      if (index3.has(node.parent)) {
        const parent = index3.get(node.parent);
        delete node.parent;
        parent.children.push(node);
      } else {
        console.warn(`[Graph] - missing node '${node.parent}'`);
      }
      return;
    }
    root.children.push(node);
  });
  check_cycles_default(rows);
  return root;
};
var from_array_default = fromArray;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/crawl/crawl.js
var byDepth = (root, fn, collect2 = true) => {
  const list5 = collect2 ? [] : null;
  const queue = [root];
  for (; queue.length > 0; ) {
    const node = queue.pop();
    if (collect2) {
      list5.push(node);
    }
    if (node.children) {
      for (let i3 = node.children.length - 1; i3 >= 0; i3 -= 1) {
        const child = node.children[i3];
        if (fn) {
          fn(node, child);
        }
        queue.push(child);
      }
    }
  }
  return list5;
};
var crawl_default = byDepth;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/crawl/cache.js
var cacheParents = (root) => {
  crawl_default(root, (parent, child) => {
    if (parent.id) {
      child._cache.parents = parent._cache.parents.concat([parent.id]);
    }
  }, false);
};
var cache_default = cacheParents;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/crawl/fillDown.js
var inherit = (props, parent) => {
  if (parent.not) {
    props.not = /* @__PURE__ */ new Set([...props.not, ...parent.not]);
  }
  if (Array.isArray(parent.also) && (props.also === void 0 || Array.isArray(props.also))) {
    props.also = parent.also.concat(props.also || []);
  } else if (props.also === void 0) {
    props.also = parent.also;
  }
  if (props.is === void 0) {
    props.is = parent.is;
  }
  if (props.novel === void 0) {
    props.novel = parent.novel;
  }
  return props;
};
var fillDown = (root) => {
  crawl_default(root, (parent, child) => {
    child.props = inherit(child.props, parent.props);
  }, false);
};
var fillDown_default = fillDown;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/toArray.js
var toArray = function(json) {
  const nodes = crawl_default(json);
  const root = nodes[0];
  if (root && !root.id && Object.keys(root.props).length === 0) {
    nodes.shift();
  }
  return nodes;
};
var toArray_default = toArray;

// ../../node_modules/compromise/src/1-one/tag/methods/graph/index.js
var Graph = class {
  constructor(json) {
    Object.defineProperty(this, "json", {
      enumerable: false,
      value: json,
      writable: true
    });
  }
  cache() {
    cache_default(this.json);
    return this;
  }
  fillDown() {
    fillDown_default(this.json);
    return this;
  }
  // the graph's nodes, parents first
  toArray() {
    return toArray_default(this.json);
  }
};
var graph = (rows) => new Graph(from_array_default(rows));
var graph_default = graph;

// ../../node_modules/compromise/src/1-one/tag/methods/addTags/_colors.js
var colors2 = {
  Noun: "blue",
  Verb: "green",
  Negative: "green",
  Date: "red",
  Value: "red",
  Adjective: "magenta",
  Connector: "cyan",
  Determiner: "cyan",
  Hyphenated: "cyan",
  Adverb: "cyan"
};
var colors_default = colors2;

// ../../node_modules/compromise/src/1-one/tag/methods/addTags/02-fmt.js
var getColor = function(node) {
  if (Object.hasOwn(colors_default, node.id)) {
    return colors_default[node.id];
  }
  if (Object.hasOwn(colors_default, node.is)) {
    return colors_default[node.is];
  }
  const found = node._cache.parents.find((c) => colors_default[c]);
  return colors_default[found];
};
var fmt = function(nodes) {
  const res = {};
  const each = (fn) => Object.keys(res).forEach(fn);
  nodes.forEach((node) => {
    const { not, also, is, novel } = node.props;
    let parents = node._cache.parents;
    if (also) {
      parents = parents.concat(also);
    }
    res[node.id] = {
      is,
      not,
      novel,
      also,
      parents,
      children: [],
      color: getColor(node),
      // Retain the preferred output name for legacy model consumers.
      alias: node.aliases === void 0 ? node.alias : node.aliases[0],
      aliases: node.aliases
    };
  });
  const resolved = /* @__PURE__ */ new Set();
  const resolving = /* @__PURE__ */ new Set();
  const resolveParents = function(tag) {
    if (resolved.has(tag)) {
      return res[tag].parents;
    }
    if (resolving.has(tag)) {
      throw new Error(`compromise: cyclic tag inheritance at '${tag}'`);
    }
    resolving.add(tag);
    const parents = /* @__PURE__ */ new Set();
    res[tag].parents.forEach((parent) => {
      if (res[parent]) {
        resolveParents(parent).forEach((ancestor) => parents.add(ancestor));
      }
      parents.add(parent);
    });
    res[tag].parents = Array.from(parents);
    resolving.delete(tag);
    resolved.add(tag);
    return res[tag].parents;
  };
  each(resolveParents);
  each((tag) => {
    res[tag].parents.forEach((parent) => {
      if (res[parent]) {
        res[parent].children.push(tag);
      }
    });
  });
  const exclusions = {};
  each((tag) => {
    exclusions[tag] = res[tag].not;
  });
  each((k2) => {
    const nots = new Set(exclusions[k2]);
    res[k2].parents.forEach((parent) => {
      for (const not of exclusions[parent] || []) {
        nots.add(not);
      }
    });
    Array.from(nots).forEach((not) => {
      if (res[not]) {
        res[not].children.forEach((tag) => nots.add(tag));
      }
    });
    res[k2].not = Array.from(nots);
    lib_default5(res[k2].not);
    lib_default5(res[k2].children);
    const conflicts = [k2, ...res[k2].parents].filter((tag) => nots.has(tag));
    if (conflicts.length > 0) {
      const names = conflicts.map((tag) => `#${tag}`).join(", ");
      console.warn(`compromise: contradictory tag '#${k2}' requires and excludes: ${names}`);
    }
  });
  return res;
};
var fmt_default = fmt;

// ../../node_modules/compromise/src/1-one/tag/_aliases.js
var compileAliases = (tags, normalize3) => {
  const aliases4 = /* @__PURE__ */ Object.create(null);
  Object.keys(tags).forEach((tag) => {
    aliases4[tag] = tag;
  });
  Object.keys(tags).forEach((tag) => {
    const entry = tags[tag];
    const names = entry.aliases === void 0 ? [entry.alias] : [entry.aliases].flat();
    names.forEach((name) => {
      if (name === null || name === void 0) {
        return;
      }
      if (typeof name !== "string" || !/^[\p{L}_][\p{L}\p{M}\p{N}_-]*$/u.test(name)) {
        throw new Error(`compromise: invalid alias for '#${tag}'`);
      }
      const spellings = normalize3 ? [name, normalize3(name)] : [name];
      spellings.forEach((spelling) => {
        if (Object.hasOwn(tags, spelling)) {
          if (spelling !== name && spelling !== tag) {
            throw new Error(`compromise: tag alias '${name}' normalizes to '#${spelling}'`);
          }
          return;
        }
        if (aliases4[spelling] && aliases4[spelling] !== tag) {
          throw new Error(`compromise: duplicate tag alias '${spelling}'`);
        }
        aliases4[spelling] = tag;
      });
    });
  });
  return aliases4;
};
var aliases_default2 = compileAliases;

// ../../node_modules/compromise/src/1-one/tag/methods/addTags/01-validate.js
var toArr = function(input) {
  if (!input) {
    return [];
  }
  if (typeof input === "string") {
    return [input];
  }
  return input.slice();
};
var addImplied = function(tags) {
  const aliases4 = aliases_default2(tags);
  const resolve = (tag) => aliases4[tag] || tag;
  const ensure = (tag) => {
    if (!Object.hasOwn(tags, tag)) {
      tags[tag] = {};
    }
  };
  Object.keys(tags).forEach((k2) => {
    const o = tags[k2];
    if (o.isA) {
      o.is = o.isA;
    }
    if (o.notA) {
      o.not = o.notA;
    }
    if (typeof o.is === "string") {
      o.is = resolve(o.is);
    }
    if (o.also) {
      o.also = toArr(o.also).map(resolve);
    }
    if (o.not) {
      o.not = toArr(o.not).map(resolve);
    }
    if (o.is && typeof o.is === "string") {
      ensure(o.is);
    }
    toArr(o.also).forEach(ensure);
    toArr(o.not).forEach(ensure);
  });
  return tags;
};
var validate2 = function(tags, already) {
  tags = Object.fromEntries(Object.keys({ ...already, ...tags }).map((tag) => [tag, { ...already[tag], ...tags[tag] }]));
  tags = addImplied(tags);
  Object.keys(tags).forEach((k2) => {
    const o = tags[k2];
    if (o.aliases !== void 0) {
      o.aliases = toArr(o.aliases);
    }
    o.children = toArr(o.children);
    o.not = toArr(o.not);
    if (o.also) {
      o.also = toArr(o.also);
    }
  });
  Object.keys(tags).forEach((k2) => {
    const nots = tags[k2].not || [];
    nots.forEach((no) => {
      if (tags[no] && tags[no].not && !tags[no].not.includes(k2)) {
        tags[no].not.push(k2);
      }
    });
  });
  return tags;
};
var validate_default2 = validate2;

// ../../node_modules/compromise/src/1-one/tag/methods/addTags/index.js
var compute3 = function(allTags2) {
  const flatList = Object.keys(allTags2).map((k2) => {
    const o = allTags2[k2];
    const props = { not: new Set(o.not), also: o.also, is: o.is, novel: o.novel };
    return { id: k2, parent: o.is, props, children: [], alias: o.alias, aliases: o.aliases?.slice() };
  });
  const graph2 = graph_default(flatList).cache().fillDown();
  return graph2.toArray();
};
var fromUser = function(tags) {
  Object.entries(tags).forEach(([k2, v2]) => {
    tags[k2] = { ...v2, novel: true };
  });
  return tags;
};
var addTags = function(tags, already) {
  tags = Object.fromEntries(Object.entries(tags).map(([tag, definition]) => [tag, { ...definition }]));
  if (Object.keys(already).length > 0) {
    tags = fromUser(tags);
  }
  tags = validate_default2(tags, already);
  const nodes = compute3(tags);
  const res = fmt_default(nodes);
  return res;
};
var addTags_default = addTags;

// ../../node_modules/compromise/src/1-one/tag/methods/index.js
var methods_default7 = {
  one: {
    setTag: setTag_default,
    unTag: unTag_default,
    addTags: addTags_default,
    canBe: canBe_default
  }
};

// ../../node_modules/compromise/src/1-one/tag/api/tag.js
var prep = function(view, input) {
  if (!view.found || !input) {
    return null;
  }
  const terms = view.termList();
  if (terms.length === 0) {
    return null;
  }
  return terms;
};
var fns5 = {
  /** add a given tag, to all these terms */
  tag: function(input, reason13 = "", isSafe) {
    const terms = prep(this, input);
    if (terms) {
      this.methods.one.setTag(terms, input, this.world, isSafe, reason13);
      this.uncache();
    }
    return this;
  },
  /** add a given tag, only if it is consistent */
  tagSafe: function(input, reason13 = "") {
    return this.tag(input, reason13, true);
  },
  /** remove a given tag from all these terms */
  unTag: function(input, reason13) {
    const terms = prep(this, input);
    if (terms) {
      const { methods: methods20, model: model5 } = this;
      const { tagSet, tagAliases } = model5.one;
      const list5 = Array.isArray(input) ? input : [input];
      list5.forEach((tag) => methods20.one.unTag(terms, resolveTag(tag.trim(), tagAliases), tagSet, reason13));
      this.uncache();
    }
    return this;
  },
  /** return only the terms that can be this tag  */
  canBe: function(tag) {
    const { tagSet, tagAliases } = this.model.one;
    tag = resolveTag(tag, tagAliases);
    const canBe3 = this.methods.one.canBe;
    const nope2 = [];
    lib_default(this.document, (term, terms, i3, n2) => {
      if (!canBe3(term, tag, tagSet)) {
        nope2.push([n2, i3, i3 + 1]);
      }
    });
    const noDoc = this.update(nope2);
    return this.difference(noDoc);
  }
};
var tag_default = fns5;

// ../../node_modules/compromise/src/1-one/tag/api/index.js
var tagAPI = function(View2) {
  Object.assign(View2.prototype, tag_default);
};
var api_default8 = tagAPI;

// ../../node_modules/compromise/src/1-one/tag/lib.js
var addTags2 = function(tags) {
  const world2 = this.world();
  const { model: model5, methods: methods20 } = world2;
  const tagSet = model5.one.tagSet;
  const fn = methods20.one.addTags;
  const res = fn(tags, tagSet);
  const aliases4 = aliases_default2(res, (name) => methods20.one.killUnicode(name, world2));
  model5.one.tagSet = res;
  model5.one.tagAliases = aliases4;
  return this;
};
var lib_default7 = { addTags: addTags2 };

// ../../node_modules/compromise/src/1-one/tag/compute/tagRank.js
var boringTags = /* @__PURE__ */ new Set(["Auxiliary", "Possessive"]);
var sortByKids = function(tags, tagSet) {
  tags = tags.sort((a, b2) => {
    if (boringTags.has(a) || !Object.hasOwn(tagSet, b2)) {
      return 1;
    }
    if (boringTags.has(b2) || !Object.hasOwn(tagSet, a)) {
      return -1;
    }
    let kids = tagSet[a].children || [];
    const aKids = kids.length;
    kids = tagSet[b2].children || [];
    const bKids = kids.length;
    return aKids - bKids;
  });
  return tags;
};
var tagRank = function(view) {
  const { document, world: world2 } = view;
  const tagSet = world2.model.one.tagSet;
  lib_default(document, (term) => {
    const tags = Array.from(term.tags);
    term.tagRank = sortByKids(tags, tagSet);
  });
};
var tagRank_default = tagRank;

// ../../node_modules/compromise/src/1-one/tag/plugin.js
var plugin_default11 = {
  model: {
    one: { tagSet: {}, tagAliases: /* @__PURE__ */ Object.create(null) }
  },
  compute: {
    tagRank: tagRank_default
  },
  methods: methods_default7,
  api: api_default8,
  lib: lib_default7
};

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/01-simple-split.js
var stops = new Set(".!?\u203D\u2E18\u203C\u2047\u2048\u2049\u0964\u0965\u061F\u06D4\u0589\u1362\u1367\u104B\u17D4\u3002");
var cjkStops = new Set("\u3002\uFF01\uFF1F\uFF61");
var openers = new Set("\u300C\u300E\uFF08\u3010\u3014\u300A\u3008\u201C");
var closers = new Set("\u300D\u300F\uFF09\u3011\u3015\u300B\u3009\u201D");
var whitespace3 = /\s/;
var splitsOnly = /^[.!?‽⸘‼\u2047-\u2049।॥؟۔։።፧။។。]+\s$/;
var splitsOnlyCjk = /^(?:[.!?‽⸘‼\u2047-\u2049।॥؟۔։።፧။។。！？｡]+\s|[。！？｡]+[」』）】〕》〉”]*)$/;
var newLine = /((?:\r?\n|\r)+)/;
var basicSplit = function(text) {
  const all4 = [];
  const isCjk = /[。！？｡]/.test(text);
  const activeStops = isCjk ? /* @__PURE__ */ new Set([...stops, ...cjkStops]) : stops;
  for (const line of text.split(newLine)) {
    let start2 = 0;
    const arr = [];
    const emit = (from, end2) => {
      arr.push(line.slice(start2, from), line.slice(from, end2));
      start2 = end2;
    };
    let i3 = 0;
    while (i3 < line.length) {
      if (!activeStops.has(line[i3])) {
        i3++;
        continue;
      }
      const runStart = i3;
      while (i3 < line.length && activeStops.has(line[i3])) i3++;
      if (i3 < line.length && whitespace3.test(line[i3])) {
        emit(runStart, i3 + 1);
        i3++;
        continue;
      }
      if (!isCjk) continue;
      let j = runStart;
      while (j < i3) {
        if (!cjkStops.has(line[j])) {
          j++;
          continue;
        }
        const from = j;
        while (j < i3 && cjkStops.has(line[j])) j++;
        let end2 = j;
        while (end2 < line.length && closers.has(line[end2])) end2++;
        if (end2 === j || end2 === line.length || whitespace3.test(line[end2]) || openers.has(line[end2])) {
          emit(from, end2);
          if (end2 > i3) i3 = end2;
        }
      }
    }
    arr.push(line.slice(start2));
    for (let k2 = 0; k2 < arr.length; k2++) {
      const next = arr[k2 + 1];
      if (next && (isCjk ? splitsOnlyCjk : splitsOnly).test(next)) {
        arr[k2] += next;
        arr[k2 + 1] = "";
      }
      if (arr[k2]) all4.push(arr[k2]);
    }
  }
  return all4;
};
var simple_split_default = basicSplit;

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/02-simple-merge.js
var hasLetter = /[\p{L}\p{N}\p{So}]/u;
var hasSomething = /\S/;
var notEmpty = function(splits) {
  const chunks2 = [];
  let lead = "";
  for (let i3 = 0; i3 < splits.length; i3++) {
    const s = splits[i3];
    if (s === void 0 || s === "") {
      continue;
    }
    if (!hasSomething.test(s) || !hasLetter.test(s)) {
      if (chunks2[chunks2.length - 1]) {
        chunks2[chunks2.length - 1] += s;
        continue;
      } else if (splits[i3 + 1]) {
        lead += s;
        continue;
      }
    }
    chunks2.push(lead + s);
    lead = "";
  }
  return chunks2;
};
var simple_merge_default = notEmpty;

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/03-smart-merge.js
var MAX_TAIL = 64;
var hasLetter2 = new RegExp("\\p{L}", "u");
var hasNewline = function(c) {
  return Boolean(/\n$/.test(c));
};
var smartMerge = function(chunks2, world2) {
  const isSentence2 = world2.methods.one.tokenize.isSentence;
  const abbrevs = world2.model.one.abbreviations || /* @__PURE__ */ new Set();
  const sentences = [];
  let sentence = "";
  let tail2 = "";
  let foundLetter = false;
  for (let i3 = 0; i3 < chunks2.length; i3++) {
    const c = chunks2[i3];
    sentence += c;
    tail2 = (tail2 + c).slice(-MAX_TAIL);
    foundLetter ||= hasLetter2.test(c);
    if (chunks2[i3 + 1] && !isSentence2(tail2, abbrevs, foundLetter) && !hasNewline(c)) {
      continue;
    }
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    sentence = "";
    tail2 = "";
    foundLetter = false;
  }
  return sentences;
};
var smart_merge_default = smartMerge;

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/04-quote-merge.js
var MAX_QUOTE = 280;
var pairs = {
  '"': '"',
  // 'StraightDoubleQuotes'
  "\uFF02": "\uFF02",
  // 'StraightDoubleQuotesWide'
  // '\u0027': '\u0027', // 'StraightSingleQuotes'
  "\u201C": "\u201D",
  // 'CommaDoubleQuotes'
  // '\u2018': '\u2019', // 'CommaSingleQuotes'
  "\u201F": "\u201D",
  // 'CurlyDoubleQuotesReversed'
  // '\u201B': '\u2019', // 'CurlySingleQuotesReversed'
  "\u201E": "\u201D",
  // 'LowCurlyDoubleQuotes'
  "\u2E42": "\u201D",
  // 'LowCurlyDoubleQuotesReversed'
  "\u201A": "\u2019",
  // 'LowCurlySingleQuotes'
  "\xAB": "\xBB",
  // 'AngleDoubleQuotes'
  "\u2039": "\u203A",
  // 'AngleSingleQuotes'
  "\u2035": "\u2032",
  // 'PrimeSingleQuotes'
  "\u2036": "\u2033",
  // 'PrimeDoubleQuotes'
  "\u2037": "\u2034",
  // 'PrimeTripleQuotes'
  "\u301D": "\u301E",
  // 'PrimeDoubleQuotes'
  // '\u0060': '\u00B4', // 'PrimeSingleQuotes'
  "\u301F": "\u301E",
  // 'LowPrimeDoubleQuotesReversed'
  "\u300C": "\u300D",
  // 'CornerBrackets' 「」
  "\u300E": "\u300F"
  // 'WhiteCornerBrackets' 『』
};
var openQuote = RegExp("[" + Object.keys(pairs).join("") + "]", "g");
var closeQuote = RegExp("[" + Object.values(pairs).join("") + "]", "g");
var closesQuote = function(str) {
  if (!str) {
    return false;
  }
  const m3 = str.match(closeQuote);
  if (m3 !== null && m3.length === 1) {
    return true;
  }
  return false;
};
var quoteMerge = function(splits) {
  const arr = [];
  for (let i3 = 0; i3 < splits.length; i3 += 1) {
    const split4 = splits[i3];
    const m3 = split4.match(openQuote);
    if (m3 !== null && m3.length === 1) {
      const closed = split4.match(closeQuote);
      if (closed !== null && closed[0] !== m3[0]) {
        arr.push(split4);
        continue;
      }
      if (closesQuote(splits[i3 + 1]) && splits[i3 + 1].length < MAX_QUOTE) {
        splits[i3] += splits[i3 + 1];
        arr.push(splits[i3]);
        splits[i3 + 1] = "";
        i3 += 1;
        continue;
      }
      if (closesQuote(splits[i3 + 2])) {
        const toAdd = splits[i3 + 1] + splits[i3 + 2];
        if (toAdd.length < MAX_QUOTE) {
          splits[i3] += toAdd;
          arr.push(splits[i3]);
          splits[i3 + 1] = "";
          splits[i3 + 2] = "";
          i3 += 2;
          continue;
        }
      }
    }
    arr.push(splits[i3]);
  }
  return arr;
};
var quote_merge_default = quoteMerge;

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/05-parens-merge.js
var MAX_LEN = 250;
var hasOpen = /[(\uFF08]/g;
var hasClosed = /[)\uFF09]/g;
var mergeParens = function(splits) {
  const arr = [];
  for (let i3 = 0; i3 < splits.length; i3 += 1) {
    const split4 = splits[i3];
    const m3 = split4.match(hasOpen);
    if (m3 !== null && m3.length === 1) {
      if (splits[i3 + 1] && splits[i3 + 1].length < MAX_LEN) {
        const m22 = splits[i3 + 1].match(hasClosed);
        if (m22 !== null && m3.length === 1 && !hasOpen.test(splits[i3 + 1])) {
          splits[i3] += splits[i3 + 1];
          arr.push(splits[i3]);
          splits[i3 + 1] = "";
          i3 += 1;
          continue;
        }
      }
    }
    arr.push(splits[i3]);
  }
  return arr;
};
var parens_merge_default = mergeParens;

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/index.js
var hasSomething2 = /\S/;
var startWhitespace = /^\s+/;
var splitSentences = function(text, world2) {
  text ||= "";
  text = String(text);
  if (!text || typeof text !== "string" || !hasSomething2.test(text)) {
    return [];
  }
  const splits = simple_split_default(text);
  let sentences = simple_merge_default(splits);
  sentences = smart_merge_default(sentences, world2);
  sentences = quote_merge_default(sentences);
  sentences = parens_merge_default(sentences);
  if (sentences.length === 0) {
    return [text];
  }
  for (let i3 = 1; i3 < sentences.length; i3 += 1) {
    const ws = sentences[i3].match(startWhitespace);
    if (ws !== null) {
      sentences[i3 - 1] += ws[0];
      sentences[i3] = sentences[i3].replace(startWhitespace, "");
    }
  }
  return sentences;
};
var sentences_default = splitSentences;

// ../../node_modules/compromise/src/1-one/tokenize/methods/02-terms/03-ranges.js
var combineRanges = function(arr) {
  const startRange = /^[0-9]{1,4}(:[0-9][0-9])?([a-z]{1,2})? ?[-–—] ?$/;
  const endRange = /^[0-9]{1,4}([a-z]{1,2})? ?$/;
  for (let i3 = 0; i3 < arr.length - 1; i3 += 1) {
    if (arr[i3 + 1] && startRange.test(arr[i3]) && endRange.test(arr[i3 + 1])) {
      arr[i3] = arr[i3] + arr[i3 + 1];
      arr[i3 + 1] = null;
    }
  }
  return arr;
};
var ranges_default = combineRanges;

// ../../node_modules/compromise/src/1-one/tokenize/methods/02-terms/02-slashes.js
var isSlash = new RegExp("\\p{L} ?\\/ ?\\p{L}+$", "u");
var combineSlashes = function(arr) {
  for (let i3 = 1; i3 < arr.length - 1; i3++) {
    if (isSlash.test(arr[i3])) {
      arr[i3 - 1] += arr[i3] + arr[i3 + 1];
      arr[i3] = null;
      arr[i3 + 1] = null;
    }
  }
  return arr;
};
var slashes_default = combineSlashes;

// ../../node_modules/compromise/src/1-one/tokenize/methods/02-terms/index.js
var wordlike = /\S/;
var isBoundary = /^[!?.]+$/;
var naiiveSplit = /(\S+)/;
var notWord = new Set(toList(`
.
?
!
:
;
-
\u2013
\u2014
--
...
(
)
[
]
"
'
\`
\xAB
\xBB
*
\u2022
`));
var splitWords = function(str, model5) {
  let result = [];
  let arr = [];
  str ||= "";
  if (typeof str === "number") {
    str = String(str);
  }
  if (Array.isArray(str)) {
    return str;
  }
  const words2 = str.split(naiiveSplit);
  for (let i3 = 0; i3 < words2.length; i3++) {
    if (hasHyphen(words2[i3], model5)) {
      arr = arr.concat(splitHyphens(words2[i3]));
      continue;
    }
    arr.push(words2[i3]);
  }
  let carry = "";
  for (let i3 = 0; i3 < arr.length; i3++) {
    const word = arr[i3];
    if (wordlike.test(word) && !notWord.has(word) && !isBoundary.test(word)) {
      if (result.length > 0) {
        result[result.length - 1] += carry;
        result.push(word);
      } else {
        result.push(carry + word);
      }
      carry = "";
    } else {
      carry += word;
    }
  }
  if (carry) {
    if (result.length === 0) {
      result[0] = "";
    }
    result[result.length - 1] += carry;
  }
  result = slashes_default(result);
  result = ranges_default(result);
  result = result.filter((s) => s);
  return result;
};
var terms_default = splitWords;

// ../../node_modules/compromise/src/1-one/tokenize/methods/03-whitespace/tokenize.js
var isLetter = new RegExp("\\p{Letter}", "u");
var isMark = new RegExp("\\p{Mark}", "u");
var isNumber = /[\p{Number}\p{Currency_Symbol}]/u;
var hasAcronym = /^[a-z]\.([a-z]\.)+/i;
var chillin = /[sn]['’]$/;
var elision = /^['’](tis|twas|em|cause|til|bout|round)\b/i;
var isFullNumber = /^[(+\-]?\d+(th|st|nd|rd)?[)+\-]?$/;
var openers2 = { ")": "(", "]": "[", "}": "{" };
var closesInside = function(chars, start2, end2) {
  const close = chars[end2 - 1];
  let depth = 0;
  for (let i3 = start2; i3 < end2 - 1; i3 += 1) {
    if (chars[i3] === openers2[close]) {
      depth += 1;
    } else if (chars[i3] === close) {
      depth -= 1;
    }
  }
  return depth > 0;
};
var normalizePunctuation = function(str, model5) {
  const { prePunctuation: prePunctuation2, postPunctuation: postPunctuation2, emoticons: emoticons2 } = model5.one;
  const original = str;
  const trimmed = str.trim();
  let pre = "";
  let post = "";
  const chars = Array.from(str);
  let start2 = 0;
  let end2 = chars.length;
  if (Object.hasOwn(emoticons2, trimmed)) {
    return { str: trimmed, pre, post: " " };
  }
  while (start2 < end2) {
    const c = chars[start2];
    if (prePunctuation2[c] === true) {
      break;
    }
    if ((c === "+" || c === "-" || c === "(") && isFullNumber.test(trimmed)) {
      break;
    }
    if (isLetter.test(c) || isNumber.test(c)) {
      break;
    }
    if ((c === "'" || c === "\u2019") && elision.test(chars.slice(start2).join(""))) {
      break;
    }
    start2++;
  }
  while (end2 > start2) {
    const c = chars[end2 - 1];
    if (postPunctuation2[c] === true) {
      break;
    }
    if (isLetter.test(c) || isNumber.test(c)) {
      break;
    }
    if (isMark.test(c)) {
      let base = end2 - 2;
      while (base >= start2 && isMark.test(chars[base])) {
        base--;
      }
      if (base >= start2 && isLetter.test(chars[base])) {
        break;
      }
      end2 = base + 1;
      continue;
    }
    if (c === "." && hasAcronym.test(original)) {
      break;
    }
    if (c === "'" && chillin.test(original)) {
      break;
    }
    if ((c === "+" || c === ")") && isFullNumber.test(trimmed)) {
      break;
    }
    if (Object.hasOwn(openers2, c) && closesInside(chars, start2, end2)) {
      break;
    }
    end2--;
  }
  pre = chars.slice(0, start2).join("");
  post = chars.slice(end2).join("");
  str = chars.slice(start2, end2).join("");
  if (str === "") {
    let last = original.length;
    while (last > 0 && original[last - 1] === " ") last--;
    post = original.slice(last);
    str = original.slice(0, last);
    pre = "";
  }
  return { str, pre, post };
};
var tokenize_default = normalizePunctuation;

// ../../node_modules/compromise/src/1-one/tokenize/methods/03-whitespace/index.js
var parseTerm = (txt, model5) => {
  const { str, pre, post } = tokenize_default(txt, model5);
  const parsed = {
    text: str,
    pre,
    post,
    tags: /* @__PURE__ */ new Set()
  };
  return parsed;
};
var whitespace_default2 = parseTerm;

// ../../node_modules/compromise/src/1-one/tokenize/methods/unicode.js
var killUnicode = function(str, world2) {
  const unicode2 = world2.model.one.unicode || {};
  str ||= "";
  const chars = str.split("");
  chars.forEach((s, i3) => {
    if (unicode2[s]) {
      chars[i3] = unicode2[s];
    }
  });
  return chars.join("");
};
var unicode_default = killUnicode;

// ../../node_modules/compromise/src/1-one/tokenize/compute/normal/01-cleanup.js
var trimPunctuation = (str, punctuation) => {
  let end2 = str.length;
  while (end2 > 0 && punctuation.test(str[end2 - 1])) end2--;
  return str.slice(0, end2);
};
var clean = function(str) {
  str ||= "";
  str = str.toLowerCase();
  str = str.trim();
  const original = str;
  str = trimPunctuation(str, /[,;.!?]/);
  str = str.replaceAll("\u2026", "...");
  str = str.replaceAll("\u2013", "-");
  if (!/^[:;]/.test(str)) {
    str = trimPunctuation(str, /[",.!:;?)]/);
    str = str.replace(/^['’"(]+/g, "");
  }
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, "");
  str = str.trim();
  if (str === "") {
    str = original;
  }
  str = str.replace(/([0-9]),([0-9])/g, "$1$2");
  return str;
};
var cleanup_default = clean;

// ../../node_modules/compromise/src/1-one/tokenize/compute/normal/02-acronyms.js
var acronyms = [
  /^([A-Z]\.)+[A-Z]?,?$/,
  //like N.D.A
  /^([a-z]\.)+[a-z]\.?$/,
  //like c.e.o
  /^[A-Z]\.,?$/,
  //like 'F.'
  /^[A-Z]{2,}('s|,)?$/
  //like NDA
];
var isAcronym = (str) => acronyms.some((re) => re.test(str));
var doAcronym = function(str) {
  if (isAcronym(str)) {
    str = str.replace(/\./g, "");
  }
  return str;
};
var acronyms_default = doAcronym;

// ../../node_modules/compromise/src/1-one/tokenize/compute/normal/index.js
var normalize2 = function(term, world2) {
  const killUnicode2 = world2.methods.one.killUnicode;
  let str = term.text || "";
  str = cleanup_default(str);
  str = killUnicode2(str, world2);
  str = acronyms_default(str);
  term.normal = str;
};
var normal_default = normalize2;

// ../../node_modules/compromise/src/1-one/tokenize/methods/parse.js
var parse3 = function(input, world2) {
  const { methods: methods20, model: model5 } = world2;
  const { splitSentences: splitSentences2, splitTerms, splitWhitespace } = methods20.one.tokenize;
  input ||= "";
  const sentences = splitSentences2(input, world2);
  input = sentences.map((txt) => {
    let terms = splitTerms(txt, model5);
    terms = terms.map((t) => splitWhitespace(t, model5));
    terms.forEach((t) => {
      normal_default(t, world2);
    });
    return terms;
  });
  return input;
};
var parse_default2 = parse3;

// ../../node_modules/compromise/src/1-one/tokenize/methods/01-sentences/is-sentence.js
var isAcronym2 = /[ .][A-Z]\.? *$/i;
var hasEllipse = /(?:\u2026|\.{2}) *$/;
var hasLetter3 = new RegExp("\\p{L}", "u");
var hasPeriod = /\. *$/;
var leadInit = /^[A-Z]\. $/;
var isSentence = function(str, abbrevs, foundLetter = hasLetter3.test(str)) {
  if (foundLetter === false) {
    return false;
  }
  if (isAcronym2.test(str)) {
    return false;
  }
  if (str.length === 3 && leadInit.test(str)) {
    return false;
  }
  if (hasEllipse.test(str)) {
    return false;
  }
  const txt = str.replace(/[.!?\u203D\u2E18\u203C\u2047-\u2049] *$/, "");
  const words2 = txt.split(" ");
  const lastWord = words2[words2.length - 1].toLowerCase();
  if (Object.hasOwn(abbrevs, lastWord) && hasPeriod.test(str)) {
    return false;
  }
  return true;
};
var is_sentence_default = isSentence;

// ../../node_modules/compromise/src/1-one/tokenize/methods/index.js
var methods_default8 = {
  one: {
    killUnicode: unicode_default,
    tokenize: {
      splitSentences: sentences_default,
      isSentence: is_sentence_default,
      splitTerms: terms_default,
      splitWhitespace: whitespace_default2,
      fromString: parse_default2
    }
  }
};

// ../../node_modules/compromise/src/1-one/tokenize/model/aliases.js
var aliases = {
  "&": "and",
  "@": "at",
  "%": "percent",
  "plz": "please",
  "bein": "being"
};
var aliases_default3 = aliases;

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/misc.js
var misc_default = toList(`
approx
apt
bc
cyn
eg
esp
est
etc
ex
exp
prob
pron
gal
min
pseud
fig
jd
lat
lng
vol
fm
def
misc
plz
ea
ps
sec
pt
pref
pl
pp
qt
fr
sq
nee
ss
tel
temp
vet
ver
fem
masc
eng
adj
vb
rb
inf
situ
vivo
vitro
wr
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/honorifics.js
var honorifics_default = toList(`
adj
adm
adv
asst
atty
bldg
brig
capt
cmdr
comdr
cpl
det
dr
esq
gen
gov
hon
jr
llb
lt
maj
messrs
mlle
mme
mr
mrs
ms
mstr
phd
prof
pvt
rep
reps
res
rev
sen
sens
sfc
sgt
sir
sr
supt
surg
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/months.js
var months_default = toList(`
jan
feb
mar
apr
jun
jul
aug
sep
sept
oct
nov
dec
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/nouns.js
var nouns_default = toList(`
ad
al
arc
ba
bl
ca
cca
col
corp
ft
fy
ie
lit
ma
md
pd
tce
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/organizations.js
var organizations_default = toList(`
dept
univ
assn
bros
inc
ltd
co
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/places.js
var places_default = toList(`
rd
st
dist
mt
ave
blvd
cl
cres
hwy
ariz
cal
calif
colo
conn
fla
fl
ga
ida
ia
kan
kans
minn
neb
nebr
okla
penna
penn
pa
dak
tenn
tex
ut
vt
va
wis
wisc
wy
wyo
usafa
alta
ont
que
sask
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/abbreviations/units.js
var units_default = toList(`
dl
ml
gal
qt
pt
tbl
tsp
tbsp
km
dm
cm
mm
mi
td
hr
hrs
kg
hg
dg
cg
mg
\xB5g
lb
oz
sq ft
hz
mps
mph
kmph
kb
mb
tb
lx
lm
fl oz
yb
`);

// ../../node_modules/compromise/src/1-one/tokenize/model/lexicon.js
var list = [
  [misc_default],
  [units_default, "Unit"],
  [nouns_default, "Noun"],
  [honorifics_default, "Honorific"],
  [months_default, "Month"],
  [organizations_default, "Organization"],
  [places_default, "Place"]
];
var abbreviations = {};
var lexicon2 = {};
list.forEach((a) => {
  a[0].forEach((w) => {
    abbreviations[w] = true;
    lexicon2[w] = "Abbreviation";
    if (a[1] !== void 0) {
      lexicon2[w] = [lexicon2[w], a[1]];
    }
  });
});

// ../../node_modules/compromise/src/1-one/tokenize/model/prefixes.js
var prefixes_default = toHash(toList(`
anti
bi
co
contra
de
extra
infra
inter
intra
macro
micro
mis
mono
multi
peri
pre
pro
proto
pseudo
re
sub
supra
trans
tri
un
out
ex
`));

// ../../node_modules/compromise/src/1-one/tokenize/model/suffixes.js
var suffixes_default = toHash(toList(`
like
ish
less
able
elect
type
designate
`));

// ../../node_modules/compromise/src/1-one/tokenize/model/unicode.js
var compact = {
  "!": "\xA1",
  "?": "\xBF\u0241",
  '"': '\u201C\u201D"\u275D\u275E',
  "'": "\u2018\u201B\u275B\u275C\u2019",
  "-": "\u2014\u2013",
  a: "\xAA\xC0\xC1\xC2\xC3\xC4\xC5\xE0\xE1\xE2\xE3\xE4\xE5\u0100\u0101\u0102\u0103\u0104\u0105\u01CD\u01CE\u01DE\u01DF\u01E0\u01E1\u01FA\u01FB\u0200\u0201\u0202\u0203\u0226\u0227\u023A\u0386\u0391\u0394\u039B\u03AC\u03B1\u03BB\u0410\u0430\u0466\u0467\u04D0\u04D1\u04D2\u04D3\u019B\xE6",
  b: "\xDF\xFE\u0180\u0181\u0182\u0183\u0184\u0185\u0243\u0392\u03B2\u03D0\u03E6\u0411\u0412\u042A\u042C\u0432\u044A\u044C\u0462\u0463\u048C\u048D",
  c: "\xA2\xA9\xC7\xE7\u0106\u0107\u0108\u0109\u010A\u010B\u010C\u010D\u0186\u0187\u0188\u023B\u023C\u037B\u037C\u03F2\u03F9\u03FD\u03FE\u0421\u0441\u0454\u0480\u0481\u04AA\u04AB",
  d: "\xD0\u010E\u010F\u0110\u0111\u0189\u018A\u0221\u018B\u018C",
  e: "\xC8\xC9\xCA\xCB\xE8\xE9\xEA\xEB\u0112\u0113\u0114\u0115\u0116\u0117\u0118\u0119\u011A\u011B\u0190\u0204\u0205\u0206\u0207\u0228\u0229\u0246\u0247\u0388\u0395\u039E\u03A3\u03AD\u03B5\u03BE\u03F5\u0400\u0401\u0415\u0435\u0450\u0451\u04BC\u04BD\u04BE\u04BF\u04D6\u04D7\u1EC5",
  f: "\u0191\u0192\u03DC\u03DD\u04FA\u04FB\u0492\u0493\u017F",
  g: "\u011C\u011D\u011E\u011F\u0120\u0121\u0122\u0123\u0193\u01E4\u01E5\u01E6\u01E7\u01F4\u01F5",
  h: "\u0124\u0125\u0126\u0127\u0195\u01F6\u021E\u021F\u0389\u0397\u0402\u040A\u040B\u041D\u043D\u0452\u045B\u04A2\u04A3\u04A4\u04A5\u04BA\u04BB\u04C9\u04CA",
  I: "\xCC\xCD\xCE\xCF",
  i: "\xEC\xED\xEE\xEF\u0128\u0129\u012A\u012B\u012C\u012D\u012E\u012F\u0130\u0131\u0196\u0197\u0208\u0209\u020A\u020B\u038A\u0390\u03AA\u03AF\u03B9\u03CA\u0406\u0407\u0456\u0457i\u0307",
  j: "\u0134\u0135\u01F0\u0237\u0248\u0249\u03F3\u0408\u0458",
  k: "\u0136\u0137\u0138\u0198\u0199\u01E8\u01E9\u039A\u03BA\u040C\u0416\u041A\u0436\u043A\u045C\u049A\u049B\u049C\u049D\u049E\u049F\u04A0\u04A1",
  l: "\u0139\u013A\u013B\u013C\u013D\u013E\u013F\u0140\u0141\u0142\u019A\u01AA\u01C0\u01CF\u01D0\u0234\u023D\u0399\u04C0\u04CF",
  m: "\u039C\u03FA\u03FB\u041C\u043C\u04CD\u04CE",
  n: "\xD1\xF1\u0143\u0144\u0145\u0146\u0147\u0148\u0149\u014A\u014B\u019D\u019E\u01F8\u01F9\u0220\u0235\u039D\u03A0\u03AE\u03B7\u03DE\u040D\u0418\u0419\u041B\u041F\u0438\u0439\u043B\u043F\u045D\u048A\u048B\u04C5\u04C6\u04E2\u04E3\u04E4\u04E5\u03C0",
  o: "\xD2\xD3\xD4\xD5\xD6\xD8\xF0\xF2\xF3\xF4\xF5\xF6\xF8\u014C\u014D\u014E\u014F\u0150\u0151\u019F\u01A0\u01A1\u01D1\u01D2\u01EA\u01EB\u01EC\u01ED\u01FE\u01FF\u020C\u020D\u020E\u020F\u022A\u022B\u022C\u022D\u022E\u022F\u0230\u0231\u038C\u0398\u039F\u03B8\u03BF\u03C3\u03CC\u03D5\u03D8\u03D9\u03EC\u03F4\u041E\u0424\u043E\u0472\u0473\u04E6\u04E7\u04E8\u04E9\u04EA\u04EB",
  p: "\u01A4\u03A1\u03C1\u03F7\u03F8\u03FC\u0420\u0440\u048E\u048F\xDE",
  q: "\u024A\u024B",
  r: "\u0154\u0155\u0156\u0157\u0158\u0159\u01A6\u0210\u0211\u0212\u0213\u024C\u024D\u0403\u0413\u042F\u0433\u044F\u0453\u0490\u0491",
  s: "\u015A\u015B\u015C\u015D\u015E\u015F\u0160\u0161\u01A7\u01A8\u0218\u0219\u023F\u0405\u0455",
  t: "\u0162\u0163\u0164\u0165\u0166\u0167\u01AB\u01AC\u01AD\u01AE\u021A\u021B\u0236\u023E\u0393\u03A4\u03C4\u03EE\u0422\u0442",
  u: "\xD9\xDA\xDB\xDC\xF9\xFA\xFB\xFC\u0168\u0169\u016A\u016B\u016C\u016D\u016E\u016F\u0170\u0171\u0172\u0173\u01AF\u01B0\u01B1\u01B2\u01D3\u01D4\u01D5\u01D6\u01D7\u01D8\u01D9\u01DA\u01DB\u01DC\u0214\u0215\u0216\u0217\u0244\u03B0\u03C5\u03CB\u03CD",
  v: "\u03BD\u0474\u0475\u0476\u0477",
  w: "\u0174\u0175\u019C\u03C9\u03CE\u03D6\u03E2\u03E3\u0428\u0429\u0448\u0449\u0461\u047F",
  x: "\xD7\u03A7\u03C7\u03D7\u03F0\u0425\u0445\u04B2\u04B3\u04FC\u04FD\u04FE\u04FF",
  y: "\xDD\xFD\xFF\u0176\u0177\u0178\u01B3\u01B4\u0232\u0233\u024E\u024F\u038E\u03A5\u03AB\u03B3\u03C8\u03D2\u03D3\u03D4\u040E\u0423\u0443\u0447\u045E\u0470\u0471\u04AE\u04AF\u04B0\u04B1\u04EE\u04EF\u04F0\u04F1\u04F2\u04F3",
  z: "\u0179\u017A\u017B\u017C\u017D\u017E\u01B5\u01B6\u0224\u0225\u0240\u0396"
};
var unicode = {};
Object.keys(compact).forEach(function(k2) {
  compact[k2].split("").forEach(function(s) {
    unicode[s] = k2;
  });
});
for (let i3 = 33; i3 <= 126; i3 += 1) {
  unicode[String.fromCharCode(i3 + 65248)] = String.fromCharCode(i3);
}
var unicode_default2 = unicode;

// ../../node_modules/compromise/src/1-one/tokenize/model/punctuation.js
var zeroWidth = "\u200B\u200C\u200D\uFEFF";
var prePunctuation = toHash(("#@_\xB0" + zeroWidth).split(""));
var postPunctuation = toHash(("%_\xB0" + zeroWidth).split(""));
var emoticons = toHash("<3 </3 <\\3 :^P :^p :^O :^3".split(" "));

// ../../node_modules/compromise/src/1-one/tokenize/model/index.js
var model_default2 = {
  one: {
    aliases: aliases_default3,
    abbreviations,
    prefixes: prefixes_default,
    suffixes: suffixes_default,
    prePunctuation,
    postPunctuation,
    lexicon: lexicon2,
    //give this one forward
    unicode: unicode_default2,
    emoticons
  }
};

// ../../node_modules/compromise/src/1-one/tokenize/compute/alias.js
var hasSlash = /\//;
var hasDomain = /[a-z]\.[a-z]/i;
var isMath = /[0-9]/;
var addAliases = function(term, world2) {
  const str = term.normal || term.text || term.machine;
  const aliases4 = world2.model.one.aliases;
  if (Object.hasOwn(aliases4, str)) {
    term.alias ||= [];
    term.alias.push(aliases4[str]);
  }
  if (hasSlash.test(str) && !hasDomain.test(str) && !isMath.test(str)) {
    const arr = str.split(hasSlash);
    if (arr.length <= 3) {
      arr.forEach((word) => {
        word = word.trim();
        if (word !== "") {
          term.alias ||= [];
          term.alias.push(word);
        }
      });
    }
  }
  return term;
};
var alias_default = addAliases;

// ../../node_modules/compromise/src/1-one/tokenize/compute/machine.js
var hasDash2 = new RegExp("^\\p{Letter}+-\\p{Letter}+$", "u");
var doMachine = function(term) {
  let str = term.implicit || term.normal || term.text;
  str = str.replace(/['’]s$/, "");
  str = str.replace(/s['’]$/, "s");
  str = str.replace(/([aeiou][ktrp])in'$/, "$1ing");
  if (hasDash2.test(str)) {
    str = str.replace(/-/g, "");
  }
  str = str.replace(/^[#@]/, "");
  if (str !== term.normal) {
    term.machine = str;
  }
};
var machine_default = doMachine;

// ../../node_modules/compromise/src/1-one/tokenize/compute/freq.js
var freq = function(view) {
  const docs = view.docs;
  const counts = /* @__PURE__ */ Object.create(null);
  lib_default(docs, (term) => {
    const word = term.machine || term.normal;
    counts[word] ??= 0;
    counts[word] += 1;
  });
  lib_default(docs, (term) => {
    term.freq = counts[term.machine || term.normal];
  });
};
var freq_default = freq;

// ../../node_modules/compromise/src/1-one/tokenize/compute/offset.js
var offset = function(view) {
  let elapsed = 0;
  let index3 = 0;
  lib_default(view.document, (term) => {
    term.offset = {
      index: index3,
      start: elapsed + term.pre.length,
      length: term.text.length
    };
    elapsed += term.pre.length + term.text.length + term.post.length;
    index3 += 1;
  });
};
var offset_default = offset;

// ../../node_modules/compromise/src/1-one/tokenize/compute/reindex.js
var index2 = function(view) {
  lib_default(view.document, (term, terms, t, n2) => {
    term.index = [n2, t];
  });
};
var reindex_default = index2;

// ../../node_modules/compromise/src/1-one/tokenize/compute/wordCount.js
var wordCount2 = function(view) {
  let n2 = 0;
  lib_default(view.docs, (term) => {
    if (term.normal !== "") {
      n2 += 1;
      term.wordCount = n2;
    }
  });
};
var wordCount_default = wordCount2;

// ../../node_modules/compromise/src/1-one/tokenize/compute/index.js
var termLoop = (view, fn) => lib_default(view.docs, (term) => fn(term, view.world));
var methods16 = {
  alias: (view) => termLoop(view, alias_default),
  machine: (view) => termLoop(view, machine_default),
  normal: (view) => termLoop(view, normal_default),
  freq: freq_default,
  offset: offset_default,
  index: reindex_default,
  wordCount: wordCount_default
};
var compute_default7 = methods16;

// ../../node_modules/compromise/src/1-one/tokenize/plugin.js
var plugin_default12 = {
  compute: compute_default7,
  methods: methods_default8,
  model: model_default2,
  hooks: ["alias", "machine", "index", "id"]
};

// ../../node_modules/compromise/src/1-one/typeahead/compute.js
var typeahead = function(view) {
  const prefixes2 = view.model.one.typeahead;
  const docs = view.docs;
  if (docs.length === 0 || Object.keys(prefixes2).length === 0) {
    return;
  }
  const lastTerm = docs.at(-1)?.at(-1);
  if (!lastTerm || lastTerm.post) {
    return;
  }
  if (Object.hasOwn(prefixes2, lastTerm.normal)) {
    const found = prefixes2[lastTerm.normal];
    lastTerm.implicit = found;
    lastTerm.machine = found;
    lastTerm.typeahead = true;
    if (view.compute.preTagger) {
      view.last().unTag("*").compute(["lexicon", "preTagger"]);
    }
  }
};
var compute_default8 = { typeahead };

// ../../node_modules/compromise/src/1-one/typeahead/api.js
var autoFill = function() {
  const docs = this.docs;
  if (docs.length === 0) {
    return this;
  }
  const term = docs.at(-1)?.at(-1);
  if (term?.typeahead === true && term.machine) {
    term.text = term.machine;
    term.normal = term.machine;
  }
  return this;
};
var api2 = function(View2) {
  View2.prototype.autoFill = autoFill;
};
var api_default9 = api2;

// ../../node_modules/compromise/src/1-one/typeahead/lib/allPrefixes.js
var getPrefixes = function(arr, opts2, world2) {
  let index3 = {};
  const collisions = [];
  const existing = world2.prefixes || {};
  arr.forEach((str) => {
    str = str.toLowerCase().trim();
    let max3 = str.length;
    if (opts2.max && max3 > opts2.max) {
      max3 = opts2.max;
    }
    for (let size = opts2.min; size < max3; size += 1) {
      const prefix6 = str.substring(0, size);
      if (opts2.safe && Object.hasOwn(world2.model.one.lexicon, prefix6)) {
        continue;
      }
      if (Object.hasOwn(existing, prefix6)) {
        collisions.push(prefix6);
        continue;
      }
      if (Object.hasOwn(index3, prefix6)) {
        collisions.push(prefix6);
        continue;
      }
      index3[prefix6] = str;
    }
  });
  index3 = { ...existing, ...index3 };
  collisions.forEach((str) => {
    delete index3[str];
  });
  return index3;
};
var allPrefixes_default = getPrefixes;

// ../../node_modules/compromise/src/1-one/typeahead/lib/index.js
var defaults2 = {
  safe: true,
  min: 3
};
var prepare = function(words2 = [], opts2 = {}) {
  const model5 = this.model();
  opts2 = { ...defaults2, ...opts2 };
  if (is_default(words2)) {
    Object.assign(model5.one.lexicon, words2);
    words2 = Object.keys(words2);
  }
  const prefixes2 = allPrefixes_default(words2, opts2, this.world());
  Object.keys(prefixes2).forEach((str) => {
    if (Object.hasOwn(model5.one.typeahead, str)) {
      delete model5.one.typeahead[str];
      return;
    }
    model5.one.typeahead[str] = prefixes2[str];
  });
  return this;
};
var lib_default8 = {
  typeahead: prepare
};

// ../../node_modules/compromise/src/1-one/typeahead/plugin.js
var model3 = {
  one: {
    typeahead: {}
    //set a blank key-val
  }
};
var plugin_default13 = {
  model: model3,
  api: api_default9,
  lib: lib_default8,
  compute: compute_default8,
  hooks: ["typeahead"]
};

// ../../node_modules/compromise/src/one.js
nlp_default.extend(plugin_default2);
nlp_default.extend(plugin_default8);
nlp_default.extend(plugin_default7);
nlp_default.extend(plugin_default9);
nlp_default.extend(plugin_default11);
nlp_default.plugin(plugin_default3);
nlp_default.extend(plugin_default12);
nlp_default.extend(plugin_default4);
nlp_default.plugin(plugin_default);
nlp_default.extend(plugin_default6);
nlp_default.extend(plugin_default13);
nlp_default.extend(plugin_default5);
nlp_default.extend(plugin_default10);
var one_default = nlp_default;

// ../../node_modules/compromise/src/2-two/preTagger/model/irregulars/plurals.js
var pairs2 = `
addendum addenda
corpus corpora
criterion criteria
curriculum curricula
genus genera
memorandum memoranda
opus opera
ovum ova
phenomenon phenomena
referendum referenda
alga algae
alumna alumnae
antenna antennae
formula formulae
larva larvae
nebula nebulae
vertebra vertebrae
analysis analyses
axis axes
diagnosis diagnoses
parenthesis parentheses
prognosis prognoses
synopsis synopses
thesis theses
neurosis neuroses
appendix appendices
index indices
matrix matrices
ox oxen
sex sexes
alumnus alumni
bacillus bacilli
cactus cacti
fungus fungi
hippopotamus hippopotami
libretto libretti
modulus moduli
nucleus nuclei
octopus octopi
radius radii
stimulus stimuli
syllabus syllabi
cookie cookies
calorie calories
auntie aunties
movie movies
pie pies
rookie rookies
tie ties
zombie zombies
leaf leaves
loaf loaves
thief thieves
foot feet
goose geese
tooth teeth
beau beaux
chateau chateaux
tableau tableaux
bus buses
gas gases
circus circuses
crisis crises
virus viruses
database databases
excuse excuses
abuse abuses
avocado avocados
barracks barracks
child children
clothes clothes
echo echoes
embargo embargoes
epoch epochs
deer deer
halo halos
man men
woman women
mosquito mosquitoes
mouse mice
person people
quiz quizzes
rodeo rodeos
shoe shoes
sombrero sombreros
stomach stomachs
tornado tornados
tuxedo tuxedos
volcano volcanoes
`;
var plurals = {};
pairs2.trim().split("\n").forEach((line) => {
  const [singular, plural] = line.trim().split(" ");
  plurals[singular] = plural;
});
var plurals_default = plurals;

// ../../node_modules/compromise/src/2-two/_built/lexicon.js
var lexicon_default = {
  "Comparative": "bett1cold1f0;arth0ew0;er",
  "Superlative": "earlier",
  "PresentTense": "bests",
  "Condition": "lest,unless",
  "PastTense": "msged",
  "Participle": ":e01gnuZknuYmuws,n2t0;hguos,li0maerd;ps,ub;e8ials,ro7ugeb,w0;ard5e4o0;hs,l2r0s;g0htN;!tY;b,f;rFs;!htiw;b,t,ws;ddiKesIkDlBs9t3v0;i1o0;rp,w;g2rd;ae4sah,t0;i1og0;!rF;b,rw0;!er;!b;ir0ohc;!a,pu;laf,o0;ts;a1o0;ps,w1;hs,sr5t1w0;!a;!reC;!r0;eAof;br0h,r;of;rhs,s;lc,r0s;!w;no0vod;d1g0hs;!rednu;nu,re1t0;uo;vo",
  "Gerund": "doin",
  "Expression": "a0Yb0Uc0Sd0Ne0Lfarew0Kg0EhYjeez,lVmUnSoNpKsItHuFvEw7y0;a5e3i1u0;ck,p;kes,p0;ee,pee;a0p,s;!h;!a,h,y;a5h2o1t0;af,f;rd up,w;atsoever,e1o0;a,ops;e,w;hoo,t;ery w05oila;gh,h0;!h,m;here nPsk,ut tut;h0ic;eesh,hh,it,oo;ff,h1l0ow,sst;ease,s,z;ew,ooey;h1i,mg,o0uch,w,y;h,o,ps;! 0h;hTmy go0wT;d,sh;a7evertheless,o0;!pe;eh,mm;ah,eh,m1ol0;!s;ao,fao;aCeBi9o2u0;h,mph,rra0zzC;h,y;l1o0;r6y9;la,y 0;c2fuck,hFmoDs0;hLmok0;es;ow;!p hip hoor0;ay;ck,e,llo,y;ha1i,lleluj0;ah;!ha;ah,ee4o1r0;eat scott,r;l1od0sh; grief,bye;ly;! whiz;ell;e0h,t cetera,ureka,ww;k,p;a0rat,uh;m0ng;m1n0;!it;it;mon,o0;ngratulations,wabunga;a2oo1r0tw,ye;avo,r;!ya;h,m; 1h0ka,las,men,rgh,ye;!a,em,h,oy;la",
  "Negative": "n0;ever,o0;n,t",
  "QuestionWord": "how3wh0;at,e1ich,o0y;!m,se;n,re; come,'s",
  "Reflexive": "h4it5my5o1the0your2;ir1m1;ne3ur0;sel0;f,ves;er0im0;self",
  "Plural": "dick1gre1khakis,on0records,stori0;es;ens",
  "Unit|Noun": "cEfDgChBinchAk9lb,m6newt5oz,p4qt,t1y0;ardEd;able1b0ea1sp;!l,sp;spo1;a,t,x;on9;!b,g,i1l,m,p0;h,s;!les;!b,elvin,g,m;!es;g,z;al,b;eet,oot,t;m,up0;!s",
  "Value": "a few",
  "Imperative": "beware",
  "Plural|Verb": ":s0;drehpehs,eCkoElBmooDnAr2t0;iurcer,ne0ol8soh,uocs;r4tnC;e2o0;htua,t0;cod,nem,ut;e1hsu,ntr0;ap;n0tnulov;igne,o0;ip;iatpac,oipmahc;lib,oof;diug,gduj,hca1illub,rauqs,ssentiw,tauda0vael;rg;oc",
  "Demonym": ":!1:#$%&()*:na,ra,ni,ro,il,ne,or;cid#leci,d$i#ps,e0Nh0Ki0Ek0Dn2o1ssiws,t0ysagF;aCiU;al,%p(if;a1e0;ireg2mkrC;buc,c04d#03e01hgfa,i5l4m2omas,rudnoh,uga$c1xet,y0;auga$p,bM)k;in;hsi0rQ;lg),ri;ametaug,euze)v,og#;a#hg,bSdPgMlJnBpoihte,r6s3t1v0;(Btal,urep;a0iah,pyge;*c;a,enod%,in1sur,u$lKy0;al9;ut;ag3e1o0t0Hys;dauce,vi;b8g0;in,la;lub,nuh;a4em$,i3o1&f(Fs0;ob;dec0*emDtse;am;arku,tselQ;bla,d&j,m1ri,uht0;(;anN*;a1iza0ognH;rb;mos,rt02ti;ew&n,l1&0;eg;eb;a0%,obm1;di%rt,hc,n0;ac;iman,m0rR;a0olP;g,z;liJp*ue,&0wbabmiz;k,pag%s;gu,wr;c*2i0;amH%mod,r0xem; otreup,ema,fa;om;avols,eerg;aht,d3hsedalg#b,learsi,#1qari,$taq,t0;arime,iawuk;mo,tsik0;ap;%h,u0;as;c1kazak,s0;ittocs,lew;ezc,)rf,tud;deCisBn8se0;l4manteiv,n0ugut&p;a1i0;hc;bel,dus,p0wiat;aj;agen1ogn0;oc;es;ad,i0;pp(ihp,t)g0;$;sua;ws",
  "Organization": "!1:#$%&()*+-.<=>?@[]^_`~:er,on,re,an,le,ar,en,da,st,in,te,e ,ca,al,to,de,na,co,li,ch,ce;0:4Q;1:3Z;a3Vb3Dc2Md2Fe2Af25g1Yh1Ri1Nj1Lk1Jl1Gm13n0Ro0Op0Equ0Dr04sStIuDvAw4xiaomi,y2;amaha,m>,ou2w>;gov,tube;a5e3iki2orld trad=org&izati$;(aRpedia;lls f)go,-2;field,.ghouse;l2rn# bros;g%*s,l -%et journ?,m1C;& h?P#iz$,isa,o2;+f$e,l2;kswagNvo;b5kip,n3ps,s2;a @+y,ps;es^,i2;(v#,<d ]ti$s;#,s; mobi(,a^ beTd bQe8gi fri+ys,h=4im hort$s,mz,o2witt#;shiba,y2;ota,s r us;b3c)p*3M+ily ma1hol_0s2who;mash.g pumpk.s,up%m0;ea2lack eyed peas,yrds;` boys,tl0;l3n3Us2xas .-rum*ts;^,la m1F;ef$i>,us;aCcBe8iem*s,mirnoff,np,o6p5qua%0Dt2ub)u;a2e#02;rbuc2@1;ks;eci2Cic=gir5;ny,undg)d2;*;a3x pi-o2;ls;g1Wrs;hool1Si*@logy;feway,.sburys,(sfor~,msung;adiohead,b9e5o2y&air;m& empi%,y? 2;b2dut` she5;&k;a4d 2max,vl$;bu2c2Bhot `i_ pepp#s,lob-#;ll;d#s dige-,l madrid;c,s;&tas,iznos;a9bs,e6fiz#,hi_p5i4r2;emi# 2ud*ti?;(agTo1;nk floyd,zza hut; morrCs;psi3tro2ugeot;bras,`.a,]s;!^;l&tir,n2yp?; 3as$ic,+2Q;ld ]vy,pec,r&g=ju_3xf2;am;us;aAb9e8fl,h7i6o2sa,vid5wa;k4m.at3t% +me,v)t2;is;.g1F;ia;ke,nt*do,ss&,vV;l,s;c,-(,tf_x,wsweek;a,c;ndos,s3t2;o,we-;a,c),+q;aDeAi7lb,o4tv,y2;spa2;~;b1ns&@,ody blu0t2;(y cr2or0T;ue;c3t2;as,subisM;hel.,rosoft;di>3r~[s b*z,t?_2;>;id,%;cs milk,t<l,z+;a p%sse,e2g,itt( >es)s; o%?,novo,x2;is,m)k,us;atv,fc,kk,lm,m2o+k;)t;iffy lube,oy divisi$,pmorg&2sa;! `ase;bm,hop,k4n2tv;g,<2;l,rpol;ea;a7e6i4o2sbc,yun+i;m=[p2n+;ot;tac2zbollah;hi;?thYw(tt pack1V;l_burt$,sbro;*#? 6hq,ithub,l5mb,o2%* +y,ucci;ldm& sa`s,o2;dye2g(;);axo smith kl.e,*^Z;e(ctric,m2;o@rs;a5bi,c b)~lo4+,e[x,i3(etwood mac,o2ri@ lay;rd,xc$;at,fa,%-$e;];~book,nni=mae;bay,sa,u5x2;ecutiveYx$2; m2m2;ob1;!ros~ptics;aiml#,e6isney,o5u2;nk. d$u3p$t,r& dur2;&;ts;j,w j$0;a,f (pp17ll,pe`=mo[,r spiegel,-.y's `i2;ld;aObc,*trMhIiGloudflaFnn,o4r2;aigs_8eed*c=c()wat# %viv2ossra1;?;cA.ba9l7m3n2ors,-^;f#*~Jg%ssi$I;>4m#~3p2;aq; bo0Y;-;dplVg2;a<;se;a c2o `&T;ola;%;a,s^2tigroup;! sy-ems;ev3i2;ck fil a,] +ily;r2y;$;?2; ^mmit<e;d3pit? o2rls jr;ne;bury,ill2;ac;aFbc,eCfAl6mw,ni,o2p,%xi<eV;ei4mb)diJ-$ 2;glo2pizza;be;ng;o3u=c2;roW;ckbu-# vi[o,om.g+2;(; g2g2;oodriM;`t3=ge0rkshi% hathaw2;ay;el;c)di,idu,n&a %publ4s2xt6y6;f,k. robbi2;ns;ic;bYcUdidT#osmith,iSlLmFnheus# busEol,pp(Br7s5u4v3y2;#;is,$;di,@[sk;hl&d o1socia<d F;il;b4g3m2;^;os;ys; ^mpu2be0;<2;rs;`;c,d,#ic&4t2;!r2;ak; ex2;p%2;ss; 6><l3ta2;ir;! lu2;~2;nt;jaze#a,qae2;+;g,rbnb;as;/dc,a[my of sci*c0#,tivisi$2;! b_zz2;)d;es;ba",
  "Possessive": "its,my,our,thy",
  "Noun|Verb": ":!1:#$%&()*+-./<=>?@[]^_`~:ts,er,ps,rt,hc,ed,hs,ra,oc,ne,ni,na,rc,xe,ca,ar,lf,ro,us,op,el,rp;0:AT;1:AH;2:8V;3:B0;bBBci<p,dA8e62f5Zg5Qh52iks,k4El3Tm3Jn2Xo2Wp2Cr1Is17tQwMxJy6z4;iuq,tilb,z4;aj,u7Z;aEbbol,dDeBl8p7r6spoib,t5v4;`,.;ip,+p;c,f,ot.v/,]w;-,s;f,la5p4;$,p^;r,t;k4~,vr^;!nom;em1u#;l4p,r%,#;),p8L;a5)/,i4ob;f,m;t,w;alc,e5o4;*,l6Xns,rht,v;iv4=s;!$,ret/;a0Hbuod,c0Ae08f05hgi03iXlWnLoJpmetta,rEs5t-yob,u4>t;b),c;aAe8i7o6u4;ah>,b,l,r4;!ht,t;c,ob,p,rf;l,ssa,wt;gid,r4t7Juq1v+h;!et/;c4o3Tr2Z;!daorb,$of;a7e6o4u0;fm0p4s1;$,p^,>;s6Tvn0;d,(,p,#9P;ir,o4%,&,vip;b,l,r;aCe8i7u4;ah,h,o4;c4m;!?;ap,h,_,~;c?,i],m4r,sn0tap;`p4g@f,ir8Gm0ucod;m4p^;i,-;lp,r4;!+w;eb,^1;aw,b8d$c,f7h,l6m5p,rem,s4^;iv,_);il,m0ov,rep;%,s;!e.b;!ih>,];f,l4;),hgih;@5i4;g,*,l,rd;c,d;b,g4k+m,n,p,rg1s;dub,+t;a9e5i[n0u4;dn0r#n0;f6j4lgen,%1;b4$,o3;o,^;),fe;!pmi,&>,tn0;bm0e5m]f,o4r;c,[;b,f),h2Tp1&,s,ws;aDs5u4;b,cof,ovz)n1;apAe6i5o4uf;lg,=,t;k,m;c6m,n+h,r4ug;d4go3p,#;!da;?,o3;!revo,yb;g,ib;aVeCiaBo8u4;lb,o4%;b5l0m+,n8t,va4;f,[;al,+h;bal,(9l0n5rrim,sno%,t4va[;?f1inom;oh;!(,p84;bmun,dJeIfGgFhtaew,mmah,n<m,pDt9v7w4;o5s4;<;[,p;i4-;*,uq;aw,l6n5s4tam;am,ig1;ec,u-.;a,e*,if;m4s58;et;gi&,<;f4s<&;o,ub;(,p,#;now,r4;o4um;!b,$;b,cs,e4#,w;b,f,g,t,w2;aLeJiDlCm9o4s@g;h6m,o5p,r4t2;c,d,p;p,#;!s4;!k]w;a5u4;b,d,j,l7Tp;c,#;eh,ug;d,h7l6r5s4t,z;!sog;!d,g,t;c,f,s;c,s4w;!]w;e4#;ls,=;c,`,l,m,ns,r4;!t,w;d1(e;aOeMgisLiGo8r6u5w4;ay,orf;g,r;e2Ou4;b,t6T;it5ri,s4;a1i_;aKc7i5.m,om,se4uac;uq;s4tep;<&,_;n4ua;as,uf;a5-,p2ur,w4;!t;g5(,r4#;!d,t2;!+b;!);dr4$cs,p;ub;b,cs,lp,ol,p2;aBe#,i9lif,ooz,r6u4;s,u4;?v;a5o4;f67#;!f,h0Bla;a4&;!lc;$4h,j,%,r3B;d,#;aLeFiCl6o4ruc;_,r4;tn0;a8e7i5o4;p,r2St;k,%,r4;d,g;ms,%,t,y;beye,c5Tf,#;a5c.p,o4;!f;b,f,m,s,t);b8c>,dom,e7nn6snu0u5v4;a&,`;d,f;a(,ut;f,hw,k,p,r;al;e4ngis,ri%,tot,vir;d,p4s,v1;$,pa;aeQcH$t,lFnCooBr7s4;a5i4;hw,r;!m;a6ims,ow4;!t4;en;b,m1p2;b,h,l;a5i4;!l04rd,s,#;b,r;a4im;t2w;a9e8i6o4uf;d,*,l4m,nk,r;!b,f;k,l4p,&,t2w;!c;(,rw;b,h2l,p,r5s,t4;s,ta;!c,t;l,p,rb;cGguFp@gotohp,s8t4;r6u5wo4;rg;om;ow;a8e[,i6u4;p,r4;!b,c;d,f,l4/f,w;$,_;b,c,h,l4m2=,w;f,%;al,-;aBe`,n9+8t5uo4ysp;ls,t;a5$#,i4;b,d,#,ws;c,h,l,m,p2K=s,w;!es;@b,u4;al,p;e4o~pa;l,r4;!b;aBn7o5u4;h,lp;b,f,l4;!atac;a6i4;r4w2;!%,#;b,g;g,[,rd,t;e5f4oor;a#,u#;eb;b37c2Id2De2Bg1X(a,i1Vk1Pl13m0Wn0Qo<c,p0Jr05sQtFuDv6y5z4;ag,eens,is,oo;d,e;a9i7los1o6r4;es4uc;!e3;l,m;d,(4rd;+;c,*,w;c,l4ssi;av,g;a8i7o6sa5u4;bi&,mm0or,%id;p,t,w;n,v;b,%;bZc8d7g,h,icos6mi#e,/d]0r4#;!emolgn0t.4;cn0;sa;!nLpu;ilpud,ovda;aFiA.9_,pall0r8u4;a6ba,c>,f1oh4;!$4;aw;c,p;ev1oh,un;cil,s;a7cre>,(<Hmo~2Xr5u4;gsid,rb;!pr4;^;p,r3C;b,e5h4;crup,p;l,=U;aFiDoCt.c,u5vueon4;am;c,gif,s8t4;aef,c5.v,pKr4;ot;a4`;rf;a4se3;em;c2*,p,#;f,h,s4t,w;);c2d,*,l4#;f,g;a6i5o4yt;h,r;p,w2;c5*,r4;!cs;se;ac;i6o5u4;~,t;b,hp,rd,t,z;bm0l4m,p;!c4tuo;),/;a8it,m@7-l6u4yhr;fr4s1;ep;ew;go3;g,l4n,rf;b,f;aObJcric,dnIffuHgFiCk9oh,p8t5u4yS;dehMr;s5t4;ab,ob;ihw;aNmas,u0;c5/r4;%,w;iCub;f5ms,p4t;!kcoI;!o3;gurGn4;at;*;ah;b6mu5uo4;&;rg,#;ir4ub;cs;cs,h/;a7i5o4;j,ms,r5;b,h,lsYr4;#;c,[,m1ns,r,#4;!im;l,t;?;aFdCn8r4;a5em,u2;!s;b,(4;!sO;a5`la4ulp;(;(4r;!>;e5i4od;rb;!h;!k?p,mad,r,t4;<vdasFs;p,t4;!<+ug;a5i4-;r0Zs,t,vB;*,r4;g4t;!pu;aOiJn8]6u4;do3r4;%;f,v4;id;aAe4;f,i6l5ref1tnEu4;[KqD;is;.vn-Ir4;ep4;>;d,l6n5v4;da;if;ab;fi=Nl7ov6~,t5uj,vr4;es;?3on;!/;_,s;!f4l0Ar;!r4;et4^;/;i4o3uc;rb,v;aZeWiVlSnIoGr6uo5wo4;=;lc;a5-4;?,$;c,g1ob8ug6w4;a,$,r4;of;!ef4;as;!eta4;ks;$;n,o4;[;aAe9i8ob,u4;f6o4;p4rg,s,w;!m0;!$;b,m,rg,w;!b,lb,&;b,h,l,m4rb,#;),m0;-;ei5o4;f,h,m;f,*,y;a,b,k,ov;e4*;co3f,n,%,rb,s,w;~;e6ol4;!nw4pu;od;h,l5r4;ht,%;!p;ap;ad,m6os,r5u4;d,lc,r,s;uc;ob",
  "Actor": "!1:#$%&()*+-./<=>?@[]^_`~:st,er,en,on,re,ar,ess,ti,it,te,nt,ss,ri,an,le,in,ce,de,is,or,ch,at;0:7B;1:6B;2:7G;3:7F;4:7O;5:7K;a6Ob63c4Td4Ae40f3Rg3Ah2Zi2Tj2Pk@2Ol2Jm25n1Yo1Rp0Vqu0Tr0JsQtJuHvEw8yo6;gi,ut6;h,ub0;aAe9i8o7r6;e#l0-0;m1rk0;fe,nn0t`,z)d;~h$m1ld0;ge e)n0-0nd$0r=2;et$7i6oyF;l5Ioli56p,s3Yzi0;>,@a2T;n6s0;c?,d$03;ao^ea`,e9h$api5iktok0o8r6yco&;a6%dseLo42;d0mp,nsc=0Bvel0;ddl0u1F;a0Q`n7%6na4#0;ag0;i3No0D;aiXcUeRhPiMki0mu25oJpGquaFtBu7wee6;p0the)t;lt1p$7r6;f0ge&,viv2;h6i/%0I#),v^2;$o,um1;a8ep7r6;>g0eam0;bro2Mc2Nfa2Mmo2Msi1Z;ff0.sm1;tt0;ec7ir-,o6;kesp5Ause;ia5Kt3;l7me6An,rc$e6ul;r,<;di0oi5;n7s6;sy,t0;g0n0;am1ow6;girl,m1r2P;c(tIni_ c-3Er6;gea4v6;a4-2;hol),i7(%6ulpt2;wr2B;e01&;l2/;aEe9o8u6;l0nn6;$ up,@gE;gue,? mo]l,of0;a50c8fugee,po31se)Qv6;$%d,olu+&6;)y;e6luXru21;p+o3U;bbi,dical,pp0;)t$6e%;back;aXeVhRilg=m,lOoKr8sy`o7u6;nk,pil;logi5;aGeDiBo6;d9f*2g7phet,s6;pe2J+tu.;%6ramm0;-2y;igy,uc0;e#4On[6s3F;!<;a7si6;]4;`0;c++3Ank0O;dca0Net,li6pula50rn#);c2H+c6;al scie6i1;n+5;a6umb0;nn0y6;$,ma.,w=ght;a8iloso7otogra7ra6ysi1V;se;ph0;/om,rmaci5;r6<i1T;f_m0s&;i3Hl,nel40r8#2tr6wn;i6&;)Wot;%tal,iah;ccupa4ffBp8r7ut6;ca5law;ac?,g>iz0ig2Hph1;$3t6;i1Jomet6;=5;ic0sp=ng;aBe9ie[,o7u6;n,rs$3L;b6mad,vi[;?2Yody;i6mes^,phew;[,ghb2;nny,rr3t1X;aEeDiAo7u6y#ic;m8si16;d$3gul,m7n6th0;)Dk;!my;ni7s6;f-,sus,t0;&,#0;`>ic,r`a4;gi9k0n8rtyr,t6y2;e,=)6;`;ag0iac;ci1#ra.;a7e2Cieut%a4o6;rd,s0v0;b_0d7ndlo6<,u(a.,wy0ym1;rd;!y;!s2B;e8o7u6;ggl0;gg0urna2W;#0;c&,dol,llu3Vmmigra4n6; l9[l,fa4habi43nov3s7ve6;/2#ig3;pe0Nt6;a1Hig3ru0M;aw;airFeBi#oAo8u6ygie1M;m>6sb>d;!-a8;bo,#6usekN;age,*;=1;ir,r6;m7o6;!@e;-;d(<0#y2E;aLeIho#Girl28ladi3oCr>d7u6;e5ru;c9daug0Jfa8m7pa6s&;!(4;a,o6;th0;hild;al7d6lf0;!d*;ie,k6.28;eep0;!wr6;-0;^ha,n6;i6tl04;us;mbl0rd%0;aDella,iAo7r6;eela2Oi%d;e,(6#$ pa(4;be),m1r6#0;unn0;>[,gZlmm1An>ci0r6tt0;e6# lady; m)shal,figXm1;rm0th0;c&oEdD?ct=Cm8n7x6;am@0[ll%cy,i?;emy,t(pr%eur,vir&m%ta1L;c8p6;$2loye6;e,r;ee;ci1;-2;mi5;aKeBi8_k,=7u6we04;],t`*;ft0v0;ct3e+7plom~,(6va;ct2;ci1+1;aDc_3f%cC-y,nAput9s7.ctLvel6;op0;[1He6ign0;rt0;ee,y;iz6;%;em1;c&,l0;d8nc0(]v7ug6;ht0;il;!dy;a09e07fo,hZi+z%YlVoCr9u6;r3#om$6;! (p(s%t~6;ive;e3i6;$,t6;ic;lKmHnB_dArp_al,u7w6;boy,_k0;n7r6;i0+0;ciUt*;@3;fida/Ag(<Ts9t6;e0Kr6;ibut2o6;ll0;tab?,ul1N;!e;edi1m6pos0ra];a0EeRi<i6;&0;?ag8&7um6;ni5;el;ue;e6own;>0r6;ic,k;!s;a9e7i6um;ld;$?6f;ad0;ir8n[7p6ract0;la@;ll2;m1wH;?b=6o;ty;dAr6shi0;e7pe6;/0;r,t6;ak0;et;aMeLiJlogg0oErBu6;dd0Eild0rgl9s@*6;m1p7w6;om1;$s&;);i7o6;!k0th0;cklay0],gadi0;hemi1oge8y6;!f=e6;nd;ym1;>;cyc6sQ;li5;~box0@gs;by,nk0r6;b0&7.6;nd0;!*;c03dVge4nPpKrGsEt9u7y~ull6;ah;/6tG;!ie;h8t6;e6_ney;nda4;ie5?6;.;s^00tr&6;aut,om0;`b^8i#7+s6;>,t;ocrU;hop;o#9p6;)i6r%+S;+6;&;?;a9[#2im3nou8y6;bo6;dy;nc0;ly5rc6;hi5;mi8v6;%tur0^2;$;ni7r6;al;#r3;~2;_;counBquai/>Arob9t6;ivi5_,(6;<;#;~;[;ta4;/",
  "Adj|Noun": ":!1:#$%&()*+-:re,er,al,ra,ni,oi,ts,oc,ne;%linav,ba&,ci18d12e0Ef0Cg(0Ahs09k08lUmQnLoKrGsDt2woll6xelMy0;bbE&0;n)siv,ropmetn+;a9$cFhgil,lu8n4#pxe,s0;ap,eb,i0;car,laicIn0rorY;im0)ss$pmi,#dom,u01;ef;a2e0;bmucOc0dis$,itap,tOuti*n+,vlE;onNselo1;i&v,*M;da;f,uqs;ioegruFria*pu,se0tun;cxe,lem0;oh;a$,e2iaf,)0;n0#pus;es;dle,imeItt%,vlis;obat,rp;a3e2gie#v1)na0;pm+;os;et,kot;cilbupUidem,t;i#t6ott2u0;i0rdmuh;dem,me9;ob;a1e0lews;bOvon;cid)#p,edi,i7n4pic(5r2t1udivid0vo;(;nLrX;e0om;bil,-g;im1)ssefo0;rp;#t;c1r0t-top;es,t;iE#0;mmQ;c%s,n%b,r2;ar,ibbur,ul;ggan,lr0nnuc;ad;ei0lah;hc,rb;ci*Mdurc,gas,lF(ErutDt7v0;arg,i0;s-4t0;a1iguf,pac,uce0;xe;l0n#tla,#poEt-s$p0virU;$;ffo;a3$cnBi0urb;le,r0soppo;ov0uov0;af;(drob0udaD;us;ai(m,uf;&m,tuor;am5b2i0os;b0-v5;om;a1it#vn0;+;irF*;!ef;uj;ehs#taw,iu3lo2n0&dna*;obagBuo0;rg#dnu;c,g;lf,q0;il;hparg4m3pe,rt2ss%c,t0;anul,c&0s%p;!tna;em;edaca,+;!om0;ed;av",
  "Adj|Past": ":!1:#$%&()*+-./<=>?@[]^_`~:ts,er,rp,re,cs,ar,es,ro,uo,la,ne,mi,ed,ht,ra,xe,ni,el,ol,as,us,ps;0:4P;1:3A;2:3U;3:4R;4:43;5:2C;d9ekow,n7t6;*pu,f],nrub,s^,uhs;e6+w,wonk;korb,zorf;e6n-b,oo#&dnu;br4Qc4Gd45etu_,ffu4g3Sh3Hi2Wk2Ml27m20n1Mp1Hr0Xs0JtIvEwDxiCyaBz6;a9i6;disb`,.6mo#uc,nag+,+>ua;ice~,rt/c6;!=;d,ma;c2l2;f,m;en0^ley;iec0lov1o7&s6;bo,$;l,m0%6;!<;aRb=1cLeg?t,fiJhgil2iIlem,nEoDpC+Bs8t6um;if,o6;nk,~,r;ap,e7i6ujda;l,wt;gg`,r2Ruq0;p<,#3;ecca,oda;n,uq,v2;ahc/,emg8i7-6;(3m;ap,op,%;)f,ua;c@,<l,nu,v1;g,l6;pu;e6ir#0;f9j0l8p6r3to%;s6@;$,`;*,gen;fa,[,&p;cIdHeGiElB<A[9picitAr8#,vit6;l6om;uc;b]ec,egga@,g27oc2t/cn5ut_;(af,mulli;na;e7f1osi,u6;c.c,g0<s;!r;c6ruf1;aG$ppa,o0S;h,p0s;!ilo04pu;i6ude;d2lpm5xot1;aGiuF/cEoCs7u6;!cof,fn5;)?b9e6ip;co%,lb,r6;p6#3;!=,po;me;lc,p6;o%,@;il;rb;b,e6ib;l6rc1t;$,p;aOb1eGiFoErCu6;cAj1o9s7tca6;funam,rf;a6/,sa;em;l5vaG;!*;efe6i4;d,%;b,l5#0vaC;~1t,uq0;dB>Wmmah,t6v5;.,s8t6;a6ulc;b,(;ig0u6;lf;i6liweb;sn5;(,ef,hs,p$p;a(e,ir4m8^ev2p6?w,yto$e4;)t,i6;r4uqe;)c,u6;p,#;eFiAn8o7ru6;b,t;dnaba,sa*;a6u4;lp,t;a7bm5fe6lpi1Em&t2oj;d,r;r7#6;!`;!d,t;$(,>gn$4k8pmad,t6;a$>,hgi6;rf;aew;aBlehwV<Pr7u6;ssa;a7of6;=,[;!h6.;!c;e4rf,t;aJbHcyc0eFffab,iDk[rw,l9t7zz6;ad,up;nurgs3t6;*,ob;i7ortn5;oc;hc,r6;g,>;a6ob;f,t2;ll)ap,v6;];_3muh,-6;rt;*;aEcAiZo7?6;m,p;ms,o6#;c,h,l6;&vo;a7ip,o6;hs,l;p,r6;c,t;b,os;fAl8pucco7r6t;av,d,f,+w;!$p;l),p6;<,pa;i6sit_;ceJdIlGnFrEsAt6;)8r7s6;uj,ym;ec;!g;n7sa6;lc;et1;[;ev,+h;g3u;auq,pm6;is;e,om;~;cDs6;aw,i6uT;l9n6r-n;i7r6;at;f,m3;bat6op;se;+7ta6-t;>,r6w;(;aCdA].,g8n6?hc;)2^oV;=;a6ulp;j,n;]wonk6uj;ca;!c,gUm8n7r-6;(3;am;ad;#;_;aFeEiug,n9oc,r7wo6;rc;a6oc0;ug,wa;apGe7ilb,u6;ow;mmoc0~7t6;[,@;`;en;f,hs,^;alp0n7&ip,ud6;$,o7;a8ei&p7-no6;%;@;h8l7v6;da;ab;/;$;os7u#3;id;ba",
  "Singular": ":!1:#$%&()*+-./<=>?@[]^_`~:re,oc,ni,na,et,ir,ra,ta,ts,ht,er,ro,am,ed,or,ot,it,oh,el,on,ci,ne;0:5T;1:5Y;2:51;3:5I;4:5C;av_5Z`5Id4We2Qfeihcsim,g2Jh29k26l1Hm1Dn0Zoy oy,pu g^,r0Ks0Jt04u02v01wZx/ t,y5;aWdVgQlKmJnnIppHrAs6t5;e)av,ic;p7s5;abme,u5;h,p;@ua,yg;a6o+5;ngis,<bal,v#3F;l8&7t5;i5~mucod,_,u1O;lim,ng2;c,rg;as,grDubacov;op,up;arg,ub;mut,_$e;=o&,f8i7l5op_om,po&p;a,e5of,ug;b,j;maf,od;dag,/if,nogaI#tt5y=;ub;(ar-,g8iffe,%.,#5;l6n5;e,ys;c,la;ip,od;egart,ob;r5w; x,*;eiv3Do5;hs vt,r;>,t;~m,r. evi5;rd;cEev,hg) &muh,~7s5u&ep;af1Fi5;aw,eh,rw;csAd8i7lat,r6t5ve;n$s2xe;ef0#t4;`ffe$,lc,pic0touq;ic5?,u-;ca,%;!a;e6i5;d#v,r-2;l6ps5s29;a,?p;a2l(%;e`d%,#.o,ucu1;aFe5ood;faw,i7m<f0n6y5;al;n2wo;calg,da~Wh1l>&3p9r6ssod,t5;!em,n?f;d,r5;a5(;b,c;!$5ucco;!@W;c,ewr2Al5%mes,w livic;l5pmexe;ec,ip#t1o5;c,d su;aGe9i8o5rut/ xat,ur0w?b hsah;[5ss^,tn1;`d/p,isop5;/p,s2;su$,+leg;g]+p,iAk9%l,s]#d^,t7v5;a5o;eh,h,r;^eks,ti5;k,m;`3opstuo;la,pas;e5ol tn>u-;b,co;a6e5o?,ume.&syr3;lb?p,%m] da,-ys;(,ls d&5;rg;aAebal dr$0l8o6ufd&h,wob5;! r3M;]cs5*c s=-)3;! h1F;ac en5iX;]p;binn1cMdeLeKiImGnErAt6u5;rcca,t);eJi6@bus,<p,s>ep,t5;iuqca,ub0;c0p5;ac,s];de.1en7r5um;efe5$;d,r;im,uf;ac,es*,)u,ruoj,u5;b)t;i5m=;c4&;n4pus*m,r5;(=,@ut,ub;d<,m+o,#c;m,p;>,i+bbM;c6*m noi-e5;uq;iDurt pmud;cDgu?Asi6t5;a4olc;m6n*5*p,tef;g,v;^b,ri5;ks;.5ob,t;kae5;rb;iwdn9nY;ge,ip,%5;ddup,.9k&b,l6n5;eve,%,<m;b6iec,p5;as;is;!_;b)t,dis17g0Yk$,l0Nm0Hn0Cs05tFuqEv6z5;ah;i5#s tfos;ssAt5;a8ce6~c%5om;!s2;j5ps#p;bo,da;go#rp,[iAr1T;im;aHe3inumm$,<t,som;aHiCo8u5;lf,t5;a-,i-5;%;d6nyek,y5;ep,$;ce5[5;&;csibe8dd7n5ps0r,s,teppa,us;!ab5@;ru;ul;lp;b0`f[rGgFipo,lCmi-/Rng=,p,r8t5;e6s5;e,oL;ca; tluaf4b(#v7dyhobr1ip,@c6t5;in,sbus;^e,od;!%;$o3p6u5;sn$;!m(;)f,?rus;ec;a^/ sseAi6opr5;up;dar7me8r5;h5nus,p#t~;gih;ap;rp;ac,o5;em7hpdaeh,m<h,t5;r5s;>nu;os;ag o>iv,i8o5;h,s5;e/5ruof;.;l,t5;#vo;ahw,b6pma5;xe;a7i5;cuRdn5;=;ll9t5;e6nr5;ut;g5m[;ev;ys;at7d)5;f,r5tr1;op;l9n6<hs,t5;$;av6ecr5;ep;da;ov;nw5pu;od;rt;eGiEluIn8r5;a5ow;c tide5ug yt)ucN;rc;e5uo* yJ;div2g7if,kc6piOtno5;rf;ab;^;id;leye,maryp,p5rg;il;b7p6+%d<$5;nu;om;aAh+4#6t5;];t6v5;);aw;>;es;dK.e,lHmGnEpoDrBt5;!c9$8si5+;#tca*3+5;-;hc;*n;at;b5@ehr;af;ib,t;`p,i5ut;lc;!>ipe;bup0$,r5;ag;/;em;!as1r5;ep5;us;ac",
  "Person|Noun": ":a0Cbreh,d0Ae02ffilc,gZhtiaf,jd,kXlSmRnKoJrFsDtBxAy0;a8bur,d6ks,l4nn3oj,s2t0ug;i0tik;nirt,raM;iHtap;af,ep,os;il,lo0;d,h;d0naQolem;ap,e;j,r;am,er;a0cidenOeloiv,ra;m,n;dle8kn4rebmaBt0unev;am,tW;e0ime;k1mmus,t0;nuh,top;ab;b,derfTel,lf;a3i2n1ref,w0;ad;if;bGhc;e1itsir0v;hc;d,j;ac,ron;atsyrc,e3iag,l1op,rae0;!p;ah,i0;g,h;wej,zah;c9oo0;rb;n1r0;eb;aw,ik;d6g5i3n2s1v0;e,ilo;or;al,eg,ims3;loj,x0;id;ap;aj;eer,or,r0ub;aw;jed,l1m0yam;la;o0ue;iv",
  "Actor|Verb": ":dreLeIfoog,hcaHkGloof,mooKnEpmDr3ss2t0yll9;c0iurcer,ne6olBpircsnGsoh,uocs;etihcra,idda;entAob;e2o0ueffuB;htua,t0;cod,nem,ut;e3h1nt0;rap;ct0su;ub;n0tnulov;igne,o0;ip;iw;am,iatpac,oipm0;ahc;eeg,o0;oc;diug,gduj,mim,ta0;geled,iliffa,uda0;rg;hpehs,n",
  "MaleName": "!1:#$%&()*+-./<=>?@[]^_`~:an,ri,en,on,er,el,ha,in,ar,is,ie,nd,st,al,as,or,us,es,ne,to,il,ed;0:GJ;1:FD;2:DD;3:G3;4:D0;5:G9;6:CJ;7:F5;8:EB;9:BL;A:FZ;B:FR;aEQbDMcC9dB5eACf9Lg8Lh7Wi7Kj6Ik63l5Dm40n3Mo3Dp2Zqu2Xr22s1Bt0Pu0Mv0AwRxavi2yHzC;aC@0;cChid,ka$a,nAC;!hDkC;!-y;!-72(y;aIevg%BBoEuC;%,rFBsCv>;if,uf;nCsef,[sef;aCg;s,tC;#,h0;nCrosDNss08;.,nC;!ick;aPeNiDoCyatt;jc/ch,lfg#g,odrFutR;lFnC;f8IsC;lCt1;ow;bGey,frEh)m,lC;-d,iCy;am,e,s;~5iC;d,~;e9ur;i,<)l,rn2sC;!l8t1;lDyC;l1^;lDtC;!(;ace,y;aK(nCXiFladDoC;jtech,lodymyr;!iC;mir,sCY;cF*0kt@,nceDrg`,vC;a0ek;!nC;t,zo;!e4Mt@;lCnce,s`y;!%tC;+94;lCm6Q$,sm0;$Cyss];ch,k;aVeQhMiKoFrDurki,yC;!l2r&e,s1;av.,eC.t0oy,um0;ntCFv@,y;bFdAImCny;!?DmC;?o,/,y;!z;i?,y;mCt6;!my,othy;adEeoDiago,omC;!?;!d@8N;!de6;dFrC;%ce,rC;#ce,eCy;ll,nce;!dy;dgh,*,iCnn2req,tsuki;chi,ka;aXcotVeShOiLlobod0oKp%c2tEurDv%A0yCzym1;~,lve=2;aj,]h;#FeDuC;!a9;f#15phE6vCwa9;e6X/;!.laCl8;v,w;lom1rBuleym#e;dDgmu<,lCm1yab&ga;?,vio;!d*rt*,n8;aEeClomo;lCrm0;d1t1;hid,^,qu1Hun,wn,y^;aDba=iDUkou,lim,pp,rgCth,ymour;e1Bio;m6n;!tC;!/,y;e~,lFmEnCqib,_shi,ul;dCjay,t+o;eep,ro;!iAHk)o,mBQu4;!vat@e;aZeUhett,iRoGuDyC;#,ou;b8WdDf6pe9ssC;!)DX;ol00y;#,bLcco,dJ),geIh0lHmGnEry,sDyC;!ce;a$o,coe,s;!aCnBG;ld,n;#,eo;a72f;lio,r;e38g2n8olfo,$C;go;bB9eCZ;cCl8;-do,c7Th4WkCo;!ey,/,y;cFece,gDid,ubByCza;#sh,n05;g/,iC;n>d,s;ep;chid,fa4hH+2j]h,lGmF<EoHp*4sDul,wi$,yC;#,m&d;*d,m6;>D9olph;iro,&;f,ph;ul;e90+C;cy,t1;aNeKh`IiErCyoF;ak?h,eC;m,=1;eDoC;tr;rre,tC;(,ro;!ipClip;!p6I;dro,rcy,tC;-,e98rC;!o7;blo,draig,olo,sc>,t$5RulCv86;!/,o;ctavio,i2lHmG<rej,rFsDtCumAwB;.,_;ama,cAkAm0vCw>d;>do;i,vR;-,(;aDeks#dr,ivC;(,i2;f,v;atNeLguyBiFoC;aD),l0rC;be9m0;h,m;cF)s,g4`o,kDlC;],s;!h`,l?,olaC;!i,y;hCkCol?;ol?;>,d,`,ls1vC;`le;e,h#C;!a4i4;aXeUiLoGuDyC;l],r1;*mDrad,=aC;fa,p*;~,mG;dibo,e,*mE.],ntD$tz,sC[sa;],he;e,y;ad,~,mC;ad,~;cFgu4*i,kElDna_,tchC;!)l;ho[e,o7t1;a(e,eBP*`,olaj;ah,hDkC;!ey,y;aDeC;>,l;),l;hDlv3rC;le,$ll,v4M;di,met;ay0c00gn6hWjd,ksim,lTmadZnSrKsXtDu$c7OxC;im`B6w)l;eHhEi?,tC[,y?;!eo,hCia7;ew,i?;eDiC;?,eu,s;[,w;j,o;cHiGkFlEqu.,s*ll,tCv3;iCy;!m,n;+,&;),o7[;#o,o7[;!)C+,o7[;!l5o;fr~,.h,ny,u4;acDcoCik;lm;hy;amDdi,]h,mC;oud;adCmad;ou;aulC/j;ay;aXePiNloyd,oJuDyC;le,<1;cFdEiDkCth2uk;a7e;gi,s,z;ovic,vig,wig;!?,iC;#o,%;g0nn/,r%EuCvro,w)l;!iC;e,s;!zo;am,n6oC;n4r;a9Kevi,l#d,nHoF=2t*EvC;eCi;nte;bo;nCpold;!a7S),id;!nC;a9y;mE<1rDszlo,ur%Cwr6C;ce,t;ry,s;-,be9&t;aMeH*lGiEla6&rad,rCu5Jyle;.tCzysz_f;i0oph2;(0ngsl8p,rC;`9Vk;~,id;%0iFnCrmit,v4R;!dDnCt1;eth,y;$ck;r,th;cp2mErDspAuC;$;im,l;>,`;a03eXiVoFuC;#,lC=3;%,iC;#,%,o,[;aQeOhKnIrGsDzC;ef;eDhCiah,ue;!ua;!f,ph;dCge;i,&;!aCny;h,s,th6E;#DnC;!ath6C/,n6U;!nC;!];!l,sCy;ph;o,qu3;#,mC;!i,m6N;d,ffFns,rCs6;>d,emDma+e,oCry;me,nimo;iah,y;!(y,rC;ey,y;cKdBkImHrEsDvi2yC;dBs1;&,p2;~,oDrCv.;ett,od;d,s5W;>,]5R.1;a,e,oCub;b,v;ob,qu];aRbLgKke4Xlija,&ut,rIsEtCv0;ai,suC;ki;aD*0iah,maCsac;),`;ac,iaC;h,s;a,v+Cw3;!g;nacio,@;ai,rahC;im;aReLoIuC;be9gGmFsC;eyDsC;a3e3;+,n;b(_;h,o;m2raDsse3wC;-d,/;c45tio;ath,ct@,iGnDrC;be9m#07;d$k,rC;iCy2I;!k,que;n0Pt@;bJlImza,nHo,rEsDyC;a_,dB;#,s0;lDold,r2DuCv8;hi_,ki,_;#,ey;k,s;!im;ib;a07eZiUl%ToQrMuCy@gy;iHnFsC;!taC;f,vC;!e,o;nAtC;(,h2;do,lC;h(DlC;auC(P;me;aEegCov2;!g,@C;!io,y;dy,*m;dfr8nz>o,rDttfC;$~;#,d45;!n;acoFlDno,oC[eppe;rgi5v#ni;be6A],lC;];mo;oFrC;aD*rd,rCt;it,y;ld,rd5;ffErgC;!e7iCy;!os;!r8;bElBrCv3;eCl#d,r4Dth,y;th;e,$4;aXeSiQlO@re=,rCyod@;aH~FiC;~DtC;s,z;$ch;!d40e$10$C;ck,k;nCs2;cEkC;/,lC;+,yn;]L.C;!co,zek;etch2oC;$0yd;d4lC&n;ip;de$FliEng,rC;d+aCg6n#do;<5;pe,x;co;bCdi,hd;iE$C;ce,zC;io;#,%,o;b%ez2dYfrXit0lSmLnIo3rE=eb0th0ug%DvCzra;#,(ett,g%y;!e;iDnCrol,v3w3;e=5/,=;cCk;!h,k;och,$Czo;co,qC;ue;aH(GiDmC;aGett;lCrh0;!iC;#o,o,s;s1y;nu4;be9d1iEliDm2t1viCwood;n,s;ot2As;!?,jah,ot,sC;*;a3%;!dGgAmFoDua2PwC;a2O+;-C;do;oZuZ;/;a04eTiOmitrNoFrag0uEwDylC;#,l0;ay^,ight;#e,dl8nc0=3;m+FnD$0ugCvydGyle;!lF;!>d,nCov0;)l,/,y;go,iDykC;?;cCk;!k;i,y;-muFetDll1mit$7^C&,rk;sh;(,mA$C;ch;id;#dLepak,j0lbe9met$6nI&,rGsEvDwCxt2;ay^,ey;%,+;*wn,moC;<;ek,$C;ck;.,nC;.,y;rt;re;#,le,mKnIrEvC;e,iC;!d;%,iEn)l,rCyl;eC+,yl;l3Zn;n,o,[;!iCny;),lo;iC&;#,%,&;a0He0Eh04i-0lSoKrFuDyrC;`,[;rtC;!.;aF.tC;iaDobC;>;no;ig;dy,lInErC;ey,n)iCy;s,[;nE@,rD=aC;nt3;ad;@;by,e,+,l3t1;aHeEiCyde;fCnt,ve;f@d,t1;m%Dt6;[;s,t;rFuDyC;!t1;dCs;e,io;%C;ce;aHeG$sC;!_C;phCs;!eC;!r;=2t;d,rCs;b4leC;s,y;);cDdrCsA;ic;`;lHmFrC;ey,lDroCy;ll;!o7t1;(1iC;lo;!eb,v3;a06eW`Vj@n,laUoSrEuCyr1;ddy,rtK=2;(;aKeFiEuDyC;#,ce,&;ce,no;#,ce;nDtC;!t;dDtC;!&;#,&;dFnC;dD.C;lav;%,&;!foLl8y;bby,gd0rCyd;.;+e,ke;>,lK;nIrC;at,nEtC;!raC;m,<;aD*C/;rd;rd5;!iDjam3nCs1;/,y;_;kaMlazs,nHrC;n8rDtC;!holomew;eCy;tt;ey;dCeD;-,iC;le;-1Hb18d11f&so,gu=3hm0Xi0Ul07m05nRrGsaFugu=EveDyCziz;a0kh0;ry;o,[;hi;ata,chiKiJjun,mHnE&,tCy0;em,hC/,ur5;ur;aDoC;!ld;ud,v;aC+;#,<5;!),ki;baCe;ld;aMdHg)5tCwA;hoFoC;iDnC;!i5y;^;ny;(7rCy;eDzC;ej;!?,i,j,s,w;!s;s,_lC;iCy;!y;-,iCmAos;^,r,t;aVbSdBeJfHiGl00&Fph&sEt1vC;aP+;&;e,o;so,zo;!sR;!&YrC;~;c,jaHksFssaHxC;!#dC;(,rC;e,os,u;#dCei;-,(,r;<C;ro;%;eDrecC;ht;rt5;dd3+,n,sC;taC;ir;dDmA;-;#,%;ad,eC;d,t;+;so;aGi,olErDvC;ik;i#5;f5ph;!o;mCn;!a;dGeFraDuC;!bakr;hCm;am;!l;>lE),oulaye,ulC;!lDrahm0;#;ah;av,&",
  "Uncountable": "!1:#$%&()*+-./<=>?@[]^_`~:er,te,th,is,en,se,ne,ur,ar,or,in,ce,re,ta,ic,ti,na,us,le,ss,an,gh;0:2B;1:30;2:2I;3:39;a2Sb2Jc28d21e1Qf1Mg1Fh17i12j0Zk0Xl0Sm0In0Fo0Ep05r01sKt9+`],v7w4you guys;-mBh&ky,i5oo4;d,l;ldlife,*;ap.,#[culKi4;*gJol1O>e;eDhB/,o9r5un4yr`ny;a,gs$n;aff?,ea1Ko5ue n.4;%;ops,u4;b^shoot2Ns#s,t;nBo%pas$,wn4;foHsfoH;#4und2;e,mod2S;a,nn&;aHcGeFhEiDkiCoBpAt8u4weeps>k0;g6n4shi;l4shi*;i~t;-;a@08e4;am,el;a<2Heci0;ap,cc2me%29;n,ttl0;lk;eep,/gl0.ts;lf,[$,ri0;eX&s.s;d0Ufe1l5nd,t4;&h,+n;mon,t;abi0e5?4;e,kets;c4/s,laxa0Z)-ch;ogni0Y=a0Y;aAe9hys8luto,o6=4ut1;amb^,m&0s4t4;();l4rk;i25l(,yH; ed,i3;a<,trol;nt4@0K;i0s;bs$tri3v#crowd1Nxyg(;a@o[l )c+i1e5owada4u$lla;ys;ptu*,ws;aBe9o6u4;m4s?;ps;n4o);ey,o4;gamy;a4cha0Dl`choly,rch`d&e,>ll+gy;sl0t;chi4g?,j1Frs,%ema1O;n#y;au~t2e7i6ogi5u4;ck,g10;c,s1K;<,~tn16ngu&1Jt#atVv2;a%2&U_;-a$,/d#g-tQn4;?k#s,ow^dge;e4upit2;a4llyfiHwelry;ns;<,gn.7mp6n4;f.maZt#4;*t,s>$;a@R.t4rov;`<;a8e7&t.y,o4ung2;ckey,mew.k,*5o4rs#adi9spi>li1u) -=st;ky;s1y;adqu-$W=;ir,libut,ppiGs4;hi4$;sh;(e9l7o6r4um,ym[s0Z;a4eY;niT_;lf,=;ut4y<0D;(; edit0G@3;aO?Glo+,o5+nit4;+e;od,rgive4+i2wl;*_;-Dcono0LducaC^ctrAn8quip9%i3v#y7x4;&t5p#4;t&e;(<;body,o*,%07;joy4t#>/4;m(t;?i1o4;ni3;@S;n/gs,%;em&e,i7o5rau~4y[s1;ts;pe,u~,wns>i4;rs;abet0<,s4;honZ=pu4;$;aDelciChAivi3l8o4+r(cy;al,mm(>6n4ral,ttI]coB;f]iHt 4;ed;ry;a_i3o%0;es;aos,e4;eNwL;];d,rP;a9i7lood,owlI=ad6u4;ntHtt2;#;!%;lli-Ks4;on;g4_;ga4;ge;cLdviK#oHirGmCn7r5spi4%^M;r/;i%met4s(4;?;i7y4;o5%4;/g;*;);(6n4;es1;ty;ds;craft;bi3d4[u8;y[4;mi3;<;id,o]4;@3;cs",
  "Infinitive": ":!1:#$%&()*+-./<=>?@[]^_`~:xe,ni,ts,rt,er,ar,ed,uq,ae,or,re,eb,la,mi,ra,lp,it,il,ne,oc,ps,ta;0:8D;1:7N;2:7T;3:8K;4:6T;5:8M;6:8B;7:7Y;8:7F;9:86;A:7H;b8Rci8Pd82e41f3Xg3Th3Ak2Yl2Jm2An1Oo1Lp1Gr10s0RtSwMxi85yB;aIdo7ZeHfFlDn2oCrB;av,c2ub;j4@2;(,pB;[lum,m1;eBs[as;d,+];bo,vn1;lC&Bws;<,rop;`,s;)dhtiw,eFoB;dDl=Cm,nk,rBs,%<;g7Nrob;!ws;ahs6P^;hcse,r%,s;-h0c04e02fi01iX=#,nRol=,pOrHsCuB;cr14.;eEiC_AuB;bm1&4;l4oh,sB#1;b5e79n6R/p;f8g8lom,t~,v21;aFeDoBuh;ba,h#,pB;*,rup,s1M;ssa,vB#;a,b5(,id,$;pBwht;*,>;ada,urCyrcB;*,^;e,rNs3;aFeCiopB.4Ruomr5;$p,pa;l0m/f,s(CvB;e7mucric;!p0;usrup,w;awa,bCc]os,de,ef9fo&0mBo@#,`,siv0+,#;b5da,]2o;ahBih63;$,_;@u,s;ba,g9mmu@,rprB;et8;aEele,iDuB;dBr1A;ba,*;de7p2;d0(,^,rf0s0X;sCuB;cof0$m;aGeBucs3;fErpDsB;bo,sB;a,op;>,p5;n1o7;pr5?h;-ppa,eColiat,ucB;co,n1;bmMdJff3gnIhGpEtB+n1ves;=f,^,sC~B;hs,lf;e+es,i$mda,lob;maBso7;h,p,t;pic2tB;iw,ob;ad4];i.5Zliw<,nB;aBeg4ih,ual;+s,w;em0uB;c4n5W;aEeew,mav0oDrihc,uB;(,oB;c0rg0;hc,lev4;(,ndik;d6gB;e9rB;*6;-lg,eNgiMiaJme3LoHrCuhs,wB;a`,.d;aEeDoda,uB;oBtr4P;jda,m;cs3t8vog;e,we9;isBkc0mm5sirp>;iv4simm3L;@#,&CtB;bo,n1~;^,sn1;=,ssa;dI(ac,fHhFk?d,pEsDtBv];a(ht,eews,hgieh,sB;af;row,sD;e2ir,pah,?hs;guot,tgnB;el;a2fi%;a.b,iw;aIees,iaGlEo%ucArB;i2PofB;n1/p,sB;na&;a4Wehw/B;d6vo;lcBm;o7#;ls,.;-NeKiFlDoBunO;rBt#;^,~p;aBi5H.4;%8;aDev6fluf,oC/p>,%B;id,$;`,r4K;r2sBtruc;sa;enk,pCvB;)6(,irJ;(,#;cn1nB%;na;-LcJeIluHnErBsuh;aBi,ul;bBmr-;*,me;aCirBub2;hs;ht;ac;es;ajih,iBol6;ffa&,>m;ns,rw;cNsCtB;-+<,r-6;aKiB;bruf0lHnG/FuBv);gnCqB;$l0s;al,[B;s3#;hc,p,vop>;av,e@0ruf;oBpm_A;ba,m2;el6+;aD^CtB;aMe;&4+;e7oCtB;*,~;p,rc4;<,id,$CuB;b2@6;lBrw,%;c,f;eirb2fClug4ooB;`;iBub0;ns;c2Xd2He2Dg22ht20i1Zk1Vl1Cmu1Bn17r0Ws09tSuPvDzB;aBing1K;ma,rg;aKeiIiFloC.pB/R;pa,s3;sCveB;!d;!ba;aw,ecCg9l0rBv0;*,?,%;n1/p;hAleB&0;b,r;ew,h<,p,rB;c,g4;b>,gn)CrcAsrB;up;ah;aIiGoEuB;llCt[B;sn1;op;mo7nB;*,n1;cBdep#;!$;ciIdFeE[i8mBpic[rLu=ve,v[A;ag=ma,iBotua;c2lB;b5cA;m/p,rc;iBnu8;cuM=v,+B;];d8xot8;aTiPnNoKpaJrGuDy=B;na,rB;ap;cAfn1LoBr1D;pB?;se;eCod4ubB;>0s3;m>,`3;le;lcCnga3oBpp5;hc;e9^,s3;-lc,eB;dn1`3;)C?B;!mm5;dnBpF;uf;eCrB;e,hp0;c,@s3pB;pa;alc2eveKiFoEuB;co7giCjn1sB;$,sa;fn1;@2ngi;fkcZpDt0+B;ca,nB;e,i;snB#;aNi;r,s/p;evn1iCoB;dn1;d,f2hs,mBpo;a#,/t*e7;h#,sn1;aSbmPcric4d$wd,fNgKiIkcHpDtB;nams3tB;),]<;maDpCuB;_2;)g,ot;&;at;cnBpm1ug<;_0;gCnB;)%,im;ig,ums;fBi%;ab;esCuB;rc,t;(,sa;hNpO;aD],ovBup;eB$;!r;rb,s9;t6v;ab,oB;os;aJdeIluHnErB;al4eBof;mb5vB;id,n1;)?,evacs,ipCupB;#;>;d8v3;rd;g4siv4;^;lf,rDsB;e9rB;evo;c2ga;aMiIoHuB;lC&B#;$,o7;cCe,lB;a,_;e7nB#;i,_;c2rr1;bDcCfn1lBsb5vo7;l1s;*,$1;!a;usCvB;$,rC;rBs3;ep;aLiKnGrEseCudo&8;$;i+A=1;ca;e1ofnB;e,i0;emm1im,uonB;eBna;d,r;_;ff5oj0;f2pCrB;bme;tuo;aUePiNlKnHo7rCu)f2;*;aCoB;ffa;bmBcs3;ob;rp;eC_sBuoB;ba;irfNl;eCohB;<,pu;iw;b9ova,r;rof;dnuof6eB;cCf%-B;rb;c5#;nu;ehCol0;(;<;l.f,mB;im;aGmucc5rB;osDuB;%3;id;da;us;%",
  "Person": ":!1:#$%&()*+-./<=>?@[]^_`~:ni,na,ar,re,el,ir,li,ad,ra,or,la,lo,er, e,al,no,am, a,ht,b ,w ,at;a1Zciveso*m $dobols,d1Je0Vf0Sg0Rhgog $v,i0Ok0Ll0Im0HnWoPpp)t,rKsFtCuBvok-m,y1z0; yNe#,$rf;[]se&^,b8dd+ ffup,e3l1r&0sk$b;_(/h,p;l0uj +$r5;en,i=,ut;l*=,n2r1s0;<`/#drNs)rom;f#`h%po,h6;m. tt0sid t/w;im;om,s.c g#b;hlu^c,l,oleg$]y[,rhen /l-hawC;d$rbm=,e@m,ibizx,<_#asu,$yrb>bok,-0sew>y$k,tahb;ehfee_#~pGgo_y=h0wets d.;pmuh;a3e1in$ig,k$_%yt,m+a y+sendew,$Qtaek,u0;?c]1DicufnVm+%tson;demihc-,m0t%cos,vy;aj n.b(,<h kcol&hs;gHi*,n,t@hacop;a*p,e1o0-ts og#r,ukahs caput;^,ly~;cuahc,dav ^r+,hctuk @thsa,ltih,mlDp0;ip,p)>^ kc0;aj;d/5h#d/n.,i<Mk^.,l*m4n2t0y>n;a0tuh_rizaneb;lp,vol im9;[. y%,icap0Eo0; Fb;ac;n.,v);aEeBi7o0;(opan,ops&^iw>se=,s4t0;g#hsa`lezn2l0#lc,sag;+,ih s)0;ap;ed;[,i0Jr0s$hoj tt(-cs,ug&f;ac,effej;as2lr5pohc0wdoR;! ci&de0;rf;suh m+das,uh;aiss1ik<t rrj,@ 0rrA;okoy;em;goh kl4m1n0vy;oc; &d1&0wY;d0pus;ips;uh;%flWe#Hut~;e1itrYl=&f l*w,ohr0uapur;aw;ikeze,seid n9;c1e0fj;potaz (iC-bum;eb,oA;ff%,hsak~,juy,m0n$y,-h]tDss. o#tn(1;aws,ur;av;(o,god poons,iwdT#lw. kj;fo#$mhc%,<0uoeb?]iC;ow]i#gr0`kcid;iv;cKdH(,iFk%d,lCnAop,r4ssag? *&3tn1yt0;og;+,o0;rb;me;aepseka4eil3i~<v,o0;g 1m(kc0;[;/,&ppN;om;hs;%c s(in,giv? l)va,opac0; /;a1ep,totsi0;-;_$its)Tg#thgin>cn=olf;ffe,ss?es (iLtt0;en;l1o0;ow;ih;a1@y0;eb;&bil,tsue;abnEe)fgeEiC<8n4ooh #b3rof 0;@si1yrn0;eh;rrA;.;a0omm8;l0r nya;abm0&^us &feik;it;gi1h#0;=;tn0;as;hs4m0;ah;is;fi/hk zCgag yd?,hsBma8n3ro,s0yne,zr;(a`hc1i0;%;(;ayt3$h2od%[ oge1y0;hc;id;);~;bo kc%1l i?0;+;ab;ek;iw",
  "Adjective": ":!1:#$%&()*+-./<=>?@[]^_`~:ni,re,ts,ra,et,ne,ro,no,la,er,el,lo,ae,se,na,il,nu,eb,ps,af,oh,or;0:98;1:8P;2:83;3:9T;4:8K;5:9Q;6:9O;7:96;8:95;9:56;A:8J;B:8B;aA0b9Yc9Od78e4Af45g3Sh3Ni3Mk3Kl38m37n2Qo2Mp2Ir25s23t0Eutis 1ve3wol],x0DyCzessial;a0Bb&en,d09lZnYoc,peeXrGsEtDwePzC;oow,t#O;farc,ippu,liug,#op,s(;a.g,d?h,(uc,k<f,tCwoS;?,&;aLeIiah,oD^,rC;em,os;sFtC;cDiClus4uta%;bih1dua;_sitas,idartn2;iv9Mlupm2)s;eDif,p72tCwolf;aw,tij;hc;dnHeGit$t,mF`,rCs>cen;(@,oDtC;ib&,n2;+h,pm(;i3o%O;rd;eg/,oces;ls,rc;am,*ht;d#k,(al,ht+m,iad,kKlirf,mees,nI`,rDthgiCur0;n,s0;aFeDobhgien,uC;`,s;dCt&uq;le,*;ey,<hcs;amow,oegdumrC;uc;eew,&^;dum,ee^,lC?h;eiw0om;dy$ve,ko,wr7;al,u_;=b0Zc0Ue0Tfih>k5hgi0Qi0NluciffAnQoom,pOrLsGuCxen;oCpak; C%,v4;dCg[r%;ekcahw,lB;aEeD#aga,omCub~;!$ttu;dom,+h,wht1K;eCfd=%;!ht1Ir9;aw-%,eC;#,p,voC;!c;a,eCirc>d+n,ur9;da,#;aTeEiojD~f C;#,pu;n2sA;b,c>OdnMgJiHnE^0&pDs9vC;<s1$f;pa,s?Z;am$p,iC;mCt$p;e,mi,o3;ciffus 20deC;bo,pxe;lud1#r%,oc,rC;eCu;me,vA;epedCo^4;!#,$t1;iuqca,*uC;lf;cPd[OgNhc)MlLmK+s8pmar,rHtEvCzing2;/.C$sbo;!ri;cul8luxe,r2OsC;iCn2;d,s8;biv,eDgaCongi,$9tic-c8;lf,rf,v;buxe,<t;ada,*d;ahc+n,igiv;rt;avartxe,/e,~&;ba,d8;av,ifingis49;c@Cf~p+n;li,pC;mi,xe;ewDnr75r-,tC;pu,ria;$4Zt5L;.28ivBl&cs,m0;aFeD@.4#C;cc6%A;f$pmi,j9^mucric,rC;e,id1r2B;r2Qt1xe;ffo,pu;=sr6Vd&wkcab,iCpeek *f,ugob;$)g i6targ;aNeGoC;iDj5#m,odC;#,tuo;[j,rC;ef1p;bmBd0ehs,g=HhtGm*f,n1pEss/,tDvoC;!cr7;awr7si3Juo;~pCpu,us;!mi;egot,o;!m;/c l2V@im_,pb6;eeEo%+n,u C;dCt)p;ef,&h;d #ks,lR;hDrtiv 1tc_ C;ed,ospi; gnCc5;ug;aPeJgiIiGot?w,rDwoC;d edispu,rg1;eCobbu%;dom,htC%ew;*n,uB;aCtu-fhgih;m,t$c;e*f,)b;dGesFhEko^0rrDttPvC;arc,e0;ab;sa;e*f0[;<g,oow;bruDi-Wpda4sit&pCti<p~tem;!ib;!b6;a.%#5$t07uti#f# da;aEivD-Co`cs55ufitu=b;!r5P;ic;bolg,gIhtH#f,sGuFvDyC;~;an,ihcC;&;qe,su;$vi0sol2;/;/13uC;jn2rf;ciCo,sirb;$v5s2V;baj[p,#m,*irp a;guo),siFtC;=nDoC*n,uB;mm5;],r7;fles;#Cums;cMdnJhHk*w1BllGmFogE$bmul,tDwoCylr7zite4Q;lbd#m,nk;aisuan,ce^48)l3Rod;e*f,+,ys=;och0Gussa0;a4Les%];ca. &f,taC;cs;a%DeC;c>O[,pmi;g+l;a)m,#v+c0;fo EooC;-,rpC;d[B$htaD;llC&f;ew;c_d<b,d21ew,ga1Zh1Yid1k1Vl1Bm16n0Wr0Ps0FtKuHvDzC;al9+rb;a3CiCo9;cC-;$2uC;dn2;dDqiC;[,t?;![,r4G;aNeKiFuC;ca,<sDtC;i%4sa;ba,.;d+c8lF#fErtDsiuqCtep,us );xe;!n2;!ed18#;opmi;lDrC;csA;osbo,pmH;bSc@4iRmiOnHrCuqeda13vi3;a^AeDi,opr2uC;cca11s)mm2;disnD)g4pCt@N;m(,s4;oc1;iG#,oiD$t-,uC;t*f;ssapDtC;ceffa,*po3;!m2;d*Cm$ted1;bus1#;tCxo3;ig/Clu;!li;demQrp~ppa0N;/C~p8;ec;]o,iI-f,)Hotam2rFuC;fo3rC;%9;ba;a^,evC;da,id,$p;mHt1;cDwkcolcC;!$t[2;e3n2;awa,bac5coidem,eHit),oE&zib,uC;m4tamC;mi;cDm C;on;d&h;c01m,%E;aKeIiFoEuC;mmiotCyacip;ua; + e+,d,-;lC#mQ%i3;ak-,ffo,lC+,ucs5;a%yrc;csbo,rC;es;fo3muh,#,s1;as,.p6iC~hco+m;lb6tC;gCir5;ib,nC;ol;aSbMgLiDoTpC;i1Fma;cIgaHhwF$%,tCv;aDrCs`;ef;<v,s$v;htrC%$;ow;!rf;od;#s;aCu<sD;!bo3eeDu-vC;!#;rDs.C;of;ga;csDs/oC;hw;pu;aT@C;a,hsuC;rb;cuag,t@b;)Cr7;(;am GiC&g t?va,un;fEsC;],#,tC;uo; anEanE;emC;`;ob;=1OeYiP<OnJoH&C;d?%b6eh0obFwC;kD*fthgiarC;%;wa;a,+,r1L;hsCog;p@s;ahDiCoy],uto*;h],lb;fD$C;d0vo;fo;c eci,s0t0;aHbFdEoDprCug?l;ot;?&p,tamuehr,v4;)lYrB;ar,rC;om;lp,pDrC;fa;e3[;c0Yd0Vg0Shct0Rirr0Rk0Pl0Kma0Jn0Hppat0r0Cs03tJudb6vIwFyolpme0zC;aDiC;ngocPsr7;rc;ollDylwC;en;ah;<sKolT;aPec_iNiInFpur$t05&Cs(0upY;ehtChc0;hgC;@;aDeC;dec.p0-t,mucod0;r&w0w0;eEriDuqC;.0;^;cn2;oc;tlC;um;ba0ci%ihpBg@FlErutas[ylDuqitC;?;op;];bo;os;=HiFoDpC;al;lcCppo0;sid0;cmucric0v$pC;us0;c4sA;id;ed;arf1cEomaDusC;#0;);as;#;ialpxe0oihs_Cwon8; d<;f,n0;bRlDttes0zziC;rg;aDiC;ks;ppa;anCceF;! kcub;am0;a /ddD/ivirpr7)l-C;hc0;im;aj,ic7n(ta0&t8;.;ed0;ap %Diton0?un;[;_;hCrp>diw;a,rC;evo;aid&c,iD` C;da;lG?gFvC;aDic,lC;ep;ls;*;bD`ocC;-;up;$p6;us;gGmi3rtEs$v ecDt)g5;am;iv;lu,xe;rp;em",
  "Pronoun": "elle,h4i3me,she,th1us,we,you0;!rs;e0ou;e,m,y;!l,t;e,im",
  "Preposition": ":aZdWeTfSgnOhLlKmoJnFoDpCrAs7t1urNyb0zehc;!ereM;a4ceffe3pecxe,rap3s1uo0;!bVhI;di0gno0;ma; ni;!ht os;a0drPedisAiv a siv,nas,oporpa,sorca,usrev;! 0erehw;gnolKhcus;e0of;p,tfa;ota,u;/w,tn0;i,o;a7eewt2i1o0wod;!pu;!ht4;eb;hw ht2rf;itAlit;guor1t0;iw;ht;i1o0;la,ma;dnatshtiwton,r0;rab,ud;fo,o;cnis,kil1lohw a0tipsed; sa;nu;im1nuora,r0;awot;!a;cric,iv,uq",
  "SportsTeam": ":!1:#$%&()*+-./<=>?@[]^_`~:na,al,er,ar,ra,no,la, s,ni,ro, e,ti,ts,it,ap,lo,ne,el,b ,ub, o,le;$liv )1Ncs w%c+_mu1Me1I)i1Dr1Bs6t5xos 3y0zzaj hatu;<c 0x$ag $;eko=,ffidGre=e0sas#k g-t.ps;ci],hc#m;d% 15e<hw0;!`1F;aehSc?mi *%t)m;$*d cf,buc1Cc>10d0We0Hfeihc0Gg-k0Fk06lXm&+04nMoKpace<hw revuoc#v,r6t2y0;a0obwoc0B;j/ulb6rE;e2@c+i@pFn0oirt?14;aig 0iasS;k0Qocsic#rf0K;ggunFjUm0On.h/ttol(hc;augaj/lliv)skcaj,e2o0;ir(w/ta= [d@g,tp&0;`t).t;bmi9c? 8d7e#cc_6g2ht#p a-@1i*vacLk0~e=0C-(mYppilc 5vor nr_kc$b,w%00z$^li&9;$3c? ya^[%g;(c;dod1>B#r 0;k(p+[euq,saxF;! 0;s]eg#+ol; ya^?mat;i&0LnuosQ;a#id-;t d#lt.p;c)rb0r0V; revn3;a5ev&01i3o0us xi[ohp,worb8;c*f Xil0=ip0; <ort0;ed;hp@d0ksd%06l(m0; imaS;ci~p3id1<t/essenn0;et;-0(ug0; d#~v]c;+#].0B;a3l0;i^o*ff_,u^0;d%0o0D; kU;g[bXn0yorE;id(c 0o>anU;aAs0;iuol 0;=;c2wah0; Daes0;/lttaes;abd)maid3i1u0;b/ekuawl9;nkIrevam0;+$*d;! a0;)zi(;`t[m&cAiv3; y<c+as#k;ek#yCi9kauqht(e/soj7l5rd?,t&ip4v0;&^2@wrebm>0; atosenn0;im;at#lta; hgr_st<p;gae Loi.0; %om>*b; n0;as;kco6l0;lihp0zzirg+ihpmem;! F;! k0;.yC;%2ipa1(ziw0; )tg-hsaw;r`d&oG; >an-c-c;]hta2~c0;! 0;)=ob; d#lkao;ednuht y<c amoh$ko,upstoh mah[tt0;ot;nu 2tu@v%0; d#lg[0; wen;aihp~d$i0;hp;k$ t*s *%,rif0;`0;gaci0;hc;@c;=a",
  "Unit": "a07b04cXdWexVfTgRhePinYjoule0BkMlJmDnan08oCp9quart0Bsq ft,t7volts,w6y2ze3\xB01\xB50;g,s;c,f,n;dVear1o0;ttR; 0s 0;old;att,b;erNon0;!ne02;ascals,e1i0;cXnt00;rcent,tJ;hms,unceY;e4i0m\xB2,\xB2,\xB3;/h,cro2l0;e0liK;!\xB2;grLsR;gCtJ;it1u0;menQx;erPreP;b5elvins,ilo1m0notO;ph,\xB2;!byGgrEmCs;ct0rtzL;aJogrC;allonJb0ig3rB;ps;a0emtEl oz,t4;hrenheit,radG;aby9;eci3m1;aratDe1m0oulombD;\xB2,\xB3;lsius,nti0;gr2lit1m0;et0;er8;am7;b1y0;te5;l,ps;c2tt0;os0;econd1;re0;!s",
  "Noun|Gerund": ":!1:#$%&()*+-./<=>?@[:er,oc,ts,ae,us,il,ni,or,re,ra,rt,lc,ro,rd,cs,dn,ps;g*0;b3Rc3Md35f32g2Vh2Mk2Cl1Tm1On15+ez,p0Vr0Hs0AtBug.,v8w5xal#,y1zi0;la(iv,n0E;a2du%,evr(,fi%uj,l1r0t.p;c,=w;!lub;lp,rp,s;a>,eiv-tXo0;ns,r0;!.h;eirg,i1r0;ac,es;d,>,vr(;aQbuod,cJeHfGhgif,iFluLnBov,plu?,rAs5t0uohs;a3e2i0;nk,s0;!ybab;b,s;hc,m4;a1e0),+f;finam,t,v.h;c0t;!da+b,e0;=f;)f,op#;ahc2evFi1u0;h,$ca;ap,rp;!ne;aw,b,m),rw;arc,);e0gdub,k.m;m,rg;a3e2u0;@$,/0;sn$;ll$,[4rR;!r0;et2t0;b(,ta;bYc6d,e5g4itogen,ks,luvo,*?af,o3r1tidem,von0;*;!belec,e0$W%ulli;neg,po;b,c,lb;elTivan;!h,s;inumm$,ude;&5i3nec),o06r2s0;e0+c;c+p,lb,>;&h#,un;c-6n0t-vda;ag=;l,t;&Ce5i4o1utc0;afunXur%#;?,l0tinom;$,p0;xe;h,w;@5e4ff3htY[ihw,tac,v0;)C$0;!s0;id;o,(;hc,*gne,tnulov;#,ow;<,ws;ee7m6o4p0rub,yt;a1i0oO;hs,t;<,r0;!w;c,lev0;ed;ac,ud;k0ls;ec&p,koob;&HeCgis,i8n6o2.0way;e0w;l,y;@aba,it1<,ri,s0z;a#,i1;is0seuq;op;a0igeb,ur;lp,t;a0gami,m;l1/,t*0;am;pm$;dr3#Gpo,t0;=1s0;);hs;ag;<,m;a#3it,miws,o1r0(sa;af;c-0oz;vo;?,d;angHbbiGcycF@EeBgguAi9l6ooh5ruc,t3u2w0;a0oh;rc;deh2r;s#w,t0;ab;?;e1i0;f,k;[,ty=%,v3wd,y;as,f;j,rZ;d1ef,v0;a/;om;ah;!#;>;is;a8c6ih,lat,*5o3r0;ap,ow0;!t0;en;ms,o0;b,c;ht,>;a0ik,oK;b,/;b,tU;c4gual,s2t0;&0o<;rb;aw,i0;f,lbup;a1t0;aw,#Bib;et,o0;c,rppa;a3d2goj,n0;is,ol0;eb;ol,uj;!kc1ss0%;em;ap;fu1o+,r0;(;%;aEdew,iDlBn5o2r0;aob0$5;etaks,wons;c,lp1o0;lf;mi;a3e1if,o[0uf;#;![,te0;rp;l,rb,%0;-@u;i0oh;ub;lg,r,ug;e0/;nk,r;i,n0;a1ef,ivn0;$;d,n0;if;bu1m0;i0ob;<",
  "PhrasalVerb": "!1:#$%&()*+-./<=>?@[]^_`~:up,in,do,e ,t ,k ,ba,aw,p ,ck,ar,l ,d ,n ,for,h ,r ,ut,sh,y ,ow ,nd;0:95;1:99;2:8K;3:8Y;4:8E;5:87;6:89;7:9B;8:93;9:8J;A:90;B:8U;C:91;D:8X;E:8V;F:85;G:74;H:9A;I:7L;a9Hb7Xc6Ud6Me6Kf5Ig4Zh4Airon0j45k3Yl3Cm2Zn2Wo2Up2Aquie(Fr1Vs0JtYuWvacuu6TwMyammerBzJ;ero Ei-KonJ;e0k0;by,ov9#;aPeLhKiJor45rit&81;mp0n3Dpe0r5s5;a.Aee<Ei0Q;aKiJn31;g@3Urd0;>E[J;%1$,o7L;i(7Ck5l)Krm 6As@Jt86v61;+3%1o7#;+3$,oD;rgeBsJ;&2herG;aZeXhUiQoPrLuJypO;.Gr>J;%1$,o7D#;aKiJot0_2Y;.l82-H;c)FdJ;&5Z;n7Z-3Cs5L;c)LdK&Jghte>6me0-o0Pre0;+3*4%1$,#;&I_2;by,oC;$)Kr`J;+3*4$,#;*4ov9#;aJ&7All65;m 2[5N;.Bk&Kl)J;ov9^it,u47;aJ*4%1$,leave,o4D#;*4ft9p/t,w3;a0Tc0Re0Kh0Gi0Dl07m06n05o04pZqu/5HtOuNwJ;e/LiJ;ngKtc@J;+3*4o8M; by;c33i6Em 2ss0;aQePiOoMrJud35;aigh2Cet79iJ;k&7Vng J;al72#;-Jrm2E;by,$,oC;c3Ln3L[2tc4P;-H;c3Jmp0n=KrJveA_2N;&F(2K;*4%1#;/3GeMiLlKrJurB;ead0$gBuc5;a4Ai(6L;c5l<o3C>2;a)He1Wll0;a3Bbe[2rt0un=like;a-5Z`Euggl5;as@6Roke0;ee-MiJ`6;cK-J;o6H#;&6Ck4D;$,oJ;ff,v9;de18g>4PnJ(6Kz5;gJkG; al6Ele0;aLoJu60;o(Jr5]0w 7P;+3*4?,oD;c2WdeGk6IveA;&Oll1Mn=Nrv5tJ; Jtl5N;%1foK$,o7#J;!on;ot,rth;+3*4%1$,o34#;oDto;al6Ao]0rJ;ap69ew 6M;ilAv5;aWeTiRoNuJ;b 62le0>Jstl5;aK*4%1$Jo2Ith4Ru5T;!to;c2Yr8w3;l<Lo(KpeAuJ;g3J~16;a2X?,o7;/8$,o7#;ng 6B-oJs5;ff,pen;aJelA$Gnt0;c6K=J;o4H#;c27t0;aYeXhase0iVlSoPrNsyc36uJ;l<Ln5O(J;aJ*4%1$,o51to4B#;p/t,w3;a3L%1$,o21to49#;attleBess JiMo-2;ah2Gon;iK-Jr53u1Gwe[6Q;%1$,o6Q#;nt0;aKuJ;gGm-6;c&u21_6G;c)Jg0l&4E>6p5F;o4P#;e<5QncilG;c57i[3Bn0ss LtK_J;*4oC; Fc2S;+3*4$,o4K;pJw52;e51(E;aKerd0oJ;dAt57;i<Frr`F;aSePiOoKuJ;ddl5l<I;c1FnkeyL-6]hAv&J;aJ%1$,o4P#;l4Rw3; with;ss0x 2;asur5e3WlKss J;a22#;(6;k&K>6rJs2Bx0;)6ryA;%,fun,oDsure,#;a01eUiPoKuJ;.0s(I;aMc4Jg LoJse0;)Jse4H;aft9*4%1?w3B$to,o0Zu4A;$,o3W;=6;&MghtLnKsJv&Z;te>H;&2)2; 2e4A;/8%1$;aL(KvelJ; oD;%1go,$,o7#;nGv&J;$,oJ;pJ];en;c5-2s@KtchBughA_J;%1o5C;$to,o7;eLic)Knoc)J;%1oD#;oD#;eK_J;$,#;<I-J;+3*4%1f04$,o39to,#;aLoKuJ;ic5mpG;ke3W(F;cJzz 2;)2N;a00eViSoOuJ;nKrrJs@6;_2;keK(J;/8%1;[F;lJneGrse3N;=J&2low0;*4dJfast,o0C#;e/,o1;d&K(J;*4on,#;+3o7;aJlp0;=L<I[J(2;fJof;rom;?,$,o03uW;cOm 2nK^0v&Jz2S;at,it,to;=Kg JkerO;%1$,o2W#;%1$,oJ;],v9;)2;aZeTiv&Rloss IoLrKunJ; ?;ab hold,$45`2X; Kof J;/8oC#;aLb1Oit,oKr8th1KuJ;~9;ff,n,v9;bo7ft9hPw3;+3bJ%1$,o25rise,#,w3;a4irth;/ 6ek0(J;aKb1H%1$,oJr8#;ff,n,],v9;cKhJl2Hr8t,w3;ead;ross;=aJng 2s 2;bo7;a0Ee07iXlToPrLuJ;c)Je2P;/8#;eKighte>JownB_2;+3oC;eJ^e29; 2z5;g 2lLo<Jr)I;aJwith;bo7r8;=6l`2;aKeJip0;^0;g 6ke0mJrJtte>F;&H;gQlOnMrKsJzzle0;@H;&Jm 2;+3*4#;d0isJ;@2;&J<1V;+3fP$,o7;htJure0; *4;eOnKsJ;s 2;cL=J;fJoC;or;&E;d05<2;cMl<Jrm0t1H;aKbJ%1$,o0A^ort,th09victim;a4eh$d;p/t;&J;%1oC#;a(Jdge0n=13y5;$,o7#;aPiOoNrJ;aLess 6oJuO;neB-J;+3b03$,oD;gBwB; Ile0ubl1B;&F^0;m 2;a09h04l01oNrKu(J;+3*4%1oD#;a.Bee-KoJy0;ss Ewd0;by,%1$,o0T#;m&MoKuntJ; o28;)6<J;%1oC;aQbP?N$,oMtJu0N;hKoJrue;geth9;rough;ff,],v9;th,wJ;/d;a4y;paJr8w3;rt;eaKos&J;$,oD#;>6[H;aMeKiJ;ll0pG;c)Ee[Jw H;on,#;(2;lQncel0rNsLtc@KveG; $;o1L#;@E(J;%ubt,oC;r_KvJ;&07;+3oL;<Jm F;aK*4%1oJ#;ff,n,];r8w3;a0Te0KiteAl0Eo03rPuJ;bblM.l04il0Cl)6~l04rKsJtL_HzzA;(Z;>0FsJ;(E;&I;ov9;anVeaTiKus@J;oC#;ghPng J;aM*4%1?L$,oKuJ;~9p;n,];th;bo7lJr8w3;ong;teJ;>2;)J;%1$,o7#;ch0;/Sg 6iQn5oOrMssLttlKunc&Jx E;+3*4;&6; /8;&F;%1;)E(2;&2;<6;%1#;=2;aNeed0oJurt0;c)Lw J;+3*4%1o7#;.;$,oD;.0nk0stA; oPaMef 2lt0n=J;%1ov9#;er;#;[K(J;%1$,oD#;%1o7;ff,nJ;to;c)Oil0nLrgKsJ;@E;a$B&E;g EkB; on;$,o7;+3%1$,oD#;ff,];ay;c(HdPir0s)LuctionA; oC;ff;/8o7;ouJ;~; o7;=J;%1oJ#;ff,n;wn;o7#;]",
  "ProperNoun": ":anilatGdFeDgniCitsirBl9no5o4s3weivriaf,xaja,y0;brik,el0ssim;bmew,ekr0se9tn0;eb;edecrem,in;cn2mle,rue;sduh,t0;e1lra4nih,pm0;arf;eb,lr7;eir,l0;ewhtor,igcm;hc;dlaps,lr3;cnerolf,i0nwodsdnal;brab,suohlad;iba,oowrehs,rofsog;ac",
  "Person|Place": ":a5ebok,n2o0rodavl6tnek,yendys;dnalro,g0;aitn4eid;adroj,i1ot0;limah,suoh;tsua,wrad;i1ram0;as;nigr1r0;dnaxela,otc0;iv",
  "LastName": "!1:#$%&()*+-./<=>?@[]^_`~:er,an,ar,ll,ng,ch,is,hi,el,as,ri,na,va,in,da,ni,al,la,en,ro,ra,to;0:96;1:8Q;2:90;3:8Y;4:8R;5:8I;6:8G;7:8L;8:6N;9:6D;a8Sb7Oc6Nd62e5Wf5Jg4Xh4Fi4Cj45k3Ml37m2Cn23o1Vp1Hqu*pe,r0Ys0At02vWwMxLyDzA;hAimm#m4L;aAou,u;(,o;aEeun71iBoAun;koyama,s+?;!lA;diAmaz;/m,z;maA(;?,g3Omo~,sAza9;a9+ta;iao,u;aFeDiBoA/ght,u;jcik,lff,(;lAmm0nkl0s@ews9;ki8Hliams25s3;bA*s,lt0;b,#,st0;age,gn0lBtA;$abe,s3;k0sh,tA;#s,on;aCes-6RiAogt;?l,&[Ass0=ldi;ba,obos;lBn dArg.;^ b4Gijk,yk;^zu-a,v#de;aGeix18hDi1j7oCrBsui,urA;c1n0;$,emb]y,yn*9;ls~y,m5rr2th;at)0i&,oA;mAr]cius;ps3s3;kah7A<ka,te,v%2;aS)NeMhKiImGoEtBuAvobo?,zabo;bot5&iv1zu9;aBeAoica;-e,>1Pphe8v^s1H;l7rm0;sa,~,uA;(,sa;itAyth;!h;l=,mmo8nArbu;at6c]ir,gh;aAehu,imizu;],rma;gu6>f-d,oh,pulve?,rr$o;evi4iltz,miBneid0_ed0uAw%z;b#t,lz;dBtA;!t,z;!t;h7i~,ka3AlDnAr5sa9~,und#s;dBtAz;$a,e,os;b3K#s;.,o;aPeMiJoDuByA;a4oo,u;bio,iz,sA;so,u;bE)a,d/gu2g#s,j.,mDosev-t,sCtBux,wA;e,li4;%i,h;^b3Bsi;$o,#o;#ts0Ni6Z;bei_,cBes,vAzzo;.,e6;ci,h%ds0K;ag1es,iBut0yA;es,nolds;s,t0;dBmAv4K;os;ic,u;aLeIhGiDoCrAut7;.ad,ifti,o)azA;ka;p23rti58we&;cB#o,nA;.,~;.so,hl0;aAi&ips;k,m,n4P;a6PeteW<,rAt#s04;eAic,ki8;i6`,tz;h66k,rk0tA;-,te6L;bGconnor,g1RlDnei&,rBsborne,we8zA;demir,turk;e&$a,tAwe&;ega,iz;iAs3;vAynyk;ei6;aI/^;aFeEiDoAun2ym1;rBvAwak;ak,otn4I;o?hl,r*;)olsNemi,kol5x3;ils3mec;gy,kaA`y1sh,v%_;jiAmu6s+A;ma;aXcUePiOoFuByeA;rs;lCnBrAssol>i;ati,pT`y;oz,te3R;d0l0;h1lHnGore,rBsAz%t;#,s;aDeCiBr*At3;!on;!n0C;au,i6no,tti;!l2;_e,tgom#y;i<,l0;c`)i,&0;hmeti,iDjia,lBnd2rci0ssiAy#1J;!#;nAo;yk;#,j0;c%tBlA;aughl7e1;hy;d/g[,e?,i0j#us,k-a,m$i,nFrCtByA;#,r;ei,ic,su11th5C;iAqu2_qu7ti8;$i,c,nA;!o;c>i,n;aNeIiFoDuByA;!n);k5nAo;d,gu;mb%Ap2vr5we;di;!nAu,y$age;coln,dA;b11holm,st_m;feChm0Fitn0kaBn7rAw*;oy;!j;bvAvA;re;>e,mmy,(,u,voie,ws3;aNeMh1iKlIoFrDuBv%1woA;k,n;ce6m%A;!a;aAem0*h<,yeziu;m0s@qi,us2F;bay3R),=Aw[s9;cAl;!ic,s;e7uiveA;rt;eff0kAl5mu6;u)i;&0nnedy;hn,&Dm>s9ne,pBst`ti,~,ur,yA;a,s0;l1oA;or;oe;aE^Dha4oBuA;(,r5;hnsAn2u4;on,t3;ki8@(s;cAnsse8;ks3obs;glesi.,ke?,l07noTonBs+kA~,v$ou;awa;escu;aJeIiHj[t[7oCuA;!aAb0gh2ynh;m1(;a4dz5fCjga%d,k,lBpIrAwe,xha;ak,=t;m2t;#,fm2WmA;$n;ggi8t)cock;ikki],mi(way,nde3Rrre6ss;dz5g^,qGrFsDuCwByA;.+,es;ki8;g^,(;$i,+A;mo~;di4p0r*,t;ue;aNeorgMheorghe,iLjonKoFrDuAw3;#rAo,zm1;a,eA;_;ayli4e^e,g5iffithAub0;!s;ldCm2nBodA;e,m1;c[v2z[2;bAs02;#g;aj,i;bs3l,or?H;ie=;gnGlDmaCnd+,o,rAs+,ut+0;cAdn0za;ia;ge;eaBlA;agh0i,o;no;e,on;aL#IiFj-dsted,lEoCrBuA;)s,^t2jita,&0;eem1iedm1;ntaArt7ur@0wl0;<;emi4or2;sBtzg#aA;ld;)0h0;n$d2rA;%Aei6;a,i;b0rre&;dD>sCsA=8;cob%,pAt`?;>oza,osiJ;te7;#,*3w%A;ds;aQeJiHjurhuGoEr*co&,uBvorA;ak;%te,boBmitru,nn,rAtta;$d,ic;*;g1he0DtA;~;us;aAcki1Wss$ayake,x3;s,z; Cb<BlAmir,rv*+,vi,w1;gado,ic;th;bo0g_ot,jo4lBsilAv/2;=;a cruz,e3uA;ca;hl,mcevs9nBtta,viA;ds3es,s;i-s,ku];ki;a03eYhLiobKl%kJoCrAun@(ham;awford,ivAuz;e&i;h^,lEntDoCrAsta,x;byn,reA;a,ia;ke,p0;i,r#.;em1li8;ns;!e;$u;aGeEiu,oAu4we;i,(,p6uBwAy;!dB;dA(;huD;!n,onAu4;!g;kDnCpm1ttBudhA;ry;#jee,o0O;!d,g;ma,`boA;rty;bDlZ(5rA;eghetBnA;a,y;ti;$,ot%i;c#2ld#3mpbeFrCstA=diX;iA_;&o;doBr,t0uA=lho;so;so,zo;&;a00eOhLiKlJoHrEuCyA;rFtyA;qi;)$1rA;ke;iem,oAy$t;oks,wA;ne;nFruya,su,u)aAyko,z5;rd;$co,on?l;$cLshw.;aZoAuiy1;umAwmA;ik;ckJethovIgu,ktGnnOrA;gC*Bn.coA;@;ha;#,mA;$A;!n;.A;+;^;#,hA;am;b5),hKiley,kk0ldw7nFrBshAt2u0;ir;bCnBtlAua;ett;es,i0;ieSosa;dAik;a6yoA;padhyA;ay;`;k,(;ic;bbYcosXdVgSkhtTlPnJrFsl1tDyA;aBd7;>;];)*3kiA;ns3;aCmst_4sl1;$;(;ujo,ya;dBsaA;/;eBrA;ews;rs3;on;meiBv2;es;?;%wBuilA;%;[;ams,l0;#;ta;.",
  "Ordinal": "eBf7nin5s3t0zeroE;enDhir1we0;lfCn7;d,t3;e0ixt8;cond,vent7;et0th;e6ie7;i2o0;r0urt3;tie4;ft1rst;ight0lev1;e0h,ie1;en0;th",
  "Cardinal": "eBf5nine7one,s4t0zero;en,h2w0;e0o;lve,n5;irt6ree;even2ix2;i3o0;r1ur0;!t2;ty;ft0ve;e2y;ight0lev1;!e0y;en",
  "Multiple": ":d5noilli0;b,m,r2t0;ni2p0x0;es;da0t;uq;erdnuh,nasuoht",
  "City": "!1:#$%&()*+-./<=>?@[]^_`~:an,ra,la,al,ng,er,in,ch,ha,es,is,ar,to,ba,ta,sa,sh,or,ad,en,pe,hi;0:75;1:62;2:6H;3:6K;4:5T;5:5M;a6Ab55c4Kd4Ae46f3Yg3Jh3Bi33j2Yk2Gl24m1Nn1Do1Ap0Xq0Vr0Ps06tSuRvMwExiCyAz6;a8h6ibo,uri+;a6e6o([0;(3J;greb,nzib<;#g2e6oko-ma,unfu;kat)*3Jrev0;a6n0R;m5n;<sCeBi7roclCu6;h0xi,zhou;c8n6;d6ni`g,t)th4;hoek,s];~?,klow;l65xf]d;aw;a9e7i6%divos=k,olgog$d;_3lnius;nice,r6;o3@ill.;l_cia,ncouv),r3ughn;l# >=r,rumqi,tre+t;aGbil/i,eFheEiCoAr8u6;l@,n/,r6;*,ku;i6ondh64;.te,poli;kyo,msk,ron=,ulo6;n,uT;#6jua3l2Vm/oa$,$3;j*,[ui; -gue,ss&oniki;gucig&pa,hr0l aviv;briz,i7ll*n,mp)e,(6rtu,[k2T;i),[0;#,+u1n0`i,yu0;aFeEh9kopje,owe=,t8u6;$6zhou;>ya,t;at_ /57ockholm,$sbourg,uttg<t;#9e7i6;jiazhua1llo1m%,y0;f52n6;ya1zh5;g-i,=u;attle,oul,v46;c$m_=,*t DlCn6o paulo,pp]o,$jevo; 8aa,t6;a 6o domi(o;a3fe,m1O;#=nio,diego,fr#c/co,j6`dro,s&v^];o6u0;se;em,t %ke city,z27;lou/,`t)s26;aAe9i7o6;me,s=v,t5B;ga,o6y^h;! de j#eiro;cife,ims,nn.,ykjavik;>t,ip4leigh,n+i,w&p*di;i(dao,u6;ez2i=;aGeFhEiDoAr8u7yo(6;ya1;eb%,ya1;a6e=ria;gue,=;rt6zn0; 6l#d,o;au pr*ce,elizabeth,@id;ls5$eus,tts28;i%delp~a,nom p_h,o_ix;ki1?h tikva;dua,l)Znaji,r/,t6;na,$s;ak46d.@,msk,r7s6t?wa;aka,lo;#,dos;a8ew6i(bo,ovosibirsk,yc; 6castle;del~,]le#s,?i`i;g9irobi,n6pl.,[v35t+ez,v0;+7ji1t6;.,o1;a1o1;a7o6p4;ya;no,@ki;aFeDiAo7u6;m>i,ni+,scat;g^/hu,nt7s6;cow,ul;evideo,`lli),re&;ami,l7nsk,s6;kolc,s/@uga;#,waukee;cca,d6lbourne,mph/,ndoza,ssi3;#,ell*,i3;cau,drBkass<,lAn9r6[-d;aca7ib6$k.h,se2N;];ibo,y;aus,+Gda%y,i%;mo;id;aEeBi9o7u6vUy2;#Ncknow,d~a3;n6s #gel.;d2g bea+;brev2Dege,ma6nz,sb2v)pool;!ssol; m#s,i6;c6pzig;.t); p7g6h]e,n0Es vegas,us#ne;os;az,%?;aJ-rHiD%i`CoA$kow,u8y6;iv,o6;=;a% lump4n6;mi1[0;~ma,lka?,pavog4si6wlo2;ce;da;ev,n7r6;kuk,ov;gst2s-6;@;k6=um;iv;bIdu3l%kuri+i,mpa%,n7ohsiu1$6unas,wagu+i;+i,j;d6o,p4;a-r,y;a8e7i6oh#n.W;l*,n0;ddah,rus&em;ip4k6;<?;>d0mph&,nBrkutVs8?Yz6;mir,?pa%6;pa;fah0l7t#b6;ul;am30i2I;+e2d6;i#ap2N]e;aBe8o6yd)2X; +i mi6ms,nolulu;nh;f7ls*6$kli2;ki;ei;ifa,lifax,mDn6rb*,va3;g9nov),oi;aGd#F_EhDiQ%sgCoA$z,u6;a6j$t;d&7(6yaquil;zhou;aja$,u`;ld coast,th_6;burg;ow;_t;eva,oa;sk;lw8n6za;d~6g=k;nag<;ay;a/&2A.,o9r7ukuya6;ma;#kfu6.no;rt;rt6[0; w]7&e6;za;th;d6*dhov5l paso,ss5;*6mont2;bur6;gh;aCe9-ka,/p4o8r.d5u6;b6.seld]f,nkirk,rb0[#be;ai,l*;-,(gu0rtmund;h$dTl7nv6troit;);~;do(hJe7k<,l6mascus,r . @%am,ugavpiZ;i0lV;gu,je2;aKebu,hBleve0Wo6$iova,uriti>;lo8n7p_-g5r6;do>,k;akLst0W;gVm6;bo;aC_9i7o(qi1r/t+ur6;+;#g m8ca6t?go1;go;g7n6;ai;du,zho1;(6t=g$m;+9s-,zhou;gli<i,iAlga9may_Kn7` =wn,r6t#P;acDdiff;b)$,c6;un;ry;ro;aXeOhLirmi(-m,oKrAu6;+<eUda`U_os air8r6s0tu0;g6@;as;.;aA/7usse6;ls;>7t6;ol;ne;sil9t/%8zzav6;il6;le;va;ia;go?,st2;op7ub#.hw6;<;&;iDlA(9r6;g5l6n;*;_;&uru,-zi;fa7g$de,o h]izon6;te;st;ji1rut;ghd^,kGnAot9r8s7y# n4;ur;el,$h;celo3i,r#quil%;ou;du1g7ja lu6;ka;&o7k6;ok;re;(;)s6u;field;a06b03cc$,dd/ a>>,g<?%,hmedYizawl,lTmQnIqa>,rFsCt8uck6;%6;nd;he8l6;#6;?;ns;h6unci2;dod,gab6;at;li6;(t2;on;a9c6kaPtw)p;ho$7o3;na;ge;h8p6;ol6;/;eim;a$vati,m0s6;t)d6;am; 8buqu)q7eppo,gi)s,ma6;ty;ue;>s$h & q^im6mawsil & j^id6;ah;ab6;^;%;>;$;idj0u d-6;bi;#;lbo7rh6;us;rg",
  "Region": ":!1:#$%&()*+-./<=>?@[]^_`~:na,ra,at,ah,hc,ro,ar,al,re,la,sa,ni,ac,an,ss,oc,im,si,tn,is,en,rb;0:2R;a17bajnup,c13d#0We0Ign0Eh08i04k00lZmXnPoKrHsBt6u5xe?4y1zurca8;&ca$k,d#m)n,e2kcu^ek,lic_,n1r^ev@;=sut,oxas;rrZs-j0H;e,us;d> l[%,ohziug,s#g;a$jug,e3i$y>,nom2u1;citc`n@,v>K;-v;hlys,sr1;emos,od;a3d2e^ei.c/uga,i1ole)m,ttesu(a?0;*eg /<m,o<lli;eel,#ld[;cet=az,p2s#k1xet;!$;ai(,iluam%;&ib,o2up1;gnOin0;d*b+ d# d#ld0Gg#les;&#r0c3da)l@,g2hadi,i1<d$bak,or a#t<uq,$te-uq,taujaV;ho,$^o;.dP#rud;ixemXs1ubm>-p;ab%,i.j;a3eme~,_n@]w,o1;el ove1ge),k5t0F;un;cao4gi4ht/jEijuf,nuh,t1u(_,we(tak/s;=2#lek,s1;egad,ot)kh/b,$t%;uy;([;a1ikk_;)z[,s/;agneb1Fe ir0;a3ciwsnu~Klof1rJ;f1)n;us;-p,wa$s;a3ep,h&sj2iaw&,mok,ppi?i1ruo1sotop ]ul #s,xg#ij;?[;*;hg<q,t.;a5$g]tt&(,sed*p 1;a3l&ca1rT;m1nu$;ih;rhd#,yhd0;dek,tu;a3[oyw,odg1;#1;ug;hap,nep;e?`net,(epD<0r3t%s kr1uq/b;oy1; w`;aw+9ihs1;=#l,d)f7egdi~9k6m&g<5n4pm&3-tsec1ybr8;i1uolg;el;! w`;l@<l,otpm&t)n;kcub,tton;ciwrE)y;f%s,t-h,xo;ed;m=;hk5l1;ag3d2s1yr0;i edohr,nee6;nuofw`;>;*1$hj;%tu;d not2ebe1;uq;g<hs1;aw;botin0c0Id0Ge0Fh]do,iSkQlNmLn9o8r6t3uhauhi(,v2woi,y1;+&gem,n(e(;ut;o1-bJ;kad9s`n1;[;a1on9th/$h0upirt;ec,p;g,.nU;a7i2luRozi1;$;lo$c2$t= %n1;as; ht1;rHu1;os;g#l4i3r2^Dyr1;&;ap;dE]uol;et;aba1ilYoh+ko;.;a1iuhaW;cx+t,r1;ek;%>rL/1;.,~Q;bmul@ h]tiMg)eg,hKkymlJlerJnCr9?7t2vodr1;om;ayr4e2@s av1rumdu,ukay;on;hsug1?o;<;ub;aka1ek-E;hk;a2bmuc,eb1;_;kl3v3;a4igriv3)fi.c1;! aj1;ab; tsew;ms2vlysnn1;ep;%;ak;ab,/vu1;(;~;gyda,mirc;av1i)lf;`;axao,c+0_r1;@;am",
  "Place": ":!1:#$%&()*+-./<=>?@[]^_`~:ni,ra,na,ir,al,ah,ne,rb,or,ts,oc,en,ro,la,er,re,el,hc,il,ih,ac,eb;0:3Z;1:4N;a4Nbxd,c4Md3Ge2Pffulb stt/s,g2Lh2Bi29k1Zl1Pm1Dn0Bo07peew*voh,rYsQtCuBveg<,wAx9y3z2;eus,yy;auq=t,b6[4>ti [tt^,r2tnu/ eg%=;rGub2;dus,hg_;d#l,gn2>vQma+,sn$b,xo;(,ib;gid,sm&g,t2B;ai,hp,no+J;fd,gl,-$h;b^0]cip u]0;c&.id EeCf-chsa,lc,noAo9r5s2; C?c3ruh2;dnyl,*varg;e#p,ll_;op3u/2;#ga,sl$e;nov2w<;ed;hs@d>,ogizut;mkao,rf2;ek(,r3I;?. 2k$mw<;#0;g#ppohs,>ic%#f;`&ema,d%l7e4g#.),ll_ 3notpm)2s<@v#; eht;tesnus,yl@v~;d(g@ve,g%g,&fmud,k(0Dm)t,r2w[;ca2oza; n1Q;hg_,si #griv,wo2;daem,l;ataab%(u,e2hl,ia l~,oomt$d,yda%;*]tik,t4v2;& ec*rw( t#as,od2;!%;aw$[c,exe,s2;`n3e]2;l/,#w,-,rB;a2od;!l;c3fs,hos,les eoks$st,r2tnot;=ma1urt;m,o#2;=;aXeWiRo8r7wot2ylk1K; dlo,a5dMe4n2pu;apaj,w2;od;g12ttol$1;e=k,#1;evl0i`tip,ubk0G;dI*ht$p,t2y%c snwo+;aes,cGgnChg&b,kco+,lBnAp6r3s2tud;^>,ue;e2ub^);b>,v2;e,it;m2u;a2/;h2+;!t2H;^ge,uat;am,ob;(,i2;l2n*p,s*k;l2$d;im;a,ip;eew,g#2y-c;ba,tnuh;a4e.%w]su<,l2;)k2m?k %zak;as;lp oz&$c,t&b2; ta?g;dyrd,v)riaf;cauhitoet,dag0eco 2tt)n0;ci2%id#;ficap,t2;c$2%lta;!t2;%;a4[$h,u2;essol/,l2;ut;h2ntup;g7k6lep,*2rud,s@v`,ta1w<;d4t2;le1t2;ot;!ys;cIr0;&b,#2;kcub,ll~,tton,w;a9l2oopk8ta,uk;a5ew4_2;d?,g#rps,n=2x~;ht;d>c,kco.;hxuav,w2;k2nr/;c(b;ham jE&omem nl/n2;^;c6ep,gc,kb,>wd$ob,o4r3s2uu1;$yonsark,tukR;aw<,oy;o+woll2.ov;iw;iw3o2;r y<mi1.doow;r3s2;ek;aw,~;iepmop,ktapuw,$vadog,t_2;at;c7gi[yar,pleug,t2;~m(,r2;ep,o2;faI*g3wtn2;ew;diU;iw3ru]t2;_w;loSn2=n,spi;e?g;dc,kh,n2;i3ok2;em;kNppe,@kcHs%l;arsRbPc%znOdIff^cd?,gDhpmo&t ed c$,koBl8n4p-ue,=mit>b,v-g 3ztgn2;ay;[p0$d7;i4o.2;di0k2;ooG;es;ba.n3in,liv@tn2s^rV;ec;ud;o+@2+mE;hs;(liv y5d&2; <3b2;do8eca7mOxu;ip;ag;is2%rg oZ; Za5do4k2rX;oo2$p;+;ow;[;ep;m/yw,un2;ad;ok;ae.pm),lYnMoowE=f3u-Dv2;oh;d~,?DfaBgnAl8r7s6t3x2;e,o;a3r2;ad,eh;r7w;[ya,mle1tobba;),etXo;i,l~pm2;`;(;.;[7g#4k3y2;eh;ao,$p;ll3r2;ps;/;gTp0;am;(9e2h,om]4; 4br2;ev2;&;ht3.2;ae,ew;r2u8;on;g* w4hg3@dn2si ekCwol;us;_;<;eif3owhtu2;os;ek6*4sn2;am,/a2;~;!e2;rg;aw;);ida&da,um;c&fa,e7i6#]od5r3uh`&i1zti *]i1;];bm)2f;>;#;sa;kaukomua%hap5s2; d3@tt2;ab;?;ap",
  "Country": "!1:#$%&()*+-./<=>?@[]^_`~:an,er,ar,ra,in,ma,na,al,ri,en,st,ba,el,ti,or,ia,at,ne,ic,it,ng,is;0:34;1:2I;a2Tb2Ac1Yd1Ue1Of1Ig18h16i11j0Zk0Wl0Sm0En03om#,pXq[%,rVsItAu6v4w+3yemRz2;a21im<bwe;es,l~ #d futu*;a2.ezu=a,iet*m;nu[u,>c# c_y;gRk4n_ed 3ruVs2zbeC; 28a,sr;%ab emi&tes,k(gdom;!&iU;a7haBim? le/e,o6r(idad 4u2;n~0rk2v+u;ey,me2Vs #d ca^1S;#d t2t2;o<go;go,k=au,`a;iw#,ji2nz2P;ki2R;aCcotl1eBi8lov7o5pa(,- l#ka,u4w2yr0;az2ed9_z$l1;il1;d#,r(ame;lomon1U)l0uth 2;afr2GkLsud#;ak0.0;$& leoEn2;gap?e,t )%t2;.;]gKrb0ych=lY;(t 2moa,n m%(o,udi %ab0;h=e*,luc0m%t(;epubl^ of ir0Bom2Auss0w2;#da;a3eH_cairn1Jo2u$to -M;l1rtugE;ki29l3*),pua ]w0S&2;gu6;au,e/i2;];aAe8i6?2;folk1Fth3w2;ay; k2$n m%i#a1A;?ea;c%agua,g$2ue;!@;p2th$17w ze+1;+;mib0u2;ru;a6exi5^ro08o2y#m%;ldova,n2roc4zamb9;a3gol0t2;.egro,s$&t;co;c9dagascYl6r4u-t3yot2;te;#0ius;sh+l0Ut(2;ique;a3div2i,ta;es;wi,ys0;ao,edZ;[v0e4i2uxembourg;b2echt./e(,thu1C;$0ya;b#on,sotho;azakh1Ce3i-<>,o2uwa_,yrgyz1C;rVsovo;=(g0Inya;a2$E;)13p#;c5nd4r2s&=,t+y,v?y coa/;a2=1;n,q;@,oI;=1;aiSon2u`%y;du&s,g ko`;aA$m#y,h#a,ib&lt9re7u2;a5$n4(ea2y#a;! b~s2;au;sey;d=oupe,m,te)la;e2*da;ce,nl1;%;bTmb0;a6i5r2;#ce,.ch 2;gui#a,poly2;]s0;ji,nl1;lkl#dTroeT;a/ >m6cu5gypt,l s+v5`l1qu[o-+3-tr4/2thiop0;on0; gu(2;ea;ad2;?;.m%k,jibou4om(^a3r con2;go;!n B;>;aA.t&l af-c# 9h7o4ro[0u3yprQzech2; 8@;<,&cao;c3lo2m?P`o b&zzaville,okF/a r02te de ivoiK;mb0;osD;i2-/)sF;le,*;republ^;m2*Tpe v$de,ym#9;bod0$o2;on;aFeChutZo8r4u2;lg%0r2;k(a faso,),undi;azil,i>sh 2u]i;virg(2; ~2;l#ds;liv0*i4sn@ #d h$zegoviGtswaGuvet2; ~l1;#d;re;l2n7rmuF;%2gium,ize;us;h3`ladesh,r<d2;os;am3&2;(;as;fghaElBm$An5r3u/r2z$<ijG;+0@;g.>2m.0u<;*;d?&,g4t2;%ct5igua #d b%bu2;da;o2uil2;la;^a;b2g$0;#0;@;ni2;/2;#",
  "FirstName": ":aRdys,eJfiel,holiIiHlGnBo9rialb,s6timus,y0;aHb4crad,dissac,e0rrSttU;r2s0;a0lQ;c,k;bua,dS;ag,leC;dOi0ok3;o0rk,xeI;cnarf,la;c0k0lrL;in;a1eirda,niuq,o0wahsal;irIv1;g1rik,v0;ed;er,rom;em,ladnC;ak,dFexe8ttDva;hs;duj,i3l2mi1n0;er,neye4;aj,x9;eirbag,hukolem;f2j,lra1m0ssej;aj,maj;hc;la;cul,e4ian3nim,r2t0yli;anih,tayn0;ek;d2ika;am;hs,rd0;na",
  "WeekDay": "fri2mon2s1t0wednesd3;hurs1ues1;aturd1und1;!d0;ay0;!s",
  "Month": "dec0february,july,nov0octo1sept0;em0;ber",
  "Date": "ago,on4som4t1week0yesterd5; end,ends;mr1o0;d2morrow;!w;ed0;ay",
  "Duration": "centurAd8fortnight9h7m5q4se3w1y0;ear8r8;eek0k7;!end,s;ason,c5;tr,uarter;i0onth3;llisecond2nute2;our1r1;ay0ecade0;!s;ies,y",
  "FemaleName": "!1:#$%&()*+-./<=>?@[]^_`~:el,an,na,en,ie,in,le,ri,et,is,da,ia,on,ma,ra,la,yn,ne,sa,er,ey,ce;0:I4;1:I8;2:HG;3:HY;4:HH;5:HL;6:IL;7:IP;8:G8;9:IH;A:G1;B:GZ;C:HQ;D:IE;E:AF;F:HU;G:H1;aFSbEOcCVdC4eARfA9g9Kh92i8Sj7Pk6Rl5Cm3Sn39o36p2Uqu2Tr22s11t0Bu09vZwSxi30yOzH;aLeI)eb,oHsof4;e3Df4@,?;h2iKlI%,[H;ab,ep;/,>;/,h2iH?;%b;aJeI)g,olACu0vH;-8=CT;*0s&4;#,gmur,n,s89;aM&dD6hiCNiH;lJnH;if3TniHo0;e,f3S;h#mi0lH>;a,ow;ka0nB;aNeKiHu^5;ck7JkIl8o*AviH;$E&I4;ky,to+AT;/,l>,rHs0;a,nH=ica;a,i~;*H]sG9;nHLrH;i1y;g9rHs7;su5te;aXeThQiMoKrHu5y2;acI4iHudy;c4%,sH;hEta;nHr0F;iEya;aJff$y,nHs7;a,gtiH;ng;!nEU?;aIeHo>si0;a,l>,o7Pres1;l4ndolw-hu;g$,o7NrIssH;!a,(;eHi,+6;^,za;bOlMmKnIrHs7t<0wa0;a7G[;iHya;a,ka,s7;arEe2iHm6N?;!ka;a,iH;a,t7;at7it7;a0Bcar*tt,e07hViSkye,]za0oQ+,tNuIyH;bil,lvi1;ha,niAsIzH;$39-8(,y;$Hi6;!a,e,nH;aCe;aIeH;f$3l4Wph$5U;cH6r5;fi9KnHphi1;d2<,ja,ya;_2lv4m=1nIobh$,tH;a,i;dy;aMeIirHo0y5;a,lCU;ba,e0i5lJrH;iHr60yl;!d$;<,lD7;i>a,ki2nJrIu0w0yH;@,%;i,*9=,r=,[;aI/,<,nH=;a,=;!ya;lJrIvH;/,)j;e0ife;&1i0>;$vi,bLd57har,iBkKlJmInd2rHs7v$%C;aCi0;$t7i2;lCY>,ome;)eh,u2;)1+0;a03eYhWiToHuthCW;bRcQl7XnPsJwIxH;$AE(,y;$,e0;aIeH(,lD;$n6ll1>rCQtA;!lHnn1;iH[;e,nH;a,dE;/,i,%;h#5Rio;b),_A[;a,cIkH>s,nEta,ya;ki,o;h8Bki;ea,i$n=,oH;/,n1F;$0bIemEgi0i0nHta,y0;a7Oee;a,eH;cHkaC;a,ca;chIe,i0mo0nHqu#,y0;di,<;a#,#HiB;!e,*;e&3<0;aOeNhK<,oIrH;.cil3Aud&~;lHrt4;i0ly;iloIoebe,ylH;.,l.;me0;ggy,n#ope,r5t2;ige,m0Nn59o5rvati,tIulH;a,-8)1;+cHt4F;a,e,<;ctav4deIfCCk^0lHphCCumou;a,ga,iv4;l4t8;aTeRiLoIurHy5;!ay,ul;a,eIor,rHur;aCeF>;ll1mi;aLcJha+ka,kI@H%,s7ta;!y;a,iDBki;hoGk9HolH;a,e4G;!mh;hir,lH%,+s^;!a,lBD;dLi>,nKomi6rges,tH;aHhal3;lHs7;i1ya;cy,-8;e9iECya;a08ck&z3e00iMoJu+#,yH;a,rH;a,iM%,tG;i2llB2nH;a,iH;ca,ka,que;a,cSdo+,kaRlMmi,nKrHtzi;aIiH;am;!nB;dy,eHh,n3;nhGrva;aKdJe0ica,lH;iHy;c&t,e;red;!gros;!e5;ae5hH;ae5#3T;ag$,gNi,lKrH;edith,iI=,yH;em,l;em,s^;$3iHl.a;nHsBY;a,/;!$,h$;b07cADd05e,g03ha,i02ja,l00nZrLsoumeh,tKuIv.,xB0yHz3;b#l,?,soun;d6rH;a,eF;h82ild1t3;a,cTgPiKjor3l7Gn3s7tJwa,yH;!aHb-h,ja9lou;m,nB0;a,ha,)1;!aJb#,eIja,lD%,sHtza;!a,ol,^;!l1A;!h,m,nH;!a,e,n1;arJeI(,oHr3Yue+8;!t;!ry;-3Wi36;#4Li6Zy;dy,=,ue5;ak,&,iHlory;a,ka,nB;a,re,s3te;/Hg3;!l&1;alDd3#Hge,.=,=0;ei9)1[;#,*;a0Me0BiWoQuLyH;d4@,nH;!a,dIe2KnHs`;!a,e2J;a,s`;$n,cJ#0O.1lI%,pHz;e,iA;a,u;iHy;a2Oe,ja,l2JnB;.,l1QrItt1HuH;#5.1;aJeIi6%,rH;a9Vi6;*i,n1tA;!)1;aTbb95dSepa,lNnKsJvIzH;!a,b-h,-8z3;!<;a,-8;!a,dH;a,sHy;ay,`,i,y;a,iJja,lH;iHy;a9Qe;!aH;!nE;<,ya;!nH;!a,];aP/,e0iNjY@,nMoKsJtHx8Ry5;iHt3;c4t4;edi,lC6;@,nH?;a,(,o2;a,or1;a,gh,@H;!ni;!h,nH;a,d2e,n5K;cOd=0iNkes7mija,%,rMtJurIvHxmi,y5;_n1)4;a,e4Z(,[;as7iIoH;nya,ya;fa,s7;a,.9R;a,@;`,(,y;a01eWhaViN*a,oMrJyH;lH?;a,ee,(;.tHy67;a,&,iHy1E;!e,n55;nul,+,urt]y;aN_M*y,mJrHzzy;a,stH;&,);!b_lH;eHi,y;e,y;a,stF;!%,?;dij1w5;#7LiKlJnIrH;a,i,+;d2%,za;`,i,lB6s3y;?,s7;c`,d<tou,ede,iSlQmPrNss6EtKviAyH;!e,lH;a,eH;e,igh;!a68eIhHi4LlD+0y;ar83_83(,*FrAVy;!l[89+0;a,&,iHl5Poli0[;!>,nEs^;a5il1;eigh,i,lH;e,(;a,tl6F;a0AeZiWoOuH;$MdLlHst7U;es,iH;a88eHs^;!n9tH;!a,te;ith,y;a,iA;!$Nc#DdM#Gh$7H*Lni,sIva0yH;a,~;eH(;fHlDph7K;a,)1;&,n1;i6y;!a,e,n3X;lHng;!i$,lH;!i$;$N*0nKrJsH;ica,sH;!e,ica;i,+;!a,#Gif_,nH;a,-8iHy;!e,f_;a,eJiInH;a,eIiH;e,n1;!t8;cM/,mi,nIque27sm)Ev(2y9zH;m)6;a6eIiH;~,e,n1s;!lHs^,t0A;e,*;)Ik68lDqu#H;)1[;/,ta;/,lPmOnNo0rMsIvaHwo0;!%;aIiH@,ob#;do2;b#Hdo2;!a,e,l34;ati,&1i0>;di2es,g+d;a9#Boge9;a,e9<0o0se;aQeNiIoHyac)th;/,ll3rt&se;lI>H;+;aIdH@I;a,egard;ry;ath_,iIlHnr(tArmi9st_;&2Rga,mi;di;biba,i*y,lNnMrJsnItHwa,y*y;i~,t3;aa;iHm=y,+4Z;-H;!te;aC%C;a,`,l3;a01eViQlOoNrKunJwH;&H[-h;!dolD;ay,#;ac(I-H.#B;a,chF;!@;ld1Aogoosh;adys,&Hor4[.;a,/,%;aKgi,lI%,ov85s#Hta;a,e,*;/,liH;$;!n0;mLnJorgIrH;ald5Ki,m3Btrud6;-8i4U;a,eH%;s.,v(ve;>;bH*,rn-,yG;iI+#H;a,l1;!ja;aTeQiPlorOoz4rH;$JeIiH;/,eB;/,ja;!cH;esIiHo.e;n1sca;!ca;a,&c4;&,o0;lIn0rnH;$B;ec4ic4;nArKtHy6;emIiH>,ou>A;ha,>,n;eh;ah,iB?h,za0;cr),d0Qevi,i*Fk0Ol07mXnid,rUsOtNuMvHwa;aK#IiH;!e,ta;)E[;!a;!ng#4O;g&i1ni~;h#,i&9ta;mLp_$KtH;eIhHr#5;_;l2Zr6;za;a,e?lB;iH>,]4E[;cHka,n;a,ka;aPeOiLmH;aIeH(,y;li9;!li9nuH;#G;lHn1;e6iHy;a,e,ja;ly,?ld;!nue5;aWeUiNlM>,no2oKsJvH;a,iH;%,?;a,(;iHuiH;se;a,&,(,y;a0c4/,e,f,nMsJzaH;!b-HveA;e,h;aHe,ka;!beH;th;!a,or;$or,nH;!a,i;!)1%;ate1Pta;vi;eIiH%,wi0;e,th;l,n;aYeMiLj&eKoH;lores,m)ique,n39rHtt3;a,eF.,@,othHthy;ea,y;ba;$09%C=9ya;$QbPde,eOiMlJm-r4nHsiree;a,iH;~,se;a,iI@,orHphi9;es,.;a,@h;dHrdH;re;!dee,%;!b2Eo?C?C;a,d2nH;!a,e;hl4i0@l,mNnLphn1rIvi1VyH;*,%;a,by,cI<,lH;a,&1;`,(;a,-8iH;!ca,#19ka;arH<;.;a0Qe0Mh04i02lUoJ+stI[H;di,th4;al,i0;lPnMrIurH;tn1C;aJd2IiHn2I+9;!nH;a,e,n1;!l3;~pci=,n3sH;t$Hu#o;~,za;eH*F;&,t8;aJeoIotH;ilde;!pat2;ir6rJudH;-8iH;a,];a,e,iH;~,sY;a2_2ndH;i,y;aQeNloe,rH;.JyH;stH;al;sy,tH;a1M&,iHy;$1e,n1;lseIrH;!i6yl;a,y;nMrH;.KlImH;ai9;a,eHot8;n1t8;!^;d2#GtH;al,#G;cIlH;es8i41;#4ilH;e,<,y;itlYlXmilWndVrMsKtHy5;aIeIhH+0;_1D*FrDy;+0;a32sH;a31(;a,iOlLmeJolIrH;(,ol;!e,)1[;lHn;!a,@;a,eI(,otHy;a,ta;],y;%,s^;a~,i~;a,e,l1;.Al3;),[;arb0Je02iZlXoUrH;$di6eRiJoIyH;$0nn;nwDoke;$3BdgMgiLtH;]y,tH;!aInH;`,i,y;ny;d,t8;-H;!t6;$0e,nH;/,%;bbi6g@rInH;iAn3;ka;$cHythe;a,he;$ca,lja0nH;iAtH;ou;aVcUl)BniArPssOtJu@CvH;!_lH;`,y;hJsy,tH;e,iHy6;e,%;!$H;(,y;!(;nItHyl;ha,(;adIiH;~;-8i9;ca,ky;!t+H;~,z;a2o2?;a2Sb2Md23g1Zi1Qj5l16m0Xn09oi,r04sVtUuOvNwa,yHz2;aKes7gJlIn,seH;!l;);un;!nH;a,%;a,i2J;drLguJrIsteH;ja;#4;stH;)1;a,`,y;aahua,he0;hIiya,ja,miAtrH;id;aLlHt=;eIi6yH;!n;e,iHy;gh;!nH;ti;iJ*Io7piA;ta;&,n1t8;aH#G;!n1J;a01dje5eZgViTjRnKtoHya;)-8nH;#5<;te;!aKeIiHmJ;e,ka;!mHtt6;ar3;!b#IliHmU;^;!l1;a,#iH;ca;ka,sHta;a,^;#H(;a,iH;a,ca,n1qH;ue;!tH;a,te;!bImHstasiMya;ar4;#;aLb_K#iJiHy;e,l4%H;!ta;a,ja;!ly;hGiIl4nB;/;a,?;*;aWba,ePiMlKthJyH;a,c4sH;a,=,^;ea;iHys=;e,s=;a,cIn1sHza;a,e,ha,=,^;e,<,ja;c4.7jaKk^K%,sJxH;aH<;!nd2;<,^H;nd2;?;<;i0nIyH;ah,%;a,.,%C;@;c7/,*FmNnLsH;haClH;)HyY;g,n;!h;a,o,slH;`;ee;&;at7g3nIusH;ti0;es;(;aWdiT#MrH;eJiH;$M&H;a,e,];$0;%;!aLeKiIyH;nn;a,n1;a,e;!];!iH;de;e,lDsH;=;[;!lH;i9[;];aKbIiHrL;!e,gaK;`,i6y;!e;gaH;il;dKliyJ?dhIs7;ha;ya;ah;a,ya",
  "Honorific": "director1field marsh2lieutenant1rear0sergeant major,vice0; admir1; gener0;al",
  "Adj|Gerund": ":!1:#$%&()*+-./<=>?@:er,ts,ra,uo,ir,ar,it,xe,la,ps,ed,re,lf,us,im,ob;0:38;1:2Z;2:3C;3:3G;gni4;b3Fc3Bd2Mg2Eh28k22l1Pm1Jn1Bogt&,p19r0Vs0LtRuQvKwoJxHy8z4;ama,e#f,i4;g<2-4noga,<msem;rom0t4;iv#,nat;aBf6l5nap0Donna,r4zz3;av,t;l),t&;i4s*as;r5t4;)g,sym;r4tcele;et,oh;c0p;at,e4;lp<p,v;!=,rg;a8i7lov#,o6r4;a$,e4;nnu,s0;l,m;ec0l,rht;r,sefil;g(tXniCs2;aKcIeHfiGhgil0iFlEnDpmet,roCs6t4ub(B;es4if,uc;ffo,pu;a7#6i5u4;ah+,gs3rt;wt,+;!etQ%;l,r4;tn1;fm1pp>;ess3ioppas3uad;em,>L;c+,vK;lpu,rd;kcoryks,pm1v(;a4i=n1;r2D+;cixotFdCg*?,iBlumi$,nAoZr7t5v*4;om,pac;i4sav0;lib0rri;alih+,e5g,o4$urf;givAprocA;le8.a+;evuj#,?ulli;l?uh,ruf7;?*6om4;mo4;cca;ni;a#cCiAo8s5u4;fn1ma;)%bme,#4?;p4$3;!/;lc,p4;mi,po;-tiv#,morp4rpr>,urb;!m1;/,ni;aFe9i6@,ri$,u4;d2l-,ssaKt4;am,run;.4t;a,n4;i,oc;d7gga$,tta6wo4;=,p4;me,r14;=;liweb,na4;em;c,d,/2lg,o4;r,s;eews,ols,p4;alr0X(g;aeAe6gi#,i4nuV<cn1;am#,f/4hs,lc0;!#;dda6t4vil2;a#Ihgi4%ehs3;rf;m,s;l,m0;a7l6o5%4;hc,-,s3wt%eh;cV@;ac,ehwr0L;e4=;lg,$;aeFbCeuLfBgg@,iAk%.,l5pp(c,t4w).,zzZ;%Gsub,tesnu;)ht2e7i5or4;!tn1;fluf,hc,r4w;ht;pm1t,uFws;av#p,ms,@;fab,i6;a2m4&5;),e4um;rt;h,ppa,vP;a6c5(4ovorp;$;al,ohs;#bdn&5os,thtae4;rb;rg;c6s4toos;ad,#fHin4ur;otKup;a,e#cs,(2%rWt4&t;ef,iw4;eb;a8gal,n6r4;e4>;me;a4el-4ulp;hc;g2m5r4;!&c2;ad;aQdPeM(rLlJn6o5%w4;#;b#of,lpE;aBe9i7o.#r1&4;f,rr5t4;sa;>;b4lb;!lleF;f4m,p;fo;m6p5$t4;&;+;/,m1;oc;eiy,of4;nu;evo;ce5e4;.;rp;ub;el,f,rg0;/;*2n4<ip;etnes,u4;@;ne;m7r4;osba,u4;$3;id;un",
  "Comparable": ":!1:#$%&()*+-./<=>?@[]:rg,ae,ir,ar,ol,ra,ee,il,er,ts,os,us,oo,ah,as,iw,lb,uo;0:3N;b3Tcitnamor,d39e23f21g1Yh1Tk1Ol19m17n12p0Zr0Usso#,t0Hw0Dy1;a0Bc09d02e01f=g,hs,kcul,lKmInEpp>,rBs8t3v2xes,z1;oc,t%,zid;$h,=#,v?;aMf4iurf,l3nacs,r1;$h,i1;d,lf;?,uaf;eh,(;$,e0Sion,o2u1;b,(;n,r;a2dwat,*l,gn1@,r4w;a,uh;cs,ew,w;az,i2n1ohp,up;uf;&,h1t;s,w;aof,+s,=1;lg,r;bbin,dGeDgu,htr$,iCkciBl8nev$h,r6s4t1w(;hg%ps,ni?,s1;>g,o1;c,hg;!a1i#;em;$,u1;b,c;ems,i1oj;h1s;!c;rp,s;o,w;k+,m2n(,ta0v1;+,(;it,oh;$d,duc,ne%f,)woc;c%p,gac,#;a5dig,*#,it,n4=3r2u1wab;ag,oS;>,en,u0;[,m;-t,@;e1hs;h,.;i1n]b;!ps,uj;g,#;&,en,(1;!l1;aXe1;m,y;aBc%0e8f7hgi6n2oh,)Ws1;av,iom;a1egell0Ria7;drev,i2ng-p,s$lp,tis1;eh;g,ll%b;&0ls,rb,t;i3/;e2i1;uq;ws;e1lf;n,#;a4e1=p;dne2ppad,ttib,ve1;lc;ls;e1Wf,gluv;a2*1m+,)DsiH;d,.;ehc;e3ia2mel/,ommoc,re.1uf;!$;lp,v;dd<,e1;k,#;i1odn&;ls,#;a8eu7i5l1;a3i1uf;!r1;hs;ms,t;aHl,uqna1ve;rt;rc;-6i2mro1yW;f,n;c2tn1;a.b<,esse;e1ifrep<,nanif,/;ps;!r<;$w,c3*2n1)0;ip,urd;ls,m;a[,i1;ht,s,uq;g3s1;&b,e1rX;rf;ih,]1;r,t;ib,n1;o1]y;l,r0;aDf1;i0ub;c02d01f?,gY%*,lQmKnHpGrCs8t2u1vian;gav,[,rt;a4i2om-,u1;c,m;hw,l1;op;idemr1l,mit8;et7;@,n3o2)1;oc;(;ed;&,ev3id,/,u1;ces1p;ni;es;%;adnum,i1;unBv1;id;a5-txe,/1;dn3e1;u1wa;#;>;l,t;a0b6p5t1;b3n2t1;+;eg;<;mis,rup;*f,m1on;in,uh;n&1)l,uh;o,.;?;@,ur;in,r1;a2e1;if;cs;aIdo,eGiCl9n5r3]2w1;el;l,rp;>,i1<ba;ew;a3ik,o2]fo1;rp;f,[;[,#;ab,i2o1;!b;m,w;l3muh,p1;&,u0;.;/;gg1kc@,r;&;b,ed,lg,m,o1s;rb;+g,mu1;d,n",
  "Adverb": "!1:#$%&():ar,ea,st,er,on,or;a01bYde XeVfOheMinKju%Jkinda,likewiWmHnEoBp9quite,r8s3t1up0v&y,we4; to,w#ds5;h0oo,wiL;en,us;eldom,o1ti0uch;ll;!me1(,rt0; of;how,times,w07;a01$lI;# excellenD&0; Lhaps;f1n0utright;ce,ly; courIten;ewCo0; l(gVt 0w;(Awith%andB;aybe,$nwhiL)e0;!ovS;! aboW;d0%eW;eed,o)s;lla,n0;ce;)4u0;ck2l1rth&0;!moH;ly;ing; 0evH;examp8good,suD;n mas0vF;se;juAtrop;ackw#d,y 0;f#,no0; m$ns,w; GbroFd naus$m,gain,l7ny5p#t,s4t 2w0;ay,hi0;le;be8l0mo8w)8;#ge,$7; so(,i5;mo0way;re;l 4mo3(gsi2r$dy,so,toge0ways;th0;&;de;%;b1t0;hat;ut;ad;lot,po%&i)i",
  "Conjunction": ":dna,eRfiNgnisoppus,hKlit,neGoDr8s4t2y1z0;oc,uc;beOlnoH;aht 0ey,on ro,sliSub;dedivorp,rBwS;a 0oc,ulp;hcum sa1noos0raf0tsuj; sa;! L;e1o0;!n;ht1ve0;neJoJreJwoh;eIie;ht,t0;! r0;edro D;h0ve;t1w 0;fi,wD; fi;cumsa8guoht0;! 0la;n2sa;! 0;e1n0sa;eve;re4;cnis w4li3rofe2s0;ac 0iwrehto,uaceb;ni;b,reht;hw;on",
  "Currency": "$,aud,bQcOdJeurIfHgbp,hkd,iGjpy,kElDp8r7s3usd,x2y1zl0\xA3,\xA5,\u0434eh,\u0E3F,\u20A1,\u20A8,\u20AC,\u20AD,\uFDFC;!otyQ;en,uanP;af,of;h0t5;e0il5;k0q0;elK;oubleJp,upeeJ;e2ound st0y\u0431;er0;lingG;n0soF;ceEnies;empi7i7;n,r0wanzaCyatC;!onaBw;ls,nr;ori7ranc9;!os;en3i2kk,o0;b0ll2;ra5;me4n0rham4;ar3;e0ny;nt1;aht,itcoin0;!s",
  "Determiner": "aBboth,d9e6few,le5mu8neiDplenty,s4th2various,wh0;at0ich0;evC;a0e4is,ose;!t;everal,ome;!ast,s;a1l0very;!se;ch;e0u;!s;!n0;!o0y;th0;er",
  "Adj|Present": ":dnuor,eSgnRhtooms,kcQlPmNnKpmad,rIsserpHt4wo2y0;a0cnaf,daer,rd,tpme;l,rts;l0rran;loh,s;ceAew,hg8i7n5p2r1sa0;f,l;ela,ohs;m1ur0;knab,rR;e7orp;e0iaf,ulb;seZtnO;ciKefretnuN;i0uD;la,r;frep,lLpsus,r0;id,rJ;xe;aeMe0uos;dnMttu,wol;ae0epo,iht,wo;l0m;!c;id,lac,r0;aw,if;ellarap,lud,oAuof;auq,ils;orw;eMgLkKlJmiInif,rEsAt1v0;arb,il;a0elpm5;cilp6d5gujn4lucitra,m3r0;ap4e1oba0;le;biled,dom;ixorppa,musn0;oc;es;er;n2o1uf0;ed,fid;lc;et;a2u0;c0s,tam;es,sbo;b,ps,uqs;rp;ap,buod,di;af;areva,ni0;rf",
  "Person|Adj": "b3du2earnest,frank,mi2r0san1woo1;an0ich,u1;dy;sty;ella,rown",
  "Modal": ":a5dluo4ll2nac,ot 5stel,t0;hg0na2sum;im,uo;a0iw;hs;c,hs,w;thguo",
  "Verb": "cannot,gonna,has,keep tabs,msg",
  "Person|Verb": "b8ch7dr6foster,gra5ja9lan4ma2ni9ollie,p1rob,s0wade;kip,pike,t5ue;at,eg,ier2;ck,r0;k,shal;ce;ce,nt;ew;ase,u1;i2l1ob,u0;ck;aze,ossom;ff,ll",
  "Person|Date": "a2j0sep;an0une;!uary;p0ugust,v0;ril",
  "Timezone": "atlant2central 0eastern 0mountain 3pacif2western e1;d4e0s3t6;uropean4;ic 0;d1s0t3;tandard1ummer1;aylight0; t0;ime"
};

// ../../node_modules/efrt/src/encoding.js
var BASE = 36;
var seq = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var cache = seq.split("").reduce(function(h, c, i3) {
  h[c] = i3;
  return h;
}, {});
var toAlphaCode = function(n2) {
  if (seq[n2] !== void 0) {
    return seq[n2];
  }
  let places3 = 1;
  let range = BASE;
  let s = "";
  for (; n2 >= range; n2 -= range, places3++, range *= BASE) {
  }
  for (; places3 > 0; places3--) {
    const d = n2 % BASE;
    s = String.fromCharCode((d < 10 ? 48 : 55) + d) + s;
    n2 = (n2 - d) / BASE;
  }
  return s;
};
var fromAlphaCode = function(s) {
  if (cache[s] !== void 0) {
    return cache[s];
  }
  let n2 = 0;
  let places3 = 1;
  let range = BASE;
  let pow = 1;
  for (; places3 < s.length; n2 += range, places3++, range *= BASE) {
  }
  for (let i3 = s.length - 1; i3 >= 0; i3--, pow *= BASE) {
    let d = s.charCodeAt(i3) - 48;
    if (d > 10) {
      d -= 7;
    }
    n2 += d * pow;
  }
  return n2;
};
var encoding_default = {
  toAlphaCode,
  fromAlphaCode
};

// ../../node_modules/efrt/src/unpack/symbols.js
var symbols = function(t) {
  const reSymbol = /^([0-9A-Z]+):([0-9A-Z]+)$/;
  for (let i3 = 0; i3 < t.nodes.length; i3++) {
    if (!t.nodes[i3].includes(":")) {
      break;
    }
    const m3 = reSymbol.exec(t.nodes[i3]);
    if (!m3 || m3[0].length !== t.nodes[i3].length || encoding_default.fromAlphaCode(m3[1]) !== i3) {
      throw new SyntaxError("Invalid efrt packed data: symbol definition");
    }
    t.syms.push(encoding_default.fromAlphaCode(m3[2]));
  }
  t.symCount = t.syms.length;
  t.nodes = t.nodes.slice(t.symCount);
  if (t.nodes.length === 0 || t.syms.some((index3) => !Number.isSafeInteger(index3) || index3 >= t.nodes.length)) {
    throw new SyntaxError("Invalid efrt packed data: symbol target");
  }
};
var symbols_default = symbols;

// ../../node_modules/efrt/src/unpack/escape.js
var unescapeLabel = function(text) {
  return text.replace(/\\([\s\S]|$)/g, (match2, char) => {
    if (char === "\\") {
      return "\\";
    }
    if (char >= "a" && char <= "j") {
      return String(char.charCodeAt(0) - 97);
    }
    throw new SyntaxError("Invalid efrt packed data: label escape");
  });
};
var escape_default = unescapeLabel;

// ../../node_modules/efrt/src/unpack/dictionary.js
var dictionary = function(trie) {
  if (!trie.nodes[0].startsWith("!1:")) {
    return;
  }
  const header = trie.nodes.shift().split(":");
  const tokens2 = Array.from(header[1]);
  const fragments = (header[2] || "").split(",");
  if (header.length !== 3 || tokens2.length === 0 || tokens2.length !== fragments.length || new Set(tokens2).size !== tokens2.length || trie.nodes.length === 0 || tokens2.some((token) => token.length !== 1 || token.charCodeAt(0) < 33 || token.charCodeAt(0) > 126 || /[A-Za-z0-9,;!:|]/.test(token) || trie.versioned && token === "\\") || fragments.some((text) => !text || /[A-Z0-9,;!:|¦]/.test(text))) {
    throw new SyntaxError("Invalid efrt packed data: fragment dictionary");
  }
  trie.dictionary = /* @__PURE__ */ Object.create(null);
  for (let i3 = 0; i3 < tokens2.length; i3++) {
    trie.dictionary[tokens2[i3]] = trie.versioned ? escape_default(fragments[i3]) : fragments[i3];
  }
};
var dictionary_default = dictionary;

// ../../node_modules/efrt/src/unpack/traverse.js
var indexFromRef = function(trie, ref, index3) {
  const dnode = encoding_default.fromAlphaCode(ref);
  const target = dnode < trie.symCount ? trie.syms[dnode] : index3 + dnode + 1 - trie.symCount;
  if (!Number.isSafeInteger(target) || target <= index3 || target >= trie.nodes.length) {
    throw new SyntaxError("Invalid efrt packed data: node reference");
  }
  return target;
};
var parseNodes = function(trie) {
  return trie.nodes.map((node, index3) => {
    if (node === "" && trie.nodes.length !== 1) {
      throw new SyntaxError("Invalid efrt packed data: empty node");
    }
    const terminal = node[0] === "!";
    const body = terminal ? node.slice(1) : node;
    const edges = [];
    const token = /([^A-Z0-9,;!:|¦]+)([A-Z0-9]+|,|$)/y;
    for (let offset2 = 0; offset2 < body.length; offset2 = token.lastIndex) {
      const match2 = token.exec(body);
      if (!match2 || match2.index !== offset2 || match2[2] === "," && token.lastIndex === body.length) {
        throw new SyntaxError("Invalid efrt packed data: node syntax");
      }
      const ref = match2[2];
      const label = trie.versioned ? escape_default(match2[1]) : match2[1];
      const text = trie.dictionary ? Array.from(
        label,
        (char) => trie.dictionary[char] || char
      ).join("") : label;
      edges.push({
        text,
        target: ref === "" || ref === "," ? -1 : indexFromRef(trie, ref, index3)
      });
    }
    return { terminal, edges };
  });
};
var toArray2 = function(trie) {
  const nodes = parseNodes(trie);
  const all4 = [];
  const stack = [{ index: 0, pref: "", edge: -1 }];
  for (; stack.length > 0; ) {
    const frame = stack[stack.length - 1];
    const node = nodes[frame.index];
    if (frame.edge === -1) {
      if (node.terminal) {
        all4.push(frame.pref);
      }
      frame.edge = 0;
    }
    if (frame.edge === node.edges.length) {
      stack.pop();
      continue;
    }
    const edge = node.edges[frame.edge++];
    const word = frame.pref + edge.text;
    if (edge.target === -1) {
      all4.push(word);
    } else {
      stack.push({ index: edge.target, pref: word, edge: -1 });
    }
  }
  return all4;
};
var unpack = function(str, versioned = false) {
  const trie = {
    nodes: str.split(";"),
    syms: [],
    symCount: 0,
    versioned
  };
  dictionary_default(trie);
  if (str.match(":")) {
    symbols_default(trie);
  }
  return toArray2(trie);
};
var traverse_default = unpack;

// ../../node_modules/efrt/src/unpack/index.js
var unpack2 = function(str) {
  if (str === "" || str === null || str === void 0) {
    return {};
  }
  if (typeof str !== "string") {
    throw new TypeError("efrt unpack expects a string");
  }
  const obj = str.split("|").reduce((h, s) => {
    const arr = s.split("\xA6");
    if (arr.length !== 2 || Object.prototype.hasOwnProperty.call(h, arr[0])) {
      throw new SyntaxError("Invalid efrt packed data: category separator or duplicate category");
    }
    h[arr[0]] = arr[1];
    return h;
  }, /* @__PURE__ */ Object.create(null));
  const all4 = {};
  Object.keys(obj).forEach(function(cat) {
    let data = obj[cat];
    const versioned = data.startsWith("!2;");
    if (versioned) {
      data = data.slice(3);
      if (!data || data === ":") {
        throw new SyntaxError("Invalid efrt packed data: missing versioned trie");
      }
    }
    const reversed = data[0] === ":";
    const arr = traverse_default(reversed ? data.slice(1) : data, versioned);
    if (cat === "true") {
      cat = true;
    }
    for (let i3 = 0; i3 < arr.length; i3++) {
      const k2 = reversed ? Array.from(arr[i3]).reverse().join("") : arr[i3];
      if (Object.prototype.hasOwnProperty.call(all4, k2)) {
        if (Array.isArray(all4[k2]) === false) {
          if (all4[k2] !== cat) {
            all4[k2] = [all4[k2], cat];
          }
        } else if (!all4[k2].includes(cat)) {
          all4[k2].push(cat);
        }
      } else {
        Object.defineProperty(all4, k2, {
          value: cat,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
  });
  return all4;
};
var unpack_default = unpack2;

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/_lib.js
var NN = "Noun";
var Sing = "Singular";
var Plur = "Plural";
var Prop = "ProperNoun";
var Pron = "Pronoun";
var Poss = "Possessive";
var Adj = "Adjective";
var Comp = "Comparative";
var Sup = "Superlative";
var Adv = "Adverb";
var Det = "Determiner";
var Vb = "Verb";
var Inf = "Infinitive";
var Past = "PastTense";
var Ger = "Gerund";
var Participle = "Participle";
var Pres = "PresentTense";
var Fut = "FutureTense";
var Cop = "Copula";
var Mod = "Modal";
var Phrasal = "PhrasalVerb";
var Aux = "Auxiliary";
var Pass = "Passive";
var Imp = "Imperative";
var Neg = "Negative";
var Conj = "Conjunction";
var Prep = "Preposition";
var Expr = "Expression";
var QW = "QuestionWord";
var Prefix = "Prefix";
var Pers = "Person";
var Place = "Place";
var Org = "Organization";
var First = "FirstName";
var Last = "LastName";
var Hon = "Honorific";
var MaleName = "MaleName";
var FemaleName = "FemaleName";
var Actor = "Actor";
var Uncountable = "Uncountable";
var SportsTeam = "SportsTeam";
var Country = "Country";
var City = "City";
var Region = "Region";
var Unit = "Unit";
var Val = "Value";
var Card = "Cardinal";
var Ord = "Ordinal";
var TxtNum = "TextValue";
var Numeric = "NumericValue";
var RomanNumeral = "RomanNumeral";
var Frac = "Fraction";
var Money = "Money";
var Date = "Date";
var WeekDay = "WeekDay";
var Year = "Year";
var FinancialQuarter = "FinancialQuarter";
var Season = "Season";
var Time = "Time";
var Timezone = "Timezone";
var Connector = "Connector";
var Abbr = "Abbreviation";
var Acronym = "Acronym";
var HashTag = "HashTag";
var AtMention = "AtMention";
var Emoji = "Emoji";
var Emoticon = "Emoticon";
var SlashedTerm = "SlashedTerm";
var Email = "Email";
var PhoneNumber = "PhoneNumber";
var Url = "Url";
var Month = "Month";
var Hyphenated = "Hyphenated";
var NounVerb = "Noun|Verb";
var PluralVerb = "Plural|Verb";
var NounGerund = "Noun|Gerund";
var AdjPast = "Adj|Past";
var AdjNoun = "Adj|Noun";
var AdjGerund = "Adj|Gerund";
var AdjPresent = "Adj|Present";
var ActorVerb = "Actor|Verb";
var PersonNoun = "Person|Noun";
var PersonVerb = "Person|Verb";
var PersonAdj = "Person|Adj";

// ../../node_modules/compromise/src/2-two/preTagger/model/lexicon/misc.js
var prp = [Poss, Pron];
var misc = {
  // numbers
  "20th century fox": Org,
  "7 eleven": Org,
  "motel 6": Org,
  "23andme": Org,
  "4chan": Org,
  "yahoo!": Org,
  u2: Org,
  g8: Org,
  vh1: Org,
  "76ers": SportsTeam,
  "49ers": SportsTeam,
  q1: Date,
  q2: Date,
  q3: Date,
  q4: Date,
  km2: Unit,
  m2: Unit,
  dm2: Unit,
  cm2: Unit,
  mm2: Unit,
  mile2: Unit,
  in2: Unit,
  yd2: Unit,
  ft2: Unit,
  m3: Unit,
  dm3: Unit,
  cm3: Unit,
  in3: Unit,
  ft3: Unit,
  yd3: Unit,
  // ampersands
  "at&t": Org,
  "black & decker": Org,
  "h & m": Org,
  "johnson & johnson": Org,
  "procter & gamble": Org,
  "ben & jerry's": Org,
  "&": Conj,
  // copulas
  was: [Cop, Past],
  is: [Cop, Pres],
  are: [Cop, Pres],
  am: [Cop, Pres],
  were: [Cop, Past],
  // possessive pronouns
  her: prp,
  his: prp,
  hers: prp,
  ours: prp,
  their: prp,
  theirs: prp,
  your: prp,
  // misc
  vs: [Conj, Abbr],
  closer: Comp,
  closest: Sup,
  sooner: Comp,
  soonest: Sup,
  may: Mod,
  // irregular conjugations with two forms
  babysat: Past,
  blew: Past,
  drank: Past,
  drove: Past,
  forgave: Past,
  skiied: Past,
  stung: Past,
  swam: Past,
  swung: Past,
  guaranteed: Past,
  // support 'near', 'nears', 'nearing'
  nears: Pres,
  nearing: Ger,
  neared: Past
};
var misc_default2 = misc;

// ../../node_modules/compromise/src/2-two/preTagger/model/lexicon/frozenLex.js
var expand3 = (pairs4) => {
  const lex = {};
  pairs4.forEach(([tag, phrases]) => {
    phrases.split(",").forEach((phrase) => {
      lex[phrase] = tag;
    });
  });
  return lex;
};
var shared = expand3([
  ["Honorific", "first lieutenant,second lieutenant,third lieutenant"],
  [SportsTeam, "atlanta united,dc united,minnesota united,manchester united,newcastle united,sheffield united"],
  [Expr, "excuse me"],
  [Org, "financial times,guns n roses,la z boy,labour party,new kids on the block,new york times,the guess who,thin lizzy"],
  [Actor, "prime minister"],
  [Sing, "free market,lay up,spin off"],
  [Uncountable, "appeal court,cold war,gene pool,machine learning,nail polish,time off"],
  [Inf, "take part"],
  [Pers, "bill gates,doctor who,he man,iron man,kid cudi,run dmc,rush limbaugh,snow white,tiger woods"],
  [Adj, "brand new,en route,left wing,off guard,on board,part time,right wing,so called,spot on,straight forward,super duper,tip top,top notch,up to date,win win"],
  [SportsTeam, "brooklyn nets,chicago bears,houston astros,houston dynamo,houston rockets,houston texans,minnesota twins,orlando magic,san antonio spurs,san diego chargers,san diego padres"],
  [Prop, "iron maiden"],
  [Country, "isle of man,united states,united states of america"],
  [Region, "prince edward island"],
  [Place, "cedar breaks,cedar falls"],
  [Adv, "point blank,tiny bit"],
  [Conj, "by the time,no matter"]
]);
var frozenLex_default = {
  ...shared,
  ...expand3([
    [Org, "20th century fox,7 eleven,motel 6"],
    [Sing, "living room"],
    [Plur, "living rooms"],
    [Pers, "dr who"],
    [Plur, "civil wars,credit cards,default rates,free markets,head starts,home runs,lay ups,phone calls,press releases,record labels,soft serves,student loans,tax returns,tv shows,video games"],
    [Past, "took part"],
    [Pres, "takes part"],
    [Ger, "taking part"],
    [Participle, "taken part"],
    [NN, "light bulb,rush hour"],
    [Unit, "fluid ounce"],
    // keep mcdonalds out of the mcd- surname regex
    [Org, "the rolling stones,mcdonalds"]
  ])
};

// ../../node_modules/compromise/src/2-two/preTagger/model/lexicon/emoticons.js
var emoticons_default = ":( :) :P :p :O ;( ;) ;P ;p ;O :3 :| :/ :\\ :$ :* :@ :-( :-) :-P :-p :-O :-3 :-| :-/ :-\\ :-$ :-* :-@ :^( :^) :^P :^p :^O :^3 :^| :^/ :^\\ :^$ :^* :^@ ): (: $: *: )-: (-: $-: *-: )^: (^: $^: *^: <3 </3 <\\3 =(".split(" ");

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/nouns/toPlural/_rules.js
var suffixes = {
  a: [
    [/(antenn|formul|nebul|vertebr|vit)a$/i, "$1ae"],
    [/ia$/i, "ia"]
  ],
  e: [
    [/(kn|l|w)ife$/i, "$1ives"],
    [/(hive)$/i, "$1s"],
    [/([ml])ouse$/i, "$1ice"],
    [/^([ml])ice$/i, "$1ice"]
  ],
  f: [
    [/^(dwar|handkerchie|hoo|scar|whar)f$/i, "$1ves"],
    [/^((?:ca|e|ha|(?:our|them|your)?se|she|wo)l|lea|loa|shea|thie)f$/i, "$1ves"]
  ],
  i: [[/(octop|vir)i$/i, "$1i"]],
  m: [[/([ti])um$/i, "$1a"]],
  n: [[/^(oxen)$/i, "$1"]],
  o: [[/(al|ad|at|er|et|ed)o$/i, "$1oes"]],
  s: [
    [/(ax|test)is$/i, "$1es"],
    [/(alias|status)$/i, "$1es"],
    [/sis$/i, "ses"],
    [/(bu)s$/i, "$1ses"],
    [/^(?!talis|.*hu)(.*)man$/i, "$1men"],
    [/(octop|vir|radi|nucle|fung|cact|stimul)us$/i, "$1i"]
  ],
  x: [
    [/(matr|vert|ind|cort)(ix|ex)$/i, "$1ices"],
    [/^(ox)$/i, "$1en"]
  ],
  y: [[/([^aeiouy]|qu)y$/i, "$1ies"]],
  z: [[/(quiz)$/i, "$1zes"]]
};
var rules_default = suffixes;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/nouns/toPlural/index.js
var addE = /([xsz]|ch|sh)$/;
var trySuffix = function(str) {
  const c = str[str.length - 1];
  if (Object.hasOwn(rules_default, c)) {
    for (let i3 = 0; i3 < rules_default[c].length; i3 += 1) {
      const reg = rules_default[c][i3][0];
      if (reg.test(str)) {
        return str.replace(reg, rules_default[c][i3][1]);
      }
    }
  }
  return null;
};
var pluralize = function(str = "", model5) {
  const { irregularPlurals, uncountable: uncountable2 } = model5.two;
  if (Object.hasOwn(uncountable2, str)) {
    return str;
  }
  if (Object.hasOwn(irregularPlurals, str)) {
    return irregularPlurals[str];
  }
  const plural = trySuffix(str);
  if (plural !== null) {
    return plural;
  }
  if (addE.test(str)) {
    return str + "es";
  }
  return str + "s";
};
var toPlural_default = pluralize;

// ../../node_modules/compromise/src/2-two/preTagger/model/lexicon/index.js
var hasSwitch = /\|/;
var countryAcronyms = ["uk", "usa", "ussr"];
var lexicon3 = { ...misc_default2, ...shared };
var switches = {};
var tmpModel = { two: { irregularPlurals: plurals_default, uncountable: {} } };
Object.keys(lexicon_default).forEach((tag) => {
  const wordsObj = unpack_default("true\xA6" + lexicon_default[tag]);
  if (!hasSwitch.test(tag)) {
    Object.keys(wordsObj).forEach((w) => {
      lexicon3[w] = tag;
    });
    return;
  }
  Object.keys(wordsObj).forEach((w) => {
    switches[w] = tag;
    if (tag === NounVerb) {
      const plural = toPlural_default(w, tmpModel);
      if (plural !== w || plurals_default[w] === w) {
        switches[plural] = PluralVerb;
      }
    }
  });
});
lexicon3.if = [Conj, "Condition"];
countryAcronyms.forEach((word) => {
  lexicon3[word] = [Country, Acronym];
});
emoticons_default.forEach((str) => lexicon3[str] = Emoticon);
delete lexicon3[""];
delete lexicon3[null];
delete lexicon3[" "];

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/_lib.js
var keys = ["beforeTags", "afterTags", "beforeWords", "afterWords"];
var merge = (...clues3) => {
  const res = {};
  keys.forEach((k2) => {
    res[k2] = Object.assign({}, ...clues3.map((c) => c[k2]));
  });
  return res;
};
var lib_default9 = merge;

// ../../node_modules/compromise/src/2-two/preTagger/model/_lib.js
var tagWords = (words2, tag) => {
  const result = {};
  words2.split(" ").forEach((word) => {
    result[word] = tag;
  });
  return result;
};
var lib_default10 = tagWords;

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/nouns.js
var entity = [Pers, Place, Org];
var nouns_default2 = {
  Noun: {
    aliases: [null, "NN"],
    not: [Vb, Adj, Adv, Val, Det]
  },
  Singular: {
    aliases: [null, "Sing", "SG", "NN1"],
    is: NN,
    not: [Plur, Uncountable]
  },
  // 'Canada'
  ProperNoun: {
    aliases: ["Prop", "NNP", "PROPN", "NP0"],
    is: NN
  },
  Person: {
    aliases: [null, "Pers"],
    is: Sing,
    also: [Prop],
    not: [Place, Org, Date]
  },
  FirstName: {
    aliases: [null, "First"],
    is: Pers
  },
  MaleName: {
    is: First,
    not: [FemaleName, Last]
  },
  FemaleName: {
    is: First,
    not: [MaleName, Last]
  },
  LastName: {
    aliases: [null, "Last"],
    is: Pers,
    not: [First]
  },
  // 'dr.'
  Honorific: {
    aliases: ["Hon"],
    is: Pers,
    not: [First, Last, Val]
  },
  Place: {
    is: Sing,
    not: [Pers, Org]
  },
  Country: {
    is: Place,
    also: [Prop],
    not: [City]
  },
  City: {
    is: Place,
    also: [Prop],
    not: [Country]
  },
  // 'california'
  Region: {
    is: Place,
    also: [Prop]
  },
  Address: {
    aliases: ["Addr"]
    // is: 'Place',
  },
  Organization: {
    aliases: ["Org"],
    is: Prop,
    not: [Pers, Place]
  },
  SportsTeam: {
    aliases: [null, "Team"],
    is: Org
  },
  School: {
    is: Org
  },
  Company: {
    is: Org
  },
  Plural: {
    aliases: [null, "Plur", "NNS", "PL", "NN2"],
    is: NN,
    not: [Sing, Uncountable]
  },
  // 'gravity'
  Uncountable: {
    is: NN
  },
  // 'it'
  Pronoun: {
    aliases: [null, "Pron", "PRP", "PRON"],
    is: NN,
    not: entity
  },
  // 'swimmer'
  Actor: {
    is: NN,
    not: [Place, Org]
  },
  // walking
  Activity: {
    is: NN,
    not: [Pers, Place]
  },
  // kilometres
  Unit: {
    is: NN,
    not: entity
  },
  // canadian
  Demonym: {
    aliases: [null, "Dem"],
    is: NN,
    also: [Prop],
    not: entity
  },
  // [spencer's] hat
  Possessive: {
    aliases: ["Poss"],
    is: NN
  },
  // 'yourself'
  Reflexive: {
    aliases: [null, "Refl"],
    is: Pron
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/verbs.js
var verbs_default = {
  Verb: {
    aliases: ["Vb", "V", "VB"],
    not: [NN, Adj, Adv, Val, Expr]
  },
  // 'he [walks]'
  PresentTense: {
    aliases: ["Pres", "PRS"],
    is: Vb,
    not: [Past, Fut]
  },
  // 'will [walk]'
  Infinitive: {
    aliases: ["Inf", "VVI"],
    is: Pres,
    not: [Ger]
  },
  // '[walk] now!'
  Imperative: {
    aliases: ["Imp"],
    is: Vb,
    not: [Past, Ger, Cop]
  },
  // walking
  Gerund: {
    aliases: ["Ger", "VBG"],
    is: Pres,
    not: [Cop]
  },
  // walked
  PastTense: {
    aliases: ["Past", "VBD", "PST"],
    is: Vb,
    not: [Pres, Ger, Fut]
  },
  // will walk
  FutureTense: {
    aliases: ["Fut"],
    is: Vb,
    not: [Pres, Past]
  },
  // is/was
  Copula: {
    aliases: [null, "Cop"],
    is: Vb
  },
  // '[could] walk'
  Modal: {
    aliases: [null, "Mod", "MD"],
    is: Vb,
    not: [Inf]
  },
  // 'awaken'
  Participle: {
    aliases: [null, "VBN"],
    is: Past
  },
  // '[will have had] walked'
  Auxiliary: {
    aliases: ["Aux"],
    is: Vb,
    not: [Past, Pres, Ger, Conj]
  },
  // 'walk out'
  PhrasalVerb: {
    aliases: ["Phrasal", "PhrV"],
    is: Vb
  },
  // 'walk [out]'
  Particle: {
    aliases: [null, "RP"],
    is: Phrasal,
    not: [Past, Pres, Cop, Ger]
  },
  // 'walked by'
  Passive: {
    aliases: [null, "Pass"],
    is: Vb
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/values.js
var values_default = {
  Value: {
    aliases: ["Val", "Num"],
    not: [Vb, Adj, Adv]
  },
  Ordinal: {
    aliases: [null, "Ord"],
    is: Val,
    not: [Card]
  },
  Cardinal: {
    aliases: [null, "Card", "CD"],
    is: Val,
    not: [Ord]
  },
  Fraction: {
    aliases: [null, "Frac"],
    is: Val,
    not: [NN]
  },
  Multiple: {
    aliases: [null, "Mult"],
    is: TxtNum
  },
  RomanNumeral: {
    aliases: [null, "RomNum"],
    is: Card
  },
  TextValue: {
    aliases: [null, "TxtNum"],
    is: Val,
    not: [Numeric, RomanNumeral]
  },
  NumericValue: {
    aliases: ["Numeric"],
    is: Val,
    not: [RomanNumeral]
  },
  Money: {
    is: Card
  },
  Percent: {
    aliases: [null, "Perc", "Pct"],
    is: Val
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/dates.js
var dates_default = {
  Date: {
    not: [Vb, Adv, Adj]
  },
  Month: {
    is: Date,
    also: [NN],
    not: [WeekDay, Year, FinancialQuarter, Season, Time, Timezone]
  },
  WeekDay: {
    is: Date,
    also: [NN],
    not: [Year, FinancialQuarter, Season, Time, Timezone]
  },
  Year: {
    is: Date,
    not: [RomanNumeral, FinancialQuarter, Season, Time, Timezone]
  },
  FinancialQuarter: {
    is: Date,
    aliases: [null, "Quarter"],
    not: [Frac, Season, Time, Timezone]
  },
  // 'easter'
  Holiday: {
    is: Date,
    also: [NN]
  },
  // 'summer'
  Season: {
    is: Date,
    not: [Time, Timezone]
  },
  Timezone: {
    is: Date,
    aliases: [null, "Tz"],
    also: [NN],
    not: [Prop]
  },
  Time: {
    is: Date,
    not: [AtMention, Timezone]
  },
  // 'months'
  Duration: {
    aliases: [null, "Dur"],
    is: Date,
    also: [NN]
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/misc.js
var anything = [NN, Vb, Adj, Adv, Val, QW];
var misc_default3 = {
  Adjective: {
    aliases: ["Adj", "JJ", "ADJ", "AJ0"],
    not: [NN, Vb, Adv, Val]
  },
  Comparable: {
    is: Adj
  },
  Comparative: {
    aliases: [null, "Comp", "JJR", "AJC"],
    is: Adj
  },
  Superlative: {
    aliases: [null, "Sup", "JJS", "AJS"],
    is: Adj,
    not: [Comp]
  },
  NumberRange: {
    aliases: [null, "NumRange"]
  },
  Adverb: {
    aliases: ["Adv", "RB", "ADV"],
    not: [NN, Vb, Adj, Val]
  },
  Determiner: {
    aliases: ["Det", "DT", "DET"],
    not: [NN, Vb, Adj, Adv, QW, Conj]
    //allow 'a' to be a Determiner/Value
  },
  Connector: {
    not: [NN, Vb, Adj, Adv, QW, Det]
  },
  Conjunction: {
    aliases: ["Conj", "CC"],
    is: Connector,
    not: anything.concat([Prep])
  },
  Preposition: {
    aliases: ["Prep", "IN", "ADP"],
    is: Connector,
    not: [NN, Vb, Adj, Adv, QW, Det, Conj]
  },
  QuestionWord: {
    aliases: [null, "QW"],
    not: [Det]
  },
  Currency: {
    is: NN
  },
  Expression: {
    aliases: ["Expr"],
    not: [NN, Adj, Vb, Adv]
  },
  Abbreviation: {
    aliases: ["Abbr"]
  },
  Url: {
    aliases: [null, "URL"],
    not: [HashTag, Vb, Adj, Val, SlashedTerm, Email, PhoneNumber, AtMention, Emoji, Emoticon]
  },
  PhoneNumber: {
    not: [HashTag, Vb, Adj, Val, AtMention, Emoji, Emoticon]
  },
  HashTag: {},
  AtMention: {
    is: NN,
    not: [HashTag, Emoji, Emoticon]
  },
  Emoji: {
    not: [HashTag, Vb, Adj, Val, Emoticon]
  },
  Emoticon: {
    not: [HashTag, Vb, Adj, Val, SlashedTerm]
  },
  SlashedTerm: {
    not: [Emoticon, Url, Val]
  },
  Email: {
    not: [HashTag, Vb, Adj, Val, PhoneNumber, AtMention, Emoji, Emoticon]
  },
  Acronym: {
    not: [RomanNumeral, Pron, Date]
  },
  Negative: {
    aliases: [null, "Neg"],
    not: [NN, Adj, Val, Expr]
  },
  Condition: {
    is: Connector,
    aliases: [null, "Cond"],
    not: [Vb, Adj, NN, Val]
  },
  // existential 'there'
  There: {
    aliases: [null, "EX"],
    not: [Vb, Adj, NN, Val, Conj, Prep]
  },
  // 'co-wrote'
  Prefix: {
    not: [Abbr, Acronym, Prop]
  },
  // hard-nosed, bone-headed
  Hyphenated: {}
};

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/index.js
var allTags = { ...nouns_default2, ...verbs_default, ...values_default, ...dates_default, ...misc_default3 };
var tagSet_default = allTags;

// ../../node_modules/compromise/src/2-two/preTagger/tagSet/aliases.js
var aliases2 = aliases_default2(tagSet_default);
var aliases_default4 = aliases2;

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/_noun.js
var { Sing: n } = aliases_default4;
var noun_default = {
  beforeTags: {
    Determiner: n,
    //the date
    Possessive: n,
    //his date
    Acronym: n,
    //u.s. state
    // ProperNoun:n,
    Noun: n,
    //nasa funding
    Adjective: n,
    //whole bottles
    // Verb:true, //save storm victims
    PresentTense: n,
    //loves hiking
    Gerund: n,
    //uplifting victims
    PastTense: n,
    //saved storm victims
    Infinitive: n,
    //profess love
    Date: n,
    //9pm show
    Ordinal: n,
    //first date
    Demonym: n
    //dutch map
  },
  afterTags: {
    Value: n,
    //date nine  -?
    Modal: n,
    //date would
    Copula: n,
    //fear is
    PresentTense: n,
    //babysitting sucks
    PastTense: n,
    //babysitting sucked
    // Noun:n, //talking therapy, planning process
    Demonym: n,
    //american touch
    Actor: n
    //dance therapist
  },
  // ownTags: { ProperNoun: n },
  beforeWords: {
    the: n,
    //the brands
    with: n,
    //with cakes
    without: n,
    //
    // was:n, //was time  -- was working
    // is:n, //
    // of power; for rats; any rats; all tips; on time
    ...lib_default10("of for any all on", n),
    // thing-ish verbs
    // cut spending; cut spending; increase funding
    ...lib_default10("cut cuts increase decrease raise drop", n),
    // give: n,//give parents
    // minus laughing; more than age; about claims
    ...lib_default10("save saved saves make makes made minus plus than another versus neither about", n),
    // strong adjectives
    // no worries; more details; one flood; let fear; her boots
    ...lib_default10(
      "favorite best daily weekly linear binary mobile lexical technical computer scientific security government popular formal no more one let her his their our",
      n
    ),
    // us: n, //served us drinks
    sheer: n,
    ...lib_default10(
      "monthly yearly current previous upcoming last next main initial final beginning end top bottom future past major minor side central peripheral public private",
      n
    )
  },
  afterWords: lib_default10(
    // date of birth (preposition); parents can; service-wise
    // they: n,//snakes they
    "of system aid method utility tool reform therapy philosophy room authority says said wants wanted is did do can wise",
    n
  )
};

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/_verb.js
var { Inf: v } = aliases_default4;
var verb_default = {
  beforeTags: {
    Modal: v,
    //would date
    Adverb: v,
    //quickly date
    Negative: v,
    //not date
    Plural: v
    //characters drink
    // ProperNoun: vb,//google thought
  },
  afterTags: {
    Determiner: v,
    //flash the
    Adverb: v,
    //date quickly
    Possessive: v,
    //date his
    Reflexive: v,
    //resolve yourself
    // Noun:true, //date spencer
    Preposition: v,
    //date around, dump onto, grumble about
    // Conjunction: v, // dip to, dip through
    Cardinal: v,
    //cut 3 squares
    Comparative: v,
    //feel greater
    Superlative: v
    //feel greatest
  },
  beforeWords: {
    // i date; we date; you date; they date; to date; please check; will check; help combat
    ...lib_default10(
      "i we you they to please will have had would could come should do did does can must us me let even when help",
      v
    ),
    // them: v,
    ...lib_default10("he she it being", v),
    // prefixes
    ...lib_default10("bi co contra de inter intra mis pre out counter nobody somebody anybody everybody", v),
    // un: v,
    // over: v,
    // under: v,
    // now dance; go dance; he said run; simon says run; they say run; who runs faster; what runs faster
    ...lib_default10("now go said says say who what", v)
    // most: v, //most run faster
    // some: v, //some run faster
  },
  afterWords: {
    // echo the; date me; date you; loves him; cost us; hope it
    ...lib_default10(
      "the me you him us her his them they it himself herself itself myself ourselves themselves something anything",
      v
    ),
    a: v,
    //covers a
    an: v,
    //covers an
    // from: v, //ranges from
    up: v,
    //serves up
    down: v,
    //serves up
    by: v,
    // in: v, //bob in
    out: v,
    // on: v,
    off: v,
    under: v,
    what: v,
    //look what
    // when: v,//starts when
    // for:true, //settled for
    all: v,
    //shiver all night
    // conjunctions
    to: v,
    //dip to
    because: v,
    //
    although: v,
    //
    // after: v,
    // before: v,//
    // fit together; kill more; look here; float away; dance now
    ...lib_default10("how otherwise together though into yet more here there away now", v)
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/actor-verb.js
var actor_verb_default = lib_default9(verb_default, noun_default);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/_adj.js
var { JJ: jj } = aliases_default4;
var adj_default = {
  beforeTags: {
    Determiner: jj,
    //the detailed
    // Copula: jj, //is detailed
    Possessive: jj,
    //spencer's detailed
    Hyphenated: jj
    //rapidly-changing
  },
  afterTags: {
    // Noun: jj, //detailed plan, overwhelming evidence
    Adjective: jj
    //intoxicated little
  },
  beforeWords: {
    // seem prepared; feel prepared; over cooked; too insulting; find it insulting; nothing but frustrating
    // still scared
    ...lib_default10(
      "seem seemed seems feel feels felt stay appear appears appeared also over under too it but still",
      jj
    ),
    // adverbs that are adjective-ish
    // really damaged; how slow
    ...lib_default10("really quite well very truly how deeply hella", jj),
    // always: jj,
    // never: jj,
    // nothing secret,; something wrong; not swell; called me swell
    ...lib_default10(
      "profoundly extremely so badly mostly totally awfully rather nothing something anything not me is",
      jj
    ),
    face: jj,
    //faces shocking revelations
    faces: jj,
    faced: jj,
    look: jj,
    looks: jj,
    looked: jj,
    reveal: jj,
    reveals: jj,
    revealed: jj,
    // would prove shocking
    ...lib_default10("sound sounded sounds remains remained prove proves proved", jj),
    // gets shocking snowfall
    ...lib_default10(
      "becomes stays tastes taste smells smell gets grows as rings radiates conveys convey conveyed of",
      jj
    )
    // 'smacks of': jj,
    // 'reeks of': jj,
  },
  afterWords: lib_default10(
    // insulting too; insulting too; insulting or; cool enough; as shocking as
    //about: jj, //cool about
    "too also or enough as",
    jj
  )
};

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/_gerund.js
var { VBG: g } = aliases_default4;
var gerund_default = {
  beforeTags: {
    // Verb: g, // loves shocking
    Adverb: g,
    //quickly shocking
    Connector: g
    //by insulting, if swimming
  },
  afterTags: {
    Adverb: g,
    //shocking quickly
    Possessive: g,
    //shocking spencer's
    Person: g,
    //telling spencer
    Pronoun: g,
    //shocking him
    Determiner: g,
    //shocking the
    Copula: g,
    //shocking is
    Connector: g,
    //swimming in, swimming and running
    Comparative: g
    //growing shorter
  },
  beforeWords: {
    // keep going; am watching; be timing; got me thinking
    ...lib_default10("been keep continue stop am be me", g),
    // action-words
    // love painting
    ...lib_default10(
      "began start starts started stops stopped help helps avoid avoids love loves loved hate hates hated",
      g
    )
    // was:g,//was working
    // is:g,
    // be:g,
  },
  afterWords: lib_default10(
    // telling you; fighting their; dumping it; running this; swimming there; landing on; talking about
    // paying for; speeding up
    "you me her him his them their it this there on about for up down",
    g
  )
};

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/adj-gerund.js
var { VBG: g2, JJ: jj2 } = aliases_default4;
var misc2 = {
  beforeTags: {
    // Copula: jj,
    Imperative: g2,
    //recommend living in
    Infinitive: jj2,
    //say charming things
    // PresentTense: g,
    Plural: g2
    //kids cutting
  },
  afterTags: {
    Noun: jj2
    //shocking ignorance
    // Plural: jj, //shocking lies
  },
  beforeWords: {
    is: jj2,
    are: g2,
    //is overflowing: JJ, are overflowing : VB ??
    was: jj2,
    of: jj2,
    //of varying
    ...lib_default10("suggest suggests suggested recommend recommends recommended", g2),
    ...lib_default10("imagine imagines imagined consider considered considering", g2),
    ...lib_default10("resist resists resisted avoid avoided avoiding", g2),
    except: jj2,
    accept: jj2,
    ...lib_default10("assess explore fear fears appreciate question help embrace", g2),
    with: jj2
    //filled with daring
  },
  afterWords: {
    to: g2,
    not: g2,
    //trying not to car
    the: g2
    //sweeping the country
  }
};
var adj_gerund_default = lib_default9(adj_default, gerund_default, misc2);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/adj-noun.js
var misc3 = {
  beforeTags: {
    Determiner: void 0,
    //the premier university
    Cardinal: NN,
    //1950 convertable
    PhrasalVerb: Adj
    //starts out fine
  },
  afterTags: {
    // Pronoun: 'Noun'//as an adult i
  },
  beforeWords: {
    // are representative
    ...lib_default10("are is was be", Adj),
    // phrasals
    off: Adj,
    //start off fine
    out: Adj
    //comes out fine
  }
};
var adj_noun_default = lib_default9(adj_default, noun_default, misc3);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/adj-past.js
var { VBD: past, JJ: jj3 } = aliases_default4;
var adjPast = {
  beforeTags: {
    Adverb: past,
    //quickly detailed
    Pronoun: past,
    //he detailed
    ProperNoun: past,
    //toronto closed
    Auxiliary: past,
    Noun: past
    //eye closed  -- i guess.
  },
  afterTags: {
    Possessive: past,
    //hooked him
    Pronoun: past,
    //hooked me
    Determiner: past,
    //hooked the
    Adverb: past,
    //cooked perfectly
    Comparative: past,
    //closed higher
    Date: past,
    // alleged thursday
    Gerund: past
    //left dancing
  },
  beforeWords: {
    be: past,
    //be hooked vs be embarrassed
    who: past,
    //who lost
    get: jj3,
    //get charged
    // being watched; it intoxicated him; as requested
    ...lib_default10("had has have been being it as", past),
    for: jj3,
    //for discounted items
    more: jj3,
    //more broken promises
    always: jj3
  },
  afterWords: {
    // damaged by; charged back; charged out; crowded in; heated up; hammered down; settled for; settled the
    // obsessed with; known as; focused on; recorded at; settled between; dedicated to; pumped into
    // charged us; charged us; shared his
    ...lib_default10(
      "by back out in up down before after for the with as on at between to into us them his her their our me",
      past
    ),
    about: jj3
  }
};
var adj_past_default = lib_default9(adj_default, adjPast);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/adj-present.js
var misc4 = {
  beforeTags: {
    // always clean
    Adverb: void 0,
    Negative: void 0
  },
  afterTags: {
    Noun: Adj,
    //ruling party
    Conjunction: void 0
    //clean and excellent
  },
  beforeWords: {
    // have seperate contracts
    have: void 0,
    had: void 0,
    not: void 0,
    //went wrong, got wrong
    went: Adj,
    goes: Adj,
    got: Adj,
    // be sure
    be: Adj
  },
  afterWords: {
    to: void 0,
    //slick to the touch
    as: Adj
    //pale as
  }
};
var adj_present_default = lib_default9(adj_default, verb_default, misc4);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/noun-gerund.js
var misc5 = {
  beforeTags: {
    Copula: Ger,
    PastTense: Ger,
    PresentTense: Ger,
    Infinitive: Ger
  },
  afterTags: {
    Value: Ger
    //maintaining 500
  },
  beforeWords: {
    ...lib_default10("are were be no without", Ger),
    //are you playing
    ...lib_default10("you we they he she", Ger),
    //stop us playing
    us: Ger,
    them: Ger
  },
  afterWords: {
    // offering the
    the: Ger,
    this: Ger,
    that: Ger,
    //got me thinking
    me: Ger,
    us: Ger,
    them: Ger
  }
};
var noun_gerund_default = lib_default9(gerund_default, noun_default, misc5);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/noun-verb.js
var { Sing: nn, Inf: vb } = aliases_default4;
var misc6 = {
  beforeTags: {
    // Noun: undefined
    Adjective: nn,
    //great name
    Particle: nn
    //brought under control
  },
  afterTags: {
    ProperNoun: vb,
    Gerund: vb,
    Adjective: vb,
    Copula: nn
  },
  beforeWords: {
    // is time
    is: nn,
    was: nn,
    //balance of power
    of: nn,
    have: null
    //have cash
  },
  afterWords: {
    // for: vb,//work for
    instead: vb,
    // that: nn,//subject that was
    // for: vb,//work for
    about: vb,
    //talk about
    his: vb,
    //shot his
    her: vb,
    //
    to: null,
    by: null,
    in: null
  }
};
var noun_verb_default = lib_default9(verb_default, noun_default, misc6);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/_person.js
var { Person: p } = aliases_default4;
var person_default = {
  beforeTags: {
    Honorific: p,
    Person: p
    // Preposition: p, //with sue
  },
  afterTags: {
    Person: p,
    ProperNoun: p,
    Verb: p
    //bob could
    // Modal:true, //bob could
    // Copula:true, //bob is
    // PresentTense:true, //bob seems
  },
  ownTags: {
    ProperNoun: p
    //capital letter
  },
  beforeWords: lib_default10("hi hey yo dear hello", p),
  afterWords: lib_default10(
    // person-usually verbs
    // and:true, //sue and jeff
    "said says told tells feels felt seems thinks thought spends spendt plays played sing sang learn learned wants wanted",
    p
  )
};

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/person-date.js
var { Month: m, Person: p2 } = aliases_default4;
var month = {
  beforeTags: {
    Date: m,
    Value: m
  },
  afterTags: {
    Date: m,
    Value: m
  },
  beforeWords: {
    // 5th of april; this april
    ...lib_default10(
      "by in on during after before between until til sometime of this next last previous following",
      m
    ),
    with: p2
    // for: p,
  },
  afterWords: lib_default10(
    // june the 4th
    "sometime in of until the",
    m
  )
};
var person_date_default = lib_default9(person_default, month);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/person-noun.js
var person_noun_default = lib_default9(noun_default, person_default, { beforeWords: { i: Inf, we: Inf } });

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/person-verb.js
var person_verb_default = lib_default9(noun_default, person_default, verb_default);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/person-place.js
var { Place: p3 } = aliases_default4;
var place = {
  beforeTags: {
    Place: p3
  },
  afterTags: {
    Place: p3,
    Abbreviation: p3
  },
  beforeWords: lib_default10("in by near from to", p3),
  afterWords: lib_default10("in by near from to government council region city", p3)
};
var person_place_default = lib_default9(place, person_default);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/person-adj.js
var person_adj_default = lib_default9(person_default, adj_default);

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/unit-noun.js
var { Unit: un } = aliases_default4;
var clues = {
  beforeTags: { Value: un },
  afterTags: {},
  beforeWords: lib_default10(
    // square km; metric ton
    "per every each square cubic sq metric",
    un
  ),
  afterWords: lib_default10(
    // foot long
    "per squared cubed long",
    un
  )
};
var unit_noun_default = clues;

// ../../node_modules/compromise/src/2-two/preTagger/model/clues/index.js
var clues2 = {
  [ActorVerb]: actor_verb_default,
  [AdjGerund]: adj_gerund_default,
  [AdjNoun]: adj_noun_default,
  [AdjPast]: adj_past_default,
  [AdjPresent]: adj_present_default,
  [NounVerb]: noun_verb_default,
  [NounGerund]: noun_gerund_default,
  [PersonNoun]: person_noun_default,
  "Person|Date": person_date_default,
  [PersonVerb]: person_verb_default,
  "Person|Place": person_place_default,
  [PersonAdj]: person_adj_default,
  "Unit|Noun": unit_noun_default
};
var copy = (obj, more) => {
  const res = Object.keys(obj).reduce((h, k2) => {
    h[k2] = obj[k2] === Inf ? Pres : Plur;
    return h;
  }, {});
  return Object.assign(res, more);
};
clues2[PluralVerb] = {
  beforeWords: copy(clues2[NounVerb].beforeWords, {
    had: Plur,
    //had tears
    have: Plur
  }),
  afterWords: copy(clues2[NounVerb].afterWords, {
    his: Pres,
    her: Pres,
    its: Pres,
    in: null,
    to: null,
    is: Pres,
    //the way it works is
    by: Pres
    //it works by
  }),
  beforeTags: copy(clues2[NounVerb].beforeTags, {
    Conjunction: Pres,
    //and changes
    Noun: void 0,
    //the century demands
    ProperNoun: Pres
    //john plays
  }),
  afterTags: copy(clues2[NounVerb].afterTags, {
    Gerund: Plur,
    //ice caps disappearing
    Noun: Pres,
    //changes gears
    Value: Pres
    //changes seven gears
  })
};
var clues_default = clues2;

// ../../node_modules/compromise/src/2-two/preTagger/model/patterns/suffixes.js
var byTag = {
  [Last]: "ov ez ev sen vic nen ova akis chuk czyk enko sson marek auskas opoulos sdottir",
  [Sing]: "ea rol sis ogy oid ian ield iend ette iary wner tion ique vice lier fier gent lite site rite mite bite mate date ndal vent note cide ence holic phite osome tment ndent scent rient dient parent cedent ionary cklist",
  [NN]: "ia eer ger ber ton tage tors dorf esty ology archy pathy opoly embly phate worth",
  [Adj]: "ic azy ffy lar mum nny ous que ful bal mned gone less llen made some tive wide iant nary ghty uent ggly bbly zzly bound rough iable borne gnant inant igent atory",
  [Adv]: "ly fore fully wards where",
  [Vb]: "'n 't end ends",
  [Past]: "oed ued xed ped eld amed aped ched lked rked reed nded cted dged wned tized urned eased",
  [Mod]: "'ll ould",
  [Cop]: "'re",
  [Inf]: "ify ize ibe ect ict ign oze cede gate ruct vide ract duce pose eive lyze lyse ounce",
  [Ger]: "ing",
  [Pres]: "zes ects fies poses ishes tches",
  [Participle]: "ken ven ten",
  [Place]: "pur bury wych dale folk vale abad sham wick burgh mouth ceter ville hurst stead endon brook shire ridge brooke brough cester ington cliffe ingham chester borough",
  [Plur]: "ices ints ines ions ners pers lers ians ances ettes ities ports tures",
  [Actor]: "tist pist rist mist yist vist ists uist gist erer elist onist anist alist olist icist maker keeper logist worker master writer logists",
  [Ord]: "tieth",
  [Prop]: "field",
  [Val]: "teenth"
};
var suffixes2 = [null, null, {}, {}, {}, {}, {}, {}];
Object.keys(byTag).forEach((tag) => {
  byTag[tag].split(" ").forEach((suffix3) => {
    suffixes2[suffix3.length][suffix3] = tag;
  });
});
suffixes2[3][" so"] = Adv;
var suffixes_default2 = suffixes2;

// ../../node_modules/compromise/src/2-two/preTagger/model/patterns/prefixes.js
var { JJ: Adj2, NN: Noun, V: Verb } = aliases_default4;
var prefixes_default2 = [
  null,
  null,
  {
    // 2-letter
  },
  {
    // 3-letter
    neo: Noun,
    bio: Noun,
    // pre: Noun,
    "de-": Verb,
    "re-": Verb,
    "un-": Verb,
    "ex-": Noun
  },
  {
    // 4-letter
    anti: Noun,
    auto: Noun,
    faux: Adj2,
    hexa: Noun,
    kilo: Noun,
    mono: Noun,
    nano: Noun,
    octa: Noun,
    poly: Noun,
    semi: Adj2,
    tele: Noun,
    "pro-": Adj2,
    "mis-": Verb,
    "dis-": Verb,
    "pre-": Adj2
    //hmm
  },
  {
    // 5-letter
    anglo: Noun,
    centi: Noun,
    ethno: Noun,
    ferro: Noun,
    grand: Noun,
    hepta: Noun,
    hydro: Noun,
    intro: Noun,
    macro: Noun,
    micro: Noun,
    milli: Noun,
    nitro: Noun,
    penta: Noun,
    quasi: Adj2,
    radio: Noun,
    tetra: Noun,
    "omni-": Adj2,
    "post-": Adj2
  },
  {
    // 6-letter
    pseudo: Adj2,
    "extra-": Adj2,
    "hyper-": Adj2,
    "inter-": Adj2,
    "intra-": Adj2,
    "deca-": Adj2
    // 'trans-': Noun,
  },
  {
    // 7-letter
    electro: Noun
  }
];

// ../../node_modules/compromise/src/2-two/preTagger/model/patterns/endsWith.js
var {
  JJ: Adj3,
  Inf: Inf2,
  Pres: Pres2,
  Sing: Sing2,
  VBD: Past2,
  Expression: Exp,
  Actor: Actor2,
  V: Verb2,
  NN: Noun2,
  Last: Last2
} = aliases_default4;
var endsWith_default = {
  a: [
    [/.[aeiou]na$/, Noun2],
    // tuna
    [/.[oau][wvl]ska$/, Last2],
    [/.[^aeiou]ica$/, Sing2],
    // harmonica
    [/^([hyj]a+)+$/, Exp]
    //hahah
  ],
  d: [
    //==-ed==
    //double-consonant
    [/[aeiou](pp|ll|ss|ff|gg|tt|rr|bb|nn|mm)ed$/, Past2],
    // popped
    //double-vowel
    [/.[aeo]{2}[bdgmnprvz]ed$/, Past2],
    // rammed
    //-hed
    [/.[aeiou][sg]hed$/, Past2],
    // gushed
    //-rd
    [/.[aeiou]red$/, Past2],
    // hired
    [/.[aeiou]r?ried$/, Past2],
    // hurried
    // ard
    [/[^aeiou]ard$/, Sing2],
    // steward
    // id
    [/[aeiou][^aeiou]id$/, Adj3],
    [/.[vrl]id$/, Adj3],
    // livid
    // ===== -ed ======
    //-led
    [/..led$/, Past2],
    // hurled
    //-sed
    [/.[iao]sed$/, Past2],
    [/[aeiou]n?[cs]ed$/, Past2],
    //-med
    [/[aeiou][rl]?[mnf]ed$/, Past2],
    //-ked
    [/[aeiou][ns]?c?ked$/, Past2],
    // bunked
    //-gned
    [/[aeiou]gned$/, Past2],
    //-ged
    [/[aeiou][nl]?ged$/, Past2],
    //-ted
    [/.[tdbwxyz]ed$/, Past2],
    [/[^aeiou][aeiou][tvx]ed$/, Past2],
    //-ied
    [/.[cdflmnprstv]ied$/, Past2]
    // emptied
  ],
  e: [
    [/.[^aeiou]ise$/, Inf2],
    // antagonise
    [/.[aeiou]te$/, Inf2],
    // bite
    [/.[^aeiou][ai]ble$/, Adj3],
    // fixable
    [/.[^aeiou]eable$/, Adj3],
    // maleable
    [/.[ts]ive$/, Adj3],
    // festive
    [/[a-z]-like$/, Adj3]
    // woman-like
  ],
  h: [
    [/.[^aeiouf]ish$/, Adj3],
    // cornish
    [/.v[iy]ch$/, Last2],
    // ..ovich
    [/^ug?h+$/, Exp],
    // ughh
    [/^uh[ -]?oh$/, Exp]
    // uhoh
  ],
  i: [[/.[oau][wvl]ski$/, Last2]],
  k: [
    [/^(k){2}$/, Exp]
    //kkkk
  ],
  l: [
    [/.[gl]ial$/, Adj3],
    // familial
    [/.[nrtumcd]al$/, Adj3],
    // natal
    [/.[^aeiou][ei]al$/, Adj3]
    // familial
  ],
  m: [
    [/.[^aeiou]ium$/, Sing2],
    // magnesium
    [/[^aeiou]ism$/, Sing2],
    // schism
    [/^[hu]m+$/, Exp],
    // hmm
    [/^\d+ ?[ap]m$/, Date]
    // 3am
  ],
  n: [],
  o: [
    [/^no+$/, Exp],
    // noooo
    [/^(yo)+$/, Exp],
    // yoo
    [/^wo{2,}[pt]?$/, Exp]
    // woop
  ],
  r: [
    [/.[bdfklmst]ler$/, "Noun"],
    [/[aeiou][pns]er$/, Sing2],
    [/[^i]fer$/, Inf2],
    [/.[^aeiou][ao]pher$/, Actor2],
    [/.[lk]er$/, "Noun"],
    [/.ier$/, Comp]
  ],
  t: [
    [/.[di]est$/, Sup],
    [/.[icldtgrv]ent$/, Adj3],
    [/[aeiou][^aeiou\r\n\u2028\u2029]*ist$/, Adj3],
    [/^[a-z]et$/, Verb2]
  ],
  s: [
    [/.[^aeiou]ises$/, Pres2],
    [/.[rln]ates$/, Pres2],
    [/.[^z]ens$/, Verb2],
    [/.[lstrn]us$/, Sing2],
    [/.(ok|wak)es$/, Pres2],
    [/[aeiou][^aeiou]is$/, Sing2],
    [/[a-z]'s$/, Noun2],
    [/^yes+$/, Exp]
    //yessss
  ],
  y: [
    [/.[cts]hy$/, Adj3],
    [/.[st]ty$/, Adj3],
    [/.[tnl]ary$/, Adj3],
    [/.[oe]ry$/, Sing2],
    [/.[gk]y$/, Adj3],
    [/[bszmp]{2}y$/, Adj3],
    [/.[ai]my$/, Adj3],
    [/[ea]{2}zy$/, Adj3],
    [/.[^aeiou]ity$/, Sing2]
  ]
};

// ../../node_modules/compromise/src/2-two/preTagger/model/patterns/neighbours.js
var { V: vb2, NN: nn2 } = aliases_default4;
var neighbours_default = {
  // looking at the previous word's tags:
  leftTags: {
    [Adj]: nn2,
    [Poss]: nn2,
    [Det]: nn2,
    [Adv]: vb2,
    [Pron]: vb2,
    [Val]: nn2,
    [Ord]: nn2,
    [Mod]: vb2,
    [Sup]: nn2,
    Demonym: nn2,
    Honorific: Pers
    //dr. Smith
  },
  // looking at the previous word:
  leftWords: {
    i: vb2,
    first: nn2,
    it: vb2,
    there: vb2,
    not: vb2,
    because: nn2,
    if: nn2,
    but: nn2,
    who: vb2,
    this: nn2,
    his: nn2,
    when: nn2,
    you: vb2,
    very: Adj,
    old: nn2,
    never: vb2,
    before: nn2,
    a: nn2,
    the: nn2,
    been: vb2
  },
  // looking at the next word's tags:
  rightTags: {
    [Cop]: nn2,
    [Past]: nn2,
    [Conj]: nn2,
    [Mod]: nn2
  },
  // looking at the next word:
  rightWords: {
    there: vb2,
    me: vb2,
    man: Adj,
    // only: vb,
    him: vb2,
    it: vb2,
    //relaunch it
    were: nn2,
    took: nn2,
    himself: vb2,
    went: nn2,
    who: nn2,
    jr: Pers
  }
};

// ../../node_modules/compromise/src/2-two/_built/conjugations.js
var conjugations_default = {
  "Comparative": "0er:oad,ead|0:r~0r:e|1ier:y|0er:d,ng,k,h,t,eat,f,m,p,n,r{ea,ai,oo,ve},ss,l,b,w,ray,shy|0der:ad|0ger:g|2urther:far|0ter:at,wet,ot|4better:good|0mer:im|0ner:hin|0ber:ib|3worse:bad~1:er{eri,wid,rud,fak,uch,t{u,a,o,i},saf,som,am,ip,in,l{b,pa,ta,t,p}}|0:emier,esser|2:ainer~",
  "Gerund": "3:ing{iphon,iven,k{ea,oa,ya,oo},icit,ll{e{s,t,w,f,m,y},fa,ca,sta}}|3e:ing{creat,neat,erout,r{fe,rseve,dhe,o{st,pl,c,gn,sh,d}}}|4:nselling~3:ing{e,w,s{s,ocu,ucu,ia},k,p{,elo,oo,ssi,ea,dna},d{r,ea,oa,ee,l,n,oi,ai,w,oo,ou,au},t{,lle,ou,ea,mba,oa,oo,ilo,ivo},n{,i{a,rg,o,e,u}},h,y,o,l{l,a{e,n,di,u,v},e{nrav,d,e,rc,l,k},ai,ei,oi,o,au,ou,r,w},m{r,ai,ee,ea,oa,l,o},r{e,ffe,mfe,o,ou,eu,ea,oa,ga,ai},ing,ong,alog,mb,rb,x,f,i,isc,zz,tz,au,a}|3e:ing{n{o{dr,l,p,b,h,z,ond},i,u,ve,la,wa},d,s,t{a,o,u,i{wr,v,c,ped,n},le,ompe,cre,as{t,w,p}},ak,ik,ok,v,r,g{,in{fr,p,h}},c,u,m{co,u,a,i},z,l,b,p{a,o,y,i},th{rea,wa,nba,i,e}}|4ie:rlying|5is:being|4:ing{gass,k{rek,ic{m,f,n}},pp{o,te,i,a},dd,tt{e,i{ys,m,qu,f,h,l,n,p},u,a,o},nn{i,a,u},ll{a,e,isti,ci,ntro,atro,xto},mm,rr,gg,bb,izz}~0ing:inge,t{e{e,arg,dg,k,pr,m,c,i,mp},imi,nefi,ofi},an{e,h,g,o}|0ring:fer,deter~3e:ing{ow,bor,bit,ach}|3:ing{add,hang,egg,spell,cue,program}|4:ing{itt{s,b},donn,penn}|4ie:ying{d,t,l,v}",
  "Participle": "1:d~1:en,wn,mt|3ose:osen|4ake:woken|2:en{be,t,l},ned,one|0:me,run|3e:tten,dden|4eave:woven|4eeze:ozen|3ine:hone|5et:otten|2in:un|4eak:oken|3ink:unk|5eek:ought|1d:t|3:bidden|3ing:ung|2im:um|1l:pilt|4eal:olen|2y:in|3y:flown|3ear:orn~0d:dive~",
  "PastTense": "2:ed{iven,cott,icit,stroll,eak,oak,ook}|1:ed{eat{cr,n,m},r{dhe,eve,fe,o{sh,b,pl,c,st,gn,p}},al{b,p,h,c}}|3:tted,alled|2ay:ew~2:ed{t{,lle,debu,ou,ilo,oo,io,ea,oa},d{ea,oa,r,ai,oi,n,u,ee,l,w,oo},n{,i{a,o,e,u}},h,rb,mb,ss,ias,ocus,oy,ay,ey,m{o,r,ai,ee,ea,oa,l},r{e,ffe,ai,o,ea,oa,eu,ou,mu},x,w,l{ou,au,a,ai,oi,ei,l{,a{c,r,st,w},e{w,qu,h,sm,y}},e{an,pe,re,ab,ev,l},o,r,w},k,bang,ong,sg,tz,zz,f,p{ea,r,velo,oo,see,m,si,s,ou,l},o,ki,a}|0:t{se,be,le,s{ca,hru,co,r},u,hi,li,hur,bea},read,bid|2et:orgot|1et:met|2it:ysat,pat|1ot:hot|5ight:fought|3:ed{dd,nn{i,a,u},bb,gass,mm,rr,ll{nu,lfi,e,tro,xto},gg,izz,pp,ick{m,n,f}}|1ad:sled|3id:orbade|1d:bent,sent,ilt|3and:tood|4ind:ound|1ed:bred|3old:held|2in:gan,spun|1:meant,dealt,leapt,d{e{t{a,u,as{b,t,w},i{c,ped,n,v,p},ompe,le,cre,o},d{a,e,lu,ru,o,i},g,v,s,ath,r,c,e,z,u,l,m{u,lco,a,i,ram,y},n{u,o{b,l,h,p,t,z,ond},i,ca,wa,ve},k{a,i,o,u},b,nti,p{a,o,i,y},dy},rhear}|2un:ran|3ite:ote|0e:bit,slid,hid|3ide:rode|3ive:ve{dro,tro,do,ga}|2ave:eft|3eave:wove|2ose:ose|2ee:saw|3eeze:oze|3ome:ame|3ine:shone|3ake:woke,ook{s,t,h}|2ke:made|3ike:ruck|2ie:ay|5each:taught|4tch:caught|3is:was|3y:ied|2y:flew,paid|5uy:ought|2im:wam|3ear:ore{b,w,t}|2ow:ew{bl,r,n}|2aw:drew|3eal:tole|3all:ell|3ell:old|2el:elt|3ick:tuck|3ink:nk{ra,sa,tu}|5ink:hought|3eak:oke{br,sp},nuck|5eek:sought|3ang:hung|3ing:ng{u,pra,sa}|5ing:brought|2ig:dug|2ep:ept|2o:did|4go:went~0ted:t{re,ne,bu,i{qu,m,ref,n},o,a}|0ed:pret,imit,d{rea{b,h},min,cin},ean,oan,rrow|0d:pride,ueeze|0red:deter,fer|0led:al{iti,h,v}~1:d{e{ach,i{d,l,p,t,v},ey,ow,rout,stak,wak},hear},pent|2:ed{add,egg,wing,err,sever,model,spell}|3ise:rose{,a}|3eat:ate|1ed:ed{bl,f,sp}|3:ed{donn,pitt,vett}|0:fit,quit,shed|1e:fled,lost|2et:got|1ve:had|2y:aid{l,s}|1ad:led|1d:ent{l,r,sp}|1ght:lit|3ing:rang|2it:sat|4are:were|2in:won",
  "PresentTense": "1:es{beli,rli,th}~3is:are|2:es{ocus,ss,ias,o,h,x,zz}|3:gasses,uizzes|1:s{e,io,oo,n,d,t,w,r,y{a,o,u,e},p,k,m,g,gh,ph,th,l,b,f,c}|3y:ies~~1ve:has|1:ies{l,d,t,v}",
  "Superlative": "1t:orse~0st:e|0est:b,ng,h,t,reat,w,r{ea,ga,oo,ai,e},d,ss,l,n,k,p,f,m,gay,ey,shy|0gest:g|2urthest:far|0test:t{o,we,i,a}|0:hwest,east|1iest:y|2iest:ricey|0lest:ful|0nest:hin|3worst:bad|0most:ner,uter~2:est{ang,t{a,u,o,i},sever,cer,eri,wid,rud,l{p,b,t,pa},fin,fak,ip,af,som,am}~4best:good|0est:full",
  "AdjToNoun": "0ness:t,sant,pant,s,d,ied,red,e{,tiv{rac,ta,isi},nabl},f,ing{ld,o,h},adic,l,msical,oy,ay,m,n,p,r,k,h,w|0ion:ect|1ce:nt|1cy:nt{a{vagr,br,li,n,h},icie,ete}|2tion:vant,reet|5tiquity:cient|3or:ent{rd,v}|0y:est|1s:ost|1m:fist|2eat:ot|0itude:pt|2n:ious{bit,ut,ic}|3ty:acious{d,n,v}|2sity:ous{curi,ner,umin}|4y:rious{fu,xu,te,t},etic,tiful|4ur:lamorous|3:ous{umor,gor,e,al,d,y},nate,ortive,ing{st,w,k},atic,ful{orce,ace,se,wer,ight,ct,oy,l,s}|4:ltuous,able{rt,ect,e}|3sy:teous|3ity:ous{ne,ol,il,m}|3inousness:umous|1ment:ed|2ment:hed|2ion:ted{a,o}|2:nted,cused,ical{g,us},tty|2ation:ized,mined|1:ed{is,lin,c}|0ity:id,tund,tic,al,ar|0edness:and|2cy:ate|1ion:erate,lute|2nce:mperate|3e:unate,pensive,ing{ar,ov}|2on:ive{t{c,a,i,rcep},gress,sess,as}|1ity:e{tiv{ac,ea,si},il,r,n,im}|4ce:fensive|0ty:aive,yal,ain|0ry:ave|2ility:ble|3lity:pitable|3tion:irable|4e:uable|3ility:mble|1icity:imple|0ties:btle|1dom:wise|0dom:ee|6fulness:begone|2th:ng|3ement:ing|3edom:ring|3ance:uring|3ation:iring|4sion:ding|0:anding|3eness:ving|1ess:ning|3ength:ong|2y:ic,estic|3m:stic|5:tistic|3y:tastic|2ry:antic|3ce:mantic|1on:omatic|1sm:ic{gmat,m,o}|0ism:otic,conic,ional|2ism:stical|1iness:y|0th:rm|0liness:an|2pth:ep|3arity:ear|2verty:or~~~"
};

// ../../node_modules/suffix-thumb/builds/suffix-thumb.mjs
var sections = ["fwd", "both", "rev", "ex"];
var reserved = /[~|:,{}0-9]/;
var decodeVal = function(key, str) {
  const m3 = str.match(/^[0-9]+/);
  const n2 = m3 ? Number(m3[0]) : 0;
  const tail2 = m3 ? str.slice(m3[0].length) : str;
  return key.slice(0, key.length - n2) + tail2;
};
var convert = function(str = "", model5 = {}) {
  if (typeof model5 === "string") {
    throw new Error("suffix-thumb: convert expects a model - uncompress() a packed string first");
  }
  const { ex = {}, fwd = {}, both = {} } = model5;
  if (Object.hasOwn(ex, str)) {
    return ex[str];
  }
  for (let i3 = 0; i3 <= str.length; i3 += 1) {
    const suff = str.slice(i3);
    if (Object.hasOwn(fwd, suff)) {
      return str.slice(0, i3) + fwd[suff];
    }
    if (Object.hasOwn(both, suff)) {
      return str.slice(0, i3) + both[suff];
    }
  }
  return str;
};
var flipObj = function(obj = {}) {
  return Object.fromEntries(Object.entries(obj).map(([key, val]) => [val, key]));
};
var reverse2 = function(model5 = {}) {
  return {
    reversed: !model5.reversed,
    // these two work both ways
    both: flipObj(model5.both),
    ex: flipObj(model5.ex),
    // and the one-way rules trade places
    fwd: model5.rev || {},
    rev: model5.fwd || {}
  };
};
var invalid = function() {
  throw new Error("suffix-thumb: invalid packed model");
};
var unpackKeys = function(str, suff = "", out2 = []) {
  let i3 = 0;
  do {
    let chain = "";
    while (i3 < str.length && str[i3] !== "," && str[i3] !== "{") {
      chain += str[i3];
      i3 += 1;
    }
    if (reserved.test(chain)) {
      invalid();
    }
    if (str[i3] === "{") {
      let depth = 1;
      let j = i3 + 1;
      while (depth > 0 && j < str.length) {
        if (str[j] === "{") {
          depth += 1;
        } else if (str[j] === "}") {
          depth -= 1;
        }
        j += 1;
      }
      if (depth !== 0 || j < str.length && str[j] !== ",") {
        invalid();
      }
      unpackKeys(str.slice(i3 + 1, j - 1), chain + suff, out2);
      i3 = j;
    } else {
      out2.push(chain + suff);
    }
    i3 += 1;
  } while (i3 <= str.length);
  return out2;
};
var unpackSection = function(str = "") {
  const obj = /* @__PURE__ */ Object.create(null);
  if (!str) {
    return { ...obj };
  }
  str.split("|").forEach((group) => {
    const i3 = group.indexOf(":");
    const val = group.slice(0, i3);
    const count = val.match(/^[0-9]+/);
    if (i3 < 0 || !count || reserved.test(val.slice(count[0].length))) {
      invalid();
    }
    unpackKeys(group.slice(i3 + 1)).forEach((k2) => {
      if (Number(count[0]) > k2.length) {
        invalid();
      }
      obj[k2] = decodeVal(k2, val);
    });
  });
  return { ...obj };
};
var uncompress = function(str = "") {
  if (typeof str !== "string" || str[0] === "{") {
    throw new Error("suffix-thumb: uncompress expects a packed string. Models made before v6 must be learned again.");
  }
  const parts3 = str.split("~");
  if (str !== "" && parts3.length !== sections.length) {
    invalid();
  }
  const model5 = {};
  sections.forEach((s, i3) => {
    model5[s] = unpackSection(parts3[i3]);
  });
  return model5;
};

// ../../node_modules/compromise/src/2-two/preTagger/model/models/index.js
var fromVerb = { Past: conjugations_default.PastTense, Present: conjugations_default.PresentTense, Gerund: conjugations_default.Gerund, Participle: conjugations_default.Participle };
var toAdj = { Comparative: conjugations_default.Comparative, Superlative: conjugations_default.Superlative };
var models = {};
Object.keys(fromVerb).forEach((k2) => {
  models["from" + k2] = uncompress(fromVerb[k2]);
});
Object.keys(fromVerb).forEach((k2) => {
  models["to" + k2] = reverse2(models["from" + k2]);
});
Object.keys(toAdj).forEach((k2) => {
  models["to" + k2] = uncompress(toAdj[k2]);
});
Object.keys(toAdj).forEach((k2) => {
  models["from" + k2] = reverse2(models["to" + k2]);
});
models.adjToNoun = uncompress(conjugations_default.AdjToNoun);
var models_default = models;

// ../../node_modules/compromise/src/2-two/preTagger/model/regex/regex-normal.js
var regex_normal_default = [
  [email, Email],
  [explicitUrl, Url],
  // http..
  [bareUrl, Url],
  // .com
  // timezones
  [/^[PMCE]ST$/i, Timezone],
  // EST
  //names
  [/^ma?c'[a-z]{3}/, Last],
  // mc'neil
  [/^o'(?!clock)[a-z]{3}/, Last],
  // o'connor
  [/^ma?cd[aeiou][a-z]{3}/, Last],
  // mcdonald
  //slang things
  [/^(lol)+[sz]$/, Expr],
  // lol
  [/^wo{2,}a*h?$/, Expr],
  // wooah
  [/^(hee?){2,}h?$/, Expr],
  // hehe
  [/^(un|de|re)-[a-z\u00C0-\u00FF]{2}/, Vb],
  // un-vite
  // m/h
  [/^(m|k|cm|km)\/(s|h|hr)$/, Unit],
  // 5 k/m
  // μg/g
  [/^(ug|ng|mg)\/(l|m3|ft3)$/, Unit],
  // ug/L
  // love/hate
  [new RegExp("[^:/]\\/\\p{Letter}", "u"), SlashedTerm]
  // love/hate
];

// ../../node_modules/compromise/src/2-two/preTagger/model/regex/regex-text.js
var regex_text_default = [
  // #coolguy
  [new RegExp("^#[\\p{Number}_]*\\p{Letter}", "u"), HashTag],
  // can't be all numbers
  // @spencermountain
  [/^@\w{2,}$/, AtMention],
  // period-ones acronyms - f.b.i.
  [/^([A-Z]\.){2}[A-Z]?/i, [Acronym, NN]],
  // F.B.I - ascii-only
  // ending-apostrophes
  [/.{3}[lkmnp]in['‘’‛‵′`´]$/, Ger],
  // chillin'
  // (step 2 of the 's decision - the list is in contraction-two/compute/index.js)
  [/.{4}s['‘’‛‵′`´]$/, Poss],
  // flanders'
  //from https://www.regextester.com/106421
  // [/^([\u00a9\u00ae\u2319-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/, 'Emoji', 'emoji-range']
  // unicode character range
  [/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u, Emoji]
  // emoji-class
];

// ../../node_modules/compromise/src/2-two/preTagger/model/regex/regex-numbers.js
var regex_numbers_default = [
  [/^@1?[0-9](am|pm)$/i, Time],
  // 3pm
  [/^@1?[0-9]:[0-9]{2}(am|pm)?$/i, Time],
  // 3:30pm
  [/^'[0-9]{2}$/, Year],
  // times
  [/^[012]?[0-9](:[0-5][0-9])(:[0-5][0-9])$/, Time],
  // 3:12:31
  [/^[012]?[0-9](:[0-5][0-9])?(:[0-5][0-9])? ?(am|pm)$/i, Time],
  // 1:12pm
  [/^[012]?[0-9](:[0-5][0-9])(:[0-5][0-9])? ?(am|pm)?$/i, Time],
  // 1:12:31pm - can remove?
  // iso-dates
  [/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/i, Date],
  // iso-date
  [/^[0-9]{1,4}-[0-9]{1,2}-[0-9]{1,4}$/, Date],
  // iso-dash
  [/^[0-9]{1,4}\/[0-9]{1,2}\/([0-9]{4}|[0-9]{2})$/, Date],
  // iso-slash
  // needs a real day + month, and a 2 or 4-digit year (not 1.0.2, or 3.11.4)
  [/^[0-9]{4}\.(0?[1-9]|1[0-2])\.(0?[1-9]|[12][0-9]|3[01])$/, Date],
  // iso-dot
  [/^(0?[1-9]|[12][0-9]|3[01])\.(0?[1-9]|[12][0-9]|3[01])\.([0-9]{4}|[0-9]{2})$/, Date],
  // dot-date
  [/^[0-9]{1,4}-[a-z]{2,9}-[0-9]{1,4}$/i, Date],
  // 12-dec-2019
  // timezones
  [/^utc ?[+-]?[0-9]+$/, Timezone],
  // utc-9
  [/^(gmt|utc)[+-][0-9]{1,2}$/i, Timezone],
  // gmt-3
  //phone numbers
  [/^[0-9]{3}-[0-9]{4}$/, PhoneNumber],
  // 421-0029
  [/^(\+?[0-9][ -])?[0-9]{3}[ -]?[0-9]{3}-[0-9]{4}$/, PhoneNumber],
  // 1-800-
  //money
  //like $5.30
  [new RegExp("^[-+]?\\p{Currency_Symbol}[-+]?[0-9]+(,[0-9]{3})*(\\.[0-9]+)?([kmb]|bn)?\\+?$", "u"), ["Money", Val]],
  // $5.30
  //like 5.30$
  [new RegExp("^[-+]?[0-9]+(,[0-9]{3})*(\\.[0-9]+)?\\p{Currency_Symbol}\\+?$", "u"), ["Money", Val]],
  // 5.30£
  //like
  [/^[-+]?[$£]?[0-9]([0-9,.])+(usd|eur|jpy|gbp|cad|aud|chf|cny|hkd|nzd|kr|rub)$/i, ["Money", Val]],
  // $400usd
  //numbers
  // 50 | -50 | 3.23  | 5,999.0  | 10+
  [/^[-+]?[0-9]+(,[0-9]{3})*(\.[0-9]+)?\+?$/, [Card, Numeric]],
  // 5,999
  // a positive integer - not '0th', '-1st' or '3.5th'
  [/^(?!0+[a-z])[0-9]+(,[0-9]{3})*(st|nd|rd|r?th)$/, [Ord, Numeric]],
  // 53rd
  // .73th
  [/^\.[0-9]+\+?$/, [Card, Numeric]],
  // .73th
  //percent
  [/^[-+]?[0-9]+(,[0-9]{3})*(\.[0-9]+)?%\+?$/, ["Percent", Card, Numeric]],
  // -4%
  [/^\.[0-9]+%$/, ["Percent", Card, Numeric]],
  // .3%
  //fraction
  [/^[0-9]+(\.[0-9]+)?\/[0-9]+(st|nd|rd|th)?s?$/, [Frac, Numeric]],
  // 2/3rds
  //range
  [/^[0-9.]{1,3}[a-z]{0,2}[-–—][0-9]{1,3}[a-z]{0,2}$/, [Val, "NumberRange"]],
  // 3-4
  //time-range
  [/^[0-9]{1,2}(:[0-9][0-9])?(am|pm)? ?[-–—] ?[0-9]{1,2}(:[0-9][0-9])?(am|pm)$/, [Time, "NumberRange"]],
  // 3-4pm
  //number with unit
  // not a refused ordinal like '3.5th'
  [/^[0-9.]+(?!(st|nd|rd|th)s?$)([a-z°]{1,4})$/, Numeric]
  // 9km
];

// ../../node_modules/compromise/src/2-two/preTagger/model/orgWords.js
var orgWords_default = lib_default10(
  "academy administration agence agences agencies agency airlines airways army assoc associates association assurance authority autorite aviation bank banque board boys brands brewery brotherhood brothers bureau cafe co caisse capital care cathedral center centre chemicals choir chronicle church circus clinic clinique club coalition coffee collective college commission committee communications community company comprehensive computers confederation conference conseil consulting containers corporation corps corp council crew data departement department departments design development directorate division drilling education eglise electric electricity energy ensemble enterprise enterprises entertainment estate etat faculty faction federation financial fm foundation fund gas gazette girls government group guild herald holdings hospital hotel hotels inc industries institut institute institutes insurance international interstate investment investments investors journal laboratory labs llc ltd limited machines magazine management marine marketing markets media memorial ministere ministry military mobile motor motors musee museum news observatory office oil optical orchestra organization partners partnership petrol petroleum pharmacare pharmaceutical pharmaceuticals pizza plc police politburo polytechnic post power press productions quartet radio reserve resources restaurant restaurants savings school securities service services societe subsidiary society sons subcommittee syndicat systems telecommunications telegraph television times tribunal tv union university utilities workers",
  true
);

// ../../node_modules/compromise/src/2-two/preTagger/model/placeWords.js
var placeWords_default = lib_default10(
  "atoll basin bay beach bluff bog camp canyon canyons cape cave caves cliffs coast cove coves crater crossing creek desert dune dunes downs estates escarpment estuary falls fjord fjords forest forests glacier gorge gorges grove gulf gully highland heights hollow hill hills inlet island islands isthmus junction knoll lagoon lake lakeshore marsh marshes mount mountain mountains narrows peninsula plains plateau pond rapids ravine reef reefs ridge river rivers sandhill shoal shore shoreline shores strait straits springs stream swamp tombolo trail trails trench valley vallies village volcano waterfall watershed wetland woods acres burough county district municipality prefecture province region reservation state territory borough metropolis downtown uptown midtown city town township hamlet country kingdom enclave neighbourhood neighborhood ward zone airport amphitheater arch arena auditorium bar barn basilica battlefield bridge building castle centre coliseum cineplex complex dam farm field fort garden gardens gymnasium hall house levee library manor memorial monument museum gallery palace pillar pits plantation playhouse quarry sportsfield sportsplex stadium terrace terraces theater tower park parks site ranch raceway ave st street rd road lane landing crescent cr way tr avenue",
  true
);

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/nouns/toSingular/_rules.js
var rules_default2 = [
  [/^([dlpt])ies$/i, "$1ie"],
  //lies, ties
  [/([^v])ies$/i, "$1y"],
  [/(ise)s$/i, "$1"],
  //promises
  [/(kn|[^o]l|w)ives$/i, "$1ife"],
  [/^((?:ca|e|ha|(?:our|them|your)?se|she|wo)l|lea|loa|shea|thie)ves$/i, "$1f"],
  [/^(dwar|handkerchie|hoo|scar|whar)ves$/i, "$1f"],
  [/(antenn|formul|nebul|vertebr|vit)ae$/i, "$1a"],
  [/(octop|vir|radi|nucle|fung|cact|stimul)(i)$/i, "$1us"],
  [/(buffal|tomat|tornad)(oes)$/i, "$1o"],
  [/(ious)es$/i, "$1"],
  //geniouses
  [/(ause|ease|eese|ouse|ose|..ase)s$/i, "$1"],
  //causes, diseases, cheeses, houses, roses
  [/(..[aeiu]s)es$/i, "$1"],
  [/(vert|ind|cort)(ices)$/i, "$1ex"],
  [/(matr|append)(ices)$/i, "$1ix"],
  [/^(can|ob|tipt|[fhtw])oes$/i, "$1oe"],
  //toes, canoes
  [/([xo]|ch|ss|sh)es$/i, "$1"],
  [/men$/i, "man"],
  [/(n)ews$/i, "$1ews"],
  [/([ti])a$/i, "$1um"],
  [/([^aeiouy]|qu)ies$/i, "$1y"],
  [/(s)eries$/i, "$1eries"],
  [/(m)ovies$/i, "$1ovie"],
  [/(cris|ax|test)es$/i, "$1is"],
  [/(alias|status)es$/i, "$1"],
  [/(ss)$/i, "$1"],
  [/(ic)s$/i, "$1"],
  [/s$/i, ""]
];

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/nouns/toSingular/index.js
var invertObj = function(obj) {
  return Object.keys(obj).reduce((h, k2) => {
    h[obj[k2]] = k2;
    return h;
  }, {});
};
var toSingular = function(str, model5) {
  const { irregularPlurals } = model5.two;
  const invert = invertObj(irregularPlurals);
  if (Object.hasOwn(invert, str)) {
    return invert[str];
  }
  for (let i3 = 0; i3 < rules_default2.length; i3++) {
    if (rules_default2[i3][0].test(str)) {
      str = str.replace(rules_default2[i3][0], rules_default2[i3][1]);
      return str;
    }
  }
  return str;
};
var toSingular_default = toSingular;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/nouns/index.js
var all = function(str, model5) {
  const arr = [str];
  const p4 = toPlural_default(str, model5);
  if (p4 !== str) {
    arr.push(p4);
  }
  const s = toSingular_default(str, model5);
  if (s !== str) {
    arr.push(s);
  }
  return arr;
};
var nouns_default3 = { toPlural: toPlural_default, toSingular: toSingular_default, all };

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/verbs/getTense/_guess.js
var byTense = {
  Gerund: "ing",
  Actor: "erer",
  Infinitive: "ate ize tion rify then ress ify age nce ect ise ine ish ace ash ure tch end ack and ute ade ock ite ase ose use ive int nge lay est ain ant ent eed er le unk ung upt en",
  PastTense: "ept ed lt nt ew ld",
  PresentTense: "rks cks nks ngs mps tes zes ers les acks ends ands ocks lays eads lls els ils ows nds ays ams ars ops ffs als urs lds ews ips es ts ns",
  Participle: "ken wn"
};
var guessVerb = {};
Object.keys(byTense).forEach((k2) => {
  byTense[k2].split(" ").forEach((a) => {
    guessVerb[a] = k2;
  });
});
var guess_default = guessVerb;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/verbs/getTense/index.js
var getTense = function(str) {
  for (const n2 of [3, 2]) {
    const end2 = str.substring(str.length - n2);
    if (Object.hasOwn(guess_default, end2)) {
      return guess_default[end2];
    }
  }
  if (str.endsWith("s")) {
    return Pres;
  }
  return null;
};
var getTense_default = getTense;

// ../../node_modules/compromise/src/2-two/_lib.js
var hasAny = (term, ...tags) => tags.some((tag) => term.tags.has(tag));
var toSet = (str) => new Set(str.split(" "));

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/verbs/toInfinitive/index.js
var toParts = function(str, model5) {
  let prefix6 = "";
  const prefixes2 = model5.one?.prefixes || {};
  let [verb, particle] = str.split(/ /);
  if (particle && prefixes2[verb] === true) {
    prefix6 = verb;
    verb = particle;
    particle = "";
  }
  return {
    prefix: prefix6,
    verb,
    particle
  };
};
var copulas = toSet("are were been is am was be being");
var byTense2 = {
  [Participle]: "fromParticiple",
  [Past]: "fromPast",
  [Pres]: "fromPresent",
  [Ger]: "fromGerund"
};
var toInfinitive = function(str, model5, tense) {
  const { prefix: prefix6, verb, particle } = toParts(str, model5);
  let inf = "";
  if (!tense) {
    tense = getTense_default(str);
  }
  const lower = str.toLowerCase();
  if (copulas.has(lower)) {
    inf = "be";
  } else if (Object.hasOwn(byTense2, tense)) {
    inf = convert(verb, model5.two.models[byTense2[tense]]);
  } else {
    return str;
  }
  if (particle) {
    inf += " " + particle;
  }
  if (prefix6) {
    inf = prefix6 + " " + inf;
  }
  return inf;
};
var toInfinitive_default = toInfinitive;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/verbs/conjugate/index.js
var conjugate = function(inf, model5) {
  const { toPast: toPast2, toPresent: toPresent2, toGerund: toGerund3, toParticiple: toParticiple2 } = model5.two.models;
  if (inf === "be") {
    return {
      Infinitive: inf,
      Gerund: "being",
      PastTense: "was",
      Participle: "been",
      PresentTense: "is"
    };
  }
  const [str, particle = ""] = inf.split(" ");
  const found = {
    Infinitive: str,
    PastTense: convert(str, toPast2),
    PresentTense: convert(str, toPresent2),
    Gerund: convert(str, toGerund3),
    FutureTense: "will " + str
  };
  let pastPrt = convert(str, toParticiple2);
  if (pastPrt !== inf && pastPrt !== found.PastTense) {
    const lex = model5.one.lexicon || {};
    if (lex[pastPrt] === "Participle" || lex[pastPrt] === Adj) {
      if (inf === "play") {
        pastPrt = "played";
      }
      found.Participle = pastPrt;
    }
  }
  if (particle) {
    Object.keys(found).forEach((k2) => {
      found[k2] += " " + particle;
    });
  }
  return found;
};
var conjugate_default = conjugate;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/verbs/index.js
var all2 = function(str, model5) {
  const res = conjugate_default(str, model5);
  delete res.FutureTense;
  return Object.values(res).filter((s) => s);
};
var verbs_default2 = {
  toInfinitive: toInfinitive_default,
  conjugate: conjugate_default,
  all: all2
};

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/adjectives/inflect.js
var by = (key) => (adj, model5) => convert(adj, model5.two.models[key]);
var toSuperlative = by("toSuperlative");
var toComparative = by("toComparative");
var fromComparative = by("fromComparative");
var fromSuperlative = by("fromSuperlative");
var toNoun = by("adjToNoun");

// ../../node_modules/compromise/src/2-two/preTagger/methods/_lib.js
var findAffix = (str = "", table2 = [], max3, min2, fromStart) => {
  const len = str.length;
  for (let i3 = max3; i3 >= min2; i3 -= 1) {
    const affix = fromStart ? str.substring(0, i3) : str.substring(len - i3, len);
    if (Object.hasOwn(table2[affix.length], affix)) {
      return affix;
    }
  }
  return null;
};
var lib_default11 = findAffix;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/adjectives/conjugate/lib.js
var suffixLoop = function(str = "", suffixes6 = []) {
  const len = str.length;
  const suffix3 = lib_default11(str, suffixes6, Math.min(len - 1, 6), 1);
  if (suffix3 === null) {
    return null;
  }
  return str.slice(0, len - suffix3.length) + suffixes6[suffix3.length][suffix3];
};
var lib_default12 = suffixLoop;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/adjectives/conjugate/fromAdverb.js
var ical = new Set("analyt chem class clin crit ecolog electr empir frant grammat ident ideolog log mag mathemat mechan med method mus phys polit pract rad satir statist techn technolog theoret typ vert whims".split(" ").map((x) => x + "ically"));
var suffixes3 = [
  null,
  {},
  { "ly": "" },
  {
    "ily": "y",
    "bly": "ble",
    "ply": "ple"
  },
  {
    "ally": "al",
    "rply": "rp"
  },
  {
    "ually": "ual",
    "ially": "ial",
    "cally": "cal",
    "eally": "eal",
    "rally": "ral",
    "nally": "nal",
    "mally": "mal",
    "eeply": "eep",
    "eaply": "eap"
  },
  {
    ically: "ic"
  }
];
var noAdj = toSet("early only hourly daily weekly monthly yearly mostly duly unduly especially undoubtedly conversely namely exceedingly presumably accordingly overly best latter little long low");
var exceptions = {
  wholly: "whole",
  fully: "full",
  truly: "true",
  gently: "gentle",
  singly: "single",
  customarily: "customary",
  idly: "idle",
  publically: "public",
  quickly: "quick",
  superbly: "superb",
  cynically: "cynical",
  well: "good"
  // -?
};
var toAdjective = function(str) {
  if (!str.endsWith("ly")) {
    return null;
  }
  if (ical.has(str)) {
    return str.replace(/ically/, "ical");
  }
  if (noAdj.has(str)) {
    return null;
  }
  if (Object.hasOwn(exceptions, str)) {
    return exceptions[str];
  }
  return lib_default12(str, suffixes3) || str;
};
var fromAdverb_default = toAdjective;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/adjectives/conjugate/toAdverb.js
var suffixes4 = [
  null,
  {
    y: "ily"
  },
  {
    ly: "ly",
    //unchanged
    ic: "ically"
  },
  {
    ial: "ially",
    ual: "ually",
    tle: "tly",
    ble: "bly",
    ple: "ply",
    ary: "arily"
  },
  {},
  {},
  {}
];
var exceptions2 = {
  cool: "cooly",
  whole: "wholly",
  full: "fully",
  good: "well",
  idle: "idly",
  public: "publicly",
  single: "singly",
  special: "especially"
};
var toAdverb = function(str) {
  if (Object.hasOwn(exceptions2, str)) {
    return exceptions2[str];
  }
  let adv = lib_default12(str, suffixes4);
  if (!adv) {
    adv = str + "ly";
  }
  return adv;
};
var toAdverb_default = toAdverb;

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/adjectives/index.js
var all3 = function(str, model5) {
  let arr = [str];
  arr.push(toSuperlative(str, model5));
  arr.push(toComparative(str, model5));
  arr.push(toAdverb_default(str));
  arr = arr.filter((s) => s);
  arr = new Set(arr);
  return Array.from(arr);
};
var adjectives_default = {
  toSuperlative,
  toComparative,
  toAdverb: toAdverb_default,
  toNoun,
  fromAdverb: fromAdverb_default,
  fromSuperlative,
  fromComparative,
  all: all3
};

// ../../node_modules/compromise/src/2-two/preTagger/methods/transform/index.js
var transform_default = {
  noun: nouns_default3,
  verb: verbs_default2,
  adjective: adjectives_default
};

// ../../node_modules/compromise/src/2-two/preTagger/methods/expand/byTag.js
var addForm = (lex, model5, form, tag) => {
  if (!model5.one.lexicon[form]) {
    lex[form] ||= tag;
  }
};
var addPlural = (word, lex, methods20, model5, tag) => {
  addForm(lex, model5, methods20.two.transform.noun.toPlural(word, model5), tag);
};
var byTag_default = {
  // add plural forms of singular nouns
  Singular: (word, lex, methods20, model5) => {
    addPlural(word, lex, methods20, model5, Plur);
  },
  // 'lawyer', 'manager' plural forms
  Actor: (word, lex, methods20, model5) => {
    addPlural(word, lex, methods20, model5, [Plur, "Actor"]);
  },
  // superlative/ comparative forms for adjectives
  Comparable: (word, lex, methods20, model5) => {
    const { toSuperlative: toSuperlative2, toComparative: toComparative2 } = methods20.two.transform.adjective;
    addForm(lex, model5, toSuperlative2(word, model5), Sup);
    addForm(lex, model5, toComparative2(word, model5), Comp);
    lex[word] = Adj;
  },
  // 'german' -> 'germans'
  Demonym: (word, lex, methods20, model5) => {
    const plural = methods20.two.transform.noun.toPlural(word, model5);
    lex[plural] ||= ["Demonym", Plur];
  },
  // conjugate all forms of these verbs
  Infinitive: (word, lex, methods20, model5) => {
    const already = model5.one.lexicon;
    const all4 = methods20.two.transform.verb.conjugate(word, model5);
    Object.entries(all4).forEach((a) => {
      if (!already[a[1]] && !lex[a[1]] && a[0] !== Fut) {
        lex[a[1]] = a[0];
      }
    });
  },
  // 'walk up' should conjugate, too
  PhrasalVerb: (word, lex, methods20, model5) => {
    const already = model5.one.lexicon;
    lex[word] = [Phrasal, Inf];
    const _multi = model5.one._multiCache;
    const [inf, rest] = word.split(" ");
    if (!already[inf]) {
      lex[inf] ||= Inf;
    }
    const all4 = methods20.two.transform.verb.conjugate(inf, model5);
    delete all4.FutureTense;
    Object.entries(all4).forEach((a) => {
      if (a[0] === "Actor" || a[1] === "") {
        return;
      }
      if (!lex[a[1]] && !already[a[1]]) {
        lex[a[1]] = a[0];
      }
      _multi[a[1]] = 2;
      const str = a[1] + " " + rest;
      lex[str] ||= [a[0], Phrasal];
    });
  },
  // expand 'million'
  Multiple: (word, lex) => {
    lex[word] = ["Multiple", Card];
    lex[word + "th"] = ["Multiple", Ord];
    lex[word + "ths"] = ["Multiple", Frac];
  },
  // expand number-words
  Cardinal: (word, lex) => {
    lex[word] = [TxtNum, Card];
  },
  // 'millionth'
  Ordinal: (word, lex) => {
    lex[word] = [TxtNum, Ord];
    lex[word + "s"] = [TxtNum, Frac];
  },
  // 'thames'
  Place: (word, lex) => {
    lex[word] = ["Place", Prop];
  },
  // 'ontario'
  Region: (word, lex) => {
    lex[word] = ["Region", Prop];
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/methods/expand/index.js
var expand4 = function(words2, world2) {
  const { methods: methods20, model: model5 } = world2;
  const lex = {};
  const _multi = {};
  Object.keys(words2).forEach((word) => {
    const tag = words2[word];
    word = word.toLowerCase().trim();
    word = word.replace(/'s\b/, "");
    const split4 = word.split(/ /);
    if (split4.length > 1) {
      if (_multi[split4[0]] === void 0 || split4.length > _multi[split4[0]]) {
        _multi[split4[0]] = split4.length;
      }
    }
    if (Object.hasOwn(byTag_default, tag)) {
      byTag_default[tag](word, lex, methods20, model5);
    }
    lex[word] ||= tag;
  });
  delete lex[""];
  delete lex[null];
  delete lex[" "];
  return { lex, _multi };
};
var expand_default3 = expand4;

// ../../node_modules/compromise/src/2-two/preTagger/methods/quickSplit.js
var splitOn = function(terms, i3) {
  const isNum = /^[0-9]+$/;
  const term = terms[i3];
  if (!term) {
    return false;
  }
  const maybeDate = toSet("may april august jan");
  if (term.normal === "like" || maybeDate.has(term.normal)) {
    return false;
  }
  if (hasAny(term, Place, Date)) {
    return false;
  }
  if (terms[i3 - 1]) {
    const lastTerm = terms[i3 - 1];
    if (lastTerm.tags.has(Date) || maybeDate.has(lastTerm.normal)) {
      return false;
    }
    if (lastTerm.tags.has(Adj) || term.tags.has(Adj)) {
      return false;
    }
  }
  const str = term.normal;
  if (str.length === 1 || str.length === 2 || str.length === 4) {
    if (isNum.test(str)) {
      return false;
    }
  }
  return true;
};
var quickSplit = function(document) {
  const splitHere = /[,:;]/;
  const arr = [];
  document.forEach((terms) => {
    let start2 = 0;
    terms.forEach((term, i3) => {
      if (splitHere.test(term.post) && splitOn(terms, i3 + 1)) {
        arr.push(terms.slice(start2, i3 + 1));
        start2 = i3 + 1;
      }
    });
    if (start2 < terms.length) {
      arr.push(terms.slice(start2, terms.length));
    }
  });
  return arr;
};
var quickSplit_default = quickSplit;

// ../../node_modules/compromise/src/2-two/preTagger/methods/looksPlural.js
var isPlural = {
  e: "mice louse antennae formulae nebulae vertebrae vitae".split(" "),
  i: "tia octopi viri radii nuclei fungi cacti stimuli".split(" "),
  n: ["men"],
  t: ["feet"]
};
var exceptions3 = toSet("israelis menus logos");
var notPlural = `bus mas was ias xas vas cis lis nis ois ris sis tis xis aus cus eus fus gus ius lus nus das ous pus rus sus tus xus aos igos ados ogos 's ss`.split(" ");
var looksPlural = function(str) {
  if (!str || str.length <= 3) {
    return false;
  }
  if (exceptions3.has(str)) {
    return true;
  }
  const end2 = str[str.length - 1];
  if (Object.hasOwn(isPlural, end2)) {
    return isPlural[end2].find((suff) => str.endsWith(suff));
  }
  if (end2 !== "s") {
    return false;
  }
  if (notPlural.find((suff) => str.endsWith(suff))) {
    return false;
  }
  return true;
};
var looksPlural_default = looksPlural;

// ../../node_modules/compromise/src/2-two/preTagger/methods/index.js
var methods_default9 = {
  two: {
    quickSplit: quickSplit_default,
    expandLexicon: expand_default3,
    transform: transform_default,
    looksPlural: looksPlural_default
  }
};

// ../../node_modules/compromise/src/2-two/preTagger/model/_expand/irregulars.js
var expandIrregulars = function(model5) {
  const { irregularPlurals } = model5.two;
  const { lexicon: lexicon4 } = model5.one;
  Object.entries(irregularPlurals).forEach((a) => {
    lexicon4[a[0]] ||= Sing;
    lexicon4[a[1]] ||= Plur;
  });
  return model5;
};
var irregulars_default = expandIrregulars;

// ../../node_modules/compromise/src/2-two/preTagger/model/_expand/index.js
var tmpModel2 = {
  one: { lexicon: {} },
  two: { models: models_default }
};
var switchDefaults = {
  // 'pilot'
  [ActorVerb]: Actor,
  //
  // 'amusing'
  [AdjGerund]: Adj,
  //+conjugations
  // 'standard'
  [AdjNoun]: Adj,
  // 'boiled'
  [AdjPast]: Adj,
  //+conjugations
  // 'smooth'
  [AdjPresent]: Adj,
  //+conjugations
  // 'box'
  [NounVerb]: Sing,
  //+conjugations (no-present)
  //'singing'
  [NounGerund]: Ger,
  //+conjugations
  // 'hope'
  [PersonNoun]: NN,
  // 'April'
  "Person|Date": Month,
  // 'rob'
  [PersonVerb]: First,
  //+conjugations
  // 'victoria'
  "Person|Place": Pers,
  // 'rusty'
  [PersonAdj]: "Comparable",
  // 'boxes'
  [PluralVerb]: Plur,
  //(these are already derivative)
  // 'miles'
  "Unit|Noun": NN
};
var expandLexicon = function(words2, model5) {
  const world2 = { model: model5, methods: methods_default9 };
  const { lex, _multi } = methods_default9.two.expandLexicon(words2, world2);
  Object.assign(model5.one.lexicon, lex);
  Object.assign(model5.one._multiCache, _multi);
  return model5;
};
var addUncountables = function(words2, model5) {
  Object.keys(words2).forEach((k2) => {
    if (words2[k2] === Uncountable) {
      model5.two.uncountable[k2] = true;
      words2[k2] = Uncountable;
    }
  });
  return model5;
};
var expandVerb = function(str, words2, doPresent) {
  const obj = conjugate_default(str, tmpModel2);
  words2[obj.PastTense] ||= Past;
  words2[obj.Gerund] ||= Ger;
  if (doPresent) {
    words2[obj.PresentTense] ||= Pres;
  }
};
var expandAdjective = function(str, words2, model5) {
  const sup = toSuperlative(str, model5);
  words2[sup] ||= Sup;
  const comp = toComparative(str, model5);
  words2[comp] ||= Comp;
};
var expandVariable = function(switchWords, model5) {
  const words2 = {};
  const actorPlurals = {};
  const lex = model5.one.lexicon;
  Object.keys(switchWords).forEach((w) => {
    const name = switchWords[w];
    words2[w] = switchDefaults[name];
    if (name === ActorVerb) {
      const plural = toPlural_default(w, model5);
      if (switchWords[plural] === PluralVerb) {
        actorPlurals[plural] = [Plur, Actor];
      }
    }
    if ([NounVerb, PersonVerb, ActorVerb].includes(name)) {
      expandVerb(w, lex, false);
    }
    if (name === AdjPresent) {
      expandVerb(w, lex, true);
      expandAdjective(w, lex, model5);
    }
    if (name === PersonAdj) {
      expandAdjective(w, lex, model5);
    }
    if ([AdjGerund, NounGerund].includes(name)) {
      const inf = toInfinitive_default(w, tmpModel2, Ger);
      if (!lex[inf]) {
        words2[inf] = Inf;
      }
    }
    if ([NounGerund, AdjNoun, PersonNoun].includes(name)) {
      lex[toPlural_default(w, model5)] ||= Plur;
    }
    if (name === AdjPast) {
      const inf = toInfinitive_default(w, tmpModel2, Past);
      if (inf !== w && !lex[inf]) {
        words2[inf] = Inf;
      }
    }
  });
  Object.assign(words2, actorPlurals);
  model5 = expandLexicon(words2, model5);
  return model5;
};
var expand5 = function(model5) {
  model5 = expandLexicon(model5.one.lexicon, model5);
  model5 = addUncountables(model5.one.lexicon, model5);
  model5 = expandVariable(model5.two.switches, model5);
  model5 = irregulars_default(model5);
  return model5;
};
var expand_default4 = expand5;

// ../../node_modules/compromise/src/2-two/preTagger/model/index.js
var model4 = {
  one: {
    _multiCache: {},
    lexicon: lexicon3,
    frozenLex: frozenLex_default
  },
  two: {
    irregularPlurals: plurals_default,
    models: models_default,
    suffixPatterns: suffixes_default2,
    prefixPatterns: prefixes_default2,
    endsWith: endsWith_default,
    neighbours: neighbours_default,
    regexNormal: regex_normal_default,
    regexText: regex_text_default,
    regexNumbers: regex_numbers_default,
    switches,
    clues: clues_default,
    uncountable: {},
    orgWords: orgWords_default,
    placeWords: placeWords_default
  }
};
model4 = expand_default4(model4);
var model_default3 = model4;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/_lib.js
var setTag2 = (terms, tag, world2, reason13) => world2.methods.one.setTag(terms, tag, world2, null, reason13);
var titleCase3 = new RegExp("^\\p{Lu}[\\p{Ll}'\u2019]", "u");
var isTitleWord = (term, i3, yelling) => {
  if (yelling || !titleCase3.test(term.text)) {
    return false;
  }
  if (i3 === 0) {
    return term.tags.has(Sing);
  }
  return true;
};

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/1st-pass/01-colons.js
var byPunctuation = function(terms, i3, model5, world2) {
  if (i3 === 0 && terms.length >= 3) {
    const hasColon = /:/;
    const post = terms[0].post;
    if (hasColon.test(post)) {
      if (hasAny(terms[1], Val, Email, PhoneNumber)) {
        return;
      }
      setTag2([terms[0]], Expr, world2, `2-punct-colon''`);
    }
  }
};
var colons_default = byPunctuation;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/1st-pass/02-hyphens.js
var reason = "1-hyphen";
var byHyphen = (terms, i3, model5, world2) => {
  const term = terms[i3];
  if (term.post === "-" && terms[i3 + 1]) {
    setTag2([term, terms[i3 + 1]], Hyphenated, world2, reason);
  }
  const prev = terms[i3 - 1];
  if (!prev || prev.post !== "-") {
    return;
  }
  const before2 = terms[i3 - 2];
  if (/^(under|over|out|re|mis)$/.test(prev.normal) && term.switch === NounVerb && before2 && hasAny(before2, Pron, Mod)) {
    setTag2([prev], Prefix, world2, reason);
    setTag2([prev], Vb, world2, reason);
    setTag2([term], Inf, world2, reason);
    return;
  }
  const offWhite = prev.normal === "off" && term.normal === "white";
  const numberFold = prev.tags.has(Val) && term.normal === "fold";
  const verbCompound = prev.tags.has(Inf) && !prev.tags.has(Phrasal) && !hasAny(term, Phrasal, Pron);
  const nounParticiple = prev.switch === NounVerb && term.tags.has(Past) && before2 && hasAny(before2, Cop, Det);
  if (offWhite || numberFold || verbCompound || nounParticiple) {
    setTag2([prev, term], Adj, world2, reason);
  }
};
var hyphens_default = byHyphen;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/00-tagSwitch.js
var prefix4 = /^(under|over|mis|re|un|dis|semi)-?/;
var tagSwitch = function(terms, i3, model5) {
  const switches2 = model5.two.switches;
  const term = terms[i3];
  if (Object.hasOwn(switches2, term.normal)) {
    term.switch = switches2[term.normal];
    return;
  }
  if (prefix4.test(term.normal)) {
    const stem = term.normal.replace(prefix4, "");
    if (stem.length > 3 && Object.hasOwn(switches2, stem)) {
      term.switch = switches2[stem];
    }
  }
};
var tagSwitch_default = tagSwitch;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/_fastTag.js
var fastTag = function(term, tag, reason13) {
  if (!tag || tag.length === 0) {
    return;
  }
  if (term.frozen) {
    return;
  }
  term.tags ||= /* @__PURE__ */ new Set();
  const previous = debug_default.tags ? debug_default.before(term) : null;
  if (typeof tag === "string") {
    term.tags.add(tag);
  } else {
    tag.forEach((tg) => term.tags.add(tg));
  }
  if (previous) {
    debug_default.log(term, previous, reason13);
  }
};
var fastTag_default = fastTag;

// ../../node_modules/compromise/src/2-two/preTagger/methods/spokenYear.js
var ones = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
var tens = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40
};
var possessive = /['’]s$/;
var spokenYear = function(words2) {
  const [first, second, third] = [...words2.slice(0, -1), words2.at(-1).replace(possessive, "")];
  if (first !== "twenty" || !Object.hasOwn(tens, second)) {
    return null;
  }
  if (words2.length === 2) {
    return 2e3 + tens[second];
  }
  if (words2.length === 3 && (second === "twenty" || second === "thirty") && Object.hasOwn(ones, third)) {
    return 2e3 + tens[second] + ones[third];
  }
  return null;
};
var spokenYear_default = spokenYear;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/00-spokenYear.js
var joined = /^( +|-)$/;
var counted = [Val, Unit, "Currency", "Duration"];
var measures = /^(times|euro|penny|quid|nickels|kms|kgs|lbs|metres?|tons|degrees?|calories|watts)$/;
var notBefore = /^(at|won|lost|tied|drew)$/;
var idioms = /^(vision|hindsight|foresight|eyesight|cricket)$/;
var getYear = function(terms, i3) {
  for (let len = 3; len >= 2; len -= 1) {
    const found = terms.slice(i3, i3 + len);
    const isWhole = found.length === len && found.slice(0, -1).every((t) => joined.test(t.post));
    if (isWhole && spokenYear_default(found.map((t) => t.normal)) !== null) {
      return found;
    }
  }
  return null;
};
var isCountLeft = function(terms, i3) {
  const prev = terms[i3 - 1];
  if (!prev || !joined.test(prev.post)) {
    return false;
  }
  if (notBefore.test(prev.normal)) {
    return true;
  }
  const month2 = terms[i3 - 2];
  return prev.tags.has(Card) && !month2?.tags.has(Month) && !/^(march|may)$/.test(month2?.normal);
};
var isCountRight = function(year, next) {
  const last = year.at(-1);
  if (last.post === "-") {
    return true;
  }
  if (!next || !joined.test(last.post)) {
    return false;
  }
  if (counted.some((tag) => next.tags.has(tag)) || measures.test(next.normal)) {
    return true;
  }
  return year.length === 2 && year[1].normal === "twenty" && idioms.test(next.normal);
};
var tagSpokenYear = function(terms, i3) {
  if (terms[i3].normal !== "twenty") {
    return null;
  }
  const year = getYear(terms, i3);
  if (year === null || isCountLeft(terms, i3) || isCountRight(year, terms[i3 + year.length])) {
    return null;
  }
  year.forEach((term) => fastTag_default(term, [Year, Date, Val, TxtNum, Card], "2-spoken-year"));
  return true;
};
var spokenYear_default2 = tagSpokenYear;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/_fillTags.js
var reason2 = "3-fill-tags";
var uncountable = [
  Acronym,
  Abbr,
  Prop,
  Uncountable,
  Poss,
  Pron,
  "Activity",
  Hon,
  Month
];
var setPluralSingular = function(term) {
  if (!term.tags.has(NN) || hasAny(term, Plur, Sing, ...uncountable)) {
    return;
  }
  if (looksPlural_default(term.normal)) {
    fastTag_default(term, Plur, reason2);
  } else {
    fastTag_default(term, Sing, reason2);
  }
};
var setTense = function(term) {
  const tags = term.tags;
  if (tags.has(Vb) && tags.size === 1) {
    const guess = getTense_default(term.normal);
    if (guess) {
      fastTag_default(term, guess, reason2);
      if (guess === Inf || guess === Ger) {
        fastTag_default(term, Pres, reason2);
      }
    }
  }
};
var fillTags = function(terms, i3, model5) {
  const term = terms[i3];
  if (term.frozen) {
    return;
  }
  let remaining = term.tags.size;
  for (const tag of term.tags) {
    if (remaining === 0) {
      break;
    }
    remaining -= 1;
    const parents = model5.one.tagSet[tag]?.parents;
    if (parents) {
      if (debug_default.tags) {
        fastTag_default(term, parents, ` -inferred by #${tag}`);
      } else {
        for (let k2 = 0; k2 < parents.length; k2 += 1) {
          if (!term.tags.has(parents[k2])) {
            term.tags.add(parents[k2]);
          }
        }
      }
    }
  }
  setPluralSingular(term);
  setTense(term, model5);
};
var fillTags_default = fillTags;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/01-case.js
var reason3 = "2-case";
var hasNumber = /[0-9]/;
var notProper = [Date, Month, WeekDay, Unit, Expr];
var hasIVX = /[IVX]/;
var romanNumeral = /^[IVXLCDM]{2,}$/;
var romanNumValid = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
var nope = toSet("li dc md dm ml");
var checkCase = function(terms, i3, model5) {
  const term = terms[i3];
  term.index ||= [0, 0];
  const index3 = term.index[1];
  const str = term.text || "";
  if (index3 !== 0 && titleCase3.test(str) && !hasNumber.test(str)) {
    if (hasAny(term, ...notProper)) {
      return null;
    }
    if (term.tags.has(Comp) && terms[i3 + 1]?.normal === "than") {
      return null;
    }
    if (i3 === 0 && term.tags.has(Ger) && terms[i3 + 1]?.tags.has(Det)) {
      return null;
    }
    if (/["']$/.test(term.pre)) {
      return null;
    }
    if (term.normal === "the") {
      return null;
    }
    fillTags_default(terms, i3, model5);
    if (!term.tags.has(NN) && !term.frozen) {
      unTag_default([term], "*", model5.one.tagSet, reason3);
    }
    fastTag_default(term, Prop, reason3);
    return true;
  }
  if (str.length >= 2 && romanNumeral.test(str) && hasIVX.test(str) && romanNumValid.test(str) && !nope.has(term.normal)) {
    fastTag_default(term, RomanNumeral, reason3);
    return true;
  }
  return null;
};
var case_default2 = checkCase;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/02-suffix.js
var reason4 = "2-suffix";
var suffixLoop2 = function(str = "", suffixes6 = []) {
  const suffix3 = lib_default11(str, suffixes6, Math.min(str.length - 1, 7), 2);
  if (suffix3 === null) {
    return null;
  }
  return suffixes6[suffix3.length][suffix3];
};
var tagBySuffix = function(terms, i3, model5) {
  const term = terms[i3];
  if (term.tags.size === 0) {
    let tag = suffixLoop2(term.normal, model5.two.suffixPatterns);
    if (tag !== null) {
      fastTag_default(term, tag, reason4);
      term.confidence = 0.7;
      return true;
    }
    if (term.implicit) {
      tag = suffixLoop2(term.implicit, model5.two.suffixPatterns);
      if (tag !== null) {
        fastTag_default(term, tag, reason4);
        term.confidence = 0.7;
        return true;
      }
    }
  }
  const str = term.machine || term.normal;
  if (term.tags.size === 1 && term.tags.has(Prop) && !Object.hasOwn(model5.one.lexicon, str)) {
    if (suffixLoop2(str, model5.two.suffixPatterns) === Last) {
      fastTag_default(term, Last, reason4);
      return true;
    }
  }
  return null;
};
var suffix_default = tagBySuffix;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/03-regex.js
var hasApostrophe = /['‘’‛‵′`´]/;
var doRegs = function(str, regs) {
  for (let i3 = 0; i3 < regs.length; i3 += 1) {
    if (regs[i3][0].test(str)) {
      return regs[i3];
    }
  }
  return null;
};
var doEndsWith = (str = "", byEnd3) => doRegs(str, byEnd3[str[str.length - 1]] || []);
var checkRegex = function(terms, i3, model5, world2) {
  const { regexText, regexNormal, regexNumbers, endsWith } = model5.two;
  const term = terms[i3];
  const normal = term.machine || term.normal;
  let text = term.implicit || term.text;
  if (hasApostrophe.test(term.post) && !hasApostrophe.test(term.pre)) {
    text += term.post.trim();
  }
  let arr = doRegs(text, regexText) || doRegs(normal, regexNormal);
  if (!arr && term.tags.size === 0 && normal !== term.normal) {
    arr = doRegs(term.normal, regexNormal);
  }
  if (!arr && /[0-9]/.test(normal)) {
    arr = doRegs(normal, regexNumbers);
  }
  if (!arr && term.tags.size === 0) {
    arr = doEndsWith(normal, endsWith);
  }
  if (arr) {
    setTag2([term], arr[1], world2, "2-regex");
    term.confidence = 0.6;
    return true;
  }
  return null;
};
var regex_default = checkRegex;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/04-prefix.js
var prefixLoop = function(str = "", prefixes2 = []) {
  const prefix6 = lib_default11(str, prefixes2, Math.min(str.length - 3, 7), 3, true);
  if (prefix6 === null) {
    return null;
  }
  return prefixes2[prefix6.length][prefix6];
};
var checkPrefix = function(terms, i3, model5) {
  const term = terms[i3];
  if (term.tags.size === 0) {
    const tag = prefixLoop(term.normal, model5.two.prefixPatterns);
    if (tag !== null) {
      fastTag_default(term, tag, "2-prefix");
      term.confidence = 0.5;
      return true;
    }
  }
  return null;
};
var prefix_default = checkPrefix;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/2nd-pass/05-year.js
var min = 1400;
var max2 = 2100;
var possessive2 = /^[0-9]{4}'s$/;
var beforeDecade = toSet("the early mid late");
var dateWords = toSet("in on by until since for to during throughout through within before after of this next last circa around post pre budget classic plan may");
var seemsFine = (term) => term && hasAny(term, Date, Month, WeekDay, Year);
var seemsGood = function(term) {
  if (!term) {
    return false;
  }
  const str = term.normal || term.implicit;
  if (dateWords.has(str)) {
    return true;
  }
  if (seemsFine(term)) {
    return true;
  }
  if (term.tags.has(Prop)) {
    return true;
  }
  return false;
};
var seemsOkay = function(term) {
  if (!term) {
    return false;
  }
  if (term.tags.has(Ord)) {
    return true;
  }
  if (term.tags.has(Card) && term.normal.length < 3) {
    return true;
  }
  if (term.normal === "is" || term.normal === "was") {
    return true;
  }
  return false;
};
var tagPossessive = function(terms, i3) {
  const num = parseInt(terms[i3].normal, 10);
  if (num <= min || num >= max2) {
    return null;
  }
  if (num % 10 === 0 && (num < 2e3 || beforeDecade.has(terms[i3 - 1]?.normal))) {
    return null;
  }
  return fastTag_default(terms[i3], [Val, Card, Numeric, Year, Date], "2-tagYear-possessive");
};
var tagYear = function(terms, i3) {
  const term = terms[i3];
  if (term.normal.length === 6 && possessive2.test(term.normal)) {
    return tagPossessive(terms, i3);
  }
  if (term.tags.has(Numeric) && term.tags.has(Card) && term.normal.length === 4) {
    const num = Number(term.normal);
    if (num && !isNaN(num)) {
      if (num > min && num < max2) {
        const lastTerm = terms[i3 - 1];
        const nextTerm = terms[i3 + 1];
        if (seemsGood(lastTerm) || seemsGood(nextTerm)) {
          return fastTag_default(term, Year, "2-tagYear");
        }
        if (num >= 1920 && num < 2025) {
          if (seemsOkay(lastTerm) || seemsOkay(nextTerm)) {
            return fastTag_default(term, Year, "2-tagYear-close");
          }
          if (seemsFine(terms[i3 - 2]) || seemsFine(terms[i3 + 2])) {
            return fastTag_default(term, Year, "2-tagYear-far");
          }
          if (lastTerm && hasAny(lastTerm, Det, Poss)) {
            if (nextTerm && nextTerm.tags.has(NN) && !nextTerm.tags.has(Plur)) {
              return fastTag_default(term, Year, "2-tagYear-noun");
            }
          }
        }
      }
    }
  }
  return null;
};
var year_default = tagYear;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/07-verb-type.js
var verbType = function(terms, i3, model5, world2) {
  const term = terms[i3];
  const types = [Past, Pres, Aux, Mod, "Particle"];
  if (term.tags.has(Vb)) {
    const type = types.find((typ) => term.tags.has(typ));
    if (!type) {
      setTag2([term], Inf, world2, `2-verb-type''`);
    }
  }
};
var verb_type_default = verbType;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/_words.js
var never2 = toSet("that there let here everywhere he she it");
var afterVerb = toSet("gonna gotta got been");
var joiners = toSet("and or nor but & of per");
var beforePossessive = toSet("in by for of at with to on from about into");
var decade = /^[0-9]{1,3}0['’]s$/;
var isDecade = (term) => !term.tags.has("Year") && decade.test(term.normal);

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/00-possessive.js
var apostropheS = /'s$/;
var hasBreak = /[,;:]/;
var isName = (term, t) => term.tags.has(Prop) && t?.tags.has(Prop) === true && !hasBreak.test(t.post);
var isLead = (t) => t?.tags.has(Det) === true || t?.tags.has(Poss) === true && t.tags.has(Pron);
var possessive3 = function(terms, i3, world2) {
  const term = terms[i3];
  if (!apostropheS.test(term.normal) || term.implicit || term.tags.has(Poss) || term.tags.has(QW)) {
    return;
  }
  if (isDecade(term)) {
    return;
  }
  if (never2.has(term.normal.slice(0, -2))) {
    return;
  }
  const next = terms[i3 + 1];
  if (next && afterVerb.has(next.normal)) {
    return;
  }
  let found = !next || hasBreak.test(term.post);
  if (next) {
    found ||= joiners.has(next.normal) || next.tags.has(Val);
    found ||= next.tags.has(Sup) && next.normal !== "most" && !term.tags.has(First);
  }
  let n2 = i3 - 1;
  if (isName(term, terms[n2])) {
    n2 -= 1;
  }
  if (isName(term, terms[n2])) {
    n2 -= 1;
  }
  if (terms[n2 - 1] && isLead(terms[n2])) {
    n2 -= 1;
  }
  found ||= terms[n2] !== void 0 && beforePossessive.has(terms[n2].normal);
  if (!found) {
    return;
  }
  if (term.tags.has(Year)) {
    term.tags.add(Poss);
    return;
  }
  world2.methods.one.setTag([term], Poss, world2, null, "2-possessive");
};
var possessive_default = possessive3;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/00-attributive.js
var reason5 = "3-attributive";
var describing = toSet("still only very further");
var demonstrative = toSet("this that these those");
var notThing = [Adj, Adv, Ger, Val, Det, Prep, Conj, Pron, Neg];
var attributive = function(terms, i3, model5) {
  const term = terms[i3];
  const before2 = terms[i3 - 1];
  const after = terms[i3 + 1];
  if (!before2 || !after || !describing.has(term.normal) || demonstrative.has(before2.normal)) {
    return;
  }
  if (!hasAny(before2, Det, Poss)) {
    return;
  }
  const form = after.switch || "";
  const isVerb = after.tags.has(Vb) && !form.includes(NN) && !form.includes(Plur);
  if (isVerb || hasAny(after, ...notThing)) {
    return;
  }
  unTag_default([term], Adv, model5.one.tagSet, reason5);
  fastTag_default(term, Adj, reason5);
};
var attributive_default = attributive;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/01-acronym.js
var oneLetterAcronym = /^[A-Z]('s|,)?$/;
var isUpperCase = /^[A-Z-]+$/;
var upperThenS = /^[A-Z]+s$/;
var periodAcronym = /^([A-Z]\.)+[A-Z]?,?$/;
var noPeriodAcronym = /^[A-Z]{2,}('s|,)?$/;
var lowerCaseAcronym = /^([a-z]\.)+[a-z]\.?$/;
var oneLetterWord = toSet("I A");
var places = toSet("la ny us dc gb uk");
var isNoPeriodAcronym = function(term, model5) {
  let str = term.text;
  if (!isUpperCase.test(str)) {
    if (str.length > 3 && upperThenS.test(str)) {
      str = str.replace(/s$/, "");
    } else {
      return false;
    }
  } else if (places.has(term.normal)) {
    return true;
  }
  if (str.length > 5) {
    return false;
  }
  if (oneLetterWord.has(str)) {
    return false;
  }
  if (Object.hasOwn(model5.one.lexicon, term.normal)) {
    return false;
  }
  if (periodAcronym.test(str)) {
    return true;
  }
  if (lowerCaseAcronym.test(str)) {
    return true;
  }
  if (oneLetterAcronym.test(str)) {
    return true;
  }
  if (noPeriodAcronym.test(str)) {
    return true;
  }
  return false;
};
var reason6 = "3-acronym";
var toAcronym = (term, model5) => {
  unTag_default([term], "*", model5.one.tagSet, reason6);
  fastTag_default(term, [Acronym, NN], reason6);
};
var isAcronym3 = function(terms, i3, model5) {
  const term = terms[i3];
  if (hasAny(term, RomanNumeral, Acronym) || term.frozen) {
    return null;
  }
  if (isNoPeriodAcronym(term, model5)) {
    toAcronym(term, model5);
    if (places.has(term.normal)) {
      fastTag_default(term, Place, reason6);
    }
    if (upperThenS.test(term.text)) {
      fastTag_default(term, Plur, reason6);
    }
    return true;
  }
  if (!oneLetterWord.has(term.text) && oneLetterAcronym.test(term.text)) {
    toAcronym(term, model5);
    return true;
  }
  if (term.tags.has(Org) && term.text.length <= 3) {
    fastTag_default(term, Acronym, reason6);
    return true;
  }
  if (term.tags.has(Org) && isUpperCase.test(term.text) && term.text.length <= 6) {
    fastTag_default(term, Acronym, reason6);
    return true;
  }
  return null;
};
var acronym_default = isAcronym3;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/02-neighbours.js
var lookAtWord = (term, words2) => {
  if (term && Object.hasOwn(words2, term.normal)) {
    return words2[term.normal];
  }
  return null;
};
var lookAtTag = (term, tags) => {
  if (!term) {
    return null;
  }
  const found = Object.keys(tags).find((tag) => term.tags.has(tag));
  if (found) {
    return tags[found];
  }
  return null;
};
var neighbours = function(terms, i3, model5) {
  const { leftTags, leftWords, rightWords, rightTags } = model5.two.neighbours;
  const term = terms[i3];
  if (term.tags.size === 0) {
    let tag = null;
    tag ||= lookAtWord(terms[i3 - 1], leftWords);
    tag ||= lookAtWord(terms[i3 + 1], rightWords);
    tag ||= lookAtTag(terms[i3 - 1], leftTags);
    tag ||= lookAtTag(terms[i3 + 1], rightTags);
    if (tag) {
      fastTag_default(term, tag, "3-[neighbour]");
      fillTags_default(terms, i3, model5);
      terms[i3].confidence = 0.2;
      return true;
    }
  }
  return null;
};
var neighbours_default2 = neighbours;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/03-orgWords.js
var reason7 = "3-org-word";
var isOrg = function(term, i3, yelling) {
  if (!term) {
    return false;
  }
  if (hasAny(term, First, Place)) {
    return false;
  }
  if (hasAny(term, Prop, Org, Acronym)) {
    return true;
  }
  return isTitleWord(term, i3, yelling);
};
var tagOrgs = function(terms, i3, world2, yelling) {
  const orgWords = world2.model.two.orgWords;
  const term = terms[i3];
  const str = term.machine || term.normal;
  if (orgWords[str] === true && isOrg(terms[i3 - 1], i3 - 1, yelling)) {
    setTag2([terms[i3]], Org, world2, reason7);
    for (let t = i3; t >= 0; t -= 1) {
      if (isOrg(terms[t], t, yelling)) {
        setTag2([terms[t]], Org, world2, reason7);
      } else {
        break;
      }
    }
  }
  return null;
};
var orgWords_default2 = tagOrgs;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/04-placeWords.js
var reason8 = "3-place-word";
var isPossessive = /'s$/;
var placeCont = toSet("athletic city community eastern federal financial great historic historical local memorial municipal national northern provincial southern state western spring pine sunset view oak maple spruce cedar willow");
var noBefore = toSet("center centre way range bar bridge field pit");
var isPlace = function(term, i3, yelling) {
  if (!term) {
    return false;
  }
  if (hasAny(term, Org, Poss) || isPossessive.test(term.normal)) {
    return false;
  }
  if (hasAny(term, Prop, Place)) {
    return true;
  }
  return isTitleWord(term, i3, yelling);
};
var tagOrgs2 = function(terms, i3, world2, yelling) {
  const placeWords = world2.model.two.placeWords;
  const term = terms[i3];
  const str = term.machine || term.normal;
  if (placeWords[str] === true) {
    for (let n2 = i3 - 1; n2 >= 0; n2 -= 1) {
      if (placeCont.has(terms[n2].normal)) {
        continue;
      }
      if (isPlace(terms[n2], n2, yelling)) {
        setTag2(terms.slice(n2, i3 + 1), Place, world2, reason8);
        continue;
      }
      break;
    }
    if (noBefore.has(str)) {
      return false;
    }
    for (let n2 = i3 + 1; n2 < terms.length; n2 += 1) {
      if (isPlace(terms[n2], n2, yelling)) {
        setTag2(terms.slice(i3, n2 + 1), Place, world2, reason8);
        return true;
      }
      if (terms[n2].normal === "of" || placeCont.has(terms[n2].normal)) {
        continue;
      }
      break;
    }
  }
  return null;
};
var placeWords_default2 = tagOrgs2;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/05-fallback.js
var nounFallback = function(terms, i3, model5) {
  let isEmpty = false;
  const tags = terms[i3].tags;
  if (tags.size === 0) {
    isEmpty = true;
  } else if (tags.size === 1) {
    if (tags.has(Hyphenated) || tags.has(HashTag) || tags.has(Prefix) || tags.has(SlashedTerm)) {
      isEmpty = true;
    }
  }
  if (isEmpty) {
    fastTag_default(terms[i3], NN, "3-[fallback]");
    fillTags_default(terms, i3, model5);
    terms[i3].confidence = 0.1;
  }
};
var fallback_default = nounFallback;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/_adhoc.js
var isTitleCase2 = /^[A-Z][a-z]/;
var hasPunct = /[^\s-]/;
var isCapital = (terms, i3) => {
  if (terms[i3].tags.has(Prop) && isTitleCase2.test(terms[i3].text)) {
    return NN;
  }
  return null;
};
var isAlone = (terms, i3, tag) => {
  if (i3 === 0 && !terms[1]) {
    return tag;
  }
  return null;
};
var isEndNoun = function(terms, i3) {
  if (!terms[i3 + 1] && terms[i3 - 1] && terms[i3 - 1].tags.has(Det)) {
    return NN;
  }
  return null;
};
var isStart = function(terms, i3, tag) {
  if (i3 === 0 && terms.length > 3) {
    return tag;
  }
  return null;
};
var questionWords = toSet("why when where how");
var doForms = toSet("do does did");
var isQuestionVerb = (terms, i3) => {
  let n2 = questionWords.has(terms[0].normal) ? 1 : 0;
  if (n2 === 0 && !terms[terms.length - 1].post.includes("?")) {
    return null;
  }
  const auxiliary2 = terms[n2];
  if (!auxiliary2 || !doForms.has(auxiliary2.normal) && !auxiliary2.tags.has(Mod)) {
    return null;
  }
  n2 += 1;
  if (terms[n2] && hasAny(terms[n2], Det, Poss)) {
    n2 += 1;
    for (; n2 < i3 && hasAny(terms[n2], Adj, Adv); n2 += 1) {
    }
  }
  if (n2 >= i3 || !terms[n2]?.tags.has(NN)) {
    return null;
  }
  n2 += 1;
  for (; n2 < i3 && hasAny(terms[n2], Adv, Neg); n2 += 1) {
  }
  if (n2 !== i3 || terms.slice(i3 + 1).some((t) => !hasAny(t, Adv, Date))) {
    return null;
  }
  return Inf;
};
var singularDet = toSet("a an this that each every another");
var isNounLike = (term) => hasAny(term, NN, Time) || term.switch === AdjNoun;
var isSingularSubject = (terms, i3) => {
  if (terms[i3 + 1] || !terms[i3 - 1] || !isNounLike(terms[i3 - 1])) {
    return null;
  }
  for (let n2 = i3 - 1; n2 >= 0; n2 -= 1) {
    const term = terms[n2];
    if (hasPunct.test(term.post)) {
      return null;
    }
    if (singularDet.has(term.normal)) {
      return Pres;
    }
    if (term.normal.endsWith("'s") || term.normal === "couple" || term.tags.has("Duration")) {
      return null;
    }
    if (term.switch === NounGerund && terms[n2 - 1]?.tags.has(NN)) {
      return null;
    }
    if (!isNounLike(term) && !hasAny(term, Adj, Adv)) {
      return null;
    }
  }
  return null;
};
var isPluralCompound = (terms, i3) => {
  const prev = terms[i3 - 1];
  if (!terms[i3 + 1] && prev?.tags.has(Plur) && !prev.tags.has(Prop) && !hasPunct.test(prev.post)) {
    return Plur;
  }
  return null;
};
var isBeforeAre = (terms, i3) => {
  const prev = terms[i3 - 1];
  const hasSubject2 = prev?.tags.has(Pron) && !prev.tags.has(Poss);
  if (/^(are|were)$/.test(terms[i3 + 1]?.normal) && !hasSubject2) {
    return Plur;
  }
  return null;
};
var isSubjectNoun = (terms, i3) => {
  if (singularDet.has(terms[i3 - 1]?.normal) && terms[i3 + 1]?.switch === PluralVerb && !terms[i3 + 2]) {
    return NN;
  }
  return null;
};
var verbAdverb = /^(really|truly|still|always|quite|badly|deeply|totally|rather|mostly|profoundly)$/;
var nominative = /^(i|he|she|we|they)$/;
var isAfterSubject = (terms, i3, n2) => {
  const subject2 = terms[n2];
  if (!verbAdverb.test(terms[i3 - 1]?.normal) || !subject2?.tags.has(NN) || subject2.tags.has(Poss)) {
    return null;
  }
  if (subject2.normal.includes("'") || /^(me|him|us|them)$/.test(subject2.normal)) {
    return null;
  }
  let isComplement = terms.slice(0, n2).some((t) => t.tags.has(Vb) || t.normal === "with");
  const next = terms[i3 + 1];
  isComplement ||= next?.tags.has(Mod) || next?.normal === "about";
  if (nominative.test(subject2.normal)) {
    const skip = terms[n2 - 1]?.tags.has(Neg) ? 2 : 1;
    isComplement = terms[n2 - skip]?.tags.has(Cop);
  }
  return isComplement ? null : Past;
};
var adhoc = {
  [AdjGerund]: isCapital,
  [AdjNoun]: (terms, i3) => {
    return isCapital(terms, i3) || isEndNoun(terms, i3) || isSubjectNoun(terms, i3);
  },
  [ActorVerb]: isCapital,
  [AdjPast]: (terms, i3) => {
    let before2 = i3 - 1;
    for (; before2 >= 0; before2 -= 1) {
      const term = terms[before2];
      const isAdverb = term.tags.has(Adv) || term.normal === "since" || term.normal === "still";
      if (!isAdverb && !term.tags.has(Neg)) {
        break;
      }
    }
    if (/^(have|has|had)$/.test(terms[before2]?.normal)) {
      return Past;
    }
    return isAfterSubject(terms, i3, before2) || isCapital(terms, i3);
  },
  [AdjPresent]: (terms, i3) => {
    let before2 = i3 - 1;
    if (terms[before2]?.tags.has(Neg)) {
      before2 -= 1;
    }
    if (terms[before2]?.tags.has(Cop)) {
      return Adj;
    }
    return isCapital(terms, i3);
  },
  [NounGerund]: isCapital,
  [NounVerb]: (terms, i3) => {
    const adverb = terms[i3 - 1]?.normal;
    const owner = terms[i3 - 2];
    const isOwned = adverb === "still" && owner?.normal.endsWith("'s");
    if ((adverb === "even" || adverb === "still") && owner?.tags.has(Det) || isOwned) {
      return Sing;
    }
    return isQuestionVerb(terms, i3) || i3 > 0 && isCapital(terms, i3) || isAlone(terms, i3, Inf);
  },
  [PluralVerb]: (terms, i3) => {
    const subject2 = terms[i3 - 2]?.normal;
    if (terms[i3 - 1]?.normal === "still" && (subject2 === "this" || subject2 === "that")) {
      return Pres;
    }
    if (terms[i3 - 1]?.normal === "still" && (subject2 === "these" || subject2 === "those")) {
      return Plur;
    }
    return isCapital(terms, i3) || isSingularSubject(terms, i3) || isPluralCompound(terms, i3) || isBeforeAre(terms, i3) || isAlone(terms, i3, Pres) || isStart(terms, i3, Plur);
  },
  [PersonNoun]: (terms, i3) => {
    const before2 = terms[i3 - 1];
    if (before2 && hasAny(before2, Det, Poss)) {
      return Sing;
    }
    if (isTitleCase2.test(terms[i3].text)) {
      if (i3 > 0 || terms[i3 + 1]?.tags.has(Vb) && !terms[i3 + 1].tags.has(Cop) && terms[i3 + 2]?.tags.has(Pron)) {
        return Pers;
      }
    }
    return null;
  },
  [PersonVerb]: (terms, i3) => {
    if (i3 !== 0) {
      return isCapital(terms, i3);
    }
    return null;
  },
  [PersonAdj]: (terms, i3) => {
    if (i3 === 0 && terms.length > 1) {
      return Pers;
    }
    return isCapital(terms, i3) ? Pers : null;
  }
};
var adhoc_default = adhoc;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/06-switches.js
var prefix5 = /^(under|over|mis|re|un|dis|semi)-?/;
var checkWord = (term, obj) => {
  if (!term || !obj) {
    return null;
  }
  const str = term.normal || term.implicit;
  let found = null;
  if (Object.hasOwn(obj, str)) {
    found = obj[str];
  }
  return found;
};
var checkTag = (term, obj = {}, tagSet) => {
  if (!term || !obj) {
    return null;
  }
  let found;
  let best = -1;
  for (const tag of term.tags) {
    if (obj[tag]) {
      const rank2 = tagSet[tag] ? tagSet[tag].parents.length : 0;
      if (rank2 > best) {
        found = tag;
        best = rank2;
      }
    }
  }
  found = obj[found];
  return found;
};
var pickTag = function(terms, i3, clues3, model5) {
  if (!clues3) {
    return null;
  }
  let beforeIndex = i3 - 1;
  const previousTerm = terms[beforeIndex];
  if (previousTerm && previousTerm.text === "also") {
    beforeIndex = Math.max(0, i3 - 2);
  }
  if (previousTerm?.normal === "each" && /^(we|they)$/.test(terms[i3 - 2]?.normal)) {
    beforeIndex = i3 - 2;
  }
  const tagSet = model5.one.tagSet;
  let tag = checkWord(terms[i3 + 1], clues3.afterWords);
  tag ||= checkWord(terms[beforeIndex], clues3.beforeWords);
  tag ||= checkTag(terms[beforeIndex], clues3.beforeTags, tagSet);
  tag ||= checkTag(terms[i3 + 1], clues3.afterTags, tagSet);
  return tag;
};
var doSwitches = function(terms, i3, world2) {
  const term = terms[i3];
  if (!term.switch) {
    return;
  }
  const model5 = world2.model;
  const { switches: switches2, clues: clues3 } = model5.two;
  let str = term.normal || term.implicit || "";
  if (prefix5.test(str) && !switches2[str]) {
    str = str.replace(prefix5, "");
  }
  const form = term.switch;
  if (hasAny(term, Acronym, Phrasal, SportsTeam)) {
    return;
  }
  let tag = pickTag(terms, i3, clues3[form], model5);
  if (adhoc_default[form]) {
    tag = adhoc_default[form](terms, i3) || tag;
  }
  if (form === ActorVerb && tag === Sing) {
    tag = Actor;
  }
  if (form === PersonNoun && tag === Sing && looksPlural_default(str)) {
    tag = Plur;
  }
  if (str === "drew" && (tag === Vb || tag === Inf || tag === Pres)) {
    tag = Past;
  }
  if (tag) {
    setTag2([term], tag, world2, `3-[switch] (${form})`);
    fillTags_default(terms, i3, model5);
  }
};
var switches_default = doSwitches;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/08-imperative.js
var beside = toSet("there this it him her us");
var howWords = toSet("hard high fast slow");
var notHow = toSet("so such rather enough");
var reason9 = "3-[imperative]";
var imperative = function(terms, world2) {
  const t = terms[0];
  const next = terms[1];
  if (terms.length === 2 && t.tags.has(Inf) && !t.tags.has(Hyphenated) && !notHow.has(next.normal)) {
    if (hasAny(next, Adj, Adv) || howWords.has(next.normal)) {
      setTag2([t], Imp, world2, reason9);
      return;
    }
  }
  const goTo = t.normal === "go" && next?.normal === "to" && terms.length >= 3;
  const keepIt = t.normal === "keep" && next?.normal === "it" && terms[2]?.tags.has(Adj);
  if (goTo || keepIt) {
    setTag2([t], Imp, world2, reason9);
    return;
  }
  const multiWords = world2.model.one._multiCache || {};
  const isRight = t.switch === NounVerb || t.tags.has(Inf);
  if (isRight && terms.length >= 2) {
    if (terms.length < 4 && !beside.has(terms[1].normal)) {
      return;
    }
    if (!t.tags.has(Phrasal) && Object.hasOwn(multiWords, t.normal)) {
      return;
    }
    if (hasAny(terms[1], NN, Det)) {
      const soonVerb = terms.slice(1, 3).some((term) => term.tags.has(Vb));
      if (!soonVerb || t.tags.has("#PhrV")) {
        setTag2([t], Imp, world2, reason9);
      }
    }
  }
};
var imperative_default = imperative;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/09-first-word.js
var reason10 = "3-[first-word]";
var expressions = {
  beforeAdj: toSet("well so okay now"),
  withComma: toSet("shoot say like")
};
var firstWord = function(terms, world2) {
  const str = terms[0].normal;
  if (expressions.beforeAdj.has(str)) {
    if (terms[1] && !terms[1].tags.has(Adj)) {
      setTag2([terms[0]], Expr, world2, reason10);
    }
    if (terms.length === 1) {
      setTag2([terms[0]], Expr, world2, reason10);
    }
  }
  if (expressions.withComma.has(str)) {
    if (/,/.test(terms[0].post)) {
      setTag2([terms[0]], Expr, world2, reason10);
    }
  }
};
var first_word_default = firstWord;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/3rd-pass/10-ambig-date.js
var reason11 = "3-[ambig-date]";
var thisNext = toSet("this next last");
var toDate = toSet("this that next last");
var direction = toSet("up down back toward");
var has2 = (term, ...tags) => Boolean(term) && hasAny(term, ...tags);
var isLink = (term) => has2(term, Conj, Prep);
var isVerbAfter = (term, orPron) => has2(term, Inf) || term?.normal === "have" || term?.normal === "not" || orPron && has2(term, Pron);
var modalAfter = (terms, i3, orPron) => isVerbAfter(terms[i3 + 1], orPron) || has2(terms[i3 + 1], Adv) && isVerbAfter(terms[i3 + 2], orPron);
var hasSubject = (prev, term, orDet) => !titleCase3.test(term.text) && (has2(prev, Pron, Plur) || orDet && has2(prev, Det));
var ambigDate = function(terms, i3, world2) {
  const term = terms[i3];
  const isMay = term.normal === "may";
  if (!isMay && term.normal !== "march") {
    return;
  }
  const prev = terms[i3 - 1];
  const next = terms[i3 + 1];
  const dates = [];
  let month2 = false;
  if (prev && thisNext.has(prev.normal)) {
    const verb = isMay ? modalAfter(terms, i3) : has2(next, Inf);
    if (!verb) {
      month2 = true;
      dates.push(prev);
    }
  }
  if (!hasSubject(prev, term)) {
    let value = next;
    if (next?.normal === "the") {
      value = terms[i3 + 2];
    }
    if (has2(value, Val)) {
      month2 = true;
      dates.push(next, value);
    }
  }
  if (prev?.normal === "of" && has2(terms[i3 - 2], Val)) {
    month2 = true;
    dates.push(terms[i3 - 2], prev);
  }
  if (has2(prev, Numeric) && !(isMay && modalAfter(terms, i3))) {
    month2 = true;
    dates.push(prev);
  }
  if (!hasSubject(prev, term, true)) {
    let date2 = next;
    if (next && !has2(next, Date) && (isLink(next) || toDate.has(next.normal))) {
      date2 = terms[i3 + 2];
    }
    month2 ||= has2(date2, Date);
  }
  let date = prev;
  if (prev && !has2(prev, Date) && isLink(prev)) {
    date = terms[i3 - 2];
  }
  if (has2(date, Date) && !(isMay && modalAfter(terms, i3, true))) {
    month2 = true;
  }
  if (month2) {
    setTag2(dates, Date, world2, reason11);
    setTag2([term], Month, world2, reason11);
  } else if (!isMay && !has2(term, Date) && next && direction.has(next.normal)) {
    setTag2([term], Inf, world2, reason11);
  }
};
var ambig_date_default = ambigDate;

// ../../node_modules/compromise/src/2-two/preTagger/compute/tagger/index.js
var ignoreCase = function(terms) {
  if (terms.filter((t) => !t.tags.has(Prop)).length <= 3) {
    return false;
  }
  const lowerCase = /^[a-z]/;
  return terms.every((t) => !lowerCase.test(t.text));
};
var firstPass = function(docs, model5, world2) {
  docs.forEach((terms) => {
    colons_default(terms, 0, model5, world2);
  });
};
var secondPass = function(terms, model5, world2, isYelling) {
  for (let i3 = 0; i3 < terms.length; i3 += 1) {
    if (terms[i3].frozen) {
      continue;
    }
    tagSwitch_default(terms, i3, model5);
    spokenYear_default2(terms, i3);
    if (!isYelling) {
      case_default2(terms, i3, model5);
    }
    suffix_default(terms, i3, model5);
    regex_default(terms, i3, model5, world2);
    prefix_default(terms, i3, model5);
    year_default(terms, i3, model5);
  }
};
var thirdPass = function(terms, model5, world2, isYelling) {
  for (let i3 = 0; i3 < terms.length; i3 += 1) {
    attributive_default(terms, i3, model5);
    let found = acronym_default(terms, i3, model5);
    fillTags_default(terms, i3, model5);
    found ||= neighbours_default2(terms, i3, model5);
    found ||= fallback_default(terms, i3, model5);
    possessive_default(terms, i3, world2);
  }
  for (let i3 = 0; i3 < terms.length; i3 += 1) {
    if (terms[i3].frozen) {
      continue;
    }
    orgWords_default2(terms, i3, world2, isYelling);
    placeWords_default2(terms, i3, world2, isYelling);
    switches_default(terms, i3, world2);
    verb_type_default(terms, i3, model5, world2);
    hyphens_default(terms, i3, model5, world2);
    ambig_date_default(terms, i3, world2);
  }
  imperative_default(terms, world2);
  first_word_default(terms, world2);
};
var preTagger = function(view) {
  const { methods: methods20, model: model5, world: world2 } = view;
  const docs = view.docs;
  firstPass(docs, model5, world2);
  const document = methods20.two.quickSplit(docs);
  for (let n2 = 0; n2 < document.length; n2 += 1) {
    const terms = document[n2];
    const isYelling = ignoreCase(terms);
    secondPass(terms, model5, world2, isYelling);
    thirdPass(terms, model5, world2, isYelling);
  }
  return document;
};
var tagger_default2 = preTagger;

// ../../node_modules/compromise/src/2-two/preTagger/compute/root.js
var toInf = (str, world2, tense) => world2.methods.two.transform.verb.toInfinitive(str, world2.model, tense);
var toRoot = {
  // 'spencer's' -> 'spencer'
  Possessive: (str) => str.replace(/'s$/, ""),
  // 'drinks' -> 'drink'
  Plural: (str, world2) => world2.methods.two.transform.noun.toSingular(str, world2.model),
  Copula: () => "is",
  // 'walked' -> 'walk'
  PastTense: (str, world2) => toInf(str, world2, Past),
  // 'walking' -> 'walk'
  Gerund: (str, world2) => toInf(str, world2, Ger),
  // 'walks' -> 'walk'
  PresentTense: (str, world2, term) => term.tags.has(Inf) ? str : toInf(str, world2, Pres),
  // 'quieter' -> 'quiet'
  Comparative: (str, world2) => world2.methods.two.transform.adjective.fromComparative(str, world2.model),
  // 'quietest' -> 'quiet'
  Superlative: (str, world2) => world2.methods.two.transform.adjective.fromSuperlative(str, world2.model),
  // 'suddenly' -> 'sudden'
  Adverb: (str, world2) => world2.methods.two.transform.adjective.fromAdverb(str)
};
var getRoot = function(view) {
  const world2 = view.world;
  const keys3 = Object.keys(toRoot);
  lib_default(view.docs, (term) => {
    const key = keys3.find((k2) => term.tags.has(k2));
    if (key) {
      const str = term.machine || term.normal || term.text;
      const root = toRoot[key](str, world2, term);
      if (term.normal !== root) {
        term.root = root;
      }
    }
  });
};
var root_default = getRoot;

// ../../node_modules/compromise/src/2-two/preTagger/compute/penn.js
var mapping = {
  // adverbs
  // 'Comparative': 'RBR',
  // 'Superlative': 'RBS',
  Adverb: "RB",
  // adjectives
  Comparative: "JJR",
  Superlative: "JJS",
  Adjective: "JJ",
  TO: Conj,
  // verbs
  Modal: "MD",
  Auxiliary: "MD",
  Gerund: "VBG",
  //throwing
  PastTense: "VBD",
  //threw
  Participle: "VBN",
  //thrown
  PresentTense: "VBZ",
  //throws
  Infinitive: "VB",
  //throw
  Particle: "RP",
  //phrasal particle
  Verb: "VB",
  // throw
  // pronouns
  Pronoun: "PRP",
  // misc
  Cardinal: "CD",
  Conjunction: "CC",
  Determiner: "DT",
  Preposition: "IN",
  // 'Determiner': 'WDT',
  // 'Expression': 'FW',
  QuestionWord: "WP",
  Expression: "UH",
  //nouns
  Possessive: "POS",
  ProperNoun: "NNP",
  Person: "NNP",
  Place: "NNP",
  Organization: "NNP",
  Singular: "NN",
  Plural: "NNS",
  Noun: "NN",
  There: "EX"
  //'there'
  // 'Adverb':'WRB',
  // 'Noun':'PDT', //predeterminer
  // 'Noun':'NFP', //
  //  WDT 	Wh-determiner
  // 	WP 	Wh-pronoun
  // 	WP$ 	Possessive wh-pronoun
  // 	WRB 	Wh-adverb
};
var toPenn = function(term) {
  if (/^[*/+=<>|~^×÷±≠≤≥]+$/.test(term.text)) {
    return "SYM";
  }
  if (term.text === "$") {
    return "$";
  }
  if (term.text === "\xA3" || term.text === "#") {
    return "#";
  }
  if (term.tags.has(Prop) && term.tags.has(Plur)) {
    return "NNPS";
  }
  if (term.tags.has(Poss) && term.tags.has(Pron)) {
    return "PRP$";
  }
  if (term.normal === "there") {
    return "EX";
  }
  if (term.normal === "to") {
    return "TO";
  }
  const arr = term.tagRank || [];
  for (let i3 = 0; i3 < arr.length; i3 += 1) {
    if (Object.hasOwn(mapping, arr[i3])) {
      return mapping[arr[i3]];
    }
  }
  return null;
};
var pennTag = function(view) {
  view.compute("tagRank");
  lib_default(view.docs, (term) => {
    term.penn = toPenn(term);
  });
};
var penn_default = pennTag;

// ../../node_modules/compromise/src/2-two/preTagger/compute/index.js
var compute_default9 = { preTagger: tagger_default2, root: root_default, penn: penn_default };

// ../../node_modules/compromise/src/2-two/preTagger/plugin.js
var plugin_default14 = {
  compute: compute_default9,
  methods: methods_default9,
  model: model_default3,
  tags: tagSet_default,
  hooks: ["preTagger"]
};

// ../../node_modules/compromise/src/2-two/contraction-two/api/contract.js
var postPunct = /[,)"';:\-–—.…]/;
var contractTerms = function(terms, suffix3) {
  for (let i3 = 0; i3 < terms.length - 1; i3++) {
    const t = terms[i3];
    if (postPunct.test(t.post)) {
      return;
    }
  }
  terms[0].implicit = terms[0].normal;
  terms[0].text += suffix3;
  terms[0].normal += suffix3;
  terms.slice(1).forEach((t) => {
    t.implicit = t.normal;
    t.text = "";
    t.normal = "";
  });
  for (let i3 = 0; i3 < terms.length - 1; i3++) {
    terms[i3].post = terms[i3].post.replace(/ /, "");
  }
};
var setContraction = function(m3, suffix3) {
  m3.docs.forEach((terms) => contractTerms(terms, suffix3));
};
var contractions2 = [
  // we are -> we're
  ["(we|they|you) are", `'re`],
  // they will -> they'll
  ["(he|she|they|it|we|you) will", `'ll`],
  // she is -> she's
  ["(he|she|they|it|we) is", `'s`],
  // spencer is -> spencer's
  ["#Pers is", `'s`],
  // spencer would -> spencer'd
  ["#Pers would", `'d`],
  // would not -> wouldn't (skip words already contracted above, like he's)
  ["(is|was|were|had|would|should|could|do|does|did|have|has) not", `n't`, true],
  // can not -> can't
  ["can not", `'t`],
  // i have -> i've
  ["(i|we|they) have", `'ve`],
  // would have -> would've
  ["(would|should|could) have", `'ve`],
  // i am -> i'm
  ["i am", `'m`]
];
var contract = function() {
  const doc = this.not("@hasContraction");
  contractions2.forEach(([match2, suffix3, skipDone]) => {
    let m3 = doc.match(match2);
    if (skipDone) {
      m3 = m3.ifNo("@hasContraction");
    }
    setContraction(m3, suffix3);
  });
  return this;
};
var contract_default = contract;

// ../../node_modules/compromise/src/2-two/contraction-two/api/index.js
var titleCase4 = new RegExp("^['\u2019]?\\p{Lu}[\\p{Ll}'\u2019]", "u");
var toTitleCase2 = function(str = "") {
  str = str.replace(/^ *[a-z\u00C0-\u00FF]/, (x) => x.toUpperCase());
  return str;
};
var api3 = function(View2) {
  class Contractions extends View2 {
    /** i've -> 'i have' */
    expand() {
      this.docs.forEach((terms) => {
        const isTitleCase3 = titleCase4.test(terms[0].text);
        terms.forEach((t, i3) => {
          t.text = t.implicit || "";
          delete t.implicit;
          if (i3 < terms.length - 1 && t.post === "") {
            t.post += " ";
          }
          t.dirty = true;
        });
        if (isTitleCase3) {
          terms[0].text = toTitleCase2(terms[0].text);
        }
      });
      this.compute("normal");
      return this;
    }
  }
  Contractions.prototype.viewType = "Contraction";
  View2.prototype.contractions = function() {
    const m3 = this.match("@hasContraction+");
    return new Contractions(this.document, m3.pointer);
  };
  View2.prototype.contract = contract_default;
};
var api_default10 = api3;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/_splice.js
var insertContraction2 = function(document, point, words2) {
  const [n2, w] = point;
  if (!words2 || words2.length === 0) {
    return;
  }
  words2 = words2.map((word, i3) => {
    word.implicit = word.text;
    word.machine = word.text;
    word.pre = "";
    word.post = "";
    word.text = "";
    word.normal = "";
    word.index = [n2, w + i3];
    return word;
  });
  if (words2[0]) {
    words2[0].pre = document[n2][w].pre;
    words2[words2.length - 1].post = document[n2][w].post;
    words2[0].text = document[n2][w].text;
    words2[0].normal = document[n2][w].normal;
  }
  document[n2].splice(w, 1, ...words2);
};
var splice_default2 = insertContraction2;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/_lib.js
var { isUpperCase: isUpperCase2 } = termMethods_default;
var hasBreak2 = (term) => termMethods_default.hasComma(term) || termMethods_default.hasSemicolon(term) || termMethods_default.hasColon(term);
var isCapital2 = (term) => termMethods_default.isTitleCase(term) || isUpperCase2(term);
var hasApostrophe2 = /'/;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/apostrophe-s.js
var hasWords = toSet("been become got gotten gone come had left fallen arrived lived worked moved looked talked happened stayed appeared improved increased failed escaped expanded developed turned reacted responded listened agreed returned");
var isWords = toSet("what how when if too");
var adjLike = toSet("too also enough outside inside here there");
var passive = toSet("called supposed meant located allowed headed married");
var reported = toSet("said believed thought reported rumored estimated claimed");
var passivePrep = toSet("for by to from with as at in into around");
var isOrHas = (terms, i3) => {
  for (let o = i3 + 1; o < terms.length; o += 1) {
    const t = terms[o];
    if ((t.normal === "kind" || t.normal === "sort") && terms[o + 1] && terms[o + 1].normal === "of") {
      o += 1;
      continue;
    }
    if (hasWords.has(t.normal)) {
      return "has";
    }
    if (isWords.has(t.normal)) {
      return "is";
    }
    if (t.tags.has(Ger)) {
      return "is";
    }
    if (t.tags.has(Det)) {
      return "is";
    }
    if (t.tags.has(Adj)) {
      return "is";
    }
    const next = terms[o + 1];
    const two = terms[o + 2];
    if (reported.has(t.normal)) {
      if (terms[i3].normal === `it's` || next && next.normal === "to" && two && two.tags.has(Vb)) {
        return "is";
      }
      return "has";
    }
    if (passive.has(t.normal)) {
      const hasObject2 = next && (next.tags.has(Pron) || t.normal !== "called" && next.tags.has(Det));
      if (!hasObject2) {
        return "is";
      }
    }
    if (t.switch === AdjPast) {
      if (!next || hasBreak2(t) || next.tags.has(Conj)) {
        return "is";
      }
      if (adjLike.has(next.normal) || hasAny(next, Prep, Adv)) {
        return "is";
      }
      if (next.tags.has(Adj) && !(two && two.tags.has(NN))) {
        return "is";
      }
    }
    if (t.tags.has(Past)) {
      if (next && passivePrep.has(next.normal) && !(next.normal === "to" && two && two.tags.has(Vb))) {
        return "is";
      }
      return "has";
    }
    if (hasAny(t, NN, Prep, Conj)) {
      return "is";
    }
  }
  return "is";
};
var apostropheS2 = function(terms, i3) {
  const before2 = terms[i3].normal.split(hasApostrophe2)[0];
  if (before2 === "let") {
    return [before2, "us"];
  }
  const next = terms[i3 + 1];
  if (next && next.normal === "gotta" && next.implicit === "have") {
    const got = terms[i3 + 2];
    got.text = next.text;
    got.normal = next.normal;
    got.pre = next.pre;
    terms.splice(i3 + 1, 1);
    return [before2, "has"];
  }
  if (isOrHas(terms, i3) === "has") {
    return [before2, "has"];
  }
  return [before2, "is"];
};
var apostrophe_s_default = apostropheS2;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/apostrophe-d.js
var hadWords = toSet("better done before it had");
var wouldWords = toSet("have be");
var hadOrWould = (terms, i3) => {
  for (let o = i3 + 1; o < terms.length; o += 1) {
    const t = terms[o];
    if (hadWords.has(t.normal)) {
      return "had";
    }
    if (wouldWords.has(t.normal)) {
      return "would";
    }
    if (t.tags.has(Past) || t.switch === AdjPast) {
      return "had";
    }
    if (hasAny(t, Pres, Inf)) {
      return "would";
    }
    if (t.tags.has(Det) && !(terms[o + 1] && hasAny(terms[o + 1], Pres, Inf))) {
      return "had";
    }
    if (t.tags.has(Adj)) {
      return "would";
    }
  }
  return false;
};
var _apostropheD2 = function(terms, i3) {
  const before2 = terms[i3].normal.split(hasApostrophe2)[0];
  if (before2 === "how" || before2 === "what") {
    return [before2, "did"];
  }
  if (hadOrWould(terms, i3) === "had") {
    return [before2, "had"];
  }
  return [before2, "would"];
};
var apostrophe_d_default2 = _apostropheD2;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/apostrophe-t.js
var lastNoun = function(terms, i3) {
  for (let n2 = i3 - 1; n2 >= 0; n2 -= 1) {
    if (hasAny(terms[n2], NN, Pron, Plur, Sing)) {
      return terms[n2];
    }
  }
  return null;
};
var apostropheT2 = function(terms, i3) {
  const normal = terms[i3].normal;
  if (normal === "ain't" || normal === "aint") {
    const noun2 = lastNoun(terms, i3);
    const str = noun2 ? noun2.normal : "";
    const isPlural5 = str === "we" || str === "they" || str === "you" || noun2 !== null && noun2.tags.has(Plur);
    if (terms[i3 + 1] && terms[i3 + 1].normal === "never") {
      if (noun2 && !isPlural5 && str !== "i") {
        return ["has"];
      }
      return ["have"];
    }
    if (str === "i") {
      return ["am", "not"];
    }
    if (isPlural5) {
      return ["are", "not"];
    }
    return ["is", "not"];
  }
  const before2 = normal.replace(/n't/, "");
  return [before2, "not"];
};
var apostrophe_t_default2 = apostropheT2;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/isPossessive.js
var bareObject = toSet("dinner lunch breakfast supper work school college home here there");
var adjLike2 = toSet("too also enough about");
var nounLike = toSet("is are did were could should must had have");
var copulas2 = toSet("is are was were am");
var lightVerbs = toSet("made had done did took taken gave given saw seen went came said");
var reporting = toSet("said thought knew heard felt hoped guessed realized figured decided meant");
var isOneThing = (t) => {
  const isWord = Boolean(t) && !bareObject.has(t.normal) && !isUpperCase2(t);
  return isWord && t.tags.has(Sing) && !hasAny(t, Prop, Pron, Uncountable, Date);
};
var hasPredicate = (terms, n2) => {
  for (let k2 = n2; k2 < terms.length; k2 += 1) {
    const t = terms[k2];
    if (hasAny(t, Mod, Cop, Past, Pres) || k2 === n2 && t.normal === "of") {
      return true;
    }
    if (hasAny(t, Conj, Pron) || hasBreak2(t)) {
      return false;
    }
  }
  return false;
};
var isPossessive2 = (terms, i3) => {
  const term = terms[i3];
  const isPerson = hasAny(term, Pers, Actor);
  const nextTerm = terms[i3 + 1];
  if (term.normal === `it's`) {
    if (nextTerm && nextTerm.normal === "own") {
      return true;
    }
    const owned = Boolean(nextTerm) && (isOneThing(nextTerm) || nextTerm.tags.has(Inf)) && !hasAny(nextTerm, Ger, Cop);
    const two = terms[i3 + 2];
    const isClause = two && (two.tags.has(Pron) || two.normal === "to" || two.tags.has(Vb) && !hasAny(two, Cop, Mod));
    if (!owned || isClause) {
      return false;
    }
    const prev = terms[i3 - 1];
    if (prev && (prev.tags.has(Prep) || prev.tags.has(Past) && !reporting.has(prev.normal))) {
      return true;
    }
    return i3 === 0 && Boolean(two) && hasAny(two, Cop, Mod);
  }
  if (never2.has(term.machine || term.normal)) {
    return false;
  }
  if (term.tags.has(Poss)) {
    return true;
  }
  if (term.tags.has(QW)) {
    return false;
  }
  if (term.normal === `he's` || term.normal === `she's`) {
    return false;
  }
  if (!nextTerm) {
    return true;
  }
  if (i3 > 0 && i3 < 3 && terms[0].tags.has(Cop)) {
    return true;
  }
  if (afterVerb.has(nextTerm.normal)) {
    return false;
  }
  if (nextTerm.tags.has(Det) && isCapital2(nextTerm)) {
    return true;
  }
  const isName2 = (t) => term.tags.has(Prop) && t?.tags.has(Prop) === true && !hasBreak2(t);
  let n2 = i3 - 1;
  if (isName2(terms[n2])) {
    n2 -= 1;
  }
  if (isName2(terms[n2])) {
    n2 -= 1;
  }
  const lead = terms[n2];
  if (lead && terms[n2 - 1] && (lead.tags.has(Det) || lead.tags.has(Poss) && lead.tags.has(Pron))) {
    n2 -= 1;
  }
  if (terms[n2] && beforePossessive.has(terms[n2].normal)) {
    return true;
  }
  if (nextTerm.switch === NounGerund) {
    const next2 = terms[i3 + 2];
    if (!next2) {
      return hasAny(term, Actor, Prop);
    }
    const isVerb = hasAny(next2, Cop, Mod, Past);
    if (isVerb || isOneThing(next2) && hasPredicate(terms, i3 + 3)) {
      return true;
    }
    return false;
  }
  if (nextTerm.tags.has(Vb)) {
    if (copulas2.has(nextTerm.normal)) {
      return true;
    }
    if (nextTerm.tags.has(Inf)) {
      return true;
    }
    if (nextTerm.tags.has(Ger)) {
      return isOneThing(terms[i3 + 2]) && hasPredicate(terms, i3 + 3);
    }
    if (nextTerm.tags.has(Pres)) {
      return true;
    }
    const two = terms[i3 + 2];
    const three = terms[i3 + 3];
    if (two && nextTerm.tags.has(Past) && !lightVerbs.has(nextTerm.normal)) {
      const isThing = two.tags.has(NN) && !hasAny(two, Prop, Pron, Date);
      const needsVerb = i3 === 0 && two.tags.has(Plur) && !terms.some((t, k2) => k2 !== 1 && t.tags.has(Vb));
      const isMass = two.tags.has(Uncountable) && !(three && three.tags.has(NN));
      const canOwn = hasPredicate(terms, i3 + 3) || !isPerson && !isMass;
      if (isThing && !bareObject.has(two.normal) && !needsVerb && canOwn) {
        return true;
      }
      if (three && two.tags.has(Adj) && three.tags.has(NN) && !three.tags.has(Pron)) {
        return true;
      }
    }
    return false;
  }
  if (nextTerm.switch === AdjNoun) {
    const twoTerm = terms[i3 + 2];
    if (!twoTerm) {
      return false;
    }
    if (nounLike.has(twoTerm.normal)) {
      return true;
    }
    if (adjLike2.has(twoTerm.normal)) {
      return false;
    }
  }
  if (nextTerm.tags.has(NN)) {
    const nextStr = nextTerm.machine || nextTerm.normal;
    if (nextStr === "here" || nextStr === "there" || nextStr === "everywhere") {
      return false;
    }
    const isNoun = hasAny(nextTerm, Sing, Plur);
    if (nextTerm.tags.has(Poss) && !isNoun) {
      return false;
    }
    const isNamed = term.tags.has(Actor) || term.machine === "name";
    if (isNamed && nextTerm.tags.has(Pers) && nextTerm.tags.has(Prop) && !terms[i3 + 2]) {
      return false;
    }
    return true;
  }
  const isAdv = nextTerm.tags.has(Adv);
  if (nextTerm.tags.has(Adj) || isAdv) {
    const two = terms[i3 + 2];
    if (nextTerm.normal === "busy" && two && (two.tags.has(Ger) || two.switch === NounGerund)) {
      return false;
    }
    const isMore = (k2) => {
      const t = terms[k2];
      const after = terms[k2 + 1];
      if (hasAny(t, Adj, Ord)) {
        return true;
      }
      if (!after) {
        return false;
      }
      if (["and", "or", "&"].includes(t.normal)) {
        return after.tags.has(Adj);
      }
      if (t.tags.has(Ger)) {
        return after.tags.has(NN) && hasPredicate(terms, k2 + 2);
      }
      const isPast = t.tags.has(Past) && !lightVerbs.has(t.normal);
      return isAdv && isPast && isOneThing(after) && (!isPerson || hasPredicate(terms, k2 + 2));
    };
    let o = i3 + 2;
    while (o < i3 + 4 && terms[o] && isMore(o)) {
      o += 1;
    }
    const twoTerm = terms[o];
    if (!twoTerm) {
      return false;
    }
    if (isAdv && o === i3 + 2 && nextTerm.normal !== "only") {
      const three = terms[o + 1];
      return isOneThing(twoTerm) && Boolean(three) && hasAny(three, Mod, Cop, Past);
    }
    if (nextTerm.normal === "only" && twoTerm.normal === "human") {
      return false;
    }
    const isVerb = hasAny(twoTerm, Mod, Past, Cop) || twoTerm.normal === "have";
    if (!isAdv && o === i3 + 2 && isVerb && !twoTerm.implicit) {
      return true;
    }
    if (twoTerm.tags.has(NN) && !twoTerm.tags.has(Pron) && twoTerm.normal !== "here" && twoTerm.normal !== "there") {
      const str = nextTerm.normal;
      if (str === "above" || str === "below" || str === "behind") {
        return false;
      }
      return true;
    }
    if (twoTerm.switch === NounVerb) {
      return true;
    }
    return false;
  }
  return false;
};
var isPossessive_default = isPossessive2;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/wanna.js
var hasObject = (term) => term && hasAny(term, Det, Pron, Poss);
var wannaNoun = function(terms, i3) {
  if (terms[i3].normal !== "wanna") {
    return false;
  }
  const to = terms[i3 + 1];
  const next = terms[i3 + 2];
  if (!to || to.implicit !== "to" || !next) {
    return false;
  }
  if (hasAny(next, Vb, Adv)) {
    return false;
  }
  if (hasObject(terms[i3 + 3])) {
    return false;
  }
  terms[i3].post = to.post;
  terms.splice(i3 + 1, 1);
  return true;
};
var wanna_default = wannaNoun;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/there-are.js
var thereAre = function(terms, i3) {
  const term = terms[i3];
  if (term.normal !== `there's` || term.implicit !== "there") {
    return false;
  }
  const is = terms[i3 + 1];
  const next = terms[i3 + 2];
  if (!is || is.implicit !== "is" || !next || !next.tags.has(Plur)) {
    return false;
  }
  is.implicit = "are";
  is.machine = "are";
  return true;
};
var there_are_default = thereAre;

// ../../node_modules/compromise/src/2-two/contraction-two/compute/index.js
var reason12 = "2-contraction";
var reIndex2 = function(terms) {
  terms.forEach((t, i3) => {
    if (t.index) {
      t.index[1] = i3;
    }
  });
};
var reTag = function(terms, view, start2, len) {
  const tmp = view.update();
  tmp.document = [terms];
  let end2 = start2 + len;
  if (start2 > 0) {
    start2 -= 1;
  }
  if (terms[end2]) {
    end2 += 1;
  }
  tmp.ptrs = [[0, start2, end2]];
  tmp.compute(["freeze", "lexicon", "preTagger", "unfreeze"]);
  reIndex2(terms);
};
var byEnd2 = {
  // how'd
  d: apostrophe_d_default2,
  // we ain't
  t: apostrophe_t_default2,
  // bob's
  s: (terms, i3, world2) => {
    if (isDecade(terms[i3])) {
      return null;
    }
    if (isPossessive_default(terms, i3)) {
      contractions_debug_default(terms[i3]);
      if (terms[i3].tags.has(Year)) {
        terms[i3].tags.add(Poss);
        return null;
      }
      return setTag2([terms[i3]], Poss, world2, reason12);
    }
    return apostrophe_s_default(terms, i3);
  }
};
var toDocs = function(words2, view, term) {
  contractions_debug_default(term, words2);
  const doc = view.fromText(words2.join(" "));
  doc.compute("id");
  return doc.docs[0];
};
var contractionTwo = (view) => {
  const { world: world2, document } = view;
  document.forEach((terms, n2) => {
    for (let i3 = terms.length - 1; i3 >= 0; i3 -= 1) {
      if (wanna_default(terms, i3)) {
        contractions_debug_default(terms[i3], ["want"]);
        reIndex2(terms);
        continue;
      }
      if (there_are_default(terms, i3)) {
        contractions_debug_default(terms[i3], ["there", "are"]);
        continue;
      }
      if (terms[i3].implicit) {
        continue;
      }
      let after = null;
      if (hasApostrophe2.test(terms[i3].normal)) {
        after = terms[i3].normal.split(hasApostrophe2)[1];
      } else if (terms[i3].normal === "aint") {
        after = "t";
      }
      let words2 = null;
      if (Object.hasOwn(byEnd2, after)) {
        words2 = byEnd2[after](terms, i3, world2);
      }
      if (words2) {
        const isYear = terms[i3].tags.has(Year);
        words2 = toDocs(words2, view, terms[i3]);
        splice_default2(document, [n2, i3], words2);
        reTag(document[n2], view, i3, words2.length);
        if (isYear) {
          setTag2([document[n2][i3]], Year, world2, reason12);
        }
        continue;
      }
    }
  });
};
var compute_default10 = { contractionTwo };

// ../../node_modules/compromise/src/2-two/contraction-two/plugin.js
var plugin_default15 = {
  compute: compute_default10,
  api: api_default10,
  hooks: ["contractionTwo"]
};

// ../../node_modules/compromise/src/2-two/postTagger/model/_lib.js
var expandTags = (value, bare = false) => {
  if (Array.isArray(value)) {
    return value.map((tag) => expandTags(tag, bare));
  }
  if (typeof value !== "string") {
    return value;
  }
  const pattern = bare ? /#?[a-z][a-z0-9]*/gi : /#[a-z][a-z0-9]*/gi;
  return value.replace(pattern, (token) => {
    const prefix6 = token.startsWith("#") ? "#" : "";
    const name = token.slice(prefix6.length);
    return prefix6 + (Object.hasOwn(aliases_default4, name) ? aliases_default4[name] : name);
  });
};
var lib_default13 = expandTags;

// ../../node_modules/compromise/src/2-two/postTagger/model/expand-rules.js
var keys2 = { n: "notIf", u: "unTag", s: "safe" };
var expandRules = (rules8) => rules8.map(([match2, tag, group, options = {}]) => {
  if (group && typeof group === "object") {
    options = group;
    group = null;
  }
  const rule = { match: lib_default13(match2) };
  if (tag != null) {
    rule.tag = lib_default13(tag, true);
  }
  if (typeof group === "number") {
    rule.group = group;
  } else if (/\[/.test(match2)) {
    rule.group = 0;
  }
  Object.keys(options).forEach((key) => {
    rule[keys2[key] || key] = lib_default13(options[key], key === "u");
  });
  rule.reason = rule.match;
  return rule;
});
var expand_rules_default = expandRules;

// ../../node_modules/compromise/src/2-two/postTagger/model/_phrases.js
var noun = "(#NN && !#Poss && !@hasComma)";
var modifiers = "(#Det|#Poss)? #Adv+? #Adj+?";
var subject = `${modifiers} ${noun}`;
var predicate = "#Adv+? not? (#V && !#Ger && !#Particle)";

// ../../node_modules/compromise/src/2-two/postTagger/model/index.js
var noLy = "(hard|fast|late|early|high|right|deep|close|direct)";
var infNouns = "(feel|sense|process|rush|side|bomb|bully|challenge|cover|crush|dump|exchange|flow|function|issue|lecture|limit|march|process)";
var notIf2 = "(i|we|they)";
var companySuffix = "(inc|ltd|llc|co|corp|corporation|company|limited)";
var fractionNoun = "(the|this|that|each|every|last|final|next|#Ord|#Poss)";
var singularDet2 = "a|an|this|that|each|every|another";
var afterModal = "#Inf|have|not";
var titles = "(lieutenant|corporal|sergeant|captain|admiral|major|colonel|marshal|president|queen|king|minister|senator|governor|chancellor|mayor|judge|congressman|chairman|professor|ambassador)";
var copula = "(#Cop|be|been|being|remain|remains|remained) #Adv+?";
var theGroup = "the (poor|rich|young|old|elderly|unemployed|homeless|disabled)";
var activeGer = "impersonating|practicing|considering|assuming";
var rules = [
  // let the dough [rest] overnight → Infinitive
  ["let (#Det|#Poss)? #Adj+? #NN [(%Noun|Verb% && !#Plur)] (overnight|outside|inside|here)$", Inf],
  // === verbs/passive.js ===
  // got walked → Passive
  ["got (#Past|#VBN)", Pass],
  // was walked; were walked → Passive (keep word-specific hooks)
  ...["were", "was", "is", "are", "am"].map((word) => [`${word} (#Past|#VBN)`, Pass]),
  // was being walked → Passive
  ["(was|were|is|are|am) being (#Past|#VBN)", Pass],
  // had been walked → Passive
  ["(had|have|has) been (#Past|#VBN)", Pass],
  // will be cleaned → Passive
  ["will be being? (#Past|#VBN)", Pass],
  // dog was [walked] by the man → Passive
  ["#NN (am|is|are|was|were) #Adv? [(#Past|#VBN)] by (the|a) #NN", Pass],
  // === adjective/adjective.js ===
  // Restore the copula when the colour is written without a hyphen.
  // [is] off white → Copula; remove PhrasalVerb
  ["[(is|are|am|was|were)] off white$", Cop, { u: Phrasal }],
  // is [off white] → Adjective
  ["(is|are|am|was|were) [off white]$", Adj],
  // [all] the dogs → Noun
  ["[(all|both)] #Det #NN", NN],
  // the door is [closed] → Adjective
  ["#Sing is #Adv? [%Adj|Past%]$", Adj],
  // [forgotten] art is rediscovered → Adjective
  ["[#Past] #Sing is", Adj],
  // [forgotten] stories are lost → Adjective (not: i said times are changing)
  ["(#NN && !#Poss)? [#Past] #Plur are", Adj, { n: "(#NN && !#Poss) #Past" }],
  // is [fucked up] → Adjective
  ["#Cop [fucked up?]", Adj],
  // jury is out - preposition ➔ adjective
  // jury is [out] → Adjective
  ["#Cop #Adj? [(out|in|through)]$", Adj],
  // [quiet] the room → Infinitive
  ["^[(#Adj && !near && !inside && !outside && !opposite)] (the|your) #NN", Inf, { n: "(all|even)" }],
  // blue-[tinted] → Adjective
  ["(#Adj && #Hyphenated) [(#Hyphenated && #Past)]$", Adj],
  // [blue-tinted] glasses → Adjective
  ["[#Hyphenated (#Hyphenated && #Past)] (#NN|#Conj)", Adj, { n: "#Adv" }],
  // [non-breaking] spaces → Adjective
  ["[#Hyphenated (#Hyphenated && #Ger)] (#NN|#Conj)", Adj, { n: "#Adv" }],
  // [dammed-up] river → Adjective
  ["[#Past (#Hyphenated && #PhrV)] (#NN|#Conj)", Adj],
  // === adjective/adj-adverb.js ===
  // is [far too] cold → Adverb
  [`#Cop [far too] #Adj`, Adv],
  // shops [direct] → Adverb
  [
    `#V [${noLy}] !#NN?`,
    Adv,
    0,
    { n: "(#Cop|be|been|being|get|got|getting|become|became|becoming|feel|feels|feeling|#Det|#Prep)" }
  ],
  // Bare 'be' may still be Infinitive rather than Copula in commands.
  // [moons] a lot → PresentTense
  [`[#Plur] a lot !like?`, Pres],
  // === adjective/adj-gerund.js ===
  // Gerund-Adjectives - 'amusing, annoying'
  // found it [isolating], but found it isolating cells → Adjective
  ["found it #Adv? [isolating]$", Adj],
  // a little [fuming] → Adjective
  ["a (little|bit|wee) bit? [#Ger]", Adj],
  // repairing [crumbling] roads → Adjective
  [
    "#Ger [#Ger] #NN",
    Adj,
    0,
    { n: `(${activeGer}|enjoying|avoiding|stopping|starting|finishing)` }
  ],
  // looked [amazing] → Adjective
  ["(looked|look|looks) #Adv? [%Adj|Gerund%]", Adj, { n: `(${activeGer})` }],
  // meaning alluring → Gerund Adjective
  ["%Noun|Gerund% %Adj|Gerund%", "Ger #Adj"],
  // === adjective/adj-noun.js ===
  // his [fine] → Noun
  ["(his|its) [%Adj|Noun%] !#NN?", NN, { n: "#Hyphenated" }],
  // is [all] → Noun, but not 'is all right'
  ["#Cop #Adv? [(all && !#Adv)]", NN],
  // have [fun] with it → Noun
  [`(have|had) [#Adj] #Prep .`, NN],
  // brewing giant → Noun
  [`#Ger (giant|capital|center|zone|application)`, NN],
  // in a [perfect] → Noun
  [`#Prep (a|an) [#Adj]$`, NN],
  // [brand] new → Adverb
  [`[brand #Ger?] new`, Adv],
  // must-win → Adjective
  [`(must && #Hyphenated) .`, Adj],
  // the [present] → Noun
  [`#Det [#Adj]$`, NN, { n: "(this|that|#Comp|#Sup)" }],
  //are that crazy.
  // company-wide → Adjective
  [`(#NN && #Hyphenated) (#Adj && #Hyphenated)`, Adj, { n: "(this|that|#Comp|#Sup)" }],
  // the [poor] were
  // {
  //   m: `#Det [#Adj] (#Cop|#Det)`,
  //   n: '(#Comp|#Sup)',
  //   g: 0,
  //   t: 'NN',
  // },
  // [professional] bodybuilder → Adjective
  [`[(%Adj|Noun% && !#Tz && !#Val)] #NN`, Adj, { n: "(#Pron|#Prop)" }],
  // === adverb.js ===
  // [way] too hot → Adverb
  ["[way] #Adv #Adj", Adv],
  // [way] too soon → Adverb (not: on his way up)
  ["[way] (too|more|less|so) #Adv", Adv],
  // sing [like] an angel → Adverb
  ["#V  [like]", Adv, { n: "(#Mod|#PhrV)" }],
  // even left → Adverb Verb
  ["even left", "#Adv #V"],
  // cheering [hard] → Adverb
  [
    "#Pres [(hard|quick|bright|slow|fast|backwards|forwards)]",
    Adv,
    0,
    {
      n: "(#Cop|feel|feels|look|looks|seem|seems|appear|appears|sound|sounds|smell|smells|taste|tastes|become|becomes|grow|grows|get|gets|stay|stays|remain|remains)"
    }
  ],
  // a [bit] cold → Adverb
  ["a [(little|bit|wee) bit?] #Adj", Adv],
  // become overly [weakened] → Adjective
  ["(become|fall|grow) #Adv? [#Past]", Adj],
  // a completely [beaten] man → Adjective
  ["(a|an) #Adv [#VBN] #NN", Adj],
  // a [close] friend
  // { m: '#Det #Adv? [close] #NN', g: 0, t: 'Adj' },
  // does [better] → Adverb
  ["(do|does|did) #Adv? [(better|worse)]", Adv],
  // walking [close] → Adverb
  ["#Ger #Adv? [close]", Adv, { n: "(getting|becoming|feeling)" }],
  // charged [back] → Adverb
  ["(#Pres|#Past) [back]", Adv, { n: "(#PhrV|#Cop)" }],
  // the [well] → Noun
  ["#Det [well] !#Past?", NN, { n: "well made" }],
  // sees [well] → Adverb
  ["(#Pres && !#Cop) [well]", Adv],
  // === dates/date.js ===
  // ==== WeekDay ====
  // [sun] the 5th → WeekDay
  ["[sun] the #Ord", WeekDay],
  // 1pm next [sun] → WeekDay
  ["#Date (on|this|next|last|during)? [sun]", WeekDay],
  // (stays here - it repairs the later left-right rule '#Prep _ -> #Month')
  [`(as|than) [may] #Adv? (${afterModal})`, Mod],
  // === dates/date-phrase.js ===
  // 5th of June → Date
  ["#Val of #Month", Date],
  // 5 June
  // { m: '#Card #Month', t: 'Date' },
  // June 5 to 7 → Date
  ["#Month #Val to #Val", Date],
  // June the 12th → Date
  ["#Month the #Val", Date],
  // june 7 → Date
  ["(#WeekDay|#Month) #Val", Date],
  // 7 june → Date
  ["#Val (#WeekDay|#Month)", Date],
  // aug 5th 2021 → Date
  [`#Month #Ord #Card`, Date],
  // === timezones ===
  // china standard time → Timezone
  [`(#Place|#Dem) (standard|daylight|central|mountain)? time`, Timezone],
  // === nouns/nouns.js ===
  //'more' is not always an adverb
  // due to [weather] → Noun
  ["due to [#V]", NN],
  // my first [thought] → Noun
  ["#Poss #Ord [#Past]", NN],
  // the nice [walk] → Noun
  ["(the|this|those|these) #Adj [%Noun|Verb%]", NN, { n: "#Cop" }],
  // the truly nice [swim] → Noun
  ["(the|this|those|these) #Adv #Adj [#V]", NN],
  // the [message] from Danny → Noun
  ["the [#V] #Prep .", NN],
  // a type of [shout] → Noun
  ["#Det #NN of [#V]", NN, { n: "#Ger" }],
  // waited until [release] → Noun
  ["#Past #Prep [#Pres]", NN, { n: "#Ger" }],
  // water-flows → Noun (#Hyphenated is a rarer hook than #Sing; both halves carry it)
  ["(#Sing && #Hyphenated && !must) (#Pres && #Hyphenated)", NN],
  // is no [going] back → Noun
  ["is no [#V]", NN],
  // and check this out! a [walk-in] microwave. → Noun
  [
    "(the|those|these|a|an) #Adj? [(#Pres && !#Ger && !#Cop && !seem && !appear && !include) #Particle?]",
    NN,
    0,
    { n: theGroup }
  ],
  // ==== Actor ====
  // Aircraft designer → Actor
  ["#NN #Actor", Actor, { n: "(#Pers|#Pron)" }],
  // lighting designer → Actor
  ["#Ger #Actor", Actor],
  // captain sanders
  // { match: '[#Actor+] #ProperNoun', group: 0, tag: 'Honorific' },
  // co founder → Actor
  [`co #Sing`, Actor],
  // [aircraft] designer → Actor
  [`[#NN+] #Actor`, Actor, { n: "(#Hon|#Pron|#Poss)" }],
  // fine-artist → Actor
  [
    `(urban|cardiac|cardiovascular|respiratory|medical|clinical|visual|graphic|creative|dental|exotic|fine|certified|registered|technical|virtual|professional|amateur|junior|senior|special|pharmaceutical|theoretical)+ #NN? #Actor`,
    Actor
  ],
  // dance coach → Actor
  [`(#NN && !#Pron) (coach|chef|king|engineer|fellow|personality|boy|girl|man|woman|master)`, Actor],
  // chief design officer → Actor
  [`chief . officer`, Actor],
  // chief of police → Actor
  [`chief of #NN+`, Actor],
  // president of marketing → Actor
  [`senior? vice? president of #NN+`, Actor],
  // ==== Singular ====
  // did a [900], paid a [20] → Singular
  ["#V (a|an) [#Val]$", Sing],
  // ==== Possessive ====
  // John Smith's → Possessive
  ["#First #Acronym? (#Poss && #Last)", Poss],
  // Microsoft Research's office → Possessive
  ["#Org+ #Poss", Poss],
  // Los Angeles's fundraiser → Possessive
  ["#Place+ #Poss", Poss],
  // my butt smells → Noun
  ["#Poss #Pres #Particle?", NN, { n: "(#Ger|#Cop|her)" }],
  // anna's eating vs anna's eating lunch
  // my [teachers] dog → Possessive
  ["(my|our|their|her|his|its) [(#Plur && #Actor)] #NN", Poss],
  // 10th of a [second] → Singular; remove Value
  ["#Val of a [second]", Sing, { u: Val }],
  // the euro [sense] → Noun
  [`#Det #NN [${infNouns}] !(#Prep|to|#Adv)?`, NN],
  // [thanks] for the gift are overdue → Plural
  ["[#Pres] (of|by|for) (a|an|the) #NN #Cop", Plur],
  // You eat and [sleep] → Infinitive
  ["#Inf and [%Noun|Verb%]", Inf],
  // dogs and [running] and cats → Noun
  ["#NN and [#V] and #NN", NN],
  // the 1992 [classic] → Noun
  ["the #Card [%Adj|Noun%]", NN],
  // This is the [premier] university in Virginia → Adjective
  ["#Cop the [%Adj|Noun%] #NN", Adj],
  // i ate [me] sandwich (scottish slang)
  // { m: 'i #V [me] #NN', g: 0, t: 'Poss' },
  // He bowed his [head] in prayer → Noun
  ["#Past #Poss [#V]", NN, { n: "(saw|made)" }],
  // 35 [signs] → Plural
  ["#Val [%Plural|Verb%]", Plur, { n: "(one|1|a|an)" }],
  // a 4 hour [drive] → Noun
  ["#Val (#Dur && #Sing) [%Noun|Verb%]", NN],
  // had [time] → Noun
  ["had [%Noun|Verb%]", NN, { n: "(#Ger|come|become)" }],
  // instant access → Adjective Noun
  ["(%Adj|Noun% && !#Tz) %Noun|Verb%", "#Adj #NN", { n: "#Prop #NN" }],
  // near death experiences, ambitious sales [targets] → Plural
  // (not 'a good plan helps', where a singular determiner leads the noun)
  [`(${singularDet2})? #Adv+? #Adj+ #NN [%Plural|Verb%]$`, Plur, { n: `(#Pron|${singularDet2})` }],
  // your guild [colors] → Plural
  ["#Poss #NN [(colors|colours)]$", Plur],
  // === verbs/noun-gerund.js ===
  // the [upcoming thank]-you → Singular
  ["(this|that|the|a|an) [#Ger #Inf]", Sing],
  // the [upcoming thank]-you → Plural
  ["(that|the) [#Ger #Pres]", Plur, { ifNo: "#Cop" }],
  // lexical [tagging] → Noun
  ["#Adj [#Ger]", NN, { n: "(still|even|just)" }],
  // [walking] is cool → Activity
  ["[#Ger] #Adv? not? #Cop", "Activity"],
  // are [doing] is → Gerund
  ["#Cop [(#Ger|#Activity)] #Cop", Ger],
  // responsibility for [setting] → Gerund
  ["#Sing for [%Noun|Gerund%]", Ger],
  // better for [training] → Gerund
  ["#Comp (for|at) [%Noun|Gerund%]", Ger],
  // apologized for [shouting] → Gerund
  ["(#Past|#Pres) for [%Noun|Gerund%]", Ger],
  // he reads the [upcoming] → Noun
  ["#Pres the [#Ger]", NN],
  // the only painting → Noun
  ["#Det only [%Noun|Gerund%]", NN],
  // === verbs/verb-noun.js ===
  // A final button label is an object, not a second verb. → PresentTense Noun
  ...["click", "clicks"].map((word) => [`(#Pron|#Sing|#Plur) [${word} (submit|save|cancel)]$`, "Pres NN"]),
  // Common intransitive predicates after a singular subject. Keep arbitrary
  // plural/verb switches conservative: 'the dog treats' is a noun phrase.
  // the dog [runs] → PresentTense
  ...["runs", "walks", "barks", "sleeps"].map((word) => [`^(#Det|#Poss) #Adj+? #Sing #Adv+? [${word}] #Adv+?$`, Pres]),
  // with heads and [arms] rolling around
  // { m: '#Prep #Plur and [%Plural|Verb%] #Ger', g: 0, t: 'Plur' },
  // he can solve the [puzzle] → Noun
  ["#Inf (this|that|the) [#Inf]", NN],
  // keeping the [matter] a secret → Noun
  ["#Ger #Det [#Inf]", NN],
  // the-only-[reason] → Noun
  ["#Det (only|further|just|more|backward) [#Inf]", NN],
  // the [slide] makes noise → Noun
  ["(the|this|a|an) [#Inf] #Adv? #V", NN],
  // Use a pointed [stick] (a pencil) or a similar tool → Noun
  ["#Det #Adj #Adj? [#Inf]", NN, { n: theGroup }],
  // the American [thank]-you letter → Noun
  ["#Det #Dem [#Pres]", NN],
  // the next career [read] is brief → Noun
  ["#Adj #NN+ [#Inf] #Cop", NN],
  // at some [thank]-you party → Noun
  ["at some [#Inf]", NN],
  // goes [to sleep] → Preposition Noun
  ["(go|goes|went) [to (sleep|work)]", "Prep NN"],
  // a dog [retrieve] in the field → Noun
  ...["a", "an"].map((word) => [`${word} #Adj? #NN [#Inf] (#Prep|#NN)`, NN, { n: "from" }]),
  // a software [reinstall] → Noun
  ["(a|an) #NN [#Inf]$", NN],
  // working for [thank]-you letters → Noun
  ["#Ger #Adj? for [#Inf]", NN],
  // artists on [thank]-you cards → Noun
  ["#Plur on [#Inf]", NN],
  // number of [thank]-yous → Noun
  ["number of [#Pres]", NN],
  // make [sense] → Noun
  ["(try|use|attempt|build|make) [%Noun|Verb% #Particle?]", NN, { n: "(#Cop|#NN|sure|fun|up)" }],
  //make sure of
  // [append] is cloned → Noun
  ["^[#Inf] (is|was)", NN],
  // get much [thank]-you mail
  // { m: '#Inf much [#Inf]', g: 0, t: 'NN' },
  // [cause] i gotta → Conjunction
  ["[cause] #Pron #V", Conj],
  // the US [air] force
  // {
  //   m: 'the #Sing [#Inf] (#NN && !#Poss)',
  //   g: 0,
  //   t: 'NN',
  //   n: '#Pron',
  // },
  // this [rocks] → PresentTense
  ["this [#Plur]", Pres, { n: "(#Prep|#Date)" }],
  // the thing [that runs] → Conjunction PresentTense
  ["#NN [that %Plural|Verb%]", "Conj Pres", { n: "(#Prep|#Pron|way)" }],
  // that [leads] to
  // { m: 'that [#Plur] to', g: 0, t: 'Pres', n: '#Prep' },
  // let him [father] a child → Infinitive
  ...["let", "make", "made"].map((word) => [`${word} (him|her|it|#Pers|#Place|#Org)+ [#Sing] (a|an|the|it)`, Inf]),
  // assign all [tasks] → Noun
  ["#V (all|every|each|most|some|no) [#Pres]", NN, { n: "#Mod" }],
  // PresentTense/Noun ambiguities
  // Possession and copulas; other past verbs use wide-support below. → Noun
  ["(had|have|was|were) #Adj [#Pres]", NN, { n: "better" }],
  // one big [thank]-you → Noun
  ["#Val #Adj [#Pres]", NN, { n: "#Cop" }],
  // found all [upcoming] words → Noun
  ["#Past #Adj+ [#Pres]", NN, { n: "(#Cop|better)" }],
  // many [thanks] → Noun
  ["(many|few|several|couple) [#Pres]", NN, { n: "#Cop" }],
  // a very big [dream] → Noun
  ["#Det #Adv #Adj [%Noun|Verb%]", NN, { n: "#Cop" }],
  // from start to [finish] → Noun
  ["from #NN to [%Noun|Verb%]", NN],
  // for comparison or [contrast] → Noun
  ["(for|with|of) #NN (and|or|not) [%Noun|Verb%]", NN, { n: "#Pron" }],
  // cute little [thank]-you bags → Noun
  ["#Adj #Adj [#Pres]", NN, { n: "#Cop" }],
  // writing bigger [thank]-you notes → Noun
  ["#Ger #Adv? #Comp [#Pres]", NN, { n: "#Cop" }],
  // to write people [thanks] for helping → Noun
  [`to #Pres #NN [#Pres] #Prep`, NN],
  // waited until [release]
  // {
  //   m: `#Past (until|as|through|without) [(#Pres && !#Ger && !#Cop)]`,
  //   g: 0,
  //   t: 'NN',
  // },
  // selling like hot [thank]-you cards → Plural
  [`#Ger like #Adj? [#Pres]`, Plur],
  // some nice [thank]-you notes → Noun
  [`some #Adj [#Pres]`, NN],
  // for some [thank]-you letters → Noun
  [`for some [#Pres]`, NN],
  // same kind of [shouts] → Noun
  [`(same|some|the|that|a) kind of [#Pres]`, NN],
  // a type of [shout] → Noun
  [`(same|some|the|that|a) type of [#Pres]`, NN],
  // looking good in [thank]-you photos → Noun
  [`#Ger #Adj #Prep [#Pres]`, NN],
  // get better [thank]-you notes → Noun
  [`(get|got|have) #Comp [#Pres]`, NN],
  // give up on [thank]-you letters → Noun
  [`#PhrV #Particle #Prep [#Pres]`, NN],
  // there are [thank]-you notes → Plural
  ["there (are|were) #Adj? [#Pres]", Plur],
  // a thousand [thanks] of gratitude → Plural
  ["#Val [#Pres] of", Plur, { n: "(one|1|#Cop|#Inf)" }],
  // [thanks] are appreciated → Plural
  ["[#Pres] (are|were) #Adj", Plur],
  // [hope] i helped → Infinitive
  ["^[(hope|guess|thought|think)] #Pron #V", Inf],
  // its proper [functioning] → Noun
  ["#Poss #Adj [#V]", NN, { n: "#Cop" }],
  // [tastes] good → PresentTense
  ["[(tastes|smells)] #Adv? #Adj", Pres],
  // Being introduces a predicate rather than a direct object.
  // she is writing [thank]-you letters → Noun
  ["#Cop (#Ger && !being) [(#Pres && !#Ger && !#Cop)] !by?", NN, { n: "going" }],
  // the [shed] → Noun
  ["#Det #Adj? [(shed|thought|rose|bid|saw|spelt)]", NN],
  // how to [watch] → Infinitive
  ["how to [%Noun|Verb%]", Inf],
  // ready to [stream] → Infinitive
  ["(ready|available|difficult|hard|easy|made|attempt|try) to [%Noun|Verb%]", Inf],
  // bring [to market] → Preposition Noun
  ["(bring|went|go|drive|run|bike) [to (market|work|court|school|bed|church|prison)]", "Prep NN"],
  // can i [sleep], would you [look] → Infinitive
  ["#Mod #NN [%Noun|Verb%]", Inf],
  // is just [spam] → Noun
  ["#Cop just [#Inf]", NN],
  // request copies → Imperative Plural
  ["^%Noun|Verb% %Plural|Verb%", "Imp #Plur"],
  // homemade pickles and [drinks] → Plural
  ["#Adj #Plur and [%Plural|Verb%]", "#Plur"],
  // the 1968 [stand]-off → Noun
  ["#Det #Year [#V]", NN],
  // the [break up] → Noun
  ["#Det [(#PhrV && !#Past) #Particle]", NN],
  // the [individual] goals → Adjective
  ["#Det [(%Adj|Noun% && !#Val)] #NN", Adj, { n: "(#Pron|#Poss|#Prop)" }],
  // [work] or prepare → Infinitive
  ["^[%Noun|Verb%] or #Inf", Inf],
  // to give [thanks] → Noun
  ["to #Inf [#Pres]", NN, { n: "(#Ger|#Cop|help)" }],
  // [Google] me → Verb
  ["[(#NN && !#Pron)] me", Vb],
  // removes wrinkles → PresentTense Plural
  ["%Plural|Verb% %Plural|Verb%", "#Pres #Plur"],
  // i [Google] the answer → Infinitive
  ["i [#NN] the #NN", Inf],
  // did the engine [stop] → Infinitive
  ["(did|does|will) the #NN [%Noun|Verb%]", Inf],
  // 40 gallons of [water] → Noun
  ["#Val #NN of [%Noun|Verb%]", NN],
  // When the rain [stops], we will leave. Whenever the bell [rings], the dog barks.
  // when the dog [looks] → PresentTense
  ...["stops", "looks", "rings"].map((word) => [
    `(when|whenever|before|after|until|since|as|while|than) (#Det|#Poss) #Adj+? #NN [(%Plural|Verb% && ${word})]$`,
    Pres,
    0
  ]),
  // The sun [rose]. The river [rose] quickly. → PastTense
  ["(sun|moon|river|water|tide|temperature|prices|he|she|we|they|i) [rose] #Adv+?$", Past],
  // === numbers/money.js ===
  // $5 and $6 → Money
  ["#Money and #Money #Currency?", Money],
  // 6 dollars [and] 5 cents → Money
  ["#Val #Currency [and] #Val (cents|ore|centavos|sens)", Money],
  // 5 rand → Money Currency
  ["#Val (mark|rand|won|rub|ore)", "#Money #Currency"],
  // a pound → Money Unit
  ["a pound", "#Money #Unit"],
  // 3 pounds → Money Unit
  ["#Val (pound|pounds)", "#Money #Unit"],
  // === numbers/fractions.js ===
  // [half] a penny, [quarter] of a dollar → Fraction
  // (not the third quarter of the game, or my half of the deal)
  ["[(a|one) (half|quarter)] of? (a|an|the)", Frac, { u: Date }],
  [`${fractionNoun}? [(a|one)? (half|quarter)] of #Pron`, Frac, { n: `${fractionNoun} (half|quarter)`, u: Date }],
  [
    `${fractionNoun}? #Adj? [(half|quarter)] of? (a|an|the)`,
    Frac,
    0,
    { n: `${fractionNoun} #Adj? (half|quarter)`, u: Date }
  ],
  // two and a half → Fraction
  ["#Card and a half", Frac],
  // five [and] three quarters → Fraction
  ["#Card [and] #Val (halves|quarters|thirds|fifths|sixths|eighths|tenths)", Frac],
  // [a half] million, [a quarter] million → Fraction
  ["[(a|one) (half|quarter)] #Mult", Frac, { u: Date }],
  ["(a|one) (half|quarter) [of a] #Mult", Frac],
  // two-halves → Fraction
  ["#Val (halves|halfs|quarters)", Frac],
  // [seven] fifths → Fraction
  ["[#Card+] (#Frac && /s$/)", Frac],
  // [two thirds] of it → Fraction
  // (a singular one is an ordinal: the twenty first of may)
  // [100th] of it → Fraction
  ["[(#Numeric && #Ord)] of .", Frac],
  // [a twenty fifth] of it → Fraction
  ["[(a|one) #Card?+ #Ord] of", Frac],
  // a sixteenth, one twenty fifth (without a following noun) → Fraction
  ["[(a|one) #Card+? (#Ord && !first && !second)]$", Frac],
  ["(a|one) (half|quarter)$", Frac],
  // 3 out of 5 → Fraction
  ["#Card+ out? of every? #Card", Frac],
  // === numbers/numbers.js ===
  // version [10.11.12] → Singular; remove Date (but not release 15.03.2020)
  [
    "(version|ver|v|build|patch|firmware|kernel|revision|rev|release) [(#Date && /\\.[0-9][0-9]?$/)]",
    Sing,
    0,
    { u: Date }
  ],
  // ==== Ambiguous numbers ====
  // with [a] hundred jobs → Value
  ...["hundred", "thousand", "million", "billion", "trillion"].map((word) => [`!once? [(a|an)] ${word}`, Val]),
  // with [a] dozen eggs → Value
  ["!once? [a] dozen", Val, { hook: "dozen" }],
  // ==== PhoneNumber ====
  // 1 800 555-1234 → PhoneNumber
  ["(1|+1) #Val #PhoneNumber", PhoneNumber],
  // (454) 232-9873 → PhoneNumber
  ["#Numeric #PhoneNumber", PhoneNumber],
  // ==== Currency ====
  // chinese yuan → Currency
  ["#Dem #Currency", "Currency"],
  // ==== Money ====
  // [5] dollars → Money
  ["[#Val+] #Currency", Money],
  // ==== Ordinal ====
  // ==== Units ====
  // Currency can be assigned by left/right rules, so keep this correction late.
  // 5 [dollars] → Unit
  ["#Val+ [#Currency]", Unit],
  // kilometers an hour → Unit
  ["#Unit an hour", Unit],
  // ==== Magnitudes ====
  // thousand and two → Value
  [`#Mult+ and #Val`, Val],
  // 5 miles [per hour] → Unit
  ["#Val #Unit [(per|an) (hr|hour|sec|second|min|minute)]", Unit],
  // twelve percent → Percent Unit
  ["#Card percent", "#Pct #Unit"],
  // === person/person-phrase.js ===
  // ==== FirstNames ====
  // is [foo] Smith → FirstName
  ["#Cop [(#NN|#Pres)] #Last", First, { n: "#Ger" }],
  // pope francis → Person
  ["(sister|pope|brother|father|aunt|uncle|grandpa|grandfather|grandma) #Prop", Pers, { s: true }],
  // ==== Nickname ====
  // Dwayne '[the rock]' Johnson → Person
  ["#First [#Det #NN] #Last", Pers],
  // John b Smith → Person
  ["#Prop (b|c|d|e|f|g|h|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z) #Prop", Pers, { s: true }],
  // J. Smith → Person
  ["#Acronym #Last", Pers, { s: true }],
  // Dr. J. → Person
  ["#Hon #Acronym", Pers],
  // John [b] → [Acronym, Pers] (not a, i, or texting c, k, r, u)
  ["#First [(b|d|e|f|g|h|j|l|m|n|o|p|q|s|t|v|w|x|y|z)]", [Acronym, Pers]],
  // Ludwig van Beethoven → Person
  ["#NN van der? #NN", Pers, { s: true }],
  // king of spain → Person
  ["(king|queen|prince|saint|lady) of #NN", Pers, { s: true }],
  // prince Paris → Person
  ["(prince|lady) #Place", Pers],
  // saint Foo → Person
  ["(king|queen|prince|saint) #Prop", Pers, { n: "#Place" }],
  // al Smith → Person
  ["al (#Pers|#Prop)", Pers, { s: true }],
  // ferdinand de almar → Person
  ["#First de #NN", Pers],
  // Osama bin Laden → Person
  ["#First (bin|al) #NN", Pers],
  // John L. Foo → Person
  ["#First #Acronym #Prop", Pers],
  // Mr Foo → Person
  ["#Hon #First? #Prop", Pers],
  // peter the great → Person
  ["#First the #Adj", Pers],
  // John van Smith → Person
  ["#Prop (van|al|bin) #Prop", Pers, { s: true }],
  // jose de Sucre → Person
  ["#Prop (de|du) la? #Prop", Pers, { n: "#Place" }],
  // Jani K. Smith → FirstName Person .
  ["#Sing #Acronym #Last", "#First #Pers .", { s: true }],
  // [Toronto] John → Person
  ["[#Prop] #Pers", Pers, { s: true }],
  // john [keith jones] → Person
  ["#Pers [#Prop #Prop]", Pers, { n: "#Poss", s: true }],
  // John [Foo] → LastName - but not John's [Honda], or Herman [USA]
  ["(#First && !#Poss) #Acronym? [(#Prop && !#Acronym)]", Last],
  // Joe K. Sombrero → Person
  ["#First #Acronym #NN", Pers, { s: true }],
  // Anthony [de] Marco → LastName
  ["#First [(de|di|du|van|von)] #Pers", Last],
  // baker jenna smith
  // { match: '[#Actor+] #Person', group: 0, tag: 'Person' },
  // [sergeant major] Harold → Honorific - but not [King] Street
  // a title is also #Prop, so a repeat would stop at the second one
  [`[${titles} ${titles}?] (#Prop && !#Place)`, Hon],
  // [vice chairman] Harold, [deputy prime minister] Harold → Honorific
  ["[(senior|executive|deputy)? (vice|prime|deputy) (#Actor|premier|chair|principal)] #Prop", Hon],
  // ==== Honorics ====
  // [general] John → [Hon, Pers]
  ["[(private|general|major|rear|prime|field|count)] #Hon? #Pers", [Hon, Pers]],
  // [Miss] John → [Hon, Pers]
  ["[(miss && @isTitleCase)] #Pers", [Hon, Pers]],
  // dr john [foobar] → LastName
  ["#Hon #First [#Sing]", Last, { n: "#Poss", s: true }],
  // [his excellency] John → Honorific
  ["[(his|her) (majesty|honour|worship|excellency|honorable)] #Pers", Hon],
  // Dr teacher → Honorific
  ["#Hon #Actor", Hon],
  // [first lady] michelle obama → Honorific
  ["[first lady] #Pers", Hon],
  // Louis IV → Person
  ["#Pers the? #RomNum", Pers],
  // === person/ambig-name.js ===
  // const personAdj = '(misty|rusty|dusty|rich|randy|sandy|young|earnest|frank|brown)'
  // ebenezer scrooge → . LastName
  // not 'we saw John there' - only the first name is capitalized
  // not 'i gave john money' - this verb needs a person and a thing
  // not 'john things', 'john everyone' - indefinite pronouns are tagged as nouns
  [
    "(give|gives|gave|giving|lend|lends|lent|hand|hands|handed|buy|buys|bought)? #First [#NN]$",
    Last,
    0,
    {
      n: "(#Poss|#Org|#Place|#Pron|there|/things?$/|someone|anyone|everyone|somebody|anybody|everybody|nobody|@isTitleCase !@isTitleCase|#Verb . !@isTitleCase)"
    }
  ],
  // Jack [D.], Yong-[hwa]
  ["#First (#Acronym|#Hyphenated)$", ". #Last", { n: "(#Poss|#Org|#Place|#Pron|!#NN)" }],
  // June Smith → Person
  ["%Person|Date% #Acronym? #Prop", Pers],
  // ===person-noun===
  // Cliff Clavin → Person
  ["%Person|Noun% #Acronym? #Prop", Pers, { s: true }],
  // Rose Microsoft → Organization
  ["%Person|Noun% #Org", Org],
  // ===person-verb===
  // Ollie Faroo → Person
  ["(%Person|Verb% && #Pers) #Acronym? #Prop", Pers, { ifNo: "#Actor" }],
  // ===person-verb===
  // [drew] closer → Verb
  [`[%Person|Verb%] (#Adv|#Comp)`, Vb],
  // Will Smith → Person
  ["(will && @isTitleCase) #Prop", Pers],
  // jack [layton] won → LastName
  ["(#First && !#Poss) [#Sing] #V", Last, { s: true }],
  // [captain] John walks → Person
  ["^[#Sing] #Pers #V", Pers, { s: true }],
  // === verbs/verbs.js ===
  // is [pretty] good → Adverb
  ["#Cop [(pretty|dead|full|well|sure)] #Adj", Adv],
  // adj -> gerund
  // i [like] → PresentTense
  ["(#Mod|i|they|we|do) not? [like]", Pres],
  // ==== Tense ====
  // he [left] → PastTense
  ["(#NN && !#Poss) #Adv? [left]", Past],
  // she [bit] her tongue → PastTense
  ["#NN #Adv? [(bit && #Inf)]", Past],
  // will [be] running → Copula
  ["will #Adv? not? #Adv? [be] #Ger", Cop],
  // will [be] nice → Copula
  ["will #Adv? not? #Adv? [be] #Adj", Cop],
  // birds [home] to their nest → Infinitive
  ["(#Pron|#Plur|#Mod) #Adv+? [home] to", Inf],
  // is [subject] to change → Adjective
  [`${copula} [subject] to`, Adj],
  // is subject [to] → Preposition; remove Conjunction
  [`${copula} subject [to]`, Prep, { u: Conj }],
  // is subject to [change] → Noun
  [`${copula} subject to [%Noun|Verb%]`, NN],
  // is home [to] dogs → Preposition; remove Conjunction
  ["(#Cop|be|been|being) #Adv+? home [to] #Adj+? #NN", Prep, { u: Conj }],
  // === misc==
  // were being [run] → PastTense
  [`(were|was) being [#Pres]`, Past],
  // had [been broken], had [been known] → Auxiliary Participle
  [`(had|has|have) [been (#Past && /[ew]n$/)]`, "Aux VBN"],
  // had [been] eaten → Auxiliary
  [`(had|has) #Adv? [been] #Adv? #Past`, Aux],
  // had to [Google] the answer → Infinitive
  ...["had", "has"].map((word) => [`${word} to [#NN] (#Det|#Poss)`, Inf]),
  // does that [work] → Infinitive
  [`(do|does|did|#Mod) (this|that|these|those) [work]`, Inf],
  // have read → Auxiliary Participle
  [`(has|have|had) read`, "Aux VBN"],
  // jobs that fit → . Preposition Infinitive
  ["#Plur that %Noun|Verb%", ". #Prep #Inf"],
  // [works] for me → PresentTense
  ["[works] for me", Pres],
  // as we [please] → Infinitive
  ["as #Pron [please]", Inf],
  // verb-prefixes - '[co] write'
  // [co] write → [Vb, Prefix]
  [
    "[(co|mis|de|inter|intra|pre|re|un|counter)] (#V && !#Cop && !#PhrV)",
    [Vb, Prefix],
    0,
    { n: "(#Acronym && @isUpperCase)" }
  ],
  // Keep verb prefixes late: early tagging hides prepositions in left-out-type.
  // [out] run → [Vb, Prefix]
  ["[(out|under|over)] #Inf", [Vb, Prefix]],
  // dressed and [left] → PastTense
  ["#Past and [%Adj|Past%]", Past],
  // [melted] and fallen → PastTense
  ["[(%Adj|Past% && !#Adj)] and #Past", Past],
  // is he [stoked] → Adjective
  ["#Cop #Pron [%Adj|Past%]", Adj],
  // === adjective/adj-verb.js ===
  // Resume fragments: developed [scalable React] architecture. → PastTense
  [
    "^[developed] (#Adj|#Prop)+? (backend|frontend|software|architecture|applications|apps|systems)",
    Past,
    0,
    { n: "(#Pres|#Cop|#Mod)" }
  ],
  // does [mean] → Infinitive
  ["does (#Adv|not)? [%Adj|Present%]", Inf],
  // [okay] by me → Adjective
  ["[(fine|okay|cool|ok)] by me", Adj],
  // i [mean] → PresentTense
  ["i (#Adv|do)? not? [mean]", Pres],
  // the ship will near the coast → Auxiliary Infinitive
  ["will #Adj", "Aux Inf"],
  // I [frequent] this restaurant → Verb
  ["#Pron [#Adj] #Det #Adj? #NN", Vb],
  // rude and [insulting] → Adjective
  ["#Adj and [(%Adj|Gerund% && #Ger)] !#Prep?", Adj],
  // felt [cheated] → Adjective
  ["(seem|seems|seemed|appear|appeared|appears|feel|feels|felt|sound|sounds|sounded) (#Adv|#Adj)? [#Past]", Adj],
  // felt [cheated]
  // { m: '(seem|feel|seemed|felt) [#Past #Particle?]', g: 0, t: 'Adj' },
  // a bit [confused] → Adjective
  ["a (bit|little|tad) [#Past #Particle?]", Adj],
  // do not be [embarrassed] → Adjective
  ["not be [%Adj|Past% #Particle?]", Adj],
  // is just [tired] → Adjective
  ["#Cop just [%Adj|Past% #Particle?]", Adj],
  // [failed] and oppressive → Adjective
  ["[%Adj|Past%] and #Adj", Adj],
  // the fear or [heightened] emotion → Adjective
  ["(#Det|#Prep) #Adj? #NN or [#Past] #NN", Adj, { n: "(#Cop|#Pron)" }],
  // tired and overworked describes a state after a copula → Adjective
  [
    "#Cop #Adv? #Adj and [(overworked|overwhelmed|overpaid|underpaid|overqualified|underqualified|understaffed)]$",
    Adj,
    0
  ],
  // their [declared] intentions → Adjective
  ["#Poss [#Past] #NN", Adj, { n: "#Cop" }],
  // is he [cool] → Adjective
  ["#Cop #Pron [%Adj|Present%]", Adj],
  // is [crowded] with → Adjective
  [
    "#Cop [%Adj|Past%] with",
    Adj,
    0,
    { n: "(associated|worn|baked|aged|armed|bound|fried|loaded|mixed|packed|pumped|filled|sealed)" }
  ],
  // is [empty] → Adjective
  ["#Cop #Adv? [%Adj|Present%]$", Adj],
  // she is being [cool] → Adjective
  ["being #Adv? [%Adj|Present%]", Adj],
  // does the store [open] → Infinitive
  ["(does|will) #Det #NN [%Adj|Present%]$", Inf],
  // === verbs/auxiliary.js ===
  // these are some of our heaviest-used matches
  // ought not [to] walk → Auxiliary
  ["ought (#Adv|not)+? [to] (#Adv|not)+? #V", Aux],
  // ought to [be] walking → Auxiliary
  ["ought (#Adv|not)+? to (#Adv|not)+? [be] (#Adv|not)+? #V", Aux],
  // will [have] walked → Auxiliary
  [`will (#Adv|not)+? [have] (#Adv|not)+? #V`, Aux],
  // [was] walking → Auxiliary
  [`[#Cop] (#Adv|not)+? (#Ger|#Past)`, Aux],
  // [would] walk → Auxiliary
  [`[(#Mod|did)+] (#Adv|not)+? #V`, Aux],
  // would [have] [had] to go → Auxiliary
  [`#Mod (#Adv|not)+? [have] (#Adv|not)+? [had] (#Adv|not)+? #V`, Aux, 1],
  // [will] walk → Auxiliary
  ["[(do|does|did|will|have|had|has|got)] (not|#Adv)+? #V", Aux, { n: "#Prop" }],
  // [about to] go → [Aux, Vb]
  ["[about to] #Adv? #V", [Aux, Vb]],
  // would [be] walking → Auxiliary
  [`#Mod (#Adv|not)+? [be] (#Adv|not)+? #V`, Aux],
  // was [being] driven → Auxiliary
  ["[(be|being|been)] #VBN", Aux],
  // was [being] walked → Auxiliary
  ["#Cop (#Adv|not)+? [(be|being|been)] #Adv+? #Past", Aux],
  // [been] walking → Auxiliary
  ["[(be|been)] (#Adv|not)+? #Ger", Aux],
  // [used to] walk → Auxiliary
  ["[used to] #Pres", Aux],
  // was [going to] walk → Auxiliary
  ["#Cop (#Adv|not)+? [going to] #Adv+? #Pres", Aux],
  // going to [be] watched → Auxiliary
  ["going to (#Adv|not)+? [be] (#Adv|not)+? #Past", Aux],
  // there is [no] x → Negative
  ["(is|was) #Adv? [no]", "Neg"],
  // [been] told → Auxiliary
  ["[(been|had|became|came)] #Past", Aux, { n: "#PhrV" }],
  // [being] born → Auxiliary
  ["[(being|having|getting)] #V", Aux],
  // [better] go → Modal
  ["[better] #Pres", Mod, { n: "(#Cop|#Ger)" }],
  // === verbs/phrasal.js ===
  // walk-up → PhrasalVerb
  ["(#V && @hasHyphen && !#Past) up", Phrasal],
  // walk-off, walk-over, walk-out → PhrasalVerb
  ...["off", "over", "out"].map((word) => [`(#V && @hasHyphen) ${word}`, Phrasal]),
  // [walk in] on → PhrasalVerb Particle
  ["[#V (in|out|up|down|off|back)] (on|in)", "PhrV Particle", { n: "#Cop" }],
  // went [on] for → PhrasalVerb
  ["(lived|went|crept|go) [on] for", Phrasal],
  // the curtains come down → PhrasalVerb Particle
  ["#V (up|down|in|on|for)$", "PhrV #Particle", { n: "#PhrV" }],
  // work in the office → Verb Preposition Determiner; remove PhrasalVerb
  ["#PhrV (in && #Particle) #Det", "#V #Prep #Det", { u: Phrasal }],
  // back it [up] → Adverb
  ...["up", "down"].map((word) => [`#V (him|her|it|us|himself|herself|itself|everything|something) [${word}]`, Adv]),
  // runs [around] the lake → Preposition
  ["#PhrV [around] the #NN", Prep],
  // === verbs/imperative.js ===
  // this is really hard to do
  //we do not go
  // do not [go] → Imperative
  ["^do not? [#Inf #Particle?]", Imp, { n: notIf2 }],
  // please [go] → Imperative
  ["^please do? not? [#Inf #Particle?]", Imp],
  // just [go] → Imperative
  ["^just do? not? [#Inf #Particle?]", Imp],
  // [go] quickly. → Imperative
  // (moved to preTagger/compute/tagger/3rd-pass/08-imperative.js)
  // ['^[(#Inf && !#Hyphenated)] (#Adj|#Adv|hard|high|fast|slow)$', Imp, { n: '(so|such|rather|enough)' }],
  // [turn] down the noise → Imperative
  ["^[#Inf] (up|down|over) #Det", Imp],
  // [eat] my shorts → Imperative
  ["^[#Inf] (your|my|the|a|an|any|each|every|some|more|with|on)", Imp, { n: "like" }],
  // Wait for word-specific corrections such as 'wit me' before tagging commands.
  // [tell] him the story → Imperative
  ["^[#Inf] (him|her|it|us|me|there)", Imp],
  // [avoid] loud noises → Imperative
  ["^[#Inf] #Adj #NN$", Imp],
  // [come] and have a drink → Imperative
  ["^[#Inf] (#Adj|#Adv)? (and|or) #Inf", Imp],
  // Keep isolated commands here: pre-tagging also runs on replacement words. → Imperative
  ...["go", "stop", "wait", "hurry"].map((word) => [`^[${word}] please?$`, Imp]),
  // let's [leave] → Imperative
  ["^let (us|me) [#Inf]", Imp],
  // [shut] the door → Imperative
  ["^[(shut|close|open|start|stop|end|keep)] #Det #NN", Imp],
  // [turn off] the light → Imperative
  ["^[#PhrV #Particle] #Det #NN", Imp],
  // A modal question alone may ask about ability or knowledge. Require an
  // explicit request marker before treating it as an imperative.
  // can you please [walk] → Imperative
  ["^(can|could|will|would) you (#Adv|not)+? please (#Adv|not)+? [#Inf]", Imp],
  // please can you [walk] → Imperative
  ["^please (can|could|will|would) you (#Adv|not)+? [#Inf]", Imp],
  // can you [walk] please → Imperative
  ["^(can|could|will|would) you (#Adv|not)+? [#Inf] .+? please$", Imp],
  // come have a drink → Imperative
  ["^come #Inf", Imp, { n: "on" }],
  // come and have a drink → Imperative . Imperative
  ["^come and #Inf", "Imp . Imp"],
  // [allow] yourself → Imperative
  ["^(and|but)? (then|please)? [#Inf] (yourself|yourselves)", Imp],
  // [look] what happened → Imperative
  ["^[#Inf] what .", Imp],
  // [go] to it → Imperative
  ["^[#Inf] (to|for|into|toward|here|there)", Imp],
  // [maintain] eye contact → Imperative
  ["^[#Inf] #Adj? #Sing #Sing", Imp],
  // don't forget to [clean] → Imperative
  ["^do not (forget|omit|neglect) to [#Inf]", Imp],
  // [add] 2 eggs → Imperative
  ["^[#Inf] #Val #NN", Imp],
  // === verbs/adj-gerund.js ===
  // === _misc.js ===
  // order matters
  // the captain [who] → Determiner
  ["#NN [(who|whom)]", Det],
  // who is [that]? → Pronoun
  ["^#QW #Adv+? #Cop #Adv+? [(this|that|these|those)] #Adv+?$", Pron],
  // I like [this] → Pronoun
  ["#V [(this|that|these|those)] #Adv+? (yesterday|today|tonight|tomorrow)?$", Pron],
  // some sort of → Determiner Noun Preposition
  ["some sort of", "Det NN Prep"],
  // of some sort → Preposition Determiner Noun
  ["of some sort", "Prep Det NN"],
  // [some] eat apples → Pronoun
  ["^[some] #Inf #NN", Pron],
  // put it [there] → Adverb
  ["(put|puts|putting|place|placed|leave|left) #Pron [there]", Adv],
  // [such] skill → Determiner
  ["[such] (a|an|is)? #NN", Det],
  // [there] she is → There
  ["[there] (#Adv|#Pron)? #Cop", "There"],
  // is [there] food → There
  ["#Cop [there] .", "There"],
  // should [there] → There
  ["#Mod #Adv? [there]", "There"],
  // the person [who] runs, the person [which] eats → Preposition
  ...["who", "which"].map((word) => [`#Det #NN+ [${word}] #V`, Prep]),
  // guess who → Infinitive QuestionWord
  ["guess who", "#Inf #QW"],
  // [fucking] ridiculous → Gerund
  ["[fucking] !#V", "#Ger"],
  // === nouns/organizations.js ===
  // import orgWords from './_orgWords.js'
  // let orgMap = `(${orgWords.join('|')})`
  /*
  const multi = [
    'building society',
    'central bank',
    'department store',
    'institute of technology',
    'liberation army',
    'people party',
    'social club',
    'state police',
    'state university',
  ]
  */
  // university of Toronto → Organization
  ["university of #Place", Org],
  // Name pairs can be business names without a known organization suffix. → ProperNoun
  ["#Prop & #Prop", Prop],
  // John & Mary Ltd → Organization
  [`#Pers & #Pers ${companySuffix}`, Org],
  // Smith & Rogers → Organization
  ["#Last & #Last", Org],
  // Microsoft of Canada
  // { m: '#Org of the? #Prop', t: 'Org', s: true },
  // walmart USA → Organization
  ["#Org #Country", Org],
  // Toronto Microsoft → Organization
  ["#Prop #Org", Org, { n: "#First" }],
  // FitBit Inc → Organization
  ["#Prop (ltd|co|inc|dept|assn|bros)", Org],
  // [government of india] → Organization
  ["[government of the? #Place+]", Org],
  // global Microsoft → Organization
  ["(world|global|international|national|#Dem) #Org", Org],
  // Toronto public school → School
  ["#NN+ (public|private) school", "School"],
  // 'toronto fc' → SportsTeam
  ["#Place+ fc", SportsTeam],
  // the new orleans basketball team → Organization
  ["#Place+ #NN{0,2} (club|society|group|team|committee|commission|association|guild|crew)", Org],
  // === nouns/places.js ===
  // ==== Region ====
  // west Toronto → Region
  ["(west|north|south|east|western|northern|southern|eastern)+ #Place", Region],
  //some us-state acronyms (exlude: al, in, la, mo, hi, me, md, ok..)
  // Toronto [ca] → Region
  ["#City [(al|ak|az|ar|ca|ct|dc|fl|ga|id|il|nv|nh|nj|ny|oh|pa|sc|tn|tx|ut|vt|pr)]", Region],
  // Portland [OR] → Region
  ["portland [(or && @isUpperCase)]", Region],
  // with [turkey] → Uncountable; remove Place
  ["with [(turkey && !@isTitleCase)]", Uncountable, { u: Place }],
  // Toronto point → Place
  ["#Prop+ (cliff|place|range|pit|place|point|room|grounds|ruins)", Place],
  // 123 main street → Address
  // (not a 4 hour drive, 2,800 km road, or four wheel drive)
  [
    "#Val (#NN && !#Dur && !#Unit)+ (st|street|rd|road|crescent|cr|way|tr|terrace|avenue|ave|lane|boulevard|blvd|drive|dr|parkway|way)",
    "Address",
    null,
    { n: "(#TxtNum && !@isTitleCase)" }
  ],
  // port dover → Place
  ["(port|mount|mt) #Prop", Place],
  // === conjunctions.js ===
  // [how] he is driving → Conjunction
  ...["who", "what", "where", "why", "how", "when"].map((word) => [`[${word}] #NN #Cop #Adv? (#V|#Adj)`, Conj]),
  // things [that] seem cool → Conjunction
  ["#NN [that] #V #Adj", Conj],
  // we found [that] eggs hatch → Conjunction (but not: he owns that sports car)
  ["#V #Adv? [that] (#Plur && !#Prop && !%Plural|Verb%) #Sing?", Conj, { n: "that #Plur #Sing" }],
  // he was [that] wide → Adverb
  ["#NN #Cop not? [that] #Adj", Adv],
  // [to] lunch → Preposition; remove Conjunction
  ["[to] (#NN && !#V)", Prep, { u: Conj }],
  // I heard rumors [that] drivers save gas → Preposition
  ["#V #Adv? #NN [(that|which)]", Prep],
  // Tuesday, [which] he liked → Preposition
  ["@hasComma [which] (#Pron|#V)", Prep],
  // treated them [like] sons → Preposition
  ["(me|him|her|us|them|it) [like] #NN", Prep],
  // a day [like] this → Preposition
  ["a #NN [like] (#NN|#Det)", Prep],
  // really [like] → Verb
  ["(#Adv && !lot) [like]", Vb],
  // is not [like] me → Preposition
  ["(#Cop|be|been|being) (not|never) [like]", Prep],
  // a lot [like] ours → Preposition
  ["a lot [like] #NN", Prep],
  // treat them [like] → Preposition
  ["#Inf #Pron [like]", Prep],
  // ==== Questions ====
  // where
  // why
  // when
  // who
  // whom
  // whose
  // what
  // which
  //the word 'how many'
  // { match: '^(how|which)', tag: 'QuestionWord' },
  // [how] he → Preposition
  ["[(#QW && !do && !does)] (#Pron|#Det) !#Cop", Prep, { n: "what the (hell|heck)" }],
  // children [who] dance → Preposition
  ["#Plur [(who|which|when)] .", Prep],
  // === expressions.js ===
  // come on → Expression
  ["^come on", Expr],
  // // [well]..
  // { m: '^[well] !#Adj?', g: 0, t: 'Expr' },
  // // [so]
  // { m: '^[so] !#Adj?', g: 0, t: 'Expr' },
  // // [okay]
  // { m: '^[okay] !#Adj?', g: 0, t: 'Expr' },
  // // [now]
  // { m: '^[now] !#Adj?', g: 0, t: 'Expr' },
  // // shoot,
  // { m: '^(shoot && @hasComma)', t: 'Expr' },
  // // say,
  // { m: '^(say && @hasComma)', t: 'Expr' },
  // // like, hello
  // { m: '^(like && @hasComma)', t: 'Expr' },
  // Rules promoted from the second pass.
  // const locative = '#Plural [(near|on|under|beside|behind)] #Determiner #Adjective+? #Noun [%Noun|Verb%]$'
  // Which chair did she [sit] [on]?
  // veggies, [like] kale → Preposition
  ["(#NN && @hasComma) [like] #NN", Prep],
  // Everyone [but] me agreed. → Preposition
  ...["everyone", "everything", "anyone", "anybody", "anything", "nobody", "nothing", "all"].map((word) => [
    `${word} [but] (me|him|her|us|them|#Det|#Poss|#Prop)`,
    Prep,
    0
  ]),
  // images on a screen [like] humans do → Preposition
  ["#NN [like] #NN+ (do|does|did)$", Prep],
  // cities [like] New York, Boston → Preposition
  ...["", "#Place "].map((prefix6) => [`#Plur [like] ${prefix6}(#Place && @hasComma) #Place`, Prep]),
  // [Like] his brother, he enjoys chess → Preposition
  ["^[like] (#Det|#Poss)? #Adj+? (#NN && @hasComma)", Prep],
  // I like tea, [like] my sister does. → Conjunction
  [`@hasComma [like] ${subject} ${predicate}`, Conj],
  // We talked about the fact [that] she resigned. → Conjunction (not: May that year was hot)
  [`#NN [that] ${subject} ${predicate}`, Conj, { n: "#Month that #Date" }],
  // I have heard that story [before] → Adverb
  ["#V (#Det|#Poss)? #NN+? [(before|since)]$", Adv, { n: "@hasQuestionMark" }],
  // Who did she arrive [before]? → Preposition
  ["^(who|whom) #V #Pron #V [before]$", Prep],
  // We will leave [when] the rain stops. → Conjunction
  ["#Mod #Inf [when] #Det", Conj],
  // Although he [was] [tired], he smiled. He [was] [tired].
  ...["[(#Cop|been)] #Adv+? [tired]$"].flatMap((match2) => [
    // Although he [was] [tired], he smiled. He [was] [tired]. → Copula; remove Passive
    [match2, Cop, { u: Pass }],
    // Although he [was] [tired], he smiled. He [was] [tired]. → remove Auxiliary
    [match2, null, { u: Aux }],
    // Although he was [tired], he smiled. He was [tired]. → Adjective (second capture)
    [match2, Adj, 1]
  ]),
  // the [sleeping] dog → Adjective
  ["#Det [sleeping] (#Actor|#Pers|puppy|kitten|dog|cat|baby|babies|child|children)", Adj],
  // [water] broke the pipe → Noun
  ["^[%Noun|Verb%] #Past (#Det|#Poss) #Adj+? #NN", NN],
  // the [present] immediately → Noun
  ["#Det [present] #Adv+$", NN],
  // [falls in] June → Verb Preposition
  ["[(fall|falls|fell) in] #Month", "#V #Prep"],
  // [had] he walked → Condition
  ["^[had] #NN+ (#Adv|not)+? #Past", "Condition", { n: "@hasQuestionMark" }],
  // [were] he to walk → Condition
  ["^[were] #NN+ to #Inf *$", "Condition", { n: "@hasQuestionMark" }],
  // [had] he walked? → Auxiliary
  ["^[had] #NN+ (#Adv|not)+? (#Past && @hasQuestionMark)$", Aux, { n: "@hasComma" }],
  // [had] he walked the dog? → Auxiliary
  ["^[had] #NN+ (#Adv|not)+? #Past * @hasQuestionMark$", Aux, { n: "@hasComma" }],
  // [This] will be one sentence. [This] might help. → Pronoun
  ["[this] #Adv+? #Mod #Adv+? #Inf", Pron],
  // has [read], had [put] → Participle
  ...["read", "put"].map((word) => [`(has|have|had) (#Adv|not)+? [${word}]`, Participle]),
  // John and Mary [walk] → Infinitive
  ["#Pers and #Pers [(%Noun|Verb% && !@isTitleCase && !@isUpperCase)]$", Inf],
  // dogs [near] the house [bark]
  // near|on|under|beside|behind
  ...["near", "on", "under", "beside", "behind"].flatMap((word) => [
    // dogs [near] the house bark → Preposition
    [`#Plur [${word}] #Det #Adj+? #NN [%Noun|Verb%]$`, Prep],
    // dogs near the house [bark] → Infinitive (second capture)
    [`#Plur [${word}] #Det #Adj+? #NN [%Noun|Verb%]$`, Inf, 1]
  ]),
  // has eaten and [drunk] → Participle
  ["(has|have|had) (#Adv|not)+? #Past (and|or) #Adv+? [drunk]", Participle],
  // officers and [kids] would leave → Plural
  ["#Plur and [%Plural|Verb%] #Mod", Plur]
];
var matches = expand_rules_default(rules);
var model_default4 = {
  two: {
    matches
  }
};

// ../../node_modules/compromise/src/2-two/postTagger/model/hanging-adverbs.js
var object = "(#Det|#Poss)? #Adj+? #NN+";
var time = "(daily|weekly|monthly|overnight|together|early|late)";
var place2 = "(here|upstairs|downstairs|outdoors|inside|outside|nearby)";
var tail = "(#Date|#Adv)+?$";
var rules2 = [
  // waters the roses [daily]; worked [together] yesterday → Adverb
  ...["", object].map((between) => [`(#V && !#Cop && !be && !been && !being) ${between} [${time}] ${tail}`, Adv]),
  // carried the laundry [upstairs]; fresh towels [upstairs] → Adverb
  ...["", object].map((between) => [`${between ? "#V" : "(#V && !#Cop)"} ${between} [${place2}] ${tail}`, Adv]),
  // walked [home]; works [downtown] (but visited downtown) → Adverb
  [
    "(go|goes|went|walk|walked|walks|work|works|worked|come|came|comes|going|walking|working|coming) [(home|downtown)] (together|#Date|#Adv)+?$",
    Adv
  ],
  // chauffeur the guests [home]; leave home purchases as nouns → Adverb
  ...[
    "#Pron",
    object
  ].map((between) => [
    `(chauffeur|chauffeurs|chauffeured|chauffeuring|drive|drives|drove|driven|driving|escort|escorts|escorted|escorting) ${between} [home] ${tail}`,
    Adv
  ]),
  // boss everyone [around], with a separated object → Adverb
  [`(boss|bosses|bossed|bossing) ${object} [around] ${tail}`, Adv],
  // come here [now] → Adverb
  ["here [now]$", Adv]
];
var hanging_adverbs_default = rules2;

// ../../node_modules/compromise/src/2-two/postTagger/model/second-pass.js
var lexVerb = "(#V && !#Aux && !#Mod && !do && !does && !did && !have && !has && !had)";
var seatedQuestion = "^(which|what) #Adj+? #NN (did|does|do|#Mod) #Pron [sit] [on]$";
var rules3 = [
  ...hanging_adverbs_default,
  // === second-pass.js ===
  // Corrections matched against the main sweep's output, before any are applied.
  // 12 March Street → remove Date (but not '12 March road closures', or 'the 2011 film Drive')
  ["(#Val && !#Year) #Address+", null, { n: "(#Address && !@isTitleCase && !@isUpperCase)$", u: "Date" }],
  // at 12 march street → remove Date
  ["at (#Val && !#Year) #Address+", null, { u: "Date" }],
  // Keep comma context, but don't turn unambiguous verbs into list items.
  // food, drinks and [thanks] → Noun
  ...[
    ["%Noun|Verb%", "#Inf"],
    ["%Plural|Verb%", "#Pres"],
    ["thanks", "#Pres"]
  ].map(([target, verb]) => [`(#NN && @hasComma) #NN (and|or) [(${target} && ${verb})]`, NN, { n: "#Cop" }]),
  // === connectors.js (second pass) ===
  // Before the meal ended, we left.
  // Before the meal, we left.
  // After the news that she resigned, we called.
  ...["before", "after", "since", "until", "till", "as", "than", "when", "whereas"].flatMap((word) => [
    // [before] she left
    // [after] she left
    // [since] she left... → Conjunction
    [`[${word}] ${subject} ${predicate}`, Conj, { n: `${word} (#NN && !#Pron && !#Prop && !#Actor) #Prop` }],
    // [Before] the guests from the village arrived, we ate.
    // [After] the guests from the village arrived, we ate.
    // [Since] the guests from the village arrived, we ate. ... → Conjunction
    [`[${word}] ${subject} (from|of|with|in|on|at|beside|near) ${subject} ${predicate}`, Conj]
  ]),
  // [Before] the dog and the cat woke, she left.
  // [before] the dog and the cat woke
  // [after] the dog and the cat woke... → Conjunction
  ...["before", "after", "until", "when"].map((word) => [`^[${word}] ${subject} and ${subject} ${predicate}`, Conj]),
  // She bought flowers, [for] I was ill. → Conjunction
  [`@hasComma [for] ${subject} ${predicate}`, Conj],
  // She sings [like] her mother → Preposition
  [`${lexVerb} [like] (#NN|#Det|#Poss)`, Prep],
  // She sings [like] her mother does → Conjunction
  [`${lexVerb} [like] ${subject} ${predicate}`, Conj],
  // Which chair did she [sit] on? → remove PhrasalVerb from sit
  [seatedQuestion, null, { u: Phrasal }],
  // Which chair did she sit [on]? → Preposition (second capture)
  [seatedQuestion, Prep, 1],
  // he ate, and [left] → PastTense
  ["(#Past && @hasComma) and [%Adj|Past%] #Adv+?$", Past],
  // { match: locative, group: 0, tag: 'Preposition' },
  // { match: locative, group: 1, tag: 'Infinitive' },
  // being [injured] and treated → PastTense
  ["being #Adv+? [%Adj|Past%] (and|or) #Adv+? (#Past|#VBN)", Past],
  // dogs, [including] the poodle → Preposition
  ["(#NN && @hasComma) [including] all? #Det? #Card+? #Adv+? #Adj+? #NN", Prep],
  // can you [walk], please? → Imperative
  ["^(can|could|will|would) you (#Adv|not)+? [(#Inf && @hasComma)] please$", Imp],
  // can you [walk] the dog, please? → Imperative
  ["^(can|could|will|would) you (#Adv|not)+? [#Inf] * @hasComma please$", Imp],
  // jack the ripper → Person
  ["%Person|Verb% (the && #Pers) #Pers", Pers],
  // President [Biden], President Hosni [Mubarak] → Person, for titles found in the main sweep
  // not 'Major [League]', or 'the President's [Cup]'
  ...["", "(#Prop && !#Hon && !#Poss && !@hasComma) "].map((first) => [
    `#Hon ${first}[(#Prop && !#Hon && @isTitleCase)]`,
    Pers,
    0,
    { n: "(major|#Poss #Prop|@hasColon)", s: true }
  ]),
  // keep the lid [closed] → Adjective
  ["#Imp #Det #NN+ [%Adj|Past%]", Adj],
  // [twenty ten] km → not a year, once the unit is known
  ["[(twenty && #Year) #Year #Year?] #Unit", null, { u: "Date" }]
  // console.log('  ', rules.length, 'matches second-pass\n\n')
];
var second_pass_default = expand_rules_default(rules3);

// ../../node_modules/compromise/src/2-two/postTagger/compute/local-corrections.js
var spatial = toSet("above below under over beside behind against outside inside near beneath underneath aboard");
var demonstratives = toSet("this that these those");
var doForms2 = toSet("do does did");
var degrees = toSet("very remarkably extremely quite unusually");
var titleCase5 = new RegExp("^\\p{Lu}[a-z'\\u00C0-\\u00FF]", "u");
var localCorrections = (sentences) => {
  const pending = [];
  const add2 = (list5, tag, reason13) => pending.push([list5, tag, reason13]);
  sentences.forEach((terms) => {
    const last = terms.length - 1;
    if (terms[last]?.switch === PluralVerb && /^(barks|snores)$/.test(terms[last - 1]?.normal) && /^(that|which|who)$/.test(terms[last - 2]?.normal) && terms[last - 3]?.tags.has(Sing)) {
      add2([terms[last - 1], terms[last]], Pres, "relative-main-verb");
    }
    terms.forEach((term, i3) => {
      const next = terms[i3 + 1];
      const prev = terms[i3 - 1];
      if (term.normal === "read" && /^(he|she|it)$/.test(prev?.normal) && terms[i3 - 2]?.tags.has(NN) && !terms[i3 - 2].tags.has(Vb)) {
        add2([term], Past, "embedded-read");
      }
      if (term.switch === AdjPast && prev?.tags.has(Plur) && prev.tags.has(Hyphenated) && !next) {
        add2([term], Past, "hyphen-subject-past");
      }
      if (term.normal === "type" && prev?.post === "-" && terms[i3 - 2]?.post === "-" && terms[i3 - 3]?.tags.has(Det) && next?.tags.has(NN) && terms[i3 - 2].tags.has(Phrasal)) {
        add2([terms[i3 - 2], prev], Adj, "phrasal-type-adjective");
      }
      if (term.switch === PluralVerb && prev?.tags.has(Sing) && !prev.tags.has(Prop) && !prev.tags.has(Poss)) {
        let before2 = i3 - 2;
        for (; before2 >= 0; before2 -= 1) {
          if (!hasAny(terms[before2], Adj, Adv)) {
            break;
          }
        }
        if (/^(this|that)$/.test(terms[before2]?.normal)) {
          add2([term], Pres, "demonstrative-predicate");
        }
        for (; before2 >= 0; before2 -= 1) {
          if (terms[before2].post.includes(",") || !hasAny(terms[before2], Sing, Adj, Adv)) {
            break;
          }
        }
        if (terms[before2]?.normal === "each" && (!next || !next.tags.has(NN) || next.tags.has(Pron))) {
          add2([term], Pres, "each-predicate");
        }
      }
      if (term.switch === NounGerund && prev?.tags.has(NN) && prev.post.includes(",") && next?.normal === "and" && terms[i3 + 2]?.switch === PluralVerb) {
        add2([term], NN, "noun-list-gerund");
        add2([terms[i3 + 2]], Plur, "noun-list-plural");
      }
      if (term.switch === PluralVerb && prev?.tags.has(Pres) && prev.post.includes(",") && next?.normal === "and" && terms[i3 + 2]?.tags.has(Pres)) {
        add2([term], Pres, "coordinated-present");
      }
      if (!next) {
        return;
      }
      if (spatial.has(term.normal) && !term.tags.has(Vb) && hasAny(next, Det, Poss, Pron, Prop)) {
        add2([term], Prep, "space-obj");
      }
      if (demonstratives.has(term.normal)) {
        let end2 = i3 + 1;
        for (; end2 < terms.length && terms[end2].tags.has(Adv); end2 += 1) {
        }
        const tags = terms[end2]?.tags;
        if (tags?.has(Inf) && (doForms2.has(prev?.normal) || prev?.tags.has(Mod))) {
          add2([term], Pron, "dem-q");
        }
        const subject2 = term.normal === "this" || term.normal === "that" && (!prev || hasAny(prev, Conj, Vb));
        if (subject2 && tags?.has(Pres) && !hasAny(terms[end2], Inf, Ger)) {
          add2([term], Pron, "this-finite-subj");
        }
      }
      if (term.normal === "will" && titleCase5.test(term.text)) {
        if (next.tags.has(Past)) {
          add2([term], First, "will-past-subj");
        }
        if ((next.machine || next.normal) === "is") {
          add2([term], First, "will-is-subj");
        }
      }
      if (term.switch === AdjNoun && next.tags.has(Actor) && degrees.has(prev?.normal) && terms[i3 - 2]?.tags.has(Det)) {
        add2([term], Adj, "degree-actor");
      }
      if (term.tags.has(TxtNum) && term.tags.has(Date) && !term.tags.has(Year) && next.tags.has(TxtNum)) {
        add2([term, next], Date, "textvalue-date");
      }
    });
  });
  return pending;
};
var local_corrections_default = localCorrections;

// ../../node_modules/compromise/src/2-two/postTagger/compute/index.js
var net = null;
var secondNet = null;
var secondPass2 = function(sentences, world2) {
  const { methods: methods20 } = world2;
  secondNet ||= methods20.one.buildNet(second_pass_default, world2);
  const local = local_corrections_default(sentences);
  const found = methods20.one.bulkMatch(sentences, secondNet, methods20);
  methods20.one.bulkTagger(found, sentences, world2);
  local.forEach(([terms, tag, reason13]) => methods20.one.setTag(terms, tag, world2, null, `[post-local] ${reason13}`));
};
var postTagger = function(view) {
  const { world: world2 } = view;
  const { model: model5, methods: methods20 } = world2;
  net ||= methods20.one.buildNet(model5.two.matches, world2);
  const sentences = view.docs;
  const clauses2 = methods20.two.quickSplit(sentences);
  methods20.two.leftRight(clauses2, model5.two.leftRight, world2);
  const found = methods20.one.bulkMatch(clauses2, net, methods20);
  methods20.one.bulkTagger(found, clauses2, world2);
  secondPass2(sentences, world2);
  view.uncache();
  view.unfreeze();
  return view;
};
var tagger2 = (view) => view.compute(["freeze", "lexicon", "preTagger", "postTagger", "unfreeze"]);
var compute_default11 = { postTagger, tagger: tagger2 };

// ../../node_modules/compromise/src/2-two/postTagger/api.js
var round = (n2) => Math.round(n2 * 100) / 100;
function api_default11(View2) {
  View2.prototype.confidence = function() {
    let sum2 = 0;
    let count = 0;
    lib_default(this.docs, (term) => {
      count += 1;
      sum2 += term.confidence || 1;
    });
    if (count === 0) {
      return 1;
    }
    return round(sum2 / count);
  };
  View2.prototype.tagger = function() {
    return this.compute(["tagger"]);
  };
}

// ../../node_modules/compromise/src/2-two/postTagger/plugin.js
var plugin2 = {
  api: api_default11,
  compute: compute_default11,
  model: model_default4,
  hooks: ["postTagger"]
};
var plugin_default16 = plugin2;

// ../../node_modules/compromise/src/2-two/lazy/maybeMatch.js
var getWords = function(net3) {
  return Object.keys(net3.hooks).filter((w) => !w.startsWith("#") && !w.startsWith("%"));
};
var maybeMatch = function(doc, net3) {
  const words2 = getWords(net3);
  if (words2.length === 0) {
    return doc;
  }
  if (!doc._cache) {
    doc.cache();
  }
  const cache3 = doc._cache;
  return doc.filter((_m, i3) => {
    return words2.some((str) => cache3[i3].has(str));
  });
};
var maybeMatch_default = maybeMatch;

// ../../node_modules/compromise/src/2-two/lazy/plugin.js
var lazy = function(input, reg) {
  let net3 = reg;
  if (typeof reg === "string") {
    net3 = this.buildNet([{ match: reg }]);
  }
  const doc = this.tokenize(input);
  const m3 = maybeMatch_default(doc, net3);
  if (m3.found) {
    m3.compute(["index", "tagger"]);
    return m3.match(reg);
  }
  return doc.none();
};
var plugin_default17 = {
  lib: {
    lazy
  }
};

// ../../node_modules/compromise/src/2-two/swap/api/swap-verb.js
var matchVerb = function(m3, lemma) {
  const conjugate2 = m3.methods.two.transform.verb.conjugate;
  const all4 = conjugate2(lemma, m3.model);
  if (m3.has("#Ger")) {
    return all4.Gerund;
  }
  if (m3.has("#Past")) {
    return all4.PastTense;
  }
  if (m3.has("#Pres")) {
    return all4.PresentTense;
  }
  return lemma;
};
var swapVerb = function(vb3, lemma) {
  let str = lemma;
  vb3.forEach((m3) => {
    if (!m3.has("#Inf")) {
      str = matchVerb(m3, lemma);
    }
    m3.replaceWith(str);
  });
  return vb3;
};
var swap_verb_default = swapVerb;

// ../../node_modules/compromise/src/2-two/swap/api/swap.js
var swapNoun = function(m3, lemma) {
  let str = lemma;
  if (m3.has("#Plur")) {
    const toPlural = m3.methods.two.transform.noun.toPlural;
    str = toPlural(lemma, m3.model);
  }
  m3.replaceWith(str, { possessives: true });
};
var swapAdverb = function(m3, lemma) {
  const { toAdverb: toAdverb2 } = m3.methods.two.transform.adjective;
  const adv = toAdverb2(lemma);
  if (adv) {
    m3.replaceWith(adv);
  }
};
var swapAdjective = function(m3, lemma) {
  const { toComparative: toComparative2, toSuperlative: toSuperlative2 } = m3.methods.two.transform.adjective;
  let str = lemma;
  if (m3.has("#Comp")) {
    str = toComparative2(str, m3.model);
  } else if (m3.has("#Sup")) {
    str = toSuperlative2(str, m3.model);
  }
  if (str) {
    m3.replaceWith(str);
  }
};
var swap = function(from, to, tag) {
  const reg = from.split(/ /g).map((str) => str.toLowerCase().trim()).filter((str) => str).map((str) => `{${str}}`).join(" ");
  let m3 = this.match(reg);
  if (tag) {
    m3 = m3.if(tag);
  }
  if (m3.has("#Verb")) {
    return swap_verb_default(m3, to);
  }
  if (m3.has("#NN")) {
    return swapNoun(m3, to);
  }
  if (m3.has("#Adv")) {
    return swapAdverb(m3, to);
  }
  if (m3.has("#Adj")) {
    return swapAdjective(m3, to);
  }
  return this;
};
var swap_default = swap;

// ../../node_modules/compromise/src/2-two/swap/plugin.js
var api4 = function(View2) {
  View2.prototype.swap = swap_default;
};
var plugin_default18 = {
  api: api4
};

// ../../node_modules/compromise/src/2-two/left-right/model/_lib.js
var context = /^(?:#[A-Za-z][A-Za-z0-9]*|[\p{L}\p{N}][\p{L}\p{N}'’-]*)$/u;
var tagName = /^!?#[a-z][a-z0-9]*$/i;
var parseContext = (source, fail) => {
  const alternatives = source.startsWith("(") && source.endsWith(")");
  const values = alternatives ? source.slice(1, -1).split("|") : [source];
  if (alternatives && values.length < 2 || values.some((value) => !context.test(value))) {
    fail();
  }
  const words2 = /* @__PURE__ */ new Set();
  const tags = [];
  values.forEach((value) => {
    if (value.startsWith("#")) {
      tags.push(value.slice(1));
    } else {
      words2.add(value);
    }
  });
  return { words: words2, tags };
};
var parse4 = (word, source) => {
  const fail = () => {
    throw new Error(`Invalid left-right rule for "${word}": ${source}. Expected "[pre] _ [post] -> #Tag | !#Tag".`);
  };
  if (typeof source !== "string") {
    fail();
  }
  const parts3 = source.split("->").map((s) => s.trim());
  if (parts3.length !== 2) {
    fail();
  }
  const actions = parts3[1].split("|").map((s) => s.trim()).map((action) => {
    if (!tagName.test(action)) {
      fail();
    }
    if (action.startsWith("!")) {
      return { unTag: action.slice(2) };
    }
    return { tag: action.slice(1) };
  });
  const terms = parts3[0].split(/\s+/);
  const index3 = terms.indexOf("_");
  if (index3 < 0 || index3 > 1 || terms.length - index3 > 2) {
    fail();
  }
  const rule = { actions, reason: source };
  if (index3 === 1) {
    let pre = terms[0];
    if (pre.startsWith("^")) {
      pre = pre.slice(1);
      rule.start = pre ? 1 : 0;
    }
    if (pre) {
      rule.pre = parseContext(pre, fail);
    }
  }
  if (index3 < terms.length - 1) {
    let post = terms[index3 + 1];
    if (post.endsWith("$")) {
      post = post.slice(0, -1);
      rule.end = post ? 1 : 0;
    }
    if (post) {
      rule.post = parseContext(post, fail);
    }
  }
  return rule;
};
var compile = (rules8) => {
  const out2 = {};
  Object.entries(rules8).forEach(([words2, entries]) => {
    if (typeof entries !== "string" && !Array.isArray(entries)) {
      throw new Error(`Left-right rules for "${words2}" must be a string or an array.`);
    }
    const parsed = [entries].flat().map((source) => parse4(words2, lib_default13(source)));
    const keys3 = words2.startsWith("%") ? [words2] : lib_default13(words2).split("|");
    keys3.forEach((word) => {
      let key = word;
      if (word.startsWith("#")) {
        key = word.slice(1);
      } else if (word.startsWith("%") && word.endsWith("%")) {
        key = word.slice(1, -1);
      }
      out2[key] ||= [];
      out2[key].push(...parsed);
    });
  });
  return out2;
};
var lib_default14 = compile;

// ../../node_modules/compromise/src/2-two/left-right/model/by-word.js
var adverbBeforeAdjective = "_ #Adj -> #Adv";
var imperativeBeforeAdjective = "^ _ #Adj -> #Imp";
var imperativeBeforeNoun = "^ _ #NN -> #Imp";
var infinitiveBeforeGerund = "_ #Ger -> #Inf";
var copGer = (post) => `#Cop _ ${post} -> #Ger`;
var rules4 = {
  // a bit [cold]; ice [cold]
  cold: "(bit|ice) _ -> #Adj",
  // entirely [unknown], from the un-known switch
  unknown: "#Adv _ -> #Adj",
  lunatic: "_ fringe -> #Adj",
  fringe: "lunatic _ -> #Noun",
  here: [
    // come [here], leave the bowls [here], is [here]
    "(#Verb|#Noun) _ $ -> #Adv",
    "#Verb _ (#Date|now) -> #Adv"
  ],
  too: "_ much -> #Adv",
  much: [
    adverbBeforeAdjective,
    "(too|bit) _ -> #Adj"
  ],
  bit: [
    "a _ -> #Sing",
    // a [bit] much
    "a _ much -> #Adv"
  ],
  live: "long _ -> #Inf",
  rights: [
    "_ of -> #NN",
    "equal _ -> #Plural"
  ],
  // geek out [over] computers
  over: "#Particle _ #NN -> #Prep",
  under: [
    // looked [under] the bed
    "#V _ (#Det|#Poss|#Pron) -> #Prep",
    // labor [under] difficult conditions; panic [under] pressure
    "(labor|labour|panic|labors|labours|panics|labored|laboured|panicked|laboring|labouring|panicking) _ (#Adj|#Noun) -> #Prep",
    // wimp out [under] pressure
    "#Particle _ #NN -> #Prep"
  ],
  // five [am]
  "am|pm": "#Value _ -> #Time",
  // a [well] made table
  well: "_ #Past -> #Adv",
  // keep it [cool]
  cool: "it _ $ -> #Adj",
  long: [
    "_ after$ -> #Adv",
    "_ live -> #Adv"
  ],
  // [minus] seven
  "minus|negative": "_ #Value -> #Value",
  // seven [point] five
  "point|decimal": "#Value _ #Value -> #Value",
  fine: [
    // pay his [fine]; it works out [fine]
    "#Poss _ $ -> #Singular",
    "#PhrasalVerb _ $ -> #Adjective"
  ],
  // 1st [lieutenant]
  lieutenant: "(1st|2nd|3rd) _ -> #Hon",
  // two [dozen] eggs
  dozen: "(a|#Cardinal) _ -> #Multiple | #Cardinal",
  // [how] is she?
  how: "_ (#Det|#Cop|#Mod|#Past) -> #QW",
  // a [rival] company
  rival: "(#Det|#Poss) _ #Noun -> #Adjective",
  // the [bill] is a common noun, despite its name default
  bill: "(#Det|#Poss) _ -> #Singular | !#Person | !#ProperNoun",
  // the [air] force
  air: "_ force -> #NN",
  // the [said] dog
  said: "the _ #NN -> #Adj",
  // this [still] water, the pond's [still] water
  still: "(#Determiner|#Possessive) _ #Noun -> #Adjective",
  so: [
    // [so] hot
    adverbBeforeAdjective,
    // do [so]
    "do _ -> #Adv",
    // [so] he
    "_ #NN -> #Conj"
  ],
  // [way] hotter
  // [way] over
  way: "_ (#Comp|#Adj) -> #Adv",
  all: [
    // they [all] swim
    "_ #V -> #Adv",
    // assign [all] tasks
    "assign _ (#Pres|#Plur) -> #Det",
    // we [all]
    "(we|us) _ -> #NN"
  ],
  even: [
    "#Det _ #NN -> #Adj",
    // barely [even] noticed
    "(barely|hardly) _ -> #Adv",
    // [even] held
    // [even] worse
    // [even] the greatest
    "_ (#V|#Comp|#Det|#Poss) -> #Adv"
  ],
  // [later] say
  later: "_ #Pres -> #Adv",
  enough: [
    // high [enough]
    "#Adj _ -> #Adv",
    "soon _ -> #Adv"
  ],
  // [pretty] soon
  pretty: "_ soon -> #Adv",
  least: [
    // [least] expensive
    adverbBeforeAdjective,
    // the [least]
    "#Det _ -> #Adv"
  ],
  sun: [
    // [sun] feb 2
    "_ #Date -> #WeekDay",
    // the [sun]
    "#Det _ -> #Sing"
  ],
  more: [
    // [more] players
    "_ #NN -> #Adj",
    // any [more]
    "(the|any) _ -> #Sing"
  ],
  u: [
    // and [u]
    "#Conj _ -> #Pron",
    // [u] made me smile
    "_ #V -> #Pron",
    "_ r -> #Pron"
  ],
  // u [r] cool
  r: "u _ -> #Cop",
  half: [
    "^ _ $ -> #Frac",
    "#Det _ #Unit -> #Value",
    // nearly [half]
    "#Adv _ -> #Frac",
    // [half] the
    "_ the -> #Frac",
    // a [half] second
    "#Det _ #Ord -> #Value"
  ],
  second: [
    "(half|quarter) _ -> #Unit | #Singular",
    // one [second]
    "#Card _ -> #Unit",
    // twenty [second] - a unit after it would be 'seconds'
    "(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) _ -> #Ord",
    // [second] dog
    "_ #NN -> #Ord"
  ],
  will: [
    // [will] go
    "_ #Inf -> #Mod",
    // [will] walked to the park
    "^ _ #Past -> #First"
  ],
  march: [
    // must [march]
    "#Mod _ -> #Inf",
    // in [march]
    "(in|by|before|during|on|until|after|of|within|all) _ -> #Month",
    // early [May]
    "(early|late|mid) _ -> #Month",
    // [march] quickly
    "_ #Adv -> #V"
  ],
  may: [
    // [may] be
    "_ be -> #V",
    // early [May]
    "(early|late|mid) _ -> #Month",
    // [march] quickly
    "_ #Adv -> #V"
  ],
  // [open] the door
  open: "_ #Det -> #Inf",
  be: [
    // will [be] walked
    "will _ #Past -> #Aux",
    // [stay] cool
    imperativeBeforeAdjective
  ],
  // at [about]
  about: "#Prep _ -> #Adv",
  // [plenty] of
  plenty: "_ of -> #Uncountable",
  // see [no]
  no: "#V _ -> #Neg",
  turkey: [
    // i ate [turkey]
    "(eat|ate|eating|roast|roasted|thanksgiving) _ -> #Uncountable | !#Place",
    // [turkey] dinner
    "_ (roast|dinner|sandwich|burger) -> #Uncountable | !#Place",
    // ankara [turkey]
    // in [turkey]
    "(#Place|in|near|nearby|to|from) _ -> #Country"
  ],
  that: [
    // [that] is all
    "^ _ #Cop -> #Pron",
    // says [that] he
    "#V _ #Pron -> #Conj",
    // things [that] are required
    "#NN _ #Cop -> #Conj"
  ],
  like: [
    // nothing [like]
    "nothing _ -> #Prep",
    // [like] the time
    "^ _ #Det -> #Prep"
  ],
  // enduring symbols, running water
  enduring: "_ (symbols|legacy|legacies|appeal|influence|value|values) -> #Adj",
  // enduring symbols, running water
  running: "(have|has|had|#Det|#Poss) _ water -> #Adj",
  // [wit] it
  wit: "_ (me|it) -> #Prep",
  leads: [
    // it [leads] to
    "_ (to|from) -> #Pres",
    // that [leads]
    "(that|this) _ -> #Pres"
  ],
  look: [
    // [look] good
    "_ #Adj -> #Pres",
    // [pay] attention
    imperativeBeforeNoun
  ],
  // [start] listening
  finish: infinitiveBeforeGerund,
  help: [
    // [start] listening
    infinitiveBeforeGerund,
    // [pay] attention
    imperativeBeforeNoun
  ],
  right: [
    // [right] after
    "_ (before|after|in|into|to|toward|above|below|under|over) -> #Adv",
    "_ of -> #NN",
    // the [right] to vote
    "(#Det|#Poss) _ to -> #NN"
  ],
  // always [there]
  there: "(always|nearly|barely|practically) _ -> #Adj",
  // than [mine]
  mine: "(then|than) _ -> #Poss",
  // said [sorry]
  sorry: "(say|says|said) _ -> #Expr",
  // on [wed]
  wed: "(in|by|before|during|on|until|after|of|within|all) _ -> #WeekDay | #Singular",
  quarter: [
    "#Det _ #Unit -> #Value",
    // a [half] second
    "#Det _ #Ord -> #Value"
  ],
  kind: [
    // some [kind] of teacher
    "(#Det|#Comp|new|different) _ of -> #NN",
    // same [kind] of shouts
    "same _ of -> #NN",
    // a new [kind]
    "(#Det|#Comp|new|different) _ $ -> #NN"
  ],
  close: [
    // a close friend
    "#Det _ #NN -> #Adj",
    // came to a [close]
    "#Det _ $ -> #NN"
  ],
  sat: [
    // on [sat]
    "(in|by|before|during|on|until|after|of|within|all) _ -> #WeekDay | #Singular",
    // [sat] november
    "^ _ #Date -> #WeekDay | #Singular"
  ],
  // he [read]
  read: "^(he|she|it|#Pers) _ -> #Past",
  stay: [
    // [stay] away
    "^ _ (out|away|back) -> #Imp",
    // [stay] cool
    imperativeBeforeAdjective
  ],
  // [stay] cool
  keep: imperativeBeforeAdjective,
  // shoot
  shoot: "^ _ $ -> #Expr",
  // 10 [seconds]
  seconds: "#Value _ -> #Plur | !#Value",
  premier: [
    // This is the [premier] university in Virginia
    "the _ #NN -> #Adj"
    // { m: '#Cop the [%Adj|Noun%] #NN', g: 0, t: 'Adj', r: 'premier-uni' },
  ],
  // i [frequent] this restaurant
  frequent: "#Pron _ #Det -> #Inf",
  // [google] me
  google: "^ _ #Pron -> #Inf",
  // she even [left]
  left: "even _ $ -> #Past",
  // she has [since] moved
  since: "(has|have|had) _ #Past -> #Adv",
  // she had [time]
  time: "had _ $ -> #NN",
  // the station was [closing]; plants that were [growing]
  "closing|growing": "#Cop _ -> #Ger",
  // half a [penny]
  penny: "a _ $ -> #Currency",
  // 1pm [next] sun
  next: "#Time _ (sun|#WeekDay) -> #Date",
  to: [
    // from start [to] finish
    "start _ finish -> #Prep",
    // [to] the store
    "_ (#Det|#Poss|#Pron|#Email|#Url) -> #Prep | !#Conj",
    // went [to] 888 (but not 3 to 5)
    "#V _ #Value -> #Prep | !#Conj"
  ],
  in: [
    // bowed his head [in] prayer
    "_ prayer -> #Prep",
    // closed [in] july
    "_ #Month -> #Prep"
  ],
  // [pope] francis
  pope: "_ #Pers -> #Hon",
  // [prince] paris
  prince: "_ #Prop -> #Hon",
  // being [born]
  born: "being _ -> #Past",
  // are [ya]
  ya: "(are|#Mod|see|do|for) _ -> #Pron",
  // we met shortly [after]
  after: "(shortly|soon|long) _ $ -> #Adv",
  // she has not arrived [yet]
  yet: "#Past _ $ -> #Adv",
  // [before] dinner
  before: "_ (#Det|#Poss|#NN|#Ger|#Date) -> #Prep",
  // dropped [below] zero
  below: "_ #Value -> #Prep",
  // runs [alongside] the river
  alongside: "_ (#Det|#Poss|#Pron|#Prop) -> #Prep",
  // fell [behind] the sofa, but fell behind
  behind: "#Past _ (#Det|#Poss|#Pron) -> #Prep",
  // [do] you swim?
  do: "^ _ (you|we|they) -> #QW",
  // [does] he swim?
  does: "^ _ (he|she|it|#Prop) -> #QW",
  // i ate [me] sandwich (scottish slang)
  me: "#Past _ #NN -> #Poss",
  // Shared rules follow, so a word's own rules stay first in its bucket.
  // travel by [train]; benefit from [exercise]
  train: "by _ -> #Noun",
  exercise: "(after|from) _ -> #Noun",
  // zoom [past] the house; rage [against] injustice
  past: "#V _ #Det -> #Prep",
  against: "#V _ #Noun -> #Prep",
  // deserving such [praise]
  praise: "such _ -> #Noun",
  // spoke [concerning] the budget
  concerning: "(spoke|talked|wrote) _ #Det -> #Prep",
  // is [lasting] [longer]
  lasting: copGer("longer"),
  longer: "lasting _ $ -> #Adv",
  // is [empowering] local women
  empowering: copGer("#Adj"),
  // attempts at [escape]; waited [pending] approval
  escape: "at _ -> #Noun",
  pending: "#Past _ #Noun -> #Prep",
  // is [lagging] behind
  lagging: copGer("behind"),
  // anyone [owing] money; was sadly [lacking]
  owing: "_ #Noun -> #Ger",
  lacking: "(sadly|sorely) _ $ -> #Adj",
  // is [absorbing] water
  "absorbing|baffling|contributing|exacting|foreboding": copGer("#Noun"),
  // is [booming] again; is flowering [early]
  "booming|skyrocketing": copGer("again"),
  "budding|flowering": copGer("early"),
  screeching: copGer("outside"),
  early: "(budding|flowering) _ $ -> #Adv",
  // is [drifting] toward the shore
  "accelerating|dashing|drifting|rushing|sloping|staggering": copGer("toward"),
  // is [meandering] through the village
  "meandering|rambling|speeding|surging": copGer("through"),
  // is [decaying] in the rain; is [smiling] at the baby
  "decaying|fading|flaming|gleaming|maturing|sparkling|swelling|thriving": copGer("in"),
  "glaring|remaining|roaring|smiling": copGer("at"),
  // is [appealing] against the verdict; is [trembling] with fear
  "appealing|conspiring|intriguing|leaning|raging": copGer("against"),
  "conflicting|corresponding|trembling|trifling": copGer("with"),
  "agonizing|reigning": copGer("over"),
  "aching|ensuing": copGer("after"),
  "bustling|revolving": copGer("around"),
  "dissenting|emerging": copGer("from"),
  living: copGer("near"),
  prevailing: copGer("despite"),
  plunging: copGer("into"),
  flowing: copGer("under"),
  soaring: copGer("above"),
  sprawling: copGer("across"),
  // [1st] lieutenant
  "1st|2nd|3rd": "_ lieutenant -> #Hon",
  // is [when] he left
  "who|what|where|why|how|when": "#Cop _ #NN -> #Conj",
  // [dark] green
  "dark|bright|flat|light|soft|pale|dead|dim|faux|little|wee|sheer|most|near|good|extra|all": adverbBeforeAdjective,
  // in [march]
  "march|may": "#Prep _ -> #Month",
  // what the [hell]
  "shit|damn|hell": "#Det _ -> #NN",
  // go to [hell]
  "shit|hell": "to _ -> #NN",
  // the [can]
  "can|will|may": "the _ -> #Sing",
  // five [feet]; 5 [k]; 5 [gb]
  "foot|feet|k|gb|pa|ft|m": "#Value _ -> #Unit",
  // [damn] them
  "shit|damn": "^ _ them -> #Inf",
  // [super] strong
  "super|pretty": adverbBeforeAdjective,
  // a [must]
  // a [while]
  "must|while": "a _ -> #Sing",
  // [sounds] fun
  // [look] good
  "sound|sounds|looks": "_ #Adj -> #Pres",
  // [stops] thinking
  "start|stop|starts|stops|begin|begins": "_ #Ger -> #V",
  // help [stop]
  "start|stop|end|make": "help _ -> #Inf",
  // [start] listening
  "start|stop": infinitiveBeforeGerund,
  // [pay] attention
  "start|stop|ask|wear|pay|show|watch|act|fix|kill|turn|try|win": imperativeBeforeNoun,
  // 5pm [central]
  "eastern|mountain|pacific|central|est|pst|gmt": "#Time _ -> #Timezone | #Singular",
  // [dance] music
  "dance|rock|rap|swing": "_ (music|class|lesson|night|party|festival|league|ceremony) -> #NN",
  // ten [bucks]
  "buck|bucks|grand": "#Value _ -> #Currency",
  // 5 [square] miles
  "square|cubic": "#Value _ #Unit -> #Unit",
  // is [alone]
  "just|alone": "#Cop _ $ -> #Adj",
  // [go] home
  "go|come": "^ _ home -> #Imp",
  // ok,
  // alright
  // hell
  // anyways
  "ok|alright|hell|anyways": "^ _ -> #Expr",
  // [dude] we should
  "dude|man|girl": "^ _ #Pron -> #Expr",
  // [un] skilled
  "un|contra|extra|inter|intra|macro|micro|mid|mis|mono|multi|pre|sub|tri|ex": "_ #Adj -> #Adj | #Prefix",
  "over|under": "(is|was|were) _ #Past -> #Adv",
  // ...['under', 'over'].map(word => ({
  // m: `(is|was|were) [${word} #Past]`,
  "shit|damn|fuck": "_ (#Det|#Poss|them) -> #Verb",
  // the poor
  "poor|weary|public": "the _ #Verb-> #Noun"
};
var by_word_default = rules4;

// ../../node_modules/compromise/src/2-two/left-right/model/by-tag.js
var rules5 = {
  "#Val": [
    // [five] pm
    "_ (am|pm) -> #Time"
  ],
  "#QW": [
    // [when] stolen
    "_ #VBN -> #Prep"
  ],
  "#Adv": [
    // is [well]
    "#Cop _ $ -> #Adj"
  ],
  "#Pers": [
    // bought a [warhol]
    "(a|an) _ $ -> !#Pers"
  ],
  "#Prop": [
    // in [#ProperNoun] -> #Place
    // in [Foo] California
    "in _ -> #Place"
  ],
  "#Past": [
    // well [made]
    "well _ -> #Adj",
    "(over|under) _ -> #Adj"
  ],
  "#Ger": [
    // as [entertaining] as
    "as _ as -> #Adj",
    // more [amusing] than
    "more _ than -> #Adj",
    // very [entertaining]
    "(so|very|extremely) _ -> #Adj",
    // the [failing] line
    "#Det _ #NN -> #Adj",
    // [walking] should be fun
    "_ #Mod -> #Activity",
    // i think tipping sucks
    "#Inf _ #Pres -> #Noun"
  ],
  "#Adj": [
    // the [above] is clear
    // real [evil] is
    "(#Det|#Adj) _ #Cop -> #NN",
    // no [golden] would
    "no _ #Mod -> #NN",
    // a [minor] in
    "a _ #Prep -> #NN",
    // is [done] well
    "#Cop _ (well|badly|quickly|slowly) -> #V",
    // for the poor this
    "the _ #Det -> #NN"
  ],
  "#VBN": [
    // a [blown] motor
    "(the|those|these|a|an) _ #NN -> #Adj"
  ],
  "#V": [
    // the [manufacture] of perfume
    "(a|an|the) _ of -> #NN",
    // became [embroiled]
    "(become|became|becoming|becomes) _ -> #Adj"
  ],
  "#Sing": [
    // the [staff] were
    "(the|these) _ (were|are) -> #Plur",
    // the [repairer] said
    "#Det _ said -> #Actor"
  ],
  "#Inf": [
    // in [love]
    // about [thank]-you letters
    "(in|about) _ -> #Sing",
    // any [thank]-you letter
    // no [thank] you
    "(any|no) _ -> #NN",
    // as [fit] as
    "as _ as -> #Adj",
    // somebody [call]
    "^(somebody|everybody) _ -> #Imp",
    // never [say]
    "^never _ -> #Imp",
    // [continue] playing
    "^ _ #Ger -> #Imp",
    // much [thank]-you mail
    "much _ -> #NN"
  ],
  "#Pres": [
    // taught [thank]-you etiquette
    "(taught|teaches|learns|learned) _ -> #NN",
    // some [thanks] for helping
    "(many|any|some|several) _ for -> #NN",
    // whose [thanks] are appreciated
    "whose _ #Cop -> #NN"
  ],
  "#Abbr": [
    // 500 fifth [ave]
    "#Value _ -> #Unit"
  ],
  "#First": [
    // john [stewart]
    "#First _ -> #Last"
  ],
  "#Card": [
    //  5 June
    "_ #Month -> #Date"
  ]
};
var by_tag_default = rules5;

// ../../node_modules/compromise/src/2-two/left-right/model/by-switch.js
var rules6 = {
  "%Adj|Gerund%": [
    // is [boring] the audience
    "#Cop _ #Det -> #Ger",
    // is [assuring] us; was [boggling] my mind
    "#Cop _ (#Pron|#Poss|#Reflexive) -> #Ger",
    // world's [leading] manufacturer
    "#Poss _ #NN -> #Adj"
  ],
  "%Adj|Noun%": [
    // her [favourite] sport
    "#Poss _ #NN -> #Adj",
    // a [representative] to
    "#Det _ #Conj -> #NN"
  ],
  "%Noun|Verb%": [
    // to [dream] of
    "to _ #Prep -> #Inf",
    // which [boost] it
    "which _ #NN -> #Inf",
    // Pronouns are nouns too; prefer the embedded object reading.
    // what [work] he did
    "(which|what|whose) _ #Pron -> #NN",
    // [visit] https://example.com
    "^ _ #Url -> #Imp",
    // [commit] to
    "^ _ to -> #Imp"
    //John and Mary [walk]
    // '#Pers _ $ -> #Inf',
  ],
  "%Plural|Verb%": [
    // what [walks] he took
    "(which|what|whose) _ #Pron -> #Plur",
    // asking [questions]
    "#Ger _ -> #Plur",
    // and arms roiling around
    "and _ #Ger -> #Plur"
  ],
  "%Person|Verb%": [
    // [chuck] will ...
    "_ (will|had|has|said|says|told|did|learned|wants|wanted) -> #Pers"
  ],
  "%Person|Place%": [
    // [sydney] harbour
    "_ (harbor|harbour|pier|town|city|place|dump|landfill) -> #Place",
    // east [sydney]
    "(west|east|north|south) _ -> #Place"
  ],
  "%Adj|Present%": [
    // quickly [warm]
    "(slowly|quickly) _ -> #V"
  ]
};
var by_switch_default = rules6;

// ../../node_modules/compromise/src/2-two/left-right/model/index.js
var model_default5 = {
  two: {
    leftRight: {
      byWord: lib_default14(by_word_default),
      byTag: lib_default14(by_tag_default),
      bySwitch: lib_default14(by_switch_default)
    }
  }
};

// ../../node_modules/compromise/src/2-two/left-right/methods/_lib.js
var matches2 = (term, context2) => {
  if (context2 === void 0 || context2 === "") {
    return true;
  }
  if (!term) {
    return false;
  }
  if (typeof context2 === "string") {
    if (context2.startsWith("#")) {
      return term.tags.has(context2.slice(1));
    }
    return term.normal === context2;
  }
  if (context2.words.has(term.normal)) {
    return true;
  }
  for (let i3 = 0; i3 < context2.tags.length; i3 += 1) {
    if (term.tags.has(context2.tags[i3])) {
      return true;
    }
  }
  return false;
};
var lib_default15 = matches2;

// ../../node_modules/compromise/src/2-two/left-right/methods/_actions.js
var apply = (term, rule, world2) => {
  const { setTag: setTag3, unTag: unTag2 } = world2.methods.one;
  const terms = [term];
  const reason13 = "2-left-right: " + (rule.reason || "");
  const actions = rule.actions || [rule];
  for (let i3 = 0; i3 < actions.length; i3 += 1) {
    const action = actions[i3];
    if (action.unTag) {
      unTag2(terms, action.unTag, world2.model.one.tagSet, reason13);
      continue;
    }
    setTag3(terms, action.tag, world2, rule.safe, reason13);
    if (action.tag === NN) {
      const tag = world2.methods.two.looksPlural(term.text) ? "Plural" : Sing;
      setTag3(terms, tag, world2, rule.safe, reason13);
    }
  }
};
var actions_default = apply;

// ../../node_modules/compromise/src/2-two/left-right/methods/index.js
var collect = (entry, terms, i3, pending) => {
  if (!entry) {
    return;
  }
  for (let r = 0; r < entry.length; r += 1) {
    const rule = entry[r];
    if (rule.start !== void 0 && i3 !== rule.start) {
      continue;
    }
    if (rule.end !== void 0 && i3 !== terms.length - 1 - rule.end) {
      continue;
    }
    if (lib_default15(terms[i3 - 1], rule.pre) && lib_default15(terms[i3 + 1], rule.post)) {
      pending.push([terms[i3], rule]);
    }
  }
};
var leftRight = (document, { byWord: byWord3, byTag: byTag3, bySwitch = {} }, world2) => {
  const pending = [];
  lib_default(document, (term, terms, i3) => {
    if (Object.hasOwn(byWord3, term.normal)) {
      collect(byWord3[term.normal], terms, i3, pending);
    }
    term.tags.forEach((tag) => {
      if (Object.hasOwn(byTag3, tag)) {
        collect(byTag3[tag], terms, i3, pending);
      }
    });
    if (term.switch && Object.hasOwn(bySwitch, term.switch)) {
      collect(bySwitch[term.switch], terms, i3, pending);
    }
  });
  pending.forEach(([term, rule]) => actions_default(term, rule, world2));
};
var methods17 = { two: { leftRight } };
var methods_default10 = methods17;

// ../../node_modules/compromise/src/2-two/left-right/plugin.js
var plugin3 = {
  model: model_default5,
  methods: methods_default10
};
var plugin_default19 = plugin3;

// ../../node_modules/compromise/src/two.js
one_default.plugin(plugin_default14);
one_default.plugin(plugin_default15);
one_default.plugin(plugin_default16);
one_default.plugin(plugin_default17);
one_default.plugin(plugin_default19);
one_default.plugin(plugin_default18);
var two_default = one_default;

// ../../node_modules/compromise/src/3-three/_select.js
var select = (View2, find9, originalDocument = false) => function(n2) {
  const matches3 = typeof find9 === "string" ? this.match(find9) : find9(this);
  const selected = matches3.getNth(n2);
  return new View2(originalDocument ? this.document : selected.document, selected.pointer);
};
var select_default = select;

// ../../node_modules/compromise/src/3-three/adjectives/plugin.js
var transforms = ["toComparative", "toSuperlative", "toAdverb", "toNoun"];
var toRoot2 = function(adj) {
  const { fromComparative: fromComparative2, fromSuperlative: fromSuperlative2 } = adj.methods.two.transform.adjective;
  const str = adj.text("normal");
  if (adj.has("#Comp")) {
    return fromComparative2(str, adj.model);
  }
  if (adj.has("#Sup")) {
    return fromSuperlative2(str, adj.model);
  }
  return str;
};
var forms = function(root, adj) {
  const { toAdverb: toAdverb2, toNoun: toNoun2, toSuperlative: toSuperlative2, toComparative: toComparative2 } = adj.methods.two.transform.adjective;
  const { model: model5 } = adj;
  return {
    adverb: toAdverb2(root, model5),
    noun: toNoun2(root, model5),
    superlative: toSuperlative2(root, model5),
    comparative: toComparative2(root, model5)
  };
};
var api5 = function(View2) {
  class Adjectives extends View2 {
    json(opts2 = {}) {
      opts2.normal = true;
      return this.map((m3) => {
        const json = m3.toView().json(opts2)[0] || {};
        json.adjective = forms(toRoot2(m3), m3);
        return json;
      }, []);
    }
    adverbs() {
      return this.before("#Adv+$").concat(this.after("^#Adv+"));
    }
    conjugate(n2) {
      return this.getNth(n2).map((adj) => {
        const root = toRoot2(adj);
        const f2 = forms(root, adj);
        return {
          Adjective: root,
          Comparative: f2.comparative,
          Superlative: f2.superlative,
          Noun: f2.noun,
          Adverb: f2.adverb
        };
      }, []);
    }
    toRoot(n2) {
      return this.getNth(n2).map((adj) => {
        return adj.replaceWith(toRoot2(adj));
      });
    }
  }
  Adjectives.prototype.viewType = "Adjectives";
  transforms.forEach((name) => {
    Object.defineProperty(Adjectives.prototype, name, {
      configurable: true,
      writable: true,
      value: function(n2) {
        const transform = this.methods.two.transform.adjective[name];
        return this.getNth(n2).map((adj) => {
          return adj.replaceWith(transform(toRoot2(adj), this.model));
        });
      }
    });
  });
  View2.prototype.adjectives = select_default(Adjectives, "#Adj");
  View2.prototype.superlatives = select_default(Adjectives, "#Sup");
  View2.prototype.comparatives = select_default(Adjectives, "#Comp");
};
var plugin_default20 = { api: api5 };

// ../../node_modules/compromise/src/3-three/adverbs/plugin.js
var toRoot3 = function(adj) {
  const str = adj.compute("root").text("root");
  return str;
};
var api6 = function(View2) {
  class Adverbs extends View2 {
    conjugate(n2) {
      return this.getNth(n2).map((adv) => {
        const adj = toRoot3(adv);
        return {
          Adverb: adv.text("normal"),
          Adjective: adj
        };
      }, []);
    }
    json(opts2 = {}) {
      const fromAdverb = this.methods.two.transform.adjective.fromAdverb;
      opts2.normal = true;
      return this.map((m3) => {
        const json = m3.toView().json(opts2)[0] || {};
        json.adverb = {
          adjective: fromAdverb(json.normal)
        };
        return json;
      }, []);
    }
  }
  Adverbs.prototype.viewType = "Adverbs";
  View2.prototype.adverbs = select_default(Adverbs, "#Adv");
};
var plugin_default21 = { api: api6 };

// ../../node_modules/compromise/src/3-three/_lib.js
var keepClass = (Cls, name) => {
  Cls.prototype.viewType = name;
  Cls.prototype.update = function(pointer) {
    const m3 = new this.constructor(this.document, pointer);
    m3._cache = this._cache;
    m3.world = this.world;
    return m3;
  };
};
var keepTags = { tags: true };
var jsonWith = (view, n2, key, fn) => {
  const opts2 = typeof n2 === "object" ? n2 : {};
  return view.getNth(n2).map((p4) => {
    const json = p4.toView().json(opts2)[0];
    json[key] = fn(p4);
    return json;
  }, []);
};
var toArray3 = (m3) => m3.json({ normal: true, terms: false, text: false }).map((s) => s.normal);
var lib_default16 = keepClass;

// ../../node_modules/compromise/src/3-three/chunker/api/clauses.js
var notClause = [
  "@hasComma @hasComma",
  //fun, cool...
  "@hasComma (and|or) .",
  //cool, and fun
  "(#City && @hasComma) #Country",
  //'toronto, canada'
  "(#WeekDay && @hasComma) #Date",
  //'tuesday, march 2nd'
  "(#Date+ && @hasComma) #Val",
  //'july 6, 1992'
  "(#Adj && @hasComma) #Adj"
  //nice, pretty
  // '@hasComma (too|also)$', //at end of sentence
];
var byComma = function(doc) {
  let commas = doc.match("@hasComma");
  commas = commas.filter((m3) => {
    if (m3.growLeft(".").wordCount() === 1) {
      return false;
    }
    if (m3.growRight(". .").wordCount() === 1) {
      return false;
    }
    const more = m3.grow(".");
    return !notClause.some((str) => more.has(str));
  });
  return doc.splitAfter(commas);
};
var splitParentheses = function(doc) {
  let matches3 = doc.parentheses();
  matches3 = matches3.filter((m3) => {
    return m3.wordCount() >= 3 && m3.has("#Verb") && m3.has("#NN");
  });
  return doc.splitOn(matches3);
};
var splitQuotes = function(doc) {
  let matches3 = doc.quotations();
  matches3 = matches3.filter((m3) => {
    return m3.wordCount() >= 3 && m3.has("#Verb") && m3.has("#NN");
  });
  return doc.splitOn(matches3);
};
var splitBefore = [
  // ... said John.
  "(said|says) #Prop$",
  // ... if it was
  ". . if .{4}",
  // various conjunctions
  "and while",
  "now that",
  "ever since",
  "(supposing|although)",
  "even (while|if|though)",
  "(whereas|whose)",
  // 'as (far|long|much|soon) as',
  "as (though|if)",
  "(til|until)"
];
var clauses = function(n2) {
  let found = this;
  found = splitParentheses(found);
  found = splitQuotes(found);
  found = byComma(found);
  found = found.splitAfter("(@hasEllipses|@hasSemicolon|@hasDash|@hasColon)");
  found = found.splitAfter("^#Pron (said|says)");
  splitBefore.forEach((str) => {
    found = found.splitBefore(str);
  });
  const m3 = found.match("#Verb .* [but] .* #Verb", 0);
  if (m3.found) {
    found = found.splitBefore(m3);
  }
  const condition = found.if("if .{2,9} then .").match("then");
  found = found.splitBefore(condition);
  if (typeof n2 === "number") {
    found = found.get(n2);
  }
  return found;
};
var clauses_default = clauses;

// ../../node_modules/compromise/src/3-three/chunker/api/chunks.js
var chunks = function(doc) {
  const all4 = [];
  let lastOne = null;
  const m3 = doc.clauses();
  m3.docs.forEach((terms) => {
    terms.forEach((term) => {
      if (!term.chunk || term.chunk !== lastOne) {
        lastOne = term.chunk;
        all4.push([term.index[0], term.index[1], term.index[1] + 1]);
      } else {
        all4[all4.length - 1][2] = term.index[1] + 1;
      }
    });
    lastOne = null;
  });
  const parts3 = doc.update(all4);
  return parts3;
};
var chunks_default2 = chunks;

// ../../node_modules/compromise/src/3-three/chunker/api/api.js
var api7 = function(View2) {
  class Chunks extends View2 {
    // chunk-friendly debug
    debug() {
      this.toView().debug("chunks");
      return this;
    }
  }
  lib_default16(Chunks, "Chunks");
  "Verb Noun Adjective Pivot".split(" ").forEach((name) => {
    Chunks.prototype["is" + name] = function() {
      return this.filter((c) => c.has(`<${name}>`));
    };
  });
  View2.prototype.chunks = select_default(Chunks, chunks_default2, true);
  View2.prototype.clauses = clauses_default;
};
var api_default12 = api7;

// ../../node_modules/compromise/src/3-three/chunker/compute/_lib.js
var Pivot = "Pivot";
var lib_default17 = Pivot;

// ../../node_modules/compromise/src/3-three/chunker/compute/01-easy.js
var byWord2 = {
  this: NN,
  then: lib_default17
};
var byTag2 = [[Vb, Vb], [NN, NN], [Det, NN], [Val, NN], [QW, lib_default17]];
var easyMode = function(document) {
  lib_default(document, (term) => {
    if (Object.hasOwn(byWord2, term.normal)) {
      term.chunk = byWord2[term.normal];
      return;
    }
    const found = byTag2.find((a) => term.tags.has(a[0]));
    if (found) {
      term.chunk = found[1];
    }
  });
};
var easy_default = easyMode;

// ../../node_modules/compromise/src/3-three/chunker/compute/02-neighbours.js
var adjRules = [[-1, Cop, Adj], [-1, Det, NN], [1, NN, NN]];
var advRules = [[-1, Adj, Adj], [-1, Vb, Vb], [1, Adj, Adj], [1, Vb, Vb]];
var byNeighbour = function(document) {
  lib_default(document, (term, terms, t) => {
    if (term.chunk) {
      return;
    }
    let rules8 = null;
    if (term.tags.has(Adj)) {
      rules8 = adjRules;
    } else if (hasAny(term, Adv, Neg)) {
      rules8 = advRules;
    }
    if (!rules8) {
      return;
    }
    const found = rules8.find(([side2, tag]) => terms[t + side2] && terms[t + side2].tags.has(tag));
    if (found) {
      term.chunk = found[2];
    }
  });
};
var neighbours_default3 = byNeighbour;

// ../../node_modules/compromise/src/3-three/chunker/compute/03-matcher.js
var rules7 = [
  // === Conjunction ===
  // that the houses
  { match: "[that] #Det #NN", group: 0, chunk: lib_default17 },
  // estimated that
  { match: "#Past [that]", group: 0, chunk: lib_default17 },
  // so the
  { match: "[so] #Det", group: 0, chunk: lib_default17 },
  // === Adjective ===
  // was really nice
  { match: "#Cop #Adv+? [#Adj]", group: 0, chunk: Adj },
  // was nice
  // { match: '#Copula [#Adjective]', group: 0, chunk: 'Adjective' },
  // nice and cool
  { match: "#Adj and #Adj #NN?", notIf: "#NN", chunk: Adj },
  // really nice
  // { match: '#Adverb+ #Adjective', chunk: 'Adjective' },
  // === Verb ===
  // quickly and suddenly run
  { match: "#Adv+ and #Adv #V", chunk: Vb },
  // sitting near
  { match: "#Ger #Adj$", chunk: Vb },
  // going to walk
  { match: "#Ger to #V", chunk: Vb },
  // come and have a drink
  { match: "#Pres and #Pres", chunk: Vb },
  // really not
  { match: "#Adv #Neg", chunk: Vb },
  // want to see
  { match: "(want|wants|wanted) to #Inf", chunk: Vb },
  // walk ourselves
  { match: "#V #Refl", chunk: Vb },
  // tell him the story
  // { match: '#PresentTense [#Pronoun] #Determiner', group: 0, chunk: 'Verb' },
  // tries to walk
  { match: "#V [to] #Adv? #Inf", group: 0, chunk: Vb },
  // upon seeing
  { match: "[#Prep] #Ger", group: 0, chunk: Vb },
  // ensure that
  { match: "#Inf [that] <Noun>", group: 0, chunk: Vb },
  // === Noun ===
  // the brown fox
  // { match: '#Determiner #Adjective+ #Noun', chunk: 'Noun' },
  // the fox
  // { match: '(the|this) <Noun>', chunk: 'Noun' },
  // brown fox
  // { match: '#Adjective+ <Noun>', chunk: 'Noun' },
  // --- of ---
  // son of a gun
  { match: "#NN of #Det? #NN", chunk: NN },
  // 3 beautiful women
  { match: "#Val+ #Adv? #Adj", chunk: NN },
  // the last russian tsar
  { match: "the [#Adj] #NN", chunk: NN },
  // the happy and playful dog
  { match: "#Det? #Adj+ (and|or) #Adj+ #NN", chunk: NN },
  // breakfast in bed
  { match: "#Sing in #Det? #Sing", chunk: NN },
  // Some citizens in this Canadian capital
  { match: "#Plur [in] #Det? #NN", group: 0, chunk: lib_default17 },
  // indoor and outdoor seating
  { match: "#NN and #Det? #NN", notIf: "(#Poss|#Pron)", chunk: NN }
  //  boys and girls
  // { match: '#Plural and #Determiner? #Plural', chunk: 'Noun' },
  // tomatoes and cheese
  // { match: '#Noun and #Determiner? #Noun', notIf: '#Pronoun', chunk: 'Noun' },
  // that is why
  // { match: '[that] (is|was)', group: 0, chunk: 'Noun' },
];
rules7.forEach((rule) => {
  rule.match = lib_default13(rule.match);
  if (rule.notIf) {
    rule.notIf = lib_default13(rule.notIf);
  }
});
var net2 = null;
var matcher = function(view, _, world2) {
  const { methods: methods20 } = world2;
  net2 ||= methods20.one.buildNet(rules7, world2);
  view.sweep(net2);
};
var matcher_default = matcher;

// ../../node_modules/compromise/src/3-three/chunker/compute/04-fallback.js
var fallback = function(document) {
  lib_default(document, (term) => {
    if (term.chunk !== void 0) {
      return;
    }
    if (hasAny(term, Conj, Prep)) {
      term.chunk = lib_default17;
    } else if (term.tags.has(Adv)) {
      term.chunk = Vb;
    } else {
      term.chunk = NN;
    }
  });
};
var fallback_default2 = fallback;

// ../../node_modules/compromise/src/3-three/chunker/compute/05-fixUp.js
var fixUp = function(docs) {
  const byChunk = [];
  let current = null;
  docs.forEach((terms) => {
    for (let i3 = 0; i3 < terms.length; i3 += 1) {
      const term = terms[i3];
      if (current && term.chunk === current) {
        byChunk[byChunk.length - 1].terms.push(term);
      } else {
        byChunk.push({ chunk: term.chunk, terms: [term] });
        current = term.chunk;
      }
    }
  });
  byChunk.forEach((c) => {
    if (c.chunk === Vb) {
      const hasVerb = c.terms.find((t) => t.tags.has(Vb));
      if (!hasVerb) {
        c.terms.forEach((t) => t.chunk = null);
      }
    }
  });
};
var fixUp_default = fixUp;

// ../../node_modules/compromise/src/3-three/chunker/compute/index.js
var findChunks = function(view) {
  const { docs, world: world2 } = view;
  easy_default(docs);
  neighbours_default3(docs);
  matcher_default(view, docs, world2);
  fallback_default2(docs);
  fixUp_default(docs);
};
var compute_default12 = { chunks: findChunks };

// ../../node_modules/compromise/src/3-three/chunker/plugin.js
var plugin_default22 = {
  compute: compute_default12,
  api: api_default12,
  hooks: ["chunks"]
};

// ../../node_modules/compromise/src/3-three/misc/_lib.js
var stripper = (reg) => (view) => {
  lib_default(view.docs, (term) => {
    term.text = term.text.replace(reg, "");
    term.normal = term.normal.replace(reg, "");
  });
  return view;
};
var lib_default18 = stripper;

// ../../node_modules/compromise/src/3-three/misc/acronyms/index.js
var strip = lib_default18(/\./g);
var api8 = function(View2) {
  class Acronyms extends View2 {
    strip() {
      return strip(this);
    }
    addPeriods() {
      strip(this);
      lib_default(this.docs, (term) => {
        const ending = term.post.startsWith(".") ? "" : ".";
        term.text = term.text.split("").join(".") + ending;
        term.normal = term.normal.split("").join(".") + ending;
      });
      return this;
    }
  }
  Acronyms.prototype.viewType = "Acronyms";
  View2.prototype.acronyms = select_default(Acronyms, "#Acronym");
};
var acronyms_default2 = api8;

// ../../node_modules/compromise/src/3-three/misc/_pairs.js
var findPairs = (hasOpen4, findEnd3) => (doc) => {
  const ptrs = [];
  doc.docs.forEach((terms) => {
    for (let i3 = 0; i3 < terms.length; i3 += 1) {
      const term = terms[i3];
      if (term.pre && hasOpen4.test(term.pre)) {
        const end2 = findEnd3(terms, i3);
        if (end2 !== null) {
          const [n2, start2] = terms[i3].index;
          ptrs.push([n2, start2, start2 + end2 - i3 + 1, terms[i3].id]);
          i3 = end2;
        }
      }
    }
  });
  return doc.update(ptrs);
};
var stripPairs = (hasOpen4, hasClosed4) => (m3) => {
  m3.docs.forEach((terms) => {
    terms[0].pre = terms[0].pre.replace(hasOpen4, "");
    const last = terms[terms.length - 1];
    last.post = last.post.replace(hasClosed4, "");
  });
  return m3;
};

// ../../node_modules/compromise/src/3-three/misc/parentheses/fns.js
var hasOpen2 = /\(/;
var hasClosed2 = /\)/;
var findEnd = function(terms, i3) {
  for (; i3 < terms.length; i3 += 1) {
    if (terms[i3].post && hasClosed2.test(terms[i3].post)) {
      return i3;
    }
  }
  return null;
};
var find2 = findPairs(hasOpen2, findEnd);
var strip2 = stripPairs(hasOpen2, hasClosed2);

// ../../node_modules/compromise/src/3-three/misc/parentheses/index.js
var api9 = function(View2) {
  class Parentheses extends View2 {
    strip() {
      return strip2(this);
    }
  }
  Parentheses.prototype.viewType = "Parentheses";
  View2.prototype.parentheses = select_default(Parentheses, find2);
};
var parentheses_default = api9;

// ../../node_modules/compromise/src/3-three/misc/possessives/index.js
var stripS = lib_default18(/['’]s$/);
var leadApostrophe = /^['’]/;
var strip3 = function(view) {
  stripS(view);
  lib_default(view.docs, (t) => {
    if (t.text.endsWith("s") && leadApostrophe.test(t.post)) {
      t.post = t.post.replace(leadApostrophe, "");
    }
  });
  return view;
};
var find3 = function(doc) {
  let m3 = doc.match("#Poss+");
  if (m3.has("#Pers")) {
    m3 = m3.growLeft("#Pers+");
  }
  if (m3.has("#Place")) {
    m3 = m3.growLeft("#Place+");
  }
  if (m3.has("#Org")) {
    m3 = m3.growLeft("#Org+");
  }
  return m3;
};
var api10 = function(View2) {
  class Possessives extends View2 {
    strip() {
      return strip3(this);
    }
  }
  Possessives.prototype.viewType = "Possessives";
  View2.prototype.possessives = select_default(Possessives, find3);
};
var possessives_default = api10;

// ../../node_modules/compromise/src/3-three/misc/quotations/fns.js
var pairs3 = {
  '"': '"',
  // 'StraightDoubleQuotes'
  "\uFF02": "\uFF02",
  // 'StraightDoubleQuotesWide'
  "'": "'",
  // 'StraightSingleQuotes'
  "\u201C": "\u201D",
  // 'CommaDoubleQuotes'
  "\u2018": "\u2019",
  // 'CommaSingleQuotes'
  "\u201F": "\u201D",
  // 'CurlyDoubleQuotesReversed'
  "\u201B": "\u2019",
  // 'CurlySingleQuotesReversed'
  "\u201E": "\u201D",
  // 'LowCurlyDoubleQuotes'
  "\u2E42": "\u201D",
  // 'LowCurlyDoubleQuotesReversed'
  "\u201A": "\u2019",
  // 'LowCurlySingleQuotes'
  "\xAB": "\xBB",
  // 'AngleDoubleQuotes' «, »
  "\u2039": "\u203A",
  // 'AngleSingleQuotes'
  // Prime 'non quotation'
  "\u2035": "\u2032",
  // 'PrimeSingleQuotes'
  "\u2036": "\u2033",
  // 'PrimeDoubleQuotes'
  "\u2037": "\u2034",
  // 'PrimeTripleQuotes'
  // Prime 'quotation' variation
  "\u301D": "\u301E",
  // 'PrimeDoubleQuotes'
  "`": "\xB4",
  // 'PrimeSingleQuotes'
  "\u301F": "\u301E"
  // 'LowPrimeDoubleQuotesReversed'
};
var hasOpen3 = RegExp("[" + Object.keys(pairs3).join("") + "]");
var hasClosed3 = RegExp("[" + Object.values(pairs3).join("") + "]");
var findEnd2 = function(terms, i3) {
  const have = terms[i3].pre.match(hasOpen3)[0] || "";
  if (!have || !pairs3[have]) {
    return null;
  }
  const want = pairs3[have];
  for (; i3 < terms.length; i3 += 1) {
    if (terms[i3].post && terms[i3].post.match(want)) {
      return i3;
    }
  }
  return null;
};
var find4 = findPairs(hasOpen3, findEnd2);
var strip4 = stripPairs(hasOpen3, hasClosed3);

// ../../node_modules/compromise/src/3-three/misc/quotations/index.js
var api11 = function(View2) {
  class Quotations extends View2 {
    text(fmt2) {
      if (!fmt2 || fmt2 === "text") {
        return super.text({ keepEndPunct: true });
      }
      if (typeof fmt2 === "object") {
        return super.text({ keepEndPunct: true, ...fmt2 });
      }
      return super.text(fmt2);
    }
    strip() {
      strip4(this);
    }
  }
  Quotations.prototype.viewType = "Quotations";
  View2.prototype.quotations = select_default(Quotations, find4);
};
var quotations_default = api11;

// ../../node_modules/compromise/src/3-three/misc/selections/index.js
var phoneNumbers = function(n2) {
  let m3 = this.splitAfter("@hasComma");
  m3 = m3.match("#PhoneNumber+");
  m3 = m3.getNth(n2);
  return m3;
};
var addresses = function(n2) {
  let m3 = this.match("#Address+");
  m3 = m3.getNth(n2);
  return m3;
};
var selections = [
  ["hyphenated", "@hasHyphen ."],
  ["hashTags", "#HashTag"],
  ["emails", "#Email"],
  ["emoji", "#Emoji"],
  ["emoticons", "#Emoticon"],
  ["atMentions", "#AtMention"],
  ["urls", "#Url"],
  // ['pronouns', '#Pronoun'],
  ["conjunctions", "#Conj"],
  ["prepositions", "#Prep"],
  ["abbreviations", "#Abbr"],
  ["honorifics", "#Hon"]
];
var aliases3 = [
  ["emojis", "emoji"],
  ["atmentions", "atMentions"]
];
var addMethods = function(View2) {
  selections.forEach((a) => {
    View2.prototype[a[0]] = function(n2) {
      const m3 = this.match(a[1]);
      return typeof n2 === "number" ? m3.get(n2) : m3;
    };
  });
  View2.prototype.phoneNumbers = phoneNumbers;
  View2.prototype.addresses = addresses;
  aliases3.forEach((a) => {
    View2.prototype[a[0]] = View2.prototype[a[1]];
  });
};
var selections_default = addMethods;

// ../../node_modules/compromise/src/3-three/misc/slashes/index.js
var hasSlash2 = /\//;
var api12 = function(View2) {
  class Slashes extends View2 {
    split() {
      return this.map((m3) => {
        const str = m3.text();
        const arr = str.split(hasSlash2);
        m3 = m3.replaceWith(arr.join(" "));
        return m3.growRight("(" + arr.join("|") + ")+");
      });
    }
  }
  Slashes.prototype.viewType = "Slashes";
  View2.prototype.slashes = select_default(Slashes, "#SlashedTerm");
};
var slashes_default2 = api12;

// ../../node_modules/compromise/src/3-three/misc/plugin.js
var plugin_default23 = {
  api: function(View2) {
    acronyms_default2(View2);
    parentheses_default(View2);
    possessives_default(View2);
    quotations_default(View2);
    selections_default(View2);
    slashes_default2(View2);
  }
};

// ../../node_modules/compromise/src/3-three/normalize/methods.js
var methods18 = {
  // remove titlecasing, uppercase
  "case": (doc) => {
    lib_default(doc.docs, (term) => {
      term.text = term.text.toLowerCase();
    });
  },
  // visually romanize/anglicize 'Björk' into 'Bjork'.
  "unicode": (doc) => {
    const world2 = doc.world;
    const killUnicode2 = world2.methods.one.killUnicode;
    lib_default(doc.docs, (term) => term.text = killUnicode2(term.text, world2));
  },
  // remove hyphens, newlines, and force one space between words
  "whitespace": (doc) => {
    lib_default(doc.docs, (term) => {
      term.post = term.post.replace(/\s+/g, " ");
      term.post = term.post.replace(/\s([.,?!:;])/g, "$1");
      term.pre = term.pre.replace(/\s+/g, "");
    });
  },
  // remove commas, semicolons - but keep sentence-ending punctuation
  "punctuation": (doc) => {
    lib_default(doc.docs, (term) => {
      term.pre = term.pre.replace(/[,،]/g, "");
      term.post = term.post.replace(/[–—-]/g, " ");
      term.post = term.post.replace(/[,،:;]/g, "");
      term.post = term.post.replace(/…|\.{2,}/g, "");
      term.post = term.post.replace(/\?{2,}/g, "?");
      term.post = term.post.replace(/!{2,}/g, "!");
      term.post = term.post.replace(/\?!+/g, "?");
    });
    const docs = doc.docs;
    const terms = docs[docs.length - 1];
    if (terms && terms.length > 0) {
      const lastTerm = terms[terms.length - 1];
      lastTerm.post = lastTerm.post.replace(/ /g, "");
    }
  },
  // ====== subsets ===
  // turn "isn't" to "is not"
  "contractions": (doc) => {
    doc.contractions().expand();
  },
  // remove them
  "emoji": (doc) => {
    doc.emojis().remove();
  },
  //turn 'Vice Admiral John Smith' to 'John Smith'
  "honorifics": (doc) => {
    doc.match("#Hon+ #Pers").honorifics().remove();
  },
  // remove needless adverbs
  "adverbs": (doc) => {
    doc.adverbs().remove();
  },
  // turn "batmobiles" into "batmobile"
  "nouns": (doc) => {
    doc.nouns().toSingular();
  },
  // turn all verbs into Infinitive form - "I walked" → "I walk"
  "verbs": (doc) => {
    const normalized = doc.map((view) => {
      const ptr = view.fullPointer[0].slice(0, 3);
      const before2 = view.document[ptr[0]].length;
      view.verbs().toInfinitive();
      ptr[2] += view.document[ptr[0]].length - before2;
      return view.update([ptr]).harden();
    });
    doc.ptrs = normalized.ptrs;
  },
  // turn "fifty" into "50"
  "numbers": (doc) => {
    doc.numbers().toNumber();
  },
  /** remove bullets from beginning of phrase */
  "debullet": (doc) => {
    const hasBullet = /^\s*([-–—*•])\s*$/;
    doc.docs.forEach((terms) => {
      if (hasBullet.test(terms[0].pre)) {
        terms[0].pre = terms[0].pre.replace(hasBullet, "");
      }
    });
    return doc;
  }
};
"acronyms parentheses possessives quotations".split(" ").forEach((k2) => {
  methods18[k2] = (doc) => {
    doc[k2]().strip();
  };
});
var methods_default11 = methods18;

// ../../node_modules/compromise/src/3-three/normalize/plugin.js
var split2 = (str) => {
  return str.split("|").reduce((h, k2) => {
    h[k2] = true;
    return h;
  }, {});
};
var light = "unicode|punctuation|whitespace|acronyms";
var medium = "|case|contractions|parentheses|quotations|emoji|honorifics|debullet";
var heavy = "|possessives|adverbs|nouns|verbs";
var presets = {
  light: split2(light),
  medium: split2(light + medium),
  heavy: split2(light + medium + heavy)
};
var api13 = function(View2) {
  View2.prototype.normalize = function(opts2 = "light") {
    if (typeof opts2 === "string") {
      opts2 = presets[opts2];
    }
    Object.keys(opts2).forEach((fn) => {
      if (Object.hasOwn(methods_default11, fn)) {
        methods_default11[fn](this, opts2[fn]);
      }
    });
    return this;
  };
};
var plugin_default24 = {
  api: api13
};

// ../../node_modules/compromise/src/3-three/nouns/_lib.js
var split3 = (doc, method, pattern, group) => {
  const matches3 = doc.match(pattern, group);
  if (!matches3.found) {
    return doc;
  }
  return doc[method](matches3);
};
var lib_default19 = split3;

// ../../node_modules/compromise/src/3-three/nouns/find.js
var findNouns = function(doc) {
  let m3 = doc.clauses().match("<Noun>");
  let commas = m3.match("@hasComma");
  commas = commas.not("#Place");
  if (commas.found) {
    m3 = m3.splitAfter(commas);
  }
  m3 = lib_default19(m3, "splitOn", "#Expr");
  m3 = lib_default19(m3, "splitOn", "(he|she|we|you|they|i)");
  m3 = lib_default19(m3, "splitOn", "(#NN|#Adj) [(he|him|she|it)]", 0);
  m3 = lib_default19(m3, "splitOn", "[(he|him|she|it)] (#Det|#Val)", 0);
  m3 = lib_default19(m3, "splitBefore", "#NN [(the|a|an)] #Adj? #NN", 0);
  m3 = lib_default19(m3, "splitOn", "[(here|there)] #NN", 0);
  m3 = lib_default19(m3, "splitOn", "[#NN] (here|there)", 0);
  m3 = lib_default19(m3, "splitBefore", "(our|my|their|your)");
  m3 = lib_default19(m3, "splitOn", "#NN [#Det]", 0);
  m3 = m3.if("#NN");
  return m3;
};
var find_default = findNouns;

// ../../node_modules/compromise/src/3-three/nouns/api/isSubordinate.js
var list2 = `
after
although
as if
as long as
as
because
before
even if
even though
ever since
if
in order that
provided that
since
so that
than
that
though
unless
until
what
whatever
when
whenever
where
whereas
wherever
whether
which
whichever
who
whoever
whom
whomever
whose
`.trim().split("\n");
var isSubordinate = function(m3) {
  if (m3.before("#Prep$").found) {
    return true;
  }
  const leadIn = m3.before();
  if (!leadIn.found) {
    return false;
  }
  for (let i3 = 0; i3 < list2.length; i3 += 1) {
    if (m3.has(list2[i3])) {
      return true;
    }
  }
  return false;
};
var isSubordinate_default = isSubordinate;

// ../../node_modules/compromise/src/3-three/nouns/api/isPlural.js
var notPlural2 = "(#Pron|#Place|#Val|#Pers|#Uncountable|#Month|#WeekDay|#Holiday|#Poss)";
var isPlural2 = function(m3, root) {
  if (m3.has("#Plur")) {
    return true;
  }
  if (m3.has("#NN and #NN")) {
    return true;
  }
  if (m3.has("(we|they)")) {
    return true;
  }
  if (root.has(notPlural2)) {
    return false;
  }
  if (m3.has("#Sing")) {
    return false;
  }
  const str = root.text("normal");
  return str.length > 3 && str.endsWith("s") && !str.endsWith("ss");
};
var isPlural_default = isPlural2;

// ../../node_modules/compromise/src/3-three/nouns/api/parse.js
var getRoot2 = function(m3) {
  let tmp = m3.clone();
  tmp = tmp.match("#NN+");
  tmp = tmp.remove("(#Adj|#Prep|#Det|#Val)");
  tmp = tmp.not("#Poss");
  tmp = tmp.first();
  if (!tmp.found) {
    return m3;
  }
  return tmp;
};
var parseNoun = function(m3) {
  const root = getRoot2(m3);
  return {
    determiner: m3.match("#Det").eq(0),
    adjectives: m3.match("#Adj"),
    number: m3.values(),
    isPlural: isPlural_default(m3, root),
    isSubordinate: isSubordinate_default(m3),
    root
  };
};
var parse_default3 = parseNoun;

// ../../node_modules/compromise/src/3-three/nouns/api/toJSON.js
var toText2 = (m3) => m3.text();
var getNum = function(m3) {
  const num = null;
  if (!m3.found) {
    return num;
  }
  const val = m3.values(0);
  if (val.found) {
    const obj = val.parse()[0] || {};
    return obj.num;
  }
  return num;
};
var toJSON2 = function(m3) {
  const res = parse_default3(m3);
  return {
    root: toText2(res.root),
    number: getNum(res.number),
    determiner: toText2(res.determiner),
    adjectives: toArray3(res.adjectives),
    isPlural: res.isPlural,
    isSubordinate: res.isSubordinate
  };
};
var toJSON_default = toJSON2;

// ../../node_modules/compromise/src/3-three/nouns/api/hasPlural.js
var hasPlural = function(root) {
  if (root.has("^(#Uncountable|#Prop|#Place|#Pron|#Acronym)+$")) {
    return false;
  }
  return true;
};
var hasPlural_default = hasPlural;

// ../../node_modules/compromise/src/3-three/nouns/api/toPlural.js
var nounToPlural = function(m3, parsed) {
  if (parsed.isPlural) {
    return m3;
  }
  if (parsed.root.has("#Poss")) {
    parsed.root = parsed.root.possessives().strip();
  }
  if (!hasPlural_default(parsed.root)) {
    return m3;
  }
  const { methods: methods20, model: model5 } = m3.world;
  const { toPlural } = methods20.two.transform.noun;
  const str = parsed.root.text({ keepPunct: false });
  const plural = toPlural(str, model5);
  m3.match(parsed.root).replaceWith(plural, keepTags).tag(Plur, "toPlural");
  if (parsed.determiner.has("(a|an)")) {
    m3.remove(parsed.determiner);
  }
  const copula2 = parsed.root.after("not? #Adv+? [#Cop]", 0);
  if (copula2.found) {
    if (copula2.has("is")) {
      m3.replace(copula2, "are");
    } else if (copula2.has("was")) {
      m3.replace(copula2, "were");
    }
  }
  return m3;
};
var toPlural_default2 = nounToPlural;

// ../../node_modules/compromise/src/3-three/nouns/api/toSingular.js
var matchCase = function(original, str) {
  if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) {
    return str.toUpperCase();
  }
  if (new RegExp("^\\p{Lu}", "u").test(original)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  return str;
};
var nounToSingular = function(m3, parsed) {
  if (!parsed.isPlural) {
    return m3;
  }
  const { methods: methods20, model: model5 } = m3.world;
  const { toSingular: toSingular2 } = methods20.two.transform.noun;
  const str = parsed.root.text("normal");
  const single = toSingular2(str, model5);
  const before2 = (parsed.root.docs[0] || []).map((term) => term.text);
  const after = m3.replace(parsed.root, single, keepTags).tag(Sing, "toPlural");
  const terms = after.docs[0] || [];
  if (terms.length === before2.length) {
    terms.forEach((term, i3) => {
      term.text = matchCase(before2[i3], term.text);
    });
  }
  return m3;
};
var toSingular_default2 = nounToSingular;

// ../../node_modules/compromise/src/3-three/nouns/api/api.js
var api14 = function(View2) {
  class Nouns extends View2 {
    parse(n2) {
      return this.getNth(n2).map(parse_default3);
    }
    json(n2) {
      const opts2 = typeof n2 === "object" ? n2 : {};
      return this.getNth(n2).map((m3) => {
        const json = m3.toView().json(opts2)[0] || {};
        if (opts2 && opts2.noun !== false) {
          json.noun = toJSON_default(m3);
        }
        return json;
      }, []);
    }
    conjugate(n2) {
      const methods20 = this.world.methods.two.transform.noun;
      return this.getNth(n2).map((m3) => {
        const parsed = parse_default3(m3);
        const root = parsed.root.compute("root").text("root");
        const res = {
          Singular: root
        };
        if (hasPlural_default(parsed.root)) {
          res.Plural = methods20.toPlural(root, this.model);
        }
        if (res.Singular === res.Plural) {
          delete res.Plural;
        }
        return res;
      }, []);
    }
    isPlural(n2) {
      const res = this.filter((m3) => parse_default3(m3).isPlural);
      return res.getNth(n2);
    }
    isSingular(n2) {
      const res = this.filter((m3) => !parse_default3(m3).isPlural);
      return res.getNth(n2);
    }
    adjectives(n2) {
      let res = this.update([]);
      this.forEach((m3) => {
        const adj = parse_default3(m3).adjectives;
        if (adj.found) {
          res = res.concat(adj);
        }
      });
      return res.getNth(n2);
    }
    toPlural(n2) {
      return this.getNth(n2).map((m3) => {
        return toPlural_default2(m3, parse_default3(m3));
      });
    }
    toSingular(n2) {
      return this.getNth(n2).map((m3) => {
        const res = parse_default3(m3);
        return toSingular_default2(m3, res);
      });
    }
  }
  lib_default16(Nouns, "Nouns");
  View2.prototype.nouns = select_default(Nouns, find_default, true);
};
var api_default13 = api14;

// ../../node_modules/compromise/src/3-three/nouns/plugin.js
var plugin_default25 = {
  api: api_default13
};

// ../../node_modules/compromise/src/3-three/numbers/fractions/find.js
var findFractions = function(doc) {
  let m3 = doc.match("#Frac+");
  m3 = m3.splitOn("/\\//");
  m3 = m3.filter((r) => {
    return !r.lookBehind("#Val and$").notIf("(#Frac|#Pct)").found;
  });
  m3 = m3.notIf("#Val seconds");
  return m3;
};
var find_default2 = findFractions;

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/toNumber/findModifiers.js
var findModifiers = (str) => {
  const mults2 = [
    {
      reg: /^(minus|negative)[\s-]/i,
      mult: -1
    },
    {
      reg: /^((a|one)\s)?half[\s-](of\s)?/i,
      mult: 0.5
    },
    {
      reg: /^((a|one)\s)?quarter[\s-](of\s)?/i,
      mult: 0.25
    }
  ];
  for (let i3 = 0; i3 < mults2.length; i3++) {
    if (mults2[i3].reg.test(str)) {
      return {
        amount: mults2[i3].mult,
        str: str.replace(mults2[i3].reg, "")
      };
    }
  }
  return {
    amount: 1,
    str
  };
};
var findModifiers_default = findModifiers;

// ../../node_modules/compromise/src/3-three/numbers/numbers/_words.js
var ones2 = "zero one two three four five six seven eight nine".split(" ");
var teens = "ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
var tens2 = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
var bigs = "hundred thousand million billion trillion quadrillion quintillion sextillion septillion".split(" ");
var irregulars = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
var ordinal = (w) => irregulars[w] || w.replace(/y$/, "ie") + "th";
var ordSuffix = (digits) => {
  if (/1[123]$/.test(digits)) {
    return "th";
  }
  const suffix3 = { 1: "st", 2: "nd", 3: "rd" };
  return suffix3[digits.slice(-1)] || "th";
};
var pow10 = (n2) => Number("1e" + n2);

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/toNumber/data.js
var table = (words2, value) => {
  const h = {};
  words2.forEach((w, i3) => {
    h[ordinal(w)] = value(i3);
  });
  words2.forEach((w, i3) => {
    h[w] = value(i3);
  });
  return h;
};
var words = {
  ones: table(ones2, (i3) => i3),
  teens: table(teens, (i3) => 10 + i3),
  tens: table([...tens2, "fourty"], (i3) => (i3 === 8 ? 4 : i3 + 2) * 10),
  multiples: {
    ...table(bigs, (i3) => i3 === 0 ? 100 : pow10(3 * i3)),
    grand: 1e3,
    dozen: 12
  }
};
words.small = { ...words.ones, ...words.teens, ...words.tens };
var data_default = words;

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/toNumber/validate.js
var isValid = (w, has3) => {
  if (Object.hasOwn(data_default.small, w)) {
    if (has3.ones || has3.teens) {
      return false;
    }
    if (has3.tens && !Object.hasOwn(data_default.ones, w)) {
      return false;
    }
  }
  return true;
};
var validate_default3 = isValid;

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/toNumber/parseDecimals.js
var parseDecimals = function(arr) {
  let str = "0.";
  for (let i3 = 0; i3 < arr.length; i3++) {
    const w = arr[i3];
    if (Object.hasOwn(data_default.small, w)) {
      str += data_default.small[w];
    } else if (/^[0-9]$/.test(w)) {
      str += w;
    } else {
      return 0;
    }
  }
  return parseFloat(str);
};
var parseDecimals_default = parseDecimals;

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/toNumber/parseNumeric.js
var parseNumeric = (str) => {
  str = str.replace(/(?<=1)st$|(?<=2)nd$|(?<=3)rd$|(?<=[4567890])r?th$/, "");
  str = str.replace(/^[$€¥£¢]|[%$€¥£¢]$|,/g, "");
  str = str.replace(/([0-9])([a-z\u00C0-\u00FF]{1,2})$/, "$1");
  return str;
};
var parseNumeric_default = parseNumeric;

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/toNumber/index.js
var improperFraction = /^([0-9,. ]+)\/([0-9,. ]+)$/;
var casualForms = {
  "a few": 3,
  "a couple": 2,
  "a dozen": 12,
  "two dozen": 24,
  zero: 0
};
var casualCounts = { few: 3, couple: 2 };
var section_sum = (obj) => Object.values(obj).reduce((a, b2) => a + b2, 0);
var parse5 = function(str) {
  if (Object.hasOwn(casualForms, str)) {
    return casualForms[str];
  }
  if (str === "a" || str === "an") {
    return 1;
  }
  const modifier = findModifiers_default(str);
  str = modifier.str;
  let last_mult = null;
  let last_big = null;
  let has3 = {};
  let sum2 = 0;
  let isNegative2 = false;
  const terms = str.split(/[ -]/);
  for (let i3 = 0; i3 < terms.length; i3++) {
    let w = terms[i3];
    w = parseNumeric_default(w);
    if (!w || w === "and") {
      continue;
    }
    if (w === "-" || w === "negative") {
      isNegative2 = true;
      continue;
    }
    if (w.charAt(0) === "-") {
      isNegative2 = true;
      w = w.substring(1);
    }
    if (w === "point") {
      sum2 += section_sum(has3);
      let rest = terms.slice(i3 + 1);
      const end2 = rest.findIndex((t) => Object.hasOwn(data_default.multiples, t));
      let scale2 = 1;
      if (end2 !== -1) {
        const mults2 = rest.slice(end2).filter((t) => Object.hasOwn(data_default.multiples, t));
        scale2 = mults2.reduce((n2, t) => n2 * data_default.multiples[t], 1);
        rest = rest.slice(0, end2);
      }
      sum2 += parseDecimals_default(rest);
      sum2 *= scale2 * modifier.amount;
      return isNegative2 ? -sum2 : sum2;
    }
    const fm = w.match(improperFraction);
    if (fm) {
      const num = parseFloat(fm[1].replace(/[, ]/g, ""));
      const denom = parseFloat(fm[2].replace(/[, ]/g, ""));
      if (denom) {
        sum2 += num / denom || 0;
      }
      continue;
    }
    if (Object.hasOwn(data_default.tens, w)) {
      if (has3.ones && Object.keys(has3).length === 1) {
        has3 = { hundreds: has3.ones * 100 };
      }
    }
    if (!validate_default3(w, has3)) {
      return null;
    }
    const kind = ["ones", "teens", "tens"].find((k2) => Object.hasOwn(data_default[k2], w));
    if (/^[0-9.]+$/.test(w)) {
      has3.ones = parseFloat(w);
    } else if (kind) {
      has3[kind] = data_default[kind][w];
    } else if (Object.hasOwn(casualCounts, w)) {
      has3.ones = casualCounts[w];
    } else if (Object.hasOwn(data_default.multiples, w)) {
      let mult = data_default.multiples[w];
      if (mult === last_mult && Object.keys(has3).length > 0) {
        return null;
      }
      if (mult === 100 && terms[i3 + 1] !== void 0) {
        const w2 = terms[i3 + 1];
        if (data_default.multiples[w2]) {
          mult *= data_default.multiples[w2];
          i3 += 1;
        }
      }
      if (last_mult !== null && Object.keys(has3).length === 0) {
        sum2 = (sum2 || 1) * mult;
        last_mult = mult;
        if (mult >= 1e3) {
          last_big = { sum: sum2, mult };
        }
        continue;
      }
      if (last_mult === null || mult < last_mult) {
        sum2 += (section_sum(has3) || 1) * mult;
        last_mult = mult;
        has3 = {};
      } else {
        sum2 += section_sum(has3);
        last_mult = mult;
        let base = 0;
        if (last_big !== null && last_big.mult > mult) {
          base = last_big.sum;
        }
        sum2 = base + (sum2 - base || 1) * mult;
        has3 = {};
      }
      if (mult >= 1e3) {
        last_big = { sum: sum2, mult };
      }
    }
  }
  sum2 += section_sum(has3);
  sum2 *= modifier.amount;
  sum2 *= isNegative2 ? -1 : 1;
  if (sum2 === 0 && Object.keys(has3).length === 0) {
    return null;
  }
  return sum2;
};
var toNumber_default = parse5;

// ../../node_modules/compromise/src/3-three/numbers/fractions/parse.js
var endS = /s$/;
var parseNumber = function(m3) {
  const str = m3.text("reduced");
  return toNumber_default(str);
};
var pair = (num, den) => typeof num === "number" && typeof den === "number" ? { numerator: num, denominator: den } : null;
var mapping2 = {
  half: 2,
  halve: 2,
  quarter: 4
};
var slashForm = function(m3) {
  const str = m3.text("reduced");
  const found = str.match(/^([-+]?[0-9]+(?:\.[0-9]+)?)\/([-+]?[0-9]+)(st|nd|rd|th)?s?$/);
  return found ? pair(Number(found[1]), Number(found[2])) : null;
};
var nOutOfN = function(m3) {
  const found = m3.match("[<num>#Val+] out of every? [<den>#Val+]");
  if (!found.found) {
    return null;
  }
  let { num, den } = found.groups();
  if (!num || !den) {
    return null;
  }
  num = parseNumber(num);
  den = parseNumber(den);
  if (!den) {
    return null;
  }
  return pair(num, den);
};
var compoundOrdinal = (m3) => {
  if (!m3.has("^(a|one) #Card+ #Ord$")) {
    return null;
  }
  const denominator = parseNumber(m3.terms().slice(1));
  if (typeof denominator === "number" && denominator > 0) {
    return { numerator: 1, denominator };
  }
  return null;
};
var nOrinalth = function(m3) {
  const found = m3.match("[<num>(#Card|a)+] [<den>(#Frac && !#Card)+]");
  if (!found.found) {
    return null;
  }
  let { num, den } = found.groups();
  if (num.has("a")) {
    num = 1;
  } else {
    num = parseNumber(num);
  }
  let str = den.text("reduced");
  if (endS.test(str)) {
    str = str.replace(endS, "");
    den = den.replaceWith(str);
  }
  if (Object.hasOwn(mapping2, str)) {
    den = mapping2[str];
  } else {
    den = parseNumber(den);
  }
  return pair(num, den);
};
var oneNth = function(m3) {
  const found = m3.match("^#Ord$");
  if (!found.found) {
    return null;
  }
  if (m3.lookAhead("^of .")) {
    const num = parseNumber(found);
    return {
      numerator: 1,
      denominator: num
    };
  }
  return null;
};
var named = function(m3) {
  const str = m3.text("reduced");
  if (Object.hasOwn(mapping2, str)) {
    return { numerator: 1, denominator: mapping2[str] };
  }
  return null;
};
var round2 = (n2) => {
  const rounded = Math.round(n2 * 1e3) / 1e3;
  if (rounded === 0 && n2 !== 0) {
    return n2;
  }
  return rounded;
};
var parseFraction = function(m3) {
  m3 = m3.clone();
  const res = named(m3) || slashForm(m3) || nOutOfN(m3) || compoundOrdinal(m3) || nOrinalth(m3) || oneNth(m3) || null;
  if (res !== null) {
    if (res.denominator !== 0) {
      res.decimal = res.numerator / res.denominator;
      res.decimal = round2(res.decimal);
    }
  }
  return res;
};
var parse_default4 = parseFraction;

// ../../node_modules/compromise/src/3-three/numbers/numbers/_conversion.js
var shiftDecimal = (num, places3) => {
  const [coefficient, exponent = "0"] = String(num).split("e");
  return Number(`${coefficient}e${Number(exponent) + places3}`);
};
var decimalText = (num) => {
  const str = String(num);
  if (!str.includes("e")) {
    return str;
  }
  const [coefficient, exponent] = str.split("e");
  const sign = num < 0 ? "-" : "";
  const unsigned = coefficient.replace("-", "");
  const digits = unsigned.replace(".", "");
  const point = unsigned.split(".")[0].length + Number(exponent);
  if (point <= 0) {
    return `${sign}0.${"0".repeat(-point)}${digits}`;
  }
  if (point >= digits.length) {
    return sign + digits + "0".repeat(point - digits.length);
  }
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
};
var decimalFraction = (num) => {
  const [coefficient, exponent = "0"] = String(num).split("e");
  const places3 = (coefficient.split(".")[1] || "").length - Number(exponent);
  let numerator = BigInt(coefficient.replace(".", ""));
  let denominator = 1n;
  if (places3 > 0) {
    denominator = 10n ** BigInt(places3);
  } else {
    numerator *= 10n ** BigInt(-places3);
  }
  let divisor = numerator < 0n ? -numerator : numerator;
  for (let remainder = denominator; remainder !== 0n; ) {
    const next = divisor % remainder;
    divisor = remainder;
    remainder = next;
  }
  return [numerator / divisor, denominator / divisor];
};
var isPercent = (value) => value.has("#Pct") || value.after("^per cent").found;
var dropPreSign = (value, str) => {
  const first = value.docs[0][0];
  if (/[-−]$/.test(first.pre) && /^(-|minus\b)/.test(str)) {
    first.pre = first.pre.slice(0, -1);
  }
};
var replaceNumber = (value, str) => {
  const first = value.docs[0][0];
  if (/\.$/.test(first.pre) && /^\d/.test(first.text)) {
    first.pre = first.pre.slice(0, -1);
  }
  dropPreSign(value, str);
  return value.replaceWith(str).firstTerm();
};

// ../../node_modules/compromise/src/3-three/numbers/numbers/_toString.js
var numToString = function(n2) {
  if (n2 < 1e6) {
    return String(n2);
  }
  let str;
  if (typeof n2 === "number") {
    str = n2.toFixed(0);
  } else {
    str = n2;
  }
  if (str.indexOf("e+") === -1) {
    return str;
  }
  return decimalText(str);
};
var toString_default = numToString;

// ../../node_modules/compromise/src/3-three/numbers/numbers/format/toText/data.js
var tens_mapping = tens2.map((w, i3) => [w, (i3 + 2) * 10]).reverse();
var ones_mapping = ["", ...ones2.slice(1), ...teens];
var sequence = [];
for (let i3 = 8; i3 >= 2; i3 -= 1) {
  sequence.push([pow10(3 * i3), bigs[i3]], [pow10(3 * i3 - 1), "hundred " + bigs[i3 - 1]]);
}
sequence.push([1e3, "thousand"], [100, "hundred"], [1, "one"]);

// ../../node_modules/compromise/src/3-three/numbers/numbers/format/toText/index.js
var breakdown_magnitudes = function(num) {
  let working = num;
  const have = [];
  sequence.forEach((a) => {
    if (num >= a[0]) {
      const howmany = Math.floor(working / a[0]);
      working -= howmany * a[0];
      if (howmany) {
        have.push({
          unit: a[1],
          count: howmany
        });
      }
    }
  });
  return have;
};
var breakdown_hundred = function(num) {
  const arr = [];
  if (num > 100) {
    return arr;
  }
  tens_mapping.forEach(([word, val]) => {
    if (num >= val) {
      num -= val;
      arr.push(word);
    }
  });
  if (ones_mapping[num]) {
    arr.push(ones_mapping[num]);
  }
  return arr;
};
var handle_decimal = (num) => {
  const decimal = toString_default(num).match(/\.([0-9]+)/);
  if (!decimal) {
    return [];
  }
  return ["point", ...[...decimal[1]].map((d) => ones2[d])];
};
var toText3 = function(obj) {
  let num = obj.num;
  if (num === 0 || num === "0") {
    return "zero";
  }
  if (num > 1e21) {
    num = toString_default(num);
  }
  let arr = [];
  if (num < 0) {
    arr.push("minus");
    num = Math.abs(num);
  }
  const units = breakdown_magnitudes(num);
  units.forEach((u, i3) => {
    let unit_name = u.unit;
    if (unit_name === "one") {
      unit_name = "";
      if (arr.length > 1) {
        arr.push("and");
      }
    }
    const next = units[i3 + 1];
    if (next && unit_name === "hundred " + next.unit) {
      unit_name = "hundred";
    }
    arr = arr.concat(breakdown_hundred(u.count));
    arr.push(unit_name);
  });
  arr = arr.concat(handle_decimal(num));
  arr = arr.filter((s) => s);
  if (arr.length === 0) {
    arr[0] = "";
  }
  return arr.join(" ");
};
var toText_default = toText3;

// ../../node_modules/compromise/src/3-three/numbers/fractions/_lib.js
var isValid2 = (obj) => obj && Number.isFinite(obj.numerator) && Number.isFinite(obj.denominator) && obj.denominator !== 0;
var replaceFraction = (view, str) => {
  const [sentence, start2] = view.fullPointer[0];
  if (str.startsWith("minus ")) {
    const first = view.docs[0][0];
    first.pre = first.pre.replace(/-$/, "");
  }
  const replacement = view.fromText(str).tag(Frac);
  const end2 = start2 + replacement.wordCount();
  view.replaceWith(replacement);
  return view.toView([[sentence, start2, end2]]);
};

// ../../node_modules/compromise/src/3-three/numbers/fractions/convert/toCardinal.js
var toCardinal = function(obj) {
  if (!isValid2(obj)) {
    return "";
  }
  const a = toText_default({ num: obj.numerator });
  const b2 = toText_default({ num: obj.denominator });
  return `${a} out of ${b2}`;
};
var toCardinal_default = toCardinal;

// ../../node_modules/compromise/src/3-three/numbers/numbers/format/toOrdinal/textOrdinal.js
var textOrdinal = (obj) => {
  const words2 = toText_default(obj).split(" ");
  words2[words2.length - 1] = ordinal(words2[words2.length - 1]);
  return words2.join(" ");
};
var textOrdinal_default = textOrdinal;

// ../../node_modules/compromise/src/3-three/numbers/fractions/convert/toOrdinal.js
var toOrdinal = function(obj) {
  if (!isValid2(obj)) {
    return "";
  }
  const start2 = toText_default({ num: obj.numerator });
  let end2 = textOrdinal_default({ num: obj.denominator });
  if (obj.denominator === 2) {
    end2 = "half";
  }
  if (start2 && end2) {
    if (Math.abs(obj.numerator) !== 1) {
      end2 = end2 === "half" ? "halves" : end2 + "s";
    }
    return `${start2} ${end2}`;
  }
  return "";
};
var toOrdinal_default = toOrdinal;

// ../../node_modules/compromise/src/3-three/numbers/fractions/api.js
var convert2 = (view, n2, fn) => view.getNth(n2).map((m3) => {
  const str = fn(parse_default4(m3), m3);
  return str ? replaceFraction(m3, str) : m3;
});
var plugin4 = function(View2) {
  class Fractions extends View2 {
    parse(n2) {
      return this.getNth(n2).map(parse_default4, []);
    }
    json(n2) {
      return jsonWith(this, n2, "fraction", parse_default4);
    }
    // become 0.5
    toDecimal(n2) {
      const result = this.getNth(n2).map((m3) => {
        const obj = parse_default4(m3);
        if (!isValid2(obj)) {
          return m3;
        }
        const decimal = obj.numerator / obj.denominator;
        return replaceNumber(m3, decimalText(decimal)).tag(Numeric).unTag(Frac);
      });
      return result.numbers();
    }
    toFraction(n2) {
      const result = this.getNth(n2).map((m3) => {
        const obj = parse_default4(m3);
        if (isValid2(obj)) {
          const str = `${decimalText(obj.numerator)}/${decimalText(obj.denominator)}`;
          return replaceFraction(m3, str);
        }
        return m3;
      });
      return result.fractions();
    }
    toOrdinal(n2) {
      return convert2(this, n2, (obj, m3) => {
        let str = toOrdinal_default(obj);
        if (str && m3.after("^#NN").found) {
          str += " of";
        }
        return str;
      });
    }
    toCardinal(n2) {
      return convert2(this, n2, toCardinal_default);
    }
    // spell it out - '1/2' -> 'one half'
    toText(n2) {
      return convert2(this, n2, toOrdinal_default);
    }
    toPercentage(n2) {
      return this.getNth(n2).map((m3) => {
        const obj = parse_default4(m3);
        if (!isValid2(obj)) {
          return m3;
        }
        const { numerator, denominator } = obj;
        let percent = numerator;
        if (denominator !== 100) {
          percent = numerator / denominator * 100;
          percent = Math.round(percent * 100) / 100;
        }
        return replaceNumber(m3, `${decimalText(percent)}%`);
      });
    }
  }
  lib_default16(Fractions, "Fractions");
  Fractions.prototype.get = Fractions.prototype.parse;
  View2.prototype.fractions = select_default(Fractions, find_default2, true);
};
var api_default14 = plugin4;

// ../../node_modules/compromise/src/3-three/numbers/numbers/find.js
var ones3 = ones2.slice(1).join("|");
var tens3 = tens2.join("|") + "|fourty";
var teens2 = teens.join("|");
var splitNumbers = function(m3) {
  m3 = m3.splitAfter("@hasDash");
  while (m3.has(`(${tens3}) (${tens3}|${teens2})`)) {
    m3 = m3.splitBefore(`(${tens3}) [(${tens3}|${teens2})]`, 0);
  }
  if (m3.has("#Numeric #Numeric")) {
    if (m3.has("#Val @hasComma #Val")) {
      m3.splitAfter("@hasComma");
    } else if (m3.has("#Numeric #Frac")) {
      m3.splitAfter("#Numeric #Frac");
    } else {
      m3 = m3.splitAfter("#Numeric");
    }
  }
  if (m3.has("#Val #Val #Val") && !m3.has("#Mult")) {
    if (m3.has("(" + tens3 + ") #Card #Card")) {
      m3 = m3.splitAfter("(" + tens3 + ") #Card");
    }
  }
  if (m3.has("#Val #Val")) {
    if (m3.has("#Numeric #Numeric")) {
      m3 = m3.splitOn("#Year");
    }
    const double = m3.match("#Card #Card");
    if (double.found && !m3.has("(point|decimal|#Frac)")) {
      if (!double.has("#Card (#Mult|point|decimal)")) {
        const noMultiple = m3.has(`(${ones3}) (${tens3})`);
        const tensVal = double.has("(" + tens3 + ") #Card");
        const multVal = double.has("#Mult #Val");
        if (!noMultiple && !tensVal && !multVal) {
          double.terms().forEach((d) => {
            m3 = m3.splitOn(d);
          });
        }
      }
    }
    if (m3.match("#Ord #Ord").match("#TxtNum").found && !m3.has("#Mult")) {
      m3 = m3.splitAfter("#Ord");
    }
    if (m3.has("#Time")) {
      m3 = m3.splitOn("#Time");
    }
    m3 = m3.splitBefore("#Ord [#Card]", 0);
    if (m3.has("#TxtNum #Numeric") && !m3.has("(" + tens3 + "|#Mult)")) {
      m3 = m3.splitBefore("#TxtNum #Numeric");
    }
  }
  m3 = m3.splitAfter("#NumberRange");
  m3 = m3.splitBefore("#Year");
  return m3;
};
var findNumbers = function(doc) {
  const m3 = doc.match("#Val+");
  const years = m3.match("(#Year && #TxtNum)+").splitAfter("(@hasComma|@hasDash)");
  if (!years.found) {
    return splitNumbers(m3);
  }
  const ptrs = splitNumbers(m3.not(years)).fullPointer.concat(years.fullPointer);
  return m3.toView(ptrs.sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]));
};
var find_default3 = findNumbers;

// ../../node_modules/compromise/src/3-three/numbers/numbers/parse/index.js
var parseYear = (str) => spokenYear_default(str.split(/[ -]/));
var numericForm = /^([^0-9.]*)(\.?[0-9][0-9,.]*)([^0-9,.].*)?$/;
var parseNumeric2 = function(str, m3) {
  str = str.replace(/,/g, "");
  const found = str.match(numericForm);
  if (found === null || m3.length >= 2) {
    return null;
  }
  let [, prefix6, num, suffix3 = ""] = found;
  num = Number(num);
  if (Number.isNaN(num)) {
    num = null;
  } else if (/[-−]/.test(prefix6)) {
    num = -num || 0;
  }
  prefix6 = prefix6.replace(/[-−]/, "");
  if (suffix3 === "st" || suffix3 === "nd" || suffix3 === "rd" || suffix3 === "th") {
    suffix3 = "";
  }
  if (suffix3 === "'s" && m3.has("#Poss")) {
    suffix3 = "";
  }
  return {
    prefix: prefix6,
    num,
    suffix: suffix3
  };
};
var parseNumber2 = function(m3) {
  if (typeof m3 === "string") {
    return { num: parseYear(m3) ?? toNumber_default(m3) };
  }
  let str = m3.text("reduced");
  if (m3.text().includes("\xA2")) {
    str = str.replace(/^c|c$/g, "\xA2");
  }
  const unit2 = m3.growRight("#Unit").match("#Unit$").text("machine");
  const hasComma = /[0-9],[0-9]/.test(m3.text("text"));
  if (m3.terms().length === 1 && !m3.has("#Mult")) {
    if (m3.has("#Frac") && str.includes("/")) {
      const frac = parse_default4(m3);
      let num2 = null;
      if (frac && frac.decimal !== void 0) {
        num2 = frac.decimal;
      }
      return { prefix: "", num: num2, suffix: "", hasComma, unit: unit2 };
    }
    const res = parseNumeric2(str, m3);
    if (res !== null) {
      res.hasComma = hasComma;
      res.unit = unit2;
      return res;
    }
  }
  if (m3.has("(#Frac && !(a|of|and)) (#Mult && !#Frac && !#Ord)+$")) {
    const mult = m3.match("(#Mult && !#Frac && !#Ord)+$");
    const lead = parseNumber2(m3.not(mult));
    const scale2 = toNumber_default(mult.text("reduced"));
    if (lead.num !== null && scale2) {
      return { ...lead, num: lead.num * scale2, unit: unit2 };
    }
  }
  let frPart = m3.match("#Frac{2,}$");
  frPart = frPart.found ? frPart : m3.match("^#Frac$");
  let fraction = null;
  if (frPart.found) {
    if (frPart.has("#Val and #Val #Frac")) {
      frPart = frPart.match("and #Val #Frac");
    }
    fraction = parse_default4(frPart);
    m3 = m3.not(frPart);
    m3 = m3.not("and$");
    str = m3.text("reduced");
  }
  let num = null;
  if (str) {
    let end2 = str.length;
    for (; end2 > 0 && /[.!?]/.test(str[end2 - 1]); end2 -= 1) {
    }
    const text = str.slice(0, end2);
    const year = m3.has("#Year") ? parseYear(text) : null;
    num = year ?? toNumber_default(text);
    if (num === 0) {
      num = 0;
    }
  }
  if (fraction && fraction.decimal) {
    num = (num || 0) + fraction.decimal;
  }
  return {
    hasComma,
    prefix: "",
    num,
    suffix: "",
    isOrdinal: m3.has("#Ord"),
    isText: m3.has("#TxtNum"),
    isFraction: m3.has("#Frac"),
    isMoney: m3.has("#Money"),
    unit: unit2
  };
};
var parse_default5 = parseNumber2;

// ../../node_modules/compromise/src/3-three/numbers/numbers/format/toOrdinal/numOrdinal.js
var numOrdinal = function(obj) {
  const num = obj.num;
  if (!num && num !== 0) {
    return null;
  }
  const str = toString_default(num);
  return str + ordSuffix(str);
};
var numOrdinal_default = numOrdinal;

// ../../node_modules/compromise/src/3-three/numbers/numbers/format/suffix.js
var prefixes = {
  "\xA2": "cents",
  $: "dollars",
  "\xA3": "pounds",
  "\xA5": "yen",
  "\u20AC": "euros",
  "\u20A1": "col\xF3n",
  "\u0E3F": "baht",
  "\u20AD": "kip",
  "\u20A9": "won",
  "\u20B9": "rupees",
  "\u20BD": "ruble",
  "\u20BA": "liras"
};
var suffixes5 = {
  "%": "percent",
  "\xA2": "cents",
  // s: 'seconds',
  // cm: 'centimetres',
  // km: 'kilometres',
  // ft: 'feet',
  "\xB0": "degrees"
};
var addSuffix = function(obj) {
  const res = {
    suffix: "",
    prefix: obj.prefix
  };
  if (Object.hasOwn(prefixes, obj.prefix)) {
    res.suffix += " " + prefixes[obj.prefix];
    res.prefix = "";
  }
  if (Object.hasOwn(suffixes5, obj.suffix)) {
    res.suffix += " " + suffixes5[obj.suffix];
  }
  if (res.suffix && obj.num === 1) {
    res.suffix = res.suffix.replace(/s$/, "");
  }
  if (res.suffix && /^(cad|usd)$/i.test(obj.suffix)) {
    res.suffix += " " + obj.suffix.toUpperCase();
  }
  if (!res.suffix && obj.suffix) {
    res.suffix += " " + obj.suffix;
  }
  return res;
};
var suffix_default2 = addSuffix;

// ../../node_modules/compromise/src/3-three/numbers/numbers/format/index.js
var withPrefix = (obj, str) => {
  if (str.startsWith("-")) {
    return "-" + obj.prefix + str.slice(1);
  }
  return obj.prefix + str;
};
var format = function(obj, fmt2) {
  if (fmt2 === "TextOrdinal") {
    const { prefix: prefix6, suffix: suffix3 } = suffix_default2(obj);
    return prefix6 + textOrdinal_default(obj) + suffix3;
  }
  if (fmt2 === Ord) {
    return withPrefix(obj, numOrdinal_default(obj)) + obj.suffix;
  }
  if (fmt2 === "TextCardinal") {
    const { prefix: prefix6, suffix: suffix3 } = suffix_default2(obj);
    return prefix6 + toText_default(obj) + suffix3;
  }
  let num = obj.num;
  if (obj.hasComma) {
    num = num.toLocaleString();
  }
  return withPrefix(obj, String(num)) + obj.suffix;
};
var format_default = format;

// ../../node_modules/compromise/src/3-three/numbers/numbers/isUnit.js
var toUnits = function(input) {
  if (typeof input === "string" || typeof input === "number") {
    return /* @__PURE__ */ new Set([String(input)]);
  }
  if (Array.isArray(input)) {
    return new Set(input.map(String));
  }
  return new Set(Object.keys(input || {}).filter((k2) => input[k2] === true));
};
var isUnit = function(doc, input = {}) {
  const units = toUnits(input);
  return doc.filter((p4) => {
    const { unit: unit2 } = parse_default5(p4);
    return Boolean(unit2) && units.has(unit2);
  });
};
var isUnit_default = isUnit;

// ../../node_modules/compromise/src/3-three/numbers/numbers/isValid.js
var mults = {};
bigs.forEach((w, i3) => {
  mults[w] = i3 === 0 ? 100 : pow10(3 * i3);
});
var goodCommas = /^[0-9]{1,3}(,[0-9]{3})+$|^[0-9]{1,2}(,[0-9]{2})*,[0-9]{3}$/;
var numericForm2 = new RegExp("^[-+]?\\p{Sc}?([0-9][0-9,]*)(\\.[0-9]+)?(?:\\/([0-9]+))?([a-z]*)", "iu");
var badPre = /[-+]\s?[-+]|%/;
var zeroWord = /\b(zero|nil|nought|naught|zilch|oh)\b|(^|[^0-9.])0/;
var checkNumeric = (term) => {
  if (badPre.test(term.pre)) {
    return false;
  }
  const m3 = term.text.match(numericForm2);
  if (!m3) {
    return true;
  }
  const [, intPart, decimal, denom, letters] = m3;
  const digits = intPart.replace(/,/g, "");
  if (digits.length > 15) {
    return false;
  }
  if (intPart.includes(",") && !goodCommas.test(intPart)) {
    return false;
  }
  if (denom !== void 0 && /^0+$/.test(denom)) {
    return false;
  }
  const suffix3 = letters.toLowerCase().replace(/^rth/, "th");
  if (/^(st|nd|rd|th)/.test(suffix3)) {
    const base = denom === void 0 ? digits : denom;
    if (decimal && denom === void 0 || term.text.startsWith("-") || /^0+$/.test(base)) {
      return false;
    }
    const want = ordSuffix(base);
    if (suffix3 !== want && suffix3 !== want + "s") {
      return false;
    }
  }
  return true;
};
var checkMultiples = (terms) => {
  let last = null;
  for (let i3 = 0; i3 < terms.length; i3 += 1) {
    const w = terms[i3].normal;
    if (Object.hasOwn(mults, w)) {
      if (last !== null && mults[w] <= last) {
        return false;
      }
      last = mults[w];
    } else if (w !== "a" && w !== "and") {
      last = null;
    }
  }
  return true;
};
var isValid3 = function(doc) {
  return doc.filter((val) => {
    const terms = val.docs[0];
    const { num } = parse_default5(val);
    if (typeof num !== "number" || !Number.isFinite(num)) {
      return false;
    }
    if (num === 0 && !zeroWord.test(terms.map((t) => t.normal).join(" "))) {
      return false;
    }
    if (terms.length === 1 && /[0-9]/.test(terms[0].text)) {
      return checkNumeric(terms[0]);
    }
    return checkMultiples(terms);
  });
};
var isValid_default = isValid3;

// ../../node_modules/compromise/src/3-three/numbers/numbers/agree.js
var boundary = /[,;:.!?]/;
var agree = (value, singular) => {
  if (boundary.test(value.docs[0].at(-1).post)) {
    return;
  }
  const phrase = value.after("^(#Adv|#Adj)+? #NN");
  if (!phrase.found || phrase.docs[0].slice(0, -1).some((term) => boundary.test(term.post))) {
    return;
  }
  const noun2 = phrase.lastTerm();
  if (noun2.has("(#Pron|#Poss|#Prop|#Uncountable)")) {
    return;
  }
  const tag = singular ? "Singular" : Plur;
  if (noun2.has("#" + tag)) {
    return;
  }
  const { methods: methods20, model: model5 } = value.world;
  const transform = methods20.two.transform.noun;
  const word = noun2.text("normal");
  const countModel = { two: { irregularPlurals: model5.two.irregularPlurals, uncountable: {} } };
  let str = singular ? transform.toSingular(word, model5) : transform.toPlural(word, countModel);
  const original = noun2.docs[0][0].text;
  if (original === original.toUpperCase()) {
    str = str.toUpperCase();
  } else if (new RegExp("^\\p{Lu}", "u").test(original)) {
    str = str.charAt(0).toUpperCase() + str.slice(1);
  }
  noun2.replaceWith(str, { tags: true }).tag(tag);
};
var agree_default = agree;

// ../../node_modules/compromise/src/3-three/numbers/numbers/_lib.js
var convert3 = (view, tag, skip, getFormat) => {
  const res = view._mapNumbers((val) => {
    if (skip(val)) {
      return val;
    }
    if (val.has("(#Frac && #Numeric)")) {
      return tag === TxtNum ? val.fractions().toText() : val;
    }
    const obj = parse_default5(val);
    if (obj.num === null) {
      return val;
    }
    const str = format_default(obj, getFormat(val));
    dropPreSign(val, str);
    val.replaceWith(str, { tags: true, possessives: true });
    val.not("#Currency").tag(tag);
    if (tag === Ord || tag === Card) {
      agree_default(val, tag === Ord || obj.num === 1);
    }
    return val;
  });
  return view.update(res.pointer);
};
var lib_default20 = convert3;

// ../../node_modules/compromise/src/3-three/numbers/numbers/toFraction.js
var toFraction = (numbers) => {
  const result = numbers.map((value) => {
    if (value.has("#Frac")) {
      return value;
    }
    const { num } = parse_default5(value);
    if (!Number.isFinite(num) || value.has("#Money")) {
      return value.none();
    }
    let str;
    if (isPercent(value)) {
      str = `${decimalText(num)}/100`;
      value = value.growRight("(percent|percentage|per cent)");
    } else {
      str = decimalFraction(num).join("/");
    }
    const phrase = replaceNumber(value, str);
    phrase.unTag("Percent").tag([Frac, Numeric]);
    return phrase;
  });
  return result.fractions();
};
var toFraction_default = toFraction;

// ../../node_modules/compromise/src/3-three/numbers/numbers/toPercentage.js
var toPercentage = (numbers) => {
  const result = numbers.map((value) => {
    if (isPercent(value)) {
      return value;
    }
    const num = shiftDecimal(parse_default5(value).num, 2);
    if (!Number.isFinite(num) || value.has("#Money")) {
      return value.none();
    }
    return replaceNumber(value, `${decimalText(num)}%`).tag(["Percent", Numeric]);
  });
  return result.percentages();
};
var toPercentage_default = toPercentage;

// ../../node_modules/compromise/src/3-three/numbers/numbers/toDecimal.js
var toDecimal = (numbers) => {
  const result = numbers.map((value) => {
    if (!isPercent(value)) {
      return value;
    }
    const num = shiftDecimal(parse_default5(value).num, -2);
    if (!Number.isFinite(num)) {
      return value.none();
    }
    const phrase = value.growRight("(percent|percentage|per cent)");
    return replaceNumber(phrase, decimalText(num)).unTag("Percent").tag([Card, Numeric]);
  });
  return result.numbers();
};
var toDecimal_default = toDecimal;

// ../../node_modules/compromise/src/3-three/numbers/numbers/api.js
var ordinalMatch = "#Ord";
var textValueMatch = "#TxtNum";
var textOrdinal2 = "TextOrdinal";
var textCardinal = "TextCardinal";
var keep = { tags: true, possessives: true };
var edit = (view, n2, apply2, operation, isText, strip5) => {
  if (typeof n2 === "string") {
    n2 = parse_default5(n2).num;
  }
  const res = view._mapNumbers((val) => {
    const obj = parse_default5(val);
    apply2(obj, n2);
    if (obj.num === null) {
      return val;
    }
    let fmt2 = val.has(ordinalMatch) ? Ord : Card;
    if (isText(val, obj)) {
      fmt2 = val.has(ordinalMatch) ? textOrdinal2 : textCardinal;
    }
    const str = format_default(obj, fmt2);
    if (strip5) {
      val = val.not(strip5);
    }
    dropPreSign(val, str);
    val.replaceWith(str, keep);
    return val;
  }, (num) => operation(num, n2));
  return view.update(res.pointer);
};
var addMethod = function(View2) {
  class Numbers extends View2 {
    parse(n2) {
      return this.getNth(n2).map(parse_default5, []);
    }
    get(n2) {
      return this.getNth(n2).map(parse_default5, []).map((o) => o.num);
    }
    json(n2) {
      return jsonWith(this, n2, "number", (p5) => {
        const { prefix: prefix6, num, suffix: suffix3, hasComma, unit: unit2 } = parse_default5(p5);
        return { prefix: prefix6, num, suffix: suffix3, hasComma, unit: unit2 };
      });
    }
    /** any known measurement unit, for the number */
    units() {
      return this.growRight("#Unit").match("#Unit$");
    }
    /** return values that match a given unit */
    isUnit(allowed) {
      return isUnit_default(this, allowed);
    }
    /** drop matches that do not parse to a usable number - like 'thousand thousand' or '21th' */
    isValid() {
      return isValid_default(this);
    }
    /** return only ordinal numbers */
    isOrdinal() {
      return this.if(ordinalMatch);
    }
    /** return only cardinal numbers*/
    isCardinal() {
      return this.if("#Card");
    }
    /** convert to numeric form like '8' or '8th' */
    toNumber() {
      return lib_default20(
        this,
        Numeric,
        () => !this.has(textValueMatch),
        (val) => val.has(ordinalMatch) ? Ord : Card
      );
    }
    /** add commas, or nicer formatting for numbers */
    toLocaleString() {
      const m3 = this;
      const res = m3._mapNumbers((val) => {
        const obj = parse_default5(val);
        if (obj.num === null || val.has("(#Frac && #Numeric)")) {
          return val;
        }
        let num = obj.num.toLocaleString();
        if (val.has(ordinalMatch)) {
          num += format_default(obj, Ord).slice(obj.prefix.length).match(/[a-z]+/)[0];
        }
        const str = obj.prefix + num + obj.suffix;
        dropPreSign(val, str);
        val.replaceWith(str, keep);
        return val;
      });
      return this.update(res.pointer);
    }
    /** convert to numeric form like 'eight' or 'eighth' */
    toText() {
      return lib_default20(
        this,
        TxtNum,
        (val) => val.has(textValueMatch),
        (val) => val.has(ordinalMatch) ? textOrdinal2 : textCardinal
      );
    }
    /** convert ordinal to cardinal form, like 'eight', or '8' */
    toCardinal() {
      return lib_default20(
        this,
        Card,
        (val) => !val.has(ordinalMatch),
        (val) => val.has(textValueMatch) ? textCardinal : Card
      );
    }
    /** convert cardinal to ordinal form, like 'eighth', or '8th' */
    toOrdinal() {
      return lib_default20(
        this,
        Ord,
        (val) => val.has(ordinalMatch),
        (val) => val.has(textValueMatch) ? textOrdinal2 : Ord
      );
    }
    toFraction() {
      return toFraction_default(this);
    }
    toPercentage() {
      return toPercentage_default(this);
    }
    toDecimal() {
      return toDecimal_default(this);
    }
    /** set these number to n */
    set(n2) {
      if (n2 === void 0) {
        return this;
      }
      const set = (obj, to) => {
        obj.num = to;
      };
      return edit(this, n2, set, (num, to) => to, (val) => val.has(textValueMatch), "#Currency");
    }
    add(n2) {
      if (!n2) {
        return this;
      }
      const add2 = (obj, by2) => {
        if (obj.num !== null) {
          obj.num = this._add(obj.num, by2);
        }
      };
      return edit(this, n2, add2, (num, by2) => this._add(num, by2), (val, obj) => obj.isText);
    }
    /** decrease each number by n*/
    subtract(n2) {
      return this.add(n2 * -1);
    }
    /** increase each number by 1 */
    increment() {
      return this.add(1);
    }
    /** decrease each number by 1 */
    decrement() {
      return this.add(-1);
    }
    // Subclasses may supply decimal arithmetic.
    _add(a, b2) {
      return a + b2;
    }
    // Let subclasses select the numeric portion of each phrase.
    _mapNumbers(fn) {
      return this.map(fn);
    }
  }
  lib_default16(Numbers, "Numbers");
  const p4 = Numbers.prototype;
  const compare = (test) => function(a, b2) {
    return this.filter((val) => test(val.get(0)[0], a, b2));
  };
  const equals = compare((num, n2) => num === n2);
  const between = compare((num, min2, max3) => num > min2 && num < max3);
  Object.assign(p4, {
    isEqual: equals,
    equals,
    greaterThan: compare((num, n2) => num > n2),
    lessThan: compare((num, n2) => num < n2),
    between,
    isBetween: between,
    toNice: p4.toLocaleString,
    minus: p4.subtract,
    plus: p4.add
  });
  View2.prototype.numbers = select_default(Numbers, find_default3, true);
  View2.prototype.percentages = select_default(Numbers, (doc) => find_default3(doc).filter(isPercent), true);
  View2.prototype.values = View2.prototype.numbers;
  return Numbers;
};
var api_default15 = addMethod;

// ../../node_modules/compromise/src/3-three/numbers/money/currencies.js
var currencies_default = [
  ["\xA2", "cent"],
  ["$", "dollar"],
  ["\u20AC", "EUR"],
  ["\xA3", "GBP"],
  ["\xA5", "JPY/YEN"],
  ["\u20B9", "INR"],
  ["\u20A9", "KRW"],
  ["\u20BD", "RUB"],
  ["\u20BA", "TRY"],
  ["\u0E3F", "THB"],
  ["\u20AA", "ILS"],
  ["\u20AB", "VND"],
  ["\u20B4", "UAH"],
  ["\u20A6", "NGN"],
  ["\u20B1", "PHP"],
  ["\u20B2", "PYG"],
  ["\u20A1", "CRC"],
  ["\uFDFC", "SAR"],
  ["\u20AE", "MNT"],
  ["\u20AD", "LAK"],
  ["\u20B8", "KZT"]
];

// ../../node_modules/compromise/src/3-three/numbers/money/_currency.js
var codes = "(cad|usd)";
var currencyMatch = "(#Currency|cad|usd)";
var minorUnits = {
  dollar: "cent",
  usd: "cent",
  cad: "cent",
  aud: "cent",
  nzd: "cent",
  hkd: "cent",
  sgd: "cent",
  euro: "cent",
  eur: "cent",
  pound: "penny",
  gbp: "penny"
};
var decimalName = (word, world2) => {
  const rates = world2.model.three.decimalCurrencies;
  const singular = { pennies: "penny", paise: "paisa" }[word] || word.replace(/s$/, "");
  if (Object.hasOwn(rates, word)) {
    return word;
  }
  return Object.hasOwn(rates, singular) ? singular : "";
};
var qualifier = (value) => value.text().match(/(?:^|[^a-z])(cad|usd)(?=$|[^a-z])/i)?.[1].toUpperCase() || "";
var unit = (value) => {
  const m3 = value.clone();
  let name = m3.match("#Currency").not(codes).first().nouns().toSingular().text("normal");
  if (!name) {
    name = m3.match("(pound|pounds)").nouns().toSingular().text("normal");
  }
  if (!name) {
    name = decimalName(m3.not(codes).docs[0]?.at(-1)?.normal || "", m3.world);
  }
  if (!name) {
    const str = m3.text();
    const found = currencies_default.find(([sym]) => str.includes(sym));
    if (found) {
      name = found[1];
    }
  }
  return name || qualifier(value);
};
var isMinor = (major, minor) => {
  const expected = minorUnits[unit(major).toLowerCase()];
  let minorUnit = unit(minor).toLowerCase();
  if (minorUnit === "pence") {
    minorUnit = "penny";
  }
  return Boolean(expected && expected === minorUnit);
};
var multiplier = (value) => {
  const name = unit(value).toLowerCase();
  const rate = value.world.model.three.decimalCurrencies[name];
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
};
var currency = (value) => qualifier(value) || unit(value);

// ../../node_modules/compromise/src/3-three/numbers/money/_candidates.js
var isQualifier = (word) => word === "cad" || word === "usd";
var tagCents = (doc) => {
  if (doc.docs.some((terms) => terms.some((term) => term.text.includes("\xA2") || term.pre.includes("\xA2")))) {
    doc.terms().filter((term) => /^¢[0-9]/.test(term.text())).tag(["Money", Val]);
  }
};
var isCandidate = (value) => {
  const [sentence, start2, end2] = value.fullPointer[0];
  const terms = value.document[sentence];
  for (let i3 = Math.max(0, start2 - 2); i3 < Math.min(terms.length, end2 + 1); i3 += 1) {
    const term = terms[i3];
    if (term.tags.has("Money") || term.tags.has("Currency") || isQualifier(term.normal) || isQualifier(term.machine) || isQualifier(term.text) || term.alias?.some(isQualifier) || (term.pre + term.text + term.post).includes("\xA2") || decimalName(term.normal, value.world)) {
      return true;
    }
  }
  return false;
};

// ../../node_modules/compromise/src/3-three/numbers/money/find.js
var grow2 = (m3) => m3.growRight(currencyMatch + "+").growLeft(codes);
var parts2 = (doc) => {
  tagCents(doc);
  return doc.numbers().map((value) => {
    if (!isCandidate(value)) {
      return value.none();
    }
    let number = value.not("^and").not("and$");
    if (number.text("reduced") === "minus") {
      return number.none();
    }
    number = number.growLeft("minus");
    if (!number.found) {
      return number;
    }
    let amount = grow2(number);
    const [sentence, start2, end2] = number.fullPointer[0];
    const next = number.document[sentence][end2];
    const configured = next && decimalName(next.normal, number.world);
    if (configured) {
      amount = grow2(number.toView([[sentence, start2, end2 + 1]]));
    }
    if (!configured && !number.has("#Money") && !amount.has(currencyMatch) && !number.text().includes("\xA2")) {
      return number.none();
    }
    return amount.growRight("(pound|pounds)").growRight(codes);
  });
};
var find5 = (doc) => {
  const pointers = [];
  let previous = null;
  parts2(doc).forEach((amount) => {
    const pointer = amount.fullPointer[0];
    const [sentence, start2, end2] = pointer;
    if (previous) {
      const [prevSentence2, , prevEnd] = previous.fullPointer[0];
      const gap = doc.document[sentence].slice(prevEnd, start2).map((t) => t.normal).join(" ");
      if (sentence === prevSentence2 && start2 >= prevEnd && (gap === "" || gap === "and") && isMinor(previous, amount)) {
        const prev = pointers.pop();
        pointers.push([sentence, prev[1], end2]);
        previous = null;
        return;
      }
    }
    pointers.push(pointer);
    previous = amount;
  });
  return doc.toView(pointers);
};
var numberOf = (amount) => {
  let number = amount.not(currencyMatch).not("(pound|pounds)$");
  const last = number.lastTerm();
  if (decimalName(last.text("normal"), amount.world)) {
    number = number.not(last);
  }
  return number;
};
var find_default4 = find5;

// ../../node_modules/compromise/src/3-three/numbers/money/_decimal.js
var places2 = (value) => (String(value).split(".")[1] || "").length;
var add = (a, b2) => {
  if (!Number.isFinite(a) || !Number.isFinite(b2)) {
    return a + b2;
  }
  const strings = [decimalText(a), decimalText(b2)];
  const precision = Math.max(...strings.map(places2));
  const integers = strings.map((str) => {
    const [whole, fraction = ""] = str.split(".");
    return BigInt(whole + fraction.padEnd(precision, "0"));
  });
  return Number(`${integers[0] + integers[1]}e-${precision}`);
};
var fixed = (num, precision) => {
  const [whole, fraction = ""] = decimalText(Math.abs(num)).split(".");
  const digits = fraction.padEnd(precision, "0");
  if (digits) {
    return whole + "." + digits;
  }
  return whole;
};
var scale = (num, rate, inverse = false) => {
  const exponent = Math.log10(rate);
  if (Number.isInteger(exponent)) {
    return shiftDecimal(num, inverse ? -exponent : exponent);
  }
  const [a, b2] = decimalFraction(num);
  const [c, d] = decimalFraction(rate);
  if (inverse) {
    return Number(a * d) / Number(b2 * c);
  }
  return Number(a * c) / Number(b2 * d);
};

// ../../node_modules/compromise/src/3-three/numbers/money/parse.js
var isNegative = (value) => /^(?:minus\b|[+\p{Currency_Symbol}\s]*-)/u.test(value.text("reduced"));
var parse6 = (value) => {
  const amounts = parts2(value);
  const first = amounts.eq(0);
  let num = parse_default5(numberOf(first)).num;
  const negative = isNegative(first);
  num = scale(Math.abs(num), multiplier(first));
  if (amounts.length === 2 && isMinor(first, amounts.eq(1))) {
    num = add(num, scale(parse_default5(numberOf(amounts.eq(1))).num, multiplier(amounts.eq(1))));
  }
  if (negative && num !== 0) {
    num *= -1;
  }
  return { currency: currency(value), num };
};
var parse_default6 = parse6;

// ../../node_modules/compromise/src/3-three/numbers/money/arithmetic.js
var replace = (part, amount, negative = amount < 0) => {
  const number = numberOf(part);
  const obj = parse_default5(number);
  const [sentence, start2, end2] = part.fullPointer[0];
  const before2 = part.document[sentence].length;
  obj.num = Math.abs(amount);
  obj.prefix = obj.prefix.replace(/[-+]/g, "");
  let str;
  if (number.has("#TxtNum")) {
    str = format_default(obj, "TextCardinal");
    if (negative) {
      str = "minus " + str;
    }
  } else {
    let text = number.text("reduced");
    if (number.text().includes("\xA2")) {
      text = text.replace(/c$/, "\xA2");
    }
    const original = text.match(/\d[\d,]*(?:\.\d+)?/);
    const precision = original ? places2(original[0]) : 0;
    if (original) {
      obj.prefix = text.slice(0, original.index).replace(/[-+]/g, "");
      obj.suffix = text.slice(original.index + original[0].length);
    }
    let digits = fixed(amount, precision);
    if (obj.hasComma) {
      const [whole, fraction] = digits.split(".");
      const lead = whole.length % 3 || 3;
      digits = whole.slice(0, lead) + whole.slice(lead).replace(/\d{3}/g, ",$&");
      if (fraction !== void 0) {
        digits += "." + fraction;
      }
    }
    const code = number.text().match(/(cad|usd)\b/i)?.[0];
    if (code) {
      obj.suffix = obj.suffix.replace(/cad|usd/i, code);
    }
    str = obj.prefix + digits + obj.suffix;
    if (negative) {
      str = "-" + str;
    }
  }
  const first = number.docs[0][0];
  first.pre = first.pre.replace(/[-+]$/, "");
  number.replaceWith(str, { tags: true });
  const delta = part.document[sentence].length - before2;
  const updated = part.update([[sentence, start2, end2 + delta]]);
  const unit2 = updated.match("(dollar|dollars|euro|euros|pound|pounds|cent|cents|penny|pennies|pence)").nouns();
  if (unit2.has("pence")) {
    if (Math.abs(amount) === 1) {
      unit2.replaceWith("penny");
    }
  } else if (Math.abs(amount) === 1) {
    unit2.toSingular();
  } else {
    unit2.toPlural();
  }
};
var arithmetic = (value, operation) => {
  const amounts = parts2(value);
  const num = operation(parse_default6(value).num);
  if (!Number.isFinite(num)) {
    return;
  }
  if (amounts.length === 1) {
    replace(amounts.eq(0), scale(num, multiplier(amounts.eq(0)), true));
  } else if (amounts.length === 2) {
    const major = Math.trunc(Math.abs(num));
    const minor = scale(add(Math.abs(num), -major), multiplier(amounts.eq(1)), true);
    replace(amounts.eq(1), minor);
    replace(amounts.eq(0), major, num < 0);
  }
};
var arithmetic_default = arithmetic;

// ../../node_modules/compromise/src/3-three/numbers/money/_lib.js
var mapNumbers = (money, fn, operation) => money.map((value) => {
  const number = value.numbers();
  if (!operation && number.length !== 1) {
    return value;
  }
  const [sentence, start2, end2] = value.fullPointer[0];
  const before2 = value.document[sentence].length;
  if (operation) {
    arithmetic_default(value, operation);
  } else {
    fn(number);
  }
  const delta = value.document[sentence].length - before2;
  return value.update([[sentence, start2, end2 + delta]]);
});
var lib_default21 = mapNumbers;

// ../../node_modules/compromise/src/3-three/numbers/money/api.js
var plugin5 = function(View2, Numbers) {
  class Money2 extends Numbers {
    _mapNumbers(fn, operation) {
      return lib_default21(this, fn, operation);
    }
    parse(n2) {
      return this.getNth(n2).map(parse_default6, []);
    }
    get(n2) {
      return this.parse(n2).map((p4) => p4.num);
    }
    json(n2) {
      return jsonWith(this, n2, "money", parse_default6);
    }
    currency(n2) {
      return this.parse(n2).map((p4) => p4.currency);
    }
  }
  Money2.prototype.viewType = "Money";
  Object.assign(Money2.prototype, {
    _add: add,
    toOrdinal: void 0,
    toCardinal: void 0,
    toFraction: void 0,
    toPercentage: void 0,
    toDecimal: void 0
  });
  View2.prototype.money = select_default(Money2, find_default4, true);
};
var api_default16 = plugin5;

// ../../node_modules/compromise/src/3-three/numbers/money/decimalCurrencies.js
var decimalCurrencies = {
  cent: 0.01,
  penny: 0.01,
  pence: 0.01,
  centavo: 0.01,
  centime: 0.01,
  paisa: 0.01,
  ore: 0.01,
  \u00F6re: 0.01
};
var decimalCurrencies_default = decimalCurrencies;

// ../../node_modules/compromise/src/3-three/numbers/plugin.js
var api15 = function(View2) {
  api_default14(View2);
  const Numbers = api_default15(View2);
  api_default16(View2, Numbers);
};
var plugin_default26 = {
  model: { three: { decimalCurrencies: decimalCurrencies_default } },
  api: api15
};

// ../../node_modules/compromise/src/3-three/redact/redact.js
var defaults3 = {
  people: true,
  places: true,
  organizations: true,
  emails: true,
  money: true,
  percentages: true,
  fractions: true,
  phoneNumbers: true,
  atMentions: true,
  acronyms: true,
  urls: true,
  // off by default
  properNouns: false,
  dates: false,
  numbers: false,
  pronouns: false
};
var hideTags = {
  people: [MaleName, FemaleName, First, Last],
  places: [City, "State", Country, Region],
  organizations: [SportsTeam, "Company", "School"]
};
hideTags.pronouns = [...hideTags.people, ...hideTags.places, ...hideTags.organizations];
var redactMatch = function(m3, blockStr, keep2 = true) {
  m3 = m3.notIf("#Redacted");
  m3.replaceWith(blockStr, keep2);
  m3.tag("Redacted");
  return m3;
};
var redact = function(opts2 = {}, blockStr = "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588", keep2 = true) {
  opts2 = { ...defaults3, ...opts2 };
  Object.keys(defaults3).forEach((k2) => {
    if (opts2[k2] !== false) {
      const m3 = redactMatch(this[k2](), blockStr, keep2);
      if (hideTags[k2]) {
        m3.unTag(hideTags[k2]);
      }
    }
  });
  return this;
};
var redact_default = redact;

// ../../node_modules/compromise/src/3-three/redact/plugin.js
var plugin6 = {
  model: {
    one: {
      tagSet: {
        Redacted: true
      }
    }
  },
  api: function(View2) {
    View2.prototype.redact = redact_default;
  }
};
var plugin_default27 = plugin6;

// ../../node_modules/compromise/src/3-three/sentences/questions.js
var isQuestion = function(doc, terms) {
  if (/\.\.$/.test(doc.out("text"))) {
    return false;
  }
  const startsQuestion = terms[0].tags.has(QW);
  if (startsQuestion && terms.some((term) => term.post.includes(","))) {
    return false;
  }
  if (doc.has("or not$")) {
    return true;
  }
  if (startsQuestion) {
    return true;
  }
  if (doc.has("^(do|does|did|is|was|can|could|will|would|may) #NN")) {
    return true;
  }
  if (doc.has("^(have|must) you")) {
    return true;
  }
  if (doc.has("(do|does|is|was)") && doc.clauses().has("(do|does|is|was) #NN+ #Adv? (#Adj|#Inf)$")) {
    return true;
  }
  return false;
};
var findQuestions = function(view) {
  const hasQ = /[?\uFF1F]/;
  const { document } = view;
  return view.filter((m3) => {
    const terms = m3.docs[0] || [];
    const lastTerm = terms[terms.length - 1];
    if (!lastTerm || document[lastTerm.index[0]].length !== terms.length) {
      return false;
    }
    if (hasQ.test(lastTerm.post)) {
      return true;
    }
    return isQuestion(m3, terms);
  });
};
var questions_default = findQuestions;

// ../../node_modules/compromise/src/3-three/sentences/parse/mainClause.js
var subordinate = `(after|although|as|because|before|if|since|than|that|though|when|whenever|where|whereas|wherever|whether|while|why|unless|until|once) !(#Val|upon|then|now)`;
var relative = `(that|which|whichever|who|whoever|whom|whose|whomever)`;
var dropIntroducedBy = function(m3, pattern) {
  const reg = m3.world.methods.one.parseMatch(pattern, {}, m3.world);
  return m3.filter((c) => {
    const found = c.matchOne(reg);
    if (!found.found) {
      return true;
    }
    const verb = c.matchOne("#Verb");
    return verb.found && verb.fullPointer[0][1] <= found.fullPointer[0][1];
  });
};
var subordinators = ["^even (if|though)", "^so that", "^rather than", "^provided that", "^in case"];
var mainClause = function(s) {
  let m3 = s;
  if (m3.length === 1) {
    return m3;
  }
  m3 = m3.if("#Verb");
  if (m3.length === 1) {
    return m3;
  }
  m3 = dropIntroducedBy(m3, subordinate);
  subordinators.forEach((str) => {
    m3 = m3.ifNo(str);
  });
  if (m3.length === 1) {
    return m3;
  }
  m3 = dropIntroducedBy(m3, relative);
  if (m3.length === 1) {
    return m3;
  }
  m3 = m3.ifNo("(^despite|^during|^before|^through|^throughout)");
  if (m3.length === 1) {
    return m3;
  }
  m3 = m3.ifNo("^#Ger");
  if (m3.length === 1) {
    return m3;
  }
  m3 = m3.ifNo("^to #Inf");
  m3 = m3.ifNo("^#Cond");
  if (m3.length === 1) {
    return m3;
  }
  if (m3.length === 0) {
    m3 = s;
  }
  return m3.eq(0);
};
var mainClause_default = mainClause;

// ../../node_modules/compromise/src/3-three/sentences/parse/index.js
var grammar = (vb3) => ({
  tense: [Past, Fut, Pres].find((t) => vb3.has("#" + t)) || null
});
var parse7 = function(s) {
  const clauses2 = s.clauses();
  const main2 = mainClause_default(clauses2);
  let chunks2 = main2.chunks();
  let subj = s.none();
  let verb = s.none();
  let pred = s.none();
  const relativeSubject = chunks2.length > 2 && !chunks2.eq(0).has("<Verb>") && chunks2.eq(1).has("^(who|whom|whose|which|that)$");
  if (relativeSubject) {
    chunks2 = chunks2.splitAfter("[(#Pres && !#Aux && !#Cop && !#Inf)] #Verb", 0);
  }
  const relative2 = relativeSubject && chunks2.filter((ch) => ch.has("<Verb>")).length > 1;
  let isSkipped = false;
  chunks2.forEach((ch, i3) => {
    if (i3 === 0 && !ch.has("<Verb>")) {
      subj = ch;
      return;
    }
    if (!verb.found && ch.has("<Verb>")) {
      if (relative2 && !isSkipped) {
        isSkipped = true;
        return;
      }
      verb = ch;
      return;
    }
    if (verb.found) {
      pred = pred.concat(ch);
    }
  });
  if (verb.found && !subj.found) {
    subj = verb.before("<Noun>+").first();
  }
  return {
    subj,
    verb,
    pred,
    grammar: grammar(verb)
  };
};
var parse_default7 = parse7;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/root.js
var getMain = function(vb3) {
  let root = vb3;
  if (vb3.wordCount() > 1) {
    root = vb3.not("(#Neg|#Aux|#Mod|#Adv|#Prefix)");
  }
  if (root.length > 1 && !root.has("#Phrasal #Particle")) {
    root = root.last();
  }
  root = root.not("(want|wants|wanted) to");
  if (!root.found) {
    root = vb3.not("#Neg");
    return root;
  }
  return root;
};
var root_default2 = getMain;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/adverbs.js
var getAdverbs = function(vb3, root) {
  const res = {
    pre: vb3.none(),
    post: vb3.none()
  };
  if (!vb3.has("#Adv")) {
    return res;
  }
  const parts3 = vb3.splitOn(root);
  if (parts3.length === 3) {
    return {
      pre: parts3.eq(0).adverbs(),
      post: parts3.eq(2).adverbs()
    };
  }
  if (parts3.eq(0).isDoc(root)) {
    res.post = parts3.eq(1).adverbs();
    return res;
  }
  res.pre = parts3.eq(0).adverbs();
  return res;
};
var adverbs_default = getAdverbs;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/index.js
var getAuxiliary = function(vb3, root) {
  const parts3 = vb3.splitBefore(root);
  if (parts3.length <= 1) {
    return vb3.none();
  }
  let aux = parts3.eq(0);
  aux = aux.not("(#Adv|#Neg|#Prefix)");
  return aux;
};
var getPhrasal = function(root) {
  if (!root.has("(#Particle|#PhrV)")) {
    return {
      verb: root.none(),
      particle: root.none()
    };
  }
  const particle = root.match("#Particle$");
  return {
    verb: root.not(particle),
    particle
  };
};
var parseVerb = function(view) {
  const vb3 = view.clone();
  vb3.contractions().expand();
  const root = root_default2(vb3);
  const res = {
    root,
    prefix: vb3.match("#Prefix"),
    adverbs: adverbs_default(vb3, root),
    auxiliary: getAuxiliary(vb3, root),
    negative: vb3.match("#Neg"),
    phrasal: getPhrasal(root)
  };
  return res;
};
var parse_default8 = parseVerb;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/grammar/forms.js
var flags = {
  p: { tense: Pres },
  d: { conditional: true },
  f: { tense: Fut },
  g: { progressive: true },
  P: { tense: Past },
  c: { complete: true, progressive: false },
  v: { passive: true },
  l: { plural: true },
  s: { plural: false }
};
var Imperative = "imperative";
var WantInf = "want-infinitive";
var GerPhrase = "gerund-phrase";
var SimplePres = "simple-present";
var SimplePast = "simple-past";
var SimpleFut = "simple-future";
var PresCond = "present-conditional";
var PastCond = "past-conditional";
var AuxFut = "auxiliary-future";
var AuxPast = "auxiliary-past";
var AuxPres = "auxiliary-present";
var ModalPast = "modal-past";
var ModalInf = "modal-infinitive";
var ModalPerfProg = "modal-perfect-progressive";
var PassivePast = "passive-past";
var InfForm = "infinitive";
var verbForms = {
  // === Simple ===
  [Imperative]: [
    // walk!
    ["#Imp", ""]
  ],
  [WantInf]: [
    ["^(want|wants|wanted) to #Inf$", "p"],
    ["^wanted to #Inf$", "P"],
    ["^will want to #Inf$", "f"]
  ],
  [GerPhrase]: [
    // started looking
    ["^#Past #Ger$", "P"],
    // starts looking
    ["^#Pres #Ger$", "p"],
    // start looking
    ["^#Inf #Ger$", "p"],
    // will start looking
    ["^will #Inf #Ger$", "f"],
    // have started looking
    ["^have #Past #Ger$", "P"],
    // will have started looking
    ["^will have #Past #Ger$", "P"]
  ],
  [SimplePres]: [
    // he walks',
    ["^#Pres$", "p"],
    // we walk
    ["^#Inf$", "p"]
  ],
  [SimplePast]: [
    // he walked',
    ["^#Past$", "P"]
  ],
  [SimpleFut]: [
    // he will walk
    ["^will #Adv? #Inf", "f"]
  ],
  // === Progressive ===
  "present-progressive": [
    // he is walking
    ["^(is|are|am) #Ger$", "pg"]
  ],
  "past-progressive": [
    // he was walking
    ["^(was|were) #Ger$", "Pg"]
  ],
  "future-progressive": [
    // he will be
    ["^will be #Ger$", "fg"]
  ],
  // === Perfect ===
  "present-perfect": [
    // he has walked
    ["^(has|have) #Past$", "Pc"]
    //past?
  ],
  "past-perfect": [
    // he had walked
    ["^had #Past$", "Pc"],
    // had been to see
    ["^had #Past to #Inf", "Pc"]
  ],
  "future-perfect": [
    // he will have
    ["^will have #Past$", "fc"]
  ],
  // === Progressive-perfect ===
  "present-perfect-progressive": [
    ["^(has|have) been going to be #Ger$", "Pg"],
    // he has been walking
    ["^(has|have) been #Ger$", "Pg"]
    //present?
  ],
  "past-perfect-progressive": [
    // he had been
    ["^had been #Ger$", "Pg"]
  ],
  "future-perfect-progressive": [
    // will have been
    ["^will have been #Ger$", "fg"]
  ],
  // ==== Passive ===
  [PassivePast]: [
    ["^(was|were) being? (#Past|#VBN)$", "Pv"],
    ["^had been being? (#Past|#VBN)$", "Pv"],
    // got walked, was walked, were walked
    ["(got|were|was) #Pass", "Pv"],
    // was being walked
    ["^(was|were) being #Pass", "Pv"],
    // had been walked
    ["^had been #Pass", "Pv"]
  ],
  "passive-present": [
    ["^(is|are|am) being? (#Past|#VBN)$", "pv"],
    ["^(has|have) been being? (#Past|#VBN)$", "pv"],
    // is walked, are stolen
    ["^(is|are|am) #Pass", "pv"],
    // is being walked
    ["^(is|are|am) being #Pass", "pv"],
    // has/have been cleaned
    ["^(has|have) been #Pass", "pv"]
  ],
  "passive-future": [
    ["^will have been being? (#Past|#VBN)$", "fvd"],
    ["^will be being? (#Past|#VBN)$", "fvd"],
    // will have been walked
    ["will have been #Pass", "fvd"],
    // will be cleaned
    ["will be being? #Pass", "fvd"]
  ],
  // === Conditional ===
  [PresCond]: [
    // would be walked
    ["^#Mod be #Past$", "pdv"]
  ],
  [PastCond]: [
    // would have been walked
    ["^#Mod have been #Past$", "Pdv"]
  ],
  // ==== Auxiliary ===
  [AuxFut]: [
    ["^(is|are|am|was|were) going to be #Ger$", "fg"],
    // going to drink
    ["(is|are|am|was|were) going to (#Inf|#Pres)", "f"]
  ],
  [AuxPast]: [
    // he did walk
    ["^did #Inf$", "Ps"],
    // used to walk
    ["^used to #Inf$", "Pc"]
  ],
  [AuxPres]: [
    // we do walk
    ["^(does|do) #Inf$", "pcl"]
  ],
  // === modals ===
  [ModalPerfProg]: [
    ["^#Mod have been #Ger$", "Pg"]
  ],
  [ModalPast]: [
    // he could have walked
    ["^#Mod have #Past$", "P"]
  ],
  [ModalInf]: [
    // he can walk
    ["^#Mod #Inf$", ""]
  ],
  [InfForm]: [
    // walk
    ["^#Inf$", ""]
  ]
};
var list3 = [];
Object.keys(verbForms).map((k2) => {
  verbForms[k2].forEach((a) => {
    list3.push({
      name: k2,
      match: lib_default13(a[0]),
      data: Object.assign({}, ...[...a[1]].map((c) => flags[c]))
    });
  });
});
var forms_default = list3;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/grammar/index.js
var cleanUp2 = function(vb3, res) {
  vb3 = vb3.clone();
  if (res.adverbs.post && res.adverbs.post.found) {
    vb3.remove(res.adverbs.post);
  }
  if (res.adverbs.pre && res.adverbs.pre.found) {
    vb3.remove(res.adverbs.pre);
  }
  if (vb3.has("#Neg")) {
    vb3 = vb3.remove("#Neg");
  }
  if (vb3.has("#Prefix")) {
    vb3 = vb3.remove("#Prefix");
  }
  if (res.root.has("#PhrV #Particle")) {
    vb3.remove("#Particle$");
  }
  vb3 = vb3.not("#Adv");
  return vb3;
};
var isInfinitive = function(vb3) {
  return vb3.growLeft("to (#Adv|#Neg)+?").has("^to (#Adv|#Neg)+? #Verb");
};
var getGrammar = function(vb3, res) {
  const grammar2 = {};
  const infinitive2 = isInfinitive(vb3);
  vb3 = cleanUp2(vb3, res);
  for (let i3 = 0; i3 < forms_default.length; i3 += 1) {
    const todo = forms_default[i3];
    if (vb3.has(todo.match)) {
      grammar2.form = todo.name;
      Object.assign(grammar2, todo.data);
      break;
    }
  }
  if (!grammar2.form) {
    if (vb3.has("^#Verb$")) {
      grammar2.form = InfForm;
    }
  }
  if (!grammar2.tense) {
    grammar2.tense = res.root.has("#Past") ? "PastTense" : Pres;
  }
  grammar2.copula = res.root.has("#Cop");
  grammar2.isInfinitive = infinitive2;
  return grammar2;
};
var grammar_default = getGrammar;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/auxiliary.js
var readAuxiliary = function(parsed, form) {
  const words2 = parsed.auxiliary.terms().map((term) => term.text("normal"), []);
  const text = words2.join(" ");
  const modal = /^(can|could|may|might|must|shall|should|would)( (be|have|been|being))*$/.test(text) || /^ought to( (be|have|been|being))*$/.test(text);
  const prospective = /^(is|are|am|was|were) going to (be|have)( (been|being))*$/.test(text);
  if (modal || prospective) {
    let prefixLength = words2[0] === "ought" ? 2 : 1;
    if (prospective) prefixLength = 3;
    const tail2 = words2.slice(prefixLength);
    return {
      words: words2,
      finite: words2[0],
      modal,
      prospective,
      prefixLength,
      perfect: tail2.includes("have"),
      progressive: parsed.root.has("#Ger") || tail2.includes("being"),
      passive: tail2.length > 0 && !parsed.root.has("#Ger") && tail2.some((w) => /^(be|been|being)$/.test(w)),
      form
    };
  }
  const passive2 = /^passive-/.test(form);
  const perfectForm = /^(present|past|future)-perfect/.test(form);
  const progressiveForm = /^(present|past|future)-progressive$/.test(form);
  if (!passive2 && !perfectForm && !progressiveForm) {
    return null;
  }
  if (words2.length === 0) {
    return null;
  }
  return {
    words: words2,
    finite: words2[0],
    passive: passive2,
    perfect: words2.some((word) => /^(has|have|had)$/.test(word)),
    progressive: passive2 ? words2.includes("being") : /progressive$/.test(form),
    form
  };
};
var auxiliary_default = readAuxiliary;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/groups.js
var groups = function(verbs, finite = false) {
  const entries = verbs.map((vb3) => {
    const parsed = parse_default8(vb3);
    return { vb: vb3, parsed, root: vb3.match(parsed.root).harden() };
  }, []);
  entries.forEach((entry, i3) => {
    const previous = entries[i3 - 1];
    if (!previous || entry.parsed.auxiliary.found) return;
    const head = previous.head || previous;
    if (!finite && !head.parsed.auxiliary.found) {
      return;
    }
    const info = grammar_default(head.vb, head.parsed);
    const bare = finite && !head.parsed.auxiliary.found && !info.copula && (info.form === SimplePres || info.form === SimplePast);
    const doSupport = finite && head.parsed.auxiliary.has("^(do|does|did)$");
    if (!head.parsed.auxiliary.found && !bare) return;
    if (info.isInfinitive) return;
    const chain = auxiliary_default(head.parsed, info.form);
    if (!chain && info.form !== SimpleFut && !bare && !doSupport || chain && chain.prospective) return;
    head.chain = chain;
    head.form = info.form;
    const root = entry.parsed.root;
    const headRoot = head.parsed.root;
    let compatible = headRoot.has("#Inf") && root.has("#Inf");
    if (bare && headRoot.has("#Pres")) {
      compatible = root.has("#Pres");
    }
    if (headRoot.has("(#Past|#Participle)")) compatible = root.has("(#Past|#Participle)");
    if (headRoot.has("#Ger")) compatible = root.has("#Ger");
    if (!compatible || previous.vb.has("@hasComma$")) return;
    const next = previous.vb.growRight("(and|or) #Adv+? #Verb+ #Particle?");
    if (next.match(entry.vb).wordCount() !== entry.vb.wordCount()) return;
    entry.head = head;
  });
  return entries;
};
var firstGroup = function(verbs) {
  if (verbs.length < 2) return verbs;
  const entries = groups(verbs);
  let count = 1;
  while (entries[count] && entries[count].head === entries[0]) count += 1;
  return verbs.slice(0, count);
};
var groups_default = groups;

// ../../node_modules/compromise/src/3-three/verbs/api/parse/getSubject.js
var shouldSkip = function(last) {
  if (last.length <= 1) {
    return false;
  }
  const obj = last.parse()[0] || {};
  return obj.isSubordinate;
};
var noSubClause = function(before2) {
  let parts3 = before2.clauses();
  parts3 = parts3.filter((m3, i3) => {
    if (m3.has("^(if|unless|while|but|for|per|at|by|that|which|who|from)")) {
      return false;
    }
    if (i3 > 0 && m3.has("^#Verb . #NN+$")) {
      return false;
    }
    if (i3 > 0 && m3.has("^#Adv")) {
      return false;
    }
    return true;
  });
  if (parts3.length === 0) {
    return before2;
  }
  return parts3;
};
var lastNoun2 = function(vb3) {
  let before2 = vb3.before();
  before2 = noSubClause(before2);
  if (!before2.has("(#Verb|@hasComma)") && before2.has("#NN (on|near|under|beside|behind)")) {
    const head = before2.splitBefore("(on|near|under|beside|behind)").first().nouns();
    if (head.found) return head;
  }
  const nouns = before2.nouns();
  let last = nouns.last();
  const pronoun = last.match("(i|he|she|we|you|they)");
  if (pronoun.found) {
    return pronoun.nouns();
  }
  let det = nouns.if("^(that|this|those)");
  if (det.found) {
    return det;
  }
  if (!nouns.found) {
    det = before2.match("^(that|this|those)");
    if (det.found) {
      return det;
    }
  }
  last = nouns.last();
  if (shouldSkip(last)) {
    nouns.remove(last);
    last = nouns.last();
  }
  if (shouldSkip(last)) {
    nouns.remove(last);
    last = nouns.last();
  }
  return last;
};
var isPlural3 = function(subj, vb3) {
  if (vb3.has("(are|were)")) {
    return true;
  }
  if (subj.has("(those|they|we)")) {
    return true;
  }
  if (subj.has("(#Sing|#Plur) of")) {
    const head = subj.splitBefore("of").first().nouns();
    if (head.found) return head.isPlural().found;
  }
  if (subj.found && subj.isPlural) {
    return subj.isPlural().found;
  }
  return false;
};
var getSubject = function(vb3) {
  const subj = lastNoun2(vb3);
  return {
    subject: subj,
    plural: isPlural3(subj, vb3)
  };
};
var getSubject_default = getSubject;

// ../../node_modules/compromise/src/3-three/verbs/api/lib.js
var noop = (vb3) => vb3;
var isPlural4 = (vb3, parsed) => {
  const subj = getSubject_default(vb3, parsed);
  return subj.subject.has("(i|we|you)") || subj.plural;
};
var wasWere = (vb3, parsed) => {
  const { subject: subject2, plural } = getSubject_default(vb3, parsed);
  if (plural || subject2.has("(we|you)")) {
    return "were";
  }
  return "was";
};
var isAreAm = function(vb3, parsed) {
  if (vb3.has("were")) {
    return "are";
  }
  const { subject: subject2, plural } = getSubject_default(vb3, parsed);
  if (subject2.has("i")) {
    return "am";
  }
  if (subject2.has("(we|you)") || plural) {
    return "are";
  }
  return "is";
};
var doDoes = (vb3, parsed) => isPlural4(vb3, parsed) ? "do" : "does";
var haveHas = function(vb3, parsed) {
  const { subject: subject2, plural } = getSubject_default(vb3, parsed);
  if (subject2.has("(i|we|you)")) {
    return "have";
  }
  if (!plural || subject2.has("(he|she|#Pers)")) {
    return "has";
  }
  return "have";
};
var getTense2 = (m3) => [Inf, Participle, Past, Ger, Pres].find((t) => m3.has("#" + t));
var doTense = ({ auxiliary: auxiliary2, negative }) => {
  if (!negative.found || !auxiliary2.has("^(does|did)$")) {
    return null;
  }
  return auxiliary2.has("did") ? Past : Pres;
};
var retag2 = (vb3) => vb3.fullSentence().compute(["tagger", "chunks"]);
var noWill = (vb3) => {
  if (vb3.has("will not")) {
    return vb3.replace("will not", "have not");
  }
  return vb3.remove("will");
};

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/question.js
var methods19 = {
  past: "toPastTense",
  present: "toPresentTense",
  future: "toFutureTense",
  participle: "toPastParticiple",
  gerund: "toGerund",
  infinitive: "toInfinitive"
};
var keepPunct = { keepEndPunct: true };
var modals = "will|would|can|could|shall|should|may|might|must";
var auxWords = "do|does|did|have|has|had|is|are|am|was|were|" + modals;
var bareVerb = RegExp(`^(do|does|did|${modals})$`);
var subjectPronoun = /^(i|you|he|she|it|we|they)$/;
var auxiliary = RegExp(`^(${auxWords})$`);
var doHave = /^(do|have)$/;
var tagged = ["id", "tagger", "chunks"];
var trimLead = (str) => str.replace(/^[^\p{L}\p{N}]+/u, "");
var possessive4 = /^(my|your|his|her|its|our|their)$/;
var isPolar = (target) => target === "negative" || target === "positive";
var clause = /^(before|after|when|since|until|till|as|while|if|because|though|although|but|yet)$/;
var copulaEnd = function(terms, words2, { start: start2, end: end2, finite, wh, asked }) {
  let at = end2 - 2;
  while (at > start2 && (words2[at] === "of" || !terms.eq(at).has("#Prep"))) {
    at -= 1;
  }
  const found = at > start2;
  if (wh) {
    return found && words2[finite - 1] === "why" ? at : end2;
  }
  const bare = !terms.eq(start2).has("(#Det|#Prop|#Poss)");
  const stranded = terms.eq(end2 - 1).has("#Prep");
  if (!asked && !found || bare && (!asked || stranded)) {
    return null;
  }
  return found ? at : end2;
};
var whStart = /^(?:(?:in|on|at|to|for|from|with|about|by)\s+)?(?:why|when|where|how|what|who|whom|which|whose)\b/i;
var auxStart = RegExp(`^(?:${auxWords}|won|shan)(?:n['\u2019]t)?\\b`, "i");
var isStart2 = (str) => whStart.test(str) || auxStart.test(str);
var leadLength = function(list5) {
  const comma = list5.slice(0, 3).findIndex((term) => term.post.includes(","));
  const opener = comma === 0 || comma > 0 && !list5.slice(0, comma + 1).some((term) => term.tags.has(Vb));
  const n2 = opener ? comma + 1 : 0;
  return list5[n2]?.normal === "please" ? n2 + 1 : n2;
};
var parseQuestion = function(sentence, target) {
  let text = trimLead(sentence.text());
  let lead = 0;
  const asked = sentence.has("@hasQuestionMark$");
  if (!isStart2(text)) {
    lead = asked ? leadLength(sentence.docs[0]) : 0;
    if (lead === 0) {
      return null;
    }
    text = trimLead(sentence.terms().slice(lead).text());
    if (!isStart2(text)) {
      return null;
    }
  }
  const wh = whStart.test(text);
  const expanded = sentence.clone();
  expanded.contractions().expand();
  const terms = expanded.terms();
  const words2 = terms.map((t) => trimLead(t.text("normal")), []);
  const len = words2.length;
  const at = (i3) => terms.eq(i3);
  const finite = wh ? words2.findIndex((word, i3) => i3 > lead && auxiliary.test(word)) : lead;
  if (finite < 0) return null;
  const fin = words2[finite];
  if (!auxiliary.test(fin) || fin === "will" && at(finite).has("#Pers")) return null;
  const copula2 = /^(is|are|am|was|were)$/.test(fin);
  let start2 = finite + 1;
  const frontNegative = words2[start2] === "not";
  if (frontNegative) start2 += 1;
  const first = words2[start2];
  const pronoun = at(start2).has("#Pron") && !possessive4.test(first);
  const polar = isPolar(target);
  const command = at(lead).has("#Imp");
  if (polar && !asked && (!pronoun || finite > 1 || command || sentence.has("@hasComma"))) {
    return null;
  }
  let end2 = start2;
  if (pronoun) {
    end2 += 1;
  } else {
    if (at(end2).has("#Prep")) return null;
    let noun2 = false;
    let modified = false;
    for (; end2 < len; end2 += 1) {
      const term = at(end2);
      const word = words2[end2];
      if (clause.test(word) || !term.has("(#Det|#Adj|#NN|#Prep|#Conj)") || term.has("#Verb")) {
        break;
      }
      if (noun2 && copula2) {
        if (term.has("#Adj") || /ing$/.test(word)) {
          break;
        }
        const prev = at(end2 - 1);
        if (term.has("(#Det|#Pron|#Poss)") && prev.has("#NN") && !prev.has("(#Poss|@hasComma|all|both)")) {
          break;
        }
      }
      noun2 ||= !modified && term.has("#NN") && !possessive4.test(word);
      modified ||= term.has("#Prep") && word !== "of";
    }
    if (!noun2) return null;
    const open = clause.test(words2[end2]) || end2 >= len && !polar;
    if (copula2 && open) {
      end2 = copulaEnd(terms, words2, { start: start2, end: end2, finite, wh, asked });
      if (end2 === null) {
        return null;
      }
    } else if (end2 < len && at(end2 - 1).has("(#Conj|#Prep)")) {
      if (!copula2) {
        return null;
      }
      if (words2[end2 - 1] !== "of") {
        end2 -= 1;
      }
    }
  }
  if (polar && copula2 && end2 >= len) {
    if (/^(who|what|which)$/.test(words2[finite - 1])) {
      return null;
    }
    const predicate2 = words2.findIndex((word, i3) => i3 > start2 && (possessive4.test(word) || word !== "of" && at(i3).has("(#Det|#Prep)")));
    if (!wh && predicate2 > -1) {
      if (!terms.slice(start2, predicate2).has("#NN")) {
        return null;
      }
      end2 = predicate2;
    }
  }
  const bare = polar && asked && !command && end2 >= len;
  let verb = end2;
  while (at(verb).has("(#Adv|#Neg)")) {
    verb += 1;
  }
  if (words2[lead - 1] === "please" && doHave.test(fin) && !at(verb).has("#Verb")) {
    return null;
  }
  const doIt = first === "it" && doHave.test(fin);
  const hasObject2 = finite > lead && !/^(why|when|where|how)$/.test(words2[finite - 1]);
  const elided = !copula2 && !doIt && !hasObject2 && verb >= len && subjectPronoun.test(first) && asked;
  const optional = copula2 || bare || elided || polar && words2[end2] === "please";
  if (end2 === start2 || end2 >= len && !optional) return null;
  if (!optional) {
    const lexical = at(verb).has("#Verb");
    if (!asked && (!lexical || at(end2 - 1).has("@hasComma"))) {
      return null;
    }
    if (asked && !lexical && verb === end2) {
      return null;
    }
  }
  return { terms, words: words2, finite, start: start2, end: end2, frontNegative, elided };
};
var isInverted = (sentence, target) => Boolean(parseQuestion(sentence, target));
var questionSelection = function(sentence, target) {
  const q = parseQuestion(sentence, target);
  if (!q) return null;
  const offset2 = sentence.fullPointer[0][1];
  let end2 = q.end;
  while (q.terms.eq(end2).has("(#Neg|please)")) {
    end2 += 1;
  }
  const at = offset2 + end2;
  let predicate2 = sentence.verbs().filter((vb3) => vb3.fullPointer.some((ptr) => ptr[1] <= at && ptr[2] > at));
  for (let i3 = 0; i3 < q.words.length && predicate2.found; i3 += 1) {
    const chain = predicate2.growRight("(#Adv|#Neg)+? #Verb+ #Particle?");
    const next = chain.growRight("(and|or) #Adv+? #Verb+ #Particle?");
    if (next.wordCount() === predicate2.wordCount()) break;
    predicate2 = next;
  }
  return sentence.terms().slice(q.finite, q.start).concat(predicate2.not("#Conj")).settle();
};
var predicateNot = function(terms, end2) {
  for (let i3 = end2; terms.eq(i3).has("(#Verb|#Adv|#Neg|please)"); i3 += 1) {
    if (terms.eq(i3).has("(#Neg|not)")) {
      return i3;
    }
  }
  return -1;
};
var rechunk = (sentence) => sentence.fullSentence().compute("chunks");
var negate = function(sentence, { terms, end: end2, frontNegative }) {
  if (frontNegative || predicateNot(terms, end2) > -1) {
    return sentence;
  }
  const all4 = sentence.terms();
  if (all4.eq(end2).found) {
    all4.eq(end2).prepend("not");
  } else {
    all4.eq(end2 - 1).append("not");
  }
  return rechunk(sentence);
};
var affirm = function(sentence, { terms, start: start2, end: end2, frontNegative }) {
  const not = frontNegative ? start2 - 1 : predicateNot(terms, end2);
  if (not < 0) {
    return sentence;
  }
  sentence.terms().eq(not).remove();
  return rechunk(sentence);
};
var question = function(sentence, target) {
  const q = parseQuestion(sentence, target);
  if (!q) return null;
  if (target === "negative") {
    return negate(sentence, q);
  }
  if (target === "positive") {
    return affirm(sentence, q);
  }
  const { terms, words: words2, finite, start: start2, end: end2, frontNegative, elided } = q;
  terms.termList().at(-1).post = "";
  const subject2 = terms.slice(start2, end2);
  const prefix6 = finite > 0 ? trimLead(terms.slice(0, finite).text(keepPunct)) : "";
  let tail2 = terms.slice(end2).text(keepPunct);
  if (elided) {
    const standIn = /^ha/.test(words2[finite]) ? "walked" : "walk";
    tail2 = `${standIn} ${tail2}`.trim();
  }
  const negative = frontNegative ? " not" : "";
  const source = subject2.text() + " " + words2[finite] + negative + " " + tail2;
  const scratch = (str) => sentence.fromText(str).compute(tagged);
  let work = scratch(source);
  firstGroup(work.verbs())[methods19[target]]();
  if (work.text("normal") === sentence.fromText(source).text("normal")) return sentence;
  work = scratch(work.text());
  const subjectLength = end2 - start2;
  let rest = work.terms().slice(subjectLength);
  let at = 0;
  while (rest.eq(at).has("#Adv")) {
    at += 1;
  }
  let verb = rest.eq(at);
  if (!verb.has("#Cop")) {
    verb = rest.eq(0);
  }
  let head = verb.text("normal");
  if (!auxiliary.test(head)) {
    head = target === "past" ? "did" : doDoes(work.verbs(0));
    if (target !== "infinitive" && bareVerb.test(words2[finite])) {
      rest = sentence.fromText(tail2).terms();
    } else {
      firstGroup(work.verbs()).toInfinitive();
      rest = work.terms().slice(subjectLength);
    }
  } else {
    rest = rest.not(verb);
  }
  const contracted = sentence.has("@hasContraction") && frontNegative;
  const not = rest.match("not").eq(0);
  if (contracted && not.found) {
    if (head !== "am") {
      const special = { will: "won't", can: "can't", shall: "shan't" };
      head = special[head] || head + "n't";
      if (sentence.text().includes("\u2019")) head = head.replace("'", "\u2019");
      rest = rest.not(not);
    }
  }
  if (!prefix6 && /^[A-Z]/.test(trimLead(sentence.text()))) head = head[0].toUpperCase() + head.slice(1);
  if (elided) {
    rest = rest.not("(walk|walks|walked|walking)");
  }
  const result = [prefix6, head, subject2.text(keepPunct), rest.text(keepPunct)].filter(Boolean).join(" ");
  const ending = sentence.docs.at(-1).at(-1).post;
  const changed = sentence.replaceWith(result).fullSentence().compute(["contractions", "tagger", "contractionTwo", "chunks"]);
  changed.docs.at(-1).at(-1).post = ending;
  for (let i3 = 0; i3 < finite; i3 += 1) {
    const term = changed.terms().eq(i3);
    term.unTag([...term.termList()[0].tags]);
    term.tag([...terms.eq(i3).termList()[0].tags]);
  }
  changed.terms().eq(finite).tag(Aux);
  return changed.compute("chunks");
};
var question_default = question;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/inflect.js
var infinitive = (root, format2 = "normal") => {
  return root.methods.two.transform.verb.toInfinitive(root.text(format2), root.model, getTense2(root));
};
var inflect2 = (root, tense, format2) => {
  const word = infinitive(root, format2);
  if (tense === Inf) return word;
  const forms7 = root.methods.two.transform.verb.conjugate(word, root.model);
  return forms7[tense] || (tense === Participle ? forms7.PastTense : void 0);
};

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/coordinate.js
var resultTense = function(head, target) {
  const { chain, parsed, form } = head;
  if (target === "infinitive") return Inf;
  if (target === "gerund") return chain && chain.passive ? Participle : Ger;
  if (parsed.root.has("#Ger")) return Ger;
  if (target === "participle") return Participle;
  if (chain && chain.passive) return Participle;
  if (chain && chain.perfect) {
    return target === "present" && form === ModalPast ? Inf : Participle;
  }
  if (chain && chain.modal) {
    return target === "past" && form === ModalInf && chain.finite !== "can" ? Participle : Inf;
  }
  if (target === "future") return Inf;
  if (target === "past") return Past;
  return isAreAm(head.vb, parsed) === "is" ? Pres : Inf;
};
var coordinateNormal = function(verbs, target, convert5) {
  if (verbs.length < 2 || isPolar(target)) {
    return verbs.map(convert5);
  }
  const entries = groups_default(verbs);
  entries.forEach((entry) => {
    if (entry.head) entry.tense = resultTense(entry.head, target);
  });
  return verbs.map((vb3, i3) => {
    const entry = entries[i3];
    if (!entry.head) {
      return convert5(vb3);
    }
    const root = entry.parsed.root;
    const word = inflect2(root, entry.tense);
    if (word && word !== root.text("normal")) {
      entry.root.replaceWith(word);
      retag2(vb3);
    }
    return vb3;
  });
};
var coordinate = function(verbs, target, convert5) {
  const sentences = verbs.fullSentence().settle();
  if (!sentences.some((s) => isInverted(s, target))) return coordinateNormal(verbs, target, convert5);
  return sentences.map((sentence) => {
    const index3 = sentence.fullPointer[0][0];
    const selected = verbs.filter((vb3) => vb3.fullPointer[0][0] === index3);
    const required = questionSelection(sentence, target);
    if (!required) return coordinateNormal(selected, target, convert5);
    const outside = selected.not(required);
    const inside = selected.not(outside).harden();
    const others = coordinateNormal(outside, target, convert5);
    if (!inside.found) return others;
    if (required.terms().not(inside.terms()).not("#Neg").found) {
      const kept = target === "positive" ? inside.map(convert5) : inside;
      return kept.concat(others).settle();
    }
    const current = sentence.fullSentence();
    const end2 = current.fullPointer[0][2];
    const trailing = others.fullPointer.map((ptr) => [ptr[0], end2 - ptr[1], end2 - ptr[2]]);
    const result = question_default(current, target);
    if (!result) {
      return inside.concat(others).settle();
    }
    const newEnd = result.fullPointer[0][2];
    const remaining = result.update(trailing.map((ptr) => [ptr[0], newEnd - ptr[1], newEnd - ptr[2]]));
    return (questionSelection(result, target) || result).concat(remaining).settle();
  });
};
var coordinate_default = coordinate;

// ../../node_modules/compromise/src/3-three/sentences/conjugate/_lib.js
var agree2 = (target, method, narrow2) => (s) => {
  const inverted = question_default(s, target);
  if (inverted) {
    return inverted;
  }
  let verbs = s.verbs();
  const first = firstGroup(verbs);
  if (narrow2 && first.has("#Past") && !first.has("#Aux")) {
    return s;
  }
  first[method]();
  if (verbs.length > 1) {
    verbs = verbs.slice(first.length);
    verbs = verbs.filter((v2) => !v2.lookBehind("to$").found);
    verbs = verbs.notIf("#Ger");
    if (narrow2) {
      verbs = narrow2(verbs, s);
    }
    if (verbs.found) {
      verbs.verbs()[method]();
    }
  }
  return s;
};
var lib_default22 = agree2;

// ../../node_modules/compromise/src/3-three/sentences/conjugate/toPast.js
var narrow = (verbs, s) => verbs.if("#Pres").not(s.match("to #Verb+ #Conj #Verb").terms());
var toPast_default = lib_default22("past", "toPastTense", narrow);

// ../../node_modules/compromise/src/3-three/sentences/conjugate/toPresent.js
var toPresent_default = lib_default22("present", "toPresentTense");

// ../../node_modules/compromise/src/3-three/sentences/conjugate/toFuture.js
var toFuture = function(s) {
  const inverted = question_default(s, "future");
  if (inverted) return inverted;
  let verbs = s.verbs();
  const first = firstGroup(verbs);
  first.toFutureTense();
  s = s.fullSentence();
  verbs = s.verbs();
  if (verbs.length > 1) {
    verbs = verbs.slice(first.length);
    const toChange = verbs.filter((vb3) => {
      if (vb3.lookBehind("to$").found) {
        return false;
      }
      if (vb3.has("#Cop #Ger")) {
        return true;
      }
      if (vb3.has("#Ger")) {
        return false;
      }
      if (vb3.has("#Cop")) {
        return true;
      }
      if (vb3.has("#Pres") && !vb3.has("#Inf") && vb3.lookBefore("(he|she|it|that|which)$").found) {
        return false;
      }
      return true;
    });
    if (toChange.found) {
      toChange.forEach((m3) => {
        if (m3.has("#Cop")) {
          m3.match("was").replaceWith("is");
          m3.match("is").replaceWith("will be");
          return;
        }
        m3.toInfinitive();
      });
    }
  }
  return s;
};
var toFuture_default = toFuture;

// ../../node_modules/compromise/src/3-three/sentences/conjugate/toNegative.js
var mainVerbs = (s, parsed) => {
  if (!parsed.verb.found) {
    return s.none().verbs();
  }
  return parsed.verb.growRight(".*").verbs();
};
var toNegative = function(s, parsed) {
  const inverted = question_default(s, "negative");
  if (inverted) {
    return inverted;
  }
  const entries = groups_default(mainVerbs(s, parsed), true);
  const head = entries[0];
  if (!head) {
    return s;
  }
  if (!head.parsed.auxiliary.found && !head.parsed.negative.found) {
    entries.forEach((entry) => {
      if (entry.head === head) {
        entry.root.replaceWith(inflect2(entry.parsed.root, Inf)).tag(Inf);
      }
    });
  }
  head.vb.toNegative();
  return s;
};
var toPositive = function(s, parsed) {
  const inverted = question_default(s, "positive");
  if (inverted) {
    return inverted;
  }
  const entries = groups_default(mainVerbs(s, parsed), true);
  const head = entries[0];
  if (!head) {
    return s;
  }
  const tense = doTense(head.parsed);
  if (tense) {
    entries.forEach((entry) => {
      if (entry.head === head) {
        entry.root.replaceWith(inflect2(entry.parsed.root, tense)).tag(tense);
      }
    });
  }
  head.vb.toPositive();
  s.compute("chunks");
  return s;
};

// ../../node_modules/compromise/src/3-three/sentences/conjugate/toInfinitive.js
var toInfinitive2 = function(s) {
  s.verbs().toInfinitive();
  return s;
};
var toInfinitive_default2 = toInfinitive2;

// ../../node_modules/compromise/src/3-three/sentences/api.js
var api16 = function(View2) {
  class Sentences extends View2 {
    json(opts2 = {}) {
      return this.map((m3) => {
        const json = m3.toView().json(opts2)[0] || {};
        const { subj, verb, pred, grammar: grammar2 } = parse_default7(m3);
        json.sentence = {
          subject: subj.text("normal"),
          verb: verb.text("normal"),
          predicate: pred.text("normal"),
          grammar: grammar2
        };
        return json;
      }, []);
    }
    isQuestion(n2) {
      return this.questions(n2);
    }
    isExclamation(n2) {
      const res = this.filter((s) => s.lastTerm().has("@hasExclamation"));
      return res.getNth(n2);
    }
    isStatement(n2) {
      const res = this.filter((s) => !s.isExclamation().found && !s.isQuestion().found);
      return res.getNth(n2);
    }
  }
  lib_default16(Sentences, "Sentences");
  const each = (fn) => function(n2) {
    return this.getNth(n2).map((s) => fn(s, parse_default7(s)));
  };
  const toPastTense = each(toPast_default);
  const toPresentTense = each(toPresent_default);
  const toFutureTense = each(toFuture_default);
  Object.assign(Sentences.prototype, {
    toPastTense,
    toPresentTense,
    toFutureTense,
    toInfinitive: each(toInfinitive_default2),
    toNegative: each(toNegative),
    toPositive: each(toPositive),
    // aliases
    toPresent: toPresentTense,
    toPast: toPastTense,
    toFuture: toFutureTense
  });
  const methods20 = {
    sentences: function(n2) {
      let m3 = this.map((s) => s.fullSentence());
      m3 = m3.getNth(n2);
      return new Sentences(this.document, m3.pointer);
    },
    questions: function(n2) {
      const m3 = questions_default(this);
      return m3.getNth(n2);
    }
  };
  Object.assign(View2.prototype, methods20);
};
var api_default17 = api16;

// ../../node_modules/compromise/src/3-three/sentences/plugin.js
var plugin_default28 = { api: api_default17 };

// ../../node_modules/compromise/src/3-three/topics/people/find.js
var find6 = function(doc) {
  let m3 = doc.splitAfter("@hasComma");
  m3 = m3.match("#Hon+? #Pers+");
  const poss = m3.match("#Poss+").notIf("(his|her)");
  m3 = m3.splitAfter(poss);
  return m3;
};
var find_default5 = find6;

// ../../node_modules/compromise/src/3-three/topics/people/parse.js
var parse8 = function(m3) {
  const res = {};
  res.firstName = m3.match("#First+");
  res.lastName = m3.match("#Last+");
  res.honorific = m3.match("#Hon+");
  const last = res.lastName;
  const first = res.firstName;
  if (!first.found || !last.found) {
    if (!first.found && !last.found && m3.has("^#Hon #Hon? .$")) {
      res.lastName = m3.match(".$");
      return res;
    }
  }
  return res;
};
var parse_default9 = parse8;

// ../../node_modules/compromise/src/3-three/coreference/compute/lib.js
var he = "(he|him|his)";
var she = "(she|her|hers)";
var they = "(they|them|their|theirs)";
var findChained = function(want, s) {
  const m3 = s.match(want);
  if (m3.found) {
    const ref = m3.pronouns().refersTo();
    if (ref.found) {
      return ref;
    }
  }
  return s.none();
};
var prevSentence = function(m3) {
  if (!m3.found) {
    return m3;
  }
  const [n2] = m3.fullPointer[0];
  if (n2 && n2 > 0) {
    return m3.update([[n2 - 1]]);
  }
  return m3.none();
};

// ../../node_modules/compromise/src/3-three/topics/people/gender.js
var m2 = "male";
var f = "female";
var honorifics = {
  mr: m2,
  mrs: f,
  miss: f,
  madam: f,
  // british stuff
  king: m2,
  queen: f,
  duke: m2,
  duchess: f,
  baron: m2,
  baroness: f,
  count: m2,
  countess: f,
  prince: m2,
  princess: f,
  sire: m2,
  dame: f,
  lady: f,
  ayatullah: m2,
  //i think?
  congressman: m2,
  congresswoman: f,
  "first lady": f,
  // marked as non-binary
  mx: null
};
var predictGender = function(parsed, person) {
  const { firstName, honorific } = parsed;
  if (firstName.has("#FemaleName")) {
    return f;
  }
  if (firstName.has("#MaleName")) {
    return m2;
  }
  if (honorific.found) {
    let hon = honorific.text("normal");
    hon = hon.replace(/\./g, "");
    if (Object.hasOwn(honorifics, hon)) {
      return honorifics[hon];
    }
    if (/^her /.test(hon)) {
      return f;
    }
    if (/^his /.test(hon)) {
      return m2;
    }
  }
  const after = person.after();
  if (!after.has("#Pers") && after.has("#Pron")) {
    const pro = after.match("#Pron");
    if (pro.has("(they|their)")) {
      return null;
    }
    const hasMasc = pro.has("(he|his)");
    const hasFem = pro.has(she);
    if (hasMasc && !hasFem) {
      return m2;
    }
    if (hasFem && !hasMasc) {
      return f;
    }
  }
  return null;
};
var gender_default = predictGender;

// ../../node_modules/compromise/src/3-three/topics/people/api.js
var addMethod2 = function(View2) {
  class People extends View2 {
    parse(n2) {
      return this.getNth(n2).map(parse_default9, []);
    }
    json(n2) {
      return jsonWith(this, n2, "person", (p4) => {
        const tmp = p4.clone();
        tmp.possessives().strip();
        const parsed = parse_default9(tmp);
        return {
          firstName: parsed.firstName.text("normal"),
          lastName: parsed.lastName.text("normal"),
          honorific: parsed.honorific.text("normal"),
          presumed_gender: gender_default(parsed, p4)
        };
      });
    }
    // used for co-reference resolution only
    presumedMale() {
      return this.filter((m3) => {
        return m3.has("(#MaleName|mr|mister|sr|jr|king|pope|prince|sir)");
      });
    }
    presumedFemale() {
      return this.filter((m3) => {
        return m3.has("(#FemaleName|mrs|miss|queen|princess|madam)");
      });
    }
  }
  lib_default16(People, "People");
  View2.prototype.people = select_default(People, find_default5, true);
};
var api_default18 = addMethod2;

// ../../node_modules/compromise/src/3-three/topics/places.js
var find7 = function(doc) {
  let m3 = doc.match("(#Place|#Address)+");
  let splits = m3.match("@hasComma");
  splits = splits.filter((c) => {
    if (c.has("(asia|africa|europe|america)$")) {
      return true;
    }
    if (c.has("(#City|#Region|#Prop)$") && c.after("^(#Country|#Region)").found) {
      return false;
    }
    return true;
  });
  m3 = m3.splitAfter(splits);
  return m3;
};
var places_default2 = find7;

// ../../node_modules/compromise/src/3-three/topics/topics.js
var find8 = function(n2) {
  const r = this.clauses();
  let m3 = r.people();
  m3 = m3.concat(r.places());
  m3 = m3.concat(r.organizations());
  m3 = m3.concat(r.match("#Acronym").ifNo(m3));
  m3 = m3.not("(someone|man|woman|mother|brother|sister|father)");
  m3 = m3.sort("seq");
  m3 = m3.getNth(n2);
  return m3;
};
var api17 = function(View2) {
  View2.prototype.topics = find8;
};
var topics_default = api17;

// ../../node_modules/compromise/src/3-three/topics/plugin.js
var api18 = function(View2) {
  api_default18(View2);
  View2.prototype.places = function(n2) {
    const m3 = places_default2(this);
    return m3.getNth(n2);
  };
  View2.prototype.organizations = function(n2) {
    const m3 = this.match("#Org+");
    return m3.getNth(n2);
  };
  topics_default(View2);
};
var plugin_default29 = { api: api18 };

// ../../node_modules/compromise/src/3-three/verbs/find.js
var findVerbs = function(doc) {
  let m3 = doc.match("<Verb>");
  m3 = m3.not("#Conj");
  m3 = m3.not("#Prep");
  let gerunds = doc.match("#Prep (#Adv|#Neg)+? [#Ger]", 0);
  const passive2 = "(being|having) (#Adv|#Neg|#Aux)+? (#Past|#Participle|#Ger)";
  let chains = doc.match("#Prep (#Adv|#Neg)+? [" + passive2 + "]", 0);
  gerunds = gerunds.concat(chains);
  while (gerunds.found) {
    chains = gerunds.growRight("(and|or) (#Adv|#Neg)+? " + passive2);
    const next = chains.growRight("(and|or) (#Adv|#Neg)+? #Ger");
    if (next.wordCount() === gerunds.wordCount()) {
      break;
    }
    gerunds = next;
  }
  m3 = m3.not(gerunds.terms());
  m3 = m3.splitAfter("@hasComma");
  m3 = m3.splitAfter("[(do|did|am|was|is|will)] (is|was)", 0);
  m3 = m3.splitBefore("(#Verb && !#Cop && !#Aux) [being] #Verb", 0);
  m3 = m3.splitBefore("(#Verb && !#Aux) [to be] #Verb", 0);
  m3 = m3.splitAfter("[help] #Pres", 0);
  m3 = m3.splitBefore("(#Pres|#Past) [#Cop]$", 0);
  m3 = m3.splitBefore("(#Pres|#Past) [will be]$", 0);
  m3 = m3.splitBefore("(#Pres|#Past) [(had|has)]", 0);
  m3 = m3.not("#Refl$");
  m3 = m3.not("#Adj");
  m3 = m3.splitAfter("[#Past] #Past", 0);
  m3 = m3.splitAfter("[#Past] #Aux+ #Past", 0);
  m3 = m3.splitAfter("#Cop [#Ger] #Past", 0);
  m3 = m3.if("#Verb");
  if (m3.has("(#Verb && !#Aux) #Adv+? #Cop")) {
    m3 = m3.splitBefore("#Cop");
  }
  return m3;
};
var find_default6 = findVerbs;

// ../../node_modules/compromise/src/3-three/verbs/api/toJSON.js
var toJSON3 = function(vb3) {
  const parsed = parse_default8(vb3);
  vb3 = vb3.clone().toView();
  const info = grammar_default(vb3, parsed);
  return {
    root: parsed.root.text(),
    preAdverbs: toArray3(parsed.adverbs.pre),
    postAdverbs: toArray3(parsed.adverbs.post),
    auxiliary: parsed.auxiliary.text("normal"),
    negative: parsed.negative.found,
    prefix: parsed.prefix.text("normal"),
    infinitive: infinitive(parsed.root),
    grammar: info
  };
};
var toJSON_default2 = toJSON3;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toInfinitive.js
var toInf2 = function(vb3, parsed) {
  vb3.growLeft("@hasContraction+").contractions().expand();
  parsed = parse_default8(vb3);
  const { root, auxiliary: auxiliary2 } = parsed;
  const aux = auxiliary2.terms().harden();
  const str = infinitive(root);
  if (str === "be" && parsed.negative.found) {
    const copula2 = isAreAm(vb3, parsed);
    if (aux.found) {
      vb3.remove(root);
      vb3.match(aux).firstTerm().replaceWith(copula2);
      vb3.remove(aux.slice(1));
    } else {
      vb3.replace(root, copula2);
    }
    retag2(vb3);
    return vb3;
  }
  if (str) {
    vb3.replace(root, str, keepTags).tag(Vb).firstTerm().tag(Inf);
  }
  if (aux.found) {
    vb3.remove(aux);
  }
  if (parsed.negative.found && !vb3.has("never")) {
    if (!vb3.has("not")) {
      vb3.prepend("not");
    }
    const does = doDoes(vb3, parsed);
    vb3.prepend(does);
  }
  vb3.fullSentence().compute(["freeze", "lexicon", "preTagger", "postTagger", "unfreeze", "chunks"]);
  return vb3;
};
var toInfinitive_default3 = toInf2;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/auxiliary.js
var plan = function(chain, target, vb3, parsed) {
  const { finite, passive: passive2, progressive, words: words2 } = chain;
  let perfect = chain.perfect;
  if (target === "gerund") {
    if (progressive) return words2;
    return [isAreAm(vb3, parsed), "being"];
  }
  if (chain.modal || chain.prospective) {
    if (target === "participle") {
      if (perfect) return words2;
      const prefix6 = words2.slice(0, chain.prefixLength);
      const tail3 = words2.slice(chain.prefixLength);
      if (tail3[0] === "be") tail3[0] = "been";
      return [...prefix6, "have", ...tail3];
    }
    const head2 = target === "past" ? wasWere(vb3, parsed) : isAreAm(vb3, parsed);
    return [head2, ...words2.slice(1)];
  }
  if (target === "present" && /^(has|have|is|are|am)$/.test(finite)) return words2;
  if (target === "past" && /^(had|was|were|got)$/.test(finite)) return words2;
  if (target === "future" && finite === "will") return words2;
  if (target === "participle") {
    if (perfect && finite !== "will") return words2;
    if (!passive2 && chain.form === "future-perfect-progressive") return words2;
    perfect = true;
    target = "present";
  }
  if (passive2 && finite === "will" && target === "past" && !progressive) {
    perfect = true;
  }
  if (finite === "got" && target === "past") return words2;
  if (finite === "got" && target === "future") return ["will", "get"];
  const tail2 = words2.slice(finite === "will" ? 2 : 1);
  if (!passive2 && progressive && perfect && !chain.perfect) tail2.unshift("been");
  if (passive2) {
    tail2.length = 0;
    if (perfect) tail2.push("been");
    if (progressive) tail2.push("being");
  }
  const base = perfect ? "have" : "be";
  if (target === "future") return ["will", base, ...tail2];
  let head;
  if (target === "past") {
    head = perfect ? "had" : wasWere(vb3, parsed);
  } else {
    head = perfect ? haveHas(vb3, parsed) : isAreAm(vb3, parsed);
  }
  return [head, ...tail2];
};
var write = function(vb3, parsed, words2, target, passive2) {
  const slots = vb3.match(parsed.auxiliary).terms().map((term) => ({ view: term.harden() }), []).map((slot) => slot.view);
  const root = vb3.match(parsed.root).harden();
  const sourceTail = slots.slice(1);
  const targetTail = target.slice(1);
  const overlap = Math.min(sourceTail.length, targetTail.length);
  const extra = targetTail.slice(0, targetTail.length - overlap);
  if (extra.length > 0) {
    const text = extra.join(" ");
    if (!passive2 && target[0] === "will" && target[1] === "have") {
      slots[0].toView().insertAfter(text).terms().slice(1).tag(Aux);
    } else {
      const anchor = sourceTail.length > 0 ? sourceTail[0] : root;
      anchor.toView().insertBefore(text).terms().slice(0, extra.length).tag(Aux);
    }
  }
  for (let i3 = 0; i3 < overlap; i3 += 1) {
    const sourceIndex = slots.length - 1 - i3;
    const replacement = target[target.length - 1 - i3];
    if (words2[sourceIndex] !== replacement) {
      slots[sourceIndex].replaceWith(replacement).tag(Aux);
    }
  }
  for (let i3 = sourceTail.length - overlap - 1; i3 >= 0; i3 -= 1) {
    sourceTail[i3].remove();
  }
  if (words2[0] !== target[0]) slots[0].replaceWith(target[0]).tag(Aux);
  return vb3;
};
var convertAuxiliary = function(vb3, parsed, form, target) {
  const chain = auxiliary_default(parsed, form);
  if (!chain) return null;
  if (target === "gerund" && !chain.passive) return null;
  if (chain.modal && target !== "participle" && target !== "gerund") return null;
  if (chain.prospective && !chain.perfect && !chain.passive && form === AuxFut) return null;
  const words2 = plan(chain, target, vb3, parsed);
  if (words2.join(" ") === chain.words.join(" ")) return vb3;
  vb3.growLeft("@hasContraction+").contractions().expand();
  const live = parse_default8(vb3);
  const root = vb3.match(live.root).harden();
  write(vb3, live, chain.words, words2, chain.passive);
  if (target === "participle" && chain.modal && !chain.perfect && !chain.passive && !chain.progressive) {
    root.replaceWith(inflect2(live.root, Participle));
  }
  retag2(vb3);
  return vb3;
};
var auxiliary_default2 = convertAuxiliary;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/_lib.js
var byForm = (target, forms7, fallback2, isDone) => (vb3, parsed, form) => {
  const converted = auxiliary_default2(vb3, parsed, form, target);
  if (converted) {
    return converted;
  }
  if (isDone && isDone(vb3)) {
    return vb3;
  }
  const fn = Object.hasOwn(forms7, form) ? forms7[form] : fallback2;
  if (fn) {
    vb3 = fn(vb3, parsed);
    retag2(vb3);
  }
  return vb3;
};
var lib_default23 = byForm;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toPast.js
var fns6 = {
  noAux: (vb3, parsed) => {
    if (parsed.auxiliary.found) {
      vb3 = vb3.remove(parsed.auxiliary);
    }
    return vb3;
  },
  // walk->walked
  simple: (vb3, parsed) => {
    const root = parsed.root;
    if (root.has("#Mod")) {
      return vb3;
    }
    let str = inflect2(root, Past, { keepPunct: false });
    str = str === "been" ? "was" : str;
    if (str === "was") {
      str = wasWere(vb3, parsed);
    }
    if (str) {
      vb3.replace(root, str, keepTags);
    }
    return vb3;
  },
  both: function(vb3, parsed) {
    if (parsed.root.has("be")) {
      vb3.replace("will", wasWere(vb3, parsed));
      return vb3.remove("be");
    }
    if (parsed.negative.found) {
      vb3.replace("will", "did");
      return vb3;
    }
    vb3 = fns6.simple(vb3, parsed);
    vb3 = fns6.noAux(vb3, parsed);
    return vb3;
  }
};
var forms2 = {
  // walk -> walked
  [InfForm]: fns6.simple,
  // he walks -> he walked
  [SimplePres]: fns6.simple,
  // he walked
  [SimplePast]: noop,
  // he will walk -> he walked
  [SimpleFut]: fns6.both,
  // would be walked -> 'would have been walked'
  [PresCond]: (vb3) => {
    vb3.replace("be", "have been");
    return vb3;
  },
  // would have been walked
  [PastCond]: noop,
  // is going to drink -> was going to drink
  [AuxFut]: (vb3, parsed) => {
    vb3.replace("(is|are|am)", wasWere(vb3, parsed), keepTags);
    return vb3;
  },
  // used to walk
  [AuxPast]: noop,
  // we do walk -> we did walk
  [AuxPres]: (vb3) => {
    vb3.replace("(do|does)", "did", keepTags);
    return vb3;
  },
  // must walk -> 'must have walked'
  [ModalInf]: (vb3, parsed) => {
    if (vb3.has("can")) {
      vb3.replace("can", "could", keepTags);
    } else {
      vb3.match(parsed.root).replaceWith("have " + inflect2(parsed.root, Participle));
      vb3.match("have").tag(Aux);
    }
    return vb3;
  },
  // must have walked
  [ModalPast]: noop,
  // wanted to walk
  [WantInf]: (vb3) => {
    vb3.replace("(want|wants)", "wanted", keepTags);
    vb3.remove("will");
    return vb3;
  },
  // started looking
  [GerPhrase]: (vb3, parsed) => {
    parsed.root = parsed.root.not("#Ger$");
    fns6.simple(vb3, parsed);
    noWill(vb3);
    return vb3;
  }
};
var toPast = lib_default23("past", forms2);
var toPast_default2 = toPast;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toParticiple.js
var simple = (vb3, parsed) => {
  const { root, auxiliary: auxiliary2 } = parsed;
  if (root.has("#Mod")) {
    return vb3;
  }
  let str = infinitive(root, { keepPunct: false });
  if (str === "be" && parsed.negative.has("not")) {
    const have = haveHas(vb3, parsed);
    vb3.replace(root, have);
    vb3.match(parsed.negative).insertAfter("been");
    vb3.match(have).tag(Aux);
    return vb3;
  }
  str = inflect2(root, Participle, { keepPunct: false });
  if (auxiliary2.has("(do|does|did)")) {
    const have = haveHas(vb3, parsed);
    vb3.replace(root, str);
    vb3.replace("(do|does|did)", have).match(have).tag(Aux);
    return vb3;
  }
  if (str) {
    vb3 = vb3.replace(root, str);
    const have = haveHas(vb3, parsed);
    vb3.prepend(have).match(have).tag(Aux);
    vb3.remove(auxiliary2);
  }
  return vb3;
};
var forms3 = {
  // walk -> walked
  [InfForm]: simple,
  // he walks -> he walked
  [SimplePres]: simple,
  // he will walk -> he walked
  [SimpleFut]: (vb3, parsed) => {
    vb3.replace(parsed.root, inflect2(parsed.root, Participle));
    return vb3.replace("will", haveHas(vb3, parsed));
  },
  // would be walked -> 'would have been walked'
  [PresCond]: (vb3) => vb3.replace("be", "have been"),
  // would have been walked
  [PastCond]: noop,
  // is going to drink -> was going to drink
  [AuxFut]: (vb3, parsed) => {
    const have = haveHas(vb3, parsed);
    vb3.replace("(is|are|am|was|were)", have);
    vb3.match("going").insertBefore("been");
    vb3.match("(have|has|been|be)").tag(Aux);
    vb3.match("going").unTag(Aux).tag(Ger);
    vb3.match("to").unTag(Aux).tag(Conj);
    return vb3;
  },
  // must walk -> 'must have walked'
  [ModalInf]: (vb3, parsed) => {
    vb3.match(parsed.root).replaceWith("have " + inflect2(parsed.root, Participle));
    vb3.match("have").tag(Aux);
    return vb3;
  },
  // must have walked
  [ModalPast]: noop,
  [ModalPerfProg]: noop
  // wanted to walk
  // 'want-infinitive': noop,
  // started looking
  // 'gerund-phrase': noop,
};
var toParticiple = lib_default23("participle", forms3, simple);
var toParticiple_default = toParticiple;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toPresent.js
var simple2 = (vb3, parsed) => {
  const root = parsed.root;
  let str = infinitive(root);
  const plural = isPlural4(vb3, parsed);
  if (!plural) {
    str = inflect2(root, Pres);
  }
  if (root.has("#Cop")) {
    str = isAreAm(vb3, parsed);
  }
  if (str) {
    vb3 = vb3.replace(root, str, keepTags);
    if (!plural) vb3.not("#Particle").unTag(Inf);
    vb3.not("#Particle").tag(Pres);
  }
  return vb3;
};
var toGerund = (vb3, parsed) => {
  const root = parsed.root;
  const str = inflect2(root, Ger);
  if (str) {
    vb3 = vb3.replace(root, str, keepTags);
    vb3.not("#Particle").tag(Ger);
  }
  return vb3;
};
var forms4 = {
  // walk
  [InfForm]: simple2,
  // he walks -> he walked
  [SimplePres]: (vb3, parsed) => {
    const { conjugate: conjugate2 } = vb3.methods.two.transform.verb;
    const { root } = parsed;
    if (root.has("#Inf")) {
      const subj = getSubject_default(vb3, parsed);
      const m3 = subj.subject;
      if (isPlural4(vb3, parsed) || m3.has("i")) {
        return vb3;
      }
      const str = root.text("normal");
      const pres = conjugate2(str, vb3.model).PresentTense;
      if (str !== pres) {
        vb3.replace(root, pres, keepTags).not("#Particle").unTag(Inf).tag(Pres);
      }
    } else {
      return simple2(vb3, parsed);
    }
    return vb3;
  },
  // he walked
  [SimplePast]: simple2,
  // he will walk -> he walked
  [SimpleFut]: (vb3, parsed) => {
    const { root, auxiliary: auxiliary2 } = parsed;
    if (auxiliary2.has("will") && root.has("be")) {
      const str = isAreAm(vb3, parsed);
      vb3.replace(root, str);
      vb3 = vb3.remove("will");
      vb3.replace("not " + str, str + " not");
    } else if (parsed.negative.found) {
      vb3.replace("will", doDoes(vb3, parsed)).match("(do|does)").tag(Aux);
    } else {
      simple2(vb3, parsed);
      vb3 = vb3.remove("will");
    }
    return vb3;
  },
  // would be walked ->
  [PresCond]: noop,
  // would have been walked ->
  [PastCond]: (vb3) => {
    vb3.replace("been", "be");
    return vb3.remove("have");
  },
  // is going to drink -> is drinking
  [AuxFut]: (vb3, parsed) => {
    const copula2 = isAreAm(vb3, parsed);
    vb3.replace("(was|were)", copula2);
    if (parsed.root.has("#Ger") && vb3.has("going to be")) {
      vb3.remove("going to be");
      return vb3;
    }
    toGerund(vb3, parsed);
    vb3.remove("(going|to)");
    return vb3;
  },
  // did walk -> is walking
  [AuxPast]: (vb3, parsed) => {
    if (parsed.auxiliary.has("did")) {
      const str = doDoes(vb3, parsed);
      vb3.replace(parsed.auxiliary, str);
      return vb3;
    }
    toGerund(vb3, parsed);
    vb3.replace(parsed.auxiliary, "is");
    return vb3;
  },
  // we do walk ->
  [AuxPres]: noop,
  // must walk -> 'must have walked'
  [ModalInf]: noop,
  // must have walked
  [ModalPast]: (vb3, parsed) => {
    const str = infinitive(parsed.root);
    if (str) {
      vb3.replace(parsed.root, str, keepTags);
    }
    return vb3.remove("have");
  },
  // started looking
  [GerPhrase]: (vb3, parsed) => {
    parsed.root = parsed.root.not("#Ger$");
    simple2(vb3, parsed);
    return vb3.remove("(will|have)");
  },
  // wanted to walk
  [WantInf]: (vb3, parsed) => {
    let str = "wants";
    if (isPlural4(vb3, parsed)) {
      str = "want";
    }
    vb3.replace("(want|wanted|wants)", str, keepTags);
    vb3.remove("will");
    return vb3;
  }
};
var toPresent = lib_default23("present", forms4);
var toPresent_default2 = toPresent;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toFuture.js
var simple3 = (vb3, parsed) => {
  const { root, auxiliary: auxiliary2 } = parsed;
  if (root.has("#Mod")) {
    return vb3;
  }
  const str = infinitive(root);
  if (str === "be" && parsed.negative.has("not")) {
    vb3.replace(root, "will");
    vb3.match(parsed.negative).insertAfter("be");
    return vb3;
  }
  if (str) {
    vb3 = vb3.replace(root, str, keepTags);
    vb3.not("#Particle").tag(Vb);
  }
  vb3.prepend("will").match("will").tag(Aux);
  vb3.remove(auxiliary2);
  return vb3;
};
var wouldWill = (vb3) => vb3.replace("would", "will");
var forms5 = {
  // walk ->
  [InfForm]: simple3,
  // he walks ->
  [SimplePres]: simple3,
  // he walked
  [SimplePast]: simple3,
  // he will walk ->
  [SimpleFut]: noop,
  // would be walked ->
  [PresCond]: wouldWill,
  // would have been walked ->
  [PastCond]: wouldWill,
  // is going to drink ->
  [AuxFut]: (vb3, parsed) => vb3.replace("(was|were)", isAreAm(vb3, parsed)),
  // used to walk -> is walking
  // did walk -> is walking
  [AuxPast]: (vb3) => {
    if (vb3.has("used") && vb3.has("to")) {
      vb3.replace("used", "will");
      return vb3.remove("to");
    }
    vb3.replace("did", "will");
    return vb3;
  },
  // we do walk ->
  // he does walk ->
  [AuxPres]: (vb3) => {
    return vb3.replace("(do|does)", "will");
  },
  // must walk ->
  [ModalInf]: noop,
  // must have walked
  [ModalPast]: noop,
  // started looking
  [GerPhrase]: (vb3, parsed) => {
    parsed.root = parsed.root.not("#Ger$");
    simple3(vb3, parsed);
    return vb3.remove("(had|have)");
  },
  // wanted to walk
  [WantInf]: (vb3) => {
    vb3.replace("(want|wants|wanted)", "will want");
    return vb3;
  }
};
var toFuture2 = lib_default23("future", forms5, null, (vb3) => vb3.has("will"));
var toFuture_default2 = toFuture2;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toGerund.js
var toGerund2 = function(vb3, parsed, form) {
  const converted = auxiliary_default2(vb3, parsed, form, "gerund");
  if (converted) return converted;
  if (vb3.has("#Ger")) {
    return vb3;
  }
  vb3.growLeft("@hasContraction+").contractions().expand();
  parsed = parse_default8(vb3);
  const { root, auxiliary: auxiliary2 } = parsed;
  const str = infinitive(root);
  const gerund = inflect2(root, Ger);
  if (gerund) {
    const aux = isAreAm(vb3, parsed);
    if (str === "be" && !auxiliary2.found && parsed.negative.found) {
      vb3.replace(root, aux);
      vb3.match(parsed.negative).insertAfter(gerund);
    } else {
      vb3.replace(root, gerund, keepTags);
      vb3.remove(auxiliary2);
      vb3.prepend(aux);
    }
  }
  vb3.replace("not is", "is not");
  vb3.replace("not are", "are not");
  retag2(vb3);
  return vb3;
};
var toGerund_default = toGerund2;

// ../../node_modules/compromise/src/3-three/verbs/api/conjugate/toNegative.js
var toInf3 = function(vb3, parsed) {
  const { toInfinitive: toInfinitive3 } = vb3.methods.two.transform.verb;
  const str = toInfinitive3(parsed.root.text({ keepPunct: false }), vb3.model, getTense2(vb3));
  if (str) {
    vb3.replace(parsed.root, str);
  }
  return vb3;
};
var doesNot = function(vb3, parsed) {
  const does = doDoes(vb3, parsed);
  vb3.prepend(does + " not");
  return vb3;
};
var isWas = function(vb3) {
  let m3 = vb3.match("be");
  if (m3.found) {
    m3.prepend("not");
    return vb3;
  }
  m3 = vb3.match("(is|was|am|are|will|were)");
  if (m3.found) {
    m3.append("not");
    return vb3;
  }
  return vb3;
};
var hasCopula = (vb3) => vb3.has("(is|was|am|are|will|were|be)");
var forms6 = {
  // he walks' -> 'he does not walk'
  [SimplePres]: (vb3, parsed) => {
    if (hasCopula(vb3)) {
      return isWas(vb3);
    }
    vb3 = toInf3(vb3, parsed);
    vb3 = doesNot(vb3, parsed);
    return vb3;
  },
  // 'he walked' -> 'he did not walk'
  [SimplePast]: (vb3, parsed) => {
    if (hasCopula(vb3)) {
      return isWas(vb3);
    }
    vb3 = toInf3(vb3, parsed);
    vb3.prepend("did not");
    return vb3;
  },
  // walk! -> 'do not walk'
  [Imperative]: (vb3) => {
    vb3.prepend("do not");
    return vb3;
  },
  // walk -> does not walk
  [InfForm]: (vb3, parsed) => {
    if (hasCopula(vb3)) {
      return isWas(vb3);
    }
    return doesNot(vb3, parsed);
  },
  [PassivePast]: (vb3) => {
    if (vb3.has("got")) {
      vb3.replace("got", "get", keepTags);
      vb3.prepend("did not");
      return vb3;
    }
    const m3 = vb3.match("(was|were|had|have)");
    if (m3.found) {
      m3.append("not");
    }
    return vb3;
  },
  [AuxPast]: (vb3) => {
    if (vb3.has("used")) {
      vb3.prepend("did not");
      return vb3;
    }
    const m3 = vb3.match("(did|does|do)");
    if (m3.found) {
      m3.append("not");
    }
    return vb3;
  },
  // wants to walk
  [WantInf]: (vb3, parsed) => {
    vb3 = doesNot(vb3, parsed);
    vb3 = vb3.replace("wants", "want", keepTags);
    return vb3;
  }
};
var toNegative2 = function(vb3, parsed, form) {
  if (vb3.has("(#Neg|not)") || vb3.lookBehind("#Verb .* to$").found) {
    return vb3;
  }
  if (Object.hasOwn(forms6, form)) {
    vb3 = forms6[form](vb3, parsed);
    return vb3;
  }
  let m3 = vb3.matchOne("be");
  if (m3.found) {
    m3.prepend("not");
    return vb3;
  }
  if (hasCopula(vb3)) {
    return isWas(vb3);
  }
  m3 = vb3.matchOne("(will|had|have|has|did|does|do|#Mod)");
  if (m3.found) {
    m3.append("not");
    return vb3;
  }
  return vb3;
};
var toNegative_default = toNegative2;

// ../../node_modules/compromise/src/3-three/verbs/api/api.js
var convert4 = (target, fn) => function(n2) {
  return coordinate_default(this.getNth(n2), target, (vb3) => {
    const parsed = parse_default8(vb3);
    const info = grammar_default(vb3, parsed);
    if (info.isInfinitive) {
      return vb3;
    }
    return fn(vb3, parsed, info.form);
  });
};
var api19 = function(View2) {
  class Verbs extends View2 {
    parse(n2) {
      return this.getNth(n2).map(parse_default8);
    }
    json(opts2, n2) {
      const m3 = this.getNth(n2);
      const arr = m3.map((vb3) => {
        const json = vb3.toView().json(opts2)[0] || {};
        json.verb = toJSON_default2(vb3);
        return json;
      }, []);
      return arr;
    }
    subjects(n2) {
      return this.getNth(n2).map((vb3) => {
        const parsed = parse_default8(vb3);
        return getSubject_default(vb3, parsed).subject;
      });
    }
    adverbs(n2) {
      return this.getNth(n2).map((vb3) => vb3.match("#Adv"));
    }
    isSingular(n2) {
      return this.getNth(n2).filter((vb3) => {
        return !getSubject_default(vb3).plural;
      });
    }
    isPlural(n2) {
      return this.getNth(n2).filter((vb3) => {
        return getSubject_default(vb3).plural;
      });
    }
    isImperative(n2) {
      return this.getNth(n2).filter((vb3) => vb3.has("#Imp"));
    }
    conjugate(n2) {
      const { conjugate: conjugate2 } = this.world.methods.two.transform.verb;
      return this.getNth(n2).map((vb3) => {
        const parsed = parse_default8(vb3);
        const info = grammar_default(vb3, parsed);
        if (info.form === Imperative) {
          info.form = SimplePres;
        }
        let inf = parsed.root.text("normal");
        if (!parsed.root.has("#Inf")) {
          inf = infinitive(parsed.root) || inf;
        }
        return conjugate2(inf, vb3.model);
      }, []);
    }
    /** return only verbs with 'not'*/
    isNegative() {
      return this.if("#Neg");
    }
    /**  return only verbs without 'not'*/
    isPositive() {
      return this.ifNo("#Neg");
    }
    /** remove 'not' from these verbs */
    toPositive() {
      return coordinate_default(this, "positive", (vb3) => {
        const m3 = vb3.match("do not #Verb");
        if (m3.found) {
          m3.remove("do not");
        }
        vb3.match("not").tag(Neg);
        const parsed = parse_default8(vb3);
        const tense = doTense(parsed);
        if (tense) {
          const { root, auxiliary: auxiliary2 } = parsed;
          vb3.replace(root, inflect2(root, tense), keepTags).unTag(Inf).tag(tense);
          vb3.remove(auxiliary2);
        }
        return vb3.remove("#Neg");
      });
    }
    toNegative(n2) {
      return coordinate_default(this.getNth(n2), "negative", (vb3) => {
        const parsed = parse_default8(vb3);
        const info = grammar_default(vb3, parsed);
        const res = toNegative_default(vb3, parsed, info.form);
        const sentence = vb3.fullSentence();
        sentence.match("[(do|does|did)] not", 0).tag(Aux);
        sentence.compute("chunks");
        return res;
      });
    }
  }
  lib_default16(Verbs, "Verbs");
  const toPresentTense = convert4("present", toPresent_default2);
  const toPastTense = convert4("past", toPast_default2);
  const toFutureTense = convert4("future", toFuture_default2);
  Object.assign(Verbs.prototype, {
    toInfinitive: convert4("infinitive", toInfinitive_default3),
    toPresentTense,
    toPastTense,
    toFutureTense,
    toGerund: convert4("gerund", toGerund_default),
    toPastParticiple: convert4("participle", toParticiple_default),
    // aliases
    toPresent: toPresentTense,
    toPast: toPastTense,
    toFuture: toFutureTense
  });
  View2.prototype.verbs = select_default(Verbs, find_default6, true);
};
var api_default19 = api19;

// ../../node_modules/compromise/src/3-three/verbs/plugin.js
var plugin_default30 = {
  api: api_default19
};

// ../../node_modules/compromise/src/3-three/coreference/compute/pluralPhrase.js
var pluralPhrase = (phrase) => {
  return isPlural_default(phrase, phrase) || phrase.has("#NN and #Det? #Adj+? #NN");
};
var pluralPhrase_default = pluralPhrase;

// ../../node_modules/compromise/src/3-three/coreference/compute/actorGender.js
var male = new Set("man boy father dad son brother uncle husband boyfriend grandfather king prince sultan".split(" "));
var female = new Set("woman girl mother mom mum daughter sister aunt wife girlfriend grandmother queen princess lady".split(" "));
var compatibleActor = (person, gender) => {
  const head = person.splitBefore("#Prep").first();
  if (pluralPhrase_default(head)) {
    return false;
  }
  const actor = head.match("#Actor").last().text("normal").replace(/['’]s$/, "");
  const opposite = gender === "m" ? female : male;
  return !opposite.has(actor);
};
var actorGender_default = compatibleActor;

// ../../node_modules/compromise/src/3-three/coreference/compute/personBoundary.js
var personBoundary = (person) => {
  const terms = person.docs[0];
  const [sentence, start2, end2] = person.fullPointer[0];
  let limit = terms.length;
  const measurement = person.match("#Val+ #Unit").first();
  if (measurement.found) {
    const offset2 = measurement.fullPointer[0][1] - start2;
    if (terms.slice(0, offset2).some((term) => term.tags.has(Actor))) {
      limit = offset2;
    }
  }
  const actors = terms.slice(0, limit).map((term, i3) => term.tags.has(Actor) ? i3 : -1).filter((i3) => i3 !== -1);
  const last = actors.at(-1);
  if (last !== void 0 && terms[last].tags.has(Poss)) {
    limit = last + 1;
  }
  if (start2 + limit < end2) {
    return person.update([[sentence, start2, start2 + limit]]);
  }
  return person;
};
var personBoundary_default = personBoundary;

// ../../node_modules/compromise/src/3-three/coreference/compute/findPerson.js
var byGender = function(ppl, gender) {
  if (gender === "m") {
    return ppl.filter((m3) => !m3.presumedFemale().found);
  } else if (gender === "f") {
    return ppl.filter((m3) => !m3.presumedMale().found);
  }
  return ppl;
};
var getPerson = function(s, gender) {
  let people = s.people();
  people = byGender(people, gender);
  if (people.found) {
    return people.last();
  }
  people = s.nouns("#Actor").map(personBoundary_default).filter((person) => actorGender_default(person, gender));
  if (people.found) {
    return people.last();
  }
  if (gender === "f") {
    return findChained(she, s);
  }
  if (gender === "m") {
    return findChained(he, s);
  }
  return s.none();
};
var findPerson_default = getPerson;

// ../../node_modules/compromise/src/3-three/coreference/compute/findThey.js
var getThey = function(s) {
  const nouns = s.nouns();
  let things = nouns.isPlural().notIf("#Pron");
  if (things.found) {
    return things.last();
  }
  things = nouns.filter(pluralPhrase_default).notIf("#Pron");
  if (things.found) {
    return things.last();
  }
  const chain = findChained(they, s);
  if (chain.found) {
    return chain;
  }
  things = nouns.match("(somebody|nobody|everybody|anybody|someone|noone|everyone|anyone)");
  if (things.found) {
    return things.last();
  }
  return s.none();
};
var findThey_default = getThey;

// ../../node_modules/compromise/src/3-three/coreference/compute/index.js
var addReference = function(pron, m3) {
  if (m3 && m3.found) {
    const term = pron.docs[0][0];
    term.reference = m3.ptrs[0];
  }
};
var stepBack = function(m3, cb) {
  let s = m3.before();
  let res = cb(s);
  for (let i3 = 0; i3 < 2 && !res.found; i3 += 1) {
    s = prevSentence(i3 === 0 ? m3 : s);
    res = cb(s);
  }
  return res.found ? res : m3.none();
};
var coreference = function(view) {
  const pronouns = view.pronouns().if("(he|him|his|she|her|hers|they|them|their|theirs|it|its)");
  pronouns.forEach((pron) => {
    let res = null;
    if (pron.has(he)) {
      res = stepBack(pron, (m3) => findPerson_default(m3, "m"));
    } else if (pron.has(she)) {
      res = stepBack(pron, (m3) => findPerson_default(m3, "f"));
    } else if (pron.has(they)) {
      res = stepBack(pron, findThey_default);
    }
    if (res && res.found) {
      addReference(pron, res);
    }
  });
};
var compute_default13 = coreference;

// ../../node_modules/compromise/src/3-three/coreference/api/pronouns.js
var api20 = function(View2) {
  class Pronouns extends View2 {
    hasReference() {
      this.compute("coreference");
      return this.filter((m3) => {
        const term = m3.docs[0][0];
        return term.reference;
      });
    }
    // get the noun-phrase this pronoun refers to
    refersTo() {
      this.compute("coreference");
      return this.map((m3) => {
        if (!m3.found) {
          return m3.none();
        }
        const term = m3.docs[0][0];
        if (term.reference) {
          return m3.update([term.reference]);
        }
        return m3.none();
      });
    }
  }
  lib_default16(Pronouns, "Pronouns");
  View2.prototype.pronouns = select_default(Pronouns, "#Pron");
};
var pronouns_default = api20;

// ../../node_modules/compromise/src/3-three/coreference/plugin.js
var plugin_default31 = {
  compute: { coreference: compute_default13 },
  api: pronouns_default
};

// ../../node_modules/compromise/src/three.js
two_default.plugin(plugin_default20);
two_default.plugin(plugin_default21);
two_default.plugin(plugin_default22);
two_default.plugin(plugin_default31);
two_default.plugin(plugin_default23);
two_default.plugin(plugin_default24);
two_default.plugin(plugin_default25);
two_default.plugin(plugin_default26);
two_default.plugin(plugin_default27);
two_default.plugin(plugin_default28);
two_default.plugin(plugin_default29);
two_default.plugin(plugin_default30);
var three_default = two_default;

// ../core/src/nlp.ts
var DOMAIN_LEXICON = {
  // Availability nouns: the scheduling-vs-hypothetical boundary the POS tag
  // now enforces (the session-13 bare-leave bug class, mechanized).
  leave: "Noun",
  sabbatical: "Noun",
  vacation: "Noun",
  // Multiword domain idioms, so `.has('bus number')` matches as one lexeme
  // and the intent layer stops enumerating their verbal variants by hand.
  "bus number": "Noun",
  "knock-on effect": "Noun",
  "second-order effect": "Noun",
  "second-order effects": "Plural",
  "knock-on effects": "Plural",
  // Verb senses the dictionary gets wrong for this domain's traffic.
  ghost: "Verb",
  ghosts: "Verb",
  shelved: "Verb",
  travelling: "Verb"
};
var lexiconTaught = false;
function teachDomainLexicon() {
  if (lexiconTaught) return;
  three_default.addWords(DOMAIN_LEXICON);
  lexiconTaught = true;
}
var CACHE_LIMIT = 512;
var cache2 = /* @__PURE__ */ new Map();
function tagOfWord(doc, word) {
  const sentences = doc.terms().json();
  for (const sentence of sentences) {
    for (const term of sentence.terms) {
      const normal = (term.normal ?? term.text).toLowerCase().replace(/[^a-z]/g, "");
      if (normal !== word.toLowerCase()) continue;
      const tags = Array.from(term.tags ?? /* @__PURE__ */ new Set());
      if (tags.includes("Noun")) return "noun";
      if (tags.includes("Verb")) return "verb";
    }
  }
  return null;
}
function analyzeQuestion(question2) {
  const cached = cache2.get(question2);
  if (cached) return cached;
  teachDomainLexicon();
  const doc = three_default(question2);
  const analysis = {
    nouns: doc.nouns().out("array").map((s) => s.toLowerCase()),
    verbs: doc.verbs().out("array").map((s) => s.toLowerCase().replace(/[?!.]+$/, "")),
    personWords: doc.people().out("array").map((s) => s.toLowerCase().replace(/[?!.]+$/, "")),
    has: (idiom) => doc.has(idiom),
    isNounWord: (word) => tagOfWord(doc, word) === "noun",
    isVerbWord: (word) => tagOfWord(doc, word) === "verb"
  };
  if (cache2.size >= CACHE_LIMIT) {
    const oldest = cache2.keys().next().value;
    if (oldest !== void 0) cache2.delete(oldest);
  }
  cache2.set(question2, analysis);
  return analysis;
}

// ../core/src/intent.ts
var IMPACT = [
  { re: /\bblast radius\b/i, weight: 3 },
  { re: /\bwhat (?:breaks|happens|do (?:we|you) lose)\b/i, weight: 3 },
  // Availability wording inside the if-clause: "how exposed are we if sam
  // is out sick?" — illness and leave are temporary unavailability, the same
  // hypothetical the blast radius answers. Kept inside the if-lane so a bare
  // "sam is out sick today" (a statement, not a question) scores nothing.
  // Session 12: "is out of office" joins the availability list, and the
  // state verbs (cancelled, superseded, reversed, descoped, dropped,
  // deprioritized) accept is/gets/got/was/were — "how bad would it be if the
  // payments epic got cancelled?" — while bare "quit", "resigned",
  // "retired" and "departed" join the departure verbs ("if sam quit" is
  // both past and present plural). Bare "leave" stays out: "if they leave"
  // only ever appears without a name, and "if we leave the work open" is a
  // different hypothetical than a departure.
  // Session 13: the availability list grows the real chat shapes — "gets
  // sick" / "falls ill" ("what if alex gets sick?"), "is away" ("what if
  // alex is away next month?"), the parental / maternity / paternity leave
  // and sabbatical forms in their goes-on / takes variants ("what if priya
  // goes on parental leave?", "what if priya takes a sabbatical?"), and
  // "is/gets poached" ("what if alex gets poached?"), the talent-loss
  // hypothetical.
  // Session 14: the talent-loss and transfer shapes grow — "walks off the
  // job" and "ghosts us" (the abrupt and silent departure idioms), and the
  // transfer verbs "gets pulled onto another team" and "gets reassigned"
  // (organizationally moved, same blast radius). The POS tagger (nlp.ts)
  // gates "ghosts"/"shelved" as VERBS so the noun senses ("the game
  // ghosts", "the shelved state") cannot fire the lane — the first
  // compromise-backed signals in this table.
  // Session 15: the talent-loss and transfer shapes grow again —
  // "gets sidelined" (removed from the work), "gets headhunted" (recruited
  // away, poached's sibling), "moves abroad" and "relocates" (geographic
  // departure), the illness shapes "is off sick" and "is hospitalised /
  // hospitalized" (both spellings), "gets decommissioned" (the system
  // metaphor for taken out of the work), and "goes silent / goes quiet"
  // (ghosts' state-verb sibling). Each keeps the be/get auxiliary the
  // if-lane requires, so bare "silent"/"quiet"/"sidelined" fragments stay
  // out.
  { re: /\bif\b[^.?!]{0,48}\b(?:leaves|leaving|left|departs|departed|quit|quits|resigns|resigned|retires|retired|is unavailable|becomes unavailable|is out sick|gets sick|falls ill|is off sick|is\s+(?:hospitali[sz]ed)|gets?\s+sidelined|gets?\s+headhunted|moves\s+abroad|relocates?|gets?\s+decommissioned|goes\s+(?:silent|quiet)|is out of office|calls in sick|is on vacation|is on leave|goes on leave|is away|will be away|got hit|gets hit|changes|changed|walks\s+off\s+the\s+job|ghosts?\s+(?:us|the\s+team)|gets?\s+pulled\s+onto\s+(?:another|a\s+different|another\s+team)|gets?\s+reassigned|got\s+reassigned|(?:is|goes)\s+on\s+(?:parental|maternity|paternity)\s+leave|(?:is|goes)\s+on\s+sabbatical|takes\s+(?:an?\s+)?(?:(?:parental|maternity|paternity)\s+)?leave|takes\s+(?:an?\s+)?sabbatical|(?:is|gets?|got|was|were)\s+poached|(?:is|gets?|got|was|were)\s+(?:cancelled|canceled|reversed|superseded|descoped|dropped|deprioritized|shelved|paused))\b/i, weight: 3 },
  // The when-lane: same hypothetical as the if-lane, but anchored by "when"
  // or "before". Extended in session 12 from pronouns-only ("before he
  // leaves") to any subject ("when alex is out of office"): the lazy filler
  // is bounded and the availability words must follow a be-verb, so "when is
  // alex on leave?" (a scheduling question) and "when will sam be back from
  // leave?" do not fire — only "when <someone> is out of office / on leave
  // / out sick / on vacation / unavailable" does. Session 13 closes a
  // regression that extension introduced: the DEPARTURE lane below once
  // accepted bare "leave", so its lazy filler could span "does priya go on
  // parental" and read the NOUN "leave" as the departure verb — "when does
  // priya go on parental leave?", "when is alex on leave?" and "when will
  // sam be back from leave?" all fired impact. Bare "leave" is out of the
  // departure lane now (only "leaves"/"left" match), exactly like the
  // if-lane above; the noun rides the availability lane, where it must
  // follow a be-verb. "away" and the parental / sabbatical forms join the
  // availability lane's list to mirror the if-lane.
  { re: /\bwhen\s+[^.?!]{0,32}?\s(?:is|are)\s+(?:out\s+of\s+(?:office|sick)|on\s+(?:(?:parental|maternity|paternity)\s+)?(?:leave|vacation|sabbatical)|away|unavailable)\b/i, weight: 3 },
  { re: /\b(?:before|when)\s+[^.?!]{0,32}?\s(?:leaves|left|goes|quit|quits|resigns?|resigned|retires?|retired)\b/i, weight: 3 },
  // The while-lane (session 13): the same availability hypothetical the
  // when-lane answers, anchored by "while" — "who is exposed while alex is
  // on vacation?" asks for Alex's blast radius without any if or when. It
  // mirrors the when-availability lane exactly (bounded lazy filler, a
  // be-verb, then the availability words), so a bare "while alex was on
  // vacation" (past tense, a historical fact, not a hypothetical) and a
  // "while on vacation" fragment (no be-verb) both stay out.
  { re: /\bwhile\s+[^.?!]{0,32}?\s(?:is|are)\s+(?:out\s+of\s+(?:office|sick)|on\s+(?:(?:parental|maternity|paternity)\s+)?(?:leave|vacation|sabbatical)|away|unavailable)\b/i, weight: 3 },
  // Session 14: the while-lane grows "travelling" ("who is exposed while
  // alex is travelling?") — the same temporary-unavailability hypothetical
  // the when-lane answers, in its gerund form. The gerund keeps the be-verb
  // requirement, so "while alex was travelling" (past tense, a historical
  // fact) still stays out.
  { re: /\b(?:while|whilst)\s+[^.?!]{0,32}?\s(?:is|are)\s+(?:out\s+of\s+(?:office|sick)|on\s+(?:(?:parental|maternity|paternity)\s+)?(?:leave|vacation|sabbatical|holiday)|away|unavailable|travelling|traveling)\b/i, weight: 3 },
  // Session 15: the while-lane grows "holiday" ("whilst alex is on holiday?"
  // and "while alex is on holiday?" — the British availability word beside
  // vacation), and a **during-possessive lane** mirrors the while-lane for
  // "who is exposed during alex's vacation?" / "during priya's sabbatical?"
  // — the same temporary-unavailability hypothetical, anchored by the
  // possessive rather than a be-verb. During + a person-shaped possessive +
  // an availability noun; past-tense stays out because during carries no
  // tense at all, so the noun must carry the availability.
  { re: /\bduring\s+[^.?!]{0,32}?(?:vacation|sabbatical|leave|holiday|absence|time\s+off|parental\s+leave|maternity\s+leave|paternity\s+leave)\b/i, weight: 3 },
  { re: /\b(?:hit by a bus|bus factor)\b/i, weight: 3 },
  { re: /\b(?:offboard(?:ing|s)?|handover|hand-off|handoff|succession)\b/i, weight: 3 },
  // Consequence wording: "what are the consequences of priya leaving?" asks
  // for the blast radius without any if-then verb pattern firing. "fallout"
  // (session 11), "implications" (session 12) and "ripple effects" (session
  // 13) are the same family and just as strong.
  { re: /\bconsequences?\b/i, weight: 3 },
  { re: /\bfallout\b/i, weight: 3 },
  { re: /\bimplications?\b/i, weight: 3 },
  { re: /\bripple\s+effects?\b/i, weight: 3 },
  // Session 14: "knock-on effect(s)" and "second-order effect(s)" join the
  // consequence family — the same blast-radius ask in cascade vocabulary. The
  // multiword forms are lexicon-taught (nlp.ts) so the hyphenated compounds
  // stay whole; the singular/plural alternation covers both shapes.
  { re: /\bknock[-\s]?on\s+effects?\b/i, weight: 3 },
  { re: /\bsecond[-\s]order\s+effects?\b/i, weight: 3 },
  // Session 15: "domino effect(s)" completes the cascade family — "what is
  // the domino effect of the queue decision?" is the decision's blast
  // radius in cascade vocabulary, exactly like ripple/knock-on/second-order.
  { re: /\bdomino\s+effects?\b/i, weight: 3 },
  // Who-needs-to-know wording: "who needs to be in the loop on the payments
  // work?" asks for the blast radius report's who-needs-to-know section —
  // epic, decision or person. Needs/must/should + be keeps it a question
  // about stakeholders; the request form ("keep alex in the loop") is a
  // command and is refused by the command guard before matching. The keep
  // QUESTION ("who should we keep in the loop?") is the same ask with a
  // different verb, so it anchors on "who" — the imperative can never fire
  // this signal, with or without the guard.
  { re: /\b(?:needs?|must|should)\s+(?:to\s+)?be\s+in\s+the\s+loop\b/i, weight: 3 },
  { re: /\bwho\s+(?:else\s+)?(?:should|must|do|does|can|would)\s+(?:we|you|i)\s+keep\s+[^.?!]{0,40}?\bin\s+the\s+loop\b/i, weight: 3 },
  // A bottleneck question is a blast-radius question in disguise: "who is
  // the bottleneck on the auth epic?" wants the epic's impact report.
  { re: /\bbottleneck\b/i, weight: 3 },
  { re: /\bdamage\b/i, weight: 2 },
  { re: /\bimpact\b/i, weight: 2 },
  { re: /\b(?:without|unavailable|loses?|losing|lost)\b/i, weight: 2 },
  { re: /\b(?:breaks?|stalls?|blocked|orphaned?)\b/i, weight: 2 },
  // Change-verbs as actions ("we cancel", "superseding", "plan to reverse",
  // "we deprioritize", "we drop") — but NOT past participles used as state
  // ("the decision is superseded", "the epic was deprioritized", "the
  // revamp was dropped"), which describe how things are, not a hypothetical
  // change. The 'ed' forms live only inside the if-lane above, where a
  // hypothetical is explicit. "dropping" needs its own alternation (drop +
  // "ping" is "droping", a misspelling).
  // Session 14: "shelve" and "pause" join the change-verb family — "what if
  // the payments epic gets shelved?" and "what if we pause the auth epic?"
  // are the epic blast radius in workstream vocabulary. "shelved" is
  // POS-gated as a verb (nlp.ts) so the shelf-noun sense cannot fire;
  // "paused" joins the state-verb list inside the if-lane, and the
  // participle-as-state rule keeps "the epic was shelved" a description.
  { re: /\b(?:cancel|supersede|reverse|descope|drop|shelve|shelving)(?:s|ing)?\b|\b(?:cancelling|canceling|superseding|reversing|descoping|dropping|shelving)\b|\bdeprioriti[sz](?:e|es|ing)\b|\bpause(?:s|d)?\b/i, weight: 2 },
  { re: /\bchang(?:e|es|ed|ing)\b/i, weight: 2 },
  // Dependence wording, verb and noun forms alike. "rel(y|ies|ied) on/upon"
  // (session 13) is the same dependence as "depend(s)": "who relies on
  // priya?" asks for Priya's blast radius exactly like "who depends on
  // priya?". The ranking shapes of the rely family ("who do we rely on the
  // most?") live in TOP_RISKS below, where the who-anchor keeps them a
  // ranking rather than one person's blast radius.
  { re: /\bdepend(?:s|ent|ents|ency|encies)?\b|\brel(?:y|ies|ied)\s+(?:on|upon)\b/i, weight: 2 },
  { re: /\bwhat if\b/i, weight: 1 },
  { re: /\baffected\b/i, weight: 1 }
];
var TOP_RISKS = [
  { re: /\b(?:biggest|largest|top|highest|riskiest|worst|main)\s+(?:knowledge(?:-|\s)continuity\s+)?risks?\b/i, weight: 3 },
  { re: /\b(?:most|more)\s+at\s+risk\b/i, weight: 3 },
  { re: /\briskiest\b/i, weight: 3 },
  { re: /\bbus factor\b/i, weight: 3 },
  // Risk synonyms from the corpus frontier (session 8 documented, session 9
  // closed): each of these asks for the risk ranking in different words.
  { re: /\bsingle points? of failure\b/i, weight: 3 },
  { re: /\birreplaceable\b/i, weight: 3 },
  { re: /\binstitutional\s+knowledge\b/i, weight: 3 },
  { re: /\b(?:most\s+)?critical\s+(?:person|people|member|teammate|employee|engineer)s?\b|\b(?:most\s+)?(?:important|essential|vital|crucial|valuable)\s+(?:person|people|member|teammate|employee|engineer|player)s?\b/i, weight: 3 },
  { re: /\bsuccession\s+plan/i, weight: 3 },
  // "what is the highest-impact thing we could lose?" — the superlative of
  // impact over the whole org is the ranking question, not one blast radius.
  // The hyphen form ("highest-impact") must fire too, so the separator class
  // is [-\s]+, not \s+.
  { re: /\b(?:most|highest|biggest|largest)[-\s]+impact\b/i, weight: 3 },
  // Session 10 frontier closures: three more ways chat asks for the risk
  // ranking. "weakest link" and "liability" are risk nouns; "carrying the
  // most context" is the load phrasing. The load phrase must stay phrase-
  // tight: "who has the most context on the payments system?" names a topic
  // the records cannot rank, and it must keep refusing (corpus honest-miss).
  { re: /\bweakest links?\b/i, weight: 3 },
  { re: /\bliabilit(?:y|ies)\b/i, weight: 3 },
  { re: /\bcarrying\s+the\s+most\s+context\b/i, weight: 3 },
  // Session 11 frontier closures: six more ways chat asks for the risk
  // ranking. "linchpin", "key persons/people", "indispensable" and "tribal
  // knowledge" are risk-noun families (mirroring "irreplaceable" and
  // "institutional knowledge"); "spread thin" is the load phrasing, with
  // the/too variants ("spread too thin", "spread the thinnest"); and "never
  // want to lose" is phrase-tight — the idiom carries the "never", so "who
  // do we want to lose?" keeps refusing (corpus boundary case). Session 13:
  // "lynchpin" joins — the common spelling variant of "linchpin" was a
  // genuine miss ("who is our lynchpin?" refused).
  { re: /\blinchpins?\b|\blynchpins?\b/i, weight: 3 },
  { re: /\bkey\s+(?:persons?|people)\b/i, weight: 3 },
  { re: /\bindispensable\b/i, weight: 3 },
  { re: /\btribal\s+knowledge\b/i, weight: 3 },
  { re: /\bspread\s+(?:(?:the|too)\s+)?thin(?:nest|ner)?\b/i, weight: 3 },
  { re: /\bnever\s+want\s+to\s+lose\b/i, weight: 3 },
  // Session 12 frontier closures: nine more ways chat asks for the risk
  // ranking, each phrase-tight so near-miss wordings keep refusing. "most
  // important/valuable ... person/player" extends the critical-person
  // family; "afford to lose" covers the cannot/can't/least/not variants;
  // "glue that holds" (with of/on/in forms) and "backbone" are the
  // load-bearing idioms; "miss the most" is the loss phrasing ("misses the
  // most standups" must not fire, so the verb stays singular "miss");
  // "takes the most with them" (one optional middle word: "the most
  // knowledge with them") is what walks out the door; "never lose" carries
  // its own idiom so "who do we want to lose?" keeps refusing; and the
  // go-to person family is "go-to person" plus "everyone goes to" (the
  // person-everyone-goes-to shape).
  { re: /\bafford\s+to\s+lose\b/i, weight: 3 },
  { re: /\bglue\s+(?:that\s+)?(?:holds|of|on|in)\b/i, weight: 3 },
  { re: /\bmiss\s+the\s+most\b/i, weight: 3 },
  { re: /\btakes?\s+the\s+most\s+(?:[a-z]+\s+)?with\s+(?:them|him|her)\b/i, weight: 3 },
  { re: /\bnever\s+lose\b/i, weight: 3 },
  { re: /\bbackbone\b/i, weight: 3 },
  { re: /\bgo[-\s]to\s+(?:person|people)\b/i, weight: 3 },
  { re: /\beveryone\s+go(?:es)?\s+to\b/i, weight: 3 },
  // Session 13 frontier closures: thirteen more ways chat asks for the risk
  // ranking, each phrase-tight so near-miss wordings keep refusing. The
  // replace family is "impossible/hardest/toughest to replace" plus "least
  // replaceable" — NOT bare "replaceable", because "who is the most
  // replaceable person?" asks for the OPPOSITE ranking and the answer
  // renders highest-risk first; that question keeps refusing. "keys to the
  // kingdom", "secret weapon", "shoes to fill" and "weak spot" are the
  // risk-noun idioms; "knowledge hoarders" covers noun, verb and gerund
  // ("who hoards knowledge?", "is there knowledge hoarding?"); "most
  // central", "institutional memory", "load-bearing" and "unreasonable
  // load" are the criticality phrasings; the relied-upon family covers
  // "most relied-upon/-on", "relied upon/on the most" and the who-anchored
  // "who do we rely on?"; "cannot lose" completes the lose idiom beside
  // "never lose"; the vulnerability family is superlative-tight
  // (biggest/largest/greatest/main/major), and "struggle without" needs the
  // without ("who struggles the most?" is an attendance/effort question and
  // keeps refusing).
  { re: /\b(?:impossible|hardest|toughest)\s+to\s+replace\b|\bleast\s+replaceable\b/i, weight: 3 },
  { re: /\bkeys?\s+to\s+the\s+kingdom\b/i, weight: 3 },
  { re: /\bknowledge\s+hoard(?:ers?|ing)\b|\bhoard(?:s|ing)?\s+knowledge\b/i, weight: 3 },
  { re: /\bsecret\s+weapons?\b/i, weight: 3 },
  { re: /\bmost\s+central\b/i, weight: 3 },
  { re: /\binstitutional\s+memory\b/i, weight: 3 },
  { re: /\bmost\s+relied[-\s]?(?:upon|on)\b|\brelied[-\s]?(?:upon|on)\s+the\s+most\b|\bwho\s+do(?:es)?\s+(?:we|you|they|everyone|the\s+team)\s+rely\s+on\b/i, weight: 3 },
  { re: /\b(?:biggest|largest|greatest|main|major)\s+vulnerabilit(?:y|ies)\b/i, weight: 3 },
  { re: /\bmost\s+vulnerable\s+(?:person|people|member|teammate|employee|engineer|player)s?\b/i, weight: 3 },
  { re: /\bshoes\s+to\s+fill\b/i, weight: 3 },
  { re: /\bstruggl(?:e|es|ed|ing)\s+without\b/i, weight: 3 },
  { re: /\bweak\s+spots?\b/i, weight: 3 },
  { re: /\bload[-\s]bearing\b/i, weight: 3 },
  { re: /\bunreasonable\s+loads?\b/i, weight: 3 },
  { re: /\b(?:cannot|can't|can\s+not)\s+lose\b/i, weight: 3 },
  // Session 14 frontier closures: the eighteen leftover ranking synonyms,
  // each phrase-tight so near-miss wordings keep refusing. The idioms:
  // "take for granted" (needs the granted — "who takes the most?" is a
  // different ask), "engine of the team" (the-of forms), "dangerous
  // dependency" (with most/our possessive shapes), "loss to absorb" /
  // "biggest loss" / "regret losing" (the loss family), "quietly holds
  // everything together" / "holding the team together" (the cohesion
  // family), "heart of the team" (of-anchored), "most pivotal" (the
  // pivotal superlative), "foundation" and "anchor" (the possessive "the
  // team's ..." shapes only — bare "foundation" is a building question),
  // "underestimate" (the who-do-we shape), "critical asset" (most/our
  // possessive), "most entrenched", "bus number" (the idiom, also
  // lexicon-taught), and "collapse without" (needs the without). Each
  // carries its own near-miss boundary in the corpus (see eval.ts).
  // "take for granted" (the who-do-we shape only — "who takes the most for
  // granted?" and "who do we take for granted on payments?" are effort and
  // scoped questions, not this ranking; both stay refusing),
  { re: /\bwho\s+(?:do|does)\s+(?:we|you|they)\s+take\s+for\s+granted\b|\bwho\s+do\s+we\s+take\s+for\s+granted\b/i, weight: 3 },
  { re: /\bengine\s+of\s+(?:the|this|our|my)\s+team\b/i, weight: 3 },
  { re: /\b(?:most|our|my)\s+dangerous\s+dependenc(?:y|ies)\b|\bdangerous\s+dependenc(?:y|ies)\b/i, weight: 3 },
  { re: /\b(?:hardest|biggest|worst|toughest|major)\s+loss(?:\s+to\s+absorb)?\b|\bloss\s+to\s+absorb\b/i, weight: 3 },
  { re: /\bregret\s+losing\b|\bwould\s+regret\s+losing\b|\bregret\s+(?:the\s+most|losing)\b/i, weight: 3 },
  { re: /\b(?:quietly\s+)?(?:holds?|holding|held)\s+(?:everything|it|the\s+(?:team|payments|auth|org)|.*?together)\s+together\b|\bholding\s+(?:the|this|our)\s+(?:team|payments|auth)\s+team\s+together\b|\bheld\s+together\b/i, weight: 3 },
  { re: /\bheart\s+of\s+(?:the|this|our|my)\s+team\b/i, weight: 3 },
  { re: /\bmost\s+pivotal\b/i, weight: 3 },
  { re: /\b(?:team|org|company|department)'?s?\s+(?:foundation|anchor)\b|\bthe\s+team'?s\s+(?:foundation|anchor)\b/i, weight: 3 },
  { re: /\bwho\s+(?:do|does)\s+(?:we|you|they)\s+underestimate\b|\bwho\s+do\s+we\s+underestimate\b/i, weight: 3 },
  { re: /\b(?:most|our|my|the)\s+critical\s+assets?\b|\bmost\s+critical\s+asset\b/i, weight: 3 },
  { re: /\bmost\s+entrenched\b/i, weight: 3 },
  // "bus number" needs the possessive/our shape ("what is our bus
  // number?") — a bare "when is the bus number?" is a scheduling oddity and
  // keeps refusing.
  { re: /\b(?:our|the\s+team'?s?|my)\s+bus\s+number\b/i, weight: 3 },
  // Session 15 frontier closures: the twelve leftover ranking synonyms,
  // each phrase-tight so near-miss wordings keep refusing. "unsung hero"
  // (of/possessive-anchored — "who sang the unsung hero?" keeps refusing);
  // "not appreciate enough" (the who-do-we shape); "thankless job"; the
  // overworked superlative with its person/engineer/here anchors (the bare
  // "who is the most overworked?" stays out — effort without a role noun);
  // "carries the weight of" (of-anchored); "bedrock" (possessive
  // team's/org's/company's, like foundation/anchor — bare stays out);
  // "biggest gap" with its leave-beind verb shape; "nobody else replaces"
  // (the third-person coverage question); "quiet guardian"; "deepest
  // knowledge"; "most difficult to substitute"; "most unique knowledge".
  { re: /\bunsung\s+hero(?:es)?\s+of\s+(?:the|this|our|my|payments|auth|the\s+payments|the\s+auth)\b|\b(?:our|the\s+team'?s?)\s+unsung\s+hero(?:es)?\b/i, weight: 3 },
  { re: /\bwho\s+(?:do|does)\s+(?:we|you|they)\s+not\s+appreciate\b/i, weight: 3 },
  { re: /\bthankless\s+jobs?\b/i, weight: 3 },
  { re: /\bmost\s+overworked\s+(?:person|people|engineer|member|teammate|employee|player)s?\b|\bmost\s+overworked\s+here\b/i, weight: 3 },
  { re: /\bcarri?e?s?\s+the\s+weight\s+of\b|\bcarrying\s+the\s+weight\s+of\b/i, weight: 3 },
  { re: /\b(?:team|org|company|department)'s?\s+bedrocks?\b/i, weight: 3 },
  { re: /\b(?:biggest|largest|widest)\s+gaps?\s+(?:behind|left\s+behind|they'?d\s+leave)?\b|\bleave\s+the\s+biggest\s+gaps?\b|\bwould\s+leave\s+the\s+biggest\s+gaps?\b/i, weight: 3 },
  { re: /\bwho\s+(?:does\s+)?nobody\s+else\s+(?:replaces?|covers?)\b/i, weight: 3 },
  { re: /\bquiet\s+guardians?\b/i, weight: 3 },
  { re: /\bdeepest\s+knowledge\b|\bdeep\s+knowledge\b/i, weight: 3 },
  { re: /\bmost\s+difficult\s+(?:(?:person|people|engineer|member|teammate|employee|player)s?\s+)?to\s+substitut(?:e|ion)\b|\bhardest\s+(?:(?:person|people|engineer|member|teammate|employee|player)s?\s+)?to\s+substitut(?:e|ion)\b|\bdifficult\s+to\s+replace\b/i, weight: 3 },
  { re: /\bmost\s+unique\s+knowledge\b|\bmost\s+speciali[sz]ed\s+knowledge\b/i, weight: 3 },
  // The fear/coverage family (session 15 round 3): "most scared/afraid to
  // lose" (the who-anchored fear idiom), "impossible/hardest to cover for"
  // (the coverage superlative), "no backup on this team" (the possessive
  // team shape — the epic-scoped "no backup on the auth epic?" anchors the
  // epic instead, matcher phrase below), and the understudy idiom
  // ("understudy for nobody" — the person nobody can stand in for).
  { re: /\b(?:most\s+)?(?:scared|afraid|terrified)\s+to\s+lose\b/i, weight: 3 },
  { re: /\b(?:impossible|hardest|toughest|most\s+difficult)\s+to\s+cover\s+for\b/i, weight: 3 },
  { re: /\bhas\s+no\s+backup\s+on\s+(?:this|the)\s+team\b|\bhas\s+no\s+backup\b/i, weight: 3 },
  { re: /\bunderstud(?:y|ies)\s+for\s+nobody\b/i, weight: 3 },
  { re: /\bcollapse(?:s|d)?\s+without\b/i, weight: 3 },
  { re: /\bat\s+risk\b/i, weight: 2 },
  { re: /\brisks?\b|\bexposure\b|\bexposed\b/i, weight: 2 },
  { re: /\brank(?:ed|ing|s)?\b/i, weight: 1 },
  { re: /\bwho (?:is|are|should|was|do)\b/i, weight: 1 },
  { re: /\b(?:worry|worried|concern(?:ed|s)?)\b/i, weight: 1 }
];
var OVERVIEW = [
  { re: /\boverview\b/i, weight: 3 },
  // Weight 2, not 3: "summary of the risks" must lose the tie to the ranking,
  // because risk is the subject of the question, not the org overview.
  { re: /\bsummar(?:y|ize|ise|ise it)\b/i, weight: 2 },
  { re: /\bsnapshot\b/i, weight: 2 },
  { re: /\bbig picture\b/i, weight: 2 },
  { re: /\bstate of\b/i, weight: 2 },
  { re: /\bhealth(?:y)?\b/i, weight: 2 },
  { re: /\bhow are (?:we|things|you|they|people|everyone)\b/i, weight: 2 },
  { re: /\bhow is (?:the|our|it|this|everything|everyone)\b/i, weight: 2 },
  // "What is our knowledge coverage?" — coverage questions are org-level
  // questions; the overview is the report that counts coverage-shaped facts
  // (sole-contributor pages, pending decisions, epic gaps).
  { re: /\bcoverage\b/i, weight: 2 },
  { re: /\b(?:overall|organization|organisation|org|landscape|dashboard)\b/i, weight: 1 },
  { re: /\btell me about the (?:team|org|organization|organisation)\b/i, weight: 2 }
];
var EPIC = [
  { re: /\bepics?\b/i, weight: 2 },
  { re: /\blineage\b/i, weight: 2 },
  { re: /\b(?:trace|behind)\b/i, weight: 1 }
];
var WHO = [
  // People-subject wording: "who is ...", "who do we ...". Weight 1 — it never
  // decides anything on its own; the no-entity arbitration reads it to tell a
  // people ranking that merely mentions epics ("who is spread the thinnest
  // across epics?") apart from an epic-subject question ("which epics are most
  // at risk right now?"), where answering with the people ranking would be
  // confidently wrong.
  { re: /\bwho\b/i, weight: 1 }
];
var DECISION = [
  { re: /\bdecisions?\b/i, weight: 2 },
  { re: /\badrs?\b/i, weight: 2 },
  { re: /\bstatus\b/i, weight: 1 },
  // Decide-verb phrasings carry the decision domain without the noun
  // "decision": "what did we decide on retries?", "who made the call on the
  // token format?", "why did we move away from the queue approach?".
  { re: /\bdecid(?:e|es|ed|ing)\b/i, weight: 2 },
  { re: /\bmade\s+the\s+call\b/i, weight: 2 },
  { re: /\bmov(?:e|es|ed|ing)\s+away\s+from\b/i, weight: 2 }
];
function sum(signals, question2) {
  let score = 0;
  for (const { re, weight } of signals) {
    if (re.test(question2)) score += weight;
  }
  return score;
}
var DEPARTURE_VERB_WORDS = ["leaves", "leaving", "left", "quit", "quits", "resigns", "resigned", "retires", "retired"];
function gatedImpactScore(question2, rawImpact) {
  if (!/\b(?:if|before|when|while)\b/i.test(question2)) return rawImpact;
  if (!/\b(?:leaves|leaving|left|departs?|quit|quits|resigns?|resigned|retires?|retired)\b/i.test(question2)) return rawImpact;
  const analysis = analyzeQuestion(question2);
  const hasSingularLeave = /\bleave\b/i.test(question2);
  const hasVerbForm = DEPARTURE_VERB_WORDS.some((w) => analysis.isVerbWord(w));
  if (hasSingularLeave && !hasVerbForm && analysis.isNounWord("leave")) {
    return rawImpact - 3 >= 0 ? rawImpact - 3 : 0;
  }
  return rawImpact;
}
function scoreIntents(question2) {
  return {
    impact: gatedImpactScore(question2, sum(IMPACT, question2)),
    topRisks: sum(TOP_RISKS, question2),
    overview: sum(OVERVIEW, question2),
    epic: sum(EPIC, question2),
    decision: sum(DECISION, question2),
    who: sum(WHO, question2)
  };
}
var impactSignal = (s) => s.impact >= 2;
var rankingSignal = (s) => s.topRisks >= 2;
var rankingStrong = (s) => s.topRisks >= 3;
function arbitrateFreeQuestion(s) {
  if (s.epic >= 2) {
    if (s.who >= 1 && s.topRisks >= 3) return "top-risks";
    return s.overview >= 2 ? "overview" : void 0;
  }
  if (rankingSignal(s) && s.topRisks >= s.overview) return "top-risks";
  if (s.overview >= 2) return "overview";
  return void 0;
}

// ../core/src/query.ts
var ANSWERABLE_QUESTIONS = [
  { intent: "overview", example: "Give me an overview of the organization", description: "Record counts, top risks, epics by gaps, coverage caveats" },
  { intent: "top-risks", example: "What are the biggest knowledge risks right now?", description: "Everyone ranked by knowledge-risk score" },
  { intent: "person-risk", example: "What is the risk around Alex Rivera?", description: "One person: findings, points, suggested actions, caveats" },
  { intent: "person-impact", example: "What breaks if Alex leaves?", description: "The blast radius of one person: epics, work, pages, decisions, changes" },
  { intent: "epic-lineage", example: "Trace the epic PAY-1", description: "Intent, plan, work and code records behind an epic, plus gaps" },
  { intent: "epic-impact", example: "What breaks if the Payments reliability epic changes?", description: "The blast radius of a changed epic: open work, stale specs, unreviewed changes, who needs to know" },
  { intent: "decision-trace", example: "What is the status of the idempotency decision?", description: "One decision: linked work, people and roles, findings" },
  { intent: "decision-impact", example: "What happens if the idempotency key scope decision changes?", description: "The blast radius of a changed decision: outdated work, outdated changes, who needs to know" }
];
var COMMAND_PATTERNS = [
  /\b(?:book|schedule|reschedule)\s+(?:an?\s+|the\s+|my\s+|our\s+)?(?:meeting|meetings|1:1|one-on-one|1-1|sync|standup|stand-up|retro|retrospective|calendar|invite|invites|interview)\b/i,
  /\b(?:send|write|draft|forward)\s+(?:an?\s+|the\s+|my\s+|our\s+)?(?:message|messages|email|e-mail|dm|reminder|memo|slack)\b/i,
  /\b(?:can|could)\s+(?:you|we|i)\s+(?:ping|message|email|call|text|invite|remind|book|schedule)\b/i,
  /\bplease\s+(?:ping|message|email|call|text|invite|remind|book|schedule)\b/i,
  // "keep alex in the loop on the payments work" is a notification request,
  // not a who-needs-to-know question: without this gate the engine answers
  // Alex's risk profile (session 12 probe caught exactly that). The
  // imperative "keep" opens the sentence — optionally after "please" or
  // "can/could you" — so anchoring on the start refuses the request while
  // the question forms keep their route: "who needs to be in the loop on
  // the payments work?" and "who should we keep in the loop?" both lead
  // with a wh-word, not the imperative.
  /^(?:please\s+)?keep\s+[^.?!]{0,40}?\bin\s+the\s+loop\b/i,
  /^(?:can|could)\s+you\s+keep\s+[^.?!]{0,40}?\bin\s+the\s+loop\b/i
];
function isCommandRequest(question2) {
  return COMMAND_PATTERNS.some((re) => re.test(question2));
}
function rankSuggestions(question2, matched = {}) {
  const scores = scoreIntents(question2);
  const wantsImpact = impactSignal(scores);
  const wantsRanking = rankingSignal(scores);
  return ANSWERABLE_QUESTIONS.map((candidate, i3) => {
    let score = tokenSimilarity(question2, candidate.example);
    if (wantsImpact && candidate.intent.endsWith("-impact")) score += 1;
    if (wantsRanking && candidate.intent === "top-risks") score += 1;
    if (scores.overview >= 2 && candidate.intent === "overview") score += 1;
    if (matched.person && candidate.intent.startsWith("person-")) score += 1.5;
    if (matched.epic && candidate.intent.startsWith("epic-")) score += 1.5;
    if (matched.decision && candidate.intent.startsWith("decision-")) score += 1.5;
    return { example: candidate.example, i: i3, score };
  }).sort((a, b2) => b2.score - a.score || a.i - b2.i).map((s) => s.example);
}
var list4 = (items) => items.length === 0 ? "none" : items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
function decisionsBlockingEpicWork(graph2, epicId) {
  const index3 = getIndex(graph2);
  const candidates = [];
  for (const decision of graph2.decisions) {
    if (decision.status !== "proposed" && decision.status !== "superseded") continue;
    const blocks = (index3.workByDecisionId.get(decision.ref.id) ?? []).some(
      (w) => w.epicId === epicId && w.status === "open"
    );
    if (blocks) candidates.push(decision);
  }
  return candidates.sort((a, b2) => a.ref.id.localeCompare(b2.ref.id));
}
function describeJoinedDecision(graph2, decision) {
  const index3 = getIndex(graph2);
  const title = decision.ref.title.replace(/^decision:\s*/i, "");
  if (decision.status === "superseded") return `${decision.ref.id} '${title}' (superseded)`;
  const approvers = decision.pendingApproverIds.map((id) => index3.peopleById.get(id)?.name ?? id).join(", ");
  const waiting = approvers.length > 0 ? `, waiting on ${approvers}` : "";
  return `${decision.ref.id} '${title}' (proposed${waiting})`;
}
var cap = (refs, max3 = 20) => {
  const seen = /* @__PURE__ */ new Set();
  const unique2 = [];
  for (const ref of refs) {
    const key = `${ref.source}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique2.push(ref);
  }
  return unique2.slice(0, max3);
};
function renderTopRisks(ranked) {
  const top = ranked.slice(0, 3);
  const intro = ranked.length === 0 ? "There are no people in the connected records, so no knowledge risk can be assessed." : `${ranked.length} people were assessed. Highest knowledge-continuity risk first:`;
  const lines = top.map(
    (r) => `${r.personName} (score ${r.score}, ${r.level}: ${r.findings.map((f2) => f2.title.toLowerCase()).join("; ") || "no findings"})`
  );
  const rest = ranked.length > 3 ? ` ${ranked.length - 3} more people follow.` : "";
  return `${intro} ${lines.join(". ")}.${rest} Scores come from recorded activity only; they cannot prove who understands what.`;
}
function renderPersonRisk(report) {
  const findingText = report.findings.length === 0 ? "no findings from the connected records." : `${report.findings.length} finding(s): ${report.findings.map((f2) => f2.title).join("; ")}.`;
  return `${report.personName} has a knowledge-risk score of ${report.score} (${report.level}). ${findingText} Suggested actions: ${list4(report.findings.flatMap((f2) => f2.suggestedActions).slice(0, 3))}. Every finding lists its evidence records.`;
}
function renderImpact(report) {
  const c = report.counts;
  const parts3 = [
    c.stalledEpics > 0 ? `${c.stalledEpics} stalled epic(s)` : null,
    c.stalledWork > 0 ? `${c.stalledWork} un-epicked open issue(s) with no other recorded owner` : null,
    c.orphanedPages > 0 ? `${c.orphanedPages} page(s) where they are the only recorded contributor` : null,
    c.blockedDecisions > 0 ? `${c.blockedDecisions} decision(s) that lose their driver or approver` : null,
    c.unmergedChanges > 0 ? `${c.unmergedChanges} open pull request(s) that lose their author` : null
  ].filter((p4) => p4 !== null);
  const body = parts3.length === 0 ? "the connected records tie nothing to them alone: no stalled epics, no sole-contributor pages, no blocked decisions and no open pull requests." : `${parts3.join(", ")}.`;
  return `If ${report.personName} becomes unavailable, ${body} This lists what the connected records show would lose an owner; knowledge shared outside Jira, Confluence and Bitbucket is not visible here.`;
}
function renderEpicImpact(report) {
  const c = report.counts;
  const parts3 = [
    c.orphanedWork > 0 ? `${c.orphanedWork} open issue(s) that lose their recorded plan` : null,
    c.staleSpecs > 0 ? `${c.staleSpecs} linked page(s) or decision(s) worth re-checking` : null,
    c.unreviewedChanges > 0 ? `${c.unreviewedChanges} open pull request(s) that may implement outdated intent` : null
  ].filter((p4) => p4 !== null);
  const body = parts3.length === 0 ? "the connected records tie no open work, linked specifications or open changes to it." : `${parts3.join(", ")}.`;
  const gapText = report.gaps.length === 0 ? " No gaps were found in its recorded links." : ` It already has ${report.gaps.length} recorded gap(s): ${report.gaps.map((g3) => g3.title.toLowerCase()).join("; ")}.`;
  const who = report.people.length === 0 ? " No person is tied to it through the connected records." : ` ${report.people.length} person(s) are tied to it through records: ${list4(report.people.map((p4) => `${p4.person.name} (${p4.roles.join(", ")})`))}.`;
  return `If ${report.epic.title} (${report.epic.id}) changes, ${body}${gapText}${who} Impact assumes a change of scope or cancellation; the records cannot show which parts would actually change.`;
}
function renderDecisionImpact(report) {
  const c = report.counts;
  const parts3 = [
    c.outdatedWork > 0 ? `${c.outdatedWork} open issue(s) that must be reviewed against the new decision` : null,
    c.outdatedChanges > 0 ? `${c.outdatedChanges} open pull request(s) that may implement the wrong intent` : null
  ].filter((p4) => p4 !== null);
  const body = parts3.length === 0 ? "the connected records tie no open work or open changes to it." : `${parts3.join(", ")}.`;
  const who = report.people.length === 0 ? " No person is tied to it through the connected records." : ` ${report.people.length} person(s) are tied to it through records: ${list4(report.people.map((p4) => `${p4.person.name} (${p4.roles.join(", ")})`))}.`;
  return `"${report.decision.title}" is currently ${report.status}. If it is superseded or reversed, ${body}${who} Impact assumes a change to the decision; the records cannot show which conclusions would actually change.`;
}
function renderLineage(report) {
  const lanes = /* @__PURE__ */ new Map();
  for (const node of report.nodes) lanes.set(node.lane, (lanes.get(node.lane) ?? 0) + 1);
  const gapText = report.gaps.length === 0 ? "no gaps were found in the recorded links." : `${report.gaps.length} gap(s): ${report.gaps.map((g3) => g3.title.toLowerCase()).join("; ")}.`;
  return `${report.epic.id} (${report.epic.title}) traces ${lanes.get("intent") ?? 0} intent record(s) through the epic to ${lanes.get("work") ?? 0} work item(s) and ${lanes.get("code") ?? 0} pull request(s). ${gapText} A missing link means not found in the connected data, not that it does not exist.`;
}
function renderDecision(report) {
  const roles = report.people.map((p4) => `${p4.person.name} (${p4.roles.join(", ")})`);
  const findingText = report.findings.length === 0 ? "no findings." : `${report.findings.length} finding(s): ${report.findings.map((f2) => f2.title.toLowerCase()).join("; ")}.`;
  return `"${report.decision.title}" is ${report.status}. It links to ${report.linkedWork.length} work item(s) and involves ${report.people.length} people: ${list4(roles)}. ${findingText}`;
}
function renderOverview(report) {
  const c = report.counts;
  const top = report.topPeople[0];
  const topText = top ? `The highest knowledge risk is ${top.personName} (score ${top.score}, ${top.level}).` : "No people are connected, so no person risk is assessed.";
  const gappiest = report.epics[0];
  const epicText = gappiest && gappiest.gaps > 0 ? ` The epic with the most recorded gaps is ${gappiest.epic.id} (${gappiest.gaps} gap(s), ${gappiest.openWork} open item(s)).` : "";
  return `The connected records hold ${c.people} people, ${c.epics} epics, ${c.openWorkItems} open work items, ${c.soleContributorPages} sole-contributor page(s), ${c.pendingDecisions} decision(s) still waiting on an approver and ${c.openPullRequests} open pull request(s). ${topText}${epicText} Counts describe the connected Jira, Confluence and Bitbucket records only.`;
}
function answerQuery(graph2, question2, weights) {
  const q = question2.trim();
  const base = { question: q };
  const notUnderstood = (answer, suggestions) => ({
    ...base,
    intent: "overview",
    understood: false,
    answer,
    data: null,
    evidence: [],
    caveats: [],
    suggestions
  });
  if (isCommandRequest(q)) {
    return notUnderstood(
      "This looks like a request to schedule or send something, which the engine cannot do. It answers questions about people, risk, impact, epics and decisions from the connected records.",
      rankSuggestions(q)
    );
  }
  const personMatch = matchPerson(graph2, q);
  const epicMatch = matchEpic(graph2, q);
  const decisionMatch = matchDecision(graph2, q);
  const scores = scoreIntents(q);
  const wantsImpact = impactSignal(scores);
  const wantsTop = rankingSignal(scores);
  const named2 = {
    person: personMatch.person !== void 0 || personMatch.ambiguous !== void 0 || personMatch.unmatchedMention !== void 0,
    epic: epicMatch.epicId !== void 0 || epicMatch.ambiguous === true,
    decision: decisionMatch.decisionId !== void 0 || decisionMatch.ambiguous === true
  };
  const rankedSuggestions = rankSuggestions(q, named2);
  if (!personMatch.person && personMatch.ambiguous && !epicMatch.epicId && !decisionMatch.decisionId) {
    return notUnderstood(
      `That could mean ${list4(personMatch.ambiguous.map((p4) => p4.name))}. Please use the full name or the id (${personMatch.ambiguous.map((p4) => p4.id).join(", ")}).`,
      rankedSuggestions
    );
  }
  if (!personMatch.person && !personMatch.ambiguous && personMatch.unmatchedMention && !rankingStrong(scores) && !epicMatch.epicId && !decisionMatch.decisionId) {
    const known = graph2.people.map((p4) => `${p4.name} (${p4.id})`).join(", ") || "none";
    return notUnderstood(
      graph2.people.length === 0 ? "There are no people in the connected records, so no person risk can be assessed." : `No person matching '${personMatch.unmatchedMention}' exists in the connected data. Known people: ${known}.`,
      rankedSuggestions
    );
  }
  if (epicMatch.ambiguous && scores.epic >= 2) {
    return notUnderstood("That matches more than one epic. Please use the epic key, for example PAY-1.", rankedSuggestions);
  }
  if (decisionMatch.ambiguous && scores.decision >= 2) {
    return notUnderstood("That matches more than one decision. Please use the exact title or id.", rankedSuggestions);
  }
  const person = personMatch.person;
  if (person && wantsImpact) {
    const report = personImpact(graph2, person.id);
    return {
      ...base,
      intent: "person-impact",
      understood: true,
      answer: renderImpact(report),
      data: report,
      evidence: cap(report.areas.flatMap((a) => a.evidence)),
      caveats: report.caveats
    };
  }
  if (person) {
    const report = assessPersonRisk(graph2, person.id, weights);
    return {
      ...base,
      intent: "person-risk",
      understood: true,
      answer: renderPersonRisk(report),
      data: report,
      evidence: cap(report.findings.flatMap((f2) => f2.evidence)),
      caveats: report.caveats
    };
  }
  if (!decisionMatch.decisionId && !decisionMatch.ambiguous && epicMatch.epicId && scores.decision >= 2 && !wantsImpact && !wantsTop) {
    const epic = getIndex(graph2).workById.get(epicMatch.epicId);
    const epicName = epic ? `${epic.ref.title} (${epic.ref.id})` : epicMatch.epicId;
    const candidates = decisionsBlockingEpicWork(graph2, epicMatch.epicId);
    if (candidates.length === 1) {
      const report = traceDecision(graph2, candidates[0].ref.id);
      return {
        ...base,
        intent: "decision-trace",
        understood: true,
        answer: renderDecision(report),
        data: report,
        evidence: cap([report.decision, ...report.linkedWork]),
        caveats: report.caveats
      };
    }
    if (candidates.length > 1) {
      return notUnderstood(
        `That names more than one decision. ${candidates.length} decisions are proposed or superseded against work in ${epicName}: ${list4(candidates.map((d) => describeJoinedDecision(graph2, d)))}. Name the decision you mean and the engine will trace it.`,
        rankedSuggestions
      );
    }
    return notUnderstood(
      `No decision is linked to work in ${epicName} in the connected records, so no decision can be blocking it. If a decision exists, it is not linked to that work yet.`,
      rankedSuggestions
    );
  }
  if (epicMatch.epicId && (wantsImpact || wantsTop)) {
    const report = epicImpact(graph2, epicMatch.epicId);
    return {
      ...base,
      intent: "epic-impact",
      understood: true,
      answer: renderEpicImpact(report),
      data: report,
      evidence: cap(report.areas.flatMap((a) => a.evidence)),
      caveats: report.caveats
    };
  }
  if (epicMatch.epicId) {
    const report = traceEpic(graph2, epicMatch.epicId);
    return {
      ...base,
      intent: "epic-lineage",
      understood: true,
      answer: renderLineage(report),
      data: report,
      evidence: cap(report.nodes.map((n2) => n2.ref)),
      caveats: report.caveats
    };
  }
  if (decisionMatch.decisionId && wantsImpact) {
    const report = decisionImpact(graph2, decisionMatch.decisionId);
    return {
      ...base,
      intent: "decision-impact",
      understood: true,
      answer: renderDecisionImpact(report),
      data: report,
      evidence: cap(report.areas.flatMap((a) => a.evidence)),
      caveats: report.caveats
    };
  }
  if (decisionMatch.decisionId) {
    const report = traceDecision(graph2, decisionMatch.decisionId);
    return {
      ...base,
      intent: "decision-trace",
      understood: true,
      answer: renderDecision(report),
      data: report,
      evidence: cap([report.decision, ...report.linkedWork]),
      caveats: report.caveats
    };
  }
  const free = arbitrateFreeQuestion(scores);
  if (free === "top-risks") {
    const ranked = rankPeopleByRisk(graph2, weights);
    return {
      ...base,
      intent: "top-risks",
      understood: true,
      answer: renderTopRisks(ranked),
      data: ranked,
      evidence: cap(ranked.flatMap((r) => r.findings.flatMap((f2) => f2.evidence))),
      caveats: ["Scores come from recorded activity only; they cannot prove who understands what."]
    };
  }
  if (free === "overview") {
    const report = buildOverview(graph2, weights);
    return {
      ...base,
      intent: "overview",
      understood: true,
      answer: renderOverview(report),
      data: report,
      evidence: cap(report.epics.map((e) => e.epic)),
      caveats: report.caveats
    };
  }
  return notUnderstood(
    "The engine could not map that question to the connected records. It answers questions about people, risk, impact, epics and decisions \u2014 and says so when it cannot.",
    // Ranked like the other misses: wording signals (impact, ranking,
    // overview) and any named entities lift the closest examples first, and
    // with no signal at all the stable sort keeps the catalog order.
    rankedSuggestions
  );
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
  // Relabeled in session 13: "lynchpin" joined the scoped-risk-idiom epic
  // domain phrases (bottleneck / SPOF / backbone / weak spot), so the
  // "<idiom> of the payments team" shape anchors the Payments blast radius
  // — the same consistency relabel session 12 made for the backbone.
  { question: "who is the linchpin of the payments team?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
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
  /* ------- session 13: the seventeen session-12 gaps, closed and locked ------- */
  // The lexicon expansion (impossible-to-replace / keys to the kingdom /
  // knowledge hoarders / secret weapon / most central / institutional
  // memory / most relied-upon / biggest vulnerability / shoes to fill /
  // struggle-without / weak spot / load-bearing / unreasonable load as
  // ranking synonyms; ripple effects as consequence wording; the while-lane
  // with a person name; parental leave and poached inside the if-lane) plus
  // the weak-spot and lynchpin epic domain phrases and the rely-on
  // dependence signal. Every closure was verified end to end against the
  // full AnswerResult before the case moved here, and they stay in the
  // corpus so a lexicon regression fails CI.
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
  { question: "who is carrying an unreasonable load?", expect: { understood: true, intent: "top-risks" } },
  /* ------- session 13: regression cases for the closures and new lanes ------- */
  // The new signals work in real sentence shapes, not just the documented
  // phrasings. Every label was probed end to end against the full
  // AnswerResult before it was baked in here.
  // The replace family: hardest/toughest variants and "least replaceable".
  { question: "who is impossible to replace?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would be the hardest to replace?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the least replaceable person here?", expect: { understood: true, intent: "top-risks" } },
  // Knowledge hoarding: verb and gerund forms.
  { question: "who hoards knowledge on this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "is there knowledge hoarding on the team?", expect: { understood: true, intent: "top-risks" } },
  // Secret weapon: possessive and what-forms.
  { question: "who is the team's secret weapon?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is our secret weapon for payments?", expect: { understood: true, intent: "top-risks" } },
  // Institutional memory, like institutional knowledge.
  { question: "who holds the institutional memory?", expect: { understood: true, intent: "top-risks" } },
  // The relied-upon family: hyphen and no-hyphen, the on-variant, the
  // who-anchored rely-on ranking, and the dependence question ("who relies
  // on priya?" is Priya's blast radius exactly like "who depends on her?").
  { question: "who is the most relied-upon engineer on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most relied upon person?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is relied on the most?", expect: { understood: true, intent: "top-risks" } },
  { question: "who do we rely on the most?", expect: { understood: true, intent: "top-risks" } },
  { question: "who relies on priya?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  // Vulnerability: the superlative and the person-noun form.
  { question: "what is our biggest vulnerability?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most vulnerable person on the team?", expect: { understood: true, intent: "top-risks" } },
  // Shoes to fill, struggle-without and cannot-lose in their other shapes.
  { question: "who leaves the biggest shoes to fill?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would we struggle without?", expect: { understood: true, intent: "top-risks" } },
  { question: "the team would struggle without alex", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is the one we cannot lose?", expect: { understood: true, intent: "top-risks" } },
  // Scoped risk idioms anchor the epic like bottleneck/SPOF/backbone; the
  // unscoped forms and the "<epic> team" forms stay the people ranking.
  { question: "who is the weak spot on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the payments weak spot?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is the payments lynchpin?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is our lynchpin?", expect: { understood: true, intent: "top-risks" } },
  { question: "is the auth epic a weak spot?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who is load-bearing on the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who is the most relied-upon person on the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who is the most relied-upon person on the payments team?", expect: { understood: true, intent: "top-risks" } },
  // Parental / maternity / paternity leave and sabbatical in their takes
  // forms; poached with the competitor filler inside the bounded window.
  { question: "what if priya takes maternity leave?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if sam takes paternity leave?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if priya takes a sabbatical?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if alex is poached?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex gets poached by a competitor?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  // The while-lane across its availability list, plus a when-lane parental
  // case and the if-lane goes-on-sabbatical shape.
  { question: "who is exposed while sam is on leave?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who is exposed while priya is out of office?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who is exposed while alex is on sabbatical?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who covers the payments work while alex is on vacation?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is exposed when alex is on parental leave?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is exposed if alex goes on sabbatical?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  // Illness and absence wording in the if-lane.
  { question: "what if alex gets sick?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex falls ill?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex is away next month?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  // Ripple effects across all three subjects: person, decision, epic.
  { question: "what are the ripple effects of losing sam?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what are the ripple effects of the token format decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "what are the ripple effects of the payments epic being cancelled?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  // Exposure and risk idioms that already worked through the person lane,
  // the loss wording and the decision consequence wording, locked here so
  // a regression fails CI.
  { question: "who is the most exposed person on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "is alex a flight risk?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "who would be lost without alex?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if we lose alex to google?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who would feel it most if priya left?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who is the single biggest risk to the payments epic?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "what is the fallout if alex jumps ship?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what breaks if we revisit the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  /* ------- session 13: boundary checks for the new signals ------- */
  // The new phrasings must stay tight: the replace family needs its
  // superlative ("who is the most replaceable person?" asks for the
  // OPPOSITE ranking and refuses), the kingdom needs its keys' destination,
  // struggle-without needs the without, and the scheduling shapes of the
  // availability lanes must not fire impact — "when does priya go on
  // parental leave?", "when is alex on leave?" and "when will sam be back
  // from leave?" all once fired the departure lane through the NOUN
  // "leave" (the session-12 any-subject extension; fixed in session 13),
  // and they now route to the named person's profile like every factual
  // person question.
  { question: "who is impossible?", expect: { understood: false } },
  { question: "who has the keys?", expect: { understood: false } },
  { question: "who struggles the most?", expect: { understood: false } },
  { question: "who is the most replaceable person on the team?", expect: { understood: false } },
  { question: "when does priya go on parental leave?", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  { question: "when will sam be back from leave?", expect: { understood: true, intent: "person-risk", personId: "sam" } },
  { question: "when is alex on leave?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "who poached alex?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "who is the most central person on the payments team?", expect: { understood: true, intent: "top-risks" } },
  /* ------- session 13: more unanswerable-but-plausible, must refuse ------- */
  // Trust, intelligence, tenure, resident expertise, stardom, pay and
  // customer rapport: the records cannot rank any of these, and the
  // ranking lexicon must not stretch to cover them.
  { question: "who is the most trusted person on the team?", expect: { understood: false } },
  { question: "who is the smartest engineer here?", expect: { understood: false } },
  { question: "who has the most tenure on the team?", expect: { understood: false } },
  { question: "who is our resident expert on payments?", expect: { understood: false } },
  { question: "who is the payments rockstar?", expect: { understood: false } },
  { question: "who is the highest paid person on the team?", expect: { understood: false } },
  { question: "who has the best rapport with customers?", expect: { understood: false } },
  /* ------- session 13: the next documented frontier (open gaps) ------- */
  // Moved into the regression tier by session 14 (see below): every phrasing
  // here was probed end to end against the full AnswerResult before the
  // label flipped; the compromise-backed intent layer (nlp.ts) closed the
  // whole frontier in one pass.
  /* ------- session 14: the frontier closed, now regression-locked ------- */
  // The ranking-synonym family: take for granted, engine of the team,
  // dangerous dependency, hardest loss to absorb / biggest loss, quietly
  // holds everything together / holding the team together, regret losing,
  // heart of the team, most pivotal, foundation and anchor (possessive
  // forms), underestimate (the who-do-we shape), critical asset, entrenched,
  // bus number, collapse without. Each phrase-tight: the near-miss shapes
  // ("who takes the most for granted?", "when is the bus number?", bare
  // "foundation"/"anchor" without the possessive, "who underestimates the
  // risk?") stay refusing in the boundary block below.
  { question: "who do we take for granted?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the engine of this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most dangerous dependency?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would be the hardest loss to absorb?", expect: { understood: true, intent: "top-risks" } },
  { question: "who quietly holds everything together?", expect: { understood: true, intent: "top-risks" } },
  { question: "who are the people we would regret losing most?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the heart of the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most pivotal person here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the team's foundation?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the team's anchor?", expect: { understood: true, intent: "top-risks" } },
  { question: "who do we underestimate?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would be the biggest loss?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most critical asset?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most entrenched person on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is holding the payments team together?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is our bus number?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would the team collapse without?", expect: { understood: true, intent: "top-risks" } },
  // The impact wording family: knock-on and second-order effects beside
  // consequences/fallout/implications/ripple effects; walks off the job and
  // ghosts as departure idioms; gets pulled onto another team and gets
  // reassigned as transfer verbs; travelling in the while-lane; shelved and
  // pause as change verbs (POS-gated by nlp.ts so the noun senses stay out).
  { question: "what is the knock-on effect of the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "what are the second-order effects of the onboarding revamp?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "what if alex walks off the job?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex ghosts us?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex gets pulled onto another team?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex gets reassigned?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is exposed while alex is travelling?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if the payments epic gets shelved?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "what if we pause the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  /* ------- session 14: boundary checks for the new signals ------- */
  // The near-miss wordings the closures must not absorb: the effort shapes
  // ("who takes the most for granted?", "who regrets losing the most
  // standups?"), the bare idiom without the possessive ("when is the bus
  // number?", "who is the engine?", "what is our foundation made of?"), the
  // building senses ("what is the engine made of?"), and the generic-risk
  // third-person ("who underestimates the risk?" routes to the ranking
  // because a bare "risk" who-question is the people ranking — see the
  // generic risk word's weight-2 signal, pre-session-14 behavior).
  { question: "who takes the most for granted?", expect: { understood: false } },
  { question: "what is the engine made of?", expect: { understood: false } },
  { question: "who is the engine?", expect: { understood: false } },
  { question: "what is our foundation made of?", expect: { understood: false } },
  { question: "when is the bus number?", expect: { understood: false } },
  { question: "who regrets losing the most standups?", expect: { understood: false } },
  // Scoped shapes: "who anchored the payments epic?" is an epic-anchored
  // question (the anchor noun + a domain word), pre-existing matcher
  // behavior; "who do we take for granted on payments?" rides the who-do-we
  // shape to the ranking.
  { question: "who anchored the payments epic?", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "who do we take for granted on payments?", expect: { understood: true, intent: "top-risks" } },
  { question: "who underestimates the risk?", expect: { understood: true, intent: "top-risks" } },
  /* ------- session 14: variant regressions for the closures ------- */
  // Every closed phrasing re-probed in its other grammatical shapes: the
  // possessive foundation/anchor with org/company, the entrenchment and
  // pivotal superlatives without "person", the loss family's worst/toughest
  // variants, the cohesion family's "held together" past form, ghosting in
  // its third-person verb shape, the transfer verbs' gets/got variants, the
  // knock-on hyphen and spacing variants, shelved/paused with the state-verb
  // forms, and travelling in its US spelling.
  { question: "who is the company's foundation?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the org's anchor?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most pivotal engineer here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most pivotal?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would be the worst loss to absorb?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our most dangerous dependency on payments?", expect: { understood: true, intent: "top-risks" } },
  { question: "who holds the team together?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is quietly holding everything together?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if sam ghosts the team?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if priya got reassigned?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if sam gets pulled onto a different team?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what are the knock-on effects of the token format decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "what is the second-order effect of losing priya?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if the auth epic is shelved?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "what if we shelve the onboarding revamp?", expect: { understood: true, intent: "epic-impact", epicId: "ONB-1" } },
  { question: "what if the payments epic gets paused?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  { question: "who is exposed while priya is traveling?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who does the engine of the payments work rely on?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } },
  // Round-2 probe discoveries that already worked (regression-locked here):
  // glue-that-holds rides the session-12 glue idiom, ghosts-the-team the
  // session-14 ghost verb, knock-on-of-losing the new consequence wording
  // on a person, shelved in its we-shelve action form, burns-out through
  // the when-lane, and the fill-in/steps-in/picks-up-slack coverage shapes.
  { question: "who is the glue that holds the payments team together?", expect: { understood: true, intent: "top-risks" } },
  { question: "what are the knock-on effects of losing alex?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what happens when alex finally burns out?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who fills in when alex is away?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who steps in if priya is unavailable?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who picks up the slack if alex resigns?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what happens if alex wins the lottery and quits?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is the human single point of failure?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the load-bearing wall of the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if the payments epic slips?", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  /* ------- session 14: more unanswerable-but-plausible, must refuse ------- */
  // Humility, mentorship, coding speed/quality, soft skills: the records
  // cannot rank any of these, and the ranking lexicon must not stretch.
  { question: "who is the most humble person here?", expect: { understood: false } },
  { question: "who is the best mentor on the team?", expect: { understood: false } },
  { question: "who is the fastest coder here?", expect: { understood: false } },
  { question: "who writes the cleanest code?", expect: { understood: false } },
  { question: "who has the best soft skills?", expect: { understood: false } },
  // New chat-realistic shapes that must keep refusing (session 14 round 2):
  // culture-fit, availability-preference, seniority, compensation-adjacent,
  // respect, and interest questions — none of these are rankable from the
  // connected records, and the honest answer is the miss.
  { question: "who is the best culture fit here?", expect: { understood: false } },
  { question: "who is most likely to relocate for a new job?", expect: { understood: false } },
  { question: "who is the most senior engineer on the team?", expect: { understood: false } },
  { question: "who deserves the next promotion?", expect: { understood: false } },
  { question: "who is the most respected person on the team?", expect: { understood: false } },
  { question: "who is most invested in the payments work?", expect: { understood: true, intent: "epic-lineage", epicId: "PAY-1" } },
  { question: "who enjoys their work the most?", expect: { understood: false } },
  { question: "who has the best work-life balance?", expect: { understood: false } },
  /* ------- session 15: the session-14 frontier closed, regression-locked ------- */
  // All twenty-seven session-14 gaps moved into the regression tier by
  // session 15 (probed end to end first): the ranking-synonym family (unsung
  // hero with its of/possessive anchors, not-appreciate, thankless job, the
  // overworked superlative with its role-noun anchors, carries-the-weight,
  // the possessive bedrock, biggest-gap-behind, nobody-else-replaces, quiet
  // guardian, deepest knowledge, most-difficult-to-substitute, most-unique-
  // knowledge, scared-to-lose, impossible-to-cover-for, no-backup, the
  // understudy idiom) and the impact/availability family (domino effect
  // completing the cascade family beside ripple/knock-on/second-order;
  // gets sidelined, gets headhunted, moves abroad, relocates, is off sick,
  // is hospitalised/hospitalized, gets decommissioned, goes silent/goes
  // quiet inside the if-lane; the during-possessive lane and whilst/holiday
  // in the availability lanes).
  { question: "who is the unsung hero of this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who do we not appreciate enough?", expect: { understood: true, intent: "top-risks" } },
  { question: "who has the most thankless job here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most overworked person on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who carries the weight of the whole team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the team's bedrock?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would leave the biggest gap behind?", expect: { understood: true, intent: "top-risks" } },
  { question: "who does nobody else replace?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the quiet guardian of our systems?", expect: { understood: true, intent: "top-risks" } },
  { question: "who holds the deepest knowledge here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most difficult to substitute?", expect: { understood: true, intent: "top-risks" } },
  { question: "who has the most unique knowledge?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is the domino effect of the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "what if alex gets sidelined?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex gets headhunted?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is exposed during alex's vacation?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex moves abroad?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if priya relocates?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if alex is off sick for a month?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if priya is hospitalised?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who are we most scared to lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would be impossible to cover for?", expect: { understood: true, intent: "top-risks" } },
  { question: "who has no backup on this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the understudy for nobody?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if alex gets decommissioned?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if priya goes silent?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "who is exposed whilst alex is on holiday?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  /* ------- session 15: variant regressions for the closures ------- */
  // Every closed phrasing re-probed in its other grammatical shapes (the
  // probe's VAR bucket): the unsung hero's our/payments shapes, the
  // overworked engineer shape, the org-bedrock possessive, the bare
  // biggest-gap, the person-noun substitute shape, domino in the plural on
  // another decision, the transfer/illness verbs on other people and
  // spellings (hospitalized US, headhunted-by-google, sabbatical-during),
  // the afraid sibling of scared-to-lose, the hardest sibling of
  // impossible-to-cover-for, goes-quiet, and the whilst-vacation shape.
  { question: "who is our unsung hero?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the unsung hero of the payments team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most overworked engineer here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the org's bedrock?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would leave the biggest gap?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most difficult person to substitute?", expect: { understood: true, intent: "top-risks" } },
  { question: "what are the domino effects of the token format decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "what if sam gets sidelined?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if sam gets headhunted by google?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who is exposed during priya's sabbatical?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if priya moves abroad?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if alex relocates?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex is off sick?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if alex is hospitalized?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who are we most afraid to lose?", expect: { understood: true, intent: "top-risks" } },
  { question: "who would be hardest to cover for?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if alex goes quiet?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who is the quiet guardian of the payments systems?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is exposed whilst sam is on vacation?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  /* ------- session 15: boundary checks for the new signals ------- */
  // The near-miss wordings the closures must not absorb: the bare
  // superlative without a role noun ("who is the most overworked?"), the
  // unsung-hero phrase without the of/possessive anchor ("who sang the
  // unsung hero?"), the domino without the effect, the physical backup
  // ("who replaces the backup generator?"), the understudy without the
  // for-nobody idiom, and the scheduling when-shapes of the new
  // availability words ("when is alex on holiday?", "when does priya
  // relocate?" route to the person profile, like every factual question).
  // "where does alex move?" rides the generic person lane (any named-person
  // question with no other intent routes to the profile) and the
  // epic-scoped "who has no backup on the auth epic?" anchors the epic's
  // blast radius (the scoped-idiom precedent of "who is the payments weak
  // spot?").
  { question: "who is the most overworked?", expect: { understood: false } },
  { question: "who sang the unsung hero?", expect: { understood: false } },
  { question: "what is a domino?", expect: { understood: false } },
  { question: "who replaces the backup generator?", expect: { understood: false } },
  { question: "who understudied nobody?", expect: { understood: false } },
  { question: "when is alex on holiday?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "when does priya relocate?", expect: { understood: true, intent: "person-risk", personId: "priya" } },
  { question: "where does alex move?", expect: { understood: true, intent: "person-risk", personId: "alex" } },
  { question: "who has no backup on the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "who appreciates whom?", expect: { understood: false } },
  { question: "what is a bedrock?", expect: { understood: false } },
  { question: "who carries the weight?", expect: { understood: false } },
  /* ------- session 15: more unanswerable-but-plausible, must refuse ------- */
  // Recognition-adjacent, attitude, energy and meeting-behavior questions:
  // the records cannot rank any of these, and the ranking lexicon must not
  // stretch to cover them.
  { question: "who is the most underappreciated person here?", expect: { understood: false } },
  { question: "who has the best attitude on the team?", expect: { understood: false } },
  { question: "who brings the most energy to standups?", expect: { understood: false } },
  { question: "who talks the most in meetings?", expect: { understood: false } },
  { question: "who is the most organized person here?", expect: { understood: false } },
  { question: "who has the best attention to detail?", expect: { understood: false } },
  { question: "who is the most coachable person on the team?", expect: { understood: false } },
  { question: "who is everyone's favorite teammate?", expect: { understood: false } },
  { question: "who would give the best tech talk?", expect: { understood: false } },
  /* ------- session 15: the next documented frontier (open gaps) ------- */
  // Ideal behavior an ideal engine would have; the current one misses — the
  // honest headroom that keeps the measured number in band. Probed end to
  // end before baking; the phrasings that already worked (the
  // availability-verb when-shapes, the epic-scoped no-backup) became
  // regression cases instead of gaps. Two families again:
  // (a) the ranking-synonym leftovers: the shadow infrastructure of the
  // team (who keeps the lights on, the plumbing behind everything, the
  // invisible work, the cleanup crew), the heroic phrasings (the last line
  // of defense, the firefighter, the person who saves us every sprint), and
  // the remaining superlatives (most dedicated, most committed, most
  // dependable, the person you want in the room when things break);
  // (b) the impact/consequence leftovers: butterfly effect and cascade as
  // consequence wording, gets seconded, goes part-time, reduces their
  // hours, gets pulled into the incident rotation, and the if-lane's
  // "goes dark", plus the coverage-question shapes ("who picks up priya's
  // work?" as a hypothetical without an if/when/while anchor).
  { question: "who keeps the lights on around here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the plumbing behind everything?", expect: { understood: true, intent: "top-risks" } },
  { question: "who does the invisible work on this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the cleanup crew for the payments code?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the last line of defense for the auth systems?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the firefighter on this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who saves us every single sprint?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most dedicated person here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most committed engineer on the team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the most dependable person here?", expect: { understood: true, intent: "top-risks" } },
  { question: "who do you want in the room when things break?", expect: { understood: true, intent: "top-risks" } },
  { question: "what is the butterfly effect of the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "what are the cascading effects of the token format decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d2" } },
  { question: "what if alex gets seconded to the platform team?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if priya goes part-time?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if sam reduces their hours?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if alex gets pulled into the incident rotation?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who picks up priya's work?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  // Round-2 probe discoveries (each probed end to end): the knowledge-holder
  // metaphors (shadow architect, the auth wizard, the payments oracle, the
  // walking wiki, the human database, remembers-why-we-built-it, the
  // team's memory — all ranking family), the removal hypotheticals (frozen
  // out, pushed out, managed out, benched), the coverage questions (picks
  // up sam's slack, absorbs priya's workload), and the consequence wording
  // (chain reaction beside domino/ripple), the blast-area synonym, and the
  // decay hypothetical (rots on the vine).
  { question: "who is the shadow architect of this team?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the wizard of the auth systems?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the oracle for the payments domain?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is our walking wiki?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the human database of our systems?", expect: { understood: true, intent: "top-risks" } },
  { question: "who remembers why we built it this way?", expect: { understood: true, intent: "top-risks" } },
  { question: "who is the team's memory?", expect: { understood: true, intent: "top-risks" } },
  { question: "what if alex gets frozen out?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "what if priya gets pushed out?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what if sam gets managed out?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "what if alex is benched?", expect: { understood: true, intent: "person-impact", personId: "alex" } },
  { question: "who picks up sam's slack?", expect: { understood: true, intent: "person-impact", personId: "sam" } },
  { question: "who absorbs priya's workload?", expect: { understood: true, intent: "person-impact", personId: "priya" } },
  { question: "what is the chain reaction of the queue decision?", expect: { understood: true, intent: "decision-impact", decisionId: "d1" } },
  { question: "what is the blast area of the auth epic?", expect: { understood: true, intent: "epic-impact", epicId: "AUTH-1" } },
  { question: "what if the payments epic rots on the vine?", expect: { understood: true, intent: "epic-impact", epicId: "PAY-1" } }
];
var EVAL_CORPUS_ALL = [...EVAL_CORPUS, ...EVAL_CORPUS_HARD];

// ../core/src/tools.ts
var TOOL_TRUTH_NOTE = "Every finding lists its evidence records. A missing link means not found in the connected data, not that it does not exist.";
var PERSON_INPUT = {
  name: "person",
  title: "Person",
  description: 'Person id, name, name prefix or a close typo (e.g. "Alex Rivera", "alex", "rivera")'
};
var EPIC_INPUT = {
  name: "epic",
  title: "Epic",
  description: 'Epic key or title, any case (e.g. "PAY-1", "pay-1", "Payments reliability")'
};
var DECISION_INPUT = {
  name: "decision",
  title: "Decision",
  description: 'Decision id or title, or a distinctive title word (e.g. "d3", "idempotency key scope", "the idempotency decision")'
};
var TRACEFLOW_TOOLS = [
  {
    name: "traceflow_list_people",
    actionKey: "traceflow-list-people",
    functionKey: "tf-list-people",
    handler: "listPeople",
    title: "List people by knowledge risk",
    summary: "Lists everyone in the connected Jira and Confluence records with their knowledge-risk score, level and finding count, highest risk first. Read-only.",
    description: "List everyone in the connected records with their knowledge-risk score, level and open finding counts, highest risk first. " + TOOL_TRUTH_NOTE,
    run: (graph2) => ({
      people: rankPeopleByRisk(graph2).map((r) => ({
        id: r.personId,
        name: r.personName,
        score: r.score,
        level: r.level,
        findings: r.findings.length
      })),
      caveats: ["Scores come from recorded activity only; they cannot prove who understands what."]
    })
  },
  {
    name: "traceflow_person_risk",
    actionKey: "traceflow-person-risk",
    functionKey: "tf-person-risk",
    handler: "personRisk",
    title: "Investigate a person",
    summary: "Full knowledge-risk report for one person: findings with their evidence records, points, suggested hand-off actions and what the records cannot show. Read-only.",
    description: "Full knowledge-risk report for one person: findings with evidence records, points, suggested actions, and what the data cannot show. " + TOOL_TRUTH_NOTE,
    input: PERSON_INPUT,
    run: (graph2, person) => {
      const target = resolvePerson(graph2, person ?? "");
      const report = rankPeopleByRisk(graph2).find((r) => r.personId === target.id);
      if (!report) throw new Error(`No report could be built for ${target.name}.`);
      return report;
    }
  },
  {
    name: "traceflow_person_impact",
    actionKey: "traceflow-person-impact",
    functionKey: "tf-person-impact",
    handler: "personImpact",
    title: "What breaks without a person",
    summary: "Blast radius if one person becomes unavailable: the epics, open work, pages, decisions and pull requests that lose their recorded owner, with evidence. Read-only.",
    description: "Change-impact blast radius for one person: the epics, open work, pages, decisions and pull requests that lose their recorded owner. " + TOOL_TRUTH_NOTE,
    input: PERSON_INPUT,
    run: (graph2, person) => personImpact(graph2, resolvePerson(graph2, person ?? "").id)
  },
  {
    name: "traceflow_epic_lineage",
    actionKey: "traceflow-epic-lineage",
    functionKey: "tf-epic-lineage",
    handler: "epicLineage",
    title: "Trace an epic",
    summary: "Traces one epic from intent to plan, work and code: the recorded links between them and the gaps, each with its evidence records. Read-only.",
    description: "Lineage for one epic: intent, plan, work and code records, the recorded links between them, and the gaps with evidence. " + TOOL_TRUTH_NOTE,
    input: EPIC_INPUT,
    run: (graph2, epic) => traceEpic(graph2, resolveEpic(graph2, epic ?? "").ref.id)
  },
  {
    name: "traceflow_decision_trace",
    actionKey: "traceflow-decision-trace",
    functionKey: "tf-decision-trace",
    handler: "decisionTrace",
    title: "Trace a decision",
    summary: "Traces one recorded decision: its status, the work linked to it, the people and their roles, and findings such as unapproved or superseded decisions still in use. Read-only.",
    description: "One recorded decision: status, linked work, people and their roles, and findings (unapproved, superseded, stale). " + TOOL_TRUTH_NOTE,
    input: DECISION_INPUT,
    run: (graph2, decision) => traceDecision(graph2, resolveDecisionId(graph2, decision ?? ""))
  },
  {
    name: "traceflow_epic_impact",
    actionKey: "traceflow-epic-impact",
    functionKey: "tf-epic-impact",
    handler: "epicImpact",
    title: "What breaks if an epic changes",
    summary: "Blast radius if one epic changes: open work that loses its plan, pages and decisions to re-check, open pull requests on outdated intent, and who needs to know. Read-only.",
    description: "Change-impact blast radius for one epic: the open work that loses its recorded plan, the linked pages and decisions worth re-checking, the open pull requests that may implement outdated intent, the people who need to know, and the epic\u2019s pre-existing lineage gaps. " + TOOL_TRUTH_NOTE,
    input: EPIC_INPUT,
    run: (graph2, epic) => epicImpact(graph2, resolveEpic(graph2, epic ?? "").ref.id)
  },
  {
    name: "traceflow_decision_impact",
    actionKey: "traceflow-decision-impact",
    functionKey: "tf-decision-impact",
    handler: "decisionImpact",
    title: "What breaks if a decision changes",
    summary: "Blast radius if one decision changes: the open work linked to it that must be reviewed, open pull requests that may implement the wrong intent, and who needs to know. Read-only.",
    description: "Change-impact blast radius for one decision: the open work linked to it that must be reviewed, the open pull requests that may implement the wrong intent, and the people who need to know. " + TOOL_TRUTH_NOTE,
    input: DECISION_INPUT,
    run: (graph2, decision) => decisionImpact(graph2, resolveDecisionId(graph2, decision ?? ""))
  },
  {
    name: "traceflow_overview",
    actionKey: "traceflow-overview",
    functionKey: "tf-overview",
    handler: "overview",
    title: "Organization overview",
    summary: "Organization overview from the connected records: record counts, the top knowledge-risk people, epics ranked by recorded gaps, and coverage caveats. Read-only.",
    description: "Aggregates for the whole connected graph: record counts, top knowledge-risk people, epics ranked by gaps, and coverage caveats. " + TOOL_TRUTH_NOTE,
    run: (graph2) => buildOverview(graph2)
  },
  {
    name: "traceflow_query",
    actionKey: "traceflow-investigate",
    functionKey: "tf-investigate",
    handler: "investigate",
    title: "Ask a question (deterministic, no model)",
    summary: "Answers a question about knowledge-continuity risk, change impact, lineage or decisions from this site's Jira and Confluence records. Read-only. Returns the engine's answer with its evidence and caveats.",
    description: `Ask one natural-language question about people, risk, impact, epics or decisions. The answer is produced by the deterministic engine \u2014 never by a language model \u2014 and carries its evidence records and caveats. Answerable questions include: ${ANSWERABLE_QUESTIONS.map((q) => q.example).join(" ; ")}. When the question cannot be mapped to the connected data, the tool says so and lists what it can answer instead of guessing. ` + TOOL_TRUTH_NOTE,
    input: {
      name: "question",
      title: "Question",
      description: 'The question, e.g. "What are the biggest knowledge risks right now?" or "What breaks if Alex leaves?"'
    },
    run: (graph2, question2) => answerQuery(graph2, question2 ?? "")
  }
];

// src/gate.ts
function checkPullRequest2(graph2, prId) {
  const pr = graph2.pullRequests.find(
    (p4) => p4.ref.id.toLowerCase() === prId.trim().toLowerCase()
  );
  if (!pr) {
    const known = graph2.pullRequests.map((p4) => p4.ref.id).join(", ") || "none";
    throw new Error(
      `No pull request matches '${prId}' in the connected data. Known pull requests: ${known}.`
    );
  }
  const linkedItems = graph2.workItems.filter(
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
      const decisions = graph2.decisions.filter(
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
  for (const reason13 of result.reasons) {
    lines.push(`${reason13.level === "error" ? "ERROR" : "info"}: ${reason13.message}`);
    for (const e of reason13.evidence) {
      lines.push(`  evidence: ${e.source}:${e.id} \u2014 ${e.title}`);
    }
  }
  return lines.join("\n");
}
function main(argv) {
  let graphPath = "";
  let prId = "";
  let json = false;
  for (let i3 = 0; i3 < argv.length; i3++) {
    const arg = argv[i3] ?? "";
    if (arg === "--graph" && argv[i3 + 1]) graphPath = argv[++i3] ?? "";
    else if (arg === "--pr" && argv[i3 + 1]) prId = argv[++i3] ?? "";
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
    const { graph: graph2 } = runPipelineOnJson(graphText, { context: graphPath });
    const result = checkPullRequest2(graph2, prId);
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
/*! Bundled license information:

suffix-thumb/builds/suffix-thumb.mjs:
  (*! spencermountain/suffix-thumb 6.1.0 MIT *)
*/
