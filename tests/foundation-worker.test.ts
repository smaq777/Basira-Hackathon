import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { sha256, type FoundationAdapter } from '../apps/api/src/foundation.js';
import { createFoundationWorker } from '../apps/api/src/review-worker.js';
import { createSemanticAssessmentAdapter } from '../apps/api/src/semantic-assessment.js';
import type { ReviewLease, ReviewStore } from '../apps/api/src/review-store.js';
import { canonical } from '../apps/api/src/foundation.js';
import {
  SEMANTIC_PIPELINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
  type SemanticAssessmentReport,
} from '../packages/contracts/src/semantic-assessment.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';

function fixture() {
  const text = 'يجب إخراج الزكاة.';
  const revisionId = randomUUID();
  const intake: FoundationIntake = {
    schemaVersion: 1,
    pipelineVersion: 'fixture',
    corpusVersion: 'pinned',
    researchOnly: false,
    revisionId,
    revisionSha256: sha256(text),
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    evidence: [],
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    segments: [
      {
        id: 's1',
        startOffset: 0,
        endOffset: text.length,
        codePointStart: 0,
        codePointEnd: text.length,
        originalText: text,
        role: 'author_text',
        roleStatus: 'unresolved',
        method: 'fixture',
        sourceKeys: [],
        roleProposal: null,
        conflict: false,
      },
    ],
  };
  const lease: ReviewLease = {
    reviewId: randomUUID(),
    revisionId,
    attempt: 1,
    token: 'fixture',
    inputSha256: sha256(text),
    evidenceStateSha256: null,
    text,
    corpusVersion: 'pinned',
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    leaseUntil: new Date(Date.now() + 15_000).toISOString(),
  };
  const store: ReviewStore = {
    acquire: vi.fn().mockResolvedValue(lease),
    heartbeat: vi.fn().mockResolvedValue(true),
    bindEvidence: vi.fn(async (acquired: ReviewLease, hash: string) => {
      acquired.evidenceStateSha256 = hash;
      return true;
    }),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
    ownedReport: vi.fn(),
    close: vi.fn(),
  };
  const adapter: FoundationAdapter = {
    analyze: vi.fn().mockResolvedValue(intake),
    close: vi.fn(),
  };
  return { intake, lease, store, adapter };
}

it('persists a revision-bound report with interpretation explicitly unassessed', async () => {
  const { lease, intake, store, adapter } = fixture();
  const worker = createFoundationWorker(adapter, store);
  expect(await worker.runOnce()).toBe(true);
  expect(store.bindEvidence).toHaveBeenCalledWith(lease, expect.stringMatching(/^[a-f0-9]{64}$/u));
  expect(store.complete).toHaveBeenCalledWith(
    lease,
    expect.objectContaining({
      revisionId: lease.revisionId,
      inputSha256: lease.inputSha256,
      evidenceStateSha256: lease.evidenceStateSha256,
      result: expect.objectContaining({
        intake,
        interpretation: expect.objectContaining({
          status: 'not_assessed',
          scholarlyApproval: false,
        }),
      }),
    }),
  );
  const result = vi.mocked(store.complete).mock.calls[0]![1].result;
  expect(result).not.toHaveProperty('semanticAssessment');
  expect(store.fail).not.toHaveBeenCalled();
  await worker.stop();
});

it('preserves validated first-pass evidence when optional context is unavailable', async () => {
  const { intake, store, adapter } = fixture();
  vi.mocked(adapter.analyze)
    .mockResolvedValueOnce(intake)
    .mockRejectedValueOnce(new Error('FOUNDATION_TIMEOUT'));
  const worker = createFoundationWorker(adapter, store);
  await worker.runOnce();
  expect(store.complete).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: 'partial',
      result: expect.objectContaining({
        intake: expect.objectContaining({ warnings: ['optional_context_unavailable'] }),
      }),
    }),
  );
  expect(store.fail).not.toHaveBeenCalled();
  await worker.stop();
});

it('does not require inference confirmation for a question followed by a quotation', async () => {
  const { intake, lease, store, adapter } = fixture();
  const quote = 'نص مقتبس واضح';
  const text = `ما معنى التوحيد؟ قال تعالى: «${quote}».`;
  const start = text.indexOf(quote);
  intake.originalText = lease.text = text;
  intake.revisionSha256 = lease.inputSha256 = sha256(text);
  intake.segments = [
    {
      ...intake.segments[0]!,
      id: 'quote',
      role: 'ayah',
      originalText: quote,
      startOffset: start,
      endOffset: start + quote.length,
      codePointStart: start,
      codePointEnd: start + quote.length,
    },
  ];
  const worker = createFoundationWorker(adapter, store);
  await worker.runOnce();
  expect(store.complete).toHaveBeenCalledWith(
    lease,
    expect.objectContaining({
      result: expect.objectContaining({
        interpretation: expect.objectContaining({
          status: 'not_applicable',
          applicability: {
            status: 'not_applicable',
            reason: 'question_and_quotations_only',
          },
        }),
      }),
    }),
  );
  expect(store.fail).not.toHaveBeenCalled();
  await worker.stop();
});

it('keeps a substantive assertion unassessed without a mandatory human gate', async () => {
  const { intake, lease, store, adapter } = fixture();
  const worker = createFoundationWorker(adapter, store);
  await worker.runOnce();
  expect(store.complete).toHaveBeenCalledWith(
    lease,
    expect.objectContaining({
      result: expect.objectContaining({
        interpretation: expect.objectContaining({
          status: 'not_assessed',
          applicability: {
            status: 'applicable',
            reason: 'assertion_present',
          },
        }),
      }),
    }),
  );
  expect(intake.originalText).toBe(lease.text);
  await worker.stop();
});

it('rejects enrichment from a different corpus without persisting a misleading report', async () => {
  const { intake, store, adapter } = fixture();
  vi.mocked(adapter.analyze)
    .mockResolvedValueOnce(intake)
    .mockResolvedValueOnce({ ...intake, corpusVersion: 'replaced' });
  const worker = createFoundationWorker(adapter, store);
  await worker.runOnce();
  expect(store.complete).not.toHaveBeenCalled();
  expect(store.bindEvidence).not.toHaveBeenCalled();
  expect(store.fail).toHaveBeenCalledWith(expect.anything(), 'invalid_evidence');
  await worker.stop();
});

it('does not persist results after the durable lease has been lost', async () => {
  const { store, adapter } = fixture();
  vi.mocked(store.bindEvidence).mockResolvedValue(false);
  const worker = createFoundationWorker(adapter, store);
  await worker.runOnce();
  expect(store.complete).not.toHaveBeenCalled();
  await worker.stop();
});

it('deduplicates concurrent notifications and stops without failing recoverable work', async () => {
  const { store, adapter } = fixture();
  vi.mocked(adapter.analyze).mockImplementation(
    (_text, _revision, _references, signal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('FOUNDATION_ABORTED')), {
          once: true,
        }),
      ),
  );
  const worker = createFoundationWorker(adapter, store);
  const first = worker.runOnce();
  const second = worker.runOnce();
  await vi.waitFor(() => expect(adapter.analyze).toHaveBeenCalledOnce());
  await worker.stop();
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(store.acquire).toHaveBeenCalledOnce();
  expect(store.fail).not.toHaveBeenCalled();
  expect(store.complete).not.toHaveBeenCalled();
  expect(adapter.close).toHaveBeenCalledOnce();
  expect(store.close).toHaveBeenCalledOnce();
  expect(await worker.runOnce()).toBe(false);
});

it('a late heartbeat from a finished lease cannot abort the next review', async () => {
  vi.useFakeTimers();
  const { intake, store, adapter } = fixture();
  let finishFirst!: (value: FoundationIntake) => void;
  let finishSecond!: (value: FoundationIntake) => void;
  let finishHeartbeat!: (owned: boolean) => void;
  let secondSignal: AbortSignal | undefined;
  vi.mocked(store.heartbeat).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishHeartbeat = resolve;
      }),
  );
  vi.mocked(adapter.analyze)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(intake)
    .mockImplementationOnce((_text, _revision, _references, signal) => {
      secondSignal = signal;
      return new Promise((resolve) => {
        finishSecond = resolve;
      });
    })
    .mockResolvedValueOnce(intake);
  const worker = createFoundationWorker(adapter, store);
  try {
    const first = worker.runOnce();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(store.heartbeat).toHaveBeenCalledOnce();
    finishFirst(intake);
    await first;
    const second = worker.runOnce();
    await vi.advanceTimersByTimeAsync(0);
    finishHeartbeat(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(secondSignal?.aborted).toBe(false);
    finishSecond(intake);
    await second;
    expect(store.complete).toHaveBeenCalledTimes(2);
  } finally {
    await worker.stop();
    vi.useRealTimers();
  }
});

it('persists every quotation finding beyond the five-claim proposal limit', async () => {
  const { intake, store, adapter } = fixture();
  const segment = intake.segments[0]!;
  intake.quotationFindings = Array.from({ length: 12 }, (_, i) => ({
    segmentId: `quote-${i}`,
    evidenceKey: null,
    status: 'unresolved' as const,
    matchedStart: null,
    matchedEnd: null,
    reason: 'Source identification required',
    comparison: {
      fidelity: 'unresolved' as const,
      extent: 'unknown' as const,
      differences: [],
      basis: 'none' as const,
    },
  }));
  intake.segments = intake.quotationFindings.map((finding) => ({
    ...segment,
    id: finding.segmentId,
  }));
  const worker = createFoundationWorker(adapter, store);
  await worker.runOnce();
  expect(store.fail).not.toHaveBeenCalled();
  const report = vi.mocked(store.complete).mock.calls[0]![1];
  expect(report.findings).toHaveLength(12);
  expect(report.findings.every((finding) => finding.claimText === intake.originalText)).toBe(true);
  await worker.stop();
});

function semanticFixture(intake: FoundationIntake): SemanticAssessmentReport {
  return {
    schemaVersion: 1,
    status: 'completed',
    provisional: true,
    scholarlyApproval: false,
    errorCode: null,
    claims: [
      {
        id: 'claim-' + 'a'.repeat(24),
        segmentId: 's1',
        originalText: intake.originalText,
        startOffset: 0,
        endOffset: intake.originalText.length,
        evidenceKeys: [],
        provisional: true,
      },
    ],
    assessments: [
      {
        claimId: 'claim-' + 'a'.repeat(24),
        status: 'insufficient_context',
        conditions: [],
        negations: [],
        exceptions: [],
        scope: [],
        citations: [],
        explanation: 'لا تتوفر مصادر كافية لهذا الادعاء.',
      },
    ],
    trace: {
      pipelineVersion: SEMANTIC_PIPELINE_VERSION,
      promptVersion: SEMANTIC_PROMPT_VERSION,
      inputSha256: intake.revisionSha256,
      evidenceSha256: sha256(canonical(intake.evidence)),
      extractionInputSha256: null,
      assessmentInputSha256: null,
      requests: [],
    },
    limitations: [],
  };
}

it('binds provisional semantic results into the durable report without scholarly approval', async () => {
  const { intake, store, adapter } = fixture();
  const semantic = { assess: vi.fn().mockResolvedValue(semanticFixture(intake)) };
  const worker = createFoundationWorker(adapter, store, semantic);
  await worker.runOnce();
  expect(store.fail).not.toHaveBeenCalled();
  const stored = vi.mocked(store.complete).mock.calls[0]![1];
  expect(stored.result.semanticAssessment).toMatchObject({
    status: 'completed',
    scholarlyApproval: false,
  });
  expect(stored.result.interpretation).toMatchObject({ status: 'provisional' });
  const result =
    stored.result as unknown as import('../packages/contracts/src/foundation.js').FoundationReport;
  expect(stored.evidenceStateSha256).toBe(
    sha256(
      canonical({
        intake: result.intake,
        themes: result.themes,
        improvementCards: result.improvementCards,
        interpretation: result.interpretation,
        semanticAssessment: result.semanticAssessment,
        pipelineVersion: result.pipelineVersion,
      }),
    ),
  );
  await worker.stop();
});

it('allows a measured long assessment within the semantic budget and review deadline', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), delay);
    return controller.signal;
  });
  const { intake, lease, store, adapter } = fixture();
  lease.deadlineAt = new Date(Date.now() + 90_000).toISOString();
  const semantic = {
    assess: vi.fn(
      (_intake: FoundationIntake, signal?: AbortSignal) =>
        new Promise<SemanticAssessmentReport>((resolve, reject) => {
          const timer = setTimeout(() => resolve(semanticFixture(intake)), 33_000);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('ABORTED'));
            },
            { once: true },
          );
        }),
    ),
  };
  const worker = createFoundationWorker(adapter, store, semantic);
  try {
    const pending = worker.runOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(timeout).toHaveBeenCalledWith(60_000);
    await vi.advanceTimersByTimeAsync(33_000);
    expect(await pending).toBe(true);
    expect(store.fail).not.toHaveBeenCalled();
    expect(vi.mocked(store.complete).mock.calls[0]![1].result.semanticAssessment).toMatchObject({
      status: 'completed',
    });
  } finally {
    await worker.stop();
    timeout.mockRestore();
    vi.useRealTimers();
  }
});

it.each(['exception', 'stale_hash', 'unknown_citation'] as const)(
  'preserves source results after semantic %s',
  async (kind) => {
    const { intake, store, adapter } = fixture();
    const result = semanticFixture(intake);
    if (kind === 'stale_hash') result.trace.inputSha256 = '0'.repeat(64);
    if (kind === 'unknown_citation')
      result.assessments[0]!.citations = [{ evidenceKey: 'invented', excerpt: 'نص' }];
    const semantic = {
      assess:
        kind === 'exception'
          ? vi.fn().mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'))
          : vi.fn().mockResolvedValue(result),
    };
    const worker = createFoundationWorker(adapter, store, semantic);
    await worker.runOnce();
    expect(store.fail).not.toHaveBeenCalled();
    const report = vi.mocked(store.complete).mock.calls[0]![1];
    expect(report.status).toBe('partial');
    expect(report.result.interpretation).toMatchObject({ status: 'unavailable' });
    expect(report.result).not.toHaveProperty('semanticAssessment');
    expect(JSON.stringify(report)).not.toContain('PRIVATE_PROVIDER_ERROR');
    expect(report.result.intake).toEqual(intake);
    await worker.stop();
  },
);

it('persists source results before the worker deadline when the real semantic adapter hangs', async () => {
  vi.useFakeTimers();
  // Node's native AbortSignal timer is not controlled by Vitest's fake clock.
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
    return controller.signal;
  });
  const { intake, lease, store, adapter } = fixture();
  // Owned synthetic source passage; this control tests persistence, not authenticity.
  const author = 'يجب حفظ حقوق الكاتب. ';
  const quote = 'نص إداري محفوظ';
  const text = `${author}«${quote}»`;
  const start = text.indexOf(quote);
  intake.originalText = lease.text = text;
  intake.revisionSha256 = lease.inputSha256 = sha256(text);
  intake.segments = [
    {
      ...intake.segments[0]!,
      originalText: author,
      endOffset: author.length,
      codePointEnd: author.length,
    },
    {
      ...intake.segments[0]!,
      id: 'source-quote',
      role: 'matn',
      roleStatus: 'source_matched',
      originalText: quote,
      startOffset: start,
      endOffset: start + quote.length,
      codePointStart: start,
      codePointEnd: start + quote.length,
      sourceKeys: ['owned-source'],
    },
  ];
  intake.evidence = [
    {
      snapshotKey: 'owned-source',
      sourceId: 'owned-fixture',
      sourceVersion: 'fixture-1',
      sourceRole: 'hadith_matn',
      reference: 'owned:1',
      originalText: quote,
      originalSha256: sha256(quote),
      work: 'Owned persistence fixture',
      author: null,
      edition: null,
      sourceUrl: null,
      approvalStatus: 'approved',
      researchOnly: false,
      parentSnapshotKey: null,
      delivery: 'snapshot',
      retrievalModes: ['exact'],
      provenance: { synthetic: true },
    },
  ];
  intake.quotationFindings = [
    {
      segmentId: 'source-quote',
      evidenceKey: 'owned-source',
      status: 'exact',
      reason: 'Owned exact control',
      matchedStart: 0,
      matchedEnd: quote.length,
      comparison: { fidelity: 'exact', extent: 'full', differences: [], basis: 'canonical' },
    },
  ];
  const startedAt = Date.now();
  lease.deadlineAt = new Date(startedAt + 6_100).toISOString();
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
  const semantic = createSemanticAssessmentAdapter({
    enabled: true,
    apiKey: 'owned-test-secret',
    extractor: { modelId: 'owned/extractor', providerId: 'owned-provider' },
    assessor: { modelId: 'owned/assessor', providerId: 'owned-provider' },
    allowedModels: ['owned/extractor', 'owned/assessor'],
    allowedProviders: ['owned-provider'],
    fetch,
  });
  const worker = createFoundationWorker(adapter, store, semantic);
  try {
    const pending = worker.runOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(1_100);
    expect(store.complete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await pending).toBe(true);
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalledOnce();
    const stored = vi.mocked(store.complete).mock.calls[0]![1];
    expect(stored.status).toBe('partial');
    expect(stored.result.intake).toEqual(intake);
    expect(stored.result.interpretation).toMatchObject({
      status: 'unavailable',
      scholarlyApproval: false,
    });
    expect(stored.result.semanticAssessment).toMatchObject({
      status: 'unavailable',
      errorCode: 'cancelled',
      assessments: [],
    });
    expect(stored.evidence).toHaveLength(1);
    expect(stored.evidence[0]!.originalText).toBe(quote);
    expect(stored.findings).toHaveLength(1);
    expect(stored.findings[0]).toMatchObject({
      claimText: quote,
      quoteStatus: 'exact',
      supportStatus: 'not_assessed',
    });
    expect(Date.parse(lease.deadlineAt) - Date.now()).toBe(5_000);
    expect(JSON.stringify(stored)).not.toContain('owned-test-secret');
    expect((fetch.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(true);
  } finally {
    await worker.stop();
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
