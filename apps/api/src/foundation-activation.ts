type Environment = Readonly<Record<string, string | undefined>>;

export type FoundationActivation = {
  researchPreview: boolean;
  profile: 'disabled' | 'source-only' | 'local-research' | 'hosted-staging';
};

/** Trusted server configuration; this is not a source/rights approval or attestation. */
export function foundationActivation(env: Environment, host: string): FoundationActivation {
  const selected = env.FOUNDATION_RESEARCH_PROFILE?.trim() || 'local';
  if (!['local', 'hosted-staging'].includes(selected))
    throw Error('FOUNDATION_RESEARCH_PROFILE_INVALID');
  if (env.FOUNDATION_ENABLED !== 'true') return { researchPreview: false, profile: 'disabled' };
  const researchPreview = env.FOUNDATION_RESEARCH_PREVIEW === 'true';
  if (selected === 'local') {
    if (researchPreview && (env.NODE_ENV === 'production' || !['127.0.0.1', '::1'].includes(host)))
      throw Error('RESEARCH_PREVIEW_REQUIRES_LOCAL_DEVELOPMENT');
    return { researchPreview, profile: researchPreview ? 'local-research' : 'source-only' };
  }
  if (!researchPreview) throw Error('HOSTED_STAGING_REQUIRES_RESEARCH_PREVIEW');
  if (
    env.NODE_ENV !== 'production' ||
    host !== '0.0.0.0' ||
    env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    env.BASIRAH_DEPLOYMENT_ENVIRONMENT !== 'staging'
  )
    throw Error('HOSTED_STAGING_ENVIRONMENT_MISMATCH');
  const serviceId = env.FOUNDATION_STAGING_SERVICE_ID;
  if (
    !serviceId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(serviceId) ||
    env.RAILWAY_SERVICE_ID !== serviceId
  )
    throw Error('HOSTED_STAGING_SERVICE_MISMATCH');
  const revision = env.BASIRAH_DEPLOYMENT_SHA;
  if (
    env.BASIRAH_DEPLOYMENT_REF !== 'refs/heads/development' ||
    !revision ||
    !/^[0-9a-f]{40}$/u.test(revision) ||
    (env.RAILWAY_GIT_BRANCH !== undefined && env.RAILWAY_GIT_BRANCH !== 'development') ||
    (env.RAILWAY_GIT_COMMIT_SHA !== undefined && env.RAILWAY_GIT_COMMIT_SHA !== revision)
  )
    throw Error('HOSTED_STAGING_SOURCE_MISMATCH');
  if (
    (env.DATABASE_TLS_MODE || 'verify-full') !== 'verify-full' ||
    (env.FOUNDATION_CORPUS_TLS_MODE || 'verify-full') !== 'verify-full'
  )
    throw Error('HOSTED_STAGING_REQUIRES_VERIFIED_TLS');
  return { researchPreview: true, profile: 'hosted-staging' };
}
