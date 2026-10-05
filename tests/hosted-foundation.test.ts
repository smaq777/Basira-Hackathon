import { expect, it } from 'vitest';
import {
  createHostedDraftAdapter,
  foundationRuntimeMode,
} from '../apps/api/src/hosted-foundation.js';
import { sha256 } from '../apps/api/src/foundation.js';
import type { SourceEvidence } from '../packages/contracts/src/foundation.js';
import { extractQuranReferences } from '../apps/api/src/quran-reference.js';

const revisionId = '33333333-3333-4333-8333-333333333333';
const hostedDemoEnvironment = {
  FOUNDATION_ENABLED: 'true',
  FOUNDATION_HOSTED_DEMO: 'true',
  FOUNDATION_SEMANTIC_ENABLED: 'true',
  FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
  NODE_ENV: 'production',
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  BASIRAH_DEPLOYMENT_ENVIRONMENT: 'staging',
  FOUNDATION_STAGING_SERVICE_ID: '4d15a8f1-0028-42d6-adfa-cef07e55a9bc',
  RAILWAY_SERVICE_ID: '4d15a8f1-0028-42d6-adfa-cef07e55a9bc',
  BASIRAH_DEPLOYMENT_REF: 'refs/heads/development',
  BASIRAH_DEPLOYMENT_SHA: '1'.repeat(40),
  RAILWAY_GIT_BRANCH: 'development',
  RAILWAY_GIT_COMMIT_SHA: '1'.repeat(40),
  DATABASE_TLS_MODE: 'require',
  FOUNDATION_CORPUS_TLS_MODE: 'verify-full',
} satisfies NodeJS.ProcessEnv;

const hostedProductionEnvironment = {
  FOUNDATION_ENABLED: 'true',
  FOUNDATION_HOSTED_PRODUCTION: 'true',
  FOUNDATION_SEMANTIC_ENABLED: 'true',
  FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
  NODE_ENV: 'production',
  RAILWAY_ENVIRONMENT_NAME: 'production',
  BASIRAH_DEPLOYMENT_ENVIRONMENT: 'production',
  FOUNDATION_PRODUCTION_SERVICE_ID: '4d15a8f1-0028-42d6-adfa-cef07e55a9bc',
  RAILWAY_SERVICE_ID: '4d15a8f1-0028-42d6-adfa-cef07e55a9bc',
  BASIRAH_DEPLOYMENT_REF: 'refs/heads/main',
  BASIRAH_DEPLOYMENT_SHA: '2'.repeat(40),
  RAILWAY_GIT_BRANCH: 'main',
  RAILWAY_GIT_COMMIT_SHA: '2'.repeat(40),
  DATABASE_TLS_MODE: 'verify-full',
  FOUNDATION_CORPUS_TLS_MODE: 'verify-full',
} satisfies NodeJS.ProcessEnv;

it.each([
  ['[لقمان: 15]', ['31:15']],
  ['[لقمان: 31:15]', ['31:15']],
  ['[31:15]', ['31:15']],
  ['سورة لقمان، الآية ١٥', ['31:15']],
  ['النتيجة 31 من 100', []],
])('extracts only explicit Quran locators from %s', (text, expected) => {
  expect(extractQuranReferences(text)).toEqual(expected);
});

it('keeps the local research preview and hosted demo mutually exclusive', () => {
  expect(
    foundationRuntimeMode(
      { FOUNDATION_ENABLED: 'true', FOUNDATION_RESEARCH_PREVIEW: 'true' },
      '127.0.0.1',
    ),
  ).toBe('local_research');
  expect(foundationRuntimeMode(hostedDemoEnvironment)).toBe('hosted_demo');
  expect(foundationRuntimeMode(hostedProductionEnvironment)).toBe('hosted_production');
  expect(() =>
    foundationRuntimeMode({
      FOUNDATION_ENABLED: 'true',
      FOUNDATION_RESEARCH_PREVIEW: 'true',
      FOUNDATION_HOSTED_DEMO: 'true',
    }),
  ).toThrow('FOUNDATION_RUNTIME_MODE_CONFLICT');
});

it.each([
  'FOUNDATION_WEB_DISCOVERY_ENABLED',
  'FOUNDATION_WEB_CACHE_ENABLED',
  'FOUNDATION_WEB_CACHE_PASSAGES_ENABLED',
  'FOUNDATION_REWRITE_ENABLED',
] as const)('keeps %s disabled in the hosted staging demo', (key) => {
  expect(() =>
    foundationRuntimeMode({
      FOUNDATION_ENABLED: 'true',
      FOUNDATION_HOSTED_DEMO: 'true',
      FOUNDATION_SEMANTIC_ENABLED: 'true',
      FOUNDATION_CLAIM_RETRIEVAL_ENABLED: 'true',
      [key]: 'true',
    }),
  ).toThrow('HOSTED_DEMO_REQUIRES_READ_ONLY_RETRIEVAL');
});

it('allows read-only MCP and web discovery in hosted production', () => {
  expect(
    foundationRuntimeMode({
      ...hostedProductionEnvironment,
      FOUNDATION_TAFSIR_LIVE: 'true',
      FOUNDATION_WEB_DISCOVERY_ENABLED: 'true',
    }),
  ).toBe('hosted_production');
});

it('allows read-only Tafsir MCP in the hosted staging demo', () => {
  expect(
    foundationRuntimeMode({
      ...hostedDemoEnvironment,
      FOUNDATION_TAFSIR_LIVE: 'true',
    }),
  ).toBe('hosted_demo');
});

it.each([
  'FOUNDATION_WEB_CACHE_ENABLED',
  'FOUNDATION_WEB_CACHE_PASSAGES_ENABLED',
  'FOUNDATION_WEB_CACHE_CONTENT_VIEWS_ENABLED',
  'FOUNDATION_REWRITE_ENABLED',
] as const)('keeps production mutation path %s disabled', (key) => {
  expect(() => foundationRuntimeMode({ ...hostedProductionEnvironment, [key]: 'true' })).toThrow(
    'HOSTED_PRODUCTION_REQUIRES_READ_ONLY_ACQUISITION',
  );
});

it('requires semantic claim retrieval in the hosted demo', () => {
  expect(() =>
    foundationRuntimeMode({ FOUNDATION_ENABLED: 'true', FOUNDATION_HOSTED_DEMO: 'true' }),
  ).toThrow('HOSTED_DEMO_REQUIRES_SEMANTIC_RETRIEVAL');
});

it('binds the hosted demo to the accepted staging service, source and verified corpus TLS', () => {
  for (const environment of [
    { ...hostedDemoEnvironment, BASIRAH_DEPLOYMENT_ENVIRONMENT: 'production' },
    { ...hostedDemoEnvironment, RAILWAY_SERVICE_ID: '00000000-0000-0000-0000-000000000000' },
    { ...hostedDemoEnvironment, RAILWAY_GIT_BRANCH: 'main' },
    { ...hostedDemoEnvironment, FOUNDATION_CORPUS_TLS_MODE: 'require' },
    { ...hostedDemoEnvironment, DATABASE_TLS_MODE: 'disable' },
  ])
    expect(() => foundationRuntimeMode(environment)).toThrow('HOSTED_DEMO_ENVIRONMENT_MISMATCH');
});

it('binds hosted production to main, Railway production and verified TLS', () => {
  for (const environment of [
    { ...hostedProductionEnvironment, BASIRAH_DEPLOYMENT_ENVIRONMENT: 'staging' },
    { ...hostedProductionEnvironment, RAILWAY_ENVIRONMENT_NAME: 'staging' },
    { ...hostedProductionEnvironment, RAILWAY_SERVICE_ID: '00000000-0000-0000-0000-000000000000' },
    { ...hostedProductionEnvironment, RAILWAY_GIT_BRANCH: 'development' },
    { ...hostedProductionEnvironment, BASIRAH_DEPLOYMENT_REF: 'refs/heads/development' },
    { ...hostedProductionEnvironment, FOUNDATION_CORPUS_TLS_MODE: 'require' },
    { ...hostedProductionEnvironment, DATABASE_TLS_MODE: 'require' },
  ])
    expect(() => foundationRuntimeMode(environment)).toThrow(
      'HOSTED_PRODUCTION_ENVIRONMENT_MISMATCH',
    );
});

it('keeps hosted production mutually exclusive with the staging demo', () => {
  expect(() =>
    foundationRuntimeMode({
      ...hostedProductionEnvironment,
      FOUNDATION_HOSTED_DEMO: 'true',
    }),
  ).toThrow('FOUNDATION_RUNTIME_MODE_CONFLICT');
});

it('creates a bound research-only draft intake without inventing source matches', async () => {
  const adapter = createHostedDraftAdapter('corpus-v1');
  const text = '🙂 قال الكاتب: هذا استنتاج يحتاج إلى دليل موثق.';
  const intake = await adapter.analyze(text, revisionId);
  expect(intake).toMatchObject({
    revisionId,
    revisionSha256: sha256(text),
    corpusVersion: 'corpus-v1',
    originalText: text,
    researchOnly: true,
    evidence: [],
    quotationFindings: [],
    warnings: [],
  });
  expect(intake.segments).toHaveLength(1);
  expect(intake.segments[0]).toMatchObject({
    startOffset: 0,
    endOffset: text.length,
    codePointStart: 0,
    codePointEnd: Array.from(text).length,
    originalText: text,
    role: 'author_text',
    sourceKeys: [],
  });
  await adapter.close();
  await expect(adapter.analyze(text, revisionId)).rejects.toThrow('FOUNDATION_ABORTED');
});

it('creates a production intake from approved evidence', async () => {
  const approved: SourceEvidence = {
    snapshotKey: 'quran:31:15',
    sourceId: 'tanzil-uthmani-v1.1',
    sourceVersion: 'v1',
    sourceRole: 'quran_text',
    reference: '31:15',
    originalText: 'وَصَاحِبْهُمَا فِي الدُّنْيَا مَعْرُوفًا',
    originalSha256: '',
    work: 'القرآن الكريم',
    author: null,
    edition: 'Tanzil Uthmani 1.1',
    sourceUrl: null,
    approvalStatus: 'approved',
    researchOnly: false,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['exact'],
    provenance: { surah_name: 'لقمان' },
    contextBefore: null,
    contextAfter: null,
    footnotes: [],
    relations: [],
  };
  approved.originalSha256 = sha256(approved.originalText);
  const adapter = createHostedDraftAdapter(
    'approved-v1',
    {
      async search() {
        return [approved];
      },
      async restore() {
        return [];
      },
    },
    false,
  );
  const intake = await adapter.analyze(
    'قال تعالى: ﴿وَصَاحِبْهُمَا فِي الدُّنْيَا مَعْرُوفًا﴾ [لقمان: 15].',
    revisionId,
  );
  expect(intake.researchOnly).toBe(false);
  expect(intake.evidence).toEqual([approved]);
});

it('compares an explicitly cited Quran quotation against the pinned hosted original', async () => {
  const quran: SourceEvidence = {
    snapshotKey: 'quran:31:15',
    sourceId: 'tanzil-uthmani-v1.1',
    sourceVersion: 'v1',
    sourceRole: 'quran_text',
    reference: '31:15',
    originalText:
      'وَإِن جَـٰهَدَاكَ عَلَىٰٓ أَن تُشْرِكَ بِى مَا لَيْسَ لَكَ بِهِۦ عِلْمٌ فَلَا تُطِعْهُمَا ۖ وَصَاحِبْهُمَا فِى ٱلدُّنْيَا مَعْرُوفًا وَٱتَّبِعْ سَبِيلَ مَنْ أَنَابَ إِلَىَّ',
    originalSha256: '',
    work: 'القرآن الكريم',
    author: null,
    edition: 'Tanzil Uthmani 1.1',
    sourceUrl: null,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['exact'],
    provenance: { surah_name: 'لقمان' },
    contextBefore: null,
    contextAfter: null,
    footnotes: [],
    relations: [],
  };
  quran.originalSha256 = sha256(quran.originalText);
  const tafsir: SourceEvidence = {
    ...quran,
    snapshotKey: 'tafsir:31:15',
    sourceId: 'muyassar-v3',
    sourceRole: 'tafsir_commentary',
    originalText: 'وصاحبهما في الدنيا بالمعروف فيما لا إثم فيه.',
    originalSha256: sha256('وصاحبهما في الدنيا بالمعروف فيما لا إثم فيه.'),
    work: 'التفسير الميسر',
    parentSnapshotKey: quran.snapshotKey,
  };
  const corpus = {
    async search(_query: string, references: readonly string[]) {
      expect(references).toEqual(['31:15']);
      return [tafsir, quran];
    },
    async restore() {
      return [];
    },
  };
  const adapter = createHostedDraftAdapter('corpus-v1', corpus);
  const text =
    'قال تعالى: ﴿وَإِن جَاهَدَاكَ عَلَىٰ أَن تُشْرِكَ بِي مَا لَيْسَ لَكَ بِهِ عِلْمٌ فَلَا تُطِعْهُمَا وَصَاحِبْهُمَا فِي الدُّنْيَا مَعْرُوفًا﴾ [لقمان: 15]. تدل الآية على عدم طاعتهما في الشرك.';
  const intake = await adapter.analyze(text, revisionId);

  expect(intake.evidence.map((source) => source.snapshotKey)).toEqual([
    'tafsir:31:15',
    'quran:31:15',
  ]);
  expect(intake.quotationFindings).toHaveLength(1);
  expect(intake.quotationFindings[0]).toMatchObject({
    evidenceKey: quran.snapshotKey,
    status: 'partial',
    comparison: { fidelity: 'orthographic', extent: 'excerpt', basis: 'typography' },
  });
  expect(intake.segments.some((segment) => segment.role === 'ayah')).toBe(true);
  expect(intake.segments.some((segment) => segment.role === 'claimed_source')).toBe(true);
  expect(intake.warnings).toEqual([]);
});

async function hostedComparison(quote: string, original: string) {
  const source: SourceEvidence = {
    snapshotKey: 'synthetic-boundary:31:15',
    sourceId: 'synthetic-boundary',
    sourceVersion: 'v1',
    sourceRole: 'quran_text',
    reference: '31:15',
    originalText: original,
    originalSha256: sha256(original),
    work: 'Synthetic quotation-boundary control',
    author: null,
    edition: null,
    sourceUrl: null,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['exact'],
    provenance: { surah_name: 'لقمان' },
  };
  const adapter = createHostedDraftAdapter('boundary-control', {
    async search() {
      return [source];
    },
    async restore() {
      return [];
    },
  });
  const text = `🙂 قال تعالى: ﴿${quote}﴾ [لقمان: 31:15].`;
  try {
    const intake = await adapter.analyze(text, revisionId);
    expect(intake.originalText).toBe(text);
    expect(intake.revisionSha256).toBe(sha256(text));
    expect(intake.evidence[0]).toEqual(source);
    const segment = intake.segments.find((row) => row.role === 'ayah')!;
    expect(text.slice(segment.startOffset, segment.endOffset)).toBe(quote);
    expect(Array.from(text).slice(segment.codePointStart, segment.codePointEnd).join('')).toBe(
      quote,
    );
    return intake.quotationFindings[0]!;
  } finally {
    await adapter.close();
  }
}

it.each([
  ['صَاحِبْهُم', 'وَصَاحِبْهُمَا فِى ٱلدُّنْيَا مَعْرُوفًا'],
  ['قال الله', 'وقال الله'],
  ['قال الله', 'قال اللهما'],
  ['قال الل', 'قال الله'],
])('rejects raw token fragments %s without source offsets', async (quote, source) => {
  expect(await hostedComparison(quote, source)).toMatchObject({
    status: 'mismatch',
    matchedStart: null,
    matchedEnd: null,
    comparison: { fidelity: 'different', extent: 'unknown' },
  });
});

it.each([
  ['قال الله', 'قال الله ثم قال الله'],
  ['قال قال', 'قال قال قال'],
  ['قال الله', 'قَالَ اللَّهُ ثُمَّ قَالَ اللَّهُ'],
  ['قال الله', 'قال الله ثم قَالَ اللَّهُ'],
])('leaves repeated raw or orthographic alignments unresolved for %s', async (quote, source) => {
  expect(await hostedComparison(quote, source)).toMatchObject({
    status: 'unresolved',
    matchedStart: null,
    matchedEnd: null,
    comparison: { fidelity: 'unresolved', extent: 'unknown', basis: 'none' },
  });
});

it.each([
  ['قال الله', 'قال الله', 'exact', 'exact', 'full', 0, 8],
  ['قال الله', '🕌 قال الله، ثم مضى.', 'partial', 'exact', 'excerpt', 3, 11],
  ['قال الله', '«قال الله»، ثم مضى.', 'partial', 'exact', 'excerpt', 1, 9],
  ['قال الله', 'قَالَ اللَّهُ', 'normalized', 'orthographic', 'full', 0, 13],
  ['قال الله', 'ثم قَالَ اللَّهُ ومضى.', 'partial', 'orthographic', 'excerpt', 3, 16],
  ['ان الله', 'أن الله', 'normalized', 'orthographic', 'full', 0, 7],
])(
  'preserves unique comparison and original UTF16 offsets for %s',
  async (quote, source, status, fidelity, extent, start, end) => {
    const result = await hostedComparison(quote, source);
    expect(result).toMatchObject({
      status,
      matchedStart: start,
      matchedEnd: end,
      comparison: { fidelity, extent },
    });
    expect(source.slice(result.matchedStart!, result.matchedEnd!)).toBe(
      source.slice(start as number, end as number),
    );
  },
);

// Exact public Tanzil 31:15 original retained in the issue #133 offline diagnostic.
// The adapter transport is a test fixture; it does not assert source approval.
const retainedLuqmanOriginal =
  'وَإِن جَـٰهَدَاكَ عَلَىٰٓ أَن تُشْرِكَ بِى مَا لَيْسَ لَكَ بِهِۦ عِلْمٌ فَلَا تُطِعْهُمَا ۖ وَصَاحِبْهُمَا فِى ٱلدُّنْيَا مَعْرُوفًا ۖ وَٱتَّبِعْ سَبِيلَ مَنْ أَنَابَ إِلَىَّ ۚ ثُمَّ إِلَىَّ مَرْجِعُكُمْ فَأُنَبِّئُكُم بِمَا كُنتُمْ تَعْمَلُونَ';

it('rejects the retained publisher mid-word fragment without changing its source bytes', async () => {
  expect(await hostedComparison('صَاحِبْهُم', retainedLuqmanOriginal)).toMatchObject({
    status: 'mismatch',
    matchedStart: null,
    matchedEnd: null,
  });
});

it('preserves the full retained Ayah and its unique qualified negative excerpt', async () => {
  expect(await hostedComparison(retainedLuqmanOriginal, retainedLuqmanOriginal)).toMatchObject({
    status: 'exact',
    matchedStart: 0,
    matchedEnd: retainedLuqmanOriginal.length,
    comparison: { fidelity: 'exact', extent: 'full' },
  });
  const excerpt = 'فَلَا تُطِعْهُمَا';
  const start = retainedLuqmanOriginal.indexOf(excerpt);
  expect(await hostedComparison(excerpt, retainedLuqmanOriginal)).toMatchObject({
    status: 'partial',
    matchedStart: start,
    matchedEnd: start + excerpt.length,
    comparison: { fidelity: 'exact', extent: 'excerpt' },
  });
});

it('uses orthographic rather than raw exact fidelity when a final combining mark is omitted', async () => {
  expect(await hostedComparison('قال الله', 'قال اللهُ')).toMatchObject({
    status: 'normalized',
    matchedStart: 0,
    matchedEnd: 'قال اللهُ'.length,
    comparison: { fidelity: 'orthographic', extent: 'full' },
  });
});

it.each(['قال ۖ الله', ' ۖ '])(
  'leaves a stop mark without lexical words unresolved in %s',
  async (source) => {
    expect(await hostedComparison(' ۖ ', source)).toMatchObject({
      status: 'unresolved',
      reason: 'no_lexical_quotation',
      matchedStart: null,
      matchedEnd: null,
      comparison: { fidelity: 'unresolved', extent: 'unknown', differences: [], basis: 'none' },
    });
  },
);
