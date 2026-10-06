import { expect, it, vi } from 'vitest';
import { createRewriteService, rewriteInput, validateRewrite } from '../apps/api/src/rewrite.js';
import { sha256 } from '../apps/api/src/foundation.js';
import {
  foundationReportFixture,
  SYNTHETIC_QUOTE,
} from '../apps/web/src/foundation-report.fixtures.js';
import { createRewriteGenerator, REWRITE_MODEL } from '../apps/api/src/rewrite-provider.js';
import { RewriteCandidateSchema, rewriteEvidenceReady } from '../packages/contracts/src/rewrite.js';
import {
  SEMANTIC_PIPELINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
} from '../packages/contracts/src/semantic-assessment.js';

export function rewriteFixture() {
  const report = foundationReportFixture();
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.intake.evidence[0]!.originalSha256 = sha256(report.intake.evidence[0]!.originalText);
  return report;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function completeQuotationFixture() {
  const report = rewriteFixture();
  report.intake.originalText = `قال تعالى: «${SYNTHETIC_QUOTE}».`;
  const segment = report.intake.segments[0]!;
  segment.startOffset = segment.codePointStart =
    report.intake.originalText.indexOf(SYNTHETIC_QUOTE);
  segment.endOffset = segment.codePointEnd = segment.startOffset + SYNTHETIC_QUOTE.length;
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.interpretation.status = 'not_applicable';
  report.semanticAssessment = {
    schemaVersion: 1,
    status: 'not_applicable',
    provisional: true,
    scholarlyApproval: false,
    errorCode: null,
    assessments: [],
    limitations: [],
    claims: [],
    trace: {
      pipelineVersion: SEMANTIC_PIPELINE_VERSION,
      promptVersion: SEMANTIC_PROMPT_VERSION,
      inputSha256: report.inputSha256,
      evidenceSha256: 'd'.repeat(64),
      extractionInputSha256: null,
      assessmentInputSha256: null,
      requests: [],
    },
  };
  return report;
}

it('requires complete evidence before hosted generation and rejects missing, stale and unresolved findings without calling AI', () => {
  const report = completeQuotationFixture();
  expect(rewriteEvidenceReady(report)).toBe(true);
  for (const mutate of [
    (r: typeof report) => {
      r.semanticAssessment = undefined;
      r.interpretation.status = 'not_assessed';
    },
    (r: typeof report) => {
      r.semanticAssessment!.status = 'partial';
    },
    (r: typeof report) => {
      r.semanticAssessment!.trace.inputSha256 = 'f'.repeat(64);
    },
    (r: typeof report) => {
      r.intake.quotationFindings[0]!.status = 'unresolved';
    },
    (r: typeof report) => {
      r.intake.quotationFindings = [];
    },
    (r: typeof report) => {
      r.intake.evidence = [];
    },
    (r: typeof report) => {
      r.intake.evidence[0]!.approvalStatus = 'revoked';
    },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    const generate = vi.fn(async () => ({ paragraphBreaks: [], citations: [] }));
    const service = createRewriteService(generate, { requireCompleteEvidence: true });
    const context = { report: invalid, attempt: 1 };
    expect(rewriteEvidenceReady(invalid)).toBe(false);
    expect(() => service.create('owner', 'key', context, async () => context)).toThrow(
      'REWRITE_EVIDENCE_REQUIRED',
    );
    expect(generate).not.toHaveBeenCalled();
    service.close();
  }
});

it('reuses deterministic quotation-only eligibility when the worker intentionally skips semantic AI', () => {
  const report = completeQuotationFixture();
  report.semanticAssessment = undefined;
  expect(rewriteEvidenceReady(report)).toBe(true);
  for (const extra of [' ثم يضيف الكاتب معنى يحتاج إلى مراجعة.', ' كيف نستنتج من ذلك؟']) {
    const invalid = structuredClone(report);
    invalid.intake.originalText += extra;
    invalid.inputSha256 = invalid.intake.revisionSha256 = sha256(invalid.intake.originalText);
    expect(rewriteEvidenceReady(invalid)).toBe(false);
  }
});

it('allows a real recorded citation with fresh validated copy but withholds evidence-free layout output', async () => {
  const report = completeQuotationFixture(),
    context = { report, attempt: 1 };
  const citation = rewriteInput(report).allowedCitations[0]!;
  const service = createRewriteService(
    async () => ({
      paragraphBreaks: [],
      citations: [citation].map(({ offset, evidenceKey }) => ({ offset, evidenceKey })),
    }),
    { requireCompleteEvidence: true },
  );
  const task = service.create('owner', 'key', context, async () => context);
  await settle();
  const valid = service.get('owner', task.id, context);
  expect(valid.status).toBe('validated');
  expect(service.copy('owner', task.id, context)).toBe(valid.text);
  service.close();
  const empty = createRewriteService(async () => ({ paragraphBreaks: [], citations: [] }), {
    requireCompleteEvidence: true,
  });
  const failed = empty.create('owner', 'empty', context, async () => context);
  await settle();
  expect(empty.get('owner', failed.id, context)).toMatchObject({ status: 'failed', text: null });
  expect(() => empty.copy('owner', failed.id, context)).toThrow('REWRITE_NOT_VALIDATED');
  empty.close();
});

it('attributes a complete faithful quotation without author-generation or verification calls and freshly validates copy', async () => {
  const report = completeQuotationFixture(),
    context = { report, attempt: 1 };
  const generate = vi.fn(async () => {
    throw new Error('quotation attribution must not depend on an author model');
  });
  const verifier = vi.fn(async () => {
    throw new Error('no changed author meaning to verify');
  });
  const reload = vi.fn(async () => context);
  const service = createRewriteService(generate, { verifier, requireCompleteEvidence: true });
  const task = service.create('owner', 'quote', context, reload);
  await settle();
  const candidate = service.get('owner', task.id, context);
  expect(candidate).toMatchObject({
    status: 'validated',
    mode: 'citation_and_layout_only',
    operations: { replacements: [], paragraphBreaks: [] },
  });
  expect(candidate.operations!.citations).toHaveLength(1);
  const allowed = rewriteInput(report).allowedCitations[0]!;
  expect(candidate.text!.split('\n\nReferences\n')[0]!.replace(' [1]', '')).toBe(
    report.intake.originalText,
  );
  expect(candidate.text).toContain(`\n\nReferences\n1. ${allowed.reference}`);
  expect(reload).toHaveBeenCalledOnce();
  expect(generate).not.toHaveBeenCalled();
  expect(verifier).not.toHaveBeenCalled();
  expect(service.copy('owner', task.id, context)).toBe(candidate.text);
  expect(() => service.copy('foreign', task.id, context)).toThrow('REWRITE_NOT_FOUND');
  expect(() => service.copy('owner', task.id, { ...context, attempt: 2 })).toThrow(
    'REWRITE_STALE_REPORT',
  );
  service.close();
});

it('tries a shorter allowed source at the same quotation offset when the first reference cannot fit', async () => {
  const report = completeQuotationFixture();
  report.intake.evidence[0]!.work = 'ا'.repeat(150);
  const shorter = structuredClone(report.intake.evidence[0]!);
  shorter.snapshotKey = 'shorter-source';
  shorter.work = 'قصير';
  shorter.reference = '1';
  report.intake.evidence.push(shorter);
  report.intake.segments[0]!.sourceKeys.push(shorter.snapshotKey);
  report.intake.quotationFindings.push({
    ...report.intake.quotationFindings[0]!,
    evidenceKey: shorter.snapshotKey,
  });
  report.intake.originalText += ' '.repeat(2920 - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  const context = { report, attempt: 1 };
  const generate = vi.fn(),
    verifier = vi.fn();
  const service = createRewriteService(generate, { verifier, requireCompleteEvidence: true });
  try {
    const task = service.create('owner', 'shorter-reference', context, async () => context);
    await settle();
    const candidate = service.get('owner', task.id, context);
    expect(candidate.status).toBe('validated');
    expect(candidate.operations!.citations).toEqual([
      {
        offset: rewriteInput(report).allowedCitations[1]!.offset,
        evidenceKey: shorter.snapshotKey,
      },
    ]);
    expect(candidate.text).toContain('\n\nReferences\n1. قصير — 1');
    expect(candidate.text!.length).toBeLessThanOrEqual(3000);
    expect(service.copy('owner', task.id, context)).toBe(candidate.text);
    expect(generate).not.toHaveBeenCalled();
    expect(verifier).not.toHaveBeenCalled();
  } finally {
    service.close();
  }
});

it('still withholds quotation-only output when attribution cannot fit or the report becomes stale', async () => {
  const report = completeQuotationFixture();
  report.intake.originalText += ' '.repeat(3000 - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  const context = { report, attempt: 1 };
  const generate = vi.fn(),
    verifier = vi.fn();
  const service = createRewriteService(generate, { verifier, requireCompleteEvidence: true });
  const task = service.create('owner', 'budget', context, async () => context);
  await settle();
  expect(service.get('owner', task.id, context)).toMatchObject({
    status: 'failed',
    text: null,
    errorCode: 'invalid_candidate',
  });
  expect(() => service.copy('owner', task.id, context)).toThrow('REWRITE_NOT_VALIDATED');
  service.close();
  const fresh = { report: completeQuotationFixture(), attempt: 1 };
  const stale = createRewriteService(generate, { verifier, requireCompleteEvidence: true });
  const other = stale.create('owner', 'stale', fresh, async () => ({ ...fresh, attempt: 2 }));
  await settle();
  expect(stale.get('owner', other.id, fresh)).toMatchObject({
    status: 'failed',
    text: null,
    errorCode: 'stale_report',
  });
  expect(generate).not.toHaveBeenCalled();
  expect(verifier).not.toHaveBeenCalled();
  stale.close();
});

it('does not warn about unavailable claim assessment when the report identifies quotation-only writing', async () => {
  const report = rewriteFixture();
  report.interpretation.status = 'not_applicable';
  report.interpretation.applicability = { status: 'not_applicable', reason: 'quotation_only' };
  const context = { report, attempt: 1 };
  const service = createRewriteService(async () => ({ paragraphBreaks: [], citations: [] }));
  const candidate = service.create('owner', 'quote-only', context, async () => context);
  await settle();
  expect(service.get('owner', candidate.id, context).unresolved).toEqual([]);
  service.close();
});

it('preserves all original letters, quotes, qualifiers, literal markup and emoji while adding an actual pending reference', () => {
  const report = rewriteFixture();
  const citation = rewriteInput(report).allowedCitations[0]!;
  const result = validateRewrite(report, {
    paragraphBreaks: [],
    citations: [{ offset: citation.offset, evidenceKey: citation.evidenceKey }],
  });
  expect(result.text).toContain(`«${SYNTHETIC_QUOTE}» [1]`);
  expect(result.text).toContain(
    '\n\nReferences\n1. كتاب اصطناعي للاختبار — مرجع اختبار برمجي — مصدر بحثي غير معتمد',
  );
  expect(result.text.split('\n\nReferences\n')[0]!.replace(' [1]', '')).toBe(
    report.intake.originalText,
  );
  report.intake.originalText = '🙂 لا يجوز ذلك إلا بشرط، وليس دائمًا. <img src=x> ثم مثال آخر.';
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.intake.segments = [];
  report.intake.quotationFindings = [];
  const offset = rewriteInput(report).paragraphOffsets[0]!;
  const formatted = validateRewrite(report, { paragraphBreaks: [offset], citations: [] });
  expect(formatted.text.replace('\n\n', '')).toBe(report.intake.originalText);
});

it('rejects fabricated citations, quotation insertions, new claims, lost negations and client verdict fields', () => {
  const report = rewriteFixture();
  const allowed = rewriteInput(report).allowedCitations[0]!;
  for (const output of [
    { paragraphBreaks: [], citations: [{ offset: allowed.offset, evidenceKey: 'invented' }] },
    { paragraphBreaks: [report.intake.segments[0]!.startOffset + 2], citations: [] },
    { paragraphBreaks: [], citations: [], text: 'هذا جائز دائمًا' },
    { paragraphBreaks: [], citations: [], verdict: 'supported' },
    {
      paragraphBreaks: [],
      citations: [{ offset: allowed.offset - 1, evidenceKey: allowed.evidenceKey }],
    },
  ])
    expect(() => validateRewrite(report, output)).toThrow('REWRITE_INVALID_CANDIDATE');
});

it('excludes revoked sources and mismatched quotations without completing a partial quotation', () => {
  const report = rewriteFixture();
  report.intake.quotationFindings[0]!.status = 'mismatch';
  expect(rewriteInput(report).allowedCitations).toEqual([]);
  report.intake.quotationFindings[0]!.status = 'exact';
  report.intake.evidence[0]!.approvalStatus = 'revoked';
  expect(rewriteInput(report).allowedCitations).toEqual([]);
  expect(validateRewrite(report, { paragraphBreaks: [], citations: [] }).text).toBe(
    report.intake.originalText,
  );
});

it('retains idempotency and requires the same owner, report binding and attempt before copy', async () => {
  const context = { report: rewriteFixture(), attempt: 1 };
  const generate = vi.fn(async () => ({ paragraphBreaks: [], citations: [] }));
  const service = createRewriteService(generate);
  const candidate = service.create('owner', 'key', context, async () => context);
  expect(service.create('owner', 'key', context, async () => context).id).toBe(candidate.id);
  expect(() => service.copy('owner', candidate.id, context)).toThrow('REWRITE_NOT_VALIDATED');
  await settle();
  expect(generate).toHaveBeenCalledTimes(1);
  expect(service.copy('owner', candidate.id, context)).toBe(context.report.intake.originalText);
  expect(() => service.get('foreign', candidate.id, context)).toThrow('REWRITE_NOT_FOUND');
  expect(() => service.copy('owner', candidate.id, { ...context, attempt: 2 })).toThrow(
    'REWRITE_STALE_REPORT',
  );
  service.close();
});

it('rejects stale evidence/hash after generation and prevents late results after cancellation', async () => {
  const context = { report: rewriteFixture(), attempt: 1 };
  let release!: (value: unknown) => void;
  const service = createRewriteService(() => new Promise((resolve) => (release = resolve)));
  const candidate = service.create('owner', 'key', context, async () => context);
  await settle();
  service.cancel('owner', candidate.id, context);
  release({ paragraphBreaks: [], citations: [] });
  await settle();
  expect(service.get('owner', candidate.id, context)).toMatchObject({
    status: 'cancelled',
    text: null,
  });
  expect(() => service.copy('owner', candidate.id, context)).toThrow('REWRITE_NOT_VALIDATED');
  service.close();
  const stale = createRewriteService(async () => ({ paragraphBreaks: [], citations: [] }));
  const other = stale.create('owner', 'key', context, async () => ({ ...context, attempt: 2 }));
  await settle();
  expect(stale.get('owner', other.id, context)).toMatchObject({
    status: 'failed',
    errorCode: 'stale_report',
  });
  stale.close();
});

it('bounds provider timeout, retries, expiry and UTF16 length and never offers failed text for copy', async () => {
  const context = { report: rewriteFixture(), attempt: 1 };
  let now = 0;
  const service = createRewriteService(
    async () => {
      throw new Error('provider outage');
    },
    { now: () => now, ttlMs: 100 },
  );
  for (let i = 0; i < 3; i++) {
    const task = service.create('owner', String(i), context, async () => context);
    await settle();
    expect(service.get('owner', task.id, context)).toMatchObject({ status: 'failed', text: null });
  }
  expect(() => service.create('owner', 'four', context, async () => context)).toThrow(
    'REWRITE_LIMIT_REACHED',
  );
  now = 101;
  expect(() => service.get('owner', 'missing', context)).toThrow('REWRITE_NOT_FOUND');
  service.close();
  const hung = createRewriteService(() => new Promise(() => {}), { timeoutMs: 5 });
  const task = hung.create('o', 'k', context, async () => context);
  await new Promise((resolve) => setTimeout(resolve, 12));
  expect(hung.get('o', task.id, context).status).toBe('failed');
  hung.close();
  context.report.intake.originalText = '🙂'.repeat(1501);
  context.report.inputSha256 = context.report.intake.revisionSha256 = sha256(
    context.report.intake.originalText,
  );
  context.report.intake.segments = [];
  context.report.intake.quotationFindings = [];
  expect(() => validateRewrite(context.report, { paragraphBreaks: [], citations: [] })).toThrow(
    'REWRITE_INVALID_CANDIDATE',
  );
});

it('pins the model/provider and rejects free prose or oversized provider responses', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          model: REWRITE_MODEL,
          provider: 'OpenAI',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ paragraphBreaks: [], citations: [], text: 'new claim' }),
              },
            },
          ],
        }),
      ),
  );
  const generate = createRewriteGenerator('synthetic-test-key', fetcher);
  await expect(
    generate(rewriteInput(rewriteFixture()), new AbortController().signal),
  ).rejects.toThrow();
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
    model: REWRITE_MODEL,
    provider: { only: ['OpenAI'], allow_fallbacks: false },
  });
  fetcher.mockImplementation(async () => new Response('x'.repeat(40001)));
  await expect(
    generate(rewriteInput(rewriteFixture()), new AbortController().signal),
  ).rejects.toThrow('REWRITE_RESPONSE_TOO_LARGE');
});

it('protects whole Quran/parenthesized/brace quotations, including faithful partial spans', () => {
  for (const [open, close] of [
    ['﴿', '﴾'],
    ['(', ')'],
    ['{', '}'],
    ['«', '»'],
  ]) {
    const report = rewriteFixture();
    const text = `قال تعالى: ${open}نص أول. مقتطف تجريبي آخر${close} فلا يجوز إلا بشرط.`;
    report.intake.originalText = text;
    report.inputSha256 = report.intake.revisionSha256 = sha256(text);
    const segment = report.intake.segments[0]!;
    segment.startOffset = text.indexOf(SYNTHETIC_QUOTE);
    segment.endOffset = segment.startOffset + SYNTHETIC_QUOTE.length;
    segment.codePointStart = segment.startOffset;
    segment.codePointEnd = segment.endOffset;
    report.intake.quotationFindings[0]!.status = 'partial';
    report.intake.quotationFindings[0]!.comparison = {
      fidelity: 'exact',
      extent: 'excerpt',
      differences: [],
      basis: 'canonical',
    };
    const input = rewriteInput(report);
    expect(input.paragraphOffsets.some((offset) => offset < text.indexOf(close!))).toBe(false);
    expect(input.allowedCitations).toEqual([]);
    // A faithful excerpt may be attributed when it is the whole quoted excerpt;
    // incomplete coverage of the reference is not a wording error.
    const faithful = `قال تعالى: ${open}${SYNTHETIC_QUOTE}${close} فلا يجوز إلا بشرط.`;
    report.intake.originalText = faithful;
    report.inputSha256 = report.intake.revisionSha256 = sha256(faithful);
    segment.startOffset = faithful.indexOf(SYNTHETIC_QUOTE);
    segment.endOffset = segment.startOffset + SYNTHETIC_QUOTE.length;
    segment.codePointStart = segment.startOffset;
    segment.codePointEnd = segment.endOffset;
    const citation = rewriteInput(report).allowedCitations[0]!;
    expect(citation.offset).toBe(faithful.indexOf(close!) + 1);
    const result = validateRewrite(report, {
      paragraphBreaks: [],
      citations: [{ offset: citation.offset, evidenceKey: citation.evidenceKey }],
    });
    expect(result.text).toContain(`${close} [`);
  }
});

it('keeps the length-budget notice within the candidate schema at maximum unresolved coverage', async () => {
  const report = rewriteFixture();
  report.intake.originalText += 'ا'.repeat(2982 - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  // Repeated findings exercise the bounded notices independently of extraction.
  const finding = report.intake.quotationFindings[0]!;
  report.intake.quotationFindings.push(
    ...Array.from({ length: 79 }, () => ({ ...finding, status: 'mismatch' as const })),
  );
  report.semanticAssessment = {
    schemaVersion: 1,
    status: 'partial',
    provisional: true,
    scholarlyApproval: false,
    errorCode: null,
    assessments: [],
    limitations: [],
    claims: Array.from({ length: 5 }, (_, i) => ({
      id: `claim-${String(i).repeat(24)}`,
      segmentId: 'author',
      originalText: 'عبارة تحتاج مراجعة',
      startOffset: 0,
      endOffset: 18,
      provisional: true,
      evidenceKeys: [],
    })),
    trace: {
      pipelineVersion: SEMANTIC_PIPELINE_VERSION,
      promptVersion: SEMANTIC_PROMPT_VERSION,
      inputSha256: report.inputSha256,
      evidenceSha256: 'd'.repeat(64),
      extractionInputSha256: null,
      assessmentInputSha256: null,
      requests: [],
    },
  };
  const context = { report, attempt: 1 };
  const allowed = rewriteInput(report).allowedCitations[0]!;
  const service = createRewriteService(async () => ({
    paragraphBreaks: [],
    citations: [{ offset: allowed.offset, evidenceKey: allowed.evidenceKey }],
  }));
  const candidate = service.create('owner', 'budget', context, async () => context);
  expect(candidate.unresolved).toHaveLength(85);
  await settle();
  const result = service.get('owner', candidate.id, context);
  expect(result.status).toBe('validated');
  expect(result.unresolved[0]).toContain('٣٠٠٠');
  expect(result.unresolved).toHaveLength(85);
  expect(RewriteCandidateSchema.safeParse(result).success).toBe(true);
  service.close();
});

it('retains the whole 2982-character original and omits additions that exceed its bounded budget', () => {
  const report = rewriteFixture();
  const padding = 'ا'.repeat(2982 - report.intake.originalText.length);
  report.intake.originalText += padding;
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  const citation = rewriteInput(report).allowedCitations[0]!;
  const result = validateRewrite(report, {
    paragraphBreaks: [],
    citations: [{ offset: citation.offset, evidenceKey: citation.evidenceKey }],
  });
  expect(result).toMatchObject({
    text: report.intake.originalText,
    budgetLimited: true,
    operations: { citations: [] },
  });
});

it('cancellation before a late create is an idempotent tombstone without a provider call', async () => {
  const context = { report: rewriteFixture(), attempt: 1 };
  const generate = vi.fn(async () => ({ paragraphBreaks: [], citations: [] }));
  const service = createRewriteService(generate);
  const cancelled = service.cancelKey('owner', 'key', context);
  expect(service.create('owner', 'key', context, async () => context)).toMatchObject({
    id: cancelled.id,
    status: 'cancelled',
  });
  await settle();
  expect(generate).not.toHaveBeenCalled();
  service.close();
});
