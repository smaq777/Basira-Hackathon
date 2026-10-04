"""Offline evidence dossier. Matching/retrieval never establishes claim support."""
import argparse
import hashlib
import html
import json
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

VERSION = 'evidence-pipeline-1.2'
ROOT = Path(__file__).resolve().parents[1]
ALEF = str.maketrans({'أ':'ا', 'إ':'ا', 'آ':'ا', 'ٱ':'ا', 'ى':'ي'})

def sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def normalized_with_offsets(text):
    """Lossy search key only; offsets always refer to the untouched input."""
    chars, offsets = [], []
    for i, char in enumerate(text):
        if unicodedata.category(char).startswith('M') or char == 'ـ':
            continue
        char = char.translate(ALEF).lower()
        if char.isalnum():
            chars.append(char); offsets.append(i)
        elif chars and chars[-1] != ' ':
            chars.append(' '); offsets.append(i)
    if chars and chars[-1] == ' ':
        chars.pop(); offsets.pop()
    return ''.join(chars), offsets

def normalize(text):
    return normalized_with_offsets(text)[0]

def quran_body_for_search(original):
    """Drop only the supplied terminal font-marker from a derived search view."""
    if '\u00a0' in original:
        body,marker=original.rsplit('\u00a0',1)
        if marker and all(0xFC00<=ord(c)<=0xFDFF for c in marker):
            return body
    return original

def row_record(row):
    result = dict(row)
    result['metadata'] = json.loads(result.pop('metadata_json'))
    return result

class EvidenceStore:
    def __init__(self, database):
        self.database = Path(database)
        if not self.database.is_file():
            raise ValueError('Build the local index first')
        manifest_path=self.database.with_suffix('.manifest.json')
        file_manifest=None
        if manifest_path.is_file():
            file_manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
            actual=hashlib.sha256(self.database.read_bytes()).hexdigest()
            if actual!=file_manifest['database_sha256']:
                raise ValueError('Index snapshot integrity mismatch')
        self.db = sqlite3.connect(f'{self.database.resolve().as_uri()}?mode=ro', uri=True)
        self.db.row_factory = sqlite3.Row
        self.manifest = json.loads(self.db.execute('SELECT value FROM settings WHERE key=?', ('manifest',)).fetchone()[0])
        if file_manifest and file_manifest['corpus_fingerprint']!=self.manifest['corpus_fingerprint']:
            self.db.close();raise ValueError('Index corpus fingerprint mismatch')
        self.verses = [row_record(r) for r in self.db.execute("SELECT * FROM records WHERE role='quran_text'")]
        self.verse_search_views=[]
        for r in self.verses:
            keys=[r['search_key'],normalize(quran_body_for_search(r['original_text']))]
            for view in r['metadata'].get('auxiliary_search_views',[]):
                if sha(view['text'])!=view['sha256']:
                    self.db.close();raise ValueError('Auxiliary search view integrity mismatch')
                keys.append(normalize(view['text']))
            self.verse_search_views.extend((r,key) for key in dict.fromkeys(keys))
        self.names = {normalize(r['metadata'].get('surah_name', '')): r['surah'] for r in self.verses}
        self.names.pop('', None)

    def close(self):
        self.db.close()

    def get(self, identifier):
        row = self.db.execute('SELECT * FROM records WHERE id=?', (identifier,)).fetchone()
        return row_record(row) if row else None

    def reference(self, surah, ayah, role='quran_text'):
        return [row_record(r) for r in self.db.execute('SELECT * FROM records WHERE role=? AND surah=? AND ayah=?', (role, surah, ayah))]

    def search(self, text, role=None, top_k=5):
        if not 1 <= top_k <= 20:
            raise ValueError('top_k must be 1..20')
        words = list(dict.fromkeys(normalize(text).split()))[:32]
        if not words:
            return []
        # User text is never interpreted as FTS syntax or SQL.
        query = ' OR '.join('"' + w.replace('"','""') + '"' for w in words)
        sql = 'SELECT r.*, bm25(search) AS retrieval_score FROM search JOIN records r ON r.id=search.id WHERE search MATCH ?'
        params = [query]
        if role:
            if role not in {'quran_text','tafsir_commentary','hadith_matn'}:
                raise ValueError('Unknown source role')
            sql += ' AND r.role=?'; params.append(role)
        sql += ' ORDER BY retrieval_score, r.id LIMIT ?'; params.append(top_k)
        return [row_record(r) for r in self.db.execute(sql, params)]

    def context(self, record, neighbors=1):
        output = [record]
        if record['role'] == 'quran_text':
            # Neighbor verses are optional context, never a completeness claim.
            for ayah in range(max(1, record['ayah']-neighbors), record['ayah']+neighbors+1):
                if ayah != record['ayah']:
                    output.extend(self.reference(record['surah'], ayah))
            output.extend(self.reference(record['surah'], record['ayah'], 'tafsir_commentary'))
        # Hadith internal IDs are not used as canonical references or adjacency.
        return [self.evidence(r) for r in output]

    @staticmethod
    def evidence(record):
        original = record['original_text']
        if sha(original) != record['text_sha256']:
            raise ValueError('Corrupt stored evidence')
        if sha(record['search_original'])!=record['search_sha256'] or normalize(record['search_original'])!=record['search_key']:
            raise ValueError('Corrupt stored matching field')
        return {'id':record['id'], 'role':record['role'], 'reference':record['reference'],
                'original_text':original, 'original_sha256':record['text_sha256'],
                'matching_text':record['search_original'], 'matching_text_sha256':record['search_sha256'],
                'metadata':record['metadata'], 'context_complete':False,
                'human_review_required':True, 'claim_support':'not_evaluated'}

    def route(self, text):
        if not isinstance(text, str) or not text.strip() or len(text) > 100_000:
            raise ValueError('Paste 1..100000 characters of text')
        key, offsets = normalized_with_offsets(text)
        spans = []
        for record,verse_key in self.verse_search_views:
            if len(verse_key.split()) < 4:
                continue
            start = 0
            while True:
                at = key.find(verse_key, start)
                if at < 0:
                    break
                end = at+len(verse_key); start = end
                if (at and key[at-1] != ' ') or (end < len(key) and key[end] != ' '):
                    continue
                a, b = offsets[at], offsets[end-1]+1
                # Include combining marks that belong to the last visible letter.
                while b < len(text) and unicodedata.category(text[b]).startswith('M'):
                    b += 1
                hit = next((s for s in spans if s['start']==a and s['end']==b), None)
                if hit:
                    if record['id'] not in hit['candidate_ids']:hit['candidate_ids'].append(record['id'])
                else:
                    spans.append({'start':a,'end':b,'role':'quran_quote','method':'complete_verse_normalized_match', 'candidate_ids':[record['id']]})
        # Overlapping complete verses can occur. Retain longest, disallow hidden duplication.
        selected = []
        for span in sorted(spans, key=lambda s: (-(s['end']-s['start']), s['start'])):
            if not any(span['start']<s['end'] and s['start']<span['end'] for s in selected):
                selected.append(span)
        # Explicit reference mentions recover sources without implying the surrounding claim matches.
        for match in re.finditer(r'(?<!\d)(\d{1,3})\s*[:：]\s*(\d{1,3})(?!\d)', text):
            refs = self.reference(int(match[1]), int(match[2]))
            selected.append({'start':match.start(),'end':match.end(),'role':'reference_mention','method':'numeric_surah_ayah','candidate_ids':[r['id'] for r in refs]})
        for name, surah in self.names.items():
            pattern = re.compile(r'(?<!\w)'+re.escape(name)+r'\s+(\d{1,3})(?!\d)')
            for match in pattern.finditer(key):
                refs = self.reference(surah, int(match[1]))
                a,b=offsets[match.start()],offsets[match.end()-1]+1
                if not any(a==s['start'] and b==s['end'] for s in selected):
                    selected.append({'start':a,'end':b,'role':'reference_mention','method':'named_surah_ayah','candidate_ids':[r['id'] for r in refs]})
        # Delimited passages without a complete match remain candidates, including truncated quotations.
        for match in re.finditer(r'﴿([^﴿﴾]+)﴾|«([^«»]+)»', text):
            group = 1 if match[1] is not None else 2
            a,b=match.start(group),match.end(group)
            if any(s['start']>=a and s['end']<=b and s['role']=='quran_quote' for s in selected):
                continue
            role = 'quran_quote_candidate' if group==1 else 'quoted_passage_unresolved'
            source_role='quran_text' if group==1 else None
            candidates=self.search(text[a:b],source_role)
            selected.append({'start':a,'end':b,'role':role,'method':'delimited_lexical_discovery','candidate_ids':[r['id'] for r in candidates]})
        # Hadith marker routing is a hint. Exact matching against the research corpus is separately reported.
        for match in re.finditer(r'(?:قال رسول الله|قال النبي|عن النبي|حديث)\s*[:：]?[^\n]*', text):
            if any(s['start']<match.end() and match.start()<s['end'] for s in selected):
                continue
            candidates=self.search(match[0],'hadith_matn')
            selected.append({'start':match.start(),'end':match.end(),'role':'hadith_candidate','method':'marker_plus_lexical_discovery','candidate_ids':[r['id'] for r in candidates]})
        # Preserve uncovered author text as unclassified; don't claim a trained rhetorical role classifier.
        covered=sorted((s['start'],s['end']) for s in selected); cursor=0
        for a,b in covered+[(len(text),len(text))]:
            if a>cursor and text[cursor:a].strip():
                selected.append({'start':cursor,'end':a,'role':'author_text_unclassified','method':'uncovered_original_text','candidate_ids':[]})
            cursor=max(cursor,b)
        return sorted(selected,key=lambda s:(s['start'],s['end']))

    def dossier(self, text, cache_directory=None):
        started=time.perf_counter()
        revision=sha(text)
        binding={'revision_sha256':revision,'pipeline_version':VERSION,'corpus_fingerprint':self.manifest['corpus_fingerprint']}
        cache_key=sha(canonical(binding)); cache=None
        if cache_directory:
            folder=Path(cache_directory); folder.mkdir(parents=True,exist_ok=True); cache=folder/(cache_key+'.json')
            if cache.is_file():
                result=json.loads(cache.read_text(encoding='utf-8'))
                envelope=result.pop('_cache_integrity_sha256',None)
                if envelope!=sha(canonical(result)) or any(result[k]!=v for k,v in binding.items()) or result.get('original_input')!=text:
                    raise ValueError('Cache identity or integrity mismatch')
                result['cache_hit']=True
                return result
        segments=[]; evidence={}
        for span in self.route(text):
            ids=span.pop('candidate_ids'); candidate_details=[]
            for identifier in ids:
                r=self.get(identifier); original_segment=text[span['start']:span['end']]
                comparison='reference_or_lexical_candidate'
                if original_segment==r['search_original']:comparison='exact_matching_field'
                elif normalize(original_segment)==r['search_key']:comparison='search_normalized_complete'
                elif r['role']=='quran_text' and normalize(original_segment)==normalize(quran_body_for_search(r['original_text'])):comparison='normalized_original_uthmani_body'
                elif any(normalize(original_segment)==normalize(view['text']) for view in r['metadata'].get('auxiliary_search_views',[])):comparison='normalized_auxiliary_search_field'
                candidate_details.append({'id':identifier,'reference':r['reference'],'role':r['role'],'comparison':comparison})
                # Only resolved-reference/full-Quran matches automatically expand; discovery gets source record only.
                contexts=self.context(r) if span['role'] in {'quran_quote','reference_mention'} and len(ids)==1 else [self.evidence(r)]
                for ev in contexts:evidence[ev['id']]=ev
            segments.append({**span,'original_text':text[span['start']:span['end']], 'candidates':candidate_details,
                'status':'unique_normalized_match' if span['role']=='quran_quote' and len(ids)==1 else 'reference_resolved' if span['role']=='reference_mention' and len(ids)==1 else 'ambiguous_or_discovery' if ids else 'unresolved',
                'human_review_required':True})
        result={**binding,'schema_version':1,'original_input':text,'segments':segments,'evidence':list(evidence.values()),
            'claim_support':'not_evaluated','publication_approved':False,'human_review_required':True,
            'research_only':True,'cache_hit':False,'wall_seconds':round(time.perf_counter()-started,6),
            'limits':['Rule-based routing; incomplete quotations and semantic paraphrases need review.',
                'Text matching and retrieved tafsir do not establish claim support or complete context.',
                'Hadith corpus internal IDs are not canonical numbering or an authenticity grade.']}
        if cache:
            payload={**result,'_cache_integrity_sha256':sha(canonical(result))}
            tmp=cache.with_suffix('.tmp');tmp.write_text(canonical(payload)+'\n',encoding='utf-8');tmp.replace(cache)
        return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,default=ROOT/'data/derived/evidence-tanzil.sqlite')
    parser.add_argument('--text');parser.add_argument('--input',type=Path);parser.add_argument('--output',type=Path)
    parser.add_argument('--cache',type=Path,default=ROOT/'data/derived/dossier-cache')
    args=parser.parse_args()
    if (args.text is None)==(args.input is None):parser.error('Choose exactly one of --text / --input')
    text=args.text if args.text is not None else args.input.read_text(encoding='utf-8-sig')
    store=EvidenceStore(args.database)
    try:result=store.dossier(text,args.cache)
    finally:store.close()
    body=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output:args.output.write_text(body,encoding='utf-8')
    else:print(body)

if __name__=='__main__':main()
