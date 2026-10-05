import {
  FoundationIntakeSchema,
  type FoundationIntake,
} from '../../../packages/contracts/src/foundation.js';
import { sha256, type FoundationAdapter } from './foundation.js';
import { foundationActivation } from './foundation-activation.js';

export type FoundationRuntimeMode =
  'disabled' | 'local_research' | 'hosted_research' | 'hosted_demo';

function assertHostedDemoBoundary(environment: NodeJS.ProcessEnv, host: string): void {
  const serviceId = environment.FOUNDATION_STAGING_SERVICE_ID;
  const revision = environment.BASIRAH_DEPLOYMENT_SHA;
  const reportTls = environment.DATABASE_TLS_MODE || 'verify-full';
  if (
    environment.NODE_ENV !== 'production' ||
    host !== '0.0.0.0' ||
    environment.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT !== 'staging' ||
    !serviceId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(serviceId) ||
    environment.RAILWAY_SERVICE_ID !== serviceId ||
    environment.BASIRAH_DEPLOYMENT_REF !== 'refs/heads/development' ||
    !revision ||
    !/^[0-9a-f]{40}$/u.test(revision) ||
    (environment.RAILWAY_GIT_BRANCH !== undefined &&
      environment.RAILWAY_GIT_BRANCH !== 'development') ||
    (environment.RAILWAY_GIT_COMMIT_SHA !== undefined &&
      environment.RAILWAY_GIT_COMMIT_SHA !== revision) ||
    !['require', 'verify-full'].includes(reportTls) ||
    (environment.FOUNDATION_CORPUS_TLS_MODE || 'verify-full') !== 'verify-full'
  )
    throw new Error('HOSTED_DEMO_ENVIRONMENT_MISMATCH');
}

export function foundationRuntimeMode(
  environment: NodeJS.ProcessEnv = process.env,
  host = environment.HOST ?? '0.0.0.0',
): FoundationRuntimeMode {
  if (environment.FOUNDATION_ENABLED !== 'true') return 'disabled';
  const localResearch = environment.FOUNDATION_RESEARCH_PREVIEW === 'true';
  const hostedDemo = environment.FOUNDATION_HOSTED_DEMO === 'true';
  if (localResearch && hostedDemo) throw new Error('FOUNDATION_RUNTIME_MODE_CONFLICT');
  const activation = foundationActivation(environment, host);
  if (!localResearch && !hostedDemo) throw new Error('FOUNDATION_RUNTIME_MODE_REQUIRED');
  if (
    hostedDemo &&
    [
      environment.FOUNDATION_TAFSIR_LIVE,
      environment.FOUNDATION_WEB_DISCOVERY_ENABLED,
      environment.FOUNDATION_WEB_CACHE_ENABLED,
      environment.FOUNDATION_WEB_CACHE_PASSAGES_ENABLED,
      environment.FOUNDATION_REWRITE_ENABLED,
    ].some((value) => value === 'true')
  )
    throw new Error('HOSTED_DEMO_REQUIRES_READ_ONLY_RETRIEVAL');
  if (
    hostedDemo &&
    (environment.FOUNDATION_SEMANTIC_ENABLED !== 'true' ||
      environment.FOUNDATION_CLAIM_RETRIEVAL_ENABLED !== 'true')
  )
    throw new Error('HOSTED_DEMO_REQUIRES_SEMANTIC_RETRIEVAL');
  if (hostedDemo) {
    assertHostedDemoBoundary(environment, host);
    return 'hosted_demo';
  }
  return activation.profile === 'hosted-staging' ? 'hosted_research' : 'local_research';
}

/**
 * Hosted demos start from the immutable submitted draft and enrich only through the
 * pinned read-only corpus. Literal quotation matching remains unavailable without
 * the separately packaged canonical source index, so this adapter never invents it.
 */
export function createHostedDraftAdapter(corpusVersion: string): FoundationAdapter {
  const selectedVersion = corpusVersion.trim();
  if (!selectedVersion || selectedVersion.length > 120)
    throw new Error('HOSTED_CORPUS_VERSION_REQUIRED');
  let closed = false;
  return {
    async analyze(text, revisionId, _relatedReferences = [], signal) {
      if (closed || signal?.aborted) throw new Error('FOUNDATION_ABORTED');
      const intake: FoundationIntake = {
        schemaVersion: 1,
        pipelineVersion: 'hosted-draft-intake-v1',
        revisionId,
        revisionSha256: sha256(text),
        corpusVersion: selectedVersion,
        originalText: text,
        offsetUnit: 'utf16_code_unit',
        segments: [
          {
            id: `hosted-author-${sha256(text).slice(0, 24)}`,
            startOffset: 0,
            endOffset: text.length,
            codePointStart: 0,
            codePointEnd: Array.from(text).length,
            originalText: text,
            role: 'author_text',
            roleStatus: 'candidate',
            method: 'hosted_draft_without_literal_source_index',
            sourceKeys: [],
            roleProposal: 'other',
            conflict: false,
          },
        ],
        evidence: [],
        quotationFindings: [],
        contextCoverage: [],
        warnings: ['literal_source_index_unavailable_in_hosted_demo'],
        researchOnly: true,
      };
      return FoundationIntakeSchema.parse(intake);
    },
    async close() {
      closed = true;
    },
  };
}
