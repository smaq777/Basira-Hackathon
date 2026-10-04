// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewerAccessBoundary } from './reviewer-auth.js';

const clerkState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false,
  getToken: vi.fn<() => Promise<string | null>>(),
  openUserProfile: vi.fn(),
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => clerkState,
  useClerk: () => ({
    openUserProfile: clerkState.openUserProfile,
    signOut: clerkState.signOut,
  }),
  SignInButton: ({ children }: { children: unknown }) => children,
  UserButton: () => <span>صورة الحساب</span>,
}));

describe('reviewer access boundary', () => {
  beforeEach(() => {
    clerkState.isLoaded = true;
    clerkState.isSignedIn = false;
    clerkState.getToken.mockReset();
    clerkState.openUserProfile.mockReset();
    clerkState.signOut.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows sign-in without requesting reviewer data when signed out', () => {
    render(
      <ReviewerAccessBoundary onHome={vi.fn()} onSignedOut={vi.fn()}>
        {(profile) => (
          <>
            <p>المساحة الخاصة</p>
            {profile}
          </>
        )}
      </ReviewerAccessBoundary>,
    );

    expect(screen.getByRole('button', { name: 'تسجيل الدخول بأمان' })).not.toBeNull();
    expect(screen.queryByText('المساحة الخاصة')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a signed-in but unauthorized account outside the workspace', async () => {
    clerkState.isSignedIn = true;
    clerkState.getToken.mockResolvedValue('session-token');
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 403 }));

    render(
      <ReviewerAccessBoundary onHome={vi.fn()} onSignedOut={vi.fn()}>
        {(profile) => (
          <>
            <p>المساحة الخاصة</p>
            {profile}
          </>
        )}
      </ReviewerAccessBoundary>,
    );

    expect(await screen.findByText('هذا الحساب غير مخول للمراجعة')).not.toBeNull();
    expect(screen.queryByText('المساحة الخاصة')).toBeNull();
  });

  it('renders reviewer content only after the protected API allows the session', async () => {
    clerkState.isSignedIn = true;
    clerkState.getToken.mockResolvedValue('session-token');
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, reviewer: true }), { status: 200 }),
    );

    render(
      <ReviewerAccessBoundary onHome={vi.fn()} onSignedOut={vi.fn()}>
        {(profile) => (
          <>
            <p>المساحة الخاصة</p>
            {profile}
          </>
        )}
      </ReviewerAccessBoundary>,
    );

    expect(await screen.findByText('المساحة الخاصة')).not.toBeNull();
    screen.getByRole('button', { name: 'إدارة الحساب' }).click();
    expect(clerkState.openUserProfile).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/reviewer/session',
        expect.objectContaining({ headers: { authorization: 'Bearer session-token' } }),
      ),
    );
  });

  it('refreshes the signed-out home only after Clerk terminates the session', async () => {
    clerkState.isSignedIn = true;
    clerkState.getToken.mockResolvedValue('session-token');
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, reviewer: true }), { status: 200 }),
    );
    const onSignedOut = vi.fn();
    let finishSignOut!: () => void;
    let signOutFinished = false;
    clerkState.signOut.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishSignOut = resolve;
      });
      signOutFinished = true;
    });

    render(
      <ReviewerAccessBoundary onHome={vi.fn()} onSignedOut={onSignedOut}>
        {(_profile, onSignOut) => (
          <button type="button" onClick={() => void onSignOut()}>
            تسجيل الخروج
          </button>
        )}
      </ReviewerAccessBoundary>,
    );

    (await screen.findByRole('button', { name: 'تسجيل الخروج' })).click();
    expect(clerkState.signOut).toHaveBeenCalledOnce();
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(signOutFinished).toBe(false);

    finishSignOut();
    await waitFor(() => expect(signOutFinished).toBe(true));
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it('keeps reviewer content hidden when a successful response has the wrong contract', async () => {
    clerkState.isSignedIn = true;
    clerkState.getToken.mockResolvedValue('session-token');
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    render(
      <ReviewerAccessBoundary onHome={vi.fn()} onSignedOut={vi.fn()}>
        {() => <p>المساحة الخاصة</p>}
      </ReviewerAccessBoundary>,
    );

    expect(await screen.findByText('تعذر التحقق من الصلاحية')).not.toBeNull();
    expect(screen.queryByText('المساحة الخاصة')).toBeNull();
  });
});
