import { describe, expect, it } from 'vitest';
import { sha256 } from '../apps/api/src/foundation.js';
import { verifyResearchOriginalRecord } from '../apps/api/src/research-original-record.js';

const rawHash = sha256('synthetic raw publisher bytes');
const fixture = () => ({
  id: 'tanzil-uthmani-v1.1:2:282',
  role: 'quran_text',
  reference: '2:282',
  surah: 2,
  ayah: 282,
  original_text: 'Owned synthetic original; retain conditions.',
  text_sha256: sha256('Owned synthetic original; retain conditions.'),
  metadata_json: JSON.stringify({
    source_version: rawHash,
    source_role: 'quran_text',
    input_provenance: { raw_file_sha256: rawHash },
  }),
});
describe('Foundation original acquisition verification', () => {
  it('accepts the full unchanged unit with raw-file and locator bindings', () => {
    const row = fixture();
    expect(verifyResearchOriginalRecord(row, row.id, row.reference, rawHash)).toHaveProperty(
      'source_version',
      rawHash,
    );
  });
  it('rejects changed publisher bytes even when the indexed original hash still matches', () => {
    const row = fixture();
    expect(() =>
      verifyResearchOriginalRecord(row, row.id, row.reference, sha256('changed raw bytes')),
    ).toThrow('SQLITE_RAW_PROVENANCE_MISMATCH');
  });
  it('rejects changed or mismatched locators and altered original text', () => {
    const row = fixture();
    expect(() => verifyResearchOriginalRecord(row, row.id, '2:281', rawHash)).toThrow();
    expect(() =>
      verifyResearchOriginalRecord({ ...row, ayah: 281 }, row.id, row.reference, rawHash),
    ).toThrow();
    expect(() =>
      verifyResearchOriginalRecord(
        { ...row, original_text: 'conditions removed' },
        row.id,
        row.reference,
        rawHash,
      ),
    ).toThrow();
  });
  it('rejects quarantined units', () => {
    const row = fixture();
    const metadata = JSON.parse(row.metadata_json);
    metadata.quarantined_roles = ['quran_text'];
    row.metadata_json = JSON.stringify(metadata);
    expect(() => verifyResearchOriginalRecord(row, row.id, row.reference, rawHash)).toThrow(
      'SQLITE_ORIGINAL_QUARANTINED',
    );
  });
});
