// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { ExpandableText, reloadSignedOutHome, ReviewerShell } from './App.js';

describe('Basirah web flow', () => {
  beforeEach(() => {
    window.location.hash = '#/home';
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    Reflect.deleteProperty(window, 'SpeechRecognition');
    Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('explains an empty submission instead of starting an analysis', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));

    expect(screen.getByRole('alert').textContent).toContain('أضف النص الذي تريد مراجعته أولًا');
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'النص المراد مراجعته' }),
    );
  });

  it('moves directly from the text composer to automatic background analysis', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /جرّب مثالًا/ }));
    await user.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));

    expect(screen.getByText('تحليل تلقائي في الخلفية')).not.toBeNull();
    expect(screen.getByText(/لا تحتاج إلى تصنيف أي عبارة/)).not.toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('preserves the submitted draft when returning from analysis', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /جرّب مثالًا/ }));
    const draft = (
      screen.getByRole('textbox', {
        name: 'النص المراد مراجعته',
      }) as HTMLTextAreaElement
    ).value;
    await user.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    await user.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));

    expect(
      (screen.getByRole('textbox', { name: 'النص المراد مراجعته' }) as HTMLTextAreaElement).value,
    ).toBe(draft);
  });

  it('shows provisional content type and inline warning before submission', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { text: string };
      const quotation = 'وَإِن تُخْفُوهَا فَهُوَ خَيْرٌ لَكُمْ';
      const startOffset = request.text.indexOf(quotation);
      return new Response(
        JSON.stringify({
          mode: 'local_demo',
          verification: false,
          corpusVersion: 'software-fixture-v1',
          inputHash: 'a'.repeat(64),
          offsetUnit: 'utf16_code_unit',
          annotations: [
            {
              id: 'semantic-candidate-1',
              text: quotation,
              startOffset,
              endOffset: startOffset + quotation.length,
              contentType: 'quran',
              contentTypeLabel: 'آية قرآنية',
              classificationBasis: 'fixture_match',
            },
          ],
          findings: [
            {
              id: 'candidate-1',
              text: quotation,
              startOffset,
              endOffset: startOffset + quotation.length,
              contentType: 'quran',
              contentTypeLabel: 'آية قرآنية',
              classificationBasis: 'fixture_match',
              issueCode: 'quotation_mismatch',
              severity: 'warning',
              message: 'قد يكون الاقتباس ناقصًا.',
              evidence: {
                reference: 'البقرة: ٢٧١',
                excerpt: 'نص مرجعي تجريبي',
                retrievalModes: ['lexical'],
              },
            },
          ],
          warnings: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: /جرّب مثالًا/ }));

    expect(await screen.findByText('آية قرآنية')).not.toBeNull();
    expect(screen.getByText('قد يكون الاقتباس ناقصًا.')).not.toBeNull();
    expect(
      screen.getByText('اللون يصف نوع الجزء، والخط السفلي يوضح حالة الفحص.', { exact: false }),
    ).not.toBeNull();
    expect(screen.getAllByText('يحتاج مراجعة').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'ابدأ المراجعة' })).not.toBeNull();
    expect(screen.queryByText('تحليل تلقائي في الخلفية')).toBeNull();
  });

  it('fails closed when reviewer authentication is unavailable', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /دخول المراجع/ }));

    expect(screen.getByRole('alert').textContent).toContain('دخول المراجع غير متاح حاليًا');
    expect(screen.queryByRole('navigation', { name: 'مساحة المراجع' })).toBeNull();
  });

  it('keeps the protected reviewer entry reachable from mobile navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'فتح القائمة' }));
    await user.click(screen.getByRole('button', { name: 'دخول مساحة المراجع من قائمة الهاتف' }));

    expect(screen.getByRole('alert').textContent).toContain('دخول المراجع غير متاح حاليًا');
  });

  it('renders the authorized reviewer workspace with a simple labelled sidebar', () => {
    render(<ReviewerShell route="dashboard" navigate={vi.fn()} onSignOut={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'مساحة المراجع' })).not.toBeNull();
    expect(screen.getByRole('button', { name: /طلبات المراجعة/ })).not.toBeNull();
    expect(screen.getByText('بيانات تجريبية')).not.toBeNull();
  });

  it('keeps public navigation separate from terminating the Clerk session', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    render(<ReviewerShell route="dashboard" navigate={navigate} onSignOut={onSignOut} />);

    await user.click(screen.getByRole('button', { name: 'العودة للواجهة العامة' }));
    expect(navigate).toHaveBeenCalledWith('home');
    expect(onSignOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('moves to home and reloads after reviewer sign-out', () => {
    const location = { hash: '#/reviewer/dashboard', reload: vi.fn() };

    reloadSignedOutHome(location);

    expect(location.hash).toBe('#/home');
    expect(location.reload).toHaveBeenCalledOnce();
  });

  it('shows a useful empty state when a reviewer search has no matches', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/reviewer/queue';
    render(<ReviewerShell route="queue" navigate={vi.fn()} onSignOut={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('ابحث برقم الطلب أو موضوعه'), 'لا توجد نتيجة');

    expect(screen.getByText('لا توجد طلبات هنا')).not.toBeNull();
    expect(screen.getByText('جرّب تغيير التصفية أو البحث بكلمات أخرى.')).not.toBeNull();
  });

  it('shows a recoverable reviewer error state', () => {
    window.location.hash = '#/reviewer/queue?state=error';
    render(<ReviewerShell route="queue" navigate={vi.fn()} onSignOut={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('تعذر تحميل الطلبات');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).not.toBeNull();
  });

  it('expands long suggested text without changing or interpreting its contents', async () => {
    const user = userEvent.setup();
    const untrusted = `<img src=x onerror="alert('unsafe')"> ${'نص عربي طويل '.repeat(20)}`;

    render(<ExpandableText id="safe-result" text={untrusted} previewLength={40} />);

    const toggle = screen.getByRole('button', { name: 'عرض النص كاملًا' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=/)).not.toBeNull();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'عرض أقل' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('copies the complete suggestion and announces success', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    window.location.hash = '#/result';
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'نسخ النص كاملًا' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain('وَتُؤْتُوهَا الْفُقَرَاءَ');
    expect(screen.getByRole('status').textContent).toContain('تم نسخ الصياغة المقترحة كاملة');
  });

  it('announces a recoverable clipboard failure', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    window.location.hash = '#/result';
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'نسخ النص كاملًا' }));

    expect(screen.getByRole('alert').textContent).toContain('حدد النص وانسخه يدويًا');
  });

  it('shows the Arabic greeting as text and explains unsupported microphone access', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/result';
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'اسأل بصوتك عن النتيجة' }));

    expect(screen.getByText(/السلام عليكم، أنا بصيرة/)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'بدء الإدخال الصوتي' }));
    expect(screen.getByRole('alert').textContent).toContain('غير متاح في هذا المتصفح');
  });

  it('keeps typed voice-companion answers inside the active review evidence', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/result';
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'اسأل بصوتك عن النتيجة' }));
    await user.type(screen.getByPlaceholderText('اكتب سؤالك عن النتيجة…'), 'أعطني فتوى جديدة');
    await user.click(screen.getByRole('button', { name: 'إرسال' }));

    expect(screen.getByText(/لا أجيب عن فتوى أو سؤال عام/)).not.toBeNull();
  });

  it('keeps a microphone permission denial visible instead of silently stopping', async () => {
    class DeniedRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult = null;

      start() {
        this.onstart?.();
        this.onerror?.({ error: 'not-allowed' });
        this.onend?.();
      }

      stop() {
        this.onend?.();
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: DeniedRecognition,
    });
    const user = userEvent.setup();
    window.location.hash = '#/result';
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'اسأل بصوتك عن النتيجة' }));
    await user.click(screen.getByRole('button', { name: 'بدء الإدخال الصوتي' }));

    expect(screen.getByRole('alert').textContent).toContain('لم يُسمح باستخدام الميكروفون');
  });

  it('shows that microphone permission is pending when a browser delays callbacks', async () => {
    class PendingRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart = null;
      onend = null;
      onerror = null;
      onresult = null;
      start() {}
      stop() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: PendingRecognition,
    });
    const user = userEvent.setup();
    window.location.hash = '#/result';
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'اسأل بصوتك عن النتيجة' }));
    await user.click(screen.getByRole('button', { name: 'بدء الإدخال الصوتي' }));

    expect(screen.getByText('بانتظار إذن الميكروفون…')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'إيقاف الإدخال الصوتي' })).not.toBeNull();
  });
});
