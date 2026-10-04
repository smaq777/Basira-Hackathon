"""Operator-enabled, read-only Tafsir transport with one shared request budget.

Only fetch_tafsir is invoked after a schema-pinned MCP handshake. No retries,
alternate providers, durable approved-cache writes or scholarly approval.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.request

from .tafsir_adapter import ContractError, MAX_BYTES, TafsirAdapter, decode, schema_digest

ENDPOINT = 'https://mcp.tafsir.net/mcp'
MAX_REQUESTS = 19  # initialize + notification + tools/list + 2 works x 8 parts
AGGREGATE_BYTES = 1_000_000
DEADLINE_SECONDS = 12


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        raise ContractError('provider_redirect_rejected')


class MCPTransport:
    """Small bounded client; session identifiers stay in process memory only."""
    def __init__(self, *, clock=time.monotonic, opener=None):
        self.clock = clock
        self.deadline = clock() + DEADLINE_SECONDS
        self.opener = opener or urllib.request.build_opener(_NoRedirect())
        self.session = None
        self.requests = 0
        self.bytes = 0
        self.observations = []

    def rpc(self, payload, remaining=None):
        remaining = min(self.deadline-self.clock(), remaining if remaining is not None else DEADLINE_SECONDS)
        if remaining <= 0:
            raise ContractError('deadline_exceeded')
        if self.requests >= MAX_REQUESTS:
            raise ContractError('request_budget_exceeded')
        if self.bytes >= AGGREGATE_BYTES:
            raise ContractError('aggregate_byte_budget_exceeded')
        self.requests += 1
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
                   'User-Agent': 'BasirahTafsirContext/1.0'}
        if self.session:
            headers.update({'Mcp-Session-Id': self.session, 'MCP-Protocol-Version': '2025-03-26'})
        request = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode('utf-8'), headers=headers)
        with self.opener.open(request, timeout=min(10, remaining)) as response:
            if response.status not in (200, 202, 204) or response.url != ENDPOINT:
                raise ContractError('unexpected_http_response')
            sid = response.headers.get('Mcp-Session-Id')
            if sid is not None:
                if not isinstance(sid, str) or not sid or len(sid) > 500 or '\r' in sid or '\n' in sid:
                    raise ContractError('invalid_session_header')
                self.session = sid
            raw = b''
            if response.status in (202, 204) and 'id' not in payload:
                body = b''
            elif 'text/event-stream' in (response.headers.get('Content-Type') or ''):
                while True:
                    if self.clock() >= self.deadline:
                        raise ContractError('deadline_exceeded')
                    line = response.readline(min(MAX_BYTES+1-len(raw), AGGREGATE_BYTES+1-self.bytes))
                    raw += line
                    self.bytes += len(line)
                    if self.bytes > AGGREGATE_BYTES:
                        raise ContractError('aggregate_byte_budget_exceeded')
                    if len(raw) > MAX_BYTES:
                        raise ContractError('oversize_or_invalid_body')
                    if not line or (not line.strip() and b'data:' in raw):
                        break
                try:
                    body = '\n'.join(x[5:].lstrip() for x in raw.decode('utf-8').splitlines() if x.startswith('data:')).encode('utf-8')
                except UnicodeError:
                    raise ContractError('malformed_json') from None
            else:
                raw = response.read(min(MAX_BYTES+1, AGGREGATE_BYTES+1-self.bytes))
                self.bytes += len(raw)
                if self.bytes > AGGREGATE_BYTES:
                    raise ContractError('aggregate_byte_budget_exceeded')
                if len(raw) > MAX_BYTES:
                    raise ContractError('oversize_or_invalid_body')
                body = raw
            if self.clock() > self.deadline:
                raise ContractError('deadline_exceeded')
            self.observations.append({'method': payload['method'], 'rpc_id': payload.get('id'),
                'arguments': payload.get('params', {}).get('arguments'), 'http_status': response.status,
                'transport_bytes': len(raw), 'transport_sha256': hashlib.sha256(raw).hexdigest(),
                'rpc_json_sha256': hashlib.sha256(body).hexdigest()})
            return body


def _envelope(raw, rpc_id):
    body = decode(raw)
    if (not isinstance(body, dict) or body.get('jsonrpc') != '2.0' or
            type(body.get('id')) is not int or body['id'] != rpc_id or 'error' in body or
            not isinstance(body.get('result'), dict)):
        raise ContractError('invalid_handshake_envelope')
    return body


def gather_live(surah, ayah, *, expected_schema_sha256, reference_exists,
                environment=None, transport=None, clock=time.monotonic, overall_deadline=None):
    """Return a research packet or None; browser input cannot enable this path."""
    environment = os.environ if environment is None else environment
    if environment.get('FOUNDATION_TAFSIR_LIVE', '').lower() != 'true':
        return None
    if (type(surah) is not int or type(ayah) is not int or not expected_schema_sha256 or
            not reference_exists(surah, ayah)):
        return None
    client = transport or MCPTransport(clock=clock)
    if overall_deadline is not None:
        client.deadline = min(client.deadline, overall_deadline)
    if client.deadline <= clock():
        return None
    try:
        init = _envelope(client.rpc({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-03-26', 'capabilities': {},
            'clientInfo': {'name': 'basirah-source-context', 'version': '1.0'}}}), 1)
        if init['result'].get('protocolVersion') != '2025-03-26' or not isinstance(init['result'].get('serverInfo'), dict):
            raise ContractError('unsupported_handshake')
        client.rpc({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        raw_tools = client.rpc({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}})
        tools = _envelope(raw_tools, 2)
        observed = schema_digest(tools)
        if observed != expected_schema_sha256:
            return None
        remaining = client.deadline-clock()
        if remaining <= 0:
            return None
        def fetch(request, remaining):
            return client.rpc({'jsonrpc': '2.0', 'id': request.rpc_id, 'method': 'tools/call',
                'params': {'name': 'fetch_tafsir', 'arguments': request.arguments()}}, remaining)
        adapter = TafsirAdapter(fetch, observed_schema_sha256=observed,
            expected_schema_sha256=expected_schema_sha256, service_version=init['result']['serverInfo'],
            reference_exists=reference_exists, deadline_seconds=min(DEADLINE_SECONDS, remaining), clock=clock)
        packet = adapter.gather(surah, ayah, research_preview=True, sources=('moyassar', 'saadi'))
        packet.update(delivery='live', transport_provenance={'endpoint': ENDPOINT,
            'tools_list_rpc_sha256': hashlib.sha256(raw_tools).hexdigest(),
            'schema_verified': True, 'request_count': client.requests, 'transport_bytes': client.bytes,
            'request_limit': MAX_REQUESTS, 'byte_limit': AGGREGATE_BYTES,
            'deadline_seconds': DEADLINE_SECONDS, 'automatic_retries': 0,
            'observations': client.observations})
        return packet
    except (ContractError, OSError, ValueError, KeyError, TypeError):
        return None
