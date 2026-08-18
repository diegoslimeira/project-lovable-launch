import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import type { ProspectingJob } from "../pipeline";
import { getCurrentWorkspaceId, getDb } from "../db/client";
import { processingTasks } from "../db/schema";

type Row = typeof processingTasks.$inferSelect;

function rowToJob(row: Row): ProspectingJob {
  return {
    id: row.id,
    campaignId: row.campaignId,
    stage: row.stage as ProspectingJob["stage"],
    state: row.state as ProspectingJob["state"],
    processed: row.processed,
    total: row.total,
    attempts: row.attempts,
    error: row.error ?? undefined,
  } as ProspectingJob;
}

const createManyJobsFn = createServerFn({ method: "POST" })
  .validator((jobs: ProspectingJob[]) => jobs)
  .handler(async ({ data: jobs }) => {
    if (!jobs.length) return jobs;
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    // Espelha o dedup por id do repository anterior: substitui qualquer job
    // já existente com o mesmo id em vez de duplicar.
    await db.delete(processingTasks).where(
      inArray(
        processingTasks.id,
        jobs.map((job) => job.id),
      ),
    );
    await db.insert(processingTasks).values(jobs.map((job) => ({ ...job, workspaceId })));
    return jobs;
  });

const listJobsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db
    .select()
    .from(processingTasks)
    .where(eq(processingTasks.workspaceId, workspaceId));
  return rows.map(rowToJob);
});

const listJobsByCampaignFn = createServerFn({ method: "GET" })
  .validator((campaignId: string) => campaignId)
  .handler(async ({ data: campaignId }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const rows = await db
      .select()
      .from(processingTasks)
      .where(
        and(
          eq(processingTasks.campaignId, campaignId),
          eq(processingTasks.workspaceId, workspaceId),
        ),
      );
    return rows.map(rowToJob);
  });

const getJobFn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDb();
    const rows = await db.select().from(processingTasks).where(eq(processingTasks.id, id));
    return rows[0] ? rowToJob(rows[0]) : undefined;
  });

const updateJobFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<ProspectingJob> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const db = getDb();
    await db.update(processingTasks).set(patch).where(eq(processingTasks.id, id));
    const rows = await db.select().from(processingTasks).where(eq(processingTasks.id, id));
    return rows[0] ? rowToJob(rows[0]) : undefined;
  });

export const jobRepository = {
  createMany: (jobs: ProspectingJob[]): Promise<ProspectingJob[]> =>
    createManyJobsFn({ data: jobs }),
  list: (): Promise<ProspectingJob[]> => listJobsFn(),
  listByCampaign: (campaignId: string): Promise<ProspectingJob[]> =>
    listJobsByCampaignFn({ data: campaignId }),
  get: (id: string): Promise<ProspectingJob | undefined> => getJobFn({ data: id }),
  update: (id: string, patch: Partial<ProspectingJob>): Promise<ProspectingJob | undefined> =>
    updateJobFn({ data: { id, patch } }),
};
