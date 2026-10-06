import { randomUUID } from 'node:crypto';

// Bounded owner-authorized live checks. Never log cookies or contact values.
const origin = 'https://api-staging-42bc.up.railway.app';
let cookie = '';
async function request(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      'Idempotency-Key': randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const value = await response.json();
  if (!response.ok) throw new Error(`STAGING_HTTP_${response.status}_${value.code ?? 'UNKNOWN'}`);
  return value;
}
const cases = [
  ['altered-quran-excerpt', 'وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لهم'],
  [
    'accurate-quran-excerpt',
    'قال تعالى: «وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ» [البقرة: 271].',
  ],
  [
    'wedding-hadith',
    'في مناسبة نعمة الله بالزواج إقامة وليمة النكاح ودعوة الناس إليها. قال رسول الله صلى الله عليه وسلم: "أعلنوا هذا النكاح". وقال لعبد الرحمن بن عوف رضي الله عنه: "أولم ولو بشاة".',
  ],
  [
    'unrelated-no-quotation',
    'يشرح هذا النص طريقة ترتيب الملفات في المجلد وتجميع الصور بحسب التاريخ، ولا يتضمن أي اقتباس من القرآن أو الحديث ولا يقدم حكمًا دينيًا.',
  ],
  [
    'curatable-hadith',
    'قال رسول الله صلى الله عليه وسلم: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى" [صحيح البخاري: 1].',
  ],
];
await request('/api/v1/sessions', {});
let ticket;
for (const [name, text] of cases) {
  const document = await request('/api/v1/documents', { text });
  const revisionId = document.revisionId;
  if (!revisionId) throw new Error('DOCUMENT_REVISION_REQUIRED');
  const run = await request('/api/v1/reviews', { revisionId });
  console.log(JSON.stringify({ case: name, reviewId: run.reviewId, status: 'submitted' }));
  let report;
  for (let attempt = 0; attempt < 65; attempt++) {
    const state = await request(`/api/v1/reviews/${run.reviewId}`);
    if (['failed', 'timed_out', 'cancelled'].includes(state.status))
      throw new Error(`REVIEW_${name}_${state.status}`);
    const value = await request(`/api/v1/reviews/${run.reviewId}/report`);
    if (value.report) {
      report = value.report;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  if (!report) throw new Error(`REVIEW_${name}_DEADLINE`);
  // Report only bounded matching metadata, not full user/provider bodies.
  console.log(
    JSON.stringify({
      case: name,
      reviewId: run.reviewId,
      pipelineVersion: report.intake.pipelineVersion,
      findings: report.intake.quotationFindings,
      sources: report.intake.evidence.map((source) => ({
        key: source.snapshotKey,
        role: source.sourceRole,
        reference: source.reference,
        work: source.work,
      })),
      semanticStatus: report.semanticAssessment?.status,
    }),
  );
  if (name === 'altered-quran-excerpt') {
    ticket = await request(`/api/v1/reviews/${run.reviewId}/tickets`, { notify: false });
    const email = process.env.STAGING_TEST_EMAIL;
    if (email) {
      await request(
        `/api/v1/tickets/${ticket.ticketCode}/contact`,
        { email, name: 'اختبار قبول بصيرة', notify: true },
        'PATCH',
      );
      const lookup = await request('/api/v1/ticket-lookup', {
        ticketCode: ticket.ticketCode,
        email,
      });
      const wrong = await request('/api/v1/ticket-lookup', {
        ticketCode: ticket.ticketCode,
        email: 'wrong-owner@example.com',
      });
      console.log(
        JSON.stringify({
          ticketCode: ticket.ticketCode,
          contactSaved: true,
          lookupKeys: Object.keys(lookup),
          wrongLookupKeys: Object.keys(wrong),
        }),
      );
    }
  }
  if (name === 'curatable-hadith') {
    const sourceTicket = await request(`/api/v1/reviews/${run.reviewId}/tickets`, {
      notify: false,
    });
    console.log(
      JSON.stringify({
        case: name,
        ticketCode: sourceTicket.ticketCode,
        notificationsDisabled: true,
      }),
    );
  }
}
console.log(JSON.stringify({ completedCases: cases.length, ticketCode: ticket?.ticketCode }));
