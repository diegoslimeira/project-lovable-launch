import type {
  CompanyCandidate,
  ContactValidationProvider,
  ValidationCheck,
  ValidationResult,
} from "../providers";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?\d[\d\s()-]{7,}$/;
const WEBSITE_REGEX = /^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i;

/**
 * Provider mock de validação. Verifica coerência/formato dos dados enriquecidos
 * (não confirma existência real — isso fica para integrações futuras). A ausência
 * de decisor é registrada como check informativo, não invalida o restante dos dados.
 */
export class MockContactValidationProvider implements ContactValidationProvider {
  async validate(input: {
    contact?: {
      name?: string;
      role?: string;
      email?: string;
      phone?: string;
      instagram?: string;
      website?: string;
    };
    company: CompanyCandidate;
  }): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];

    checks.push(
      input.contact?.name
        ? { field: "decisionMaker", valid: true }
        : { field: "decisionMaker", valid: false, reason: "Decisor não localizado nesta etapa" },
    );

    if (input.contact?.email) {
      const valid = EMAIL_REGEX.test(input.contact.email);
      checks.push({
        field: "email",
        valid,
        reason: valid ? undefined : "Formato de e-mail inválido",
      });
    }

    if (input.contact?.phone) {
      const valid = PHONE_REGEX.test(input.contact.phone);
      checks.push({
        field: "phone",
        valid,
        reason: valid ? undefined : "Formato de telefone inválido",
      });
    }

    const website = input.contact?.website || input.company.website;
    if (website) {
      const valid = WEBSITE_REGEX.test(website);
      checks.push({
        field: "website",
        valid,
        reason: valid ? undefined : "Formato de site inválido",
      });
    }

    const formatChecks = checks.filter((check) => check.field !== "decisionMaker");
    const valid = formatChecks.every((check) => check.valid);
    const confidence = checks.length
      ? Math.round((checks.filter((check) => check.valid).length / checks.length) * 100)
      : 0;

    return { checks, valid, confidence };
  }
}

export const mockContactValidationProvider = new MockContactValidationProvider();
