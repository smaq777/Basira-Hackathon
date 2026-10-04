import { randomUUID } from 'node:crypto';
import {
  FoundationReportSchema,
  type FoundationReport,
} from '../../../packages/contracts/src/foundation.js';
import {
  analyzeThemes,
  catalogRelevantReferences,
  suggestImprovements,
} from '../../../packages/contracts/src/themes.js';
import { canonical, sha256, type FoundationAdapter } from './foundation.js';
import {
  assessClaimApplicability,
  CLAIM_APPLICABILITY_VERSION,
} from '../../../packages/contracts/src/claim-applicability.js';
import type { ReviewLease, ReviewStore, StoredEvidence, StoredFinding } from './review-store.js';

export interface FoundationWorker {
  notify(): void;
  start(): void;
  stop(): Promise<void>;
  runOnce(): Promise<boolean>;
}

/** This worker owns retrieval and editorial artifacts, never an inferred religious verdict. */
export function createFoundationWorker(
  adapter: FoundationAdapter,
  store: ReviewStore,
): FoundationWorker {
  let stopped = false;
  let polling: ReturnType<typeof setInterval> | null = null;
  let current: Promise<boolean> | null = null;
  let controller: AbortController | null = null;

  async function execute(lease: ReviewLease): Promise<void> {
    const activeController = new AbortController();
    controller = activeController;
    const signal = activeController.signal;
    const deadline = setTimeout(
      () => activeController.abort(),
      Math.max(1, Date.parse(lease.deadlineAt) - Date.now()),
    );
    let heartbeatRunning = false;
    const heartbeat = setInterval(() => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;
      void store
        .heartbeat(lease, 15)
        .then((owned) => {
          if (!owned) activeController.abort();
        })
        .catch(() => activeController.abort())
        .finally(() => {
          heartbeatRunning = false;
        });
    }, 4_000);
    try {
      let intake = await adapter.analyze(lease.text, lease.revisionId, [], signal);
      if (
        intake.revisionSha256 !== lease.inputSha256 ||
        intake.corpusVersion !== lease.corpusVersion
      )
        throw new Error('INVALID_EVIDENCE');
      const preliminaryThemes = analyzeThemes(intake);
      const relatedReferences = catalogRelevantReferences(preliminaryThemes);
      if (relatedReferences.length) {
        try {
          intake = await adapter.analyze(lease.text, lease.revisionId, relatedReferences, signal);
        } catch (error) {
          if (signal.aborted) return;
          // Optional context is not required to keep already validated source matches.
          // Reject the enrichment packet and preserve the first pass on any failure.
          intake = { ...intake, warnings: [...intake.warnings, 'optional_context_unavailable'] };
        }
      }
      if (
        intake.revisionSha256 !== lease.inputSha256 ||
        intake.corpusVersion !== lease.corpusVersion
      )
        throw new Error('INVALID_EVIDENCE');
      if (signal.aborted) return;
      const themes = analyzeThemes(intake);
      const improvementCards = suggestImprovements(intake, themes);
      const applicability = assessClaimApplicability(intake);
      const generatedAt = new Date().toISOString();
      const status =
        intake.warnings.length ||
        intake.contextCoverage.some((entry) => entry.status !== 'complete_transport')
          ? 'partial'
          : intake.segments.some((segment) => segment.role !== 'author_text')
            ? 'needs_review'
            : 'completed';
      const report: FoundationReport = {
        schemaVersion: 1,
        reviewId: lease.reviewId,
        revisionId: lease.revisionId,
        inputSha256: lease.inputSha256,
        evidenceStateSha256: '',
        pipelineVersion: `${intake.pipelineVersion}/${themes.detectorVersion}/${CLAIM_APPLICABILITY_VERSION}`,
        generatedAt,
        status,
        intake,
        themes,
        improvementCards,
        interpretation: {
          status: applicability.status === 'not_applicable' ? 'not_applicable' : 'not_assessed',
          applicability,
          explanation:
            applicability.status === 'not_applicable'
              ? 'لم يُرصد استنتاج مكتوب لتقييم كفاية الاستدلال؛ تظل مراجعة النقل والمصادر مستقلة.'
              : 'كفاية الاستدلال لم تُقيّم بعد؛ نتائج النقل والموضوع لا تثبت صحة الاستنتاج.',
          scholarlyApproval: false,
        },
        limitations: [
          'اقتراحات آلية غير محكَّمة علميًا؛ لا تقرر صحة الاستدلال أو حكمًا شرعيًا.',
          ...(intake.researchOnly
            ? ['المصادر في معاينة بحثية؛ اعتماد الإصدارات للاستخدام التشغيلي ما زال معلقًا.']
            : []),
          'مطابقة نص الحديث لا تثبت صحة الإسناد أو درجة الحديث؛ مراجع المجموعة البحثية ليست ترقيم طبعة معتمدة.',
        ],
      };
      report.evidenceStateSha256 = sha256(
        canonical({
          intake,
          themes,
          improvementCards,
          interpretation: report.interpretation,
          pipelineVersion: report.pipelineVersion,
        }),
      );
      FoundationReportSchema.parse(report);
      for (const anchor of [
        ...themes.authoredThemes.flatMap((theme) => theme.anchors),
        ...improvementCards.map((card) => card.trigger),
      ]) {
        const segment = intake.segments.find((item) => item.id === anchor.segmentId);
        if (
          !segment ||
          anchor.startOffset < segment.startOffset ||
          anchor.endOffset > segment.endOffset ||
          lease.text.slice(anchor.startOffset, anchor.endOffset) !== anchor.originalText
        )
          throw new Error('INVALID_EDITORIAL_SPAN');
      }
      if (
        improvementCards.some((card) =>
          card.evidenceKeys.some(
            (key) => !intake.evidence.some((item) => item.snapshotKey === key),
          ),
        )
      )
        throw new Error('INVALID_EDITORIAL_EVIDENCE');
      if (!(await store.bindEvidence(lease, report.evidenceStateSha256)) || signal.aborted) return;
      const ids = new Map(intake.evidence.map((item) => [item.snapshotKey, randomUUID()]));
      const evidence: StoredEvidence[] = intake.evidence.map((item) => ({
        id: ids.get(item.snapshotKey)!,
        sourceId: item.sourceId,
        sourceVersion: item.sourceVersion,
        reference: item.reference,
        originalText: item.originalText,
        originalSha256: item.originalSha256,
        role: item.sourceRole,
        work: item.work,
        author: item.author,
        edition: item.edition,
        sourceUrl: item.sourceUrl,
        approvalStatus: item.approvalStatus,
        researchOnly: item.researchOnly,
        parentEvidenceId: item.parentSnapshotKey ? ids.get(item.parentSnapshotKey)! : null,
        retrievedAt: generatedAt,
        delivery: item.delivery,
        retrievalModes: item.retrievalModes,
        provenance: { ...item.provenance, snapshotKey: item.snapshotKey },
      }));
      const findings: StoredFinding[] = intake.quotationFindings.slice(0, 5).map((finding) => {
        const segment = intake.segments.find((item) => item.id === finding.segmentId)!;
        return {
          id: randomUUID(),
          startOffset: segment.startOffset,
          endOffset: segment.endOffset,
          claimType: segment.role === 'claimed_source' ? 'attribution' : 'quotation',
          claimText: segment.originalText,
          editorConfirmed: false,
          quoteStatus: finding.status === 'partial' ? 'unresolved' : finding.status,
          supportStatus: 'not_assessed',
          explanation: finding.reason,
          evidenceIds: finding.evidenceKey ? [ids.get(finding.evidenceKey)!] : [],
        };
      });
      await store.complete(lease, {
        reviewId: lease.reviewId,
        revisionId: lease.revisionId,
        inputSha256: lease.inputSha256,
        evidenceStateSha256: report.evidenceStateSha256,
        attempt: lease.attempt,
        status,
        evidence,
        findings,
        result: report as unknown as Record<string, unknown>,
      });
    } catch (error) {
      // Leave the lease recoverable on graceful shutdown rather than failing the draft.
      if (stopped) return;
      const reason = error instanceof Error ? error.message : '';
      const code =
        Date.now() >= Date.parse(lease.deadlineAt)
          ? 'deadline_exceeded'
          : /FOUNDATION_(?:UNAVAILABLE|TIMEOUT|ABORTED)/u.test(reason)
            ? 'adapter_unavailable'
            : /EVIDENCE|INTAKE|SOURCE|SPAN/u.test(reason)
              ? 'invalid_evidence'
              : 'invalid_report';
      await store.fail(lease, code).catch(() => false);
    } finally {
      clearTimeout(deadline);
      clearInterval(heartbeat);
      if (controller === activeController) controller = null;
    }
  }

  async function runOnce(): Promise<boolean> {
    if (stopped) return false;
    if (current) return current;
    current = (async () => {
      const lease = await store.acquire(null, 15);
      if (!lease) return false;
      await execute(lease);
      return true;
    })().finally(() => {
      current = null;
    });
    return current;
  }

  return {
    runOnce,
    notify() {
      void runOnce().catch(() => undefined);
    },
    start() {
      if (!polling && !stopped) {
        polling = setInterval(() => void runOnce().catch(() => undefined), 1_000);
        polling.unref();
      }
    },
    async stop() {
      stopped = true;
      if (polling) clearInterval(polling);
      controller?.abort();
      await current?.catch(() => false);
      await adapter.close();
      await store.close();
    },
  };
}
