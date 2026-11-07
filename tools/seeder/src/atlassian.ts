import type { SeedOp, SiteState } from './plan';
import { SEED_LABEL } from './plan';
import type { SeedIssue, SeedPage } from './story';

/*
 * The Atlassian REST client for the seeder. UNVERIFIED: written from public API
 * knowledge; it runs for the first time against Soham's dev site (TF-05).
 * Kept as one small class so the planner stays testable without a network.
 */

export interface SeederConfig {
  site: string;
  email: string;
  apiToken: string;
  projectKey: string;
  spaceKey: string;
}

const PAGE_BODY = (page: SeedPage) =>
  page.decision
    ? '<p>Status: proposed. Approvals are not recorded in activity data, so TraceFlow keeps this decision proposed.</p>'
    : '<p>Seeded by TraceFlow for the demo story. Edit freely; TraceFlow only reads.</p>';

export class AtlassianClient {
  constructor(private readonly config: SeederConfig) {}

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    const response = await fetch(`${this.config.site}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status} ${body.slice(0, 200)}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  /** Read the current state: seeded issues (by label), their remote links, and space pages. */
  async fetchState(): Promise<SiteState> {
    const jql = encodeURIComponent(`project = "${this.config.projectKey}" AND labels = "${SEED_LABEL}"`);
    const search = (await this.call(
      `/rest/api/3/search?jql=${jql}&maxResults=100&fields=summary,status,assignee,labels`,
    )) as { issues?: rawIssue[] };

    const issues: SiteState['issues'] = (search.issues ?? []).map((i) => ({
      key: i.key,
      summary: i.fields.summary ?? i.key,
      statusCategory: i.fields.status?.statusCategory?.key === 'done' ? 'done' : 'indeterminate',
      assigneeAccountId: i.fields.assignee?.accountId,
    }));

    const remoteLinks: Record<string, string[]> = {};
    for (const issue of issues) {
      const links = (await this.call(`/rest/api/3/issue/${issue.key}/remotelink`)) as { object?: { url?: string } }[];
      remoteLinks[issue.key] = links.map((l) => l.object?.url ?? '').filter(Boolean);
    }

    const content = (await this.call(
      `/wiki/rest/api/content?type=page&spaceKey=${this.config.spaceKey}&limit=100`,
    )) as { results?: { id: string; title: string }[] };

    return {
      issues,
      remoteLinks,
      pages: (content.results ?? []).map((p) => ({ id: p.id, title: p.title })),
    };
  }

  /** Execute the plan. Pages created in this run are linked immediately after creation. */
  async apply(ops: SeedOp[], map: Record<string, string>): Promise<string[]> {
    const log: string[] = [];
    const pageIdsByTitle = new Map<string, string>();

    for (const op of ops) {
      switch (op.op) {
        case 'create-page': {
          const created = (await this.call('/wiki/rest/api/content', {
            method: 'POST',
            body: JSON.stringify({
              type: 'page',
              title: op.title,
              space: { key: this.config.spaceKey },
              body: { storage: { value: PAGE_BODY({ title: op.title, decision: op.decision }), representation: 'storage' } },
            }),
          })) as { id: string };
          pageIdsByTitle.set(op.title, created.id);
          log.push(`created page "${op.title}" (${created.id})`);
          break;
        }
        case 'create-issue': {
          const key = await this.createIssue(op.issue, map);
          log.push(`created issue ${key}: ${op.issue.summary}`);
          if (op.issue.status === 'done') {
            await this.transitionDone(key);
            log.push(`transitioned ${key} to done`);
          }
          for (const title of op.issue.linkedPageTitles) {
            const pageId = pageIdsByTitle.get(title);
            if (pageId) await this.link(key, pageId, title);
          }
          break;
        }
        case 'assign-issue': {
          await this.call(`/rest/api/3/issue/${op.key}/assignee`, {
            method: 'PUT',
            body: JSON.stringify({ accountId: op.accountId }),
          });
          log.push(`assigned ${op.key} (${op.summary})`);
          break;
        }
        case 'transition-issue': {
          await this.transitionDone(op.key);
          log.push(`transitioned ${op.key} (${op.summary}) to done`);
          break;
        }
        case 'link-issue-to-page': {
          const pageId = pageIdsByTitle.get(op.pageTitle) ?? (await this.pageIdByTitle(op.pageTitle));
          if (pageId) {
            await this.link(op.key, pageId, op.pageTitle);
            log.push(`linked ${op.key} (${op.summary}) to "${op.pageTitle}"`);
          }
          break;
        }
      }
    }
    return log;
  }

  private async createIssue(issue: SeedIssue, map: Record<string, string>): Promise<string> {
    const accountId = issue.fictionalAssignee ? map[issue.fictionalAssignee] : undefined;
    const created = (await this.call('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: this.config.projectKey },
          issuetype: { name: issue.type === 'other' ? 'Task' : issue.type.charAt(0).toUpperCase() + issue.type.slice(1) },
          summary: issue.summary,
          labels: [SEED_LABEL],
          ...(accountId ? { assignee: { accountId } } : {}),
        },
      }),
    })) as { key: string };
    return created.key;
  }

  private async transitionDone(key: string): Promise<void> {
    const transitions = (await this.call(`/rest/api/3/issue/${key}/transitions`)) as {
      transitions?: { id: string; to?: { statusCategory?: { key?: string } } }[];
    };
    const done = (transitions.transitions ?? []).find((t) => t.to?.statusCategory?.key === 'done');
    if (!done) throw new Error(`No transition to a done status found for ${key}. Transition it by hand.`);
    await this.call(`/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ id: done.id }),
    });
  }

  private async link(key: string, pageId: string, title: string): Promise<void> {
    await this.call(`/rest/api/3/issue/${key}/remotelink`, {
      method: 'POST',
      body: JSON.stringify({
        object: { url: `${this.config.site}/wiki/spaces/${this.config.spaceKey}/pages/${pageId}`, title },
      }),
    });
  }

  private async pageIdByTitle(title: string): Promise<string | undefined> {
    const cql = encodeURIComponent(`space = "${this.config.spaceKey}" and title = "${title}"`);
    const found = (await this.call(`/wiki/rest/api/content/search?cql=${cql}&limit=1`)) as {
      results?: { id: string }[];
    };
    return found.results?.[0]?.id;
  }
}

interface rawIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { statusCategory?: { key?: string } };
    assignee?: { accountId?: string };
  };
}
