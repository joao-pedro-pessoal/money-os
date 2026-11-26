# Quotas de registo de transferências e juros

Revisão local de 26 de novembro de 2026, ramo `codex/google-login`.
O estado atual e as prioridades permanecem exclusivamente em `TAREFAS.md`.

## Percurso protegido

Os formulários existentes de transferência e de juros chamam respetivamente
`submitTransfer` e `submitInterestPayment`. Estes continuam a delegar nas ações
diretas `createTransfer` e `createInterestPayment`. A admissão ocorre nessas ações
diretas, antes de abrir a transação financeira ou ler as contas. Assim, chamar a
ação direta não contorna o limite e usar o formulário não gasta duas admissões.

A sessão é verificada antes dos dados do formulário e da admissão. As validações
baratas de montante, data e identificador da tentativa precedem os contadores.
Os pais são lidos sob RLS dentro da transação; o cliente continua sem escolher
uma identidade. Não há novos endpoints HTTP ou fornecedores.

As duas famílias partilham o orçamento `money-record` em
`src/lib/accounts/workLimits.ts`:

| Âmbito | Pedidos admitidos | Trabalho simultâneo |
| --- | --- | --- |
| Pessoa | 30/minuto e 300/hora | 2 |
| Ligação, quando há endereço no pedido | 120/minuto e 1200/hora | 16 |
| Global | Sem janela adicional de pedidos | 16 |

Os limites usam o mecanismo distribuído `workGate`, com relógio e estado de
PostgreSQL. Os contadores conservam fingerprints HMAC, sem pessoa/IP em claro;
as reservas expiram em seis minutos e um token antigo não liberta outra reserva.
Na cópia de casa sem cabeçalho de ligação, continuam ativos os limites por pessoa
e globais. Não há novas variáveis de ambiente; o mecanismo depende do
`APP_SECRET` e da tabela `work_gates` da migração 0075, já existente no ramo.
Este lote não cria nem aplica migrações.

## Repetição, falhas e apresentação

Uma admissão recusada não entra na transação financeira e não cria recibos,
movimentos, juros ou alterações de saldo. Os formulários recebem `error` com
mensagem EN/PT e `retryAfter` em segundos. Não fazem uma nova tentativa automática
e conservam os campos e o identificador da tentativa existente.

Um pedido repetido depois de ter sido guardado continua sujeito à quota de
pedidos, incluindo quando apenas vai confirmar o recibo. Depois de expirar o
limite, repetir os mesmos dados e identificador confirma a gravação anterior sem
somar novamente o dinheiro. O recibo mantém-se duradouro: uma transferência
apagada não pode ser recriada pela tentativa antiga. Não se alteraram os
cálculos monetários, as duas pernas da transferência, a moeda recebida, a ordem
dos locks ou a atomicidade de recibos e saldos.

Uma falha dentro da transação anula a escrita e liberta a reserva sem devolver
o orçamento do pedido. A ação permite repetir o mesmo identificador. Uma falha
a libertar a reserva não transforma um commit concluído numa resposta de erro;
a reserva continua limitada pelo seu prazo. Falhas na revalidação das páginas
também não mudam o resultado da gravação: emitem apenas um código constante,
sem dados pessoais. Se a interface ficar desatualizada, recarregar volta a ler
os valores confirmados.

O aviso de privacidade EN/PT inclui agora os contadores de transferências e
juros; `LEGAL_UPDATED` passa a 26/11/2026. Mantêm-se os prazos e o mecanismo de
limpeza já descritos. Os restantes idiomas da edição completa recebem o mesmo
novo parágrafo em inglês, conforme o fallback existente.

## Evidência dirigida

Dez casos novos usam PostgreSQL PGlite em memória, migrações reais e um papel
`NOBYPASSRLS`, sem o cliente de produção nem ficheiros de ambiente. Comprovam:

- um só orçamento entre ações diretas/formulários e as duas famílias;
- recusa após 30 admissões, sem alterar os registos anteriores;
- orçamento pessoal separado e limite de ligação partilhado entre pessoas;
- ausência de pessoa e endereço em claro nos contadores;
- concorrência limitada, janela horária e admissão após envelhecer a janela;
- repetição após recusa sem duplicar dinheiro, conflito de dados e recibo
  preservado depois de apagar uma transferência;
- referências a contas alheias recusadas sob RLS;
- rollback numa falha SQL, nova tentativa e libertação da reserva;
- confirmação de gravação perante falha de revalidação ou libertação;
- sessão e input inválido recusados antes da admissão.

As regressões financeiras anteriores continuam a usar o mecanismo real de
quotas; o ensaio fornece apenas um segredo fictício, cabeçalhos de teste e
limpa os contadores entre casos independentes. A verificação dirigida de
regressões financeiras, autorização e textos legais passou 470 testes; a suite
nova passou os dez casos. Pedidos externos são proibidos na suite nova.

A suite completa passou 4151 testes em 264 ficheiros. TypeScript e lint de
`src` passaram sem erros ou avisos. As compilações Next 16.4.6/webpack de money
e full passaram numa cópia isolada, sem `.env`, com URLs PostgreSQL fictícios no
loopback. O aviso sobre múltiplos lockfiles decorre da cópia dentro do worktree;
a pasta `.next` original não foi usada. Nenhum teste desta validação usa a base
publicada.

## Percurso no navegador

A skill de verificação foi aplicada ao percurso formulário → Server Action →
base descartável → resposta e valores visíveis. O servidor de desenvolvimento
ficou na porta 3212, sem `.env`, com URLs PostgreSQL fictícios de loopback e fetch
externo bloqueado. A sessão assinada usa uma pessoa sintética; os formulários,
ações, esquema e RLS são os reais. Os controlos para preencher/libertar quota
existem só no ensaio ignorado, não no código da app.

Em inglês, ambos os formulários apresentaram a recusa e o tempo de espera,
conservando contas, moedas, datas, descrição e valores. Os saldos continuaram em
1000 EUR e 200 USD, sem movimentos. Depois de libertar apenas os contadores do
ensaio, repetir a transferência de 10 EUR para 11 USD e o juro de 5 EUR resultou
em 995 EUR e 211 USD: três movimentos, uma transferência e um pagamento de juros.
Ambos os formulários confirmaram a gravação e bloquearam o reenvio até iniciar
uma nova operação.

Em português e a 390 px, a recusa conservou os valores 7 EUR/8 USD e 3 EUR de
juros, bem como os restantes campos. Os dados anteriormente guardados mantiveram-se.
A mensagem ficou legível e não houve overflow horizontal (375 px de conteúdo
para 375 px úteis). No desktop, ambos mediram 1265 px. A consola do navegador não
registou erros; os pedidos das ações terminaram com HTTP 200 e resultado de
limite ou sucesso conforme o contrato RPC. Não se trata de um endpoint HTTP 429.

## Alcance

Esta alteração cobre o registo de transferências e juros por essas quatro ações.
Não certifica quotas de toda a aplicação, capacidade do alojamento ou o conjunto
de formulários num aparelho real. Não altera `android-shell/` nem `mobile/`.
Não houve push, publicação, ligação à base real, migração persistente ou alteração
na Vercel. Ficheiros de outras sessões permanecem fora do lote.
