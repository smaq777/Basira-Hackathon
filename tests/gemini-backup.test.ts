import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EvidenceSupportOutputSchema } from '../packages/contracts/src/semantic-assessment.js';
import {
  geminiBackupConfiguration,
  geminiBackupBody,
  parseGeminiBackupEnvelope,
  GEMINI_BACKUP_MODEL,
} from '../apps/api/src/gemini-backup.js';

const body = JSON.stringify({
  model: 'openai/gpt-6-luna',
  provider: { only: ['OpenAI'] },
  max_tokens: 2400,
  messages: [
    { role: 'system', content: 'Use supplied evidence only.' },
    { role: 'user', content: '{"untrustedData":"owned fixture"}' },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      strict: true,
      schema: {
        type: 'object',
        properties: { claims: { type: 'array', items: { type: 'string' } } },
        required: ['claims'],
        additionalProperties: false,
      },
    },
  },
});
function envelope(extra = {}) {
  return JSON.stringify({
    modelVersion: GEMINI_BACKUP_MODEL,
    responseId: 'owned-response-1',
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"claims":[]}' }] } }],
    usageMetadata: {
      promptTokenCount: 40,
      candidatesTokenCount: 9,
      thoughtsTokenCount: 0,
      totalTokenCount: 49,
    },
    ...extra,
  });
}
describe('direct Gemini backup boundary', () => {
  it('avoids the observed Google constraint-state explosion while preserving full server validation', () => {
    const input = JSON.parse(body);
    input.response_format.json_schema.schema = z.toJSONSchema(EvidenceSupportOutputSchema);
    const wire = JSON.parse(geminiBackupBody(JSON.stringify(input))).generationConfig
      .responseJsonSchema;
    expect(wire.properties.assessments.maxItems).toBeUndefined();
    expect(wire.properties.assessments.items.properties.conditions.items.maxLength).toBeUndefined();
    expect(wire.properties.assessments.items.properties.status.enum).toEqual([
      'supported',
      'contradicted',
      'not_established',
      'insufficient_context',
      'not_applicable',
    ]);
    expect(wire.properties.assessments.items.additionalProperties).toBe(false);
    expect(wire.properties.assessments.items.required).toContain('citations');
    expect(
      EvidenceSupportOutputSchema.safeParse({
        assessments: Array(6).fill({
          claimId: 'owned',
          status: 'not_applicable',
          conditions: [],
          negations: [],
          exceptions: [],
          scope: [],
          citations: [],
          explanation: 'مثال',
        }),
      }).success,
    ).toBe(false);
    expect(input.response_format.json_schema.schema.properties.assessments.maxItems).toBe(5);
  });
  it('defaults off and privately selects distinct configured keys', () => {
    expect(geminiBackupConfiguration({ GEMINI_API_KEY: 'first-owned-fixture' })).toBeUndefined();
    expect(
      geminiBackupConfiguration({
        FOUNDATION_GEMINI_BACKUP_ENABLED: 'true',
        GEMINI_API_KEY: 'first-owned-fixture',
        GEMINI_API_KEY_2: 'second-owned-fixture',
      }),
    ).toEqual({ apiKey: 'first-owned-fixture', secondaryApiKey: 'second-owned-fixture' });
    expect(
      geminiBackupConfiguration({
        FOUNDATION_GEMINI_BACKUP_ENABLED: 'true',
        GEMINI_API_KEY_2: 'second-owned-fixture',
      }),
    ).toEqual({ apiKey: 'second-owned-fixture' });
    expect(
      geminiBackupConfiguration({
        FOUNDATION_GEMINI_BACKUP_ENABLED: 'true',
        GEMINI_API_KEY: 'same-owned-fixture',
        GEMINI_API_KEY_2: 'same-owned-fixture',
      }),
    ).toEqual({ apiKey: 'same-owned-fixture' });
    expect(() => geminiBackupConfiguration({ FOUNDATION_GEMINI_BACKUP_ENABLED: 'true' })).toThrow(
      'GEMINI_BACKUP_CONFIGURATION_REQUIRED',
    );
    expect(() =>
      geminiBackupConfiguration({
        FOUNDATION_GEMINI_BACKUP_ENABLED: 'true',
        GEMINI_API_KEY: 'owned-fixture',
        FOUNDATION_HOSTED_PRODUCTION: 'true',
      }),
    ).toThrow('GEMINI_BACKUP_REQUIRES_STAGING_OR_RESEARCH');
  });
  it('preserves the frozen prompts, schema and token bound while removing OpenRouter fields', () => {
    const request = JSON.parse(geminiBackupBody(body));
    const original = JSON.parse(body);
    expect(request.systemInstruction.parts[0].text).toBe(original.messages[0].content);
    expect(request.contents).toEqual([
      { role: 'user', parts: [{ text: original.messages[1].content }] },
    ]);
    expect(request.generationConfig.responseJsonSchema).toEqual(
      original.response_format.json_schema.schema,
    );
    expect(request.generationConfig).toMatchObject({
      maxOutputTokens: 2400,
      candidateCount: 1,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(request.provider).toBeUndefined();
    expect(request.tools).toBeUndefined();
    expect(() => geminiBackupBody(JSON.stringify({ ...original, max_tokens: 100000 }))).toThrow(
      'GEMINI_BACKUP_REQUEST_INVALID',
    );
  });
  it('keeps actual supplier identity and reports token usage without inventing cost', () => {
    expect(parseGeminiBackupEnvelope(envelope())).toMatchObject({
      model: GEMINI_BACKUP_MODEL,
      provider: 'Google',
      id: 'owned-response-1',
      choices: [{ finish_reason: 'stop', message: { content: '{"claims":[]}' } }],
      usage: { prompt_tokens: 40, completion_tokens: 9, total_tokens: 49 },
    });
    expect(parseGeminiBackupEnvelope(envelope()).usage).not.toHaveProperty('cost');
  });
  it.each([
    { modelVersion: 'different-model' },
    { candidates: [] },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ thought: true, text: 'private reasoning' }, { text: '{}' }] },
        },
      ],
    },
    {
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'tool' } }] } },
      ],
    },
    { promptFeedback: { blockReason: 'SAFETY' } },
    { usageMetadata: { totalTokenCount: -1 } },
  ])('rejects mismatched identity, refusals, incomplete content and invalid usage', (extra) => {
    expect(() => parseGeminiBackupEnvelope(envelope(extra))).toThrow(
      'GEMINI_BACKUP_RESPONSE_INVALID',
    );
  });
});
