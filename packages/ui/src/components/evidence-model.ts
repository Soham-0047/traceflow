import { RULES } from '@traceflow/core';
import type { Finding } from '@traceflow/core';
import type { EvidenceItem } from './Evidence';

/** Stable id for a finding within one report. */
export const findingId = (finding: Finding, index: number): string => `${finding.kind}-${index}`;

export function toEvidence(finding: Finding): EvidenceItem {
  return {
    title: finding.title,
    detail: finding.detail,
    rule: RULES[finding.kind],
    confidence: finding.confidence,
    records: finding.evidence,
    actions: finding.suggestedActions,
  };
}
