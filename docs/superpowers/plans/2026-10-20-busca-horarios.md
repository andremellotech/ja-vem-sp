# Busca e horários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facilitar consultas de transporte por endereço, proximidade ou linha, com programação verdadeira por intervalos.

**Architecture:** Manter React/Vite, Leaflet e a API Olho Vivo. Acrescentar programação GTFS separada sob demanda e componentes de sugestão/proximidade; preservar o planejador e seus limites conhecidos.

**Tech Stack:** React, TypeScript, Vite, Vitest, Python stdlib, GTFS oficial, Photon.

**Spec:** `docs/superpowers/specs/2026-10-20-busca-horarios-design.md`

## Global Constraints

- Não fabricar partidas ou horários de passagem a partir de frequências sem `exact_times=1`.
- Não contornar HTTP403 da fonte de partidas exatas; link oficial por código permanece disponível.
- Sugestões de endereço: mínimo três caracteres, pausa de600ms, cancelamento, cache limitado em memória e controle `active`.
- GPS somente por ação, endereços sem persistência, localização sem envio ao geocoder por padrão.
- Manter diretos/uma troca, alcance800/1200m, seis opções, todas as paradas das linhas selecionadas e avisos de cobertura.
- Sem novas dependências de produção, nenhuma alteração de credenciais/hospedagem.

## Review Focus

1. Resposta tardia após seleção/limpeza/troca de modo não ressuscita sugestões antigas — Task2/3.
2. Mesmo código, destinos opostos e sentido não confirmado não recebem programação errada — Task1.
3. Horários sem serviço/sobrepostos/ausentes/hash diferente não são exibidos como disponíveis — Task1.
4. Posição obtida depois de origem manual não sobrescreve endereço — Task3.
5. Resultado local de linha antigo não se confunde com confirmação de operação atual ou mais rápida — Task3.

### Task 1: Programação GTFS por linha

**Files:** `scripts/import-gtfs.py`, `tests/test_import_schedules.py`, `src/features/schedules/{types,data,LineSchedule}.ts(x)`, `tests/{schedule-data,line-schedule}.test.ts(x)`, `src/features/journey/line-stops.ts`, `tests/line-stops.test.ts`, `public/data/schedules.json`.

**Interfaces:**

- Produz `ScheduleData` version1, provenance (mesmo hash), validFrom/To, calendars/exceptions e `trips: {id,routeId,headsign,direction,serviceId,windows:{start:number,end:number,headwayS:number,exactTimes:boolean}[]}[]`. Horários em segundos do dia de serviço, suportando >24h.
- `parseScheduleData(value:unknown,expectedHash:string):ScheduleData` valida referências e dados; `loadScheduleData(base:string,expectedHash:string):Promise<ScheduleData>` cache/timeout12s e rejeita cache após erro.
- Acrescentar `tripIds:string[]` ao retorno real de `resolveLineStops`; tornar opcional no tipo se fixtures existentes precisarem. IDs exatamente dos grupos usados; API sem GTFS retorna[] e não confirmação.
- `LineSchedule({line:Line,base?:string})` componente padrão independente; usa `loadLineIndex`/`resolveLineStops` e a programação. Não editar App/styles nesta tarefa.
- CLI `--schedules-output` opcional, mantendo o importador antigo funcionando sem frequencies quando só outros outputs são solicitados.

- [ ] Escrever testes que falhem para importação, valores>24h, lacunas preservadas, exact_times ausente=false, frequência inválida/sobreposta, referências/hash incompatíveis e sentido oposto/incerto.
- [ ] Rodar testes e guardar evidência RED.
- [ ] Implementar modelo/importador/parser/cache/componente, com seletor útil/sábado/domingo, calendário, janelas/intervalos e link `https://www.sptrans.com.br/itinerarios/linha/?numero=CODE`. Sem inferir lista de partidas.
- [ ] Gerar schedules.json a partir do ZIP oficial existente com proveniência idêntica. Conferir39.846 janelas/2.240 itinerários. Rodar suite completa JS/Python e build; relatar falhas externas se existirem.
- [ ] Commit apenas arquivos da tarefa e relatório de execução.

### Task 2: Sugestões de endereço acessíveis

**Files:** `src/features/journey/AddressField.tsx`, `src/features/journey/geocoder.ts`, `tests/{address-field,geocoder}.test.ts(x)` e helpers de teste estritamente necessários; não editar App/JourneyPlanner/styles.

**Interfaces:** Preservar props existentes e acrescentar `active?:boolean` defaulttrue. Campo passa a `role=combobox`, `aria-controls`, `aria-expanded`, listbox/options e `aria-activedescendant`. `searchAddresses` mantém assinatura pública. Não enviar coordenadas do aparelho ao Photon. Componente escondido (`active=false`) cancela e não consulta.

- [ ] Escrever testes que falhem: só consultar após3chars+600ms, cancelar/rejeitar atrasados ao limpar/inativar, teclado/setas/Enter/Escape, confirmação de aproximado, erro+busca manual.
- [ ] Rodar regressões RED e implementar debounce/cache de até50 buscas em memória com expiração5min; preservar timeout e controles de cancelamento individuais.
- [ ] Atualizar consultas de teste que passam de textbox a combobox em arquivos autorizados; informar ao integrador as outras ocorrências sem editá-las.
- [ ] Rodar testes da tarefa e suite completa; commit/relatório.

### Task 3: Integração de busca, proximidade, horários e celular

**Files:** `src/features/lines/{catalog,LineSearch}.ts(x)`, `src/features/nearby/{nearby,NearbyTransit}.ts(x)`, `src/App.tsx`, `src/features/journey/{JourneyPlanner,JourneyOptions,router,types}.ts(x)` se necessário, `src/styles.css`, testes relacionados, `public/data/lines.json`, README/docs de auditoria afetados.

**Interfaces:**

- `LineSearch({value,onChange,onSubmit,onSelect,active})`, snapshot local version1/retrievedAt/lines de outputs/auditoria-linhas-api.json, até8 sugestões após2chars; busca manual mantém API.
- `findNearbyTransit(index,point,serviceDate,radiusM):{stops:Stop[],lines:{code,headsign,stop:Stop,distanceM:number}[]}` todos candidatos antes de limitar8+8; somente ônibus/serviços ativos. Sem converter direction numérica para API.
- `NearbyTransit({location:Point|null,onLocate:()=>Promise<Point|null>,onSelectStop:(stop:Stop)=>void,onSelectLine:(code:string)=>void,onStopsChange:(stops:Stop[])=>void,active?:boolean})` lê índice compartilhado e estado de erro/carga.
- `JourneyPlanner` recebe `deviceLocation?:Point|null`; passa `active` aos dois campos, usa GPS disponível só para origem vazia e permite planejar destino após confirmação. Critério `Menos trocas` (padrão) ou `Menos caminhada`, mantendo todas as opções candidatas antes de limitar6. Se alterar entrada do roteador, critério opcional preserva fixtures anteriores.
- App três modos e integração de LineSchedule; mudar texto de linha invalida consulta em voo. Painel de chegadas continua separado. Preservar favoritos, mapa por linha e seleção de alternativas.

- [ ] Escrever testes RED para busca local/teclado, resultado velho ao mudar texto, proximidade(calendário/rail/distância/deduplicação), GPS depois de origem manual, destino+GPS e nova ordenação.
- [ ] Implementar componentes/integração; manter comportamento equivalente e mover apenas responsabilidades necessárias do App para componentes focados.
- [ ] Atualizar copy de privacidade (digitação consulta Photon) e limites/horários na informação do site e relatórios anteriores que ficaram desatualizados.
- [ ] CSS responsivo360/390/430px, sugestões tocáveis e teclado, listas/horários sem overflow da página; manter identidade visual.
- [ ] Suite completa, importador, typecheck/build, formatação dos alterados e diff-check. Commit/relatório.

### Task 4: Revisão, auditoria final e publicação

**Files:** documentação de entrega e artefatos locais; correções somente para achados reproduzidos.

- [ ] Revisão independente por tarefa e de toda a branch; corrigir achados importantes com RED/GREEN.
- [ ] Repetir auditoria completa de códigos, pontos, associação e frequência; conservar pendências da fonte sem prometer validação física.
- [ ] Conferir no navegador público/preview: autocomplete, linha857C/476A, programação e linkoficial, proximidade com fixtures GPS sem nova permissão real, desktop e390px.
- [ ] Publicar main por atualização protegida já autorizada, conferir Actions/Pages, guardar captura e atualizar ZIPs/documentação.
