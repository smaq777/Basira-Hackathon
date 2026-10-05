import { useEffect, useRef, useState } from 'react';
import { RewritePanel } from './rewrite.js';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { UsersThree } from '@phosphor-icons/react/UsersThree';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import type {
  FoundationReport,
  IntakeSegment,
  SourceEvidence,
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
  comparisonHighlights,
  editorialNotes,
  interpretationPresentation,
  reportFindings,
  sourceCollections,
  sourceComparisonText,
  unresolvedExplanation,
  type ReportFinding,
  quranReaderUrl,
  sourceCitation,
  sourceRoleLabel,
  type ComparisonHighlight,
} from './foundation-report-presentation.js';

const roleLabels: Record<IntakeSegment['role'], string> = {
  ayah: 'آية',
  matn: 'متن حديث',
  isnad: 'إسناد',
  claimed_source: 'نسبة إلى مصدر',
  author_text: 'كلام الكاتب',
  unclassified: 'غير مصنّف',
};
const roleColorClasses: Record<IntakeSegment['role'], string> = {
  ayah: 'quran',
  matn: 'hadith_matn',
  isnad: 'isnad',
  claimed_source: 'claimed_source',
  author_text: 'general_claim',
  unclassified: 'unknown',
};
const legendRoles = ['ayah', 'matn', 'isnad', 'claimed_source', 'unclassified'] as const;

export function shouldOfferHumanReview(report: FoundationReport): boolean {
  if (report.status !== 'completed') return true;
  if (
    report.intake.evidence.length === 0 ||
    report.intake.evidence.some(
      (source) => source.researchOnly || source.approvalStatus !== 'approved',
    )
  )
    return true;
  if (
    report.intake.quotationFindings.some((finding) =>
      ['partial', 'mismatch', 'unresolved'].includes(finding.status),
    ) ||
    report.intake.contextCoverage.some((coverage) => coverage.status !== 'complete_transport')
  )
    return true;
  if (
    ['needs_confirmation', 'not_assessed', 'unavailable', 'provisional'].includes(
      report.interpretation.status,
    )
  )
    return true;
  if (
    report.semanticAssessment &&
    (!['completed', 'not_applicable'].includes(report.semanticAssessment.status) ||
      report.semanticAssessment.assessments.some(
        (assessment) => !['supported', 'not_applicable'].includes(assessment.status),
      ))
  )
    return true;
  return false;
}

function ComparedWords({
  text,
  ranges,
  side,
}: {
  text: string;
  ranges: ComparisonHighlight[];
  side: 'draft' | 'source';
}) {
  let cursor = 0;
  const pieces = [];
  for (const range of ranges) {
    pieces.push(text.slice(cursor, range.startOffset));
    pieces.push(
      <mark
        key={`${range.startOffset}-${range.endOffset}`}
        className={`foundation-word-difference foundation-word-difference--${side} foundation-word-difference--${range.kind}`}
        title={
          range.kind === 'omit'
            ? 'ورد في المصدر ولم يرد في النقل'
            : range.kind === 'insert'
              ? 'زيادة في النقل'
              : side === 'draft'
                ? 'لفظ مختلف في المسودة'
                : 'لفظ المصدر المقابل'
        }
      >
        {text.slice(range.startOffset, range.endOffset)}
      </mark>,
    );
    cursor = range.endOffset;
  }
  pieces.push(text.slice(cursor));
  return <>{pieces}</>;
}

function OriginalText({
  report,
  selected,
  showTypes,
  onSelect,
}: {
  report: FoundationReport;
  selected: string | undefined;
  showTypes: boolean;
  onSelect: (row: ReportFinding) => void;
}) {
  const { originalText, segments } = report.intake;
  const findings = reportFindings(report);
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
    const row = findings.find((item) => item.segment.id === segment.id);
    const active = selected === segment.id;
    const text =
      active || (showTypes && segment.role !== 'author_text') ? (
        <mark
          className={[
            showTypes && segment.role !== 'author_text'
              ? `semantic-highlight semantic-highlight--${roleColorClasses[segment.role]}`
              : 'foundation-highlight',
            active ? 'foundation-highlight--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {segment.originalText}
        </mark>
      ) : (
        segment.originalText
      );
    pieces.push(
      row ? (
        <button
          key={segment.id}
          type="button"
          className="foundation-inline-quote"
          aria-label={`إظهار مقارنة: ${segment.originalText}`}
          aria-pressed={active}
          title={roleLabels[segment.role]}
          onClick={() => onSelect(row)}
        >
          {text}
        </button>
      ) : (
        <span key={segment.id}>{text}</span>
      ),
    );
    cursor = segment.endOffset;
  }
  pieces.push(originalText.slice(cursor));
  return (
    <div className="foundation-original" aria-label="النص الأصلي مع مواضع النقل">
      {pieces}
    </div>
  );
}

function SourceText({ source }: { source: SourceEvidence }) {
  return (
    <>
      {source.author && <p className="foundation-source-author">{source.author}</p>}
      <blockquote>{source.originalText}</blockquote>
      {source.sourceRole === 'hadith_matn' && /book\s*=|internal_id/u.test(source.reference) && (
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
    </>
  );
}

function FullSource({ source, report }: { source: SourceEvidence; report: FoundationReport }) {
  return (
    <details className="foundation-full-source">
      <summary>النص المرجعي كاملًا: {sourceCitation(source, report.intake.evidence)}</summary>
      <SourceText source={source} />
    </details>
  );
}

const findingGroups = [
  {
    key: 'different',
    label: 'اختلافات النقل',
    description: 'قارن الكلمات المختلفة قبل تعديل النقل.',
  },
  {
    key: 'unresolved',
    label: 'مطابقة غير محسومة',
    description: 'راجع حدود النقل ونسبته إلى المصدر.',
  },
  {
    key: 'faithful',
    label: 'نقل مطابق',
    description: 'تشمل المقتطفات الصحيحة وفروق الرسم أو الضبط.',
  },
] as const;

export function FoundationReportContent({ report }: { report: FoundationReport }) {
  const { intake } = report;
  const rows = reportFindings(report);
  const initial =
    rows.find((row) => row.group === 'different') ??
    rows.find((row) => row.group === 'unresolved') ??
    rows[0];
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.segment.id);
  const [sourceOverride, setSourceOverride] = useState<string | null>(null);
  const [showTypes, setShowTypes] = useState(true);
  const comparisonRef = useRef<HTMLElement>(null);
  const assessmentHeadingRef = useRef<HTMLHeadingElement>(null);
  const selected = rows.find((row) => row.segment.id === selectedId);
  const source = sourceOverride
    ? intake.evidence.find((row) => row.snapshotKey === sourceOverride)
    : selected?.source;
  const comparisonIsBound = !!selected && source?.snapshotKey === selected.finding.evidenceKey;
  const interpretation = interpretationPresentation(report);
  const collections = sourceCollections(report);
  const notes = editorialNotes(report);
  const comparisonText = source ? sourceComparisonText(source, selected?.finding) : null;
  const highlightedDifferences = selected
    ? comparisonHighlights(report, selected, source)
    : { draft: [], source: [] };
  const select = (row: ReportFinding) => {
    setSelectedId(row.segment.id);
    setSourceOverride(null);
    comparisonRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };
  const selectSource = (item: SourceEvidence) => {
    const linked =
      rows.find((row) => row.finding.evidenceKey === item.snapshotKey) ??
      rows.find((row) => row.segment.sourceKeys.includes(item.snapshotKey));
    setSelectedId(linked?.segment.id);
    setSourceOverride(item.snapshotKey);
    comparisonRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };
  const overrideIsCandidate = !!selected && !!source && !comparisonIsBound;
  const selectedContexts = source
    ? collections.context.filter(
        (row) => row.parentSnapshotKey === source.snapshotKey || row.reference === source.reference,
      )
    : [];
  const selectedCoverage = source
    ? intake.contextCoverage.find((row) => row.reference === source.reference)
    : null;
  return (
    <div className="foundation-report">
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
      <p className="hero-copy">ابدأ بما يحتاج مراجعة، ثم قارن النقل بموضعه في المصدر.</p>
      <section className="foundation-action-summary" aria-label="ملخص مراجعة النقل">
        <h2>ما الذي يحتاج انتباهك؟</h2>
        <div className="foundation-summary-actions">
          {findingGroups.map((group) => {
            const items = rows.filter((row) => row.group === group.key);
            return (
              <button
                key={group.key}
                type="button"
                disabled={items.length === 0}
                className={`foundation-summary-action foundation-summary-action--${group.key}`}
                onClick={() => items[0] && select(items[0])}
              >
                {group.label} ({items.length})
              </button>
            );
          })}
        </div>
        <p>
          {rows.length
            ? 'اختر نقلًا من النتائج أو من النص لعرض المقارنة.'
            : 'لا توجد نقول قابلة للمقارنة في هذا التقرير.'}
        </p>
      </section>
      <section className="foundation-interpretation" aria-label="مؤشر كفاية الاستدلال">
        <h2 id="foundation-evidence-assessment" ref={assessmentHeadingRef} tabIndex={-1}>
          مؤشر كفاية الاستدلال
        </h2>
        <strong>{interpretation.label}</strong>
        <p>{interpretation.explanation}</p>
        {report.semanticAssessment?.claims.map((claim) => {
          const finding = report.semanticAssessment!.assessments.find(
            (row) => row.claimId === claim.id,
          );
          const labels = {
            supported: 'الدليل المعروض يؤيد العبارة مبدئيًا',
            contradicted: 'تعارض ظاهر بين العبارة والدليل المعروض',
            not_established: 'لم يثبت هذا الاستنتاج من الدليل المعروض',
            insufficient_context: 'السياق المتاح لا يكفي للتقييم',
            not_applicable: 'لا يوجد استنتاج واضح للتقييم',
          };
          return (
            <details key={claim.id} className="foundation-semantic-claim">
              <summary>
                {claim.originalText.length > 140
                  ? claim.originalText.slice(0, 140) + '…'
                  : claim.originalText}
                <span> — {finding ? labels[finding.status] : 'لم يكتمل تقييم هذه العبارة'}</span>
              </summary>
              <blockquote>{claim.originalText}</blockquote>
              {finding && (
                <>
                  <p>{finding.explanation}</p>
                  {(
                    [
                      ['الشروط', finding.conditions],
                      ['النفي', finding.negations],
                      ['الاستثناءات', finding.exceptions],
                      ['نطاق الدلالة', finding.scope],
                    ] as const
                  )
                    .filter(([, items]) => items.length)
                    .map(([label, items]) => (
                      <p key={label}>
                        <strong>{label}: </strong>
                        {items.join('؛ ')}
                      </p>
                    ))}
                  {finding.citations.map((citation, index) => {
                    const source = report.intake.evidence.find(
                      (row) => row.snapshotKey === citation.evidenceKey,
                    );
                    return source ? (
                      <div key={`${citation.evidenceKey}-${index}`}>
                        <strong>{sourceCitation(source, report.intake.evidence)}</strong>
                        <blockquote>{citation.excerpt}</blockquote>
                      </div>
                    ) : null;
                  })}
                </>
              )}
            </details>
          );
        })}
      </section>
      <section className="source-panel foundation-draft">
        <div className="section-title">
          <div>
            <h2>النص الأصلي</h2>
            <p>الإطار يحدد النقل الذي تقارنه الآن؛ الألوان تبين نوع العبارة.</p>
          </div>
        </div>
        <OriginalText
          report={report}
          selected={selected?.segment.id}
          showTypes={showTypes}
          onSelect={select}
        />
        <footer className="foundation-original-footer">
          <label className="foundation-types-toggle">
            <input
              type="checkbox"
              checked={showTypes}
              onChange={(event) => setShowTypes(event.target.checked)}
            />{' '}
            إظهار أنواع العبارات المنقولة
          </label>
          <ul className="foundation-type-legend" aria-label="دليل ألوان أنواع العبارات">
            {legendRoles.map((role) => (
              <li key={role}>
                <span
                  className={`foundation-legend-swatch semantic-highlight--${roleColorClasses[role]}`}
                  aria-hidden="true"
                />
                {roleLabels[role]}
              </li>
            ))}
            <li>كلام الكاتب بلا تلوين</li>
          </ul>
          <p>
            الألوان توضح نوع العبارة، ولا تحكم على صحتها. يُلوّن الإسناد إذا ورد ضمن العبارات
            المصنّفة في هذا التقرير.
          </p>
        </footer>
      </section>
      <div className="foundation-workspace">
        <aside className="foundation-finding-list" aria-label="نتائج مقارنة النقل">
          <h2>مؤشر النقل الحرفي</h2>
          {findingGroups.map((group) => {
            const items = rows.filter((row) => row.group === group.key);
            if (!items.length) return null;
            return (
              <details
                key={group.key}
                className={`foundation-finding-group foundation-finding-group--${group.key}`}
                open={group.key !== 'faithful' || selected?.group === 'faithful'}
              >
                <summary>
                  {group.label} <span>{items.length}</span>
                </summary>
                <p>{group.description}</p>
                <ol>
                  {items.map((row) => (
                    <li key={row.segment.id}>
                      <button
                        type="button"
                        className="foundation-finding-select"
                        aria-pressed={row.segment.id === selected?.segment.id}
                        aria-label={`مقارنة النقل ${row.position}: ${row.segment.originalText}`}
                        onClick={() => select(row)}
                      >
                        <span className="foundation-finding-number">{row.position}</span>
                        <span>{row.segment.originalText}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
        </aside>
        <section
          className="foundation-comparison"
          aria-label="مقارنة النقل المحدد"
          ref={comparisonRef}
        >
          <h2>{sourceOverride && !selected ? 'المصدر المحدد' : 'مقارنة النقل المحدد'}</h2>
          {selected && (
            <>
              <strong
                className={`foundation-result-label foundation-result-label--${comparisonIsBound ? selected.group : 'unresolved'}`}
              >
                {comparisonIsBound
                  ? selected.presentation.label
                  : source
                    ? 'مصدر مرشح لم تثبت مطابقته'
                    : 'لم تُحسم مطابقة النقل'}
              </strong>
              <p>
                {!comparisonIsBound && source
                  ? 'لم تثبت مطابقة النقل للمصدر المعروض؛ قارن النصين للتحقق من الموضع والنسبة.'
                  : !comparisonIsBound || selected.group === 'unresolved'
                    ? unresolvedExplanation(selected)
                    : selected.presentation.explanation}
              </p>
              <div className="foundation-compare-texts">
                <div
                  className={`foundation-compare-card foundation-compare-card--draft ${comparisonIsBound && selected.group === 'different' ? 'foundation-compare-card--different' : ''}`}
                >
                  <h3>النقل في المسودة</h3>
                  <blockquote>
                    <ComparedWords
                      text={selected.segment.originalText}
                      ranges={highlightedDifferences.draft}
                      side="draft"
                    />
                  </blockquote>
                </div>
                <div className="foundation-compare-card foundation-compare-card--reference">
                  {source && comparisonText ? (
                    <>
                      <h3>{sourceCitation(source, intake.evidence)}</h3>
                      {overrideIsCandidate && (
                        <p className="foundation-candidate-notice">
                          مصدر مرشح؛ لم تثبت المطابقة معه.
                        </p>
                      )}
                      <p className="foundation-compare-caption">{comparisonText.label}</p>
                      <blockquote>
                        <ComparedWords
                          text={comparisonText.text}
                          ranges={highlightedDifferences.source}
                          side="source"
                        />
                        {comparisonText.truncated ? '…' : ''}
                      </blockquote>
                    </>
                  ) : (
                    <>
                      <h3>النص المرجعي</h3>
                      <p>لم يتحدد مصدر للمقارنة. راجع النسبة أو افتح أحد المصادر المرشحة أدناه.</p>
                    </>
                  )}
                </div>
              </div>
              {(highlightedDifferences.draft.length > 0 ||
                highlightedDifferences.source.length > 0) && (
                <p className="foundation-difference-key">
                  الكلمات المحددة فروق في النقل؛ يوضح النص المرجعي الألفاظ المقابلة وما حُذف منه.
                </p>
              )}
              {comparisonIsBound && (
                <p>
                  <b>حدود المقتطف: </b>
                  {selected.presentation.extent}
                </p>
              )}
              {comparisonIsBound &&
                selected.finding.comparison &&
                selected.finding.comparison.differences.length > 0 && (
                  <ul className="foundation-differences" aria-label="فروق النقل عن المصدر">
                    {selected.finding.comparison.differences.map((difference, index) => (
                      <li key={index}>
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
              {comparisonIsBound && selected.segment.conflict && (
                <p className="foundation-candidate-notice">
                  تعارضت النسبة المذكورة مع المصدر المرشح؛ راجع المرجع الملحق بهذا النقل.
                </p>
              )}
              {!selected.source && selected.segment.sourceKeys.length > 0 && (
                <div className="foundation-candidates">
                  <h3>مصادر مرشحة لهذا النقل</h3>
                  {intake.evidence
                    .filter((item) => selected.segment.sourceKeys.includes(item.snapshotKey))
                    .map((item) => (
                      <button
                        className="text-action"
                        type="button"
                        key={item.snapshotKey}
                        onClick={() => selectSource(item)}
                      >
                        {sourceCitation(item, intake.evidence)}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          {!selected && source && comparisonText && (
            <>
              <h3>{sourceCitation(source, intake.evidence)}</h3>
              <p>هذا النص متاح للقراءة؛ لم تُعرض هنا مطابقة لنقل محدد من المسودة.</p>
              <p className="foundation-compare-caption">{comparisonText.label}</p>
              <blockquote>
                {comparisonText.text}
                {comparisonText.truncated ? '…' : ''}
              </blockquote>
            </>
          )}
          {!selected && !source && <p>اختر نقلًا أو مصدرًا لعرض تفاصيله هنا.</p>}
          {source && (
            <>
              <FullSource source={source} report={report} />
              {selectedCoverage?.status === 'partial' && (
                <p className="foundation-context-note">بعض نصوص التفسير المرتبطة بالآية متاحة.</p>
              )}
              {selectedCoverage?.status === 'unavailable' && (
                <p className="foundation-context-note">لم تتوفر نصوص التفسير المرتبطة بالآية.</p>
              )}
              {selectedContexts.length > 0 && (
                <details className="foundation-linked-context">
                  <summary>تفسير وسياق مرتبط ({selectedContexts.length})</summary>
                  {selectedContexts.map((context) => (
                    <FullSource key={context.snapshotKey} source={context} report={report} />
                  ))}
                </details>
              )}
            </>
          )}
        </section>
      </div>
      {notes.length > 0 && (
        <details className="foundation-editorial-notes">
          <summary>ملاحظات تحريرية مرتبطة بالنص</summary>
          {notes.map((note) => (
            <article key={note.id}>
              <h3>{note.title}</h3>
              <p>{note.explanation}</p>
              {note.occurrences.length > 1 ? (
                <details>
                  <summary>مواضع تحتاج مراجعة ({note.occurrences.length})</summary>
                  <ol>
                    {note.occurrences.map((occurrence) => (
                      <li key={occurrence.id}>
                        <blockquote>{occurrence.text}</blockquote>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : (
                note.occurrences.map((occurrence) => (
                  <blockquote key={occurrence.id}>{occurrence.text}</blockquote>
                ))
              )}
              {note.occurrences.some((occurrence) => occurrence.hasAssessment) && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    assessmentHeadingRef.current?.scrollIntoView?.({
                      behavior: 'smooth',
                      block: 'start',
                    });
                    assessmentHeadingRef.current?.focus({ preventScroll: true });
                  }}
                >
                  راجع نتائج كفاية الاستدلال
                </button>
              )}
            </article>
          ))}
          <p>اقرأ المصدر كاملًا قبل الاستناد إليه.</p>
        </details>
      )}
      <details className="foundation-library">
        <summary>المصادر والسياقات ({intake.evidence.length})</summary>
        <p>المصدر المرشح نتيجة بحث؛ اختياره للقراءة لا يعني ثبوت المطابقة أو الاستدلال.</p>
        {(
          [
            ['matched', 'مصادر المقارنة'],
            ['candidates', 'مصادر مرشحة'],
            ['context', 'تفسير وسياق مرتبط بالنقول'],
            ['additional', 'قراءة إضافية مرتبطة بالموضوع'],
          ] as const
        ).map(
          ([key, title]) =>
            collections[key].length > 0 && (
              <section key={key} className="foundation-source-category">
                <h3>{title}</h3>
                {key === 'additional' && (
                  <p>هذه قراءة إضافية؛ لم تُنقل في النص ولا تثبت الاستدلال.</p>
                )}
                <ul>
                  {collections[key].map((item) => (
                    <li key={item.snapshotKey} className="foundation-source">
                      <button
                        className="foundation-library-select"
                        type="button"
                        onClick={() => selectSource(item)}
                      >
                        <span>{sourceCitation(item, intake.evidence)}</span>
                        <small>{sourceRoleLabel(item)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
        {intake.evidence.length === 0 && <p>لم يتوفر مصدر قابل للعرض. لا يثبت ذلك خطأ النص.</p>}
      </details>
      <details className="foundation-report-limits">
        <summary>حدود المقارنة</summary>
        <p>تعرض المقارنة النص من النسخة الرقمية المتاحة؛ لا تثبت وحدها سلامة الطبعة.</p>
        <p>حدود المقتطف تصف موضعه في المصدر، ولا تحكم على أثره في معنى الاستدلال.</p>
      </details>
    </div>
  );
}

export function FoundationResultScreen({
  reviewId,
  initialReport,
  onHome,
  onTicket,
}: {
  reviewId: string;
  initialReport: FoundationReport | null;
  onHome: () => void;
  onTicket: () => void;
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
            <RewritePanel
              key={`${report.reviewId}:${report.inputSha256}:${report.evidenceStateSha256}`}
              report={report}
            />
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
            {shouldOfferHumanReview(report) && (
              <section
                className="foundation-review-escalation"
                role="note"
                aria-labelledby="foundation-review-escalation-title"
              >
                <WarningCircle size={28} weight="fill" aria-hidden="true" />
                <div>
                  <h2 id="foundation-review-escalation-title">
                    لم نجد ما يكفي من المصادر الموثوقة لنتيجة دقيقة
                  </h2>
                  <p>
                    ننصح بإرسال النص للمراجعة. سيطّلع عليه مراجع مختص بالمحتوى الإسلامي، ويمكنك
                    متابعة الرد الموثق باستخدام رقم التذكرة وبريدك الإلكتروني.
                  </p>
                  <button className="button button--primary" onClick={onTicket} type="button">
                    <UsersThree size={20} /> إرسال النص للمراجعة
                  </button>
                </div>
              </section>
            )}
            <p>إعادة التحليل تنشئ تقريرًا جديدًا للنص نفسه بالمقارنة الحالية.</p>
            {rerunError && <p role="alert">تعذر بدء التحليل الجديد. {rerunError}</p>}
          </>
        )}
      </main>
    </div>
  );
}
