import type { CompanyCandidate, LeadDiscoveryProvider } from "../providers";

function splitLocation(location: string) {
  const [city, state] = location.split("/").map((value) => value.trim());
  return { city: city || location.trim(), state: state || "" };
}

export class MockLeadDiscoveryProvider implements LeadDiscoveryProvider {
  async discover(input: {
    segment: string;
    location: string;
    radiusKm: number;
    limit: number;
    offset?: number;
  }): Promise<CompanyCandidate[]> {
    const { city, state } = splitLocation(input.location);
    const count = Math.max(0, Math.floor(input.limit));
    const startIndex = Math.max(0, Math.floor(input.offset ?? 0));
    const category = input.segment.trim() || "Empresas";

    // Geração determinística por índice global (offset + posição no lote):
    // pedir o mesmo offset/limit sempre produz os mesmos candidatos, o que
    // permite ao orquestrador (Fase C.2) buscar discovery em lotes pequenos
    // sem depender de estado interno do provider entre chamadas.
    return Array.from({ length: count }, (_, i) => {
      const index = startIndex + i;
      return {
        name: `${category} Demo ${String(index + 1).padStart(3, "0")}`,
        address: `${city}, ${state}`.replace(/, $/, ""),
        city,
        state,
        category,
        sources: [
          {
            source: "Mock Discovery Provider",
            collectedAt: new Date().toISOString(),
            method: `mock:${input.radiusKm}km`,
            confidence: 100,
          },
        ],
      };
    });
  }
}

export const mockLeadDiscoveryProvider = new MockLeadDiscoveryProvider();
