import { describe, expect, test } from "bun:test";
import { resolveManualLeadIdentity } from "./prospecting-service";
import type { Lead } from "./prospecting";
import type {
  CompanyLocatorProvider,
  CompanyRegistryProvider,
  LocatorResolution,
  RegistryCompanyData,
} from "./providers";

// Fase F.1 — resolveManualLeadIdentity é uma função de módulo (não método de
// classe) recebendo os providers como parâmetros explícitos exatamente para
// permitir estes fakes: nenhum D1, nenhuma rede, nenhuma instância de
// ProspectingService necessária.

function manualLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "manual-lead-1",
    campaignId: "system-manual-leads",
    company: "Sorriso Prime",
    segment: "",
    city: "Curitiba",
    state: "PR",
    decisionMaker: "Não localizado",
    role: "Não localizado",
    manualCnpj: "18236120000158",
    ads: false,
    score: 0,
    confidence: 0,
    opportunity: "",
    status: "Encontrado",
    evidence: [],
    diagnosis: "",
    microInsight: "",
    suggestedMessage: "",
    ...overrides,
  };
}

function registryData(overrides: Partial<RegistryCompanyData> = {}): RegistryCompanyData {
  return {
    cnpj: "18236120000158",
    legalName: "Sorriso Prime Odontologia LTDA",
    tradeName: "Sorriso Prime",
    registrationStatus: "Ativa",
    city: "Curitiba",
    state: "PR",
    ...overrides,
  };
}

// Fakes contam quantas vezes foram chamados -- usado para provar que o
// locator NUNCA é chamado quando a identidade não foi confirmada.
function fakeRegistryProvider(
  result: RegistryCompanyData | null | "throw",
): CompanyRegistryProvider & {
  calls: number;
} {
  return {
    calls: 0,
    async lookup(this: { calls: number }, _cnpj: string) {
      this.calls++;
      if (result === "throw") throw new Error("falha simulada de rede");
      return result;
    },
  } as CompanyRegistryProvider & { calls: number };
}

function fakeLocatorProvider(
  result: LocatorResolution | "throw",
): CompanyLocatorProvider & { calls: number } {
  const fake = {
    calls: 0,
    async locate(_registry: RegistryCompanyData) {
      fake.calls++;
      if (result === "throw") throw new Error("falha simulada de rede");
      return result;
    },
  };
  return fake as CompanyLocatorProvider & { calls: number };
}

describe("resolveManualLeadIdentity", () => {
  test("CNPJ não encontrado na base cadastral -> Não confirmado, locator nunca chamado", async () => {
    const registry = fakeRegistryProvider(null);
    const locator = fakeLocatorProvider({
      outcome: "high_confidence",
      confidence: 90,
      candidates: [],
      reason: "não deveria ser chamado",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.label).toBe("CNPJ");
    expect(result.evidence[0]!.type).toBe("Não confirmado");
    expect(result.lead.registryProfile).toBeUndefined();
    expect(result.lead.externalId).toBeUndefined();
    expect(locator.calls).toBe(0);
  });

  test("erro técnico ao consultar registro -> Não confirmado, locator nunca chamado", async () => {
    const registry = fakeRegistryProvider("throw");
    const locator = fakeLocatorProvider({
      outcome: "high_confidence",
      confidence: 90,
      candidates: [],
      reason: "não deveria ser chamado",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.type).toBe("Não confirmado");
    expect(locator.calls).toBe(0);
  });

  // Fase F.1.1 — caso real do teste remoto controlado: usuário cadastrou
  // "Jacomar Supermercado" em Curitiba/PR; o CNPJ 78.413.325/0001-93 é
  // válido e o OpenCNPJ o encontra, mas devolve razão social "SUPERMERCADO
  // JACOMAR LTDA" com sede cadastral em São José dos Pinhais/PR (matriz e
  // filial operacional em municípios diferentes). O comportamento ANTIGO
  // rejeitava esse caso inteiro (nome/cidade/UF viravam bloqueio absoluto).
  // O comportamento CORRIGIDO: CNPJ válido + encontrado é o suficiente para
  // "identity_confirmed_with_warnings" — identidade confirmada, locator
  // roda normalmente com os dados oficiais, e a divergência vira uma
  // evidência de alerta separada, nunca um bloqueio.
  test("Jacomar real: nome/cidade divergem mas CNPJ confere -> identidade confirmada COM alerta, locator roda, externalId persiste", async () => {
    const jacomarLead = manualLead({
      company: "Jacomar Supermercado",
      city: "Curitiba",
      state: "PR",
      manualCnpj: "78413325000193",
    });
    const registry = fakeRegistryProvider(
      registryData({
        cnpj: "78413325000193",
        legalName: "SUPERMERCADO JACOMAR LTDA",
        tradeName: undefined,
        city: "São José dos Pinhais",
        state: "PR",
      }),
    );
    const locator = fakeLocatorProvider({
      outcome: "high_confidence",
      placeId: "ChIJ-jacomar-real",
      name: "Jacomar Supermercado",
      address: "Av. Exemplo, 1000 — São José dos Pinhais/PR",
      confidence: 95,
      candidates: [],
      reason: "Nome e localização conferem com o cadastro confirmado.",
      source: "Google Places",
      sourceRecord: {
        source: "Google Places",
        externalId: "ChIJ-jacomar-real",
        collectedAt: new Date().toISOString(),
        method: "places:searchText (locator)",
        confidence: 95,
      },
    });

    const result = await resolveManualLeadIdentity(jacomarLead, registry, locator);

    // Identidade confirmada apesar da divergência de nome/cidade.
    expect(result.evidence[0]!.label).toBe("CNPJ");
    expect(result.evidence[0]!.type).toBe("Fato verificado");
    expect(result.evidence[0]!.value).toContain("CNPJ confirmado");
    // Divergência registrada como evidência própria, não como bloqueio.
    const warningEvidence = result.evidence.find((e) => e.label === "Divergência cadastral");
    expect(warningEvidence).toBeDefined();
    expect(warningEvidence!.type).toBe("Não confirmado");
    expect(warningEvidence!.value).toContain("Curitiba");
    expect(warningEvidence!.value).toContain("São José dos Pinhais");
    // Locator RODOU (identidade estava confirmada) e teve sucesso.
    expect(locator.calls).toBe(1);
    expect(result.lead.externalId).toBe("ChIJ-jacomar-real");
    expect(result.lead.registryProfile).toBeDefined();
    expect(result.lead.registryProfile!.legalName).toBe("SUPERMERCADO JACOMAR LTDA");
    expect(result.lead.registryProfile!.matchConfidence).toBe(100);
  });

  test("nome diverge mas cidade/UF conferem -> identity_confirmed_with_warnings (só o sinal que diverge vira alerta)", async () => {
    const registry = fakeRegistryProvider(
      registryData({ legalName: "Outra Razão Social LTDA", tradeName: undefined }),
    );
    const locator = fakeLocatorProvider({
      outcome: "not_found",
      confidence: 0,
      candidates: [],
      reason: "sem correspondência",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence[0]!.type).toBe("Fato verificado");
    const warningEvidence = result.evidence.find((e) => e.label === "Divergência cadastral");
    expect(warningEvidence).toBeDefined();
    expect(warningEvidence!.value).toContain("nome informado");
    expect(warningEvidence!.value).not.toContain("cidade informada");
    expect(locator.calls).toBe(1);
    expect(result.lead.registryProfile).toBeDefined();
  });

  test("tudo confere (sem divergência) -> identity_confirmed, SEM evidência de alerta", async () => {
    const registry = fakeRegistryProvider(registryData());
    const locator = fakeLocatorProvider({
      outcome: "not_found",
      confidence: 0,
      candidates: [],
      reason: "sem correspondência",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence).toHaveLength(2); // CNPJ + Localização, sem "Divergência cadastral"
    expect(result.evidence.some((e) => e.label === "Divergência cadastral")).toBe(false);
  });

  // Fase F.1.1 — único bloqueio real de identidade além de "não encontrado":
  // o registro devolvido não é do CNPJ pedido (nunca deveria acontecer com
  // um provider correto, mas é o único caso que realmente compromete "de
  // qual empresa estamos falando" — nome/cidade/UF divergentes NÃO bloqueiam
  // mais, ver testes acima).
  test("registro devolvido é de outro CNPJ -> identity_rejected, locator nunca chamado", async () => {
    const registry = fakeRegistryProvider(registryData({ cnpj: "99999999000191" }));
    const locator = fakeLocatorProvider({
      outcome: "high_confidence",
      confidence: 90,
      candidates: [],
      reason: "não deveria ser chamado",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.label).toBe("CNPJ");
    expect(result.evidence[0]!.type).toBe("Não confirmado");
    expect(result.evidence[0]!.value).toContain("não corresponde");
    expect(result.lead.registryProfile).toBeUndefined();
    expect(result.lead.externalId).toBeUndefined();
    expect(locator.calls).toBe(0);
  });

  test("identidade confirmada + locator high_confidence -> registryProfile e externalId persistidos", async () => {
    const registry = fakeRegistryProvider(registryData());
    const locator = fakeLocatorProvider({
      outcome: "high_confidence",
      placeId: "ChIJ-fake-place-id",
      name: "Sorriso Prime",
      address: "Rua X, 123 — Curitiba/PR",
      confidence: 95,
      candidates: [],
      reason: "Nome e localização conferem com o cadastro confirmado.",
      source: "Google Places",
      sourceRecord: {
        source: "Google Places",
        externalId: "ChIJ-fake-place-id",
        collectedAt: new Date().toISOString(),
        method: "places:searchText (locator)",
        confidence: 95,
      },
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0]!.label).toBe("CNPJ");
    expect(result.evidence[0]!.type).toBe("Fato verificado");
    expect(result.evidence[1]!.label).toBe("Localização");
    expect(result.evidence[1]!.type).toBe("Fato verificado");
    expect(result.lead.externalId).toBe("ChIJ-fake-place-id");
    expect(result.lead.registryProfile).toBeDefined();
    expect(result.lead.registryProfile!.legalName).toBe("Sorriso Prime Odontologia LTDA");
    expect(result.lead.registryProfile!.matchSource).toBe("Manual");
    expect(result.lead.registryProfile!.registrySource).toBe("OpenCNPJ");
    expect(locator.calls).toBe(1);
  });

  test("identidade confirmada + locator ambiguous -> registryProfile persiste, externalId NÃO é preenchido", async () => {
    const registry = fakeRegistryProvider(registryData());
    const locator = fakeLocatorProvider({
      outcome: "ambiguous",
      confidence: 0,
      candidates: [],
      reason: "2 resultados diferentes correspondem ao cadastro com confiança",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[1]!.label).toBe("Localização");
    expect(result.evidence[1]!.type).toBe("Não confirmado");
    expect(result.evidence[1]!.value).toContain("Mais de uma empresa");
    expect(result.lead.externalId).toBeUndefined();
    expect(result.lead.registryProfile).toBeDefined();
  });

  test("identidade confirmada + locator not_found -> registryProfile persiste, externalId NÃO é preenchido", async () => {
    const registry = fakeRegistryProvider(registryData());
    const locator = fakeLocatorProvider({
      outcome: "not_found",
      confidence: 0,
      candidates: [],
      reason: "Nenhum resultado retornado pelo Google Places para esta busca.",
      source: "Google Places",
    });

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    expect(result.evidence[1]!.type).toBe("Não confirmado");
    expect(result.evidence[1]!.value).toContain("não localizada");
    expect(result.lead.externalId).toBeUndefined();
    expect(result.lead.registryProfile).toBeDefined();
  });

  test("identidade confirmada + falha técnica no locator -> registryProfile PERMANECE, externalId ausente", async () => {
    const registry = fakeRegistryProvider(registryData());
    const locator = fakeLocatorProvider("throw");

    const result = await resolveManualLeadIdentity(manualLead(), registry, locator);

    // Dois portões independentes: uma falha técnica ao localizar não deve
    // apagar uma identidade cadastral já confirmada com sucesso.
    expect(result.lead.registryProfile).toBeDefined();
    expect(result.lead.externalId).toBeUndefined();
    expect(result.evidence[1]!.label).toBe("Localização");
    expect(result.evidence[1]!.type).toBe("Não confirmado");
  });

  test("nunca lança, mesmo com providers falhando", async () => {
    const registry = fakeRegistryProvider("throw");
    const locator = fakeLocatorProvider("throw");
    await expect(resolveManualLeadIdentity(manualLead(), registry, locator)).resolves.toBeDefined();
  });
});
