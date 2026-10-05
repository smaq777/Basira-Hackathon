import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../apps/api/src/foundation.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';
const TEXT =
  'الحديث الضعيف درجات، فمنه ضعف محتمل يمكن أن ينجبر بتعدد الطرق، ومنه ضعف شديد لا ينجبر بمجرد ذلك.';
function fixture(text = TEXT): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'public-statement-selection-replay',
    corpusVersion: 'owned-empty',
    revisionId: randomUUID(),
    revisionSha256: sha256(text),
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    evidence: [],
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 'author',
        startOffset: 0,
        endOffset: text.length,
        codePointStart: 0,
        codePointEnd: Array.from(text).length,
        originalText: text,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'public-diagnostic',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
  };
}
const response = (payload: unknown, model: string) =>
  new Response(
    JSON.stringify({
      model,
      provider: 'owned',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }),
  );
it('recovers a valid model-selected source-free assertion after the recorded empty selection, then keeps absent evidence unavailable', async () => {
  let selections = 0;
  const requests: any[] = [];
  const fetcher = vi.fn(async (_url: any, init: any) => {
    const body = JSON.parse(init.body),
      data = JSON.parse(body.messages[1].content).untrustedData;
    requests.push(body);
    if (body.response_format.json_schema.name === 'extraction') {
      selections++;
      return response(
        {
          claims:
            selections === 1
              ? []
              : [{ candidateId: data.candidates[0].candidateId, evidenceKeys: [] }],
        },
        body.model,
      );
    }
    return response(
      {
        assessments: [
          {
            claimId: data.claims[0].claim.id,
            status: 'insufficient_context',
            conditions: [],
            negations: [],
            exceptions: [],
            scope: [],
            citations: [],
            explanation: 'لم تتوفر أدلة مستقلة لهذا الادعاء.',
          },
        ],
      },
      body.model,
    );
  });
  const report = await createSemanticAssessmentAdapter({
    enabled: true,
    apiKey: 'owned-test',
    extractor: { modelId: 'owned/extractor', providerId: 'owned' },
    assessor: { modelId: 'owned/assessor', providerId: 'owned' },
    allowedModels: ['owned/extractor', 'owned/assessor'],
    allowedProviders: ['owned'],
    fetch: fetcher,
  }).assess(fixture());
  expect(report.claims).toHaveLength(1);
  expect(report.claims[0]!.originalText).toBe(TEXT.slice(0, -1));
  expect(report.assessments[0]!.status).toBe('insufficient_context');
  expect(selections).toBe(2);
  expect(report.trace.selectionRecovery).toEqual({ outcome: 'recovered', candidateCount: 1 });
  expect(requests[1].messages[0].content).toContain('Independently reconsider');
});

function options(fetcher: typeof fetch) {
  return {
    enabled: true,
    apiKey: 'owned-test',
    extractor: { modelId: 'owned/extractor', providerId: 'owned' },
    assessor: { modelId: 'owned/assessor', providerId: 'owned' },
    allowedModels: ['owned/extractor', 'owned/assessor'],
    allowedProviders: ['owned'],
    fetch: fetcher,
  };
}
it('never promotes candidates automatically when both selections remain empty, including a greeting', async () => {
  for (const text of [TEXT, 'السلام عليكم ورحمة الله وبركاته.']) {
    const fetcher = vi.fn(async (_url: any, init: any) =>
      response({ claims: [] }, JSON.parse(init.body).model),
    );
    const report = await createSemanticAssessmentAdapter(options(fetcher)).assess(fixture(text));
    expect(report.claims).toEqual([]);
    expect(report.assessments).toEqual([]);
    expect(report.errorCode).toBe('no_claims_extracted');
    expect(report.trace.selectionRecovery?.outcome).toBe('still_empty');
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
it('keeps questions and classified quotation-only input out of selection and recovery', async () => {
  const fetcher = vi.fn(async () => {
    throw Error('Unexpected provider call');
  });
  const question = fixture('هل الحديث الضعيف درجات؟');
  expect((await createSemanticAssessmentAdapter(options(fetcher)).assess(question)).status).toBe(
    'not_applicable',
  );
  const quotation = fixture('«قول مصدر محفوظ»');
  quotation.segments[0]!.role = 'ayah';
  expect((await createSemanticAssessmentAdapter(options(fetcher)).assess(quotation)).status).toBe(
    'not_applicable',
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not spend a second request after the shared extraction phase budget is consumed', async () => {
  let time = 0;
  const fetcher = vi.fn(async (_url: any, init: any) => {
    time = 12001;
    return response({ claims: [] }, JSON.parse(init.body).model);
  });
  const report = await createSemanticAssessmentAdapter({
    ...options(fetcher),
    now: () => time,
  }).assess(fixture());
  expect(report.claims).toEqual([]);
  expect(report.trace.selectionRecovery?.outcome).toBe('budget_skipped');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects fabricated recovery IDs rather than selecting the original automatically', async () => {
  let calls = 0;
  const fetcher = vi.fn(async (_url: any, init: any) =>
    response(
      {
        claims: ++calls === 1 ? [] : [{ candidateId: 'C9999', evidenceKeys: [] }],
      },
      JSON.parse(init.body).model,
    ),
  );
  const report = await createSemanticAssessmentAdapter(options(fetcher)).assess(fixture());
  expect(report.claims).toEqual([]);
  expect(report.assessments).toEqual([]);
  expect(report.errorCode).toBe('invalid_claims');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
