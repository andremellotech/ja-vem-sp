# Já Vem SP: de onde vou → para onde vou

Data: 19/10/2026. Base: main a6efc260143bdde6699e8818712d43e5765ecc4b.
Estado: especificação aprovada pelo usuário em 19/10/2026; implementação ainda não iniciada.

## Resultado esperado

O visitante informa dois endereços em São Paulo e recebe opções de ônibus
municipais com embarque e desembarque identificados. O escopo escolhido pelo
usuário inclui linhas diretas e trajetos com até uma troca. A busca atual de
linhas/paradas, os favoritos, os veículos e o mapa continuam disponíveis.

## Experiência

1. A entrada principal apresenta “De onde você vai sair?” e “Para onde você
   vai?”. Os exemplos incluem rua, avenida, travessa, número e bairro.
2. Cada campo tem uma ação “Localizar endereço”. A pesquisa ocorre ao acionar
   o botão ou Enter, sem enviar uma consulta a cada tecla. O visitante escolhe
   um dos resultados com endereço completo; o texto digitado sozinho não
   confirma um ponto no mapa. Editar um campo invalida a seleção anterior.
3. “Usar minha localização” preenche apenas a origem, após a ação do visitante
   e a permissão do navegador. Falha ou recusa permite continuar digitando.
   “Inverter origem e destino” troca os pontos e seus textos confirmados.
4. “Ver opções de ônibus” fica disponível quando os dois pontos estão
   confirmados. Mostra carregamento, resultado vazio ou erro recuperável.
5. Cada opção apresenta os códigos das linhas, destino/sentido cadastrado,
   parada de embarque, parada de desembarque e, quando houver, a parada da
   troca. Exibe as distâncias aproximadas da origem ao embarque e do
   desembarque ao destino, identificadas como distâncias em linha reta.
6. O mapa destaca origem, destino e paradas da opção selecionada. Não desenha
   uma linha reta como se fosse o caminho real do ônibus ou do pedestre.
   A opção “Ver chegadas nesta parada” abre a consulta existente da SPTrans.
7. No celular, preserva-se a alternância Lista/Mapa e o foco no ponto
   selecionado. “Linhas e paradas” permite acessar a pesquisa atual.

## Endereços e privacidade

Usar o serviço público Photon com dados OpenStreetMap, sem contratar serviço
pago. As consultas partem diretamente do navegador, com preferência por São
Paulo, país BR e até seis resultados. O endpoint fica configurável. Teste de
um endereço público na Avenida Paulista confirmou resposta HTTP 200 e CORS
compatível com o domínio publicado.

Antes do botão, informar de forma curta que o endereço pesquisado será enviado
ao Photon/OpenStreetMap. Não gravar endereços nem posição GPS no GitHub,
Worker, armazenamento persistente ou URL da página. Manter resultados em
memória durante a sessão. O GPS não precisa de geocodificação reversa: pode
ser identificado como “Minha localização”. O mapa continua sujeito às
requisições de tiles já descritas pelo projeto.

Cancelar consultas substituídas e ignorar respostas antigas. Validar as
coordenadas e propriedades retornadas, renderizar os textos como texto e
permitir nova tentativa após timeout ou erro. Informar quando o número do
imóvel não foi localizado e exigir confirmação do resultado aproximado.

O servidor público Photon admite uso moderado e não oferece garantia de
disponibilidade. Se falhar, manter a busca existente de linhas/paradas
funcional e oferecer nova tentativa; não trocar silenciosamente de provedor.

## Dados e cálculo de trajetos

Ampliar a importação do GTFS oficial já disponível localmente, sem publicar o
ZIP original. Gerar um índice estático versionado para GitHub Pages com
rotas de ônibus (route_type=3), viagens/sentidos, paradas ordenadas por
stop_sequence e calendários de serviço. Preservar procedência, hash, data e
validade. O feed inspecionado contém 1.349 rotas de ônibus; também contém
rotas ferroviárias, que ficam fora do cálculo desta etapa.

Carregar o índice sob demanda e calcular no navegador em Web Worker, sem
travar a interface. Utilizar a rede de paradas existente para proximidade.
O importador rejeita dados essenciais inconsistentes; o site não usa um
índice de trajetos incompatível com a versão da rede de paradas.

Regras da primeira versão:

- Buscar até 12 paradas de ônibus em cada extremidade, num raio de 800 m.
  Se não houver opções, oferecer ao visitante ampliar para 1.200 m. Não
  ampliar silenciosamente. A medida é em linha reta, sem assegurar acesso
  por calçadas, travessias ou entradas de terminais.
- Aceitar embarque e desembarque somente na ordem correta da mesma viagem.
  Respeitar variantes, sentido e ocorrências repetidas em linhas circulares;
  compartilhar um código de linha não basta para comprovar uma conexão.
- Uma troca exige duas viagens e uma parada com o mesmo stop_id. Não inferir
  que pontos de lados opostos de uma avenida sejam uma conexão a pé.
- Considerar os dias e a validade do calendário no fuso America/Sao_Paulo,
  incluindo exceções calendar_dates quando existirem. Se a base estiver
  vencida, informar que precisa de atualização, sem anunciar opções atuais.
- Remover duplicatas e apresentar até seis alternativas, priorizando menos
  trocas e menor distância nas extremidades; usar quantidade de paradas como
  desempate. Não chamar essa ordenação de “trajeto mais rápido”.
- Identificar os resultados como itinerários cadastrados. Calendário e
  frequências programadas não comprovam operação naquele momento. Não
  inventar tempo total, caminhada, espera ou chegada a partir da distância.
- Quando não encontrar opções, explicar os limites do raio e de até uma
  troca. Ausência de resultado não significa ausência de transporte.

## Chegadas reais

Reutilizar a API Cloudflare existente. O código GTFS de linha e direction_id
não substituem o identificador por sentido da API Olho Vivo. Não converter
direction_id em 1/2 por suposição.

Consultar inicialmente as chegadas da parada, com todas as linhas, como já
faz o site. Somente filtrar um sentido se houver correspondência verificada
e única com o identificador SPTrans. Mostrar horários e atualização recebidos
do fornecedor; resposta vazia aparece como previsão indisponível. A troca
de ônibus não terá conexão garantida nem horário de chegada inventado.

## Organização e compatibilidade

Separar geocodificação, formulário de endereços, cálculo em Worker, cartões de
opções e geração do índice GTFS. Integrar esses módulos à aplicação atual
sem substituir funcionalidades enviadas pelo usuário ao GitHub. Usar os
componentes, estilos e ícones existentes; não adicionar biblioteca ou serviço
pago. A chave SPTrans permanece exclusivamente no servidor.

## Critérios de aceitação

- Dois endereços confirmados produzem opções com embarque/desembarque, quando
  houver conexão no conjunto de dados. Testar exemplo real direto e outro
  com uma troca, conferindo os padrões ordenados do GTFS.
- Testes do cálculo cobrem ordem e sentido, linha circular, troca na mesma
  parada, ausência de conexão, limite do raio e calendário sem serviço.
- Testes da interface cobrem endereço ambíguo, edição após confirmação,
  inversão dos pontos, localização recusada, indisponibilidade do Photon,
  resposta antiga e retorno sem previsão da SPTrans.
- Os testes existentes continuam passando, incluindo paradas próximas,
  favoritos, pesquisa de linhas/paradas, atualização manual e mapa oculto.
- Conferir desktop e celular de 390 px, navegação por teclado, textos sem
  corte e estados de carregamento/erro. Conferir também o site publicado,
  sem credenciais no pacote estático.

## Fora desta etapa

Rotas a pé pela malha de ruas, trocas entre paradas diferentes, mais de uma
troca, integração operacional de metrô/trens, pagamentos, conta sincronizada
e garantia de acessibilidade do trajeto. Essas funções exigem dados e regras
adicionais; a interface deve apresentar as limitações relevantes ao visitante.

## Referências

- [Photon e condições do servidor público](https://github.com/komoot/photon#demo-server)
- [API Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [SPTrans Desenvolvedores](https://www.sptrans.com.br/desenvolvedores/)
- Base GTFS local: SHA-256 373292560d8c85d05f372eb83d40610ae11a7f18e3b53d1ac9dde0166baf5812.
