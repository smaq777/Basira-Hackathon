import {
  FoundationIntakeSchema,
  type FoundationIntake,
} from '../../../packages/contracts/src/foundation.js';
import { sha256, type FoundationAdapter } from './foundation.js';
import { foundationActivation } from './foundation-activation.js';
import type { ClaimCorpusSearch } from './claim-retrieval.js';
import { extractQuranLocators } from './quran-reference.js';
import { structuralAnnotations } from './preflight.js';

export type FoundationRuntimeMode =
  'disabled' | 'local_research' | 'hosted_research' | 'hosted_demo' | 'hosted_production';

function validServiceId(value: string | undefined): value is string {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value),
  );
}

function validRevision(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{40}$/u.test(value));
}

function assertHostedDemoBoundary(environment: NodeJS.ProcessEnv, host: string): void {
  const serviceId = environment.FOUNDATION_STAGING_SERVICE_ID;
  const revision = environment.BASIRAH_DEPLOYMENT_SHA;
  const reportTls = environment.DATABASE_TLS_MODE || 'verify-full';
  if (
    environment.NODE_ENV !== 'production' ||
    host !== '0.0.0.0' ||
    environment.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT !== 'staging' ||
    !validServiceId(serviceId) ||
    environment.RAILWAY_SERVICE_ID !== serviceId ||
    environment.BASIRAH_DEPLOYMENT_REF !== 'refs/heads/development' ||
    !validRevision(revision) ||
    (environment.RAILWAY_GIT_BRANCH !== undefined &&
      environment.RAILWAY_GIT_BRANCH !== 'development') ||
    (environment.RAILWAY_GIT_COMMIT_SHA !== undefined &&
      environment.RAILWAY_GIT_COMMIT_SHA !== revision) ||
    !['require', 'verify-full'].includes(reportTls) ||
    (environment.FOUNDATION_CORPUS_TLS_MODE || 'verify-full') !== 'verify-full'
  )
    throw new Error('HOSTED_DEMO_ENVIRONMENT_MISMATCH');
}

function assertHostedProductionBoundary(environment: NodeJS.ProcessEnv, host: string): void {
  const serviceId = environment.FOUNDATION_PRODUCTION_SERVICE_ID;
  const revision = environment.BASIRAH_DEPLOYMENT_SHA;
  if (
    environment.NODE_ENV !== 'production' ||
    host !== '0.0.0.0' ||
    environment.RAILWAY_ENVIRONMENT_NAME !== 'production' ||
    environment.BASIRAH_DEPLOYMENT_ENVIRONMENT !== 'production' ||
    !validServiceId(serviceId) ||
    environment.RAILWAY_SERVICE_ID !== serviceId ||
    environment.BASIRAH_DEPLOYMENT_REF !== 'refs/heads/main' ||
    !validRevision(revision) ||
    (environment.RAILWAY_GIT_BRANCH !== undefined && environment.RAILWAY_GIT_BRANCH !== 'main') ||
    (environment.RAILWAY_GIT_COMMIT_SHA !== undefined &&
      environment.RAILWAY_GIT_COMMIT_SHA !== revision) ||
    (environment.DATABASE_TLS_MODE || 'verify-full') !== 'verify-full' ||
    (environment.FOUNDATION_CORPUS_TLS_MODE || 'verify-full') !== 'verify-full'
  )
    throw new Error('HOSTED_PRODUCTION_ENVIRONMENT_MISMATCH');
}

export function foundationRuntimeMode(
  environment: NodeJS.ProcessEnv = process.env,
  host = environment.HOST ?? '0.0.0.0',
): FoundationRuntimeMode {
  if (environment.FOUNDATION_ENABLED !== 'true') return 'disabled';
  const localResearch = environment.FOUNDATION_RESEARCH_PREVIEW === 'true';
  const hostedDemo = environment.FOUNDATION_HOSTED_DEMO === 'true';
  const hostedProduction = environment.FOUNDATION_HOSTED_PRODUCTION === 'true';
  if ([localResearch, hostedDemo, hostedProduction].filter(Boolean).length > 1)
    throw new Error('FOUNDATION_RUNTIME_MODE_CONFLICT');
  const activation = foundationActivation(environment, host);
  if (!localResearch && !hostedDemo && !hostedProduction)
    throw new Error('FOUNDATION_RUNTIME_MODE_REQUIRED');
  if (hostedDemo && [environment.FOUNDATION_REWRITE_ENABLED].some((value) => value === 'true'))
    throw new Error('HOSTED_DEMO_REQUIRES_READ_ONLY_RETRIEVAL');
  if (
    hostedProduction &&
    [environment.FOUNDATION_REWRITE_ENABLED].some((value) => value === 'true')
  )
    throw new Error('HOSTED_PRODUCTION_REQUIRES_READ_ONLY_ACQUISITION');
  if (
    (hostedDemo || hostedProduction) &&
    (environment.FOUNDATION_SEMANTIC_ENABLED !== 'true' ||
      environment.FOUNDATION_CLAIM_RETRIEVAL_ENABLED !== 'true')
  )
    throw new Error(
      hostedDemo
        ? 'HOSTED_DEMO_REQUIRES_SEMANTIC_RETRIEVAL'
        : 'HOSTED_PRODUCTION_REQUIRES_SEMANTIC_RETRIEVAL',
    );
  if (hostedDemo) {
    assertHostedDemoBoundary(environment, host);
    return 'hosted_demo';
  }
  if (hostedProduction) {
    assertHostedProductionBoundary(environment, host);
    return 'hosted_production';
  }
  return activation.profile === 'hosted-staging' ? 'hosted_research' : 'local_research';
}

type Token = { value: string; start: number; end: number };

function comparisonTokens(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}\u064b-\u065f\u0670ـ]+/gu)) {
    // Uthmani vocative يا may be joined to the next word (يَـٰبَنِىٓ).
    // Split only that visible glyph prefix, retaining immutable source offsets.
    const vocative = /^ي[\u064b-\u065fـ]*\u0670[\p{M}ـ]*(?=[\p{L}])/u.exec(match[0]);
    const parts = vocative
      ? [
          { raw: match[0].slice(0, vocative[0].length), start: match.index },
          { raw: match[0].slice(vocative[0].length), start: match.index + vocative[0].length },
        ]
      : [{ raw: match[0], start: match.index }];
    for (const part of parts) {
      const value = part.raw
        .normalize('NFKD')
        .replace(/\u0670/gu, 'ا')
        .replace(/[\p{M}ـ\u06d6-\u06ed]/gu, '')
        .replace(/[أإآٱ]/gu, 'ا')
        .replace(/^ءا/u, 'ا')
        .replace(/[ىئ]/gu, 'ي')
        .replace(/ؤ/gu, 'و')
        .toLowerCase();
      if (value) tokens.push({ value, start: part.start, end: part.start + part.raw.length });
    }
  }
  return tokens;
}

function compareQuote(quote: string, source: string) {
  const quoteTokens = comparisonTokens(quote);
  if (!quoteTokens.length)
    return {
      status: 'unresolved' as const,
      reason: 'no_lexical_quotation',
      matchedStart: null,
      matchedEnd: null,
      comparison: {
        fidelity: 'unresolved' as const,
        extent: 'unknown' as const,
        differences: [],
        basis: 'none' as const,
      },
    };
  const sourceTokens = comparisonTokens(source);
  // Boundaries and returned offsets always refer to the immutable original UTF-16 text.
  const tokenInteriors = new Set<number>();
  for (const token of sourceTokens)
    for (let offset = token.start + 1; offset < token.end; offset++) tokenInteriors.add(offset);
  const rawMatches: number[] = [];
  if (quote.length)
    for (let from = 0; from <= source.length - quote.length;) {
      const start = source.indexOf(quote, from);
      if (start < 0) break;
      if (!tokenInteriors.has(start) && !tokenInteriors.has(start + quote.length))
        rawMatches.push(start);
      if (rawMatches.length > 1) break;
      from = start + 1; // Include overlapping occurrences when checking uniqueness.
    }
  const normalizedMatches: number[] = [];
  if (quoteTokens.length)
    for (let index = 0; index <= sourceTokens.length - quoteTokens.length; index++) {
      if (quoteTokens.every((token, offset) => sourceTokens[index + offset]!.value === token.value))
        normalizedMatches.push(index);
      if (normalizedMatches.length > 1) break;
    }
  const rawStart = rawMatches[0];
  const at = normalizedMatches[0];
  const differentAlignment =
    rawStart !== undefined &&
    at !== undefined &&
    (sourceTokens[at]!.start < rawStart ||
      sourceTokens[at + quoteTokens.length - 1]!.end > rawStart + quote.length);
  if (rawMatches.length > 1 || normalizedMatches.length > 1 || differentAlignment)
    return {
      status: 'unresolved' as const,
      reason: 'ambiguous_contiguous_alignment',
      matchedStart: null,
      matchedEnd: null,
      comparison: {
        fidelity: 'unresolved' as const,
        extent: 'unknown' as const,
        differences: [],
        basis: 'none' as const,
      },
    };
  if (rawStart !== undefined)
    return {
      status:
        rawStart === 0 && quote.length === source.length
          ? ('exact' as const)
          : ('partial' as const),
      reason:
        rawStart === 0 && quote.length === source.length
          ? 'raw_full_match'
          : 'raw_contiguous_excerpt',
      matchedStart: rawStart,
      matchedEnd: rawStart + quote.length,
      comparison: {
        fidelity: 'exact' as const,
        extent:
          rawStart === 0 && quote.length === source.length
            ? ('full' as const)
            : ('excerpt' as const),
        differences: [],
        basis: 'canonical' as const,
      },
    };
  if (quoteTokens.length >= 2 && at !== undefined) {
    const full = at === 0 && quoteTokens.length === sourceTokens.length;
    return {
      status: full ? ('normalized' as const) : ('partial' as const),
      reason: full ? 'orthographic_full_match' : 'orthographic_contiguous_excerpt',
      matchedStart: sourceTokens[at]!.start,
      matchedEnd: sourceTokens[at + quoteTokens.length - 1]!.end,
      comparison: {
        fidelity: 'orthographic' as const,
        extent: full ? ('full' as const) : ('excerpt' as const),
        differences: [],
        basis: 'typography' as const,
      },
    };
  }
  return {
    status: 'mismatch' as const,
    reason: 'explicit_reference_text_mismatch',
    matchedStart: null,
    matchedEnd: null,
    comparison: {
      fidelity: 'different' as const,
      extent: 'unknown' as const,
      differences: [{ kind: 'replace' as const, quotedText: quote, sourceText: source }],
      basis: 'canonical' as const,
    },
  };
}

/** Hosted analysis binds explicit Quran references to the pinned read-only corpus. */
export function createHostedDraftAdapter(
  corpusVersion: string,
  corpus?: ClaimCorpusSearch,
  researchOnly = true,
): FoundationAdapter {
  const selectedVersion = corpusVersion.trim();
  if (!selectedVersion || selectedVersion.length > 120)
    throw new Error('HOSTED_CORPUS_VERSION_REQUIRED');
  let closed = false;
  return {
    async analyze(text, revisionId, relatedReferences = [], signal) {
      if (closed || signal?.aborted) throw new Error('FOUNDATION_ABORTED');
      const locators = extractQuranLocators(text);
      const references = [
        ...new Set([
          ...locators.map((locator) => locator.reference),
          ...relatedReferences.filter((reference) => /^\d{1,3}:\d{1,3}$/u.test(reference)),
        ]),
      ];
      const evidence =
        corpus && references.length ? await corpus.search(text, references, signal) : [];
      const quranByReference = new Map(
        evidence
          .filter((source) => source.sourceRole === 'quran_text')
          .map((source) => [source.reference, source]),
      );
      const spans: Array<{
        startOffset: number;
        endOffset: number;
        role: 'ayah' | 'matn' | 'isnad' | 'claimed_source' | 'unclassified';
        method: string;
        sourceKey: string | null;
      }> = [];
      const quotationFindings: FoundationIntake['quotationFindings'] = [];
      for (const locator of locators) {
        const source = quranByReference.get(locator.reference);
        if (!source) continue;
        spans.push({
          startOffset: locator.startOffset,
          endOffset: locator.endOffset,
          role: 'claimed_source',
          method: 'hosted_explicit_quran_reference',
          sourceKey: source.snapshotKey,
        });
        const quotes = [
          ...text.matchAll(/﴿([^﴿﴾]{2,2000})﴾|«([^«»]{2,2000})»|\(([^()]{2,2000})\)/gu),
        ]
          .map((match) => ({
            startOffset: match.index + 1,
            endOffset: match.index + match[0].length - 1,
            originalText: match[1] ?? match[2] ?? match[3]!,
          }))
          .filter(
            (quote) =>
              (quote.endOffset <= locator.startOffset &&
                locator.startOffset - quote.endOffset <= 80) ||
              (quote.startOffset >= locator.endOffset &&
                quote.startOffset - locator.endOffset <= 80),
          );
        const quote = quotes.sort(
          (a, b) =>
            Math.min(
              Math.abs(locator.startOffset - a.endOffset),
              Math.abs(a.startOffset - locator.endOffset),
            ) -
            Math.min(
              Math.abs(locator.startOffset - b.endOffset),
              Math.abs(b.startOffset - locator.endOffset),
            ),
        )[0];
        if (
          !quote ||
          spans.some((span) => span.role === 'ayah' && span.startOffset === quote.startOffset)
        )
          continue;
        const id = `hosted-ayah-${sha256(`${revisionId}:${quote.startOffset}:${quote.endOffset}:${source.snapshotKey}`).slice(0, 24)}`;
        spans.push({
          startOffset: quote.startOffset,
          endOffset: quote.endOffset,
          role: 'ayah',
          method: 'hosted_explicit_quran_comparison',
          sourceKey: source.snapshotKey,
        });
        quotationFindings.push({
          segmentId: id,
          evidenceKey: source.snapshotKey,
          ...compareQuote(quote.originalText, source.originalText),
        });
      }
      // Reuse the existing bounded structural detector, without software fixture
      // matching. Visible quotation/attribution cues are not authenticity verdicts.
      let quotationSearches = 0;
      for (const annotation of structuralAnnotations(text, false).slice(0, 60)) {
        if (
          spans.some(
            (span) =>
              annotation.startOffset < span.endOffset && annotation.endOffset > span.startOffset,
          )
        )
          continue;
        const roles: Partial<
          Record<typeof annotation.contentType, (typeof spans)[number]['role']>
        > = {
          quran: 'ayah',
          hadith_matn: 'matn',
          isnad: 'isnad',
          claimed_source: 'claimed_source',
          unknown: 'unclassified',
        };
        const role = roles[annotation.contentType];
        if (!role) continue;
        let sourceKey: string | null = null;
        if (role === 'matn') {
          const searched = !!corpus && quotationSearches < 5;
          if (searched) quotationSearches++;
          const candidates = searched ? await corpus!.search(annotation.text, [], signal) : [];
          const matches = candidates
            .filter((source) => source.sourceRole === 'hadith_matn')
            .map((source) => ({
              source,
              comparison: compareQuote(annotation.text, source.originalText),
            }))
            .filter(({ comparison }) =>
              ['exact', 'normalized', 'partial'].includes(comparison.status),
            );
          const unique = [
            ...new Map(matches.map((match) => [match.source.snapshotKey, match])).values(),
          ];
          const matched = unique.length === 1 ? unique[0] : undefined;
          if (matched) {
            sourceKey = matched.source.snapshotKey;
            if (!evidence.some((source) => source.snapshotKey === sourceKey))
              evidence.push(matched.source);
          }
          const id = `hosted-cue-${sha256(`${revisionId}:${annotation.startOffset}:${annotation.endOffset}:${role}`).slice(0, 24)}`;
          quotationFindings.push({
            segmentId: id,
            evidenceKey: sourceKey,
            ...(matched
              ? matched.comparison
              : {
                  status: 'unresolved' as const,
                  reason:
                    unique.length > 1
                      ? 'ambiguous_hadith_source_identity'
                      : !corpus
                        ? 'quotation_corpus_unavailable'
                        : !searched
                          ? 'quotation_search_budget_skipped'
                          : 'no_contiguous_hadith_match',
                  matchedStart: null,
                  matchedEnd: null,
                  comparison: {
                    fidelity: 'unresolved' as const,
                    extent: 'unknown' as const,
                    differences: [],
                    basis: 'none' as const,
                  },
                }),
          });
        }
        spans.push({
          startOffset: annotation.startOffset,
          endOffset: annotation.endOffset,
          role,
          method: 'hosted_structural_cue',
          sourceKey,
        });
      }
      spans.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
      const segments: FoundationIntake['segments'] = [];
      let cursor = 0;
      const addAuthor = (startOffset: number, endOffset: number) => {
        if (endOffset <= startOffset || !text.slice(startOffset, endOffset).trim()) return;
        segments.push({
          id: `hosted-author-${sha256(`${revisionId}:${startOffset}:${endOffset}`).slice(0, 24)}`,
          startOffset,
          endOffset,
          codePointStart: Array.from(text.slice(0, startOffset)).length,
          codePointEnd: Array.from(text.slice(0, endOffset)).length,
          originalText: text.slice(startOffset, endOffset),
          role: 'author_text',
          roleStatus: 'candidate',
          method: 'hosted_uncovered_author_text',
          sourceKeys: [],
          roleProposal: 'other',
          conflict: false,
        });
      };
      for (const span of spans) {
        if (span.startOffset < cursor) continue;
        addAuthor(cursor, span.startOffset);
        const id =
          span.method === 'hosted_structural_cue'
            ? `hosted-cue-${sha256(`${revisionId}:${span.startOffset}:${span.endOffset}:${span.role}`).slice(0, 24)}`
            : span.role === 'ayah'
              ? quotationFindings.find((finding) => {
                  const expected = `hosted-ayah-${sha256(`${revisionId}:${span.startOffset}:${span.endOffset}:${span.sourceKey}`).slice(0, 24)}`;
                  return finding.segmentId === expected;
                })!.segmentId
              : `hosted-reference-${sha256(`${revisionId}:${span.startOffset}:${span.endOffset}:${span.sourceKey}`).slice(0, 24)}`;
        segments.push({
          id,
          startOffset: span.startOffset,
          endOffset: span.endOffset,
          codePointStart: Array.from(text.slice(0, span.startOffset)).length,
          codePointEnd: Array.from(text.slice(0, span.endOffset)).length,
          originalText: text.slice(span.startOffset, span.endOffset),
          role: span.role,
          roleStatus: span.sourceKey ? 'source_matched' : 'candidate',
          method: span.method,
          sourceKeys: span.sourceKey ? [span.sourceKey] : [],
          roleProposal: span.role === 'unclassified' ? 'other' : span.role,
          conflict: false,
        });
        cursor = span.endOffset;
      }
      addAuthor(cursor, text.length);
      if (!segments.length) addAuthor(0, text.length);
      const unresolvedExplicit = references.filter((reference) => !quranByReference.has(reference));
      const intake: FoundationIntake = {
        schemaVersion: 1,
        pipelineVersion: 'hosted-explicit-source-intake-v3',
        revisionId,
        revisionSha256: sha256(text),
        corpusVersion: selectedVersion,
        originalText: text,
        offsetUnit: 'utf16_code_unit',
        segments,
        evidence,
        quotationFindings,
        contextCoverage: references
          .filter((reference) => quranByReference.has(reference))
          .map((reference) => ({
            reference,
            requestedWorks: ['التفسير الميسر'],
            availableWorks: evidence
              .filter(
                (source) =>
                  source.reference === reference && source.sourceRole === 'tafsir_commentary',
              )
              .map((source) => source.work),
            status: evidence.some(
              (source) =>
                source.reference === reference && source.sourceRole === 'tafsir_commentary',
            )
              ? ('complete_transport' as const)
              : ('partial' as const),
            scholarlyContextComplete: false as const,
          })),
        warnings: unresolvedExplicit.length
          ? ['explicit_reference_not_available_in_hosted_corpus']
          : [],
        researchOnly,
      };
      return FoundationIntakeSchema.parse(intake);
    },
    async close() {
      closed = true;
    },
  };
}
