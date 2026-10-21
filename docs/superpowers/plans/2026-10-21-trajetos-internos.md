# Trajetos internos gratuitos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task; subagents unavailable due account usage limit. Review when available without purchasing credits.

**Goal:** Exibir caminhada, ônibus, metrô e trem no mapa do próprio site, preservando SPTrans e orçamento R$0.
**Architecture:** Novo índice GTFS multimodal e shapes lazy; worker existente calcula opções, cliente foot calcula somente trechos selecionados; Leaflet renderiza geometrias. Nenhum Google API/iframe/chave.
**Tech Stack:** React/TypeScript/Leaflet/Vitest e Python stdlib existentes, sem dependências novas.
**Spec:** docs/superpowers/specs/2026-10-21-trajetos-internos-design.md

## Global Constraints

- R$0, sem cartões/chaves/contas/serviços pagos. Não iniciar Google Cloud ou iframe.
- Preservar quatro datasets bus auditados e Worker SPTrans. Derivar dados do ZIP local SHA373292... com proveniência e calendários.
- Até uma troca; bus↔bus mesma parada, conexão envolvendo rail até250m e explicitamente a pé, sem promessa tarifária/operacional.
- Foot oficial FOSSGIS: fila1.100ms, cache em memória, timeout25s, abort/stale guards, máximo trechos da opção selecionada; não consultar na digitação.
- Caminhos reais ou erro explícito; sem simular caminho/ETA/chegada de trens.

## Review Focus

- Resposta antiga de walking/shape não substitui endereço/seleção mais recente (Task3 teste de geração).
- Estação com mesmo nome/IDs distintos não vira chegada Olho Vivo nem integração tarifária presumida (Tasks2/3).
- Ordem da shape contrária/inválida não recorta caminho invertido ou vazio silenciosamente (Task1/2).
- Serviço gratuito indisponível/429 não abre API paga nem desenha reta como trajeto (Tasks2/3).
- Mapa inicialmente oculto enquadra geometria ao abrir no celular e não perde botões/atribuição (Task3).

### Task1: Dados multimodais e geometrias GTFS

Files: scripts/import-paths.py (novo), tests/test_import_paths.py, public/data/multimodal.json, public/data/paths/00.json..15.json. Usar funções de leitura/conversão/proveniência do importador existente sem mudar saídas bus.

Produces: multimodal PlannerData v1 com Route.mode/color opcionais; buckets como spec, precision5, bucket somaUTF8%16, stopIndices monotônicos. CLI `python scripts/import-paths.py SOURCE STOPS_JSON OUTPUT_DIR MULTIMODAL_JSON`.

- [ ] RED fixture bus/metro/train, shape recortável e referência inválida/shape ausente, hash divergente; ausência de dependências.
- [ ] Implementar importação, codificação e montagem portrip; validar stops/shape/calendar. Rejeitar inconsistências estruturais; contar shape indisponível, não inventar.
- [ ] GREEN unittest; gerar a partir do ZIP autorizado, auditar contagens/hash/tamanho/inalteração datasetsbus; commit.

### Task2: Contratos, multimodal e clientes de caminhos

Files: journey/types.ts,data.ts,router.ts; novo journey/paths.ts; novo walking/{types,client,instructions}.ts; tests/walking-client.test.ts,journey-paths.test.ts e planner-router/real tests.

Interfaces: `TransportMode=bus|metro|train`; Route/Leg.mode,color opcionais; PlanInput.transport=all|bus|rail opcional. `MapPath={kind:TransportMode|walk,label,points:Point[],color?}`; JourneyMapSelection.paths/railStopIds opcionais. `loadLegPath(leg,signal):Promise<MapPath|null>` usa bucket/sourcehash, corta stopIndices. `routeWalking(from,to,signal):Promise<WalkingRoute>` comdistanceM,durationS,points,steps. `walkingInstruction(step):string` traduz maneuvers conhecidos e preserva nome da via como texto.

- [ ] RED modos, transferência envolvendorail250m, defaultbus legado e nenhuma previsão rail; rota foot válida/invalidpoints/noRoute/malformed/cancel/timeout/1.100ms; bucket/corte/hash inválido.
- [ ] Implementar contrato/parse extras e filtro nofindJourneys; ranking inclui caminhada de conexão. Manter sóaté1troca e sem alterar algoritmo bus-only.
- [ ] Implementar módulos de caminhos/foot com limites/attribution, sem chamadas durante import/render; cache safe e sem erro engolido.
- [ ] GREEN focusedJS/typecheck e commit.

### Task3: Fluxo interno, mapa e publicação

Files: JourneyPlanner,JourneyOptions, novo walking/WalkingPlanner.tsx; TransitMap,App/styles; docs/README/publicprivacy/terms; tests App/map/integration existentes e novos.

- [ ] RED ação interna, label principal e filtro, rota foot/instruções/mapa, metro-only semOlhoVivo, bus+rail chega no embarque bus, botões walking internos, stale after edit/invert/choose/leave, bounds incluem curva da geometria.
- [ ] Integrar base multimodal no clientworker, cálculo e shape/foot da seleção com geração/cancelamento; preservar chegada síncrona/endereços. Módulo walking explícito pode receber segmento escolhido por callback.
- [ ] Renderizar paths e atribuição/legenda; estações não enviam previsão; adaptar labels/ações por mode. Googlelinks ficam secundários, Embed continua desativado.
- [ ] Atualizar privacidade/fontes/config atual e limitações corretas. GREEN fullJS/Python/typecheck/build/format/diff, revisão disponível, QA desktop360390430 com fixtures identificadas e público.
- [ ] Publicar branch/PR por conector com lease e tree iguais, merge autorizado pelo histórico, CI/Pages, validar site. Nenhuma mudança financeira/credencial. Documentar execução/decisões e evidência.
