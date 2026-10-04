"""Source-specific Tafsir research adapter. Retrieval does not establish support.

Transport is injected: it must use the fixed configured provider, enforce its
network deadline and return a bounded JSON-RPC body (not rendered HTML).
No automatic retries, provider substitution or production approval is inferred.
"""
from dataclasses import dataclass
import copy
import hashlib
import json
import time

PROVIDER = 'tafsir-center-mcp'
WORKS = {'moyassar': 'التفسير الميسر', 'saadi': 'تيسير الكريم الرحمن للسعدي'}
MAX_BYTES = 200_000
MAX_PARTS = 8

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

class ContractError(ValueError):
    def __init__(self, status):
        super().__init__(status)
        self.status = status

def unique_object(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ContractError('duplicate_json_key')
        output[key] = value
    return output

def decode(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise ContractError('oversize_or_invalid_body')
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object,
                          parse_constant=lambda value: (_ for _ in ()).throw(ContractError('nonfinite_json')))
        stack = [value]
        while stack:
            item = stack.pop()
            if isinstance(item,str):
                try: item.encode('utf-8')
                except UnicodeError: raise ContractError('invalid_unicode') from None
            elif isinstance(item,dict):
                stack.extend(item.keys());stack.extend(item.values())
            elif isinstance(item,list):stack.extend(item)
        return value
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ContractError('malformed_json') from None

def schema_digest(tools_body):
    try:
        tools = tools_body['result']['tools']
        matches = [t for t in tools if t['name'] == 'fetch_tafsir']
        if len(matches) != 1 or not isinstance(matches[0]['inputSchema'], dict):
            raise KeyError('fetch_tafsir')
        return digest(canonical(matches[0]['inputSchema']))
    except (KeyError, TypeError):
        raise ContractError('schema_unavailable') from None

@dataclass(frozen=True)
class Request:
    surah: int
    ayah: int
    source: str
    part: int
    rpc_id: int

    def arguments(self):
        return {'surah': self.surah, 'ayah': self.ayah, 'sources': [self.source], 'part': self.part}

def parse_page(raw, request):
    envelope = decode(raw)
    if not isinstance(envelope, dict) or envelope.get('jsonrpc') != '2.0' or type(envelope.get('id')) is not int or envelope['id'] != request.rpc_id:
        raise ContractError('rpc_identity_mismatch')
    if 'error' in envelope:
        raise ContractError('rpc_error')
    result = envelope.get('result')
    if not isinstance(result, dict) or result.get('isError') is not False:
        raise ContractError('tool_error_or_invalid_envelope')
    blocks = result.get('content')
    if not isinstance(blocks, list) or len(blocks) != 1 or not isinstance(blocks[0],dict) or blocks[0].get('type') != 'text' or not isinstance(blocks[0].get('text'), str):
        raise ContractError('unexpected_content_blocks')
    payload = decode(blocks[0]['text'].encode('utf-8'))
    if 'structuredContent' in result and result['structuredContent'] != payload:
        raise ContractError('conflicting_structured_content')
    if not isinstance(payload,dict) or any(type(payload.get(k)) is not int or payload[k] != getattr(request,k) for k in ('surah','ayah')):
        raise ContractError('reference_mismatch_or_missing')
    rows = payload.get('tafsirs')
    if not isinstance(rows,list) or len(rows) != 1 or not isinstance(rows[0],dict) or rows[0].get('source') != request.source:
        raise ContractError('missing_or_unrequested_source')
    row = rows[0]
    for key in ('text','text_raw','attribution'):
        if not isinstance(row.get(key),str) or not row[key].strip():
            raise ContractError('missing_original_or_attribution')
    for key in ('text_clean','text_display'):
        if key in row and not isinstance(row[key],str):
            raise ContractError('invalid_text_variant')
    notes = row.get('footnotes')
    if not isinstance(notes,list) or any(not isinstance(n,dict) or not isinstance(n.get('text'),str) for n in notes):
        raise ContractError('invalid_or_missing_footnotes')
    present = {k for k in ('part','total_parts','has_more') if k in row}
    if present and len(present) != 3:
        raise ContractError('incomplete_pagination_fields')
    part, total, more = row.get('part',1), row.get('total_parts',1), row.get('has_more',False)
    if type(part) is not int or type(total) is not int or type(more) is not bool or part != request.part or not 1 <= part <= total or more != (part < total):
        raise ContractError('invalid_pagination')
    return {'part':part, 'total_parts':total, 'has_more':more, 'attribution':row['attribution'],
            'original_text':row['text'], 'original_text_sha256':digest(row['text']),
            'original_raw_text':row['text_raw'], 'original_raw_text_sha256':digest(row['text_raw']),
            'footnotes':copy.deepcopy(notes), 'provider_fields_as_untrusted_data':copy.deepcopy(row),
            'rpc_json_sha256':hashlib.sha256(raw).hexdigest(),
            'content_sha256':digest(canonical({'text':row['text'],'text_raw':row['text_raw'],'footnotes':notes}))}

def content_identity(record):
    return digest(canonical({'provider':PROVIDER,'source':record['source'],'reference':record['reference'],
        'parts':[{'part':p['part'],'attribution':p['attribution'],'text':p['original_text'],
                  'text_raw':p['original_raw_text'],'footnotes':p['footnotes']} for p in record['parts']]}))

def snapshot_identity(record):
    return digest(canonical({'provider':PROVIDER,'source':record['source'],'reference':record['reference'],
        'parts':[{k:v for k,v in p.items() if k!='rpc_json_sha256'} for p in record['parts']]}))

def verify_snapshot(record):
    """Reject mutated records before consumption; no publication-edition inference."""
    try:
        if record['content_sha256'] != content_identity(record) or record['snapshot_sha256'] != snapshot_identity(record):
            raise ContractError('snapshot_integrity_mismatch')
        for page in record['parts']:
            if digest(page['original_text']) != page['original_text_sha256'] or digest(page['original_raw_text']) != page['original_raw_text_sha256']:
                raise ContractError('snapshot_integrity_mismatch')
    except (KeyError,TypeError,UnicodeError):
        raise ContractError('snapshot_integrity_mismatch') from None
    return True

class TafsirAdapter:
    def __init__(self, fetch, *, observed_schema_sha256, expected_schema_sha256, service_version,
                 reference_exists, max_parts=MAX_PARTS, deadline_seconds=30, clock=time.monotonic):
        if type(max_parts) is not int or not 1 <= max_parts <= MAX_PARTS or not 0 < deadline_seconds <= 60:
            raise ValueError('Invalid bounded request budget')
        self.fetch, self.reference_exists, self.clock = fetch, reference_exists, clock
        self.observed_schema, self.expected_schema = observed_schema_sha256, expected_schema_sha256
        self.service_version = service_version
        self.max_parts, self.deadline_seconds = max_parts, deadline_seconds

    def gather(self, surah, ayah, *, research_preview=False, sources=('moyassar','saadi')):
        if not sources or len(sources)>2 or len(set(sources)) != len(sources) or any(s not in WORKS for s in sources):
            raise ValueError('Explicit distinct supported works required')
        packet = {'reference':f'{surah}:{ayah}','provider':PROVIDER,'research_only':True,
                  'content_approval':'pending','claim_support':'not_evaluated',
                  'publication_edition':None,'same_edition_fallback':'unavailable',
                  'service_version':self.service_version,'schema_sha256':self.observed_schema,'sources':[]}
        if not research_preview:
            packet['status'] = 'source_policy_pending'
            return packet
        if type(surah) is not int or type(ayah) is not int or not self.reference_exists(surah,ayah):
            packet['status'] = 'invalid_reference'
            return packet
        if not self.expected_schema or self.expected_schema != self.observed_schema:
            packet['status'] = 'schema_drift'
            return packet
        deadline = self.clock() + self.deadline_seconds
        rpc_id = 100
        aggregate_bytes = 0
        for source in sources:
            record = {'source':source,'work':WORKS[source],'reference':f'{surah}:{ayah}','parts':[],'status':'unavailable'}
            packet['sources'].append(record)
            try:
                total = None
                for part in range(1,self.max_parts+1):
                    remaining = deadline - self.clock()
                    if remaining <= 0:
                        raise ContractError('deadline_exceeded')
                    rpc_id += 1
                    request = Request(surah,ayah,source,part,rpc_id)
                    raw = self.fetch(request,remaining)
                    page = parse_page(raw,request)
                    aggregate_bytes += len(raw)
                    if aggregate_bytes > 1_000_000:
                        raise ContractError('aggregate_byte_budget_exceeded')
                    if self.clock() > deadline:
                        raise ContractError('deadline_exceeded')
                    if total is not None and total != page['total_parts']:
                        raise ContractError('changing_pagination_total')
                    if record['parts'] and record['parts'][0]['attribution'] != page['attribution']:
                        raise ContractError('changing_attribution')
                    if any(p['content_sha256'] == page['content_sha256'] for p in record['parts']):
                        raise ContractError('repeated_page')
                    total = page['total_parts']
                    record['parts'].append(page)
                    if total > self.max_parts:
                        raise ContractError('page_budget_exceeded')
                    if not page['has_more']:
                        record['status'] = 'available_research'
                        record['content_sha256'] = content_identity(record)
                        record['snapshot_sha256'] = snapshot_identity(record)
                        record['transcript_sha256'] = digest(canonical([p['rpc_json_sha256'] for p in record['parts']]))
                        verify_snapshot(record)
                        break
                else:
                    record['status'] = 'incomplete_page_budget'
            except ContractError as error:
                record['status'] = error.status
            except TimeoutError:
                record['status'] = 'timeout'
            except OSError:
                record['status'] = 'transport_unavailable'
            except Exception as error:
                record['status'] = 'adapter_exception'
                record['exception_type'] = type(error).__name__
            # Partial parts are retained only for diagnosis, never assessment.
            record['usable_for_research_context'] = record['status'] == 'available_research'
        count = sum(r['usable_for_research_context'] for r in packet['sources'])
        packet.update(status='complete_research' if count == len(sources) else 'partial_or_unavailable',
                      requested_work_count=len(sources),available_work_count=count)
        return packet
