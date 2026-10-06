import { expect, it, vi } from 'vitest';
import {
  rewriteDiagnosticSink,
  type RewriteFailureReceipt,
} from '../apps/api/src/rewrite-diagnostics.js';

const receipt: RewriteFailureReceipt = {
  event: 'rewrite_failed',
  stage: 'candidate_validation',
  reason: 'claim_binding',
  inputSha256: 'a'.repeat(64),
  evidenceStateSha256: 'b'.repeat(64),
  operationsSha256: 'c'.repeat(64),
  verificationSha256: null,
};

it('produces no diagnostic sink without exact explicit opt-in', () => {
  const write = vi.fn();
  for (const value of [undefined, 'false', 'TRUE', '1'])
    expect(
      rewriteDiagnosticSink({ FOUNDATION_REWRITE_DIAGNOSTIC_RECEIPTS: value }, write),
    ).toBeUndefined();
  expect(write).not.toHaveBeenCalled();
});

it('writes only a strict typed reason/stage and packet hashes after opt-in', () => {
  const write = vi.fn();
  rewriteDiagnosticSink({ FOUNDATION_REWRITE_DIAGNOSTIC_RECEIPTS: 'true' }, write)!(receipt);
  expect(write).toHaveBeenCalledWith(JSON.stringify(receipt));
});

it('refuses extra text, credentials, IDs, arbitrary reasons and invalid hashes before writing', () => {
  const write = vi.fn();
  const sink = rewriteDiagnosticSink({ FOUNDATION_REWRITE_DIAGNOSTIC_RECEIPTS: 'true' }, write)!;
  for (const invalid of [
    { ...receipt, sourceText: 'source content must not reach logs' },
    { ...receipt, originalText: 'author content must not reach logs' },
    { ...receipt, authorization: 'a private credential' },
    { ...receipt, reviewId: 'a private account/report identifier' },
    { ...receipt, reason: 'untrusted provider error text' },
    { ...receipt, inputSha256: 'untrusted arbitrary text' },
  ])
    expect(() => sink(invalid as RewriteFailureReceipt)).toThrow();
  expect(write).not.toHaveBeenCalled();
});
