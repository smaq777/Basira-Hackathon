import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { sha256, type FoundationAdapter } from '../apps/api/src/foundation.js';
import { createFoundationWorker } from '../apps/api/src/review-worker.js';
import type { ReviewLease, ReviewStore } from '../apps/api/src/review-store.js';
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
