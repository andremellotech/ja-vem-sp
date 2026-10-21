# Trajetos do Google dentro do Já Vem SP

## Objetivo

O usuário escolheu mostrar o trajeto dentro do site e configurar a API oficial do Google. Entre origem e destino confirmados, oferecer caminhada e transporte público (ônibus, metrô e trem conforme disponibilidade), alternativas e instruções. Preservar linhas, pontos, posições e previsões SPTrans existentes. Links Maps URLs já preparados são alternativa em caso de indisponibilidade.

## Fontes e apresentação

Google Routes API para cálculo, distância, duração, etapas, linhas/paradas e horários retornados. Google Maps JavaScript API para desenhar essas geometrias. Nunca desenhar resultados do Google no Leaflet/OpenStreetMap. Dados SPTrans continuam identificados como SPTrans; Google não é apresentado como fornecedor da posição GPS dos ônibus.

Nenhuma raspagem do Maps ou API privada. Sem copiar resultados para GTFS, armazenamento persistente ou cache de trajetos. Conteúdo Google só em estado temporário da tela, removido ao esconder/editar o fluxo. Usar texto escapado para instruções, sem renderizar HTML do fornecedor. Atribuição visível Google Maps e avisos retornados. Publicar termos/privacidade acessíveis e links oficiais exigidos.

## Contrato

`POST /api/google/routes`, JSON `{origin:{lat,lon},destination:{lat,lon},mode:"walking"|"transit",preference:"any"|"rail"|"bus"}`. Pontos finitos nas faixas geográficas válidas. Sem aceitar chaves, endpoints, máscaras, intermediários ou parâmetros arbitrários do visitante.

Resposta: `{source:"Google Maps",fetchedAt:string,routes:GoogleRoute[]}`. Rota: `id`, `description`, `distanceM`, `durationS`, `polyline` codificada, `warnings:string[]`, `steps:GoogleRouteStep[]`. Etapa: `mode:"WALK"|"TRANSIT"`, `instruction`, `distanceM:number|null`, `durationS:number|null`, `from`, `to`, `polyline:string|null`, `transit:null|{lineName,shortName,headsign,vehicleType,departureStop,arrivalStop,departureTime:string|null,arrivalTime:string|null,stopCount:number|null,agencies:{name,url:string|null}[]}`. Strings ausentes viram vazias, valores opcionais ausentes viram null; não inventar horários. Tipos compartilhados em `src/google-routes-contracts.ts`.

Servidor chama somente `https://routes.googleapis.com/directions/v2:computeRoutes`, cabeçalho secreto e máscara explícita dos campos usados. `WALK` ou `TRANSIT`, português/Brasil, unidades métricas, alternativas e `transitPreferences` somente para trânsito. Preferências não garantem modalidade exclusiva; informar isso na tela. Tempo de partida atual no servidor quando aplicável. Não expor corpo de erro, chave ou coordenadas em logs/mensagens. Limite de corpo, resposta e timeout12s, inclusive cancelamento. Sem resultado deve retornar lista vazia clara.

## Configuração e custos

Chave Routes somente no segredo Cloudflare `GOOGLE_ROUTES_API_KEY`, restrita à Routes API. Chave Maps JavaScript pública, restrita à API e aos referenciadores do site, em `VITE_GOOGLE_MAPS_API_KEY` da publicação. Nenhuma chave em commits, logs ou chat.

Google exige faturamento. Não ativar projeto pago, aceitar termos, criar credenciais ou realizar consultas faturáveis reais antes da autorização/configuração concreta do proprietário. Preparar e revisar o código primeiro. Console atual está em aceite de Termos; esse passo cabe ao usuário.

Endpoint desabilitado sem segredo ou binding `GOOGLE_RATE_LIMITER`; retorna erro de configuração. Binding5consultas/minuto/IP adicional à proteção existente. Limite diário global deve ser configurado no Google Cloud conforme orçamento autorizado, pois CORS e limite por IP não substituem quota de custo. Health expõe somente booleano `googleRoutesConfigured`, preservando o contrato SPTrans.

## Interface

Seção Google dentro de Trajeto, após confirmar os pontos. Escolher caminhada/transporte público e preferência por todos, trilhos ou ônibus. Cálculo exige clique explícito e aviso de envio dos pontos ao Google pelo servidor; nenhuma requisição automática ao digitar, mostrar ou inverter endereços.

Mostrar até quatro alternativas devolvidas, distância/duração e etapas com caminhada, linha/letreiro, embarque/desembarque e horários quando disponíveis. Formatar horários em America/Sao_Paulo e preservar a data quando relevante. Não chamar duração Google de previsão SPTrans.

Escolher alternativa desenha Google Map na área do mapa e permite Lista/Mapa no celular. Editar endereço, esconder o modo ou escolher trajeto GTFS limpa a seleção Google; respostas antigas/canceladas não voltam à tela. Erros, falta de configuração, mapa bloqueado e ausência de rota mantêm mensagens e links externos úteis, sem dados fictícios.

Nas etapas Google cujo tipo de veículo é BUS, botão **Acompanhar ônibus** abre consulta SPTrans por código, permitindo escolher sentido. Não converter números de sentido nem assumir correspondência automática. Não prometer que a escolha externa no Maps retorna ao site. Preservar a forma atual de consultar frota/previsões.

## Aceitação

TDD para POST/CORS/configuração/rate-limit, validação, timeout, erros seguros, resposta com caminhada+metrô+ônibus e opcionais ausentes. Frontend: envio só após clique, invalidação por edição/modo, alternativa/mapa, erro/fallback e associação BUS por código sem direção presumida. Loader Google Maps sem duplicação, timeout recuperável e limpeza de overlays, testado com adapter simulado.

Suite completa JS/Python, typecheck/build/format/diff-check, revisão independente e QA360/390/430px. Fixtures são somente de teste; produção nunca recebe demonstrações como dados reais. Ativação real só após projeto/chaves/quotas disponíveis, depois verificar uma caminhada, um trajeto com trilhos/ônibus e a consulta SPTrans pública.
