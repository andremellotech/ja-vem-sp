# Google Maps sem chave: Maps URLs

Na release de **21/10/2026**, o visitante confirma origem e destino e usa **A pé no Google Maps** ou **Transporte público no Google Maps** em outra aba. Esse caminho usa Maps URLs, é gratuito e não exige chave, faturamento Google Cloud ou cartão. O orçamento escolhido continua R$ 0. A versão avançada Routes/Maps JavaScript está preservada separadamente e não participa deste fluxo.

Os links usam `https://www.google.com/maps/dir/`, com `api=1`, coordenadas confirmadas em `origin` e `destination` e `travelmode=walking` ou `transit`. Somente o clique envia esses pontos ao Google, inclusive GPS se usado. As opções nativas continuam oferecendo caminhada até o embarque e do desembarque ao destino; cálculo GTFS, veículos e chegadas permanecem independentes e usam os dados próprios/SPTrans.

O proprietário informou ter concluído etapas de conta/login e recusou criar a chave agora. Essa informação não permite afirmar que nenhuma configuração de conta aconteceu. A decisão desta publicação é usar o caminho sem chave; não há necessidade de cadastrar cartão ou ativar faturamento Cloud para os links externos. Isso não constitui controle de custos de serviços não relacionados da conta.

## Embed opcional dormente

O código do Maps Embed foi preservado para trabalho futuro, condicionado a nova autorização explícita do proprietário. `VITE_GOOGLE_EMBED_API_KEY` fica vazio em `.env.example`, e o build do Pages força `""` em vez de ler uma variável do repositório. Preencher essa variável não ativa o iframe nesta release. Sem chave, inclusive com apenas espaços, o planejador não mostra painel, seletor, botão desabilitado ou aviso de configuração do Google.

Qualquer ativação futura exige revisar separadamente os [requisitos de configuração](https://developers.google.com/maps/documentation/embed/quickstart), [cobrança Embed](https://developers.google.com/maps/documentation/embed/usage-and-billing) e [restrições de chave](https://developers.google.com/maps/api-security-best-practices), além de alterar deliberadamente o build. Nenhuma criação de chave, aceite financeiro, vínculo de faturamento ou habilitação de API faz parte desta release. Uma chave futura seria pública no navegador e precisaria ser exclusiva para Maps Embed e restrita ao site HTTPS; nunca versione um valor real ou reutilize uma chave de outro aplicativo.

## Contrato preservado para eventual ativação

Com uma chave configurada em um trabalho futuro autorizado, o visitante confirma origem e destino, escolhe Caminhada ou Transporte público e clica em **Mostrar trajeto Google**. Somente então o navegador cria o iframe e envia as coordenadas diretamente ao Google, inclusive GPS quando usado como ponto. A URL usa exclusivamente `https://www.google.com/maps/embed/v1/directions` com `key`, `origin`, `destination`, `mode`, `language=pt-BR`, `region=BR` e `units=metric`. Consulte os [parâmetros oficiais](https://developers.google.com/maps/documentation/embed/embedding-map).

O iframe substitui Leaflet enquanto ativo, preservando a exibição e atribuição próprias do Google. Os controles do site ficam fora do quadro. Ele usa título acessível, `loading=lazy`, `allowFullScreen`, `referrerPolicy=strict-origin-when-cross-origin` e tamanho mínimo 200×200. A política envia a origem do site para validar a restrição da chave, sem caminho da página.

O quadro é de outra origem. O site não lê etapas, distância, duração, linha escolhida, erro ou validade do trajeto. `onLoad` não comprova sucesso. O link **Abrir este trajeto no Google Maps** permanece fora do quadro como alternativa. Não há preferência por trilhos/ônibus neste contrato.

Para acompanhar um ônibus, o visitante digita o código visto no Google no campo próprio, abre a busca SPTrans e escolhe manualmente a linha e o sentido. Isso não associa automaticamente o ônibus ao trajeto Google. Veículos e chegadas permanecem dados SPTrans.

Editar/inverter os pontos, trocar modo ou critério, sair do planejador ou iniciar/escolher GTFS remove Google; voltar não reabre o quadro. Iniciar Google cancela cálculo GTFS pendente e apaga a opção própria anterior. Os endereços próprios são preservados ao sair. Caminhadas até embarque e do desembarque ao destino continuam usando quatro pontos independentes nos links externos revisados.

Não há SDK Google, geocodificação Google, scraping, armazenamento de geometria Google, POST Routes ou envio de coordenadas ao Worker. O Worker SPTrans permanece inalterado. Termos e privacidade públicos estão em `public/termos.html` e `public/privacidade.html`.

## Verificação

Execute `pnpm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `pnpm typecheck` e `pnpm build`. Os testes da release verificam URLs externas após confirmação dos pontos, ausência de controles/iframe sem chave, fluxo nativo e preservação do contrato opcional com fixture isolada. Fixtures não comprovam integração real. Não consulte Google com chave falsa; previews do Embed devem bloquear o iframe e identificar claramente DEMONSTRAÇÃO. Validação real do iframe não integra esta publicação e depende de futura autorização e configuração verificadas.
