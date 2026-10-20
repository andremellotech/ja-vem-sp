# Planejador de origem e destino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Permitir informar dois endereços de São Paulo e encontrar opções de ônibus diretas ou com até uma troca, com as paradas e as distâncias aproximadas.

**Architecture:** Photon confirma os endereços no navegador; um índice estático do GTFS fornece viagens e calendários. Um Web Worker calcula opções sem bloquear a interface. A consulta existente da SPTrans fornece as chegadas disponíveis, sem deduzir identificadores por sentido.

**Tech Stack:** React, TypeScript, Vite, Leaflet, Vitest e Python da base existente. Sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-10-19-planejador-enderecos-design.md` — aprovada pelo usuário em 19/10/2026.

## Global Constraints

- “De onde você vai sair?” e “Para onde você vai?” são os rótulos dos campos.
- “Ver opções de ônibus” exige os dois pontos confirmados; editar invalida a seleção.
- “rotas de ônibus (route_type=3)” e “trajetos com até uma troca”.
- “até 12 paradas de ônibus em cada extremidade, num raio de 800 m”; ampliar para “1.200 m” somente por ação explícita.
- “até seis alternativas”, por menos trocas, menor distância nas extremidades e quantidade de paradas como desempate.
- “America/Sao_Paulo”, calendários e exceções; base vencida exige atualização.
- Troca somente no mesmo stop_id; embarque deve anteceder desembarque em cada viagem.
- Endereços/GPS somente em memória; consultas Photon somente por ação explícita, sem geocodificação reversa do GPS.
- Não inventar tempos ou garantir operação; identificar itinerários cadastrados e distâncias em linha reta.
- Preservar busca de linhas/paradas, rede, favoritos, atualização manual e Lista/Mapa.
- Publicar pelo GitHub Pages existente; segredo SPTrans permanece no Worker.

## Review Focus

1. Calendário com serviço incluído apenas por exceção, sem registro semanal: deve funcionar nessa data (tarefa 2).
2. Duas paradas com coordenadas iguais e IDs diferentes: não criam transferência fictícia (tarefa 2).
3. Resposta de endereço ou GPS chega após o visitante editar o campo: não substitui a escolha atual (tarefas 3/4).
4. ÍNDICE e paradas de versões diferentes após cache/publicação: recusar cálculo e permitir tentar novamente (tarefas 1/2).
5. Texto com acentos, aspas, `&` ou marcação HTML: manter a consulta íntegra e exibir texto seguro (tarefa 3).

## Estrutura e contratos compartilhados

- `scripts/import-gtfs.py`: conservar a conversão atual e acrescentar geração opcional do índice.
- `public/data/planner.json`: índice gerado; o ZIP original fica fora do Git.
- `src/features/journey/types.ts`: contratos abaixo.
- `data.ts`, `calendar.ts`, `router.ts`: validação/indexação, dias de serviço e busca, respectivamente.
- `planner.worker.ts`, `client.ts`: execução isolada e controle de requisições.
- `geocoder.ts`, `AddressField.tsx`: busca Photon e confirmação de endereço.
- `JourneyPlanner.tsx`, `JourneyOptions.tsx`: formulário e cartões.
- `src/App.tsx`, `src/styles.css`, `src/features/map/TransitMap.tsx`: integrar modos e destaques no mapa.

Tipos públicos em `types.ts`; o JSON gerado segue os mesmos objetos:

```ts
type Point = { lat: number; lon: number };
type Place = Point & { id: string; label: string; approximate: boolean; source: "photon" | "device" };
type Route = { id: string; code: string; name: string };
type Trip = { id: string; routeId: string; headsign: string; direction: string | null; serviceId: string; stopIds: string[] };
type Calendar = { id: string; start: string; end: string; weekdays: boolean[] }; // segunda..domingo
type ServiceException = { serviceId: string; date: string; added: boolean };
type Provenance = { source: string; retrievedAt: string; license: string; sha256: string };
type PlannerData = { version: 1; provenance: Provenance; validFrom: string; validTo: string; routes: Route[]; trips: Trip[]; calendars: Calendar[]; exceptions: ServiceException[] };
type PlanInput = { origin: Point; destination: Point; serviceDate: string; radiusM: 800 | 1200 }; // YYYYMMDD
type JourneyLeg = { tripId: string; routeId: string; lineCode: string; headsign: string; from: Stop; to: Stop; fromIndex: number; toIndex: number; stopCount: number };
type JourneyOption = { id: string; legs: JourneyLeg[]; accessM: number; egressM: number; transferCount: 0 | 1; stopCount: number };
type PlannerResult = { options: JourneyOption[]; radiusM: 800 | 1200; reason?: "NO_NEARBY_STOPS" | "NO_CONNECTION" };
type JourneyMapSelection = { origin: Point; destination: Point; stops: Stop[] };
```

`Stop` é o contrato existente de `src/contracts.ts`. `PlannerIndex` é produzido em `data.ts`: `{data: PlannerData; stops: NetStopIndex; routes: Map<string,Route>; occurrences: Map<string,{tripIndex:number;stopIndex:number}[]>}`. Seu índice de paradas contém somente IDs usados pelas viagens de ônibus. Erros compartilhados: `PlannerError(code, message)`, com códigos `INVALID_DATA`, `EXPIRED_DATA`, `DATA_UNAVAILABLE` e `TIMEOUT`.

---

### Tarefa 1: Gerar e validar os dados de viagens

**Files:** Modify `scripts/import-gtfs.py`; Create `src/features/journey/types.ts`, `data.ts`, `public/data/planner.json`; Test `tests/test_import_planner.py`, `tests/planner-data.test.ts`.

**Interfaces:** `convert_planner(source, stops_data: dict, provenance: dict) -> dict`; CLI acrescenta `--planner-output PATH` opcional. `parsePlannerData(value: unknown, expectedFeedHash: string): PlannerData`; `createPlannerIndex(data: PlannerData, networkStops: NetStop[]): PlannerIndex`. Tarefas posteriores consomem esses contratos e os tipos compartilhados.

- [x] **1. Escrever testes do importador.** Criar ZIP mínimo em memória com ônibus A→X→D, viagem reversa e metrô; stop_times fora de ordem; calendário semanal e exceção. Asserções: apenas ônibus; `stopIds == ["A","X","D"]`; headsign/direction mantidos; exceção incluída; proveniência mantida. Referência inexistente, sequência duplicada ou calendário inválido lança `ValueError`. A conversão antiga continua aceitando suas fixtures atuais.
- [x] **2. Executar para observar falha.** `python -m unittest discover -s tests -p 'test_import_planner.py'`: falha por `convert_planner` ausente.
- [x] **3. Implementar a conversão opcional.** Validar referências entre rotas, viagens, paradas e serviços. Permitir serviço somente em calendar_dates. Preservar ocorrências repetidas de uma parada com sequências diferentes. Incluir as datas de exceção na validade geral. Exportar versão 1 no formato `PlannerData`; não exportar shapes, tarifas ou o ZIP.
- [x] **4. Escrever testes TypeScript e observar falha.** `parsePlannerData` aceita fixture válida, rejeita versão/hash diferentes e dados essenciais inválidos. `createPlannerIndex` rejeita coordenadas fora da faixa e referências de paradas ausentes; não inclui parada ferroviária sem serviço de ônibus. Executar `pnpm exec vitest run tests/planner-data.test.ts` antes da implementação.
- [x] **5. Implementar os tipos e validadores.** Construir os índices de proximidade e ocorrências com os módulos existentes; rejeitar referências inconsistentes em vez de calcular parcialmente.
- [x] **6. Verificar e gerar o dado real.** Os dois comandos de teste anteriores e `python -m unittest discover -s tests -p 'test_*.py'` devem passar. Rodar o importador com o GTFS local, metadados de proveniência existentes e `--planner-output public/data/planner.json`; conferir hash igual ao de `stops.json`, todas as referências resolvidas e 1.349 rotas de ônibus no feed atual.
- [x] **7. Commit:** `feat: gera índice GTFS para planejamento de ônibus`.

### Tarefa 2: Calcular opções e executar em Web Worker

**Files:** Create `calendar.ts`, `router.ts`, `planner.worker.ts`, `client.ts` em `src/features/journey/`; Test `tests/planner-router.test.ts`, `tests/planner-client.test.ts`.

**Interfaces:** `serviceDateInSaoPaulo(now: Date): string`; `activeServices(data: PlannerData, date: string): Set<string>`; `findJourneys(index: PlannerIndex, input: PlanInput): PlannerResult`. `createPlannerClient(stopsUrl: string, plannerUrl: string): {plan(input: PlanInput, signal?: AbortSignal): Promise<PlannerResult>; dispose(): void}`. Worker recebe `{type:"init",stopsUrl:string,plannerUrl:string}` uma vez, depois `{type:"plan",requestId:number,input:PlanInput}`. Responde `{type:"result",requestId:number,result:PlannerResult}` ou `{type:"error",requestId:number|null,error:{code,message}}`; erro com requestId null rejeita todas as consultas aguardando inicialização.

- [x] **1. Escrever testes do cálculo.** Fixture A(-23.55,-46.63), X(-23.57,-46.65), D(-23.59,-46.67), rota direta A→X→D e alternativa A→X + X→D. Conferir uma perna direta, duas pernas com a mesma parada X, `fromIndex < toIndex` e até seis resultados. Retirar rota direta para comprovar a troca; inverter origem/destino sem viagem reversa deve retornar vazio.
- [x] **2. Acrescentar limites e calendários aos testes.** Círculo A→X→A→D preserva o embarque correto; X e X2 com coordenadas iguais não conectam viagens. Serviço excluído por exceção não aparece; adicionado por exceção sem calendário semanal aparece. Um ponto a 1.000 m fica fora em 800 e entra em 1.200; só as 12 paradas de ônibus mais próximas entram. Base vencida lança `EXPIRED_DATA`; empate usa total de paradas; timestamp `2026-10-20T01:30:00Z` resulta em `20261019` no fuso de São Paulo.
- [x] **3. Observar falha.** `pnpm exec vitest run tests/planner-router.test.ts`: módulos/funções ainda ausentes.
- [x] **4. Implementar calendário e busca.** Exceções substituem o calendário da data. Indexar as ocorrências que chegam aos desembarques candidatos; percorrer viagens a partir dos embarques e cruzar transferências somente por stop_id. Evitar comparar todos os pares de viagens. Manter índices das ocorrências de linhas circulares. Deduplicar por pernas, embarque, troca e desembarque; ordenar por trocas, soma accessM+egressM e stopCount. Não filtrar por suposição de horário de operação.
- [x] **5. Testar o cliente antes de implementá-lo.** Simular a fronteira Worker: respostas fora de ordem correspondem ao requestId correto; abortar descarta a resposta; falha de carregamento/hash rejeita a promessa; `dispose` encerra o Worker; ausência de resposta rejeita em 20 s. Executar `pnpm exec vitest run tests/planner-client.test.ts` e observar falha.
- [x] **6. Implementar Worker/cliente.** Vite `new Worker(new URL('./planner.worker.ts', import.meta.url), {type:'module'})`; carregar os dois JSONs uma vez por Worker, comparando hashes antes de construir o índice. Gerar URLs absolutas de `data/stops.json` e `data/planner.json` relativamente a `new URL(import.meta.env.BASE_URL, location.href)`. Consultas aguardam a inicialização. Reaproveitar dados carregados, rejeitar erros sem deixar promessas penduradas e terminar no unmount. Endereços permanecem fora das mensagens; enviar somente as coordenadas necessárias ao cálculo local.
- [x] **7. Verificar.** `pnpm exec vitest run tests/planner-data.test.ts tests/planner-router.test.ts tests/planner-client.test.ts` e `pnpm typecheck`: todos passam. Medir o cálculo no feed real, registrando tempo e quantidade de opções sem publicar coordenadas privadas.
- [x] **8. Commit:** `feat: calcula trajetos diretos e com uma troca no navegador`.

### Tarefa 3: Localizar e confirmar os endereços

**Files:** Create `src/features/journey/geocoder.ts`, `AddressField.tsx`; Modify `.env.example`; Test `tests/geocoder.test.ts`, `tests/address-field.test.tsx`.

**Interfaces:** `searchAddresses(query: string, signal?: AbortSignal, endpoint?: string): Promise<Place[]>`, endpoint padrão `https://photon.komoot.io/api/`, configurável por `VITE_GEOCODER_URL`. Exportar `GeocodeError(code,message)` com códigos `UNAVAILABLE`, `TIMEOUT` e `INVALID_QUERY`. `AddressField({label,value,selected,onChange,onSelect,endpoint?})`, com `label:string`, `value:string`, `selected:Place|null`, `onChange(text:string)`, `onSelect(place:Place)` e `endpoint?:string`.

- [x] **1. Escrever testes Photon.** Mockar apenas fetch com GeoJSON: validar coordenadas finitas e faixas, remover duplicatas, compor endereço legível, limitar seis resultados e manter marcação como texto. Consulta `Av. São João, 42 & Praça` deve formar um único parâmetro q, manter `countrycode=BR` e `limit=6`. Se o número pedido faltar/divergir, `approximate=true`. Resposta vazia retorna []; HTTP/JSON inválido lança `UNAVAILABLE`, timeout de 12 s lança `TIMEOUT`, consulta fora de 3–160 caracteres lança `INVALID_QUERY` sem fetch e cancelamento lança DOMException com name `AbortError`.
- [x] **2. Observar falha.** `pnpm exec vitest run tests/geocoder.test.ts`: função ainda ausente.
- [x] **3. Implementar o cliente.** URLSearchParams, preferência fixa pelo centro de São Paulo, contexto São Paulo/SP na consulta, countrycode BR e limit 6. Aceitar 3–160 caracteres após trim. Não usar GPS como viés externo nem persistir consultas. Cancelar/limpar timers e listeners.
- [x] **4. Escrever testes do campo e observar falha.** Digitar não faz fetch; botão/Enter faz. Resultados exigem seleção. Aproximado exige “Usar este ponto aproximado” após aviso. Editar invalida ponto confirmado. Uma resposta antiga que ignora abort não substitui os resultados novos. Falha oferece “Tentar novamente”; conteúdo `<img ...>` aparece como texto, sem criar imagem.
- [x] **5. Implementar o campo.** Rotular ação pelo campo (“Localizar origem”/“Localizar destino”), usar lista de botões operável por teclado e aviso de compartilhamento com Photon/OpenStreetMap. Cada nova busca/edição invalida a geração anterior. Endpoint ausente usa o padrão; não alternar provedor silenciosamente.
- [x] **6. Verificar.** `pnpm exec vitest run tests/geocoder.test.ts tests/address-field.test.tsx` e `pnpm typecheck`: todos passam.
- [x] **7. Commit:** `feat: confirma endereços de origem e destino com Photon`.

### Tarefa 4: Integrar formulário, opções, mapa e chegadas

**Files:** Create `JourneyPlanner.tsx`, `JourneyOptions.tsx` em `src/features/journey/`; Modify `src/App.tsx`, `src/styles.css`, `src/features/map/TransitMap.tsx`; Test `tests/journey-planner.test.tsx`, `tests/planner-integration.test.tsx`, `tests/map-visibility.test.tsx`; ajustar seletores de testes atuais somente quando o modo novo exigir.

**Interfaces:** `JourneyPlanner({onMapSelection,onShowArrivals,onLocate})`, callbacks `(selection:JourneyMapSelection|null)=>void`, `(stop:Stop)=>void`, `()=>Promise<Point|null>`. `JourneyOptions({options,selectedId,onSelect,onShowArrivals})` recebe `JourneyOption[]`, `string|null`, `(option:JourneyOption)=>void`, `(stop:Stop)=>void`. `TransitMap` ganha apenas `journey?: JourneyMapSelection|null`. `locate()` no App passa a retornar Promise<Point|null>, preservando aviso e estado de localização existentes.

- [x] **1. Escrever testes de formulário.** Dois pontos confirmados habilitam “Ver opções de ônibus”; inversão troca ambos; editar cancela cálculo e remove resultados/destaques anteriores; nova busca começa em 800 m. Sem resultado oferece botão para 1.200 m; só o clique amplia. Uma resposta antiga do cálculo não substitui uma consulta nova. GPS recusado mantém digitação; GPS que chega após edição não sobrescreve a origem.
- [x] **2. Escrever testes de integração.** Exibir cartões com nomes de embarque, troca e desembarque, códigos e headsign, distâncias em linha reta e aviso de itinerário cadastrado. Selecionar opção atualiza os pontos do mapa. “Ver chegadas nesta parada” limpa a linha anterior e consulta `/api/stops/:id/arrivals` sem lineId; retorno vazio não vira horário inventado. Photon indisponível permite acessar “Linhas e paradas”. Atualizar os testes antigos para escolher esse modo explicitamente quando necessário, mantendo todas as asserções funcionais.
- [x] **3. Observar falha.** `pnpm exec vitest run tests/journey-planner.test.tsx tests/planner-integration.test.tsx`: componentes ausentes.
- [x] **4. Implementar formulário/cartões.** Criar cliente Worker sob demanda e encerrar ao desmontar. Data de serviço é a data atual de São Paulo no momento do cálculo. Reter coordenadas/endereços só em estado React. Exibir limite de 800/1.200 m e até uma troca no estado vazio. Botões de embarque/troca/desembarque podem abrir a consulta existente, sem suposição de correspondência entre direction_id e API.
- [x] **5. Integrar no App.** Modo inicial “Trajeto” e alternativa “Linhas e paradas”; favoritos continuam acessíveis. Navegação cancela requisições antigas e remove seleção de trajeto quando apropriado. Callback de chegadas muda para busca, coloca o Stop recebido em foundStops e o seleciona, mesmo se a carga inicial da rede no App falhou. Mostra todas as linhas. Cliques nas paradas destacadas usam o mesmo callback; outros cliques preservam a seleção existente. GPS explícito é compartilhado com o mapa; formulário protege respostas atrasadas com geração própria.
- [x] **6. Testar e implementar o destaque no mapa.** Acrescentar regressão para uma opção escolhida em Lista enquanto o mapa está oculto: ao abrir Mapa, enquadrar origem, destino e paradas somente com dimensões visíveis. Uma seleção posterior de parada/GPS prevalece. Limpar opção remove somente seus marcadores. Usar camada separada e tooltips de texto; não traçar falso itinerário. Conferir coexistência da rede GTFS e veículos.
- [x] **7. Ajustar CSS e verificar.** Campos de no mínimo 16 px no celular, controles de ao menos 44 px, foco visível, cards sem corte e preservação de Lista/Mapa. `pnpm test`, `pnpm typecheck` e `pnpm build`: passam. Conferir teclado e largura de 390 px no navegador.
- [x] **8. Commit:** `feat: adiciona busca de ônibus entre origem e destino`.

### Tarefa 5: Revisar, publicar e conferir a versão real

**Files:** Modify `README.md`; atualizar os documentos e pacotes em `outputs/` da tarefa local. Código de implantação existente permanece; ajustar apenas se um problema comprovado exigir.

**Interfaces:** Entrega pública em `https://andremellotech.github.io/ja-vem-sp/`; API existente. Usar o commit remoto mais recente como pai, sem substituir alterações paralelas do usuário.

- [ ] **1. Revisar o diff inteiro.** Aplicar `superpowers:requesting-code-review` com um revisor independente e contexto delimitado; corrigir achados importantes com regressões. A execução preservada é nativa: implementação pelo agente atual, revisão final separada.
- [ ] **2. Verificar tudo.** `pnpm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `pnpm build` com VITE_API_BASE_URL público, formatação dos arquivos alterados e `git diff --check`: todos passam. Conferir worker emitido como asset, caminhos relativos sob `/ja-vem-sp/` e ausência de credenciais/endereços privados no pacote.
- [ ] **3. Conferir casos reais antes da publicação.** Usar somente endereços públicos de teste; escolher um caso direto e um com troca encontrados pelo índice real e conferir suas sequências no GTFS. Verificar confirmação aproximada, resultado vazio, erro recuperável e navegação existente. Registrar capturas desktop/celular em outputs. Não aceitar permissão GPS do navegador sem autorização específica; testar recusa no navegador e sucesso com fixture controlada.
- [ ] **4. Atualizar a documentação e fazer commit.** Explicar Photon, compartilhamento de consulta, operação cadastrada versus chegadas reais, raio, troca e atualização conjunta dos JSONs. Manter o ZIP GTFS e credenciais fora do Git.
- [ ] **5. Publicar.** Conferir novamente o HEAD remoto e integrar mudanças novas antes de avançar main, usando expected_sha. Não é necessária mudança na API apenas para calcular trajetos. Aguardar sucesso dos testes/build/deploy no GitHub Actions.
- [ ] **6. Validar a página pública.** Confirmar os dois campos, seleção de endereços, os dois casos reais e abertura das chegadas no domínio publicado; conferir arquivos estáticos sem 404. Salvar captura da publicação e atualizar os ZIPs de código/site com a API pública, reabrindo-os para validar o conteúdo.
- [ ] **7. Entregar.** Link do site, breve descrição do que mudou, resultado dos testes, captura e limitações relevantes. Não afirmar garantia de operação ou percurso a pé.

## Handoff

Plano preparado e revisto contra a especificação aprovada. Execução preservada:
nativa nesta conversa, com revisão independente do conjunto antes de publicar.
Aguardar a revisão deste plano pelo usuário antes de iniciar a tarefa 1.
