import { expect, it, vi } from 'vitest';
import { sha256 } from '../apps/api/src/foundation.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import { GEMINI_BACKUP_ENDPOINT, GEMINI_BACKUP_MODEL } from '../apps/api/src/gemini-backup.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';
import { assessmentCitationPacket } from '../apps/api/src/semantic-assessment-packet.js';
import { assessorEvidence, claimInventory } from '../apps/api/src/semantic-spans.js';
import { claimSelectionPacket } from '../apps/api/src/semantic-selection.js';

// Synthetic exact-byte controls reproduce the captured inline-footnote shape.
const sourceText = 'لا يلغي الكاتب الشرط ¬في (ب): «الذي يحفظ».¥ عند حفظ الحقوق.';
const draft = 'يلغي الكاتب الشرط عند حفظ الحقوق.';
const route = { modelId: 'owned/grounding', providerId: 'owned' };
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
        originalText: sourceText,
        originalSha256: sha256(sourceText),
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

function packetControl(count = 1) {
  const input = fixture();
  const claim = claimSelectionPacket(input, claimInventory(input)).resolve(
    {
      claims: [{ candidateId: 'C1', evidenceKeys: ['E1'] }],
    },
    'initial',
  ).claims[0]!;
  const claims = Array.from({ length: count }, (_, index) => ({
    claim: { ...claim, id: `${claim.id}-${index}` },
    evidence: [assessorEvidence(input.evidence[0]!, claim.originalText)],
  }));
  return { claims };
}
function selectedFinding(claimId = 'C1', passageId = 'P1') {
  return {
    claimId,
    status: 'contradicted',
    conditions: [],
    negations: [],
    exceptions: [],
    scope: ['المصدر ينفي إلغاء الشرط'],
    citations: [{ passageId }],
    explanation: 'ينفي النص إلغاء الشرط.',
  };
}

it('rejects cross-claim passage selection and duplicate claim findings', () => {
  const packet = assessmentCitationPacket(packetControl(2));
  expect(() =>
    packet.resolve({ assessments: [selectedFinding('C1', 'P2'), selectedFinding('C2', 'P1')] }),
  ).toThrow();
  expect(() => packet.resolve({ assessments: [selectedFinding(), selectedFinding()] })).toThrow();
});

it('freezes passage bytes against later mutation of the input or returned wire packet', () => {
  const data = packetControl();
  const packet = assessmentCitationPacket(data);
  data.claims[0]!.evidence[0]!.passages[0]!.originalText = 'نص تم تغييره';
  packet.data.claims[0]!.evidence[0]!.passages[0]!.originalText = 'نص آخر تم تغييره';
  expect(packet.resolve({ assessments: [selectedFinding()] }).assessments[0]!.citations).toEqual([
    { evidenceKey: 'exact-source', excerpt: sourceText },
  ]);
});

it('withholds an oversized passage instead of trimming or normalizing it', () => {
  const data = packetControl();
  const passage = data.claims[0]!.evidence[0]!.passages[0]!;
  passage.originalText = 'ن'.repeat(4001);
  passage.endOffset = passage.originalText.length;
  expect(() => assessmentCitationPacket(data)).toThrow('INVALID_ASSESSMENT_PASSAGE');
});
async function run(mode: 'primary' | 'google', empty = false, change?: (value: any) => void) {
  const input = fixture(),
    snapshot = structuredClone(input);
  const packets: any[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (mode === 'google' && url !== GEMINI_BACKUP_ENDPOINT)
      return new Response(null, { status: 403 });
    const body = JSON.parse(init!.body as string);
    const packet = JSON.parse(
      body.contents ? body.contents[0].parts[0].text : body.messages[1].content,
    ).untrustedData;
    packets.push(packet);
    let payload;
    if (packet.candidates) payload = { claims: [{ candidateId: 'C1', evidenceKeys: ['E1'] }] };
    else if (!packet.claims[0].claim)
      payload = { selections: [{ claimId: 'C1', evidenceKeys: empty ? [] : ['E1'] }] };
    else {
      const finding = empty
        ? { claimId: 'C1', status: 'insufficient_context' }
        : {
            claimId: 'C1',
            status: 'contradicted',
            conditions: [],
            negations: [],
            exceptions: [],
            scope: ['المصدر ينفي إلغاء الشرط'],
            citations: [{ passageId: 'P1' }],
            explanation: 'ينفي النص إلغاء الشرط.',
          };
      change?.(finding);
      payload = { assessments: [finding] };
    }
    return new Response(
      JSON.stringify(
        body.contents
          ? {
              modelVersion: GEMINI_BACKUP_MODEL,
              candidates: [
                { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } },
              ],
            }
          : {
              model: route.modelId,
              provider: route.providerId,
              choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
            },
      ),
    );
  });
  const result = await createSemanticAssessmentAdapter({
    enabled: true,
    researchPreview: true,
    apiKey: 'synthetic-test',
    geminiBackup: { apiKey: 'synthetic-google', secondaryApiKey: 'unused-second' },
    extractor: route,
    assessor: route,
    allowedModels: [route.modelId],
    allowedProviders: [route.providerId],
    relevanceFiltering: true,
    assessmentCitationProtocol: 'immutable-passage-v1',
    fetch: fetcher,
  }).assessWithEvidence(input);
  expect(input).toEqual(snapshot);
  return { ...result, input, packets, fetcher };
}

for (const mode of ['primary', 'google'] as const) {
  it(`resolves ${mode} passage selection into unchanged contiguous source bytes including inline footnotes`, async () => {
    const result = await run(mode);
    expect(result.report).toMatchObject({
      status: 'completed',
      errorCode: null,
      assessments: [
        {
          status: 'contradicted',
          citations: [{ evidenceKey: 'exact-source', excerpt: sourceText }],
        },
      ],
    });
    const packet = result.packets.at(-1);
    expect(packet.assessmentProtocol).toBe('immutable-passage-v1');
    expect(packet.claims[0].claim.id).toBe('C1');
    expect(packet.claims[0].evidence[0].passages[0]).toMatchObject({
      passageId: 'P1',
      originalText: sourceText,
      originalSha256: sha256(sourceText),
    });
    expect(result.report.assessments[0]!.claimId).toBe(result.report.claims[0]!.id);
    expect(result.intake.evidence[0]!.originalText).toBe(sourceText);
    expect(result.report.trace.assessmentInputSha256).toBe(
      sha256((await import('../apps/api/src/foundation.js')).canonical(packet)),
    );
  });
}

for (const status of ['insufficient_context', 'not_applicable'] as const) {
  it(`resolves only a chosen empty-evidence ${status} into a bounded existing public finding`, async () => {
    const result = await run('google', true, (finding) => {
      finding.status = status;
    });
    expect(result.report).toMatchObject({
      status: 'completed',
      errorCode: null,
      assessments: [{ status, citations: [], conditions: [], negations: [], exceptions: [] }],
    });
    expect(result.packets.at(-1).claims[0].evidence).toEqual([]);
    expect(result.report.assessments[0]!.explanation).toContain(
      result.report.claims[0]!.originalText,
    );
  });
}

for (const [name, empty, change] of [
  [
    'wrong claim',
    false,
    (finding: any) => {
      finding.claimId = 'C2';
    },
  ],
  [
    'unknown passage',
    false,
    (finding: any) => {
      finding.citations = [{ passageId: 'P999' }];
    },
  ],
  [
    'duplicate passage',
    false,
    (finding: any) => {
      finding.citations.push({ passageId: 'P1' });
    },
  ],
  [
    'reconstructed excerpt',
    false,
    (finding: any) => {
      finding.citations = [
        { evidenceKey: 'exact-source', excerpt: 'لا يلغي الكاتب الشرط عند حفظ الحقوق.' },
      ];
    },
  ],
  [
    'empty false verdict',
    true,
    (finding: any) => {
      finding.status = 'not_established';
    },
  ],
  [
    'empty invented source field',
    true,
    (finding: any) => {
      finding.citations = [{ passageId: 'P1' }];
    },
  ],
] as const) {
  it(`withholds ${name} without retrying or choosing another Gemini opinion`, async () => {
    const result = await run('google', empty, change);
    expect(result.report.status).not.toBe('completed');
    expect(result.report.assessments).toEqual([]);
    expect(result.fetcher).toHaveBeenCalledTimes(4);
    expect(result.report.trace.requests.filter((row) => row.stage === 'assessment')).toHaveLength(
      1,
    );
  });
}
