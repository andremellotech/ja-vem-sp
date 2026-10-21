# Google Maps dentro do site: Maps Embed

Esta versão usa apenas a Maps Embed API oficial para exibir caminhada ou transporte público entre dois pontos confirmados. O orçamento escolhido é R$ 0. A versão avançada com Routes/Maps JavaScript está preservada separadamente e não é necessária para este fluxo.

## Configuração pelo responsável

A [documentação de cobrança](https://developers.google.com/maps/documentation/embed/usage-and-billing) informa uso ilimitado do Maps Embed sem cobrança. O [guia de configuração](https://developers.google.com/maps/documentation/embed/quickstart) exige projeto Google Cloud, chave e configuração de faturamento. Gratuidade deste produto não autoriza habilitar serviços pagos no projeto.

1. Prefira um projeto separado, com somente **Maps Embed API** habilitada. Não habilite Routes, Maps JavaScript, Places, assinatura, avaliação temporária ou upgrade pago para este fluxo.
2. O proprietário deve concluir pessoalmente qualquer cadastro financeiro exigido. Esta alteração não cria conta, chave, vínculo de faturamento ou serviço Google.
3. Após autorização concreta do proprietário, crie uma chave de navegador exclusiva. Restrinja **API restrictions** exclusivamente à **Maps Embed API** e **Application restrictions / Websites** ao referenciador HTTPS do site. Confira os padrões aceitos na [documentação de segurança](https://developers.google.com/maps/api-security-best-practices). Em GitHub Pages, vários projetos podem compartilhar a mesma origem; mantenha a restrição ao produto Embed e evite reutilizar a chave.
4. Configure `VITE_GOOGLE_EMBED_API_KEY` em `.env.local` ignorado para desenvolvimento ou na variável de repositório GitHub Actions para o build do Pages. A chave será pública no bundle/iframe; a proteção é a restrição de produto e referenciador, não ocultação. Nunca versione um valor real ou reutilize chave de outro aplicativo. Não use Demo Key.
5. Antes de liberar, verifique o projeto, faturamento e restrições. Teste caminhada e transporte público no HTTPS autorizado, com a chave restrita. Uma notificação de orçamento não bloqueia despesas de outros produtos; mantenha serviços pagos fora deste projeto.

Sem chave, o site explica a indisponibilidade e conserva os links externos Google Maps URLs, que não exigem chave. Não há rota simulada apresentada como ativa.

## Fluxo e limites

O visitante confirma origem e destino, escolhe Caminhada ou Transporte público e clica em **Mostrar trajeto Google**. Somente então o navegador cria o iframe e envia as coordenadas diretamente ao Google, inclusive GPS quando usado como ponto. A URL usa exclusivamente `https://www.google.com/maps/embed/v1/directions` com `key`, `origin`, `destination`, `mode`, `language=pt-BR`, `region=BR` e `units=metric`. Consulte os [parâmetros oficiais](https://developers.google.com/maps/documentation/embed/embedding-map).

O iframe substitui Leaflet enquanto ativo, preservando a exibição e atribuição próprias do Google. Os controles do site ficam fora do quadro. Ele usa título acessível, `loading=lazy`, `allowFullScreen`, `referrerPolicy=strict-origin-when-cross-origin` e tamanho mínimo 200×200. A política envia a origem do site para validar a restrição da chave, sem caminho da página.

O quadro é de outra origem. O site não lê etapas, distância, duração, linha escolhida, erro ou validade do trajeto. `onLoad` não comprova sucesso. O link **Abrir este trajeto no Google Maps** permanece fora do quadro como alternativa. Não há preferência por trilhos/ônibus neste contrato.

Para acompanhar um ônibus, o visitante digita o código visto no Google no campo próprio, abre a busca SPTrans e escolhe manualmente a linha e o sentido. Isso não associa automaticamente o ônibus ao trajeto Google. Veículos e chegadas permanecem dados SPTrans.

Editar/inverter os pontos, trocar modo ou critério, sair do planejador ou iniciar/escolher GTFS remove Google; voltar não reabre o quadro. Iniciar Google cancela cálculo GTFS pendente e apaga a opção própria anterior. Os endereços próprios são preservados ao sair. Caminhadas até embarque e do desembarque ao destino continuam usando quatro pontos independentes nos links externos revisados.

Não há SDK Google, geocodificação Google, scraping, armazenamento de geometria Google, POST Routes ou envio de coordenadas ao Worker. O Worker SPTrans permanece inalterado. Termos e privacidade públicos estão em `public/termos.html` e `public/privacidade.html`.

## Verificação

Execute `pnpm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `pnpm typecheck` e `pnpm build`. Faça QA da Lista/Mapa em 360, 390 e 430 px, além do desktop. Fixtures de teste não comprovam integração real. Não consulte Google com chave falsa; previews devem bloquear o iframe e identificar claramente DEMONSTRAÇÃO. Os testes reais ficam pendentes até existir configuração gratuita e chave restrita verificadas.
