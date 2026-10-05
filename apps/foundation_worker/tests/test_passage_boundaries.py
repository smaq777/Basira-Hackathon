"""Owned/reduced offline boundary controls; no submitted draft or source corpus."""
import hashlib
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from unittest.mock import patch

from test_worker import REVISION, fixture_index
from pipeline.evidence import canonical, normalize, sha
from pipeline.source_intake import SourceIntake, utf16_length


class PassageBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        env = patch.dict(os.environ, {'FOUNDATION_TAFSIR_LIVE': 'false'})
        env.start()
        self.addCleanup(env.stop)

    def intake(self, rows):
        database = fixture_index(self.temp.name)
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.execute('DELETE FROM records')
            connection.execute('DELETE FROM search')
            for role, surah, ayah, name, original in rows:
                identifier = f'owned-{role}-{surah}-{ayah}'
                metadata = dict(source_id='owned-boundary-fixture', source_version='fixture-v1',
                    source_work='Owned/reduced boundary control', rights='owned_test_only',
                    surah_name=name, content_approval='pending', research_only=True)
                connection.execute('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (identifier, role, f'{surah}:{ayah}', surah, ayah, original, original,
                     normalize(original), canonical(metadata), sha(original), sha(original)))
                connection.execute('INSERT INTO search VALUES (?,?)', (normalize(original), identifier))
        manifest = database.with_suffix('.manifest.json')
        packet = json.loads(manifest.read_text(encoding='utf-8'))
        packet['database_sha256'] = hashlib.sha256(database.read_bytes()).hexdigest()
        manifest.write_text(canonical(packet), encoding='utf-8')
        instance = SourceIntake(database, research_preview=True)
        self.addCleanup(instance.close)
        return instance

    def quotes(self, packet):
        segments = {s['id']: s for s in packet['segments']}
        evidence = {r['snapshotKey']: r for r in packet['evidence']}
        return [(segments[q['segmentId']], q,
                 [evidence[k]['reference'] for k in segments[q['segmentId']]['sourceKeys']])
                for q in packet['quotationFindings']]

    def test_numeric_markers_are_never_quotations(self):
        intake = self.intake([('quran_text', 1, 1, 'تجريب', 'نص مملوك واضح كامل')])
        result = intake.analyze('حواش: (56) (57) (٣) (٤).', REVISION)
        self.assertEqual(result['quotationFindings'], [])
        self.assertTrue(all(s['role'] == 'author_text' for s in result['segments']))

    def test_actual_mixed_writing_locator_is_metadata_not_a_second_quote(self):
        excerpt = 'وإن جاهداك على أن تشرك بي ما ليس لك به علم فلا تطعهما وصاحبهما في الدنيا معروفا'
        intake = self.intake([('quran_text', 31, 15, 'لقمان', excerpt + ' واتبع سبيل من أناب إلي')])
        text = 'إذا أمر الوالدان بمعصية، فلا يلزمنا طاعتهما فيها، ويلزمنا أن نصاحبهما بالمعروف فيما لا إثم فيه. قال تعالى: ﴿' + excerpt + '﴾ [لقمان: 31:15].'
        result = intake.analyze(text, REVISION)
        self.assertEqual(result['originalText'], text)
        self.assertEqual(result['revisionSha256'], sha(text))
        self.assertEqual(len(result['quotationFindings']), 1)
        quote, finding, references = self.quotes(result)[0]
        self.assertEqual(quote['originalText'], excerpt)
        self.assertEqual(references, ['31:15'])
        self.assertEqual(finding['status'], 'partial')
        locator = next(s for s in result['segments'] if s['method'] == 'bound_quran_bibliographic_locator')
        self.assertEqual(locator['originalText'], 'لقمان: 31:15')
        self.assertEqual(locator['role'], 'claimed_source')
        self.assertEqual(locator['sourceKeys'], quote['sourceKeys'])
        self.assertNotIn('Quotation contains a source reference; confirm its passage boundaries before literal comparison.', result['warnings'])

    def test_locator_formats_preserve_exact_unicode_offsets(self):
        intake = self.intake([('quran_text', 31, 15, 'لقمان', 'نص مملوك واضح كامل')])
        for locator in ['[لقمان: 31:15]', '(سورة لُقْمَان : ٣١：١٥)', '[31:15]', '(  لقمان 31 : 15  )']:
            with self.subTest(locator=locator):
                text = '😀 تنبيه: ' + locator + ' ثم لا يلزم هذا الشرط.'
                result = intake.analyze(text, REVISION)
                self.assertEqual(result['quotationFindings'], [])
                segment = next(s for s in result['segments'] if s['method'] == 'bound_quran_bibliographic_locator')
                self.assertEqual(text[segment['codePointStart']:segment['codePointEnd']], segment['originalText'])
                self.assertEqual(segment['startOffset'], utf16_length(text[:segment['codePointStart']]))
                self.assertEqual(segment['endOffset'], utf16_length(text[:segment['codePointEnd']]))
                self.assertEqual(segment['sourceKeys'], ['owned-quran_text-31-15'])
                self.assertTrue(any('ثم لا يلزم هذا الشرط' in s['originalText'] for s in result['segments'] if s['role'] == 'author_text'))

    def test_unknown_conflicting_missing_and_malformed_locators_stay_visible(self):
        intake = self.intake([('quran_text', 31, 15, 'لقمان', 'نص مملوك واضح كامل')])
        for locator in ['[البقرة: 31:15]', '[مجهول: 31:15]', '[لقمان: 31:999]', '[لقمان: 31:15-16]', '[لقمان: 31:15)', '[لقمان: 31:15؛ لا طاعة في المعصية]']:
            with self.subTest(locator=locator):
                result = intake.analyze(locator, REVISION)
                self.assertFalse(any(s['method'] == 'bound_quran_bibliographic_locator' for s in result['segments']))
                self.assertTrue(result['quotationFindings'])
                self.assertEqual(result['originalText'], locator)

    def test_named_locator_without_source_name_metadata_stays_visible(self):
        intake = self.intake([('quran_text', 31, 15, '', 'نص مملوك واضح كامل')])
        result = intake.analyze('[لقمان:31:15]', REVISION)
        self.assertFalse(any(s['method'] == 'bound_quran_bibliographic_locator' for s in result['segments']))
        self.assertTrue(result['quotationFindings'])

    def test_non_source_numeric_context_is_not_resolved_locator_metadata(self):
        intake = self.intake([('quran_text', 31, 15, 'لقمان', 'نص مملوك واضح كامل')])
        for text in ['نتيجة المباراة [31:15]', 'الوقت (31:15)', 'النسبة [٣١:١٥]', 'نسبة [31:15]', 'نسبة بين العددين (31:15)', 'ratio (31:15)']:
            with self.subTest(text=text):
                result = intake.analyze(text, REVISION)
                self.assertFalse(any(s['role'] == 'claimed_source' for s in result['segments']))
                self.assertEqual(result['quotationFindings'], [])
                self.assertEqual(result['evidence'], [])
                self.assertEqual(result['originalText'], text)
                self.assertTrue(any(text == s['originalText'] for s in result['segments'] if s['role'] == 'author_text'))

    def test_source_attribution_wording_does_not_act_as_a_ratio_cue(self):
        intake = self.intake([('quran_text', 31, 15, 'لقمان', 'نص مملوك واضح كامل')])
        for text in ['نسبة النص إلى مصدره [31:15].',
                     'لا تثبت نسبة هذا النص إلى القرآن (31:15).',
                     'نسبة النص إلى مصدره [لقمان: 31:15].']:
            with self.subTest(text=text):
                result = intake.analyze(text, REVISION)
                locator = next(s for s in result['segments'] if s['method'] == 'bound_quran_bibliographic_locator')
                self.assertEqual(locator['sourceKeys'], ['owned-quran_text-31-15'])
                self.assertEqual(result['quotationFindings'], [])
                self.assertEqual(result['originalText'], text)
                self.assertTrue(any('نسبة' in s['originalText'] for s in result['segments'] if s['role'] == 'author_text'))

    def test_author_qualifications_and_locator_inside_speech_are_not_suppressed(self):
        intake = self.intake([('quran_text', 31, 15, 'لقمان', 'نص مملوك واضح كامل')])
        for text in ['لا طاعة [في المعصية فقط] مع الصحبة بالمعروف.',
                     '(لا يلزم ذلك إلا عند تحقق الشرط) والشرط مهم.',
                     'قال الكاتب: «لا تتجاهل [لقمان: 31:15] ولا تحذف هذا الشرط».',
                     'قال تعالى: ﴿لقمان: 31:15﴾']:
            with self.subTest(text=text):
                result = intake.analyze(text, REVISION)
                self.assertFalse(any(s['method'] == 'bound_quran_bibliographic_locator' for s in result['segments']))
                self.assertTrue(result['quotationFindings'])
                self.assertEqual(result['originalText'], text)
                self.assertTrue(any(s['role'] != 'claimed_source' and ('لا' in s['originalText'] or 'لقمان' in s['originalText']) for s in result['segments']))

    def test_shahada_without_source_framing_remains_authored_formula(self):
        intake = self.intake([('quran_text', 37, 35, 'تجريب', 'قول تجريبي أن لا إله إلا الله'),
                              ('quran_text', 47, 19, 'مثال', 'شرح تجريبي لا إله إلا الله')])
        result = intake.analyze('أشهد أن لا إله إلا الله وحده. نحن نشهد أن لا إله إلا الله.', REVISION)
        self.assertEqual(result['quotationFindings'], [])

    def test_explicit_identity_narrows_repeated_excerpt_and_preserves_ambiguity(self):
        phrase = 'نص مملوك مشترك واضح'
        intake = self.intake([('quran_text', 7, 65, 'مثال', phrase + ' تتمة أولى'),
                              ('quran_text', 23, 32, 'المؤمنون', phrase + ' تتمة أخرى')])
        result = intake.analyze(f'قال تعالى: ({phrase}) سوره المؤمنون 32.', REVISION)
        segment, quote, references = self.quotes(result)[0]
        self.assertEqual(references, ['23:32'])
        self.assertEqual(segment['roleStatus'], 'source_matched')
        self.assertFalse(segment['conflict'])
        ambiguous = self.quotes(intake.analyze(f'قال تعالى: ({phrase})', REVISION))[0]
        self.assertEqual(ambiguous[0]['roleStatus'], 'candidate')
        self.assertIsNone(ambiguous[1]['evidenceKey'])

    def test_named_reference_outranks_embedded_hadith_and_joined_vocative(self):
        intake = self.intake([('quran_text', 3, 102, 'آل عمران', 'ياأيها نص مملوك واضح كامل'),
                              ('hadith_matn', 8, 1, '', 'تمهيد يا أيها نص مملوك واضح كامل تتمة')])
        text = '😀 {يا أيها نص مملوك واضح كامل} آل عمران (١٠٢).'
        result = intake.analyze(text, REVISION)
        segment, _, refs = self.quotes(result)[0]
        self.assertEqual(segment['role'], 'ayah')
        self.assertEqual(refs, ['3:102'])
        self.assertFalse(segment['conflict'])
        for s in result['segments']:
            self.assertEqual(s['originalText'], text[s['codePointStart']:s['codePointEnd']])
            self.assertEqual(s['startOffset'], utf16_length(text[:s['codePointStart']]))
            self.assertEqual(s['endOffset'], utf16_length(text[:s['codePointEnd']]))

    def test_prior_quote_reference_does_not_leak_to_next_quote(self):
        intake = self.intake([('quran_text', 21, 25, 'الأنبياء', 'نص أول مملوك كامل'),
                              ('quran_text', 16, 36, 'النحل', 'نص تال مملوك كامل')])
        result = intake.analyze('(نص أول مملوك كامل) الأنبياء 25\n(نص تال مملوك كامل) النحل.', REVISION)
        quotes = self.quotes(result)
        self.assertEqual(len(quotes), 2)
        self.assertFalse(quotes[1][0]['conflict'])
        self.assertEqual(quotes[1][2], ['16:36'])

    def test_number_first_named_reference_binds_malformed_wrapper(self):
        intake = self.intake([('quran_text', 2, 21, 'البقرة', 'نص مملوك واضح كامل مع تتمة')])
        result = intake.analyze('قال تعالى: {نص مملوك واضح كامل ،). 21 البقرة', REVISION)
        refs = [s for s in result['segments'] if s['role'] == 'claimed_source']
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0]['originalText'], '21 البقرة')
        self.assertEqual(self.quotes(result)[0][2], ['2:21'])

    def test_multiayah_nested_markers_preserve_altered_last_word_and_attached_number(self):
        intake = self.intake([('quran_text', 51, 56, 'الذاريات', 'نص أول مملوك كامل'),
                              ('quran_text', 51, 57, 'الذاريات', 'نص آخر مملوك يطعمون'),
                              ('quran_text', 51, 58, 'الذاريات', 'نص ثالث مملوك المتينُ')])
        text = 'قال تعالى (نص أول مملوك كامل (56) نص آخر مملوك يطعمونا (57) نص ثالث مملوك المتينُ58) سوره الذاريات'
        result = intake.analyze(text, REVISION)
        quotes = self.quotes(result)
        self.assertEqual(len(quotes), 3)
        self.assertEqual([s['originalText'] for s, _, _ in quotes],
            ['نص أول مملوك كامل', 'نص آخر مملوك يطعمونا', 'نص ثالث مملوك المتينُ'])
        self.assertEqual([r for _, _, r in quotes], [['51:56'], ['51:57'], ['51:58']])
        self.assertEqual(quotes[1][1]['status'], 'mismatch')
        self.assertTrue(any('يطعمونا' in d['quotedText'] for d in quotes[1][1]['comparison']['differences']))

    def test_changed_complete_quote_never_shrinks_to_unchanged_fragment(self):
        intake = self.intake([('quran_text', 1, 1, 'تجريب', 'نص مملوك واضح كامل خاتمة')])
        for phrase in ('تغيير نص مملوك واضح كامل خاتمة', 'نص مملوك واضح كامل خاتمة مختلفة'):
            result = intake.analyze(f'قال تعالى: ({phrase}) تجريب 1', REVISION)
            quote = self.quotes(result)[0]
            self.assertEqual(quote[0]['originalText'], phrase)
            self.assertEqual(quote[1]['status'], 'mismatch')

    def test_explicit_conflict_stays_visible_and_unrelated_prose_does_not_resolve(self):
        intake = self.intake([('quran_text', 1, 1, 'تجريب', 'نص مملوك واضح كامل'),
                              ('quran_text', 2, 2, 'مثال', 'نص مغاير مستقل مختلف')])
        result = intake.analyze('(نص مملوك واضح كامل) مثال 2', REVISION)
        self.assertTrue(self.quotes(result)[0][0]['conflict'])
        unrelated = self.quotes(intake.analyze('(عبارة مستقلة ليس لها دليل) مثال 2', REVISION))[0]
        self.assertEqual(unrelated[0]['roleStatus'], 'candidate')

    def test_long_prophetic_attribution_is_proposal_without_false_hadith_certainty(self):
        intake = self.intake([('quran_text', 1, 1, 'تجريب', 'نص مملوك واضح كامل'),
                              ('hadith_matn', 8, 1, '', 'رواية مملوكة طويلة ذات نهاية')])
        text = 'في الصحيحين قال - صلى الله عليه وسلم - لمعاذ - رضي الله عنه - حين بعثه إلى بلد: (رواية مملوكة طويلة ذات نهاية ...) (٣).'
        quotes = self.quotes(intake.analyze(text, REVISION))
        self.assertEqual(len(quotes), 1)
        self.assertEqual(quotes[0][0]['role'], 'matn')
        self.assertFalse(quotes[0][0]['conflict'])

    def test_nested_numbers_in_non_quran_quote_do_not_split_its_wording(self):
        intake = self.intake([('quran_text', 1, 1, 'تجريب', 'نص مملوك واضح كامل')])
        text = '«نص مؤلف (3) جملة تالية.»'
        quotes = self.quotes(intake.analyze(text, REVISION))
        self.assertEqual(len(quotes), 1)
        self.assertEqual(quotes[0][0]['originalText'], 'نص مؤلف (3) جملة تالية.')

    def test_unbound_nested_numbers_preserve_complete_quran_framed_quote(self):
        intake = self.intake([('quran_text', 1, 3, 'تجريب', 'نص مملوك واضح كامل')])
        phrase = 'نص مملوك واضح كامل (3) كلمة محرّفة'
        for left, right in (('(', ')'), ('{', '}'), ('﴿', '﴾')):
            with self.subTest(left=left):
                quotes = self.quotes(intake.analyze('قال تعالى: '+left+phrase+right, REVISION))
                self.assertEqual(len(quotes), 1)
                self.assertEqual(quotes[0][0]['originalText'], phrase)
                self.assertNotEqual(quotes[0][1]['status'], 'exact')

    def test_marker_requires_available_identity_and_no_unmarked_tail(self):
        intake = self.intake([('quran_text', 1, 3, 'تجريب', 'نص مملوك واضح كامل')])
        for phrase in ('نص مملوك واضح كامل (99)',
                       'نص مملوك واضح كامل (3) كلمة محرّفة'):
            with self.subTest(phrase=phrase):
                quotes = self.quotes(intake.analyze('قال تعالى: ('+phrase+') سورة تجريب', REVISION))
                self.assertEqual(len(quotes), 1)
                self.assertEqual(quotes[0][0]['originalText'], phrase)
                self.assertNotEqual(quotes[0][1]['status'], 'exact')

    def test_supported_wrappers_preserve_exact_content(self):
        intake = self.intake([('quran_text', 1, 1, 'تجريب', 'نص مملوك واضح كامل')])
        for left, right in (('«', '»'), ('﴿', '﴾'), ('“', '”'), ('"', '"'),
                            ('<', '>'), ('<<', '>>'), ('[', ']'), ('{', '}'), ('‹', '›')):
            with self.subTest(left=left):
                quotes = self.quotes(intake.analyze(left+'نص مملوك واضح كامل'+right, REVISION))
                self.assertEqual(len(quotes), 1)
                self.assertEqual(quotes[0][0]['originalText'], 'نص مملوك واضح كامل')


if __name__ == '__main__':
    unittest.main()
