import type { OrgGraph } from './types.js';

/**
 * Small fictional org used by tests and the mock-data demo.
 * Three epics, each telling a different story:
 *  - PAY-1  : has specs and decisions, but a proposed decision already has finished work,
 *             and a finished issue has no pull request. Alex owns most of the evidence here.
 *  - AUTH-1 : still has open work tied to a superseded decision.
 *  - ONB-1  : no linked specification at all.
 */
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
    { ref: { source: 'confluence', id: 'p5', title: 'Idempotency design notes' }, contributorIds: ['alex'] },
    { ref: { source: 'confluence', id: 'p6', title: 'Postmortem: duplicate charge' }, contributorIds: ['alex'] },
    { ref: { source: 'confluence', id: 'p7', title: 'Payments on-call guide' }, contributorIds: ['alex'] },
    { ref: { source: 'confluence', id: 'p8', title: 'Ledger reconciliation job' }, contributorIds: ['alex'] },
    { ref: { source: 'confluence', id: 'p9', title: 'Webhook retry semantics' }, contributorIds: ['alex'] },
  ],
  workItems: [
    { ref: { source: 'jira', id: 'PAY-1', title: 'Payments reliability' }, type: 'epic', assigneeId: 'sam', status: 'open', linkedPageIds: ['p1'] },
    { ref: { source: 'jira', id: 'PAY-12', title: 'Fix duplicate charge on retry' }, type: 'bug', assigneeId: 'alex', status: 'open', epicId: 'PAY-1', linkedPageIds: ['p6'] },
    { ref: { source: 'jira', id: 'PAY-15', title: 'Add idempotency keys' }, type: 'story', assigneeId: 'alex', status: 'open', epicId: 'PAY-1', linkedPageIds: ['p5', 'd3'], linkedPullRequestIds: ['pr-31'] },
    { ref: { source: 'jira', id: 'PAY-18', title: 'Reconcile ledger after retries' }, type: 'story', assigneeId: 'alex', status: 'open', epicId: 'PAY-1', linkedPullRequestIds: ['pr-33'] },
    { ref: { source: 'jira', id: 'PAY-21', title: 'Webhook replay drops events' }, type: 'bug', assigneeId: 'alex', status: 'open', epicId: 'PAY-1' },
    { ref: { source: 'jira', id: 'PAY-9', title: 'Retry backoff tuning' }, type: 'task', assigneeId: 'alex', status: 'done', epicId: 'PAY-1', linkedPullRequestIds: ['pr-28'] },
    { ref: { source: 'jira', id: 'PAY-7', title: 'Dead-letter queue alerts' }, type: 'task', assigneeId: 'sam', status: 'done', epicId: 'PAY-1' },
    { ref: { source: 'jira', id: 'AUTH-1', title: 'Auth hardening' }, type: 'epic', assigneeId: 'sam', status: 'open', linkedPageIds: ['p2'] },
    { ref: { source: 'jira', id: 'AUTH-4', title: 'Rotate signing keys' }, type: 'task', assigneeId: 'sam', status: 'open', epicId: 'AUTH-1' },
    { ref: { source: 'jira', id: 'ONB-1', title: 'Onboarding revamp' }, type: 'epic', assigneeId: 'priya', status: 'open' },
    { ref: { source: 'jira', id: 'ONB-3', title: 'Interactive checklist' }, type: 'story', assigneeId: 'priya', status: 'open', epicId: 'ONB-1' },
  ],
  pullRequests: [
    { ref: { source: 'bitbucket', id: 'pr-31', title: 'Idempotency middleware' }, authorId: 'alex', state: 'open', reviewerIds: ['sam'] },
    { ref: { source: 'bitbucket', id: 'pr-33', title: 'Reconciliation job' }, authorId: 'alex', state: 'open', reviewerIds: [] },
    { ref: { source: 'bitbucket', id: 'pr-28', title: 'Retry backoff' }, authorId: 'alex', state: 'merged', reviewerIds: ['sam'] },
  ],
  decisions: [
    {
      ref: { source: 'confluence', id: 'd1', title: 'Decision: queue vs cron for retries' },
      ownerId: 'sam',
      status: 'proposed',
      pendingApproverIds: ['alex'],
      linkedWorkItemIds: ['PAY-12', 'PAY-9'],
    },
    {
      ref: { source: 'confluence', id: 'd3', title: 'Decision: idempotency key scope' },
      ownerId: 'alex',
      status: 'proposed',
      pendingApproverIds: ['alex'],
      linkedWorkItemIds: ['PAY-15'],
    },
    {
      ref: { source: 'confluence', id: 'd2', title: 'Decision: token format' },
      ownerId: 'alex',
      status: 'superseded',
      pendingApproverIds: ['alex'],
      linkedWorkItemIds: ['AUTH-4'],
    },
  ],
};
