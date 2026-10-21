# Google Maps e SPTrans

Pedido: comparar trajetos a pé, de metrô/trem e ônibus entre os pontos confirmados, preservando a consulta de ônibus ao vivo.

## Integração disponível

Links oficiais `Maps URLs`, com `api=1`, `origin`, `destination` e `travelmode=walking|transit`. Abrem o Google Maps ou seu aplicativo. Não precisam de chave. O resultado de transporte público depende da disponibilidade; a URL não promete um percurso exclusivamente de metrô. [Documentação oficial](https://developers.google.com/maps/documentation/urls/get-started).

Os pontos são enviados apenas ao abrir o link. Os campos ainda não confirmados não geram links; editar um endereço remove as rotas anteriores. O trecho de caminhada da opção selecionada usa as paradas corretas de embarque/desembarque. Nenhum conteúdo de trajeto do Google é extraído ou armazenado pelo site.

As opções próprias de ônibus, paradas, frota e previsões continuam usando GTFS/SPTrans. Os links externos não devolvem ao site qual alternativa o visitante escolheu no Google; essa escolha não seleciona automaticamente um ônibus na SPTrans.

## Trajeto do Google dentro do site

A [Routes API](https://developers.google.com/maps/documentation/routes/transit-route) permite transporte público, detalhes de paradas/linhas, horários e etapas a pé. Também permite preferências por modalidades, menos caminhada e menos trocas; uma preferência não garante a exclusão das outras modalidades.

O código desta integração está preparado, mas a ativação depende do proprietário. Isso exige projeto Google Cloud, duas chaves e [faturamento habilitado](https://developers.google.com/maps/documentation/routes/usage-and-billing), com cobrança conforme consultas/recursos e quotas configuráveis. Nenhum projeto pago, aceite de termos, credencial ou quota é criado pelo código. Antes de ativar, definir limites de uso e orçamento com o proprietário.

As [políticas da Routes API](https://developers.google.com/maps/documentation/routes/policies) exigem atribuição e documentos públicos de termos/privacidade. Trajetos do Google exibidos em mapa precisam de Google Maps. O mapa Leaflet/OpenStreetMap atual permanece com dados SPTrans; não recebe geometrias de trajetos extraídas do Google.

Mesmo com essa API, a posição GPS da frota continuará vindo da SPTrans. Associar uma linha retornada pelo Google a um registro SPTrans exige conferir código e destino; números de sentido não devem ser presumidos equivalentes.

## Interface e configuração do navegador

Após confirmar os dois pontos, a seção **Seu caminho com Google Maps** oferece caminhada ou transporte público e preferência por todos, metrô/trem ou ônibus. A preferência não garante exclusividade. Somente **Calcular com Google Maps** envia as coordenadas e os critérios ao `POST /api/google/routes` do Worker. Mostrar a seção, digitar, confirmar, inverter os pontos ou mudar critérios não faz essa consulta nem carrega o SDK.

O resultado usa diretamente o contrato `src/google-routes-contracts.ts`, sem o envelope `data` SPTrans: `source`, `fetchedAt`, `routes`. Até quatro alternativas mostram distância, duração, etapas, paradas e horários devolvidos. Horários incluem data em `America/Sao_Paulo`; dados ausentes não são inventados. Instruções são texto escapado. O SDK oficial Maps JavaScript é carregado após um cálculo com resultado; o mesmo mapa é reutilizado ao trocar alternativa. O carregamento tem timeout de 12 segundos e nova tentativa; bloqueio ou falta de chave mantém a lista e os links externos.

Não há armazenamento persistente nem cache de trajetos Google. Edição, inversão, troca de critérios, cancelamento, saída do modo e escolha GTFS cancelam/invalidam a consulta e limpam o conteúdo Google. O endereço confirmado é preservado ao trocar entre modos. Geometria Google nunca é passada ao Leaflet. Atribuição textual Google Maps e avisos do fornecedor acompanham a lista; o mapa conserva a atribuição do SDK. Etapas BUS com código oferecem **Acompanhar ônibus**, que abre a busca SPTrans por código e aguarda a escolha manual de sentido.

1. No Worker, configure o segredo `GOOGLE_ROUTES_API_KEY`, restrito à **Routes API**, e o binding `GOOGLE_RATE_LIMITER` previsto na configuração. Sem ambos, o endpoint fica desabilitado; `/api/health` expõe apenas `googleRoutesConfigured`.
2. Para o navegador, configure `VITE_GOOGLE_MAPS_API_KEY` com uma chave **pública**, restrita à **Maps JavaScript API** e aos referenciadores HTTPS do site (incluindo o caminho do GitHub Pages). Não reutilize a chave secreta de Routes. A chave pública aparece no JavaScript e nas solicitações do navegador por definição.
3. Use `.env.local` no desenvolvimento, com `.env.example` como referência. No GitHub Pages, defina a variável de Actions `VITE_GOOGLE_MAPS_API_KEY`; o workflow a passa ao build junto de `VITE_API_BASE_URL`. Nenhuma chave precisa ser gravada no Git. Alterar a variável exige novo build.
4. Antes de uma ativação real autorizada, confirme APIs, restrições, faturamento, quota diária global e orçamento no Google Cloud. O rate limit de 5 consultas/minuto/IP não substitui quota global de custo. O SDK usa somente Maps JavaScript e a biblioteca geometry dessa mesma API; Street View e APIs Places/autocomplete não são usados.
5. Publique e verifique os documentos públicos `termos.html` e `privacidade.html` (links no rodapé), com os termos/privacidade oficiais do Google. Só então faça uma caminhada e um transporte público reais e uma consulta SPTrans. Essa validação faturável não é substituída pelos testes com fixtures.

O GPS não é enviado automaticamente à API própria para se localizar, mas, quando usado como origem, suas coordenadas são enviadas ao clicar em calcular Google ou em um link externo. Photon recebe texto de busca de endereços; a localização GPS não dispara geocodificação reversa.
