/**
 * Dev helper: print the measured answer-layer efficiency report (the same
 * evaluation the CI gate runs) with per-group breakdown and the failing
 * cases. Not part of CI; used when tuning the NLU corpus and signals.
 *
 *   node scripts/eval-report.mjs
 */
import { evaluateAnswerLayer, formatEvalSummary } from '@traceflow/core';

const report = evaluateAnswerLayer();
console.log(formatEvalSummary(report));
console.log(`\nefficiency: ${(report.efficiency * 100).toFixed(1)}%  (${report.correct}/${report.total})`);
if (report.failures.length > 0) {
  console.log(`\nFailing cases (${report.failures.length}):`);
  for (const f of report.failures) {
    const expected = f.expected.understood
      ? `${f.expected.intent ?? ''}${f.expected.personId ? ` person=${f.expected.personId}` : ''}${f.expected.epicId ? ` epic=${f.expected.epicId}` : ''}${f.expected.decisionId ? ` decision=${f.expected.decisionId}` : ''}`
      : 'refuse';
    const actual = f.actual.understood
      ? `${f.actual.intent ?? ''}${f.actual.personId ? ` person=${f.actual.personId}` : ''}${f.actual.epicId ? ` epic=${f.actual.epicId}` : ''}${f.actual.decisionId ? ` decision=${f.actual.decisionId}` : ''}`
      : 'refused';
    console.log(`  ✗ "${f.question}"`);
    console.log(`      expected: ${expected}`);
    console.log(`      actual:   ${actual}`);
  }
} else {
  console.log('\nAll cases pass.');
}
