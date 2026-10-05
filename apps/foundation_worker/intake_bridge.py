"""Operator-configured JSONL source intake bridge; stdout contains JSON only.

Adapted from AI_Foundation's theme-assistance-v1 intake bridge. Executable
dependencies are packaged alongside this file; source data remains external.
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from pipeline.source_intake import SourceIntake


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--snapshot-directory')
    parser.add_argument('--research-preview', action='store_true')
    args = parser.parse_args()
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        intake = SourceIntake(args.database, args.snapshot_directory, research_preview=args.research_preview)
    except (OSError, ValueError, KeyError, TypeError, sqlite3.DatabaseError, RecursionError):
        # No operator paths, pasted content or source text in protocol errors.
        emit({'error': 'source_intake_unavailable'})
        return 1
    try:
        while True:
            line = sys.stdin.buffer.readline(50001)
            if not line:
                break
            if len(line) > 50000 or not line.endswith(b'\n'):
                emit({'error': 'invalid_or_oversize_jsonl_request'})
                break
            try:
                request = json.loads(line.decode('utf-8'))
                if not isinstance(request, dict) or set(request) - {'text', 'revisionId', 'relatedReferences'}:
                    raise ValueError('Unknown request fields')
                result = intake.analyze(request['text'], request['revisionId'], request.get('relatedReferences', []))
                emit(result)
            except (OSError, ValueError, KeyError, TypeError, UnicodeError, sqlite3.DatabaseError, RecursionError):
                emit({'error': 'invalid_intake_request_or_source_integrity'})
    finally:
        intake.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
