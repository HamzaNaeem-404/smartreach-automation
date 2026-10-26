import { randomUUID } from "node:crypto";
import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { getDb } from "@smartreach/db";
import {
  confirmMappingAndProcess,
  claimDueActions,
  processReservedAction,
  processOutboxBatch,
  countUnprocessedOutbox,
  logOperationalEvent,
} from "@smartreach/core";

/**
 * Milestone 2.1 worker:
 * - CSV import jobs
 * - Follow-up due-work claiming with lease reclaim
 * - Outbox drain with SKIP LOCKED
 *
 * At-least-once local processing; no live email/LinkedIn send.
 */
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

export const importQueue = new Queue("csv-imports", { connection });
export const followUpQueue = new Queue("follow-ups", { connection });
export const outboxQueue = new Queue("outbox", { connection });

const importWorker = new Worker(
  "csv-imports",
  async (job) => {
    const db = getDb();
    const { workspaceId, batchId, mapping } = job.data as {
      workspaceId: string;
      batchId: string;
      mapping: Record<string, string | null>;
    };
    logOperationalEvent("import.job.start", {
      workspaceId,
      batchId,
      workerId: WORKER_ID,
    });
    return confirmMappingAndProcess(db, { workspaceId, batchId, mapping });
  },
  { connection },
);

const followUpWorker = new Worker(
  "follow-ups",
  async () => {
    const db = getDb();
    const claimed = await claimDueActions(db, {
      limit: 25,
      workerId: WORKER_ID,
    });
    logOperationalEvent("followups.claim", {
      workerId: WORKER_ID,
      claimed: claimed.length,
    });
    const outcomes = [];
    for (const action of claimed) {
      const result = await processReservedAction(
        db,
        action.workspaceId,
        action.id,
      );
      logOperationalEvent("followups.process", {
        workerId: WORKER_ID,
        actionId: action.id,
        workspaceId: action.workspaceId,
        outcome: result.outcome,
      });
      outcomes.push({ id: action.id, ...result });
    }
    return { claimed: claimed.length, outcomes, workerId: WORKER_ID };
  },
  { connection },
);

const outboxWorker = new Worker(
  "outbox",
  async () => {
    const db = getDb();
    const results = await processOutboxBatch(db, async (event) => {
      logOperationalEvent("outbox.event", {
        eventType: event.eventType,
        workspaceId: event.workspaceId,
        eventId: event.id,
        workerId: WORKER_ID,
      });
    });
    const pending = await countUnprocessedOutbox(db);
    return { processed: results.length, pending, workerId: WORKER_ID };
  },
  { connection },
);

async function ensureRepeatableJobs() {
  await followUpQueue.add(
    "poll-due",
    {},
    {
      repeat: { every: 30_000 },
      jobId: "follow-ups-poll",
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  await outboxQueue.add(
    "drain",
    {},
    {
      repeat: { every: 15_000 },
      jobId: "outbox-drain",
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}

for (const worker of [importWorker, followUpWorker, outboxWorker]) {
  worker.on("completed", (job) => {
    logOperationalEvent("worker.job.completed", {
      queue: job.queueName,
      jobId: String(job.id),
      workerId: WORKER_ID,
    });
  });
  worker.on("failed", (job, err) => {
    logOperationalEvent("worker.job.failed", {
      queue: job?.queueName ?? "unknown",
      jobId: String(job?.id ?? ""),
      workerId: WORKER_ID,
      error: err.message,
    });
  });
}

void ensureRepeatableJobs().then(() => {
  logOperationalEvent("worker.ready", {
    workerId: WORKER_ID,
    queues: "csv-imports,follow-ups,outbox",
  });
});
