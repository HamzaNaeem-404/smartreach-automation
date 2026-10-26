import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { getDb } from "@smartreach/db";
import { confirmMappingAndProcess } from "@smartreach/core";

/**
 * Milestone 1 worker: optional background CSV processing.
 * Follow-up dispatch and email sync land in later milestones.
 */
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

export const importQueue = new Queue("csv-imports", { connection });

const worker = new Worker(
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

worker.on("completed", (job) => {
  console.log(`[worker] import job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] import job ${job?.id} failed`, err.message);
});

console.log("[worker] listening on queue csv-imports");
