# Auditoria de paradas — 20/10/2026

## Comparação de toda a base importada

Foram comparados o ZIP oficial obtido em 19/10/2026, os dois JSONs publicados e o catálogo da API Olho Vivo consultado em 20/10/2026. Hash do ZIP: `373292560d8c85d05f372eb83d40610ae11a7f18e3b53d1ac9dde0166baf5812`.

| Verificação | Resultado |
| --- | --- |
| Pontos no ZIP e no JSON de paradas | 22.270 em ambos |
| Pontos perdidos na importação | 0 |
| Coordenadas alteradas além do arredondamento de seis casas | 0 |
| Ocorrências de paradas nos itinerários de ônibus | 98.710, sem divergência de ordem ou ID |
| Linhas de ônibus cadastradas no GTFS | 1.349 |
| Itinerários de ônibus | 2.240, sem perda na importação |
| Registros de linha/sentido encontrados na API | 2.698 |

Das associações automáticas entre API e GTFS, 2.242 encontraram uma correspondência única, 378 ficaram sem confirmação de sentido e 78 não tinham itinerário no GTFS. Esses números descrevem a resolução dos identificadores e nomes; não equivalem a uma inspeção física ou confirmação manual de cada sentido. A normalização contempla sufixos como `-1`/`-01` sem confundir com `-10`.

## Linhas informadas pelo usuário

| Linha | Destino | Pontos GTFS | Pontos informados pela API |
| --- | --- | ---: | ---: |
| 857C-10 | Metrô Conceição | 48 | 9 |
| 857C-10 | Terminal Campo Limpo | 49 | 11 |
| 476A-10 | Terminal Santo Amaro | 69 | 7 |
| 476A-10 | Ipiranga | 68 | 8 |

Todos os pontos retornados pela API nesses quatro registros também estavam no GTFS e tinham as mesmas coordenadas, considerando o arredondamento. Os testes verificam a lista inteira de IDs em ambos os sentidos. O retorno pequeno do Olho Vivo não demonstra que as demais paradas deixaram de existir: a [documentação oficial](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/) informa cobertura de paradas de corredores.

A consulta de itinerário da [857C-10 na SPTrans](https://www.sptrans.com.br/itinerarios/linha/?numero=857C-10) foi acessada para conferir destino e vias. Essa tabela de vias não foi tratada como lista de pontos de embarque. Não foram acrescentados pontos de outras linhas apenas por estarem perto do traçado.

## Falhas corrigidas

O planejador restringia os candidatos às 12 paradas mais próximas de cada endereço. Na região de Conceição, o desembarque da 857C-10 ficava em 13º, a aproximadamente 235 m, dentro do raio anunciado de 800 m. Ele era descartado, eliminando uma opção direta. Agora todas as paradas com serviço ativo dentro do raio participam do cálculo; o máximo continua sendo seis alternativas exibidas. Regressões cobrem tanto origem como destino após a 12ª posição, além do caso real da 857C.

Na junção de paradas, o objeto da API substituía o cadastro inteiro do GTFS. Como a API do site não fornece endereço nessa consulta, perdia-se a referência da rua. A junção agora preserva o endereço GTFS quando o fornecedor não traz outro preenchido, mantendo nome e coordenadas atualizados pela API. A busca e a identificação visual aceitam nome, endereço de referência e código. Prefixos comuns como R./Rua e Av./Avenida são normalizados. Os tooltips do mapa também identificam a referência disponível, com conteúdo de texto seguro.

Exemplo: o ponto `150015739`, Morumbi C/B, atende às duas linhas informadas e tem referência a R. Bernardino de Campos no GTFS. Essa referência era apagada na junção e não era pesquisável na lista.

## Lacunas ainda existentes na fonte

Há 39 códigos cadastrados no GTFS sem viagens/itinerários em `trips.txt`, equivalentes a 78 registros de sentido na API:

`177H-21`, `189L-21`, `2100-21`, `2105-21`, `220P-10`, `3686-21`, `407A-21`, `407I-21`, `4312-21`, `4314-21`, `439P-10`, `476G-21`, `502J-23`, `5091-10`, `509J-21`, `5178-22`, `5194-21`, `546L-21`, `5614-21`, `5652-22`, `574A-21`, `5791-21`, `6042-22`, `675R-23`, `695T-51`, `702U-22`, `7245-21`, `8003-21`, `8006-21`, `8024-10`, `8086-31`, `847J-21`, `8686-21`, `8705-51`, `8707-21`, `920P-10`, `938C-21`, `955P-10`, `965A-10`.

Nesses casos, o site depende das paradas que a API fornecer e informa cobertura parcial. A ausência no GTFS não comprova suspensão de uma linha. Não foram inventadas associações nem importados pontos de linhas vizinhas.

A comparação integral garante fidelidade ao ZIP analisado, não a presença de cada parada física ou desvio temporário na cidade. Após novo login em 20/10, o portal continuou anunciando como última atualização 19/10/2026 às 11h41, a data do arquivo auditado. O navegador bloqueou a tentativa de baixar outra cópia; não foi realizada uma segunda comparação binária de download. O cadastro público de pontos usado pela página oficial retornou HTTP 403 no cliente independente; não foi incorporado nem usado como prova de completude.

## Verificação da correção

92 testes da aplicação e 8 do importador passaram, incluindo regressões observadas falhar antes das correções e passar depois. Revisão independente não encontrou problemas importantes. Seis cenários de desempenho em Node, com raio de 1.200 m e até 273 paradas próximas por região, levaram 57–362 ms; isso não substitui uma medição em celular físico.

Relatórios detalhados da comparação do ZIP, catálogo da API e quatro consultas de paradas foram guardados nos arquivos locais de entrega, sem credenciais ou endereços particulares.
