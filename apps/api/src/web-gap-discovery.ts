import type { ClaimGapDiscovery } from './claim-retrieval.js';
import { SourceEvidenceSchema } from '../../../packages/contracts/src/foundation.js';
import { sha256 } from './foundation.js';
import { createWebDiscovery } from './web-discovery.js';
import type { LoadedSourcePolicy } from './source-policy.js';

/** The report stores these originals; acquisition never grants scholarly approval. */
export function createWebGapDiscovery(options: {
  apiKey: string;
  policy: LoadedSourcePolicy;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): ClaimGapDiscovery {
  // Freeze the effective eligibility record together with its recorded policy hash.
  const policy = structuredClone(options.policy);
  const acquisition = policy.policies.length
    ? createWebDiscovery({
        apiKey: options.apiKey,
        policies: policy.policies,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? 8000,
        maxPages: 2,
      })
    : undefined;
  return {
    async discover(_claim, gap, signal) {
      if (!acquisition) return { evidence: [], failureCodes: ['discovery_policy_disabled'] };
      const result = await acquisition.discover(gap.query, signal);
      return {
        failureCodes: result.failures,
        evidence: result.snapshots.map((snapshot) => {
          const rule = policy.enabled.find(
            (row) => row.domain === new URL(snapshot.sourceUrl).hostname,
          )!;
          const identity = sha256(snapshot.sourceUrl + ':' + snapshot.originalSha256);
          return SourceEvidenceSchema.parse({
            snapshotKey: 'web:' + identity,
            sourceId: 'web-' + rule.id,
            sourceVersion: 'firecrawl-markdown:' + snapshot.originalSha256,
            sourceRole: rule.sourceRole,
            reference: snapshot.title,
            originalText: snapshot.originalMarkdown,
            originalSha256: snapshot.originalSha256,
            work: snapshot.title,
            author: null,
            edition: null,
            sourceUrl: snapshot.sourceUrl,
            approvalStatus: 'pending',
            researchOnly: true,
            parentSnapshotKey: null,
            delivery: 'live',
            retrievalModes: ['lexical'],
            provenance: {
              provider: 'firecrawl',
              representation: 'extracted_markdown',
              acquiredAt: snapshot.retrievedAt,
              requestedUrl: snapshot.requestedUrl,
              sourcePolicyVersion: policy.policy.policyVersion,
              sourcePolicySha256: policy.sha256,
              sourceEligibilityBasis: rule.basis,
              referenceDocument: policy.policy.referenceDocument,
              gapReason: gap.reason,
              querySha256: sha256(gap.query),
              attributionStatus: 'page_title_only',
              rightsStatus: 'pending',
              scholarlyApproval: false,
              sourceApprovalMeaning:
                'Pending digital edition review; allowlist eligibility is separate.',
            },
          });
        }),
      };
    },
  };
}
