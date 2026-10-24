# Confirmar as entradas de origem e destino

**Objetivo:** corrigir o fluxo já autorizado de escolha do ponto de saída e chegada quando o geocodificador não conhece o número do imóvel. Implementação na base pública `16e8429fcae4d10445334ac33f9100369d960361`, preservando ônibus ao vivo, trajetos e orçamento R$0.

**Referência:** especificação aprovada `../specs/2026-10-21-trajetos-internos-design.md` e pedido atual para confirmar as duas entradas. Os endereços pessoais do exemplo não entram em repositório, screenshots públicos ou consultas externas desta revisão.

Diagnóstico: a sugestão sem número leva ao aviso com ação “Usar ponto aproximado”; o mapa para ajustar a entrada fica separado e precisa ser redescoberto. O mapa ocupa 300px dentro da coluna e só aceita clique/arraste ou dois campos de coordenadas escondidos. O marcador de referência não responde ao clique para confirmar a escolha.

1. Teste RED de parser local de coordenadas e links de ponto Google Maps. Aceitar apenas pontos explícitos e válidos; rejeitar centro de viewport, links curtos sem coordenadas, URLs não Google e rotas ambíguas. Não acessar Google para expandir ou geocodificar links.
2. Implementar `parseMapPoint(input): Point`, usado no seletor para colar coordenadas ou um link de ponto. Não usar coordenadas de `@` como endereço exato.
3. Teste RED com AddressField + PointPicker reais: selecionar sugestão aproximada abre a confirmação, ponto de referência sozinho não confirma número, colar/aplicar/confirmar preserva rua, número e coordenadas escolhidas. Testar origem e destino, cancelamento e edição posterior.
4. Abrir seletor em diálogo amplo e responsivo. Permitir clicar no mapa ou no marcador, arrastar marcador, usar centro após mover mapa e colar ponto. A confirmação explícita continua obrigatória. Coordenadas manuais continuam disponíveis.
5. Teste de integração com planejador usando as duas entradas escolhidas; preservar caminhada final até o ponto e impedir seleção tardia após cancelar/sair. Rodar suíte completa, build, revisão independente, browser desktop/celular, publicar e conferir.

Google: Routes em produção exige faturamento; Maps Demo Key é só prototipagem. Embed gratuito requer chave/configuração e não fornece seus dados ao nosso Leaflet. Não criar chave nem ativar faturamento. A importação de um ponto colado é feita localmente, sem extração de conteúdo Google ou requisição ao Google. O rótulo deixa claro que marcar um ponto não valida o número na base cadastral.

Extensão após pesquisa: o WFS público GeoSampa comprovou retorno de lote pelo nome da via e igualdade do número (teste público MASP). Adicionar `/api/addresses` no Worker existente, sem nova credencial. Validar entrada, nome/tipo/número retornados, polígonos/coordenadas e limitar consulta, campos, tempo e cache. A digitação continua Photon; cadastro municipal só no botão ou ao escolher sugestão aproximada. Um resultado abre o mapa do lote; múltiplos exigem nova escolha; erro/ausência permite marcação manual. Não consultar dados de proprietário. Atualizar privacidade, testes de proxy/validação/cancelamento/cache, testar MASP e publicar Worker junto ao site.

Revisão: não aceitar mais o ponto aproximado sem mapa, inclusive depois de cancelar. Não descartar qualificadores: bairro/CEP/outro município mantêm a busca contextual Photon e sua referência; consulta municipal só quando o texto contém rua/número e no máximo a capital como qualificador. Ao partir de uma sugestão Photon, apresentar os lotes para nova escolha, sem substituir silenciosamente a referência. O filtro de nome/tipo e número é exato antes do limite no WFS. Referências homônimas recebem rótulos distintos. Desenhar todos os polígonos e anéis internos do lote.

Verificação privada autorizada pelo usuário: os dois números do exemplo foram encontrados, cada um em um lote. O registro público deste plano não contém os endereços ou coordenadas particulares.
