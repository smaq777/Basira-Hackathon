import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canonical, sha256, validateIntake } from '../apps/api/src/foundation.js';
import type { FoundationIntake } from '../packages/contracts/src/foundation.js';
import { claimInventory } from '../apps/api/src/semantic-spans.js';
import { reportFindings } from '../apps/web/src/foundation-report-presentation.js';
import { foundationReportFixture } from '../apps/web/src/foundation-report.fixtures.js';

function fixture(): FoundationIntake {
  const text = '🙂 لا إكراه في الدين';
  return {
    schemaVersion: 1,
    pipelineVersion: 'test-v1',
    revisionId: randomUUID(),
    revisionSha256: sha256(text),
    corpusVersion: 'test',
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    researchOnly: true,
    segments: [
      {
        id: 's1',
        startOffset: 3,
        endOffset: text.length,
        codePointStart: 2,
        codePointEnd: Array.from(text).length,
        originalText: text.slice(3),
        role: 'ayah',
        roleStatus: 'source_matched',
        method: 'verified-original',
        sourceKeys: ['q1'],
        roleProposal: 'matn',
        conflict: true,
      },
    ],
    evidence: [
      {
        snapshotKey: 'q1',
        sourceId: 'tanzil',
        sourceVersion: '1.1',
        sourceRole: 'quran_text',
        reference: '2:256',
        originalText: text.slice(3),
        originalSha256: sha256(text.slice(3)),
        work: 'Quran',
        author: null,
        edition: null,
        sourceUrl: 'https://tanzil.net/',
        approvalStatus: 'pending',
        researchOnly: true,
        parentSnapshotKey: null,
        delivery: 'snapshot',
        retrievalModes: ['exact'],
        provenance: { fixture: true },
      },
    ],
    quotationFindings: [
      {
        segmentId: 's1',
        evidenceKey: 'q1',
        status: 'exact',
        reason: 'fixture',
        matchedStart: 0,
        matchedEnd: text.slice(3).length,
      },
    ],
    contextCoverage: [],
    warnings: [],
  };
}

it('binds original text, both offset units, source hashes and literal evidence despite role-model disagreement', () => {
  const value = fixture();
  expect(validateIntake(value, value.originalText, value.revisionId, true)).toEqual(value);
});

it('keeps a bound full locator outside claim inventory and comparison selection without hiding the original', () => {
  const value = fixture();
  const author = 'لا طاعة في المعصية مع الصحبة بالمعروف';
  const quote = value.segments[0]!.originalText;
  const locator = 'البقرة: 2:256';
  value.originalText = `😀 ${author}. قال تعالى: «${quote}» [${locator}].`;
  value.revisionSha256 = sha256(value.originalText);
  value.pipelineVersion = 'source-first-intake-1.9/quotation-fidelity-3.0';
  value.evidence[0]!.provenance = { surah_name_original: 'البقرة', surah_name: 'البَقَرَة' };
  const span = (text: string, role: 'author_text' | 'ayah' | 'claimed_source', id: string) => {
    const startOffset = value.originalText.indexOf(text);
    const endOffset = startOffset + text.length;
    return {
      ...value.segments[0]!,
      id,
      originalText: text,
      startOffset,
      endOffset,
      codePointStart: Array.from(value.originalText.slice(0, startOffset)).length,
      codePointEnd: Array.from(value.originalText.slice(0, endOffset)).length,
      role,
      roleStatus: role === 'author_text' ? ('unresolved' as const) : ('source_matched' as const),
      method: role === 'claimed_source' ? 'bound_quran_bibliographic_locator' : 'offline-control',
      sourceKeys: role === 'author_text' ? [] : ['q1'],
      roleProposal: null,
      conflict: false,
    };
  };
  value.segments = [
    span(author, 'author_text', 'author'),
    span(quote, 'ayah', 'quote'),
    span(locator, 'claimed_source', 'locator'),
  ];
  value.quotationFindings[0]!.segmentId = 'quote';
  expect(validateIntake(value, value.originalText, value.revisionId, true)).toEqual(value);
  expect(claimInventory(value).candidates.map((row) => row.originalText)).toEqual([author]);
  const report = { ...foundationReportFixture(), intake: value };
  const findings = reportFindings(report);
  expect(findings).toHaveLength(1);
  expect(findings[0]!.segment.originalText).toBe(quote);
  expect(findings[0]!.group).toBe('faithful');
  expect(report.intake.originalText).toContain(`[${locator}]`);
  const historical = fixture();
  historical.pipelineVersion = 'source-first-intake-1.8/quotation-fidelity-3.0';
  expect(validateIntake(historical, historical.originalText, historical.revisionId, true)).toEqual(
    historical,
  );
});
it('rejects changed draft and research evidence without explicit operator preview', () => {
  const value = fixture();
  expect(() => validateIntake(value, value.originalText + '!', value.revisionId, true)).toThrow();
  expect(() => validateIntake(value, value.originalText, value.revisionId, false)).toThrow();
});
it('rejects forged originals, orphan footnotes, detached citations and split surrogate spans', () => {
  for (const mutate of [
    (value: FoundationIntake) => {
      value.evidence[0]!.originalText += '!';
    },
    (value: FoundationIntake) => {
      value.evidence[0]!.sourceRole = 'tafsir_footnote';
    },
    (value: FoundationIntake) => {
      value.quotationFindings[0]!.evidenceKey = 'missing';
    },
    (value: FoundationIntake) => {
      value.segments[0]!.startOffset = 1;
    },
    (value: FoundationIntake) => {
      value.segments[0]!.codePointStart = 1;
    },
    (value: FoundationIntake) => {
      value.evidence.push(value.evidence[0]!);
    },
  ]) {
    const value = fixture();
    mutate(value);
    expect(() => validateIntake(value, value.originalText, value.revisionId, true)).toThrow();
  }
});
it('hashes equivalent object key order identically without normalizing Arabic originals', () => {
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  expect(sha256('آية')).not.toBe(sha256('اية'));
});

it('checks new exact fidelity independently of legacy partial status', () => {
  const value = fixture();
  const finding = value.quotationFindings[0]!;
  finding.status = 'partial';
  finding.comparison = { fidelity: 'exact', extent: 'full', differences: [], basis: 'canonical' };
  expect(validateIntake(value, value.originalText, value.revisionId, true)).toEqual(value);
  finding.matchedEnd = finding.matchedEnd! - 1;
  expect(() => validateIntake(value, value.originalText, value.revisionId, true)).toThrow(
    'INVALID_EXACT_COMPARISON',
  );
});

it('rejects claimed full extent over a partial source span and fabricated exact basis', () => {
  const value = fixture();
  const finding = value.quotationFindings[0]!;
  finding.status = 'partial';
  finding.comparison = {
    fidelity: 'orthographic',
    extent: 'full',
    differences: [],
    basis: 'typography',
  };
  finding.matchedEnd = finding.matchedEnd! - 1;
  expect(() => validateIntake(value, value.originalText, value.revisionId, true)).toThrow(
    'INVALID_FULL_EXTENT',
  );
  finding.matchedEnd = value.evidence[0]!.originalText.length;
  finding.comparison.fidelity = 'exact';
  expect(() => validateIntake(value, value.originalText, value.revisionId, true)).toThrow(
    'INVALID_EXACT_COMPARISON',
  );
});
