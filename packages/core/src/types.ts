/** Where a record came from. Every finding must point back to real records. */
export type Source = 'jira' | 'confluence' | 'bitbucket' | 'teamwork-graph';

export interface RecordRef {
  source: Source;
  id: string;
  title: string;
  url?: string;
}

export interface Person {
  id: string;
  name: string;
}

export interface WorkItem {
  ref: RecordRef;
  assigneeId?: string;
  status: 'open' | 'done';
  epicId?: string;
}

export interface Page {
  ref: RecordRef;
  /** Everyone with a recorded edit on the page. */
  contributorIds: string[];
}

export interface PullRequest {
  ref: RecordRef;
  authorId: string;
  state: 'open' | 'merged' | 'declined';
  reviewerIds: string[];
}

export interface Decision {
  ref: RecordRef;
  ownerId: string;
  status: 'proposed' | 'approved' | 'superseded';
  /** People whose input or approval is still outstanding. */
  pendingApproverIds: string[];
}

/** The only shape the UI and risk engine see; adapters (forge, mock) produce it. */
export interface OrgGraph {
  people: Person[];
  workItems: WorkItem[];
  pages: Page[];
  pullRequests: PullRequest[];
  decisions: Decision[];
}

export type Confidence = 'high' | 'medium' | 'low';

export type FindingKind =
  | 'sole-contributor-page'
  | 'open-work'
  | 'open-pull-request'
  | 'pending-decision';

export interface Finding {
  kind: FindingKind;
  title: string;
  detail: string;
  confidence: Confidence;
  /** Records that support this finding. Never empty. */
  evidence: RecordRef[];
  /** Points this finding adds to the score (count x weight). */
  points: number;
  suggestedActions: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface PersonRiskReport {
  personId: string;
  personName: string;
  score: number;
  level: RiskLevel;
  findings: Finding[];
  /** What the data cannot prove. Always shown next to the score. */
  caveats: string[];
}

export interface RiskWeights {
  solePage: number;
  openWork: number;
  openPullRequest: number;
  pendingDecision: number;
}
