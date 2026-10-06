import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { sha256 } from '../apps/api/src/foundation.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';

// Owned synthetic packet: this loop tests HTTP200 envelope/schema admission,
// independently of whether a captured selection belongs to this source manifest.
const SOURCE = 'يحفظ الكاتب الحقوق عند القدرة.';
const TEXT = 'يجب حفظ الحقوق عند القدرة.';
const extractor = { modelId: 'openai/gpt-6-luna', providerId: 'OpenAI' };
const assessor = { modelId: 'openai/gpt-6.1-sol', providerId: 'OpenAI' };
function fixture(): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'owned-provider-replay',
    corpusVersion: 'owned-fixture',
    revisionId: randomUUID(),
    revisionSha256: sha256(TEXT),
    originalText: TEXT,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 'author-1',
        startOffset: 0,
        endOffset: TEXT.length,
        codePointStart: 0,
        codePointEnd: TEXT.length,
        originalText: TEXT,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'owned-fixture',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
    evidence: [
      {
        snapshotKey: 'owned-replay-source',
        sourceId: 'owned',
        sourceVersion: 'fixture-1',
        sourceRole: 'quran_text',
        reference: 'owned:1',
        originalText: SOURCE,
        originalSha256: sha256(SOURCE),
        work: 'Owned synthetic fixture',
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
function envelope(payload: unknown, model = assessor.modelId) {
  return {
    id: 'owned-provider-response',
    model,
    provider: 'OpenAI',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
  };
}
const validSelection = { selections: [{ claimId: 'C1', evidenceKeys: ['E1'] }] };
async function replay(raw: string) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const packet = JSON.parse(body.messages[1].content).untrustedData;
    const stage = body.response_format.json_schema.name;
    if (stage === 'extraction')
      return new Response(
        JSON.stringify(
          envelope(
            {
              claims: [{ candidateId: packet.candidates[0].candidateId, evidenceKeys: ['E1'] }],
            },
            extractor.modelId,
          ),
        ),
      );
    if (stage === 'relevance') return new Response(raw, { status: 200 });
    return new Response(
      JSON.stringify(
        envelope({
          assessments: [
            {
              claimId: packet.claims[0].claim.id,
              status: 'supported',
              conditions: ['عند القدرة'],
              negations: [],
              exceptions: [],
              scope: ['حفظ الحقوق عند القدرة'],
              citations: [{ evidenceKey: 'owned-replay-source', excerpt: SOURCE }],
              explanation: 'يدعم النص العبارة ضمن قيد القدرة.',
            },
          ],
        }),
      ),
    );
  });
  const result = await createSemanticAssessmentAdapter({
    enabled: true,
    researchPreview: true,
    apiKey: 'owned-openrouter-test-key',
    extractor,
    assessor,
    allowedModels: [extractor.modelId, assessor.modelId],
    allowedProviders: ['OpenAI'],
    relevanceFiltering: true,
    geminiBackup: {
      apiKey: 'owned-google-test-key',
      secondaryApiKey: 'owned-google-second-test-key',
    },
    fetch,
  }).assess(fixture());
  return {
    result,
    fetch,
    relevance: result.trace.requests.find((row) => row.stage === 'relevance'),
  };
}
describe('HTTP200 semantic provider admission replay', () => {
  it('admits a pinned complete closed-schema relevance response', async () => {
    const raw = JSON.stringify(envelope(validSelection));
    const { result, relevance, fetch } = await replay(raw);
    expect(result.status).toBe('completed');
    expect(relevance).toMatchObject({
      httpStatus: 200,
      outcome: 'success',
      responseSha256: sha256(raw),
      modelId: assessor.modelId,
      providerId: 'OpenAI',
      fallback: false,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each([
    'truncated',
    'wrong-model',
    'wrong-provider',
    'extra-payload-key',
    'invalid-payload-json',
    'negative-usage',
  ])('withholds %s without retrying the model or Gemini', async (kind) => {
    const value = envelope(validSelection);
    if (kind === 'truncated') value.choices[0]!.finish_reason = 'length';
    if (kind === 'wrong-model') value.model = 'unapproved/model';
    if (kind === 'wrong-provider') value.provider = 'Unapproved';
    if (kind === 'extra-payload-key')
      value.choices[0]!.message.content = JSON.stringify({ ...validSelection, added: true });
    if (kind === 'invalid-payload-json') value.choices[0]!.message.content = '{bad-json';
    if (kind === 'negative-usage') value.usage.total_tokens = -1;
    const { result, relevance, fetch } = await replay(JSON.stringify(value));
    expect(result.errorCode).toBe('invalid_response');
    expect(relevance).toMatchObject({
      httpStatus: 200,
      outcome: 'invalid_response',
      fallback: false,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.skipIf(!process.env.BASIRAH_PROVIDER_REPLAY_RAW)(
    'admits the external captured relevance envelope through the actual request boundary',
    async () => {
      const raw = readFileSync(process.env.BASIRAH_PROVIDER_REPLAY_RAW!, 'utf8');
      const { relevance } = await replay(raw);
      // Assert the exact observed symptom at the provider boundary. Subsequent
      // source-alias binding belongs to the frozen capture's original manifest.
      expect(relevance).toMatchObject({ httpStatus: 200, outcome: 'success', fallback: false });
    },
  );
});
