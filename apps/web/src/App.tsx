import type { ComponentType, FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive } from '@phosphor-icons/react/Archive';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { ArrowUp } from '@phosphor-icons/react/ArrowUp';
import { Bell } from '@phosphor-icons/react/Bell';
import { BookOpen } from '@phosphor-icons/react/BookOpen';
import { CalendarBlank } from '@phosphor-icons/react/CalendarBlank';
import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { CaretLeft } from '@phosphor-icons/react/CaretLeft';
import { CaretUp } from '@phosphor-icons/react/CaretUp';
import { ChartBar } from '@phosphor-icons/react/ChartBar';
import { Check } from '@phosphor-icons/react/Check';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { CircleNotch } from '@phosphor-icons/react/CircleNotch';
import { ClipboardText } from '@phosphor-icons/react/ClipboardText';
import { Clock } from '@phosphor-icons/react/Clock';
import { Copy } from '@phosphor-icons/react/Copy';
import { Database } from '@phosphor-icons/react/Database';
import { DownloadSimple } from '@phosphor-icons/react/DownloadSimple';
import { Eye } from '@phosphor-icons/react/Eye';
import { FileText } from '@phosphor-icons/react/FileText';
import { Funnel } from '@phosphor-icons/react/Funnel';
import { GearSix } from '@phosphor-icons/react/GearSix';
import { House } from '@phosphor-icons/react/House';
import { Info } from '@phosphor-icons/react/Info';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { Lock } from '@phosphor-icons/react/Lock';
import { MagnifyingGlass } from '@phosphor-icons/react/MagnifyingGlass';
import { Microphone } from '@phosphor-icons/react/Microphone';
import { PaperPlaneTilt } from '@phosphor-icons/react/PaperPlaneTilt';
import { PencilSimple } from '@phosphor-icons/react/PencilSimple';
import { Quotes } from '@phosphor-icons/react/Quotes';
import { ShieldCheck } from '@phosphor-icons/react/ShieldCheck';
import { SignOut } from '@phosphor-icons/react/SignOut';
import { Sparkle } from '@phosphor-icons/react/Sparkle';
import { SquaresFour } from '@phosphor-icons/react/SquaresFour';
import { Tray } from '@phosphor-icons/react/Tray';
import { User } from '@phosphor-icons/react/User';
import { UsersThree } from '@phosphor-icons/react/UsersThree';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import { X } from '@phosphor-icons/react/X';
import {
  analysisErrorMessage,
  persistDraftForAnalysis,
  requestDraftPreflight,
  type DraftAnalysisReceipt,
  type PreflightAnnotation,
  type PreflightFinding,
  type PreflightResponse,
} from './api.js';
import { ReviewerAccessBoundary, ReviewerAuthUnavailable } from './reviewer-auth.js';
import { answerReviewQuestion, VOICE_GREETING, type VoiceTone } from './voice.js';

type PublicRoute = 'home' | 'analysis' | 'result' | 'unresolved' | 'ticket';
type ReviewerRoute = 'dashboard' | 'queue' | 'detail' | 'sources';
type Route = PublicRoute | `reviewer-${ReviewerRoute}`;

const SESSION_VOICE_ENABLED =
  import.meta.env.MODE === 'test' || import.meta.env.VITE_SESSION_VOICE_ENABLED === 'true';

const DEMO_TEXT =
  'قال تعالى: «وَإِن تُخْفُوهَا فَهُوَ خَيْرٌ لَكُمْ». وهذا يدل على أن إخفاء الصدقة هو الأفضل دائمًا، ولذلك يجب إخفاء كل صدقة ولا يجوز إعلانها.';

const PREFLIGHT_EXAMPLES = [
  { label: 'قرآن: حذف وتعميم', text: DEMO_TEXT },
  {
    label: 'قرآن: تطابق أولي',
    text: 'قال تعالى: «وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ» [البقرة: ٢٧١].',
  },
  {
    label: 'حديث: تطابق أولي',
    text: 'قال رسول الله ﷺ: «إنما الأعمال بالنيات» [صحيح البخاري: 1].',
  },
  {
    label: 'حديث: اختلاف في النص',
    text: 'قال رسول الله ﷺ: «إنما الأعمال بالنيات والأهداف» [صحيح البخاري: 1].',
  },
  {
    label: 'حديث: إسناد ومتن ومصدر',
    text: 'عن عمر بن الخطاب رضي الله عنه قال: قال رسول الله ﷺ: «إنما الأعمال بالنيات» صحيح البخاري: 1.',
  },
  {
    label: 'قول منسوب: دليل غير كافٍ',
    text: 'قال الإمام: «هذه العبارة مثال يحتاج إلى مصدر محدد قبل نشره».',
  },
];

const SAMPLE_CASES = [
  {
    id: 'BR-1042',
    title: 'إخفاء الصدقة في جميع الحالات',
    submitter: 'زائر',
    submittedAt: 'منذ 12 دقيقة',
    status: 'جديد',
    priority: 'متوسط',
  },
  {
    id: 'BR-1038',
    title: 'ادعاء اتفاق العلماء',
    submitter: 'محرر محتوى',
    submittedAt: 'منذ 41 دقيقة',
    status: 'قيد المراجعة',
    priority: 'مرتفع',
  },
  {
    id: 'BR-1029',
    title: 'نسبة اقتباس إلى سورة غير صحيحة',
    submitter: 'فريق تعليمي',
    submittedAt: 'أمس، 4:20 م',
    status: 'مكتمل',
    priority: 'منخفض',
  },
];

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const routeMap: Record<string, Route> = {
    '': 'home',
    home: 'home',
    analysis: 'analysis',
    result: 'result',
    unresolved: 'unresolved',
    ticket: 'ticket',
    'reviewer/dashboard': 'reviewer-dashboard',
    'reviewer/queue': 'reviewer-queue',
    'reviewer/detail': 'reviewer-detail',
    'reviewer/sources': 'reviewer-sources',
  };
  return routeMap[value] ?? 'home';
}

function pathFor(route: Route) {
  if (route.startsWith('reviewer-')) return `#/reviewer/${route.replace('reviewer-', '')}`;
  return `#/${route}`;
}

export function reloadSignedOutHome(location: Pick<Location, 'hash' | 'reload'> = window.location) {
  location.hash = '#/home';
  location.reload();
}

function useRoute() {
  const [location, setLocation] = useState(() => ({
    route: routeFromHash(),
    hash: window.location.hash,
  }));

  useEffect(() => {
    const update = () =>
      setLocation({
        route: routeFromHash(),
        hash: window.location.hash,
      });
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = pathFor(next);
    window.location.hash = hash;
    setLocation({ route: next, hash });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { route: location.route, navigate };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <button
      className={`brand ${compact ? 'brand--compact' : ''}`}
      onClick={() => (window.location.hash = '#/home')}
    >
      <img src="/brand/basirah-symbol.png" alt="" />
      <span>بصيرة</span>
    </button>
  );
}

function PublicHeader({ onReviewer }: { onReviewer: () => void }) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="public-header-wrap">
      <div className="public-header page-shell">
        <Brand />
        <button className="button button--outline reviewer-login" onClick={onReviewer}>
          <User size={21} />
          دخول المراجع
        </button>
      </div>
      <nav className="public-subnav" aria-label="التنقل الرئيسي">
        <div className="page-shell">
          <button type="button" onClick={() => scrollTo('review')}>
            مراجعة النص
          </button>
          <button type="button" onClick={() => scrollTo('how')}>
            كيف تعمل
          </button>
          <button type="button" onClick={() => scrollTo('faq')}>
            الأسئلة الشائعة
          </button>
          <button type="button" onClick={() => scrollTo('trust')}>
            عن التحدي
          </button>
        </div>
      </nav>
    </header>
  );
}

function BackHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="public-header page-shell compact-header">
      <Brand />
      <button className="button button--outline" onClick={onHome}>
        <ArrowLeft size={20} />
        مراجعة نص جديد
      </button>
    </header>
  );
}

function Toast({ message, tone = 'success' }: { message: string; tone?: 'success' | 'error' }) {
  return (
    <div className={`toast toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'success' ? <CheckCircle size={22} /> : <WarningCircle size={22} />}
      {message}
    </div>
  );
}

function HighlightedDraft({
  text,
  annotations,
  findings,
}: {
  text: string;
  annotations: PreflightAnnotation[];
  findings: PreflightFinding[];
}) {
  const validAnnotations = annotations.filter(
    (annotation) =>
      annotation.startOffset >= 0 &&
      annotation.endOffset <= text.length &&
      annotation.endOffset > annotation.startOffset,
  );
  const validFindings = findings.filter(
    (finding) =>
      finding.startOffset >= 0 &&
      finding.endOffset <= text.length &&
      finding.endOffset > finding.startOffset,
  );
  const boundaries = Array.from(
    new Set([
      0,
      text.length,
      ...validAnnotations.flatMap((annotation) => [annotation.startOffset, annotation.endOffset]),
      ...validFindings.flatMap((finding) => [finding.startOffset, finding.endOffset]),
    ]),
  ).sort((left, right) => left - right);
  const severityRank = { info: 1, neutral: 2, warning: 3 } as const;
  const nodes: ReactNode[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startOffset = boundaries[index] ?? 0;
    const endOffset = boundaries[index + 1] ?? text.length;
    const segment = text.slice(startOffset, endOffset);
    const annotation = validAnnotations
      .filter((item) => item.startOffset <= startOffset && item.endOffset >= endOffset)
      .sort(
        (left, right) => left.endOffset - left.startOffset - (right.endOffset - right.startOffset),
      )[0];
    const finding = validFindings
      .filter((item) => item.startOffset <= startOffset && item.endOffset >= endOffset)
      .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];

    if (!annotation && !finding) {
      nodes.push(segment);
      continue;
    }
    nodes.push(
      <mark
        key={`${startOffset}-${endOffset}`}
        className={[
          'semantic-highlight',
          `semantic-highlight--${annotation?.contentType ?? 'unknown'}`,
          finding ? `verification-highlight--${finding.severity}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {segment}
      </mark>,
    );
  }
  return <>{nodes}</>;
}

function HomeScreen({
  initialText,
  onReview,
  onReviewer,
}: {
  initialText: string;
  onReview: (text: string) => void;
  onReviewer: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<
    'idle' | 'checking' | 'ready' | 'unavailable'
  >('idle');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text.trim().length < 20) {
      setPreflight(null);
      setPreflightStatus('idle');
      return;
    }
    const controller = new AbortController();
    let active = true;
    setPreflightStatus('checking');
    const timer = window.setTimeout(() => {
      void requestDraftPreflight(text, controller.signal)
        .then((result) => {
          if (!active) return;
          setPreflight(result);
          setPreflightStatus('ready');
        })
        .catch((reason: unknown) => {
          if (!active) return;
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          setPreflight(null);
          setPreflightStatus('unavailable');
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const clean = text.trim();
    if (!clean) {
      setError('أضف النص الذي تريد مراجعته أولًا.');
      textAreaRef.current?.focus();
      return;
    }
    if (clean.length < 20) {
      setError('أضف عبارة أو منشورًا أوضح حتى نستطيع تحليل النقل والاستدلال.');
      return;
    }
    setError('');
    onReview(clean);
  };

  const pasteText = async () => {
    try {
      const clipboard = await navigator.clipboard.readText();
      if (!clipboard) throw new Error('empty');
      setText(clipboard.slice(0, 3000));
      setError('');
      setNotice('تم لصق النص.');
    } catch {
      setError('تعذر الوصول إلى الحافظة. الصق النص يدويًا داخل الحقل.');
    }
  };

  return (
    <div className="app-page app-page--home">
      <PublicHeader onReviewer={onReviewer} />
      <main className="home-main page-shell">
        {notice && <Toast message={notice} />}
        <section className="hero-section page-enter" id="review">
          <p className="eyebrow">مراجعة موثقة قبل النشر</p>
          <h1>ما النص الذي تريد مراجعته؟</h1>
          <p className="hero-copy">تحقق من دقة الاقتباس، ومن أن الدليل يدعم الاستنتاج قبل النشر.</p>

          <form className={`composer ${error ? 'composer--error' : ''}`} onSubmit={submit}>
            <label htmlFor="review-text" className="sr-only">
              النص المراد مراجعته
            </label>
            <div className="composer-editor">
              <div ref={highlightRef} className="composer-highlights" aria-hidden="true">
                <HighlightedDraft
                  text={text}
                  annotations={preflight?.annotations ?? []}
                  findings={preflight?.findings ?? []}
                />
              </div>
              <textarea
                id="review-text"
                ref={textAreaRef}
                value={text}
                maxLength={3000}
                rows={4}
                aria-describedby={preflightStatus !== 'ready' ? 'preflight-status' : undefined}
                onScroll={(event) => {
                  if (!highlightRef.current) return;
                  highlightRef.current.scrollTop = event.currentTarget.scrollTop;
                  highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }}
                onChange={(event) => {
                  setText(event.target.value);
                  setError('');
                }}
                placeholder="ألصق منشورك أو اكتب العبارة التي تريد التحقق منها…"
              />
            </div>
            {preflightStatus === 'ready' && preflight && preflight.annotations.length > 0 && (
              <div className="annotation-guide">
                <div className="annotation-legend" aria-label="دليل ألوان تصنيف أجزاء النص">
                  {Array.from(
                    new Map(
                      preflight.annotations.map((annotation) => [
                        annotation.contentType,
                        {
                          type: annotation.contentType,
                          label: annotation.contentTypeLabel,
                        },
                      ]),
                    ).values(),
                  ).map((item) => (
                    <span
                      key={item.type}
                      className={`annotation-chip annotation-chip--${item.type}`}
                    >
                      <span aria-hidden="true" />
                      {item.label}
                    </span>
                  ))}
                </div>
                <p>
                  اللون يصف نوع الجزء، والخط السفلي يوضح حالة الفحص. المصدر المذكور هو إحالة كتبها
                  المستخدم، وليس مصدرًا معتمدًا تلقائيًا.
                </p>
                <div className="verification-legend" aria-label="دليل حالة الفحص">
                  <span className="verification-key verification-key--info">
                    <CheckCircle size={15} /> تطابق أولي
                  </span>
                  <span className="verification-key verification-key--neutral">
                    <Info size={15} /> غير محسوم
                  </span>
                  <span className="verification-key verification-key--warning">
                    <WarningCircle size={15} /> يحتاج مراجعة
                  </span>
                </div>
              </div>
            )}
            {preflightStatus !== 'ready' && (
              <div
                id="preflight-status"
                className="preflight-status"
                role="status"
                aria-live="polite"
              >
                <span
                  className={`preflight-dot preflight-dot--${preflightStatus}`}
                  aria-hidden="true"
                />
                {preflightStatus === 'idle' && 'الصق نصًا من 20 حرفًا لبدء الرصد الأولي.'}
                {preflightStatus === 'checking' &&
                  'نصنّف العبارات ونبحث في المرجع المحلي التجريبي…'}
                {preflightStatus === 'unavailable' &&
                  'تعذر الرصد الأولي الآن. يمكنك الاستمرار وبدء المراجعة الكاملة.'}
              </div>
            )}
            <div className="composer-actions">
              <button type="button" className="button button--ghost" onClick={pasteText}>
                <ClipboardText size={21} />
                لصق نص
              </button>
              <span className="counter" dir="ltr">
                {text.length} / 3000
              </span>
              <button className="composer-submit" type="submit" aria-label="ابدأ المراجعة">
                <span>ابدأ المراجعة</span>
                <ArrowUp size={24} weight="bold" />
              </button>
            </div>
          </form>
          <div className="composer-meta">
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setText(DEMO_TEXT);
                setError('');
                setNotice('تم تحميل مثال توضيحي.');
              }}
            >
              جرّب مثالًا <ArrowLeft size={18} />
            </button>
            <span>
              <Lock size={17} /> يمكنك البدء كضيف، وتنتهي صلاحية الوصول للمسودة بعد 24 ساعة.
            </span>
          </div>
          <details className="preflight-examples">
            <summary>أمثلة لاختبار التصنيف والرصد المحلي</summary>
            <div>
              {PREFLIGHT_EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => {
                    setText(example.text);
                    setError('');
                    setNotice(`تم تحميل مثال: ${example.label}`);
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </details>
          {error && (
            <p className="field-error" role="alert">
              <WarningCircle size={18} /> {error}
            </p>
          )}
        </section>

        <div className="insight-marquee" aria-label="أهم ما تقدمه بصيرة">
          <div>
            <span>دقة الاقتباس</span>
            <span>كفاية الاستدلال</span>
            <span>مصدر قابل للتتبع</span>
            <span>صياغة تحتاج مراجعتك</span>
            <span aria-hidden="true">دقة الاقتباس</span>
            <span aria-hidden="true">كفاية الاستدلال</span>
            <span aria-hidden="true">مصدر قابل للتتبع</span>
            <span aria-hidden="true">صياغة تحتاج مراجعتك</span>
          </div>
        </div>

        <section className="section-block" id="how" aria-labelledby="benefits-heading">
          <div className="section-intro">
            <p className="eyebrow">لماذا بصيرة؟</p>
            <h2 id="benefits-heading">مراجعة تشرح لك ما وجدته، ولا تخفي حدودها</h2>
            <p>ست إشارات مركزة تساعد الكاتب والمراجع على اتخاذ قرار واعٍ قبل النشر.</p>
          </div>
          <div className="capabilities" aria-label="ما الذي تراجعه بصيرة">
            <article>
              <span className="icon-disc">
                <Quotes size={30} />
              </span>
              <h2>دقة الاقتباس</h2>
              <p>مطابقة النص ونسبته</p>
            </article>
            <article>
              <span className="icon-disc">
                <FileText size={30} />
              </span>
              <h2>دعم الاستنتاج</h2>
              <p>هل يدعم الدليل النتيجة؟</p>
            </article>
            <article>
              <span className="icon-disc">
                <BookOpen size={30} />
              </span>
              <h2>مصادر قابلة للتتبع</h2>
              <p>عرض المرجع بوضوح</p>
            </article>
            <article>
              <span className="icon-disc">
                <Sparkle size={30} />
              </span>
              <h2>رصد أولي مباشر</h2>
              <p>تحديد مواضع تحتاج انتباهك</p>
            </article>
            <article>
              <span className="icon-disc">
                <PencilSimple size={30} />
              </span>
              <h2>صياغة قابلة للتحرير</h2>
              <p>اقتراح لا يُعتمد تلقائيًا</p>
            </article>
            <article>
              <span className="icon-disc">
                <UsersThree size={30} />
              </span>
              <h2>مراجعة بشرية عند الحاجة</h2>
              <p>تصعيد اختياري عندما لا تكفي النتيجة</p>
            </article>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="section-intro">
            <p className="eyebrow">الأسئلة الشائعة</p>
            <h2>تعرّف على بصيرة</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>ماذا تفعل بصيرة؟</summary>
              <p>
                تراجع دقة النقل، وتفحص ما إذا كان الدليل يدعم الاستنتاج، ثم تعرض المصدر والنتيجة
                وحدودها بوضوح قبل النشر.
              </p>
            </details>
            <details>
              <summary>ما الذي لا تفعله بصيرة؟</summary>
              <p>
                لا تصدر فتوى أو حكمًا شرعيًا، ولا تعتمد النص أو الصياغة المقترحة تلقائيًا، ولا
                تستبدل قرار المختص أو المراجع البشري.
              </p>
            </details>
            <details>
              <summary>ما المصادر التي تعتمد عليها بصيرة؟</summary>
              <p>
                تستخدم بصيرة المصادر الأصيلة والموثوقة المعتمدة فقط، وتعرض المرجع المستخدم وحدود ما
                يدعمه بدل تقديم نتيجة بلا مصدر.
              </p>
            </details>
            <details>
              <summary>ماذا يحدث عندما لا تكون النتيجة مؤكدة؟</summary>
              <p>
                توضّح بصيرة موضع عدم اليقين، وتمنحك خيار إرسال الحالة إلى مراجع بشري بدل عرض نتيجة
                قاطعة غير مدعومة.
              </p>
            </details>
            <details>
              <summary>كيف تعمل المراجعة البشرية؟</summary>
              <p>
                يراجع المختص النص والسياق والمصدر، ثم يسجل نتيجة المراجعة على التذكرة المرتبطة
                بطلبك.
              </p>
            </details>
            <details>
              <summary>هل يمكنني استلام نتيجة التذكرة بعد المراجعة؟</summary>
              <p>
                نعم. عند إرسال الحالة للمراجعة البشرية يمكنك اختيار متابعة التذكرة واستلام النتيجة
                بعد اكتمال المراجعة.
              </p>
            </details>
            <details>
              <summary>كيف تساعد مشاركتي في تطوير بصيرة؟</summary>
              <p>
                شكرًا لمساهمتك. الحالات التي تحتاج مراجعة تساعدنا، بعد التحقق البشري، على تنمية
                قاعدة المعرفة وتحسين التعامل مع حالات مشابهة لاحقًا؛ ولا تُضاف إجابة غير مراجعة
                تلقائيًا.
              </p>
            </details>
          </div>
        </section>
        <p className="scope-note" id="sources">
          <Info size={19} /> بصيرة أداة مساعدة للمراجعة، وليست فتوى أو اعتمادًا للنشر.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

const CHALLENGE_MARKS = [
  {
    src: '/brand/challenge/challenge-lockup.svg',
    alt: 'تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي',
    className: 'challenge-mark--challenge',
  },
  {
    src: '/brand/challenge/year-of-ai-2026.svg',
    alt: 'عام الذكاء الاصطناعي 2026',
    className: 'challenge-mark--year',
  },
  {
    src: '/brand/challenge/bathel-wordmark.svg',
    alt: 'باذل',
    className: 'challenge-mark--bathel',
  },
];

function PublicFooter() {
  return (
    <footer className="public-footer" id="trust">
      <section className="trust-strip">
        <a
          className="challenge-marks page-shell"
          href="https://islamicaich.org/"
          target="_blank"
          rel="noreferrer"
          aria-label="الموقع الرسمي لتحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي"
        >
          {CHALLENGE_MARKS.map((mark) => (
            <img key={mark.src} src={mark.src} alt={mark.alt} className={mark.className} />
          ))}
        </a>
      </section>
      <div className="footer-main page-shell">
        <div className="footer-brand">
          <Brand compact />
          <p>أداة عربية لمراجعة دقة النقل وكفاية الاستدلال قبل النشر.</p>
        </div>
        <div>
          <h3>بصيرة</h3>
          <button type="button" onClick={() => document.getElementById('how')?.scrollIntoView()}>
            كيف تعمل
          </button>
          <button type="button" onClick={() => document.getElementById('faq')?.scrollIntoView()}>
            الأسئلة الشائعة
          </button>
        </div>
        <div>
          <h3>حدود الاستخدام</h3>
          <p>ليست فتوى</p>
          <p>لا اعتماد تلقائيًا للنشر</p>
          <p>المراجعة البشرية مطلوبة</p>
        </div>
      </div>
      <div className="footer-bottom page-shell">
        <span>© 2026 بصيرة</span>
        <span>صُممت لتوضيح الدليل والحدود قبل القرار.</span>
      </div>
    </footer>
  );
}

function AnalysisScreen({
  text,
  onCancel,
  onComplete,
}: {
  text: string;
  onCancel: () => void;
  onComplete: (receipt: DraftAnalysisReceipt) => void;
}) {
  const phases = [
    'فهم بنية النص',
    'اكتشاف الاقتباسات والادعاءات',
    'مطابقة المصادر المعتمدة',
    'تقييم دعم الدليل',
  ];
  const [phase, setPhase] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const interval = window.setInterval(
      () => setPhase((value) => Math.min(value + 1, phases.length - 1)),
      550,
    );
    setError('');
    setPhase(0);
    const minimumDelay = new Promise((resolve) => window.setTimeout(resolve, 900));
    void Promise.all([persistDraftForAnalysis(text, controller.signal), minimumDelay])
      .then(([receipt]) => {
        if (active) onComplete(receipt);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        window.clearInterval(interval);
        setError(analysisErrorMessage(reason));
      });
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [attempt, onComplete, phases.length, text]);

  return (
    <div className="app-page">
      <BackHeader onHome={onCancel} />
      <main className="analysis-main page-shell page-enter">
        <div className="analysis-orbit" aria-hidden="true">
          <Sparkle size={34} weight="fill" />
        </div>
        <p className="eyebrow">تحليل تلقائي في الخلفية</p>
        <h1>نراجع النص والمصدر والاستدلال</h1>
        <p className="hero-copy">
          لا تحتاج إلى تصنيف أي عبارة. يتولى وكيل بصيرة التحليل ويعرض لك ما وجده.
        </p>
        <section className="analysis-card" aria-live="polite">
          <div className="analysis-text">
            <span>النص الجاري تحليله</span>
            <p>{text}</p>
          </div>
          <div className="analysis-progress">
            {phases.map((item, index) => (
              <div
                className={`phase ${index < phase ? 'phase--done' : index === phase ? 'phase--active' : ''}`}
                key={item}
              >
                <span>
                  {index < phase ? (
                    <Check size={18} weight="bold" />
                  ) : index === phase ? (
                    <CircleNotch size={18} />
                  ) : (
                    index + 1
                  )}
                </span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>
        {error && (
          <div className="analysis-error" role="alert">
            <WarningCircle size={22} />
            <div>
              <strong>لم يكتمل الاتصال</strong>
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
        <div className="analysis-footer">
          <p>
            <ShieldCheck size={19} /> النتائج ستفصل بين مطابقة النقل وكفاية الاستدلال.
          </p>
          <button className="button button--ghost" onClick={onCancel}>
            إلغاء والعودة للنص
          </button>
        </div>
      </main>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function ExpandableText({
  text,
  id,
  previewLength = 160,
}: {
  text: unknown;
  id: string;
  previewLength?: number;
}) {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const [expanded, setExpanded] = useState(false);
  const canExpand = normalizedText.length > previewLength || normalizedText.includes('\n');

  useEffect(() => setExpanded(false), [normalizedText]);

  return (
    <div className="expandable-copy">
      <p
        className={`suggested-copy ${canExpand && !expanded ? 'suggested-copy--collapsed' : ''}`}
        data-empty={!normalizedText}
        dir="auto"
        id={id}
        lang="ar"
      >
        {normalizedText || 'لا توجد صياغة مقترحة متاحة لهذه النتيجة.'}
      </p>
      {canExpand && (
        <button
          aria-controls={id}
          aria-expanded={expanded}
          className="expand-text-button"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? <CaretUp size={18} /> : <CaretDown size={18} />}
          {expanded ? 'عرض أقل' : 'عرض النص كاملًا'}
        </button>
      )}
    </div>
  );
}

function ResultScreen({
  onHome,
  onTicket,
  onUnresolved,
  receipt,
}: {
  onHome: () => void;
  onTicket: () => void;
  onUnresolved: () => void;
  receipt: DraftAnalysisReceipt | null;
}) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [clipboardState, setClipboardState] = useState<'idle' | 'success' | 'error'>('idle');
  const suggested =
    'قال تعالى: «وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ» [البقرة: ٢٧١]. وتذكر الآية أن إخفاء الصدقة خير، لكنها لا تدل بمفردها على وجوب إخفاء كل صدقة أو منع إعلانها.';

  useEffect(() => {
    if (clipboardState === 'idle') return;
    const timeout = window.setTimeout(() => setClipboardState('idle'), 2600);
    return () => window.clearTimeout(timeout);
  }, [clipboardState]);

  const copy = async () => {
    try {
      if (!suggested.trim() || !navigator.clipboard?.writeText)
        throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(suggested);
      setClipboardState('success');
    } catch {
      setClipboardState('error');
    }
  };

  return (
    <div className="app-page result-page">
      <BackHeader onHome={onHome} />
      {clipboardState === 'success' && <Toast message="تم نسخ الصياغة المقترحة كاملة." />}
      {clipboardState === 'error' && (
        <Toast message="تعذر النسخ التلقائي. حدد النص وانسخه يدويًا." tone="error" />
      )}
      <main className="result-main page-shell page-enter">
        <div className="prototype-disclosure" role="note">
          <Info size={21} />
          <p>
            {receipt
              ? `حُفظت المسودة واستخرج النظام ${receipt.candidateCount} من العبارات تلقائيًا. النتيجة أدناه مثال توضيحي لشكل التقرير، وليست حكمًا مباشرًا على النص المدخل.`
              : 'هذه نتيجة توضيحية لواجهة التقرير. التحقق العلمي المباشر غير مفعّل في هذه النسخة.'}
          </p>
        </div>
        <StatusPill tone="success">
          <CheckCircle size={20} weight="fill" /> اكتملت المقارنة
        </StatusPill>
        <h1>راجع النتيجة قبل اعتماد التعديل</h1>
        <p className="hero-copy">دقة النقل وكفاية الاستدلال نتيجتان مستقلتان.</p>

        <section className="finding-grid">
          <article className="finding-card finding-card--warning">
            <div className="finding-head">
              <div>
                <h2>مؤشر كفاية الاستدلال</h2>
                <p>تقييم مدى دعم النص للاستنتاج</p>
              </div>
              <StatusPill tone="warning">
                <WarningCircle size={20} weight="fill" /> لا يكفي
              </StatusPill>
            </div>
            <span className="field-label">الادعاء الذي نراجعه</span>
            <blockquote>لذلك يجب إخفاء كل صدقة ولا يجوز إعلانها.</blockquote>
            <p className="finding-alert">
              <WarningCircle size={21} /> الادعاء أوسع من دلالة النص المعروض، ويحتاج إلى تقييد.
            </p>
          </article>
          <article className="finding-card finding-card--warning">
            <div className="finding-head">
              <div>
                <h2>مؤشر النقل الحرفي</h2>
                <p>مقارنة النص مع المصدر المعتمد</p>
              </div>
              <StatusPill tone="warning">
                <WarningCircle size={20} weight="fill" /> حذف أو تغيير
              </StatusPill>
            </div>
            <div className="quote-compare">
              <p>
                <span>النص في المسودة</span> وَإِن تُخْفُوهَا فَهُوَ خَيْرٌ لَكُمْ
              </p>
              <p>
                <span>النص في المصدر</span> وَإِن تُخْفُوهَا <mark>وَتُؤْتُوهَا الْفُقَرَاءَ</mark>{' '}
                فَهُوَ خَيْرٌ لَكُمْ
              </p>
            </div>
            <p className="finding-alert">
              <WarningCircle size={21} /> حذف داخل الاقتباس: وَتُؤْتُوهَا الْفُقَرَاءَ.
            </p>
          </article>
        </section>

        <section className="source-panel">
          <div className="section-title">
            <BookOpen size={26} />
            <div>
              <h2>المصدر والسياق</h2>
              <p>عرض نص الآية من المصدر المعتمد مع السياق المرتبط.</p>
            </div>
          </div>
          <div className="source-grid">
            <article>
              <h3>
                <BookOpen size={21} /> المصدر: القرآن الكريم
              </h3>
              <p>سورة البقرة — الآية ٢٧١</p>
              <small dir="ltr">Tanzil Uthmani v1.1</small>
              <blockquote>
                وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ
              </blockquote>
            </article>
            <article>
              <h3>
                <FileText size={21} /> التفسير المنسوب
              </h3>
              <p>السياق التفسيري غير متاح لهذه الآية في هذه النسخة التجريبية.</p>
            </article>
            <article>
              <h3>
                <Info size={21} /> الشروط والاستثناءات
              </h3>
              <p>مطابقة النص لا تعني وحدها أن الدليل يدعم كل استنتاج مبني عليه.</p>
            </article>
          </div>
        </section>

        <section className="suggestion-panel">
          <div className="section-title">
            <FileText size={26} />
            <div>
              <h2>مسودة مقترحة تحتاج مراجعتك</h2>
              <p>اقتراح تحريري لا يغيّر المصدر ولا يُعتمد تلقائيًا.</p>
            </div>
          </div>
          <ExpandableText id="suggested-result-copy" text={suggested} />
          <div className="suggestion-actions">
            <button className="button button--outline" onClick={onHome}>
              <PencilSimple size={20} /> أراجع التعديل
            </button>
            <button className="button button--primary" onClick={onTicket}>
              <Check size={20} /> اعتماد هذه النسخة
            </button>
            {SESSION_VOICE_ENABLED && (
              <button className="button button--outline" onClick={() => setVoiceOpen(true)}>
                <Microphone size={20} /> اسأل بصوتك عن النتيجة
              </button>
            )}
            <button
              aria-describedby="suggested-result-copy"
              className="button button--ghost"
              onClick={copy}
              type="button"
            >
              {clipboardState === 'success' ? <Check size={20} /> : <Copy size={20} />}
              {clipboardState === 'success' ? 'تم النسخ' : 'نسخ النص كاملًا'}
            </button>
          </div>
          <button className="unresolved-link" onClick={onUnresolved}>
            عرض مثال لنتيجة غير محسومة <CaretLeft size={16} />
          </button>
        </section>
      </main>
      {voiceOpen && <VoiceDrawer tone="result" onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}

type RecognitionResultEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type RecognitionErrorEvent = { error: string };

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type VoiceWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

type ListeningState =
  'idle' | 'requesting' | 'listening' | 'processing' | 'unavailable' | 'denied' | 'error';

function VoiceDrawer({ onClose, tone }: { onClose: () => void; tone: VoiceTone }) {
  const [question, setQuestion] = useState('');
  const [listeningState, setListeningState] = useState<ListeningState>('idle');
  const [speechStatus, setSpeechStatus] = useState('جارٍ تجهيز الترحيب الصوتي…');
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionTimerRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: VOICE_GREETING,
    },
  ]);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setSpeechStatus('الصوت غير متاح في هذا المتصفح. يمكنك متابعة المحادثة نصيًا.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    const arabicVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLocaleLowerCase().startsWith('ar'));
    if (arabicVoice) utterance.voice = arabicVoice;
    utterance.rate = 0.92;
    utterance.onstart = () => setSpeechStatus('بصيرة تتحدث الآن…');
    utterance.onend = () => setSpeechStatus('انتهى الرد الصوتي، والنص ظاهر في المحادثة.');
    utterance.onerror = () =>
      setSpeechStatus('تعذر تشغيل الصوت. الرد النصي ما زال متاحًا بالكامل.');
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    speak(VOICE_GREETING);
    return () => {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const respond = (value: string) => {
    const reply = answerReviewQuestion(value, tone);
    if (!reply) return;
    setMessages((items) => [
      ...items,
      { role: 'user', text: value },
      { role: 'assistant', text: reply },
    ]);
    speak(reply);
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value) return;
    setQuestion('');
    respond(value);
  };

  const listen = () => {
    if (listeningState === 'listening' || listeningState === 'requesting') {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      recognitionRef.current?.stop();
      setListeningState('idle');
      return;
    }

    const voiceWindow = window as VoiceWindow;
    const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setListeningState('unavailable');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      setListeningState('listening');
    };
    recognition.onresult = (event) => {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (!transcript) {
        setListeningState('error');
        return;
      }
      setListeningState('processing');
      setQuestion('');
      respond(transcript);
    };
    recognition.onerror = (event) => {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      setListeningState(event.error === 'not-allowed' ? 'denied' : 'error');
    };
    recognition.onend = () => {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      setListeningState((current) =>
        current === 'requesting'
          ? 'error'
          : current === 'listening' || current === 'processing'
            ? 'idle'
            : current,
      );
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;

    try {
      setListeningState('requesting');
      recognitionTimerRef.current = window.setTimeout(() => {
        recognition.stop();
        setListeningState('error');
      }, 5000);
      recognition.start();
    } catch {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
      }
      recognitionRef.current = null;
      setListeningState('error');
    }
  };

  const listeningCopy: Record<ListeningState, string> = {
    idle: 'اضغط للتحدث',
    requesting: 'بانتظار إذن الميكروفون…',
    listening: 'بصيرة تستمع… اضغط للإيقاف',
    processing: 'جارٍ ربط السؤال بهذه المراجعة…',
    unavailable: 'الإدخال الصوتي غير متاح في هذا المتصفح',
    denied: 'لم يُسمح باستخدام الميكروفون. فعّل الإذن أو اكتب سؤالك.',
    error: 'تعذر التقاط الصوت. حاول مرة أخرى أو اكتب سؤالك.',
  };

  return (
    <div
      className="drawer-layer"
      role="dialog"
      aria-modal="true"
      aria-label="اسأل بصيرة عن النتيجة"
    >
      <button className="drawer-scrim" aria-label="إغلاق" onClick={onClose} />
      <aside className="voice-drawer">
        <div className="drawer-head">
          <button className="icon-button" onClick={onClose} aria-label="إغلاق">
            <X size={25} />
          </button>
          <div>
            <h2>اسأل بصيرة عن النتيجة</h2>
            <StatusPill tone="success">مرتبط بهذه المراجعة</StatusPill>
          </div>
        </div>
        {tone === 'unresolved' && (
          <div className="drawer-warning">
            <WarningCircle size={23} />
            <div>
              <strong>النتيجة غير محسومة</strong>
              <p>يمكنني شرح أسباب الاختلاف، ولا أستطيع إصدار نتيجة جديدة.</p>
            </div>
          </div>
        )}
        <div className="conversation" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`message message--${message.role}`} key={`${message.role}-${index}`}>
              {message.text}
              {message.role === 'assistant' && (
                <div className="message-sources">
                  <span>
                    <FileText size={17} /> الادعاء محل الخلاف
                  </span>
                  <span>
                    <BookOpen size={17} /> البقرة ٢٧١
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="voice-control">
          <button
            className={
              listeningState === 'listening' || listeningState === 'requesting'
                ? 'voice-button voice-button--active'
                : 'voice-button'
            }
            onClick={listen}
            aria-label={
              listeningState === 'listening' || listeningState === 'requesting'
                ? 'إيقاف الإدخال الصوتي'
                : 'بدء الإدخال الصوتي'
            }
            aria-pressed={listeningState === 'listening' || listeningState === 'requesting'}
            type="button"
          >
            {listeningState === 'listening' ||
            listeningState === 'requesting' ||
            listeningState === 'processing' ? (
              <CircleNotch size={28} />
            ) : (
              <Microphone size={30} weight="fill" />
            )}
          </button>
          <span
            role={['denied', 'error', 'unavailable'].includes(listeningState) ? 'alert' : 'status'}
          >
            {listeningCopy[listeningState]}
          </span>
          <small>اسأل عن هذه النتيجة فقط</small>
        </div>
        <p className="speech-status" role="status">
          {speechStatus}
        </p>
        <p className="evidence-boundary">
          <WarningCircle size={18} /> لن أضيف معلومات غير موجودة في ملف المراجعة.
        </p>
        <form className="chat-composer" onSubmit={send}>
          <button type="submit" aria-label="إرسال">
            <PaperPlaneTilt size={21} weight="fill" />
          </button>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="اكتب سؤالك عن النتيجة…"
          />
          <button type="button" aria-label="تحدث" onClick={listen}>
            <Microphone size={20} />
          </button>
        </form>
      </aside>
    </div>
  );
}

function UnresolvedScreen({ onHome, onTicket }: { onHome: () => void; onTicket: () => void }) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  return (
    <div className="app-page result-page">
      <BackHeader onHome={onHome} />
      <main className="result-main page-shell page-enter">
        <StatusPill tone="warning">
          <WarningCircle size={20} weight="fill" /> النتيجة غير محسومة
        </StatusPill>
        <h1>نحتاج إلى مراجعة إضافية</h1>
        <p className="hero-copy">
          ظهرت أسباب مختلفة، لذلك لن نقترح حكمًا نهائيًا أو نصًا جاهزًا للنشر.
        </p>
        <section className="reason-banner">
          <strong>سبب الإحالة:</strong>
          <StatusPill tone="warning">اختلفت تقديرات النماذج</StatusPill>
          <span>لم نجد مصدرًا محددًا</span>
          <span>السياق ناقص</span>
          <span>يتطلب مراجعة مختص</span>
        </section>
        <section className="contested-claim">
          <div>
            <FileText size={23} />
            <strong>الادعاء محل الخلاف</strong>
          </div>
          <p>لذلك يجب إخفاء كل صدقة ولا يجوز إعلانها.</p>
          <span>نسخة النص ١</span>
        </section>
        <section className="finding-grid advisory-grid">
          <article className="finding-card finding-card--warning">
            <div className="finding-head">
              <div>
                <h2>التقدير الأول</h2>
                <p>نتيجة استشارية</p>
              </div>
              <StatusPill tone="warning">لا يكفي</StatusPill>
            </div>
            <p>النص المعروض لا يثبت وجوب الإخفاء في جميع الحالات.</p>
            <div className="candidate-source">
              <span>المصدر المرشح</span> البقرة ٢٧١ — موضع الاستشهاد المحدد
            </div>
          </article>
          <article className="finding-card finding-card--warning">
            <div className="finding-head">
              <div>
                <h2>التقدير الثاني</h2>
                <p>نتيجة استشارية</p>
              </div>
              <StatusPill tone="warning">غير محسوم</StatusPill>
            </div>
            <p>السياق التفسيري المعتمد غير متاح في هذه النسخة.</p>
            <div className="candidate-source">
              <span>المصدر المرشح</span> لا يوجد مقطع تفسيري معتمد مرفق
            </div>
          </article>
        </section>
        <p className="finding-alert wide-alert">
          <WarningCircle size={21} /> اختلاف التقدير لا يثبت صحة الادعاء أو بطلانه؛ لذلك توقفت
          المراجعة هنا.
        </p>
        <section className="review-packet">
          <div className="section-title">
            <FileText size={26} />
            <div>
              <h2>ما الذي سيظهر للمراجع؟</h2>
              <p>ملف واضح يحفظ النص والأدلة وحدود النتيجة.</p>
            </div>
          </div>
          <div className="packet-items">
            <span>
              <CheckCircle /> النص الأصلي والنسخة المؤكدة
            </span>
            <span>
              <CheckCircle /> الادعاء المختلف عليه
            </span>
            <span>
              <CheckCircle /> المصدر المرشح والمقاطع المتاحة
            </span>
            <span>
              <CheckCircle /> أسباب عدم الحسم وحدود النظام
            </span>
          </div>
          <div className="packet-actions">
            <button className="button button--primary" onClick={onTicket}>
              <DownloadSimple size={20} /> إنشاء تذكرة مراجعة
            </button>
            <button className="button button--outline" onClick={onHome}>
              العودة وتعديل النص
            </button>
            {SESSION_VOICE_ENABLED && (
              <button className="button button--outline" onClick={() => setVoiceOpen(true)}>
                <Microphone size={20} /> اسأل بصيرة
              </button>
            )}
          </div>
        </section>
      </main>
      {voiceOpen && <VoiceDrawer tone="unresolved" onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}

function TicketScreen({ onHome }: { onHome: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <div className="app-page ticket-page">
      <BackHeader onHome={onHome} />
      {saved && <Toast message="تم حفظ بيانات المتابعة لهذه التذكرة." />}
      <main className="ticket-main page-shell page-enter">
        <StatusPill tone="success">
          <CheckCircle size={20} weight="fill" /> تم استلام طلبك
        </StatusPill>
        <h1>تم إنشاء تذكرتك</h1>
        <button className="ticket-code" onClick={() => navigator.clipboard?.writeText('BR-1042')}>
          <Copy size={23} />
          <b dir="ltr">#BR-1042</b>
        </button>
        <p className="hero-copy">احتفظ برقم التذكرة للرجوع إلى طلبك.</p>
        <section className="ticket-grid">
          <article className="ticket-card">
            <span className="icon-disc">
              <FileText size={30} />
            </span>
            <h2>تفاصيل الطلب</h2>
            <StatusPill tone="success">نسخة النص ١</StatusPill>
            <p>
              <CalendarBlank size={19} /> ٢ أكتوبر ٢٠٢٦ — ١٠:٢٤ ص
            </p>
            <button className="button button--outline">
              <Eye size={20} /> عرض النص المرسل
            </button>
            <button className="button button--ghost">
              <DownloadSimple size={20} /> تنزيل ملف المراجعة
            </button>
            <hr />
            <h3>الملفات المرفقة في طلب المراجعة</h3>
            <ul>
              <li>
                <FileText /> النص والعبارات المؤكدة
              </li>
              <li>
                <FileText /> المراجع والمقاطع المتاحة
              </li>
              <li>
                <FileText /> أسباب عدم الحسم
              </li>
            </ul>
          </article>
          <article className="ticket-card follow-card">
            <span className="icon-disc">
              <UsersThree size={30} />
            </span>
            <h2>هل ترغب في متابعة النتيجة؟</h2>
            <p>أضف بياناتك اختياريًا لنرسل لك تحديثًا عند اكتمال المراجعة.</p>
            <label>
              الاسم (اختياري)
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              البريد الإلكتروني
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              className="button button--primary"
              disabled={!email}
              onClick={() => setSaved(true)}
            >
              حفظ وإرسال التحديثات
            </button>
            <button className="text-action" onClick={onHome}>
              متابعة بدون بيانات
            </button>
            <small>
              <Lock size={17} /> تستخدم بياناتك لمتابعة هذه التذكرة فقط.
            </small>
          </article>
        </section>
        <div className="ticket-footer">
          <p>يمكنك العودة إلى بصيرة ومراجعة نص جديد في أي وقت.</p>
          <button className="button button--outline" onClick={onHome}>
            <ArrowLeft size={20} /> مراجعة نص جديد
          </button>
          <button className="button button--ghost" onClick={onHome}>
            <House size={20} /> العودة إلى الصفحة الرئيسية
          </button>
        </div>
      </main>
    </div>
  );
}

const reviewerNavigation: Array<{
  route: ReviewerRoute;
  label: string;
  icon: ComponentType<{ size?: number; weight?: 'regular' | 'fill' }>;
}> = [
  { route: 'dashboard', label: 'نظرة عامة', icon: SquaresFour },
  { route: 'queue', label: 'طلبات المراجعة', icon: Tray },
  { route: 'sources', label: 'المصادر المعتمدة', icon: Database },
];

export function ReviewerShell({
  route,
  navigate,
  profile,
  onSignOut,
}: {
  route: ReviewerRoute;
  navigate: (route: Route) => void;
  profile?: ReactNode;
  onSignOut: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className={`reviewer-shell ${collapsed ? 'reviewer-shell--collapsed' : ''}`}>
      <aside className="reviewer-sidebar">
        <div className="sidebar-brand">
          <Brand compact />
          <button
            className="icon-button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label="طي القائمة"
          >
            <CaretLeft size={21} />
          </button>
        </div>
        <nav aria-label="مساحة المراجع">
          {reviewerNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={route === item.route ? 'active' : ''}
                onClick={() => navigate(`reviewer-${item.route}`)}
                key={item.route}
              >
                <Icon size={22} weight={route === item.route ? 'fill' : undefined} />
                <span>{item.label}</span>
                {item.route === 'queue' && <b>2</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button>
            <GearSix size={22} />
            <span>الإعدادات</span>
          </button>
          <button onClick={() => navigate('home')}>
            <House size={22} />
            <span>العودة للواجهة العامة</span>
          </button>
          <button disabled={signingOut} onClick={() => void handleSignOut()}>
            <SignOut size={22} />
            <span>{signingOut ? 'جاري تسجيل الخروج…' : 'تسجيل الخروج'}</span>
          </button>
          <div className="reviewer-profile">
            {profile ?? <span aria-hidden="true">م</span>}
            <div>
              <strong>مراجع مصرح</strong>
              <small>جلسة محمية</small>
            </div>
          </div>
        </div>
      </aside>
      <section className="reviewer-content">
        <header className="reviewer-topbar">
          <div>
            <p>مساحة المراجع</p>
            <h1>
              {route === 'dashboard'
                ? 'نظرة عامة'
                : route === 'queue'
                  ? 'طلبات المراجعة'
                  : route === 'detail'
                    ? 'مراجعة الطلب BR-1042'
                    : 'المصادر المعتمدة'}
            </h1>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">بيانات تجريبية</span>
            <button className="icon-button" aria-label="الإشعارات">
              <Bell size={23} />
              <i />
            </button>
          </div>
        </header>
        {route === 'dashboard' && <ReviewerDashboard navigate={navigate} />}
        {route === 'queue' && <ReviewerQueue navigate={navigate} />}
        {route === 'detail' && <ReviewerDetail navigate={navigate} />}
        {route === 'sources' && <ReviewerSources />}
      </section>
    </div>
  );
}

function ReviewerDashboard({ navigate }: { navigate: (route: Route) => void }) {
  return (
    <main className="reviewer-main page-enter">
      <div className="welcome-row">
        <div>
          <h2>مرحبًا صالح</h2>
          <p>لديك طلبان جديدان يحتاجان إلى مراجعة اليوم.</p>
        </div>
        <button className="button button--primary" onClick={() => navigate('reviewer-queue')}>
          <Tray size={20} /> فتح قائمة المراجعة
        </button>
      </div>
      <section className="stats-grid">
        <article>
          <span>
            <Tray size={23} />
          </span>
          <p>طلبات جديدة</p>
          <strong>2</strong>
          <small>بانتظار البدء</small>
        </article>
        <article>
          <span>
            <Clock size={23} />
          </span>
          <p>قيد المراجعة</p>
          <strong>1</strong>
          <small>تحتاج إلى قرار</small>
        </article>
        <article>
          <span>
            <CheckCircle size={23} />
          </span>
          <p>مكتملة هذا الأسبوع</p>
          <strong>8</strong>
          <small>متوسط 18 دقيقة</small>
        </article>
        <article>
          <span>
            <Archive size={23} />
          </span>
          <p>إجمالي الحالات</p>
          <strong>31</strong>
          <small>منذ بدء التجربة</small>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="reviewer-panel">
          <div className="panel-heading">
            <div>
              <h2>الأولوية الآن</h2>
              <p>طلبات مرتبة حسب الحاجة والتاريخ.</p>
            </div>
            <button className="text-action" onClick={() => navigate('reviewer-queue')}>
              عرض الكل <CaretLeft size={16} />
            </button>
          </div>
          <CaseList compact onOpen={() => navigate('reviewer-detail')} />
        </article>
        <article className="reviewer-panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>نشاط الأسبوع</h2>
              <p>تقدم المراجعات التجريبية.</p>
            </div>
            <ChartBar size={25} />
          </div>
          <div className="mini-chart" aria-label="ثمان مراجعات مكتملة">
            <i style={{ height: '42%' }} />
            <i style={{ height: '60%' }} />
            <i style={{ height: '48%' }} />
            <i style={{ height: '80%' }} />
            <i style={{ height: '66%' }} />
            <i style={{ height: '92%' }} />
            <i style={{ height: '72%' }} />
          </div>
          <div className="activity-summary">
            <span>
              <b>8</b> مكتملة
            </span>
            <span>
              <b>18 د</b> متوسط الوقت
            </span>
          </div>
        </article>
      </section>
    </main>
  );
}

function CaseList({
  compact = false,
  onOpen,
  items = SAMPLE_CASES,
}: {
  compact?: boolean;
  onOpen: () => void;
  items?: typeof SAMPLE_CASES;
}) {
  if (items.length === 0) return <EmptyState />;
  return (
    <div className={`case-list ${compact ? 'case-list--compact' : ''}`}>
      {items.map((item) => (
        <button className="case-row" onClick={onOpen} key={item.id}>
          <span className="case-id" dir="ltr">
            {item.id}
          </span>
          <div>
            <strong>{item.title}</strong>
            <small>
              {item.submitter} · {item.submittedAt}
            </small>
          </div>
          <StatusPill
            tone={
              item.status === 'مكتمل' ? 'success' : item.status === 'جديد' ? 'warning' : 'neutral'
            }
          >
            {item.status}
          </StatusPill>
          <span className={`priority priority--${item.priority}`}>{item.priority}</span>
          <CaretLeft size={18} />
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <span>
        <Tray size={32} />
      </span>
      <h3>لا توجد طلبات هنا</h3>
      <p>جرّب تغيير التصفية أو البحث بكلمات أخرى.</p>
    </div>
  );
}

function ReviewerQueue({ navigate }: { navigate: (route: Route) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('الكل');
  const [loading, setLoading] = useState(false);
  const forceError = window.location.hash.includes('state=error');
  const filtered = useMemo(
    () =>
      SAMPLE_CASES.filter(
        (item) =>
          (filter === 'الكل' || item.status === filter) &&
          `${item.id} ${item.title}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [filter, query],
  );

  const refresh = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 700);
  };

  return (
    <main className="reviewer-main page-enter">
      <section className="queue-toolbar">
        <div className="search-field">
          <MagnifyingGlass size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث برقم الطلب أو موضوعه"
          />
        </div>
        <div className="filter-group">
          <Funnel size={20} />
          {['الكل', 'جديد', 'قيد المراجعة', 'مكتمل'].map((item) => (
            <button
              className={filter === item ? 'active' : ''}
              onClick={() => setFilter(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <button className="button button--outline" onClick={refresh}>
          <CircleNotch className={loading ? 'spin' : ''} size={20} /> تحديث
        </button>
      </section>
      <section className="reviewer-panel queue-panel">
        <div className="panel-heading">
          <div>
            <h2>كل الطلبات</h2>
            <p>{filtered.length} طلبات ضمن العرض الحالي</p>
          </div>
        </div>
        {forceError ? (
          <ErrorState onRetry={() => navigate('reviewer-queue')} />
        ) : loading ? (
          <LoadingState />
        ) : (
          <CaseList items={filtered} onOpen={() => navigate('reviewer-detail')} />
        )}
      </section>
    </main>
  );
}

function LoadingState() {
  return (
    <div className="loading-state" aria-label="جار تحميل الطلبات">
      <span />
      <span />
      <span />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="empty-state empty-state--error" role="alert">
      <span>
        <WarningCircle size={32} />
      </span>
      <h3>تعذر تحميل الطلبات</h3>
      <p>لم نتمكن من الوصول إلى بيانات المراجعة الآن. لم نفقد أي قرار محفوظ.</p>
      <button className="button button--outline" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
}

function ReviewerDetail({ navigate }: { navigate: (route: Route) => void }) {
  const [decision, setDecision] = useState<'needs-context' | 'bounded' | 'return'>('needs-context');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <main className="reviewer-main detail-main page-enter">
      {saved && <Toast message="تم حفظ القرار التجريبي دون إرسال خارجي." />}
      <button className="back-link" onClick={() => navigate('reviewer-queue')}>
        <ArrowLeft size={18} /> العودة إلى الطلبات
      </button>
      <div className="detail-layout">
        <section className="detail-stack">
          <article className="reviewer-panel">
            <div className="panel-heading">
              <div>
                <StatusPill tone="warning">جديد</StatusPill>
                <h2>إخفاء الصدقة في جميع الحالات</h2>
                <p dir="ltr">BR-1042</p>
              </div>
              <span>نسخة النص ١</span>
            </div>
            <div className="submitted-copy">
              <span>النص المرسل</span>
              <p>{DEMO_TEXT}</p>
            </div>
          </article>
          <article className="reviewer-panel">
            <div className="panel-heading">
              <div>
                <h2>ملخص بصيرة</h2>
                <p>ملاحظات آلية للمساعدة وليست قرار المراجع.</p>
              </div>
              <Sparkle size={24} />
            </div>
            <div className="review-summary">
              <p>
                <WarningCircle size={21} /> يوجد حذف داخل الاقتباس مقارنة بالنص المعتمد.
              </p>
              <p>
                <WarningCircle size={21} /> الاستنتاج أوسع من دلالة الآية المعروضة.
              </p>
            </div>
          </article>
          <article className="reviewer-panel">
            <div className="panel-heading">
              <div>
                <h2>الأدلة المرفقة</h2>
                <p>المقاطع التي استخدمها التحليل لهذه النسخة.</p>
              </div>
              <BookOpen size={24} />
            </div>
            <div className="evidence-card">
              <div>
                <strong>القرآن الكريم — سورة البقرة، الآية ٢٧١</strong>
                <small dir="ltr">Tanzil Uthmani v1.1</small>
              </div>
              <blockquote>
                وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ
              </blockquote>
              <button className="text-action">
                فتح المصدر <ArrowLeft size={16} />
              </button>
            </div>
          </article>
        </section>
        <aside className="decision-panel reviewer-panel">
          <div className="panel-heading">
            <div>
              <h2>قرار المراجع</h2>
              <p>اختر الإجراء المناسب وسجّل سببه.</p>
            </div>
            <ListChecks size={24} />
          </div>
          <div className="decision-options">
            <label className={decision === 'needs-context' ? 'selected' : ''}>
              <input
                type="radio"
                name="decision"
                checked={decision === 'needs-context'}
                onChange={() => setDecision('needs-context')}
              />
              <span>
                <strong>يحتاج سياقًا إضافيًا</strong>
                <small>الأدلة الحالية لا تكفي للحسم.</small>
              </span>
            </label>
            <label className={decision === 'bounded' ? 'selected' : ''}>
              <input
                type="radio"
                name="decision"
                checked={decision === 'bounded'}
                onChange={() => setDecision('bounded')}
              />
              <span>
                <strong>اعتماد صياغة مقيّدة</strong>
                <small>اعتماد التعديل ضمن حدود المصدر.</small>
              </span>
            </label>
            <label className={decision === 'return' ? 'selected' : ''}>
              <input
                type="radio"
                name="decision"
                checked={decision === 'return'}
                onChange={() => setDecision('return')}
              />
              <span>
                <strong>إعادة للمحرر</strong>
                <small>يتطلب تعديلًا قبل إعادة المراجعة.</small>
              </span>
            </label>
          </div>
          <label className="note-field">
            ملاحظة المراجع
            <textarea
              rows={6}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="اكتب سبب القرار وحدوده…"
            />
          </label>
          <button className="button button--primary" onClick={() => setSaved(true)}>
            <Check size={20} /> حفظ القرار
          </button>
          <button className="button button--ghost">حفظ كمسودة</button>
          <p className="decision-note">
            <Lock size={17} /> لن يُنشر القرار تلقائيًا أو يغيّر المصدر.
          </p>
        </aside>
      </div>
    </main>
  );
}

function ReviewerSources() {
  const [query, setQuery] = useState('');
  const sources = [
    'القرآن الكريم — Tanzil Uthmani v1.1',
    'تفسير الميسر — سجل المصدر التجريبي',
    'حزمة الخلاف الفقهي — بانتظار الاعتماد',
  ].filter((item) => item.includes(query));
  return (
    <main className="reviewer-main page-enter">
      <section className="queue-toolbar">
        <div className="search-field">
          <MagnifyingGlass size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث في سجل المصادر"
          />
        </div>
        <button className="button button--primary">
          <Database size={20} /> إضافة مصدر للمراجعة
        </button>
      </section>
      <section className="reviewer-panel">
        <div className="panel-heading">
          <div>
            <h2>سجل المصادر</h2>
            <p>مصادر تجريبية؛ الاعتماد العلمي والترخيص غير مكتملين.</p>
          </div>
        </div>
        {sources.length ? (
          <div className="source-list">
            {sources.map((source, index) => (
              <article key={source}>
                <span>
                  <BookOpen size={23} />
                </span>
                <div>
                  <strong>{source}</strong>
                  <small>
                    {index === 0 ? 'نشط في العرض التجريبي' : 'لا يستخدم في النتائج الحالية'}
                  </small>
                </div>
                <StatusPill tone={index === 0 ? 'success' : 'neutral'}>
                  {index === 0 ? 'متاح' : 'مسودة'}
                </StatusPill>
                <button className="icon-button" aria-label="عرض">
                  <Eye size={20} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </main>
  );
}

export default function App({ clerkConfigured = false }: { clerkConfigured?: boolean }) {
  const { route, navigate } = useRoute();
  const [reviewText, setReviewText] = useState('');
  const [analysisReceipt, setAnalysisReceipt] = useState<DraftAnalysisReceipt | null>(null);

  const startReview = useCallback(
    (text: string) => {
      setReviewText(text);
      setAnalysisReceipt(null);
      navigate('analysis');
    },
    [navigate],
  );

  const startNewReview = useCallback(() => {
    setReviewText('');
    setAnalysisReceipt(null);
    navigate('home');
  }, [navigate]);

  const completeAnalysis = useCallback(
    (receipt: DraftAnalysisReceipt) => {
      setAnalysisReceipt(receipt);
      navigate('result');
    },
    [navigate],
  );

  if (route.startsWith('reviewer-')) {
    if (!clerkConfigured) return <ReviewerAuthUnavailable onHome={() => navigate('home')} />;
    return (
      <ReviewerAccessBoundary
        onHome={() => navigate('home')}
        onSignedOut={() => reloadSignedOutHome()}
      >
        {(profile, onSignOut) => (
          <ReviewerShell
            route={route.replace('reviewer-', '') as ReviewerRoute}
            navigate={navigate}
            profile={profile}
            onSignOut={onSignOut}
          />
        )}
      </ReviewerAccessBoundary>
    );
  }
  if (route === 'analysis')
    return (
      <AnalysisScreen
        text={reviewText}
        onCancel={() => navigate('home')}
        onComplete={completeAnalysis}
      />
    );
  if (route === 'result')
    return (
      <ResultScreen
        onHome={startNewReview}
        onTicket={() => navigate('ticket')}
        onUnresolved={() => navigate('unresolved')}
        receipt={analysisReceipt}
      />
    );
  if (route === 'unresolved')
    return <UnresolvedScreen onHome={startNewReview} onTicket={() => navigate('ticket')} />;
  if (route === 'ticket') return <TicketScreen onHome={startNewReview} />;
  return (
    <HomeScreen
      initialText={reviewText}
      onReview={startReview}
      onReviewer={() => navigate('reviewer-dashboard')}
    />
  );
}
