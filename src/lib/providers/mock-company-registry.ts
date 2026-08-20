import type { CompanyRegistryProvider, RegistryCompanyData } from "../providers";

// Fase E.2 — provider padrão (sem configuração extra), nunca faz chamada de
// rede. O contrato de CompanyRegistryProvider recebe só o CNPJ (nunca dados
// da empresa), então a resposta simulada é genérica por design — serve para
// exercitar o fluxo Enrichment -> CNPJ Resolution -> Registry Lookup
// localmente sem depender de rede, não para representar dados realistas.
export class MockCompanyRegistryProvider implements CompanyRegistryProvider {
  async lookup(cnpj: string): Promise<RegistryCompanyData | null> {
    return {
      cnpj,
      legalName: "Empresa Simulada LTDA",
      registrationStatus: "Ativa",
      primaryCnae: "9602-5/01 - Cabeleireiros, manicure e pedicure (simulado)",
      secondaryCnaes: [],
      openedAt: "2015-01-01",
      size: "ME",
      legalNature: "Sociedade Empresária Limitada",
      address: "Rua Simulada, 100",
      city: "Curitiba",
      state: "PR",
      postalCode: "80000-000",
    };
  }
}

export const mockCompanyRegistryProvider = new MockCompanyRegistryProvider();
