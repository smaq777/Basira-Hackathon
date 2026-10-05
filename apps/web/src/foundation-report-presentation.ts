import type {
  FoundationReport,
  IntakeSegment,
  LiteralFinding,
  SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { assessClaimApplicability } from '../../../packages/contracts/src/claim-applicability.js';
import type { ImprovementCard } from '../../../packages/contracts/src/themes.js';

type EditorialOccurrence = { id: string; text: string; hasAssessment: boolean };
export type EditorialNote = {
  id: string;
  title: string;
  explanation: string;
  occurrences: EditorialOccurrence[];
  evidenceKeys: string[];
};

/** Consolidate repeated lexical hints at presentation time, preserving their locations.
 * A catalog association is a prompt to review the citation, not a missing-evidence verdict.
 */
export function editorialNotes(report: FoundationReport): EditorialNote[] {
  const groups = new Map<string, EditorialNote>();
  const text = report.intake.originalText;
  const normalized = (value: string) => value.normalize('NFC').replace(/\p{M}/gu, '').trim();
  const location = (card: ImprovementCard): EditorialOccurrence => {
    const anchor = card.trigger;
    if (
      !validRange(text, anchor.startOffset, anchor.endOffset) ||
      text.slice(anchor.startOffset, anchor.endOffset) !== anchor.originalText
    ) {
      let end = Math.min(anchor.originalText.length, 360);
      if (end > 0 && !validRange(anchor.originalText, 0, end)) end--;
      return {
        id: card.id,
        text: anchor.originalText.slice(0, end) + (end < anchor.originalText.length ? '…' : ''),
        hasAssessment: false,
      };
    }
    let left = anchor.startOffset;
    let right = anchor.endOffset;
    while (left > 0 && !/[.؛!؟\n]/u.test(text[left - 1]!)) left--;
    while (right < text.length && !/[.؛!؟\n]/u.test(text[right]!)) right++;
    if (right < text.length && text[right] !== '\n') right++;
    while (left < anchor.startOffset && /\s/u.test(text[left]!)) left++;
    while (right > anchor.endOffset && /\s/u.test(text[right - 1]!)) right--;
    const sentenceLeft = left;
    const sentenceRight = right;
    if (right - left > 360) {
      left = Math.max(left, anchor.startOffset - 120);
      right = Math.min(right, left + 360);
      if (!validRange(text, left, right)) {
        if (text.charCodeAt(left) >= 0xdc00 && text.charCodeAt(left) <= 0xdfff) left--;
        right = Math.min(right, left + 360);
        if (text.charCodeAt(right) >= 0xdc00 && text.charCodeAt(right) <= 0xdfff) right--;
      }
    }
    const hasAssessment = !!report.semanticAssessment?.claims.some(
      (claim) =>
        claim.startOffset <= anchor.startOffset &&
        claim.endOffset >= anchor.endOffset &&
        text.slice(claim.startOffset, claim.endOffset) === claim.originalText &&
        report.semanticAssessment!.assessments.some((finding) => finding.claimId === claim.id),
    );
    return {
      id: `${sentenceLeft}:${sentenceRight}`,
      text: `${left > sentenceLeft ? '…' : ''}${text.slice(left, right)}${right < sentenceRight ? '…' : ''}`,
      hasAssessment,
    };
  };
  for (const card of report.improvementCards) {
    // These findings already have the dedicated source comparison above.
    if (card.ruleId === 'literal-mismatch' || card.ruleId === 'citation-conflict') continue;
    const exactTopics = report.themes.authoredThemes
      .filter((item) =>
        item.anchors.some(
          (anchor) =>
            anchor.startOffset === card.trigger.startOffset &&
            anchor.endOffset === card.trigger.endOffset &&
            anchor.originalText === card.trigger.originalText,
        ),
      )
      .map((item) => item.theme);
    const topics = exactTopics.length
      ? exactTopics
      : report.themes.authoredThemes
          .filter((item) =>
            item.anchors.some(
              (anchor) => normalized(anchor.originalText) === normalized(card.trigger.originalText),
            ),
          )
          .map((item) => item.theme);
    const topic =
      [...new Set(topics)].sort().join(',') || `phrase:${normalized(card.trigger.originalText)}`;
    const action =
      card.ruleId === 'charity-undetermined'
        ? 'charity-kind'
        : card.associationStatus === 'unconfirmed_candidate'
          ? 'nearby-candidate'
          : 'source-link';
    const key = `${card.ruleId}:${topic}:${action}`;
    let group = groups.get(key);
    if (!group) {
      const nearby = card.associationStatus === 'unconfirmed_candidate';
      group = {
        id: card.id,
        title:
          card.ruleId === 'charity-undetermined'
            ? 'حدّد نوع الصدقة المقصود'
            : nearby
              ? 'راجع صلة الاقتباس بالعبارة'
              : 'راجع ربط هذه العبارات بمصادرها',
        explanation:
          card.ruleId === 'charity-undetermined'
            ? 'هل تقصد الزكاة الواجبة أم صدقة التطوع؟ وضّح النوع، ثم راجع الحكم والدليل وفق المقصود.'
            : nearby
              ? 'تحقق أن الاقتباس القريب يؤيد المعنى الذي كتبته، ووضّح الصلة بينهما. قرب النصين أو اشتراكهما في الموضوع لا يثبت ذلك وحده.'
              : 'بيّن أي مصدر تستند إليه كل عبارة، ثم تحقق أنه يؤيد المعنى المقصود. وجود اقتباس عن الموضوع نفسه لا يكفي لتحديد هذه الصلة.',
        occurrences: [],
        evidenceKeys: [],
      };
      groups.set(key, group);
    }
    const occurrence = location(card);
    const existing = group.occurrences.find((row) => row.id === occurrence.id);
    if (existing) existing.hasAssessment ||= occurrence.hasAssessment;
    else group.occurrences.push(occurrence);
    group.evidenceKeys = [...new Set([...group.evidenceKeys, ...card.evidenceKeys])];
  }
  return [...groups.values()].map((note) => ({
    ...note,
    title:
      note.occurrences.length === 1 && note.title === 'راجع ربط هذه العبارات بمصادرها'
        ? 'راجع ربط العبارة بمصدرها'
        : note.title,
  }));
}

function numericReference(reference: string): { surah: number; ayah: number } | null {
  const match = /^(\d{1,3}):(\d{1,3})$/u.exec(reference.trim());
  if (!match) return null;
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > 286) return null;
  return { surah, ayah };
}

export function sourceRoleLabel(source: SourceEvidence): string {
  if (source.sourceRole === 'quran_text') return 'القرآن الكريم';
  if (source.sourceRole === 'hadith_matn') return 'حديث نبوي';
  if (source.sourceRole === 'book_excerpt') return 'كتاب';
  if (source.sourceRole === 'scholar_explanation') return 'شرح علمي';
  return source.sourceRole === 'tafsir_footnote' ? 'حاشية تفسير' : 'تفسير';
}

function humanWork(source: SourceEvidence): string {
  if (!/IslamicEval|research corpus|book\s*=|internal_id|https?:|sha256|mcp/iu.test(source.work))
    return source.work;
  return sourceRoleLabel(source);
}

export function sourceCitation(source: SourceEvidence, evidence: SourceEvidence[] = []): string {
  const location = numericReference(source.reference);
  if (
    location &&
    ['quran_text', 'tafsir_commentary', 'tafsir_footnote'].includes(source.sourceRole)
  ) {
    const anchor = evidence.find(
      (row) => row.sourceRole === 'quran_text' && row.reference === source.reference,
    );
    const name = [
      source.provenance.surah_name_original,
      source.provenance.surah_name,
      anchor?.provenance.surah_name_original,
      anchor?.provenance.surah_name,
    ]
      .find(
        (value): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0 &&
          /^[\p{Script=Arabic}\p{M}\s]+$/u.test(value),
      )
      ?.trim()
      .replace(/^سورة\s+/u, '');
    const verse = `سورة ${name ?? location.surah}، الآية ${location.ayah}`;
    return `${source.sourceRole === 'quran_text' ? 'القرآن الكريم' : humanWork(source)} — ${verse}`;
  }
  if (/book\s*=|internal_id|https?:|sha256|mcp/iu.test(source.reference)) return humanWork(source);
  if (source.sourceRole === 'quran_text') return `القرآن الكريم — ${source.reference}`;
  return source.reference === source.work
    ? humanWork(source)
    : `${humanWork(source)} — ${source.reference}`;
}

// Curated reader destination, never a redirect from an arbitrary stored source URL.
// Quran.com is a reading aid; the report retains its own reference text below.
export function quranReaderUrl(source: SourceEvidence): string | undefined {
  if (source.sourceRole !== 'quran_text') return undefined;
  const location = numericReference(source.reference);
  return location ? `https://quran.com/${location.surah}/${location.ayah}` : undefined;
}

export function quotationPresentation(finding: LiteralFinding, report: FoundationReport) {
  const segment = report.intake.segments.find((row) => row.id === finding.segmentId);
  const source = report.intake.evidence.find((row) => row.snapshotKey === finding.evidenceKey);
  const reason = finding.reason.split(';')[0];
  const validOffsets =
    finding.matchedStart !== null &&
    finding.matchedEnd !== null &&
    source &&
    validRange(source.originalText, finding.matchedStart, finding.matchedEnd);
  const rawExact =
    source &&
    segment &&
    ((validOffsets &&
      source.originalText.slice(finding.matchedStart!, finding.matchedEnd!) ===
        segment.originalText) ||
      (finding.matchedStart === null &&
        finding.matchedEnd === null &&
        source.originalText === segment.originalText));
  const legacyExact =
    rawExact &&
    (finding.status === 'exact' ||
      (finding.status === 'partial' && reason === 'exact_contiguous_excerpt'));
  const legacyOrthographic =
    finding.status === 'normalized' ||
    (finding.status === 'partial' &&
      [
        'canonically_equivalent_contiguous_excerpt',
        'contiguous_excerpt_under_declared_typography_rules',
      ].includes(reason ?? ''));
  const fidelity =
    finding.comparison?.fidelity ??
    (legacyExact
      ? 'exact'
      : legacyOrthographic
        ? 'orthographic'
        : finding.status === 'mismatch'
          ? 'different'
          : 'unresolved');
  const extent =
    finding.comparison?.extent ??
    (source && segment?.originalText === source.originalText && legacyExact
      ? 'full'
      : validOffsets &&
          (finding.matchedStart! > 0 || finding.matchedEnd! < source.originalText.length)
        ? 'excerpt'
        : reason?.includes('contiguous_excerpt')
          ? 'excerpt'
          : 'unknown');
  const labels = {
    exact: 'نقل مطابق حرفيًا',
    orthographic: 'نقل مطابق مع اختلاف في الرسم أو الضبط',
    different: 'اختلاف في ألفاظ النقل',
    unresolved: 'لم تُحسم مطابقة النقل',
  };
  const explanations = {
    exact:
      'يطابق النص المنقول موضعه في المصدر حرفيًا. صحة المقتطف لا تعني أنه يشمل النص كله أو أنه يكفي لإثبات استنتاج.',
    orthographic:
      'توافق ألفاظ النقل مع المصدر مع فروق في الرسم أو الضبط. يبقى النص المرجعي المعروض أدناه أساس المراجعة.',
    different:
      'توجد ألفاظ مختلفة أو محذوفة أو مضافة داخل النقل. قارن العبارة بالنص المرجعي المعروض أدناه.',
    unresolved:
      'لم يتحدد موضع مطابق يمكن الاعتماد عليه للمقارنة. لا تعني هذه النتيجة أن الاقتباس خاطئ.',
  };
  const extentLabels = {
    full: 'النص المرجعي كاملًا.',
    excerpt: 'مقتطف متصل من المصدر؛ لا يشمل النص الكامل.',
    gapped: 'يتضمن النقل حذفًا داخل موضعه في المصدر.',
    unknown: 'لم يتحدد موضع المقتطف وحدوده في المصدر.',
  };
  return {
    fidelity,
    label: labels[fidelity],
    explanation: explanations[fidelity],
    extent: extentLabels[extent],
  };
}

export type ReportFinding = {
  finding: LiteralFinding;
  segment: IntakeSegment;
  source: SourceEvidence | undefined;
  presentation: ReturnType<typeof quotationPresentation>;
  group: 'different' | 'unresolved' | 'faithful';
  position: number;
};

export function reportFindings(report: FoundationReport): ReportFinding[] {
  return report.intake.quotationFindings
    .flatMap((finding) => {
      const segment = report.intake.segments.find((row) => row.id === finding.segmentId);
      // Legacy packets treated verse numbers and footnotes as quote bodies.
      // Retain those packets internally, but do not count markers as quotation findings.
      if (!segment || /^[\p{N}\p{P}\s]+$/u.test(segment.originalText)) return [];
      const presentation = quotationPresentation(finding, report);
      return [
        {
          finding,
          segment,
          presentation,
          source: report.intake.evidence.find((row) => row.snapshotKey === finding.evidenceKey),
          group:
            presentation.fidelity === 'different'
              ? ('different' as const)
              : presentation.fidelity === 'unresolved'
                ? ('unresolved' as const)
                : ('faithful' as const),
          position: 0,
        },
      ];
    })
    .sort((a, b) => a.segment.startOffset - b.segment.startOffset)
    .map((row, index) => ({ ...row, position: index + 1 }));
}

export function unresolvedExplanation(row: ReportFinding): string {
  if (row.segment.conflict)
    return 'تعارضت النسبة المذكورة مع المصدر المرشح؛ راجع المرجع الملحق بهذا النقل.';
  if (/boundary|reference_boundary/u.test(row.segment.method))
    return 'لم تتحدد حدود النقل بوضوح؛ راجع موضع بدايته ونهايته في المسودة.';
  if (row.segment.sourceKeys.length > 1)
    return 'توجد عدة مصادر مرشحة؛ لم يتحدد المصدر المقصود بهذا النقل.';
  if (row.segment.sourceKeys.length === 1) return 'عُثر على مصدر مرشح، ولم تثبت مطابقة النقل معه.';
  return 'لم يُعثر على مصدر محدد لهذا النقل ضمن المصادر المتاحة.';
}

export function sourceCollections(report: FoundationReport) {
  const sources = report.intake.evidence;
  const selected = new Set(reportFindings(report).map((row) => row.finding.evidenceKey));
  const isAdditional = (source: SourceEvidence, visited = new Set<string>()): boolean => {
    if (source.provenance.purpose === 'related_context_candidate') return true;
    if (!source.parentSnapshotKey || visited.has(source.snapshotKey)) return false;
    visited.add(source.snapshotKey);
    const parent = sources.find((row) => row.snapshotKey === source.parentSnapshotKey);
    return parent ? isAdditional(parent, visited) : false;
  };
  return {
    matched: sources.filter((source) => !isAdditional(source) && selected.has(source.snapshotKey)),
    candidates: sources.filter(
      (source) =>
        !isAdditional(source) &&
        !selected.has(source.snapshotKey) &&
        source.sourceRole !== 'tafsir_commentary' &&
        source.sourceRole !== 'tafsir_footnote',
    ),
    context: sources.filter(
      (source) =>
        !isAdditional(source) &&
        !selected.has(source.snapshotKey) &&
        (source.sourceRole === 'tafsir_commentary' || source.sourceRole === 'tafsir_footnote'),
    ),
    additional: sources.filter((source) => isAdditional(source)),
  };
}

/** Offsets refer to the untouched UTF-16 source; never slice a surrogate pair. */
function validRange(text: string, start: number, end: number): boolean {
  const boundary = (offset: number) =>
    !(
      text.charCodeAt(offset) >= 0xdc00 &&
      text.charCodeAt(offset) <= 0xdfff &&
      text.charCodeAt(offset - 1) >= 0xd800 &&
      text.charCodeAt(offset - 1) <= 0xdbff
    );
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= text.length &&
    boundary(start) &&
    boundary(end)
  );
}

export function sourceComparisonText(source: SourceEvidence, finding?: LiteralFinding) {
  if (
    finding?.evidenceKey === source.snapshotKey &&
    finding.matchedStart !== null &&
    finding.matchedEnd !== null &&
    validRange(source.originalText, finding.matchedStart, finding.matchedEnd)
  ) {
    return {
      label: 'موضع النقل في المصدر',
      text: source.originalText.slice(finding.matchedStart, finding.matchedEnd),
      startOffset: finding.matchedStart,
      endOffset: finding.matchedEnd,
      truncated: false,
    };
  }
  if (source.originalText.length <= 600)
    return {
      label: 'النص المرجعي',
      text: source.originalText,
      startOffset: 0,
      endOffset: source.originalText.length,
      truncated: false,
    };
  const endOffset = validRange(source.originalText, 0, 400) ? 400 : 399;
  return {
    label: 'بداية النص المرجعي؛ موضع المقتطف غير محدد',
    text: source.originalText.slice(0, endOffset),
    startOffset: 0,
    endOffset,
    truncated: true,
  };
}

export type ComparisonHighlight = {
  startOffset: number;
  endOffset: number;
  kind: 'replace' | 'omit' | 'insert';
};

/** Legacy differences have no locations. Highlight only unique, raw, validated slices.
 * Repeated/normalized/overlapping words remain in the explicit differences list.
 */
export function comparisonHighlights(
  report: FoundationReport,
  row: ReportFinding,
  source?: SourceEvidence,
): {
  draft: ComparisonHighlight[];
  source: ComparisonHighlight[];
} {
  const empty = { draft: [], source: [] };
  const { segment, finding } = row;
  if (
    !source ||
    finding.evidenceKey !== source.snapshotKey ||
    finding.comparison?.fidelity !== 'different' ||
    !validRange(report.intake.originalText, segment.startOffset, segment.endOffset) ||
    report.intake.originalText.slice(segment.startOffset, segment.endOffset) !==
      segment.originalText
  )
    return empty;
  const hasOffsets = finding.matchedStart !== null || finding.matchedEnd !== null;
  if (
    hasOffsets &&
    (finding.matchedStart === null ||
      finding.matchedEnd === null ||
      !validRange(source.originalText, finding.matchedStart, finding.matchedEnd))
  )
    return empty;
  const displayed = sourceComparisonText(source, finding);
  if (source.originalText.slice(displayed.startOffset, displayed.endOffset) !== displayed.text)
    return empty;
  const sourceScope = hasOffsets ? displayed.text : source.originalText;
  const unique = (
    text: string,
    needle: string,
    kind: ComparisonHighlight['kind'],
  ): ComparisonHighlight | null => {
    if (!needle) return null;
    const startOffset = text.indexOf(needle);
    const endOffset = startOffset + needle.length;
    if (
      startOffset < 0 ||
      text.indexOf(needle, startOffset + 1) >= 0 ||
      !validRange(text, startOffset, endOffset)
    )
      return null;
    // A normalized token must not accidentally match part of a different raw word.
    const word = /[\p{L}\p{M}\p{N}]/u;
    if (
      (word.test(needle[0]!) && word.test(text[startOffset - 1] ?? '')) ||
      (word.test(needle[needle.length - 1]!) && word.test(text[endOffset] ?? ''))
    )
      return null;
    return { startOffset, endOffset, kind };
  };
  const pairs = finding.comparison.differences.flatMap((difference) => {
    const draft =
      difference.kind === 'omit'
        ? null
        : unique(segment.originalText, difference.quotedText, difference.kind);
    const fullSource =
      difference.kind === 'insert'
        ? null
        : unique(sourceScope, difference.sourceText, difference.kind);
    if (
      (difference.kind === 'replace' &&
        (!draft || !fullSource || difference.quotedText === difference.sourceText)) ||
      (difference.kind === 'omit' && (difference.quotedText !== '' || !fullSource)) ||
      (difference.kind === 'insert' && (difference.sourceText !== '' || !draft))
    )
      return [];
    const shift = hasOffsets ? 0 : displayed.startOffset;
    const sourceRange = fullSource
      ? {
          ...fullSource,
          startOffset: fullSource.startOffset - shift,
          endOffset: fullSource.endOffset - shift,
        }
      : null;
    if (
      sourceRange &&
      (!validRange(displayed.text, sourceRange.startOffset, sourceRange.endOffset) ||
        displayed.text.slice(sourceRange.startOffset, sourceRange.endOffset) !==
          difference.sourceText)
    )
      return [];
    return [{ draft, source: sourceRange }];
  });
  const overlaps = (a: ComparisonHighlight | null, b: ComparisonHighlight | null) =>
    !!a && !!b && a.startOffset < b.endOffset && a.endOffset > b.startOffset;
  const safe = pairs.filter(
    (pair, index) =>
      !pairs.some(
        (other, at) =>
          at !== index &&
          (overlaps(pair.draft, other.draft) || overlaps(pair.source, other.source)),
      ),
  );
  const order = (a: ComparisonHighlight, b: ComparisonHighlight) => a.startOffset - b.startOffset;
  return {
    draft: safe.flatMap((pair) => (pair.draft ? [pair.draft] : [])).sort(order),
    source: safe.flatMap((pair) => (pair.source ? [pair.source] : [])).sort(order),
  };
}

export function interpretationPresentation(report: FoundationReport) {
  if (report.semanticAssessment?.assessments.length)
    return {
      label: 'تقييم دلالي أولي',
      explanation:
        report.semanticAssessment.status === 'partial'
          ? report.semanticAssessment.errorCode === 'invalid_claims'
            ? 'تتوفر نتائج أولية لبعض العبارات. تعذر التحقق من بعض العبارات المقترحة أو ربطها بالنص والمصادر، فاستُبعدت من التقييم. النتائج المعروضة مقترحات للمراجعة.'
            : 'تتوفر نتائج أولية لبعض العبارات، ولم يكتمل تقييم التقرير. الربط والنتائج مقترحات للمراجعة.'
          : 'قارن التقييم الآلي الادعاءات بالمصادر المعروضة. الربط والنتائج مقترحات للمراجعة، ولا تمثل اعتمادًا علميًا أو شرعيًا.',
    };
  if (
    report.interpretation.status === 'unavailable' ||
    report.semanticAssessment?.status === 'unavailable' ||
    report.semanticAssessment?.status === 'partial'
  )
    return {
      label: 'تعذر استكمال التقييم الدلالي',
      explanation:
        report.semanticAssessment?.errorCode === 'invalid_claims'
          ? 'لم يتمكن التقييم من تحديد عبارات الكاتب وربطها بالنص والمصادر بصورة موثوقة. تظل نتائج مقارنة النقل والمصادر متاحة.'
          : 'لم تتوفر نتيجة دلالية يمكن عرضها. نتائج النقل والمصادر محفوظة، ويمكن إعادة التحليل لاحقًا.',
    };
  const applicability =
    report.interpretation.applicability ?? assessClaimApplicability(report.intake);
  if (
    report.interpretation.status === 'not_applicable' ||
    report.semanticAssessment?.status === 'not_applicable' ||
    applicability.status === 'not_applicable'
  )
    return {
      label: 'لا يوجد استنتاج قابل للتقييم في هذا النص',
      explanation:
        'لم يُستخرج استنتاج واضح يربط الدليل بادعاء. تظل مقارنة النقل مستقلة؛ هذه النتيجة لا تعني صحة النص أو خطأه.',
    };
  if (report.interpretation.status === 'provisional')
    return {
      label: 'تقييم دلالي أولي غير مكتمل',
      explanation:
        'بدأ تقييم آلي أولي، ولم تتوفر نتائج مكتملة لعرضها. تبقى مقارنة النقل متاحة بصورة مستقلة.',
    };
  return {
    label: 'لم يُجرَ تقييم الاستدلال في هذا التقرير',
    explanation:
      'لم تُشغّل مرحلة مقارنة الادعاء بالدليل في هذا التقرير. المعروض هنا هو مقارنة النقل بالمصادر، وليس نتيجة عن كفاية الدليل.',
  };
}
