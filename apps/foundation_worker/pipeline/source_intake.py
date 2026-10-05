"""Bounded source-first intake; source discovery never assesses religious meaning.

The original draft, source text and offsets are immutable. Search normalization
is deliberately lossy and is not presented as quotation fidelity. Pending
research corpora require an operator-owned preview flag, never a browser flag.
"""
import copy
import json
import re
import unicodedata
import uuid
import time
from pathlib import Path

from .evidence import EvidenceStore, canonical, normalize, normalized_with_offsets, sha
from .tafsir_adapter import PROVIDER, WORKS, TafsirAdapter, verify_snapshot
from review_flow.quotation import compare_quotation, VERSION as COMPARATOR_VERSION
from .quote_discovery import ordered_omission

VERSION = 'source-first-intake-1.9/' + COMPARATOR_VERSION
SCHEMA_PIN = 'c492c3d0c73919981e4518a483750eae90b025559985c3fe286681e16765c332'
FORMULAE = {normalize(x) for x in ('بسم الله', 'بسم الله الرحمن الرحيم', 'الحمد لله',
    'الحمد لله رب العالمين', 'إن شاء الله', 'إنا لله وإنا إليه راجعون',
    'لا إله إلا الله', 'أن لا إله إلا الله')}
NUMERIC = re.compile(r'(?<![\w:：])(\d{1,3})\s*[:：]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?!\d)')
Q_FRAME = re.compile(r'(?:قال\s+الله|قوله\s+تعالى|قال\s+تعالى|الآية|الاية|القرآن|القران)')
H_FRAME = re.compile(r'(?:قال\s+رسول\s+الله|قال\s+النبي|حديث|عن\s+النبي|في\s+الصحيحين|قال\s*[-–]?\s*صلى\s+الله\s+عليه\s+وسلم)')
MAX_EVIDENCE_ROWS = 80
MAX_CONTEXT_ROWS = 30
MAX_OPTIONAL_EVIDENCE_BYTES = 200_000
NEGATIVE_CONTEXT_CACHE_SECONDS = 30.0
NON_SOURCE_NUMERIC = re.compile(r'الساعة|ساعه|الوقت|التوقيت|موعد|الاجتماع|نتيجة|المباراة|النقاط|الاهداف|clock|time|score|ratio|\bam\b|\bpm\b', re.I)
# Ratio wording needs numeric adjacency or an explicit mathematical qualifier.
# Bare نسبة also means source attribution and must not suppress a locator.
NON_SOURCE_RATIO = re.compile(r'(?:النسبة|نسبة|نسبه)(?:\s+(?:العددية|العدديه|المئوية|المئويه|بين)(?:\s|$)|\s*[:：]?\s*[\[(]?\s*$)')
JOINED_VOCATIVE = re.compile(r'(?<!\w)ياايها(?!\w)')


def utf16_length(text):
    return len(text.encode('utf-16-le')) // 2


def _framing(text, start):
    before = re.split(r'[.؛!؟\n]', text[max(0, start - 220):start])[-1]
    q = list(Q_FRAME.finditer(before))
    h = list(H_FRAME.finditer(before))
    frames = [(m, 'ayah') for m in q] + [(m, 'matn') for m in h]
    if frames:
        frame, role = max(frames, key=lambda row: row[0].start())
        prefix = normalize(before[:frame.start()])
        suffix = normalize(before[frame.end():])
        negator = r'(?:ليس\w*|لست|لسنا|غير|لا|ما|لم|لن|دون)'
        # Attribution denial is not an affirmative source cue. Do not fall
        # back to an earlier positive mention after the latest cue is denied.
        denied_before = re.search(r'(?:^|\s)'+negator+r'\s+(?:\S+\s+){0,4}$', prefix+' ')
        denied_after = re.search(r'(?:^|\s)'+negator+r'(?:\s|$)', suffix)
        if not denied_before and not denied_after:
            return role
    return None


def _token_contains(container, needle):
    return bool(needle) and (' ' + needle + ' ') in (' ' + container + ' ')


def _quran_search_key(text):
    # Search presentation alias only. Original text and literal comparison are
    # untouched; the comparator independently assesses the pinned edition.
    return JOINED_VOCATIVE.sub('يا ايها', normalize(text))


def _bound_quran_locators(text, quote_units, names, reference):
    """Recognize complete reference containers, never arbitrary quoted prose.

    Only independently parsed, balanced square/parenthesized units qualify.
    A locator nested in genuine speech does not turn that whole speech into
    metadata. Comparison normalization binds the label; original slices remain.
    """
    locators = {}
    pattern = re.compile(r'(?:(?P<label>[\u0621-\u064a\u066e-\u06d3\u064b-\u065f\u0670ـ\s]+?)\s*[:：]?\s*)?'
                         r'(?P<surah>\d{1,3})\s*[:：]\s*(?P<ayah>\d{1,3})')
    for a, b, _, _, outer_end in quote_units:
        opening = a - 1
        while opening >= 0 and text[opening].isspace():
            opening -= 1
        if opening < 0 or text[opening] not in '[(' or outer_end <= b or \
                text[outer_end-1] != {'[': ']', '(': ')'}[text[opening]]:
            continue
        match = pattern.fullmatch(text[a:b])
        if not match:
            continue
        surah, ayah = int(match['surah']), int(match['ayah'])
        label = normalize(match['label'] or '')
        if label:
            label = re.sub(r'^(?:سورة|سوره)\s+', '', label)
            if names.get(label) != surah:
                continue
        records = reference(surah, ayah)
        if len(records) != 1:
            continue
        locators[(a + match.start('surah'), a + match.end('ayah'))] = (a, b, records)
    return locators


def _quote_units(text, surah_names=None, reference=None):
    """Keep wrappers whole unless every verse boundary has a bound identity.

    Balanced inner parentheses (including numbered markers) do not terminate
    the outer passage. A mismatched outer closing wrapper is a bounded recovery
    cue. Quran framing alone cannot distinguish a footnote from a verse number.
    Originals remain slices, including altered words at either boundary.
    """
    pairs = {'﴿': '﴾', '«': '»', '“': '”', '"': '"', '(': ')',
             '[': ']', '{': '}', '‹': '›', '<': '>'}
    closers = set(pairs.values())
    units = []
    i = 0
    while i < len(text):
        if text[i] not in pairs:
            i += 1
            continue
        opening = i
        stack = [pairs[text[i]]]
        i += 1
        a = i
        line_end = text.find('\n', a)
        if line_end < 0:
            line_end = len(text)
        if text[opening:opening+2] == '<<':
            i += 1
            a = i
            stack.append('>')
        while i < len(text):
            char = text[i]
            if char == '\n':
                break
            if char == stack[-1]:
                stack.pop()
                if not stack:
                    break
            elif char in pairs:
                stack.append(pairs[char])
            elif char in closers:
                # Recover a malformed outer brace ending in a parenthesis.
                if len(stack) == 1:
                    break
                stack.pop()
            # An unmatched container ends at a sentence boundary; ellipses
            # within a hadith quote are retained rather than discarding suffixes.
            elif char in '.!?؟؛' and text.find(stack[0], i, line_end) < 0 and not (char == '.' and
                    ((i and text[i-1] == '.') or (i+1 < len(text) and text[i+1] == '.'))):
                break
            i += 1
        b = i
        outer_end = min(len(text), i+1)
        if text[opening:opening+2] == '<<' and text[i-1:i+1] == '>>':
            b -= 1
        tail = normalize(text[outer_end:outer_end+65])
        surahs = {surah for name, surah in (surah_names or {}).items()
                  if re.match(r'(?:(?:سورة|سوره)\s+)?' + re.escape(name) + r'(?:\s|$)', tail)}
        markers = list(re.finditer(r'\(\s*(\d{1,3})\s*\)|(?<=[\u0621-\u065f\u066e-\u06d3])([0-9٠-٩]{1,3})(?=\s*$)', text[a:b]))
        # Only an immediately attached, unique surah plus available verse rows
        # binds these numbers. A trailing unmarked clause remains part of the
        # declared quotation rather than being detached from literal review.
        if markers and (len(surahs) != 1 or not reference or
                text[a+markers[-1].end():b].strip() or
                any(len(reference(next(iter(surahs)), int(m[1] or m[2]))) != 1 for m in markers)):
            markers = []
        cursor = a
        for marker in markers:
            end = a + marker.start()
            units.append((cursor, end, text[opening] in '{﴿',
                          int(marker[1] or marker[2]), outer_end))
            cursor = a + marker.end()
        if cursor < b:
            units.append((cursor, b, text[opening] in '{﴿', None, outer_end))
        i = max(i+1, opening+1)
    result = []
    for a, b, hinted, marker, outer_end in units:
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b-1].isspace():
            b -= 1
        if a < b:
            result.append((a, b, hinted, marker, outer_end))
    return result


class SourceIntake:
    def __init__(self, database, snapshot_directory=None, *, research_preview=False):
        if type(research_preview) is not bool:
            raise ValueError('Operator preview flag must be boolean')
        if not Path(database).with_suffix('.manifest.json').is_file():
            raise ValueError('Source intake requires a pinned index manifest')
        self.store = EvidenceStore(database)
        self.research_preview = research_preview
        self.snapshot_directory = Path(snapshot_directory) if snapshot_directory else None
        self.context_cache = {}
        self.context_negative_cache_until = {}
        self.context_attempted = set()
        # EvidenceStore already normalized these views; normalize only new
        # input quotations, rather than rescanning the entire corpus per run.
        self.verse_views = [(record, JOINED_VOCATIVE.sub('يا ايها', view))
                            for record, view in self.store.verse_search_views]
        # Source-derived four-token anchors permit a short embedded excerpt
        # without trusting an LLM role label. Ambiguous anchors remain visible.
        self.fragment_index = {}
        for record, view in self.verse_views:
            words = tuple(view.split())
            for at in range(len(words)-3):
                self.fragment_index.setdefault(words[at:at+4], []).append((record, words, at))

    def close(self):
        self.store.close()

    def _evidence(self, record, mode='exact', purpose='source_candidate'):
        checked = self.store.evidence(record)
        m = copy.deepcopy(checked['metadata'])
        if not self.research_preview and (m.get('content_approval') != 'approved' or m.get('research_only', True)):
            return None
        return dict(snapshotKey=record['id'], sourceId=m.get('source_id', 'unknown-source'),
                    sourceVersion=m.get('source_version', self.store.manifest['corpus_fingerprint']),
                    sourceRole=record['role'], reference=record['reference'],
                    originalText=checked['original_text'], originalSha256=checked['original_sha256'],
                    work=m.get('source_work') or m.get('title') or 'IslamicEval six-book research corpus',
                    author=m.get('author'), edition=m.get('edition'), sourceUrl=m.get('source_url'),
                    approvalStatus=m.get('content_approval', 'pending'), researchOnly=m.get('research_only', True),
                    parentSnapshotKey=None, delivery='snapshot', retrievalModes=[mode],
                    provenance={**m, 'purpose': purpose, 'matchingFieldSha256': record['search_sha256'],
                                'originalAndMatchingFieldsAreSeparate': True})

    def _snapshot(self, reference):
        if reference in self.context_cache:
            cached = copy.deepcopy(self.context_cache[reference])
            if cached:
                cached['delivery'] = 'snapshot'
            if reference not in self.context_negative_cache_until:
                return cached
            # A transient unavailable result must not poison a long-lived
            # worker. Keep it quiet within this intake and for a bounded TTL;
            # a later intake may recover without a process restart.
            if (reference in self.context_attempted or
                    time.monotonic() < self.context_negative_cache_until.get(reference, 0)):
                return cached
            del self.context_cache[reference]
            self.context_negative_cache_until.pop(reference, None)
        if not re.fullmatch(r'[0-9]{1,3}:[0-9]{1,3}', reference):
            return None
        s, a = map(int, reference.split(':'))
        if reference != f'{s}:{a}' or not self.store.reference(s, a):
            return None
        self.context_attempted.add(reference)
        folder = self.snapshot_directory
        # Prefer reviewed packets, whose original/raw/notes identities are all
        # checked. The older live directory can replay the same captured bodies.
        reviewed = folder / (reference.replace(':', '-') + '.packet.json') if folder else None
        packet = json.loads(reviewed.read_text(encoding='utf-8')) if reviewed and reviewed.is_file() else None
        replayed_from_disk = packet is not None
        if packet and any('content_sha256' not in r for r in packet.get('sources', [])):
            def fetch(request, remaining):
                return (folder / f'{request.surah}-{request.ayah}-{request.source}-part{request.part}.rpc.json').read_bytes()
            adapter = TafsirAdapter(fetch, observed_schema_sha256=SCHEMA_PIN,
                expected_schema_sha256=SCHEMA_PIN, service_version={'name': 'Tafsir MCP', 'version': '1.27.1'},
                reference_exists=lambda surah, ayah: bool(self.store.reference(surah, ayah)))
            packet = adapter.gather(s, a, research_preview=True)
        if not packet:
            from .live_tafsir import gather_live
            packet = gather_live(s, a, expected_schema_sha256=SCHEMA_PIN,
                overall_deadline=getattr(self, 'live_context_deadline', time.monotonic()+12.0),
                reference_exists=lambda surah, ayah: bool(self.store.reference(surah, ayah)))
        if packet:
            packet['acquisition_delivery'] = packet.get('acquisition_delivery', packet.get('delivery', 'snapshot'))
            if replayed_from_disk:
                packet['delivery'] = 'snapshot'
            if (packet.get('provider') != PROVIDER or packet.get('reference') != reference
                    or packet.get('schema_sha256') != SCHEMA_PIN):
                raise ValueError('Tafsir snapshot provider/reference/schema mismatch')
            seen = set()
            for work in packet['sources']:
                if work['source'] not in WORKS or work['source'] in seen or work.get('reference') != reference:
                    raise ValueError('Unexpected/duplicate snapshot work')
                seen.add(work['source'])
                if work.get('usable_for_research_context'):
                    verify_snapshot(work)
                    parts = work['parts']
                    if (not parts or [p['part'] for p in parts] != list(range(1, len(parts)+1))
                            or any(p['total_parts'] != len(parts) for p in parts)):
                        raise ValueError('Incomplete Tafsir snapshot pagination')
        self.context_cache[reference] = copy.deepcopy(packet)
        if not packet or not any(work.get('usable_for_research_context') for work in packet.get('sources', [])):
            self.context_negative_cache_until[reference] = time.monotonic() + NEGATIVE_CONTEXT_CACHE_SECONDS
        else:
            self.context_negative_cache_until.pop(reference, None)
        return packet

    def _context(self, anchor, evidence):
        reference = anchor['reference']
        available = set()
        packet = self._snapshot(reference) if self.research_preview else None
        if packet:
            for work in packet['sources']:
                if not work.get('usable_for_research_context'):
                    continue
                available.add(work['source'])
                for page in work['parts']:
                    identifier = 'tafsir-' + sha(canonical([PROVIDER, work['source'], reference, work['snapshot_sha256'], page['part']]))
                    provenance = dict(provider_id=PROVIDER, source_id=PROVIDER+':'+work['source'],
                        source_work=work['work'], snapshot_sha256=work['snapshot_sha256'],
                        schema_sha256=packet['schema_sha256'], service_version_reported=packet['service_version'],
                        original_raw_text=page['original_raw_text'], original_raw_text_sha256=page['original_raw_text_sha256'],
                        attribution=page['attribution'], part=page['part'], total_parts=page['total_parts'],
                        anchor_evidence_id=anchor['id'], purpose='source_context', context_complete=False,
                        retrieval_transport=packet.get('delivery', 'snapshot'),
                        acquisition_transport=packet.get('acquisition_delivery', packet.get('delivery', 'snapshot')))
                    row = dict(snapshotKey=identifier, sourceId=PROVIDER+':'+work['source'],
                        sourceVersion=work['content_sha256'], sourceRole='tafsir_commentary', reference=reference,
                        originalText=page['original_text'], originalSha256=page['original_text_sha256'],
                        work=work['work'], author=page['attribution'], edition=None,
                        sourceUrl='https://mcp.tafsir.net/mcp', approvalStatus='pending', researchOnly=True,
                        parentSnapshotKey=anchor['id'], delivery=packet.get('delivery', 'snapshot'), retrievalModes=['exact'], provenance=provenance)
                    evidence[identifier] = row
                    for ordinal, note in enumerate(page['footnotes']):
                        if not note['text'].strip():
                            continue
                        nid = identifier + '-note-' + str(ordinal)
                        evidence[nid] = {**row, 'snapshotKey': nid, 'sourceRole': 'tafsir_footnote',
                            'originalText': note['text'], 'originalSha256': sha(note['text']),
                            'parentSnapshotKey': identifier,
                            'provenance': {**provenance, 'footnote_original': copy.deepcopy(note),
                                           'display_role': 'editorial_footnote_not_author_main_text'}}
        if 'moyassar' not in available:
            for record in self.store.reference(anchor['surah'], anchor['ayah'], 'tafsir_commentary'):
                row = self._evidence(record, purpose='source_context')
                if row:
                    row['parentSnapshotKey'] = anchor['id']
                    evidence[row['snapshotKey']] = row
                    available.add('moyassar')
        return dict(reference=reference, requestedWorks=list(WORKS), availableWorks=sorted(available),
            status='complete_transport' if available == set(WORKS) else 'partial' if available else 'unavailable',
            scholarlyContextComplete=False)

    def analyze(self, text, revision_id, related_references=()):
        if not isinstance(text, str) or not text.strip() or utf16_length(text) > 3000:
            raise ValueError('Paste 1..3000 UTF-16 code units of text')
        if not isinstance(revision_id, str):
            raise ValueError('Invalid revision UUID')
        if str(uuid.UUID(revision_id)) != revision_id.lower():
            raise ValueError('Invalid revision UUID')
        if not isinstance(related_references, (list, tuple)) or len(related_references) > 10:
            raise ValueError('At most ten related Quran references')
        related = []
        related_warnings = []
        for ref in related_references:
            if not isinstance(ref, str) or not re.fullmatch(r'[0-9]{1,3}:[0-9]{1,3}', ref):
                raise ValueError('Related reference must be a numeric Quran reference')
            records = self.store.reference(*map(int, ref.split(':')))
            if not records:
                related_warnings.append('Optional related Quran reference is unavailable in the pinned corpus: '+ref)
                continue
            related.append(records[0])
        normalized, offsets = normalized_with_offsets(text)
        self.live_context_deadline = time.monotonic() + 12.0
        self.context_attempted = set()
        spans, references, warnings = [], [], related_warnings
        quote_units = _quote_units(text, self.store.names, self.store.reference)
        locators = _bound_quran_locators(text, quote_units, self.store.names, self.store.reference)
        locator_units = set()

        def add(start, end, role, status, method, records=(), proposal=None, conflict=False):
            if start >= end:
                return
            spans.append(dict(a=start, b=end, role=role, roleStatus=status, method=method,
                              records=list(records), roleProposal=proposal, conflict=conflict))

        # Parse numeric ranges as one unresolved mention: never silently turn a
        # requested range into its first verse. int accepts Arabic-Indic digits.
        for m in NUMERIC.finditer(text):
            locator = locators.get((m.start(), m.end()))
            before = normalize(text[max(0,m.start()-60):m.start()])
            named_ids = [surah for name,surah in self.store.names.items()
                if re.search(r'(?<!\w)'+re.escape(name)+r'\s*$', before)]
            named = bool(named_ids)
            framed = _framing(text,m.start())=='ayah'
            bracketed = bool(re.search(r'[\[(]\s*$',text[max(0,m.start()-5):m.start()]))
            non_source = NON_SOURCE_NUMERIC.search(before+' '+normalize(text[m.end():m.end()+8])) or NON_SOURCE_RATIO.search(before)
            if non_source and not named:
                continue
            explicit = bool(locator) or named or framed or bracketed
            records = self.store.reference(int(m[1]), int(m[2])) if m[3] is None else []
            start, end = locator[:2] if locator else (m.start(), m.end())
            if locator:
                locator_units.add((start, end))
                method = 'bound_quran_bibliographic_locator'
            elif m[3]:
                method = 'range_requires_confirmation'
            else:
                method = 'explicit_numeric_reference' if explicit else 'ambiguous_numeric_reference'
            add(start, end, 'claimed_source', 'source_matched' if records and explicit else 'candidate' if records else 'unresolved',
                method, records, conflict=bool(named_ids and int(m[1]) not in named_ids))
            references.append((start, end, records if explicit else []))
            if records and not explicit:
                warnings.append('Bare numeric n:m is an ambiguous reference candidate; confirm its intended meaning before source-context retrieval.')
        for name, surah in self.store.names.items():
            pattern = re.compile(r'(?<!\w)' + re.escape(name) + r'\s+(?:الاية\s+|الايات\s+)?(\d{1,3})(?!\d|\s*:)')
            for m in pattern.finditer(normalized):
                a, b = offsets[m.start()], offsets[m.end()-1]+1
                heading = re.search(r'(?:^|\s)(سورة)\s+$', normalized[:m.start()])
                if heading:
                    a = offsets[heading.start(1)]
                if any(a < y and x < b for x, y, _ in references):
                    continue
                tail = re.match(r'\s*[-–]\s*\d{1,3}(?!\d)', text[b:])
                if tail:
                    b += tail.end()
                records = self.store.reference(surah, int(m[1])) if not tail else []
                add(a, b, 'claimed_source', 'source_matched' if records else 'unresolved',
                    'range_requires_confirmation' if tail else 'explicit_named_reference', records)
                references.append((a, b, records))
            # Editors also write "21 البقرة". Keep this identity as a mention,
            # without treating a nearby verse marker as a new quotation.
            reverse = re.compile(r'(?<!\w)(\d{1,3})\s+' + re.escape(name) + r'(?!\w)')
            for m in reverse.finditer(normalized):
                a, b = offsets[m.start()], offsets[m.end()-1]+1
                if any(a < y and x < b for x, y, _ in references):
                    continue
                records = self.store.reference(surah, int(m[1]))
                add(a, b, 'claimed_source', 'source_matched' if records else 'unresolved',
                    'explicit_number_first_named_reference', records)
                references.append((a, b, records))

        def attached_references(a, b):
            after = [(x, rows) for x, y, rows in references if 0 <= x-b <= 45
                     and not any(b <= u < x for u, v, _, _, _ in quote_units)]
            if after:
                return next(rows for _, rows in sorted(after))
            before = []
            for x, y, rows in references:
                if not 0 <= a-y <= 45:
                    continue
                # A citation immediately following the previous quotation
                # belongs to it even when the next quotation starts nearby.
                if any(v <= x and 0 <= x-v <= 45 for u, v, _, _, _ in quote_units):
                    continue
                if not any(y <= u < a for u, v, _, _, _ in quote_units):
                    before.append((y, rows))
            return max(before, default=(0, []), key=lambda row: row[0])[1]

        def marker_references(marker, outer_end):
            if marker is None:
                return []
            tail = normalize(text[outer_end:outer_end+65])
            surahs = {surah for name, surah in self.store.names.items()
                      if re.match(r'(?:(?:سورة|سوره)\s+)?' + re.escape(name) + r'(?:\s|$)', tail)}
            return self.store.reference(next(iter(surahs)), marker) if len(surahs) == 1 else []

        # Full verse matches remain source-owned regardless of an incompatible
        # preceding attribution. Short complete verses require visible framing.
        full_matches = []
        for record, view in self.verse_views:
            pos = 0
            while (pos := normalized.find(view, pos)) >= 0:
                end = pos + len(view)
                if (pos and normalized[pos-1] != ' ') or (end < len(normalized) and normalized[end] != ' '):
                    pos = end
                    continue
                a, b = offsets[pos], offsets[end-1]+1
                while b < len(text) and unicodedata.category(text[b]).startswith('M'):
                    b += 1
                proposal = _framing(text, a)
                if view in FORMULAE and proposal != 'ayah':
                    pos = end
                    continue
                if len(view.split()) >= 4 or proposal:
                    full_matches.append((a, b, record, proposal))
                pos = end
        for a, b, record, proposal in sorted(full_matches, key=lambda r: (-(r[1]-r[0]), r[0], r[2]['id'])):
            same = next((s for s in spans if s['a']==a and s['b']==b and s['role']=='ayah'), None)
            if same:
                if all(r['id'] != record['id'] for r in same['records']):
                    same['records'].append(record)
                    same['roleStatus'] = 'candidate'
            elif not any(a < s['b'] and s['a'] < b for s in spans):
                add(a, b, 'ayah', 'source_matched', 'complete_verse_search_match', [record], proposal, proposal=='matn')

        for a, b, hinted, marker, outer_end in quote_units:
            if (a, b) in locator_units:
                continue
            # A verse/footnote number is metadata, never quoted source wording.
            if not any(char.isalpha() for char in text[a:b]):
                continue
            proposal = _framing(text, a) or ('ayah' if hinted else None)
            if any(a<s['b'] and s['a']<b and s['role']=='claimed_source' for s in spans):
                # A reference embedded inside quotation marks remains a
                # separate source mention. Do not create a second overlapping
                # whole-quote annotation or silently drop a verified excerpt.
                cursor=a
                blockers=sorted((max(a,s['a']),min(b,s['b'])) for s in spans if a<s['b'] and s['a']<b)
                for start,end in blockers+[(b,b)]:
                    if start>cursor and text[cursor:start].strip():
                        add(cursor,start,'unclassified','unresolved',
                            'quote_reference_boundary_requires_confirmation',(),proposal)
                    cursor=max(cursor,end)
                warnings.append('Quotation contains a source reference; confirm its passage boundaries before literal comparison.')
                continue
            contained = [s for s in spans if a <= s['a'] and s['b'] <= b and s['role']=='ayah']
            nearby = marker_references(marker, outer_end) or attached_references(a, b)
            if contained:
                # A quote with extra/spliced words must be reviewed as a whole,
                # rather than hiding extra words behind a complete sub-verse.
                if len(contained)==1 and normalize(text[a:b]) == normalize(text[contained[0]['a']:contained[0]['b']]):
                    matched = [r for r in contained[0]['records'] if any(r['id'] == n['id'] for n in nearby)]
                    if matched:
                        contained[0]['records'] = matched
                        contained[0]['roleStatus'] = 'source_matched' if len(matched) == 1 else 'candidate'
                    elif nearby:
                        contained[0]['conflict'] = True
                    continue
                spans[:] = [s for s in spans if s not in contained]
            key = _quran_search_key(text[a:b])
            if key in FORMULAE and proposal != 'ayah' and not nearby:
                continue
            q = {}
            if len(key.split()) >= 3:
                for record, view in self.verse_views:
                    if _token_contains(view, key):
                        q[record['id']] = record
            omitted = {}
            if not q:
                for record, view in self.verse_views:
                    if ordered_omission(text[a:b], view):
                        omitted[record['id']] = record
                narrowed = {r['id']: omitted[r['id']] for r in nearby if r['id'] in omitted}
                if narrowed:
                    omitted = narrowed
            h = self.store.search(text[a:b], 'hadith_matn', 5) if not q and not omitted else []
            literal_h = [r for r in h if len(key.split()) >= 3 and _token_contains(r['search_key'], key)]
            if q:
                narrowed = {r['id']: q[r['id']] for r in nearby if r['id'] in q}
                if narrowed:
                    q = narrowed
                records = list(q.values())[:10]
                conflict = proposal == 'matn' or bool(nearby and all(r['id'] not in q for r in nearby))
                add(a, b, 'ayah', 'source_matched' if len(q)==1 else 'candidate', 'contiguous_quran_excerpt_search_match', records, proposal, conflict)
            elif len(omitted) == 1:
                record = next(iter(omitted.values()))
                conflict = proposal == 'matn' or bool(nearby and all(r['id'] != record['id'] for r in nearby))
                add(a, b, 'ayah', 'source_matched', 'unique_ordered_quran_candidate', [record], proposal, conflict)
            elif omitted:
                add(a, b, 'ayah', 'candidate', 'ambiguous_ordered_quran_candidates', list(omitted.values())[:10], proposal)
            elif len(nearby) == 1:
                # The exact identity of an explicitly cited Quran original
                # outranks a hadith field embedding that Quran wording. Unmatched
                # wording remains a candidate, with an explicit comparison to
                # the cited original rather than fabricated discovery certainty.
                add(a, b, 'ayah', 'candidate', 'explicit_quran_reference_comparison', nearby, proposal, proposal=='matn')
                spans[-1]['explicitComparator'] = True
            elif literal_h:
                add(a, b, 'matn', 'source_matched' if len(literal_h)==1 else 'candidate', 'hadith_matching_field_excerpt', literal_h, proposal, proposal=='ayah')
            else:
                records = nearby or (self.store.search(text[a:b], 'quran_text', 3) if proposal=='ayah' else h[:3])
                add(a, b, proposal or 'unclassified', 'candidate' if records else 'unresolved', 'quotation_lexical_candidates', records, proposal)
                # A unique explicit reference permits a literal comparison to
                # the cited original, while the quoted role remains tentative.
                # This does not confirm a claim/evidence interpretation pair.
                if len(nearby)==1 and re.search(r'[\u0621-\u064a\u066e-\u06d3]', text[a:b]):
                    spans[-1]['explicitComparator'] = True
        tokens = list(re.finditer(r'\S+', normalized))
        fragment_matches = {}
        for token_at in range(len(tokens)-3):
            words = tuple(t.group() for t in tokens[token_at:token_at+4])
            for record, source_words, source_at in self.fragment_index.get(words, ()):
                left, source_left = token_at, source_at
                right, source_right = token_at+4, source_at+4
                while left and source_left and tokens[left-1].group()==source_words[source_left-1]:
                    left -= 1
                    source_left -= 1
                while right<len(tokens) and source_right<len(source_words) and tokens[right].group()==source_words[source_right]:
                    right += 1
                    source_right += 1
                a, b = offsets[tokens[left].start()], offsets[tokens[right-1].end()-1]+1
                while b<len(text) and unicodedata.category(text[b]).startswith('M'):
                    b += 1
                if any(a<s['b'] and s['a']<b for s in spans):
                    continue
                proposal = _framing(text,a)
                # Common formulae do not become citations merely because the
                # same wording occurs in the Quran, including sub-fragments.
                is_formula = False
                for formula in FORMULAE:
                    position=normalized.find(formula)
                    while position>=0:
                        end=position+len(formula)
                        if position<=tokens[left].start() and tokens[right-1].end()<=end:
                            is_formula=True
                            break
                        position=normalized.find(formula,position+1)
                    if is_formula:
                        break
                if is_formula and proposal!='ayah':
                    continue
                fragment_matches.setdefault((a,b),{})[record['id']]=record
        for (a,b), records in sorted(fragment_matches.items(),key=lambda row: (-(row[0][1]-row[0][0]),row[0][0])):
            if any(a<s['b'] and s['a']<b for s in spans):
                continue
            proposal=_framing(text,a)
            add(a,b,'ayah','source_matched' if len(records)==1 else 'candidate',
                'embedded_quran_excerpt_search_match',list(records.values())[:10],proposal,proposal=='matn')
        # Bare pasted source passages need no quotation marks. Resolve only a
        # whole uncovered line with a substantial contiguous source match;
        # generic lexical hits do not turn everyday prose into citations.
        for line in re.finditer(r'[^\n]+', text):
            a, b = line.start(), line.end()
            while a < b and text[a].isspace():
                a += 1
            while b > a and text[b-1].isspace():
                b -= 1
            if any(a < s['b'] and s['a'] < b for s in spans):
                continue
            key = normalize(text[a:b])
            if len(key.split()) < 3 or len(key) < 15 or key in FORMULAE:
                continue
            records = {r['id']: r for r, view in self.verse_views if _token_contains(view, key)}
            if records:
                add(a, b, 'ayah', 'source_matched' if len(records)==1 else 'candidate',
                    'bare_quran_excerpt_search_match', list(records.values())[:10])
                continue
            h = self.store.search(text[a:b], 'hadith_matn', 5)
            matches = [r for r in h if _token_contains(r['search_key'], key)]
            if matches:
                add(a, b, 'matn', 'source_matched' if len(matches)==1 else 'candidate',
                    'bare_hadith_matching_field_excerpt', matches)
        # Unquoted narration and isnad cues are proposals, not source proof.
        # A named narrator followed by a prophetic attribution is a bounded
        # role proposal. Keep it separate from the quoted matn and never infer
        # a verified chain or authenticity from this syntactic cue.
        for m in re.finditer(r'(?<!\w)عن(?: \w+){1,12}? قال (?:قال )?رسول الله(?: صلي الله عليه وسلم)?', normalized):
            a, b = offsets[m.start()], offsets[m.end()-1]+1
            prefix = text[a:b]
            if re.search(r'[\n.؛!؟]', prefix) or any(a < s['b'] and s['a'] < b for s in spans):
                continue
            add(a, b, 'isnad', 'candidate', 'narrator_attribution_proposal', (), 'isnad')
        for m in re.finditer(r'(?:قال رسول الله|قال النبي|عن النبي)\s*[:：]?\s*([^\n]+)', text):
            a, b = m.start(1), m.end(1)
            if any(a < s['b'] and s['a'] < b for s in spans):
                continue
            if _framing(text,a)!='matn':
                continue
            records = self.store.search(text[a:b], 'hadith_matn', 3)
            add(a, b, 'matn', 'candidate' if records else 'unresolved', 'hadith_marker_lexical_candidates', records, 'matn')
        for m in re.finditer(r'(?:حدثنا|حدثني|أخبرنا|اخبرنا)\b[^\n]*', text):
            if not any(m.start() < s['b'] and s['a'] < m.end() for s in spans):
                add(m.start(), m.end(), 'isnad', 'candidate', 'isnad_marker_proposal', (), 'isnad')

        evidence = {}
        segments, quotations = [], []
        qanchors = {}
        for span in sorted(spans, key=lambda s: (s['a'], s['b'])):
            a, b = span['a'], span['b']
            source_keys = []
            for record in span['records']:
                row = self._evidence(record, 'lexical' if 'lexical' in span['method'] else 'exact')
                if row:
                    evidence[row['snapshotKey']] = row
                    source_keys.append(row['snapshotKey'])
                    if record['role']=='quran_text' and span['roleStatus']=='source_matched':
                        qanchors[record['reference']] = record
            status = span['roleStatus'] if source_keys or span['role']=='isnad' else 'unresolved'
            segment_id = 'intake-' + sha(canonical([sha(text), a, b, span['role'], span['method']]))
            segments.append(dict(id=segment_id, startOffset=utf16_length(text[:a]), endOffset=utf16_length(text[:b]),
                codePointStart=a, codePointEnd=b, originalText=text[a:b], role=span['role'], roleStatus=status,
                method=span['method'], sourceKeys=source_keys, roleProposal=span['roleProposal'], conflict=span['conflict']))
            if span['conflict']:
                warnings.append('Source match conflicts with the supplied attribution or nearby reference; inspect the original.')
            if span['role']=='claimed_source' or span['role']=='isnad':
                continue
            # Lexical discovery is never a resolved quotation comparator.
            resolved = len(source_keys)==1 and (status=='source_matched' or span.get('explicitComparator', False))
            record = span['records'][0] if resolved else None
            auxiliary = next((view for view in record['metadata'].get('auxiliary_search_views', [])
                if view.get('field') == 'publisher imlai original'), None) if record and record['role'] == 'quran_text' else None
            comparator_metadata = {'comparator_version': COMPARATOR_VERSION,
                'original_sha256': record['text_sha256']} if record else None
            if record and record['role'] == 'quran_text' and (
                    re.search(r'\buthmani\b', str(record['metadata'].get('edition', '')), re.I)
                    or re.fullmatch(r'tanzil-uthmani-v[0-9.]+', str(record['metadata'].get('source_id', '')))):
                comparator_metadata['canonical_orthography'] = 'uthmani'
            comparison = compare_quotation(text[a:b], record['original_text'] if record else None,
                comparator_metadata,
                auxiliary_imlai=auxiliary)
            quote_status = 'unresolved'
            matched = []
            if comparison['raw_full_match']:
                quote_status='exact'
            elif comparison['normalized_full_match'] or comparison['nfc_full_match']:
                quote_status='normalized'
            elif comparison['status']=='partial_token_excerpt_requires_review':
                # A substring inside a source token is a literal mismatch,
                # even when lossy search has identified a unique source.
                quote_status='mismatch'
            elif 'repeated_excerpt_ambiguous' in comparison['flags']:
                # The existing single-range contract cannot represent several
                # source locations without implying a confirmed alignment.
                quote_status='unresolved'
            elif comparison['status'] in {'exact_contiguous_excerpt',
                    'canonically_equivalent_contiguous_excerpt',
                    'contiguous_excerpt_under_declared_typography_rules'}:
                quote_status='partial'
                matched = comparison['exact_contiguous_source_spans'] or comparison['contiguous_source_spans'] or comparison['nfc_contiguous_source_spans']
            elif resolved:
                quote_status='mismatch'
            quotations.append(dict(segmentId=segment_id, evidenceKey=source_keys[0] if resolved else None,
                status=quote_status, reason=comparison['status']+'; '+','.join(comparison['flags'])+'; normalized search discovery is separate from original quotation comparison.',
                matchedStart=utf16_length(record['original_text'][:matched[0]['start']]) if matched else None,
                matchedEnd=utf16_length(record['original_text'][:matched[0]['end']]) if matched else None,
                comparison=comparison['comparison']))
        covered = sorted((s['codePointStart'], s['codePointEnd']) for s in segments)
        cursor = 0
        for a, b in covered+[(len(text), len(text))]:
            if a > cursor and text[cursor:a].strip():
                segment_id='intake-'+sha(canonical([sha(text),cursor,a,'author_text']))
                segments.append(dict(id=segment_id, startOffset=utf16_length(text[:cursor]), endOffset=utf16_length(text[:a]),
                    codePointStart=cursor, codePointEnd=a, originalText=text[cursor:a], role='author_text', roleStatus='unresolved',
                    method='uncovered_original_text', sourceKeys=[], roleProposal=None, conflict=False))
            cursor=max(cursor,b)
        # Required input/source matches fail closed if they exceed the contract.
        # Advisory related passages/context may consume only remaining budget.
        if len(segments)>80 or len(evidence)>MAX_EVIDENCE_ROWS or len(quotations)>80:
            raise ValueError('Intake packet exceeds bounded short-post candidate budget')
        def fits(rows):
            return len(rows)<=MAX_EVIDENCE_ROWS and len(canonical(list(rows.values())).encode('utf-8'))<=MAX_OPTIONAL_EVIDENCE_BYTES
        coverage=[]
        contexted=set()
        def add_context(anchor):
            if anchor['reference'] in contexted:
                return
            if len(coverage)>=MAX_CONTEXT_ROWS:
                warnings.append('Optional Tafsir context omitted because the context-reference budget is exhausted.')
                return
            candidate=dict(evidence)
            entry=self._context(anchor,candidate)
            # Commit a whole source work including all its footnotes, or none.
            # This preserves note parents and does not claim complete transport
            # after clipping a page or dropping one part of the same work.
            for work in entry['availableWorks']:
                addition={key:row for key,row in candidate.items() if key not in evidence
                    and row['reference']==anchor['reference'] and row['work']==WORKS[work]}
                proposed={**evidence,**addition}
                if fits(proposed):
                    evidence.update(addition)
                else:
                    warnings.append('Optional Tafsir work omitted because the remaining packet budget is exhausted: '+anchor['reference']+' '+work)
            entry['availableWorks']=[work for work in entry['availableWorks'] if any(
                row['sourceRole']=='tafsir_commentary' and row['reference']==anchor['reference'] and row['work']==WORKS[work]
                for row in evidence.values())]
            entry['status']='complete_transport' if set(entry['availableWorks'])==set(WORKS) else 'partial' if entry['availableWorks'] else 'unavailable'
            coverage.append(entry)
            contexted.add(anchor['reference'])
        # The context of a source actually present in the draft outranks any
        # optional theme catalog enrichment.
        for anchor in qanchors.values():
            add_context(anchor)
        for record in related:
            row = self._evidence(record, purpose='related_context_candidate')
            if row:
                candidate={**evidence, row['snapshotKey']:evidence.get(row['snapshotKey'],row)}
                if not fits(candidate):
                    warnings.append('Optional related Quran evidence omitted because the remaining packet budget is exhausted: '+record['reference'])
                    continue
                evidence.update(candidate)
                add_context(record)
        if not self.research_preview:
            warnings.append('Pending research sources are unavailable under production source policy; operator research preview is disabled.')
        if any(r['sourceRole']=='hadith_matn' for r in evidence.values()):
            warnings.append('Hadith research-corpus internal identifiers are not canonical numbering or authenticity grades.')
        if len(segments)>80 or len(evidence)>80 or len(quotations)>80 or len(coverage)>30:
            raise ValueError('Intake packet exceeds bounded short-post candidate budget')
        return dict(schemaVersion=1, pipelineVersion=VERSION, revisionId=revision_id,
            revisionSha256=sha(text), corpusVersion=self.store.manifest['corpus_fingerprint'], originalText=text,
            offsetUnit='utf16_code_unit', segments=sorted(segments,key=lambda s:(s['startOffset'],s['endOffset'])),
            evidence=list(evidence.values()), quotationFindings=quotations, contextCoverage=coverage,
            warnings=list(dict.fromkeys(warnings))[:40], researchOnly=any(r['researchOnly'] for r in evidence.values()))
