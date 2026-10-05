const SURAH_NAMES =
  'الفاتحة,البقرة,آل عمران,النساء,المائدة,الأنعام,الأعراف,الأنفال,التوبة,يونس,هود,يوسف,الرعد,إبراهيم,الحجر,النحل,الإسراء,الكهف,مريم,طه,الأنبياء,الحج,المؤمنون,النور,الفرقان,الشعراء,النمل,القصص,العنكبوت,الروم,لقمان,السجدة,الأحزاب,سبأ,فاطر,يس,الصافات,ص,الزمر,غافر,فصلت,الشورى,الزخرف,الدخان,الجاثية,الأحقاف,محمد,الفتح,الحجرات,ق,الذاريات,الطور,النجم,القمر,الرحمن,الواقعة,الحديد,المجادلة,الحشر,الممتحنة,الصف,الجمعة,المنافقون,التغابن,الطلاق,التحريم,الملك,القلم,الحاقة,المعارج,نوح,الجن,المزمل,المدثر,القيامة,الإنسان,المرسلات,النبأ,النازعات,عبس,التكوير,الانفطار,المطففين,الانشقاق,البروج,الطارق,الأعلى,الغاشية,الفجر,البلد,الشمس,الليل,الضحى,الشرح,التين,العلق,القدر,البينة,الزلزلة,العاديات,القارعة,التكاثر,العصر,الهمزة,الفيل,قريش,الماعون,الكوثر,الكافرون,النصر,المسد,الإخلاص,الفلق,الناس'.split(
    ',',
  );

const arabicDigits = (value: string) =>
  value.replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const normalizeName = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670ـ]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .trim();

const SURAH_BY_NAME = new Map(SURAH_NAMES.map((name, index) => [normalizeName(name), index + 1]));

export type QuranLocator = {
  reference: string;
  startOffset: number;
  endOffset: number;
};

/** Extract only explicit Quran locators; ordinary numbers never become sources. */
export function extractQuranLocators(text: string): QuranLocator[] {
  const locators: QuranLocator[] = [];
  const seen = new Set<string>();
  const add = (reference: string, startOffset: number, endOffset: number) => {
    const [surah, ayah] = reference.split(':').map(Number);
    if (!surah || surah > 114 || !ayah || ayah > 286) return;
    const identity = `${reference}:${startOffset}:${endOffset}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    locators.push({ reference, startOffset, endOffset });
  };

  for (const match of text.matchAll(
    /(?:\[|\(|سورة\s+)?([\p{Script=Arabic}\s]{1,35}?)\s*[:：،]\s*([٠-٩0-9]{1,3})\s*[:：]\s*([٠-٩0-9]{1,3})(?:\]|\))?/gu,
  )) {
    const surah = SURAH_BY_NAME.get(normalizeName(match[1]!));
    if (surah === Number(arabicDigits(match[2]!)))
      add(
        `${surah}:${Number(arabicDigits(match[3]!))}`,
        match.index,
        match.index + match[0].length,
      );
  }
  for (const match of text.matchAll(
    /(?:\[|\(|سورة\s+)?([\p{Script=Arabic}\s]{1,35}?)\s*[:：،]\s*(?:الآية\s*)?([٠-٩0-9]{1,3})(?![٠-٩0-9]|\s*[:：])(?:\]|\))?/gu,
  )) {
    const surah = SURAH_BY_NAME.get(normalizeName(match[1]!));
    if (surah)
      add(
        `${surah}:${Number(arabicDigits(match[2]!))}`,
        match.index,
        match.index + match[0].length,
      );
  }
  for (const match of text.matchAll(
    /(?:\[|\(|(?:سورة|الآية|آية)\s+)([٠-٩0-9]{1,3})\s*[:：]\s*([٠-٩0-9]{1,3})(?:\]|\))?/gu,
  ))
    add(
      `${Number(arabicDigits(match[1]!))}:${Number(arabicDigits(match[2]!))}`,
      match.index,
      match.index + match[0].length,
    );

  return locators.sort(
    (a, b) => a.startOffset - b.startOffset || a.reference.localeCompare(b.reference),
  );
}

export function extractQuranReferences(text: string): string[] {
  return [...new Set(extractQuranLocators(text).map((locator) => locator.reference))];
}
