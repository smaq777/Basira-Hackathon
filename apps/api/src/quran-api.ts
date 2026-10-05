import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { sha256 } from './foundation.js';
import type { ClaimCorpusSearch } from './claim-retrieval.js';

const QURAN_API = 'https://api.quran.com/api/v4/quran/verses/uthmani';
const MAX_RESPONSE_BYTES = 32_000;

type Fetch = typeof fetch;

function exactReferences(references: readonly string[]): string[] {
  return [...new Set(references.filter((reference) => /^\d{1,3}:\d{1,3}$/u.test(reference)))].slice(
    0,
    2,
  );
}

async function fetchVerse(reference: string, request: Fetch, signal?: AbortSignal) {
  const url = new URL(QURAN_API);
  url.searchParams.set('verse_key', reference);
  const response = await request(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BasirahQuranSource/1.0' },
    redirect: 'error',
    signal,
  });
  if (!response.ok || (response.url && response.url !== url.toString()))
    throw new Error('QURAN_API_RESPONSE_REJECTED');
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES)
    throw new Error('QURAN_API_RESPONSE_TOO_LARGE');
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('QURAN_API_INVALID_RESPONSE');
  const verses = (parsed as Record<string, unknown>).verses;
  if (!Array.isArray(verses) || verses.length !== 1) throw new Error('QURAN_API_INVALID_RESPONSE');
  const verse = verses[0];
  if (!verse || typeof verse !== 'object' || Array.isArray(verse))
    throw new Error('QURAN_API_INVALID_RESPONSE');
  const row = verse as Record<string, unknown>;
  if (
    row.verse_key !== reference ||
    typeof row.text_uthmani !== 'string' ||
    row.text_uthmani.length < 1 ||
    row.text_uthmani.length > 2_000
  )
    throw new Error('QURAN_API_REFERENCE_MISMATCH');
  const originalText = row.text_uthmani;
  const [surah, ayah] = reference.split(':').map(Number);
  const digest = sha256(originalText);
  return SourceEvidenceSchema.parse({
    snapshotKey: `quran-com-uthmani:${reference}:${digest.slice(0, 16)}`,
    sourceId: 'quran.com-uthmani-v4',
    sourceVersion: 'api-v4-live',
    sourceRole: 'quran_text',
    reference,
    originalText,
    originalSha256: digest,
    work: 'القرآن الكريم',
    author: null,
    edition: 'Quran.com Uthmani',
    sourceUrl: `https://quran.com/${surah}/${ayah}`,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'live',
    retrievalModes: ['exact'],
    provenance: {
      provider_id: 'quran.com',
      api_version: 'v4',
      endpoint: QURAN_API,
      verse_key: reference,
      verse_id: row.id,
    },
    contextBefore: null,
    contextAfter: null,
    footnotes: [],
    relations: [],
  });
}

/** Fill explicit Quran locators that are absent from the pinned corpus without broad substitution. */
export function withExactQuranApi(
  base: ClaimCorpusSearch,
  request: Fetch = fetch,
): ClaimCorpusSearch {
  return {
    async search(query, references, signal) {
      const selected = exactReferences(references);
      const stored = await base.search(query, references, signal);
      if (!selected.length) return stored;
      const exactStored = stored.filter((row) => selected.includes(row.reference));
      const quran = new Set(
        exactStored.filter((row) => row.sourceRole === 'quran_text').map((row) => row.reference),
      );
      const live: SourceEvidence[] = [];
      for (const reference of selected) {
        if (quran.has(reference)) continue;
        try {
          live.push(await fetchVerse(reference, request, signal));
        } catch {
          signal?.throwIfAborted();
        }
      }
      return [...exactStored, ...live];
    },
    restore(keys, signal) {
      return base.restore(keys, signal);
    },
  };
}
