import { describe, expect, test } from "bun:test";
import { isLeadStillProcessing } from "./pipeline";

describe("isLeadStillProcessing", () => {
  const startedAt = 1_000_000;
  const timeoutMs = 90_000;

  test("Encontrado (recém-criado, single-lead ainda não iniciou) -> ainda processando", () => {
    expect(isLeadStillProcessing("Encontrado", startedAt, startedAt + 100, timeoutMs)).toBe(true);
  });

  test("Enriquecendo (primeiro estágio concluído) -> ainda processando, não encerra cedo", () => {
    expect(isLeadStillProcessing("Enriquecendo", startedAt, startedAt + 2000, timeoutMs)).toBe(
      true,
    );
  });

  test("Validando -> ainda processando", () => {
    expect(isLeadStillProcessing("Validando", startedAt, startedAt + 5000, timeoutMs)).toBe(true);
  });

  test("Analisando -> ainda processando", () => {
    expect(isLeadStillProcessing("Analisando", startedAt, startedAt + 8000, timeoutMs)).toBe(true);
  });

  test("Diagnóstico concluído -> ainda processando (falta scoring/opportunities/copy)", () => {
    expect(
      isLeadStillProcessing("Diagnóstico concluído", startedAt, startedAt + 10000, timeoutMs),
    ).toBe(true);
  });

  test("Aguardando aprovação -> único estado terminal, encerra o acompanhamento", () => {
    expect(
      isLeadStillProcessing("Aguardando aprovação", startedAt, startedAt + 12000, timeoutMs),
    ).toBe(false);
  });

  test("Aguardando aprovação mesmo bem antes do timeout -> encerra imediatamente", () => {
    expect(isLeadStillProcessing("Aguardando aprovação", startedAt, startedAt + 1, timeoutMs)).toBe(
      false,
    );
  });

  test("estado intermediário além do timeout -> encerra por timeout defensivo", () => {
    expect(
      isLeadStillProcessing("Validando", startedAt, startedAt + timeoutMs + 1, timeoutMs),
    ).toBe(false);
  });

  test("estado intermediário exatamente no limite do timeout -> não conta mais como pendente", () => {
    expect(isLeadStillProcessing("Encontrado", startedAt, startedAt + timeoutMs, timeoutMs)).toBe(
      false,
    );
  });

  test("estado comercial pós-aprovação (ex.: já aprovado e avançou no Kanban) -> não deveria surgir aqui, mas não trava: só Aguardando aprovação é tratado como terminal explícito, outros saem só por timeout", () => {
    expect(
      isLeadStillProcessing("Pronto para contato", startedAt, startedAt + 100, timeoutMs),
    ).toBe(true);
  });
});
