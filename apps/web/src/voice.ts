export type VoiceTone = 'result' | 'unresolved';

export const VOICE_GREETING =
  'السلام عليكم، أنا بصيرة. أستطيع شرح نتيجة هذه المراجعة والأدلة الظاهرة فيها فقط. كيف أساعدك؟';

const RESULT_LIMITATION =
  'الآية تذكر أن إخفاء الصدقة خير، لكنها لا تثبت أن الإخفاء واجب في جميع الحالات أو أن الإعلان ممنوع. لذلك اقترحنا صياغة أضيق مرتبطة بحدود الدليل الظاهر.';

const UNRESOLVED_LIMITATION =
  'التقدير الأول وجد أن النص لا يثبت وجوب إخفاء الصدقة في جميع الحالات، ولم يجد التقدير الثاني سياقًا تفسيريًا معتمدًا في هذه النسخة. لذلك توقفت المراجعة دون حكم نهائي.';

export function answerReviewQuestion(question: string, tone: VoiceTone) {
  const normalized = question.trim().toLocaleLowerCase('ar');

  if (!normalized) return '';

  if (/المصدر|الدليل|الآية|البقرة/.test(normalized)) {
    return 'المصدر الظاهر في هذه المراجعة هو سورة البقرة، الآية ٢٧١، من نسخة Tanzil Uthmani v1.1. لا أستند هنا إلى مصدر آخر.';
  }

  if (/لماذا|ليش|السبب|غير محسوم|تقييد|حدود|النتيجة/.test(normalized)) {
    return tone === 'unresolved' ? UNRESOLVED_LIMITATION : RESULT_LIMITATION;
  }

  if (/التعديل|الصياغة|المقترح|أغير|أعدّل/.test(normalized)) {
    return 'الصياغة المقترحة تقول إن الآية تذكر أن إخفاء الصدقة خير، لكنها لا تدل بمفردها على وجوب إخفاء كل صدقة أو منع إعلانها. راجعها قبل الاعتماد.';
  }

  return 'أستطيع فقط شرح نتيجة هذه المراجعة، مصدرها، وحدودها، والصياغة المقترحة. لا أجيب عن فتوى أو سؤال عام خارج ملف المراجعة.';
}
