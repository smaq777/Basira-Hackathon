import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../apps/api/src/app.js';
import { OwnershipError, type BackendDatabase, type ReviewRun } from '../apps/api/src/database.js';
import { canonical, sha256 } from '../apps/api/src/foundation.js';
import type { FoundationReport } from '../packages/contracts/src/foundation.js';
import { analyzeThemes } from '../packages/contracts/src/themes.js';
import { fixtureIntake } from '../packages/contracts/src/themes.fixtures.js';

const sessionId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const revisionId = '33333333-3333-4333-8333-333333333333';
const reviewId = '55555555-5555-4555-8555-555555555555';
const secret = 'a'.repeat(64);
const ownedCookie = `basirah_guest=${sessionId}.${secret}`;
const originalText = '  🙂\nقال الكاتب: «نص اختبار هندسي»\t  ';
const servers: Server[] = [];

function fixture() {
  const run: ReviewRun = {
    reviewId,
    revisionId,
    status: 'queued',
    attempt: 1,
    corpusVersion: 'fixture-v1',
    createdAt: '2026-10-04T00:00:00.000Z',
    deadlineAt: '2026-10-04T00:01:00.000Z',
    completedAt: null,
  };
  const keys = new Set<string>();
  const database = {
    readiness: vi.fn<BackendDatabase['readiness']>().mockResolvedValue({
      ready: true,
      migrationVersion: '0007_complete_quotation_findings',
    }),
    purgeExpiredGuestSessions: vi.fn<BackendDatabase['purgeExpiredGuestSessions']>(),
    createGuestSession: vi.fn<BackendDatabase['createGuestSession']>(),
    deleteGuestSession: vi.fn<BackendDatabase['deleteGuestSession']>(),
    createDocument: vi.fn<BackendDatabase['createDocument']>().mockResolvedValue({
      documentId,
      revisionId,
      version: 1,
    }),
    createRevision: vi.fn<BackendDatabase['createRevision']>().mockResolvedValue({
      documentId,
      revisionId,
      version: 2,
    }),
    getRevision: vi.fn<BackendDatabase['getRevision']>().mockResolvedValue({
      documentId,
      revisionId,
      version: 1,
      text: originalText,
    }),
    createReviewRun: vi.fn<BackendDatabase['createReviewRun']>(
      async (_session, _secret, requestedRevision, key) => {
        const replayed = keys.has(key);
        keys.add(key);
        return { ...run, revisionId: requestedRevision, replayed };
      },
    ),
    getReviewRun: vi.fn<BackendDatabase['getReviewRun']>().mockResolvedValue(run),
    cancelReviewRun: vi.fn<BackendDatabase['cancelReviewRun']>(),
    close: vi.fn<BackendDatabase['close']>(),
  } satisfies BackendDatabase;
  const foundation = {
    worker: { notify: vi.fn() },
    reports: { ownedReport: vi.fn().mockResolvedValue(null) },
    researchPreview: true,
  };
  return { database, foundation, run };
}

function reportFixture(): FoundationReport {
  const intake = { ...fixtureIntake(originalText, false), revisionId };
  const themes = analyzeThemes(intake);
  const interpretation = {
    status: 'not_assessed' as const,
    explanation: 'لم يُنفذ تقييم دلالي في اختبار البرمجيات.',
    scholarlyApproval: false as const,
  };
  const pipelineVersion = `${intake.pipelineVersion}/${themes.detectorVersion}`;
  return {
    schemaVersion: 1,
    reviewId,
    revisionId,
    inputSha256: intake.revisionSha256,
    evidenceStateSha256: sha256(
      canonical({ intake, themes, improvementCards: [], interpretation, pipelineVersion }),
    ),
    pipelineVersion,
    generatedAt: '2026-10-04T00:00:30.000Z',
    status: 'completed',
    intake,
    themes,
    improvementCards: [],
    interpretation,
    limitations: ['Engineering fixture only.'],
  };
}

async function serve(options: Parameters<typeof createApp>[0]) {
  const server = createApp({ ...options, production: false }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: ownedCookie, ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  vi.restoreAllMocks();
});

it('preserves whitespace and Unicode originals in documents and subsequent revisions', async () => {
  const { database, foundation } = fixture();
  const base = await serve({ database, foundation });
  expect((await post(base, '/api/v1/documents', { text: originalText })).status).toBe(201);
  expect(database.createDocument).toHaveBeenCalledWith(sessionId, secret, originalText);
  expect(
    (await post(base, `/api/v1/documents/${documentId}/revisions`, { text: originalText })).status,
  ).toBe(201);
  expect(database.createRevision).toHaveBeenCalledWith(sessionId, secret, documentId, originalText);
  expect((await post(base, '/api/v1/documents', { text: '\n \t ' })).status).toBe(400);
  expect(database.createDocument).toHaveBeenCalledTimes(1);
});

it('reports opted-in source acquisition without claiming semantic verification', async () => {
  const { database, foundation } = fixture();
  const base = await serve({ database, foundation: { ...foundation, liveTafsir: true } });
  const response = await fetch(base + '/api/v1/capabilities');
  expect(await response.json()).toMatchObject({
    liveProviders: ['tafsir_mcp'],
    verification: false,
    draftRewrite: false,
  });
});

it('applies the source-worker UTF16 length limit before documents, revisions or jobs are written', async () => {
  const { database, foundation } = fixture();
  const text = '🙂'.repeat(1501);
  database.getRevision.mockResolvedValue({ documentId, revisionId, version: 1, text });
  const base = await serve({ database, foundation });
  for (const [path, body, headers] of [
    ['/api/v1/documents', { text }, {}],
    [`/api/v1/documents/${documentId}/revisions`, { text }, {}],
    [
      '/api/v1/reviews',
      { revisionId },
      { 'idempotency-key': '66666666-6666-4666-8666-666666666666' },
    ],
  ] as const) {
    const response = await post(base, path, body, headers);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'TEXT_TOO_LONG', maximumTextLength: 3000 });
  }
  expect(database.createDocument).not.toHaveBeenCalled();
  expect(database.createRevision).not.toHaveBeenCalled();
  expect(database.createReviewRun).not.toHaveBeenCalled();
  expect(foundation.worker.notify).not.toHaveBeenCalled();
});

it('keeps the existing intake limit when source review is unconfigured', async () => {
  const { database } = fixture();
  const base = await serve({ database });
  expect((await post(base, '/api/v1/documents', { text: 'ن'.repeat(3001) })).status).toBe(201);
  const capabilities = await fetch(base + '/api/v1/capabilities');
  expect(await capabilities.json()).toMatchObject({
    foundationReview: false,
    maximumTextLength: 12000,
  });
});

it('notifies the durable worker for first creation and idempotent replay of the same job', async () => {
  const { database, foundation } = fixture();
  const base = await serve({ database, foundation });
  const headers = { 'idempotency-key': '66666666-6666-4666-8666-666666666666' };
  const first = await post(base, '/api/v1/reviews', { revisionId }, headers);
  expect(first.status).toBe(202);
  expect(await first.json()).toMatchObject({ reviewId, revisionId, status: 'queued' });
  const replay = await post(base, '/api/v1/reviews', { revisionId }, headers);
  expect(replay.status).toBe(200);
  expect(replay.headers.get('idempotent-replayed')).toBe('true');
  expect(await replay.json()).toMatchObject({ reviewId, revisionId });
  expect(database.createReviewRun).toHaveBeenCalledTimes(2);
  expect(foundation.worker.notify).toHaveBeenCalledTimes(2);
});

it('does not enqueue or notify for an unavailable owned revision', async () => {
  const { database, foundation } = fixture();
  database.getRevision.mockResolvedValue(null);
  const base = await serve({ database, foundation });
  expect(
    (
      await post(
        base,
        '/api/v1/reviews',
        { revisionId },
        { 'idempotency-key': '66666666-6666-4666-8666-666666666666' },
      )
    ).status,
  ).toBe(404);
  expect(database.createReviewRun).not.toHaveBeenCalled();
  expect(foundation.worker.notify).not.toHaveBeenCalled();
});

it('requires guest credentials before inspecting runs or reports', async () => {
  const { database, foundation } = fixture();
  const base = await serve({ database, foundation });
  const response = await fetch(`${base}/api/v1/reviews/${reviewId}/report`);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: 'INVALID_OR_EXPIRED_SESSION' });
  expect(database.getReviewRun).not.toHaveBeenCalled();
  expect(foundation.reports.ownedReport).not.toHaveBeenCalled();
});

it('returns 404 without reading a report for a run the session cannot access', async () => {
  const { database, foundation } = fixture();
  database.getReviewRun.mockResolvedValue(null);
  const base = await serve({ database, foundation });
  const response = await fetch(`${base}/api/v1/reviews/${reviewId}/report`, {
    headers: { cookie: ownedCookie },
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: 'REVIEW_NOT_FOUND' });
  expect(foundation.reports.ownedReport).not.toHaveBeenCalled();
});

it('rejects a guest session that expires between the run and report reads', async () => {
  const { database, foundation } = fixture();
  foundation.reports.ownedReport.mockRejectedValue(new OwnershipError());
  const base = await serve({ database, foundation });
  const response = await fetch(`${base}/api/v1/reviews/${reviewId}/report`, {
    headers: { cookie: ownedCookie },
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: 'INVALID_OR_EXPIRED_SESSION' });
});

it('returns 202 while an owned run has no durable report', async () => {
  const { database, foundation } = fixture();
  const base = await serve({ database, foundation });
  const response = await fetch(`${base}/api/v1/reviews/${reviewId}/report`, {
    headers: { cookie: ownedCookie },
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ report: null, reviewId, revisionId, status: 'queued' });
  expect(foundation.reports.ownedReport).toHaveBeenCalledWith(sessionId, secret, reviewId);
});

it('returns the validated report with its exact original and separate interpretation indicator', async () => {
  const { database, foundation, run } = fixture();
  const report = reportFixture();
  foundation.reports.ownedReport.mockResolvedValue(report);
  database.getReviewRun.mockResolvedValue({
    ...run,
    status: 'completed',
    completedAt: report.generatedAt,
  });
  const base = await serve({ database, foundation });
  const response = await fetch(`${base}/api/v1/reviews/${reviewId}/report`, {
    headers: { cookie: ownedCookie },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ report });
});

it.each(['schema', 'review', 'revision'] as const)(
  'fails closed on a stored report with invalid %s binding',
  async (kind) => {
    const { database, foundation } = fixture();
    const report = reportFixture();
    foundation.reports.ownedReport.mockResolvedValue(
      kind === 'schema'
        ? { ...report, interpretation: { ...report.interpretation, scholarlyApproval: true } }
        : {
            ...report,
            [kind === 'review' ? 'reviewId' : 'revisionId']: '77777777-7777-4777-8777-777777777777',
          },
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = await serve({ database, foundation });
    const response = await fetch(`${base}/api/v1/reviews/${reviewId}/report`, {
      headers: { cookie: ownedCookie },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'SERVICE_UNAVAILABLE' });
  },
);

it.each(['0004_runtime_private_schema_usage', '0005_expired_guest_cleanup'])(
  'keeps source review unavailable on schema %s',
  async (migrationVersion) => {
    const { database, foundation } = fixture();
    database.readiness.mockResolvedValue({ ready: true, migrationVersion });
    const base = await serve({ database, foundation });
    const response = await fetch(base + '/api/v1/capabilities');
    expect(await response.json()).toMatchObject({
      foundationReview: false,
      verification: false,
      draftRewrite: false,
      liveProviders: [],
    });
  },
);

it('advertises source review only after the database and bridge schema are ready', async () => {
  const { database, foundation } = fixture();
  const base = await serve({ database, foundation });
  expect(await (await fetch(base + '/api/v1/capabilities')).json()).toMatchObject({
    foundationReview: true,
    maximumTextLength: 3000,
    verification: false,
  });
  database.readiness.mockResolvedValue({ ready: false, reason: 'unreachable' });
  expect(await (await fetch(base + '/api/v1/capabilities')).json()).toMatchObject({
    foundationReview: false,
  });
});
