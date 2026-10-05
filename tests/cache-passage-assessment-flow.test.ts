import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { createResearchPageCache } from '../apps/api/src/research-page-cache.js';
import { createResearchPagePassageIndex } from '../apps/api/src/research-page-passage-index.js';
import { withResearchPageCorpus } from '../apps/api/src/cached-corpus.js';
import { createClaimRetrievalAdapter } from '../apps/api/src/claim-retrieval.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import { cachePassages } from '../apps/api/src/research-page-passages.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { parseSourcePolicy } from '../apps/api/src/source-policy.js';
import type { SourceEvidence, FoundationIntake } from '../packages/contracts/src/foundation.js';
async function run(wrongCitation = false) {
  const policy = parseSourcePolicy({
    schemaVersion: 1,
    policyVersion: 'v1',
    referenceDocument: { name: 'Owned', sha256: 'a'.repeat(64), pages: [] },
    deniedDomains: [],
    sources: [
      {
        id: 'owned',
        domain: 'example.com',
        pathPrefixes: ['/public/'],
        excludedPrefixes: [],
        enabled: true,
        basis: 'owner_selected',
        documentPages: [],
        sourceRole: 'scholar_explanation',
        notes: 'Owned control.',
      },
    ],
  });
  const a = 'يلزم الوفاء بالعهود إلا إذا استحال الوفاء.',
    b = 'تجب صلة الأرحام بالمعروف.';
  const text =
    'تمهيد موضوع مستقل.\n'.repeat(200) +
    a +
    '\n' +
    'فاصل موضوع مستقل.\n'.repeat(200) +
    b +
    '\n' +
    'خاتمة موضوع مستقل.\n'.repeat(200);
  const source: SourceEvidence = {
    snapshotKey: 'web-cache:' + sha256(text),
    sourceId: 'web-owned',
    sourceVersion: 'v1',
    sourceRole: 'scholar_explanation',
    reference: 'Owned source',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned',
    author: null,
    edition: null,
    sourceUrl: 'https://example.com/public/source',
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['lexical'],
    provenance: { sourcePolicySha256: policy.sha256, sourcePolicyVersion: 'v1' },
  };
  const built = cachePassages(source),
    pa = built.passages.find((p) => p.originalText.includes(a))!,
    pb = built.passages.find((p) => p.originalText.includes(b))!;
  const query = vi.fn(async (sql: string, v: unknown[] = []) => {
    if (sql.startsWith('with scores')) {
      const p = String(v[1]).includes('الامانة') ? pa : pb;
      return {
        rows: [
          {
            evidence: source,
            passage_id: p.passageId,
            parent_snapshot_key: p.parentSnapshotKey,
            parent_sha256: p.originalSha256,
            chunker_version: p.chunkerVersion,
            start_utf16: p.startOffset,
            end_utf16: p.endOffset,
            core_start_utf16: p.coreStart,
            core_end_utf16: p.coreEnd,
            start_codepoint: p.codePointStart,
            end_codepoint: p.codePointEnd,
            core_start_codepoint: p.codePointCoreStart,
            core_end_codepoint: p.codePointCoreEnd,
            original_text: p.originalText,
            passage_sha256: p.passageSha256,
            context_truncated: p.contextTruncated,
            boundary_truncated: p.boundaryTruncated,
            coverage: built.coverage,
            lexical_hit: false,
            semantic_hit: true,
          },
        ],
      };
    }
    if (sql.startsWith('select evidence from') && sql.includes('snapshot_key=any'))
      return { rows: [{ evidence: source }] };
    if (sql.startsWith('select evidence,word_similarity'))
      return { rows: [{ evidence: source, lexical_hit: true, semantic_hit: false }] };
    return { rows: [] };
  });
  const pool = { connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
  const classify = vi.fn(async () => {
      throw Error('No admission expected');
    }),
    embed = vi.fn(async () => [1, ...Array(1535).fill(0)]);
  const cache = createResearchPageCache({
    readerPool: pool,
    writerPool: pool,
    policy,
    classify,
    embeddingSpace: { modelId: 'openai/text-embedding-3-small', embed },
    passageIndex: createResearchPagePassageIndex({ readerPool: pool, policy }),
  });
  const combined = withResearchPageCorpus(
    { search: async () => [], restore: async () => [] },
    cache,
  );
  const boundedRetrieval = createClaimRetrievalAdapter({
    corpus: combined,
    corpusVersion: 'owned',
    researchPreview: true,
  });
  const retrieval = boundedRetrieval;
  const originalText = 'الأمانة في العقود لازمة. رعاية الأسرة لازمة.';
  const intake: FoundationIntake = {
    schemaVersion: 1,
    pipelineVersion: 'owned',
    corpusVersion: 'owned',
    revisionId: randomUUID(),
    revisionSha256: sha256(originalText),
    originalText,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    evidence: [source],
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 'author',
        startOffset: 0,
        endOffset: originalText.length,
        codePointStart: 0,
        codePointEnd: originalText.length,
        originalText,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'owned',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
  };
  let assessmentPacket: any;
  const fetcher = vi.fn(async (_url: unknown, init: any) => {
    const body = JSON.parse(init.body),
      data = JSON.parse(body.messages[1].content).untrustedData;
    const extraction = body.response_format.json_schema.name === 'extraction';
    if (!extraction) assessmentPacket = data;
    const result = extraction
      ? {
          claims: data.candidates.map((c: any) => ({
            candidateId: c.candidateId,
            evidenceKeys: [source.snapshotKey],
          })),
        }
      : {
          assessments: data.claims.map((c: any, i: number) => ({
            claimId: c.claim.id,
            status: 'supported',
            conditions: [],
            negations: [],
            exceptions: [],
            scope: [],
            citations: [
              { evidenceKey: source.snapshotKey, excerpt: i === 0 ? (wrongCitation ? b : a) : b },
            ],
            explanation: 'اختبار هندسي فقط.',
          })),
        };
    return new Response(
      JSON.stringify({
        model: body.model,
        provider: 'owned',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
      }),
    );
  });
  const assessed = await createSemanticAssessmentAdapter({
    enabled: true,
    researchPreview: true,
    apiKey: 'owned',
    extractor: { modelId: 'owned/model', providerId: 'owned' },
    assessor: { modelId: 'owned/model', providerId: 'owned' },
    allowedModels: ['owned/model'],
    allowedProviders: ['owned'],
    fetch: fetcher,
    claimRetrieval: retrieval,
  }).assessWithEvidence(intake);
  const report = assessed.report;
  expect(assessed.intake.evidence[0]).toEqual(source);
  expect(report.trace.retrieval?.passagePreferences).toHaveLength(2);
  return { report, assessmentPacket, a, b, classify, embed, query };
}
it('delivers two different dense-only windows from the same existing seed through actual cache/corpus/retrieval/assessment adapters', async () => {
  const r = await run();
  expect(r.report.status).toBe('completed');
  expect(r.report.assessments.map((a) => a.status)).toEqual(['supported', 'supported']);
  const first = r.assessmentPacket.claims[0].evidence[0].passages
    .map((p: any) => p.originalText)
    .join('\n');
  const second = r.assessmentPacket.claims[1].evidence[0].passages
    .map((p: any) => p.originalText)
    .join('\n');
  expect(first).toContain(r.a);
  expect(first).not.toContain(r.b);
  expect(second).toContain(r.b);
  expect(second).not.toContain(r.a);
  expect(r.classify).not.toHaveBeenCalled();
  expect(r.embed).toHaveBeenCalledTimes(2);
  expect(r.report.trace.passageViews?.[0]?.passages[0]?.startOffset).not.toBe(
    r.report.trace.passageViews?.[1]?.passages[0]?.startOffset,
  );
});
it('citation validation uses each claim packet windows and rejects a citation present only in the other claim window', async () => {
  const r = await run(true);
  expect(r.report.errorCode).toBe('invalid_citations');
});
