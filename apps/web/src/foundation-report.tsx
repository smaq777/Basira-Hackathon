import { useEffect, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import type {
  FoundationReport,
  IntakeSegment,
  LiteralFinding,
} from '../../../packages/contracts/src/foundation.js';
import {
  analysisErrorMessage,
  awaitFoundationReport,
  cancelOwnedReview,
  getOwnedReview,
} from './api.js';

const roleLabels: Record<IntakeSegment['role'], string> = {
  ayah: 'آية',
  matn: 'متن حديث',
  isnad: 'إسناد',
  claimed_source: 'نسبة إلى مصدر',
  author_text: 'كلام الكاتب',
  unclassified: 'غير مصنّف',
};

function quotationLabel(finding: LiteralFinding, report: FoundationReport): string {
  const segment = report.intake.segments.find((row) => row.id === finding.segmentId);
  const source = report.intake.evidence.find((row) => row.snapshotKey === finding.evidenceKey);
  const exact =
    source &&
    segment &&
    (((finding.status === 'exact' ||
      (finding.status === 'partial' &&
        finding.reason.split(';')[0] === 'exact_contiguous_excerpt')) &&
      finding.matchedStart !== null &&
      finding.matchedEnd !== null &&
      source.originalText.slice(finding.matchedStart, finding.matchedEnd) ===
        segment.originalText) ||
      (finding.status === 'exact' &&
        finding.matchedStart === null &&
        finding.matchedEnd === null &&
        source.originalText === segment.originalText));
  if (exact) return 'نقل مطابق حرفيًا';
  if (normalizedFinding(finding)) return 'تطابق بعد التطبيع؛ ليس تطابقًا حرفيًا';
  if (finding.status === 'partial') return 'تطابق جزئي؛ دقة النقل غير مثبتة';
  if (finding.status === 'mismatch') return 'اختلاف عن المصدر';
  return 'لم تُحسم المطابقة';
}

function normalizedFinding(finding: LiteralFinding): boolean {
  return (
    finding.status === 'normalized' ||
    (finding.status === 'partial' &&
      [
        'canonically_equivalent_contiguous_excerpt',
        'contiguous_excerpt_under_declared_typography_rules',
      ].includes(finding.reason.split(';')[0] ?? ''))
  );
}

function OriginalText({ report }: { report: FoundationReport }) {
  const { originalText, segments } = report.intake;
  let cursor = 0;
  const pieces = [];
  for (const segment of [...segments].sort((a, b) => a.startOffset - b.startOffset)) {
    if (
      segment.startOffset < cursor ||
      segment.endOffset > originalText.length ||
      originalText.slice(segment.startOffset, segment.endOffset) !== segment.originalText
    )
      continue;
    pieces.push(originalText.slice(cursor, segment.startOffset));
    pieces.push(
      <mark
        className={`foundation-highlight foundation-highlight--${segment.role}`}
        key={segment.id}
        title={`${roleLabels[segment.role]} — ${segment.roleStatus === 'source_matched' ? 'مرتبط بمصدر' : 'تصنيف أولي'}`}
      >
        {segment.originalText}
      </mark>,
    );
    cursor = segment.endOffset;
  }
  pieces.push(originalText.slice(cursor));
  return (
    <p className="foundation-original" aria-label="النص الأصلي مع مواضع النقل">
      {pieces}
    </p>
  );
}

function sourceLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function FoundationReportContent({ report }: { report: FoundationReport }) {
  const { intake } = report;
  const interpretation =
    report.interpretation.status === 'not_assessed'
      ? 'لم يُقيّم الاستدلال'
      : report.interpretation.status === 'needs_confirmation'
        ? 'يحتاج تأكيدًا بشريًا'
        : 'التقييم غير متاح';
  return (
    <>
      <div className="prototype-disclosure" role="note">
        <p>
          {intake.researchOnly
            ? 'معاينة بحثية بمصادر قيد الاعتماد.'
            : 'تقرير مرتبط بنسخة النص المحفوظة.'}{' '}
          لا يمنح هذا التقرير اعتمادًا شرعيًا أو إذنًا بالنشر.
        </p>
      </div>
      <span
        className={`status-pill status-pill--${report.status === 'completed' ? 'neutral' : 'warning'}`}
      >
        {report.status === 'partial'
          ? 'تقرير جزئي'
          : report.status === 'needs_review'
            ? 'يحتاج مراجعة'
            : 'اكتمل إعداد التقرير'}
      </span>
      <h1>راجع النقل وحدود الاستدلال</h1>
      <p className="hero-copy">دقة المقتطف ومدى اكتماله وكفاية الاستدلال أمور مستقلة.</p>
      <section className="source-panel">
        <div className="section-title">
          <div>
            <h2>النص الأصلي</h2>
            <p>المواضع الملونة تعرض نوع العبارة؛ اللون وحده لا يثبت صحتها.</p>
          </div>
        </div>
        <OriginalText report={report} />
        <div className="foundation-legend" aria-label="أنواع العبارات">
          {Object.entries(roleLabels).map(([role, label]) => (
            <span key={role} className={`foundation-highlight foundation-highlight--${role}`}>
              {label}
            </span>
          ))}
        </div>
      </section>
      <section className="finding-grid">
        <article className="finding-card">
          <div className="finding-head">
            <div>
              <h2>مؤشر النقل الحرفي</h2>
              <p>نتيجة المقارنة الآلية مع النص المعروض</p>
            </div>
          </div>
          {intake.quotationFindings.length === 0 && (
            <p>لا توجد مطابقة اقتباس محسومة في هذا التقرير.</p>
          )}
          {intake.quotationFindings.map((finding, index) => {
            const segment = intake.segments.find((row) => row.id === finding.segmentId);
            const source = intake.evidence.find((row) => row.snapshotKey === finding.evidenceKey);
            const excerpt =
              finding.matchedStart !== null &&
              finding.matchedEnd !== null &&
              source &&
              (finding.matchedStart > 0 || finding.matchedEnd < source.originalText.length);
            return (
              <div className="foundation-quotation" key={`${finding.segmentId}-${index}`}>
                <strong>{quotationLabel(finding, report)}</strong>
                <blockquote>{segment?.originalText}</blockquote>
                <p>
                  {quotationLabel(finding, report) === 'نقل مطابق حرفيًا'
                    ? 'أثبتت المقارنة تطابق النص المنقول حرفيًا مع موضعه في المصدر. لا تعني هذه النتيجة اكتمال الاقتباس أو كفاية الاستدلال.'
                    : normalizedFinding(finding)
                      ? 'توجد مطابقة بعد معالجة فروق الكتابة؛ لم تثبت المطابقة الحرفية للنص الأصلي.'
                      : finding.status === 'mismatch'
                        ? 'وجدت المقارنة اختلافًا عن النص المرجعي المعروض. راجع المصدر الكامل قبل تعديل المسودة.'
                        : 'لم تثبت المقارنة دقة النص المنقول حرفيًا. راجع المصدر الكامل وحدود المقارنة.'}
                </p>
                <p>
                  <b>مدى النقل: </b>
                  {excerpt
                    ? 'مقتطف من المصدر؛ لا يمثل النص الكامل.'
                    : finding.status === 'exact' &&
                        source &&
                        segment?.originalText === source.originalText
                      ? 'النص المرجعي كاملًا.'
                      : 'لم يثبت اكتمال النقل.'}
                </p>
                {source && (
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => {
                      document
                        .getElementById(`source-${source.snapshotKey}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    عرض المصدر الكامل: {source.reference}
                  </button>
                )}
                <details>
                  <summary>تفاصيل المقارنة الآلية</summary>
                  <p className="foundation-provenance" dir="auto">
                    {finding.reason}
                  </p>
                </details>
              </div>
            );
          })}
        </article>
        <article className="finding-card">
          <div className="finding-head">
            <div>
              <h2>مؤشر كفاية الاستدلال</h2>
              <p>لا تُستنتج كفاية الدليل من صحة الاقتباس</p>
            </div>
          </div>
          <strong>{interpretation}</strong>
          <p>{report.interpretation.explanation}</p>
          <p>لا توجد موافقة علمية أو مراجعة شرعية ضمن هذا المؤشر.</p>
          {intake.contextCoverage.map((coverage, index) => (
            <p key={index}>
              {coverage.reference}:{' '}
              {coverage.status === 'complete_transport'
                ? 'وصلت السياقات المطلوبة؛ اكتمال السياق العلمي غير محسوم.'
                : coverage.status === 'partial'
                  ? 'السياق المتاح جزئي.'
                  : 'السياق المطلوب غير متاح.'}
            </p>
          ))}
        </article>
      </section>
      {report.improvementCards.length > 0 && (
        <section className="suggestion-panel">
          <div className="section-title">
            <div>
              <h2>ملاحظات تحريرية محدودة</h2>
              <p>قرائن مرتبطة بالنص تحتاج مراجعة؛ ليست حكمًا على الاستدلال.</p>
            </div>
          </div>
          {report.improvementCards.map((card) => (
            <article key={card.id} className="foundation-quotation">
              <h3>{card.title}</h3>
              <blockquote>{card.trigger.originalText}</blockquote>
              <p>{card.explanation}</p>
              <p>{card.limitation}</p>
              <p>
                السياق المرتبط:{' '}
                {card.evidenceKeys
                  .map(
                    (key) =>
                      intake.evidence.find((row) => row.snapshotKey === key)?.reference ??
                      'مصدر غير متاح',
                  )
                  .join('، ')}
              </p>
            </article>
          ))}
        </section>
      )}
      <section className="source-panel">
        <div className="section-title">
          <div>
            <h2>المصادر والنصوص الأصلية</h2>
            <p>النص الكامل وبيانات النقل والاعتماد لكل مصدر.</p>
          </div>
        </div>
        {intake.evidence.length === 0 && <p>لم يتوفر مصدر قابل للعرض. لا يثبت ذلك خطأ النص.</p>}
        {intake.evidence.map((source) => (
          <article
            className="foundation-source"
            id={`source-${source.snapshotKey}`}
            key={source.snapshotKey}
          >
            <h3>{source.reference}</h3>
            <p>
              {source.work}
              {source.author ? ` — ${source.author}` : ''}
            </p>
            <blockquote>{source.originalText}</blockquote>
            <dl className="foundation-metadata">
              <div>
                <dt>الطبعة</dt>
                <dd>{source.edition ?? 'غير محددة'}</dd>
              </div>
              <div>
                <dt>نسخة المصدر</dt>
                <dd>{source.sourceVersion}</dd>
              </div>
              <div>
                <dt>حالة الاعتماد</dt>
                <dd>
                  {source.approvalStatus === 'approved'
                    ? 'معتمد في سجل المصدر'
                    : 'غير معتمد للاستخدام العلمي'}
                </dd>
              </div>
              <div>
                <dt>طريقة النقل</dt>
                <dd>{source.delivery === 'snapshot' ? 'نسخة محفوظة' : 'اتصال مباشر'}</dd>
              </div>
              <div>
                <dt>دور المصدر</dt>
                <dd>
                  {source.sourceRole === 'quran_text'
                    ? 'نص قرآني'
                    : source.sourceRole === 'hadith_matn'
                      ? 'متن حديث'
                      : source.sourceRole === 'tafsir_footnote'
                        ? 'حاشية تفسير'
                        : 'تفسير'}
                </dd>
              </div>
              <div>
                <dt>الاستخدام</dt>
                <dd>{source.researchOnly ? 'بحثي فقط' : 'ضمن حدود سجل المصدر'}</dd>
              </div>
            </dl>
            {sourceLink(source.sourceUrl) && (
              <a
                className="text-action"
                href={sourceLink(source.sourceUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                فتح رابط المصدر
              </a>
            )}
            <details>
              <summary>بيانات التتبع</summary>
              <div className="foundation-provenance" dir="ltr">
                <p>
                  Source: {source.sourceId} · Snapshot: {source.snapshotKey}
                </p>
                <p>Original SHA-256: {source.originalSha256}</p>
                <pre>{JSON.stringify(source.provenance, null, 2)}</pre>
              </div>
            </details>
          </article>
        ))}
      </section>
      <section className="review-packet">
        <div className="section-title">
          <div>
            <h2>حدود التقرير</h2>
          </div>
        </div>
        <ul>
          {[
            ...new Set([...intake.warnings, ...report.limitations, ...report.themes.limitations]),
          ].map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        <details>
          <summary>نسخة المراجعة وبيانات التتبع</summary>
          <div className="foundation-provenance" dir="ltr">
            <p>Review: {report.reviewId}</p>
            <p>Revision: {report.revisionId}</p>
            <p>Input SHA-256: {report.inputSha256}</p>
            <p>Evidence SHA-256: {report.evidenceStateSha256}</p>
            <p>
              Pipeline: {report.pipelineVersion} · Generated: {report.generatedAt}
            </p>
            <p>
              Corpus: {intake.corpusVersion} · Themes: {report.themes.detectorVersion}{' '}
              (uncalibrated)
            </p>
          </div>
        </details>
      </section>
    </>
  );
}

export function FoundationResultScreen({
  reviewId,
  initialReport,
  onHome,
}: {
  reviewId: string;
  initialReport: FoundationReport | null;
  onHome: () => void;
}) {
  const [report, setReport] = useState(initialReport);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(initialReport === null);
  const [status, setStatus] = useState('جار استعادة التقرير المرتبط بجلستك');
  useEffect(() => {
    if (initialReport && attempt === 0) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getOwnedReview(reviewId)
      .then((run) =>
        awaitFoundationReport(run, controller.signal, (current) => {
          if (active) setStatus(`حالة المراجعة: ${current.status}`);
        }),
      )
      .then((result) => {
        if (active) {
          setReport(result);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setReport(null);
          setLoading(false);
          setError(analysisErrorMessage(reason));
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reviewId, initialReport, attempt]);
  const cancel = async () => {
    try {
      await cancelOwnedReview(reviewId);
      onHome();
    } catch (reason) {
      setError(`تعذر تأكيد الإلغاء. ${analysisErrorMessage(reason)}`);
    }
  };
  return (
    <div className="app-page result-page">
      <header className="public-header page-shell compact-header">
        <button className="brand" onClick={onHome}>
          <img src="/brand/basirah-symbol.png" alt="" />
          <span>بصيرة</span>
        </button>
        <button className="button button--outline" onClick={onHome}>
          <ArrowLeft size={20} /> مراجعة نص جديد
        </button>
      </header>
      <main className="result-main page-shell page-enter">
        {loading && (
          <div className="source-panel" role="status">
            <h1>جار تحميل التقرير</h1>
            <p>{status}</p>
            <button className="button button--ghost" onClick={() => void cancel()}>
              إلغاء المراجعة والعودة
            </button>
          </div>
        )}
        {error && (
          <div className="analysis-error" role="alert">
            <div>
              <strong>تعذر عرض التقرير</strong>
              <p>{error}</p>
            </div>
            <button
              className="button button--outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {report && !loading && !error && (
          <>
            <FoundationReportContent report={report} />
            <button
              className="button button--outline foundation-refresh"
              onClick={() => setAttempt((value) => value + 1)}
            >
              تحديث التقرير المحفوظ
            </button>
          </>
        )}
      </main>
    </div>
  );
}
