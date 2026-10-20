# Já Vem SP

Site de transporte de São Paulo com origem e destino por endereço, opções de ônibus diretas ou com uma troca, mapa, busca de linhas, paradas, posições de ônibus, previsões e favoritos locais. Código próprio; não é um produto oficial da SPTrans ou do Moovit.

## Estado real

Site publicado em https://andremellotech.github.io/ja-vem-sp/ e API em https://ja-vem-sp-api.andremello.workers.dev. A integração autenticada com a SPTrans foi validada em produção em 19/10/2026, incluindo busca de linhas, posições GPS, paradas e consulta de previsões (que pode retornar vazia). O token fica criptografado no Worker; o site não serve ônibus ou horários fictícios. Metrô/trens no planejador, login sincronizado, notificações e bilhetagem não estão implementados.

## Origem e destino

Confirme os dois endereços, ou use o GPS como origem, e clique em **Ver opções de ônibus**. Resultados aproximados exigem confirmação adicional. A busca considera paradas até 800 m de cada endereço, com ampliação explícita para 1.200 m quando não encontra opções. Mostra até seis alternativas diretas ou com uma troca na mesma parada cadastrada. A consulta de chegadas no embarque ou na troca usa a SPTrans e preserva os endereços para voltar ao trajeto.

Todas as paradas ativas dentro desse raio participam do cálculo. Foi removido o corte anterior nas 12 mais próximas, que podia excluir uma linha direta: na região de Conceição, a parada da 857C-10 era a 13ª, a 235 m do destino. Na lista de uma linha, a busca aceita nome, rua de referência ou código do ponto; endereços do GTFS são preservados quando a API não os informa. Confira a [auditoria de cobertura](docs/auditoria-paradas.md) e suas limitações.

O cálculo usa itinerários e dias de serviço do GTFS oficial, em um Web Worker no navegador. Não usa horários de partida nem garante que a linha esteja operando naquele momento: pode incluir linhas noturnas conforme o calendário. As distâncias de acesso são em linha reta, não trajetos de caminhada; verifique travessias e acesso. Não há estimativa inventada de duração, espera, conexão ou “rota mais rápida”. Feed vencido ou incompatível interrompe o cálculo e pede atualização.

Ao escolher uma linha, o mapa oculta a rede geral e completa as paradas vazias ou parciais do Olho Vivo com os itinerários GTFS dessa linha. O sentido é comparado por código, destino e paradas conhecidas, sem supor equivalência entre os identificadores de sentido dos dois fornecedores. Quando o sentido não pode ser confirmado, a interface avisa. Em um trajeto, são mostradas as paradas completas das linhas usadas, inclusive além do trecho de embarque/desembarque; outros pontos ficam ocultos.

Sugestões são buscadas após três caracteres e 600 ms de pausa; a digitação ou a busca manual é enviada ao Photon/OpenStreetMap (`https://photon.komoot.io/api/`), com contexto de São Paulo. O site não armazena os endereços. Disponibilidade e cobertura dependem desse serviço externo. Para outro provedor Photon compatível, configure `VITE_GEOCODER_URL` antes do build. O GPS só é solicitado por ação do visitante.

## Busca e programação

Os três modos são **Trajeto**, **Perto de mim** e **Linhas e horários**. Uma localização já fornecida preenche apenas a origem vazia. O visitante pode priorizar menos trocas (padrão) ou menos caminhada; todos os candidatos são ordenados antes do limite de seis opções.

Proximidade usa os ônibus com serviço ativo no calendário de hoje: até oito pontos e oito combinações linha/letreiro em 800 m, com ampliação explícita para 1.200 m. Todos os pontos candidatos participam da busca das linhas antes do limite de apresentação. Distâncias são em linha reta e serviço cadastrado no dia não garante operação naquele horário.

Sugestões de linhas são locais após dois caracteres, por código, nome e terminais: até oito registros dos 2.698 sentidos API, preservando os dois sentidos. O snapshot público `public/data/lines.json` (versão 1) usa a data `checkedAt` da auditoria do catálogo de 20/10/2026. A busca manual continua consultando a API para atualização e outros resultados.

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

3. Faça commit de `public/data/stops.json`, `public/data/planner.json` e `public/data/schedules.json` juntos. Os arquivos trazem procedência e hash do mesmo ZIP; o planejador rejeita versões incompatíveis. A importação de paradas contabiliza registros inválidos; a geração do planejador valida referências, ordem de paradas e calendários antes de gravar. Rode os testes e publique o site novamente.

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
