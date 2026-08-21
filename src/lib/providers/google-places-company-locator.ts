import { getGooglePlacesApiKey } from "../db/client";
import { confirmRegistryMatch } from "../cnpj-match";
import type {
  CompanyCandidate,
  CompanyLocatorProvider,
  LocatorCandidate,
  LocatorResolution,
  RegistryCompanyData,
  SourceRecord,
} from "../providers";

// Fase F.1 — Google Places API (New), Text Search, usada de forma
// DIRECIONADA a UMA empresa já identificada cadastralmente (via
// CompanyRegistryProvider.lookup) — nunca busca ampla de mercado, isso
// continua sendo responsabilidade exclusiva do LeadDiscoveryProvider. Mesmo
// endpoint/SKU ("Pro"/Basic Data) já documentado em
// google-places-discovery.ts, com um FieldMask menor: só os 4 campos
// necessários para localizar e comparar candidatos (id, displayName,
// formattedAddress, addressComponents) — nada de location/types/
// businessStatus, que o Discovery pede mas o locator não usa. Telefone/site
// NÃO são pedidos aqui: isso é responsabilidade do
// GooglePlacesEnrichmentProvider já existente, reaproveitado sem alteração
// depois que este provider persistir um placeId de alta confiança (ver
// resolveManualLeadIdentity em prospecting-service.ts). Preço exato por SKU
// deve ser conferido contra o price list atual do Google antes de habilitar
// em produção — nada aqui assume um valor específico.
const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
].join(",");

// Busca direcionada a 1 empresa específica, não uma varredura de mercado
// (Discovery usa até 20, o máximo da API, porque precisa cobrir um segmento
// inteiro). Poucos candidatos já bastam para decidir entre
// high_confidence/ambiguous/not_found — mantém o payload (e o número de
// resultados a comparar) no mínimo necessário.
export const LOCATOR_PAGE_SIZE = 5;

export type GooglePlace = {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
};

type SearchTextResponse = {
  places?: GooglePlace[];
};

function addressComponent(
  components: GooglePlace["addressComponents"],
  type: string,
): string | undefined {
  return components?.find((c) => c.types.includes(type))?.longText;
}

// Fase F.1.2 — normaliza CEP só de formatação (hífen/espaço), nunca de
// conteúdo: "83090-020" e "83090020" são o MESMO CEP; dígitos diferentes
// continuam divergentes mesmo depois de normalizados.
function normalizePostalCode(raw: string): string {
  return raw.replace(/\D/g, "");
}

// Fase F.1.4 — achado real (lead Jacomar, teste remoto controlado, ver
// relatório da investigação): uma query só com nome+cidade/UF não é
// específica o suficiente quando existem várias lojas da mesma rede no
// mesmo município — o Text Search não tem como saber QUAL unidade procuramos
// (os 5 candidatos reais observados eram todos lojas Jacomar genuínas em São
// José dos Pinhais, nenhuma na rua/bairro certos). O gargalo identificado
// foi a query, não a régua de matching (que já rejeitava corretamente os 5
// candidatos errados) — esta correção incorpora o endereço cadastral oficial
// do OpenCNPJ para direcionar a busca ao estabelecimento certo.
//
// Inclui, quando disponíveis: razão social + nome fantasia (os dois, não só
// um — cada um pode ser o termo que o Google indexou como nome do
// estabelecimento; deduplicados quando idênticos), o endereço oficial
// completo (`registry.address` — já vem concatenado com rua/número/
// complemento/bairro por buildAddress em open-cnpj-registry.ts; usado aqui
// como um bloco único de propósito — não separa rua/número/bairro em campos
// próprios nesta etapa, isso exigiria mudar RegistryCompanyData/schema, fora
// do escopo desta correção mínima), município, UF e CEP oficial. Nunca usa
// texto digitado pelo usuário — só dado cadastral já confirmado.
export function buildLocatorQuery(registry: RegistryCompanyData): string {
  const names =
    registry.tradeName && registry.tradeName !== registry.legalName
      ? [registry.legalName, registry.tradeName]
      : [registry.legalName];
  return [...names, registry.address, registry.city, registry.state, registry.postalCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function placeToCompanyCandidate(place: GooglePlace): CompanyCandidate {
  const city =
    addressComponent(place.addressComponents, "administrative_area_level_2") ??
    addressComponent(place.addressComponents, "locality");
  const state = addressComponent(place.addressComponents, "administrative_area_level_1");
  return {
    name: place.displayName?.text ?? "",
    address: place.formattedAddress,
    city,
    state,
    sources: [],
  };
}

// Fase F.1.2 — monta o LocatorResolution de sucesso a partir de UM candidato
// já decidido como vencedor — extraída para ser reaproveitada tanto pelo
// caso "só 1 candidato passou na sanidade de nome/localização" (comportamento
// original, inalterado) quanto pelo novo caso "CEP cadastral desempatou entre
// vários candidatos que empatavam" — mesmo formato de saída nos dois casos,
// só o `reason` explica qual sinal decidiu.
function buildHighConfidenceResult(
  winner: LocatorCandidate,
  candidates: LocatorCandidate[],
  reason: string,
): LocatorResolution {
  const confidence = Math.round(winner.nameSimilarityScore * 100);
  const sourceRecord: SourceRecord = {
    source: "Google Places",
    externalId: winner.placeId,
    collectedAt: new Date().toISOString(),
    method: "places:searchText (locator)",
    confidence,
  };
  return {
    outcome: "high_confidence",
    placeId: winner.placeId,
    name: winner.name,
    address: winner.address,
    confidence,
    candidates,
    reason,
    source: "Google Places",
    sourceRecord,
  };
}

// Fase F.1 — puro (sem fetch), separado de locate() de propósito para poder
// ser testado localmente com listas sintéticas de GooglePlace, sem chamada
// real (ver google-places-company-locator.test.ts). Reaproveita
// confirmRegistryMatch (cnpj-match.ts) para cada candidato — mesmo limiar,
// mesma lógica de nome/cidade/UF já usada na confirmação cadastral, nenhuma
// régua de comparação nova para a sanidade mínima de identidade.
//
// Fase F.1.2 — achado real (lead Jacomar, teste remoto controlado): uma rede
// com várias lojas na mesma cidade produz vários candidatos que batem
// igualmente em nome+cidade+UF (a régua de sanidade não tem como escolher
// ENTRE lojas da mesma marca). Antes de desistir como `ambiguous`, tenta
// desempatar pelo CEP cadastral oficial do OpenCNPJ (`registry.postalCode`)
// contra o componente `postal_code` que o Google já devolve dentro de
// `addressComponents` (nenhum FieldMask novo) — só ENTRE os candidatos que
// já passaram na sanidade de nome/localização, nunca resgatando um candidato
// com nome incompatível só porque o CEP bateu. Ausência de CEP em um
// candidato é tratada como "sinal indisponível" (nunca conta como
// divergência) — só uma comparação com os dois CEPs presentes decide.
export function classifyLocatorPlaces(
  places: GooglePlace[],
  registry: RegistryCompanyData,
): LocatorResolution {
  if (places.length === 0) {
    return {
      outcome: "not_found",
      confidence: 0,
      candidates: [],
      reason: "Nenhum resultado retornado pelo Google Places para esta busca.",
      source: "Google Places",
    };
  }

  const mapped = places.map((place) => {
    const candidate = placeToCompanyCandidate(place);
    const match = confirmRegistryMatch(candidate, registry);
    const locatorCandidate: LocatorCandidate = {
      placeId: place.id,
      name: candidate.name,
      address: candidate.address,
      city: candidate.city,
      state: candidate.state,
      nameSimilarityScore: match.nameSimilarityScore,
      cityMatches: match.cityMatches,
      stateMatches: match.stateMatches,
      confirmed: match.confirmed,
    };
    const postalCode = addressComponent(place.addressComponents, "postal_code");
    return { locatorCandidate, postalCode };
  });

  const candidates = mapped.map((m) => m.locatorCandidate);
  const confirmed = mapped.filter((m) => m.locatorCandidate.confirmed);

  if (confirmed.length === 0) {
    return {
      outcome: "not_found",
      confidence: 0,
      candidates,
      reason:
        "Nenhum dos resultados encontrados corresponde com confiança suficiente ao cadastro (nome/cidade/UF).",
      source: "Google Places",
    };
  }

  if (confirmed.length === 1) {
    return buildHighConfidenceResult(
      confirmed[0]!.locatorCandidate,
      candidates,
      "Nome e localização conferem com o cadastro confirmado.",
    );
  }

  // 2+ candidatos empatados na sanidade mínima (ex.: várias lojas da mesma
  // rede na mesma cidade) — tenta desempatar por CEP oficial antes de
  // desistir como ambiguous.
  const registryPostalCode = registry.postalCode
    ? normalizePostalCode(registry.postalCode)
    : undefined;

  if (registryPostalCode) {
    const postalMatches = confirmed.filter(
      (m) => m.postalCode && normalizePostalCode(m.postalCode) === registryPostalCode,
    );

    if (postalMatches.length === 1) {
      return buildHighConfidenceResult(
        postalMatches[0]!.locatorCandidate,
        candidates,
        `CEP cadastral oficial (${registry.postalCode}) corresponde a exatamente 1 dos ${confirmed.length} candidatos que já conferiam em nome/localização — desempate por CEP.`,
      );
    }
  }

  return {
    outcome: "ambiguous",
    confidence: 0,
    candidates,
    reason: registryPostalCode
      ? `${confirmed.length} resultados diferentes correspondem ao cadastro com confiança, e o CEP cadastral oficial não desempatou (nenhum ou mais de um candidato com o mesmo CEP) — não é possível decidir automaticamente.`
      : `${confirmed.length} resultados diferentes correspondem ao cadastro com confiança — não é possível decidir automaticamente.`,
    source: "Google Places",
  };
}

// Mesmo padrão de tratamento de erro de google-places-discovery.ts/
// google-places-enrichment.ts: nunca engole o corpo da resposta em erro,
// nunca inclui a API key na mensagem (só vai no header X-Goog-Api-Key).
async function callSearchText(apiKey: string, textQuery: string): Promise<SearchTextResponse> {
  const response = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, languageCode: "pt-BR", pageSize: LOCATOR_PAGE_SIZE }),
  });

  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch (readError) {
      text = `(falha ao ler corpo da resposta: ${readError instanceof Error ? readError.message : String(readError)})`;
    }
    const contentType = response.headers.get("content-type") ?? "(sem content-type)";
    throw new Error(
      `Google Places Text Search (locator) falhou (status ${response.status}, content-type: ${contentType}): ${text.slice(0, 500) || "(corpo vazio)"}`,
    );
  }

  return (await response.json()) as SearchTextResponse;
}

export class GooglePlacesCompanyLocatorProvider implements CompanyLocatorProvider {
  async locate(registry: RegistryCompanyData): Promise<LocatorResolution> {
    const apiKey = getGooglePlacesApiKey();
    const textQuery = buildLocatorQuery(registry);
    const response = await callSearchText(apiKey, textQuery);
    return classifyLocatorPlaces(response.places ?? [], registry);
  }
}

export const googlePlacesCompanyLocatorProvider = new GooglePlacesCompanyLocatorProvider();
