# Trajeto completo da origem ao destino

Pedido: apresentar caminhada de saída, ônibus/metrô/trem, caminhadas de baldeação e caminhada até o destino confirmado como uma única viagem.

Diagnóstico reproduzido em produção: selecionar675M-10 + Linha9 e “Ver caminhada da troca1” transforma a seleção em uma caminhada independente de0,3km e remove todos os ônibus. A origem/destino do mapa passam a ser só os pontos da baldeação. As instruções a pé também aparecem separadas da sequência de embarques.

Implementação autorizada:
1. Criar modelo de etapas em ordem: caminhada inicial, perna de transporte, conexão, próxima perna… caminhada final, mantendo inclusive conexões no mesmo ponto. Carregar shapes e caminhadas progressivamente, com erro específico por etapa. Não desenhar acessos inexistentes; preservar os pontos confirmados.
2. Mostrar “Seu trajeto completo” com etapas numeradas, linha/sentido, embarque, desembarque, caminhada pelas ruas e instruções. As ações de caminhada de uma opção passam a focar essa etapa no mapa, preservando todas as demais etapas e a frota, sem substituir a viagem.
3. Painel compacto no mapa/celular com as mesmas etapas e ação para reenquadrar a viagem inteira. Foco de trecho independente da seleção, sem reiniciar GPS ou desfazer movimentos manuais nas atualizações. Cancelar/ignorar carregamento da opção anterior.
4. Testes RED/GREEN para cadeia caminhada→metrô→trem→ônibus→caminhada, baldeação a pé, conexão no mesmo ponto, falha de desenho, troca de opção/endereço e foco preservando origem/destino/frota. Conferir mapa em desktop/celular; revisão independente; publicar e validar.

Restrições: R$0, usar apenas GTFS/OSRM/SPTrans existentes. Não mudar algoritmo de busca ou inventar plataformas, acesso interno, integração tarifária, posição de trem ou garantia de conexão. A caminhada completa avisa quando o serviço não chega à entrada escolhida. Não forçar passagem por todos os modos se uma alternativa não precisa deles.

