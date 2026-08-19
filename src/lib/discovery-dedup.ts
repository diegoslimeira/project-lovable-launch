import type { CompanyCandidate } from "./providers";

// Fase D — deduplicação prática de candidatos dentro de um mesmo lote de
// discovery, reutilizável por qualquer LeadDiscoveryProvider (hoje só Google
// Places; futuramente CNPJ, diretórios etc. via um AggregatingDiscoveryProvider
// que combine as listas antes de chamar isto). Prioridade documentada na
// Fase D:
//   1. externalId da fonte (ex.: Google placeId) — chave exata;
//   2. domínio normalizado do website;
//   3. telefone normalizado;
//   4. nome+cidade — sinal mais fraco, NÃO usado como bloqueio nesta fase
//      (evita fuzzy merge agressivo de duas empresas realmente diferentes
//      com nomes parecidos); fica documentado aqui para uma fase futura que
//      precise dele.
// Escopo: só compara candidatos DENTRO do array recebido (um lote). Não
// consulta leads já persistidos — o guard contra duplicar um lead já
// existente na campanha é o id determinístico + onConflictDoNothing em
// createManyLeadsDirect (ver repositories/leads.ts).

// Fase E.1 — exportadas para reuso no Enrichment: `lead.website` já segue a
// convenção de guardar só o domínio (a UI monta `https://${lead.website}`),
// então a mesma normalização de dedup serve para "remover protocolo/www/
// path" na hora de persistir um website enriquecido, sem duplicar a lógica.
export function normalizeDomain(website: string | undefined): string | undefined {
  if (!website) return undefined;
  try {
    const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, "").toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : undefined;
}

export function dedupeCandidates(candidates: CompanyCandidate[]): CompanyCandidate[] {
  const seenExternalIds = new Set<string>();
  const seenDomains = new Set<string>();
  const seenPhones = new Set<string>();
  const result: CompanyCandidate[] = [];

  for (const candidate of candidates) {
    const externalId = candidate.sources[0]?.externalId;
    const domain = normalizeDomain(candidate.website);
    const phone = normalizePhone(candidate.phone);

    if (externalId && seenExternalIds.has(externalId)) continue;
    if (!externalId && domain && seenDomains.has(domain)) continue;
    if (!externalId && !domain && phone && seenPhones.has(phone)) continue;

    if (externalId) seenExternalIds.add(externalId);
    if (domain) seenDomains.add(domain);
    if (phone) seenPhones.add(phone);
    result.push(candidate);
  }

  return result;
}
