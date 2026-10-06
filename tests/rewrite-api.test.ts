import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app.js';
import {
  DatabaseUnavailable,
  OwnershipError,
  type BackendDatabase,
} from '../apps/api/src/database.js';
import { createRewriteService, rewriteInput } from '../apps/api/src/rewrite.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { foundationReportFixture } from '../apps/web/src/foundation-report.fixtures.js';
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  vi.restoreAllMocks();
});
it('binds POST/read/copy to database-owned review/revision and rejects tampered verdicts and foreign cookies', async () => {
  const report = foundationReportFixture();
  report.inputSha256 = report.intake.revisionSha256 = sha256(report.intake.originalText);
  report.intake.evidence[0]!.originalSha256 = sha256(report.intake.evidence[0]!.originalText);
  const database: BackendDatabase = new DatabaseUnavailable();
  let attempt = 1;
  let status = 'completed';
  vi.spyOn(database, 'getReviewRun').mockImplementation(async (_owner, secret) => {
    if (secret !== 'a'.repeat(64)) throw new OwnershipError();
    return {
      reviewId: report.reviewId,
      revisionId: report.revisionId,
      status: status as 'completed',
      attempt,
      corpusVersion: 'test',
      createdAt: report.generatedAt,
      deadlineAt: report.generatedAt,
      completedAt: report.generatedAt,
    };
  });
  vi.spyOn(database, 'getRevision').mockResolvedValue({
    documentId: randomUUID(),
    revisionId: report.revisionId,
    version: 1,
    text: report.intake.originalText,
  });
  const cite = rewriteInput(report).allowedCitations[0]!;
  const rewrite = createRewriteService(async () => ({
    paragraphBreaks: [],
    citations: [{ offset: cite.offset, evidenceKey: cite.evidenceKey }],
  }));
  const server = createApp({
    database,
    rewrite,
    foundation: {
      worker: { notify() {} },
      reports: { ownedReport: async () => report },
      researchPreview: true,
    },
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/reviews/${report.reviewId}/rewrites`;
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `basirah_guest=${randomUUID()}.${'a'.repeat(64)}`,
    'Idempotency-Key': randomUUID(),
  };
  const body = { inputSha256: report.inputSha256, evidenceStateSha256: report.evidenceStateSha256 };
  expect(
    (
      await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, verdict: 'supported' }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, inputSha256: '0'.repeat(64) }),
      })
    ).status,
  ).toBe(409);
  const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
  expect(response.status).toBe(202);
  const { candidate } = await response.json();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const read = await fetch(`${base}/${candidate.id}`, { headers });
  expect(read.status).toBe(200);
  const displayed = (await read.json()).candidate.text;
  const copy = await fetch(`${base}/${candidate.id}/copy`, { method: 'POST', headers, body: '{}' });
  expect(copy.status).toBe(200);
  const copied = (await copy.json()).text;
  expect(copied).toBe(displayed);
  expect(copied).toContain('\n\nReferences\n1. ');
  expect(copied).toContain('مصدر بحثي غير معتمد');
  expect(
    (
      await fetch(`${base}/${candidate.id}`, {
        headers: { ...headers, Cookie: `basirah_guest=${randomUUID()}.${'b'.repeat(64)}` },
      })
    ).status,
  ).toBe(401);
  attempt = 2;
  expect(
    (await fetch(`${base}/${candidate.id}/copy`, { method: 'POST', headers, body: '{}' })).status,
  ).toBe(409);
  status = 'cancelled';
  expect((await fetch(`${base}/${candidate.id}`, { headers })).status).toBe(409);
  rewrite.close();
});
