import { describe, expect, test } from "bun:test";
import { confirmManualIdentity, confirmRegistryMatch, nameSimilarity } from "./cnpj-match";
import type { CompanyCandidate, RegistryCompanyData } from "./providers";

function company(overrides: Partial<CompanyCandidate> = {}): CompanyCandidate {
  return {
    name: "Clínica Sorriso Prime",
    city: "Curitiba",
    state: "PR",
    sources: [],
    ...overrides,
  };
}

function registry(overrides: Partial<RegistryCompanyData> = {}): RegistryCompanyData {
  return {
    cnpj: "18236120000158",
    legalName: "Sorriso Prime Odontologia LTDA",
    tradeName: "Clínica Sorriso Prime",
    registrationStatus: "Ativa",
    city: "Curitiba",
    state: "PR",
    ...overrides,
  };
}

describe("nameSimilarity", () => {
  test("nome fantasia idêntico ao nome do lead -> similaridade máxima", () => {
    expect(nameSimilarity("Clínica Sorriso Prime", registry())).toBe(1);
  });

  test("razão social bem diferente do fantasia ainda casa via nome fantasia", () => {
    const score = nameSimilarity(
      "Clínica Sorriso Prime",
      registry({ legalName: "JMR Serviços Odontológicos Associados LTDA" }),
    );
    expect(score).toBe(1);
  });

  test("nomes completamente diferentes -> similaridade baixa/zero", () => {
    const score = nameSimilarity(
      "Clínica Sorriso Prime",
      registry({ legalName: "Auto Peças União LTDA", tradeName: "Auto Peças União" }),
    );
    expect(score).toBeLessThan(0.2);
  });

  test("ignora sufixos societários (LTDA/ME/EPP) na comparação", () => {
    const score = nameSimilarity(
      "Odonto Batel",
      registry({ legalName: "Odonto Batel LTDA ME", tradeName: undefined }),
    );
    expect(score).toBeGreaterThan(0.9);
  });

  // Caso real do teste de cobertura de 5 leads (Fase E.2): o nome de exibição
  // do Google Places carrega uma tagline de marketing colada com "|", que
  // diluía o score antigo (shared / MAX) para 0.286 — abaixo do threshold
  // antigo (0.34) mesmo com o nome fantasia oficial 100% contido no nome do
  // lead. Dados exatamente como capturados no teste real, nenhuma chamada
  // nova.
  test("[caso real] tagline de marketing do Google Places não dilui mais o score (Smile Lovers)", () => {
    const score = nameSimilarity(
      "Clínica Smile Lovers | Seu dentista no Batel em Curitiba",
      registry({ legalName: "SMILE LOVERS LTDA", tradeName: "SMILE LOVERS" }),
    );
    expect(score).toBe(1);
  });

  test("remove tagline após hífen cercado de espaço (não hífen colado em palavra)", () => {
    const withHyphenTagline = nameSimilarity(
      "Centro Odontológico Pio XII - Dentista 24h",
      registry({ legalName: "PIO XII ODONTOLOGIA LTDA", tradeName: "PIO XII" }),
    );
    expect(withHyphenTagline).toBeGreaterThanOrEqual(0.7);

    // Hífen colado (sem espaço nos dois lados) é parte da palavra/nome
    // composto, não separador de tagline — não deve ser cortado.
    const compoundWord = nameSimilarity(
      "Água-Verde Odontologia",
      registry({ legalName: "Água-Verde Odontologia LTDA", tradeName: undefined }),
    );
    expect(compoundWord).toBe(1);
  });

  // Negativo: as duas empresas só compartilham um termo GENÉRICO de
  // estabelecimento ("odonto") — sem isso, teriam score 0, não um match por
  // coincidência de vocabulário comum do segmento.
  test("[negativo] termos genéricos de estabelecimento sozinhos não produzem match", () => {
    const score = nameSimilarity(
      "Clínica Odonto Sul",
      registry({ legalName: "ODONTO NORTE LTDA", tradeName: "Odonto Norte" }),
    );
    expect(score).toBe(0);
  });

  // Negativo: a tagline do lead menciona coincidentemente uma palavra que
  // aparece no nome fantasia de uma empresa TOTALMENTE diferente — a remoção
  // de tagline evita que esse ruído produza um match falso.
  test("[negativo] palavra só presente na tagline descartada não conta como sinal", () => {
    const score = nameSimilarity(
      "Clínica Bela Vista | Atendimento com sorriso perfeito garantido",
      registry({ legalName: "Sorriso Prime Odontologia LTDA", tradeName: "Sorriso Prime" }),
    );
    expect(score).toBe(0);
  });

  // Negativo: nomes com alguma palavra comum mas identidades claramente
  // diferentes (sem termo genérico nem tagline envolvidos neste caso).
  test("[negativo] uma única palavra comum entre nomes distintos não é suficiente", () => {
    const score = nameSimilarity(
      "Estúdio Fit Academia",
      registry({ legalName: "Fit Motors Peças Automotivas LTDA", tradeName: "Fit Motors" }),
    );
    expect(score).toBeLessThan(0.7);
  });
});

describe("confirmRegistryMatch", () => {
  test("nome + cidade + UF batendo -> confirmado", () => {
    const result = confirmRegistryMatch(company(), registry());
    expect(result.confirmed).toBe(true);
    expect(result.cityMatches).toBe(true);
    expect(result.stateMatches).toBe(true);
  });

  test("cidade divergente entre lead e registro -> não confirmado", () => {
    const result = confirmRegistryMatch(
      company({ city: "Curitiba" }),
      registry({ city: "São Paulo" }),
    );
    expect(result.confirmed).toBe(false);
    expect(result.cityMatches).toBe(false);
  });

  test("UF divergente -> não confirmado mesmo com nome idêntico", () => {
    const result = confirmRegistryMatch(company({ state: "PR" }), registry({ state: "SP" }));
    expect(result.confirmed).toBe(false);
    expect(result.stateMatches).toBe(false);
  });

  test("cidade ausente em um dos lados não bloqueia (sem dado para contradizer)", () => {
    const result = confirmRegistryMatch(company({ city: undefined }), registry());
    expect(result.cityMatches).toBe(true);
  });

  test("nome muito divergente -> não confirmado mesmo com cidade/UF batendo", () => {
    const result = confirmRegistryMatch(
      company(),
      registry({ legalName: "Auto Peças União LTDA", tradeName: "Auto Peças União" }),
    );
    expect(result.confirmed).toBe(false);
  });

  // Google Places (Discovery) persiste o nome completo do estado (ex.:
  // "Paraná"), enquanto o OpenCNPJ sempre devolve a sigla ("PR") — descoberto
  // ao preparar o teste real de 1 lead da Fase E.2. Sem essa normalização um
  // match genuinamente correto seria rejeitado só por formato.
  test("nome completo do estado (lead) vs. sigla (registro oficial) -> ainda confirmado", () => {
    const result = confirmRegistryMatch(company({ state: "Paraná" }), registry({ state: "PR" }));
    expect(result.stateMatches).toBe(true);
    expect(result.confirmed).toBe(true);
  });

  test("nome completo do estado divergente da sigla real -> ainda detecta divergência", () => {
    const result = confirmRegistryMatch(company({ state: "Paraná" }), registry({ state: "SP" }));
    expect(result.stateMatches).toBe(false);
    expect(result.confirmed).toBe(false);
  });

  // Ponta a ponta com os dados EXATOS capturados no teste real de cobertura
  // de 5 leads (Fase E.2) — nenhuma chamada nova, só reaplica a correção
  // sobre o resultado já observado. Antes desta correção,
  // nameSimilarityScore = 0.286 (< threshold antigo de 0.34) e o resultado
  // era B (ambíguo, não persistido). Prova que o caso passa de B para A
  // pelo motivo correto (nome fantasia oficial 100% contido no nome do lead,
  // depois de descartar a tagline e os termos genéricos) — não por um
  // threshold global mais permissivo.
  test("[caso real] Smile Lovers: nome ambíguo antes da correção agora confirma (B -> A)", () => {
    const leadCompany: CompanyCandidate = {
      name: "Clínica Smile Lovers | Seu dentista no Batel em Curitiba",
      city: "Curitiba",
      state: "Paraná",
      sources: [],
    };
    const officialData: RegistryCompanyData = {
      cnpj: "41648484000167",
      legalName: "SMILE LOVERS LTDA",
      tradeName: "SMILE LOVERS",
      registrationStatus: "Ativa",
      city: "CURITIBA",
      state: "PR",
    };

    const result = confirmRegistryMatch(leadCompany, officialData);

    // Score antigo real observado no teste de cobertura, documentado aqui
    // como referência do que a correção precisa superar.
    const OLD_SCORE_OBSERVED_IN_COVERAGE_TEST = 0.2857142857142857;
    expect(result.nameSimilarityScore).toBeGreaterThan(OLD_SCORE_OBSERVED_IN_COVERAGE_TEST);
    expect(result.nameSimilarityScore).toBe(1);
    expect(result.cityMatches).toBe(true);
    expect(result.stateMatches).toBe(true);
    expect(result.confirmed).toBe(true);
  });
});

// Fase F.1.1 — regra específica de identidade para lead MANUAL, separada de
// confirmRegistryMatch de propósito: aqui o CNPJ é a âncora primária (digitado
// diretamente pelo usuário), não uma hipótese a corroborar por nome+cidade+UF.
describe("confirmManualIdentity", () => {
  test("tudo confere -> identity_confirmed, sem warnings", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Clínica Sorriso Prime", city: "Curitiba", state: "PR" },
      registry(),
    );
    expect(result.outcome).toBe("identity_confirmed");
    expect(result.warnings).toEqual([]);
  });

  // Caso real do teste remoto controlado (lead Jacomar): CNPJ válido e
  // encontrado, mas razão social/cidade da sede cadastral divergem do que o
  // usuário digitou (matriz em outro município). ANTES desta correção, isso
  // era rejeitado por confirmRegistryMatch (nome+cidade+UF como bloqueio
  // absoluto). Agora: identidade CONFIRMADA (com alerta) — nunca rejeitada
  // só por isso.
  test("[caso real Jacomar] nome comercial + cidade divergem, CNPJ confere -> identity_confirmed_with_warnings, NÃO rejected", () => {
    const result = confirmManualIdentity(
      "78413325000193",
      { company: "Jacomar Supermercado", city: "Curitiba", state: "PR" },
      registry({
        cnpj: "78413325000193",
        legalName: "SUPERMERCADO JACOMAR LTDA",
        tradeName: undefined,
        city: "São José dos Pinhais",
        state: "PR",
      }),
    );
    expect(result.outcome).toBe("identity_confirmed_with_warnings");
    expect(result.warnings).toContain("cidade_diverge");
    expect(result.warnings).not.toContain("uf_diverge");
    expect(result.reason).not.toContain("rejeitad");
  });

  test("só nome diverge (cidade/UF conferem) -> warnings só com nome_diverge", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Nome Comercial Bem Diferente", city: "Curitiba", state: "PR" },
      registry(),
    );
    expect(result.outcome).toBe("identity_confirmed_with_warnings");
    expect(result.warnings).toEqual(["nome_diverge"]);
  });

  test("só cidade diverge (matriz/filial em municípios diferentes) -> warnings só com cidade_diverge", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Clínica Sorriso Prime", city: "Londrina", state: "PR" },
      registry(),
    );
    expect(result.outcome).toBe("identity_confirmed_with_warnings");
    expect(result.warnings).toEqual(["cidade_diverge"]);
  });

  test("só UF diverge -> warnings só com uf_diverge", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Clínica Sorriso Prime", city: "Curitiba", state: "SP" },
      registry(),
    );
    expect(result.outcome).toBe("identity_confirmed_with_warnings");
    expect(result.warnings).toEqual(["uf_diverge"]);
  });

  test("cidade/UF ausentes no input -> não geram warning (sem dado para contradizer, mesma regra de confirmRegistryMatch)", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Clínica Sorriso Prime" },
      registry(),
    );
    expect(result.outcome).toBe("identity_confirmed");
    expect(result.warnings).toEqual([]);
  });

  // Único bloqueio real desta função: o registro devolvido é de outro CNPJ.
  test("registro devolvido é de CNPJ diferente do informado -> identity_rejected", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Clínica Sorriso Prime", city: "Curitiba", state: "PR" },
      registry({ cnpj: "99999999000191" }),
    );
    expect(result.outcome).toBe("identity_rejected");
    expect(result.warnings).toEqual([]);
  });

  test("CNPJ do registro com formatação diferente (não normalizado) mas mesmo número -> não rejeita por formato", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Clínica Sorriso Prime", city: "Curitiba", state: "PR" },
      registry({ cnpj: "18.236.120/0001-58" }),
    );
    expect(result.outcome).not.toBe("identity_rejected");
  });

  test("nome E cidade E UF divergem simultaneamente -> ainda identity_confirmed_with_warnings, nunca rejected", () => {
    const result = confirmManualIdentity(
      "18236120000158",
      { company: "Totalmente Outro Nome", city: "Manaus", state: "AM" },
      registry(),
    );
    expect(result.outcome).toBe("identity_confirmed_with_warnings");
    expect(result.warnings).toEqual(["nome_diverge", "cidade_diverge", "uf_diverge"]);
  });
});
