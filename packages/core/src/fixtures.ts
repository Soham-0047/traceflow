import type { OrgGraph } from './types.js';

/** Small fictional org used by tests and the future mock-data demo. */
export const sampleGraph: OrgGraph = {
  people: [
    { id: 'alex', name: 'Alex Rivera' },
    { id: 'sam', name: 'Sam Chen' },
    { id: 'priya', name: 'Priya Nair' },
  ],
  pages: [
    { ref: { source: 'confluence', id: 'p1', title: 'Payments retry design' }, contributorIds: ['alex'] },
    { ref: { source: 'confluence', id: 'p2', title: 'Auth service runbook' }, contributorIds: ['alex'] },
    { ref: { source: 'confluence', id: 'p3', title: 'Release checklist' }, contributorIds: ['alex', 'sam'] },
    { ref: { source: 'confluence', id: 'p4', title: 'Onboarding guide' }, contributorIds: ['priya'] },
  ],
  workItems: [
    { ref: { source: 'jira', id: 'PAY-12', title: 'Fix duplicate charge on retry' }, assigneeId: 'alex', status: 'open' },
    { ref: { source: 'jira', id: 'PAY-15', title: 'Add idempotency keys' }, assigneeId: 'alex', status: 'open' },
    { ref: { source: 'jira', id: 'PAY-9', title: 'Retry backoff tuning' }, assigneeId: 'alex', status: 'done' },
    { ref: { source: 'jira', id: 'AUTH-4', title: 'Rotate signing keys' }, assigneeId: 'sam', status: 'open' },
  ],
  pullRequests: [
    { ref: { source: 'bitbucket', id: 'pr-31', title: 'Idempotency middleware' }, authorId: 'alex', state: 'open', reviewerIds: ['sam'] },
    { ref: { source: 'bitbucket', id: 'pr-28', title: 'Retry backoff' }, authorId: 'alex', state: 'merged', reviewerIds: ['sam'] },
  ],
  decisions: [
    {
      ref: { source: 'confluence', id: 'd1', title: 'Decision: queue vs cron for retries' },
      ownerId: 'sam',
      status: 'proposed',
      pendingApproverIds: ['alex'],
    },
    {
      ref: { source: 'confluence', id: 'd2', title: 'Decision: token format' },
      ownerId: 'alex',
      status: 'superseded',
      pendingApproverIds: ['alex'],
    },
  ],
};
