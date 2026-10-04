import { describe, expect, it } from 'vitest';
import {
  recallAtK,
  retrieveEvidence,
  type RetrievalPassage,
} from '../packages/contracts/src/index.js';

const passages: RetrievalPassage[] = [
  {
    id: 'P1',
    sourceId: 'synthetic-source',
    sourceVersion: '1',
    reference: 'fixture:1',
    originalText: 'النص الأصلي الأول محفوظ كما هو',
    searchText: 'النص الاصلي الاول محفوظ كما هو',
    approvalStatus: 'approved',
    contextIds: ['P2'],
  },
  {
    id: 'P2',
    sourceId: 'synthetic-source',
    sourceVersion: '1',
    reference: 'fixture:2',
    originalText: 'الشرط مهم ولا يجوز حذفه من السياق',
    searchText: 'الشرط مهم ولا يجوز حذفه من السياق',
    approvalStatus: 'approved',
    contextIds: ['P1'],
  },
  {
    id: 'P3',
    sourceId: 'pending-source',
    sourceVersion: '1',
    reference: 'fixture:3',
    originalText: 'نص غير معتمد لا يصل إلى الأدلة',
    searchText: 'نص غير معتمد لا يصل الى الادلة',
    approvalStatus: 'pending',
    contextIds: [],
  },
];

describe('hybrid retrieval core', () => {
  it('prioritizes an exact approved reference and preserves context identifiers', () => {
    const results = retrieveEvidence({
      query: 'عبارة بعيدة',
      reference: 'fixture:2',
      passages,
    });
    expect(results[0]).toMatchObject({
      passage: { id: 'P2', originalText: passages[1]?.originalText, contextIds: ['P1'] },
      retrievalModes: ['exact'],
      rank: 1,
    });
  });

  it('ranks Arabic lexical overlap without changing original text', () => {
    const results = retrieveEvidence({ query: 'حذف الشرط من السياق', passages });
    expect(results[0]?.passage.id).toBe('P2');
    expect(results[0]?.retrievalModes).toContain('lexical');
    expect(results[0]?.passage.originalText).toBe('الشرط مهم ولا يجوز حذفه من السياق');
  });

  it('fuses optional semantic scores only for approved passages', () => {
    const results = retrieveEvidence({
      query: 'النص',
      passages,
      semanticScores: { P1: 0.4, P2: 0.99, P3: 1 },
    });
    expect(results.map((result) => result.passage.id)).not.toContain('P3');
    expect(results.find((result) => result.passage.id === 'P2')?.retrievalModes).toContain(
      'semantic',
    );
  });

  it('never returns pending sources even for exact reference lookup', () => {
    const results = retrieveEvidence({ query: 'نص غير معتمد', reference: 'fixture:3', passages });
    expect(results.map((result) => result.passage.id)).not.toContain('P3');
  });

  it('reports measurable recall at k', () => {
    expect(recallAtK(['P2', 'P1'], ['P1', 'P2'], 2)).toBe(1);
    expect(recallAtK(['P2'], ['P1', 'P2'], 1)).toBe(0.5);
  });

  it('rejects invalid semantic scores and unsafe limits', () => {
    expect(() => retrieveEvidence({ query: 'نص', passages, semanticScores: { P1: 2 } })).toThrow();
    expect(() => retrieveEvidence({ query: 'نص', passages, limit: 11 })).toThrow();
  });
});
