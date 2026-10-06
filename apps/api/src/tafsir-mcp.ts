import { createHash } from 'node:crypto';
import {
  SourceEvidenceSchema,
  type SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';
import { sha256 } from './foundation.js';
import type { ClaimCorpusSearch } from './claim-retrieval.js';
import { closeQuotationAlignment } from './hosted-foundation.js';

const ENDPOINT = 'https://mcp.tafsir.net/mcp';
const PROTOCOL = '2025-03-26';
const SCHEMA_SHA256 = 'c492c3d0c73919981e4518a483750eae90b025559985c3fe286681e16765c332';
const SEARCH_SCHEMA_SHA256 = '7cbdcd572267ea24ed3b707457378c60620b4587e6b723c4db42ea26d427b3ba';
const WORKS = { moyassar: 'التفسير الميسر', saadi: 'تيسير الكريم الرحمن للسعدي' } as const;
const MAX_RESPONSE_BYTES = 200_000;
const MAX_AGGREGATE_BYTES = 1_000_000;
const MAX_PARTS = 8;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function parseEventStream(body: string): unknown {
  const payload = body
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return JSON.parse(payload || body);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('MCP_INVALID_OBJECT');
  return value as Record<string, unknown>;
}

type TafsirRow = {
  source: keyof typeof WORKS;
  attribution: string;
  text: string;
  text_raw: string;
  footnotes: Array<Record<string, unknown>>;
  part: number;
  total_parts: number;
  has_more: boolean;
};

/** Provider coordinates identify a footnote; only its exact text is evidence. */
function evidenceFootnotes(reference: string, row: TafsirRow) {
  if (row.footnotes.length > 80) throw new Error('MCP_FOOTNOTE_INVALID');
  const seen = new Set<number>();
  return row.footnotes.map((footnote) => {
    const { index, marker, text, type } = footnote;
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 1 ||
      seen.has(index) ||
      marker !== `[${index}]` ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 30_000 ||
      typeof type !== 'string' ||
      !type.trim() ||
      type.length > 160
    )
      throw new Error('MCP_FOOTNOTE_INVALID');
    seen.add(index);
    return {
      reference: `${reference} part ${row.part} ${marker}`,
      originalText: text,
      originalSha256: sha256(text),
    };
  });
}

class TafsirMcpClient {
  constructor(private readonly request: typeof fetch = fetch) {}
  private requests = 0;
  private bytes = 0;
  private readonly deadline = Date.now() + 12_000;

  private async rpc(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    if (this.requests >= 35 || Date.now() >= this.deadline) throw new Error('MCP_BUDGET_EXCEEDED');
    this.requests += 1;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, Math.max(1, Math.min(10_000, this.deadline - Date.now())));
    try {
      const response = await this.request(ENDPOINT, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL,
          'User-Agent': 'BasirahTafsirContext/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (![200, 202, 204].includes(response.status) || response.url !== ENDPOINT)
        throw new Error('MCP_HTTP_RESPONSE_REJECTED');
      const body = await response.text();
      const size = Buffer.byteLength(body, 'utf8');
      this.bytes += size;
      if (size > MAX_RESPONSE_BYTES || this.bytes > MAX_AGGREGATE_BYTES)
        throw new Error('MCP_RESPONSE_TOO_LARGE');
      if (!body) return null;
      return parseEventStream(body);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  async initialize(signal?: AbortSignal, searchOnly = false): Promise<Record<string, unknown>> {
    const initialized = object(
      await this.rpc(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL,
            capabilities: {},
            clientInfo: { name: 'basirah-source-context', version: '1.0' },
          },
        },
        signal,
      ),
    );
    if (initialized.jsonrpc !== '2.0' || initialized.id !== 1 || initialized.error)
      throw new Error('MCP_INITIALIZE_REJECTED');
    const result = object(initialized.result);
    if (result.protocolVersion !== PROTOCOL) throw new Error('MCP_PROTOCOL_MISMATCH');
    await this.rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, signal);
    const listed = object(
      await this.rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, signal),
    );
    const tools = object(listed.result).tools;
    if (!Array.isArray(tools)) throw new Error('MCP_TOOLS_INVALID');
    const matches = tools.filter(
      (entry) => object(entry).name === (searchOnly ? 'search_quran_text' : 'fetch_tafsir'),
    );
    if (matches.length !== 1) throw new Error('MCP_TOOL_MISSING');
    const schema = object(matches[0]).inputSchema;
    if (
      createHash('sha256').update(stable(schema), 'utf8').digest('hex') !==
      (searchOnly ? SEARCH_SCHEMA_SHA256 : SCHEMA_SHA256)
    )
      throw new Error('MCP_SCHEMA_DRIFT');
    return object(result.serverInfo);
  }

  async discoverQuran(query: string, signal?: AbortSignal): Promise<string[]> {
    const envelope = object(
      await this.rpc(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'search_quran_text', arguments: { query, limit: 3 } },
        },
        signal,
      ),
    );
    if (envelope.jsonrpc !== '2.0' || envelope.id !== 3 || envelope.error)
      throw new Error('MCP_SEARCH_REJECTED');
    const result = object(envelope.result);
    if (result.isError) throw new Error('MCP_SEARCH_REJECTED');
    const rows = object(result.structuredContent).result;
    if (!Array.isArray(rows) || rows.length > 3) throw new Error('MCP_SEARCH_RESULT_INVALID');
    const references = rows.map((value) => {
      const row = object(value);
      if (
        !Number.isInteger(row.surah) ||
        Number(row.surah) < 1 ||
        Number(row.surah) > 114 ||
        !Number.isInteger(row.ayah) ||
        Number(row.ayah) < 1 ||
        Number(row.ayah) > 286
      )
        throw new Error('MCP_SEARCH_LOCATOR_INVALID');
      return `${row.surah}:${row.ayah}`;
    });
    return [...new Set(references)];
  }

  async page(
    surah: number,
    ayah: number,
    source: keyof typeof WORKS,
    part: number,
    id: number,
    signal?: AbortSignal,
  ): Promise<TafsirRow> {
    const envelope = object(
      await this.rpc(
        {
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'fetch_tafsir', arguments: { surah, ayah, sources: [source], part } },
        },
        signal,
      ),
    );
    if (envelope.jsonrpc !== '2.0' || envelope.id !== id || envelope.error)
      throw new Error('MCP_TOOL_ENVELOPE_INVALID');
    const result = object(envelope.result);
    if (result.isError !== false || !Array.isArray(result.content) || result.content.length !== 1)
      throw new Error('MCP_TOOL_RESULT_INVALID');
    const block = object(result.content[0]);
    if (block.type !== 'text' || typeof block.text !== 'string')
      throw new Error('MCP_CONTENT_INVALID');
    const payload = object(JSON.parse(block.text));
    if (payload.surah !== surah || payload.ayah !== ayah || !Array.isArray(payload.tafsirs))
      throw new Error('MCP_REFERENCE_MISMATCH');
    const rows = payload.tafsirs.map(object);
    if (rows.length !== 1) throw new Error('MCP_SOURCE_MISMATCH');
    const row = rows[0]!;
    if (row.source !== source) throw new Error('MCP_SOURCE_MISMATCH');
    const attribution = row.attribution;
    const text = row.text;
    const rawText = row.text_raw;
    const footnotes = row.footnotes;
    if (
      typeof attribution !== 'string' ||
      typeof text !== 'string' ||
      typeof rawText !== 'string' ||
      !Array.isArray(footnotes)
    )
      throw new Error('MCP_TAFSIR_INVALID');
    const rowPart = row.part === undefined ? 1 : row.part;
    const total = row.total_parts === undefined ? 1 : row.total_parts;
    const more = row.has_more === undefined ? false : row.has_more;
    if (
      typeof rowPart !== 'number' ||
      !Number.isInteger(rowPart) ||
      typeof total !== 'number' ||
      !Number.isInteger(total) ||
      typeof more !== 'boolean' ||
      rowPart !== part ||
      rowPart < 1 ||
      rowPart > total ||
      more !== rowPart < total
    )
      throw new Error('MCP_PAGINATION_INVALID');
    return {
      source,
      attribution,
      text,
      text_raw: rawText,
      footnotes: footnotes.map(object),
      part: rowPart,
      total_parts: total,
      has_more: more,
    };
  }
}

/** Search results are locators only, never source text or relevance proof.
 * Re-fetch canonical wording and require one unique near-exact alignment. */
export function withBoundedQuranDiscovery(
  base: ClaimCorpusSearch,
  request: typeof fetch = fetch,
): ClaimCorpusSearch {
  return {
    async search(query, references, signal) {
      const stored = await base.search(query, references, signal);
      const words = query
        .normalize('NFKC')
        .replace(/[\p{M}ـ]/gu, '')
        .trim()
        .split(/\s+/u);
      if (
        references.length ||
        query.length > 700 ||
        words.length < 6 ||
        words.length > 100 ||
        /["«»﴿﴾()]/u.test(query) ||
        !/^[\p{Script=Arabic}\p{M}\sـ،؛.؟]+$/u.test(query) ||
        stored.some(
          (source) =>
            source.sourceRole === 'quran_text' &&
            sha256(source.originalText) === source.originalSha256 &&
            closeQuotationAlignment(query, source.originalText),
        )
      )
        return stored;
      try {
        const client = new TafsirMcpClient(request);
        await client.initialize(signal, true);
        const discovered = await client.discoverQuran(words.slice(0, 6).join(' '), signal);
        if (!discovered.length || discovered.length > 2) return stored;
        const exact = await base.search(query, discovered, signal);
        const matched = exact.filter(
          (source) =>
            source.sourceRole === 'quran_text' &&
            discovered.includes(source.reference) &&
            sha256(source.originalText) === source.originalSha256 &&
            closeQuotationAlignment(query, source.originalText),
        );
        const identities = new Set(
          matched.map((source) => `${source.reference}:${source.originalSha256}`),
        );
        if (identities.size !== 1) return stored;
        const source = matched[0]!;
        return [
          ...stored.filter((row) => row.snapshotKey !== source.snapshotKey),
          {
            ...source,
            provenance: {
              ...source.provenance,
              locatorDiscovery: {
                provider: 'tafsir-center-mcp',
                tool: 'search_quran_text',
                schemaSha256: SEARCH_SCHEMA_SHA256,
                canonicalRefetched: true,
              },
            },
          },
        ];
      } catch {
        signal?.throwIfAborted();
        return stored;
      }
    },
    restore(keys, signal) {
      return base.restore(keys, signal);
    },
  };
}

/** Add schema-pinned Tafsir MCP context to explicit Quran references. */
export function withLiveTafsirMcp(base: ClaimCorpusSearch): ClaimCorpusSearch {
  return {
    async search(query, references, signal) {
      signal?.throwIfAborted();
      const stored = await base.search(query, references, signal);
      const quran = new Map(
        stored.filter((row) => row.sourceRole === 'quran_text').map((row) => [row.reference, row]),
      );
      const selected = [...new Set(references)]
        .filter((reference) => /^\d{1,3}:\d{1,3}$/u.test(reference))
        .slice(0, 2);
      if (!selected.length) return stored;
      try {
        const client = new TafsirMcpClient();
        const serverInfo = await client.initialize(signal);
        const live: SourceEvidence[] = [];
        let rpcId = 100;
        for (const reference of selected) {
          const parent = quran.get(reference);
          if (!parent) continue;
          const [surah, ayah] = reference.split(':').map(Number);
          for (const source of Object.keys(WORKS) as Array<keyof typeof WORKS>) {
            const completeWork: SourceEvidence[] = [];
            let expectedParts: number | undefined;
            let complete = false;
            try {
              for (let part = 1; part <= MAX_PARTS; part += 1) {
                const row = await client.page(surah!, ayah!, source, part, ++rpcId, signal);
                expectedParts ??= row.total_parts;
                if (row.total_parts !== expectedParts || row.total_parts > MAX_PARTS)
                  throw new Error('MCP_PAGINATION_INVALID');
                const key = `tafsir-mcp:${source}:${reference}:${part}:${sha256(row.text).slice(0, 16)}`;
                completeWork.push(
                  SourceEvidenceSchema.parse({
                    snapshotKey: key,
                    sourceId: `tafsir-center-mcp:${source}`,
                    sourceVersion: SCHEMA_SHA256,
                    sourceRole: 'tafsir_commentary',
                    reference,
                    originalText: row.text,
                    originalSha256: sha256(row.text),
                    work: WORKS[source],
                    author: row.attribution,
                    edition: null,
                    sourceUrl: ENDPOINT,
                    approvalStatus: 'pending',
                    researchOnly: true,
                    parentSnapshotKey: parent.snapshotKey,
                    delivery: 'live',
                    retrievalModes: ['exact'],
                    provenance: {
                      provider_id: 'tafsir-center-mcp',
                      schema_sha256: SCHEMA_SHA256,
                      server_info: serverInfo,
                      original_raw_text: row.text_raw,
                      part: row.part,
                      total_parts: row.total_parts,
                      provider_footnotes: row.footnotes,
                    },
                    contextBefore: null,
                    contextAfter: null,
                    footnotes: evidenceFootnotes(reference, row),
                    relations: [],
                  }),
                );
                if (!row.has_more) {
                  complete = true;
                  break;
                }
              }
              if (!complete) throw new Error('MCP_PAGINATION_INCOMPLETE');
              live.push(...completeWork);
            } catch {
              signal?.throwIfAborted();
              // A failed or incomplete work cannot erase other completed works.
            }
          }
        }
        return [...stored, ...live];
      } catch {
        signal?.throwIfAborted();
        return stored;
      }
    },
    restore(keys, signal) {
      return base.restore(keys, signal);
    },
  };
}
