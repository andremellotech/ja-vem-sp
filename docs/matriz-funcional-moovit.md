# Moovit — matriz funcional e APIs para o Já Vem SP

Data: 19/10/2026. Artefato: com.tranzmate 5.196.2.1797.

## Evidência e cobertura
REA 6.7.0, JADX MCP 0.7.1, JDK 21 portátil. SHA-256 do APK principal: f7ff7d5711115457c9a9f5ad006b179ae41e72759320ef46f7cb77020ed6ceda.
A inspeção carregou 51.789 classes e 5.447 recursos. A busca com.moovit retornou 3.466 nomes; com.tranzmate.moovit.protocol retornou 1.346. Esses conjuntos não são o inventário completo das classes ofuscadas, bibliotecas e código nativo.
A tabela abaixo usa existência de classes como evidência estática de áreas, não como prova de funções ativas na cidade. Nenhum APK foi executado; não houve captura de tráfego, verificação de assinatura ou uso de segredos do aplicativo.

| Área | Classes encontradas na busca delimitada | Exemplos | Situação web |
|---|---:|---|---|
|Planejamento e itinerários|491|`com.moovit.app.carpool.CarpoolTripPlanActivity`<br>`com.moovit.app.history.model.OfflineTripPlanHistoryItem`|Motor de rotas e dados por cidade; etapa própria.|
|Chegadas e previsões|90|`com.moovit.app.itinerary.view.NextArrivalsView`<br>`com.moovit.app.stoparrivals.StopArrival`|SPTrans Olho Vivo para ônibus municipais; adaptador implementado, acesso real pendente.|
|Alertas de serviço|67|`com.moovit.app.servicealerts.LineServiceAlertDigestView`<br>`com.moovit.app.servicealerts.LineServiceAlertSelectionActivity`|Fonte regional a verificar; não implementado.|
|Favoritos|132|`com.moovit.app.home.lines.favorites.FavoriteLinesFragment`<br>`com.moovit.app.home.lines.favorites.a`|Implementado no navegador, sem sincronização.|
|Histórico de viagens|51|`com.moovit.app.history.HistoryItemResultsFragment`<br>`com.moovit.app.history.TripHistoryActivity`|Reimplementação local possível; não implementado.|
|Mapas|292|`com.moovit.ads.HtmlMapItemAd`<br>`com.moovit.ads.MapItemAd`|OpenStreetMap/Leaflet na interface; não usa recursos do Moovit.|
|Base GTFS|261|`com.moovit.data.gtfs.MetroReportCategory`<br>`com.moovit.data.gtfs.bicycleprovider.a`|Importador preparatório implementado; feed real e motor de rotas pendentes.|
|Conta e perfil|276|`com.moovit.app.mot.welcome.MotAccountCreationWelcomeActivity`<br>`com.moovit.app.useraccount.manager.favorites.Favorite`|Servidor de identidade próprio necessário; não implementado.|
|Assinatura e recursos premium|141|`com.moovit.app.subscription.AbstractSubscriptionActivity`<br>`com.moovit.app.subscription.AdFreeMenuItemFragment`|Depende de produto e provedor de cobrança próprios; não implementado.|
|Compra e validação de bilhetes|510|`com.moovit.feature.ticketing.sms.a`<br>`com.moovit.payment.configuration.TicketingAgencyCapability`|Depende de contrato e integração com operador; não implementado.|
|Carteira e pagamentos|585|`com.moovit.app.mot.model.PaymentContactActivationPrice`<br>`com.moovit.app.payment.a`|Dependência comercial; não implementado.|
|Acessibilidade|29|`com.moovit.accessibility.AccessibilityPersonalPrefs`<br>`com.moovit.accessibility.UserProfileAccessibilityPrefType`|Há referências no APK; conteúdo e suporte precisam ser verificados por função.|
|Bicicletas e micromobilidade|36|`com.moovit.app.itinerary2.view.leg.bicycle.ItineraryBicycleLegView`<br>`com.moovit.app.itinerary2.view.leg.bicycle.ItineraryBicycleRentalLegView`|Provedor e cobertura por cidade a verificar.|
|Táxi e serviços externos|77|`com.moovit.app.itinerary2.view.leg.taxi.ItineraryTaxiLegView`<br>`com.moovit.app.itinerary2.view.leg.taxi.ItineraryWaitToTaxiLegView`|Provedor externo a verificar.|
|Caronas|51|`com.moovit.app.carpool.BaseCarpoolItinerariesActivity`<br>`com.moovit.app.carpool.CarpoolLegDetailsView`|Há modelos no pacote; disponibilidade em São Paulo não estabelecida.|
|Publicidade|86|`com.moovit.ads.Ad`<br>`com.moovit.ads.AdListener`|Referências no APK; não incluída no site.|
|Notificações|64|`com.moovit.MoovitNotificationChannel`<br>`com.moovit.app.actions.notifications.TripNotification`|Referências no APK; suporte web e servidor não implementados.|
|Navegação e acompanhamento de viagem|284|`com.moovit.app.actions.shareride.ItineraryShareRideButtonFragment`<br>`com.moovit.app.compare.ItineraryCompareOnMapActivity`|Necessita planejamento e eventos de localização; não implementado.|

## Evidência mais forte: destinos de rede no código
O inicializador estático de com.moovit.core.network.Backend foi inspecionado. O REA retornou smali como fallback, com corpo disponível; não se trata de execução observada. As seguintes URLs estão presentes nas instruções:
- `https://app5.moovitapp.com/services-app/services/`
- `https://app4.moovitapp.com/services-app/services/`
- `https://app4cdn.moovitapp.com/services-app/services/`
- `https://static.moovitapp.com/v4/`
- `https://static.moovitapp.com/offlineData/`
- `https://anonymousstream.moovitapp.com/`
- `https://sdk.moovitapp.com/services-app/services/`

Estas URLs são configurações do app. Não estabelecem APIs abertas, permissão de uso, funcionamento atual, contrato nem protocolo de cada rota. Nenhuma delas foi chamada nesta análise. A versão web utiliza adaptador próprio para a SPTrans.

## Pedido de planejamento do app
A classe MVTripPlanRequest declara origem e destino (`fromLocation`, `toLocation`), `timeUtc`, `timeType`, tipos de transporte, preferências pessoais, opções multimodais e algoritmo. Métodos incluem tipos Apache Thrift. Isso demonstra uma estrutura de pedido rica; não recupera o algoritmo do servidor.
A disponibilidade de todos esses campos em São Paulo e seus efeitos em tempo de execução permanecem desconhecidos.

## APIs e fornecedores identificados
- Moovit: backends acima e modelos de protocolos de chegada, planejamento, alertas, usuários e pagamentos.
- Google Maps/Places e Firebase: domínios e recursos no pacote; uso e funções específicas não rastreados por método nesta etapa.
- Bilhetagem: nomes de classes incluem Fairtiq e WeTech; presença no APK não comprova serviço disponível em São Paulo.
- Publicidade e analytics: bibliotecas e pacotes presentes; não reproduzidos no site.

## Integração web selecionada
SPTrans Olho Vivo por HTTPS, com autenticação por token/cookie no servidor. Rotas do adaptador: Linha/Buscar; Parada/BuscarParadasPorLinha; Posicao/Linha; Previsao/Parada. O cliente acessa nossa API normalizada, nunca o token.
Fonte: https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/
GTFS oficial requer obtenção/condições do portal; importador escrito e testado com fixture. Nenhum feed real foi obtido nesta etapa.
Fonte: https://www.sptrans.com.br/desenvolvedores/
API oficial do Moovit: chave fornecida pelo Moovit e autenticação HMAC com segredo de licença; opção futura se houver acesso.
Fonte: https://api-docs.moovit.com/api-docs/5.1/MoovitPublicTransitAPIs.html

## Registro de evidências
- rea-backend-method.json: `ev_f1e7f778693d08225be85829ebd387c2332d266dbd801df027514a4e50eb709f` · inspect_android_method
- rea-class-detail-0.json: `ev_21cff9f4999f634a47ddb3e2949dddec318d309550e771c5d7f1737827f3aa4a` · inspect_android_class
- rea-class-detail-1.json: `ev_e4b59a78549f46c479633816695de80013a2f7eeea28a8ab4e45436356c5070f` · inspect_android_class
- rea-classes-0.json: `ev_06bee707e47ceee1f1fa9ef49cad165239134db255aa9ff84dd6ee2679a91342` · search_android_classes
- rea-classes-1.json: `ev_177ea65744172c07a03ff67cee7f09529621c2369eba29f1dbccb48ba1819916` · search_android_classes
- rea-package.json: `ev_75834cc5c795565d7b9e3bcc1c5ef5fcb78c8e609d7c163d4536ff91ebe88cf1` · inspect_android_package
- rea-trip-request.json: `ev_1ca92efe03cef777d7883d888e12f775a610ec6897e01f8e6ea88b539f578ae8` · inspect_android_class

## Pendências explícitas
A análise funcional é parcial. Não foram decompilados todos os métodos nem verificados fluxos de runtime, código nativo, splits e condições comerciais. Cada área com apenas nome de classe requer rastreamento antes de afirmar comportamento equivalente.
Roteamento completo, metrô/trens, alertas, notificações, contas e bilhetagem exigem especificações próprias e fornecedores verificados. O site atual entrega somente a base operacional planejada, ainda sem integração autenticada validada.