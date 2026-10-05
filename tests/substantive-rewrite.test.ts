import { expect, it, vi } from 'vitest';
import { foundationReportFixture } from '../apps/web/src/foundation-report.fixtures.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { createRewriteService } from '../apps/api/src/rewrite.js';
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
    checks: [
      {
        claimId: claim.id,
        meaningPreserved: true,
        evidenceSupported: true,
        conditionsPreserved: true,
        negationsPreserved: true,
        exceptionsPreserved: true,
        scopePreserved: true,
        citations: [{ evidenceKey: 'source', excerpt: 'يجب حفظ الحقوق إلا إذا تعذر ذلك.' }],
        explanation: 'تحسين الصياغة مع حفظ الاستثناء.',
      },
    ],
  };
  return { report, operations, verification };
}
const settle = () => new Promise((r) => setTimeout(r, 10));
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
  expect(bodies[1].messages[1].content).toContain('passages');
});
