import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import {
  submissionConnection,
  validateSubmissionEmbeddingSpace,
} from '../scripts/verify-submission-corpus.js';

const reader =
  'postgresql://basirah_corpus_reader:synthetic-fixture@ep-fancy-base-b2o8zdbw-pooler.c-6.eu-central-1.aws.neon.tech/basirah_research';
describe('submission preflight target boundaries (synthetic URLs)', () => {
  it('uses the corpus CA and forces verified TLS despite URL overrides', () => {
    const result = submissionConnection({
      FOUNDATION_CORPUS_DATABASE_URL: `${reader}?sslmode=no-verify&sslrootcert=untrusted&channel_binding=require`,
      FOUNDATION_CORPUS_CA_CERT: 'synthetic corpus CA',
      DATABASE_CA_CERT: 'synthetic report CA',
    });
    expect(result.ssl).toEqual({ rejectUnauthorized: true, ca: 'synthetic corpus CA' });
    expect(result.connectionString).not.toContain('sslmode');
    expect(result.connectionString).not.toContain('sslrootcert');
    expect(result.connectionString).not.toContain('channel_binding');
  });
  it.each([
    reader.replace('ep-fancy-base-b2o8zdbw-pooler', 'ep-production'),
    reader.replace('/basirah_research', '/postgres'),
    reader.replace('basirah_corpus_reader:', 'basirah_owner:'),
    reader.replace('.aws.neon.tech', '.aws.neon.tech.attacker.example'),
    reader.replace('postgresql:', 'https:'),
    reader.replace('/basirah_research', ':6543/basirah_research'),
  ])('rejects another endpoint, database or privileged login', (url) => {
    expect(() => submissionConnection({ FOUNDATION_CORPUS_DATABASE_URL: url })).toThrow(
      'SUBMISSION_CORPUS_TARGET_MISMATCH',
    );
  });
  it('rejects an unverified TLS profile', () => {
    expect(() =>
      submissionConnection({
        FOUNDATION_CORPUS_DATABASE_URL: reader,
        FOUNDATION_CORPUS_TLS_MODE: 'require',
      }),
    ).toThrow('SUBMISSION_CORPUS_TLS_REQUIRED');
  });
  it.each(['no-verify', '0'])(
    'cannot override the actual pg target or TLS through URL parameters (%s)',
    (ssl) => {
      const result = submissionConnection({
        FOUNDATION_CORPUS_DATABASE_URL: `${reader}?host=attacker.example&user=admin&database=postgres&port=6543&ssl=${ssl}&sslmode=no-verify`,
      });
      // pg exposes this runtime field without declaring it in @types/pg.
      const parameters = (
        new Client(result) as unknown as {
          connectionParameters: {
            host: string;
            user: string;
            database: string;
            port: number;
            ssl: unknown;
          };
        }
      ).connectionParameters;
      expect(parameters.host).toBe('ep-fancy-base-b2o8zdbw-pooler.c-6.eu-central-1.aws.neon.tech');
      expect(parameters.user).toBe('basirah_corpus_reader');
      expect(parameters.database).toBe('basirah_research');
      expect(parameters.port).toBe(5432);
      expect(parameters.ssl).toEqual({ rejectUnauthorized: true });
      expect(new URL(result.connectionString).search).toBe('');
    },
  );
  it('requires an existing reader without fetching or creating credentials', () => {
    expect(() => submissionConnection({})).toThrow('SUBMISSION_CORPUS_READER_REQUIRED');
  });
});

describe('searchable snapshot coverage', () => {
  const coverage = {
    model_id: 'openai/text-embedding-3-small',
    dimensions: 1536,
    task_type: 'search_document',
    count: 175,
    covered_passages: 175,
  };
  it('accepts compatible retrieval vectors covering every selected member', () => {
    expect(validateSubmissionEmbeddingSpace([coverage])).toEqual(coverage);
  });
  it.each([
    { ...coverage, task_type: 'classification' },
    { ...coverage, covered_passages: 174 },
    { ...coverage, model_id: 'incompatible-model' },
    { ...coverage, dimensions: 768 },
  ])('rejects a 175-row count without compatible retrieval membership', (invalid) => {
    expect(() => validateSubmissionEmbeddingSpace([invalid])).toThrow(
      'SUBMISSION_CORPUS_EMBEDDING_MISMATCH',
    );
  });
  it('rejects absent or multiple embedding spaces', () => {
    expect(() => validateSubmissionEmbeddingSpace([])).toThrow(
      'SUBMISSION_CORPUS_EMBEDDING_MISMATCH',
    );
    expect(() => validateSubmissionEmbeddingSpace([coverage, coverage])).toThrow(
      'SUBMISSION_CORPUS_EMBEDDING_MISMATCH',
    );
  });
});
