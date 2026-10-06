import type { FoundationReport } from '../../../packages/contracts/src/foundation.js';
import {
  SubstantiveRewriteOperationsSchema,
  RewriteVerificationSchema,
  type RewriteOperations,
} from '../../../packages/contracts/src/rewrite.js';
import { isSafeDraftText, MAX_DRAFT_LENGTH } from '../../../packages/contracts/src/draft-text.js';
import { canonical, sha256, validateIntake } from './foundation.js';
import { assessorEvidence } from './semantic-spans.js';
import {
  protectedRanges,
  rewriteInput,
  validateRewriteInsertions,
  RewriteError,
} from './rewrite.js';

/** Eligibility is server-owned and narrow: only previously supported author spans. */
export function authorRewriteInput(report: FoundationReport) {
  try {
    validateIntake(report.intake, report.intake.originalText, report.revisionId, true);
    if (sha256(report.intake.originalText) !== report.inputSha256) throw Error('hash');
  } catch {
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'report_binding');
  }
  const semantic = report.semanticAssessment;
  const protectedSpans = protectedRanges(report);
  const authorClaims = (semantic?.claims ?? []).flatMap((claim) => {
    const finding = semantic?.assessments.find((f) => f.claimId === claim.id);
    const segment = report.intake.segments.find((s) => s.id === claim.segmentId);
    if (
      semantic?.status !== 'completed' ||
      semantic.trace.inputSha256 !== report.inputSha256 ||
      finding?.status !== 'supported' ||
      !finding.citations.length ||
      !segment ||
      segment.role !== 'author_text' ||
      claim.startOffset < segment.startOffset ||
      claim.endOffset > segment.endOffset ||
      report.intake.originalText.slice(claim.startOffset, claim.endOffset) !== claim.originalText ||
      protectedSpans.some((s) => claim.startOffset < s.end && claim.endOffset > s.start)
    )
      return [];
    const keys = [...new Set(finding.citations.map((c) => c.evidenceKey))];
    const evidence = report.intake.evidence.filter((e) => keys.includes(e.snapshotKey));
    if (
      evidence.length !== keys.length ||
      evidence.some((e) => ['revoked', 'rejected'].includes(e.approvalStatus)) ||
      finding.citations.some(
        (c) =>
          !evidence.find((e) => e.snapshotKey === c.evidenceKey)?.originalText.includes(c.excerpt),
      )
    )
      return [];
    // Supply canonical parent context alongside a cited commentary, without expanding sources.
    for (const e of [...evidence])
      if (e.parentSnapshotKey) {
        const parent = report.intake.evidence.find((s) => s.snapshotKey === e.parentSnapshotKey);
        if (!parent || ['revoked', 'rejected'].includes(parent.approvalStatus)) return [];
        if (parent && !evidence.some((s) => s.snapshotKey === parent.snapshotKey))
          evidence.push(parent);
      }
    return [
      {
        claim,
        supportedFinding: finding,
        evidenceKeys: keys,
        evidence: evidence.map((e) =>
          assessorEvidence(e, claim.originalText, semantic.trace.retrieval?.passagePreferences),
        ),
      },
    ];
  });
  return { ...rewriteInput(report), authorClaims };
}
export type AuthorRewriteInput = ReturnType<typeof authorRewriteInput>;
export type RewriteVerifier = (
  input: AuthorRewriteInput,
  operations: RewriteOperations,
  signal: AbortSignal,
) => Promise<unknown>;

export function validateAuthorRewrite(report: FoundationReport, raw: unknown) {
  const parsed = SubstantiveRewriteOperationsSchema.safeParse(raw);
  if (!parsed.success) throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'candidate_schema');
  const input = authorRewriteInput(report),
    operations = parsed.data;
  const selected = new Set<string>();
  const changes = operations.replacements
    .map((replacement) => {
      const allowed = input.authorClaims.find((c) => c.claim.id === replacement.claimId);
      if (!allowed || selected.has(replacement.claimId))
        throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'claim_binding');
      if (replacement.originalText !== allowed.claim.originalText)
        throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'original_text_binding');
      if (
        replacement.replacementText.replace(/[^\p{L}\p{N}]/gu, '') ===
        replacement.originalText.replace(/[^\p{L}\p{N}]/gu, '')
      )
        throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'unchanged_wording');
      if (
        !isSafeDraftText(replacement.replacementText) ||
        !/\p{Script=Arabic}/u.test(replacement.replacementText) ||
        /[«»“”﴿﴾{}\[\]"]/u.test(replacement.replacementText)
      )
        throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'unsafe_wording');
      if (
        new Set(replacement.evidenceKeys).size !== replacement.evidenceKeys.length ||
        canonical([...replacement.evidenceKeys].sort()) !==
          canonical([...allowed.evidenceKeys].sort())
      )
        throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'source_binding');
      selected.add(replacement.claimId);
      return {
        ...replacement,
        startOffset: allowed.claim.startOffset,
        endOffset: allowed.claim.endOffset,
      };
    })
    .sort((a, b) => a.startOffset - b.startOffset);
  if (changes.some((c, i) => i > 0 && c.startOffset < changes[i - 1]!.endOffset))
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'overlapping_replacements');
  const baseLength =
    input.originalText.length +
    changes.reduce(
      (delta, change) =>
        delta + change.replacementText.length - (change.endOffset - change.startOffset),
      0,
    );
  const layout = validateRewriteInsertions(
    report,
    { paragraphBreaks: operations.paragraphBreaks, citations: operations.citations },
    baseLength,
  );
  // Inserts are expressed in original offsets; never insert inside a replacement.
  const inserts = new Map(
    [...layout.insertions].map(([offset, additions]) => [offset, additions.join('')]),
  );
  if (
    [...inserts.keys()].some((offset) =>
      changes.some((c) => offset > c.startOffset && offset < c.endOffset),
    )
  )
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'insertion_inside_replacement');
  const events: Array<{ start: number; end: number; text: string }> = [
    ...changes.map((c) => ({ start: c.startOffset, end: c.endOffset, text: c.replacementText })),
    ...[...inserts.entries()].map(([offset, text]) => ({ start: offset, end: offset, text })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  let text = '',
    cursor = 0;
  for (const event of events) {
    text += input.originalText.slice(cursor, event.start) + event.text;
    cursor = event.end;
  }
  text += input.originalText.slice(cursor);
  if (text.length > MAX_DRAFT_LENGTH)
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'candidate_length');
  if (!text.trim() || !isSafeDraftText(text))
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'unsafe_wording');
  return {
    text,
    operations: { ...layout.operations, replacements: operations.replacements },
    budgetLimited: layout.budgetLimited,
  };
}

/** A separate request checks mutual meaning and source support; it is provisional, not scholarly approval. */
export function validateAuthorVerification(
  input: AuthorRewriteInput,
  operations: RewriteOperations,
  raw: unknown,
) {
  const parsed = RewriteVerificationSchema.safeParse(raw);
  if (!parsed.success) throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'verifier_schema');
  if (parsed.data.checks.length !== (operations.replacements?.length ?? 0))
    throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'verifier_binding');
  const seen = new Set<string>();
  for (const check of parsed.data.checks) {
    const op = operations.replacements?.find((r) => r.claimId === check.claimId),
      source = input.authorClaims.find((c) => c.claim.id === check.claimId);
    if (!op || !source || seen.has(check.claimId))
      throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'verifier_binding');
    const preservation = [
      [check.meaningPreserved, 'meaning_changed'],
      [check.evidenceSupported, 'source_unsupported'],
      [check.conditionsPreserved, 'conditions_changed'],
      [check.negationsPreserved, 'negations_changed'],
      [check.exceptionsPreserved, 'exceptions_changed'],
      [check.scopePreserved, 'scope_changed'],
      [check.modalityPreserved, 'modality_changed'],
    ] as const;
    const rejected = preservation.find(([preserved]) => !preserved);
    if (rejected) throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, rejected[1]);
    const seenCitations = new Set<string>();
    for (const c of check.citations) {
      const e = source.evidence.find((e) => e.evidenceKey === c.evidenceKey);
      if (
        !op.evidenceKeys.includes(c.evidenceKey) ||
        !e?.passages.some((p) => !p.boundaryTruncated && p.originalText.includes(c.excerpt)) ||
        seenCitations.has(canonical(c))
      )
        throw new RewriteError('REWRITE_INVALID_CANDIDATE', 409, 'verifier_citation');
      seenCitations.add(canonical(c));
    }
    seen.add(check.claimId);
  }
  return sha256(canonical({ input, operations, verification: parsed.data }));
}
