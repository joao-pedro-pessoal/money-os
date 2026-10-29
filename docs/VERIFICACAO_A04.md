# Verificação funcional de 22/10/2026

Esta passagem valida as correções B43–B49; o estado e o trabalho restante da A04
ficam exclusivamente em [TAREFAS.md](../TAREFAS.md).

A passagem de 29/10 acrescenta B63–B67; resultados e reprodução em
[VERIFICACAO_CRIACAO_REGISTOS.md](VERIFICACAO_CRIACAO_REGISTOS.md).

## Dados e isolamento

Os 40 testes novos de `src/actions/__tests__/money-flows-postgres.test.ts` usam
PGlite em memória, as migrações reais, duas pessoas fictícias e uma role sem
permissão de contornar RLS. O cliente de produção, sessão, câmbios e cache são
substituídos. Não leem `.env`, não fazem pedidos externos e não persistem dados.

Antes da correção, 16 dos 21 casos iniciais falharam. Após as correções e os
casos adicionais, passaram os 40. A suite completa passou 3100 testes em 213
ficheiros; build com TypeScript aprovado; lint de `src` sem erros, com os três
avisos Bybit já existentes.

Para repetir os testes automatizados, na pasta do projeto:

```cmd
npm.cmd test -- src/actions/__tests__/money-flows-postgres.test.ts --reporter=verbose
```

Os casos de pedidos simultâneos detetam o intercalar das ações, mas o PGlite
serializa transações numa ligação: não são um ensaio de carga nem uma prova de
todos os escalonamentos de um PostgreSQL com várias ligações.

## Comportamentos confirmados

| Área | Confirmação |
| --- | --- |
| Movimentos | Criar despesa, editar duas vezes e apagar duas vezes repõe exatamente o saldo. Receita rápida em USD e desfazer repetidos só alteram o saldo uma vez. |
| Transferências | 125 USD enviados e 100 EUR recebidos conservam os valores e moedas. Câmbio não indicado, valores inválidos, data impossível, conta arquivada/alheia e valores diferentes na mesma moeda são recusados. |
| Gravação/remoção | Triggers fictícios fazem falhar a ligação ou a remoção de um movimento: toda a operação recua, incluindo saldos. Duas remoções dos lados opostos não repõem dinheiro duas vezes. |
| Repetição | Mesmo pedido de transferência, também simultâneo, cria um único par; outros dados com o mesmo pedido são recusados. Recibo na auditoria impede recriar uma transferência apagada por repetição antiga. |
| Objetivos | Criar, editar e apagar; total exato repetido; duas adições conservam ambos os valores numa só afetação. Total negativo e objetivo alheio são recusados. Falha na auditoria não deixa reserva gravada. |
| Orçamentos | Criar, alterar limite e apagar. 125 USD com taxa USD=1,25 valem 100 EUR, também fora de orçamento. Falta de taxa fica assinalada; categorias inexistentes, alheias ou de receita não deixam orçamento vazio. Não é possível remover a última categoria. |
| Subscrições | Criar, editar, cancelar repetidamente, retomar e apagar sem criar despesa/saldo. Nome vazio e referências alheias são recusados. Falha de auditoria recua o cancelamento. A mesma cobrança só é registada uma vez. |

## Ensaio no browser

Versão de produção local em `127.0.0.1:3005`, ligada exclusivamente a outro
PostgreSQL em memória, com dados fictícios e migrações reais. Browser limitado
ao servidor local; pedidos externos do servidor dirigidos para um proxy inativo.
Computador a 1365×950 em inglês; telemóvel a 390×844 em português.

Passaram 12 verificações:

1. Transferência entre moedas: formulário identifica USD/EUR e grava os dois valores.
2. Recarregar conserva os dois movimentos.
3. Apagar um lado remove ambos e repõe os saldos originais.
4. Criar objetivo e afetar 50 EUR conserva o saldo da conta.
5. Criar orçamento e despesa em USD compara o valor convertido, também na página.
6. Despesa JPY sem taxa mostra o aviso global e no orçamento afetado.
7. Criar subscrição, cancelar, recarregar e retomar conserva o livro de movimentos.
8. Cortar o POST antes de chegar ao servidor não grava nada; conserva contas e valores.
9. Executar o POST e perder a resposta, depois tentar novamente, conserva um só par de movimentos.
10. Erro de transferência para a mesma conta aparece em português e conserva o valor.
11. Página do telemóvel sem transbordo horizontal.
12. Nenhum erro de execução da página.

No teste de rede, as contas selecionadas também são verificadas: React repunha
os selects após a ação devolver o erro, embora os valores escritos ficassem.
O formulário agora impede esse reset; o botão explícito de nova transferência
cria uma tentativa nova e reinicia os campos.

As novas mensagens estão em PT/EN. Os outros 13 catálogos conservam provisoriamente
o texto inglês das novas chaves, como registado em F18. Não houve migração,
dependência nova, alteração dos dados reais nem publicação.
