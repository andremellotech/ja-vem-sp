# Google Maps Embed com orçamento de R$ 0

## Adendo de 21/10/2026 — publicação sem chave

Este adendo substitui as etapas de ativação abaixo para a release atual. O proprietário informou ter concluído etapas de conta/login, respondeu **Não criar a chave agora** e reiterou orçamento de R$ 0, sem compras no cartão. Publicar somente Maps URLs externos de caminhada/transporte público entre pontos confirmados: esse caminho gratuito não exige chave, faturamento Google Cloud ou cartão. Não inferir que nenhuma configuração de conta aconteceu nem prometer controle de custos de outros serviços.

O build do Pages força `VITE_GOOGLE_EMBED_API_KEY: ""`, preservando a variável SPTrans. Sem chave ou com apenas espaços, o painel Embed fica oculto, sem seletor, botão desabilitado ou aviso interno de configuração. Links externos e planejamento nativo/SPTrans continuam disponíveis. O código opcional Embed e seu contrato com fixture permanecem preservados, dormentes até nova autorização explícita. Criação de credenciais, aceite financeiro, habilitação de APIs e testes reais do iframe ficam fora desta publicação. As seções seguintes registram o desenho anterior, condicionado a essa autorização futura.

## Escopo escolhido

O proprietário autorizou o aceite dos Termos Google Cloud, fixou orçamento mensal em R$ 0 e escolheu expressamente Maps Embed gratuito dentro do site. Mostrar caminhada e transporte público entre dois pontos confirmados, mantendo planejamento próprio, paradas, horários e acompanhamento SPTrans. A proposta avançada Routes/Maps JavaScript do PR #1 fica preservada; esta versão parte da main publicada, sem trazer APIs cobradas para o fluxo gratuito.

## Arquitetura e contrato

React/TypeScript existentes, sem dependências novas. `GoogleEmbedSelection` contém `origin`, `destination` (lat/lon finitos em faixas válidas) e `mode: "walking" | "transit"`. `buildGoogleEmbedUrl(selection, key)` valida e retorna URL oficial ou null. URL fixa `https://www.google.com/maps/embed/v1/directions`, somente key/origin/destination/mode/language=pt-BR/region=BR/units=metric. Coordenadas são enviadas diretamente ao Google apenas após clique explícito.

Chave pública de navegador em `VITE_GOOGLE_EMBED_API_KEY`, restrita exclusivamente a Maps Embed API e ao referenciador HTTPS do site. Não usar Routes API, Maps JavaScript SDK, Places, chaves de demonstração, iframe não documentado ou extração de conteúdo Google. Nenhum POST de coordenadas ao Worker. Worker SPTrans publicado permanece inalterado.

`GoogleEmbedPlanner` aparece após confirmar origem/destino, oferece Caminhada/Transporte público e botão explícito para mostrar o trajeto. Não oferece preferência por trilhos/ônibus que Embed não suporta. Seleção usa callback próprio; `GoogleEmbedMap` substitui o mapa Leaflet enquanto ativa, com iframe oficial, title, loading=lazy, allowFullScreen, referrerPolicy=strict-origin-when-cross-origin, largura responsiva e dimensões mínimas 200x200. Geometria Google nunca entra no Leaflet.

Edição/inversão de endereço, modo, saída do fluxo ou cálculo/seleção GTFS remove a seleção e o iframe; não recarrega automaticamente. Voltar preserva os endereços próprios. Começar Google cancela cálculo GTFS pendente; começar GTFS limpa Google. Controles Lista/Mapa continuam funcionando no celular. Textos explicam origem dos dados e envio dos pontos. Links Maps URLs permanecem como alternativa.

O iframe é de outra origem: o site não extrai etapas/linha escolhida nem interpreta onLoad como prova de rota válida. Fallback externo permanece visível. Para acompanhar ônibus, visitante informa o código visto no trajeto em campo próprio e abre busca SPTrans; escolhe sentido manualmente. Sem afirmar associação automática ou posição Google de veículos. Distâncias, horários e instruções Google ficam dentro do quadro Google; nada é inventado, copiado ou armazenado.

## Conta e custos

Documentação Google confirma uso ilimitado de Maps Embed sem cobrança, mas exige chave e configuração de faturamento. O projeto observado My Maps Project/maximal-beach-512300-n6 não tem conta vinculada. Preferir projeto separado para Embed, sem serviços pagos habilitados. Aceite de Termos já autorizado e concluído; criação de chave exige confirmação concreta e cadastro financeiro deve ser feito pelo proprietário. Não iniciar assinatura, teste temporário ou upgrade pago; não reutilizar credencial de outro aplicativo.

Fontes: [cobrança Embed](https://developers.google.com/maps/documentation/embed/usage-and-billing), [configuração](https://developers.google.com/maps/documentation/embed/quickstart), [directions](https://developers.google.com/maps/documentation/embed/embedding-map), [restrições de chave](https://developers.google.com/maps/api-security-best-practices). Demo Key é só protótipo e não suporta a integração Routes necessária; não usar em produção.

## Aceitação

TDD de URL validada/escapada, ausência de chave, clique explícito, limpeza por edição/modo/GTFS, iframe sem SDK/POST Routes, Lista/Mapa e busca BUS com direção manual. Teste com origem/embarque/desembarque/destino distintos para preservar links de caminhada revisados. Termos/privacidade públicos refletindo iframe direto; env/workflow/documentação sem valores reais de chave. Testes JS/Python, typecheck/build/format/diff, revisão independente e QA 360/390/430px. Testes reais de caminhada/transporte público apenas após chave restrita e configuração gratuita verificadas; nunca apresentar fixture como rota ativa.
