/** Base class for every error TraceFlow raises deliberately. */
export class TraceFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceFlowError';
  }
}

/**
 * Untrusted input did not match the OrgGraph contract. Carries every issue found
 * (capped), each with a path into the input, so a caller can report or log the
 * exact broken records instead of a single opaque message.
 */
export class ValidationError extends TraceFlowError {
  readonly issues: readonly ValidationIssueLike[];

  constructor(issues: readonly ValidationIssueLike[], context = 'input') {
    super(`${issues.length} validation error(s) in ${context}:\n${formatIssues(issues)}`);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export interface ValidationIssueLike {
  path: string;
  message: string;
}

/** Format issues for humans, capping the list so a hostile input cannot flood logs. */
export function formatIssues(issues: readonly ValidationIssueLike[], cap = 20): string {
  const shown = issues.slice(0, cap);
  const lines = shown.map((i) => `  - ${i.path}: ${i.message}`);
  if (issues.length > cap) lines.push(`  - …and ${issues.length - cap} more`);
  return lines.join('\n');
}
