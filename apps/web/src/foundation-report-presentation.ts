import type {
  FoundationReport,
  LiteralFinding,
  SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { assessClaimApplicability } from '../../../packages/contracts/src/claim-applicability.js';

const surahNames: Record<number, string> = { 2: 'البقرة', 39: 'الزمر' };

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
    const storedName =
      source.provenance.surah_name ??
      source.provenance.surah_name_original ??
      anchor?.provenance.surah_name ??
      anchor?.provenance.surah_name_original;
    const name =
      typeof storedName === 'string' && /^[\p{Script=Arabic}\s]+$/u.test(storedName)
        ? storedName.replace(/^سورة\s+/u, '')
        : surahNames[location.surah];
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
    label: labels[fidelity],
    explanation: explanations[fidelity],
    extent: extentLabels[extent],
  };
}

export function interpretationPresentation(report: FoundationReport) {
  const applicability =
    report.interpretation.applicability ?? assessClaimApplicability(report.intake);
  if (
    report.interpretation.status === 'not_applicable' ||
    applicability.status === 'not_applicable'
  )
    return {
      label: 'لا يوجد استنتاج قابل للتقييم في هذا النص',
      explanation:
        'يعرض النص سؤالًا أو نقولًا دون استنتاج يربط الدليل بادعاء. تُعرض مقارنة النقل مستقلة عن الإجابة عن السؤال.',
    };
  return {
    label: 'لم يُقيّم الاستدلال',
    explanation:
      'لم تُجرَ مقارنة دلالية بين الادعاء والدليل في هذا التقرير. نتائج مطابقة النقل وحدها لا تثبت كفاية الاستدلال.',
  };
}
