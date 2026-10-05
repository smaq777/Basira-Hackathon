import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  assessorEvidence,
  claimInventory,
  evidencePassages,
  passageTrace,
  resolveClaimSelection,
  utf16Boundary,
} from '../apps/api/src/semantic-spans.js';
import { canonical, sha256 } from '../apps/api/src/foundation.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import type { FoundationIntake, SourceEvidence } from '../packages/contracts/src/foundation.js';
import { SemanticAssessmentReportSchema } from '../packages/contracts/src/semantic-assessment.js';

// Owned synthetic text tests software boundaries; no scholarly labels or accuracy scores.
function source(text: string): SourceEvidence {
  return {
    snapshotKey: 'owned-source',
    sourceId: 'owned',
    sourceVersion: 'v1',
    sourceRole: 'book_excerpt',
    reference: 'owned:1',
    originalText: text,
    originalSha256: sha256(text),
    work: 'Owned controls',
    author: null,
    edition: null,
    sourceUrl: null,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['lexical'],
    provenance: {},
  };
}
function intake(
  text: string,
  original = source('يحفظ الكاتب الحقوق ما لم يتعذر ذلك.'),
): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'owned',
    corpusVersion: 'owned',
    revisionId: randomUUID(),
    revisionSha256: sha256(text),
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    evidence: [original],
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
        method: 'owned',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
  };
}
function modelResponse(payload: unknown, model: string) {
  return new Response(
    JSON.stringify({
      model,
      provider: 'owned',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }),
  );
}

describe('original-span candidate inventory', () => {
  it('excludes source introductions and anchored parenthesis quotations without dropping author conditions', () => {
    const row = intake(
      'يجب حفظ الحقوق (إذا أمكن) قال تعالى: (كلام مصدر محفوظ). وقال جل في علاه: كلام آخر. وقال رسول الله صلى الله عليه وسلم: (كلام مصدر ثان). يجب حفظ السجل.',
    );
    expect(claimInventory(row).candidates.map((candidate) => candidate.originalText)).toEqual([
      'يجب حفظ الحقوق (إذا أمكن)',
      'يجب حفظ السجل',
    ]);
    const split = intake('يجب حفظ الحقوق قال تعالى: (السماوات كلام المصدر).');
    const wordStart = split.originalText.indexOf('السماوات');
    split.segments = [
      {
        ...split.segments[0]!,
        endOffset: wordStart,
        originalText: split.originalText.slice(0, wordStart),
        codePointEnd: wordStart,
      },
      {
        ...split.segments[0]!,
        id: 'fragment',
        startOffset: wordStart,
        endOffset: wordStart + 8,
        originalText: 'السماوات',
        codePointStart: wordStart,
        codePointEnd: wordStart + 8,
      },
    ];
    expect(claimInventory(split).candidates.map((candidate) => candidate.originalText)).toEqual([
      'يجب حفظ الحقوق',
    ]);
  });
  it('keeps conditions, negations, exceptions and UTF16 offsets across repeat runs', () => {
    const row = intake(
      '😀 لذلك يجب حفظ الحقوق إذا أمكن، ولا يسقط الواجب إلا عند التعذر. هل يجب إسقاط الحقوق؟ «يجب تغيير النص»',
    );
    const first = claimInventory(row);
    expect(first).toEqual(claimInventory(structuredClone(row)));
    expect(first.candidates.map((candidate) => candidate.originalText)).toEqual([
      'يجب حفظ الحقوق إذا أمكن، ولا يسقط الواجب إلا عند التعذر',
    ]);
    expect(first.excluded.map((item) => item.reason)).toContain('question');
    expect(first.excluded.map((item) => item.reason)).toContain('quotation');
    for (const candidate of first.candidates) {
      expect(row.originalText.slice(candidate.startOffset, candidate.endOffset)).toBe(
        candidate.originalText,
      );
      expect(utf16Boundary(row.originalText, candidate.startOffset)).toBe(true);
      expect(utf16Boundary(row.originalText, candidate.endOffset)).toBe(true);
    }
  });

  it('binds repeated wording to distinct spans and normalizes reordered selection arrays', () => {
    const row = intake('يجب حفظ الحقوق. يجب حفظ السجل. يجب حفظ الحقوق.');
    const inventory = claimInventory(row);
    expect(new Set(inventory.candidates.map((candidate) => candidate.id)).size).toBe(3);
    const selections = inventory.candidates.map((candidate) => ({
      candidateId: candidate.id,
      evidenceKeys: ['owned-source'],
    }));
    const forward = resolveClaimSelection(row, inventory, { claims: selections });
    const backward = resolveClaimSelection(row, inventory, { claims: [...selections].reverse() });
    expect(forward).toEqual(backward);
    expect(forward.claims.map((claim) => claim.startOffset)).toEqual([0, 16, 31]);
    expect(
      resolveClaimSelection(row, inventory, {
        claims: [selections[0], selections[0], selections[1]],
      }),
    ).toMatchObject({ invalid: true, claims: [forward.claims[1]] });
    expect(() =>
      resolveClaimSelection(row, inventory, {
        claims: [{ segmentId: 'author', originalText: 'invented', evidenceKeys: [] }],
      }),
    ).toThrow();
    expect(
      resolveClaimSelection(row, inventory, {
        claims: [{ candidateId: `claim-${'0'.repeat(24)}`, evidenceKeys: [] }],
      }),
    ).toEqual({ invalid: true, claims: [] });
  });

  it('does not split an oversized sentence before its distant exception', () => {
    const row = intake(`يجب حفظ الحقوق ${'كلام '.repeat(330)}إلا عند التعذر`);
    expect(claimInventory(row)).toMatchObject({
      candidates: [],
      excluded: [{ reason: 'span_too_long' }],
    });
  });

  it('deduplicates overlapping author segments without model-order boundary choices', () => {
    const row = intake('يجب حفظ الحقوق.');
    row.segments.push({ ...row.segments[0]!, id: 'other' });
    const before = claimInventory(row);
    row.segments.reverse();
    expect(claimInventory(row)).toEqual(before);
    expect(before.candidates).toHaveLength(1);
  });
});

describe('relevance passages from immutable originals', () => {
  it('finds late-page context and retains neighboring condition, negation and exception', () => {
    const original = source(
      `${'مقدمة عامة عن الكتاب.\n'.repeat(250)}يشترط القدرة على الحفظ.\nلا يجوز إسقاط الحقوق.\nيجب حفظ الحقوق إلا عند التعذر.\nتطبق هذه الأحكام في نطاق السجل.\n${'خاتمة عامة عن الكتاب.\n'.repeat(150)}`,
    );
    const before = canonical(original);
    const passages = evidencePassages(original, 'يجب حفظ الحقوق');
    expect(passages[0]!.startOffset).toBeGreaterThan(1000);
    expect(passages[0]!.originalText).toContain('لا يجوز إسقاط الحقوق');
    expect(passages[0]!.originalText).toContain('إلا عند التعذر');
    expect(passages[0]!.originalText).toContain('نطاق السجل');
    for (const passage of passages)
      expect(original.originalText.slice(passage.startOffset, passage.endOffset)).toBe(
        passage.originalText,
      );
    expect(canonical(original)).toBe(before);
    expect(evidencePassages(structuredClone(original), 'يجب حفظ الحقوق')).toEqual(passages);
    expect(assessorEvidence(original, 'يجب حفظ الحقوق')).not.toHaveProperty('originalText');
    expect(passageTrace(original, 'يجب حفظ الحقوق')[0]).not.toHaveProperty('originalText');
  });

  it('ranks contradiction by matching topic, never by agreement', () => {
    const original = source(
      `${'مقدمة عامة.\n'.repeat(450)}لا يجب حفظ الحقوق.\nإلا إذا نص الاتفاق على ذلك.\n`,
    );
    expect(evidencePassages(original, 'يجب حفظ الحقوق')[0]!.originalText).toContain(
      'لا يجب حفظ الحقوق',
    );
    expect(evidencePassages(original, 'يجب حفظ الحقوق')[0]!.originalText).toContain('إلا إذا');
  });

  it('bounds a giant paragraph with explicit missing-context and intact surrogate pairs', () => {
    const original = source(
      `${'😀 كلام '.repeat(900)}يجب حفظ الحقوق ${'😀 كلام '.repeat(900)}إلا عند التعذر`,
    );
    const passages = evidencePassages(original, 'يجب حفظ الحقوق');
    expect(passages[0]!.originalText).toContain('يجب حفظ الحقوق');
    expect(passages[0]!.originalText).not.toContain('إلا عند التعذر');
    expect(passages[0]!.contextTruncated).toBe(true);
    expect(passages[0]!.boundaryTruncated).toBe(true);
    for (const passage of passages) {
      expect(passage.originalText.length).toBeLessThanOrEqual(4000);
      expect(utf16Boundary(original.originalText, passage.startOffset)).toBe(true);
      expect(utf16Boundary(original.originalText, passage.endOffset)).toBe(true);
    }
    expect(() => evidencePassages({ ...original, originalSha256: '0'.repeat(64) }, 'حقوق')).toThrow(
      'PASSAGE_HASH_MISMATCH',
    );
  });
});

describe('v1.7 assessment wire and coverage', () => {
  it('returns not_applicable for a segmented Quran quotation while empty model selection of author prose stays partial', async () => {
    const text = 'قال تعالى: ﴿وما خلقت الجن والإنس إلا ليعبدون﴾.';
    const row = intake(text);
    const template = row.segments[0]!;
    row.segments = [
      [0, 12, 'author_text'],
      [12, 44, 'ayah'],
      [44, 46, 'author_text'],
    ].map(([start, end, role], index) => ({
      ...template,
      id: `span-${index}`,
      startOffset: Number(start),
      endOffset: Number(end),
      codePointStart: Number(start),
      codePointEnd: Number(end),
      originalText: text.slice(Number(start), Number(end)),
      role: role as typeof template.role,
    }));
    expect(claimInventory(row).candidates).toEqual([]);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      modelResponse({ claims: [] }, 'owned/extractor'),
    );
    const adapter = createSemanticAssessmentAdapter({
      enabled: true,
      apiKey: 'owned',
      extractor: { modelId: 'owned/extractor', providerId: 'owned' },
      assessor: { modelId: 'owned/assessor', providerId: 'owned' },
      allowedModels: ['owned/extractor', 'owned/assessor'],
      allowedProviders: ['owned'],
      fetch,
    });
    expect(await adapter.assess(row)).toMatchObject({
      status: 'not_applicable',
      errorCode: null,
      claims: [],
      assessments: [],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await adapter.assess(intake('الكتابة عن الحقوق.'))).toMatchObject({
      status: 'partial',
      errorCode: 'no_claims_extracted',
      claims: [],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('repeats stable IDs/order while separately recording provisional model selection and unreviewed coverage', async () => {
    const original = intake(
      'يجب حفظ الحقوق. يجب حفظ السجل. يجب حفظ المال. يجب حفظ العهد. يجب حفظ الأمانة. يجب حفظ الكتاب.',
    );
    let reverse = false;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const data = JSON.parse(request.messages[1].content).untrustedData;
      if (request.response_format.json_schema.name === 'extraction') {
        const claims = data.candidates.slice(0, 5).map((candidate: { candidateId: string }) => ({
          candidateId: candidate.candidateId,
          evidenceKeys: ['E1'],
        }));
        reverse = !reverse;
        return modelResponse({ claims: reverse ? claims.reverse() : claims }, request.model);
      }
      return modelResponse(
        {
          assessments: data.claims.map((row: { claim: { id: string } }) => ({
            claimId: row.claim.id,
            status: 'not_established',
            conditions: [],
            negations: [],
            exceptions: [],
            scope: [],
            citations: [],
            explanation: 'لا يثبت النص هذا الاستنتاج.',
          })),
        },
        request.model,
      );
    });
    const adapter = createSemanticAssessmentAdapter({
      enabled: true,
      apiKey: 'owned',
      extractor: { modelId: 'owned/extractor', providerId: 'owned' },
      assessor: { modelId: 'owned/assessor', providerId: 'owned' },
      allowedModels: ['owned/extractor', 'owned/assessor'],
      allowedProviders: ['owned'],
      fetch,
    });
    const first = await adapter.assess(original);
    const second = await adapter.assess(original);
    expect(first.status).toBe('completed');
    expect(first.claims).toEqual(second.claims);
    expect(first.trace.claimCoverage).toMatchObject({
      claimLimitReached: true,
      candidates: expect.any(Array),
      unselectedIds: [claimInventory(original).candidates[5]!.id],
    });
    expect(first.trace.passageViews![0]!.passages[0]).not.toHaveProperty('originalText');
    // Read historical durable reports without rewriting their recorded versions.
    expect(
      SemanticAssessmentReportSchema.parse({
        ...first,
        trace: {
          ...first.trace,
          pipelineVersion: 'provisional-semantic-v1.6',
          promptVersion: 'evidence-support-v1.6',
          claimCoverage: undefined,
          passageViews: undefined,
        },
      }).trace.promptVersion,
    ).toBe('evidence-support-v1.6');
  });

  it('abstains for missing distant qualifier and rejects a citation hidden outside the supplied passage', async () => {
    const text = `يجب حفظ الحقوق ${'كلام '.repeat(1500)}إلا عند التعذر`;
    const original = intake('يجب حفظ الحقوق.', source(text));
    let mode: 'abstain' | 'hidden' | 'unsafe' = 'abstain';
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const data = JSON.parse(request.messages[1].content).untrustedData;
      expect(request.messages[0].content).toContain('untrusted data');
      if (request.response_format.json_schema.name === 'extraction')
        return modelResponse(
          {
            claims: [{ candidateId: data.candidates[0].candidateId, evidenceKeys: ['E1'] }],
          },
          request.model,
        );
      expect(request.messages[0].content).toContain('missing condition, negation, exception');
      expect(data.claims[0].evidence[0].passages[0].contextTruncated).toBe(true);
      return modelResponse(
        {
          assessments: [
            {
              claimId: data.claims[0].claim.id,
              status: mode === 'abstain' ? 'insufficient_context' : 'supported',
              conditions: [],
              negations: [],
              exceptions: [],
              scope: [],
              citations:
                mode !== 'abstain'
                  ? [
                      {
                        evidenceKey: 'owned-source',
                        excerpt: mode === 'hidden' ? 'إلا عند التعذر' : 'يجب حفظ الحقوق',
                      },
                    ]
                  : [],
              explanation: 'السياق مبتور؛ يلزم معرفة الاستثناء البعيد قبل إثبات الدعم.',
            },
          ],
        },
        request.model,
      );
    });
    const adapter = createSemanticAssessmentAdapter({
      enabled: true,
      apiKey: 'owned',
      extractor: { modelId: 'owned/extractor', providerId: 'owned' },
      assessor: { modelId: 'owned/assessor', providerId: 'owned' },
      allowedModels: ['owned/extractor', 'owned/assessor'],
      allowedProviders: ['owned'],
      fetch,
    });
    expect((await adapter.assess(original)).assessments[0]!.status).toBe('insufficient_context');
    mode = 'unsafe';
    const guarded = await adapter.assess(original);
    expect(guarded.assessments[0]!.status).toBe('insufficient_context');
    expect(guarded.assessments[0]!.explanation).toContain('يقطع جملة المصدر');
    mode = 'hidden';
    expect(await adapter.assess(original)).toMatchObject({
      status: 'partial',
      errorCode: 'invalid_citations',
      assessments: [],
    });
  });
});

describe('recognized bracketed citation inventory framing', () => {
  it('excludes a manifest-bound named Quran reference while retaining the complete qualified author assertion', () => {
    const original = {
      ...source('نص المصدر الأصلي.'),
      sourceRole: 'quran_text' as const,
      reference: '31:15',
    };
    const text =
      'لا يلزم طاعتهما في المعصية، ويلزم صحبتهما بالمعروف فيما لا إثم فيه. قال تعالى: ﴿نص المصدر الأصلي﴾ [لقمان:31:15].';
    const row = intake(text, original);
    const before = canonical(row);
    const inventory = claimInventory(row);
    expect(inventory.candidates).toHaveLength(1);
    expect(inventory.candidates[0]!.originalText).toBe(
      'لا يلزم طاعتهما في المعصية، ويلزم صحبتهما بالمعروف فيما لا إثم فيه',
    );
    expect(inventory.excluded).toContainEqual({
      startOffset: text.indexOf('[لقمان'),
      endOffset: text.indexOf('[لقمان') + '[لقمان:31:15]'.length,
      reason: 'framing',
    });
    expect(canonical(row)).toBe(before);
  });
  it('supports exact references and Arabic digits without asserting unmatched references are claims or source support', () => {
    const original = {
      ...source('نص المصدر.'),
      sourceRole: 'quran_text' as const,
      reference: '31:15',
    };
    for (const reference of ['[31:15]', '[لقمان:٣١:١٥]'])
      expect(
        claimInventory(intake('قال تعالى: ﴿نص المصدر﴾ ' + reference, original)).candidates,
      ).toEqual([]);
    const unmatched = claimInventory(intake('قال تعالى: ﴿نص المصدر﴾ [لقمان:31:16]', original));
    expect(
      unmatched.excluded.some(
        (row) => row.reason === 'framing' && row.startOffset === 'قال تعالى: ﴿نص المصدر﴾ '.length,
      ),
    ).toBe(false);
  });
  it.each([
    'يجب حفظ الحقوق [إلا عند التعذر، فلا يلزم ذلك].',
    'يجب حفظ الحقوق (إلا عند التعذر، فلا يلزم ذلك).',
    'لا يلزم حفظ السجل [إذا كان فيه ضرر]، ويلزم حفظ الحقوق.',
  ])('retains bracketed/parenthesized author qualifiers: %s', (text) => {
    const inventory = claimInventory(intake(text));
    expect(inventory.candidates).toHaveLength(1);
    expect(inventory.candidates[0]!.originalText).toBe(text.slice(0, -1));
    expect(inventory.excluded).toEqual([]);
  });
});
