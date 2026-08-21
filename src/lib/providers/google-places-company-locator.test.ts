import { describe, expect, test } from "bun:test";
import {
  buildLocatorQuery,
  classifyLocatorPlaces,
  type GooglePlace,
} from "./google-places-company-locator";
import type { RegistryCompanyData } from "../providers";

function registry(overrides: Partial<RegistryCompanyData> = {}): RegistryCompanyData {
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

function place(
  overrides: Partial<GooglePlace> & {
    name: string;
    city?: string;
    state?: string;
    address?: string;
    postalCode?: string;
  },
): GooglePlace {
  const { name, city, state, address, postalCode, ...rest } = overrides;
  const addressComponents = [];
  if (city)
    addressComponents.push({
      longText: city,
      shortText: city,
      types: ["administrative_area_level_2"],
    });
  if (state)
    addressComponents.push({
      longText: state,
      shortText: state,
      types: ["administrative_area_level_1"],
    });
  if (postalCode)
    addressComponents.push({
      longText: postalCode,
      shortText: postalCode,
      types: ["postal_code"],
    });
  return {
    id: `place-${name}`,
    displayName: { text: name },
    formattedAddress: address,
    addressComponents,
    ...rest,
  };
}

// Fase F.1.4 — buildLocatorQuery passou a incorporar o endereço/CEP
// cadastral oficial, não só nome+cidade/UF (achado real do caso Jacomar:
// nome+cidade/UF sozinhos não direcionam a busca à loja certa quando existem
// várias unidades da mesma rede no mesmo município — ver relatório da
// investigação).
describe("buildLocatorQuery", () => {
  // 1. query com endereço completo — todos os campos oficiais presentes.
  test("1. inclui razão social, nome fantasia, endereço, cidade, UF e CEP quando todos disponíveis", () => {
    const query = buildLocatorQuery(
      registry({
        legalName: "Sorriso Prime Odontologia LTDA",
        tradeName: "Sorriso Prime",
        address: "Rua das Flores, 100, Batel",
        city: "Curitiba",
        state: "PR",
        postalCode: "80420-000",
      }),
    );
    expect(query).toBe(
      "Sorriso Prime Odontologia LTDA, Sorriso Prime, Rua das Flores, 100, Batel, Curitiba, PR, 80420-000",
    );
  });

  // 2. query sem nome fantasia — razão social não deve aparecer duplicada.
  test("2. sem nome fantasia -> só a razão social, sem duplicar", () => {
    const query = buildLocatorQuery(registry({ tradeName: undefined }));
    const occurrences = query.split("Sorriso Prime Odontologia LTDA").length - 1;
    expect(occurrences).toBe(1);
    expect(query).not.toContain("undefined");
  });

  // 3. query sem endereço oficial — não quebra, não deixa segmento vazio.
  test("3. sem endereço -> monta query com o resto, sem segmento vazio", () => {
    const query = buildLocatorQuery(registry({ address: undefined }));
    expect(query).toBe("Sorriso Prime Odontologia LTDA, Sorriso Prime, Curitiba, PR");
    expect(query).not.toContain(", ,");
    expect(query).not.toContain("undefined");
  });

  // 4. query sem CEP — não quebra, sem vírgula solta no final.
  test("4. sem CEP -> monta query sem ele, sem vírgula solta no final", () => {
    const query = buildLocatorQuery(registry({ postalCode: undefined }));
    expect(query.endsWith(",")).toBe(false);
    expect(query).not.toContain("undefined");
  });

  // 5. normalização de espaços/valores ausentes simultâneos.
  test("5. espaços nas pontas são removidos; múltiplos campos ausentes não deixam segmentos vazios", () => {
    const query = buildLocatorQuery(
      registry({
        legalName: "  Sorriso Prime Odontologia LTDA  ",
        tradeName: undefined,
        address: undefined,
        city: undefined,
        state: undefined,
        postalCode: undefined,
      }),
    );
    expect(query).toBe("Sorriso Prime Odontologia LTDA");
    expect(query).not.toContain("  ");
    expect(query).not.toContain(",,");
    expect(query.startsWith(",")).toBe(false);
    expect(query.endsWith(",")).toBe(false);
  });

  // 6. caso real Jacomar — o endereço oficial precisa estar na query, é
  // exatamente o dado que faltava e causou o resultado ambiguous real.
  test("6. [caso real Jacomar] endereço oficial (Rua Romário Martins, 36, São Marcos) entra na query", () => {
    const query = buildLocatorQuery(
      registry({
        legalName: "SUPERMERCADO JACOMAR LTDA",
        tradeName: undefined,
        address: "RUA ROMARIO MARTINS, 36, LOJA  01, SAO MARCOS",
        city: "SAO JOSE DOS PINHAIS",
        state: "PR",
        postalCode: "83090020",
      }),
    );
    expect(query).toContain("SUPERMERCADO JACOMAR LTDA");
    expect(query).toContain("RUA ROMARIO MARTINS, 36, LOJA  01, SAO MARCOS");
    expect(query).toContain("SAO JOSE DOS PINHAIS");
    expect(query).toContain("PR");
    expect(query).toContain("83090020");
  });
});

describe("classifyLocatorPlaces", () => {
  test("nenhum resultado retornado -> not_found", () => {
    const result = classifyLocatorPlaces([], registry());
    expect(result.outcome).toBe("not_found");
    expect(result.candidates).toEqual([]);
    expect(result.placeId).toBeUndefined();
  });

  test("1 resultado forte (nome+cidade+UF conferem) -> high_confidence, com placeId", () => {
    const places = [
      place({ name: "Sorriso Prime", city: "Curitiba", state: "PR", address: "Rua X, 123" }),
    ];
    const result = classifyLocatorPlaces(places, registry());
    expect(result.outcome).toBe("high_confidence");
    expect(result.placeId).toBe("place-Sorriso Prime");
    expect(result.name).toBe("Sorriso Prime");
    expect(result.address).toBe("Rua X, 123");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.sourceRecord?.externalId).toBe("place-Sorriso Prime");
    expect(result.sourceRecord?.source).toBe("Google Places");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.confirmed).toBe(true);
  });

  test("múltiplos resultados todos conferindo -> ambiguous, sem placeId", () => {
    const places = [
      place({ name: "Sorriso Prime", city: "Curitiba", state: "PR" }),
      place({ name: "Sorriso Prime", city: "Curitiba", state: "PR" }),
    ];
    // ids iguais entre os dois candidatos forçaria colisão -- usa nomes
    // distintos para simular 2 estabelecimentos reais (ex.: franquia).
    places[1]!.id = "place-Sorriso Prime 2";
    const result = classifyLocatorPlaces(places, registry());
    expect(result.outcome).toBe("ambiguous");
    expect(result.placeId).toBeUndefined();
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.confirmed)).toBe(true);
  });

  test("resultados existem mas nenhum confere (nome/cidade/UF divergentes) -> not_found", () => {
    const places = [place({ name: "Auto Peças União", city: "Recife", state: "PE" })];
    const result = classifyLocatorPlaces(places, registry());
    expect(result.outcome).toBe("not_found");
    expect(result.placeId).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.confirmed).toBe(false);
  });

  test("1 resultado com nome correto mas cidade divergente -> not_found (cidade não confere)", () => {
    const places = [place({ name: "Sorriso Prime", city: "São Paulo", state: "SP" })];
    const result = classifyLocatorPlaces(places, registry());
    expect(result.outcome).toBe("not_found");
    expect(result.candidates[0]!.nameSimilarityScore).toBeGreaterThan(0);
    expect(result.candidates[0]!.cityMatches).toBe(false);
    expect(result.candidates[0]!.confirmed).toBe(false);
  });

  test("nunca lança para uma lista de candidatos malformada (sem addressComponents)", () => {
    const places: GooglePlace[] = [{ id: "place-x", displayName: { text: "Sorriso Prime" } }];
    expect(() => classifyLocatorPlaces(places, registry())).not.toThrow();
  });
});

// Fase F.1.2 — achado real (lead Jacomar, teste remoto controlado): uma rede
// com várias lojas na mesma cidade produz vários candidatos que batem
// igualmente em nome+cidade+UF. Testes abaixo cobrem o desempate por CEP
// cadastral oficial (OpenCNPJ) contra o `postal_code` que o Google já
// devolve em `addressComponents`.
describe("classifyLocatorPlaces — desempate por CEP", () => {
  // Dados oficiais reais do CNPJ 78.413.325/0001-93 (OpenCNPJ, teste remoto
  // controlado): razão social, sede em São José dos Pinhais/PR, CEP 83090-020.
  function jacomarRegistry(overrides: Partial<RegistryCompanyData> = {}): RegistryCompanyData {
    return registry({
      legalName: "SUPERMERCADO JACOMAR LTDA",
      tradeName: undefined,
      city: "São José dos Pinhais",
      state: "PR",
      postalCode: "83090-020",
      ...overrides,
    });
  }

  // Réplica do caso real: 5 lojas "Jacomar" na mesma cidade, só 1 com o CEP
  // exato da sede cadastral (78413325000193 -> CEP 83090-020).
  function fiveJacomarCandidates(correctPostalCodeCount: 0 | 1 | 2) {
    const codes = ["83090020", "83100000", "83200000", "83300000", "83400000"];
    if (correctPostalCodeCount === 0) codes[0] = "99999999";
    if (correctPostalCodeCount === 2) codes[1] = "83090020";
    // 0 -> nenhum bate; 1 (default acima, índice 0) -> só 1 bate; 2 -> índices 0 e 1 batem.
    return codes.map((cep, i) =>
      place({
        id: `place-jacomar-${i}`,
        name: "Jacomar Supermercado",
        city: "São José dos Pinhais",
        state: "PR",
        postalCode: cep,
      }),
    );
  }

  test("1. 5 candidatos da mesma marca + exatamente 1 CEP correto -> high_confidence, placeId do candidato certo", () => {
    const places = fiveJacomarCandidates(1);
    const result = classifyLocatorPlaces(places, jacomarRegistry());
    expect(result.outcome).toBe("high_confidence");
    expect(result.placeId).toBe("place-jacomar-0");
    expect(result.candidates).toHaveLength(5);
    expect(result.reason).toContain("CEP");
  });

  test("2. 5 candidatos + nenhum CEP correto -> ambiguous", () => {
    const places = fiveJacomarCandidates(0);
    const result = classifyLocatorPlaces(places, jacomarRegistry());
    expect(result.outcome).toBe("ambiguous");
    expect(result.placeId).toBeUndefined();
    expect(result.reason).toContain("CEP");
  });

  test("3. 2 candidatos com o mesmo CEP oficial -> ambiguous (CEP não desempata sozinho um empate)", () => {
    const places = fiveJacomarCandidates(2);
    const result = classifyLocatorPlaces(places, jacomarRegistry());
    expect(result.outcome).toBe("ambiguous");
    expect(result.placeId).toBeUndefined();
  });

  test("4. CEP com e sem hífen são equivalentes (só normaliza formatação)", () => {
    const places = [
      place({
        id: "place-a",
        name: "Jacomar Supermercado",
        city: "São José dos Pinhais",
        state: "PR",
        postalCode: "83090020", // sem hífen
      }),
      place({
        id: "place-b",
        name: "Jacomar Supermercado",
        city: "São José dos Pinhais",
        state: "PR",
        postalCode: "83100-000",
      }),
    ];
    const result = classifyLocatorPlaces(places, jacomarRegistry());
    expect(result.outcome).toBe("high_confidence");
    expect(result.placeId).toBe("place-a");
  });

  test("5. candidato sem postal_code no meio dos outros -> não quebra, segue avaliando os demais", () => {
    const places = [
      place({
        id: "place-sem-cep",
        name: "Jacomar Supermercado",
        city: "São José dos Pinhais",
        state: "PR",
        // sem postalCode
      }),
      place({
        id: "place-com-cep",
        name: "Jacomar Supermercado",
        city: "São José dos Pinhais",
        state: "PR",
        postalCode: "83090-020",
      }),
    ];
    expect(() => classifyLocatorPlaces(places, jacomarRegistry())).not.toThrow();
    const result = classifyLocatorPlaces(places, jacomarRegistry());
    expect(result.outcome).toBe("high_confidence");
    expect(result.placeId).toBe("place-com-cep");
  });

  test("6. CEP bate mas nome é claramente incompatível -> não aceita (sanidade de nome continua obrigatória)", () => {
    const places = [
      place({
        id: "place-nome-errado",
        name: "Auto Peças União",
        city: "São José dos Pinhais",
        state: "PR",
        postalCode: "83090-020",
      }),
    ];
    const result = classifyLocatorPlaces(places, jacomarRegistry());
    expect(result.outcome).toBe("not_found");
    expect(result.placeId).toBeUndefined();
    expect(result.candidates[0]!.confirmed).toBe(false);
  });

  test("7. empresa única (só 1 candidato confirmado) -> resolve pela regra atual, sem precisar de CEP (nenhuma regressão)", () => {
    const places = [
      place({
        name: "Sorriso Prime",
        city: "Curitiba",
        state: "PR",
        // sem postalCode no candidato nem no cadastro -- o caminho de CEP
        // nem deveria ser avaliado aqui.
      }),
    ];
    const result = classifyLocatorPlaces(places, registry());
    expect(result.outcome).toBe("high_confidence");
    expect(result.placeId).toBe("place-Sorriso Prime");
    expect(result.reason).not.toContain("CEP");
  });
});
