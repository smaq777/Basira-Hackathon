// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { ExpandableText, reloadSignedOutHome, ReviewerShell } from './App.js';
import {
  foundationReportFixture,
  ownedReviewFixture,
  ORIGINAL_TEXT,
  REVIEW_ID,
  REVISION_ID,
} from './foundation-report.fixtures.js';

const initialViewportHeight = window.innerHeight;

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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: initialViewportHeight,
    });
  });

  it('preserves complete bounded raw text and rejects oversize or unsafe edits', () => {
    render(<App />);
    const textarea = screen.getByRole('textbox', {
      name: 'النص المراد مراجعته',
    }) as HTMLTextAreaElement;
    const accepted = `${'ن'.repeat(2998)}😀`;
    fireEvent.change(textarea, { target: { value: accepted } });
    expect(textarea.value).toBe(accepted);
    fireEvent.change(textarea, { target: { value: `${accepted}ن` } });
    expect(textarea.value).toBe(accepted);
    expect(screen.getByRole('alert').textContent).toContain('بقي النص الحالي كما هو');
    fireEvent.change(textarea, { target: { value: 'نص غير صالح\u0000' } });
    expect(textarea.value).toBe(accepted);
    expect(screen.getByRole('alert').textContent).toContain('محارف غير صالحة');
  });

  it('rejects native paste whole instead of truncating at an emoji boundary', () => {
    render(<App />);
    const textarea = screen.getByRole('textbox', {
      name: 'النص المراد مراجعته',
    }) as HTMLTextAreaElement;
    const accepted = 'ن'.repeat(2999);
    fireEvent.change(textarea, { target: { value: accepted } });
    textarea.setSelectionRange(accepted.length, accepted.length);
    fireEvent.paste(textarea, { clipboardData: { getData: () => '😀' } });
    expect(textarea.value).toBe(accepted);
    expect(screen.getByRole('alert').textContent).toContain('الحد الأقصى ٣٠٠٠');
    textarea.setSelectionRange(2998, 2999);
    fireEvent.paste(textarea, { clipboardData: { getData: () => '😀' } });
    expect(textarea.value).toBe(`${'ن'.repeat(2998)}😀`);
  });

  it('rejects the oversized clipboard button payload while preserving the draft', async () => {
    const user = userEvent.setup();
    const readText = vi.fn().mockResolvedValue(`${'ن'.repeat(2999)}😀`);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<App />);
    const textarea = screen.getByRole('textbox', {
      name: 'النص المراد مراجعته',
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'النص الحالي' } });
    await user.click(screen.getByRole('button', { name: 'لصق نص' }));
    expect(textarea.value).toBe('النص الحالي');
    expect(screen.getByRole('alert').textContent).toContain('بقي النص الحالي كما هو');
    readText.mockResolvedValue('  قَالَ الكاتب 😀\nنص محفوظ  ');
    await user.click(screen.getByRole('button', { name: 'لصق نص' }));
    expect(textarea.value).toBe('  قَالَ الكاتب 😀\nنص محفوظ  ');
  });

  it('grows to the viewport cap and keeps the highlight content box and scroll aligned', () => {
    render(<App />);
    const textarea = screen.getByRole('textbox', {
      name: 'النص المراد مراجعته',
    }) as HTMLTextAreaElement;
    const overlay = document.querySelector('.composer-highlights') as HTMLDivElement;
    Object.defineProperties(textarea, {
      scrollHeight: { configurable: true, value: 1000 },
      clientWidth: { configurable: true, value: 480 },
      clientHeight: { configurable: true, value: 360 },
      clientLeft: { configurable: true, value: 17 },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    fireEvent.change(textarea, { target: { value: 'سطر عربي طويل\n'.repeat(80) } });
    expect(textarea.style.height).toBe('360px');
    expect(overlay.style.width).toBe('480px');
    expect(overlay.style.left).toBe('17px');
    expect(overlay.style.height).toBe('360px');
    textarea.scrollTop = 200;
    textarea.scrollLeft = -12;
    fireEvent.scroll(textarea);
    expect(overlay.scrollTop).toBe(200);
    expect(overlay.scrollLeft).toBe(-12);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    fireEvent(window, new Event('resize'));
    expect(textarea.style.height).toBe('270px');
    expect(overlay.scrollTop).toBe(textarea.scrollTop);
  });

  it('clears old classification on edit and ignores an aborted late response', async () => {
    vi.useFakeTimers();
    const pending: Array<(response: Response) => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    render(<App />);
    const textarea = screen.getByRole('textbox', {
      name: 'النص المراد مراجعته',
    }) as HTMLTextAreaElement;
    const packet = (text: string) =>
      new Response(
        JSON.stringify({
          mode: 'local_demo',
          verification: false,
          corpusVersion: 'software-fixture-v1',
          inputHash: 'a'.repeat(64),
          offsetUnit: 'utf16_code_unit',
          annotations: [
            {
              id: 'owned-annotation',
              text,
              startOffset: 0,
              endOffset: text.length,
              contentType: 'quran',
              contentTypeLabel: 'آية قرآنية',
              classificationBasis: 'fixture_match',
            },
          ],
          findings: [],
          warnings: ['annotation_limit_reached'],
        }),
      );
    const first = 'نص أول طويل للتصنيف الأولي';
    fireEvent.change(textarea, { target: { value: first } });
    await vi.advanceTimersByTimeAsync(450);
    await act(async () => {
      pending[0]!(packet(first));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(document.querySelector('.semantic-highlight--quran')).not.toBeNull();
    expect(
      screen.getByText('التصنيف الأولي المعروض جزئي؛ راجع بقية النص في التقرير.'),
    ).not.toBeNull();
    const second = 'نص ثان طويل للتصنيف الأولي';
    fireEvent.change(textarea, { target: { value: second } });
    expect(document.querySelector('.semantic-highlight--quran')).toBeNull();
    expect(screen.queryByLabelText('دليل ألوان تصنيف أجزاء النص')).toBeNull();
    expect(
      screen.queryByText('التصنيف الأولي المعروض جزئي؛ راجع بقية النص في التقرير.'),
    ).toBeNull();
    await vi.advanceTimersByTimeAsync(450);
    fireEvent.change(textarea, { target: { value: 'نص ثالث مختلف لا يحمل النتيجة السابقة' } });
    await act(async () => {
      pending[1]!(packet(second));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(document.querySelector('.semantic-highlight--quran')).toBeNull();
  });

  it('renders pasted markup literally in the overlay without creating an element', () => {
    render(<App />);
    const textarea = screen.getByRole('textbox', {
      name: 'النص المراد مراجعته',
    }) as HTMLTextAreaElement;
    const raw = '<img id="owned-injection" src=x onerror="alert(1)"> نص عربي 😀';
    fireEvent.paste(textarea, { clipboardData: { getData: () => raw } });
    expect(textarea.value).toBe(raw);
    expect(document.querySelector('.composer-highlights')!.textContent).toContain(raw);
    expect(document.getElementById('owned-injection')).toBeNull();
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

  it('offers a direct human-review ticket when automated analysis is unavailable', async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input);
      if (path === '/api/v1/capabilities')
        return json({ foundationReview: false, guestDocuments: true });
      if (path === '/api/v1/documents')
        return json(
          { documentId: '11111111-1111-4111-8111-111111111111', revisionId: REVISION_ID },
          201,
        );
      if (path === `/api/v1/revisions/${REVISION_ID}/extractions`)
        return json({ extraction: { candidates: [], warnings: [] } });
      if (path === `/api/v1/revisions/${REVISION_ID}/tickets`)
        return json(
          {
            ticketCode: 'BR-A1B2C3D4E5F6',
            status: 'pending',
            hasEmail: false,
            notifyOptIn: false,
            createdAt: '2026-10-05T12:00:00.000Z',
          },
          201,
        );
      return json({ mode: 'local_demo', annotations: [], findings: [], warnings: [] });
    });
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await user.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    expect(
      await screen.findByRole('heading', { name: 'حفظنا النص، ولم نصدر نتيجة غير موثقة' }),
    ).not.toBeNull();
    expect(window.location.hash).toBe(`#/result?revisionId=${REVISION_ID}`);
    expect(screen.queryByText('اكتملت المقارنة')).toBeNull();
    await user.click(screen.getByRole('button', { name: /إرسال النص للمراجعة/ }));

    expect(await screen.findByRole('heading', { name: 'تم إنشاء تذكرتك' })).not.toBeNull();
    expect(window.location.hash).toBe(`#/ticket?revisionId=${REVISION_ID}`);
    expect(
      fetchMock.mock.calls.some(([path]) => path === `/api/v1/revisions/${REVISION_ID}/tickets`),
    ).toBe(true);
  });

  it('keeps one analysis request alive across a parent rerender and opens the result', async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    let resolveDocument!: (response: Response) => void;
    const pendingDocument = new Promise<Response>((resolve) => {
      resolveDocument = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input);
      if (path === '/api/v1/capabilities')
        return json({ foundationReview: true, guestDocuments: true });
      if (path === '/api/v1/documents') return pendingDocument;
      if (path === `/api/v1/revisions/${REVISION_ID}/extractions`)
        return json({ extraction: { candidates: [], warnings: [] } });
      if (path === '/api/v1/reviews') return json(ownedReviewFixture(), 202);
      if (path === `/api/v1/reviews/${REVIEW_ID}/report`)
        return json({ report: foundationReportFixture() });
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    const view = render(<App />);

    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await user.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/documents')).toHaveLength(1),
    );
    view.rerender(<App />);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/documents')).toHaveLength(1);
    const draft = fetchMock.mock.calls.find(([path]) => path === '/api/v1/documents')!;
    expect(draft[1]?.signal?.aborted).toBe(false);
    await act(async () =>
      resolveDocument(json({ documentId: 'doc', revisionId: REVISION_ID }, 201)),
    );

    expect(
      await screen.findByRole('heading', { name: 'راجع النقل وحدود الاستدلال' }),
    ).not.toBeNull();
    expect(window.location.hash).toBe(`#/result?reviewId=${REVIEW_ID}`);
    expect(screen.getByLabelText('النص الأصلي مع مواضع النقل').textContent).toBe(ORIGINAL_TEXT);
    expect(JSON.parse(String(draft[1]?.body)).text).toBe(ORIGINAL_TEXT);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/capabilities',
      '/api/v1/documents',
      `/api/v1/revisions/${REVISION_ID}/extractions`,
      '/api/v1/capabilities',
      '/api/v1/reviews',
      `/api/v1/reviews/${REVIEW_ID}/report`,
      '/api/v1/capabilities', // existing rewrite availability
      '/api/v1/capabilities', // strict ticket presentation availability
    ]);
    expect(screen.queryByRole('button', { name: /إرسال النص للمراجعة/ })).toBeNull();
  });

  it('aborts the in-flight analysis request when the user leaves the analysis route', async () => {
    const request: { signal: AbortSignal | null } = { signal: null };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      if (String(_input) === '/api/v1/capabilities')
        return Promise.resolve(
          new Response(JSON.stringify({ foundationReview: true, guestDocuments: true }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      if (String(_input) !== '/api/v1/documents')
        throw new Error(`Unexpected request: ${String(_input)}`);
      request.signal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        request.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      });
    });
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByRole('textbox', { name: 'النص المراد مراجعته' }), {
      target: { value: ORIGINAL_TEXT },
    });
    await user.click(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
    await waitFor(() => expect(request.signal).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'إلغاء والعودة للنص' }));

    expect(request.signal?.aborted).toBe(true);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/capabilities',
      '/api/v1/documents',
    ]);
    expect(
      (screen.getByRole('textbox', { name: 'النص المراد مراجعته' }) as HTMLTextAreaElement).value,
    ).toBe(ORIGINAL_TEXT);
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

  it('keeps the color legend without rendering detailed preliminary finding cards', async () => {
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

    await waitFor(() =>
      expect(document.querySelector('.semantic-highlight--quran')).not.toBeNull(),
    );
    expect((await screen.findAllByText('آية قرآنية')).length).toBeGreaterThan(0);
    expect(screen.queryByText('قد يكون الاقتباس ناقصًا.')).toBeNull();
    expect(screen.queryByLabelText('نتائج الرصد الأولي')).toBeNull();
    expect(screen.queryByText(/رصد أولي محلي/)).toBeNull();
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

  it('uses one public navigation with links to sections that still exist', () => {
    render(<App />);

    const navigation = screen.getByRole('navigation', { name: 'التنقل الرئيسي' });
    expect(navigation.querySelectorAll('button')).toHaveLength(4);
    expect(within(navigation).getByRole('button', { name: 'مراجعة النص' })).not.toBeNull();
    expect(within(navigation).getByRole('button', { name: 'كيف تعمل' })).not.toBeNull();
    expect(within(navigation).getByRole('button', { name: 'الأسئلة الشائعة' })).not.toBeNull();
    expect(within(navigation).getByRole('button', { name: 'عن التحدي' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'المصادر والحدود' })).toBeNull();
  });

  it('explains sources, human review, tickets, and knowledge-base growth in the FAQ', () => {
    render(<App />);

    expect(document.querySelectorAll('.faq-list details')).toHaveLength(7);
    expect(screen.getByText('ما المصادر التي تعتمد عليها بصيرة؟')).not.toBeNull();
    expect(screen.getByText('كيف تعمل المراجعة البشرية؟')).not.toBeNull();
    expect(screen.getByText('هل يمكنني استلام نتيجة التذكرة بعد المراجعة؟')).not.toBeNull();
    expect(screen.getByText('كيف تساعد مشاركتي في تطوير بصيرة؟')).not.toBeNull();
    expect(screen.queryByText('ماذا يقرأ المشغّل الصوتي؟')).toBeNull();
    expect(screen.queryByText('شرح صوتي للنتيجة')).toBeNull();
    expect(screen.getByText(/لا تصدر فتوى أو حكمًا شرعيًا/)).not.toBeNull();
    expect(screen.getByText(/مجموعة منتقاة من النصوص والمراجع الإسلامية الموثقة/)).not.toBeNull();
    expect(screen.getByText(/احتفظ بالرقم المرجعي/)).not.toBeNull();
  });

  it('keeps the revised homepage copy concise and identifies challenge partners', () => {
    render(<App />);

    expect(screen.getByText('يمكنك البدء كضيف.')).not.toBeNull();
    expect(screen.queryByText(/تنتهي صلاحية الوصول للمسودة بعد 24 ساعة/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'مراجعة واضحة بالدليل وحدوده' })).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'جهات تصنع الأثر في تحدي المحتوى الإسلامي' }),
    ).not.toBeNull();
    expect(screen.getByRole('img', { name: 'وزارة الاتصالات وتقنية المعلومات' })).not.toBeNull();
    expect(
      screen.getByRole('img', {
        name: 'الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا)',
      }),
    ).not.toBeNull();
    expect(screen.getByRole('img', { name: 'شركة التحول التقني' })).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Future Frontiers' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'الموقع الرسمي للتحدي' }).getAttribute('href')).toBe(
      'https://islamicaich.org/#partners-sponsors',
    );
    expect(
      screen.getByRole('link', { name: 'كيف نعرض المصادر في النتيجة' }).getAttribute('href'),
    ).toBe('#sources');
    expect(screen.getByRole('heading', { name: 'مصادر موثقة' })).not.toBeNull();
  });

  it('renders the authorized reviewer workspace with a simple labelled sidebar', () => {
    render(<ReviewerShell route="dashboard" navigate={vi.fn()} onSignOut={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'مساحة المراجع' })).not.toBeNull();
    expect(screen.getByRole('button', { name: /طلبات المراجعة/ })).not.toBeNull();
    expect(screen.getByText('بيانات التذاكر المحمية')).not.toBeNull();
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

  it('shows a useful empty state while the reviewer queue has no rows', () => {
    window.location.hash = '#/reviewer/queue';
    render(<ReviewerShell route="queue" navigate={vi.fn()} onSignOut={vi.fn()} />);

    expect(screen.getByText('لا توجد طلبات هنا')).not.toBeNull();
    expect(screen.getByText('جرّب تغيير التصفية أو البحث بكلمات أخرى.')).not.toBeNull();
  });

  it('shows a recoverable reviewer error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    window.location.hash = '#/reviewer/queue';
    render(<ReviewerShell route="queue" navigate={vi.fn()} onSignOut={vi.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toContain('تعذر تحميل الطلبات');
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
