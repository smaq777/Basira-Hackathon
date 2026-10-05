import { describe, it, expect, vi } from 'vitest';
import {
  createPageTopicClassifier,
  PAGE_TOPIC_MODEL,
  PAGE_TOPIC_PROMPT,
  PAGE_CONTENT_PROMPT,
} from '../apps/api/src/page-topic-classifier.js';
import { sha256 } from '../apps/api/src/foundation.js';
import { sourceBlocks } from '../apps/api/src/source-content-view.js';
const text = 'An owned public page with enough context for topic classification.';
const page = {
  originalText: text,
  originalSha256: sha256(text),
  sourceUrl: 'https://owned.example/book/1',
};
const envelope = (payload: unknown) => ({
  model: PAGE_TOPIC_MODEL,
  provider: 'OpenAI',
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
});
describe('bounded public-page topic labels', () => {
  it('makes one joint request for topics and exact block IDs without rewriting original text', async () => {
    const original = 'لا يجوز حذف هذا الشرط.\n\n2. تصحيح القول السابق؛ يجوز ذلك عند الحاجة.';
    const input = { ...page, originalText: original, originalSha256: sha256(original) },
      before = structuredClone(input);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)),
        supplied = JSON.parse(body.messages[1].content);
      expect(body.reasoning).toEqual({ effort: 'low', exclude: true });
      expect(body.messages[0].content).toContain('EVERY');
      expect(supplied.blocks.map((b: { originalText: string }) => b.originalText).join('')).toBe(
        original,
      );
      return Response.json(
        envelope({
          topics: ['worship'],
          blocks: supplied.blocks.map((b: { blockId: string }) => ({
            blockId: b.blockId,
            label: 'navigation',
          })),
        }),
      );
    });
    const result = await createPageTopicClassifier({ apiKey: 'owned', fetch, contentViews: true })(
      input,
    );
    expect(result.promptVersion).toBe(PAGE_CONTENT_PROMPT);
    expect(result.contentViewStatus).toBe('original_retained_no_removal');
    expect(result.contentSelection!.removedBlocks).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(input).toEqual(before);
  });
  it.each(['missing', 'duplicate'] as const)(
    'retains valid topics but no cleaning selection after %s block labels, without retry',
    async (kind) => {
      const original = 'المتن محفوظ.\n\nالحاشية محفوظة.',
        input = { ...page, originalText: original, originalSha256: sha256(original) };
      const labels = sourceBlocks(input).map((b) => ({ blockId: b.blockId, label: 'article' }));
      const invalid = kind === 'missing' ? labels.slice(1) : [labels[0]!, labels[0]!];
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(envelope({ topics: ['other'], blocks: invalid })),
      );
      const result = await createPageTopicClassifier({
        apiKey: 'owned',
        fetch,
        contentViews: true,
      })(input);
      expect(result.topics).toEqual(['other']);
      expect(result.contentViewStatus).toBe('original_retained_invalid_labels');
      expect(result.contentSelection).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('pins route and strict labels, preserves classification hashes without approving the source', async () => {
    const payload = envelope({ topics: ['ethics', 'family', 'ethics'] });
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: PAGE_TOPIC_MODEL,
        provider: { only: ['OpenAI'], allow_fallbacks: false },
      });
      expect(body.messages[0].content).toContain('untrusted');
      return Response.json(payload);
    });
    const result = await createPageTopicClassifier({ apiKey: 'owned', fetch })(page);
    expect(result).toMatchObject({
      topics: ['ethics', 'family'],
      modelId: PAGE_TOPIC_MODEL,
      promptVersion: PAGE_TOPIC_PROMPT,
      responseSha256: sha256(JSON.stringify(payload)),
    });
    expect(result.requestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result)).not.toContain('owned');
    expect(result).not.toHaveProperty('approvalStatus');
  });
  it.each(['unknown-topic', 'extra-key', 'wrong-model', 'wrong-provider', 'truncated'] as const)(
    'rejects incompatible %s responses without retries',
    async (kind) => {
      const payload = envelope(
        kind === 'unknown-topic'
          ? { topics: ['not-a-topic'] }
          : kind === 'extra-key'
            ? { topics: ['ethics'], approved: true }
            : { topics: ['ethics'] },
      );
      if (kind === 'wrong-model') payload.model = 'other/model';
      if (kind === 'wrong-provider') payload.provider = 'Other';
      if (kind === 'truncated') payload.choices[0]!.finish_reason = 'length';
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(payload));
      await expect(createPageTopicClassifier({ apiKey: 'owned', fetch })(page)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects altered originals and cancellation before making a paid request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const classify = createPageTopicClassifier({ apiKey: 'owned', fetch });
    await expect(classify({ ...page, originalText: 'changed' })).rejects.toThrow(
      'PAGE_CLASSIFIER_ORIGINAL_INVALID',
    );
    await expect(classify(page, AbortSignal.abort())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds response bodies and a hung provider that ignores abort', async () => {
    const large = vi.fn<typeof globalThis.fetch>(async () => new Response('x'.repeat(30001)));
    await expect(
      createPageTopicClassifier({ apiKey: 'owned', fetch: large })(page),
    ).rejects.toThrow('PAGE_CLASSIFIER_RESPONSE_TOO_LARGE');
    const hung = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    await expect(
      createPageTopicClassifier({ apiKey: 'owned', fetch: hung, timeoutMs: 10 })(page),
    ).rejects.toThrow('PAGE_CLASSIFIER_TIMEOUT_OR_CANCELLED');
    expect(hung).toHaveBeenCalledTimes(1);
  });
});
