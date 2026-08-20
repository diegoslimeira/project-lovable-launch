import type { D1Database, Queue } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import type { ProspectingJob } from "../pipeline";
import * as schema from "./schema";
import { workspaces } from "./schema";

// Fase C.2 — payload da fila de processamento de prospecção, para campanhas
// de Discovery em lote. Uma mensagem representa "processe este lote (offset)
// desta etapa (stage) desta campanha" — nunca carrega Campaign/Lead inteiros
// nem uma ação genérica start/resume: o consumer sempre busca o estado atual
// no D1 (que continua sendo a única fonte de verdade) e decide o que fazer a
// partir de stage+offset. Isso é o que permite processar campanhas grandes em
// muitas invocações pequenas em vez de uma única execução longa.
export type BatchStageMessage = {
  kind: "batch";
  campaignId: string;
  stage: ProspectingJob["stage"];
  offset: number;
};

// Fase F — payload para processar UM lead fora do modelo de lote (ex.: lead
// cadastrado manualmente, sem Discovery). Nunca usa processingTasks/offset:
// não há "próximo lote" para 1 lead só — o progresso é o próprio
// lead.evidence (mesmo guard por etapa que já existe em cada stage runner).
// Encadeamento idêntico ao caminho em lote (self-chaining via nova mensagem
// para a próxima etapa), só que por lead em vez de por campanha+offset.
export type SingleLeadStageMessage = {
  kind: "single-lead";
  leadId: string;
  stage: Exclude<ProspectingJob["stage"], "discovery">;
};

export type ProspectingQueueMessage = BatchStageMessage | SingleLeadStageMessage;

// Nitro's cloudflare-module preset sets `globalThis.__env__` to the Workers
// `env` on every request, identically in dev (via wrangler's local bindings
// proxy) and in production (via the real Workers `fetch(request, env, ctx)`
// entry) — see node_modules/nitro/dist/presets/cloudflare/runtime/
// {plugin.dev.mjs,_module-handler.mjs}. This is the framework's own sanctioned
// way to reach bindings from arbitrary server code, so no custom
// AsyncLocalStorage/context plumbing is needed here.
// Fase D — GOOGLE_PLACES_API_KEY e DISCOVERY_PROVIDER nunca são declarados em
// wrangler.jsonc (que é versionado): a chave é secret (`wrangler secret put`
// em produção, `.dev.vars` — gitignorado — localmente) e o seletor de
// provider é passado por variável de ambiente/flag de deploy, não commitado,
// para que o comportamento padrão em qualquer checkout novo continue sendo o
// mock (nunca disparar chamadas reais/pagas sem configuração explícita).
type CloudflareEnv = {
  DB: D1Database;
  PROSPECTING_QUEUE: Queue<ProspectingQueueMessage>;
  GOOGLE_PLACES_API_KEY?: string;
  DISCOVERY_PROVIDER?: string;
  // Fase E.1 — mesmo padrão do DISCOVERY_PROVIDER: seletor por env/var de
  // deploy, nunca commitado, padrão ausente = mock.
  ENRICHMENT_PROVIDER?: string;
  // Fase E.2 — mesmo padrão: dois seletores independentes (CnpjResolver e
  // CompanyRegistryProvider são etapas conceitualmente distintas dentro do
  // Enrichment, ver prospecting-service.ts), nunca commitados, padrão
  // ausente = mock para ambos.
  CNPJ_RESOLVER_PROVIDER?: string;
  COMPANY_REGISTRY_PROVIDER?: string;
};

function getCloudflareEnv(): CloudflareEnv {
  const env = (globalThis as { __env__?: CloudflareEnv }).__env__;
  if (!env) {
    throw new Error(
      "Cloudflare bindings not available on globalThis.__env__. In dev, make sure the dev server was restarted after editing wrangler.jsonc; in production, make sure the Worker's bindings are configured.",
    );
  }
  return env;
}

export function getDb() {
  const env = getCloudflareEnv();
  if (!env.DB) {
    throw new Error(
      'D1 binding "DB" not available. In dev, make sure wrangler.jsonc declares it and the dev server was restarted; in production, make sure the Worker\'s D1 binding is configured.',
    );
  }
  return drizzle(env.DB, { schema });
}

export function getProspectingQueue(): Queue<ProspectingQueueMessage> {
  const env = getCloudflareEnv();
  if (!env.PROSPECTING_QUEUE) {
    throw new Error(
      'Queue binding "PROSPECTING_QUEUE" not available. In dev, make sure wrangler.jsonc declares it under "queues" and the dev server was restarted; in production, make sure the queue exists (wrangler queues create) and the Worker\'s binding is configured.',
    );
  }
  return env.PROSPECTING_QUEUE;
}

// Fase D — a chave só existe no lado servidor (nunca no bundle do
// frontend, já que este módulo só roda em server functions/consumer da
// fila) e nunca tem fallback hardcoded: se não estiver configurada, falha
// explicitamente em vez de silenciosamente usar mock ou uma chave inválida.
// Nunca logar o valor retornado por esta função.
// Fase E.1 — a mesma secret é reutilizada pelo GooglePlacesEnrichmentProvider
// (Place Details); nenhuma chave nova foi criada.
export function getGooglePlacesApiKey(): string {
  const env = getCloudflareEnv();
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY não configurada. Configure como secret do Worker " +
        "(wrangler secret put GOOGLE_PLACES_API_KEY) em produção, ou em .dev.vars " +
        "(gitignorado) localmente, antes de usar um provider real do Google Places.",
    );
  }
  return env.GOOGLE_PLACES_API_KEY;
}

// Fase D — seletor de provider de discovery, lido de env/var de deploy (não
// commitado). Qualquer valor ausente ou diferente de "google_places" mantém
// o comportamento padrão seguro: mock.
export function getDiscoveryProviderSelector(): string | undefined {
  return getCloudflareEnv().DISCOVERY_PROVIDER;
}

// Fase E.1 — mesmo padrão acima, para o provider de enrichment.
export function getEnrichmentProviderSelector(): string | undefined {
  return getCloudflareEnv().ENRICHMENT_PROVIDER;
}

// Fase E.2 — mesmo padrão, para CnpjResolver e CompanyRegistryProvider
// (ambos rodam dentro da etapa de Enrichment, não são etapas novas do
// pipeline).
export function getCnpjResolverProviderSelector(): string | undefined {
  return getCloudflareEnv().CNPJ_RESOLVER_PROVIDER;
}

export function getCompanyRegistryProviderSelector(): string | undefined {
  return getCloudflareEnv().COMPANY_REGISTRY_PROVIDER;
}

// Stub server-side workspace resolution for this phase — never trust a
// workspaceId supplied by the client. Real auth will replace this function's
// body only; every call site downstream already goes through this seam.
export function getCurrentWorkspaceId(): string {
  return "dev-workspace";
}

// Toda tabela com dado de negócio referencia workspaces.id via FK (ver
// schema.ts), mas nada nunca inseriu a própria linha do workspace stub —
// funcionava em sessões anteriores só porque uma linha "dev-workspace"
// tinha sido criada manualmente em algum teste e nunca foi apagada entre
// sessões. Num D1 realmente novo (migrations aplicadas do zero), o primeiro
// insert em qualquer tabela workspace-scoped falha com FOREIGN KEY
// constraint. Chamado uma vez por criação de campanha (a raiz de todo fluxo
// novo); idempotente via onConflictDoNothing, então repetir não tem custo
// além de um insert a mais.
export async function ensureWorkspace(db: ReturnType<typeof getDb>, workspaceId: string) {
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: "Dev Workspace", createdAt: new Date().toISOString() })
    .onConflictDoNothing();
}
