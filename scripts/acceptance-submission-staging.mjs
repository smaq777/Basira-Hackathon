import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

// Explicitly bounded synthetic provider checks; never publish, email or approve sources.
const origin = 'https://api-staging-42bc.up.railway.app';
const corpusVersion = '7372242cf7f4960c2cba0a33d8670a04ce13413f9fab5536783d6a3671e3ad6f';
const cases = [
  {
    name: 'supported-negation',
    text: 'قال تعالى: «وكلوا واشربوا ولا تسرفوا» [الأعراف: 31]. تدل الآية على النهي عن الإسراف في الأكل والشرب.',
    expected: 'supported',
  },
  {
    name: 'contradicted-negation',
    text: 'قال تعالى: «وكلوا واشربوا ولا تسرفوا» [الأعراف: 31]. تدل الآية على أن الإسراف في الطعام والشراب مطلوب شرعًا.',
    expected: 'contradicted',
  },
  {
    name: 'supported-condition',
    text: 'قال تعالى: «وإن تخفوها وتؤتوها الفقراء فهو خير لكم» [البقرة: 271]. إخفاء الصدقة وإعطاؤها للفقراء خير للمتصدق.',
    expected: 'supported',
  },
  {
    name: 'contradicted-condition',
    text: 'قال تعالى: «إلا أن تكون تجارة عن تراض منكم» [النساء: 29]. تدل الآية على جواز أخذ أموال الناس بالتجارة ولو لم يتراضوا عليها.',
    expected: 'contradicted',
  },
  {
    name: 'unavailable-narration',
    text: 'قال رسول الله صلى الله عليه وسلم: «أعلنوا هذا النكاح». وقال لعبد الرحمن بن عوف رضي الله عنه: «أولم ولو بشاة». إقامة وليمة النكاح من إظهار الفرح بنعمة الزواج.',
    expected: 'insufficient_context',
  },
  {
    name: 'off-topic',
    text: 'يشرح هذا النص طريقة ترتيب الملفات في المجلد وتجميع الصور بحسب التاريخ، ولا يتضمن أي اقتباس من القرآن أو الحديث ولا يقدم حكمًا دينيًا.',
    expected: 'no_assessment',
  },
];

export async function runSubmissionAcceptance(args, dependencies = {}) {
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const save = dependencies.writeFile ?? writeFile;
  const makeDirectory = dependencies.mkdir ?? mkdir;
  const log = dependencies.log ?? console.log;
  if (!args.includes('--live')) {
    log(
      'Requires scoped live-provider authorization: pass --live to run synthetic staging reviews.',
    );
    log(`Available cases: ${cases.map((row) => row.name).join(', ')}`);
    return { exitCode: 2, rows: [] };
  }
  const caseArguments = args.filter((arg) => arg.startsWith('--case='));
  const selectedName = caseArguments[0]?.slice(7);
  const selected = caseArguments.length ? cases.filter((row) => row.name === selectedName) : cases;
  if (
    caseArguments.length > 1 ||
    !selected.length ||
    args.some((arg) => arg !== '--live' && !arg.startsWith('--case='))
  )
    throw new Error('UNKNOWN_ACCEPTANCE_ARGUMENT_OR_CASE');
  const output = resolve(
    'test-results',
    `submission-acceptance-${new Date(now()).toISOString().replaceAll(':', '-')}`,
  );
  await makeDirectory(output, { recursive: true });
  const rows = [];
  let cookie = '';
  async function request(path, body, anonymous = false) {
    const response = await fetcher(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: origin,
        ...(cookie && !anonymous ? { cookie } : {}),
        ...(body === undefined ? {} : { 'Idempotency-Key': randomUUID() }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie && !anonymous) cookie = setCookie.split(';')[0];
    const value = await response.json();
    if (!response.ok && !anonymous)
      throw new Error(`STAGING_HTTP_${response.status}_${value.code ?? 'UNKNOWN'}`);
    return { status: response.status, value };
  }
  for (const test of selected) {
    const row = { case: test.name, expected: test.expected, passed: false };
    try {
      // Separate expiring sessions avoid making one case depend on another's guest quota.
      await request('/api/v1/sessions', {});
      const document = (await request('/api/v1/documents', { text: test.text })).value;
      const run = (await request('/api/v1/reviews', { revisionId: document.revisionId })).value;
      row.reviewId = run.reviewId;
      const runDeadline = Date.parse(run.deadlineAt);
      if (!document.revisionId || !run.reviewId || !Number.isFinite(runDeadline))
        throw new Error('INVALID_REVIEW_RESPONSE');
      // Match the browser's bounded wait: server deadline plus five seconds, at most305seconds.
      const deadline = Math.min(runDeadline + 5000, now() + 305_000);
      let report;
      while (now() < deadline) {
        const state = (await request(`/api/v1/reviews/${run.reviewId}`)).value;
        if (['failed', 'timed_out', 'cancelled', 'interrupted'].includes(state.status))
          throw new Error(`REVIEW_${state.status}`);
        report = (await request(`/api/v1/reviews/${run.reviewId}/report`)).value.report;
        if (report) break;
        await sleep(Math.min(2500, Math.max(0, deadline - now())));
      }
      if (!report) throw new Error('REVIEW_DEADLINE');
      // Save the first outcome before assertions; never repeat a failed model call.
      await save(resolve(output, `${test.name}-report.json`), JSON.stringify(report, null, 2));
      const semantic = report.semanticAssessment;
      Object.assign(row, {
        corpusVersion: report.intake.corpusVersion,
        promptVersion: semantic?.trace?.promptVersion,
        pipelineVersion: semantic?.trace?.pipelineVersion,
        semanticStatus: semantic?.status,
        findings: semantic?.assessments,
      });
      if (
        report.reviewId !== run.reviewId ||
        report.revisionId !== document.revisionId ||
        report.intake.originalText !== test.text
      )
        throw new Error('REPORT_BINDING_MISMATCH');
      if (report.intake.corpusVersion !== corpusVersion) throw new Error('CORPUS_PIN_MISMATCH');
      if (semantic?.trace?.retrieval && semantic.trace.retrieval.corpusVersion !== corpusVersion)
        throw new Error('RETRIEVAL_CORPUS_PIN_MISMATCH');
      if (
        semantic?.trace?.promptVersion !== 'evidence-support-v1.12' ||
        semantic?.trace?.pipelineVersion !== 'provisional-semantic-v1.12'
      )
        throw new Error('SEMANTIC_VERSION_MISMATCH');
      if (test.expected === 'no_assessment') {
        if (
          report.intake.evidence.length ||
          semantic.claims.some((claim) => claim.evidenceKeys?.length) ||
          semantic.assessments.some(
            (finding) => finding.status !== 'not_applicable' || finding.citations?.length,
          ) ||
          semantic.assessments.length !== semantic.claims.length
        )
          throw new Error('OFF_TOPIC_EVIDENCE_OR_ASSESSMENT');
      } else if (
        semantic.status !== 'completed' ||
        semantic.assessments.length !== 1 ||
        semantic.assessments[0].status !== test.expected
      ) {
        throw new Error('RELATION_MISMATCH');
      }
      const reload = (await request(`/api/v1/reviews/${run.reviewId}/report`)).value.report;
      if (!isDeepStrictEqual(reload, report)) throw new Error('REPORT_RELOAD_MISMATCH');
      const anonymous = await request(`/api/v1/reviews/${run.reviewId}/report`, undefined, true);
      if (anonymous.status !== 401) throw new Error('ANONYMOUS_REPORT_NOT_DENIED');
      row.passed = true;
    } catch (error) {
      row.failure = error.message;
    }
    rows.push(row);
    await save(
      resolve(output, 'receipt.json'),
      JSON.stringify({ origin, checkedAt: new Date(now()).toISOString(), rows }, null, 2),
    );
    log(JSON.stringify(row));
  }
  log(
    JSON.stringify({
      evidenceDirectory: output,
      completedCases: rows.length,
      passedCases: rows.filter((row) => row.passed).length,
    }),
  );
  return { exitCode: rows.every((row) => row.passed) ? 0 : 1, rows, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = (await runSubmissionAcceptance(process.argv.slice(2))).exitCode;
