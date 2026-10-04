import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import type {
  FoundationReport,
  IntakeSegment,
} from '../../../packages/contracts/src/foundation.js';
import {
  analysisErrorMessage,
  awaitFoundationReport,
  cancelOwnedReview,
  createOwnedReview,
  getOwnedReview,
  persistDraftForAnalysis,
} from './api.js';
import {
  interpretationPresentation,
  quotationPresentation,
  quranReaderUrl,
  sourceCitation,
  sourceRoleLabel,
} from './foundation-report-presentation.js';

const roleLabels: Record<IntakeSegment['role'], string> = {
  ayah: 'آية',
  matn: 'متن حديث',
  isnad: 'إسناد',
  claimed_source: 'نسبة إلى مصدر',
  author_text: 'كلام الكاتب',
  unclassified: 'غير مصنّف',
};

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

export function FoundationReportContent({ report }: { report: FoundationReport }) {
  const { intake } = report;
  const interpretation = interpretationPresentation(report);
  return (
    <>
      <div className="prototype-disclosure" role="note">
        <p>يعرض التقرير مقارنة النقل بالمصادر المتاحة؛ كفاية الاستدلال تُقيّم بصورة مستقلة.</p>
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
      <p className="hero-copy">دقة النقل وحدود المقتطف وكفاية الاستدلال أمور مستقلة.</p>
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
            const quotation = quotationPresentation(finding, report);
            return (
              <div className="foundation-quotation" key={`${finding.segmentId}-${index}`}>
                <strong>{quotation.label}</strong>
                <blockquote>{segment?.originalText}</blockquote>
                <p>{quotation.explanation}</p>
                <p>
                  <b>حدود المقتطف: </b>
                  {quotation.extent}
                </p>
                {finding.comparison && finding.comparison.differences.length > 0 && (
                  <ul className="foundation-differences" aria-label="فروق النقل عن المصدر">
                    {finding.comparison.differences.map((difference, differenceIndex) => (
                      <li key={differenceIndex}>
                        {difference.kind === 'omit' ? (
                          <>ورد في المصدر ولم يرد في النقل: «{difference.sourceText}».</>
                        ) : difference.kind === 'insert' ? (
                          <>زيادة في النقل: «{difference.quotedText}».</>
                        ) : (
                          <>
                            ورد في النقل: «{difference.quotedText}»؛ وفي المصدر: «
                            {difference.sourceText}».
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {source && (
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => {
                      document
                        .getElementById(`foundation-source-${intake.evidence.indexOf(source)}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    عرض النص المرجعي كاملًا: {sourceCitation(source, intake.evidence)}
                  </button>
                )}
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
          <strong>{interpretation.label}</strong>
          <p>{interpretation.explanation}</p>
          {intake.contextCoverage
            .filter((coverage) =>
              intake.evidence.some((source) => source.reference === coverage.reference),
            )
            .map((coverage, index) => (
              <p key={index}>
                {sourceCitation(
                  intake.evidence.find(
                    (source) =>
                      source.reference === coverage.reference && source.sourceRole === 'quran_text',
                  ) ?? intake.evidence.find((source) => source.reference === coverage.reference)!,
                )}
                :{' '}
                {coverage.status === 'complete_transport'
                  ? 'تتوفر نصوص تفسير مرتبطة بالآية؛ لم يُقيّم بها الاستدلال.'
                  : coverage.status === 'partial'
                    ? 'بعض نصوص التفسير المرتبطة بالآية متاحة.'
                    : 'لم تتوفر نصوص التفسير المرتبطة بالآية.'}
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
              <p>اقرأ السياق الكامل قبل الاستناد إلى هذا النقل.</p>
              <p>
                السياق المرتبط:{' '}
                {card.evidenceKeys
                  .map((key) =>
                    intake.evidence.find((row) => row.snapshotKey === key)
                      ? sourceCitation(
                          intake.evidence.find((row) => row.snapshotKey === key)!,
                          intake.evidence,
                        )
                      : 'مصدر غير متاح',
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
            <p>المرجع المقروء والنص الكامل المتاح للمقارنة.</p>
          </div>
        </div>
        {intake.evidence.length === 0 && <p>لم يتوفر مصدر قابل للعرض. لا يثبت ذلك خطأ النص.</p>}
        {intake.evidence.map((source, index) => (
          <article
            className="foundation-source"
            id={`foundation-source-${index}`}
            key={source.snapshotKey}
          >
            <span className="status-pill status-pill--neutral">{sourceRoleLabel(source)}</span>
            <h3>{sourceCitation(source, intake.evidence)}</h3>
            {source.author && <p>{source.author}</p>}
            <blockquote>{source.originalText}</blockquote>
            {source.sourceRole === 'hadith_matn' &&
              /book\s*=|internal_id/u.test(source.reference) && (
                <p>لم يثبت رقم الحديث في طبعة محددة ضمن هذا التقرير.</p>
              )}
            {quranReaderUrl(source) && (
              <a
                className="text-action"
                href={quranReaderUrl(source)}
                target="_blank"
                rel="noopener noreferrer"
              >
                قراءة الآية على Quran.com
              </a>
            )}
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
          <li>
            تعرض المقارنة النص من النسخة الرقمية المتاحة؛ لا تثبت وحدها سلامة الطبعة أو كفاية
            الاستدلال.
          </li>
          <li>حدود المقتطف تصف موضعه في المصدر؛ لا تحكم على أثره في معنى الاستدلال.</li>
          {intake.quotationFindings.some((finding) => finding.status === 'unresolved') && (
            <li>بعض النقول لم تُحسم مطابقتها بالمصادر المتاحة.</li>
          )}
          {intake.segments.some((segment) => segment.conflict) && (
            <li>يوجد تعارض بين النسبة المذكورة والمصدر الذي عُثر عليه؛ راجع نسبة النقل.</li>
          )}
        </ul>
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
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState('');
  const rerunInFlight = useRef(false);
  const rerunRequest = useRef<{ revisionId: string; idempotencyKey: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (initialReport && attempt === 0) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getOwnedReview(reviewId)
      .then((run) =>
        awaitFoundationReport(run, controller.signal, (current) => {
          if (active)
            setStatus(
              ['queued', 'retrieving'].includes(current.status)
                ? 'جار البحث عن النصوص المرجعية'
                : 'جار مقارنة النقل وإعداد التقرير',
            );
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
  const reanalyze = async () => {
    if (!report || rerunInFlight.current) return;
    rerunInFlight.current = true;
    setRerunning(true);
    setRerunError('');
    try {
      if (!rerunRequest.current) {
        const draft = await persistDraftForAnalysis(report.intake.originalText);
        rerunRequest.current = {
          revisionId: draft.revisionId,
          idempotencyKey: crypto.randomUUID(),
        };
      }
      if (!mounted.current) return;
      const run = await createOwnedReview(
        rerunRequest.current.revisionId,
        rerunRequest.current.idempotencyKey,
      );
      if (mounted.current)
        window.location.hash = `#/result?reviewId=${encodeURIComponent(run.reviewId)}`;
    } catch (reason) {
      if (mounted.current) setRerunError(analysisErrorMessage(reason));
    } finally {
      rerunInFlight.current = false;
      if (mounted.current) setRerunning(false);
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
              disabled={rerunning}
              onClick={() => setAttempt((value) => value + 1)}
            >
              تحديث التقرير المحفوظ
            </button>
            <button
              className="button button--primary foundation-refresh"
              disabled={rerunning}
              onClick={() => void reanalyze()}
            >
              {rerunning ? 'جار بدء تحليل جديد' : 'إعادة تحليل النص'}
            </button>
            <p>إعادة التحليل تنشئ تقريرًا جديدًا للنص نفسه بالمقارنة الحالية.</p>
            {rerunError && <p role="alert">تعذر بدء التحليل الجديد. {rerunError}</p>}
          </>
        )}
      </main>
    </div>
  );
}
