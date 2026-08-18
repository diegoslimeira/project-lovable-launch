import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { workspaces } from "./schema";

// Nitro's cloudflare-module preset sets `globalThis.__env__` to the Workers
// `env` on every request, identically in dev (via wrangler's local bindings
// proxy) and in production (via the real Workers `fetch(request, env, ctx)`
// entry) — see node_modules/nitro/dist/presets/cloudflare/runtime/
// {plugin.dev.mjs,_module-handler.mjs}. This is the framework's own sanctioned
// way to reach bindings from arbitrary server code, so no custom
// AsyncLocalStorage/context plumbing is needed here.
type CloudflareEnv = { DB: D1Database };

function getCloudflareEnv(): CloudflareEnv {
  const env = (globalThis as { __env__?: CloudflareEnv }).__env__;
  if (!env?.DB) {
    throw new Error(
      'D1 binding "DB" not available. In dev, make sure wrangler.jsonc declares it and the dev server was restarted; in production, make sure the Worker\'s D1 binding is configured.',
    );
  }
  return env;
}

export function getDb() {
  return drizzle(getCloudflareEnv().DB, { schema });
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
