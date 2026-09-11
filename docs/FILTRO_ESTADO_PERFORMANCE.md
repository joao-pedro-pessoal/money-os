# Filtro de estado no Performance by

Implementado em 2026-09-11, em Investments → Analysis → Performance by.

- Seletor de posições abertas, trades fechados ou ambos (predefinição).
- Filtra os totais, grupos e detalhes deste painel. Os restantes painéis continuam a mostrar o portefólio completo.
- Fechados mostra P&L realizado; abertos mostra P&L não realizado. Valores não aplicáveis aparecem como N/A.
- A seleção mantém-se ao mudar agrupamento, ordenação, abrir grupos ou atualizar a página, e é incluída nas vistas guardadas.
- Sem correspondências, aparece uma mensagem e os filtros continuam disponíveis.

Validação: testes de totais e membros filtrados, persistência da configuração das vistas e verificação no navegador dos três modos, mudança de agrupamento e atualização da página. TypeScript e ESLint passaram. Na suite geral, 2246 testes passaram e um teste de leitura de ficheiros excedeu o tempo limite; os três testes desse ficheiro passaram na repetição isolada.

O registo das restantes alterações está em [Revisão dos pedidos de trades e ativos](REVISAO_PEDIDOS_TRADES_ATIVOS.md).
