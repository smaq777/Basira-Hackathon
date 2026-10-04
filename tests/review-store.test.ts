import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  validateStoredReport,
  type DurableReviewReport,
  type ReviewLease,
} from '../apps/api/src/review-store.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture(): { lease: ReviewLease; report: DurableReviewReport } {
  const text = '😀 قال تعالى';
  const lease: ReviewLease = {
    reviewId: 'run',
    revisionId: 'revision',
    attempt: 1,
    token: 'a'.repeat(64),
    inputSha256: hash(text),
    evidenceStateSha256: 'b'.repeat(64),
    text,
    deadlineAt: new Date().toISOString(),
    leaseUntil: new Date().toISOString(),
    corpusVersion: 'research',
  };
  const report: DurableReviewReport = {
    reviewId: 'run',
    revisionId: 'revision',
    inputSha256: hash(text),
    evidenceStateSha256: 'b'.repeat(64),
    attempt: 1,
    status: 'needs_review',
    evidence: [
      {
        id: 'verse',
        sourceId: 'tanzil',
        sourceVersion: 'v1',
        reference: '2:256',
        originalText: 'لَا إِكْرَاهَ',
        originalSha256: hash('لَا إِكْرَاهَ'),
        role: 'quran_text',
        work: 'Quran',
        author: null,
        edition: null,
        sourceUrl: null,
        approvalStatus: 'pending',
        researchOnly: true,
        parentEvidenceId: null,
        retrievedAt: new Date().toISOString(),
        delivery: 'snapshot',
        retrievalModes: ['exact'],
        provenance: {},
      },
    ],
    findings: [
      {
        id: 'claim',
        startOffset: 3,
        endOffset: text.length,
        claimText: text.slice(3),
        claimType: 'quotation',
        editorConfirmed: false,
        quoteStatus: 'unresolved',
        supportStatus: 'not_assessed',
        explanation: 'Review required',
        evidenceIds: ['verse'],
      },
    ],
    result: {},
  };
  report.result = {
    reviewId: lease.reviewId,
    revisionId: lease.revisionId,
    inputSha256: lease.inputSha256,
    evidenceStateSha256: lease.evidenceStateSha256,
    status: report.status,
    intake: {
      originalText: text,
      revisionId: lease.revisionId,
      revisionSha256: lease.inputSha256,
      corpusVersion: lease.corpusVersion,
      offsetUnit: 'utf16_code_unit',
      segments: [
        {
          id: 'segment',
          startOffset: 3,
          endOffset: text.length,
          originalText: text.slice(3),
          codePointStart: 2,
          codePointEnd: [...text].length,
          sourceKeys: ['verse'],
        },
      ],
      evidence: report.evidence.map(
        ({ id, role, parentEvidenceId, retrievedAt: _retrievedAt, ...fields }) => ({
          ...fields,
          snapshotKey: id,
          sourceRole: role,
          parentSnapshotKey: parentEvidenceId,
        }),
      ),
    },
  };
  return { lease, report };
}
describe('durable report validation', () => {
  it('binds public snapshot keys independently from worker UUID evidence identities', () => {
    const { lease, report } = fixture();
    report.evidence[0]!.id = 'worker-uuid';
    report.evidence[0]!.provenance = { ...report.evidence[0]!.provenance, snapshotKey: 'verse' };
    report.findings[0]!.evidenceIds = ['worker-uuid'];
    expect(() => validateStoredReport(lease, report)).not.toThrow();
    report.evidence[0]!.provenance.snapshotKey = 'another-snapshot';
    expect(() => validateStoredReport(lease, report)).toThrow('RENDERED_EVIDENCE_MISMATCH');
  });
  it('preserves research originals and provisional claims', () => {
    const { lease, report } = fixture();
    expect(() => validateStoredReport(lease, report)).not.toThrow();
    expect(report.findings[0]?.editorConfirmed).toBe(false);
  });
  it.each(['reviewId', 'revisionId', 'inputSha256', 'evidenceStateSha256', 'attempt'] as const)(
    'rejects a stale %s',
    (field) => {
      const { lease, report } = fixture();
      if (field === 'attempt') report.attempt = 2;
      else report[field] = 'changed';
      expect(() => validateStoredReport(lease, report)).toThrow('STALE_REVIEW_BINDING');
    },
  );
  it('rejects altered originals', () => {
    const { lease, report } = fixture();
    report.evidence[0]!.originalText += ' altered';
    expect(() => validateStoredReport(lease, report)).toThrow('EVIDENCE_HASH_MISMATCH');
  });
  it('rejects unknown footnote parent', () => {
    const { lease, report } = fixture();
    report.evidence[0]!.parentEvidenceId = 'missing';
    expect(() => validateStoredReport(lease, report)).toThrow('INVALID_EVIDENCE_PARENT');
  });
  it('rejects duplicate snapshot identity', () => {
    const { lease, report } = fixture();
    report.evidence.push({ ...report.evidence[0]! });
    expect(() => validateStoredReport(lease, report)).toThrow('DUPLICATE_EVIDENCE');
  });
  it('rejects support conclusions for unconfirmed candidates', () => {
    const { lease, report } = fixture();
    report.findings[0]!.supportStatus = 'supported';
    expect(() => validateStoredReport(lease, report)).toThrow('UNCONFIRMED_SUPPORT_ASSESSMENT');
  });
  it('rejects unknown citations', () => {
    const { lease, report } = fixture();
    report.findings[0]!.evidenceIds = ['unknown'];
    expect(() => validateStoredReport(lease, report)).toThrow('UNKNOWN_CITATION');
  });
  it('rejects surrogate split even when substring text is supplied', () => {
    const { lease, report } = fixture();
    report.findings[0]!.startOffset = 1;
    report.findings[0]!.claimText = lease.text.slice(1);
    expect(() => validateStoredReport(lease, report)).toThrow('INVALID_UTF16_BOUNDARY');
  });
  it('rejects unapproved source represented as production evidence', () => {
    const { lease, report } = fixture();
    report.evidence[0]!.researchOnly = false;
    expect(() => validateStoredReport(lease, report)).toThrow('UNAPPROVED_PRODUCTION_EVIDENCE');
  });
  it('rejects rendered report from another case', () => {
    const { lease, report } = fixture();
    report.result.revisionId = 'another-case';
    expect(() => validateStoredReport(lease, report)).toThrow('RENDERED_REPORT_BINDING_MISMATCH');
  });
  it.each(['text', 'evidence', 'segment', 'missing_id', 'status'] as const)(
    'rejects altered rendered %s',
    (kind) => {
      const { lease, report } = fixture();
      const intake = report.result.intake as {
        originalText: string;
        evidence: Array<{ originalText: string }>;
        segments: Array<{ startOffset: number }>;
      };
      if (kind === 'text') intake.originalText += ' altered';
      if (kind === 'evidence') intake.evidence[0]!.originalText += ' altered';
      if (kind === 'segment') intake.segments[0]!.startOffset = 4;
      if (kind === 'missing_id') delete report.result.reviewId;
      if (kind === 'status') report.result.status = 'completed';
      expect(() => validateStoredReport(lease, report)).toThrow(/RENDERED_/u);
    },
  );
});
