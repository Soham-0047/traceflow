import type {
  Decision,
  OrgGraph,
  Page,
  Person,
  PullRequest,
  RecordRef,
  Source,
  WorkItem,
  WorkItemType,
} from './types.js';
import { ValidationError, type ValidationIssueLike } from './errors.js';

/**
 * The trust boundary of the engine. Everything that crosses into TraceFlow —
 * an OrgGraph export from a file or env var, a future connector payload, a
 * graph assembled by the Forge resolver — is validated here before any engine
 * function runs. Three properties, on purpose:
 *
 *  - **Bounded**: hard caps on sizes (records, strings, link lists, JSON bytes)
 *    so a hostile or broken source cannot make the engine allocate or loop
 *    without limit.
 *  - **Precise**: every issue carries a path into the input (`pages[3].ref.id`),
 *    so callers can report the exact broken record instead of a stack trace.
 *  - **Fault-isolating**: `sanitizeGraph` (best-effort mode) quarantines bad
 *    records and drops dangling cross-references with warnings, so one broken
 *    record never takes down a whole surface. `strictGraph` refuses the input
 *    wholesale — the right mode for gates, where silent record loss is wrong.
 *
 * Notes on the checks: object keys named `__proto__`, `constructor` or
 * `prototype` are rejected even though JSON.parse keeps them as own properties,
 * because merging such objects is the classic prototype-pollution vector; and
 * control characters (C0/C1) are rejected in every string field.
 */

export interface ValidationIssue extends ValidationIssueLike {
  /** 'error' records are rejected (or quarantine in best-effort); 'warning' keeps the record. */
  level: 'error' | 'warning';
}

export interface ValidationReport {
  /** True when there are no error-level issues (warnings may remain). */
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Hard caps. Exported for tests and for callers that want to pre-check sizes. */
export const LIMITS = {
  /** OrgGraph JSON exports accepted by parseOrgGraphJson. */
  maxJsonBytes: 50 * 1024 * 1024,
  maxPeople: 10_000,
  maxWorkItems: 50_000,
  maxPages: 50_000,
  maxPullRequests: 25_000,
  maxDecisions: 25_000,
  /** Sum of all five collections. */
  maxRecordsTotal: 100_000,
  maxIdLength: 200,
  maxTitleLength: 500,
  maxNameLength: 300,
  maxUrlLength: 2_000,
  /** Per-record link lists (linkedPageIds, linkedPullRequestIds, linkedWorkItemIds). */
  maxLinkedIdsPerRecord: 200,
  maxContributorsPerPage: 500,
  maxReviewersPerPullRequest: 200,
  /** Issues listed in one ValidationError message. */
  maxIssuesInMessage: 20,
} as const;

const SOURCES: readonly Source[] = ['jira', 'confluence', 'bitbucket', 'teamwork-graph'];
const WORK_TYPES: readonly WorkItemType[] = ['epic', 'story', 'task', 'bug', 'other'];
const WORK_STATUSES = ['open', 'done'] as const;
const PR_STATES = ['open', 'merged', 'declined'] as const;
const DECISION_STATUSES = ['proposed', 'approved', 'superseded'] as const;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function hasControlChars(text: string): boolean {
  // C0 (U+0000–001F) and DEL (U+007F); C1 (U+0080–009F) also rejected.
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || (c >= 0x80 && c <= 0x9f)) return true;
  }
  return false;
}

/** String-field check: type, emptiness, length cap, control characters. */
function checkString(
  value: unknown,
  path: string,
  what: string,
  max: number,
  issues: ValidationIssue[],
  opts: { allowEmpty?: boolean } = {},
): value is string {
  if (typeof value !== 'string') {
    issues.push({ level: 'error', path, message: `${what} must be a string, got ${typeof value}` });
    return false;
  }
  if (!opts.allowEmpty && value.length === 0) {
    issues.push({ level: 'error', path, message: `${what} must not be empty` });
    return false;
  }
  if (value.length > max) {
    issues.push({ level: 'error', path, message: `${what} is ${value.length} characters; the cap is ${max}` });
    return false;
  }
  if (hasControlChars(value)) {
    issues.push({ level: 'error', path, message: `${what} contains control characters` });
    return false;
  }
  return true;
}

function checkEnum<T extends string>(
  value: unknown,
  path: string,
  what: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push({
      level: 'error',
      path,
      message: `${what} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`,
    });
    return false;
  }
  return true;
}

function checkIdList(
  value: unknown,
  path: string,
  what: string,
  issues: ValidationIssue[],
  max: number = LIMITS.maxLinkedIdsPerRecord,
): value is string[] {
  if (!Array.isArray(value)) {
    issues.push({ level: 'error', path, message: `${what} must be an array of ids` });
    return false;
  }
  if (value.length > max) {
    issues.push({ level: 'error', path, message: `${what} has ${value.length} entries; the cap is ${max}` });
    return false;
  }
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    if (!checkString(value[i], `${path}[${i}]`, `${what} entry`, LIMITS.maxIdLength, issues)) ok = false;
  }
  return ok;
}

/** Reject dangerous keys (prototype-pollution vector) on any record object. */
function checkDangerousKeys(obj: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      issues.push({ level: 'error', path: `${path}.${key}`, message: `dangerous property name '${key}' is not allowed` });
    }
  }
}

function checkRef(value: unknown, path: string, issues: ValidationIssue[]): value is RecordRef {
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', path, message: 'ref must be an object' });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = true;
  if (!checkEnum(value.source, `${path}.source`, 'ref.source', SOURCES, issues)) ok = false;
  if (!checkString(value.id, `${path}.id`, 'ref.id', LIMITS.maxIdLength, issues)) ok = false;
  if (!checkString(value.title, `${path}.title`, 'ref.title', LIMITS.maxTitleLength, issues)) ok = false;
  if (value.url !== undefined && !checkString(value.url, `${path}.url`, 'ref.url', LIMITS.maxUrlLength, issues)) ok = false;
  return ok;
}

function checkPerson(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', path, message: 'person must be an object' });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = true;
  if (!checkString(value.id, `${path}.id`, 'person.id', LIMITS.maxIdLength, issues)) ok = false;
  if (!checkString(value.name, `${path}.name`, 'person.name', LIMITS.maxNameLength, issues)) ok = false;
  return ok;
}

function checkWorkItem(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', path, message: 'work item must be an object' });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (value.type !== undefined && !checkEnum(value.type, `${path}.type`, 'work item type', WORK_TYPES, issues)) ok = false;
  if (value.assigneeId !== undefined && !checkString(value.assigneeId, `${path}.assigneeId`, 'assigneeId', LIMITS.maxIdLength, issues)) ok = false;
  if (!checkEnum(value.status, `${path}.status`, 'work item status', WORK_STATUSES, issues)) ok = false;
  if (value.epicId !== undefined && !checkString(value.epicId, `${path}.epicId`, 'epicId', LIMITS.maxIdLength, issues)) ok = false;
  if (value.linkedPageIds !== undefined && !checkIdList(value.linkedPageIds, `${path}.linkedPageIds`, 'linkedPageIds', issues)) ok = false;
  if (value.linkedPullRequestIds !== undefined && !checkIdList(value.linkedPullRequestIds, `${path}.linkedPullRequestIds`, 'linkedPullRequestIds', issues)) ok = false;
  return ok;
}

function checkPage(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', path, message: 'page must be an object' });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (!checkIdList(value.contributorIds, `${path}.contributorIds`, 'contributorIds', issues, LIMITS.maxContributorsPerPage)) ok = false;
  return ok;
}

function checkPullRequest(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', path, message: 'pull request must be an object' });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (!checkString(value.authorId, `${path}.authorId`, 'authorId', LIMITS.maxIdLength, issues)) ok = false;
  if (!checkEnum(value.state, `${path}.state`, 'pull request state', PR_STATES, issues)) ok = false;
  if (!checkIdList(value.reviewerIds, `${path}.reviewerIds`, 'reviewerIds', issues, LIMITS.maxReviewersPerPullRequest)) ok = false;
  return ok;
}

function checkDecision(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', path, message: 'decision must be an object' });
    return false;
  }
  checkDangerousKeys(value, path, issues);
  let ok = checkRef(value.ref, `${path}.ref`, issues);
  if (!checkString(value.ownerId, `${path}.ownerId`, 'ownerId', LIMITS.maxIdLength, issues)) ok = false;
  if (!checkEnum(value.status, `${path}.status`, 'decision status', DECISION_STATUSES, issues)) ok = false;
  if (!checkIdList(value.pendingApproverIds, `${path}.pendingApproverIds`, 'pendingApproverIds', issues)) ok = false;
  if (value.linkedWorkItemIds !== undefined && !checkIdList(value.linkedWorkItemIds, `${path}.linkedWorkItemIds`, 'linkedWorkItemIds', issues)) ok = false;
  return ok;
}

/**
 * Validate any unknown value against the OrgGraph contract. Pure: nothing is
 * dropped or changed, every problem is reported with a path. Cross-reference
 * problems (an id pointing at a record that does not exist) are warnings, not
 * errors — they are corruption the engine can survive, and `sanitizeGraph`
 * resolves them by dropping the dangling reference.
 */
export function validateGraph(input: unknown): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const push = (issue: ValidationIssue): void => {
    (issue.level === 'error' ? errors : warnings).push(issue);
  };

  if (!isPlainObject(input)) {
    push({ level: 'error', path: '$', message: `an OrgGraph must be an object, got ${typeof input}` });
    return { ok: false, errors, warnings };
  }
  checkDangerousKeys(input, '$', errors);

  const collection = (name: keyof OrgGraph, cap: number): unknown[] => {
    const value = input[name];
    if (!Array.isArray(value)) {
      push({ level: 'error', path: `$.${name}`, message: `${name} must be an array, got ${typeof value}` });
      return [];
    }
    if (value.length > cap) {
      push({ level: 'error', path: `$.${name}`, message: `${name} has ${value.length} records; the cap is ${cap}` });
    }
    return value;
  };

  const people = collection('people', LIMITS.maxPeople);
  const workItems = collection('workItems', LIMITS.maxWorkItems);
  const pages = collection('pages', LIMITS.maxPages);
  const pullRequests = collection('pullRequests', LIMITS.maxPullRequests);
  const decisions = collection('decisions', LIMITS.maxDecisions);

  const total = people.length + workItems.length + pages.length + pullRequests.length + decisions.length;
  if (total > LIMITS.maxRecordsTotal) {
    push({ level: 'error', path: '$', message: `graph has ${total} records in total; the cap is ${LIMITS.maxRecordsTotal}` });
  }

  // Structural checks, per record. A record with an error is broken itself.
  const personOk: boolean[] = people.map((p, i) => checkPerson(p, `$.people[${i}]`, errors));
  const workOk: boolean[] = workItems.map((w, i) => checkWorkItem(w, `$.workItems[${i}]`, errors));
  const pageOk: boolean[] = pages.map((p, i) => checkPage(p, `$.pages[${i}]`, errors));
  const prOk: boolean[] = pullRequests.map((p, i) => checkPullRequest(p, `$.pullRequests[${i}]`, errors));
  const decisionOk: boolean[] = decisions.map((d, i) => checkDecision(d, `$.decisions[${i}]`, errors));

  // Duplicate ids within a collection (pages and decisions may legitimately
  // share ids across the two collections: a derived decision IS a page).
  const dupes = (records: unknown[], okFlags: boolean[], name: string, idOf: (r: unknown) => unknown): void => {
    const seen = new Map<string, number>();
    records.forEach((record, i) => {
      if (!okFlags[i]) return;
      const id = idOf(record);
      if (typeof id !== 'string') return;
      const first = seen.get(id);
      if (first === undefined) {
        seen.set(id, i);
      } else {
        push({
          level: 'error',
          path: `$.${name}[${i}]`,
          message: `duplicate id '${id}' (first seen at $.${name}[${first}])`,
        });
      }
    });
  };
  dupes(people, personOk, 'people', (p) => (p as Person).id);
  dupes(workItems, workOk, 'workItems', (w) => (w as WorkItem).ref.id);
  dupes(pages, pageOk, 'pages', (p) => (p as Page).ref.id);
  dupes(pullRequests, prOk, 'pullRequests', (p) => (p as PullRequest).ref.id);
  dupes(decisions, decisionOk, 'decisions', (d) => (d as Decision).ref.id);

  // Cross-reference checks (warnings): ids that point at nothing that exists.
  // Only meaningful for structurally-valid records.
  const personIds = new Set<string>();
  people.forEach((p, i) => {
    if (personOk[i]) personIds.add((p as Person).id);
  });
  const workIds = new Set<string>();
  const epicIds = new Set<string>();
  workItems.forEach((w, i) => {
    if (!workOk[i]) return;
    const item = w as WorkItem;
    workIds.add(item.ref.id);
    if (item.type === 'epic') epicIds.add(item.ref.id);
  });
  const pageOrDecisionIds = new Set<string>();
  pages.forEach((p, i) => {
    if (pageOk[i]) pageOrDecisionIds.add((p as Page).ref.id);
  });
  decisions.forEach((d, i) => {
    if (decisionOk[i]) pageOrDecisionIds.add((d as Decision).ref.id);
  });
  const prIds = new Set<string>();
  pullRequests.forEach((p, i) => {
    if (prOk[i]) prIds.add((p as PullRequest).ref.id);
  });

  const warnDangling = (path: string, id: string, what: string): void => {
    warnings.push({ level: 'warning', path, message: `${what} '${id}' does not exist in this graph; the reference will be dropped` });
  };

  workItems.forEach((w, i) => {
    if (!workOk[i]) return;
    const item = w as WorkItem;
    if (item.assigneeId !== undefined && !personIds.has(item.assigneeId)) {
      warnDangling(`$.workItems[${i}].assigneeId`, item.assigneeId, 'assigneeId');
    }
    if (item.epicId !== undefined && !epicIds.has(item.epicId)) {
      warnDangling(`$.workItems[${i}].epicId`, item.epicId, 'epicId');
    }
    (item.linkedPageIds ?? []).forEach((id, j) => {
      if (!pageOrDecisionIds.has(id)) warnDangling(`$.workItems[${i}].linkedPageIds[${j}]`, id, 'linked page or decision');
    });
    (item.linkedPullRequestIds ?? []).forEach((id, j) => {
      if (!prIds.has(id)) warnDangling(`$.workItems[${i}].linkedPullRequestIds[${j}]`, id, 'linked pull request');
    });
  });

  decisions.forEach((d, i) => {
    if (!decisionOk[i]) return;
    const decision = d as Decision;
    if (decision.ownerId !== undefined && !personIds.has(decision.ownerId)) {
      warnDangling(`$.decisions[${i}].ownerId`, decision.ownerId, 'decision owner');
    }
    (decision.pendingApproverIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.decisions[${i}].pendingApproverIds[${j}]`, id, 'pending approver');
    });
    (decision.linkedWorkItemIds ?? []).forEach((id, j) => {
      if (!workIds.has(id)) warnDangling(`$.decisions[${i}].linkedWorkItemIds[${j}]`, id, 'linked work item');
    });
  });

  pages.forEach((p, i) => {
    if (!pageOk[i]) return;
    ((p as Page).contributorIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.pages[${i}].contributorIds[${j}]`, id, 'contributor');
    });
  });

  pullRequests.forEach((p, i) => {
    if (!prOk[i]) return;
    const pr = p as PullRequest;
    if (pr.authorId !== undefined && !personIds.has(pr.authorId)) {
      warnDangling(`$.pullRequests[${i}].authorId`, pr.authorId, 'pull request author');
    }
    (pr.reviewerIds ?? []).forEach((id, j) => {
      if (!personIds.has(id)) warnDangling(`$.pullRequests[${i}].reviewerIds[${j}]`, id, 'reviewer');
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

/** Count issues at each level, for logs and e2e output. */
export function summarizeIssues(report: ValidationReport): { errors: number; warnings: number } {
  return { errors: report.errors.length, warnings: report.warnings.length };
}

/**
 * Strict boundary: validate and either throw a ValidationError carrying every
 * issue, or hand back the typed graph untouched (cross-reference warnings are
 * reported but nothing is dropped — use sanitizeGraph for that).
 */
export function strictGraph(input: unknown, context = 'input'): { graph: OrgGraph; warnings: ValidationIssue[] } {
  const report = validateGraph(input);
  if (!report.ok) throw new ValidationError(report.errors, context);
  return { graph: input as OrgGraph, warnings: report.warnings };
}

export interface SanitizeResult {
  graph: OrgGraph;
  warnings: ValidationIssue[];
  /** Records removed in best-effort mode, with the reason. Never silently. */
  rejected: { path: string; reason: string }[];
}

/**
 * Best-effort boundary: quarantine structurally-broken records and drop
 * dangling cross-references, then return a clean graph plus an honest list of
 * everything that was removed. One bad record never takes down a surface.
 * Total-shape failures (input not an object, caps blown) still throw, because
 * "best effort" must not mean "silently serve a fraction of the data" —
 * per-record problems are survivable, whole-graph problems are not.
 */
export function sanitizeGraph(input: unknown, context = 'input'): SanitizeResult {
  const report = validateGraph(input);
  // Whole-graph errors (not an object, caps, collection not an array) cannot be
  // quarantined record by record.
  const fatal = report.errors.filter(
    (e) => e.path === '$' || (e.path.startsWith('$.') && !/\[\d+\]/.test(e.path)),
  );
  if (fatal.length > 0) throw new ValidationError(fatal, context);

  // Rejected reports the RECORD path (e.g. `$.workItems[11]`), not the field
  // path of the first issue, so callers can name what was dropped.
  const recordPath = (p: string): string => {
    const m = /^\$\.(\w+)\[(\d+)\]/.exec(p);
    return m ? `$.${m[1]}[${m[2]}]` : p;
  };
  const rejected: { path: string; reason: string }[] = [];
  for (const error of report.errors) {
    rejected.push({ path: recordPath(error.path), reason: error.message });
  }

  const source = input as OrgGraph;

  // Surviving, structurally-valid records. Every kept record is shallow-copied
  // so the input is never mutated, and copies carry own properties only.
  const people: Person[] = [];
  source.people.forEach((p, i) => {
    if (rejectsPath(rejected, `$.people[${i}]`)) return;
    people.push({ id: p.id, name: p.name });
  });

  const personIds = new Set(people.map((p) => p.id));

  const workItems: WorkItem[] = [];
  const epicIds = new Set<string>();
  source.workItems.forEach((w, i) => {
    if (rejectsPath(rejected, `$.workItems[${i}]`)) return;
    if (w.type === 'epic') epicIds.add(w.ref.id);
    workItems.push({ ...w });
  });
  const workIds = new Set(workItems.map((w) => w.ref.id));

  const pages: Page[] = [];
  source.pages.forEach((p, i) => {
    if (rejectsPath(rejected, `$.pages[${i}]`)) return;
    pages.push({ ...p, contributorIds: [...p.contributorIds] });
  });

  const pullRequests: PullRequest[] = [];
  source.pullRequests.forEach((p, i) => {
    if (rejectsPath(rejected, `$.pullRequests[${i}]`)) return;
    pullRequests.push({ ...p, reviewerIds: [...p.reviewerIds] });
  });

  const decisions: Decision[] = [];
  source.decisions.forEach((d, i) => {
    if (rejectsPath(rejected, `$.decisions[${i}]`)) return;
    decisions.push({
      ...d,
      pendingApproverIds: [...d.pendingApproverIds],
      linkedWorkItemIds: d.linkedWorkItemIds ? [...d.linkedWorkItemIds] : undefined,
    });
  });

  const pageOrDecisionIds = new Set<string>([...pages.map((p) => p.ref.id), ...decisions.map((d) => d.ref.id)]);
  const prIds = new Set(pullRequests.map((p) => p.ref.id));

  const dropDangling = (ids: string[] | undefined, keep: (id: string) => boolean): string[] | undefined => {
    if (!ids) return undefined;
    const kept = ids.filter(keep);
    return kept.length > 0 ? kept : undefined;
  };

  const warnings = [...report.warnings];
  /*
   * Dangling references are resolved on the copies:
   *  - optional scalars (assigneeId, epicId) are dropped to undefined;
   *  - id lists are filtered;
   *  - required scalars (decision.ownerId, pullRequest.authorId) are KEPT — the
   *    engine only ever matches ids against `graph.people`, so a dangling id
   *    can never crash it or fabricate a finding; it is reported as a warning.
   *    Mutating them to undefined would break the OrgGraph type contract.
   */
  for (const item of workItems) {
    if (item.assigneeId !== undefined && !personIds.has(item.assigneeId)) item.assigneeId = undefined;
    if (item.epicId !== undefined && !epicIds.has(item.epicId)) item.epicId = undefined;
    const keptPages = dropDangling(item.linkedPageIds, (id) => pageOrDecisionIds.has(id));
    if (keptPages !== item.linkedPageIds) item.linkedPageIds = keptPages;
    const keptPrs = dropDangling(item.linkedPullRequestIds, (id) => prIds.has(id));
    if (keptPrs !== item.linkedPullRequestIds) item.linkedPullRequestIds = keptPrs;
  }
  for (const decision of decisions) {
    decision.pendingApproverIds = decision.pendingApproverIds.filter((id) => personIds.has(id));
    const kept = dropDangling(decision.linkedWorkItemIds, (id) => workIds.has(id));
    if (kept !== decision.linkedWorkItemIds) decision.linkedWorkItemIds = kept;
  }
  for (const page of pages) {
    page.contributorIds = page.contributorIds.filter((id) => personIds.has(id));
  }
  for (const pr of pullRequests) {
    pr.reviewerIds = pr.reviewerIds.filter((id) => personIds.has(id));
  }

  return { graph: { people, workItems, pages, pullRequests, decisions }, warnings, rejected };
}

function rejectsPath(rejected: { path: string }[], path: string): boolean {
  // Both sides are record paths after normalization; a record is quarantined
  // when any error was reported for it or for a field inside it.
  return rejected.some((r) => r.path === path);
}

export interface ParsedExport {
  graph: OrgGraph;
  warnings: ValidationIssue[];
}

/**
 * Parse an OrgGraph JSON export (a file, an env var, a request body) with a
 * byte cap and full validation. Strict by design: exports feed gates and
 * dashboards, where silently losing records would be worse than failing.
 * Throws ValidationError with every issue found.
 */
export function parseOrgGraphJson(text: string, context = 'OrgGraph export'): ParsedExport {
  if (typeof text !== 'string') {
    throw new ValidationError([{ path: '$', message: `expected a JSON string, got ${typeof text}` }], context);
  }
  if (text.length > LIMITS.maxJsonBytes) {
    throw new ValidationError(
      [{ path: '$', message: `export is ${text.length} bytes; the cap is ${LIMITS.maxJsonBytes}` }],
      context,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(
      [{ path: '$', message: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` }],
      context,
    );
  }
  const { graph, warnings } = strictGraph(parsed, context);
  return { graph, warnings };
}
