"""Offline portability and safety tests using owned pending research fixtures."""
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

WORKER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER))
from pipeline.evidence import canonical, normalize, sha
from pipeline.live_tafsir import gather_live
from pipeline.source_intake import SCHEMA_PIN, SourceIntake, utf16_length
from pipeline.tafsir_adapter import ContractError, TafsirAdapter, verify_snapshot

REVISION = str(uuid.UUID('550e8400-e29b-41d4-a716-446655440000'))
ORIGINAL = 'نص تجريبي واحد واضح'


def fixture_index(directory, *, original=ORIGINAL, matching=None, tamper_original=False):
    """Create only an owned fixture; never label fixture content approved."""
    matching = original if matching is None else matching
    database = Path(directory) / 'owned.sqlite'
    metadata = dict(source_id='owned-offline-fixture', source_version='fixture-v1',
                    source_work='Owned synthetic source fixture', rights='owned_test_only',
                    content_approval='pending', research_only=True)
    manifest = dict(corpus_fingerprint=sha('owned-test-fixture-v1'), research_only=True,
                    publication_approved=False)
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute('CREATE TABLE records (id TEXT PRIMARY KEY, role TEXT NOT NULL, reference TEXT NOT NULL, surah INTEGER, ayah INTEGER, original_text TEXT NOT NULL, search_original TEXT NOT NULL, search_key TEXT NOT NULL, metadata_json TEXT NOT NULL, text_sha256 TEXT NOT NULL, search_sha256 TEXT NOT NULL)')
        connection.execute('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        connection.execute('CREATE VIRTUAL TABLE search USING fts5(search_key, id UNINDEXED, tokenize="unicode61 remove_diacritics 0")')
        connection.execute('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                           ('owned-source', 'quran_text', '1:1', 1, 1, original, matching,
                            normalize(matching), canonical(metadata),
                            sha('corrupt') if tamper_original else sha(original), sha(matching)))
        connection.execute('INSERT INTO settings VALUES (?,?)', ('manifest', canonical(manifest)))
        connection.execute('INSERT INTO search VALUES (?,?)', (normalize(matching), 'owned-source'))
    file_manifest = {**manifest, 'database_sha256': hashlib.sha256(database.read_bytes()).hexdigest()}
    database.with_suffix('.manifest.json').write_text(canonical(file_manifest), encoding='utf-8')
    return database


def response(request):
    """Owned MCP fixture including deliberately distinct raw and display text."""
    row = dict(source=request.source, attribution='Owned adapter fixture attribution',
               text='Owned context [1]', text_raw='Owned raw context ¬variant¥ [1]',
               text_clean='Owned context', footnotes=[dict(index=1, text='Owned note', marker='[1]')])
    payload = dict(surah=request.surah, ayah=request.ayah, tafsirs=[row])
    return json.dumps(dict(jsonrpc='2.0', id=request.rpc_id,
                           result=dict(isError=False, content=[dict(type='text', text=json.dumps(payload))]))).encode()


def adapter(fetch, *, observed=SCHEMA_PIN):
    return TafsirAdapter(fetch, observed_schema_sha256=observed, expected_schema_sha256=SCHEMA_PIN,
                        service_version={'name': 'Owned offline fixture', 'version': '1'},
                        reference_exists=lambda surah, ayah: (surah, ayah) == (1, 1))


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        # Even an operator shell configured for live acquisition cannot make
        # these tests use the network. The default-gate test supplies its own env.
        self.environment = patch.dict(os.environ, {'FOUNDATION_TAFSIR_LIVE': 'false'})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def intake(self, **kwargs):
        database = fixture_index(self.temp.name, **kwargs)
        instance = SourceIntake(database, research_preview=True)
        self.addCleanup(instance.close)
        return instance

    def bridge(self, database, raw, *flags):
        environment = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'FOUNDATION_TAFSIR_LIVE': 'false'}
        environment.pop('PYTHONPATH', None)
        return subprocess.run([sys.executable, '-B', str(WORKER / 'intake_bridge.py'),
                               '--database', str(database), *flags], input=raw,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              cwd=self.temp.name, env=environment, timeout=15)

    def test_pending_sources_require_operator_research_preview(self):
        database = fixture_index(self.temp.name)
        with_preview = SourceIntake(database, research_preview=True)
        without_preview = SourceIntake(database)
        try:
            text = 'قال تعالى: «' + ORIGINAL + '»'
            self.assertEqual(without_preview.analyze(text, REVISION)['evidence'], [])
            packet = with_preview.analyze(text, REVISION)
            self.assertEqual(packet['evidence'][0]['approvalStatus'], 'pending')
            self.assertTrue(packet['evidence'][0]['researchOnly'])
            self.assertTrue(packet['researchOnly'])
            self.assertFalse(packet['contextCoverage'][0]['scholarlyContextComplete'])
        finally:
            with_preview.close()
            without_preview.close()

    def test_read_only_index_and_original_utf16_offsets(self):
        instance = self.intake()
        database_before = instance.store.database.read_bytes()
        text = '😀 مقدمة. قال تعالى: «' + ORIGINAL + '» [1:1]. ملاحظة الكاتب.'
        result = instance.analyze(text, REVISION)
        self.assertEqual(result['revisionSha256'], sha(text))
        self.assertEqual(result['quotationFindings'][0]['status'], 'exact')
        self.assertEqual(result['evidence'][0]['originalText'], ORIGINAL)
        for segment in result['segments']:
            start, end = segment['codePointStart'], segment['codePointEnd']
            self.assertEqual(segment['originalText'], text[start:end])
            self.assertEqual(segment['startOffset'], utf16_length(text[:start]))
            self.assertEqual(segment['endOffset'], utf16_length(text[:end]))
        with self.assertRaises(sqlite3.OperationalError):
            instance.store.db.execute('UPDATE records SET original_text=?', ('unexpected mutation',))
        self.assertEqual(instance.store.database.read_bytes(), database_before)

    def test_partial_token_candidate_has_no_selected_source_alignment(self):
        instance = self.intake(original='إلا مقصد أصيل', matching='لا مقصد أصيل')
        result = instance.analyze('قال تعالى: «لا مقصد أصيل»', REVISION)
        finding = result['quotationFindings'][0]
        self.assertEqual(finding['status'], 'mismatch')
        self.assertIn('partial_token_boundary', finding['reason'])
        self.assertIsNone(finding['matchedStart'])
        self.assertIsNone(finding['matchedEnd'])
        self.assertEqual(result['evidence'][0]['originalText'], 'إلا مقصد أصيل')

    def test_repeated_excerpt_alignment_remains_unresolved(self):
        instance = self.intake(original='نص واحد واضح ثم نص واحد واضح')
        result = instance.analyze('قال تعالى: «نص واحد واضح»', REVISION)
        finding = result['quotationFindings'][0]
        self.assertEqual(finding['status'], 'unresolved')
        self.assertIn('repeated_excerpt_ambiguous', finding['reason'])
        self.assertIsNone(finding['matchedStart'])
        self.assertIsNone(finding['matchedEnd'])

    def test_pin_missing_and_database_tamper_fail_closed(self):
        database = fixture_index(self.temp.name)
        with database.open('ab') as stream:
            stream.write(b'tampered-owned-fixture')
        with self.assertRaisesRegex(ValueError, 'integrity mismatch'):
            SourceIntake(database)
        database.with_suffix('.manifest.json').unlink()
        with self.assertRaisesRegex(ValueError, 'pinned index manifest'):
            SourceIntake(database)

    def test_bridge_runs_from_external_cwd_without_external_code(self):
        database = fixture_index(self.temp.name)
        request = dict(text='قال تعالى: «' + ORIGINAL + '»', revisionId=REVISION)
        result = self.bridge(database, (json.dumps(request, ensure_ascii=False) + '\n').encode(), '--research-preview')
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(result.stderr, b'')
        packet = json.loads(result.stdout)
        self.assertEqual(packet['schemaVersion'], 1)
        self.assertEqual(packet['revisionId'], REVISION)
        self.assertEqual(packet['evidence'][0]['originalText'], ORIGINAL)
        self.assertEqual(packet['evidence'][0]['approvalStatus'], 'pending')

    def test_browser_cannot_enable_research_or_live_retrieval(self):
        database = fixture_index(self.temp.name)
        request = dict(text=ORIGINAL, revisionId=REVISION, researchPreview=True)
        result = self.bridge(database, (json.dumps(request) + '\n').encode())
        self.assertEqual(json.loads(result.stdout), {'error': 'invalid_intake_request_or_source_integrity'})
        self.assertEqual(result.stderr, b'')

    def test_bridge_line_bound_and_error_sanitization(self):
        database = fixture_index(self.temp.name)
        for raw in (b'x' * 50001 + b'\n', b'{"text":"unterminated"}'):
            result = self.bridge(database, raw)
            self.assertEqual(json.loads(result.stdout), {'error': 'invalid_or_oversize_jsonl_request'})
            self.assertEqual(result.stderr, b'')
        result = self.bridge(Path(self.temp.name) / 'private-operator-path.sqlite', b'')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout), {'error': 'source_intake_unavailable'})
        self.assertEqual(result.stderr, b'')

    def test_bridge_corrupt_original_does_not_echo_source_or_path(self):
        database = fixture_index(self.temp.name, tamper_original=True)
        request = dict(text='قال تعالى: «' + ORIGINAL + '»', revisionId=REVISION)
        result = self.bridge(database, (json.dumps(request) + '\n').encode(), '--research-preview')
        self.assertEqual(json.loads(result.stdout), {'error': 'invalid_intake_request_or_source_integrity'})
        self.assertEqual(result.stderr, b'')

    def test_live_mcp_disabled_without_operator_flag(self):
        with patch('pipeline.live_tafsir.MCPTransport') as transport:
            result = gather_live(1, 1, expected_schema_sha256=SCHEMA_PIN,
                                 reference_exists=lambda surah, ayah: True, environment={})
        self.assertIsNone(result)
        transport.assert_not_called()

    def test_adapter_preserves_raw_notes_and_rejects_schema_drift(self):
        calls = []
        blocked = adapter(lambda request, remaining: calls.append(request), observed='drift')
        self.assertEqual(blocked.gather(1, 1, research_preview=True)['status'], 'schema_drift')
        self.assertEqual(calls, [])
        packet = adapter(lambda request, remaining: response(request)).gather(1, 1, research_preview=True)
        self.assertEqual(packet['claim_support'], 'not_evaluated')
        for source in packet['sources']:
            verify_snapshot(source)
            page = source['parts'][0]
            self.assertEqual(page['original_text'], 'Owned context [1]')
            self.assertEqual(page['original_raw_text'], 'Owned raw context ¬variant¥ [1]')
            self.assertEqual(page['footnotes'][0]['text'], 'Owned note')

    def test_stored_snapshot_replay_and_tampering_without_network(self):
        database = fixture_index(self.temp.name)
        folder = Path(self.temp.name) / 'snapshots'
        folder.mkdir()
        packet = adapter(lambda request, remaining: response(request)).gather(1, 1, research_preview=True)
        snapshot = folder / '1-1.packet.json'
        snapshot.write_text(json.dumps(packet), encoding='utf-8')
        instance = SourceIntake(database, folder, research_preview=True)
        try:
            with patch('pipeline.live_tafsir.gather_live', side_effect=AssertionError('Unexpected network path')):
                result = instance.analyze('[' + '1:1' + ']', REVISION)
            context = [row for row in result['evidence'] if row['sourceRole'] == 'tafsir_commentary']
            self.assertEqual(len(context), 2)
            self.assertTrue(all(row['delivery'] == 'snapshot' for row in context))
            self.assertTrue(all(row['approvalStatus'] == 'pending' for row in context))
            self.assertFalse(result['contextCoverage'][0]['scholarlyContextComplete'])
        finally:
            instance.close()
        packet['sources'][0]['parts'][0]['original_text'] = 'Tampered owned context'
        snapshot.write_text(json.dumps(packet), encoding='utf-8')
        instance = SourceIntake(database, folder, research_preview=True)
        try:
            with self.assertRaises((ContractError, ValueError)):
                instance.analyze('[1:1]', REVISION)
        finally:
            instance.close()


if __name__ == '__main__':
    unittest.main()
