import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import type { ProspectingJob } from "../pipeline";
import { getCurrentWorkspaceId, getDb } from "../db/client";
import { processingTasks } from "../db/schema";

// Fase C.1 — mesmo padrão de src/lib/repositories/campaigns.ts: lógica pura
// em `xxxDirect`, handlers createServerFn (só para o browser) como wrappers
// finos, e `jobRepositoryDirect` para código já rodando no servidor fora do
// ciclo de request do TanStack Start (o consumer da fila de prospecção).

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

async function createManyJobsDirect(jobs: ProspectingJob[]): Promise<ProspectingJob[]> {
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
}

async function listJobsDirect(): Promise<ProspectingJob[]> {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db
    .select()
    .from(processingTasks)
    .where(eq(processingTasks.workspaceId, workspaceId));
  return rows.map(rowToJob);
}

async function listJobsByCampaignDirect(campaignId: string): Promise<ProspectingJob[]> {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db
    .select()
    .from(processingTasks)
    .where(
      and(eq(processingTasks.campaignId, campaignId), eq(processingTasks.workspaceId, workspaceId)),
    );
  return rows.map(rowToJob);
}

async function getJobDirect(id: string): Promise<ProspectingJob | undefined> {
  const db = getDb();
  const rows = await db.select().from(processingTasks).where(eq(processingTasks.id, id));
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

async function updateJobDirect(
  id: string,
  patch: Partial<ProspectingJob>,
): Promise<ProspectingJob | undefined> {
  const db = getDb();
  await db.update(processingTasks).set(patch).where(eq(processingTasks.id, id));
  const rows = await db.select().from(processingTasks).where(eq(processingTasks.id, id));
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

export const jobRepositoryDirect = {
  createMany: createManyJobsDirect,
  list: listJobsDirect,
  listByCampaign: listJobsByCampaignDirect,
  get: getJobDirect,
  update: updateJobDirect,
};

const createManyJobsFn = createServerFn({ method: "POST" })
  .validator((jobs: ProspectingJob[]) => jobs)
  .handler(async ({ data: jobs }) => createManyJobsDirect(jobs));

const listJobsFn = createServerFn({ method: "GET" }).handler(listJobsDirect);

const listJobsByCampaignFn = createServerFn({ method: "GET" })
  .validator((campaignId: string) => campaignId)
  .handler(async ({ data: campaignId }) => listJobsByCampaignDirect(campaignId));

const getJobFn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => getJobDirect(id));

const updateJobFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<ProspectingJob> }) => input)
  .handler(async ({ data: { id, patch } }) => updateJobDirect(id, patch));

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
