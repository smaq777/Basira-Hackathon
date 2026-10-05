import type { ClaimGapDiscovery } from './claim-retrieval.js';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { sha256 } from './foundation.js';

function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('discovery_timeout_or_cancelled'));
    if (signal.aborted) {
      // Attach a rejection handler even when a late provider promise is abandoned.
      void promise.catch(() => undefined);
      return abort();
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** At most two unique page originals; correlated providers do not duplicate a page. */
export function createCompositeGapDiscovery(options: {
  primary: ClaimGapDiscovery;
  fallback?: ClaimGapDiscovery;
  timeoutMs?: number;
  stageTimeoutMs?: number;
}): ClaimGapDiscovery {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const stageTimeoutMs = options.stageTimeoutMs ?? 15_000;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000 ||
    !Number.isInteger(stageTimeoutMs) ||
    stageTimeoutMs < 1 ||
    stageTimeoutMs > 15_000
  )
    throw new Error('discovery_invalid_configuration');
  return {
    async discover(claim, gap, external) {
      const deadline = Date.now() + timeoutMs;
      const overall = AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        ...(external ? [external] : []),
      ]);
      const evidence: SourceEvidence[] = [];
      const failureCodes: string[] = [];
      const urls = new Set<string>();
      const addFailure = (code: unknown) => {
        if (failureCodes.length >= 9) return;
        failureCodes.push(
          typeof code === 'string' && /^discovery_[a-z_0-9]{1,90}$/u.test(code)
            ? code
            : 'discovery_provider_unavailable',
        );
      };
      for (const provider of [options.primary, options.fallback]) {
        if (!provider || evidence.length === 2) break;
        const remaining = deadline - Date.now();
        if (overall.aborted || remaining < 1) {
          addFailure('discovery_timeout_or_cancelled');
          break;
        }
        const budget = Math.min(stageTimeoutMs, remaining);
        const child = AbortSignal.any([overall, AbortSignal.timeout(budget)]);
        // Cooperative acquisition returns retained partial pages after catching
        // its current fetch's cancellation. Give it 50ms to do so, within the
        // same overall deadline; an uncooperative provider cannot hang the route.
        const cleanup = AbortSignal.any([overall, AbortSignal.timeout(budget + 50)]);
        try {
          const result = await bounded(
            Promise.resolve().then(() => provider.discover(claim, gap, child)),
            cleanup,
          );
          if (!Array.isArray(result.evidence) || !Array.isArray(result.failureCodes)) {
            addFailure('discovery_invalid_response');
            continue;
          }
          result.failureCodes.slice(0, 9).forEach(addFailure);
          for (const item of result.evidence.slice(0, 3)) {
            if (evidence.length === 2) break;
            const parsed = SourceEvidenceSchema.safeParse(item);
            if (!parsed.success) {
              addFailure('discovery_invalid_source');
              continue;
            }
            const row = parsed.data;
            try {
              const url = new URL(row.sourceUrl ?? '');
              if (
                url.protocol !== 'https:' ||
                url.username ||
                url.password ||
                url.port ||
                url.search ||
                row.approvalStatus !== 'pending' ||
                row.researchOnly !== true ||
                row.provenance.scholarlyApproval !== false ||
                row.provenance.representation !== 'extracted_markdown' ||
                sha256(row.originalText) !== row.originalSha256
              )
                throw new Error('invalid');
              url.hash = '';
              if (urls.has(url.href)) continue;
              urls.add(url.href);
              evidence.push(row);
            } catch {
              addFailure('discovery_invalid_source');
            }
          }
        } catch (error) {
          addFailure(error instanceof Error ? error.message : undefined);
        }
      }
      return { evidence, failureCodes };
    },
  };
}
