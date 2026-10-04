"""Source-bound quotation fidelity. None of these outcomes establishes authenticity."""
import difflib
import hashlib
import re
import unicodedata as ud

REMOVED_MARKS = frozenset(map(chr, range(0x064B, 0x0653))) | frozenset(map(chr, range(0x06D6, 0x06DC)))
NEGATION = frozenset({'لا', 'لم', 'لن', 'ليس', 'ليست', 'ما', 'ولا', 'فلا', 'ولم', 'فلم', 'ولن', 'فلن'})
NORMALIZATION = {
    'removed_mark_codepoints': [f'U+{ord(c):04X}' for c in sorted(REMOVED_MARKS)],
    'tatweel': 'ignored in typography comparison only',
    'punctuation': 'Unicode P* becomes token separators',
    'whitespace': 'token separators',
    'letter_folding': 'none; alef/maqsurah/wasla distinctions retained',
    'canonical_equivalence': 'NFC separately reported; typography tokens also use NFC',
    'preserved_marks': 'combining hamza/madda, dagger alef, other unlisted marks',
}

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

def compare_quotation(quote, source_text, comparator_metadata=None):
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
    changed = {t['token'] for x in result['token_diff'] if x['operation'] != 'equal' for t in x['source_tokens'] + x['quote_tokens']}
    if changed & NEGATION:
        result['flags'].append('negation_token_changed')
    if max(len(raw_spans), len(nfc_spans), len(spans)) > 1:
        result['flags'].append('repeated_excerpt_ambiguous')
    result['diff_alignment'] = 'First contiguous token candidate when available, otherwise deterministic SequenceMatcher; repeated candidates remain ambiguous'
    return result
