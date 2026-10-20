# Conferência de todas as linhas — 20/10/2026

[Tabela pesquisável](../public/auditoria-linhas.html) · [CSV completo](../public/auditoria-linhas.csv)

Foram conferidos os 1.349 códigos de linha do GTFS e os 2.698 registros de linha/sentido do catálogo Olho Vivo consultado em 20/10/2026 às 09h40, horário de São Paulo. O ZIP foi obtido em 19/10/2026 e tem SHA-256 `373292560d8c85d05f372eb83d40610ae11a7f18e3b53d1ac9dde0166baf5812`. A comparação usou os resultados reais do resolvedor do site, com a API de paradas vazia, para verificar a cobertura estática sem confundi-la com complementos ao vivo.

## Resultado por sentido da API

| Resultado cadastral                                                                  | Quantidade |
| ------------------------------------------------------------------------------------ | ---------: |
| Associação de sentido encontrada, com pelo menos dois pontos, consistente com o GTFS |      2.241 |
| Itinerário existente, sem confirmação do sentido selecionado                         |        378 |
| Sem itinerário no GTFS                                                               |         78 |
| Sentido associado com menos de dois pontos distintos                                 |          1 |
| **Total**                                                                            |  **2.698** |

931 códigos têm os dois registros de sentido classificados como consistentes com o GTFS. Isso não é certificação da operação atual nem comprovação de cada parada física. Os 378 sentidos não confirmados pertencem a linhas com um único itinerário: ele pode representar uma operação circular; a ausência de um segundo grupo não comprova falta de um trajeto de volta. Na fonte, há 930 códigos com dois grupos de direção, 380 com um e 39 sem viagens.

O único registro com menos de dois pontos é a 626A-10 rumo a Cantinho do Céu: uma parada. O sentido rumo a Mar Paulista tem duas. Trata-se de [serviço Aquático-SP](https://www.sptrans.com.br/informativos/sul/criacao-da-linha-626a-10-cantinho-do-ceu-mar-paulista-aquatico-sp/59184/), embora o GTFS o classifique como `route_type=3`. Não se concluiu que sejam paradas de ônibus ausentes, e não foram inventados pontos para completar o cadastro. Um itinerário com um ponto não permite calcular um trecho entre duas paradas.

Os 39 códigos sem viagens continuam listados no [relatório anterior](auditoria-paradas.md). Eles existem no catálogo API e em `routes.txt`, mas não participam do planejador GTFS. A falta de viagens não foi interpretada como suspensão de serviço.

## Verificações integrais

- Todos os códigos de ônibus do GTFS têm código correspondente na API, com normalização de sufixos `-1`/`-01`; nenhuma linha foi perdida por essa diferença.
- Todos os pares API têm os sentidos 1 e 2 e terminais recíprocos, considerando acentos. A API usa duas grafias de Paissandu nas linhas 8600-10 e 9501-10; isso não foi tratado como divergência de terminal.
- Os 22.270 pontos do ZIP estão no JSON, com nome e coordenadas preservados até o arredondamento de seis casas. Não houve perda de paradas.
- Os 2.240 itinerários e suas 98.710 ocorrências de pontos mantêm os IDs e a ordem do ZIP. Letreiro, linha, serviço e direção também conferem, desconsiderando espaços nas extremidades removidos na importação.
- Cada lista produzida pelo resolvedor usa somente pontos cadastrados para aquela linha. Quando o sentido é associado, sua lista preserva integralmente um grupo de direção do GTFS.
- Todos os 2.240 itinerários referenciam um calendário válido com dias ativos e um traçado existente no ZIP. Não há exceções de feriados em `calendar_dates.txt` neste arquivo.
- As 39.846 janelas de frequência de ônibus têm início anterior ao fim, intervalo positivo e não se sobrepõem dentro do mesmo itinerário. Nenhum itinerário está sem frequência.
- Os horários do modelo de viagem não retrocedem entre paradas e não apresentam partida anterior à chegada.

Há 327 itinerários com pontos repetidos ao longo do percurso. Essas ocorrências são preservadas no planejador; o mapa mostra um marcador por ID. Há 426 intervalos entre pontos consecutivos acima de 1,2 km, listados como alerta de revisão: trechos expressos, rodovias e serviços especiais podem explicar distâncias grandes. A distância, sozinha, não comprova parada faltante.

Dos 22.057 pontos usados pelos itinerários de ônibus, 1.277 não têm referência de endereço na fonte; eles continuam pesquisáveis por nome/código. A tabela individual informa quando a lista de uma linha contém pontos sem referência.

## O que cada linha ainda precisa para cobertura completa

O site ainda não contempla tudo que seria necessário para uma viagem confirmada em tempo real:

- As 39.846 janelas foram importadas em `schedules.json` e conferidas integralmente contra o ZIP, sem registros ausentes ou alterados; os calendários e o hash correspondem ao planejador. São exibidas como faixas e intervalos, sem partidas exatas (`exact_times=1` ausente) e sem filtrar opções por hora de operação. O planejador considera o dia de serviço e apresenta itinerários cadastrados; a presença de uma opção não garante ônibus circulando naquele horário.
- As 98.710 ocorrências de pontos foram comparadas com seus traçados de origem; nenhuma ficou a mais de 300 m. Isso comprova consistência com a mesma fonte, não posição física ou operação atual. O mapa exibe pontos, sem desenhar a geometria do percurso.
- Posições e previsões dependem do retorno ao vivo da SPTrans; não há garantia de cobertura para todas as linhas e pontos.
- Os sentidos não confirmados e as linhas sem viagens precisam de associação ou fonte oficial adicional para fechar a cobertura cadastral.
- Desvios temporários, feriados e cada ponto físico exigem atualização operacional adicional. A validade do calendário até 01/05/2027 não garante que todo o cadastro permaneça atual até essa data.

A [documentação do Olho Vivo](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/) informa cobertura de paradas de corredores. Não foram feitas 2.698 consultas individuais ao endpoint de paradas. As quatro consultas das linhas 857C-10/476A-10 da auditoria anterior e dez consultas adicionais de sentidos das linhas 1012-10, 546J-41, 4053-10, 6082-10 e 626A-10 são amostras identificadas; estas dez últimas retornaram zero pontos. Isso não prova ausência de paradas ou de serviço.

No CSV, dias, serviços e faixas de frequência referem-se ao sentido associado quando possível; quando ele é incerto, resumem os itinerários da linha inteira. Início e fim são limites das janelas no terminal, sem descrever todas as interrupções entre elas. Não são horários de chegada nas paradas. Primeiro/último ponto são os extremos da lista exibida, e não validação independente dos terminais.

## Correção decorrente da conferência

A presença de um ponto da API no único itinerário GTFS podia marcar o sentido como confirmado, mesmo com destino diferente. Um ponto compartilhado comprova a associação com a linha, mas não distingue seu sentido. Essa inferência foi removida para itinerário único. A seleção por letreiro continua funcionando; a comparação por pontos continua disponível quando há grupos de direção distintos. As paradas disponíveis são preservadas e o aviso de sentido incerto permanece visível.

Uma regressão reproduziu a confirmação indevida antes da correção e passou depois. Outra garante a comparação por pontos entre dois grupos. Foi acrescentada uma verificação de todos os 2.240 itinerários contra as listas exibidas pelo resolvedor, além da auditoria do catálogo completo.

Os resultados detalhados, o exportador do resolvedor e o script de comparação foram preservados nos arquivos locais de entrega, sem credenciais, APKs ou endereços particulares.

Validação da entrega: 95 testes da aplicação e 8 do importador passaram; typecheck e build concluíram. A revisão independente não encontrou problemas relevantes. O build mantém dois avisos já existentes do empacotador sobre diretivas `use client` no pacote lucide-react; não impediram a geração dos arquivos. Os filtros por linha e por situação foram conferidos no navegador.

Atualização de busca e programação: o catálogo de 2.698 sentidos alimenta sugestões locais, e os três modos incluem proximidade por ônibus/calendário, priorização de caminhada e programação por intervalos. A digitação de endereços consulta Photon após três caracteres e 600 ms de pausa; endereços e GPS permanecem somente em memória. As duas consultas independentes ao endpoint público de partidas exatas retornaram HTTP 403; o site oferece links oficiais por código.
