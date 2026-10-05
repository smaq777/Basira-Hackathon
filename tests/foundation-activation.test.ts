import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { foundationActivation } from '../apps/api/src/foundation-activation.js';
import { foundationRuntimeMode } from '../apps/api/src/hosted-foundation.js';

const staging = {
  FOUNDATION_ENABLED: 'true',
  FOUNDATION_RESEARCH_PREVIEW: 'true',
  FOUNDATION_RESEARCH_PROFILE: 'hosted-staging',
  NODE_ENV: 'production',
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  BASIRAH_DEPLOYMENT_ENVIRONMENT: 'staging',
  FOUNDATION_STAGING_SERVICE_ID: '00000000-0000-4000-8000-000000000001',
  RAILWAY_SERVICE_ID: '00000000-0000-4000-8000-000000000001',
  BASIRAH_DEPLOYMENT_REF: 'refs/heads/development',
  BASIRAH_DEPLOYMENT_SHA: 'a'.repeat(40),
};

describe('explicit foundation research activation', () => {
  it('keeps default activation disabled and never enables a provider flag', () => {
    expect(foundationActivation({}, '0.0.0.0')).toEqual({
      researchPreview: false,
      profile: 'disabled',
    });
    expect(
      foundationActivation({ ...staging, FOUNDATION_ENABLED: 'false' }, '0.0.0.0').profile,
    ).toBe('disabled');
    expect(staging).not.toHaveProperty('FOUNDATION_SEMANTIC_ENABLED');
  });
  it('preserves source-only and loopback research behavior', () => {
    expect(foundationActivation({ FOUNDATION_ENABLED: 'true' }, '0.0.0.0').profile).toBe(
      'source-only',
    );
    for (const host of ['127.0.0.1', '::1'])
      expect(
        foundationActivation(
          { FOUNDATION_ENABLED: 'true', FOUNDATION_RESEARCH_PREVIEW: 'true' },
          host,
        ).profile,
      ).toBe('local-research');
    expect(() =>
      foundationActivation(
        { FOUNDATION_ENABLED: 'true', FOUNDATION_RESEARCH_PREVIEW: 'true' },
        '0.0.0.0',
      ),
    ).toThrow('RESEARCH_PREVIEW_REQUIRES_LOCAL_DEVELOPMENT');
    expect(() =>
      foundationActivation(
        { FOUNDATION_ENABLED: 'true', FOUNDATION_RESEARCH_PREVIEW: 'true', NODE_ENV: 'production' },
        '127.0.0.1',
      ),
    ).toThrow('RESEARCH_PREVIEW_REQUIRES_LOCAL_DEVELOPMENT');
  });
  it('accepts an explicitly selected Railway staging service, including CLI source declarations', () => {
    expect(foundationActivation(staging, '0.0.0.0')).toEqual({
      researchPreview: true,
      profile: 'hosted-staging',
    });
    expect(
      foundationActivation(
        {
          ...staging,
          RAILWAY_GIT_BRANCH: 'development',
          RAILWAY_GIT_COMMIT_SHA: staging.BASIRAH_DEPLOYMENT_SHA,
        },
        '0.0.0.0',
      ).profile,
    ).toBe('hosted-staging');
  });
  it.each([
    ['FOUNDATION_RESEARCH_PROFILE', 'hosted'],
    ['FOUNDATION_RESEARCH_PREVIEW', 'false'],
    ['NODE_ENV', 'development'],
    ['RAILWAY_ENVIRONMENT_NAME', 'production'],
    ['BASIRAH_DEPLOYMENT_ENVIRONMENT', 'production'],
    ['FOUNDATION_STAGING_SERVICE_ID', undefined],
    ['FOUNDATION_STAGING_SERVICE_ID', 'not-a-service'],
    ['RAILWAY_SERVICE_ID', '00000000-0000-4000-8000-000000000002'],
    ['BASIRAH_DEPLOYMENT_REF', 'refs/heads/main'],
    ['BASIRAH_DEPLOYMENT_SHA', undefined],
    ['BASIRAH_DEPLOYMENT_SHA', 'short'],
    ['RAILWAY_GIT_BRANCH', 'main'],
    ['RAILWAY_GIT_COMMIT_SHA', 'b'.repeat(40)],
    ['DATABASE_TLS_MODE', 'disable'],
    ['DATABASE_TLS_MODE', 'require'],
    ['FOUNDATION_CORPUS_TLS_MODE', 'require'],
  ])('rejects incompatible or missing %s', (key, value) => {
    expect(() => foundationActivation({ ...staging, [key]: value }, '0.0.0.0')).toThrow();
  });
  it('rejects a staging profile on a loopback bind', () => {
    expect(() => foundationActivation(staging, '127.0.0.1')).toThrow(
      'HOSTED_STAGING_ENVIRONMENT_MISMATCH',
    );
  });
  it('integrates the full staging mode while preserving the accepted read-only hosted demo', () => {
    expect(foundationRuntimeMode(staging, '0.0.0.0')).toBe('hosted_research');
    expect(() =>
      foundationRuntimeMode({ ...staging, FOUNDATION_HOSTED_DEMO: 'true' }, '0.0.0.0'),
    ).toThrow('FOUNDATION_RUNTIME_MODE_CONFLICT');
    const demo = {
      ...staging,
      FOUNDATION_RESEARCH_PROFILE: 'local',
      FOUNDATION_RESEARCH_PREVIEW: undefined,
      FOUNDATION_HOSTED_DEMO: 'true',
      FOUNDATION_SEMANTIC_ENABLED: 'true',
      FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
    };
    expect(foundationRuntimeMode(demo, '0.0.0.0')).toBe('hosted_demo');
    for (const key of [
      'FOUNDATION_TAFSIR_LIVE',
      'FOUNDATION_WEB_DISCOVERY_ENABLED',
      'FOUNDATION_REWRITE_ENABLED',
    ])
      expect(() => foundationRuntimeMode({ ...demo, [key]: 'true' }, '0.0.0.0')).toThrow(
        'HOSTED_DEMO_REQUIRES_READ_ONLY_RETRIEVAL',
      );
  });
  it.each([
    [{ ...staging, RAILWAY_ENVIRONMENT_NAME: 'production' }, 'HOSTED_STAGING_ENVIRONMENT_MISMATCH'],
    [{ ...staging, BASIRAH_DEPLOYMENT_REF: 'refs/heads/main' }, 'HOSTED_STAGING_SOURCE_MISMATCH'],
    [staging, 'FOUNDATION_CONFIGURATION_INCOMPLETE'],
  ])(
    'enforces the profile at actual server startup before external dependencies',
    (configuration, code) => {
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,
          'apps/api/src/server.ts',
        ],
        {
          encoding: 'utf8',
          timeout: 15000,
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            ...configuration,
            HOST: '0.0.0.0',
            DATABASE_URL: 'postgresql://synthetic@127.0.0.1:1/not_connected',
          },
        },
      );
      expect(child.error).toBeUndefined();
      expect(child.status).not.toBe(0);
      expect(child.stderr).toContain(code);
    },
  );
});
