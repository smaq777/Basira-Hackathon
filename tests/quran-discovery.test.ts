import { describe, it, expect, vi } from 'vitest';
import { withBoundedQuranDiscovery } from '../apps/api/src/tafsir-mcp.js';
import { createHostedDraftAdapter } from '../apps/api/src/hosted-foundation.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';

const schema = {
  properties: {
    query: { title: 'Query', type: 'string' },
    surah_filter: {
      anyOf: [{ items: { type: 'integer' }, type: 'array' }, { type: 'null' }],
      default: null,
      title: 'Surah Filter',
    },
    limit: { default: 20, maximum: 100, minimum: 1, title: 'Limit', type: 'integer' },
  },
  required: ['query'],
  title: 'search_quran_textArguments',
  type: 'object',
};
const text = 'وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لهم';
const original =
  'إِن تُبْدُوا الصَّدَقَاتِ فَنِعِمَّا هِيَ وَإِن تُخْفُوهَا وَتُؤْتُوهَا الْفُقَرَاءَ فَهُوَ خَيْرٌ لَكُمْ';
const source: SourceEvidence = {
  snapshotKey: 'canonical:2:271',
  sourceId: 'canonical',
  sourceVersion: 'v1',
  sourceRole: 'quran_text',
  reference: '2:271',
  originalText: original,
  originalSha256: sha256(original),
  work: 'القرآن الكريم',
  author: null,
  edition: null,
  sourceUrl: 'https://quran.com/2/271',
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'live',
  retrievalModes: ['exact'],
  provenance: {},
};
function fixture(
  rows: unknown[] = [{ surah: 2, ayah: 271 }],
  canonical: SourceEvidence[] = [source],
  toolSchema: unknown = schema,
) {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    const result =
      payload.method === 'initialize'
        ? { protocolVersion: '2025-03-26', serverInfo: { name: 'test' } }
        : payload.method === 'tools/list'
          ? { tools: [{ name: 'search_quran_text', inputSchema: toolSchema }] }
          : { isError: false, structuredContent: { result: rows } };
    const response = new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result }));
    Object.defineProperty(response, 'url', { value: 'https://mcp.tafsir.net/mcp' });
    return response;
  });
  const base = {
    search: vi.fn(async (_query: string, refs: string[]) => (refs.length ? canonical : [])),
    restore: vi.fn(async () => []),
  };
  return { request, base, corpus: withBoundedQuranDiscovery(base, request as typeof fetch) };
}
describe('bounded canonical Quran locator discovery', () => {
  it('finds the altered bare excerpt using an MCP locator, then compares re-fetched canonical text', async () => {
    const f = fixture();
    const result = await createHostedDraftAdapter('test', f.corpus).analyze(
      text,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.quotationFindings[0]).toMatchObject({
      status: 'mismatch',
      comparison: {
        fidelity: 'different',
        extent: 'excerpt',
        differences: [{ kind: 'replace', quotedText: 'لهم', sourceText: 'لَكُمْ' }],
      },
    });
    expect(f.base.search).toHaveBeenCalledWith(text, ['2:271'], undefined);
    const search = JSON.parse(String(f.request.mock.calls.at(-1)?.[1]?.body));
    expect(search.params.arguments).toEqual({
      query: 'وإن تخفوها وتؤتوها الفقراء فهو خير',
      limit: 3,
    });
    expect(result.evidence[0]?.originalText).toBe(original);
    expect(result.evidence[0]?.provenance.locatorDiscovery).toMatchObject({
      canonicalRefetched: true,
    });
  });
  it('never presents the MCP search snippet as source evidence', async () => {
    const f = fixture([{ surah: 2, ayah: 271, text: original, snippet: original }], []);
    expect(await f.corpus.search(text, [])).toEqual([]);
  });
  it('abstains on unrelated canonical text, invalid hashes and multiple aligned identities', async () => {
    for (const canonical of [
      [
        {
          ...source,
          originalText: 'نص غير متعلق بالمقتطف',
          originalSha256: sha256('نص غير متعلق بالمقتطف'),
        },
      ],
      [{ ...source, originalSha256: '0'.repeat(64) }],
      [source, { ...source, snapshotKey: 'other', reference: '3:1' }],
    ]) {
      const f = fixture(
        [
          { surah: 2, ayah: 271 },
          { surah: 3, ayah: 1 },
        ],
        canonical,
      );
      expect(await f.corpus.search(text, [])).toEqual([]);
    }
  });
  it('fails closed on schema drift, malformed locators and excessive candidate counts', async () => {
    for (const f of [
      fixture(undefined, undefined, {}),
      fixture([{ surah: 999, ayah: 1 }]),
      fixture([
        { surah: 2, ayah: 1 },
        { surah: 3, ayah: 1 },
        { surah: 4, ayah: 1 },
      ]),
    ]) {
      expect(await f.corpus.search(text, [])).toEqual([]);
      expect(f.base.search).toHaveBeenCalledOnce();
    }
  });
  it('does not search short phrases, explicit references, quoted input or long paragraphs', async () => {
    const f = fixture();
    for (const [query, refs] of [
      ['خير لكم', []],
      [text, ['2:271']],
      [`«${text}»`, []],
      [text.repeat(30), []],
    ] as Array<[string, string[]]>)
      await f.corpus.search(query, refs);
    expect(f.request).not.toHaveBeenCalled();
  });
  it('abstains on provider errors and propagates cancellation', async () => {
    const f = fixture();
    f.request.mockRejectedValue(new Error('unavailable'));
    expect(await f.corpus.search(text, [])).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(f.corpus.search(text, [], controller.signal)).rejects.toThrow();
  });
});
