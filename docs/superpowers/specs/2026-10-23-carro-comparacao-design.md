# Carro e comparação gratuita de trajetos

Pedido autorizado: adicionar rotas de carro e melhorar comparação de caminhada e transporte público no Já Vem SP. Manter tudo dentro do mapa existente, usando somente fontes gratuitas, sem Google Cloud/chaves/faturamento.

Decisão de implementação: reutilizar OSRM/FOSSGIS para carro, com desenho, instruções, distância e tempo sem trânsito ao vivo. Compartilhar a fila/cache com a caminhada para respeitar 1 pedido/segundo. Não consultar durante digitação nem pré-buscar alternativas.

Comparação: botão explícito “Comparar modos” calcula uma caminhada completa e um trajeto de carro entre os pontos confirmados; a busca GTFS fornece ônibus/metrô/trem. Mostrar cartões selecionáveis para desenhar cada modo. Calcular o tempo programado das opções GTFS usando arrival/departure e frequências do mesmo ZIP auditado, com caminhada aproximada em linha reta a 4,5 km/h e espera média de meio intervalo. Identificar sempre a estimativa e seus limites. Permitir ordenar apenas as opções encontradas por tempo estimado; não prometer menor tempo de toda a rede. A ordem padrão anterior permanece.

Sem fonte confiável/serviço ativo, informar ausência de estimativa; não inventar velocidades de ônibus ou metrô. Ônibus ao vivo continuam vinculados aos trechos selecionados. Carro e caminhada limpam a frota. Trânsito de carro ao vivo e posição/chegada ferroviária ao vivo seguem indisponíveis e explicitamente identificados; nenhuma integração paga é habilitada.

Ao mudar endereços, inverter, sair da tela ou iniciar nova consulta: abortar e ignorar respostas antigas, limpar resultados de comparação e não restaurar mapa/frota anteriores. Manter pins de origem/destino mesmo quando o serviço ajustar o caminho à via; avisar distâncias de acesso maiores que 50m. Interface móvel, acessível, atribuição e privacidade atualizadas.

