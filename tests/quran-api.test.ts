import { describe, expect, it, vi } from 'vitest';
import { withExactQuranApi } from '../apps/api/src/quran-api.js';
import type { ClaimCorpusSearch } from '../apps/api/src/claim-retrieval.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';

const empty: ClaimCorpusSearch = {
  async search() {
    return [];
  },
  async restore() {
    return [];
  },
};

describe('exact Quran API fallback', () => {
  it('fills a missing explicit verse and preserves the requested reference', async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      return new Response(
        JSON.stringify({
          verses: [
            {
              id: 278,
              verse_key: '2:271',
              text_uthmani: 'إِن تُبْدُوا۟ ٱلصَّدَقَـٰتِ فَنِعِمَّا هِىَ وَإِن تُخْفُوهَا',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const response = await withExactQuranApi(empty, request as typeof fetch).search('قال تعالى', [
      '2:271',
    ]);
    expect(response).toHaveLength(1);
    expect(response[0]).toMatchObject({
      sourceRole: 'quran_text',
      reference: '2:271',
      delivery: 'live',
      retrievalModes: ['exact'],
    });
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]![0])).toContain('verse_key=2%3A271');
  });

  it('keeps a stored exact Quran source and skips the network', async () => {
    const stored: SourceEvidence = {
      snapshotKey: 'stored:2:271',
      sourceId: 'stored',
      sourceVersion: 'v1',
      sourceRole: 'quran_text',
      reference: '2:271',
      originalText: 'نص محفوظ',
      originalSha256: 'digest',
      work: 'القرآن الكريم',
      author: null,
      edition: null,
      sourceUrl: null,
      approvalStatus: 'pending',
      researchOnly: true,
      parentSnapshotKey: null,
      delivery: 'snapshot',
      retrievalModes: ['exact'],
      provenance: {},
      contextBefore: null,
      contextAfter: null,
      footnotes: [],
      relations: [],
    };
    const base: ClaimCorpusSearch = {
      ...empty,
      async search() {
        return [stored];
      },
    };
    const request = vi.fn();
    await expect(
      withExactQuranApi(base, request as typeof fetch).search('quote', ['2:271']),
    ).resolves.toEqual([stored]);
    expect(request).not.toHaveBeenCalled();
  });

  it('drops unrelated base evidence when an explicit reference is requested', async () => {
    const unrelated = {
      snapshotKey: 'other',
      sourceRole: 'scholar_explanation',
      reference: 'other',
    } as SourceEvidence;
    const base: ClaimCorpusSearch = {
      ...empty,
      async search() {
        return [unrelated];
      },
    };
    const request = vi.fn(async () => new Response('{}', { status: 500 }));
    await expect(
      withExactQuranApi(base, request as typeof fetch).search('quote', ['2:271']),
    ).resolves.toEqual([]);
  });
});
