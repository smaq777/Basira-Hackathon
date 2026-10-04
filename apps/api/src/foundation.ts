import { createHash } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  FoundationIntakeSchema,
  type FoundationIntake,
} from '../../../packages/contracts/src/foundation.js';

export const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** Canonical hashing is separate from source originals, which are never normalized. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}

export interface FoundationAdapter {
  analyze(
    text: string,
    revisionId: string,
    relatedReferences?: string[],
    signal?: AbortSignal,
  ): Promise<FoundationIntake>;
  close(): Promise<void>;
}

function validBoundary(text: string, offset: number): boolean {
  if (offset < 0 || offset > text.length) return false;
  const next = text.charCodeAt(offset);
  const previous = text.charCodeAt(offset - 1);
  return !(next >= 0xdc00 && next <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff);
}

/** Fail closed on a schema-valid but detached evidence packet. */
export function validateIntake(
  payload: unknown,
  text: string,
  revisionId: string,
  researchPreview: boolean,
): FoundationIntake {
  const intake = FoundationIntakeSchema.parse(payload);
  if (
    intake.originalText !== text ||
    intake.revisionId !== revisionId ||
    intake.revisionSha256 !== sha256(text)
  )
    throw new Error('INTAKE_REVISION_MISMATCH');
  if (!researchPreview && intake.researchOnly) throw new Error('RESEARCH_PREVIEW_DISABLED');
  const evidence = new Map(intake.evidence.map((item) => [item.snapshotKey, item]));
  if (evidence.size !== intake.evidence.length) throw new Error('DUPLICATE_EVIDENCE');
  for (const item of evidence.values()) {
    if (sha256(item.originalText) !== item.originalSha256)
      throw new Error('EVIDENCE_HASH_MISMATCH');
    if (!researchPreview && (item.researchOnly || item.approvalStatus !== 'approved'))
      throw new Error('UNAPPROVED_PRODUCTION_EVIDENCE');
    if (item.parentSnapshotKey) {
      const parent = evidence.get(item.parentSnapshotKey);
      const commentaryAnchor =
        item.sourceRole === 'tafsir_commentary' &&
        parent?.sourceRole === 'quran_text' &&
        !parent.parentSnapshotKey;
      const footnoteParent =
        item.sourceRole === 'tafsir_footnote' &&
        parent?.sourceRole === 'tafsir_commentary' &&
        parent.sourceId === item.sourceId &&
        parent.sourceVersion === item.sourceVersion &&
        parent.work === item.work;
      if (
        !parent ||
        parent === item ||
        parent.reference !== item.reference ||
        (!commentaryAnchor && !footnoteParent)
      )
        throw new Error('INVALID_EVIDENCE_PARENT');
    } else if (item.sourceRole === 'tafsir_footnote') throw new Error('MISSING_FOOTNOTE_PARENT');
  }
  const points = Array.from(text);
  const segments = new Map(intake.segments.map((segment) => [segment.id, segment]));
  if (segments.size !== intake.segments.length) throw new Error('DUPLICATE_SEGMENT');
  for (const segment of segments.values()) {
    if (
      !validBoundary(text, segment.startOffset) ||
      !validBoundary(text, segment.endOffset) ||
      text.slice(segment.startOffset, segment.endOffset) !== segment.originalText ||
      points.slice(segment.codePointStart, segment.codePointEnd).join('') !==
        segment.originalText ||
      points.slice(0, segment.codePointStart).join('').length !== segment.startOffset ||
      points.slice(0, segment.codePointEnd).join('').length !== segment.endOffset
    )
      throw new Error('INTAKE_SPAN_MISMATCH');
    if (segment.sourceKeys.some((key) => !evidence.has(key)))
      throw new Error('UNKNOWN_SEGMENT_SOURCE');
    if (segment.roleStatus === 'source_matched' && segment.sourceKeys.length === 0)
      throw new Error('SOURCE_MATCH_WITHOUT_EVIDENCE');
    if (
      segment.role === 'ayah' &&
      segment.roleStatus === 'source_matched' &&
      !segment.sourceKeys.some((key) => evidence.get(key)?.sourceRole === 'quran_text')
    )
      throw new Error('SOURCE_PRECEDENCE_VIOLATION');
    if (
      segment.role === 'matn' &&
      segment.roleStatus === 'source_matched' &&
      !segment.sourceKeys.some((key) => evidence.get(key)?.sourceRole === 'hadith_matn')
    )
      throw new Error('SOURCE_PRECEDENCE_VIOLATION');
  }
  for (const finding of intake.quotationFindings) {
    const segment = segments.get(finding.segmentId);
    const source = finding.evidenceKey ? evidence.get(finding.evidenceKey) : null;
    if (
      !segment ||
      (finding.evidenceKey && (!source || !segment.sourceKeys.includes(finding.evidenceKey)))
    )
      throw new Error('UNKNOWN_LITERAL_CITATION');
    if (finding.status !== 'unresolved' && !source) throw new Error('LITERAL_EVIDENCE_REQUIRED');
    const comparison = finding.comparison;
    if (comparison && comparison.fidelity !== 'unresolved' && !source)
      throw new Error('LITERAL_EVIDENCE_REQUIRED');
    if (
      (finding.matchedStart === null) !== (finding.matchedEnd === null) ||
      (finding.matchedStart !== null &&
        finding.matchedEnd !== null &&
        (!source ||
          finding.matchedEnd < finding.matchedStart ||
          finding.matchedEnd > source.originalText.length ||
          !validBoundary(source.originalText, finding.matchedStart) ||
          !validBoundary(source.originalText, finding.matchedEnd)))
    )
      throw new Error('INVALID_LITERAL_SOURCE_OFFSET');
    if (
      finding.status === 'exact' &&
      source &&
      finding.matchedStart !== null &&
      finding.matchedEnd !== null &&
      source.originalText.slice(finding.matchedStart, finding.matchedEnd) !== segment.originalText
    )
      throw new Error('INVALID_EXACT_MATCH');
    if (comparison?.fidelity === 'exact') {
      const original =
        finding.matchedStart === null
          ? source?.originalText
          : source?.originalText.slice(finding.matchedStart, finding.matchedEnd!);
      if (
        original !== segment.originalText ||
        comparison.basis !== 'canonical' ||
        comparison.differences.length
      )
        throw new Error('INVALID_EXACT_COMPARISON');
    }
    if (
      comparison?.extent === 'full' &&
      source &&
      finding.matchedStart !== null &&
      (finding.matchedStart !== 0 || finding.matchedEnd !== source.originalText.length)
    )
      throw new Error('INVALID_FULL_EXTENT');
    if (
      finding.status === 'exact' &&
      source &&
      finding.matchedStart === null &&
      source.originalText !== segment.originalText
    )
      throw new Error('INVALID_EXACT_MATCH');
  }
  return intake;
}

type PythonAdapterOptions = {
  python: string;
  script: string;
  cwd: string;
  database: string;
  snapshotDirectory?: string;
  researchPreview?: boolean;
  timeoutMs?: number;
};

/** One initialized process and a serialized queue keep the verified index warm. */
export function createPythonAdapter(options: PythonAdapterOptions): FoundationAdapter {
  if (
    ![options.python, options.script, options.cwd, options.database].every(isAbsolute) ||
    (options.snapshotDirectory && !isAbsolute(options.snapshotDirectory))
  )
    throw new Error('FOUNDATION_PATHS_MUST_BE_ABSOLUTE');
  let child: ChildProcessWithoutNullStreams | null = null;
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();

  function process(): ChildProcessWithoutNullStreams {
    if (child && child.exitCode === null && !child.killed) return child;
    const args = ['-B', '-u', options.script, '--database', options.database];
    if (options.snapshotDirectory) args.push('--snapshot-directory', options.snapshotDirectory);
    if (options.researchPreview) args.push('--research-preview');
    child = spawn(options.python, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...globalThis.process.env, PYTHONIOENCODING: 'utf-8' },
    });
    child.stdout.setEncoding('utf8');
    // Untrusted provider/document text and raw process errors never enter application logs.
    child.stderr.on('data', () => undefined);
    child.on('error', () => undefined);
    return child;
  }

  async function invoke(
    text: string,
    revisionId: string,
    relatedReferences: string[],
    signal?: AbortSignal,
  ): Promise<FoundationIntake> {
    if (closed || signal?.aborted) throw new Error('FOUNDATION_ABORTED');
    if (
      relatedReferences.length > 10 ||
      relatedReferences.some((ref) => !/^\d{1,3}:\d{1,3}$/u.test(ref))
    )
      throw new Error('INVALID_RELATED_REFERENCE');
    const worker = process();
    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const finish = (error?: Error, value?: FoundationIntake) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        worker.stdout.off('data', output);
        worker.off('error', unavailable);
        worker.off('exit', unavailable);
        if (error) {
          worker.kill();
          if (child === worker) child = null;
          reject(error);
        } else if (value) resolve(value);
      };
      const unavailable = () => finish(new Error('FOUNDATION_UNAVAILABLE'));
      const abort = () => finish(new Error('FOUNDATION_ABORTED'));
      const output = (chunk: string) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer, 'utf8') > 2_000_000)
          return finish(new Error('FOUNDATION_RESPONSE_TOO_LARGE'));
        const end = buffer.indexOf('\n');
        if (end < 0) return;
        try {
          if (buffer.slice(end + 1).trim()) throw new Error('MULTIPLE_FOUNDATION_RESPONSES');
          finish(
            undefined,
            validateIntake(
              JSON.parse(buffer.slice(0, end)),
              text,
              revisionId,
              options.researchPreview ?? false,
            ),
          );
        } catch (error) {
          const code =
            error instanceof z.ZodError
              ? `INVALID_FOUNDATION_SCHEMA:${error.issues.map((issue) => issue.path.join('.')).join(',')}`
              : error instanceof Error && /^[A-Z_]+$/u.test(error.message)
                ? error.message
                : 'INVALID_FOUNDATION_EVIDENCE';
          finish(new Error(code));
        }
      };
      const timeout = setTimeout(
        () => finish(new Error('FOUNDATION_TIMEOUT')),
        options.timeoutMs ?? 20_000,
      );
      worker.stdout.on('data', output);
      worker.once('error', unavailable);
      worker.once('exit', unavailable);
      signal?.addEventListener('abort', abort, { once: true });
      worker.stdin.write(
        JSON.stringify({ text, revisionId, relatedReferences }) + '\n',
        'utf8',
        (error) => {
          if (error) unavailable();
        },
      );
    });
  }

  return {
    analyze(text, revisionId, relatedReferences = [], signal) {
      const result = queue.then(() => invoke(text, revisionId, relatedReferences, signal));
      queue = result.catch(() => undefined);
      return result;
    },
    async close() {
      closed = true;
      child?.kill();
      child = null;
      await queue.catch(() => undefined);
    },
  };
}
