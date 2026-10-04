import type {
  FoundationReport,
  IntakeSegment,
  LiteralFinding,
  SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { assessClaimApplicability } from '../../../packages/contracts/src/claim-applicability.js';

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
  return source.sourceRole === 'tafsir_footnote' ? 'حاشية تفسير' : 'تفسير';
}

function humanWork(source: SourceEvidence): string {
  if (!/IslamicEval|research corpus|book\s*=|internal_id|https?:|sha256|mcp/iu.test(source.work))
    return source.work;
  return source.sourceRole === 'hadith_matn' ? 'مصدر حديثي' : 'مرجع تفسير';
}

export function sourceCitation(source: SourceEvidence, evidence: SourceEvidence[] = []): string {
  const location = numericReference(source.reference);
  if (location && source.sourceRole !== 'hadith_matn') {
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
    finding.matchedEnd > finding.matchedStart &&
    finding.matchedEnd <= source.originalText.length;
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

export function sourceComparisonText(source: SourceEvidence, finding?: LiteralFinding) {
  if (
    finding?.evidenceKey === source.snapshotKey &&
    finding.matchedStart !== null &&
    finding.matchedEnd !== null &&
    finding.matchedEnd > finding.matchedStart &&
    finding.matchedEnd <= source.originalText.length
  ) {
    return {
      label: 'موضع النقل في المصدر',
      text: source.originalText.slice(finding.matchedStart, finding.matchedEnd),
    };
  }
  if (source.originalText.length <= 600)
    return { label: 'النص المرجعي', text: source.originalText };
  return {
    label: 'بداية النص المرجعي؛ موضع المقتطف غير محدد',
    text: `${source.originalText.slice(0, 400)}…`,
  };
}

export function interpretationPresentation(report: FoundationReport) {
  if (report.semanticAssessment?.assessments.length)
    return {
      label: 'تقييم دلالي أولي',
      explanation:
        'قارن التقييم الآلي الادعاءات بالمصادر المعروضة. الربط والنتائج مقترحات للمراجعة، ولا تمثل اعتمادًا علميًا أو شرعيًا.',
    };
  if (report.interpretation.status === 'unavailable')
    return {
      label: 'تعذر استكمال التقييم الدلالي',
      explanation:
        'لم تتوفر نتيجة دلالية يمكن عرضها. نتائج النقل والمصادر محفوظة، ويمكن إعادة التحليل لاحقًا.',
    };
  const applicability =
    report.interpretation.applicability ?? assessClaimApplicability(report.intake);
  if (
    report.interpretation.status === 'not_applicable' ||
    applicability.status === 'not_applicable'
  )
    return {
      label: 'لا يوجد استنتاج قابل للتقييم في هذا النص',
      explanation:
        'لم يُستخرج استنتاج واضح يربط الدليل بادعاء. تظل مقارنة النقل مستقلة؛ هذه النتيجة لا تعني صحة النص أو خطأه.',
    };
  return {
    label: 'لم يُقيّم الاستدلال',
    explanation:
      'لم تُجرَ مقارنة دلالية بين الادعاء والدليل في هذا التقرير. نتائج مطابقة النقل وحدها لا تثبت كفاية الاستدلال.',
  };
}
