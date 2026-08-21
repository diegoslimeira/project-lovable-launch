import type { CompanyLocatorProvider, LocatorResolution, RegistryCompanyData } from "../providers";

// Fase F.1 — provider padrão (sem configuração extra), nunca faz chamada de
// rede. Sempre "encontra" um placeId determinístico a partir do CNPJ (mesmo
// padrão de mock-cnpj-resolver.ts: determinístico, não Math.random(), para
// que o mesmo cadastro produza sempre o mesmo resultado simulado) — deixa
// claro em `source`/`reason` que é simulado, nunca deve ser confundido com um
// resultado real do Google Places.
export class MockCompanyLocatorProvider implements CompanyLocatorProvider {
  async locate(registry: RegistryCompanyData): Promise<LocatorResolution> {
    const placeId = `mock-place-${registry.cnpj}`;
    const name = registry.tradeName || registry.legalName;
    return {
      outcome: "high_confidence",
      placeId,
      name,
      address: registry.address,
      confidence: 90,
      candidates: [
        {
          placeId,
          name,
          address: registry.address,
          city: registry.city,
          state: registry.state,
          nameSimilarityScore: 1,
          cityMatches: true,
          stateMatches: true,
          confirmed: true,
        },
      ],
      reason: "Resultado simulado (Mock Company Locator) — nenhuma chamada real foi feita.",
      source: "Mock Company Locator",
      sourceRecord: {
        source: "Mock Company Locator",
        externalId: placeId,
        collectedAt: new Date().toISOString(),
        method: "mock",
        confidence: 90,
      },
    };
  }
}

export const mockCompanyLocatorProvider = new MockCompanyLocatorProvider();
