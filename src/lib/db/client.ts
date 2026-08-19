import type { D1Database, Queue } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import type { ProspectingJob } from "../pipeline";
import * as schema from "./schema";
import { workspaces } from "./schema";

// Fase C.2 — payload da fila de processamento de prospecção. Uma mensagem
// representa "processe este lote (offset) desta etapa (stage) desta
// campanha" — nunca carrega Campaign/Lead inteiros nem uma ação genérica
// start/resume: o consumer sempre busca o estado atual no D1 (que continua
// sendo a única fonte de verdade) e decide o que fazer a partir de
// stage+offset. Isso é o que permite processar campanhas grandes em muitas
// invocações pequenas em vez de uma única execução longa.
export type ProspectingQueueMessage = {
  campaignId: string;
  stage: ProspectingJob["stage"];
  offset: number;
};

// Nitro's cloudflare-module preset sets `globalThis.__env__` to the Workers
// `env` on every request, identically in dev (via wrangler's local bindings
// proxy) and in production (via the real Workers `fetch(request, env, ctx)`
// entry) — see node_modules/nitro/dist/presets/cloudflare/runtime/
// {plugin.dev.mjs,_module-handler.mjs}. This is the framework's own sanctioned
// way to reach bindings from arbitrary server code, so no custom
// AsyncLocalStorage/context plumbing is needed here.
type CloudflareEnv = { DB: D1Database; PROSPECTING_QUEUE: Queue<ProspectingQueueMessage> };

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
