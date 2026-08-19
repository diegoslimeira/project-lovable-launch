import { getGooglePlacesApiKey } from "../db/client";
import type { CompanyCandidate, LeadDiscoveryProvider, SourceRecord } from "../providers";

// Fase D — Google Places API (New), Text Search. FieldMask explícito (nunca
// "*") restrito ao SKU "Pro"/Basic Data: id, displayName, formattedAddress,
// addressComponents, location, types, primaryType, businessStatus. Telefone
// (nationalPhoneNumber/internationalPhoneNumber) e website (websiteUri) são
// campos de "Contact Data" (SKU "Enterprise", mais caro) — deliberadamente
// fora do Discovery; ver relatório da Fase D para a decisão completa. Isso
// também é por que CompanyCandidate.phone/website nunca são preenchidos por
// este provider — ficam para uma futura fase de Enrichment real.
const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.businessStatus",
  "nextPageToken",
].join(",");

// Máximo permitido pela API por página.
const MAX_PAGE_SIZE = 20;

type GooglePlace = {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
};

type SearchTextResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
};

function buildTextQuery(segment: string, location: string): string {
  const formattedLocation = location.replace("/", ", ").trim();
  return `${segment} em ${formattedLocation}`.replace(/\s+/g, " ").trim();
}

function addressComponent(
  components: GooglePlace["addressComponents"],
  type: string,
): string | undefined {
  return components?.find((c) => c.types.includes(type))?.longText;
}

function placeToCandidate(place: GooglePlace): CompanyCandidate {
  const city =
    addressComponent(place.addressComponents, "administrative_area_level_2") ??
    addressComponent(place.addressComponents, "locality");
  const state = addressComponent(place.addressComponents, "administrative_area_level_1");

  const source: SourceRecord = {
    source: "Google Places",
    externalId: place.id,
    collectedAt: new Date().toISOString(),
    method: "places:searchText",
    confidence: 90,
  };

  return {
    name: place.displayName?.text ?? "Empresa sem nome informado",
    address: place.formattedAddress,
    city,
    state,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    category: place.primaryType ?? place.types?.[0],
    businessStatus: place.businessStatus,
    sources: [source],
  };
}

// Nunca inclui a API key no corpo de erro/log — só status HTTP e o corpo de
// resposta do Google (que não contém a chave, ela só vai no header
// X-Goog-Api-Key da requisição).
async function callSearchText(
  apiKey: string,
  textQuery: string,
  pageToken: string | undefined,
): Promise<SearchTextResponse> {
  const body: Record<string, unknown> = {
    textQuery,
    languageCode: "pt-BR",
    pageSize: MAX_PAGE_SIZE,
  };
  if (pageToken) body.pageToken = pageToken;

  const response = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Antes: `.catch(() => "")` engolia silenciosamente qualquer falha na
    // leitura do corpo (ex.: instabilidade transitória de rede), produzindo
    // uma mensagem de erro vazia sem indicar por quê. Agora, ou capturamos o
    // corpo real do erro do Google, ou capturamos explicitamente a falha de
    // leitura em si — nunca mais uma string vazia sem explicação.
    let text = "";
    try {
      text = await response.text();
    } catch (readError) {
      text = `(falha ao ler corpo da resposta: ${readError instanceof Error ? readError.message : String(readError)})`;
    }
    const contentType = response.headers.get("content-type") ?? "(sem content-type)";
    throw new Error(
      `Google Places Text Search falhou (status ${response.status}, content-type: ${contentType}): ${text.slice(0, 500) || "(corpo vazio)"}`,
    );
  }

  return (await response.json()) as SearchTextResponse;
}

export class GooglePlacesDiscoveryProvider implements LeadDiscoveryProvider {
  async discover(input: {
    segment: string;
    location: string;
    radiusKm: number;
    limit: number;
    offset?: number;
  }): Promise<CompanyCandidate[]> {
    const apiKey = getGooglePlacesApiKey();
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const limit = Math.max(0, Math.floor(input.limit));
    if (limit === 0) return [];

    const textQuery = buildTextQuery(input.segment, input.location);

    // Text Search (New) só pagina via nextPageToken sequencial — não existe
    // parâmetro de offset numérico na API. Para servir um offset arbitrário
    // (exigido pelo modelo de lote da Fase C.2), andamos página a página
    // (até 20 resultados cada) a partir da primeira, dentro desta mesma
    // invocação, até alcançar a página que contém o offset pedido. Isso é
    // I/O (aguardando resposta HTTP), não CPU, então não recria o problema
    // de CPU que motivou o batching da Fase C.2 — mas custa mais chamadas
    // à API em campanhas grandes do que um cursor persistido custaria; ver
    // relatório da Fase D para o trade-off completo.
    let position = 0;
    let pageToken: string | undefined;
    let page: GooglePlace[] = [];
    let hasFetchedOnce = false;

    while (position + page.length <= offset) {
      if (hasFetchedOnce && !pageToken) {
        // Google esgotou os resultados antes de alcançar o offset pedido.
        return [];
      }
      position += page.length;
      const response = await callSearchText(apiKey, textQuery, pageToken);
      hasFetchedOnce = true;
      page = response.places ?? [];
      pageToken = response.nextPageToken;
      if (page.length === 0) return [];
    }

    const withinPageOffset = offset - position;
    const result: GooglePlace[] = page.slice(withinPageOffset, withinPageOffset + limit);

    while (result.length < limit && pageToken) {
      const response = await callSearchText(apiKey, textQuery, pageToken);
      const nextPage = response.places ?? [];
      pageToken = response.nextPageToken;
      if (nextPage.length === 0) break;
      result.push(...nextPage.slice(0, limit - result.length));
    }

    return result.map(placeToCandidate);
  }
}

export const googlePlacesDiscoveryProvider = new GooglePlacesDiscoveryProvider();
