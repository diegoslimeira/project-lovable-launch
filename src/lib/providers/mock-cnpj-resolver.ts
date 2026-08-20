import { formatCnpj } from "../cnpj";
import type { CnpjResolution, CnpjResolver, CompanyCandidate } from "../providers";

// Fase E.2 — provider padrão (sem configuração extra), nunca faz chamada de
// rede. Gera um CNPJ determinístico e matematicamente VÁLIDO a partir do nome
// da empresa (mesmo algoritmo de dígito verificador de src/lib/cnpj.ts, para
// que o dado simulado também sirva de fixture coerente), deixando claro no
// próprio `reason`/`source` que é simulado — nunca deve ser confundido com um
// resultado real.
const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function computeCheckDigit(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += Number(digits[i]) * weights[i]!;
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function seededDigits(seed: string, length: number): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let digits = "";
  let value = hash || 1;
  while (digits.length < length) {
    value = (value * 1103515245 + 12345) >>> 0;
    digits += (value % 10).toString();
  }
  return digits.slice(0, length);
}

function generateDeterministicValidCnpj(seed: string): string {
  const payload = seededDigits(seed, 12);
  const firstDigit = computeCheckDigit(payload, FIRST_DIGIT_WEIGHTS);
  const secondDigit = computeCheckDigit(payload + firstDigit, SECOND_DIGIT_WEIGHTS);
  return `${payload}${firstDigit}${secondDigit}`;
}

export class MockCnpjResolver implements CnpjResolver {
  async resolve(company: CompanyCandidate): Promise<CnpjResolution> {
    if (!company.website) {
      return {
        outcome: "not_found",
        confidence: 0,
        candidates: [],
        reason: "Lead sem website conhecido (simulado) — nenhuma página para analisar.",
        source: "Mock CNPJ Resolver",
      };
    }

    const cnpj = generateDeterministicValidCnpj(company.name);
    return {
      outcome: "high_confidence",
      cnpj,
      confidence: 90,
      candidates: [
        {
          cnpj,
          foundOnUrl: `https://${company.website}`,
          context: `CNPJ: ${formatCnpj(cnpj)} (dado simulado — Mock CNPJ Resolver)`,
          signals: [{ label: "Resultado simulado", positive: true }],
        },
      ],
      reason: "Resultado simulado (Mock CNPJ Resolver) — nenhuma chamada real foi feita.",
      source: "Mock CNPJ Resolver",
    };
  }
}

export const mockCnpjResolver = new MockCnpjResolver();
