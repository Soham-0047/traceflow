import type { FindingKind } from './types.js';

/** Plain-language description of how each kind of finding is detected. Shown in the evidence panel. */
export const RULES: Record<FindingKind, string> = {
  'sole-contributor-page':
    'A page has exactly one recorded contributor, and that person is the one under review.',
  'open-work':
    'An issue is assigned to this person and its status category is not done.',
  'open-pull-request':
    'A pull request authored by this person is still open.',
  'pending-decision':
    'A decision that is not superseded still lists this person as an outstanding approver.',
  'no-recorded-spec':
    'Neither the epic nor any of its issues links to a Confluence page or decision.',
  'done-without-implementation':
    'A finished issue in the epic has no linked pull request. Only checked when pull-request data is connected.',
  'unapproved-decision':
    'A decision still marked proposed is linked to work that is already done.',
  'superseded-decision-in-use':
    'A superseded decision is still linked from open work.',
};
