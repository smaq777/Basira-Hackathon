import type { SourceEvidence } from './foundation.js';
import { isSafeDraftText } from './draft-text.js';
const surahs =
  'الفاتحة,البقرة,آل عمران,النساء,المائدة,الأنعام,الأعراف,الأنفال,التوبة,يونس,هود,يوسف,الرعد,إبراهيم,الحجر,النحل,الإسراء,الكهف,مريم,طه,الأنبياء,الحج,المؤمنون,النور,الفرقان,الشعراء,النمل,القصص,العنكبوت,الروم,لقمان,السجدة,الأحزاب,سبأ,فاطر,يس,الصافات,ص,الزمر,غافر,فصلت,الشورى,الزخرف,الدخان,الجاثية,الأحقاف,محمد,الفتح,الحجرات,ق,الذاريات,الطور,النجم,القمر,الرحمن,الواقعة,الحديد,المجادلة,الحشر,الممتحنة,الصف,الجمعة,المنافقون,التغابن,الطلاق,التحريم,الملك,القلم,الحاقة,المعارج,نوح,الجن,المزمل,المدثر,القيامة,الإنسان,المرسلات,النبأ,النازعات,عبس,التكوير,الانفطار,المطففين,الانشقاق,البروج,الطارق,الأعلى,الغاشية,الفجر,البلد,الشمس,الليل,الضحى,الشرح,التين,العلق,القدر,البينة,الزلزلة,العاديات,القارعة,التكاثر,العصر,الهمزة,الفيل,قريش,الماعون,الكوثر,الكافرون,النصر,المسد,الإخلاص,الفلق,الناس'.split(
    ',',
  );
const opaque = /book\s*=|internal_id|https?:|sha256|mcp|IslamicEval|research corpus/iu;
const clean = (text: string) =>
  isSafeDraftText(text)
    ? text
        .replace(/[\[\]\r\n]/gu, ' ')
        .trim()
        .slice(0, 500)
    : '';
export function readableSourceCitation(source: SourceEvidence) {
  const role =
    source.sourceRole === 'quran_text'
      ? 'القرآن الكريم'
      : source.sourceRole === 'hadith_matn'
        ? 'حديث نبوي'
        : source.sourceRole === 'book_excerpt'
          ? 'كتاب'
          : source.sourceRole === 'scholar_explanation'
            ? 'شرح علمي'
            : 'تفسير';
  const work = opaque.test(source.work) ? role : clean(source.work) || role;
  const numeric = /^(\d{1,3}):(\d{1,3})$/u.exec(source.reference.trim());
  if (
    numeric &&
    ['quran_text', 'tafsir_commentary', 'tafsir_footnote'].includes(source.sourceRole)
  ) {
    const surah = Number(numeric[1]);
    const ayah = Number(numeric[2]);
    if (surahs[surah - 1] && ayah > 0 && ayah <= 286)
      return `${source.sourceRole === 'quran_text' ? role : work} — سورة ${surahs[surah - 1]}، الآية ${ayah}`;
  }
  const locator = opaque.test(source.reference)
    ? 'موضع تفصيلي غير متاح'
    : clean(source.reference) || 'موضع غير محدد';
  return locator === work ? work : `${work} — ${locator}`;
}
