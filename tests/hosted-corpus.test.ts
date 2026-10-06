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
  const query = vi.fn(async (sql: string, _values?: unknown[]) => ({
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
  it('includes only approved reviewer originals in exact/lexical/restored overlay membership', async () => {
    const f = fixture([], [row('reviewed-source', 'book_excerpt')]);
    const corpus = createHostedCorpus({
      pool: f.pool,
      corpusVersion: 'synthetic-v1',
      reviewedCorpusVersion: 'reviewed-synthetic-v1',
    });
    await corpus.search('Owned assertion', []);
    await corpus.search('Owned quotation', ['book:1']);
    await corpus.restore(['reviewed-source']);
    const queries = f.query.mock.calls.filter(([sql]) =>
      String(sql).includes('from basirah.passage p'),
    );
    expect(queries).toHaveLength(3);
    for (const [sql, values] of queries) {
      expect(sql).toContain("s.approval_status='approved'");
      expect(sql).toContain("p.provenance->>'source'='reviewer_approved_original'");
      expect(sql).toContain("('hadith_matn','book_excerpt','scholar_explanation')");
      expect(values).toContain('synthetic-v1');
      expect(values).toContain('reviewed-synthetic-v1');
    }
  });
  it('keeps readiness counts and vector space pinned to the base snapshot', async () => {
    const f = fixture();
    const corpus = createHostedCorpus({
      pool: f.pool,
      corpusVersion: 'synthetic-v1',
      reviewedCorpusVersion: 'reviewed-synthetic-v1',
      embeddingSpace: { modelId: 'fixture', dimensions: 2, embedQuery: async () => [1, 0] },
    });
    await corpus.search('Owned assertion', []);
    const vectorCall = f.query.mock.calls.find(([sql]) =>
      String(sql).includes('join basirah.passage_embedding'),
    );
    expect(vectorCall?.[1]).not.toContain('reviewed-synthetic-v1');
    expect(vectorCall?.[0]).toContain('e.corpus_version=$1');
  });
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
    expect(
      f.query.mock.calls.some(([sql]) =>
        String(sql).includes("case p.source_role when 'quran_text' then 0"),
      ),
    ).toBe(true);
  });
  it('drops an orphaned explicit child instead of failing report persistence', async () => {
    const parent = row('quran-anchor');
    const orphan = {
      ...row('tafsir-orphan', 'tafsir_commentary'),
      parent_snapshot_key: 'missing-quran-anchor',
    };
    const f = fixture([parent, orphan]);
    const corpus = createHostedCorpus({
      pool: f.pool,
      corpusVersion: 'synthetic-v1',
      researchPreview: true,
    });
    const results = await corpus.search('Quoted text', ['31:15']);
    expect(results.map((result) => result.snapshotKey)).toEqual(['quran-anchor']);
  });
  it('does not substitute broad lexical neighbors for an unresolved explicit locator', async () => {
    const f = fixture([], [row('unrelated-neighbor', 'scholar_explanation')]);
    const corpus = createHostedCorpus({
      pool: f.pool,
      corpusVersion: 'synthetic-v1',
      researchPreview: true,
    });
    await expect(corpus.search('Quoted text', ['2:271'])).resolves.toEqual([]);
    expect(f.query.mock.calls.some(([sql]) => String(sql).includes('word_similarity'))).toBe(false);
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
