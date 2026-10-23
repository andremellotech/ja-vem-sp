# Carro e comparação gratuita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** rotas internas de carro e comparação honesta entre caminhada, carro e opções GTFS.
**Architecture:** cliente de vias compartilhado OSRM, sidecar de tempos GTFS com proveniência verificada e painel de comparação no planejador atual. Nenhuma mudança no Worker.
**Tech Stack:** React/TypeScript, Leaflet, Python, Vitest.
**Spec:** ../specs/2026-10-23-carro-comparacao-design.md

## Global Constraints
- R$0, sem credenciais novas ou APIs pagas.
- Um pedido OSRM por segundo por página, sem consultas na digitação; cancelar resultados antigos.
- Não apresentar trânsito ou horários ferroviários como ao vivo.
- Não usar tempo de carro como tempo de ônibus.

## Review Focus
- Resultado antigo após editar ponto ou trocar seleção não altera mapa/frota.
- Falha de um modo não apaga alternativas boas.
- Tempo GTFS ausente, sentido incompatível, janela fechada ou feed divergente não vira estimativa zero.
- Cache/fila distintos por modo, limite compartilhado, timeout e corpo inválido.
- Mudança para carro/caminhada não deixa ônibus do trajeto anterior.

### Task 1: vias para carro e caminhada
Files: src/features/routing/client.ts, src/features/walking/client.ts, src/features/driving/DrivingPlanner.tsx, tests/driving-client.test.ts. Generalizar o parser OSRM e fila existentes, preservar export routeWalking; exportar routeDriving e instruções por modo. RED/GREEN para perfil correto, cache por modo, fila compartilhada, cancelamento e erros.

### Task 2: tempos programados GTFS
Files: scripts/import-journey-times.py, public/data/journey-times.json, src/features/journey/timing.ts, tests/test_import_journey_times.py, tests/journey-timing.test.ts. Exportar arrays alinhadas aos stopIds e frequências de cada trip do ZIP SHA373292…5812; validar proveniência, monotonia, janela e índice. estimateJourney devolve ridingS, walkingS, waitingS,totalS ou motivo de indisponibilidade. RED/GREEN para trecho correto, espera, baldeação, serviço encerrado, dados incompatíveis.

### Task 3: seleção e comparação na tela
Files: src/features/journey/JourneyPlanner.tsx, ModeComparison.tsx, JourneyOptions.tsx, types.ts, src/features/map/TransitMap.tsx, src/App.tsx, styles.css, public/privacidade.html, README.md. Botões explícitos carro/comparação, cartões de modo, seleção no mapa, comparação GTFS e ordenação apenas entre as opções retornadas. Preservar frota ao selecionar transporte e limpar ao selecionar outros modos. RED/GREEN para integração e respostas tardias; verificar desktop/celular com dados reais.

### Final
Rodar suite JS/Python, TypeScript/build e diffcheck. Commit; revisão independente do diff inteiro; corrigir achados. Publicar no GitHub autorizado, verificar CI e produção, registrar screenshot e relatório, atualizar ZIP e encerrar servidor de QA.

## Registro de execução
- Tasks 1–3 implementadas. RED/GREEN para carro, fila/cache por modo, timeout de corpo, parser/estimativa GTFS, cancelamento, comparação e seleção após ordenação.
- Ruling: reutilizar WalkingPlanner com parâmetro de modo em vez de duplicar DrivingPlanner; mantém apresentação e avisos de ponto ajustado consistentes.
- Ruling: janelas do sidecar em tuplas compactas; parser normaliza e valida antes de usar. Os 2.272 trips do ZIP auditado foram preservados, sem omissões.
- Navegador: Jabaquara → Varginha calculou carro29min/21,2km, a pé245min/18,4km e opções GTFS; ordenar tempo manteve seleção675M-10 + Linha9 e sua frota correta. Carro no celular390×844 apresentou linha azul e zero marcadores de ônibus.
- Revisão independente encontrou dois P2: carregamento GTFS interrompido ao alternar mapa e instruções de rampas/retornos perdidas. Reproduzidos em testes antes da correção; ambos passaram após desvincular tempos do controller do mapa e preservar manobras/direção.

