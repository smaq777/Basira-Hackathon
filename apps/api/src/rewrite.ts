import { randomUUID } from 'node:crypto';
import type {
  FoundationReport,
  LiteralFinding,
} from '../../../packages/contracts/src/foundation.js';
import {
  RewriteOperationsSchema,
  rewriteEvidenceReady,
  type RewriteCandidate,
  type RewriteOperations,
} from '../../../packages/contracts/src/rewrite.js';
import { isSafeDraftText, MAX_DRAFT_LENGTH } from '../../../packages/contracts/src/draft-text.js';
import { canonical, sha256, validateIntake } from './foundation.js';
import { readableSourceCitation } from '../../../packages/contracts/src/source-citation.js';
import type { RewriteFailureReason, RewriteFailureReceipt } from './rewrite-diagnostics.js';
import {
  authorRewriteInput,
  validateAuthorRewrite,
  validateAuthorVerification,
  type RewriteVerifier,
} from './substantive-rewrite.js';

export function protectedRanges(report: FoundationReport) {
  const text = report.intake.originalText;
  const ranges = report.intake.segments
    .filter((s) => s.role !== 'author_text')
    .map((s) => ({ start: s.startOffset, end: s.endOffset }));
  const pairs: Record<string, string> = {
    '«': '»',
    '“': '”',
    '﴿': '﴾',
    '{': '}',
    '(': ')',
    '[': ']',
    '"': '"',
  };
  const stack: Array<{ open: string; start: number }> = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const top = stack.at(-1);
    if (top && pairs[top.open] === c) {
      stack.pop();
      ranges.push({ start: top.start, end: i + 1 });
    } else if (pairs[c]) stack.push({ open: c, start: i });
  }
  for (const item of stack) ranges.push({ start: item.start, end: text.length });
  return ranges;
}

export type RewriteContext = { report: FoundationReport; attempt: number };
export type RewriteGenerator = (
  input: ReturnType<typeof rewriteInput> & {
    authorClaims?: ReturnType<typeof authorRewriteInput>['authorClaims'];
  },
  signal: AbortSignal,
) => Promise<unknown>;
export class RewriteError extends Error {
  constructor(
    public code: string,
    public status = 409,
    public reason?: RewriteFailureReason,
  ) {
    super(code);
  }
}
function faithfulQuotation(finding: LiteralFinding) {
  return (
    (['exact', 'normalized'].includes(finding.status) ||
      (finding.status === 'partial' &&
        ['exact', 'orthographic'].includes(finding.comparison?.fidelity ?? ''))) &&
    (!finding.comparison || ['exact', 'orthographic'].includes(finding.comparison.fidelity))
  );
}

export function rewriteInput(report: FoundationReport) {
  const protectedSpans = protectedRanges(report);
  const allowed: Array<{
    offset: number;
    evidenceKey: string;
    reference: string;
    pending: boolean;
  }> = [];
  const add = (start: number, offset: number, evidenceKey: string) => {
    for (let i = 0; i < protectedSpans.length; i++) {
      const enclosing = protectedSpans.find((s) => offset > s.start && offset < s.end);
      if (!enclosing) break;
      // Move past delimiters only when the verified span covers all their content.
      // An unmatched prefix/suffix must never inherit the excerpt's attribution.
      const wrappersOnly = /^[\s«»“”﴿﴾{}()[\]"]*$/u;
      if (
        !wrappersOnly.test(report.intake.originalText.slice(enclosing.start, start)) ||
        !wrappersOnly.test(report.intake.originalText.slice(offset, enclosing.end))
      )
        return;
      start = Math.min(start, enclosing.start);
      offset = enclosing.end;
    }
    const source = report.intake.evidence.find((s) => s.snapshotKey === evidenceKey);
    if (
      !source ||
      ['rejected', 'revoked'].includes(source.approvalStatus) ||
      !isSafeDraftText(source.reference)
    )
      return;
    if (!allowed.some((row) => row.offset === offset && row.evidenceKey === evidenceKey))
      allowed.push({
        offset,
        evidenceKey,
        reference: readableSourceCitation(source),
        pending: source.approvalStatus !== 'approved' || source.researchOnly,
      });
  };
  for (const finding of report.intake.quotationFindings) {
    const segment = report.intake.segments.find((s) => s.id === finding.segmentId);
    if (segment && finding.evidenceKey && faithfulQuotation(finding))
      add(segment.startOffset, segment.endOffset, finding.evidenceKey);
  }
  for (const finding of report.semanticAssessment?.assessments ?? []) {
    const claim = report.semanticAssessment?.claims.find((c) => c.id === finding.claimId);
    if (claim && finding.status === 'supported')
      for (const citation of finding.citations)
        add(claim.startOffset, claim.endOffset, citation.evidenceKey);
  }
  // Only sentence boundaries outside protected spans can receive layout insertions.
  const breaks: number[] = [];
  for (const match of report.intake.originalText.matchAll(/[.!؟؛]\s+/gu)) {
    const offset = match.index! + match[0].length;
    if (
      offset < report.intake.originalText.length &&
      !protectedSpans.some((s) => offset > s.start && offset < s.end)
    )
      breaks.push(offset);
  }
  return {
    originalText: report.intake.originalText,
    paragraphOffsets: breaks,
    allowedCitations: allowed,
    remainingUtf16Units: MAX_DRAFT_LENGTH - report.intake.originalText.length,
  };
}

/** Validate insertions in original offsets against a server-computed final prose length. */
export function validateRewriteInsertions(
  report: FoundationReport,
  raw: unknown,
  baseLength = report.intake.originalText.length,
) {
  try {
    validateIntake(report.intake, report.intake.originalText, report.revisionId, true);
    if (sha256(report.intake.originalText) !== report.inputSha256) throw new Error('hash');
  } catch {
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'report_binding');
  }
  const parsed = RewriteOperationsSchema.safeParse(raw);
  if (!parsed.success) throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'layout_schema');
  const operations = parsed.data;
  if (operations.replacements?.length)
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'layout_schema');
  const input = rewriteInput(report);
  if (
    !Number.isInteger(baseLength) ||
    baseLength < 1 ||
    baseLength > MAX_DRAFT_LENGTH ||
    input.originalText.length > MAX_DRAFT_LENGTH ||
    !input.originalText.trim() ||
    !isSafeDraftText(input.originalText)
  )
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'candidate_length');
  const insertions = new Map<number, string[]>();
  const retained: RewriteOperations = { paragraphBreaks: [], citations: [] };
  let remaining = MAX_DRAFT_LENGTH - baseLength;
  const append = (at: number, text: string) =>
    insertions.set(at, [...(insertions.get(at) ?? []), text]);
  if (new Set(operations.paragraphBreaks).size !== operations.paragraphBreaks.length)
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'insertion_binding');
  for (const offset of operations.paragraphBreaks) {
    if (!input.paragraphOffsets.includes(offset))
      throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'insertion_binding');
    if (remaining >= 2) {
      append(offset, '\n\n');
      remaining -= 2;
      retained.paragraphBreaks.push(offset);
    }
  }
  const cited = new Set<string>();
  for (const citation of operations.citations) {
    const key = `${citation.offset}:${citation.evidenceKey}`;
    const allowed = input.allowedCitations.find(
      (s) => s.offset === citation.offset && s.evidenceKey === citation.evidenceKey,
    );
    if (!allowed || cited.has(key))
      throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'citation_binding');
    const offset = citation.offset;
    if (protectedRanges(report).some((s) => offset > s.start && offset < s.end))
      throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'protected_insertion');
    cited.add(key);
    const addition = ` [${allowed.reference}${allowed.pending ? ' — مصدر بحثي غير معتمد' : ''}]`;
    if (addition.length <= remaining) {
      append(offset, addition);
      remaining -= addition.length;
      retained.citations.push(citation);
    }
  }
  return {
    insertions,
    operations: retained,
    budgetLimited: canonical(retained) !== canonical(operations),
  };
}

export function validateRewrite(report: FoundationReport, raw: unknown) {
  const layout = validateRewriteInsertions(report, raw);
  const input = rewriteInput(report);
  let text = '';
  let cursor = 0;
  for (const [offset, additions] of [...layout.insertions].sort(([a], [b]) => a - b)) {
    text += input.originalText.slice(cursor, offset) + additions.join('');
    cursor = offset;
  }
  text += input.originalText.slice(cursor);
  if (
    !text.trim() ||
    text.length > MAX_DRAFT_LENGTH ||
    !isSafeDraftText(text) ||
    input.originalText.length > MAX_DRAFT_LENGTH ||
    !isSafeDraftText(input.originalText)
  )
    throw new RewriteError('REWRITE_INVALID_CANDIDATE');
  return {
    text,
    operations: layout.operations,
    budgetLimited: layout.budgetLimited,
  };
}

/** Attribution requires no model inference when there is no eligible author wording. */
function quotationCitationOperations(input: ReturnType<typeof rewriteInput>): RewriteOperations {
  const citations: RewriteOperations['citations'] = [];
  const offsets = new Set<number>();
  let remaining = input.remainingUtf16Units;
  for (const citation of input.allowedCitations) {
    if (offsets.has(citation.offset)) continue;
    const addition = ` [${citation.reference}${citation.pending ? ' — مصدر بحثي غير معتمد' : ''}]`;
    if (addition.length > remaining) continue;
    citations.push({ offset: citation.offset, evidenceKey: citation.evidenceKey });
    offsets.add(citation.offset);
    remaining -= addition.length;
    if (citations.length === 12) break;
  }
  return { replacements: [], paragraphBreaks: [], citations };
}

const binding = (context: RewriteContext) =>
  sha256(canonical({ report: context.report, attempt: context.attempt }));
function unresolved(report: FoundationReport) {
  const rows = report.intake.quotationFindings
    .filter((f) => !faithfulQuotation(f))
    .map(
      (f) => report.intake.segments.find((s) => s.id === f.segmentId)?.originalText ?? f.segmentId,
    );
  for (const claim of report.semanticAssessment?.claims ?? [])
    if (
      !report.semanticAssessment?.assessments.some(
        (f) => f.claimId === claim.id && f.status === 'supported',
      )
    )
      rows.push(claim.originalText);
  const noAuthorAssessmentNeeded =
    report.interpretation.status === 'not_applicable' ||
    report.semanticAssessment?.status === 'not_applicable';
  if (
    !noAuthorAssessmentNeeded &&
    (!report.semanticAssessment || report.semanticAssessment.status !== 'completed')
  )
    rows.unshift('لم يكتمل تقييم دعم الادعاءات؛ ترتيب النص وتوثيق النقل لا يثبت صحة الاستدلال.');
  return rows.slice(0, 85).map((s) => s.slice(0, 500));
}

/** Explicitly transient research prototype: no restart recovery or database persistence. */
export function createRewriteService(
  generate: RewriteGenerator,
  options: {
    now?: () => number;
    ttlMs?: number;
    timeoutMs?: number;
    verifier?: RewriteVerifier;
    requireCompleteEvidence?: boolean;
    onFailureDiagnostic?: (receipt: RewriteFailureReceipt) => void;
  } = {},
) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 10 * 60_000;
  const timeoutMs = options.timeoutMs ?? (options.verifier ? 90_000 : 30_000);
  const mode = options.verifier ? 'supported_author_wording' : 'citation_and_layout_only';
  const records = new Map<
    string,
    {
      owner: string;
      key: string;
      binding: string;
      controller: AbortController;
      candidate: RewriteCandidate;
      verification?: { raw: unknown; hash: string };
    }
  >();
  const prune = () => {
    for (const [id, r] of records)
      if (Date.parse(r.candidate.expiresAt) <= now()) {
        r.controller.abort();
        records.delete(id);
      }
  };
  const owned = (owner: string, id: string, context: RewriteContext) => {
    prune();
    const row = records.get(id);
    if (!row || row.owner !== owner || row.candidate.reviewId !== context.report.reviewId)
      throw new RewriteError('REWRITE_NOT_FOUND', 404);
    if (row.binding !== binding(context)) {
      row.controller.abort();
      row.candidate.status = 'failed';
      row.candidate.text = null;
      row.candidate.errorCode = 'stale_report';
      throw new RewriteError('REWRITE_STALE_REPORT');
    }
    return row;
  };
  return {
    mode,
    create(
      owner: string,
      key: string,
      context: RewriteContext,
      reload: () => Promise<RewriteContext>,
    ): RewriteCandidate {
      prune();
      if (options.requireCompleteEvidence && !rewriteEvidenceReady(context.report))
        throw new RewriteError('REWRITE_EVIDENCE_REQUIRED');
      validateRewrite(context.report, { paragraphBreaks: [], citations: [] });
      const prior = [...records.values()].find((r) => r.owner === owner && r.key === key);
      if (prior) {
        if (prior.binding !== binding(context))
          throw new RewriteError('REWRITE_IDEMPOTENCY_CONFLICT');
        return structuredClone(prior.candidate);
      }
      const attempts = [...records.values()].filter(
        (r) => r.owner === owner && r.candidate.reviewId === context.report.reviewId,
      );
      if (
        attempts.length >= 3 ||
        records.size >= 64 ||
        attempts.some((r) => r.candidate.status === 'pending')
      )
        throw new RewriteError('REWRITE_LIMIT_REACHED', 429);
      const candidate: RewriteCandidate = {
        id: randomUUID(),
        reviewId: context.report.reviewId,
        revisionId: context.report.revisionId,
        inputSha256: context.report.inputSha256,
        evidenceStateSha256: context.report.evidenceStateSha256,
        status: 'pending',
        text: null,
        operations: null,
        unresolved: unresolved(context.report),
        errorCode: null,
        expiresAt: new Date(now() + ttlMs).toISOString(),
        mode,
        scholarlyApproval: false,
        storage: 'session_bound_memory',
      };
      const controller = new AbortController();
      const row: {
        owner: string;
        key: string;
        binding: string;
        controller: AbortController;
        candidate: RewriteCandidate;
        verification?: { raw: unknown; hash: string };
      } = { owner, key, binding: binding(context), controller, candidate };
      records.set(candidate.id, row);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref();
      const signal = controller.signal;
      let stage: RewriteFailureReceipt['stage'] = 'input';
      let operationsSha256: string | null = null;
      let verificationSha256: string | null = null;
      const packetHash = (packet: unknown) => {
        if (!options.onFailureDiagnostic) return null;
        try {
          return sha256(canonical(packet));
        } catch {
          return null;
        }
      };
      void Promise.race([
        Promise.resolve().then(async () => {
          signal.throwIfAborted();
          const authorInput = options.verifier ? authorRewriteInput(context.report) : undefined;
          const input = authorInput ?? rewriteInput(context.report);
          // A fully evidenced quotation-only draft needs exact attribution, not
          // an author-rewrite request whose empty output may omit that citation.
          const quotationOnly =
            options.requireCompleteEvidence &&
            options.verifier &&
            authorInput?.authorClaims.length === 0 &&
            (context.report.semanticAssessment?.claims.length ?? 0) === 0;
          stage = 'generation';
          const output = quotationOnly
            ? quotationCitationOperations(input)
            : await generate(input, signal);
          operationsSha256 = packetHash(output);
          signal.throwIfAborted();
          stage = 'report_reload';
          const fresh = await reload();
          signal.throwIfAborted();
          if (row.binding !== binding(fresh)) throw new RewriteError('REWRITE_STALE_REPORT');
          stage = 'candidate_validation';
          const valid = options.verifier
            ? validateAuthorRewrite(fresh.report, output)
            : validateRewrite(fresh.report, output);
          if (
            options.requireCompleteEvidence &&
            (!rewriteEvidenceReady(fresh.report) ||
              (!valid.operations.citations.length && !valid.operations.replacements?.length))
          )
            throw new RewriteError('REWRITE_EVIDENCE_REQUIRED');
          if (options.verifier && valid.operations.replacements?.length) {
            const verifierInput = authorRewriteInput(fresh.report);
            stage = 'verification';
            const raw = await options.verifier(verifierInput, valid.operations, signal);
            verificationSha256 = packetHash(raw);
            signal.throwIfAborted();
            stage = 'verification_validation';
            const hash = validateAuthorVerification(verifierInput, valid.operations, raw);
            stage = 'verified_report_reload';
            const after = await reload();
            signal.throwIfAborted();
            if (row.binding !== binding(after)) throw new RewriteError('REWRITE_STALE_REPORT');
            row.verification = { raw, hash };
          }
          return valid;
        }),
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      ])
        .then((valid) => {
          signal.throwIfAborted();
          if (candidate.status !== 'pending' || !records.has(candidate.id)) return;
          candidate.text = valid.text;
          candidate.operations = valid.operations;
          // Describe the retained changes, rather than the configured capability:
          // a safe author skip with exact citations has no new wording to verify.
          candidate.mode = valid.operations.replacements?.length
            ? 'supported_author_wording'
            : 'citation_and_layout_only';
          if (valid.budgetLimited)
            candidate.unresolved = [
              'لم تُضف بعض الفواصل أو المراجع لضيق المساحة ضمن حد ٣٠٠٠ حرف؛ لم نختصر الأصل.',
              ...candidate.unresolved,
            ].slice(0, 85);
          candidate.status = 'validated';
        })
        .catch((error) => {
          if (candidate.status !== 'pending' || !records.has(candidate.id)) return;
          candidate.status = 'failed';
          candidate.text = null;
          candidate.errorCode =
            error instanceof RewriteError
              ? error.code === 'REWRITE_STALE_REPORT'
                ? 'stale_report'
                : 'invalid_candidate'
              : 'provider_unavailable';
          if (options.onFailureDiagnostic) {
            const reason: RewriteFailureReason = signal.aborted
              ? 'deadline'
              : error instanceof RewriteError
                ? (error.reason ??
                  (error.code === 'REWRITE_STALE_REPORT'
                    ? 'stale_report'
                    : error.code === 'REWRITE_EVIDENCE_REQUIRED'
                      ? 'evidence_required'
                      : 'invalid_candidate'))
                : ['report_reload', 'verified_report_reload'].includes(stage)
                  ? 'report_reload_unavailable'
                  : error instanceof SyntaxError ||
                      (error instanceof Error &&
                        [
                          'ZodError',
                          'REWRITE_PROVIDER_OUTPUT_INVALID',
                          'REWRITE_RESPONSE_TOO_LARGE',
                        ].includes(error.name === 'ZodError' ? error.name : error.message))
                    ? 'provider_output_invalid'
                    : 'provider_unavailable';
            try {
              void Promise.resolve(
                options.onFailureDiagnostic({
                  event: 'rewrite_failed',
                  stage: signal.aborted ? 'deadline' : stage,
                  reason,
                  inputSha256: context.report.inputSha256,
                  evidenceStateSha256: context.report.evidenceStateSha256,
                  operationsSha256,
                  verificationSha256,
                }),
              ).catch(() => undefined);
            } catch {
              /* Diagnostic observers cannot change withholding. */
            }
          }
        })
        .finally(() => clearTimeout(timer));
      return structuredClone(candidate);
    },
    get(owner: string, id: string, context: RewriteContext) {
      return structuredClone(owned(owner, id, context).candidate);
    },
    cancel(owner: string, id: string, context: RewriteContext) {
      const row = owned(owner, id, context);
      row.candidate.status = 'cancelled';
      row.candidate.text = null;
      row.candidate.operations = null;
      row.candidate.errorCode = 'cancelled';
      row.controller.abort();
      return structuredClone(row.candidate);
    },
    copy(owner: string, id: string, context: RewriteContext) {
      const row = owned(owner, id, context);
      if (options.requireCompleteEvidence && !rewriteEvidenceReady(context.report))
        throw new RewriteError('REWRITE_EVIDENCE_REQUIRED');
      if (row.candidate.status !== 'validated') throw new RewriteError('REWRITE_NOT_VALIDATED');
      const checked = options.verifier
        ? validateAuthorRewrite(context.report, row.candidate.operations)
        : validateRewrite(context.report, row.candidate.operations);
      if (
        options.verifier &&
        checked.operations.replacements?.length &&
        (!row.verification ||
          validateAuthorVerification(
            authorRewriteInput(context.report),
            checked.operations,
            row.verification.raw,
          ) !== row.verification.hash)
      )
        throw new RewriteError('REWRITE_NOT_VALIDATED');
      if (checked.text !== row.candidate.text) throw new RewriteError('REWRITE_STALE_REPORT');
      return checked.text;
    },
    cancelKey(owner: string, key: string, context: RewriteContext) {
      prune();
      const prior = [...records.values()].find((r) => r.owner === owner && r.key === key);
      if (prior) {
        const row = owned(owner, prior.candidate.id, context);
        row.candidate.status = 'cancelled';
        row.candidate.text = null;
        row.candidate.operations = null;
        row.candidate.errorCode = 'cancelled';
        row.controller.abort();
        return structuredClone(row.candidate);
      }
      // A tombstone prevents an in-flight create request from starting later.
      if (records.size >= 64) throw new RewriteError('REWRITE_LIMIT_REACHED', 429);
      const candidate: RewriteCandidate = {
        id: randomUUID(),
        reviewId: context.report.reviewId,
        revisionId: context.report.revisionId,
        inputSha256: context.report.inputSha256,
        evidenceStateSha256: context.report.evidenceStateSha256,
        status: 'cancelled',
        text: null,
        operations: null,
        unresolved: [],
        errorCode: 'cancelled',
        expiresAt: new Date(now() + ttlMs).toISOString(),
        mode,
        scholarlyApproval: false,
        storage: 'session_bound_memory',
      };
      records.set(candidate.id, {
        owner,
        key,
        binding: binding(context),
        controller: new AbortController(),
        candidate,
      });
      return structuredClone(candidate);
    },
    close() {
      for (const row of records.values()) row.controller.abort();
      records.clear();
    },
  };
}
export type RewriteService = ReturnType<typeof createRewriteService>;
