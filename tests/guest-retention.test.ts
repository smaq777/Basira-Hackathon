import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { renewOwnedGuestSession, OwnershipError } from '../apps/api/src/database.js';

it('renews the owned live session without weakening RLS or reviving expired/deleted data', async () => {
  const query = vi.fn().mockResolvedValue({ rowCount: 1 });
  await renewOwnedGuestSession({ query } as unknown as PoolClient, 24);
  const [sql, values] = query.mock.calls[0]!;
  expect(values).toEqual([24]);
  expect(sql).toContain('basirah_private.current_session_id()');
  expect(sql).toContain('deleted_at is null and expires_at > clock_timestamp()');
  expect(sql).toContain('greatest(expires_at');
  expect(sql).not.toMatch(/security definer|disable row level security/i);
});

it('rejects zero-row renewal and invalid retention, leaving the enclosing save to roll back', async () => {
  const query = vi.fn().mockResolvedValue({ rowCount: 0 });
  await expect(
    renewOwnedGuestSession({ query } as unknown as PoolClient, 24),
  ).rejects.toBeInstanceOf(OwnershipError);
  for (const hours of [0, 25, 1.5, NaN])
    await expect(renewOwnedGuestSession({ query } as unknown as PoolClient, hours)).rejects.toThrow(
      'INVALID_RETENTION_CONFIGURATION',
    );
  expect(query).toHaveBeenCalledOnce();
});
