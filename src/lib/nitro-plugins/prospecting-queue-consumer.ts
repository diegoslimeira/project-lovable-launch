import { definePlugin } from "nitro";
import { processQueueMessage } from "../prospecting-service";
import type { ProspectingQueueMessage } from "../db/client";

// Fase C.1 — registra o handler da fila "prospecting-pipeline" no hook
// "cloudflare:queue" do Nitro (ver node_modules/nitro/dist/presets/cloudflare/
// runtime/_module-handler.mjs: queue(batch, env, context) chama esse hook).
// Precisa estar listado em `nitro.plugins` no vite.config.ts — plugins
// registrados assim rodam na inicialização do isolate, antes de qualquer
// fetch/queue/scheduled ser invocado, então funcionam mesmo num isolate frio
// que nunca serviu uma request HTTP (diferente de src/server.ts, que só é
// importado sob demanda pelo caminho de fetch).
//
// max_batch_size é 1 (ver wrangler.jsonc), então este loop sempre processa
// exatamente uma mensagem por invocação — mas escrito para lidar com lotes
// maiores corretamente também, caso a configuração mude no futuro: cada
// mensagem é ack/retry de forma independente, nunca em bloco.
export default definePlugin((nitro) => {
  nitro.hooks.hook("cloudflare:queue", async ({ batch }) => {
    for (const message of batch.messages) {
      const body = message.body as ProspectingQueueMessage;
      try {
        await processQueueMessage(body);
        message.ack();
      } catch (error) {
        console.error(
          `Falha ao processar mensagem da fila (campanha ${body.campaignId}, etapa ${body.stage}, offset ${body.offset}, tentativa ${message.attempts}):`,
          error,
        );
        message.retry();
      }
    }
  });
});
