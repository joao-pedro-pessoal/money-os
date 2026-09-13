# Descontos, poupanças e cashback

Pedido 8 implementado em 2026-09-13 no site e na aplicação móvel. A validação em dispositivos físicos continua na etapa 7 do plano geral.

## Como usar

1. Ao registar uma despesa, mantém em **Amount / Montante** o valor realmente pago. Em **Purchase savings**, indica o desconto ou o preço original para calcular a diferença; podes também indicar o cashback total esperado. Na app móvel, estes campos aparecem em Contas, antes de Registar movimento.
2. Abre **Money → Savings** no site (`/savings`) ou a aba **Poupanças** no mobile. Seleciona uma compra manual ou importada para adicionar/corrigir os valores posteriormente.
3. Se o cashback já está no histórico, usa **Link cashback already in Cash Flow / Associar movimento**. A ligação não cria outra receita nem altera o saldo.
4. Se o recebimento ainda não está registado, usa **Record cashback not yet in Cash Flow / Novo recebimento**, escolhe a conta, data e montante. Isto cria uma receita real. A opção de reversão cria uma despesa real se o cashback foi retirado.
5. Numa devolução, corrige o desconto retido e o cashback esperado. Para cancelar o benefício, coloca ambos a zero. Os recebimentos reais ficam preservados; regista o reembolso da compra separadamente.

O cashback recebido é associado depois de guardar a compra. Não é acrescentado ao saldo apenas por escrever um valor esperado.

## Comportamento e limites atuais

- Totais de descontos, cashback recebido líquido de reversões, total poupado e pendente separado; histórico e filtros por mês, ano, período personalizado, conta e categoria.
- O período, a conta e a categoria referem-se à **compra**. Todos os recebimentos ligados a essa compra entram no seu resultado, mesmo que tenham ocorrido mais tarde. Não é um extrato de recebimentos por data de caixa.
- Totais apresentados separadamente por moeda; não existe um total convertido nesta aba. Uma ligação de cashback exige a mesma moeda da compra.
- Cada movimento completo de recebimento/reversão só pode pertencer a uma compra. Distribuir um único recebimento agregado por várias compras fica como melhoria futura.
- O mobile permite indicar uma categoria textual da compra. O site mantém o catálogo de categorias existente. Não foi criado um catálogo paralelo no site.
- Desassociar mantém o movimento e o saldo. Apagar a compra remove a atribuição dos seus recebimentos, sem apagar o dinheiro efetivamente recebido; cancelar um benefício deve ser feito editando os valores, não apagando a compra.
- Os descontos são metadados, nunca receitas. Um benefício aplicado no pagamento deve ser registado apenas como desconto.
- Um recebimento criado manualmente que apareça mais tarde num extrato deve ser reconciliado com esse movimento antes de associar ambos. Não se presume que duas receitas parecidas sejam o mesmo pagamento.
- A app móvel continua a sincronizar o seu cofre cifrado entre dispositivos atualizados. O site financeiro ainda usa a base web existente: esta tarefa não transforma o site no cliente do cofre cifrado.

## Implementação e verificação

- Regra partilhada: `src/lib/money/savings.ts`. Campos `discountAmount`, `cashbackExpected` e `cashbackForId` no movimento; o P&L de investimentos não foi alterado.
- Migração web gerada `0043_opposite_rawhide_kid`, aplicada à base local; segunda geração sem alterações. Dados existentes recebem desconto/esperado zero e nenhuma ligação. Não foi aplicada uma migração a produção.
- Ações de poupanças autenticadas; gravação do dinheiro e atualização do saldo na mesma transação. IDs de pedidos impedem que repetir o registo rápido/recebimento crie dinheiro novamente. O formulário de novo recebimento exige uma escolha explícita para registar outro.
- Backups web incluem os campos nos movimentos e rejeitam metadados/ligações inválidos antes de substituir dados. O backup cifrado móvel preserva os campos; o merge normaliza IDs de compras importadas entre dispositivos antes de associar cashback.
- Testes cobrem descontos calculados, conflito entre desconto/preço original, cashback parcial, reversões, devoluções, moedas separadas, backup cifrado, concorrência entre dispositivos e falha de escrita atómica.
- Navegador com fixtures DEMO na base isolada: compra 100→80, desconto 20, cashback esperado 5, ligação de receita importada sem alterar saldo, novos recebimentos/reversões, repetição concorrente de pedidos, correção após devolução, filtros e painéis a 360/390/1280 px. Fixtures removidas no final.
- Evidência local: `.local-checkpoints/verify-savings.mjs`, `savings-results.json` e `savings-*.png`. Ficheiros de autenticação locais ficam ignorados e não devem ser partilhados.
- TypeScript web/mobile, testes web/mobile/conectores, build web e exportação Android/iOS aprovados. ESLint dos ficheiros desta tarefa sem erros; o lint geral continua com oito erros preexistentes na configuração móvel e em `SyncSettings.tsx`.

## Pedido original

## Ao adicionar uma compra ou despesa

Permitir indicar opcionalmente:

- O valor efetivamente pago.
- Quanto teve de desconto ou poupou, em dinheiro e na moeda do movimento. Pode escrever o valor poupado diretamente ou indicar o preço original para calcular a diferença.
- Quanto teve de cashback, distinguindo o valor esperado do já recebido, com data e conta de recebimento quando aplicável.

Estes campos também devem poder ser editados posteriormente. Devem existir no registo rápido e no formulário completo, no site e na aplicação móvel.

## Nova aba «Poupanças»

Mostrar quanto a pessoa já poupou, com:

- Total de descontos/poupanças nas compras.
- Total de cashback efetivamente recebido.
- Total combinado: descontos/poupanças + cashback recebido, sem duplicações.
- Cashback pendente apresentado separadamente, sem o contar como dinheiro já recebido.
- Histórico das compras que compõem os totais e filtros por período, categoria e conta, incluindo mês, ano e total acumulado.

Exemplo: uma compra de 100 € custou 80 € e deu 5 € de cashback.
O desconto foi de 20 €. Enquanto o cashback estiver pendente, a aba mostra 20 € poupados e 5 € pendentes. Depois de recebido, mostra 25 € no total: 20 € de desconto e 5 € de cashback.

## Regras para evitar valores incorretos

- «Desconto» e «dinheiro poupado» descrevem a mesma redução de preço: se ambos forem indicados para a mesma redução, contar apenas uma vez.
- O desconto não é receita nem aumenta o saldo: a despesa continua a ser o valor realmente pago. O total desta aba mede benefícios nas compras; não representa o saldo disponível nem poupança transferida para objetivos/buckets.
- Um cashback já descontado no pagamento integra o desconto imediato. Não voltar a contá-lo como um recebimento posterior.
- Cashback recebido posteriormente deve ligar-se ao movimento de entrada correspondente. Se esse movimento vier do banco, não criar uma segunda receita ao associá-lo à compra.
- Devoluções, cancelamentos, correções e cashback revertido devem atualizar os totais, preservando os montantes efetivamente recebidos ou devolvidos.
- Não somar moedas diferentes diretamente. Usar as regras de conversão existentes e identificar valores sem conversão disponível.
- Sincronização, importações repetidas e restauros não podem duplicar compras, descontos ou recebimentos de cashback.

## Critérios do pedido

Registar e editar os valores, mostrar a nova aba, passar de cashback pendente a recebido e associar um recebimento importado sem duplicar o saldo. Validar também devoluções parciais, reversões, moedas diferentes e sincronização entre dispositivos.
