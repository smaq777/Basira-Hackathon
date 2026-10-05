import type {
  FoundationIntake,
  SourceEvidence,
} from '../../../packages/contracts/src/foundation.js';

/** Reserve space for findings, themes, trace and duplicated durable source rows. */
export function evidencePacketFits(intake: FoundationIntake, evidence: SourceEvidence[]): boolean {
  return (
    Buffer.byteLength(JSON.stringify({ ...intake, evidence }), 'utf8') +
      Buffer.byteLength(JSON.stringify(evidence), 'utf8') +
      150000 <=
    450000
  );
}

/** PostgreSQL jsonb adds separator spaces; reserve metadata/IDs and SQL rendering overhead. */
export function enrichedReportFits(report: unknown, evidence: SourceEvidence[]): boolean {
  return (
    Buffer.byteLength(JSON.stringify(report), 'utf8') +
      Buffer.byteLength(JSON.stringify(evidence), 'utf8') +
      evidence.length * 500 +
      20000 <=
    480000
  );
}
