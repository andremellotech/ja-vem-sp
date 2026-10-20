# Busca, proximidade e horários — Já Vem SP

## Intenção e escopo

Pedido de 20/10/2026: conferir todas as linhas, facilitar as buscas no celular, sugerir endereços enquanto se digita, mostrar transporte próximo quando a localização for fornecida, sugerir linhas para um destino e permitir consultar os horários de um ônibus específico. Preservar GitHub Pages, API existente, marca e as opções diretas/com uma troca já implementadas.

Esta ampliação altera os fluxos existentes de busca e consulta de linha e acrescenta consulta de programação estática. Não exige nova conta, serviço pago ou mudança de hospedagem.

## Dados e precisão

- Catálogo completo auditado: 1.349 códigos e 2.698 registros API de sentido. Manter as lacunas identificadas; não inventar viagens para os 39 códigos sem itinerário GTFS.
- O ZIP oficial de 19/10 contém 39.846 janelas de frequência para os 2.240 itinerários, com `exact_times` ausente. São intervalos programados, não uma lista de partidas exatas. Preservar limites e interrupções, inclusive as lacunas de um minuto entre faixas de 59 minutos.
- A página oficial oferece partidas exatas por tipo de dia. As duas consultas independentes ao endpoint público usado pela página retornaram HTTP403. Não copiar uma linha isolada para fingir cobertura da rede, nem contornar o bloqueio. Exibir faixas/intervalos do GTFS e um link específico para a programação oficial de cada código.
- Não calcular horários de passagem por ponto somando tempos do modelo. Previsões de chegada continuam provenientes do Olho Vivo, quando disponíveis.
- “Opção sugerida” significa menor número de trocas, depois menor caminhada de acesso/saída e menos paradas; não prometer menor tempo total. Permitir priorizar caminhada. Explicar que o planejador considera o dia, mas não garante operação/conexão naquele horário.

## Experiência

Três modos: **Trajeto**, **Perto de mim**, **Linhas e horários**. No celular os formulários e resultados permanecem legíveis entre 360 e 430px, com alvos de toque e alternância clara para o mapa, sem rolagem horizontal da página.

### Trajeto

Sugestões automáticas após pelo menos três caracteres e 600ms de pausa. Preservar busca manual, confirmação de resultado e confirmação adicional de ponto aproximado. Teclado com setas, Enter e Escape. Cancelar consultas/respostas antigas, inclusive ao esconder o modo. Avisar no formulário que a digitação consulta Photon/OpenStreetMap; não salvar endereços. Cache somente em memória e limitado.

Localização somente após clique. Uma posição já fornecida pode preencher origem vazia, sem substituir endereço digitado/confirmado. Assim, basta escolher o destino quando a localização já estiver disponível. Se GPS falhar, permitir informar a origem. A escolha de opção mostra somente os pontos das linhas utilizadas, preservando os pontos completos já corrigidos.

### Perto de mim

Carregar o índice GTFS uma vez, usando a carga compartilhada existente. Mostrar até oito pontos de ônibus em 800m e até oito combinações linha/letreiro com o ponto mais próximo e distância em linha reta; ampliar explicitamente para 1.200m se necessário. A busca considera todos os candidatos antes de limitar a apresentação. Usar o calendário do dia. Não sugerir metrô como ônibus. Botões para ver chegadas do ponto ou consultar a linha, sem presumir equivalência numérica entre sentidos API/GTFS. A posição é usada localmente para proximidade e planejamento.

### Linhas e horários

Sugestões locais por código, nome e terminais após dois caracteres, até oito registros, a partir de snapshot público do catálogo API; busca manual continua consultando a API para atualização e resultados adicionais. Cancelar resultados antigos quando texto muda. Seleção abre a linha e seus pontos.

Na linha, mostrar **Programação por intervalos**, direção/letreiro, seletor de dia (útil, sábado, domingo), faixas e intervalos fornecidos. Dias sem serviço são informados apenas se o calendário e o itinerário permitirem afirmar isso; sentido incerto mantém aviso e identifica os itinerários disponíveis. Linha sem GTFS, falha ou base divergente mostram mensagem e acesso à página oficial. Tabela de programação cabe no celular. Chegadas no ponto continuam separadas e identificadas como previsão ao vivo.

## Arquitetura

React/Vite e Leaflet existentes. `schedules.json` separado e carregado sob demanda, com mesma proveniência/hash do ZIP e calendário. Nenhuma alteração no contrato do planejador estático ou nova dependência de produção. Resolvedor de linha expõe IDs dos itinerários selecionados para reutilizar a mesma associação na programação.

`AddressField`/geocoder cuidam de sugestões de endereço. Componentes novos pequenos cuidam do catálogo, busca de linha e proximidade. `App` integra modos, estado do mapa e consulta de chegadas; `JourneyPlanner` recebe posição opcional e critério de ordenação. Preservar favoritos e estados de erro/cancelamento.

## Aceitação

- Regressão de digitação rápida, mudança de modo, teclado, erro e resultado aproximado; nenhuma consulta antes de três caracteres.
- GPS recusado e posição fornecida depois de origem manual não bloqueiam nem sobrescrevem endereço.
- Proximidade usa calendário/ônibus, não inventa sentido e permite abrir ponto/linha.
- Linha 857C/476A mantém todos os pontos já conferidos e mostra programação por intervalos nos dois sentidos; nenhuma partida exata é inferida.
- Importação de todas as janelas: 39.846 registros, 2.240 itinerários, fonte/hash compatível e nenhum horário inválido/sobreposto.
- Suite completa, importador, typecheck/build, revisão independente e conferência visual em desktop/celular antes de publicar.
