import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import bundledPolicy from '../../../config/source-policy.json' with { type: 'json' };
import { canonical, sha256 } from './foundation.js';
import type { WebSourcePolicy } from './web-discovery.js';

const domain = z
  .string()
  .max(253)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/u);
const path = z
  .string()
  .min(1)
  .max(1000)
  .refine(
    (value) =>
      value.startsWith('/') &&
      !/[\\\u0000-\u0020?#%]/u.test(value) &&
      !value.split('/').some((part) => part === '.' || part === '..'),
  );
const SourcePolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.string().min(1).max(120),
    referenceDocument: z
      .object({
        name: z.string().min(1).max(200),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        pages: z.array(z.number().int().positive()).max(20),
      })
      .strict(),
    deniedDomains: z.array(domain).max(100),
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,80}$/u),
            domain,
            pathPrefixes: z.array(path).min(1).max(20),
            excludedPrefixes: z.array(path).max(20),
            includeTags: z.array(z.string().min(1).max(200)).max(10).optional(),
            enabled: z.boolean(),
            basis: z.enum(['hackathon_listed', 'owner_selected']),
            documentPages: z.array(z.number().int().positive()).max(20),
            sourceRole: z.enum(['book_excerpt', 'scholar_explanation']),
            notes: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type SourcePolicy = z.infer<typeof SourcePolicySchema>;
export function parseSourcePolicy(input: unknown) {
  const policy = SourcePolicySchema.parse(input);
  if (
    new Set(policy.sources.map((row) => row.domain)).size !== policy.sources.length ||
    new Set(policy.sources.map((row) => row.id)).size !== policy.sources.length
  )
    throw new Error('SOURCE_POLICY_DUPLICATE');
  const enabled = policy.sources.filter(
    (row) => row.enabled && !policy.deniedDomains.includes(row.domain),
  );
  const policies: WebSourcePolicy[] = enabled.map((row) => ({
    domain: row.domain,
    pathPrefixes: row.pathPrefixes,
    excludedPrefixes: row.excludedPrefixes,
    ...(row.includeTags ? { includeTags: row.includeTags } : {}),
  }));
  return { policy, enabled, policies, sha256: sha256(canonical(policy)) };
}
export type LoadedSourcePolicy = ReturnType<typeof parseSourcePolicy>;
/** Trusted operator file only; browser text and models never select a policy path. */
export async function loadSourcePolicy(operatorPath?: string): Promise<LoadedSourcePolicy> {
  if (!operatorPath) return parseSourcePolicy(bundledPolicy);
  const data = await readFile(operatorPath);
  if (data.byteLength > 64_000) throw new Error('SOURCE_POLICY_TOO_LARGE');
  return parseSourcePolicy(JSON.parse(data.toString('utf8')));
}
