import { expect, it } from 'vitest';
import { FoundationReportSchema } from '../packages/contracts/src/foundation.js';
import { foundationReportFixture } from '../apps/web/src/foundation-report.fixtures.js';
import {
  SEMANTIC_PIPELINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
} from '../packages/contracts/src/semantic-assessment.js';

function fixture() {
  const report = foundationReportFixture();
  const start = report.intake.originalText.indexOf('ثم');
  const text = report.intake.originalText.slice(start);
  report.intake.segments.push({
    id: 'author',
    originalText: text,
    startOffset: start,
    endOffset: report.intake.originalText.length,
    codePointStart: start,
    codePointEnd: report.intake.originalText.length,
    role: 'author_text',
    roleStatus: 'unresolved',
    sourceKeys: [],
    method: 'fixture',
    roleProposal: null,
    conflict: false,
  });
  report.semanticAssessment = {
    schemaVersion: 1,
    status: 'completed',
    provisional: true,
    scholarlyApproval: false,
    errorCode: null,
    claims: [
      {
        id: 'claim-' + 'a'.repeat(24),
        segmentId: 'author',
        originalText: text,
        startOffset: start,
        endOffset: report.intake.originalText.length,
        provisional: true,
        evidenceKeys: ['source'],
      },
    ],
    assessments: [
      {
        claimId: 'claim-' + 'a'.repeat(24),
        status: 'supported',
        conditions: [],
        negations: [],
        exceptions: [],
        scope: [],
        explanation: 'تفسير تجريبي لا يمثل حكما شرعيا.',
        citations: [{ evidenceKey: 'source', excerpt: 'مقتطف تجريبي' }],
      },
    ],
    trace: {
      pipelineVersion: SEMANTIC_PIPELINE_VERSION,
      promptVersion: SEMANTIC_PROMPT_VERSION,
      inputSha256: report.inputSha256,
      evidenceSha256: 'd'.repeat(64),
      extractionInputSha256: null,
      assessmentInputSha256: null,
      requests: [],
    },
    limitations: [],
  };
  return report;
}

it('accepts only an exact authored claim with a citation from its selected source family', () => {
  expect(FoundationReportSchema.safeParse(fixture()).success).toBe(true);
});
it.each(['v1.1', 'v1.2', 'v1.3'] as const)(
  'keeps immutable %s semantic reports readable after a producer upgrade',
  (version) => {
    const report = fixture();
    report.semanticAssessment!.trace.pipelineVersion = `provisional-semantic-${version}`;
    report.semanticAssessment!.trace.promptVersion = `evidence-support-${version}`;
    expect(FoundationReportSchema.safeParse(report).success).toBe(true);
  },
);
it.each([
  'unrelated_family',
  'changed_excerpt',
  'quotation_claim',
  'stale_revision',
  'empty_support',
  'duplicate_verdict',
] as const)('rejects semantic report %s', (kind) => {
  const report = fixture();
  const semantic = report.semanticAssessment!;
  if (kind === 'unrelated_family') {
    report.intake.evidence.push({ ...report.intake.evidence[0]!, snapshotKey: 'unrelated' });
    semantic.assessments[0]!.citations[0]!.evidenceKey = 'unrelated';
  }
  if (kind === 'changed_excerpt') semantic.assessments[0]!.citations[0]!.excerpt = 'عبارة مخترعة';
  if (kind === 'quotation_claim') semantic.claims[0]!.segmentId = 'quote';
  if (kind === 'stale_revision') semantic.trace.inputSha256 = 'e'.repeat(64);
  if (kind === 'empty_support') semantic.assessments[0]!.citations = [];
  if (kind === 'duplicate_verdict') semantic.assessments.push({ ...semantic.assessments[0]! });
  expect(FoundationReportSchema.safeParse(report).success).toBe(false);
});
