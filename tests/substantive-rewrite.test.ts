import { expect, it, vi } from 'vitest';
import { foundationReportFixture } from '../apps/web/src/foundation-report.fixtures.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { createRewriteService, rewriteInput } from '../apps/api/src/rewrite.js';
import {
  authorRewriteInput,
  validateAuthorRewrite,
  validateAuthorVerification,
} from '../apps/api/src/substantive-rewrite.js';
import {
  SEMANTIC_PIPELINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
} from '../packages/contracts/src/semantic-assessment.js';
import {
  createAuthorRewriteGenerator,
  createAuthorRewriteVerifier,
  REWRITE_MODEL,
} from '../apps/api/src/rewrite-provider.js';

// Owned editorial control; no religious accuracy or scholarly label.
function fixture() {
  const report = foundationReportFixture(),
    author = 'إن الكاتب لازم عليه انه يحفظ الحقوق إلا إذا تعذر ذلك.',
    quote = 'مقتطف تجريبي';
  const text = `«${quote}» ${author} هذا ادعاء آخر غير مدعوم.`;
  report.intake.originalText = text;
  report.inputSha256 = report.intake.revisionSha256 = sha256(text);
  report.intake.evidence[0]!.originalText = `${quote}. يجب حفظ الحقوق إلا إذا تعذر ذلك.`;
  report.intake.evidence[0]!.originalSha256 = sha256(report.intake.evidence[0]!.originalText);
  const q = report.intake.segments[0]!;
  q.startOffset = q.codePointStart = 1;
  q.endOffset = q.codePointEnd = 1 + quote.length;
  report.intake.quotationFindings[0]!.matchedStart = 0;
  report.intake.quotationFindings[0]!.matchedEnd = quote.length;
  const start = text.indexOf(author);
  report.intake.segments.push({
    id: 'author',
    startOffset: start,
    endOffset: start + author.length,
    codePointStart: start,
    codePointEnd: start + author.length,
    originalText: author,
    role: 'author_text',
    roleStatus: 'unresolved',
    method: 'owned-control',
    sourceKeys: [],
    roleProposal: null,
    conflict: false,
  });
  const claim = {
    id: `claim-${'a'.repeat(24)}`,
    segmentId: 'author',
    originalText: author,
    startOffset: start,
    endOffset: start + author.length,
    provisional: true as const,
    evidenceKeys: ['source'],
  };
  report.semanticAssessment = {
    schemaVersion: 1,
    status: 'completed',
    provisional: true,
    scholarlyApproval: false,
    errorCode: null,
    claims: [claim],
    assessments: [
      {
        claimId: claim.id,
        status: 'supported',
        conditions: [],
        negations: [],
        exceptions: ['إلا إذا تعذر ذلك'],
        scope: [],
        citations: [{ evidenceKey: 'source', excerpt: 'يجب حفظ الحقوق إلا إذا تعذر ذلك.' }],
        explanation: 'اختبار حفظ المعنى فقط.',
      },
    ],
    limitations: [],
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
  const op = {
    claimId: claim.id,
    originalText: author,
    replacementText: 'على الكاتب حفظ الحقوق، إلا إذا تعذر ذلك.',
    evidenceKeys: ['source'],
  };
  const operations = {
    replacements: [op],
    paragraphBreaks: [],
    citations: [{ offset: claim.endOffset, evidenceKey: 'source' }],
  };
  const verification = {
    schemaVersion: 2 as const,
    checks: [
      {
        claimId: claim.id,
        meaningPreserved: true,
        evidenceSupported: true,
        conditionsPreserved: true,
        negationsPreserved: true,
        exceptionsPreserved: true,
        scopePreserved: true,
        modalityPreserved: true,
        citations: [{ evidenceKey: 'source', excerpt: 'يجب حفظ الحقوق إلا إذا تعذر ذلك.' }],
        explanation: 'تحسين الصياغة مع حفظ الاستثناء.',
      },
    ],
  };
  return { report, operations, verification };
}
const settle = () => new Promise((r) => setTimeout(r, 10));

it('lists every source used by a validated author replacement once under References', () => {
  const { report, operations } = fixture();
  const second = structuredClone(report.intake.evidence[0]!);
  second.snapshotKey = 'second-source';
  second.work = 'مصدر ثان للاختبار';
  second.reference = '2';
  report.intake.evidence.push(second);
  const unused = structuredClone(second);
  unused.snapshotKey = 'unused-source';
  unused.work = 'مصدر غير مستخدم';
  report.intake.evidence.push(unused);
  report.semanticAssessment!.claims[0]!.evidenceKeys.push(second.snapshotKey);
  report.semanticAssessment!.assessments[0]!.citations.push({
    evidenceKey: second.snapshotKey,
    excerpt: 'يجب حفظ الحقوق إلا إذا تعذر ذلك.',
  });
  operations.replacements[0]!.evidenceKeys.push(second.snapshotKey);
  const quoteCitation = rewriteInput(report).allowedCitations[0]!;
  operations.citations.push({ offset: quoteCitation.offset, evidenceKey: 'source' });
  const valid = validateAuthorRewrite(report, operations);
  expect(valid.text).toContain('«مقتطف تجريبي» [1]');
  expect(valid.text).toContain(`${operations.replacements[0]!.replacementText} [1]`);
  const references = valid.text.split('\n\nReferences\n');
  expect(references).toHaveLength(2);
  expect(references[1]!.split('\n')).toHaveLength(2);
  expect(references[1]).toMatch(/^1\. /u);
  expect(references[1]).toContain('\n2. مصدر ثان للاختبار');
  expect(references[1]).toContain('مصدر بحثي غير معتمد');
  expect(valid.text).not.toContain('مصدر غير مستخدم');
});

it('labels a supported-author safe skip with valid citations as attribution rather than verified author wording', async () => {
  const { report, operations } = fixture();
  const claim = report.semanticAssessment!.claims[0]!;
  // Complete owned editorial control: no additional unreviewed author span.
  report.intake.originalText = report.intake.originalText.slice(0, claim.endOffset);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  report.semanticAssessment!.trace.claimCoverage = {
    inventoryVersion: 'original-span-v1',
    candidates: [
      {
        candidateId: claim.id,
        segmentId: claim.segmentId,
        startOffset: claim.startOffset,
        endOffset: claim.endOffset,
      },
    ],
    excluded: [],
    selectedIds: [claim.id],
    unselectedIds: [],
    claimLimitReached: false,
  };
  const generate = vi.fn(
    async (_input: Parameters<ReturnType<typeof createAuthorRewriteGenerator>>[0]) => ({
      ...operations,
      replacements: [],
    }),
  );
  const verifier = vi.fn(async () => {
    throw new Error('There is no changed author wording to verify.');
  });
  const context = { report, attempt: 1 };
  const reload = vi.fn(async () => context);
  const service = createRewriteService(generate, { verifier, requireCompleteEvidence: true });
  try {
    const task = service.create('owner', 'safe-author-skip', context, reload);
    await vi.waitFor(() => expect(service.get('owner', task.id, context).status).toBe('validated'));
    const candidate = service.get('owner', task.id, context);
    expect(candidate).toMatchObject({
      status: 'validated',
      mode: 'citation_and_layout_only',
      operations: { replacements: [], citations: operations.citations },
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]![0].authorClaims).toHaveLength(1);
    expect(verifier).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
    expect(service.copy('owner', task.id, context)).toBe(candidate.text);
    expect(candidate.text).toContain(claim.originalText);
    expect(() => service.copy('other', task.id, context)).toThrow('REWRITE_NOT_FOUND');
    expect(() => service.copy('owner', task.id, { ...context, attempt: 2 })).toThrow(
      'REWRITE_STALE_REPORT',
    );
  } finally {
    service.close();
  }
});

it('uses room freed by an author replacement for its exact source citation', () => {
  const { report, operations } = fixture();
  const source = report.intake.evidence[0]!;
  // Synthetic labels keep this regression about length accounting, not approval.
  source.work = 'حقوق';
  source.author = null;
  source.reference = '1';
  source.approvalStatus = 'approved';
  source.researchOnly = false;
  report.intake.originalText += 'ا'.repeat(2980 - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  const valid = validateAuthorRewrite(report, operations);
  expect(valid.operations.citations).toEqual(operations.citations);
  expect(valid.text).toContain(' [1]');
  expect(valid.text).toContain('\n\nReferences\n1. حقوق — 1');
  expect(valid.text.length).toBeLessThanOrEqual(3000);
  expect(valid.text).toContain(operations.replacements[0]!.replacementText);
});

it('reconstructs the same replacement-aware citation budget during fresh server copy', async () => {
  const { report, operations, verification } = fixture();
  const source = report.intake.evidence[0]!;
  source.work = 'حقوق';
  source.author = null;
  source.reference = '1';
  source.approvalStatus = 'approved';
  source.researchOnly = false;
  report.intake.originalText += 'ا'.repeat(2980 - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  const context = { report, attempt: 1 };
  const service = createRewriteService(async () => operations, {
    verifier: async () => verification,
  });
  const task = service.create('owner', 'budget-copy', context, async () => context);
  await settle();
  const candidate = service.get('owner', task.id, context);
  expect(candidate.status).toBe('validated');
  expect(candidate.operations!.citations).toHaveLength(1);
  expect(service.copy('owner', task.id, context)).toBe(candidate.text);
  expect(candidate.text).toContain(' [1]');
  expect(candidate.text).toContain('\n\nReferences\n1. حقوق — 1');
  service.close();
});

it('omits an optional citation that no longer fits after an author expansion rather than rejecting the author candidate', () => {
  const { report, operations } = fixture();
  operations.replacements[0]!.replacementText =
    'يجب على الكاتب أن يحفظ الحقوق وأن يصون هذه الحقوق، إلا إذا تعذر عليه ذلك.';
  const allowed = rewriteInput(report).allowedCitations.find(
    (c) => c.offset === operations.citations[0]!.offset,
  )!;
  const referenceList = `\n\nReferences\n1. ${allowed.reference}${allowed.pending ? ' — مصدر بحثي غير معتمد' : ''}`;
  const expansion =
    operations.replacements[0]!.replacementText.length -
    operations.replacements[0]!.originalText.length;
  const originalLength = 3000 - referenceList.length - expansion - 2;
  report.intake.originalText += 'ا'.repeat(originalLength - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  const valid = validateAuthorRewrite(report, operations);
  expect(valid.operations.citations).toEqual([]);
  expect(valid.budgetLimited).toBe(true);
  expect(valid.text).toContain(operations.replacements[0]!.replacementText);
  expect(valid.text).toContain('«مقتطف تجريبي»');
  expect(valid.text).toContain(referenceList);
  expect(valid.text.length).toBeLessThanOrEqual(3000);
});

it('withholds an author candidate when its required bibliography cannot fit without truncation', () => {
  const { report, operations } = fixture();
  report.intake.originalText += 'ا'.repeat(3000 - report.intake.originalText.length);
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.semanticAssessment!.trace.inputSha256 = report.inputSha256;
  const original = report.intake.originalText;
  expect(() => validateAuthorRewrite(report, operations)).toThrow('REWRITE_INVALID_CANDIDATE');
  expect(report.intake.originalText).toBe(original);
});

it('records only the typed failing verifier check and packet hashes when diagnostics are explicitly enabled', async () => {
  const { report, operations, verification } = fixture();
  verification.checks[0]!.scopePreserved = false;
  const receipts: unknown[] = [];
  const service = createRewriteService(async () => operations, {
    verifier: async () => verification,
    onFailureDiagnostic: (receipt) => receipts.push(receipt),
  });
  const context = { report, attempt: 1 };
  const task = service.create('owner', 'diagnostic', context, async () => context);
  await settle();
  expect(service.get('owner', task.id, context)).toMatchObject({ status: 'failed', text: null });
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    event: 'rewrite_failed',
    stage: 'verification_validation',
    reason: 'scope_changed',
    inputSha256: report.inputSha256,
    evidenceStateSha256: report.evidenceStateSha256,
    operationsSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    verificationSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
  const serialized = JSON.stringify(receipts[0]);
  for (const excluded of [
    report.intake.originalText,
    operations.replacements[0]!.replacementText,
    report.intake.evidence[0]!.originalText,
    report.reviewId,
    report.revisionId,
    'owner',
    'diagnostic',
  ])
    expect(serialized).not.toContain(excluded);
  expect(() => service.copy('owner', task.id, context)).toThrow('REWRITE_NOT_VALIDATED');
  service.close();
});

it('distinguishes generation and operation binding failures without logging raw provider errors or affecting withholding', async () => {
  const { report, operations } = fixture();
  const context = { report, attempt: 1 };
  const receipts: unknown[] = [];
  operations.replacements[0]!.claimId = 'unknown';
  const service = createRewriteService(async () => operations, {
    verifier: vi.fn(),
    onFailureDiagnostic: (receipt) => receipts.push(receipt),
  });
  const task = service.create('owner', 'binding', context, async () => context);
  await settle();
  expect(receipts[0]).toMatchObject({
    stage: 'candidate_validation',
    reason: 'claim_binding',
    verificationSha256: null,
  });
  expect(service.get('owner', task.id, context)).toMatchObject({ status: 'failed', text: null });
  service.close();
  const provider = createRewriteService(
    async () => {
      throw Error('private provider key or response');
    },
    {
      onFailureDiagnostic: (receipt) => {
        receipts.push(receipt);
        throw Error('observer failed');
      },
    },
  );
  const failed = provider.create('owner', 'provider', context, async () => context);
  await settle();
  expect(receipts[1]).toMatchObject({
    stage: 'generation',
    reason: 'provider_unavailable',
    operationsSha256: null,
    verificationSha256: null,
  });
  expect(JSON.stringify(receipts[1])).not.toContain('private provider');
  expect(provider.get('owner', failed.id, context)).toMatchObject({ status: 'failed', text: null });
  provider.close();
});

it.each(['cancel', 'cancelKey', 'close'] as const)(
  'does not label %s as a deadline failure in optional receipts',
  async (action) => {
    const { report } = fixture();
    const context = { report, attempt: 1 };
    const diagnostic = vi.fn();
    const service = createRewriteService(() => new Promise(() => {}), {
      onFailureDiagnostic: diagnostic,
    });
    const task = service.create('owner', 'cancel-diagnostic', context, async () => context);
    await settle();
    if (action === 'close') service.close();
    else if (action === 'cancelKey') service.cancelKey('owner', 'cancel-diagnostic', context);
    else service.cancel('owner', task.id, context);
    await settle();
    expect(diagnostic).not.toHaveBeenCalled();
    if (action !== 'close')
      expect(service.get('owner', task.id, context)).toMatchObject({
        status: 'cancelled',
        text: null,
      });
    service.close();
  },
);

it('records a genuine task deadline as a deadline and still withholds generated text', async () => {
  const { report } = fixture();
  const context = { report, attempt: 1 };
  const diagnostic = vi.fn();
  const service = createRewriteService(() => new Promise(() => {}), {
    timeoutMs: 5,
    onFailureDiagnostic: diagnostic,
  });
  const task = service.create('owner', 'timeout-diagnostic', context, async () => context);
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(diagnostic).toHaveBeenCalledOnce();
  expect(diagnostic.mock.calls[0]![0]).toMatchObject({ stage: 'deadline', reason: 'deadline' });
  expect(service.get('owner', task.id, context)).toMatchObject({ status: 'failed', text: null });
  service.close();
});
it.each(['revoked', 'rejected'] as const)(
  'excludes a supported commentary whose canonical parent is %s',
  (approvalStatus) => {
    const { report } = fixture(),
      child = report.intake.evidence[0]!;
    const parent = {
      ...child,
      snapshotKey: 'parent',
      sourceId: 'parent',
      sourceRole: 'quran_text' as const,
      parentSnapshotKey: null,
      approvalStatus,
    };
    child.sourceRole = 'tafsir_commentary';
    child.parentSnapshotKey = 'parent';
    report.intake.evidence.push(parent);
    report.intake.segments[0]!.role = 'ayah';
    report.intake.segments[0]!.sourceKeys = ['parent'];
    report.intake.quotationFindings[0]!.evidenceKey = 'parent';
    expect(authorRewriteInput(report).authorClaims).toEqual([]);
  },
);
it('improves actual author wording and preserves exact quotation, exception, pending source label and unreviewed text', () => {
  const { report, operations } = fixture(),
    valid = validateAuthorRewrite(report, operations);
  expect(valid.text).toContain('على الكاتب حفظ الحقوق، إلا إذا تعذر ذلك.');
  expect(valid.text).not.toContain('لازم عليه انه');
  expect(valid.text).toContain('«مقتطف تجريبي»');
  expect(valid.text).toContain('هذا ادعاء آخر غير مدعوم.');
  expect(valid.text).toContain('مصدر بحثي غير معتمد');
});
it('does not expose copy until the separate verifier completes and binds its exact output for copy', async () => {
  const { report, operations, verification } = fixture(),
    context = { report, attempt: 1 };
  let release!: (x: unknown) => void;
  const verifier = vi.fn(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const service = createRewriteService(async () => operations, { verifier });
  const candidate = service.create('owner', 'key', context, async () => context);
  await settle();
  expect(verifier).toHaveBeenCalledTimes(1);
  expect(() => service.copy('owner', candidate.id, context)).toThrow('REWRITE_NOT_VALIDATED');
  release(verification);
  await settle();
  expect(service.get('owner', candidate.id, context).mode).toBe('supported_author_wording');
  expect(service.copy('owner', candidate.id, context)).toContain(
    operations.replacements[0]!.replacementText,
  );
  expect(() => service.copy('other', candidate.id, context)).toThrow('REWRITE_NOT_FOUND');
  service.close();
});
it.each([
  'meaningPreserved',
  'evidenceSupported',
  'conditionsPreserved',
  'negationsPreserved',
  'exceptionsPreserved',
  'scopePreserved',
  'modalityPreserved',
] as const)(
  'rejects a negative independent %s check without offering candidate text',
  async (field) => {
    const { report, operations, verification } = fixture();
    verification.checks[0]![field] = false;
    const service = createRewriteService(async () => operations, {
        verifier: async () => verification,
      }),
      context = { report, attempt: 1 };
    const candidate = service.create('owner', 'key', context, async () => context);
    await settle();
    expect(service.get('owner', candidate.id, context)).toMatchObject({
      status: 'failed',
      text: null,
      errorCode: 'invalid_candidate',
    });
    service.close();
  },
);
it('rejects unknown claims, source changes, quote changes, overlaps, punctuation-only edits, unrelated verifier citations and missing checks', () => {
  const { report, operations, verification } = fixture();
  for (const replacement of [
    { ...operations.replacements[0]!, claimId: 'unknown' },
    { ...operations.replacements[0]!, evidenceKeys: ['invented'] },
    { ...operations.replacements[0]!, replacementText: '«قول جديد»' },
    {
      ...operations.replacements[0]!,
      replacementText: operations.replacements[0]!.originalText.replace('.', '!'),
    },
  ])
    expect(() =>
      validateAuthorRewrite(report, { ...operations, replacements: [replacement] }),
    ).toThrow('REWRITE_INVALID_CANDIDATE');
  expect(() =>
    validateAuthorRewrite(report, {
      ...operations,
      replacements: [...operations.replacements, ...operations.replacements],
    }),
  ).toThrow('REWRITE_INVALID_CANDIDATE');
  expect(() =>
    validateAuthorVerification(authorRewriteInput(report), operations, { checks: [] }),
  ).toThrow('REWRITE_INVALID_CANDIDATE');
  verification.checks[0]!.citations[0]!.excerpt = 'ليس في المصدر';
  expect(() =>
    validateAuthorVerification(authorRewriteInput(report), operations, verification),
  ).toThrow('REWRITE_INVALID_CANDIDATE');
  report.semanticAssessment!.assessments[0]!.status = 'contradicted';
  expect(authorRewriteInput(report).authorClaims).toEqual([]);
  expect(() => validateAuthorRewrite(report, operations)).toThrow('REWRITE_INVALID_CANDIDATE');
});
it('requires a separate modality verdict even when prior preservation checks are positive', () => {
  const { report, operations, verification } = fixture();
  const { modalityPreserved: _omitted, ...legacyCheck } = verification.checks[0]!;
  expect(() =>
    validateAuthorVerification(authorRewriteInput(report), operations, {
      schemaVersion: 2,
      checks: [legacyCheck],
    }),
  ).toThrow('REWRITE_INVALID_CANDIDATE');
});
it('refuses stale or cancelled verification and verifier outages; unsupported meaning is never silently corrected', async () => {
  const { report, operations, verification } = fixture(),
    context = { report, attempt: 1 };
  let release!: (x: unknown) => void;
  const service = createRewriteService(async () => operations, {
    verifier: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const candidate = service.create('owner', 'key', context, async () => context);
  await settle();
  service.cancel('owner', candidate.id, context);
  release(verification);
  await settle();
  expect(service.get('owner', candidate.id, context).status).toBe('cancelled');
  service.close();
  const unavailable = createRewriteService(async () => operations, {
    verifier: async () => {
      throw Error('provider outage');
    },
  });
  const failed = unavailable.create('owner', 'key', context, async () => context);
  await settle();
  expect(unavailable.get('owner', failed.id, context)).toMatchObject({
    status: 'failed',
    text: null,
    errorCode: 'provider_unavailable',
  });
  unavailable.close();
});
it('requests generator and independent verifier as separate strict pinned calls with source evidence and mutual meaning checks', async () => {
  const { report, operations, verification } = fixture(),
    bodies: any[] = [];
  const fetcher = vi.fn(async (_url: any, init: any) => {
    const b = JSON.parse(init.body);
    bodies.push(b);
    return new Response(
      JSON.stringify({
        model: REWRITE_MODEL,
        provider: 'OpenAI',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(bodies.length === 1 ? operations : verification) },
          },
        ],
      }),
    );
  });
  const input = authorRewriteInput(report),
    signal = new AbortController().signal;
  await createAuthorRewriteGenerator('owned-test', fetcher)(input, signal);
  await createAuthorRewriteVerifier('owned-test', fetcher)(input, operations, signal);
  expect(bodies).toHaveLength(2);
  expect(bodies[0].response_format.json_schema.name).toBe('author_rewrite');
  expect(bodies[1].response_format.json_schema.name).toBe('author_preservation');
  expect(bodies[1].messages[0].content).toContain('BOTH original entails replacement');
  expect(bodies[0].messages[0].content).toContain('not required');
  expect(bodies[0].messages[0].content).toContain('ambiguous');
  expect(bodies[1].messages[0].content).toContain('modalityPreserved');
  expect(bodies[1].messages[0].content).toContain('ما لازم نطيعهم');
  expect(bodies[1].response_format.json_schema.schema.properties.schemaVersion.const).toBe(2);
  expect(bodies[1].response_format.json_schema.schema.properties.checks.items.required).toContain(
    'modalityPreserved',
  );
  expect(bodies[1].messages[1].content).toContain('passages');
});
