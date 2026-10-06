import { describe, expect, it, vi } from 'vitest';
import { runSubmissionAcceptance } from '../scripts/acceptance-submission-staging.mjs';

const CORPUS = '7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f';
const REVIEW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVISION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function harness(
  options: {
    status?: string;
    pending?: boolean;
    remainingMs?: number;
    mutate?: (report: any) => void;
    anonymousStatus?: number;
    reloadChanged?: boolean;
  } = {},
) {
  let time = Date.parse('2026-10-06T09:00:00Z');
  let text = '',
    reportRequests = 0;
  const writes = new Map<string, string>();
  const calls: { path: string; cookie: string; method: string }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const headers = new Headers(init?.headers);
    calls.push({ path, cookie: headers.get('cookie') ?? '', method: init?.method ?? 'GET' });
    function reply(body: unknown, status = 200, setCookie?: string) {
      return new Response(JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json',
          ...(setCookie ? { 'set-cookie': setCookie } : {}),
        },
      });
    }
    if (path === '/api/v1/sessions')
      return reply({ sessionId: 'owned' }, 201, 'basirah_guest=owned-secret; Secure; HttpOnly');
    if (path === '/api/v1/documents') {
      text = JSON.parse(String(init!.body)).text;
      return reply({ revisionId: REVISION_ID }, 201);
    }
    if (path === '/api/v1/reviews')
      return reply(
        {
          reviewId: REVIEW_ID,
          status: 'queued',
          deadlineAt: new Date(time + (options.remainingMs ?? 300_000)).toISOString(),
        },
        202,
      );
    if (path === `/api/v1/reviews/${REVIEW_ID}`)
      return reply({
        status: options.status ?? (reportRequests === 0 ? 'retrieving' : 'completed'),
      });
    if (path === `/api/v1/reviews/${REVIEW_ID}/report`) {
      if (!headers.has('cookie'))
        return reply({ code: 'INVALID_OR_EXPIRED_SESSION' }, options.anonymousStatus ?? 401);
      reportRequests++;
      if (options.pending && reportRequests === 1)
        return reply({ report: null, status: 'retrieving' }, 202);
      const offTopic = text.startsWith('يشرح هذا النص');
      const report = {
        reviewId: REVIEW_ID,
        revisionId: REVISION_ID,
        intake: { corpusVersion: CORPUS, originalText: text, evidence: [] },
        semanticAssessment: {
          status: offTopic ? 'partial' : 'completed',
          errorCode: offTopic ? 'no_claims_extracted' : null,
          claims: offTopic ? [] : [{ id: 'claim-owned' }],
          assessments: offTopic ? [] : [{ status: 'supported' }],
          trace: {
            promptVersion: 'evidence-support-v1.14',
            pipelineVersion: 'provisional-semantic-v1.14',
            requests: [{ stage: 'extraction', outcome: 'success', httpStatus: 200 }],
            ...(!offTopic ? { retrieval: { corpusVersion: CORPUS } } : {}),
          },
        },
      };
      options.mutate?.(report);
      if (options.reloadChanged && reportRequests > 1) report.intake.originalText = 'changed';
      return reply({ report });
    }
    throw new Error(`UNEXPECTED_REQUEST_${path}`);
  });
  return {
    writes,
    calls,
    fetch,
    dependencies: {
      fetch,
      now: () => time,
      sleep: vi.fn(async (milliseconds: number) => {
        time += milliseconds;
      }),
      writeFile: vi.fn(async (path: string, value: string) => {
        writes.set(path, value);
      }),
      mkdir: vi.fn(async () => {}),
      log: vi.fn(),
    },
  };
}

describe('bounded submission acceptance harness', () => {
  it('makes no calls or files without live opt-in or for invalid case arguments', async () => {
    const run = harness();
    expect((await runSubmissionAcceptance([], run.dependencies)).exitCode).toBe(2);
    await expect(
      runSubmissionAcceptance(['--live', '--case=unknown'], run.dependencies),
    ).rejects.toThrow('UNKNOWN_ACCEPTANCE_ARGUMENT_OR_CASE');
    await expect(runSubmissionAcceptance(['--live', '--case='], run.dependencies)).rejects.toThrow(
      'UNKNOWN_ACCEPTANCE_ARGUMENT_OR_CASE',
    );
    expect(run.fetch).not.toHaveBeenCalled();
    expect(run.dependencies.mkdir).not.toHaveBeenCalled();
  });

  it('polls actual202/null responses, retains the first report, reloads it and denies anonymous access', async () => {
    const run = harness({ pending: true });
    const result = await runSubmissionAcceptance(
      ['--live', '--case=supported-negation'],
      run.dependencies,
    );
    expect(result.exitCode).toBe(0);
    expect(result.rows[0]!.passed).toBe(true);
    expect(run.dependencies.sleep).toHaveBeenCalledOnce();
    expect(run.calls.filter((row) => row.path.endsWith('/report'))).toHaveLength(4);
    expect(run.calls.at(-1)!.cookie).toBe('');
    expect(run.calls.slice(1, -1).every((row) => row.cookie === 'basirah_guest=owned-secret')).toBe(
      true,
    );
    expect(
      [...run.writes.keys()].some((path) => path.endsWith('supported-negation-report.json')),
    ).toBe(true);
    const receipt = JSON.parse([...run.writes].find(([path]) => path.endsWith('receipt.json'))![1]);
    expect(receipt.rows[0].passed).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain('owned-secret');
    expect(run.calls.every((row) => !/ticket|rewrite|reviewer/u.test(row.path))).toBe(true);
  });

  it.each(['interrupted', 'failed', 'cancelled'])(
    'stops %s without polling a missing report',
    async (status) => {
      const run = harness({ status });
      const result = await runSubmissionAcceptance(
        ['--live', '--case=supported-negation'],
        run.dependencies,
      );
      expect(result.rows[0]!.failure).toBe(`REVIEW_${status}`);
      expect(run.calls.some((row) => row.path.endsWith('/report'))).toBe(false);
      expect(run.dependencies.sleep).not.toHaveBeenCalled();
    },
  );

  it('uses the server deadline instead of cutting a valid300second run at185seconds', async () => {
    const run = harness({ pending: true });
    run.dependencies.sleep.mockImplementation(async () => {
      // Simulate a slow but valid first poll interval.
      const initial = run.dependencies.now;
      run.dependencies.now = () => initial() + 190_000;
    });
    // Supply a now wrapper so changing the mock clock remains visible to the runner.
    const result = await runSubmissionAcceptance(['--live', '--case=supported-negation'], {
      ...run.dependencies,
      now: () => run.dependencies.now(),
    });
    expect(result.exitCode).toBe(0);
  });

  it('ends at the server deadline plus five seconds when reports remain pending', async () => {
    const run = harness({ pending: true, remainingMs: -4999 });
    const result = await runSubmissionAcceptance(
      ['--live', '--case=supported-negation'],
      run.dependencies,
    );
    expect(result.rows[0]!.failure).toBe('REVIEW_DEADLINE');
    expect(run.dependencies.sleep).toHaveBeenCalledWith(1);
    expect(run.calls.filter((row) => row.path.endsWith('/report'))).toHaveLength(1);
  });

  it.each([
    [
      'CORPUS_PIN_MISMATCH',
      (report: any) => {
        report.intake.corpusVersion = 'old86';
      },
    ],
    [
      'RETRIEVAL_CORPUS_PIN_MISMATCH',
      (report: any) => {
        report.semanticAssessment.trace.retrieval.corpusVersion = 'old86';
      },
    ],
    [
      'SEMANTIC_VERSION_MISMATCH',
      (report: any) => {
        report.semanticAssessment.trace.promptVersion = 'evidence-support-v1.10';
      },
    ],
    [
      'REPORT_BINDING_MISMATCH',
      (report: any) => {
        report.reviewId = 'another-review';
      },
    ],
  ])('retains the failed first report for %s without resubmitting', async (failure, mutate) => {
    const run = harness({ mutate });
    const result = await runSubmissionAcceptance(
      ['--live', '--case=supported-negation'],
      run.dependencies,
    );
    expect(result.rows[0]!.failure).toBe(failure);
    expect(result.exitCode).toBe(1);
    expect([...run.writes.keys()].some((path) => path.endsWith('-report.json'))).toBe(true);
    expect(run.calls.filter((row) => row.path === '/api/v1/reviews')).toHaveLength(1);
  });

  it.each([
    [{ reloadChanged: true }, 'REPORT_RELOAD_MISMATCH'],
    [{ anonymousStatus: 200 }, 'ANONYMOUS_REPORT_NOT_DENIED'],
  ] as const)('fails the ownership/reload gate with %s', async (options, failure) => {
    const run = harness(options);
    const result = await runSubmissionAcceptance(
      ['--live', '--case=supported-negation'],
      run.dependencies,
    );
    expect(result.rows[0]!.failure).toBe(failure);
    expect(result.exitCode).toBe(1);
  });

  it('expects the selected corpus on off-topic intake without requiring a retrieval trace', async () => {
    const run = harness();
    const result = await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies);
    expect(result.exitCode).toBe(0);
    expect(result.rows[0]!.passed).toBe(true);
  });

  it('accepts explicit off-topic abstention without evidence or citations', async () => {
    const run = harness({
      mutate(report) {
        report.semanticAssessment.status = 'completed';
        report.semanticAssessment.errorCode = null;
        report.semanticAssessment.claims = [{ id: 'off-topic', evidenceKeys: [] }];
        report.semanticAssessment.assessments = [{ status: 'not_applicable', citations: [] }];
      },
    });
    expect(
      (await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies)).exitCode,
    ).toBe(0);
  });

  it.each([
    ['unavailable', 'gateway_blocked'],
    ['disabled', null],
    ['partial', 'timeout'],
    ['partial', 'invalid_claims'],
  ])('does not count empty %s/%s as live off-topic acceptance', async (status, errorCode) => {
    const run = harness({
      mutate(report) {
        report.semanticAssessment.status = status;
        report.semanticAssessment.errorCode = errorCode;
        report.semanticAssessment.trace.requests = [
          { stage: 'extraction', outcome: 'gateway_blocked', httpStatus: 403 },
        ];
      },
    });
    const result = await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies);
    expect(result.exitCode).toBe(1);
    expect(result.rows[0]!.failure).toBe('OFF_TOPIC_SEMANTIC_UNAVAILABLE');
    expect([...run.writes.keys()].some((path) => path.endsWith('off-topic-report.json'))).toBe(
      true,
    );
    expect(run.calls.filter((row) => row.path === '/api/v1/reviews')).toHaveLength(1);
  });

  it('requires a successful extraction receipt for inconclusive empty selection', async () => {
    const run = harness({
      mutate(report) {
        report.semanticAssessment.trace.requests = [];
      },
    });
    const result = await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies);
    expect(result.exitCode).toBe(1);
    expect(result.rows[0]!.failure).toBe('OFF_TOPIC_SEMANTIC_UNAVAILABLE');
  });

  it('accepts deterministic not-applicable without inventing a model receipt', async () => {
    const run = harness({
      mutate(report) {
        report.semanticAssessment.status = 'not_applicable';
        report.semanticAssessment.errorCode = null;
        report.semanticAssessment.trace.requests = [];
      },
    });
    expect(
      (await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies)).exitCode,
    ).toBe(0);
  });

  it.each(['supported', 'insufficient_context', 'not_established'])(
    'rejects an off-topic religious assessment with status %s',
    async (status) => {
      const run = harness({
        mutate(report) {
          report.semanticAssessment.claims = [{ id: 'off-topic', evidenceKeys: [] }];
          report.semanticAssessment.assessments = [{ status, citations: [] }];
        },
      });
      expect(
        (await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies)).exitCode,
      ).toBe(1);
    },
  );

  it('rejects unrelated evidence even when the off-topic finding abstains', async () => {
    const run = harness({
      mutate(report) {
        report.intake.evidence = [{ snapshotKey: 'unrelated' }];
        report.semanticAssessment.claims = [{ id: 'off-topic', evidenceKeys: ['unrelated'] }];
        report.semanticAssessment.assessments = [{ status: 'not_applicable', citations: [] }];
      },
    });
    expect(
      (await runSubmissionAcceptance(['--live', '--case=off-topic'], run.dependencies)).exitCode,
    ).toBe(1);
  });
});
