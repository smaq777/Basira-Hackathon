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

async function requestJson(
  path: string,
  init: RequestInit,
  requestSignal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (requestSignal?.aborted) controller.abort();
  else requestSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 12_000);
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
    if (controller.signal.aborted) {
      if (requestSignal?.aborted) throw new BasirahApiError('REQUEST_ABORTED', 0);
      if (timedOut) throw new BasirahApiError('REQUEST_TIMEOUT', 0);
    }
    throw new BasirahApiError('NETWORK_ERROR', 0);
  } finally {
    window.clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function createSession(signal?: AbortSignal): Promise<void> {
  await requestJson('/api/v1/sessions', { method: 'POST', body: '{}' }, signal);
}

async function createDocument(
  text: string,
  signal?: AbortSignal,
): Promise<{ documentId: string; revisionId: string }> {
  const body = await requestJson(
    '/api/v1/documents',
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    },
    signal,
  );
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

export async function persistDraftForAnalysis(
  text: string,
  signal?: AbortSignal,
): Promise<DraftAnalysisReceipt> {
  let document: { documentId: string; revisionId: string };
  try {
    document = await createDocument(text, signal);
  } catch (error) {
    if (!(error instanceof BasirahApiError) || error.status !== 401) throw error;
    await createSession(signal);
    document = await createDocument(text, signal);
  }

  const body = await requestJson(
    `/api/v1/revisions/${document.revisionId}/extractions`,
    {
      method: 'POST',
      body: '{}',
    },
    signal,
  );
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
    if (error.code === 'REQUEST_TIMEOUT')
      return 'استغرق الاتصال وقتًا أطول من المتوقع. حاول مرة أخرى.';
    if (error.code === 'NETWORK_ERROR' || error.status === 404)
      return 'تعذر الاتصال بخدمة التحليل الآن. تحقق من الاتصال ثم أعد المحاولة.';
    if (error.status >= 500) return 'خدمة التحليل غير متاحة مؤقتًا. لم نفقد نصك.';
  }
  return 'تعذر بدء التحليل. بقي نصك كما هو ويمكنك إعادة المحاولة.';
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
