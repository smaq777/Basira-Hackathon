import { z } from 'zod';

export const RetrievalPassageSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    sourceVersion: z.string().min(1),
    reference: z.string().min(1),
    originalText: z.string().min(1),
    searchText: z.string().min(1),
    approvalStatus: z.enum(['pending', 'approved', 'rejected', 'revoked']),
    contextIds: z.array(z.string().min(1)).max(4),
  })
  .strict();
export type RetrievalPassage = z.infer<typeof RetrievalPassageSchema>;

export const RetrievalResultSchema = z
  .object({
    passage: RetrievalPassageSchema,
    retrievalModes: z
      .array(z.enum(['exact', 'lexical', 'semantic']))
      .min(1)
      .max(3),
    score: z.number().finite().nonnegative(),
    rank: z.number().int().positive(),
  })
  .strict();
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

function trigrams(value: string): Set<string> {
  const normalized = `  ${value
    .normalize('NFC')
    .replace(/[\u064B-\u0652\u0670\u0640]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()}  `;
  const output = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1)
    output.add(normalized.slice(index, index + 3));
  return output;
}

function lexicalSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function rankedIds(entries: Array<{ id: string; score: number }>): string[] {
  return entries
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((entry) => entry.id);
}

export function retrieveEvidence(input: {
  query: string;
  reference?: string | null;
  passages: RetrievalPassage[];
  semanticScores?: Record<string, number>;
  limit?: number;
}): RetrievalResult[] {
  const query = z.string().trim().min(1).max(4000).parse(input.query);
  const reference = input.reference?.trim() || null;
  const limit = z
    .number()
    .int()
    .min(1)
    .max(10)
    .parse(input.limit ?? 5);
  const passages = input.passages
    .map((passage) => RetrievalPassageSchema.parse(passage))
    .filter((passage) => passage.approvalStatus === 'approved');
  const byId = new Map(passages.map((passage) => [passage.id, passage]));
  const exact = reference
    ? passages.filter((passage) => passage.reference === reference).map((passage) => passage.id)
    : [];
  const lexical = rankedIds(
    passages.map((passage) => ({
      id: passage.id,
      score: lexicalSimilarity(query, passage.searchText),
    })),
  );
  const semantic = rankedIds(
    Object.entries(input.semanticScores ?? {})
      .filter(([id]) => byId.has(id))
      .map(([id, score]) => ({
        id,
        score: z.number().finite().min(0).max(1).parse(score),
      })),
  );

  const fused = new Map<string, { score: number; modes: Set<'exact' | 'lexical' | 'semantic'> }>();
  const add = (ids: string[], mode: 'exact' | 'lexical' | 'semantic', weight = 1) => {
    ids.forEach((id, index) => {
      const current = fused.get(id) ?? { score: 0, modes: new Set() };
      current.score += weight / (60 + index + 1);
      current.modes.add(mode);
      fused.set(id, current);
    });
  };
  add(exact, 'exact', 120);
  add(lexical, 'lexical');
  add(semantic, 'semantic');

  return [...fused.entries()]
    .sort(([leftId, left], [rightId, right]) =>
      right.score === left.score ? leftId.localeCompare(rightId) : right.score - left.score,
    )
    .slice(0, limit)
    .map(([id, value], index) =>
      RetrievalResultSchema.parse({
        passage: byId.get(id),
        retrievalModes: [...value.modes],
        score: value.score,
        rank: index + 1,
      }),
    );
}

export function recallAtK(resultIds: string[], relevantIds: string[], k = 5): number {
  const relevant = new Set(z.array(z.string().min(1)).min(1).parse(relevantIds));
  const returned = new Set(resultIds.slice(0, z.number().int().positive().parse(k)));
  let found = 0;
  for (const id of relevant) if (returned.has(id)) found += 1;
  return found / relevant.size;
}
