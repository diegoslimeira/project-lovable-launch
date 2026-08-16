# ProspectAI — Sales Intelligence

MVP de uma plataforma SaaS de prospecção fria inteligente: define o mercado uma vez e organiza descoberta, enriquecimento, validação, auditoria digital, diagnóstico, score, abordagem e pipeline.

## Stack preservada

O repositório já era um projeto React + TypeScript com Vite, TanStack Router/Start, React Query, Tailwind CSS e Radix/Lucide. O MVP foi implementado dentro dessa stack, sem migração de framework ou reestruturação desnecessária.

## O que já está funcional no MVP

- Dashboard executivo com métricas e cobertura de dados.
- Nova Prospecção em 3 etapas: mercado, decisor, oferta/objetivo/canais.
- Campanha com progresso e funil.
- Central de leads com busca e filtros de Opportunity Score.
- Kanban comercial.
- Diagnósticos individuais com microinsight e evidências.
- Geração e aprovação humana de abordagens.
- Drawer completo do lead com decisor, presença digital, diagnóstico, score, evidências e mensagem.
- Área de reuniões, integrações e configurações.
- Regras de compliance visíveis, incluindo bloqueio, opt-out e aprovação obrigatória.
- Dados demonstrativos realistas para validar o fluxo antes de conectar fontes externas.

## Arquitetura preparada para integrações

`src/lib/providers.ts` define contratos desacoplados para:

- descoberta de empresas;
- enriquecimento de contatos;
- auditoria digital;
- anúncios públicos;
- IA.

`src/lib/pipeline.ts` define estados de jobs, estágios do processamento, priorização e bloqueio de contatos.

`src/lib/prospecting.ts` concentra entidades do domínio, Opportunity Score, classificação e dados de demonstração.

A intenção é conectar providers reais sem alterar a interface do produto. Uma fonte indisponível pode ser substituída por outra implementação do mesmo contrato.

## Dados e confiança

O produto diferencia explicitamente:

- **Fato verificado**
- **Inferência**
- **Oportunidade**
- **Hipótese**
- **Não confirmado**

Cada evidência pode carregar fonte, URL, método, data e confidence score no modelo de provider. O decisor não localizado é tratado como tal e o fluxo usa o canal comercial geral.

## Próxima camada de produção

1. Persistência multi-tenant (`users`, `workspaces`, `campaigns`, `companies`, `contacts`, `audits`, `diagnoses`, `outreach_events`, etc.).
2. Worker/queue real para descoberta e enriquecimento assíncronos.
3. Providers autorizados de Maps, anúncios e enriquecimento.
4. Motor de auditoria web com coleta de evidências.
5. Provider de IA com prompts versionados e validação de saída estruturada.
6. Deduplicação global por CNPJ, domínio, telefone, Place ID e sinais sociais.
7. Autenticação, permissões, lista de bloqueio e trilha de auditoria persistente.
8. Integrações de envio somente após aprovação humana.

## Desenvolvimento

```sh
bun install
bun run dev
```

Build:

```sh
bun run build
```

Lint:

```sh
bun run lint
```
