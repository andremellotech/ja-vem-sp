# Google Maps Embed Implementation Plan

## Adendo de 21/10/2026 — revisão da Task 2

O proprietário informou ter concluído etapas de conta/login, recusou criar a chave agora e manteve R$ 0 sem compras no cartão. A Task 2 atual publica Maps URLs externos sem chave: caminhada/transporte público após confirmar os pontos, sem necessidade de faturamento Google Cloud ou cartão por esse caminho. Não afirmar ausência de configurações anteriores da conta nem garantia de custos de outros serviços.

Substituir as etapas anteriores de ativação da Task 2 por: forçar a chave Embed vazia no Pages; ocultar controles/aviso Embed quando ausente ou em branco; preservar links externos, fluxo nativo/SPTrans e código opcional; atualizar testes de integração e documentação; validar testes, typecheck, build, formatação e diff. O iframe permanece dormente e exige nova autorização explícita antes de qualquer ativação futura. Não criar chave, configurar faturamento, aceitar compromissos financeiros, habilitar APIs ou testar Google real nesta release. O plano original abaixo é histórico; sua ativação Google não é requisito desta publicação. A integração/publicação continua sob responsabilidade do fluxo principal.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute task by task with verification and review.

**Goal:** Mostrar trajetos Google dentro do Já Vem SP usando somente Maps Embed gratuito, preservando SPTrans.
**Architecture:** iframe oficial por seleção explícita entre pontos confirmados; estado separado do mapa SPTrans e links externos de fallback. Nenhuma API cobrada no fluxo.
**Tech Stack:** React/TypeScript/Vite/Vitest existentes, sem dependências novas.
**Spec:** docs/superpowers/specs/2026-10-21-google-embed-design.md

## Global Constraints

- Orçamento autorizado R$ 0; somente Maps Embed API gratuita. Não ativar Routes/Maps JavaScript/Places nem iniciar assinatura/teste/upgrade.
- URL fixa oficial directions, payload/privacidade e ciclo de seleção conforme spec; sem extração de iframe/SDK ou envio de coordenadas ao Worker.
- Nenhuma chave real em fonte/log/chat. Chave nova só após confirmação concreta; faturamento pelo proprietário.
- Preservar código avançado anterior na branch/PR #1; nova branch parte da main0f15d7e e fallback revisado1797537.

## Review Focus

- Cliques/edições rápidos não mantêm iframe de endereço antigo.
- Cálculo GTFS pendente não retoma mapa após escolha Google e vice-versa.
- onLoad não atesta resposta Google nem permite ler conteúdo de outra origem.
- Nenhuma configuração herdada dispara SDK/POST de API paga.
- Geometria/mapa e mensagens permanecem legíveis em360/390/430px; código BUS não escolhe sentido automaticamente.

### Task 1: Fluxo Embed e documentação

Files: criar `src/features/google-embed/{types,url,GoogleEmbedPlanner,GoogleEmbedMap}.ts(x)`; integrar JourneyPlanner/App/styles; testar URL/componentes/App; atualizar env/workflow/README/docs; criar public/termos.html,privacidade.html,legal.css e footer links.

Interfaces: GoogleEmbedSelection {origin:Point,destination:Point,mode:"walking"|"transit"}; callback seleção/null; callback BUS por código; onBegin para invalidar plano próprio. App prop opcional de chave pública para testes, default env. Nenhuma alteração Worker/DTO/SPTrans.

- [ ] Escrever RED URL sem chave/pontos inválidos, clique/limpeza e integração sem POST/SDK.
- [ ] Implementar fluxo/mapa, busca manual BUS e fallback/ausência de configuração.
- [ ] Corrigir privacidade/termos/configuração, fortalecer fixture acesso/saída com quatro pontos distintos.
- [ ] Rodar GREEN e suiteJS/Python,typecheck/build,formatação/diff. Commit e report.
- [ ] Revisão específica e ampla; QA local com fixture identificada e sem Google real.

### Task 2: Ativação gratuita e publicação

- [ ] Verificar projeto isolado e contas existentes sem criar compromissos financeiros.
- [ ] Proprietário conclui cadastro/vínculo de faturamento, se necessário; confirmar nova chave restrita ao Embed/API e HTTPS.
- [ ] Configurar variável pública no Pages; publicar somente fluxo gratuito revisado e verificar Google real caminhada/transporte público, SPTrans e celular.
- [ ] Documentar versão/limites e substituir proposta avançada como entrega ativa, preservando seu código.
