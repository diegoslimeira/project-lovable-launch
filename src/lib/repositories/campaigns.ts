import { createServerFn } from "@tanstack/react-start";
import { and, eq, ne } from "drizzle-orm";
import { MANUAL_LEADS_CAMPAIGN_ID, type Campaign } from "../prospecting";
import { ensureWorkspace, getCurrentWorkspaceId, getDb } from "../db/client";
import { campaigns } from "../db/schema";

// Fase B — mesmo nome/API pública de antes (campaignRepository.list/get/
// create/update), agora assíncrona e apoiada em D1 via server functions
// (o browser nunca acessa o banco diretamente). workspaceId sempre vem do
// stub resolvido no servidor (getCurrentWorkspaceId), nunca do cliente.
//
// Fase C.1 — a lógica de cada operação vive nas funções `xxxDirect` abaixo,
// puras (sem createServerFn). Os handlers createServerFn (só usados pelo
// browser) são wrappers finos em cima delas. `campaignRepositoryDirect` é
// para qualquer código já rodando no servidor fora do ciclo de vida de uma
// request HTTP do TanStack Start (hoje: o consumer da fila de prospecção) —
// createServerFn exige um "Start context" via AsyncLocalStorage que só
// existe dentro de requests roteadas pelo próprio TanStack Start; o
// consumer de Cloudflare Queue é um entrypoint separado do Worker que nunca
// passa por ali, então chamar `campaignRepository.get()` (a versão
// createServerFn) de dentro do consumer lança "No Start context found".

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

// Fase F — a campanha-sistema de leads manuais (MANUAL_LEADS_CAMPAIGN_ID)
// nunca aparece aqui: não é uma campanha de Discovery de verdade (sem
// progresso, sem jobs, sem sentido de "quantidade desejada"), então é
// filtrada na origem — todo consumidor desta função (dashboard, listagem de
// campanhas, etc.) fica automaticamente protegido sem precisar lembrar de
// filtrar. getCampaignDirect(id) continua funcionando normalmente para quem
// pedir essa campanha explicitamente por id (ex.: processamento de lead
// manual, que precisa ler offer/objective/decisionMakers dela).
async function listCampaignsDirect(): Promise<Campaign[]> {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.workspaceId, workspaceId), ne(campaigns.id, MANUAL_LEADS_CAMPAIGN_ID)));
  return rows.map(rowToCampaign);
}

async function getCampaignDirect(id: string): Promise<Campaign | undefined> {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)));
  return rows[0] ? rowToCampaign(rows[0]) : undefined;
}

async function createCampaignDirect(campaign: Campaign): Promise<Campaign> {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  await ensureWorkspace(db, workspaceId);
  await db.insert(campaigns).values({ ...campaign, workspaceId });
  return campaign;
}

async function updateCampaignDirect(
  id: string,
  patch: Partial<Campaign>,
): Promise<Campaign | undefined> {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  await db
    .update(campaigns)
    .set(patch)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)));
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return rows[0] ? rowToCampaign(rows[0]) : undefined;
}

export const campaignRepositoryDirect = {
  create: createCampaignDirect,
  list: listCampaignsDirect,
  get: getCampaignDirect,
  update: updateCampaignDirect,
};

const listCampaignsFn = createServerFn({ method: "GET" }).handler(listCampaignsDirect);

const getCampaignFn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => getCampaignDirect(id));

const createCampaignFn = createServerFn({ method: "POST" })
  .validator((campaign: Campaign) => campaign)
  .handler(async ({ data: campaign }) => createCampaignDirect(campaign));

const updateCampaignFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Campaign> }) => input)
  .handler(async ({ data: { id, patch } }) => updateCampaignDirect(id, patch));

export const campaignRepository = {
  create: (campaign: Campaign): Promise<Campaign> => createCampaignFn({ data: campaign }),
  list: (): Promise<Campaign[]> => listCampaignsFn(),
  get: (id: string): Promise<Campaign | undefined> => getCampaignFn({ data: id }),
  update: (id: string, patch: Partial<Campaign>): Promise<Campaign | undefined> =>
    updateCampaignFn({ data: { id, patch } }),
};
