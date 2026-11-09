/**
 * Local eval reporter (dev tool, not wired into CI — `npm run e2e` stage 11
 * is the gate). Prints the measured answer-layer efficiency over the full
 * labeled corpus plus every failing case with expected vs actual, so a
 * session can see exactly which documented gaps are still open:
 *
 *   npx tsx scripts/eval-run.mts
 */
import { evaluateAnswerLayer, formatEvalSummary } from '../packages/core/src/eval.js';

const report = evaluateAnswerLayer();
console.log(formatEvalSummary(report));
console.log('--- failures ---');
for (const f of report.failures) {
  const expected = f.expected.understood ? f.expected.intent : 'refuse';
  console.log(
    `"${f.question}" => understood=${f.actual.understood} intent=${f.actual.intent} ` +
    `person=${f.actual.personId} epic=${f.actual.epicId} decision=${f.actual.decisionId} (expected: ${expected})`,
  );
}
