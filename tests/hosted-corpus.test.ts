import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createHostedCorpus } from '../apps/api/src/hosted-corpus.js';

const row = (key: string, role = 'quran_text') => ({
  snapshot_key: key,
  source_role: role,
  corpus_version: 'synthetic-v1',
  stable_reference: key,
  original_text: 'Owned synthetic source original',
  original_sha256: createHash('sha256').update('Owned synthetic source original').digest('hex'),
  provenance: { originalSourceId: 'original:source' },
  context_before: null,
  context_after: null,
  footnotes: [],
  parent_snapshot_key: null,
  source_key: 'normalized-edition-key',
  content_version: 'v1',
  work_name: 'Owned source',
  author_name: 'Not recorded',
  edition: 'Not recorded',
  source_url: null,
  approval_status: 'pending',
  relations: [],
});
function fixture(exact: unknown[] = [], lexical: unknown[] = []) {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes('stable_reference=any')
      ? exact
      : sql.includes('word_similarity')
        ? lexical
        : [],
  }));
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  return { pool, query, release };
}
describe('hosted evidence boundaries', () => {
  it('returns only the resolved explicit source family and skips broad neighbors', async () => {
    const f = fixture(
      Array.from({ length: 8 }, (_, index) => row('anchor-' + index)),
      [row('novel-scholar', 'scholar_explanation')],
    );
    const corpus = createHostedCorpus({
      pool: f.pool,
      corpusVersion: 'synthetic-v1',
      researchPreview: true,
    });
    const results = await corpus.search('Owned assertion needing new evidence', ['anchor-0']);
    expect(results.some((r) => r.sourceRole === 'scholar_explanation')).toBe(false);
    expect(results).toHaveLength(8);
    expect(f.query.mock.calls.some(([sql]) => String(sql).includes('word_similarity'))).toBe(false);
    expect(f.query).toHaveBeenCalledWith('set local role basirah_research_runtime');
    expect(results[0]?.sourceId).toBe('original:source');
    expect(results[0]?.author).toBeNull();
    expect(results[0]?.edition).toBeNull();
  });
  it('rejects corrupted stored originals and always rolls back/releases', async () => {
    const f = fixture([], [{ ...row('tampered'), original_text: 'changed' }]);
    const corpus = createHostedCorpus({ pool: f.pool, corpusVersion: 'synthetic-v1' });
    await expect(corpus.search('Owned assertion', [])).rejects.toThrow('CORPUS_HASH_MISMATCH');
    expect(f.query).toHaveBeenCalledWith('set local role basirah_runtime');
    expect(f.query).toHaveBeenCalledWith('rollback');
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('rejects incompatible query vectors before executing any database query', async () => {
    const f = fixture();
    const corpus = createHostedCorpus({
      pool: f.pool,
      corpusVersion: 'synthetic-v1',
      embeddingSpace: { modelId: 'fixture', dimensions: 3, embedQuery: async () => [1, 0] },
    });
    await expect(corpus.search('Owned assertion', [])).rejects.toThrow(
      'QUERY_EMBEDDING_SPACE_MISMATCH',
    );
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
});
