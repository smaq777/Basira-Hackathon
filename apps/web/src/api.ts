import {
  FoundationReportSchema,
  type FoundationReport,
} from '../../../packages/contracts/src/foundation.js';

export type DraftAnalysisReceipt = {
  documentId: string;
  revisionId: string;
  candidateCount: number;
  warnings: string[];
};

export type PreflightContentType =
  | 'quran'
  | 'hadith_matn'
  | 'isnad'
  | 'claimed_source'
  | 'scholarly_statement'
  | 'interpretation'
  | 'general_claim'
  | 'unknown';

export type PreflightAnnotation = {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  contentType: PreflightContentType;
  contentTypeLabel: string;
  classificationBasis: 'cue' | 'fixture_match' | 'pattern' | 'unknown';
};

export type PreflightFinding = {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  contentType: PreflightContentType;
  contentTypeLabel: string;
  classificationBasis: 'cue' | 'fixture_match' | 'unknown';
  issueCode:
    | 'quotation_mismatch'
    | 'attribution_mismatch'
    | 'attribution_missing'
    | 'missing_qualification'
    | 'overgeneralization'
    | 'unsupported_exclusivity'
    | 'insufficient_evidence'
    | null;
  severity: 'info' | 'neutral' | 'warning';
  message: string;
  evidence: {
    reference: string;
    excerpt: string;
    retrievalModes: Array<'exact' | 'lexical' | 'semantic'>;
  } | null;
};

export type PreflightResponse = {
  mode: 'local_demo';
  verification: false;
  corpusVersion: 'software-fixture-v1';
  inputHash: string;
  offsetUnit: 'utf16_code_unit';
  annotations: PreflightAnnotation[];
  findings: PreflightFinding[];
  warnings: string[];
};

type ApiErrorBody = { code?: string };

export class BasirahApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    if (!response.ok) throw new BasirahApiError(body.code ?? 'REQUEST_FAILED', response.status);
    return body;
  } catch (error) {
    if (error instanceof BasirahApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new BasirahApiError('REQUEST_TIMEOUT', 0);
    throw new BasirahApiError('NETWORK_ERROR', 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function createSession(): Promise<void> {
  await requestJson('/api/v1/sessions', { method: 'POST', body: '{}' });
}

async function createDocument(text: string): Promise<{ documentId: string; revisionId: string }> {
  const body = await requestJson('/api/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  if (
    typeof body !== 'object' ||
    body === null ||
    !('documentId' in body) ||
    !('revisionId' in body) ||
    typeof body.documentId !== 'string' ||
    typeof body.revisionId !== 'string'
  )
    throw new BasirahApiError('INVALID_RESPONSE', 0);
  return { documentId: body.documentId, revisionId: body.revisionId };
}

export async function persistDraftForAnalysis(text: string): Promise<DraftAnalysisReceipt> {
  let document: { documentId: string; revisionId: string };
  try {
    document = await createDocument(text);
  } catch (error) {
    if (!(error instanceof BasirahApiError) || error.status !== 401) throw error;
    await createSession();
    document = await createDocument(text);
  }

  const body = await requestJson(`/api/v1/revisions/${document.revisionId}/extractions`, {
    method: 'POST',
    body: '{}',
  });
  if (
    typeof body !== 'object' ||
    body === null ||
    !('extraction' in body) ||
    typeof body.extraction !== 'object' ||
    body.extraction === null
  )
    throw new BasirahApiError('INVALID_RESPONSE', 0);
  const extraction = body.extraction as { candidates?: unknown[]; warnings?: unknown[] };
  return {
    ...document,
    candidateCount: Array.isArray(extraction.candidates) ? extraction.candidates.length : 0,
    warnings: Array.isArray(extraction.warnings)
      ? extraction.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

export function analysisErrorMessage(error: unknown): string {
  if (error instanceof BasirahApiError) {
    if (error.status === 401) return 'انتهت جلسة المسودة. عد إلى النص وابدأ مراجعة جديدة.';
    if (error.status === 404 && error.code === 'REVIEW_NOT_FOUND')
      return 'لم نجد هذه المراجعة في جلستك الحالية. عد إلى النص وابدأ مراجعة جديدة.';
    if (error.code === 'FOUNDATION_UNAVAILABLE')
      return 'المراجعة المتصلة غير مفعّلة حاليًا. بقي نصك كما هو؛ حاول لاحقًا.';
    if (error.code === 'REVIEW_CANCELLED') return 'أُلغيت هذه المراجعة. يمكنك العودة إلى النص.';
    if (error.code === 'REVIEW_FAILED' || error.code === 'REVIEW_INTERRUPTED')
      return 'توقفت المراجعة قبل اكتمال التقرير. عد إلى النص وابدأ مراجعة جديدة.';
    if (error.code === 'INVALID_RESPONSE' || error.code === 'REPORT_BINDING_MISMATCH')
      return 'تعذر عرض التقرير لأن بياناته لم تجتز التحقق. لم نعرض نتيجة بديلة.';
    if (error.code === 'REQUEST_TIMEOUT')
      return 'استغرق الاتصال وقتًا أطول من المتوقع. حاول مرة أخرى.';
    if (error.code === 'NETWORK_ERROR' || error.status === 404)
      return 'تعذر الاتصال بخدمة التحليل الآن. تحقق من الاتصال ثم أعد المحاولة.';
    if (error.status >= 500) return 'خدمة التحليل غير متاحة مؤقتًا. لم نفقد نصك.';
  }
  return 'تعذر بدء التحليل. بقي نصك كما هو ويمكنك إعادة المحاولة.';
}

export type OwnedReview = {
  reviewId: string;
  revisionId: string;
  status:
    | 'queued'
    | 'retrieving'
    | 'checking'
    | 'assessing'
    | 'validating'
    | 'completed'
    | 'partial'
    | 'needs_review'
    | 'failed'
    | 'cancelled'
    | 'interrupted';
  deadlineAt: string;
};

const reviewStatuses = [
  'queued',
  'retrieving',
  'checking',
  'assessing',
  'validating',
  'completed',
  'partial',
  'needs_review',
  'failed',
  'cancelled',
  'interrupted',
];

function ownedReview(body: unknown): OwnedReview {
  if (typeof body !== 'object' || body === null) throw new BasirahApiError('INVALID_RESPONSE', 0);
  const run = body as Partial<OwnedReview>;
  if (
    typeof run.reviewId !== 'string' ||
    typeof run.revisionId !== 'string' ||
    !reviewStatuses.includes(run.status ?? '') ||
    typeof run.deadlineAt !== 'string' ||
    !Number.isFinite(Date.parse(run.deadlineAt))
  )
    throw new BasirahApiError('INVALID_RESPONSE', 0);
  return run as OwnedReview;
}

export async function requireFoundationReview(): Promise<void> {
  const body = await requestJson('/api/v1/capabilities', { method: 'GET' });
  if (
    typeof body !== 'object' ||
    body === null ||
    !('foundationReview' in body) ||
    body.foundationReview !== true
  )
    throw new BasirahApiError('FOUNDATION_UNAVAILABLE', 0);
}

export async function createOwnedReview(
  revisionId: string,
  idempotencyKey: string,
): Promise<OwnedReview> {
  const run = ownedReview(
    await requestJson('/api/v1/reviews', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ revisionId }),
    }),
  );
  if (run.revisionId !== revisionId) throw new BasirahApiError('REPORT_BINDING_MISMATCH', 0);
  return run;
}

export async function getOwnedReview(reviewId: string): Promise<OwnedReview> {
  const run = ownedReview(
    await requestJson(`/api/v1/reviews/${encodeURIComponent(reviewId)}`, { method: 'GET' }),
  );
  if (run.reviewId !== reviewId) throw new BasirahApiError('REPORT_BINDING_MISMATCH', 0);
  return run;
}

export async function cancelOwnedReview(reviewId: string): Promise<OwnedReview> {
  const run = ownedReview(
    await requestJson(`/api/v1/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }),
  );
  if (run.reviewId !== reviewId) throw new BasirahApiError('REPORT_BINDING_MISMATCH', 0);
  return run;
}

export async function getFoundationReport(
  reviewId: string,
  expected?: { revisionId?: string; originalText?: string },
): Promise<FoundationReport | null> {
  const body = await requestJson(`/api/v1/reviews/${encodeURIComponent(reviewId)}/report`, {
    method: 'GET',
  });
  if (typeof body !== 'object' || body === null || !('report' in body))
    throw new BasirahApiError('INVALID_RESPONSE', 0);
  if (body.report === null) return null;
  const parsed = FoundationReportSchema.safeParse(body.report);
  if (!parsed.success) throw new BasirahApiError('INVALID_RESPONSE', 0);
  const report = parsed.data;
  if (
    report.reviewId !== reviewId ||
    report.revisionId !== report.intake.revisionId ||
    report.inputSha256 !== report.intake.revisionSha256 ||
    (expected?.revisionId !== undefined && report.revisionId !== expected.revisionId) ||
    (expected?.originalText !== undefined &&
      report.intake.originalText !== expected.originalText) ||
    report.intake.segments.some(
      (segment) =>
        report.intake.originalText.slice(segment.startOffset, segment.endOffset) !==
        segment.originalText,
    )
  )
    throw new BasirahApiError('REPORT_BINDING_MISMATCH', 0);
  const segmentIds = new Set(report.intake.segments.map((segment) => segment.id));
  const evidenceKeys = new Set(report.intake.evidence.map((evidence) => evidence.snapshotKey));
  if (
    report.intake.quotationFindings.some(
      (finding) =>
        !segmentIds.has(finding.segmentId) ||
        (finding.evidenceKey !== null && !evidenceKeys.has(finding.evidenceKey)),
    ) ||
    report.intake.segments.some((segment) =>
      segment.sourceKeys.some((key) => !evidenceKeys.has(key)),
    )
  )
    throw new BasirahApiError('REPORT_BINDING_MISMATCH', 0);
  return report;
}

export async function awaitFoundationReport(
  initialRun: OwnedReview,
  signal: AbortSignal,
  onStatus: (run: OwnedReview) => void,
  originalText?: string,
): Promise<FoundationReport> {
  let run = initialRun;
  const deadline = Math.min(Date.parse(run.deadlineAt) + 5000, Date.now() + 305_000);
  while (!signal.aborted) {
    onStatus(run);
    if (['failed', 'cancelled', 'interrupted'].includes(run.status))
      throw new BasirahApiError(`REVIEW_${run.status.toUpperCase()}`, 0);
    if (['completed', 'partial', 'needs_review'].includes(run.status)) {
      const report = await getFoundationReport(run.reviewId, {
        revisionId: run.revisionId,
        originalText,
      });
      if (signal.aborted) break;
      if (report !== null) return report;
    }
    if (!Number.isFinite(deadline) || Date.now() > deadline)
      throw new BasirahApiError('REQUEST_TIMEOUT', 0);
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = window.setTimeout(finish, 1000);
      signal.addEventListener('abort', finish, { once: true });
    });
    if (signal.aborted) break;
    const next = await getOwnedReview(run.reviewId);
    if (next.revisionId !== initialRun.revisionId)
      throw new BasirahApiError('REPORT_BINDING_MISMATCH', 0);
    run = next;
  }
  throw new DOMException('Review view closed', 'AbortError');
}

function validPreflightFinding(value: unknown): value is PreflightFinding {
  if (typeof value !== 'object' || value === null) return false;
  const finding = value as Partial<PreflightFinding>;
  return (
    typeof finding.id === 'string' &&
    typeof finding.text === 'string' &&
    typeof finding.startOffset === 'number' &&
    Number.isInteger(finding.startOffset) &&
    typeof finding.endOffset === 'number' &&
    Number.isInteger(finding.endOffset) &&
    finding.endOffset > finding.startOffset &&
    typeof finding.contentType === 'string' &&
    typeof finding.contentTypeLabel === 'string' &&
    typeof finding.message === 'string' &&
    ['info', 'neutral', 'warning'].includes(finding.severity ?? '')
  );
}

function validPreflightAnnotation(value: unknown): value is PreflightAnnotation {
  if (typeof value !== 'object' || value === null) return false;
  const annotation = value as Partial<PreflightAnnotation>;
  return (
    typeof annotation.id === 'string' &&
    typeof annotation.text === 'string' &&
    typeof annotation.startOffset === 'number' &&
    Number.isInteger(annotation.startOffset) &&
    typeof annotation.endOffset === 'number' &&
    Number.isInteger(annotation.endOffset) &&
    annotation.endOffset > annotation.startOffset &&
    typeof annotation.contentType === 'string' &&
    typeof annotation.contentTypeLabel === 'string' &&
    ['cue', 'fixture_match', 'pattern', 'unknown'].includes(annotation.classificationBasis ?? '')
  );
}

export async function requestDraftPreflight(
  text: string,
  signal?: AbortSignal,
): Promise<PreflightResponse> {
  let response: Response;
  try {
    response = await fetch('/api/v1/preflight', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new BasirahApiError('NETWORK_ERROR', 0);
  }
  const body = (await response.json().catch(() => ({}))) as Partial<PreflightResponse> &
    ApiErrorBody;
  if (!response.ok) throw new BasirahApiError(body.code ?? 'REQUEST_FAILED', response.status);
  if (
    body.mode !== 'local_demo' ||
    body.verification !== false ||
    body.corpusVersion !== 'software-fixture-v1' ||
    body.offsetUnit !== 'utf16_code_unit' ||
    typeof body.inputHash !== 'string' ||
    !Array.isArray(body.annotations) ||
    !body.annotations.every(validPreflightAnnotation) ||
    !Array.isArray(body.findings) ||
    !body.findings.every(validPreflightFinding) ||
    !Array.isArray(body.warnings)
  )
    throw new BasirahApiError('INVALID_RESPONSE', 0);
  return body as PreflightResponse;
}
