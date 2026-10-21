# Trajetos dentro do Já Vem SP, sem chave ou cartão

O proprietário rejeitou uma entrega que apenas abria links Google e mandou continuar com os trajetos dentro do site. Orçamento R$ 0, sem compras no cartão e sem criar chave Google. A versão pública anterior permanece funcionando até a substituição estar testada. O produto final mostra desenho do percurso e etapas no Leaflet existente; links externos ficam secundários.

## Fontes e limites

Reutilizar o ZIP SPTrans já obtido em19/10/2026, SHA256 `373292560d8c85d05f372eb83d40610ae11a7f18e3b53d1ac9dde0166baf5812`, guardado localmente em Downloads/_sptrans_gtfs.zip. São1.349 rotas bus,9metrô,7trem e32modelos rail; os quatro datasets auditados de bus permanecem iguais. Produzir nova base multimodal e geometrias derivadas com mesma proveniência, calendários e referência dos arquivos existentes. Não inventar linha, forma, abertura, chegada ou partida. Cadastro diário não comprova operação naquele horário; rail não recebe posições/chegadas Olho Vivo.

Caminhada real usa endpoint oficial FOSSGIS `https://routing.openstreetmap.de/routed-foot/route/v1/foot/`, OSRM com geometries=geojson,overview=full,steps=true. Foot é mundial e não usa chave. Uma consulta pública Sé→Ibirapuera retornou200/CORS*,388pontos,6.007,7m. Respeitar máximo1req/s por cliente (fila1.100ms entre inícios), sem consultas na digitação, sem pré-carregar alternativas, cache em memória, timeout25s e cancelamento. Somente os trechos da opção selecionada são consultados. Sem fallback pago, rota de automóvel ou reta fingindo caminho. Se falhar, comunicar indisponibilidade e manter o transporte/endereços.

FOSSGIS recebe coordenadas/IP/referenciador e registra solicitações. Informar isso antes do botão de cálculo, inclusive quando o ponto veio de GPS. Mostrar atribuição OpenStreetMap/FOSSGIS e link para corrigir mapa. Fonte https://routing.openstreetmap.de/about.html ; contrato https://project-osrm.org/docs/v5.24.0/api/#route-service ; endpoint confirmado no código oficial https://raw.githubusercontent.com/fossgis-routing-server/osrm-frontend/gh-pages/src/leaflet_options.js . Não copiar dados Google ou usar iframe não documentado.

## Dados e cálculo

Nova `public/data/multimodal.json` segue PlannerData v1 e inclui todos os tipos1,2,3 com `mode:bus|metro|train` e cor validada. O worker de trajetos usa esta base; catálogo/horários/nearby/itinerários bus continuam na planner.json auditada. Tipos/mode extras opcionais e defaults bus preservam compatibilidade. Calendários e validação de hash mantêm as proteções existentes.

Preservar as alternativas diretas e até uma troca. Filtro permite todos, somente ônibus ou metrô/trem. Troca bus↔bus continua na mesma parada. Se ao menos uma perna for rail, permitir ligação a pé entre pontos distintos até250m em linha reta; mostrar que exige caminhada e pode exigir nova entrada/tarifa. Isso não afirma integração tarifária ou acesso subterrâneo. Os trechos selecionados recebem caminhada real; sua disponibilidade não é presumida da proximidade. Ordenação continua menos trocas/menor caminhada, com transferência a pé incluída. Não anunciar rota mais rápida ou tempo total de transporte.

Nova pasta `public/data/paths/` contém16buckets estáticos, definidos por soma de bytes UTF8(tripId)%16. Cada bucket `{version:1,provenance,paths:{tripId:{polyline:string,stopIndices:number[]}}}` usa polilinha precisão5, com stopIndices monotônicos escolhidos na geometria oficial. Busca lazy de no máximo um bucket por perna; cache em memória. Validar hash, referências, coordenadas, índices e tamanho. Recortar geometria entre fromIndex/toIndex da perna; não converter linhas retas entre pontos em itinerário real. Dataset inválido não contamina resultado de outro feed.

Correção após conferência da fonte: stopIndices aceita `number|null`; null identifica parada a mais de1km da shape disponível. Isso preserva partes válidas sem desenhar conexão inventada. Exemplo real: a shape da L12 começa em Tatuapé, embora o itinerário cadastre Brás. Um segmento com endpoint null não recebe traçado; os demais continuam disponíveis. O importador auditado recebe parâmetro opcional allowed_types, padrão somentebus, para reutilizar validações sem duplicar lógica ou alterar saídas existentes.

## Interface e estado

Após confirmar origem/destino: ação principal **Ver opções de transporte**, filtro de modos, e ação **Ver caminhada no mapa**. Resultados identificam ônibus/metrô/trem por nome/cor/ícone, embarque/desembarque, conexão e número de paradas/estações. Escolher opção desenha o percurso no mapa do site. Caminhada direta mostra distância, duração estimada e instruções em português com os dados OSRM. Na opção de transporte, botões de caminhada até embarque e após desembarque calculam/desenham o trecho internamente.

JourneyMapSelection mantém os campos existentes e acrescenta `paths?:MapPath[]` e `railStopIds?:string[]`. MapPath contém kind, label, coordenadas Point[] e cor opcional. Leaflet desenha trilhos/ônibus sólidos e caminhada tracejada; inclui geometrias nos limites de enquadramento. Estação rail tem tooltip e não dispara previsão SPTrans. Chegadas são oferecidas apenas nos embarques de pernas bus; preservar frota/paradas dos ônibus e o fluxo de retorno com endereços confirmados.

Edição, inversão, GPS, troca de critério/modo, nova opção e saída invalidam solicitações antigas. Async de geometria/caminhada não pode substituir o mapa depois de outro resultado/chegadas. A configuração de uma preferência não apaga resultados antes do cálculo. Fila de rede descartará tarefas abortadas e nunca consultará pontos antigos. Mostrar progresso/erro recuperável, sem resultado fictício.

## Aceitação

Testes de importação/proveniência, modos/calendário, caminhos recortados, transferências bus/rail, API foot validada/cancelada/timeout/throttle/erro, instruções, integração real App, botões internos e ausência de iframe/API Google. Testar resposta atrasada após editar/sair, ambos sentidos, ausência de rota, estações sem previsão, mapa oculto/celular e preservação de chegadas bus. Rodar suíteJS/Python,typecheck,build,format,diff; revisar, QA local identificado e público com lugares públicos, sem usar localização pessoal. Publicar somente após esses checks, sem alterar conta/plano Google/Cloudflare ou criar credenciais.
