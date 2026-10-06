import { expect, it, vi } from 'vitest';
import { canonical, sha256 } from '../apps/api/src/foundation.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import { assessmentCitationPacket } from '../apps/api/src/semantic-assessment-packet.js';
import { assessorEvidence, claimInventory } from '../apps/api/src/semantic-spans.js';
import { claimSelectionPacket } from '../apps/api/src/semantic-selection.js';
import { geminiBackupBody } from '../apps/api/src/gemini-backup.js';
import type { FoundationIntake, SourceEvidence } from '../packages/contracts/src/foundation.js';
import { z } from 'zod';

// Owned controls for protocol composition, not religious verdicts or live providers.
const draft = 'يلغي الكاتب الشرط عند حفظ الحقوق.';
const original = 'وصف الكاتب موضوع حفظ الحقوق.';
const discovered = 'لا يلغي الكاتب الشرط عند حفظ الحقوق ¬في النسخة: «العهد».¥.';
const route = { modelId: 'owned/passage-review', providerId: 'owned' };
function source(key = 'owned-original', text = original): SourceEvidence {
  return {
    snapshotKey: key,
    sourceId: 'owned',
    sourceVersion: 'v1',
    sourceRole: 'quran_text',
    reference: 'owned:1',
    originalText: text,
    originalSha256: sha256(text),
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
  };
}
function fixture(): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'owned',
    corpusVersion: 'owned',
    revisionId: '11111111-1111-4111-8111-111111111111',
    revisionSha256: sha256(draft),
    originalText: draft,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    evidence: [source()],
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
  };
}
function claim() {
  const input = fixture();
  return claimSelectionPacket(input, claimInventory(input)).resolve(
    { claims: [{ candidateId: 'C1', evidenceKeys: ['E1'] }] },
    'initial',
  ).claims[0]!;
}
const details = {
  status: 'contradicted',
  conditions: [],
  negations: [],
  exceptions: [],
  scope: ['ينفي المصدر إلغاء الشرط'],
  explanation: 'ينفي المصدر إلغاء الشرط.',
} as const;

it('binds a mixed empty/nonempty schema to exactly its claims through both provider wire formats', () => {
  const first = claim();
  const packet = assessmentCitationPacket({
    claims: [
      { claim: first, evidence: [assessorEvidence(source(), draft)] },
      { claim: { ...first, id: `claim-${'b'.repeat(24)}`, evidenceKeys: [] }, evidence: [] },
    ],
  });
  const payload = {
    assessments: [
      { ...details, claimId: 'C1', citations: [{ passageId: 'P1' }] },
      { claimId: 'C2', status: 'insufficient_context' },
    ],
  };
  expect(packet.resolve(payload).assessments).toMatchObject([
    { claimId: first.id, citations: [{ evidenceKey: 'owned-original', excerpt: original }] },
    { claimId: `claim-${'b'.repeat(24)}`, status: 'insufficient_context', citations: [] },
  ]);
  expect(() =>
    packet.resolve({
      assessments: [
        payload.assessments[0],
        {
          claimId: 'C2',
          status: 'supported',
          citations: [{ passageId: 'P1' }],
        },
      ],
    }),
  ).toThrow();
  const schema = z.toJSONSchema(packet.schema, { unrepresentable: 'throw' });
  const primary = JSON.stringify({
    model: route.modelId,
    max_tokens: 7000,
    messages: [
      { role: 'system', content: 'Owned protocol' },
      {
        role: 'user',
        content: JSON.stringify({ untrustedData: packet.data }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'assessment', strict: true, schema },
    },
  });
  const native = JSON.parse(geminiBackupBody(primary));
  const branches = native.generationConfig.responseJsonSchema.properties.assessments.items.anyOf;
  expect(branches).toHaveLength(2);
  expect(branches[0].additionalProperties).toBe(false);
  expect(branches[0].properties.citations.items.properties.passageId.enum).toEqual(['P1']);
  expect(branches[1].additionalProperties).toBe(false);
  expect(branches[1].required).toEqual(['claimId', 'status']);
});

it.each(['success', 'foreign-passage'] as const)(
  'keeps gap assessment bindings and exact input hashes across %s',
  async (mode) => {
    const input = fixture();
    const immutable = structuredClone(input);
    const stagePackets = new Map<string, any>();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      const stage = body.response_format.json_schema.name;
      const packet = JSON.parse(body.messages[1].content).untrustedData;
      stagePackets.set(stage, packet);
      let payload;
      if (stage === 'extraction')
        payload = { claims: [{ candidateId: 'C1', evidenceKeys: ['E1'] }] };
      else if (stage === 'relevance')
        payload = { selections: [{ claimId: 'C1', evidenceKeys: ['E1'] }] };
      else if (stage === 'assessment')
        payload = {
          assessments: [
            {
              ...details,
              claimId: 'C1',
              status: 'not_established',
              citations: [],
            },
          ],
        };
      else {
        const evidence = packet.claims[0].evidence.find(
          (row: any) => row.evidenceKey === 'owned-discovered',
        );
        payload = {
          assessments: [
            {
              ...details,
              claimId: 'C1',
              citations: [
                { passageId: mode === 'success' ? evidence.passages[0].passageId : 'P999' },
              ],
            },
          ],
        };
      }
      return new Response(
        JSON.stringify({
          ...route,
          model: route.modelId,
          provider: route.providerId,
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
        }),
      );
    });
    const discover = vi.fn(async () => ({
      evidence: [
        {
          ...source('owned-discovered', discovered),
          sourceRole: 'scholar_explanation' as const,
          sourceUrl: 'https://owned.example/source',
          provenance: { representation: 'extracted_markdown' },
        },
      ],
      failureCodes: [],
    }));
    const result = await createSemanticAssessmentAdapter({
      enabled: true,
      researchPreview: true,
      apiKey: 'owned-test-key',
      extractor: route,
      assessor: route,
      allowedModels: [route.modelId],
      allowedProviders: [route.providerId],
      relevanceFiltering: true,
      assessmentCitationProtocol: 'immutable-passage-v1',
      gapDiscovery: { discover },
      fetch: fetcher,
    }).assessWithEvidence(input);
    expect(input).toEqual(immutable);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(result.report.trace.initialAssessmentInputSha256).toBe(
      sha256(canonical(stagePackets.get('assessment'))),
    );
    expect(result.report.trace.assessmentInputSha256).toBe(
      sha256(canonical(stagePackets.get('gap_assessment'))),
    );
    expect(result.report.trace.initialAssessmentInputSha256).not.toBe(
      result.report.trace.assessmentInputSha256,
    );
    expect(stagePackets.get('gap_assessment').assessmentBindingSha256).not.toBe(
      stagePackets.get('assessment').assessmentBindingSha256,
    );
    expect(
      result.report.trace.requests.filter((row) => row.stage === 'gap_assessment'),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
    if (mode === 'success') {
      expect(result.report.status).toBe('completed');
      expect(result.report.trace.discovery?.outcome).toBe('reassessed');
      expect(result.report.assessments[0]).toMatchObject({
        claimId: result.report.claims[0]!.id,
        status: 'contradicted',
        citations: [{ evidenceKey: 'owned-discovered', excerpt: discovered }],
      });
    } else {
      expect(result.report.status).toBe('partial');
      expect(result.report.trace.discovery?.outcome).toBe('reassessment_failed');
      expect(result.report.assessments[0]).toMatchObject({
        status: 'not_established',
        citations: [],
      });
      expect(result.report.trace.requests.at(-1)?.outcome).toBe('invalid_response');
    }
  },
);
