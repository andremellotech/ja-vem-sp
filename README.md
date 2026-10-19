# Já Vem SP

Site de transporte de São Paulo com mapa, busca de linhas, consulta de paradas, posições de ônibus, previsões e favoritos locais. Código próprio; não é um produto oficial da SPTrans ou do Moovit.

## Estado real
Site publicado em https://andremellotech.github.io/ja-vem-sp/ e API em https://ja-vem-sp-api.andremello.workers.dev. A integração autenticada com a SPTrans foi validada em produção em 19/10/2026, incluindo busca de linhas, posições GPS, paradas e consulta de previsões (que pode retornar vazia). O token fica criptografado no Worker; o site não serve ônibus ou horários fictícios. Planejamento completo de rotas, metrô, trens, login sincronizado, notificações e bilhetagem não estão implementados.

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
2. Gere o arquivo de paradas:

```
python scripts/import-gtfs.py data/gtfs.zip public/data/stops.json --source-url https://www.sptrans.com.br/desenvolvedores/ --retrieved-at AAAA-MM-DD --license "CONDICOES_DO_PORTAL"
```

3. Faça commit de `public/data/stops.json`. O arquivo traz a procedência (hash, data, validade do calendário). Linhas inválidas são ignoradas e contadas no relatório do comando.

O importador ainda não gera o índice de linhas, horários e frequências; o planejamento de rotas (origem e destino) depende desse passo. O identificador da parada no GTFS (`stop_id`) é o usado nas consultas de previsão; confira em produção que as previsões voltam para paradas escolhidas no mapa.

## APIs próprias
- `GET /api/health`
- `GET /api/lines?q=675K`
- `GET /api/lines/198/stops`
- `GET /api/lines/198/vehicles`
- `GET /api/stops/4200953/arrivals?lineId=198`

Os identificadores de linha/parada vêm da SPTrans; códigos exibidos como 675K-10 não substituem o identificador por sentido. Zero veículos ou previsões não comprova ausência de operação. A documentação da categoria Paradas informa cobertura de corredores; não pressupor que o retorno seja a rede completa de pontos. A expansão exige conferir e incorporar o GTFS oficial.

## Investigação do aplicativo de referência
O inventário de engenharia reversa foi realizado separadamente com REA/JADX e evidências estáticas. APKs, bibliotecas de terceiros e evidências brutas não fazem parte deste repositório. Referências encontradas no APK não implicam acesso público às APIs do Moovit. A matriz funcional sanitizada descreve cobertura e limites.
