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
  }): Promise<CompanyCandidate[]> {
    const { city, state } = splitLocation(input.location);
    const count = Math.max(0, Math.min(Math.floor(input.limit), 1000));
    const category = input.segment.trim() || "Empresas";

    return Array.from({ length: count }, (_, index) => ({
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
    }));
  }
}

export const mockLeadDiscoveryProvider = new MockLeadDiscoveryProvider();
