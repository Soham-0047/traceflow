import type { Confidence, RecordRef } from '@traceflow/core';

export interface EvidenceItem {
  title: string;
  detail: string;
  rule?: string;
  confidence?: Confidence;
  records: RecordRef[];
  actions: string[];
}

const SOURCE_LABEL: Record<RecordRef['source'], string> = {
  jira: 'Jira',
  confluence: 'Confluence',
  bitbucket: 'Bitbucket',
  'teamwork-graph': 'Teamwork Graph',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function RecordRow({ record }: { record: RecordRef }) {
  const title = record.url ? (
    <a href={record.url}>{record.title}</a>
  ) : (
    <span>{record.title}</span>
  );
  return (
    <li className="record">
      <span className="record-source">{SOURCE_LABEL[record.source]}</span>
      <span className="figure record-id">{record.id}</span>
      {title}
    </li>
  );
}

/** The Evidence Drawer: what was found, why, which records, how sure, what to do. */
export function EvidencePanel({ item }: { item?: EvidenceItem }) {
  return (
    <aside className="evidence" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence</h2>
      {!item ? (
        <p className="evidence-empty">
          Select a finding to see why it was flagged and which records support it.
        </p>
      ) : (
        <div className="evidence-body">
          <h3>{item.title}</h3>
          <dl>
            <div>
              <dt>What was found</dt>
              <dd>{item.detail}</dd>
            </div>
            {item.rule ? (
              <div>
                <dt>Why it was flagged</dt>
                <dd>{item.rule}</dd>
              </div>
            ) : null}
            {item.confidence ? (
              <div>
                <dt>Confidence</dt>
                <dd>{CONFIDENCE_LABEL[item.confidence]}</dd>
              </div>
            ) : null}
            <div>
              <dt>Supporting records</dt>
              <dd>
                <ul className="records">
                  {item.records.map((r) => (
                    <RecordRow record={r} key={`${r.source}:${r.id}`} />
                  ))}
                </ul>
              </dd>
            </div>
            {item.actions.length > 0 ? (
              <div>
                <dt>What to do</dt>
                <dd>
                  <ul className="actions">
                    {item.actions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </aside>
  );
}
