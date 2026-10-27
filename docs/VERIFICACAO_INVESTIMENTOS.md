# Verificação dos investimentos — 27/10/2026

Esta passagem verifica B50–B55. O estado e as prioridades permanecem exclusivamente
em [TAREFAS.md](../TAREFAS.md).

## Problema reproduzido e correção

Depois de criar uma posição, o formulário de edição tinha dois campos chamados
`avgEntryPrice`. O primeiro, obrigatório e vazio, impedia que o browser enviasse
o formulário. Havia também classificações duplicadas: a primeira versão não
recebia os valores existentes e prevalecia na leitura de FormData.

A edição usa agora um único preço médio preenchido e uma única classificação.
O componente partilhado recebe risco, prazo, retorno e liquidez guardados.
Os preços fixos de dinheiro/stablecoins continuam presentes na criação e deixam
de ser duplicados na edição; o prazo existente é preservado também nesses tipos.
O preço atual continua a ser atualizado no seu formulário próprio.

## Verificação automática

- 3168 testes aprovados em 214 ficheiros.
- Cinco testes novos de renderização verificam o formulário completo para ações,
  staking, dinheiro e stablecoins e os preços 1:1 na criação de stablecoins.
- TypeScript e compilação de produção aprovados.
- Lint dos ficheiros de cada correção sem erros nem avisos.
- Revisão React: sem novos efeitos ou estado partilhado; dados pessoais continuam
  lidos no servidor; nomes dos campos únicos e valores iniciais preservados.

## Segurança das operações de posições

A bateria adicional acrescentou 28 testes com PostgreSQL temporário e RLS.
Antes da correção falharam 20: as escritas podiam sobreviver parcialmente à
falha da auditoria, pedidos simultâneos perdiam alterações e entradas inválidas
eram aceites. Os 28 passaram após a correção.

Atualização de preço, reforço, venda e recompensa passam a bloquear a posição e
a gravar alteração, histórico aplicável e auditoria na mesma transação. Os
cálculos continuam a usar `reinforcePosition` e `reducePosition`; não foi criada
uma segunda definição do preço médio ou do ganho realizado. Os saldos de caixa
continuam separados destas operações de registo de posições.

Os testes cobrem rollback completo, isolamento por pessoa, entradas inválidas,
vírgula decimal, reforços/vendas/recompensas simultâneos, venda acima da posição
e fecho integral a preço zero explícito. O servidor recusa quantidades nulas ou
negativas, preços ausentes/negativos e recompensas não positivas; verifica as
casas decimais antes de a base as arredondar. Uma venda acima da quantidade
disponível é recusada depois de ler a posição bloqueada.

O teste de browser confirma preço médio, quantidade, ganho realizado e snapshots
diretamente na base temporária depois de submeter os formulários reais. A posição
fica com quatro snapshots: criação, reforço, venda e atualização de preço.

## Percurso completo no navegador

Compilação de produção local em `127.0.0.1:3017`, ligada exclusivamente a PGlite
em memória em `127.0.0.1:54337`, com migrações reais, duas contas fictícias e um
papel sem BYPASSRLS. O browser só pode contactar o servidor local; pedidos
externos do servidor usam um proxy inativo. Não há conta, palavra-passe ou chave
real nos dados do ensaio. O servidor e a base temporária foram encerrados no fim.

Passaram 22 verificações:

| Percurso | Computador EN 1440×950 | Telemóvel PT 390×844 |
| --- | --- | --- |
| Criar posição e confirmar um snapshot inicial na base | Aprovado | Aprovado |
| Editar e confirmar nome, classificação e preços persistidos | Aprovado | Aprovado |
| Afetar 25,5%, recarregar e alterar para 40%, mantendo uma linha | Aprovado | Aprovado |
| Recusar vazio, negativo e percentagem superior a 100 no formulário | Aprovado | Aprovado |
| Remover com zero explícito, conservando o saldo da conta | Aprovado | Aprovado |
| Reforçar de 2 para 3 unidades, recalculando preço médio de 10 para 12 | Aprovado | Aprovado |
| Vender uma unidade a 15, restando 2 e lucro realizado de 3 | Aprovado | Aprovado |
| Atualizar preço para 14 e confirmar um novo snapshot | Aprovado | Aprovado |
| Registar recompensa de 0,25 sem alterar saldo da conta | Aprovado | Aprovado |
| Página sem transbordo horizontal | Aprovado | Aprovado |

As duas verificações adicionais confirmaram resposta 404 quando a segunda conta
tenta abrir a posição da primeira e ausência de erros de execução no navegador.
Os logs do servidor contêm apenas o arranque normal, sem erros nesta execução.
As capturas foram inspecionadas visualmente. O modo de telemóvel usa emulação de
viewport e toque no Chromium; não comprova WebView, widgets ou um Android real.

O guião e resultados locais estão na pasta ignorada pelo Git
`.local-checkpoints/qr-e2e/`: `investments-launch.mjs` e
`investments-launch/{result.json,server.log,desktop-en.png,phone-pt.png}`.

Para repetir com as dependências locais já existentes e depois de compilar:

```cmd
cd /d C:\Users\joao2\Projects\money-os-f17
node node_modules\tsx\dist\cli.mjs .local-checkpoints\qr-e2e\investments-launch.mjs .local-checkpoints\qr-e2e\investments-launch
```

O ensaio de browser complementa os testes de servidor: manipulação de IDs e
percentagens inválidas enviados diretamente é coberta pelos testes de ações com
RLS. PGlite usa uma ligação e não constitui prova de capacidade sob carga.

Não foram feitas migrações, publicação ou alterações à base de produção.
