import { useEffect, useState } from 'react';
import {
  reviewedAnswerText,
  type EditorialReview,
} from '../../../packages/contracts/src/editorial-review.js';

export function ReviewerAnswerPublication({
  response,
  available,
  saving,
  onPublish,
}: {
  response?: { version: number; text: string; editorial?: EditorialReview | null };
  available: boolean;
  saving: boolean;
  onPublish: (version: number) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [response?.version]);
  const sources = response?.editorial?.evidence ?? [];
  return (
    <>
      <h3>نشر الإجابة ومصادرها إلى RAG</h3>
      <p>
        للعرض التجريبي: حدّث التذكرة أولًا، ثم انشر الإجابة المحفوظة مع مصادرها لتُستخدم في
        المراجعات القادمة.
      </p>
      <p>تُحفظ باسم «إجابة مراجع بصيرة»، مع بقاء نصوص القرآن والمصادر الأصلية كما هي.</p>
      {!response && (
        <p className="source-publication-hint">حدّث التذكرة وانشر المراجعة أولًا لتفعيل الزر.</p>
      )}
      {!available && (
        <p className="source-publication-hint" role="status">
          اتصال النشر إلى RAG غير متاح لهذا الحساب حاليًا.
        </p>
      )}
      {response && (
        <p>
          النسخة المحفوظة: {response.version} · المصادر المرفقة: {sources.length}
        </p>
      )}
      <button
        className="button button--primary"
        disabled={saving || !response || !available}
        onClick={() => setConfirm(true)}
      >
        نشر الإجابة ومصادرها إلى RAG
      </button>
      {confirm && response && (
        <div role="alert">
          <p>
            سيتم نشر النسخة المحفوظة {response.version} التالية. احفظ أي تعديلات جديدة على التذكرة
            قبل النشر.
          </p>
          <details open>
            <summary>الإجابة التي ستُنشر</summary>
            <p style={{ whiteSpace: 'pre-wrap' }}>
              {reviewedAnswerText(response.text, response.editorial)}
            </p>
          </details>
          {sources.length > 0 && (
            <details>
              <summary>المصادر المرفقة ({sources.length})</summary>
              {sources.map((source) => (
                <p key={source.id}>
                  {source.work} — {source.reference}
                  {source.sourceUrl && (
                    <>
                      {' '}
                      ·{' '}
                      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                        رابط المصدر
                      </a>
                    </>
                  )}
                </p>
              ))}
            </details>
          )}
          <button
            className="button button--primary"
            disabled={saving || !available}
            onClick={() => onPublish(response.version)}
          >
            تأكيد النشر إلى RAG
          </button>
          <button
            className="button button--outline"
            disabled={saving}
            onClick={() => setConfirm(false)}
          >
            إلغاء
          </button>
        </div>
      )}
    </>
  );
}
