import { useEffect, useRef, useState } from 'react';
import { RewritePanel } from './rewrite.js';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { BookOpen } from '@phosphor-icons/react/BookOpen';
import { CheckSquare } from '@phosphor-icons/react/CheckSquare';
import { FileText } from '@phosphor-icons/react/FileText';
import { Info } from '@phosphor-icons/react/Info';
import { SlidersHorizontal } from '@phosphor-icons/react/SlidersHorizontal';
import { UsersThree } from '@phosphor-icons/react/UsersThree';
import { Warning } from '@phosphor-icons/react/Warning';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import { XSquare } from '@phosphor-icons/react/XSquare';
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
  reviewTicketsAvailable,
} from './api.js';
import {
  comparisonHighlights,
  materialReviewReasons,
  editorialNotes,
  interpretationPresentation,
  retrievalLimitation,
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
const assessmentLabels = {
  supported: 'الدليل المعروض يؤيد العبارة مبدئيًا',
  contradicted: 'تعارض ظاهر بين العبارة والدليل المعروض',
  not_established: 'لم يثبت هذا الاستنتاج من الدليل المعروض',
  insufficient_context: 'السياق المتاح لا يكفي للتقييم',
  not_applicable: 'لا يوجد استنتاج واضح للتقييم',
};

export function shouldOfferHumanReview(report: FoundationReport): boolean {
  return materialReviewReasons(report).length > 0;
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
  highlightedRole,
  onSelect,
}: {
  report: FoundationReport;
  selected: string | undefined;
  showTypes: boolean;
  highlightedRole: IntakeSegment['role'] | null;
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
            highlightedRole === segment.role ? 'foundation-type-highlight--active' : '',
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
        <span key={segment.id} data-segment-role={segment.role}>
          {text}
        </span>
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

type SourceCollectionKey = 'matched' | 'candidates' | 'context' | 'additional';

const sourceCollectionLabels: Record<SourceCollectionKey, string> = {
  matched: 'مصادر المقارنة',
  candidates: 'مصادر مرشحة',
  context: 'التفسير والسياق',
  additional: 'قراءة إضافية',
};

const sourceRelationshipLabels: Record<SourceCollectionKey, string> = {
  matched: 'مرتبط بمقارنة نقل في التقرير',
  candidates: 'مرشح للقراءة ولم تثبت مطابقته',
  context: 'يشرح مصدرًا أو يضيف سياقه',
  additional: 'مرتبط بالموضوع للقراءة فقط',
};

function SourceLibrary({
  report,
  collections,
  selectedSourceKey,
  onSelect,
}: {
  report: FoundationReport;
  collections: ReturnType<typeof sourceCollections>;
  selectedSourceKey: string | undefined;
  onSelect: (source: SourceEvidence) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<'all' | SourceCollectionKey>('all');
  const [showAll, setShowAll] = useState(false);
  const categories = (Object.keys(sourceCollectionLabels) as SourceCollectionKey[]).map((key) => ({
    key,
    label: sourceCollectionLabels[key],
    count: collections[key].length,
  }));
  const allRows = categories.flatMap(({ key }) =>
    collections[key].map((source) => ({ source, category: key })),
  );
  const filteredRows =
    activeCategory === 'all' ? allRows : allRows.filter((row) => row.category === activeCategory);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 5);
  const hiddenCount = filteredRows.length - visibleRows.length;

  return (
    <section className="foundation-library" aria-labelledby="foundation-library-title">
      <div className="foundation-library-heading">
        <div>
          <p className="foundation-eyebrow">قاعدة بيانات بصيرة</p>
          <h2 id="foundation-library-title">
            المصادر والسياقات المرتبطة بالنص ({report.intake.evidence.length} مصدرًا)
          </h2>
          <p>اختر مصدرًا لقراءته في مساحة المقارنة. ظهوره هنا لا يثبت المطابقة أو الاستدلال.</p>
        </div>
        <div className="foundation-source-tabs" role="group" aria-label="تصفية المصادر">
          <button
            type="button"
            aria-pressed={activeCategory === 'all'}
            onClick={() => {
              setActiveCategory('all');
              setShowAll(false);
            }}
          >
            الكل ({allRows.length})
          </button>
          {categories.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              aria-pressed={activeCategory === key}
              disabled={count === 0}
              onClick={() => {
                setActiveCategory(key);
                setShowAll(false);
              }}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>
      {visibleRows.length > 0 ? (
        <div className="foundation-source-table-wrap">
          <table className="foundation-source-table">
            <thead>
              <tr>
                <th scope="col">المصدر المرجعي</th>
                <th scope="col">التصنيف</th>
                <th scope="col">موضع الشاهد</th>
                <th scope="col">صلة المصدر</th>
                <th scope="col">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ source, category }) => {
                const excerpt = source.originalText.replace(/\s+/gu, ' ').trim();
                return (
                  <tr
                    key={source.snapshotKey}
                    className={source.snapshotKey === selectedSourceKey ? 'is-selected' : undefined}
                  >
                    <th scope="row">
                      <span className="foundation-source-status" aria-hidden="true" />
                      {sourceCitation(source, report.intake.evidence)}
                    </th>
                    <td>
                      <span
                        className={`foundation-source-type foundation-source-type--${category}`}
                      >
                        {sourceRoleLabel(source)}
                      </span>
                    </td>
                    <td>
                      <span className="foundation-source-excerpt">
                        {excerpt.length > 110 ? `${excerpt.slice(0, 110)}…` : excerpt}
                      </span>
                    </td>
                    <td>{sourceRelationshipLabels[category]}</td>
                    <td>
                      <button
                        className="text-action"
                        type="button"
                        aria-pressed={source.snapshotKey === selectedSourceKey}
                        aria-label={`عرض المصدر: ${sourceCitation(source, report.intake.evidence)}`}
                        onClick={() => onSelect(source)}
                      >
                        عرض المصدر
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="foundation-empty-sources">لا توجد مصادر في هذا التصنيف.</p>
      )}
      {filteredRows.length > 5 && (
        <button
          type="button"
          className="foundation-show-sources text-action"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? 'عرض أول خمسة مصادر' : `عرض ${hiddenCount} مصادر إضافية`}
        </button>
      )}
    </section>
  );
}

export function FoundationReportContent({ report }: { report: FoundationReport }) {
  const { intake } = report;
  const rows = reportFindings(report);
  const initial =
    rows.find((row) => row.group === 'different') ??
    rows.find((row) => row.group === 'unresolved') ??
    rows[0];
  const initialClaim = initial ? null : report.semanticAssessment?.claims[0];
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.segment.id);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(initialClaim?.id ?? null);
  const [selectedCitationIndex, setSelectedCitationIndex] = useState(0);
  const [sourceOverride, setSourceOverride] = useState<string | null>(
    initialClaim
      ? (report.semanticAssessment?.assessments.find((row) => row.claimId === initialClaim.id)
          ?.citations[0]?.evidenceKey ?? null)
      : null,
  );
  const [showTypes, setShowTypes] = useState(true);
  const [highlightedRole, setHighlightedRole] = useState<IntakeSegment['role'] | null>(null);
  const [activeSection, setActiveSection] = useState('summary');
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    sources: false,
    context: false,
    limits: false,
  });
  const comparisonRef = useRef<HTMLElement>(null);
  const assessmentHeadingRef = useRef<HTMLHeadingElement>(null);
  const flashTimer = useRef<number | null>(null);
  const selected = rows.find((row) => row.segment.id === selectedId);
  const selectedClaim = report.semanticAssessment?.claims.find((row) => row.id === selectedClaimId);
  const selectedAssessment = report.semanticAssessment?.assessments.find(
    (row) => row.claimId === selectedClaimId,
  );
  const source = sourceOverride
    ? intake.evidence.find((row) => row.snapshotKey === sourceOverride)
    : selected?.source;
  const comparisonIsBound = !!selected && source?.snapshotKey === selected.finding.evidenceKey;
  const interpretation = interpretationPresentation(report);
  const retrievalNotice = retrievalLimitation(report);
  const collections = sourceCollections(report);
  const notes = editorialNotes(report);
  const selectedCitation = selectedAssessment?.citations[selectedCitationIndex];
  const comparisonText =
    source && selectedClaim && selectedCitation?.evidenceKey === source.snapshotKey
      ? { text: selectedCitation.excerpt, label: 'الشاهد المرتبط بعبارة الكاتب', truncated: false }
      : source
        ? sourceComparisonText(source, selected?.finding)
        : null;
  const highlightedDifferences = selected
    ? comparisonHighlights(report, selected, source)
    : { draft: [], source: [] };
  const select = (row: ReportFinding) => {
    setSelectedId(row.segment.id);
    setSelectedClaimId(null);
    setSourceOverride(null);
    setActiveSection('comparison');
    setFlashSection('comparison');
    comparisonRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashSection(null), 1_400);
  };
  const selectSource = (item: SourceEvidence) => {
    const linked =
      rows.find((row) => row.finding.evidenceKey === item.snapshotKey) ??
      rows.find((row) => row.segment.sourceKeys.includes(item.snapshotKey));
    setSelectedId(linked?.segment.id);
    setSelectedClaimId(null);
    setSourceOverride(item.snapshotKey);
    setActiveSection('comparison');
    setFlashSection('comparison');
    comparisonRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashSection(null), 1_400);
  };
  const overrideIsCandidate = !!selected && !!source && !comparisonIsBound;
  const canShowComparisonEvidence = selected
    ? comparisonIsBound && selected.group !== 'unresolved'
    : !!selectedClaim &&
      !!selectedCitation &&
      selectedAssessment?.status !== 'insufficient_context' &&
      selectedAssessment?.status !== 'not_applicable' &&
      selectedCitation.evidenceKey === source?.snapshotKey;
  const selectedContexts = source
    ? collections.context.filter(
        (row) => row.parentSnapshotKey === source.snapshotKey || row.reference === source.reference,
      )
    : [];
  const selectedCoverage = source
    ? intake.contextCoverage.find((row) => row.reference === source.reference)
    : null;

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const navigateTo = (
    key:
      | 'summary'
      | 'comparison'
      | 'analysis'
      | 'assessment'
      | 'sources'
      | 'context'
      | 'limits'
      | 'review',
  ) => {
    if (key === 'sources' || key === 'context' || key === 'limits') {
      setOpenSections((current) => ({ ...current, [key]: true }));
    }
    setActiveSection(key);
    setFlashSection(key);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`report-${key}`);
      target?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      });
      if (key === 'review' && target) target.classList.add('is-focus-pulse');
    });
    flashTimer.current = window.setTimeout(() => {
      setFlashSection(null);
      if (key === 'review')
        document.getElementById('report-review')?.classList.remove('is-focus-pulse');
    }, 1_400);
  };

  const selectClaim = (claimId: string, evidenceKey?: string, citationIndex = 0) => {
    const assessment = report.semanticAssessment?.assessments.find(
      (row) => row.claimId === claimId,
    );
    setSelectedId(undefined);
    setSelectedClaimId(claimId);
    setSelectedCitationIndex(citationIndex);
    setSourceOverride(evidenceKey ?? assessment?.citations[0]?.evidenceKey ?? null);
    navigateTo('comparison');
  };

  const differenceExplanation = selected
    ? comparisonIsBound
      ? selected.presentation.explanation
      : source
        ? 'المصدر المعروض مرشح للقراءة، ولم تثبت مطابقته للنقل المحدد.'
        : unresolvedExplanation(selected)
    : 'اختر نقلًا من النص أو من ملخص النتائج لعرض الفرق وتفسيره.';

  const uncertainReference = (
    <div className="foundation-uncertain-reference">
      <p>لم تُحسم مطابقة هذه العبارة بمصدر مرجعي. لم نعرض نصًا مرشحًا بوصفه دليلًا عليها.</p>
      <p>يبقى نصك الأصلي كما هو؛ يمكنك طلب مراجعة بشرية للتحقق من النقل أو الاستدلال.</p>
      {shouldOfferHumanReview(report) && (
        <button
          type="button"
          className="button button--outline"
          onClick={() => navigateTo('review')}
        >
          طلب مراجعة بشرية
        </button>
      )}
    </div>
  );

  return (
    <div className="foundation-report-shell">
      <nav className="foundation-report-nav" aria-label="أقسام التقرير">
        {[
          ['summary', 'الملخص والنتائج'],
          ['comparison', 'مقارنة النصوص'],
          ['analysis', 'تحليل الفرق'],
          ['assessment', 'تحليل الاستدلال'],
          ['sources', 'المصادر والمراجع'],
          ['context', 'التفسير والسياق'],
          ['limits', 'حدود المقارنة'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={activeSection === key ? 'true' : undefined}
            onClick={() =>
              navigateTo(
                key as
                  | 'summary'
                  | 'comparison'
                  | 'analysis'
                  | 'assessment'
                  | 'sources'
                  | 'context'
                  | 'limits',
              )
            }
          >
            <span aria-hidden="true" />
            {label}
          </button>
        ))}
        {materialReviewReasons(report).length > 0 && (
          <button
            type="button"
            aria-current={activeSection === 'review' ? 'true' : undefined}
            onClick={() => navigateTo('review')}
          >
            <span aria-hidden="true" />
            المراجعة البشرية
          </button>
        )}
      </nav>
      <div className="foundation-report">
        <header
          id="report-summary"
          className={`foundation-report-intro ${flashSection === 'summary' ? 'is-focus-pulse' : ''}`}
        >
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
            <div className="foundation-summary-actions">
              {findingGroups.map((group) => {
                const items = rows.filter((row) => row.group === group.key);
                const Icon =
                  group.key === 'different'
                    ? XSquare
                    : group.key === 'unresolved'
                      ? Warning
                      : CheckSquare;
                return (
                  <button
                    key={group.key}
                    type="button"
                    disabled={items.length === 0}
                    aria-label={`${group.label} (${items.length})`}
                    className={`foundation-summary-action foundation-summary-action--${group.key}`}
                    onClick={() => items[0] && select(items[0])}
                  >
                    <Icon size={23} aria-hidden="true" />
                    <span>{group.label}</span>
                    <b>({items.length})</b>
                  </button>
                );
              })}
            </div>
          </section>
        </header>

        <section
          id="report-comparison"
          className={`foundation-comparison foundation-comparison--primary ${flashSection === 'comparison' ? 'is-focus-pulse' : ''}`}
          aria-label="مقارنة النقل المحدد"
          ref={comparisonRef}
        >
          {rows.length > 1 && (
            <label className="foundation-quote-picker">
              اختر النقل للمقارنة
              <select
                aria-label="اختر النقل للمقارنة"
                value={selectedId ?? ''}
                onChange={(event) => {
                  const row = rows.find((item) => item.segment.id === event.target.value);
                  if (row) select(row);
                }}
              >
                {!selectedId && <option value="">اختر نقلًا</option>}
                {rows.map((row) => (
                  <option key={row.segment.id} value={row.segment.id}>
                    {row.position}. {row.presentation.label} —{' '}
                    {row.segment.originalText.slice(0, 90)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected && (
            <>
              <div className="foundation-compare-texts">
                <article
                  className={`foundation-compare-card foundation-compare-card--draft ${comparisonIsBound && selected.group === 'different' ? 'foundation-compare-card--different' : ''}`}
                >
                  <header>
                    <FileText size={24} aria-hidden="true" />
                    <div>
                      <h2>النص في المسودة</h2>
                      <p>النص كما ورد في المسودة</p>
                    </div>
                  </header>
                  <blockquote>
                    <ComparedWords
                      text={selected.segment.originalText}
                      ranges={highlightedDifferences.draft}
                      side="draft"
                    />
                  </blockquote>
                </article>
                <article className="foundation-compare-card foundation-compare-card--reference">
                  <header>
                    <BookOpen size={24} aria-hidden="true" />
                    <div>
                      <h2>النص المرجعي</h2>
                      <p>
                        {source ? sourceCitation(source, intake.evidence) : 'لم يتحدد مصدر بعد'}
                      </p>
                    </div>
                  </header>
                  {canShowComparisonEvidence && source && comparisonText ? (
                    <>
                      {overrideIsCandidate && (
                        <p className="foundation-candidate-notice">مصدر مرشح لم تثبت مطابقته.</p>
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
                    uncertainReference
                  )}
                </article>
              </div>
              {comparisonIsBound && (
                <p className="foundation-comparison-extent">
                  <b>حدود المقتطف: </b>
                  {selected.presentation.extent}
                </p>
              )}
              {comparisonIsBound && selected.segment.conflict && (
                <p className="foundation-candidate-notice">
                  تعارضت النسبة المذكورة مع المصدر المرشح؛ راجع المرجع الملحق بهذا النقل.
                </p>
              )}
              {!selected.source && selected.segment.sourceKeys.length > 0 && (
                <div className="foundation-candidates">
                  <h3>مصادر مرشحة لهذا النقل</h3>
                  {selected.segment.sourceKeys.length > 1 && <p>توجد عدة مصادر مرشحة.</p>}
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
          {!selected && (
            <div className="foundation-compare-texts">
              <article className="foundation-compare-card foundation-compare-card--draft">
                <header>
                  <FileText size={24} aria-hidden="true" />
                  <div>
                    <h2>{selectedClaim ? 'عبارة الكاتب' : 'النص في المسودة'}</h2>
                    <p>
                      {selectedClaim ? 'العبارة المحددة في التقرير' : 'النص كما ورد في المسودة'}
                    </p>
                  </div>
                </header>
                <blockquote>{selectedClaim?.originalText ?? intake.originalText}</blockquote>
              </article>
              <article className="foundation-compare-card foundation-compare-card--reference">
                <header>
                  <BookOpen size={24} aria-hidden="true" />
                  <div>
                    <h2>{selectedClaim ? 'الدليل المرتبط بالعبارة' : 'النص المرجعي'}</h2>
                    <p>{source ? sourceCitation(source, intake.evidence) : 'لم يتحدد مصدر بعد'}</p>
                  </div>
                </header>
                {(canShowComparisonEvidence || (!selectedClaim && source)) &&
                source &&
                comparisonText ? (
                  <>
                    <p className="foundation-compare-caption">{comparisonText.label}</p>
                    <blockquote>
                      {comparisonText.text}
                      {comparisonText.truncated ? '…' : ''}
                    </blockquote>
                    {!selectedClaim && <p>هذا المصدر متاح للقراءة؛ لم تثبت مطابقته لنقل محدد.</p>}
                  </>
                ) : (
                  uncertainReference
                )}
              </article>
            </div>
          )}
        </section>

        <section
          id="report-analysis"
          className={`foundation-difference-analysis ${flashSection === 'analysis' ? 'is-focus-pulse' : ''}`}
          aria-labelledby="foundation-difference-title"
        >
          <Info size={27} weight="fill" aria-hidden="true" />
          <h2 id="foundation-difference-title">تحليل الفرق</h2>
          <div>
            <strong
              className={`foundation-result-label foundation-result-label--${comparisonIsBound && selected ? selected.group : 'unresolved'}`}
            >
              {selectedClaim
                ? selectedAssessment
                  ? assessmentLabels[selectedAssessment.status]
                  : 'لم يكتمل تقييم هذه العبارة'
                : selected
                  ? comparisonIsBound
                    ? selected.presentation.label
                    : 'مطابقة غير محسومة'
                  : 'اختر نقلًا للمقارنة'}
            </strong>
            <p>
              {selectedClaim
                ? (selectedAssessment?.explanation ?? 'لم يتوفر تقييم لهذه العبارة في التقرير.')
                : differenceExplanation}
            </p>
            {(highlightedDifferences.draft.length > 0 ||
              highlightedDifferences.source.length > 0) && (
              <p className="foundation-difference-key">
                الكلمات المحددة توضح موضع الاختلاف بين المسودة والنص المرجعي.
              </p>
            )}
            {comparisonIsBound && selected?.finding.comparison?.differences.length ? (
              <ul className="foundation-differences" aria-label="فروق النقل عن المصدر">
                {selected.finding.comparison.differences.map((difference, index) => (
                  <li key={index}>
                    {difference.kind === 'omit'
                      ? `ورد في المصدر ولم يرد في النقل: «${difference.sourceText}».`
                      : difference.kind === 'insert'
                        ? `زيادة في النقل: «${difference.quotedText}».`
                        : `ورد في النقل: «${difference.quotedText}»؛ وفي المصدر: «${difference.sourceText}».`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section
          id="report-assessment"
          className={`foundation-interpretation foundation-assessment-panel ${flashSection === 'assessment' ? 'is-focus-pulse' : ''}`}
          aria-label="مؤشر كفاية الاستدلال"
        >
          <p className="foundation-eyebrow">تحليل الدليل</p>
          <h2 id="foundation-evidence-assessment" ref={assessmentHeadingRef} tabIndex={-1}>
            مؤشر كفاية الاستدلال
          </h2>
          <strong>{interpretation.label}</strong>
          <p>{interpretation.explanation}</p>
          {retrievalNotice && <p role="note">{retrievalNotice}</p>}
          {report.semanticAssessment?.claims.map((claim) => {
            const finding = report.semanticAssessment!.assessments.find(
              (row) => row.claimId === claim.id,
            );
            return (
              <details key={claim.id} className="foundation-semantic-claim">
                <summary>
                  {claim.originalText.length > 140
                    ? claim.originalText.slice(0, 140) + '…'
                    : claim.originalText}
                  <span>
                    {' '}
                    — {finding ? assessmentLabels[finding.status] : 'لم يكتمل تقييم هذه العبارة'}
                  </span>
                </summary>
                <blockquote>{claim.originalText}</blockquote>
                <button
                  type="button"
                  className="text-action"
                  aria-pressed={selectedClaimId === claim.id}
                  onClick={() => selectClaim(claim.id)}
                >
                  مقارنة العبارة بالدليل
                </button>
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
                      const citationSource = report.intake.evidence.find(
                        (row) => row.snapshotKey === citation.evidenceKey,
                      );
                      return citationSource ? (
                        <div key={`${citation.evidenceKey}-${index}`}>
                          <button
                            type="button"
                            className="text-action"
                            aria-label={`عرض شاهد: ${sourceCitation(citationSource, report.intake.evidence)}`}
                            onClick={() => selectClaim(claim.id, citation.evidenceKey, index)}
                          >
                            {sourceCitation(citationSource, report.intake.evidence)}
                          </button>
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
        <section id="report-original" className="source-panel foundation-draft">
          <header>
            <FileText size={24} aria-hidden="true" />
            <div>
              <h2>النص الأصلي</h2>
              <p>انقر أي عبارة ملوّنة لعرض مقارنتها مباشرة.</p>
            </div>
          </header>
          <OriginalText
            report={report}
            selected={selected?.segment.id}
            showTypes={showTypes}
            highlightedRole={highlightedRole}
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
                  <button
                    type="button"
                    className="foundation-type-legend-button"
                    aria-pressed={showTypes && highlightedRole === role}
                    onClick={() => {
                      setShowTypes(true);
                      setHighlightedRole(role);
                      window.requestAnimationFrame(() => {
                        document
                          .querySelector(
                            `#report-original .semantic-highlight--${roleColorClasses[role]}`,
                          )
                          ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                      });
                    }}
                  >
                    <span
                      className={`foundation-legend-swatch semantic-highlight--${roleColorClasses[role]}`}
                      aria-hidden="true"
                    />
                    {roleLabels[role]}
                  </button>
                </li>
              ))}
              <li>كلام الكاتب بلا تلوين</li>
            </ul>
            {highlightedRole && (
              <p role="status">
                {intake.segments.some((segment) => segment.role === highlightedRole)
                  ? `تم إبراز مواضع ${roleLabels[highlightedRole]} بلونها في النص.`
                  : `لم يُحدَّد موضع من نوع ${roleLabels[highlightedRole]} في هذا التقرير.`}
              </p>
            )}
            <p>الألوان توضح نوع العبارة، ولا تحكم على صحتها.</p>
          </footer>
        </section>

        <details
          id="report-sources"
          className={`foundation-workspace-disclosure ${flashSection === 'sources' ? 'is-focus-pulse' : ''}`}
          open={openSections.sources}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setOpenSections((current) => ({ ...current, sources: open }));
          }}
        >
          <summary>
            <BookOpen size={22} aria-hidden="true" />
            المصادر والمراجع ({intake.evidence.length})
          </summary>
          <div className="foundation-disclosure-content">
            <section className="foundation-finding-list" aria-label="نتائج مقارنة النقل">
              <h2>النقول المحددة للمقارنة</h2>
              {findingGroups.map((group) => {
                const items = rows.filter((row) => row.group === group.key);
                if (!items.length) return null;
                return (
                  <details
                    key={group.key}
                    className={`foundation-finding-group foundation-finding-group--${group.key}`}
                    open={selected?.group === group.key}
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
            </section>
            <SourceLibrary
              report={report}
              collections={collections}
              selectedSourceKey={source?.snapshotKey}
              onSelect={selectSource}
            />
          </div>
        </details>

        <details
          id="report-context"
          className={`foundation-workspace-disclosure ${flashSection === 'context' ? 'is-focus-pulse' : ''}`}
          open={openSections.context}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setOpenSections((current) => ({ ...current, context: open }));
          }}
        >
          <summary>
            <FileText size={22} aria-hidden="true" />
            التفسير والسياق المرتبط ({selectedContexts.length})
          </summary>
          <div className="foundation-disclosure-content foundation-context-grid">
            <section className="foundation-source-inspector" aria-label="تفاصيل المصدر المحدد">
              <p className="foundation-eyebrow">المصدر المحدد</p>
              <h2>{source ? sourceCitation(source, intake.evidence) : 'لم يتحدد مصدر بعد'}</h2>
              {source ? (
                <>
                  <p className="foundation-source-role">{sourceRoleLabel(source)}</p>
                  <FullSource source={source} report={report} />
                  {selectedCoverage?.status === 'partial' && (
                    <p className="foundation-context-note">
                      بعض نصوص التفسير المرتبطة بالآية متاحة.
                    </p>
                  )}
                  {selectedCoverage?.status === 'unavailable' && (
                    <p className="foundation-context-note">
                      لم تتوفر نصوص التفسير المرتبطة بالآية.
                    </p>
                  )}
                  {selectedContexts.map((context) => (
                    <FullSource key={context.snapshotKey} source={context} report={report} />
                  ))}
                </>
              ) : (
                <p>اختر نقلًا أو مصدرًا لعرض نصه وسياقه هنا.</p>
              )}
            </section>
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
          </div>
        </details>

        <details
          id="report-limits"
          className={`foundation-workspace-disclosure ${flashSection === 'limits' ? 'is-focus-pulse' : ''}`}
          open={openSections.limits}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setOpenSections((current) => ({ ...current, limits: open }));
          }}
        >
          <summary>
            <SlidersHorizontal size={22} aria-hidden="true" />
            حدود المقارنة
          </summary>
          <div className="foundation-disclosure-content foundation-report-limits">
            <p>تعرض المقارنة النص من النسخة الرقمية المتاحة؛ لا تثبت وحدها سلامة الطبعة.</p>
            <p>حدود المقتطف تصف موضعه في المصدر، ولا تحكم على أثره في معنى الاستدلال.</p>
          </div>
        </details>
      </div>
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
  const [ticketAvailability, setTicketAvailability] = useState<{
    reviewId: string;
    available: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setTicketAvailability(null);
    void reviewTicketsAvailable(controller.signal)
      .then((available) => {
        if (active && !controller.signal.aborted) setTicketAvailability({ reviewId, available });
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setTicketAvailability({ reviewId, available: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reviewId]);
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
    if (initialReport && attempt === 0) {
      setReport(initialReport);
      setLoading(false);
      return;
    }
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
  const reviewReasons = report ? materialReviewReasons(report) : [];
  const ticketAvailable =
    report?.reviewId === reviewId &&
    ticketAvailability?.reviewId === reviewId &&
    ticketAvailability.available;
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
            <FoundationReportContent
              key={`${report.reviewId}:${report.evidenceStateSha256}`}
              report={report}
            />
            <div className="foundation-report-actions" aria-label="إجراءات التقرير">
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
            </div>
            {reviewReasons.length > 0 && (
              <section
                id="report-review"
                className="foundation-review-escalation"
                role="note"
                aria-labelledby="foundation-review-escalation-title"
              >
                <WarningCircle size={28} weight="fill" aria-hidden="true" />
                <div>
                  <h2 id="foundation-review-escalation-title">مواضع تحتاج مراجعة</h2>
                  <ul>
                    {reviewReasons.map((reason) => (
                      <li key={reason.code}>{reason.message}</li>
                    ))}
                  </ul>
                  {ticketAvailable && (
                    <>
                      <p>يمكنك إرسال النص والنتائج المتاحة للمراجعة باستخدام تذكرة.</p>
                      <button
                        className="button button--primary"
                        onClick={() => {
                          if (
                            ticketAvailability?.reviewId === reviewId &&
                            ticketAvailability.available
                          )
                            onTicket();
                        }}
                        type="button"
                      >
                        <UsersThree size={20} /> إرسال النص للمراجعة
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}
            <p>إعادة التحليل تنشئ تقريرًا جديدًا للنص نفسه بالمقارنة الحالية.</p>
            {rerunError && <p role="alert">تعذر بدء التحليل الجديد. {rerunError}</p>}
            <div id="report-rewrite" className="foundation-external-section">
              <RewritePanel
                key={`${report.reviewId}:${report.inputSha256}:${report.evidenceStateSha256}`}
                report={report}
                evidenceRequired
                onReview={ticketAvailable ? onTicket : undefined}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
