"""Deterministic fidelity/extent controls; short examples are not corpus approval."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from review_flow.quotation import compare_quotation
from pipeline.evidence import sha
import test_worker
from test_worker import REVISION


def auxiliary(text):
    return dict(text=text, sha256=sha(text), source_id='owned-script-fixture',
                source_version='fixture-v1', field='publisher imlai original')


class QuotationTests(unittest.TestCase):
    def test_declared_uthmani_presentation_families_full_and_excerpt(self):
        # Small synthetic passages exercise the writing's script families without
        # publishing its prose or distributing a source edition/corpus.
        families = [
            ('وَمَا\u0653 نُوحِى\u0653 أَنَّهُ\u06e5 إِلَّا\u0653 أَنَا\u06e0 نَصٌّ', 'وما نوحي أنه إلا أنا نص'),
            ('فِى \u0671عْبُدُوا\u06df وَ\u0671جْتَنِبُوا\u06df نَصٌّ', 'في اعبدوا واجتنبوا نص'),
            ('تَعْبُدُو\u0653ا\u06df أَحَدُهُمَا\u0653 لَّهُمَا\u0653 نَصٌّ', 'تعبدوا أحدهما لهما نص'),
            ('وَ\u0671عْبُدُوا\u06df بِهِ\u06e6 شَيْـ\u0654ًا نَصٌّ', 'واعبدوا به شيئا نص'),
        ]
        for source, imlai in families:
            words = imlai.split()
            for quote, extent in ((imlai, 'full'), (' '.join(words[:-1]), 'excerpt'),
                                  (' '.join(words[1:]), 'excerpt')):
                with self.subTest(source=source, quote=quote):
                    result = compare_quotation(quote, source,
                        {'canonical_orthography': 'uthmani'}, auxiliary_imlai=auxiliary(imlai))
                    self.assertEqual(result['comparison']['fidelity'], 'orthographic')
                    self.assertEqual(result['comparison']['extent'], extent)
                    self.assertEqual(result['comparison']['differences'], [])
                    self.assertEqual(result['source_sha256'], sha(source))

    def test_canonical_self_comparison_with_auxiliary_has_no_edits(self):
        source = 'لَا\u0653 إِكْرَاهَ فِى \u0671لدِّينِ قَدْ تَبَيَّنَ'
        view = auxiliary('لا إكراه في الدين قد تبين')
        result = compare_quotation(source, source, auxiliary_imlai=view)
        self.assertEqual(result['comparison'], dict(fidelity='exact', extent='full', differences=[], basis='canonical'))
        self.assertNotIn('lexical_difference', result['flags'])
        excerpt = source[:source.index(' قَدْ')]
        result = compare_quotation(excerpt, source, auxiliary_imlai=view)
        self.assertEqual(result['comparison'], dict(fidelity='exact', extent='excerpt', differences=[], basis='canonical'))

    def test_verified_vocative_spacing_preserves_original_source_offsets(self):
        source = 'يَـ\u0670\u0653أَيُّهَا نَصٌّ وَاضِحٌ'
        result = compare_quotation('يا أيها نص واضح', source,
            {'canonical_orthography': 'uthmani'}, auxiliary_imlai=auxiliary('ياأيها نص واضح'))
        self.assertEqual(result['comparison']['fidelity'], 'orthographic')
        self.assertEqual(result['comparison']['extent'], 'full')
        self.assertEqual(result['comparison']['differences'], [])
        self.assertEqual(result['contiguous_source_spans'][0]['original'], source)

    def test_lexical_change_at_excerpt_end_does_not_absorb_unquoted_context(self):
        result = compare_quotation('نص واحد متغير', 'نص واحد أصيل ثم سياق أطول محفوظ')
        self.assertEqual(result['comparison']['extent'], 'excerpt')
        self.assertEqual(result['comparison']['differences'], [dict(kind='replace', quotedText='متغير', sourceText='أصيل')])

    def test_extra_final_alef_remains_a_lexical_difference(self):
        source = 'مَـ\u0670\u0653 أُرِيدُ أَنْ يُطْعِمُونِ'
        result = compare_quotation('ما أريد أن يطعمونا', source,
            {'canonical_orthography': 'uthmani'}, auxiliary_imlai=auxiliary('ما أريد أن يطعمون'))
        self.assertEqual(result['comparison']['fidelity'], 'different')
        self.assertEqual(result['comparison']['extent'], 'full')
        self.assertEqual(result['comparison']['differences'], [dict(kind='replace', quotedText='يطعمونا', sourceText='يُطْعِمُونِ')])

    def test_full_and_contiguous_prefix_middle_suffix_have_independent_extent(self):
        source = 'نص واحد واضح ثم مقصد أصيل'
        for quote, extent in ((source, 'full'), ('نص واحد واضح', 'excerpt'),
                              ('واحد واضح ثم', 'excerpt'), ('ثم مقصد أصيل', 'excerpt')):
            with self.subTest(quote=quote):
                result = compare_quotation(quote, source)
                self.assertEqual(result['comparison'], dict(fidelity='exact', extent=extent,
                    differences=[], basis='canonical'))

    def test_typography_and_canonical_equivalence_preserve_originals(self):
        result = compare_quotation('نص واحد', 'نَصٌّ وَاحِدٌ')
        self.assertEqual(result['comparison']['fidelity'], 'orthographic')
        self.assertEqual(result['comparison']['extent'], 'full')
        self.assertEqual(result['comparison']['basis'], 'typography')
        self.assertEqual(result['quote_original'], 'نص واحد')

    def test_internal_gap_with_or_without_ellipsis_is_not_truncation(self):
        for quote in ('نص واحد ثم مقصد أصيل', 'نص واحد … ثم مقصد أصيل'):
            result = compare_quotation(quote, 'نص واحد واضح ثم مقصد أصيل')
            self.assertEqual(result['comparison']['fidelity'], 'different')
            self.assertEqual(result['comparison']['extent'], 'gapped')
            self.assertEqual(result['comparison']['differences'], [dict(kind='omit', quotedText='', sourceText='واضح')])

    def test_deleted_internal_negation_and_inserted_words_are_lexical_changes(self):
        result = compare_quotation('هذا مقصد واضح', 'هذا لا مقصد واضح')
        self.assertEqual(result['comparison']['fidelity'], 'different')
        self.assertIn('negation_token_changed', result['flags'])
        self.assertEqual(result['comparison']['differences'][0]['sourceText'], 'لا')
        inserted = compare_quotation('نص واحد جديد واضح', 'نص واحد واضح')
        self.assertEqual(inserted['comparison']['differences'], [dict(kind='insert', quotedText='جديد', sourceText='')])

    def test_hamza_and_lexical_madda_are_not_folded(self):
        for quote, source in (('ان مقصد واضح', 'إن مقصد واضح'), ('امن مقصد واضح', 'آمن مقصد واضح'),
                              ('امن مقصد واضح', 'ا\u0653من مقصد واضح')):
            for metadata in (None, {'canonical_orthography': 'uthmani'}):
                result = compare_quotation(quote, source, metadata, auxiliary_imlai=auxiliary(source))
                self.assertEqual(result['comparison']['fidelity'], 'different')
        altered = compare_quotation('أن مقصد واضح', 'إن مقصد واضح',
            {'canonical_orthography': 'uthmani'}, auxiliary_imlai=auxiliary('أن مقصد واضح'))
        self.assertEqual(altered['comparison']['fidelity'], 'different')
        self.assertNotEqual(altered['comparison']['basis'], 'auxiliary_imlai')

    def test_script_bridge_requires_hashed_attributed_token_aligned_auxiliary(self):
        source = 'لَآ إِكْرَاهَ فِى ٱلدِّينِ قَدْ تَبَيَّنَ'
        view = auxiliary('لا إكراه في الدين قد تبين')
        result = compare_quotation('لا إكراه في الدين', source, auxiliary_imlai=view)
        self.assertEqual(result['comparison'], dict(fidelity='orthographic', extent='excerpt', differences=[], basis='auxiliary_imlai'))
        self.assertEqual(result['contiguous_source_spans'][0]['original'], 'لَآ إِكْرَاهَ فِى ٱلدِّينِ')
        self.assertEqual(result['source_sha256'], sha(source))
        self.assertNotIn('negation_token_changed', result['flags'])
        self.assertNotEqual(compare_quotation('لا إكراه في الدين', source)['comparison']['fidelity'], 'orthographic')
        corrupted = {**view, 'sha256': sha('wrong')}
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            compare_quotation('لا إكراه في الدين', source, auxiliary_imlai=corrupted)
        # An auxiliary field cannot erase/rewrite a substantive word, even if pinned.
        for unsafe in ('إكراه في الدين قد تبين', 'لم إكراه في الدين قد تبين'):
            changed = compare_quotation(unsafe, source, auxiliary_imlai=auxiliary(unsafe))
            self.assertNotEqual(changed['comparison']['basis'], 'auxiliary_imlai')

    def test_auxiliary_does_not_allow_arbitrary_maqsurah_or_negation_fold(self):
        result = compare_quotation('علي مقصد واضح', 'عَلَى مَقْصَدٍ وَاضِحٍ', auxiliary_imlai=auxiliary('على مقصد واضح'))
        self.assertEqual(result['comparison']['fidelity'], 'different')

    def test_pinned_auxiliary_hamza_seat_and_recitation_signs_do_not_drop_hamza(self):
        source = 'أَفَرَءَيْتُم ضُرِّهِ\u06e6\u0653 نَصٌّ'
        view = auxiliary('أفرأيتم ضره نص')
        result = compare_quotation('أفرأيتم ضره نص', source, auxiliary_imlai=view)
        self.assertEqual(result['comparison']['fidelity'], 'orthographic')
        self.assertEqual(result['comparison']['basis'], 'auxiliary_imlai')
        changed = compare_quotation('افرايتم ضره نص', source, auxiliary_imlai=view)
        self.assertEqual(changed['comparison']['fidelity'], 'different')
        result = compare_quotation('هذا لم مقصد واضح', 'هَذَا لَا مَقْصَدٌ وَاضِحٌ', auxiliary_imlai=auxiliary('هذا لا مقصد واضح'))
        self.assertEqual(result['comparison']['fidelity'], 'different')

    def test_user_altered_opening_and_internal_earth_omission_are_precise(self):
        source = 'وَلَئِن سَأَلْتَهُم مَنْ خَلَقَ ٱلسَّمَـٰوَٰتِ وَٱلْأَرْضَ لَيَقُولُنَّ ٱللَّهُ قُلْ'
        quote = 'وَإِنْ سَأَلْتَهُمْ مَنْ خَلَقَ السَّمَاوَاتِ لَيَقُولُنَّ اللَّهُ'
        result = compare_quotation(quote, source, auxiliary_imlai=auxiliary('ولئن سألتهم من خلق السموات والأرض ليقولن الله قل'))
        comparison = result['comparison']
        self.assertEqual(comparison['fidelity'], 'different')
        self.assertEqual(comparison['extent'], 'gapped')
        self.assertEqual(comparison['differences'], [
            dict(kind='replace', quotedText='وَإِنْ', sourceText='وَلَئِن'),
            dict(kind='omit', quotedText='', sourceText='وَٱلْأَرْضَ')])

    def test_repeated_partial_token_and_missing_sources_abstain(self):
        repeated = compare_quotation('نص واحد واضح', 'نص واحد واضح ثم نص واحد واضح')
        self.assertEqual(repeated['comparison']['fidelity'], 'unresolved')
        partial = compare_quotation('لا مقصد واضح', 'إلا مقصد واضح')
        self.assertEqual(partial['comparison']['fidelity'], 'different')
        self.assertEqual(compare_quotation('نص', None)['comparison']['extent'], 'unknown')


class IntakeComparisonTests(unittest.TestCase):
    setUp = test_worker.WorkerTests.setUp
    intake = test_worker.WorkerTests.intake
    def test_bridge_reports_auxiliary_extent_with_canonical_utf16_alignment(self):
        original = 'لَآ إِكْرَاهَ فِى ٱلدِّينِ قَدْ تَبَيَّنَ'
        instance = self.intake(original=original, auxiliary=auxiliary('لا إكراه في الدين قد تبين'))
        result = instance.analyze('قال تعالى: «لا إكراه في الدين» [1:1]', REVISION)
        finding = result['quotationFindings'][0]
        self.assertEqual(finding['status'], 'partial')
        self.assertEqual(finding['comparison']['fidelity'], 'orthographic')
        canonical = original.encode('utf-16-le')[finding['matchedStart']*2:finding['matchedEnd']*2].decode('utf-16-le')
        self.assertEqual(canonical, 'لَآ إِكْرَاهَ فِى ٱلدِّينِ')
        self.assertEqual(result['evidence'][0]['originalText'], original)
