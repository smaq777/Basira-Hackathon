import { describe, expect, it, vi } from 'vitest';
import {
  createReviewerCorpus,
  reviewedAnswerDemoEnabled,
  reviewerCorpusConnection,
  reviewerCorpusAccessMode,
  reviewerCorpusVersion,
} from '../apps/api/src/reviewer-corpus.js';
import type { Pool } from 'pg';

const reader = 'postgresql://reader:synthetic@ep-qa.eu-central-1.aws.neon.tech/corpus';
const curator =
  'postgresql://curator:synthetic@ep-qa-pooler.eu-central-1.aws.neon.tech/corpus?sslmode=require';
describe('separate reviewer source capability', () => {
  it('enables answer publication only in explicitly marked staging demo mode', () => {
    const env = {
      REVIEWER_CORPUS_PUBLICATION_MODE: 'reviewed_answer_demo',
      RAILWAY_ENVIRONMENT_NAME: 'staging',
      BASIRAH_DEPLOYMENT_ENVIRONMENT: 'staging',
    };
    expect(reviewedAnswerDemoEnabled(env)).toBe(true);
    for (const environment of [
      {},
      { ...env, RAILWAY_ENVIRONMENT_NAME: 'production' },
      { ...env, BASIRAH_DEPLOYMENT_ENVIRONMENT: 'production' },
      { ...env, REVIEWER_CORPUS_PUBLICATION_MODE: 'original_sources' },
    ])
      expect(reviewedAnswerDemoEnabled(environment)).toBe(false);
  });
  it('keeps full supporting originals and produces an idempotent identity that changes with the sources', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ value: { snapshotKey: 'reviewed-test' } }] });
    const corpus = createReviewerCorpus({ query } as unknown as Pick<Pool, 'query'>, 'qa-corpus');
    const source = {
      id: 'reviewer-answer',
      work: 'إجابة مراجع بصيرة',
      author: 'reviewer',
      edition: 'v1',
      reference: 'ticket v1',
      sourceUrl: 'https://example.com/#/reviewer/detail',
      originalText: 'Saved reviewer answer',
      context: '',
      sourceRole: 'reviewer_commentary' as const,
    };
    const original = {
      ...source,
      id: 'quran-source',
      originalText: 'أصل مرجعي',
      sourceRole: 'quran_text' as const,
    };
    const input = {
      actor: 'reviewer',
      ticketCode: 'BR-A1B2C3D4E5F6',
      version: 1,
      source,
      supportingEvidence: [original],
      rightsRecord: 'Demo approval',
    };
    await corpus.approve(input);
    await corpus.approve(input);
    expect(query.mock.calls[0]).toEqual(query.mock.calls[1]);
    const stored = JSON.parse(query.mock.calls[0]![1][5]);
    expect(stored.originalText).toBe(source.originalText);
    expect(stored.supportingEvidence).toEqual([original]);
    expect(stored.supportingContext).toContain(original.originalText);
    await corpus.approve({
      ...input,
      supportingEvidence: [{ ...original, originalText: 'أصل آخر' }],
    });
    expect(query.mock.calls[2]![1][0]).not.toBe(query.mock.calls[0]![1][0]);
  });
  it('requires a separately named overlay bound to the frozen base corpus', () => {
    const base = 'a'.repeat(64);
    expect(reviewerCorpusVersion({ FOUNDATION_CORPUS_VERSION: base })).toBeUndefined();
    expect(
      reviewerCorpusVersion({
        FOUNDATION_CORPUS_VERSION: base,
        REVIEWER_CORPUS_VERSION: `reviewed-${base}`,
      }),
    ).toBe(`reviewed-${base}`);
    for (const version of [base, `reviewed-${'b'.repeat(64)}`, 'arbitrary'])
      expect(() =>
        reviewerCorpusVersion({
          FOUNDATION_CORPUS_VERSION: base,
          REVIEWER_CORPUS_VERSION: version,
        }),
      ).toThrow('REVIEWER_CORPUS_OVERLAY_INVALID');
  });
  it('allows authenticated curation only on explicitly identified staging', () => {
    expect(reviewerCorpusAccessMode({})).toBe('allowlist');
    expect(
      reviewerCorpusAccessMode({
        REVIEWER_CORPUS_ACCESS_MODE: 'allowlist',
        RAILWAY_ENVIRONMENT_NAME: 'production',
      }),
    ).toBe('allowlist');
    expect(
      reviewerCorpusAccessMode({
        REVIEWER_CORPUS_ACCESS_MODE: 'authenticated',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe('authenticated');
    for (const environment of [
      { REVIEWER_CORPUS_ACCESS_MODE: 'authenticated' },
      { REVIEWER_CORPUS_ACCESS_MODE: 'authenticated', RAILWAY_ENVIRONMENT_NAME: 'production' },
      {
        REVIEWER_CORPUS_ACCESS_MODE: 'authenticated',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
        BASIRAH_DEPLOYMENT_ENVIRONMENT: 'production',
      },
      { REVIEWER_CORPUS_ACCESS_MODE: 'public', RAILWAY_ENVIRONMENT_NAME: 'staging' },
    ])
      expect(() => reviewerCorpusAccessMode(environment)).toThrow(
        'REVIEWER_CORPUS_ACCESS_MODE_INVALID',
      );
  });
  it('never silently uses the read connection when curator configuration is absent', () => {
    expect(reviewerCorpusConnection({ FOUNDATION_CORPUS_DATABASE_URL: reader })).toBeUndefined();
  });
  it('uses the same corpus target but a separate login, verified TLS and a bounded pool', () => {
    expect(
      reviewerCorpusConnection({
        FOUNDATION_CORPUS_DATABASE_URL: reader,
        REVIEWER_CORPUS_DATABASE_URL: curator,
      }),
    ).toEqual({
      connectionString: curator.split('?')[0],
      ssl: { rejectUnauthorized: true },
      max: 1,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
    });
    for (const invalid of [
      reader,
      curator.replace('/corpus', '/other'),
      curator.replace('ep-qa-pooler', 'ep-other'),
      'https://example.com',
    ]) {
      expect(() =>
        reviewerCorpusConnection({
          FOUNDATION_CORPUS_DATABASE_URL: reader,
          REVIEWER_CORPUS_DATABASE_URL: invalid,
        }),
      ).toThrow('REVIEWER_CORPUS_DEDICATED_CONNECTION_REQUIRED');
    }
  });
  it('preserves original source wording and identity across idempotent approval', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ value: { snapshotKey: 'reviewed-test' } }] });
    const corpus = createReviewerCorpus({ query } as unknown as Pick<Pool, 'query'>, 'qa-corpus');
    const input = {
      actor: 'curator',
      ticketCode: 'BR-156QA0000002',
      version: 1,
      rightsRecord: 'Synthetic test only',
      source: {
        id: 'source-1',
        work: 'كتاب تجريبي',
        author: 'مؤلف تجريبي',
        edition: 'طبعة تجريبية',
        reference: 'باب 1',
        sourceUrl: 'https://example.com/source',
        originalText: 'نَصٌّ تَجْرِيبِيٌّ',
        context: '',
        sourceRole: 'book_excerpt' as const,
      },
    };
    await corpus.approve(input);
    await corpus.approve(input);
    expect(query.mock.calls[0]).toEqual(query.mock.calls[1]);
    const values = query.mock.calls[0]![1];
    expect(values[2]).not.toBe(input.source.originalText);
    expect(JSON.parse(values[5]).originalText).toBe(input.source.originalText);
    await expect(
      corpus.approve({ ...input, source: { ...input.source, sourceRole: 'quran_text' } }),
    ).rejects.toThrow('REVIEWED_SOURCE_PROVENANCE_REQUIRED');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
