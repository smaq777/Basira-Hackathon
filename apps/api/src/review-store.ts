import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { databaseTls, OwnershipError } from './database.js';

/** A lease is an application secret. Never return its token to the browser or logs. */
export type ReviewLease = {
  reviewId: string;
  revisionId: string;
  attempt: number;
  token: string;
  inputSha256: string;
  evidenceStateSha256: string | null;
  text: string;
  deadlineAt: string;
  leaseUntil: string;
  corpusVersion: string;
};

export type StoredEvidence = {
  id: string;
  sourceId: string;
  sourceVersion: string;
  reference: string;
  originalText: string;
  originalSha256: string;
  role: string;
  work: string;
  author: string | null;
  edition: string | null;
  sourceUrl: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'revoked';
  researchOnly: boolean;
  parentEvidenceId: string | null;
  retrievedAt: string;
  delivery: 'live' | 'snapshot';
  retrievalModes: Array<'exact' | 'lexical' | 'semantic'>;
  provenance: Record<string, unknown>;
  contextBefore?: SourceEvidence['contextBefore'];
  contextAfter?: SourceEvidence['contextAfter'];
  footnotes?: SourceEvidence['footnotes'];
  relations?: SourceEvidence['relations'];
};

export type StoredFinding = {
  id: string;
  startOffset: number;
  endOffset: number;
  claimType:
    'quotation' | 'attribution' | 'interpretation' | 'generalization' | 'exclusivity' | 'other';
  claimText: string;
  editorConfirmed: boolean;
  quoteStatus: 'exact' | 'normalized' | 'mismatch' | 'not_applicable' | 'unresolved';
  supportStatus:
    | 'supported'
    | 'overgeneralization'
    | 'missing_qualification'
    | 'unsupported_exclusivity'
    | 'insufficient_evidence'
    | 'out_of_scope'
    | 'not_assessed';
  explanation: string;
  evidenceIds: string[];
};

export type DurableReviewReport = {
  reviewId: string;
  revisionId: string;
  inputSha256: string;
  evidenceStateSha256: string;
  attempt: number;
  status: 'completed' | 'partial' | 'needs_review';
  evidence: StoredEvidence[];
  findings: StoredFinding[];
  /** Renderable report, already schema-validated by the application. No hidden reasoning. */
  result: Record<string, unknown>;
};

export interface ReviewStore {
  acquire(reviewId?: string | null, leaseSeconds?: number): Promise<ReviewLease | null>;
  heartbeat(lease: ReviewLease, leaseSeconds?: number): Promise<boolean>;
  bindEvidence(lease: ReviewLease, evidenceStateSha256: string): Promise<boolean>;
  complete(lease: ReviewLease, report: DurableReviewReport): Promise<boolean>;
  fail(
    lease: ReviewLease,
    code:
      | 'adapter_unavailable'
      | 'invalid_evidence'
      | 'invalid_report'
      | 'deadline_exceeded'
      | 'internal_error',
  ): Promise<boolean>;
  ownedReport(
    sessionId: string,
    secret: string,
    reviewId: string,
  ): Promise<Record<string, unknown> | null>;
  close(): Promise<void>;
}

export function validateStoredReport(lease: ReviewLease, report: DurableReviewReport): void {
  if (createHash('sha256').update(lease.text, 'utf8').digest('hex') !== lease.inputSha256)
    throw new Error('CORRUPT_REVISION_HASH');
  if (
    report.reviewId !== lease.reviewId ||
    report.revisionId !== lease.revisionId ||
    report.inputSha256 !== lease.inputSha256 ||
    report.attempt !== lease.attempt ||
    report.evidenceStateSha256 !== lease.evidenceStateSha256
  )
    throw new Error('STALE_REVIEW_BINDING');
  if (
    !/^[0-9a-f]{64}$/u.test(report.evidenceStateSha256) ||
    report.evidence.length > 80 ||
    report.findings.length > 80
  )
    throw new Error('INVALID_REPORT_BOUNDS');
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  if (evidence.size !== report.evidence.length) throw new Error('DUPLICATE_EVIDENCE');
  for (const item of evidence.values()) {
    SourceEvidenceSchema.parse({
      snapshotKey: item.id,
      sourceId: item.sourceId,
      sourceVersion: item.sourceVersion,
      reference: item.reference,
      originalText: item.originalText,
      originalSha256: item.originalSha256,
      sourceRole: item.role,
      work: item.work,
      author: item.author,
      edition: item.edition,
      sourceUrl: item.sourceUrl,
      approvalStatus: item.approvalStatus,
      researchOnly: item.researchOnly,
      parentSnapshotKey: item.parentEvidenceId,
      delivery: item.delivery,
      retrievalModes: item.retrievalModes,
      provenance: item.provenance,
      ...(item.contextBefore !== undefined ? { contextBefore: item.contextBefore } : {}),
      ...(item.contextAfter !== undefined ? { contextAfter: item.contextAfter } : {}),
      ...(item.footnotes !== undefined ? { footnotes: item.footnotes } : {}),
      ...(item.relations !== undefined ? { relations: item.relations } : {}),
    });
    if (!Number.isFinite(Date.parse(item.retrievedAt))) throw new Error('INVALID_RETRIEVED_AT');
    if (!item.researchOnly && item.approvalStatus !== 'approved')
      throw new Error('UNAPPROVED_PRODUCTION_EVIDENCE');
    if (
      createHash('sha256').update(item.originalText, 'utf8').digest('hex') !== item.originalSha256
    )
      throw new Error('EVIDENCE_HASH_MISMATCH');
    if (
      item.parentEvidenceId &&
      (!evidence.has(item.parentEvidenceId) || item.parentEvidenceId === item.id)
    )
      throw new Error('INVALID_EVIDENCE_PARENT');
    if (item.role === 'tafsir_footnote') {
      const parent = item.parentEvidenceId ? evidence.get(item.parentEvidenceId) : undefined;
      if (
        !parent ||
        parent.role !== 'tafsir_commentary' ||
        parent.sourceId !== item.sourceId ||
        parent.work !== item.work ||
        parent.sourceVersion !== item.sourceVersion ||
        parent.reference !== item.reference
      )
        throw new Error('FOOTNOTE_SOURCE_MISMATCH');
    } else if (item.role === 'tafsir_commentary' && item.parentEvidenceId) {
      const parent = evidence.get(item.parentEvidenceId);
      if (
        !parent ||
        parent.role !== 'quran_text' ||
        parent.parentEvidenceId ||
        parent.reference !== item.reference
      )
        throw new Error('COMMENTARY_ANCHOR_MISMATCH');
    } else if (item.parentEvidenceId) throw new Error('UNEXPECTED_EVIDENCE_PARENT');
  }
  if (
    report.result.revisionId !== lease.revisionId ||
    report.result.inputSha256 !== lease.inputSha256 ||
    report.result.reviewId !== lease.reviewId ||
    report.result.status !== report.status ||
    report.result.evidenceStateSha256 !== lease.evidenceStateSha256
  )
    throw new Error('RENDERED_REPORT_BINDING_MISMATCH');
  const intake = report.result.intake as Record<string, unknown> | undefined;
  if (
    !intake ||
    intake.originalText !== lease.text ||
    intake.revisionId !== lease.revisionId ||
    intake.revisionSha256 !== lease.inputSha256 ||
    intake.corpusVersion !== lease.corpusVersion ||
    intake.offsetUnit !== 'utf16_code_unit' ||
    !Array.isArray(intake.segments) ||
    intake.segments.length > 80 ||
    !Array.isArray(intake.evidence) ||
    intake.evidence.length !== evidence.size
  )
    throw new Error('RENDERED_INTAKE_BINDING_MISMATCH');
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
      return (
        '{' +
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => JSON.stringify(key) + ':' + canonical(nested))
          .join(',') +
        '}'
      );
    return JSON.stringify(value);
  };
  const renderedEvidence = new Set<string>();
  const sourceKey = (stored: StoredEvidence): string =>
    typeof stored.provenance.snapshotKey === 'string' ? stored.provenance.snapshotKey : stored.id;
  const snapshots = new Map(report.evidence.map((stored) => [sourceKey(stored), stored]));
  if (snapshots.size !== evidence.size) throw new Error('DUPLICATE_EVIDENCE_SNAPSHOT');
  for (const raw of intake.evidence) {
    const item = SourceEvidenceSchema.parse(raw);
    const stored = snapshots.get(item.snapshotKey);
    if (!stored || renderedEvidence.has(item.snapshotKey))
      throw new Error('RENDERED_EVIDENCE_MISMATCH');
    const { id, role, parentEvidenceId, retrievedAt: _retrievedAt, ...fields } = stored;
    const provenance = { ...fields.provenance };
    if (typeof provenance.snapshotKey === 'string') delete provenance.snapshotKey;
    if (
      canonical(item) !==
      canonical({
        ...fields,
        provenance,
        snapshotKey: sourceKey(stored),
        sourceRole: role,
        parentSnapshotKey: parentEvidenceId ? sourceKey(evidence.get(parentEvidenceId)!) : null,
      })
    )
      throw new Error('RENDERED_EVIDENCE_MISMATCH');
    renderedEvidence.add(item.snapshotKey);
  }
  const segmentIds = new Set<string>();
  for (const segment of intake.segments as Array<Record<string, unknown>>) {
    const { id, startOffset, endOffset, originalText, codePointStart, codePointEnd, sourceKeys } =
      segment;
    if (
      typeof id !== 'string' ||
      segmentIds.has(id) ||
      typeof startOffset !== 'number' ||
      typeof endOffset !== 'number' ||
      !Number.isInteger(startOffset) ||
      !Number.isInteger(endOffset) ||
      startOffset < 0 ||
      endOffset <= startOffset ||
      endOffset > lease.text.length ||
      lease.text.slice(startOffset, endOffset) !== originalText ||
      [...lease.text.slice(0, startOffset)].length !== codePointStart ||
      [...lease.text.slice(0, endOffset)].length !== codePointEnd ||
      !Array.isArray(sourceKeys) ||
      sourceKeys.some((key) => !snapshots.has(String(key)))
    )
      throw new Error('RENDERED_SEGMENT_MISMATCH');
    for (const offset of [startOffset, endOffset]) {
      const next = lease.text.charCodeAt(offset),
        prior = lease.text.charCodeAt(offset - 1);
      if (next >= 0xdc00 && next <= 0xdfff && prior >= 0xd800 && prior <= 0xdbff)
        throw new Error('RENDERED_SEGMENT_MISMATCH');
    }
    segmentIds.add(id);
  }
  for (const finding of report.findings) {
    if (
      !Number.isInteger(finding.startOffset) ||
      !Number.isInteger(finding.endOffset) ||
      finding.startOffset < 0 ||
      finding.endOffset <= finding.startOffset ||
      lease.text.slice(finding.startOffset, finding.endOffset) !== finding.claimText
    )
      throw new Error('CLAIM_SPAN_MISMATCH');
    for (const offset of [finding.startOffset, finding.endOffset]) {
      const next = lease.text.charCodeAt(offset);
      const prior = lease.text.charCodeAt(offset - 1);
      if (next >= 0xdc00 && next <= 0xdfff && prior >= 0xd800 && prior <= 0xdbff)
        throw new Error('INVALID_UTF16_BOUNDARY');
    }
    if (!finding.editorConfirmed && finding.supportStatus !== 'not_assessed')
      throw new Error('UNCONFIRMED_SUPPORT_ASSESSMENT');
    if (
      new Set(finding.evidenceIds).size !== finding.evidenceIds.length ||
      finding.evidenceIds.some((id) => !evidence.has(id))
    )
      throw new Error('UNKNOWN_CITATION');
    if (
      ((finding.quoteStatus !== 'unresolved' && finding.quoteStatus !== 'not_applicable') ||
        !['not_assessed', 'insufficient_evidence', 'out_of_scope'].includes(
          finding.supportStatus,
        )) &&
      finding.evidenceIds.length === 0
    )
      throw new Error('EVIDENCE_REQUIRED');
  }
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > 500_000)
    throw new Error('REPORT_TOO_LARGE');
}

export function createReviewStore(connectionString: string): ReviewStore {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: databaseTls(),
    max: 2,
    application_name: 'basirah-review-store',
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    idle_in_transaction_session_timeout: 10_000,
  });
  return {
    async acquire(reviewId = null, leaseSeconds = 15) {
      const response = await pool.query<{ lease: ReviewLease | null }>(
        'select basirah_api.acquire_review($1::uuid,$2::integer) as lease',
        [reviewId, leaseSeconds],
      );
      return response.rows[0]?.lease ?? null;
    },
    async heartbeat(lease, leaseSeconds = 15) {
      const response = await pool.query<{ ok: boolean }>(
        'select basirah_api.heartbeat_review($1::uuid,$2,$3,$4) as ok',
        [lease.reviewId, lease.attempt, lease.token, leaseSeconds],
      );
      return response.rows[0]?.ok ?? false;
    },
    async bindEvidence(lease, evidenceStateSha256) {
      if (!/^[0-9a-f]{64}$/u.test(evidenceStateSha256)) throw new Error('INVALID_EVIDENCE_HASH');
      const response = await pool.query<{ ok: boolean }>(
        'select basirah_api.bind_review_evidence($1::uuid,$2,$3,$4,$5) as ok',
        [
          lease.reviewId,
          lease.attempt,
          lease.token,
          lease.evidenceStateSha256,
          evidenceStateSha256,
        ],
      );
      if (response.rows[0]?.ok) {
        lease.evidenceStateSha256 = evidenceStateSha256;
        return true;
      }
      return false;
    },
    async complete(lease, report) {
      validateStoredReport(lease, report);
      const response = await pool.query<{ ok: boolean }>(
        'select basirah_api.complete_review($1::uuid,$2,$3,$4::jsonb) as ok',
        [lease.reviewId, lease.attempt, lease.token, JSON.stringify(report)],
      );
      return response.rows[0]?.ok ?? false;
    },
    async fail(lease, code) {
      const response = await pool.query<{ ok: boolean }>(
        'select basirah_api.fail_review($1::uuid,$2,$3,$4) as ok',
        [lease.reviewId, lease.attempt, lease.token, code],
      );
      return response.rows[0]?.ok ?? false;
    },
    async ownedReport(sessionId, secret, reviewId) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const auth = await client.query<{ id: string | null }>(
          'select basirah_api.authenticate_guest($1::uuid,$2) as id',
          [sessionId, secret],
        );
        if (!auth.rows[0]?.id) throw new OwnershipError();
        const response = await client.query<{ result: Record<string, unknown> }>(
          `select rp.result as result
           from basirah.review_report rp join basirah.review_run rr on rr.id=rp.run_id
           join basirah.document_revision dr on dr.id=rr.revision_id
           where rr.public_id=$1::uuid`,
          [reviewId],
        );
        await client.query('commit');
        return response.rows[0]?.result ?? null;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
