import { describe, expect, it, vi } from 'vitest';
import { createReviewerCorpus, reviewerCorpusConnection } from '../apps/api/src/reviewer-corpus.js';
import type { Pool } from 'pg';

const reader = 'postgresql://reader:synthetic@ep-qa.eu-central-1.aws.neon.tech/corpus';
const curator =
  'postgresql://curator:synthetic@ep-qa-pooler.eu-central-1.aws.neon.tech/corpus?sslmode=require';
describe('separate reviewer source capability', () => {
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
