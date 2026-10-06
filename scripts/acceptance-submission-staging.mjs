import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

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

const args = process.argv.slice(2);
if (!args.includes('--live')) {
  console.log(
    'Requires scoped live-provider authorization: pass --live to run synthetic staging reviews.',
  );
  console.log(`Available cases: ${cases.map((row) => row.name).join(', ')}`);
  process.exitCode = 2;
} else {
  const selectedName = args.find((arg) => arg.startsWith('--case='))?.slice(7);
  const selected = selectedName ? cases.filter((row) => row.name === selectedName) : cases;
  if (!selected.length || args.some((arg) => arg !== '--live' && !arg.startsWith('--case=')))
    throw new Error('UNKNOWN_ACCEPTANCE_ARGUMENT_OR_CASE');
  const output = resolve(
    'test-results',
    `submission-acceptance-${new Date().toISOString().replaceAll(':', '-')}`,
  );
  await mkdir(output, { recursive: true });
  const rows = [];
  let cookie = '';
  async function request(path, body, anonymous = false) {
    const response = await fetch(`${origin}${path}`, {
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
      const deadline = Date.now() + 185_000;
      let report;
      while (Date.now() < deadline) {
        const state = (await request(`/api/v1/reviews/${run.reviewId}`)).value;
        if (['failed', 'timed_out', 'cancelled'].includes(state.status))
          throw new Error(`REVIEW_${state.status}`);
        report = (await request(`/api/v1/reviews/${run.reviewId}/report`)).value.report;
        if (report) break;
        await new Promise((done) => setTimeout(done, 2500));
      }
      if (!report) throw new Error('REVIEW_DEADLINE');
      // Save the first outcome before assertions; never repeat a failed model call.
      await writeFile(resolve(output, `${test.name}-report.json`), JSON.stringify(report, null, 2));
      const semantic = report.semanticAssessment;
      Object.assign(row, {
        corpusVersion: report.intake.corpusVersion,
        promptVersion: semantic?.trace.promptVersion,
        pipelineVersion: semantic?.trace.pipelineVersion,
        semanticStatus: semantic?.status,
        findings: semantic?.assessments,
      });
      if (report.intake.corpusVersion !== corpusVersion) throw new Error('CORPUS_PIN_MISMATCH');
      if (semantic?.trace.retrieval && semantic.trace.retrieval.corpusVersion !== corpusVersion)
        throw new Error('RETRIEVAL_CORPUS_PIN_MISMATCH');
      if (
        semantic?.trace.promptVersion !== 'evidence-support-v1.11' ||
        semantic?.trace.pipelineVersion !== 'provisional-semantic-v1.11'
      )
        throw new Error('SEMANTIC_VERSION_MISMATCH');
      if (test.expected === 'no_assessment') {
        if (semantic.claims.length || semantic.assessments.length || report.intake.evidence.length)
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
      process.exitCode = 1;
    }
    rows.push(row);
    await writeFile(
      resolve(output, 'receipt.json'),
      JSON.stringify({ origin, checkedAt: new Date().toISOString(), rows }, null, 2),
    );
    console.log(JSON.stringify(row));
  }
  console.log(
    JSON.stringify({
      evidenceDirectory: output,
      completedCases: rows.length,
      passedCases: rows.filter((row) => row.passed).length,
    }),
  );
}
