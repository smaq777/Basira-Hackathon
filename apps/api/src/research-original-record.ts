import { sha256 } from './foundation.js';

/** Verify a complete unit read from the owning Foundation index, without altering it. */
export function verifyResearchOriginalRecord(
  row: {
    id: string;
    role: string;
    reference: string;
    surah: number;
    ayah: number;
    original_text: string;
    text_sha256: string;
    metadata_json: string;
  },
  expectedId: string,
  expectedReference: string,
  rawFileSha256: string,
) {
  const metadata = JSON.parse(row.metadata_json);
  if (
    row.id !== expectedId ||
    row.reference !== expectedReference ||
    row.reference !== `${row.surah}:${row.ayah}` ||
    sha256(row.original_text) !== row.text_sha256
  )
    throw new Error('SQLITE_ORIGINAL_HASH_OR_LOCATOR_MISMATCH');
  if (
    rawFileSha256 !== metadata.input_provenance?.raw_file_sha256 ||
    rawFileSha256 !== metadata.source_version ||
    metadata.source_role !== row.role
  )
    throw new Error('SQLITE_RAW_PROVENANCE_MISMATCH');
  if (
    metadata.quarantined_roles?.includes(row.role) ||
    metadata.field_audit?.tafsir_original_html?.quarantined
  )
    throw new Error('SQLITE_ORIGINAL_QUARANTINED');
  return metadata as Record<string, unknown>;
}
