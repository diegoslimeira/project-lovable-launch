import { describe, expect, test } from "bun:test";
import { findPossibleDuplicates } from "./manual-lead";
import type { Lead, ManualLeadInput } from "./prospecting";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    campaignId: "camp-1",
    company: "Clínica Sorriso Prime",
    segment: "",
    city: "Curitiba",
    state: "PR",
    decisionMaker: "Não localizado",
    role: "Não localizado",
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

function input(overrides: Partial<ManualLeadInput> = {}): ManualLeadInput {
  return { company: "Clínica Sorriso Prime", city: "Curitiba", state: "PR", ...overrides };
}

describe("findPossibleDuplicates", () => {
  test("CNPJ exato -> sinal forte", () => {
    const existing = lead({ manualCnpj: "18236120000158" });
    const result = findPossibleDuplicates(input({ cnpj: "18.236.120/0001-58" }), [existing]);
    expect(result).toHaveLength(1);
    expect(result[0]!.signals).toContain("cnpj");
    expect(result[0]!.strength).toBe("alta");
  });

  test("CNPJ exato contra registryProfile.cnpj confirmado -> também detecta", () => {
    const existing = lead({
      registryProfile: {
        cnpj: "18236120000158",
        legalName: "Sorriso Prime LTDA",
        registrationStatus: "Ativa",
        matchConfidence: 100,
        matchSource: "WebsiteCnpjResolver",
        matchEvidence: [],
        registrySource: "OpenCNPJ",
        registryFetchedAt: new Date().toISOString(),
      },
    });
    const result = findPossibleDuplicates(input({ cnpj: "18.236.120/0001-58" }), [existing]);
    expect(result[0]!.signals).toContain("cnpj");
  });

  test("mesmo domínio -> sinal médio", () => {
    const existing = lead({ website: "sorrisoprime.com.br" });
    const result = findPossibleDuplicates(
      input({
        company: "Outra Empresa",
        city: "São Paulo",
        state: "SP",
        website: "https://sorrisoprime.com.br/contato",
      }),
      [existing],
    );
    expect(result[0]!.signals).toEqual(["domain"]);
    expect(result[0]!.strength).toBe("media");
  });

  test("mesmo telefone -> sinal médio", () => {
    const existing = lead({ phone: "(41) 99999-1200" });
    const result = findPossibleDuplicates(
      input({ company: "Outra Empresa", city: "São Paulo", state: "SP", phone: "41999991200" }),
      [existing],
    );
    expect(result[0]!.signals).toEqual(["phone"]);
    expect(result[0]!.strength).toBe("media");
  });

  test("nome parecido + cidade/UF batendo -> sinal fraco", () => {
    const existing = lead({ company: "Sorriso Prime Odontologia" });
    const result = findPossibleDuplicates(input({ company: "Clínica Sorriso Prime" }), [existing]);
    expect(result[0]!.signals).toEqual(["name_location"]);
    expect(result[0]!.strength).toBe("baixa");
  });

  test("nome parecido mas cidade diferente -> não sinaliza (sinal fraco exige local batendo)", () => {
    const existing = lead({ company: "Sorriso Prime Odontologia", city: "São Paulo", state: "SP" });
    const result = findPossibleDuplicates(input({ company: "Clínica Sorriso Prime" }), [existing]);
    expect(result).toEqual([]);
  });

  test("nenhum sinal em comum -> lista vazia (nunca bloqueia sem motivo)", () => {
    const existing = lead({ company: "Auto Peças União", city: "Recife", state: "PE" });
    const result = findPossibleDuplicates(input(), [existing]);
    expect(result).toEqual([]);
  });

  test("CNPJ + domínio + telefone simultâneos -> continua alta (CNPJ domina)", () => {
    const existing = lead({
      manualCnpj: "18236120000158",
      website: "sorrisoprime.com.br",
      phone: "41999991200",
    });
    const result = findPossibleDuplicates(
      input({ cnpj: "18236120000158", website: "sorrisoprime.com.br", phone: "41999991200" }),
      [existing],
    );
    expect(result[0]!.strength).toBe("alta");
    expect(result[0]!.signals.length).toBeGreaterThan(1);
  });

  test("ordena por força (alta antes de média antes de baixa) e limita a 5", () => {
    const leads = [
      lead({ id: "l1", company: "Zzz Weak Match", website: undefined }),
      lead({ id: "l2", company: "Empresa Média", website: "match-domain.com.br" }),
      lead({ id: "l3", company: "Empresa Forte", manualCnpj: "18236120000158" }),
    ];
    const result = findPossibleDuplicates(
      input({
        company: "Clínica Sorriso Prime",
        cnpj: "18236120000158",
        website: "match-domain.com.br",
      }),
      leads,
    );
    expect(result[0]!.leadId).toBe("l3");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  test("nunca lança e nunca bloqueia sozinho: retorna array, não boolean/throw", () => {
    const result = findPossibleDuplicates(input(), []);
    expect(Array.isArray(result)).toBe(true);
  });
});
