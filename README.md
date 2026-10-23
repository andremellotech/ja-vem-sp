# Já Vem SP

Site de transporte de São Paulo com origem e destino por endereço ou ponto marcado, trajetos de caminhada, ônibus, metrô e trem no mapa interno, opções diretas ou com até três baldeações, busca de linhas, paradas, posições de ônibus, previsões e favoritos locais. Código próprio; não é um produto oficial da SPTrans ou do Moovit.

## Estado real

Site publicado em https://andremellotech.github.io/ja-vem-sp/ e API em https://ja-vem-sp-api.andremello.workers.dev. A integração autenticada com a SPTrans foi validada em produção em 19/10/2026, incluindo busca de linhas, posições GPS, paradas e consulta de previsões (que pode retornar vazia). O token fica criptografado no Worker; o site não serve ônibus ou horários fictícios. Metrô e trem usam apenas cadastro GTFS, sem posições ou chegadas ao vivo. Login sincronizado, notificações e bilhetagem não estão implementados.

## Origem e destino

**Seu trajeto completo** apresenta, em ordem, a caminhada da saída até o embarque, cada trecho de ônibus/metrô/trem, todas as conexões a pé e a caminhada até o destino confirmado. O desenho e as instruções de cada caminhada aparecem na própria etapa. Conexões no mesmo ponto continuam visíveis; erros de acesso ou de shape são específicos e não apagam o restante da viagem. No mapa e no celular há um painel com as mesmas etapas numeradas. **Ver este trecho**, **Ir a pé até o embarque** e as caminhadas de baldeação apenas aproximam/destacam a etapa; preservam origem, destino, todas as outras etapas e os ônibus ao vivo. **Ver trajeto completo no mapa** reenquadra a viagem. Não se presumem plataformas, acessos internos, entrada exata ou integração tarifária que as fontes não confirmam.

**Carro e comparação gratuita:** após confirmar os pontos, **Ver carro no mapa** calcula uma rota viária com instruções, distância e duração estimada, sem trânsito ao vivo. **Comparar modos** consulta uma caminhada completa e carro, além das opções de transporte público. Os cartões permitem escolher o modo no mapa; carro/caminhada removem a frota anterior. Não há chaves, cartão ou APIs pagas. Rotas não incluem estacionamento, custos ou confirmação de pedágios.

As opções GTFS agora mostram tempo total **programado e aproximado**: duração `arrival_time`/`departure_time` entre os pontos do trecho, caminhada em linha reta a 4,5 km/h e espera média de meio intervalo (partidas exatas apenas com `exact_times=1`). **Ordenar opções encontradas** compara somente as alternativas retornadas; não garante o mais rápido da rede e não inclui atrasos, trânsito ou acessos internos às estações. Sem janela restante, tempos compatíveis ou base válida, a interface informa indisponibilidade. O horário da consulta é exibido. A caminhada pelas ruas continua detalhada separadamente no trajeto escolhido.

`scripts/import-journey-times.py SOURCE public/data/multimodal.json public/data/journey-times.json` gera o sidecar do mesmo GTFS, verifica SHA e alinhamento dos pontos e omite viagens com horários inválidos. A versão atual preserva tempos/frequências de 2.272 viagens (ônibus, metrô e trem). As janelas são tuplas compactas `[início, fim, intervalo, exactTimes]`. O arquivo é carregado sob demanda; falha da comparação de tempo não bloqueia linhas, mapa nem GPS. Os perfis carro/pedestre compartilham fila de 1.100 ms e caches separados; timeout de 25 s abrange também leitura do corpo da resposta.

Confirme os dois endereços, ou use o GPS como origem, e clique em **Ver opções de transporte**. O filtro permite todos os modos, somente ônibus ou somente metrô/trem, e de zero a três baldeações (padrão: três). Resultados aproximados exigem confirmação adicional. A busca considera paradas e estações até 800 m de cada ponto, com ampliação explícita para 1.200 m quando não encontra opções. Mostra até seis alternativas. Trocas podem usar a mesma parada ou envolver caminhada de até 250 m em linha reta, inclusive entre ônibus; acesso físico e integração tarifária não são presumidos. Cada alternativa mostra a caminhada inicial, todos os embarques/desembarques e trocas, e a caminhada até o destino escolhido. Chegadas SPTrans são oferecidas somente para pernas de ônibus, inclusive nas diferentes trocas, e preservam os endereços para voltar ao trajeto.

**Marcar entrada no mapa ou informar coordenadas** permite escolher o ponto exato que o visitante quer usar, para origem e destino, preservando o número digitado. Toque no mapa, arraste o marcador ou aplique latitude/longitude. A referência inicial não pode ser confirmada sem uma escolha explícita. Isso não valida que o imóvel tenha aquele número: a interface distingue ponto marcado pelo visitante de endereço confirmado pela base. O destino do planejamento mantém essas coordenadas; não é substituído por uma parada próxima. O acesso do serviço de pedestres pode terminar fora da entrada; desvios maiores que 50 m são avisados, sem desenhar um acesso fictício. GPS e pontos da base também podem ter imprecisão.

O cálculo com limite explícito usa rodadas por embarque, até quatro pernas de transporte, preserva até seis alternativas por fronteira de parada/embarque e apresenta as seis melhores opções encontradas pelo critério escolhido. Esse limite de candidatos mantém o cálculo no navegador e não enumera todas as combinações possíveis nem garante ótimo global. A interface oferece reduzir o limite de baldeações; distâncias de ordenação são em linha reta. Chamadas antigas sem esse limite continuam compatíveis com o cálculo anterior de diretas/uma troca.

**Ver caminhada no mapa** calcula o caminho e as instruções no próprio site. Selecionar uma opção de transporte desenha os trechos GTFS e calcula apenas seus acessos, saída e eventual troca a pé. As formas vêm de `public/data/paths/`, carregadas sob demanda, e a caminhada do perfil de pedestres OSRM/FOSSGIS. Não há chave, cartão, Google API ou fallback pago. Os links **Compare no Google Maps** são uma comparação externa opcional ao final dos resultados.

O serviço comunitário FOSSGIS recebe os pontos e dados técnicos como IP e pode registrar solicitações. Cada navegador enfileira os pedidos, com pelo menos 1.100 ms entre inícios, cache em memória e timeout de 25 s. Não há chamadas de caminhada durante a digitação ou pré-busca de alternativas. Indisponibilidade ou ausência de geometria é informada; não se desenham retas fingindo caminhos. Fontes/condições: https://routing.openstreetmap.de/about.html e https://project-osrm.org/docs/v5.24.0/api/#route-service . A disponibilidade não é garantida; uso em escala exige avaliar outro serviço sem ativação automática de plano pago.

Todas as paradas ativas dentro desse raio participam do cálculo. Foi removido o corte anterior nas 12 mais próximas, que podia excluir uma linha direta: na região de Conceição, a parada da 857C-10 era a 13ª, a 235 m do destino. Na lista de uma linha, a busca aceita nome, rua de referência ou código do ponto; endereços do GTFS são preservados quando a API não os informa. Confira a [auditoria de cobertura](docs/auditoria-paradas.md) e suas limitações.

O cálculo usa itinerários e dias de serviço do GTFS oficial, em um Web Worker no navegador. Não usa horários de partida nem garante que a linha esteja operando naquele momento: pode incluir linhas noturnas e linhas ferroviárias cadastradas cuja operação não foi confirmada. As distâncias usadas para ordenar alternativas são em linha reta; a caminhada selecionada tem distância e duração estimadas pelo serviço de pedestres. Não há estimativa de duração total do transporte, espera, conexão ou “rota mais rápida”. Feed vencido ou incompatível interrompe o cálculo e pede atualização.

Ao escolher uma linha, o mapa oculta a rede geral e completa as paradas vazias ou parciais do Olho Vivo com os itinerários GTFS dessa linha. O sentido é comparado por código, destino e paradas conhecidas, sem supor equivalência entre os identificadores de sentido dos dois fornecedores. Quando o sentido não pode ser confirmado, a interface avisa. Em um trajeto, são mostradas as paradas completas das linhas usadas, inclusive além do trecho de embarque/desembarque; outros pontos ficam ocultos.

Sugestões são buscadas após três caracteres e 600 ms de pausa; a digitação ou a busca manual é enviada ao Photon/OpenStreetMap (`https://photon.komoot.io/api/`). Por padrão a busca usa uma janela geográfica de São Paulo e arredores, sem presumir que o nome do estado identifique a capital. **Incluir outras cidades** amplia a consulta para o Brasil. Cada campo tem sua própria escolha e cache; trocar a região cancela a consulta anterior.

Para uma consulta com número, são feitos no máximo dois pedidos: o endereço digitado e a rua sem o número, preservando bairro/cidade/CEP informados. Isso evita que um número encontrado somente em outra cidade esconda a rua procurada. O servidor recebe limite de 20 resultados por consulta; a interface mostra até 12, priorizando o contexto informado, a capital e diferentes bairros/localidades antes de repetir um mesmo bairro. Nomes, bairros, distritos, municípios e CEPs disponíveis são preservados. Duplicatas próximas são agrupadas, mas homônimos distantes não são descartados apenas pelo texto.

A rua sem número não confirma o imóvel: esses resultados exigem escolha e confirmação de ponto aproximado. Mesmo uma correspondência exata em outro município exige confirmação e avisa sobre a cobertura dos ônibus SPTrans. A base pública pode omitir ruas, bairros ou números; nenhuma busca promete todos os endereços existentes. O site não armazena os endereços. Disponibilidade e cobertura dependem desse serviço externo. Para outro provedor Photon compatível, configure `VITE_GEOCODER_URL` antes do build. O GPS só é solicitado por ação do visitante. Parâmetros e deduplicação: https://github.com/komoot/photon/blob/master/docs/api-v1.md .

## Busca e programação

Ao selecionar uma opção de trajeto, o mapa consulta também as posições SPTrans dos trechos de ônibus, inclusive nas baldeações. Cada sentido é associado ao itinerário GTFS escolhido e a um único identificador do catálogo Olho Vivo; associação ambígua recebe aviso e não consulta um sentido arbitrário. O painel informa a quantidade por linha e o horário GPS; tocar no marcador identifica veículo, linha e sentido. São posições da linha inteira, sem garantir qual ônibus fará o embarque. A primeira carga enquadra os veículos junto ao trajeto; atualizações seguintes preservam a navegação no mapa.

As posições atualizam a cada 30 segundos, com atualização manual e pausa em aba oculta. Cada consulta tem limite de 15 segundos; resultados de opções anteriores são descartados. Linhas respondem independentemente: erro, ausência de veículos e sentido não confirmado têm mensagens próprias. Não há posições simuladas nem posição ferroviária ao vivo. Horários GPS acima de dois minutos são sinalizados como antigos. Esta função reutiliza a API gratuita já publicada, sem novas credenciais ou serviços pagos.

Os três modos são **Trajeto**, **Perto de mim** e **Linhas e horários**. Uma localização já fornecida preenche apenas a origem vazia. O visitante pode priorizar menos trocas (padrão) ou menos caminhada; todos os candidatos são ordenados antes do limite de seis opções.

Proximidade usa os ônibus com serviço ativo no calendário de hoje: apresenta inicialmente oito pontos e oito combinações linha/letreiro em 800 m, com botões para mostrar os demais resultados e ampliação explícita para 1.200 m. O mapa acompanha a expansão da lista de paradas. Todos os pontos candidatos participam da busca das linhas antes da paginação. Distâncias são em linha reta e serviço cadastrado no dia não garante operação naquele horário.

Sugestões de linhas são locais após dois caracteres, por código, nome e terminais: oito registros iniciais dos 2.698 sentidos API e acesso à busca completa. Código, origem e destino podem ser combinados em qualquer ordem, com ou sem acentos e abreviações comuns. O snapshot público `public/data/lines.json` (versão 1) usa a data `checkedAt` da auditoria do catálogo de 20/10/2026.

A busca manual combina o catálogo completo de linhas e as referências de todas as paradas de ônibus do GTFS com os resultados da API. Resultados locais aparecem enquanto a API responde; falhas de cada fonte são informadas. IDs iguais são unificados preservando os endereços; paradas homônimas com IDs diferentes continuam separadas. Linhas e paradas têm contagem e expansão em grupos de vinte, sem corte na busca local. Esse mesmo filtro por palavras, acentos e abreviações é usado nas paradas da linha selecionada. A seleção de uma linha continua exibindo somente as paradas daquele sentido. Catálogo estático não confirma operação, posições ou chegadas ao vivo.

A API repassa todas as paradas válidas retornadas pelo Olho Vivo, sem o antigo corte nas primeiras cinquenta. Selecionar uma linha ou parada cancela as buscas pendentes, preservando o resultado escolhido mesmo se outra fonte responder depois. “Est.” é uma abreviação ambígua de estrada/estação: a busca aceita ambas, mantendo o texto original do cadastro para conferência; os nomes completos não são tratados como sinônimos.

A linha selecionada mostra **Programação por intervalos**, com data, atalhos de dia útil/sábado/domingo, calendário e letreiros. A base tem 39.846 janelas para 2.240 itinerários, sem `exact_times=1`. Os 39 códigos sem itinerários mantêm mensagem e acesso oficial; sentido incerto mantém aviso. O endpoint de partidas exatas da página oficial retornou HTTP 403 nas duas verificações independentes; cada linha oferece seu link oficial, sem inferir partidas nem passagem por ponto. As previsões ao vivo permanecem em painel separado.

## Desenvolvimento

Requer Node.js 24 e pnpm 11.25.0; Python 3.11+ para o importador GTFS.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm build
python -m unittest discover -s tests -p 'test_*.py'
```

## API e credenciais

1. Cadastre seu aplicativo em https://www.sptrans.com.br/desenvolvedores/ e obtenha token e GTFS conforme as condições da SPTrans.
2. Use sua conta Cloudflare existente ou escolha outro servidor compatível. Não há conta, plano pago ou credencial criado automaticamente por este projeto.
3. Ajuste `worker/wrangler.toml`: `ALLOWED_ORIGIN` deve ser a origem do site, sem caminho; escolha um `namespace_id` de rate limit que não conflite com outro Worker da sua conta.
4. Autentique o Wrangler e configure o segredo: `pnpm exec wrangler secret put SPTRANS_TOKEN --config worker/wrangler.toml`. Nunca escreva token no Git ou na interface.
5. Publique com `pnpm worker:deploy`. Verifique `/api/health` e uma consulta autenticada a partir da origem autorizada.
6. Defina `VITE_API_BASE_URL` como variável do repositório GitHub (Settings → Secrets and variables → Actions → Variables) com a URL HTTPS do Worker, sem `/api` ao final.

Desenvolvimento local: copie `worker/.dev.vars.example` para `worker/.dev.vars` e informe seu token somente no arquivo ignorado. Configure `.env.local` com a URL da API; o exemplo de configuração é `.env.example`. Ajuste a origem local no arquivo de variáveis do Worker. O CORS restringe chamadas do navegador; não é autenticação do público. O rate limiter por IP é deliberadamente aproximado/distribuído e não substitui orçamento ou limites do fornecedor.

A autenticação SPTrans usa cookie mantido apenas no servidor. A sessão é reaproveitada por isolate e reautentica uma vez quando expira. HTTPs, timeout, validação de parâmetros, mensagens sem segredos e rate limiting estão previstos. Não há cache de resposta do fornecedor; apenas sessão autenticada em memória.

## GitHub Pages

Crie um repositório vazio, envie este código para `main` e selecione GitHub Actions como fonte em Settings → Pages. O workflow publica somente `dist/`; o código do Worker não é servido no Pages. URLs de assets são relativas para funcionar no subdiretório do repositório. O segredo SPTrans pertence ao servidor; a variável `VITE_API_BASE_URL` é pública.

O workflow testa a aplicação antes de publicar. Mudanças na API exigem publicação separada do Worker. Sem API configurada o layout permanece acessível e informa a limitação.

## Fontes e horários

- SPTrans: https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/
- Mapa: OpenStreetMap; atribuição visível. Tiles padrão para prévia/uso interativo moderado, respeitando https://operations.osmfoundation.org/policies/tiles/ . Sem download em massa, prefetch ou uso offline. Para escalar, contratar fornecedor de tiles e substituir a URL.
- Fontes tipográficas: Google Fonts; o navegador solicita esses recursos externos.
- O marcador azul usa localização apenas após ação do visitante e permissão do navegador. Localização não é enviada à nossa API. O provedor do mapa recebe as solicitações de tiles da área exibida.
- Posições exibem horário GPS quando disponível. A consulta tem timestamp próprio. Previsões HH:mm são exibidas no horário de São Paulo, sem inventar data/contagem regressiva em viradas de dia.
- Favoritos: dados locais do navegador, sem sincronização entre dispositivos.

## Importação GTFS

O mapa mostra todas as paradas do GTFS oficial (`public/data/stops.json`), carregado pelo navegador sem passar pela API. Para atualizar:

1. Baixe o `.zip` do GTFS no portal de desenvolvedores da SPTrans e guarde em `data/` (essa pasta está no `.gitignore`; não publique o feed original).
2. Gere juntos os arquivos de paradas, itinerários e programação:

```
python scripts/import-gtfs.py data/gtfs.zip public/data/stops.json --planner-output public/data/planner.json --schedules-output public/data/schedules.json --source-url https://www.sptrans.com.br/desenvolvedores/ --retrieved-at AAAA-MM-DD --license "CONDICOES_DO_PORTAL"
```

3. Gere também a base multimodal e as geometrias usando exatamente o mesmo ZIP:

```
python scripts/import-paths.py data/gtfs.zip public/data/stops.json public/data/paths public/data/multimodal.json
```

4. Faça commit dos datasets de paradas, itinerários, programação, multimodal e `paths/*.json` juntos. Os arquivos trazem procedência e hash do mesmo ZIP; o planejador rejeita versões incompatíveis. A importação valida referências, ordem de paradas e calendários. Rode os testes e publique o site novamente.

A base multimodal tem 1.365 linhas e 2.272 itinerários: 1.349 linhas de ônibus, 9 de metrô e 7 de trem. Foram gerados 2.271 registros de geometria; 114 têm pelo menos uma parada sem correspondência na shape, preservada como índice nulo. A perna que atravessa um índice nulo fica sem desenho e recebe aviso. Exemplo: a shape da Linha 12 começa em Tatuapé, embora o itinerário inclua Brás. As partes válidas continuam disponíveis. Cadastro e geometria não comprovam operação ou acesso atual.

O índice atual contém 1.349 linhas de ônibus, 2.240 itinerários e calendários/exceções de serviço, com 39.846 janelas de frequência em `schedules.json`. As janelas preservam limites, lacunas e intervalos; não são partidas exatas e não filtram as opções por horário. O identificador da parada no GTFS (`stop_id`) é usado nas consultas de previsão. Ausência de previsão não comprova ausência de serviço; o próprio Olho Vivo pode não cobrir a parada.

## APIs próprias

- `GET /api/health`
- `GET /api/lines?q=675K`
- `GET /api/stops?q=Paulista`
- `GET /api/lines/198/stops`
- `GET /api/lines/198/vehicles`
- `GET /api/stops/4200953/arrivals?lineId=198`

Os identificadores de linha/parada vêm da SPTrans; códigos exibidos como 675K-10 não substituem o identificador por sentido. Zero veículos ou previsões não comprova ausência de operação. A documentação da categoria Paradas informa cobertura de corredores; a rede GTFS complementa esse retorno no navegador.

## Investigação do aplicativo de referência

O inventário de engenharia reversa foi realizado separadamente com REA/JADX e evidências estáticas. APKs, bibliotecas de terceiros e evidências brutas não fazem parte deste repositório. Referências encontradas no APK não implicam acesso público às APIs do Moovit. A matriz funcional sanitizada descreve cobertura e limites.

## Google Maps sem chave — release de 21/10/2026

Esta publicação usa os links externos **A pé** e **Transporte público**, disponíveis após confirmar origem e destino. Esse caminho Maps URLs é gratuito e não exige chave, faturamento Google Cloud ou cartão. Os pontos são enviados ao Google ao clicar no link; cálculo próprio, veículos e chegadas continuam pela SPTrans.

O proprietário informou ter concluído etapas de conta/login, recusou criar a chave agora e manteve o orçamento de R$ 0. O código opcional Maps Embed permanece dormente até uma autorização explícita posterior: `VITE_GOOGLE_EMBED_API_KEY` fica vazio no build do Pages, mesmo que uma variável do repositório seja preenchida. Sem chave, o painel, seletor, botão e aviso interno de configuração do Embed ficam ocultos. Nenhum SDK Google ou chamada Routes é usado. Isso descreve este caminho do site, sem garantir controle de custos de outros serviços da conta. Veja [privacidade, limites e opção futura](docs/integracao-google-maps.md). Termos e privacidade são páginas estáticas públicas incluídas no build.
