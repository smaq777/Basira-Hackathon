import { SignInButton, UserButton, useAuth, useClerk } from '@clerk/react';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { CircleNotch } from '@phosphor-icons/react/CircleNotch';
import { Lock } from '@phosphor-icons/react/Lock';
import { ShieldCheck } from '@phosphor-icons/react/ShieldCheck';
import { WarningCircle } from '@phosphor-icons/react/WarningCircle';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type AccessState = 'checking' | 'signed-out' | 'allowed' | 'forbidden' | 'error';

export function ReviewerAccessBoundary({
  children,
  onHome,
}: {
  children: (profile: ReactNode) => ReactNode;
  onHome: () => void;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { openUserProfile } = useClerk();
  const [access, setAccess] = useState<AccessState>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded) {
      setAccess('checking');
      return;
    }
    if (!isSignedIn) {
      setAccess('signed-out');
      return;
    }

    const controller = new AbortController();
    setAccess('checking');
    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setAccess('signed-out');
          return;
        }
        const response = await fetch('/api/v1/reviewer/session', {
          credentials: 'same-origin',
          headers: { authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (response.ok) {
          const body = (await response.json()) as {
            authenticated?: unknown;
            reviewer?: unknown;
          };
          setAccess(body.authenticated === true && body.reviewer === true ? 'allowed' : 'error');
        } else if (response.status === 401) setAccess('signed-out');
        else if (response.status === 403) setAccess('forbidden');
        else setAccess('error');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setAccess('error');
      }
    })();
    return () => controller.abort();
  }, [attempt, getToken, isLoaded, isSignedIn]);

  if (access === 'allowed')
    return children(
      <div className="reviewer-account-actions">
        <UserButton appearance={{ elements: { avatarBox: 'reviewer-auth-avatar' } }} />
        <button type="button" className="reviewer-account-button" onClick={() => openUserProfile()}>
          إدارة الحساب
        </button>
      </div>,
    );

  return (
    <main className="reviewer-auth-page page-enter" dir="rtl">
      <section className="reviewer-auth-card" aria-live="polite">
        <div className="reviewer-auth-mark" aria-hidden="true">
          {access === 'checking' ? (
            <CircleNotch className="spin" size={34} />
          ) : access === 'forbidden' || access === 'error' ? (
            <WarningCircle size={34} />
          ) : (
            <Lock size={34} />
          )}
        </div>
        {access === 'checking' ? (
          <>
            <h1>جاري التحقق من صلاحية المراجع</h1>
            <p>نتحقق من الجلسة والصلاحية من الخادم قبل عرض أي محتوى للمراجعين.</p>
          </>
        ) : access === 'signed-out' ? (
          <>
            <span className="eyebrow">
              <ShieldCheck size={18} /> مساحة محمية
            </span>
            <h1>تسجيل دخول المراجع</h1>
            <p>
              مساحة المراجعة التجريبية متاحة للمشاركين بعد تسجيل الدخول. تبقى مراجعة النص العامة
              متاحة دون حساب.
            </p>
            <SignInButton mode="modal">
              <button className="button button--primary">تسجيل الدخول بأمان</button>
            </SignInButton>
          </>
        ) : access === 'forbidden' ? (
          <>
            <h1>هذا الحساب غير مخول للمراجعة</h1>
            <p>تم تسجيل الدخول بنجاح، لكن الحساب ليس ضمن قائمة المراجعين المعتمدة لهذا الإصدار.</p>
            <div className="reviewer-auth-profile">
              <UserButton />
              <span>يمكنك تبديل الحساب أو تسجيل الخروج.</span>
            </div>
          </>
        ) : (
          <>
            <h1>تعذر التحقق من الصلاحية</h1>
            <p>لم نعرض مساحة المراجع. أعد المحاولة، وستبقى البيانات محمية أثناء الانقطاع.</p>
            <button
              className="button button--primary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              إعادة المحاولة
            </button>
          </>
        )}
        <button className="button button--ghost" onClick={onHome}>
          <ArrowLeft size={20} /> العودة إلى المراجعة العامة
        </button>
      </section>
    </main>
  );
}

export function ReviewerAuthUnavailable({ onHome }: { onHome: () => void }) {
  return (
    <main className="reviewer-auth-page page-enter" dir="rtl">
      <section className="reviewer-auth-card" role="alert">
        <div className="reviewer-auth-mark reviewer-auth-mark--warning" aria-hidden="true">
          <WarningCircle size={34} />
        </div>
        <h1>دخول المراجع غير متاح حاليًا</h1>
        <p>لم تُفعّل هوية المراجعين في هذه البيئة. لم نفتح مساحة المراجعة دون حماية.</p>
        <button className="button button--outline" onClick={onHome}>
          <ArrowLeft size={20} /> العودة إلى المراجعة العامة
        </button>
      </section>
    </main>
  );
}
