import { afterEach, describe, expect, it, vi } from 'vitest';
import { withLiveTafsirMcp } from '../apps/api/src/tafsir-mcp.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { SourceEvidenceSchema } from '../packages/contracts/src/foundation.js';
import { createHostedDraftAdapter } from '../apps/api/src/hosted-foundation.js';
import { evidencePacketFits } from '../apps/api/src/evidence-budget.js';

const schema = {
  properties: {
    surah: { title: 'Surah', type: 'integer' },
    ayah: { title: 'Ayah', type: 'integer' },
    sources: {
      anyOf: [{ items: { type: 'string' }, type: 'array' }, { type: 'null' }],
      default: null,
      title: 'Sources',
    },
    part: { default: 1, title: 'Part', type: 'integer' },
  },
  required: ['surah', 'ayah'],
  title: 'get_ayah_tafsirArguments',
  type: 'object',
};
// Exact footnote shape and short critical-apparatus excerpt from the public
// 7:31 Saadi response captured on 6 October; never a semantic gold verdict.
const footnote = {
  index: 1,
  marker: '[1]',
  text: 'في (ب): «الذي يضرّ».',
  type: 'manuscript_variant',
};
const raw = 'المأكولات التي تضر ¬في (ب): «الذي يضرّ».¥ بالجسم';
const parent = SourceEvidenceSchema.parse({
  snapshotKey: 'test-quran:7:31',
  sourceId: 'test',
  sourceVersion: 'v1',
  sourceRole: 'quran_text',
  reference: '7:31',
  originalText: 'وكلوا واشربوا ولا تسرفوا',
  originalSha256: sha256('وكلوا واشربوا ولا تسرفوا'),
  work: 'القرآن الكريم',
  author: null,
  edition: null,
  sourceUrl: 'https://quran.com/7/31',
  approvalStatus: 'pending',
  researchOnly: true,
  parentSnapshotKey: null,
  delivery: 'live',
  retrievalModes: ['exact'],
  provenance: {},
});
type Page = Record<string, unknown>;
function fixture(
  page: (source: string, part: number) => Page = (source) => ({
    source,
    attribution:
      source === 'saadi'
        ? 'تيسير الكريم الرحمن، عبد الرحمن بن ناصر السعدي (ت. 1376هـ)'
        : 'التفسير الميسر، مجمع الملك فهد لطباعة المصحف الشريف',
    text: source === 'saadi' ? raw : 'ولا تتجاوزوا حدود الاعتدال في ذلك.',
    text_raw: source === 'saadi' ? raw : 'ولا تتجاوزوا حدود الاعتدال في ذلك.',
    footnotes: source === 'saadi' ? [footnote] : [],
  }),
  toolSchema: unknown = schema,
) {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const packet = JSON.parse(String(init?.body));
    const result =
      packet.method === 'initialize'
        ? { protocolVersion: '2025-03-26', serverInfo: { name: 'public-contract-replay' } }
        : packet.method === 'tools/list'
          ? { tools: [{ name: 'fetch_tafsir', inputSchema: toolSchema }] }
          : packet.method === 'notifications/initialized'
            ? null
            : {
                isError: false,
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      surah: 7,
                      ayah: 31,
                      tafsirs: [
                        page(packet.params.arguments.sources[0], packet.params.arguments.part),
                      ],
                    }),
                  },
                ],
              };
    const response = new Response(
      result ? JSON.stringify({ jsonrpc: '2.0', id: packet.id, result }) : null,
    );
    Object.defineProperty(response, 'url', { value: 'https://mcp.tafsir.net/mcp' });
    return response;
  });
  vi.stubGlobal('fetch', request);
  const base = { search: vi.fn(async () => [parent]), restore: vi.fn(async () => []) };
  return { request, base, corpus: withLiveTafsirMcp(base) };
}
afterEach(() => vi.unstubAllGlobals());

describe('bounded live Tafsir acquisition', () => {
  it('maps the captured 7:31 manuscript footnote without changing originals or dropping either work', async () => {
    const f = fixture();
    const result = await f.corpus.search('ولا تسرفوا', ['7:31']);
    expect(result.map((row) => row.sourceRole)).toEqual([
      'quran_text',
      'tafsir_commentary',
      'tafsir_commentary',
    ]);
    const saadi = result.find((row) => row.sourceId.endsWith(':saadi'))!;
    expect(saadi.originalText).toBe(raw);
    expect(saadi.originalSha256).toBe(sha256(raw));
    expect(saadi.provenance.original_raw_text).toBe(raw);
    expect(saadi.provenance.provider_footnotes).toEqual([footnote]);
    expect(saadi.footnotes).toEqual([
      {
        reference: '7:31 part 1 [1]',
        originalText: footnote.text,
        originalSha256: sha256(footnote.text),
      },
    ]);
    expect(saadi.parentSnapshotKey).toBe(parent.snapshotKey);
    expect(saadi).toMatchObject({
      approvalStatus: 'pending',
      researchOnly: true,
      delivery: 'live',
    });
    expect(SourceEvidenceSchema.safeParse(saadi).success).toBe(true);
  });

  it('keeps a completed work when the other provider work has an unsupported footnote', async () => {
    const f = fixture((source) => ({
      source,
      attribution: 'نسبة اختبار',
      text: 'نص اختبار',
      text_raw: 'نص اختبار',
      footnotes: source === 'saadi' ? [{ text: 'هامش بلا إحداثيات' }] : [],
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:moyassar']);
  });

  it('continues to the second work when the first work fails', async () => {
    const f = fixture((source) => ({
      source,
      attribution: 'نسبة اختبار',
      text: 'نص اختبار',
      text_raw: 'نص اختبار',
      footnotes: source === 'moyassar' ? [{ text: 'هامش بلا إحداثيات' }] : [],
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:saadi']);
  });

  it('discards every page of a work whose later page changes its total_parts', async () => {
    const f = fixture((source, part) => ({
      source,
      attribution: 'نسبة اختبار',
      text: `نص ${part}`,
      text_raw: `نص ${part}`,
      footnotes: [],
      part,
      total_parts: source === 'moyassar' ? (part === 1 ? 2 : 3) : 1,
      has_more: source === 'moyassar' && part < 3,
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:saadi']);
  });

  it('rejects a work that still has more after the maximum eight parts', async () => {
    const f = fixture((source, part) => ({
      source,
      attribution: 'نسبة اختبار',
      text: `نص ${part}`,
      text_raw: `نص ${part}`,
      footnotes: [],
      part,
      total_parts: source === 'saadi' ? 9 : 1,
      has_more: source === 'saadi',
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:moyassar']);
  });

  it('retains all pages only after a work completes consistently', async () => {
    const f = fixture((source, part) => ({
      source,
      attribution: 'نسبة اختبار',
      text: `نص ${part}`,
      text_raw: `نص ${part}`,
      footnotes: [],
      part,
      total_parts: source === 'saadi' ? 2 : 1,
      has_more: source === 'saadi' && part === 1,
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.map((row) => row.provenance.part)).toEqual([undefined, 1, 1, 2]);
  });

  it.each([
    { ...footnote, index: 0 },
    { ...footnote, index: '1' },
    { ...footnote, marker: '[2]' },
    { ...footnote, text: ' ' },
    { ...footnote, type: null },
  ])(
    'rejects an unsupported footnote without erasing the other complete work: %j',
    async (invalid) => {
      const f = fixture((source) => ({
        source,
        attribution: 'نسبة اختبار',
        text: 'نص اختبار',
        text_raw: 'نص اختبار',
        footnotes: source === 'saadi' ? [invalid] : [],
      }));
      const result = await f.corpus.search('اختبار', ['7:31']);
      expect(result.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:moyassar']);
    },
  );

  it('preserves additional provider metadata while rejecting duplicate footnote coordinates', async () => {
    const metadata = { ...footnote, edition: { manuscript: 'ب', variant: 'الذي يضرّ' } };
    const f = fixture((source) => ({
      source,
      attribution: 'نسبة اختبار',
      text: raw,
      text_raw: raw,
      footnotes: [metadata],
      text_display: 'عرض منفصل',
      provider_metadata: { untrusted: true },
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    const saadi = result.find((row) => row.sourceId.endsWith(':saadi'))!;
    expect(saadi.provenance.provider_footnotes).toEqual([metadata]);
    expect(saadi.provenance).not.toHaveProperty('provider_row');
    const duplicates = fixture((source) => ({
      source,
      attribution: 'نسبة اختبار',
      text: raw,
      text_raw: raw,
      footnotes: source === 'saadi' ? [footnote, footnote] : [],
    }));
    const rejected = await duplicates.corpus.search('اختبار', ['7:31']);
    expect(rejected.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:moyassar']);
  });

  it('discards a partially fetched work after a transport failure and acquires the second work', async () => {
    const f = fixture((source, part) => {
      if (source === 'moyassar' && part === 2) throw new Error('OFFLINE_TRANSPORT_FAILURE');
      return {
        source,
        attribution: 'نسبة اختبار',
        text: `نص ${part}`,
        text_raw: `نص ${part}`,
        footnotes: [],
        part,
        total_parts: source === 'moyassar' ? 2 : 1,
        has_more: source === 'moyassar',
      };
    });
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.map((row) => row.sourceId)).toEqual(['test', 'tafsir-center-mcp:saadi']);
  });

  it('accepts a fully completed eight-part work without fetching a ninth page', async () => {
    const f = fixture((source, part) => ({
      source,
      attribution: 'نسبة اختبار',
      text: `نص ${part}`,
      text_raw: `نص ${part}`,
      footnotes: [],
      part,
      total_parts: source === 'saadi' ? 8 : 1,
      has_more: source === 'saadi' && part < 8,
    }));
    const result = await f.corpus.search('اختبار', ['7:31']);
    expect(result.filter((row) => row.sourceId.endsWith(':saadi'))).toHaveLength(8);
    expect(
      f.request.mock.calls
        .map(([, init]) => JSON.parse(String(init?.body)))
        .filter((packet) => packet.method === 'tools/call'),
    ).toHaveLength(9);
  });

  it('keeps a complete multipart packet within the existing budget without copying large display variants', async () => {
    const f = fixture((source, part) => ({
      source,
      attribution: 'نسبة اختبار',
      text: 'نص '.repeat(500),
      text_raw: 'نص '.repeat(500),
      text_display: 'عرض '.repeat(4000),
      text_clean: 'عرض '.repeat(4000),
      footnotes: [footnote],
      part,
      total_parts: source === 'saadi' ? 8 : 1,
      has_more: source === 'saadi' && part < 8,
    }));
    const intake = await createHostedDraftAdapter('mcp-contract-fixture', f.corpus).analyze(
      'قال تعالى: «وكلوا واشربوا ولا تسرفوا» [الأعراف: 31].',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(intake.evidence.filter((row) => row.sourceId.endsWith(':saadi'))).toHaveLength(8);
    expect(evidencePacketFits(intake, intake.evidence)).toBe(true);
    for (const row of intake.evidence.filter((row) => row.sourceRole === 'tafsir_commentary')) {
      expect(row.provenance.provider_footnotes).toEqual([footnote]);
      expect(row.provenance).not.toHaveProperty('provider_row');
      expect(row.originalText).toBe('نص '.repeat(500));
    }
  });

  it('rejects schema drift before acquiring any live source', async () => {
    const f = fixture(undefined, { ...schema, required: ['surah'] });
    expect(await f.corpus.search('اختبار', ['7:31'])).toEqual([parent]);
    expect(f.request).toHaveBeenCalledTimes(3);
  });

  it('propagates caller cancellation even after a completed work has been buffered', async () => {
    const controller = new AbortController();
    const reason = new Error('CALLER_CANCELLED');
    const f = fixture((source) => {
      if (source === 'saadi') {
        controller.abort(reason);
        throw reason;
      }
      return { source, attribution: 'نسبة اختبار', text: raw, text_raw: raw, footnotes: [] };
    });
    await expect(f.corpus.search('اختبار', ['7:31'], controller.signal)).rejects.toBe(reason);
  });

  it('makes no acquisition request for an already cancelled search', async () => {
    const controller = new AbortController();
    controller.abort(new Error('CALLER_CANCELLED'));
    const f = fixture();
    await expect(f.corpus.search('اختبار', ['7:31'], controller.signal)).rejects.toThrow(
      'CALLER_CANCELLED',
    );
    expect(f.request).not.toHaveBeenCalled();
    expect(f.base.search).not.toHaveBeenCalled();
  });
});
