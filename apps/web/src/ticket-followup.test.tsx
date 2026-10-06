// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadPublicHome, TicketScreen } from './App.js';

const receipt = {
  ticketCode: 'BR-A1B2C3D4E5F6',
  status: 'pending',
  hasEmail: false,
  notifyOptIn: false,
  createdAt: '2026-10-06T12:00:00.000Z',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('ticket follow-up confirmation return', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.scrollTo = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function open(contact: () => Promise<Response> = async () => json(receipt)) {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_path, init) =>
        init?.method === 'PATCH' ? contact() : json(receipt, 201),
      );
    const onFollowUpSaved = vi.fn();
    const view = render(
      <TicketScreen
        onHome={vi.fn()}
        reviewId="11111111-1111-4111-8111-111111111111"
        revisionId={null}
        onFollowUpSaved={onFollowUpSaved}
      />,
    );
    await act(async () => {});
    fireEvent.change(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), {
      target: { value: 'owned@example.test' },
    });
    return { ...view, fetchMock, onFollowUpSaved };
  }

  async function save() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'حفظ وإرسال التحديثات' }));
    });
  }

  it('sets only the public route and reloads once without clearing session data', () => {
    const location = { hash: '#/ticket', reload: vi.fn() };
    reloadPublicHome(location);
    expect(location.hash).toBe('#/home');
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('keeps confirmation for five seconds, prevents duplicate saves and returns once', async () => {
    const { onFollowUpSaved, fetchMock } = await open();
    await save();
    expect(screen.getByText('تم حفظ بيانات المتابعة وإرسال رقم التذكرة إلى بريدك.')).not.toBeNull();
    expect(screen.getByText('ستعود إلى الصفحة الرئيسية خلال ٥ ثوانٍ.').getAttribute('role')).toBe(
      'status',
    );
    expect(
      (screen.getByRole('button', { name: 'حفظ وإرسال التحديثات' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await save();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(onFollowUpSaved).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onFollowUpSaved).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(onFollowUpSaved).toHaveBeenCalledTimes(1);
  });

  it.each(['TICKET_CONTACT_SAVED_EMAIL_FAILED', 'INVALID_EMAIL'])(
    'stays on the ticket after %s',
    async (code) => {
      const { onFollowUpSaved } = await open(async () => json({ code }, 400));
      await save();
      expect(screen.getByRole('alert')).not.toBeNull();
      expect(screen.queryByText('تم حفظ بيانات المتابعة وإرسال رقم التذكرة إلى بريدك.')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(onFollowUpSaved).not.toHaveBeenCalled();
    },
  );

  it('does not redirect while contact saving is pending', async () => {
    const { onFollowUpSaved } = await open(() => new Promise(() => {}));
    await save();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(onFollowUpSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'جار الحفظ…' })).not.toBeNull();
  });

  it('cancels the return timer when the user leaves the ticket', async () => {
    const { unmount, onFollowUpSaved } = await open();
    await save();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(onFollowUpSaved).not.toHaveBeenCalled();
  });
});
