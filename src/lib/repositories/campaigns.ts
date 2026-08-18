import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import type { Campaign } from "../prospecting";
import { ensureWorkspace, getCurrentWorkspaceId, getDb } from "../db/client";
import { campaigns } from "../db/schema";

// Fase B — mesmo nome/API pública de antes (campaignRepository.list/get/
// create/update), agora assíncrona e apoiada em D1 via server functions
// (o browser nunca acessa o banco diretamente). workspaceId sempre vem do
// stub resolvido no servidor (getCurrentWorkspaceId), nunca do cliente.

type CampaignRow = typeof campaigns.$inferSelect;

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    location: row.location,
    radius: row.radius,
    quantity: row.quantity,
    decisionMakers: row.decisionMakers,
    offer: row.offer,
    objective: row.objective,
    channels: row.channels,
    createdAt: row.createdAt,
    progress: row.progress,
  };
}

const listCampaignsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId));
  return rows.map(rowToCampaign);
});

const getCampaignFn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const rows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)));
    return rows[0] ? rowToCampaign(rows[0]) : undefined;
  });

const createCampaignFn = createServerFn({ method: "POST" })
  .validator((campaign: Campaign) => campaign)
  .handler(async ({ data: campaign }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    await ensureWorkspace(db, workspaceId);
    await db.insert(campaigns).values({ ...campaign, workspaceId });
    return campaign;
  });

const updateCampaignFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Campaign> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    await db
      .update(campaigns)
      .set(patch)
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)));
    const rows = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return rows[0] ? rowToCampaign(rows[0]) : undefined;
  });

export const campaignRepository = {
  create: (campaign: Campaign): Promise<Campaign> => createCampaignFn({ data: campaign }),
  list: (): Promise<Campaign[]> => listCampaignsFn(),
  get: (id: string): Promise<Campaign | undefined> => getCampaignFn({ data: id }),
  update: (id: string, patch: Partial<Campaign>): Promise<Campaign | undefined> =>
    updateCampaignFn({ data: { id, patch } }),
};
