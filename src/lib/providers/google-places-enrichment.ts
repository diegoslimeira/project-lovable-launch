import { getGooglePlacesApiKey } from "../db/client";
import { normalizeDomain } from "../discovery-dedup";
import type {
  CompanyCandidate,
  ContactCandidate,
  ContactEnrichmentProvider,
  SourceRecord,
} from "../providers";

// Fase E.1 — Google Places API (New), Place Details. FieldMask explícito
// (nunca "*") restrito aos 2 campos pedidos nesta fase: nationalPhoneNumber e
// websiteUri. Ambos são do SKU "Enterprise" ("Contact Data") — mais caro que
// o "Pro" usado no Discovery; ver relatório da Fase E.1 para o custo
// estimado. Nenhum outro campo (rating, horários, reviews etc.) é pedido.
const PLACE_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places";
const FIELD_MASK = ["nationalPhoneNumber", "websiteUri"].join(",");

type PlaceDetailsResponse = {
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

// Mesmo padrão de captura de erro corrigido na Fase E.1/D: nunca deixa o
// corpo da resposta engolido silenciosamente, e nunca inclui a API key na
// mensagem (ela só vai no header X-Goog-Api-Key da requisição).
async function fetchPlaceDetails(apiKey: string, placeId: string): Promise<PlaceDetailsResponse> {
  const url = `${PLACE_DETAILS_BASE_URL}/${encodeURIComponent(placeId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
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
      `Google Places Place Details falhou (status ${response.status}, content-type: ${contentType}): ${text.slice(0, 500) || "(corpo vazio)"}`,
    );
  }

  return (await response.json()) as PlaceDetailsResponse;
}

export class GooglePlacesEnrichmentProvider implements ContactEnrichmentProvider {
  async enrich(company: CompanyCandidate): Promise<ContactCandidate[]> {
    // Reaproveita o placeId do Discovery (ver leadToCompanyCandidate em
    // prospecting-service.ts) — nunca dispara uma nova Text Search para
    // enriquecer um lead que já tem placeId. Sem placeId (lead criado por
    // uma fonte sem id externo, ou mock), não há como chamar Place Details:
    // retorna vazio em vez de inventar dado.
    const placeId = company.sources.find((source) => source.source === "Google Places")?.externalId;
    if (!placeId) return [];

    const apiKey = getGooglePlacesApiKey();
    const details = await fetchPlaceDetails(apiKey, placeId);

    const website = details.websiteUri ? normalizeDomain(details.websiteUri) : undefined;
    const phone = details.nationalPhoneNumber;

    // Google não retornou nem telefone nem site: não é erro de pipeline
    // (ver enrichLead), só não há candidato para persistir.
    if (!phone && !website) return [];

    const source: SourceRecord = {
      source: "Google Places",
      externalId: placeId,
      collectedAt: new Date().toISOString(),
      method: "places:get",
      // Confidence fixo em 95 (não 100): é dado direto da fonte primária do
      // próprio Google para o place, mas o Google não expõe uma métrica de
      // confiança própria para Place Details — 95 reflete "alta confiança,
      // fonte primária" sem alegar certeza absoluta, mesma faixa qualitativa
      // usada para o Discovery (90) mas ligeiramente maior porque Place
      // Details é uma consulta direcionada por id, não uma busca por texto.
      confidence: 95,
    };

    return [{ phone, website, confidence: 95, source }];
  }
}

export const googlePlacesEnrichmentProvider = new GooglePlacesEnrichmentProvider();
