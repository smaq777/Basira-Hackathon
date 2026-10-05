import type { FoundationReport } from '../../../packages/contracts/src/foundation.js';

// Synthetic UI contract fixture; not religious evidence or an empirical evaluation.
export const REVIEW_ID = '11111111-1111-4111-8111-111111111111';
export const REVISION_ID = '22222222-2222-4222-8222-222222222222';
export const ORIGINAL_TEXT = '  يقول الكاتب: «مقتطف تجريبي» ثم يضيف كلامًا يحتاج إلى مراجعة.  ';
export const SYNTHETIC_QUOTE = 'مقتطف تجريبي';
const start = ORIGINAL_TEXT.indexOf(SYNTHETIC_QUOTE);

export function foundationReportFixture(): FoundationReport {
  return {
    schemaVersion: 1,
    reviewId: REVIEW_ID,
    revisionId: REVISION_ID,
    inputSha256: 'a'.repeat(64),
    evidenceStateSha256: 'b'.repeat(64),
    pipelineVersion: 'synthetic-ui-v1',
    generatedAt: '2026-10-04T00:00:00.000Z',
    status: 'partial',
    intake: {
      schemaVersion: 1,
      pipelineVersion: 'synthetic-ui-v1',
      revisionId: REVISION_ID,
      revisionSha256: 'a'.repeat(64),
      corpusVersion: 'synthetic-ui-only',
      originalText: ORIGINAL_TEXT,
      offsetUnit: 'utf16_code_unit',
      researchOnly: true,
      segments: [
        {
          id: 'quote',
          startOffset: start,
          endOffset: start + SYNTHETIC_QUOTE.length,
          codePointStart: start,
          codePointEnd: start + SYNTHETIC_QUOTE.length,
          originalText: SYNTHETIC_QUOTE,
          role: 'matn',
          roleStatus: 'source_matched',
          method: 'synthetic',
          sourceKeys: ['source'],
          roleProposal: null,
          conflict: false,
        },
      ],
      evidence: [
        {
          snapshotKey: 'source',
          sourceId: 'synthetic-source',
          sourceVersion: 'fixture-v1',
          sourceRole: 'hadith_matn',
          reference: 'مرجع اختبار برمجي',
          originalText: `بداية ${SYNTHETIC_QUOTE} نهاية`,
          originalSha256: 'c'.repeat(64),
          work: 'كتاب اصطناعي للاختبار',
          author: 'كاتب اصطناعي',
          edition: 'نسخة اختبار',
          sourceUrl: 'https://example.com/synthetic-source',
          approvalStatus: 'pending',
          researchOnly: true,
          parentSnapshotKey: null,
          delivery: 'snapshot',
          retrievalModes: ['exact'],
          provenance: { fixture: 'synthetic; not a religious source' },
        },
      ],
      quotationFindings: [
        {
          segmentId: 'quote',
          evidenceKey: 'source',
          status: 'exact',
          reason: 'تطابق المقتطف البرمجي حرفيًا.',
          matchedStart: 'بداية '.length,
          matchedEnd: 'بداية '.length + SYNTHETIC_QUOTE.length,
        },
      ],
      contextCoverage: [],
      warnings: ['السياق الإضافي غير متاح في هذا الاختبار.'],
    },
    themes: {
      detectorVersion: 'authored-lexical-v1.1',
      status: 'unknown',
      calibration: 'uncalibrated',
      primaryTheme: null,
      authoredThemes: [],
      citedContextThemes: [],
      limitations: [],
    },
    improvementCards: [],
    interpretation: {
      status: 'not_assessed',
      explanation: 'لم يُنفذ تقييم دلالي في هذه المراجعة.',
      scholarlyApproval: false,
    },
    limitations: ['مصدر اصطناعي لا يستخدم لإصدار حكم علمي.'],
  };
}

export function ownedReviewFixture(status = 'partial') {
  return {
    reviewId: REVIEW_ID,
    revisionId: REVISION_ID,
    status,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
