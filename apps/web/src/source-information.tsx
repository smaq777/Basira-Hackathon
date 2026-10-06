import { ArrowSquareOut } from '@phosphor-icons/react/ArrowSquareOut';
import { BookOpen } from '@phosphor-icons/react/BookOpen';
import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { Globe } from '@phosphor-icons/react/Globe';
import { Info } from '@phosphor-icons/react/Info';
import sourcePolicy from '../../../config/source-policy.json' with { type: 'json' };

// Destinations come from retained source-edition provenance; the Tafsir project
// is documented in docs/api/PROVIDERS.md, rather than linking readers to an MCP endpoint.
const hadithDatasetUrl =
  'https://github.com/Watheq9/IslamicEval2026/blob/8ca8abb8a0f0d96a5ab07d48108e35b7e02d236e/Corpora/six_hadith_books.json';
const corpusReferences = [
  {
    name: 'القرآن الكريم',
    group: 'quran',
    url: 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=xml&marks=true&sajdah=true&tatweel=true&agree=true',
    origin: 'نسخة النص المستخدمة من تنزيل',
    detail: 'النص العثماني من مشروع تنزيل (Tanzil)، الإصدار 1.1.',
  },
  {
    name: 'التفسير الميسر',
    group: 'quran',
    url: 'https://qurancomplex.gov.sa/quran-dev/',
    origin: 'موقع الناشر',
    detail: 'مجمع الملك فهد لطباعة المصحف الشريف؛ نصوص من الناشر وخادم التفسير.',
  },
  {
    name: 'تيسير الكريم الرحمن',
    group: 'quran',
    url: 'https://github.com/tafsircenter/tafsir-mcp',
    origin: 'المشروع المستخدم لجلب التفسير',
    detail: 'تفسير الشيخ عبد الرحمن بن ناصر السعدي؛ مقتطفات عبر خادم التفسير.',
  },
  {
    name: 'صحيح البخاري',
    group: 'hadith',
    url: hadithDatasetUrl,
    origin: 'مجموعة البيانات المستخدمة — نسخة مثبتة',
    detail: 'مقتطفات موثقة من كتابي الزكاة والتوحيد.',
  },
  {
    name: 'صحيح مسلم',
    group: 'hadith',
    url: hadithDatasetUrl,
    origin: 'مجموعة البيانات المستخدمة — نسخة مثبتة',
    detail: 'مقتطف موثق من كتاب الإيمان.',
  },
  {
    name: 'سنن أبي داود',
    group: 'hadith',
    url: hadithDatasetUrl,
    origin: 'مجموعة البيانات المستخدمة — نسخة مثبتة',
    detail: 'مقتطف موثق من كتاب الجنائز، باب التلقين.',
  },
  {
    name: 'محاسن التوحيد وارتباطها بأركان الإيمان',
    group: 'aqeedah',
    url: 'https://shamela.ws/book/30015/195',
    origin: 'صفحة المقتطف في المكتبة الشاملة',
    detail: 'محمد بن خليفة التميمي؛ مقتطف من المكتبة الشاملة.',
  },
];

const webResourceLabels: Record<string, { name: string; detail: string }> = {
  dawa: { name: 'المستودع الدعوي', detail: 'كتب ومواد دعوية، ومنها بينات.' },
  'islamic-content': { name: 'الجمهرة', detail: 'موضوعات ومصطلحات المحتوى الإسلامي.' },
  quranpedia: {
    name: 'موسوعة القرآن الكريم (Quranpedia)',
    detail: 'مراجع وصفحات حول القرآن وعلومه.',
  },
  dorar: {
    name: 'الدرر السنية',
    detail: 'التفسير والحديث والعقيدة والفقه والتاريخ، ضمن المسارات المسموح بها.',
  },
  shamela: { name: 'المكتبة الشاملة', detail: 'مقتطفات من كتب محددة مع ذكر الكتاب والمرجع.' },
  binbaz: {
    name: 'الموقع الرسمي للشيخ عبد العزيز بن باز',
    detail: 'الفتاوى والدروس الصوتية وشروحها.',
  },
};

export function selectedWebResources(
  policy: { sources: typeof sourcePolicy.sources; deniedDomains: string[] } = sourcePolicy,
) {
  return policy.sources.filter(
    (source) => source.enabled && !policy.deniedDomains.includes(source.domain),
  );
}

const referenceGroups = [
  { id: 'quran', name: 'القرآن والتفسير' },
  { id: 'hadith', name: 'الحديث' },
  { id: 'aqeedah', name: 'العقيدة' },
];

function navigateToSourceSection(id: string) {
  const section = document.getElementById(id);
  section?.scrollIntoView({ block: 'start' });
  section?.focus({ preventScroll: true });
}

export function SourceInformation() {
  const webResources = selectedWebResources();
  return (
    <section className="source-information" aria-labelledby="source-page-title">
      <header className="source-page-header">
        <p className="eyebrow">مصادر بصيرة</p>
        <h1 id="source-page-title">مراجع المشروع ومصادر البحث</h1>
        <p>
          تعرّف على المراجع التي نستند إليها، ومواقع البحث المختارة، وكيف نعرض الدليل في تقريرك.
        </p>
      </header>
      <div className="source-page-layout">
        <nav className="source-navigation" aria-label="أقسام المصادر">
          <p>في هذه الصفحة</p>
          <button type="button" onClick={() => navigateToSourceSection('source-corpus')}>
            <BookOpen size={20} aria-hidden="true" />
            <span>المراجع النصية</span>
            <small>{corpusReferences.length}</small>
          </button>
          <button type="button" onClick={() => navigateToSourceSection('source-web')}>
            <Globe size={20} aria-hidden="true" />
            <span>مواقع البحث</span>
            <small>{webResources.length}</small>
          </button>
          <button type="button" onClick={() => navigateToSourceSection('source-method')}>
            <Info size={20} aria-hidden="true" />
            <span>كيف نستخدم المصادر؟</span>
          </button>
        </nav>
        <div className="source-page-content">
          <aside className="source-scope-note" aria-label="حدود استخدام المصادر">
            <Info size={22} aria-hidden="true" />
            <p>
              هذه المراجع ومواقع البحث مختارة لاستخدام بصيرة. اعتماد جهة للاستخدام لا يعني اعتماد كل
              صفحة أو مقتطف فيها؛ يبيّن التقرير مرجع الدليل المستخدم وحالة اعتماده وحدود الاستدلال
              به.
            </p>
          </aside>
          <section
            className="source-section"
            id="source-corpus"
            tabIndex={-1}
            aria-labelledby="source-corpus-title"
          >
            <header className="source-section-heading">
              <span className="source-section-icon">
                <BookOpen size={23} aria-hidden="true" />
              </span>
              <div>
                <h2 id="source-corpus-title">المراجع النصية</h2>
                <p>التغطية بمقتطفات محددة، ولا تمثل إتاحة جميع هذه الكتب كاملة.</p>
              </div>
            </header>
            {referenceGroups.map((group) => (
              <div className="source-reference-group" key={group.id}>
                <h3>{group.name}</h3>
                <ul className="source-catalogue source-reference-grid" aria-label={group.name}>
                  {corpusReferences
                    .filter((reference) => reference.group === group.id)
                    .map((reference) => (
                      <li key={reference.name}>
                        <h4>
                          <a href={reference.url} target="_blank" rel="noreferrer">
                            {reference.name}
                            <ArrowSquareOut size={18} aria-hidden="true" />
                            <span className="sr-only"> (يفتح في نافذة جديدة)</span>
                          </a>
                        </h4>
                        <p>{reference.detail}</p>
                        <span className="source-reference-origin">{reference.origin}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
          <section
            className="source-section"
            id="source-web"
            tabIndex={-1}
            aria-labelledby="source-web-title"
          >
            <header className="source-section-heading">
              <span className="source-section-icon">
                <Globe size={23} aria-hidden="true" />
              </span>
              <div>
                <h2 id="source-web-title">مواقع البحث المختارة</h2>
                <p>
                  موارد تساعدنا على الوصول إلى النصوص ومراجعها. لا تكفي نتيجة البحث لإثبات النص أو
                  الحكم.
                </p>
              </div>
            </header>
            <ul className="source-catalogue source-web-grid" aria-label="مواقع البحث المختارة">
              {webResources.map((source) => (
                <li key={source.id}>
                  <span className="source-selection-badge">
                    {source.basis === 'hackathon_listed'
                      ? 'من قائمة مراجع التحدي'
                      : 'مختار للمشروع'}
                  </span>
                  <h3>
                    <a href={`https://${source.domain}/`} target="_blank" rel="noreferrer">
                      {webResourceLabels[source.id]?.name ?? source.domain}
                      <ArrowSquareOut size={18} aria-hidden="true" />
                      <span className="sr-only"> (يفتح في نافذة جديدة)</span>
                    </a>
                  </h3>
                  <p>{webResourceLabels[source.id]?.detail}</p>
                  <bdi className="source-domain">{source.domain}</bdi>
                </li>
              ))}
            </ul>
          </section>
          <section
            className="source-section source-methodology"
            id="source-method"
            tabIndex={-1}
            aria-labelledby="source-method-title"
          >
            <header className="source-section-heading">
              <span className="source-section-icon">
                <Info size={23} aria-hidden="true" />
              </span>
              <div>
                <h2 id="source-method-title">كيف نعرض المصادر في النتيجة؟</h2>
                <p>من النص الأصلي إلى الدليل، مع توضيح حدود المقارنة والمراجعة.</p>
              </div>
            </header>

            <p>
              بصيرة تقارن النقل وتراجع حدود الاستدلال في النص الذي أرسلته. لا نعرض مصدرًا بوصفه
              دليلًا لمجرد تشابه موضوعه مع النص.
            </p>
            <div className="source-explanations">
              <details className="source-explanation">
                <summary>
                  <h3>النص الأصلي والمصدر</h3>
                  <CaretDown size={18} aria-hidden="true" />
                </summary>
                <div className="source-explanation-body">
                  <p>
                    نحتفظ بالنص كما ورد، منفصلًا عن نسخة البحث التي تتجاهل فروق الرسم والضبط. تعرض
                    المقارنة العبارة المرسلة، والنص المرجعي، والمرجع المحدد، وحدود المقتطف
                    والاختلافات اللفظية إن أمكن.
                  </p>
                  <p>
                    وجود مقتطف صحيح لا يثبت الاستنتاج الذي بناه الكاتب عليه. لهذا نعرض مطابقة النقل
                    وتقييم الاستدلال بصورة مستقلة.
                  </p>
                </div>
              </details>
              <details className="source-explanation">
                <summary>
                  <h3>خادم التفسير MCP</h3>
                  <CaretDown size={18} aria-hidden="true" />
                </summary>
                <div className="source-explanation-body">
                  <p>
                    نستخدم تكاملًا مع مشروع Tafsir MCP لجلب نصوص القرآن والتفسير وسياقها وفق الوظائف
                    الموصولة بالتطبيق. MCP هو بروتوكول يتيح للتطبيق طلب أدوات ومصادر من خادم، وليس
                    مصدرًا علميًا بحد ذاته.
                  </p>
                  <p>
                    قد تأتي نتيجة البحث من نسخة مصدر محفوظة في قاعدة البيانات، وليست بالضرورة
                    استدعاءً مباشرًا للخادم في كل تحليل. نبين في التقرير المرجع وحالة المصدر، ونحافظ
                    على النص الأصلي وبصمته.
                  </p>
                  <p>
                    في المقتطف القرآني القصير غير الموثق برقم آية، قد نستخدم أداة search_quran_text
                    لاكتشاف المرجع فقط، ثم نجلب النص القرآني الأصلي ونقارنه بالمقتطف كاملًا. لا نعرض
                    مقتطف البحث أو درجة التشابه بوصفهما دليلًا؛ إذا لم تتحقق مطابقة لفظية قريبة
                    وفريدة نترك النتيجة غير محسومة.
                  </p>
                  <a
                    href="https://github.com/tafsircenter/tafsir-mcp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    المشروع المرجعي لخادم التفسير
                  </a>
                </div>
              </details>
              <details className="source-explanation">
                <summary>
                  <h3>البحث والذكاء الاصطناعي</h3>
                  <CaretDown size={18} aria-hidden="true" />
                </summary>
                <div className="source-explanation-body">
                  <p>
                    يُسترجع الدليل من مجموعة المصادر المهيأة، بالمرجع المحدد أو البحث اللفظي، وقد
                    يُستخدم البحث الدلالي حيث يتوفر. تستخدم طبقة النماذج OpenRouter لاستخراج عبارات
                    الكاتب وتقييم صلتها بالدليل. شرح النموذج ليس نص المصدر ولا اعتمادًا علميًا.
                  </p>
                  <p>
                    البحث في الحديث مقيد بما يوجد في المصادر الموصولة. لا نزعم اتصالًا حيًا شاملًا
                    بجميع قواعد الحديث أو التحقق من درجة الحديث آليًا. عند غياب دليل مناسب نحجب
                    المقارنة غير المحسومة ونتيح المراجعة البشرية.
                  </p>
                </div>
              </details>
              <details className="source-explanation">
                <summary>
                  <h3>المراجعة البشرية وتحديث المعرفة</h3>
                  <CaretDown size={18} aria-hidden="true" />
                </summary>
                <div className="source-explanation-body">
                  <p>
                    التقرير الآلي أولي. يمكن للمراجع تصحيح السجلات، وتحديد الأدلة، وكتابة النص
                    المقترح ونصيحته. تحفظ المراجعة في نسخة مستقلة ويعرض للمستخدم ما تغير.
                  </p>
                  <p>
                    نشر ملاحظة للمستخدم لا يحولها تلقائيًا إلى مصدر. إضافة مصدر للبحث تحتاج اعتمادًا
                    منفصلًا، ونصًا أصليًا، ومرجعًا وطبعة وحقوق استخدام؛ ولا تُستبدل النصوص القرآنية
                    الأصلية بكتابة المستخدم أو المراجع.
                  </p>
                </div>
              </details>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
