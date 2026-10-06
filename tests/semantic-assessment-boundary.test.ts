import { expect, it, vi } from 'vitest';
import { sha256 } from '../apps/api/src/foundation.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';

// Owned offline source/claim controls, not religious verdicts or provider acceptance.
const original = 'يحفظ الكاتب الحقوق ولا يلغي الشرط.';
const draft = 'يلغي الكاتب الشرط عند حفظ الحقوق.';
const route = { modelId: 'owned/boundary', providerId: 'owned' };
function intake(): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'owned',
    corpusVersion: 'owned',
    revisionId: '11111111-1111-4111-8111-111111111111',
    revisionSha256: sha256(draft),
    originalText: draft,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 'author',
        originalText: draft,
        startOffset: 0,
        endOffset: draft.length,
        codePointStart: 0,
        codePointEnd: draft.length,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'owned',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
    evidence: [
      {
        snapshotKey: 'exact-source',
        sourceId: 'owned',
        sourceVersion: 'v1',
        sourceRole: 'quran_text',
        reference: 'owned:1',
        originalText: original,
        originalSha256: sha256(original),
        work: 'Owned synthetic source',
        author: null,
        edition: null,
        sourceUrl: null,
        approvalStatus: 'pending',
        researchOnly: true,
        parentSnapshotKey: null,
        delivery: 'snapshot',
        retrievalModes: ['exact'],
        provenance: {},
      },
    ],
  };
}
type Finding = {
  claimId: string;
  status: string;
  conditions: string[];
  negations: string[];
  exceptions: string[];
  scope: string[];
  citations: Array<{ evidenceKey: string; excerpt: string }>;
  explanation: string;
};
async function run(change: (finding: Finding) => void, empty = false) {
  const input = intake();
  const sourceSnapshot = structuredClone(input.evidence);
  const requests: Array<{ stage: string; packet: any }> = [];
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(init!.body as string),
      stage = body.response_format.json_schema.name;
    const packet = JSON.parse(body.messages[1].content).untrustedData;
    requests.push({ stage, packet });
    let payload;
    if (stage === 'extraction') payload = { claims: [{ candidateId: 'C1', evidenceKeys: ['E1'] }] };
    else if (stage === 'relevance')
      payload = { selections: [{ claimId: 'C1', evidenceKeys: empty ? [] : ['E1'] }] };
    else {
      const finding = {
        claimId: packet.claims[0].claim.id,
        status: 'contradicted',
        conditions: [],
        negations: ['لا يلغي الشرط'],
        exceptions: [],
        scope: ['الادعاء بإلغاء الشرط متعارض مع المصدر'],
        citations: [{ evidenceKey: 'exact-source', excerpt: original }],
        explanation: 'ينفي النص إلغاء الشرط.',
      };
      change(finding);
      payload = { assessments: [finding] };
    }
    return new Response(
      JSON.stringify({
        model: route.modelId,
        provider: route.providerId,
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
      }),
    );
  });
  const result = await createSemanticAssessmentAdapter({
    enabled: true,
    apiKey: 'synthetic-test',
    extractor: route,
    assessor: route,
    allowedModels: [route.modelId],
    allowedProviders: [route.providerId],
    researchPreview: true,
    relevanceFiltering: true,
    fetch: fetcher,
  }).assessWithEvidence(input);
  expect(input.evidence).toEqual(sourceSnapshot);
  expect(input.originalText).toBe(draft);
  return { ...result, fetcher, requests };
}

it('accepts a structurally valid contradicted finding with the exact claim/source/excerpt', async () => {
  const result = await run(() => {});
  expect(result.report).toMatchObject({
    status: 'completed',
    errorCode: null,
    assessments: [
      { status: 'contradicted', citations: [{ evidenceKey: 'exact-source', excerpt: original }] },
    ],
  });
  expect(result.requests.map((row) => row.stage)).toEqual([
    'extraction',
    'relevance',
    'assessment',
  ]);
});

for (const [name, change] of [
  [
    'foreign claim alias',
    (finding: Finding) => {
      finding.claimId = 'C1';
    },
  ],
  [
    'foreign source alias',
    (finding: Finding) => {
      finding.citations[0]!.evidenceKey = 'E1';
    },
  ],
  [
    'altered excerpt',
    (finding: Finding) => {
      finding.citations[0]!.excerpt = 'يحفظ الكاتب الحقوق ويلغي الشرط.';
    },
  ],
  [
    'duplicate citation',
    (finding: Finding) => {
      finding.citations.push({ ...finding.citations[0]! });
    },
  ],
  [
    'missing contradiction citation',
    (finding: Finding) => {
      finding.citations = [];
    },
  ],
] as const) {
  it(`withholds ${name} after HTTP200 without provider retry or a false contradiction`, async () => {
    const result = await run(change);
    expect(result.report).toMatchObject({
      status: 'partial',
      errorCode: 'invalid_citations',
      assessments: [],
    });
    expect(result.report.trace.requests.filter((row) => row.stage === 'assessment')).toHaveLength(
      1,
    );
    expect(result.report.trace.requests.at(-1)).toMatchObject({
      outcome: 'success',
      httpStatus: 200,
    });
    expect(result.fetcher).toHaveBeenCalledTimes(3);
  });
}

it('withholds not_established after relevance removes every source', async () => {
  const result = await run((finding) => {
    finding.status = 'not_established';
    finding.citations = [];
  }, true);
  expect(result.requests.at(-1)!.packet.claims[0].evidence).toEqual([]);
  expect(result.report).toMatchObject({
    status: 'partial',
    errorCode: 'invalid_citations',
    assessments: [],
  });
  expect(result.fetcher).toHaveBeenCalledTimes(3);
});

it('retains an unavailable-evidence finding without inventing a source conclusion', async () => {
  const result = await run((finding) => {
    finding.status = 'insufficient_context';
    finding.citations = [];
  }, true);
  expect(result.report).toMatchObject({
    status: 'completed',
    errorCode: null,
    assessments: [
      {
        status: 'insufficient_context',
        citations: [],
        conditions: [],
        negations: [],
        exceptions: [],
      },
    ],
  });
  expect(result.report.assessments[0]!.explanation).toContain('لم تتوفر');
  expect(result.report.assessments[0]!.explanation).toContain(
    result.report.claims[0]!.originalText,
  );
  expect(result.report.assessments[0]!.explanation).not.toContain('ينفي النص');
});
