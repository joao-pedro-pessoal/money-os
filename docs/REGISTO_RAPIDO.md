# Registo rápido de despesas e receitas

O botão **+ / Quick entry** no cabeçalho abre um formulário sobre a página
atual, disponível no PC e no telemóvel. Começa em despesa, usa a conta habitual
configurada (ou a primeira conta ativa) e a data local de hoje. Mantém a conta
escolhida nas próximas aberturas enquanto a sessão da interface permanecer montada.

O valor aceita vírgula ou ponto decimal e mostra a moeda da conta. Categoria,
descrição e data estão em Details. As categorias acompanham o tipo escolhido.
Sem contas, a janela apresenta uma ligação para criar uma.

Depois de guardar, **Undo** remove o movimento e reverte o seu efeito no saldo.
Não há um temporizador: a opção permanece até fechar a confirmação. O histórico
Cash Flow continua a permitir consultar, editar e eliminar os movimentos.

## Consistência

A criação manual partilha a mesma operação no servidor com o formulário
existente. Movimento e saldo são gravados numa transação PostgreSQL. O registo
rápido envia um identificador estável por tentativa; repetir o mesmo pedido
enquanto o movimento existe não incrementa o saldo novamente. Uma reutilização
do identificador com dados diferentes é recusada.

A eliminação de movimentos simples também usa uma transação: só o pedido que
remove a linha pode reverter o saldo, tornando seguro repetir Undo. As ações do
registo rápido verificam a sessão e não aceitam identificadores de outros tipos
de registo para Undo. Transferências mantêm o seu fluxo existente.

Isto não é uma fila offline nem um protocolo de sincronização entre dispositivos.
Se a rede falhar sem confirmar o resultado, o formulário conserva os dados e
permite repetir a tentativa; também recomenda consultar Cash Flow antes de
iniciar outro registo. Depois de fechar a janela, o identificador da tentativa
não é persistido no dispositivo.

## Validação

- 2 215 testes aprovados em 120 ficheiros, incluindo valores com vírgula,
  rejeição de separadores ambíguos, precisão e datas inexistentes.
- TypeScript, ESLint dos ficheiros alterados e build de produção aprovados.
- Edge automatizado em 360, 390, 430 e 1280 px: abertura, fecho por Escape,
  reposição do scroll, sem transbordo da página.
- Conta temporária em USD: despesa de 12,30, data escolhida, duas repetições
  concorrentes do pedido, desfazer e duas repetições concorrentes do desfazer.
  Uma única linha e uma única alteração do saldo; saldo original reposto.
- Receita de 25.50 e desfazer; valor zero recusado sem alterar o saldo.
- Nenhum erro JavaScript nos fluxos verificados. Conta e movimentos temporários
  removidos após os testes.

Evidência local: `.local-checkpoints/verification-all/quick-entry-results.json`
e capturas `quick-entry-*.png`. Ainda não testado num telemóvel físico.
