import { z } from 'zod';

export const GEMINI_BACKUP_MODEL = 'gemini-2.5-flash';
export const GEMINI_BACKUP_PROVIDER = 'Google';
export const GEMINI_BACKUP_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_BACKUP_MODEL}:generateContent`;

/** Server-only credentials; never serialize this configuration into traces. */
export type GeminiBackup = { apiKey: string; secondaryApiKey?: string };

export function geminiBackupConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GeminiBackup | undefined {
  if (environment.FOUNDATION_GEMINI_BACKUP_ENABLED !== 'true') return undefined;
  if (
    environment.FOUNDATION_HOSTED_PRODUCTION === 'true' ||
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT === 'production'
  )
    throw Error('GEMINI_BACKUP_REQUIRES_STAGING_OR_RESEARCH');
  const first = environment.GEMINI_API_KEY?.trim();
  const second = environment.GEMINI_API_KEY_2?.trim();
  const apiKey = first || second;
  if (!apiKey) throw Error('GEMINI_BACKUP_CONFIGURATION_REQUIRED');
  return {
    apiKey,
    ...(first && second && first !== second ? { secondaryApiKey: second } : {}),
  };
}

const PrimaryBody = z.object({
  max_tokens: z.number().int().min(1).max(7000),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user']),
        content: z.string(),
      }),
    )
    .min(2)
    .max(4),
  response_format: z.object({
    type: z.literal('json_schema'),
    json_schema: z.object({ schema: z.record(z.string(), z.unknown()) }),
  }),
});

const ServerOnlyConstraints = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
]);

/** Google's constrained decoder cannot serve our nested bounded schemas.
 * Keep JSON shape/types/enums/required fields; the original full Zod contract
 * still enforces every omitted bound after transport, before any result is used.
 */
function generationSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !ServerOnlyConstraints.has(key))
      .map(([key, value]) => {
        if (
          ['properties', '$defs'].includes(key) &&
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        )
          return [
            key,
            Object.fromEntries(
              Object.entries(value).map(([name, child]) => [
                name,
                generationSchema(child as Record<string, unknown>),
              ]),
            ),
          ];
        if (
          ['items', 'additionalProperties'].includes(key) &&
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        )
          return [key, generationSchema(value as Record<string, unknown>)];
        if (['anyOf', 'allOf', 'oneOf'].includes(key) && Array.isArray(value))
          return [key, value.map((child) => generationSchema(child as Record<string, unknown>))];
        return [key, value];
      }),
  );
}

/** Same frozen data and output ceiling; no tools, search or provider routing. */
export function geminiBackupBody(primaryBody: string): string {
  try {
    const input = PrimaryBody.parse(JSON.parse(primaryBody));
    const system = input.messages.filter((message) => message.role === 'system');
    const users = input.messages.filter((message) => message.role === 'user');
    if (system.length !== 1 || users.length !== 1) throw Error('INVALID_MESSAGES');
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system[0]!.content }] },
      contents: [{ role: 'user', parts: [{ text: users[0]!.content }] }],
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens: input.max_tokens,
        responseMimeType: 'application/json',
        responseJsonSchema: generationSchema(input.response_format.json_schema.schema),
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    if (Buffer.byteLength(body) > 500_000) throw Error('INVALID_BODY_SIZE');
    return body;
  } catch {
    throw Error('GEMINI_BACKUP_REQUEST_INVALID');
  }
}

const Count = z.number().int().nonnegative();
const NativeEnvelope = z.object({
  modelVersion: z.literal(GEMINI_BACKUP_MODEL),
  responseId: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{1,200}$/u)
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.literal('STOP'),
        content: z.object({
          parts: z
            .array(z.object({ text: z.string(), thought: z.literal(false).optional() }).strict())
            .length(1),
        }),
      }),
    )
    .length(1),
  usageMetadata: z
    .object({
      promptTokenCount: Count.optional(),
      candidatesTokenCount: Count.optional(),
      thoughtsTokenCount: Count.optional(),
      totalTokenCount: Count.optional(),
    })
    .optional(),
});

/** Normalize transport shape, retaining the actual pinned Gemini model and supplier. */
export function parseGeminiBackupEnvelope(raw: string) {
  try {
    const native = NativeEnvelope.parse(JSON.parse(raw));
    if (native.promptFeedback?.blockReason) throw Error('BLOCKED_RESPONSE');
    const usage = native.usageMetadata;
    return {
      model: native.modelVersion,
      provider: GEMINI_BACKUP_PROVIDER,
      ...(native.responseId ? { id: native.responseId } : {}),
      choices: [
        {
          finish_reason: 'stop',
          message: { content: native.candidates[0]!.content.parts[0]!.text },
        },
      ],
      ...(usage
        ? {
            usage: {
              ...(usage.promptTokenCount !== undefined
                ? { prompt_tokens: usage.promptTokenCount }
                : {}),
              ...(usage.candidatesTokenCount !== undefined
                ? {
                    completion_tokens: usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0),
                  }
                : {}),
              ...(usage.totalTokenCount !== undefined
                ? { total_tokens: usage.totalTokenCount }
                : {}),
            },
          }
        : {}),
    };
  } catch {
    throw Error('GEMINI_BACKUP_RESPONSE_INVALID');
  }
}
