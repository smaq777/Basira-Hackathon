import { createHash } from 'node:crypto';
import type { FoundationIntake, SourceEvidence } from './foundation.js';

// Partial source snippets are engineering fixtures, never production retrieval records.
const FIXTURE_PASSAGES: Record<string, string> = {
  '2:43': 'وأقيموا الصلاة وآتوا الزكاة واركعوا مع الراكعين',
  '2:271': 'إن تبدوا الصدقات فنعما هي وإن تخفوها وتؤتوها الفقراء فهو خير لكم',
  '9:60': 'إنما الصدقات للفقراء والمساكين',
  '9:103': 'خذ من أموالهم صدقة تطهرهم وتزكيهم بها',
  '2:183': 'يا أيها الذين آمنوا كتب عليكم الصيام',
  '3:97': 'ولله على الناس حج البيت من استطاع إليه سبيلا',
  '49:11': 'يا أيها الذين آمنوا لا يسخر قوم من قوم',
  '112:1': 'قل هو الله أحد',
  '2:256': 'لا إكراه في الدين',
  '2:275': 'وأحل الله البيع وحرم الربا',
  '4:19': 'وعاشروهن بالمعروف',
};
export function fixtureEvidence(reference: string): SourceEvidence {
  const originalText = FIXTURE_PASSAGES[reference] ?? 'نص اختبار هندسي';
  return {
    snapshotKey: `fixture:quran:${reference}`,
    sourceId: 'engineering-fixture',
    sourceVersion: 'v1',
    sourceRole: 'quran_text',
    reference,
    originalText,
    originalSha256: createHash('sha256').update(originalText).digest('hex'),
    work: 'Partial Quran engineering fixture',
    author: null,
    edition: null,
    sourceUrl: null,
    approvalStatus: 'pending',
    researchOnly: true,
    parentSnapshotKey: null,
    delivery: 'snapshot',
    retrievalModes: ['exact'],
    provenance: { fixture: true, notProductionSource: true },
  };
}
export function fixtureIntake(text: string, evidence = true): FoundationIntake {
  return {
    schemaVersion: 1,
    pipelineVersion: 'engineering-fixture-v1',
    revisionId: '00000000-0000-4000-8000-000000000001',
    revisionSha256: createHash('sha256').update(text).digest('hex'),
    corpusVersion: 'fixture-v1',
    originalText: text,
    offsetUnit: 'utf16_code_unit',
    segments: text
      ? [
          {
            id: 'author-1',
            startOffset: 0,
            endOffset: text.length,
            codePointStart: 0,
            codePointEnd: [...text].length,
            originalText: text,
            role: 'author_text',
            roleStatus: 'candidate',
            method: 'fixture-authored-label',
            sourceKeys: [],
            roleProposal: null,
            conflict: false,
          },
        ]
      : [],
    evidence: evidence ? Object.keys(FIXTURE_PASSAGES).map(fixtureEvidence) : [],
    quotationFindings: [],
    contextCoverage: [],
    warnings: [],
    researchOnly: true,
  };
}
