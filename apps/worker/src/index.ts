import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { getDb } from "@smartreach/db";
import {
  confirmMappingAndProcess,
  claimDueActions,
  processReservedAction,
  processOutboxBatch,
  countUnprocessedOutbox,
} from "@smartreach/core";

/**
 * Milestone 2 worker:
 * - CSV import jobs
 * - Follow-up due-work claiming (DB is source of truth; Redis schedules polls)
 * - Outbox recovery publisher
 *
 * External email send remains disabled. LinkedIn is never automated.
 */
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

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
    return confirmMappingAndProcess(db, { workspaceId, batchId, mapping });
  },
  { connection },
);

const followUpWorker = new Worker(
  "follow-ups",
  async () => {
    const db = getDb();
    const claimed = await claimDueActions(db, { limit: 25 });
    const outcomes = [];
    for (const action of claimed) {
      const result = await processReservedAction(
        db,
        action.workspaceId,
        action.id,
      );
      outcomes.push({ id: action.id, ...result });
    }
    return { claimed: claimed.length, outcomes };
  },
  { connection },
);

const outboxWorker = new Worker(
  "outbox",
  async () => {
    const db = getDb();
    const results = await processOutboxBatch(db, async (event) => {
      // M2: durable log only — downstream consumers (email sync, webhooks) arrive later
      console.log(
        `[outbox] ${event.eventType} workspace=${event.workspaceId} id=${event.id}`,
      );
    });
    const pending = await countUnprocessedOutbox(db);
    return { processed: results.length, pending };
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
    console.log(`[worker] ${job.queueName} job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(
      `[worker] ${job?.queueName} job ${job?.id} failed`,
      err.message,
    );
  });
}

void ensureRepeatableJobs().then(() => {
  console.log(
    "[worker] listening on queues: csv-imports, follow-ups, outbox",
  );
});
