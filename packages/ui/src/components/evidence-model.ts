import { RULES, IMPACT_RULES } from '@traceflow/core';
import type { Finding, ImpactArea } from '@traceflow/core';
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

/** Stable id for an impact area within one report. */
export const areaId = (area: ImpactArea, index: number): string => `${area.kind}-${index}`;

export function areaToEvidence(area: ImpactArea): EvidenceItem {
  return {
    title: area.title,
    detail: area.detail,
    rule: IMPACT_RULES[area.kind],
    confidence: area.confidence,
    records: area.evidence,
    actions: area.suggestedActions,
  };
}
