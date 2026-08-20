import { normalizeCnpj } from "../cnpj";
import type { CompanyRegistryProvider, RegistryCompanyData } from "../providers";

// Fase E.2 — OpenCnpjRegistryProvider: primeira implementação de
// CompanyRegistryProvider. Recebe um CNPJ JÁ RESOLVIDO (por um CnpjResolver)
// e só consulta dados cadastrais oficiais — nunca decide qual empresa
// escolher. Fonte: OpenCNPJ (api.opencnpj.org), sem chave, sem cadastro, sem
// cobrança (ver investigação da Fase E.2 Round 1).
//
// Mapeamento de campos CONFERIDO contra o contrato real (GET /schema do
// próprio Worker, código-fonte de src/Worker/src/schema.ts e index.ts do
// repositório github.com/Hitmasu/OpenCNPJ) — não contra uma chamada real
// (ainda proibida nesta fase), mas contra a fonte primária do schema.
// Divergências corrigidas nesta revisão em relação à primeira versão
// (baseada só na convenção BrasilAPI/Minha Receita por analogia):
//   - NÃO existe "cnae_fiscal_descricao" nem CNAEs secundários como objetos
//     {codigo, descricao} — o campo real é "cnae_principal" (código CNAE de
//     7 dígitos, string, SEM texto de descrição) e "cnaes_secundarios" é um
//     array de códigos (mesmo formato), também sem descrição.
//   - O campo de porte é "porte_empresa", não "porte".
//   - Existe "tipo_logradouro" (ex.: "Rua", "Avenida") separado de
//     "logradouro", incorporado ao endereço.
//   - "cnpj" na resposta pode conter LETRAS (CNPJ alfanumérico) — nunca usar
//     um strip "\D" (que apagaria as letras); normalizeCnpj (mesma função de
//     cnpj.ts) remove só pontuação/espaço, preservando letras.
// GET /{cnpj} (sem parâmetro `datasets`) devolve só o dataset "receita"
// (default do Worker) — exatamente os campos cadastrais que precisamos;
// nunca pedimos os datasets extras (cno/rntrc/licitações/etc.).
const OPEN_CNPJ_BASE_URL = "https://api.opencnpj.org";

type OpenCnpjResponse = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string | null;
  situacao_cadastral?: string;
  cnae_principal?: string;
  cnaes_secundarios?: string[];
  data_inicio_atividade?: string;
  porte_empresa?: string;
  natureza_juridica?: string;
  tipo_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string | null;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
};

// A API não devolve texto de descrição para CNAE, só o código de 7 dígitos
// (ex.: "8630503") — formata com a pontuação padrão (NNNN-N/NN) para
// legibilidade, sem inventar uma descrição que a fonte não fornece.
function formatCnae(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 7) return code || undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5, 7)}`;
}

function buildAddress(data: OpenCnpjResponse): string | undefined {
  const streetLine = [data.tipo_logradouro, data.logradouro].filter(Boolean).join(" ").trim();
  const parts = [
    streetLine || undefined,
    data.numero,
    data.complemento || undefined,
    data.bairro,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : undefined;
}

export class OpenCnpjRegistryProvider implements CompanyRegistryProvider {
  async lookup(cnpj: string): Promise<RegistryCompanyData | null> {
    const url = `${OPEN_CNPJ_BASE_URL}/${encodeURIComponent(cnpj)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (response.status === 404) {
      // CNPJ válido no formato/dígito verificador, mas não encontrado na
      // base consultada — resultado válido, nunca inventa dado.
      return null;
    }

    if (!response.ok) {
      let text = "";
      try {
        text = await response.text();
      } catch (readError) {
        text = `(falha ao ler corpo da resposta: ${readError instanceof Error ? readError.message : String(readError)})`;
      }
      const contentType = response.headers.get("content-type") ?? "(sem content-type)";
      throw new Error(
        `OpenCNPJ falhou (status ${response.status}, content-type: ${contentType}): ${text.slice(0, 500) || "(corpo vazio)"}`,
      );
    }

    const data = (await response.json()) as OpenCnpjResponse;
    if (!data.razao_social || !data.situacao_cadastral) {
      throw new Error(
        "OpenCNPJ retornou resposta em formato inesperado (campos obrigatórios razao_social/situacao_cadastral ausentes) — mapeamento de campos precisa ser revisado.",
      );
    }

    return {
      cnpj: data.cnpj ? normalizeCnpj(data.cnpj) : cnpj,
      legalName: data.razao_social,
      tradeName: data.nome_fantasia || undefined,
      registrationStatus: data.situacao_cadastral,
      primaryCnae: formatCnae(data.cnae_principal),
      secondaryCnaes: data.cnaes_secundarios
        ?.map(formatCnae)
        .filter((entry): entry is string => Boolean(entry)),
      openedAt: data.data_inicio_atividade,
      size: data.porte_empresa,
      legalNature: data.natureza_juridica,
      address: buildAddress(data),
      city: data.municipio,
      state: data.uf,
      postalCode: data.cep,
    };
  }
}

export const openCnpjRegistryProvider = new OpenCnpjRegistryProvider();
