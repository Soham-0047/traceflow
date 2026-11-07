import type { PersonRiskReport } from '@traceflow/core';
import { CONFIDENCE_LABEL } from './Evidence';
import { findingId } from './evidence-model';

/**
 * The handover ledger: every finding shows how many records it counts, the weight
 * applied to each, and the points it adds, so the score can be checked by hand.
 */
export function Ledger({
  report,
  selectedId,
  onSelect,
}: {
  report: PersonRiskReport;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const raw = report.findings.reduce((sum, f) => sum + f.points, 0);
  const capped = raw > report.score;

  if (report.findings.length === 0) {
    return (
      <p className="muted">
        No findings for {report.personName}. Nothing in the connected records depends on this person alone.
      </p>
    );
  }

  return (
    <div className="ledger-wrap">
      <ol className="ledger-bar" aria-label="Share of the score by finding">
        {report.findings.map((f, i) => {
          const id = findingId(f, i);
          return (
            <li key={id} style={{ flexGrow: f.points }}>
              <button
                type="button"
                aria-label={`${f.title}, ${f.points} points`}
                aria-current={selectedId === id ? 'true' : undefined}
                onClick={() => onSelect(id)}
              />
            </li>
          );
        })}
      </ol>

      <div className="table-scroll">
        <p className="scroll-hint">Swipe the table sideways to see every column.</p>
        <table className="ledger">
        <caption className="visually-hidden">
          Handover ledger for {report.personName}: findings, records counted, weight and points
        </caption>
        <thead>
          <tr>
            <th scope="col">Finding</th>
            <th scope="col">Confidence</th>
            <th scope="col" className="num">Records</th>
            <th scope="col" className="num">Weight</th>
            <th scope="col" className="num">Points</th>
          </tr>
        </thead>
        <tbody>
          {report.findings.map((f, i) => {
            const id = findingId(f, i);
            const count = f.evidence.length;
            return (
              <tr key={id} data-selected={selectedId === id}>
                <td>
                  <button
                    type="button"
                    className="row-button"
                    aria-current={selectedId === id ? 'true' : undefined}
                    onClick={() => onSelect(id)}
                  >
                    {f.title}
                  </button>
                </td>
                <td>{CONFIDENCE_LABEL[f.confidence]}</td>
                <td className="num">{count}</td>
                <td className="num">{count > 0 ? f.points / count : 0}</td>
                <td className="num">{f.points}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>
              {capped ? `Score (the sum, ${raw}, is capped at 100)` : 'Score'}
            </th>
            <td className="num total">{report.score}</td>
          </tr>
        </tfoot>
        </table>
      </div>
    </div>
  );
}
