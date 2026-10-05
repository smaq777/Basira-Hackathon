import { randomUUID } from 'node:crypto';
import { enrichedReportFits } from './evidence-budget.js';
import {
  FoundationReportSchema,
  type FoundationReport,
} from '../../../packages/contracts/src/foundation.js';
import {
  analyzeThemes,
  catalogRelevantReferences,
  suggestImprovements,
} from '../../../packages/contracts/src/themes.js';
import { canonical, sha256, validateIntake, type FoundationAdapter } from './foundation.js';
import {
  assessClaimApplicability,
  CLAIM_APPLICABILITY_VERSION,
} from '../../../packages/contracts/src/claim-applicability.js';
import type { ReviewLease, ReviewStore, StoredEvidence, StoredFinding } from './review-store.js';
import {
  SEMANTIC_PHASE_TIMEOUT_MS,
  type SemanticAssessmentAdapter,
} from './semantic-assessment.js';

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
  semantic?: Pick<SemanticAssessmentAdapter, 'assessWithEvidence'>,
  options: { researchPreview?: boolean; semanticTimeoutMs?: number } = {},
): FoundationWorker {
  const semanticTimeoutMs = options.semanticTimeoutMs ?? SEMANTIC_PHASE_TIMEOUT_MS;
  if (
    !Number.isInteger(semanticTimeoutMs) ||
    semanticTimeoutMs < 1 ||
    semanticTimeoutMs > (options.researchPreview ? 240000 : SEMANTIC_PHASE_TIMEOUT_MS)
  )
    throw new Error('INVALID_SEMANTIC_WORKER_BUDGET');
  const leaseSeconds = semanticTimeoutMs > SEMANTIC_PHASE_TIMEOUT_MS ? 30 : 15;
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
    let stage = 'intake';
    const heartbeat = setInterval(() => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;
      void store
        .heartbeat(lease, leaseSeconds)
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
      let themes = analyzeThemes(intake);
      let improvementCards = suggestImprovements(intake, themes);
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
      if (semantic && applicability.status !== 'not_applicable') {
        // Preserve time for binding and persistence even when an optional provider stalls.
        const availableMs = Math.min(
          semanticTimeoutMs,
          Date.parse(lease.deadlineAt) - Date.now() - 5_000,
        );
        try {
          if (availableMs < 1_000) throw new Error('SEMANTIC_DEADLINE');
          const assessed = await semantic.assessWithEvidence(
            intake,
            AbortSignal.any([signal, AbortSignal.timeout(availableMs)]),
          );
          const assessment = assessed.report;
          const enriched = validateIntake(
            assessed.intake,
            intake.originalText,
            intake.revisionId,
            options.researchPreview === true,
          );
          if (
            assessment.trace.inputSha256 !== lease.inputSha256 ||
            assessment.trace.evidenceSha256 !== sha256(canonical(enriched.evidence)) ||
            enriched.revisionSha256 !== lease.inputSha256 ||
            enriched.revisionId !== intake.revisionId ||
            enriched.corpusVersion !== intake.corpusVersion ||
            enriched.originalText !== intake.originalText ||
            canonical(enriched.segments) !== canonical(intake.segments) ||
            canonical(enriched.quotationFindings) !== canonical(intake.quotationFindings) ||
            intake.evidence.some(
              (source) => !enriched.evidence.some((row) => canonical(row) === canonical(source)),
            )
          )
            throw new Error('SEMANTIC_BINDING');
          const enrichedThemes = analyzeThemes(enriched);
          const enrichedCards = suggestImprovements(enriched, enrichedThemes);
          // Validate the additive result before attaching it to the durable report.
          FoundationReportSchema.parse({
            ...report,
            intake: enriched,
            themes: enrichedThemes,
            improvementCards: enrichedCards,
            evidenceStateSha256: '0'.repeat(64),
            semanticAssessment: assessment,
          });
          if (
            !enrichedReportFits(
              {
                ...report,
                intake: enriched,
                themes: enrichedThemes,
                improvementCards: enrichedCards,
                semanticAssessment: assessment,
              },
              enriched.evidence,
            )
          )
            throw new Error('OPTIONAL_REPORT_BYTE_BUDGET');
          if (assessment.status !== 'disabled') {
            intake = report.intake = enriched;
            themes = report.themes = enrichedThemes;
            improvementCards = report.improvementCards = enrichedCards;
            report.semanticAssessment = assessment;
            report.pipelineVersion += `/${assessment.trace.pipelineVersion}`;
            report.interpretation.status = assessment.assessments.length
              ? 'provisional'
              : assessment.status === 'not_applicable'
                ? 'not_applicable'
                : 'unavailable';
            report.interpretation.explanation = assessment.assessments.length
              ? 'تقييم آلي أولي للادعاءات في ضوء المصادر المعروضة؛ لا يمثل اعتمادًا علميًا أو شرعيًا.'
              : assessment.status === 'not_applicable'
                ? 'لم يُستخرج استنتاج واضح قابل للتقييم من كلام الكاتب.'
                : 'تعذر استكمال التقييم الدلالي؛ نتائج النقل والمصادر ما زالت متاحة.';
            if (['partial', 'unavailable'].includes(assessment.status)) report.status = 'partial';
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'OPTIONAL_REPORT_BYTE_BUDGET')
            report.limitations.push(
              'تعذر استكمال تقييم المعاني لكثرة النصوص المرجعية؛ حُفظت نتائج النقل والمصادر الأصلية.',
            );
          report.status = 'partial';
          report.interpretation.status = 'unavailable';
          report.interpretation.explanation =
            'تعذر استكمال التقييم الدلالي؛ نتائج النقل والمصادر ما زالت متاحة.';
        }
      }
      if (signal.aborted) return;
      report.evidenceStateSha256 = sha256(
        canonical({
          intake,
          themes,
          improvementCards,
          interpretation: report.interpretation,
          ...(report.semanticAssessment ? { semanticAssessment: report.semanticAssessment } : {}),
          pipelineVersion: report.pipelineVersion,
        }),
      );
      stage = 'report_validation';
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
      stage = 'evidence_binding';
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
        ...(item.contextBefore !== undefined ? { contextBefore: item.contextBefore } : {}),
        ...(item.contextAfter !== undefined ? { contextAfter: item.contextAfter } : {}),
        ...(item.footnotes !== undefined ? { footnotes: item.footnotes } : {}),
        ...(item.relations !== undefined ? { relations: item.relations } : {}),
      }));
      const findings: StoredFinding[] = intake.quotationFindings.map((finding) => {
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
      stage = 'report_persistence';
      await store.complete(lease, {
        reviewId: lease.reviewId,
        revisionId: lease.revisionId,
        inputSha256: lease.inputSha256,
        evidenceStateSha256: report.evidenceStateSha256,
        attempt: lease.attempt,
        status: report.status,
        evidence,
        findings,
        result: report as unknown as Record<string, unknown>,
      });
    } catch (error) {
      // Leave the lease recoverable on graceful shutdown rather than failing the draft.
      if (stopped) return;
      const reason = error instanceof Error ? error.message : '';
      // Only emit bounded machine codes; provider/SQL messages may contain private content.
      console.error(
        JSON.stringify({
          event: 'foundation_review_failed',
          stage,
          code: /^[A-Z_]{1,80}$/u.test(reason) ? reason : 'UNCLASSIFIED_ERROR',
          errorType:
            error instanceof Error && ['Error', 'ZodError'].includes(error.name)
              ? error.name
              : 'Error',
        }),
      );
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
      const lease = await store.acquire(null, leaseSeconds);
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
