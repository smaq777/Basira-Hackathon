"""Source-bound quotation fidelity. None of these outcomes establishes authenticity."""
import difflib
import hashlib
import re
import unicodedata as ud

REMOVED_MARKS = frozenset(map(chr, range(0x064B, 0x0653))) | frozenset(map(chr, range(0x06D6, 0x06DC)))
NEGATION = frozenset({'لا', 'لم', 'لن', 'ليس', 'ليست', 'ما', 'ولا', 'فلا', 'ولم', 'فلم', 'ولن', 'فلن'})
VERSION = 'quotation-fidelity-2.0'
NORMALIZATION = {
    'removed_mark_codepoints': [f'U+{ord(c):04X}' for c in sorted(REMOVED_MARKS)],
    'tatweel': 'ignored in typography comparison only',
    'punctuation': 'Unicode P* becomes token separators',
    'whitespace': 'token separators',
    'letter_folding': 'none; alef/maqsurah/wasla distinctions retained',
    'canonical_equivalence': 'NFC separately reported; typography tokens also use NFC',
    'preserved_marks': 'combining hamza/madda, dagger alef, other unlisted marks',
}


def _script_pattern(token, *, verify_auxiliary=False):
    """Limited Uthmani presentation rules, never the lossy search normalizer.

    Hamza, precomposed madda and lexical letters remain significant. Maqsurah
    substitution is allowed only when checking the independently pinned edition;
    user text may then use that exact auxiliary spelling, not arbitrary folding.
    """
    result, previous = [], ''
    elongated_negation = ''.join(c for c in token if c not in REMOVED_MARKS and c != '\u0640') == 'لا\u0653'
    for char in token:
        if char in REMOVED_MARKS or char == '\u0640':
            continue
        if char == '\u0670':
            result.append('ا?')
        elif char == '\u0671':
            result.append('ا')
        elif char == '\u0653' and (elongated_negation or previous in '\u06e5\u06e6'):
            pass  # Quranic elongation sign, not the lexical letter آ.
        elif char in '\u06e2\u06e3\u06e6\u06e7\u06e8':
            pass  # Explicitly listed Quranic recitation signs.
        elif char == 'ى' and verify_auxiliary:
            result.append('[ىي]')
        elif char in 'أإؤئء' and verify_auxiliary:
            result.append('[أإؤئء]')  # Hamza is retained; only its seat may differ.
        else:
            result.append(re.escape(char))
        if not ud.combining(char):
            previous = char
    return ''.join(result)


def _verified_auxiliary(source_tokens, auxiliary):
    if auxiliary is None:
        return None
    required = ('text', 'sha256', 'source_id', 'source_version', 'field')
    if not isinstance(auxiliary, dict) or any(not isinstance(auxiliary.get(k), str) or not auxiliary[k] for k in required):
        return None
    if _sha(auxiliary['text']) != auxiliary['sha256']:
        raise ValueError('Auxiliary comparator hash mismatch')
    if auxiliary['field'] != 'publisher imlai original':
        return None
    tokens = _tokens(auxiliary['text'])
    if len(tokens) != len(source_tokens) or not tokens:
        return None
    if not all(re.fullmatch(_script_pattern(s['original'], verify_auxiliary=True), a['token'])
               for s, a in zip(source_tokens, tokens)):
        return None
    return tokens


def _public_comparison(result, source_tokens, quote_tokens, auxiliary_used=False, source_text=''):
    unresolved = result['status'] in {'source_unmatched', 'quote_empty', 'source_empty'} or 'repeated_excerpt_ambiguous' in result['flags']
    if unresolved:
        return dict(fidelity='unresolved', extent='unknown', differences=[], basis='none')
    faithful = result['normalized_contiguous_match'] or result['nfc_contiguous_match'] or result['raw_contiguous_match']
    if result['status'] == 'partial_token_excerpt_requires_review':
        faithful = False
    fidelity = ('exact' if result['raw_contiguous_match'] else 'orthographic') if faithful else 'different'
    full = result['raw_full_match'] or result['nfc_full_match'] or result['normalized_full_match']
    extent = 'full' if full else 'gapped' if result['omissions']['internal'] else 'excerpt' if faithful else 'unknown'
    if not faithful and extent == 'unknown' and any(op['operation'] == 'equal' for op in result['token_diff']):
        extent = 'excerpt' if result['omissions']['leading'] or result['omissions']['trailing'] else 'full'
    differences = []
    for op in result['token_diff']:
        kind = {'replace': 'replace', 'delete': 'omit', 'insert': 'insert'}.get(op['operation'])
        if kind is None or (kind == 'omit' and op.get('omission_location') != 'internal'):
            continue
        q, s = op['quote_tokens'], op['source_tokens']
        differences.append(dict(kind=kind,
            quotedText=result['quote_original'][q[0]['start']:q[-1]['end']] if q else '',
            sourceText=source_text[s[0]['start']:s[-1]['end']] if s else ''))
    # A within-word substring must never inherit raw-contiguous fidelity.
    if result['status'] == 'partial_token_excerpt_requires_review' and not differences:
        differences = [dict(kind='replace', quotedText=result['quote_original'], sourceText=' '.join(t['original'] for t in source_tokens))]
    return dict(fidelity=fidelity, extent=extent, differences=differences[:80],
                basis='canonical' if fidelity == 'exact' else 'auxiliary_imlai' if auxiliary_used else 'typography' if faithful else 'canonical')

def _sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def _occurrences(text, needle):
    if not needle:
        return []
    starts, position = [], 0
    while (position := text.find(needle, position)) >= 0:
        starts.append(position)
        position += 1
    return starts

def _tokens(text):
    chars, offsets = [], []
    for offset, char in enumerate(text):
        if char in REMOVED_MARKS or char == '\u0640':
            continue
        chars.append(' ' if char.isspace() or ud.category(char).startswith('P') else char)
        offsets.append(offset)
    result = []
    for match in re.finditer(r'\S+', ''.join(chars)):
        start, end = offsets[match.start()], offsets[match.end() - 1] + 1
        while end < len(text) and (text[end] in REMOVED_MARKS or text[end] == '\u0640'):
            end += 1
        result.append({'token': ud.normalize('NFC', match.group()), 'start': start, 'end': end, 'original': text[start:end]})
    return result

def _canonical_spans(quote, source):
    # NFD makes canonical reordering/composition searchable while each decomposed
    # character retains its source offset. Final NFC slice equality rejects a
    # match inside just part of a composed character (e.g. ا inside أ).
    pairs = [(char, i) for i, original in enumerate(source) for char in ud.normalize('NFD', original)]
    ordered, marks = [], []
    for pair in pairs:
        if ud.combining(pair[0]):
            marks.append(pair)
        else:
            ordered.extend(sorted(marks, key=lambda p: ud.combining(p[0])))
            marks = []
            ordered.append(pair)
    ordered.extend(sorted(marks, key=lambda p: ud.combining(p[0])))
    normalized = ''.join(p[0] for p in ordered)
    assert normalized == ud.normalize('NFD', source)
    needle = ud.normalize('NFD', quote)
    result, seen = [], set()
    for i in _occurrences(normalized, needle):
        positions = [p[1] for p in ordered[i:i + len(needle)]]
        start, end = min(positions), max(positions) + 1
        if (start, end) not in seen and ud.normalize('NFC', source[start:end]) == ud.normalize('NFC', quote):
            seen.add((start, end))
            result.append({'start': start, 'end': end, 'original': source[start:end]})
    return result

def compare_quotation(quote, source_text, comparator_metadata=None, *, auxiliary_imlai=None):
    """Compare one quote against one already resolved original source string.

    Offsets are zero-based Unicode codepoints with exclusive ends. Separate
    orthographic editions must be separate calls, never rewritten originals.
    """
    if not isinstance(quote, str) or (source_text is not None and not isinstance(source_text, str)):
        raise TypeError('quote and resolved source must be strings (source may be None)')
    if comparator_metadata is not None and not isinstance(comparator_metadata, dict):
        raise TypeError('comparator_metadata must be a dictionary or None')
    result = dict(quote_original=quote, quote_sha256=_sha(quote), comparator_metadata=dict(comparator_metadata or {}), normalization=dict(NORMALIZATION), offsets_unit='zero-based Unicode codepoints; end exclusive', religious_authenticity='not_assessed', raw_full_match=None, raw_contiguous_match=None, exact_contiguous_source_spans=[], nfc_full_match=None, nfc_contiguous_match=None, nfc_contiguous_source_spans=[], normalized_full_match=None, normalized_contiguous_match=None, contiguous_source_spans=[], token_diff=[], omissions={'leading': [], 'internal': [], 'trailing': []}, flags=[])
    if source_text is None:
        result.update(status='source_unmatched', flags=['source_unmatched'])
        result['comparison'] = _public_comparison(result, [], [])
        return result
    source_sha = _sha(source_text)
    declared_sha = result['comparator_metadata'].get('original_sha256') or result['comparator_metadata'].get('source_sha256')
    if declared_sha is not None and declared_sha != source_sha:
        raise ValueError('Comparator original hash mismatch')
    result['source_sha256'] = source_sha
    raw_spans = [{'start': i, 'end': i + len(quote), 'original': source_text[i:i + len(quote)]} for i in _occurrences(source_text, quote)]
    nfc_spans = _canonical_spans(quote, source_text) if quote else []
    st, qt = _tokens(source_text), _tokens(quote)
    sw, qw = [t['token'] for t in st], [t['token'] for t in qt]
    auxiliary = _verified_auxiliary(st, auxiliary_imlai)
    if auxiliary:
        sw = [t['token'] for t in auxiliary]
        # Token spelling variants can be aliased only to a unique aligned word.
        # This preserves token count, negation and every substantive letter.
        qw = []
        for token in qt:
            candidates = {a['token'] for s, a in zip(st, auxiliary)
                          if token['token'] == a['token'] or re.fullmatch(_script_pattern(s['original']), token['token'])}
            qw.append(next(iter(candidates)) if len(candidates) == 1 else token['token'])
        result['comparator_metadata']['auxiliary_imlai'] = {k: auxiliary_imlai[k] for k in ('sha256', 'source_id', 'source_version', 'field')}
        result['comparator_metadata']['auxiliary_rules_version'] = VERSION
    matches = [i for i in range(len(sw) - len(qw) + 1) if qw and sw[i:i + len(qw)] == qw]
    spans = [{'start': st[i]['start'], 'end': st[i + len(qw) - 1]['end'], 'original': source_text[st[i]['start']:st[i + len(qw) - 1]['end']], 'token_range': [i, i + len(qw)]} for i in matches]
    if matches:
        # Choose a genuinely contiguous alignment rather than a fragmented
        # SequenceMatcher alignment; retain all candidate spans for ambiguity.
        i, j = matches[0], matches[0] + len(qw)
        ops = ([('delete', 0, i, 0, 0)] if i else []) + [('equal', i, j, 0, len(qw))] + ([('delete', j, len(sw), len(qw), len(qw))] if j < len(sw) else [])
    else:
        ops = difflib.SequenceMatcher(a=sw, b=qw, autojunk=False).get_opcodes()
    for op, a, b, c, d in ops:
        entry = {'operation': op, 'source_token_range': [a, b], 'quote_token_range': [c, d], 'source_tokens': st[a:b], 'quote_tokens': qt[c:d]}
        if op == 'delete':
            location = 'leading' if a == 0 else 'trailing' if b == len(sw) else 'internal'
            entry['omission_location'] = location
            result['omissions'][location].append(entry)
        result['token_diff'].append(entry)
    result.update(raw_full_match=bool(quote) and quote == source_text, raw_contiguous_match=bool(raw_spans), exact_contiguous_source_spans=raw_spans, nfc_full_match=bool(quote) and ud.normalize('NFC', quote) == ud.normalize('NFC', source_text), nfc_contiguous_match=bool(nfc_spans), nfc_contiguous_source_spans=nfc_spans, normalized_full_match=bool(qw) and qw == sw, normalized_contiguous_match=bool(spans), contiguous_source_spans=spans)
    if not quote or not qw:
        status = 'quote_empty'
    elif not source_text:
        status = 'source_empty'
    elif result['raw_full_match']:
        status = 'exact_full_original'
    elif result['nfc_full_match']:
        status = 'canonically_equivalent_full_original'
    elif result['normalized_full_match']:
        status = 'full_match_under_declared_typography_rules'
    elif (raw_spans or nfc_spans) and not spans:
        status = 'partial_token_excerpt_requires_review'
        result['flags'].append('partial_token_boundary')
    elif raw_spans:
        status = 'exact_contiguous_excerpt'
    elif nfc_spans:
        status = 'canonically_equivalent_contiguous_excerpt'
    elif spans:
        status = 'contiguous_excerpt_under_declared_typography_rules'
    elif result['omissions']['internal']:
        status = 'internal_omission_requires_review'
    else:
        status = 'lexical_change_requires_review'
    result['status'] = status
    if not result['raw_full_match']:
        result['flags'].append('not_raw_full_original')
    if 'excerpt' in status:
        result['flags'].append('not_full_source')
    if result['omissions']['internal']:
        result['flags'].append('internal_omission')
    changes = [x for x in result['token_diff'] if x['operation'] in {'insert', 'replace'}]
    if changes:
        result['flags'].append('lexical_difference')
    changed = {t['token'] for x in result['token_diff'] if x['operation'] != 'equal'
               and x.get('omission_location') not in {'leading', 'trailing'}
               for t in x['source_tokens'] + x['quote_tokens']}
    if changed & NEGATION:
        result['flags'].append('negation_token_changed')
    if max(len(raw_spans), len(nfc_spans), len(spans)) > 1:
        result['flags'].append('repeated_excerpt_ambiguous')
    result['diff_alignment'] = 'First contiguous token candidate when available, otherwise deterministic SequenceMatcher; repeated candidates remain ambiguous'
    result['comparison'] = _public_comparison(result, st, qt, bool(auxiliary), source_text)
    return result
