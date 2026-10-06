import {
  type EditorialReview,
  type ReviewedRecord,
} from '../../../packages/contracts/src/editorial-review.js';
import { useState } from 'react';

export const reviewStatusLabels: Record<ReviewedRecord['status'], string> = {
  unresolved: 'مطابقة غير محسومة',
  matched: 'مطابقة محسومة',
  different: 'اختلاف في النقل',
  supported: 'الدليل يؤيد العبارة',
  contradicted: 'الدليل يعارض العبارة',
  not_assessed: 'لم يُقيّم',
  removed: 'حذف من التقرير المنشور',
};
const kindLabels = {
  quotation: 'النقل',
  analysis: 'الاستدلال',
  classification: 'تصنيف العبارة',
  context: 'التفسير والسياق',
};

function ReviewDifferences({ before, after }: { before: EditorialReview; after: EditorialReview }) {
  const compare = (label: string, oldText: string, newText: string) =>
    oldText === newText ? null : (
      <details key={label}>
        <summary>{label}</summary>
        <div className="editorial-comparison">
          <div>
            <h4>قبل المراجعة</h4>
            <p className="editorial-copy">{oldText || 'لا يوجد'}</p>
          </div>
          <div>
            <h4>بعد المراجعة</h4>
            <p className="editorial-copy">{newText || 'أزيل أو تُرك فارغًا'}</p>
          </div>
        </div>
      </details>
    );
  const formatRecord = (row: ReviewedRecord | undefined, report: EditorialReview) =>
    row
      ? `${kindLabels[row.kind]} · ${reviewStatusLabels[row.status]}\nالعبارة: ${row.originalText}\nالتصحيح: ${row.correctedText}\nالتعليل: ${row.explanation}\nالأدلة: ${row.evidenceIds.map((id) => report.evidence.find((source) => source.id === id)?.reference ?? id).join('، ')}`
      : '';
  const formatSource = (source: EditorialReview['evidence'][number] | undefined) =>
    source
      ? `${source.work}\nالمؤلف: ${source.author}\nالطبعة: ${source.edition}\nالمرجع: ${source.reference}\nنوع المصدر: ${source.sourceRole}\nالرابط: ${source.sourceUrl}\nالأصل: ${source.originalText}\nالسياق: ${source.context}`
      : '';
  const recordIds = [
    ...new Set([...before.records.map((row) => row.id), ...after.records.map((row) => row.id)]),
  ];
  const sourceIds = [
    ...new Set([...before.evidence.map((row) => row.id), ...after.evidence.map((row) => row.id)]),
  ];
  return (
    <details>
      <summary>ما الذي تغير عن التقرير الآلي؟</summary>
      <p>
        يعرض هذا السجل النص والقيم قبل المراجعة وبعدها، بما فيها الإضافات والحذف. التقرير الآلي
        الأصلي محفوظ دون تعديل.
      </p>
      {compare('خلاصة التقرير', before.summary, after.summary)}
      {compare('حدود المقارنة', before.limitations, after.limitations)}
      {compare('الصياغة المقترحة', before.suggestedText, after.suggestedText)}
      {recordIds.map((id, index) =>
        compare(
          `سجل ${index + 1}`,
          formatRecord(
            before.records.find((row) => row.id === id),
            before,
          ),
          formatRecord(
            after.records.find((row) => row.id === id),
            after,
          ),
        ),
      )}
      {sourceIds.map((id, index) =>
        compare(
          `مصدر ${index + 1}`,
          formatSource(before.evidence.find((row) => row.id === id)),
          formatSource(after.evidence.find((row) => row.id === id)),
        ),
      )}
    </details>
  );
}

export function EditorialReviewEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: EditorialReview;
  onChange: (value: EditorialReview) => void;
  disabled?: boolean;
}) {
  const updateRecord = (index: number, patch: Partial<ReviewedRecord>) =>
    onChange({
      ...value,
      records: value.records.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  return (
    <section className="editorial-editor reviewer-panel">
      <h2>تحرير التقرير والأدلة</h2>
      <p>
        هذه نسخة بشرية مستقلة. لا يتغير النص المرسل أو التقرير الآلي المحفوظ. الحسم يحتاج دليلًا
        وتعليلًا.
      </p>
      <fieldset disabled={disabled}>
        <label>
          خلاصة المراجعة
          <textarea
            value={value.summary}
            onChange={(e) => onChange({ ...value, summary: e.target.value })}
            rows={3}
          />
        </label>
        {value.records.map((record, index) => (
          <details key={record.id} className="editorial-record">
            <summary>
              {kindLabels[record.kind]} · {reviewStatusLabels[record.status]} —{' '}
              {record.originalText.slice(0, 85)}
            </summary>
            <label>
              نوع السجل
              <select
                value={record.kind}
                onChange={(e) =>
                  updateRecord(index, { kind: e.target.value as ReviewedRecord['kind'] })
                }
              >
                {Object.entries(kindLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              العبارة محل المراجعة
              <textarea
                value={record.originalText}
                rows={2}
                onChange={(e) => updateRecord(index, { originalText: e.target.value })}
              />
            </label>
            <label>
              حالة السجل
              <select
                value={record.status}
                onChange={(e) =>
                  updateRecord(index, { status: e.target.value as ReviewedRecord['status'] })
                }
              >
                {Object.entries(reviewStatusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              التصحيح أو التصنيف المعتمد
              <textarea
                value={record.correctedText}
                rows={2}
                onChange={(e) => updateRecord(index, { correctedText: e.target.value })}
              />
            </label>
            <label>
              التعليل وحدود الدليل
              <textarea
                value={record.explanation}
                rows={3}
                onChange={(e) => updateRecord(index, { explanation: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>الأدلة المرتبطة بهذا السجل</legend>
              {value.evidence.map((source) => (
                <label className="editorial-checkbox" key={source.id}>
                  <input
                    type="checkbox"
                    checked={record.evidenceIds.includes(source.id)}
                    onChange={(e) =>
                      updateRecord(index, {
                        evidenceIds: e.target.checked
                          ? [...record.evidenceIds, source.id]
                          : record.evidenceIds.filter((id) => id !== source.id),
                      })
                    }
                  />
                  {source.work} — {source.reference}
                </label>
              ))}
            </fieldset>
          </details>
        ))}
        <button
          type="button"
          className="button button--outline"
          onClick={() =>
            onChange({
              ...value,
              records: [
                ...value.records,
                {
                  id: `manual:${crypto.randomUUID()}`,
                  kind: 'analysis',
                  originalText: '',
                  status: 'unresolved',
                  correctedText: '',
                  explanation: '',
                  evidenceIds: [],
                },
              ],
            })
          }
        >
          إضافة سجل للمراجعة
        </button>
        <h3>المصادر والنصوص المرجعية</h3>
        <p>
          تعديل المصدر هنا يغير التقرير فقط. إدراجه في البحث يحتاج اعتمادًا منفصلًا مع سجل حقوقه.
        </p>
        {value.evidence.map((source, index) => (
          <details className="editorial-record" key={source.id}>
            <summary>
              {source.work || 'مصدر جديد'} — {source.reference}
            </summary>
            {(
              [
                'work',
                'author',
                'reference',
                'edition',
                'sourceUrl',
                'originalText',
                'context',
              ] as const
            ).map((field) => (
              <label key={field}>
                {
                  (
                    {
                      work: 'اسم الكتاب أو المصدر',
                      author: 'اسم المؤلف',
                      reference: 'المرجع المحدد',
                      edition: 'الطبعة',
                      sourceUrl: 'رابط المصدر HTTPS',
                      originalText: 'النص الأصلي في المصدر',
                      context: 'السياق المرتبط',
                    } as const
                  )[field]
                }
                <textarea
                  rows={field === 'originalText' ? 5 : 2}
                  value={source[field]}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      evidence: value.evidence.map((row, i) =>
                        i === index ? { ...row, [field]: e.target.value } : row,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label>
              نوع المصدر
              <select
                value={source.sourceRole}
                onChange={(e) =>
                  onChange({
                    ...value,
                    evidence: value.evidence.map((row, i) =>
                      i === index
                        ? { ...row, sourceRole: e.target.value as typeof source.sourceRole }
                        : row,
                    ),
                  })
                }
              >
                {Object.entries({
                  quran_text: 'نص القرآن الأصلي (لا يضاف من هذا المحرر)',
                  hadith_matn: 'متن حديث',
                  tafsir_commentary: 'تفسير مرتبط بمصدر أصلي',
                  tafsir_footnote: 'حاشية تفسير',
                  book_excerpt: 'مقتطف كتاب',
                  scholar_explanation: 'شرح عالم',
                  reviewer_commentary: 'إجابة مراجع بصيرة',
                }).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button--outline"
              onClick={() =>
                onChange({
                  ...value,
                  evidence: value.evidence.filter((row) => row.id !== source.id),
                  records: value.records.map((row) => ({
                    ...row,
                    evidenceIds: row.evidenceIds.filter((id) => id !== source.id),
                    status: row.evidenceIds.includes(source.id) ? 'unresolved' : row.status,
                  })),
                })
              }
            >
              إزالة المصدر من هذه النسخة
            </button>
          </details>
        ))}
        <button
          type="button"
          className="button button--outline"
          onClick={() =>
            onChange({
              ...value,
              evidence: [
                ...value.evidence,
                {
                  id: `manual:${crypto.randomUUID()}`,
                  work: '',
                  author: '',
                  sourceRole: 'book_excerpt',
                  reference: '',
                  edition: '',
                  sourceUrl: '',
                  originalText: '',
                  context: '',
                },
              ],
            })
          }
        >
          إضافة مصدر ودليل
        </button>
        <label>
          حدود المقارنة
          <textarea
            rows={3}
            value={value.limitations}
            onChange={(e) => onChange({ ...value, limitations: e.target.value })}
          />
        </label>
        <label>
          النص المعدل المقترح من المراجع (اختياري، يحتاج دليلًا)
          <textarea
            rows={5}
            value={value.suggestedText}
            onChange={(e) => onChange({ ...value, suggestedText: e.target.value })}
          />
        </label>
      </fieldset>
    </section>
  );
}

export function ReviewedReportContent({
  review,
  originalText,
  baseline,
}: {
  review: EditorialReview;
  originalText: string;
  baseline?: EditorialReview;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  return (
    <section className="reviewed-report">
      <article className="reviewer-panel">
        <h2>التقرير بعد المراجعة البشرية</h2>
        <p>{review.summary}</p>
        <details>
          <summary>النص المرسل كما ورد</summary>
          <p className="editorial-copy">{originalText}</p>
        </details>
      </article>
      {review.records
        .filter((row) => row.status !== 'removed')
        .map((row) => (
          <article className="reviewer-panel" key={row.id}>
            <h3>
              {kindLabels[row.kind]} — {reviewStatusLabels[row.status]}
            </h3>
            <div className="editorial-comparison">
              <div>
                <h4>العبارة المرسلة</h4>
                <p>{row.originalText}</p>
              </div>
              <div>
                <h4>التصحيح أو القرار</h4>
                <p>{row.correctedText || 'لا تعديل مقترح'}</p>
              </div>
            </div>
            <p className="editorial-copy">{row.explanation}</p>
            {row.evidenceIds.map((id) => {
              const source = review.evidence.find((item) => item.id === id);
              return source ? (
                <details key={id}>
                  <summary>
                    {source.work} — {source.reference}
                  </summary>
                  <p className="editorial-copy">{source.originalText}</p>
                  <p>{source.context}</p>
                  {source.sourceUrl && (
                    <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                      فتح المرجع
                    </a>
                  )}
                </details>
              ) : null;
            })}
          </article>
        ))}
      <article className="reviewer-panel">
        <h3>جميع المصادر في التقرير المنشور</h3>
        {review.evidence.length === 0 && <p>لم يُضف المراجع مصدرًا موثقًا إلى هذه النسخة.</p>}
        {review.evidence.map((source) => (
          <details key={source.id}>
            <summary>
              {source.work} — {source.reference}
            </summary>
            <p>
              المؤلف: {source.author || 'غير محدد'} · الطبعة: {source.edition || 'غير محددة'}
            </p>
            <p className="editorial-copy">{source.originalText}</p>
            {source.context && <p className="editorial-copy">{source.context}</p>}
            {source.sourceUrl && (
              <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                فتح المرجع
              </a>
            )}
          </details>
        ))}
      </article>
      <article className="reviewer-panel">
        <h3>حدود المقارنة</h3>
        <p className="editorial-copy">{review.limitations}</p>
        {baseline && <ReviewDifferences before={baseline} after={review} />}
      </article>
      {review.suggestedText && (
        <article className="reviewer-panel">
          <h3>النص المقترح المعتمد من المراجع</h3>
          <p className="editorial-copy">{review.suggestedText}</p>
          <button
            className="button button--outline"
            onClick={() => {
              if (!navigator.clipboard) {
                setCopyStatus('تعذر النسخ التلقائي. يمكنك تحديد النص ونسخه.');
                return;
              }
              void navigator.clipboard
                .writeText(review.suggestedText)
                .then(() => setCopyStatus('تم نسخ النص المعدل'))
                .catch(() => setCopyStatus('تعذر النسخ التلقائي. يمكنك تحديد النص ونسخه.'));
            }}
          >
            نسخ النص المعدل
          </button>
          <p role="status">{copyStatus}</p>
        </article>
      )}
    </section>
  );
}
