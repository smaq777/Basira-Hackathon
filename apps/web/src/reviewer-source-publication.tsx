import {
  reviewedSourcePublicationIssue,
  type EditorialReview,
} from '../../../packages/contracts/src/editorial-review.js';

export function eligibleReviewedSources(review?: EditorialReview | null) {
  return review?.evidence.filter((source) => !reviewedSourcePublicationIssue(review, source)) ?? [];
}

export function reviewNotificationEmptyMessage(notifyOptIn: boolean) {
  return notifyOptIn
    ? 'لا يوجد إشعار للمراجعة في طابور البريد بعد؛ نشر التقرير وحده لا يثبت إرسال رسالة.'
    : 'لم يفعّل صاحب التذكرة المتابعة بالبريد؛ لا تُرسل رسالة مراجعة دون اختياره وتسجيل بريده.';
}

export function ReviewerSourceFields({
  review,
  published,
  available,
  saving,
  sourceId,
  rights,
  onSourceChange,
  onRightsChange,
}: {
  review?: EditorialReview | null;
  published: boolean;
  available: boolean;
  saving: boolean;
  sourceId: string;
  rights: string;
  onSourceChange: (value: string) => void;
  onRightsChange: (value: string) => void;
}) {
  const sources = eligibleReviewedSources(review);
  const disabled = saving || !published || !available || !sources.length;
  return (
    <>
      {!published && <p className="source-publication-hint">انشر نسخة التقرير قبل اعتماد دليل.</p>}
      {!available && (
        <p className="source-publication-hint" role="status">
          نشر المصادر غير متاح لهذا الحساب أو لاتصال قاعدة المصادر الحالي. لم يُضف شيء إلى RAG؛
          يحتاج المشغّل إلى التحقق من اتصال اعتماد المصادر وصلاحيته.
        </p>
      )}
      {published && !sources.length && (
        <p id="source-publication-empty" className="source-publication-hint">
          لا يوجد دليل مؤهل في النسخة المنشورة. يلزم أصل حديث أو مقتطف كتاب أو شرح عالم، مرتبط بسجل
          محسوم، مع المؤلف والطبعة ورابط HTTPS. القرآن والتفسير من المصادر المعتمدة لا يعاد نشرهما
          هنا، وملاحظات المراجع ليست مصدرًا.
        </p>
      )}
      <label className="note-field">
        الدليل من النسخة المنشورة
        <select
          value={sources.some((source) => source.id === sourceId) ? sourceId : ''}
          disabled={disabled}
          aria-describedby={published && !sources.length ? 'source-publication-empty' : undefined}
          onChange={(event) => onSourceChange(event.target.value)}
        >
          <option value="">
            {sources.length ? 'اختر الدليل الموثّق' : 'لا توجد أدلة مؤهلة للنشر'}
          </option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.work} — {source.reference}
            </option>
          ))}
        </select>
      </label>
      <label className="note-field">
        حقوق الاستخدام والترخيص
        <textarea
          rows={4}
          value={rights}
          maxLength={2000}
          disabled={disabled}
          onChange={(event) => onRightsChange(event.target.value)}
          placeholder="اذكر الترخيص أو أساس الإذن بنشر أصل المصدر"
        />
      </label>
    </>
  );
}
