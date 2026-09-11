# Calendário diário de P&L

Implementado em 2026-09-11 em Investments → Trade History, antes dos gráficos de análise.

- Calendário mensal, com semanas de segunda-feira a domingo, navegação entre meses e acesso ao mês dos últimos trades filtrados.
- Cada dia mostra a soma do P&L realizado e o número de trades fechados. Ganhos a verde, perdas a vermelho e resultado zero neutro. Dias sem trades mostram um traço.
- Clicar num dia lista as execuções individuais, conta, hora e P&L. Os nomes dos ativos abrem as respetivas páginas.
- Total mensal e número de trades/dias recalculados a partir dos mesmos filtros do histórico. Dias usam UTC e valores usam a moeda base, sem nova conversão ou subtração das comissões apresentadas separadamente no histórico.
- Não inclui depósitos, dividendos, posições abertas ou trades sem P&L realizado. Respeita o modo de privacidade dos valores monetários e pode ser minimizado.
- Validação: 2250 testes passaram (limite de 15 segundos por teste), TypeScript e ESLint. Navegador confirmou filtros, soma diária, detalhe individual, dia com resultado zero, mês vazio e navegação; aspeto verificado a 390 px. Dados temporários de teste removidos.

Registo geral: [Revisão dos pedidos de trades e ativos](REVISAO_PEDIDOS_TRADES_ATIVOS.md).

## Gráfico de evolução da conta e do P&L

Acrescentado em 2026-09-11, imediatamente acima do calendário. O gráfico anterior de P&L foi integrado neste painel, evitando repetir o mesmo gráfico.

- Opção P&L acumulado: linhas de resultado realizado, comissões reportadas separadamente e resultado líquido, na moeda base e para os trades filtrados.
- Opção valor da conta: linha dos saldos históricos guardados, com o último registo de cada dia UTC, na moeda da própria conta. Escolher a conta também atualiza o filtro de conta do histórico.
- O saldo inclui o efeito de depósitos e levantamentos; não é apresentado como lucro de trading. Filtros de instrumento e tags não alteram o saldo histórico da conta; os filtros de conta e datas aplicam-se.
- Dias sem registos não são inventados. Sem histórico, aparece uma mensagem; um único registo aparece como ponto.
- Snapshots com moeda diferente são excluídos e identificados. Nos registos antigos sem moeda, a moeda atual da conta é assumida e essa limitação aparece no painel.
- O modo de privacidade esconde o gráfico e os valores. Gráfico e calendário podem ser minimizados separadamente.
- Validação: 2252 testes passaram, incluindo último snapshot diário, resultado zero e moedas distintas. Navegador confirmou os dois modos, a conta MEXC e o calendário; TypeScript e ESLint passaram.
