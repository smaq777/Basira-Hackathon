import { useEffect, useRef, useState } from 'react';
import type { FoundationReport } from '../../../packages/contracts/src/foundation.js';
import { readableSourceCitation } from '../../../packages/contracts/src/source-citation.js';
import {
  RewriteCandidateSchema,
  type RewriteCandidate,
} from '../../../packages/contracts/src/rewrite.js';

async function request(path: string, init: RequestInit = {}, signal?: AbortSignal) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
      : AbortSignal.timeout(12_000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error('تعذر إكمال الاقتراح. بقي النص الأصلي كما هو؛ أعد المحاولة لاحقًا.');
  return body;
}
function candidateFrom(body: unknown, report: FoundationReport) {
  const value = RewriteCandidateSchema.parse((body as { candidate: unknown }).candidate);
  if (
    value.reviewId !== report.reviewId ||
    value.revisionId !== report.revisionId ||
    value.inputSha256 !== report.inputSha256 ||
    value.evidenceStateSha256 !== report.evidenceStateSha256
  )
    throw new Error('تغيّر التقرير المرتبط بالاقتراح. حدّث التقرير قبل المحاولة.');
  return value;
}
export function RewritePanel({ report }: { report: FoundationReport }) {
  const [enabled, setEnabled] = useState(false);
  const [wordingMode, setWordingMode] = useState(false);
  const [candidate, setCandidate] = useState<RewriteCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef<RewriteCandidate | null>(null);
  const controller = useRef<AbortController | null>(null);
  const copyController = useRef<AbortController | null>(null);
  const cancelController = useRef<AbortController | null>(null);
  const activeBinding = useRef('');
  const requestKey = useRef<string | null>(null);
  const base = `/api/v1/reviews/${encodeURIComponent(report.reviewId)}/rewrites`;
  const reportBinding = `${report.reviewId}:${report.revisionId}:${report.inputSha256}:${report.evidenceStateSha256}`;
  activeBinding.current = reportBinding;
  useEffect(() => {
    const abort = new AbortController();
    current.current = null;
    requestKey.current = null;
    setCandidate(null);
    setBusy(false);
    setMessage('');
    setEnabled(false);
    void request('/api/v1/capabilities', {}, abort.signal)
      .then((body) => {
        if (!abort.signal.aborted) {
          setEnabled(
            body.draftRewrite === true &&
              ['citation_and_layout_only', 'supported_author_wording'].includes(
                body.draftRewriteMode,
              ),
          );
          setWordingMode(body.draftRewriteMode === 'supported_author_wording');
        }
      })
      .catch(() => undefined);
    return () => {
      abort.abort();
      controller.current?.abort();
      copyController.current?.abort();
      cancelController.current?.abort();
      if (requestKey.current && (!current.current || current.current.status === 'pending'))
        void request(base, {
          method: 'DELETE',
          headers: { 'Idempotency-Key': requestKey.current },
          body: '{}',
        }).catch(() => undefined);
    };
  }, [base, reportBinding]);
  const generate = async () => {
    if (busy) return;
    // Let an earlier cancellation reach the server, but ignore its late UI result.
    if (cancelController.current) {
      cancelController.current = null;
      requestKey.current = null;
    }
    const abort = new AbortController();
    const expectedBinding = reportBinding;
    controller.current = abort;
    setBusy(true);
    setMessage('');
    setCandidate(null);
    requestKey.current ??= crypto.randomUUID();
    try {
      let value = candidateFrom(
        await request(
          base,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': requestKey.current },
            body: JSON.stringify({
              inputSha256: report.inputSha256,
              evidenceStateSha256: report.evidenceStateSha256,
            }),
          },
          abort.signal,
        ),
        report,
      );
      if (
        abort.signal.aborted ||
        activeBinding.current !== expectedBinding ||
        controller.current !== abort
      ) {
        void request(`${base}/${value.id}`, { method: 'DELETE' }).catch(() => undefined);
        return;
      }
      current.current = value;
      setCandidate(value);
      while (value.status === 'pending') {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            abort.signal.removeEventListener('abort', cancel);
            resolve();
          }, 400);
          const cancel = () => {
            clearTimeout(timer);
            reject(new Error('cancelled'));
          };
          abort.signal.addEventListener('abort', cancel, { once: true });
          if (abort.signal.aborted) cancel();
        });
        value = candidateFrom(await request(`${base}/${value.id}`, {}, abort.signal), report);
        if (
          abort.signal.aborted ||
          activeBinding.current !== expectedBinding ||
          controller.current !== abort
        )
          return;
        current.current = value;
        setCandidate(value);
      }
      if (value.status !== 'validated') {
        requestKey.current = null;
        setMessage(
          value.errorCode === 'invalid_candidate'
            ? 'لم يجتز الاقتراح فحوص حفظ النص والتوثيق. بقي الأصل كما هو.'
            : 'لم يكتمل الاقتراح. بقي الأصل كما هو؛ يمكنك المحاولة لاحقًا.',
        );
      }
    } catch (error) {
      if (
        !abort.signal.aborted &&
        activeBinding.current === expectedBinding &&
        controller.current === abort
      )
        setMessage('تعذر إنشاء الاقتراح أو التحقق من بياناته. بقي الأصل كما هو.');
    } finally {
      if (
        !abort.signal.aborted &&
        activeBinding.current === expectedBinding &&
        controller.current === abort
      )
        setBusy(false);
    }
  };
  const cancel = async () => {
    controller.current?.abort();
    cancelController.current?.abort();
    const abort = new AbortController();
    cancelController.current = abort;
    const expectedBinding = reportBinding;
    const key = requestKey.current;
    setBusy(false);
    try {
      if (key) {
        const value = candidateFrom(
          await request(
            base,
            {
              method: 'DELETE',
              headers: { 'Idempotency-Key': key },
              body: '{}',
            },
            abort.signal,
          ),
          report,
        );
        if (
          abort.signal.aborted ||
          activeBinding.current !== expectedBinding ||
          cancelController.current !== abort
        )
          return;
        current.current = value;
        setCandidate(value);
      }
      if (
        abort.signal.aborted ||
        activeBinding.current !== expectedBinding ||
        cancelController.current !== abort
      )
        return;
      setMessage('أُلغي الاقتراح وبقي النص الأصلي كما هو.');
      if (requestKey.current === key) requestKey.current = null;
    } catch {
      if (
        !abort.signal.aborted &&
        activeBinding.current === expectedBinding &&
        cancelController.current === abort
      )
        setMessage('تعذر تأكيد الإلغاء. حدّث التقرير قبل المحاولة.');
    }
  };
  const copy = async () => {
    if (candidate?.status !== 'validated') return;
    copyController.current?.abort();
    const abort = new AbortController();
    copyController.current = abort;
    const selected = candidate;
    const expectedBinding = reportBinding;
    setMessage('');
    try {
      const body = await request(
        `${base}/${selected.id}/copy`,
        { method: 'POST', body: '{}' },
        abort.signal,
      );
      if (
        abort.signal.aborted ||
        activeBinding.current !== expectedBinding ||
        current.current?.id !== selected.id
      )
        return;
      if (typeof body.text !== 'string' || body.text !== selected.text)
        throw new Error('تغيّر الاقتراح؛ أعد تحميله.');
      await navigator.clipboard.writeText(body.text);
      if (!abort.signal.aborted && activeBinding.current === expectedBinding)
        setMessage(
          candidate.operations?.citations.length
            ? 'نُسخ النص المقترح مع التوثيق.'
            : 'نُسخ النص المقترح.',
        );
    } catch {
      if (!abort.signal.aborted && activeBinding.current === expectedBinding)
        setMessage('تعذر نسخ الاقتراح أو انتهت صلاحيته. بقي الأصل كما هو.');
    }
  };
  if (!enabled) return null;
  return (
    <section
      className="source-panel foundation-rewrite-panel"
      aria-label={wordingMode ? 'اقتراح تحسين صياغة النص' : 'اقتراح تنسيق وتوثيق النص'}
    >
      <h2>{wordingMode ? 'تحسين الصياغة وإضافة التوثيق' : 'تنسيق النص وإضافة التوثيق'}</h2>
      <p>
        {wordingMode
          ? 'اقتراح بحثي يحسّن ألفاظ الكاتب في العبارات المدعومة فقط، مع فحص مستقل لحفظ المعنى والشروط والتوثيق. يحفظ الاقتباسات كما وردت، ويبقي النص غير المدعوم أو غير المراجع دون تغيير. لا يمثل اعتمادًا علميًا.'
          : 'اقتراح بحثي منفصل يضيف فواصل فقرات ومراجع مسجلة. يحفظ ألفاظ النص وشروطه؛ لا يصحح الادعاءات أو يقوّي الاستدلال. لا يمثل اعتمادًا علميًا.'}
      </p>
      <button className="button button--outline" disabled={busy} onClick={() => void generate()}>
        {busy
          ? 'جار إعداد الاقتراح وفحصه'
          : wordingMode
            ? 'تحسين الصياغة وإضافة التوثيق'
            : 'تنسيق النص وإضافة التوثيق'}
      </button>
      {busy && (
        <button className="button button--ghost" onClick={() => void cancel()}>
          إلغاء الاقتراح
        </button>
      )}
      {candidate?.status === 'validated' && (
        <>
          <h3>النص المقترح — للمراجعة</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{candidate.text}</p>
          {!candidate.operations?.citations.length &&
            !candidate.operations?.paragraphBreaks.length &&
            !candidate.operations?.replacements?.length && (
              <p>لم ينتج الاقتراح إضافة مناسبة؛ النص المعروض هو الأصل كما ورد، دون توثيق جديد.</p>
            )}
          {!!candidate.operations?.paragraphBreaks.length &&
            !candidate.operations?.citations.length &&
            !candidate.operations?.replacements?.length && (
              <p>اقتُرح ترتيب الفقرات فقط؛ لم تُضف مراجع جديدة.</p>
            )}
          <details>
            <summary>مقارنة التغييرات مع الأصل</summary>
            <p style={{ whiteSpace: 'pre-wrap' }}>{report.intake.originalText}</p>
            <ul>
              {candidate.operations?.replacements?.map((replacement) => (
                <li key={replacement.claimId}>
                  <p>
                    الصياغة الأصلية: <del>{replacement.originalText}</del>
                  </p>
                  <p>
                    الصياغة المقترحة: <ins>{replacement.replacementText}</ins>
                  </p>
                </li>
              ))}
              {candidate.operations?.paragraphBreaks.map((offset) => (
                <li key={`p${offset}`}>
                  فصل الفقرة بعد «
                  {report.intake.originalText.slice(Math.max(0, offset - 45), offset).trim()}»
                </li>
              ))}
              {candidate.operations?.citations.map((c) => (
                <li key={`${c.offset}:${c.evidenceKey}`}>
                  توثيق بعد «
                  {report.intake.originalText.slice(Math.max(0, c.offset - 45), c.offset).trim()}»:{' '}
                  {(() => {
                    const source = report.intake.evidence.find(
                      (s) => s.snapshotKey === c.evidenceKey,
                    );
                    return source ? readableSourceCitation(source) : 'مرجع غير متاح';
                  })()}
                </li>
              ))}
            </ul>
          </details>
          {wordingMode && (
            <p>
              {candidate.operations?.replacements?.length
                ? 'حُسّنت العبارات المعروضة في المقارنة فقط. بقيت بقية العبارات، بما فيها غير المدعومة أو غير المراجعة، كما وردت.'
                : 'لم تنتج صياغة بديلة اجتازت الفحوص؛ بقيت ألفاظ الكاتب كما وردت.'}
            </p>
          )}
          {candidate.unresolved.length > 0 && (
            <div>
              <h3>مواضع ما زالت تحتاج إلى مراجعة</h3>
              <ul>
                {candidate.unresolved.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="button button--primary" onClick={() => void copy()}>
            نسخ النص المقترح
          </button>
          <p>
            الاقتراح مؤقت لعشر دقائق داخل جلستك؛ تحديث الصفحة لا يضمن استعادته. النسخ لا يستبدل
            الأصل ولا ينشره.
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
