import { expect, it, vi } from 'vitest';
import {
  foundationReportFixture,
  SYNTHETIC_QUOTE,
} from '../apps/web/src/foundation-report.fixtures.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { createRewriteService } from '../apps/api/src/rewrite.js';
import { authorRewriteInput } from '../apps/api/src/substantive-rewrite.js';
import {
  createAuthorRewriteGenerator,
  createAuthorRewriteVerifier,
  REWRITE_MODEL,
  AUTHOR_REWRITE_GENERATOR_POLICY,
} from '../apps/api/src/rewrite-provider.js';
import {
  SEMANTIC_PIPELINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
} from '../packages/contracts/src/semantic-assessment.js';

// Controlled pipeline fixture mirrors the captured comparison pattern.
// Its source/support/verifier fields are synthetic, not religious acceptance.
function control() {
  const report = foundationReportFixture();
  const original = 'إخفاء الصدقة وإعطاؤها للفقراء خير للمتصدق';
  report.intake.originalText = `«${SYNTHETIC_QUOTE}» ${original}.`;
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  const quote = report.intake.segments[0]!;
  quote.startOffset = quote.codePointStart = 1;
  quote.endOffset = quote.codePointEnd = 1 + SYNTHETIC_QUOTE.length;
  const evidence = report.intake.evidence[0]!;
  evidence.originalText = `${SYNTHETIC_QUOTE}. إخفاء الصدقة خير من إظهارها.`;
  evidence.originalSha256 = sha256(evidence.originalText);
  report.intake.quotationFindings[0]!.matchedStart = 0;
  report.intake.quotationFindings[0]!.matchedEnd = SYNTHETIC_QUOTE.length;
  const start = report.intake.originalText.indexOf(original);
  const claim = {
    id: `claim-${'a'.repeat(24)}`,
    segmentId: 'author',
    originalText: original,
    startOffset: start,
    endOffset: start + original.length,
    provisional: true as const,
    evidenceKeys: ['source'],
  };
  report.intake.segments.push({
    id: 'author',
    startOffset: start,
    endOffset: claim.endOffset,
    codePointStart: start,
    codePointEnd: claim.endOffset,
    originalText: original,
    role: 'author_text',
    roleStatus: 'unresolved',
    method: 'owned-scope-control',
    sourceKeys: [],
    roleProposal: null,
    conflict: false,
  });
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
        exceptions: [],
        scope: [],
        citations: [{ evidenceKey: 'source', excerpt: 'إخفاء الصدقة خير من إظهارها.' }],
        explanation: 'Controlled pipeline input only.',
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
      claimCoverage: {
        inventoryVersion: 'original-span-v1',
        candidates: [
          {
            candidateId: claim.id,
            segmentId: claim.segmentId,
            startOffset: claim.startOffset,
            endOffset: claim.endOffset,
          },
        ],
        selectedIds: [claim.id],
        unselectedIds: [],
        excluded: [],
        claimLimitReached: false,
      },
    },
  };
  const operations = {
    replacements: [
      {
        claimId: claim.id,
        originalText: original,
        replacementText: 'يكون إخفاء الصدقة وإعطاؤها للفقراء خيرًا للمتصدق من إظهارها',
        evidenceKeys: ['source'],
      },
    ],
    paragraphBreaks: [],
    citations: [{ offset: claim.endOffset, evidenceKey: 'source' }],
  };
  const verification = {
    schemaVersion: 2,
    checks: [
      {
        claimId: claim.id,
        meaningPreserved: false,
        evidenceSupported: true,
        conditionsPreserved: true,
        negationsPreserved: true,
        exceptionsPreserved: true,
        scopePreserved: false,
        modalityPreserved: true,
        citations: [{ evidenceKey: 'source', excerpt: 'إخفاء الصدقة خير من إظهارها.' }],
        explanation: 'أضيفت مقارنة ليست مصرحًا بها في عبارة الكاتب.',
      },
    ],
  };
  return { report, operations, verification };
}
function envelope(value: unknown) {
  return new Response(
    JSON.stringify({
      model: REWRITE_MODEL,
      provider: 'OpenAI',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
    }),
  );
}

it('sends an explicit no-import/no-new-comparison generator policy with the unchanged author/source packet', async () => {
  const { report, operations } = control();
  const input = authorRewriteInput(report);
  const snapshot = structuredClone(input);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(envelope(operations));
  await createAuthorRewriteGenerator('synthetic-test', fetcher)(
    input,
    new AbortController().signal,
  );
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(body.messages[0].content).toContain(
    'Source support does not authorize adding source details to author wording',
  );
  expect(body.messages[0].content).toContain(
    'Do not introduce a new comparison or make an implicit comparison explicit',
  );
  expect(body.messages[0].content).toContain(
    'return replacements:[] with useful allowed citations',
  );
  expect(body.messages[0].content).toContain('من إظهارها');
  expect(JSON.parse(body.messages[1].content)).toEqual(snapshot);
  expect(input).toEqual(snapshot);
  expect(body.response_format.json_schema.schema.properties.replacements.items.required).toContain(
    'evidenceKeys',
  );
});

for (const [meaningPreserved, reason] of [
  [false, 'meaning_changed'],
  [true, 'scope_changed'],
] as const) {
  it(`continues withholding the source-supported comparison pattern for ${reason}, with no provider opinion replacement`, async () => {
    const { report, operations, verification } = control();
    verification.checks[0]!.meaningPreserved = meaningPreserved;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(operations))
      .mockResolvedValueOnce(envelope(verification));
    const diagnostic = vi.fn();
    const backup = { apiKey: 'unused-synthetic-backup', secondaryApiKey: 'unused-second-backup' };
    const context = { report, attempt: 1 };
    const service = createRewriteService(
      createAuthorRewriteGenerator('synthetic-test', fetcher, backup),
      {
        verifier: createAuthorRewriteVerifier('synthetic-test', fetcher, backup),
        requireCompleteEvidence: true,
        onFailureDiagnostic: diagnostic,
      },
    );
    try {
      const candidate = service.create('owned', 'comparison', context, async () => context);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(service.get('owned', candidate.id, context)).toMatchObject({
        status: 'failed',
        text: null,
        errorCode: 'invalid_candidate',
      });
      expect(diagnostic).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'verification_validation', reason }),
      );
      expect(() => service.copy('owned', candidate.id, context)).toThrow('REWRITE_NOT_VALIDATED');
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(
        fetcher.mock.calls.every(
          ([url]) => url === 'https://openrouter.ai/api/v1/chat/completions',
        ),
      ).toBe(true);
      const verifierBody = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
      expect(verifierBody.messages[0].content).toContain(
        'BOTH original entails replacement and replacement entails original',
      );
      expect(verifierBody.messages[0].content).not.toContain(AUTHOR_REWRITE_GENERATOR_POLICY);
      expect(JSON.parse(verifierBody.messages[1].content).replacements[0].replacementText).toBe(
        operations.replacements[0]!.replacementText,
      );
    } finally {
      service.close();
    }
  });
}

it('allows a controlled safe skip with exact attribution and fresh copy without claiming author verification', async () => {
  const { report, operations } = control();
  const skip = { ...operations, replacements: [] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(envelope(skip));
  const context = { report, attempt: 1 };
  const service = createRewriteService(createAuthorRewriteGenerator('synthetic-test', fetcher), {
    verifier: createAuthorRewriteVerifier('synthetic-test', fetcher),
    requireCompleteEvidence: true,
  });
  try {
    const task = service.create('owned', 'safe-skip', context, async () => context);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const candidate = service.get('owned', task.id, context);
    expect(candidate).toMatchObject({
      status: 'validated',
      mode: 'citation_and_layout_only',
      operations: { replacements: [], citations: skip.citations },
    });
    expect(service.copy('owned', task.id, context)).toBe(candidate.text);
    expect(candidate.text).toContain(operations.replacements[0]!.originalText);
    expect(candidate.text).not.toContain('من إظهارها');
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    service.close();
  }
});
