# Integração Google Routes — implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute task-by-task; reports stay in the ignored plan workspace.

**Goal:** apresentar trajetos oficiais Google no site e preservar consulta SPTrans.
**Architecture:** Worker valida e normaliza Routes API; React solicita por clique, mostra instruções e Google Map sob demanda. Chaves/configuração não fazem parte do código público.
**Tech Stack:** React/TypeScript, Cloudflare Worker, Google Routes REST e Maps JavaScript API, sem nova dependência de produção.
**Spec:** docs/superpowers/specs/2026-10-20-google-routes-design.md

## Global Constraints

- Mesmo contrato de pontos/rotas da especificação, tipos em `src/google-routes-contracts.ts`.
- Endpoint POST dedicado, segredo servidor, sem log de pontos/chaves e sem encaminhar parâmetros arbitrários.
- Nunca Google geometrias no Leaflet, nem cache persistente/raspagem/dados fictícios em produção.
- Google recebe pontos só após clique explícito; limpar resultado em edição/modo e rejeitar respostas antigas.
- SPTrans preservada. BUS abre busca por código; nenhum sentido presumido.
- Sem ativação faturável/novas credenciais até configuração concreta autorizada; código revisável primeiro.

## Review Focus

- Preflight JSON/CORS não pode bloquear POST legítimo nem liberar endpoint faturável sem configuração/limiter.
- Tempos/localizações opcionais, veículos desconhecidos, horário fora do dia e erro do fornecedor não geram dados inventados ou segredo exposto.
- Edição/modo/alternativa com resposta pendente não restaura rota antiga nem mantém conteúdo Google escondido.
- SDK bloqueado/timeout e StrictMode não duplicam mapas/scripts ou deixam estado eternamente carregando.
- Código de linha Google ausente/ambíguo e modal ferroviário não podem selecionar frota ou sentido errado.

### Task 1: Contrato e servidor

**Files:** shared `src/google-routes-contracts.ts`; `worker/src/google-routes.ts`, `worker/src/index.ts`, `worker/wrangler.toml`; testes `worker/tests/google-routes.test.ts` e exemplos de configuração sem segredos.

- [ ] RED: validação/body/mode/preflight; falta de segredo/limiter; limite; contrato walking/transit com opcionais, vazio, erros seguros e timeout12s.
- [ ] Implementar POST, máscara explícita, normalização limitada, fonte/data e booleano health. Preservar GET SPTrans e limiter existente. Novo binding5/60.
- [ ] Rodar testes cobrindo código e suite completa, typecheck/build, format/diffcheck. Commit e report.
- [ ] Revisão independente específica e corrigir achados importantes.

### Task 2: Experiência Google e mapa

**Files:** `src/features/google-routes/{client,GoogleJourneyPlanner,GoogleRouteMap,maps-loader}.ts(x)`; `JourneyPlanner`, `App`, estilos, testes e docs/termos/privacidade. Consumir contrato Task1 e links fallback a05bdbb.

- [ ] RED: clique explícito, formulário inválido, edição/modo e respostas antigas, erro/vazio, seleção/rota, BUS abre código; mapa SDKtimeout/retry/limpeza. Incluir fixture com coordenadas distintas no acesso/saída.
- [ ] Implementar painel, critérios, instruções/horários e atribuição; chamar callback de mapa próprio Google; limpar na troca de fluxo. `Acompanhar ônibus` abre busca SPTrans e escolha de sentido.
- [ ] Google Map usa script oficial sob demanda com chave pública restrita, limite12s, sem biblioteca extra, SDK adapter simulado em testes. Nenhuma geometria Google no Leaflet. Docs públicas e privacidade atualizadas.
- [ ] Suite completa JS/Python, build/typecheck/formatação; QA desktop/celular com fixtures claramente identificadas. Commit/report.
- [ ] Revisão de Task2 e toda a branch; corrigir achados importantes.

### Task 3: Configuração e validação real

- [ ] Preparar resultado concreto/revisável e instruções de configuração; proprietário conclui termos/faturamento e autoriza chaves/limites.
- [ ] Configurar somente projeto/chaves/quotas autorizados, guardar segredo no Worker e chave pública restrita em variável da publicação, sem imprimir valores.
- [ ] Publicar com atualização protegida já autorizada; CI/Pages e Worker. Verificar Google real caminhada/transporte público e consulta SPTrans; nunca usar fixtures na publicação.
- [ ] Relatório final, capturas e ZIPs atualizados. Se configuração externa estiver pendente, preservar branch pronta e descrever exatamente a dependência, sem afirmar integração real concluída.
