import { z } from 'zod';

export const SOURCE_BLOCK_SCHEME = 'exact-markdown-blocks-v1';
export const SOURCE_CONTENT_VIEW_VERSION = 'conservative-content-view-v1';
export const SOURCE_BODY_CHUNKER_VERSION = 'exact-content-block-context-v1';
export const SourceBlockLabelSchema = z.enum([
  'article',
  'citation',
  'footnote',
  'dialogue',
  'navigation',
  'audio_download',
  'related_links',
  'uncertain',
]);
export const SourceBlockDecisionSchema = z
  .object({
    blockId: z.string().regex(/^source-block:[a-f0-9]{32}$/u),
    label: SourceBlockLabelSchema,
  })
  .strict();
export const SourceContentSelectionSchema = z
  .object({
    blockScheme: z.literal(SOURCE_BLOCK_SCHEME),
    viewVersion: z.literal(SOURCE_CONTENT_VIEW_VERSION),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceUrl: z.string().url().max(1000),
    selectionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    removedBlocks: z.array(SourceBlockDecisionSchema).max(128),
    modelId: z.string().min(1).max(160),
    promptVersion: z.string().min(1).max(120),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    responseSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type SourceBlockDecision = z.infer<typeof SourceBlockDecisionSchema>;
export type SourceContentSelection = z.infer<typeof SourceContentSelectionSchema>;
