# Verificação dos investimentos — 29/10/2026

Esta passagem verifica B50–B60. O estado e as prioridades permanecem exclusivamente
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

- 3219 testes aprovados em 214 ficheiros.
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

## Criação e edição de posições

A bateria B56–B58 acrescentou 24 casos. Os 22 iniciais falharam antes da correção:
entradas inválidas podiam ser guardadas, casas adicionais eram arredondadas,
preço atual vazio impedia criar e uma edição antiga substituía recompensas
recebidas depois de o formulário abrir. Dois casos adicionais confirmam a
resposta de erro/sucesso da ação e a exclusão de diagnósticos da base.

Criação e edição reutilizam validação de quantidades e preços. Quantidade zero
continua válida na edição de posições encerradas; não numa posição nova.
A moeda é normalizada e validada; a direção só aceita long/short. O rendimento
anual opcional mantém sinal e até quatro casas; vazio continua desconhecido.
Preços e quantidades aceitam vírgula decimal. Preço atual vazio usa o custo como
estimativa, explicado no formulário, sem afirmar uma avaliação atual:
`lastPriceUpdate` fica nulo, exceto ativos de preço fixo já tratados pela app.

A edição estática já não envia nem substitui `rewardsEarned`. Uma conta com 5
de recompensas que recebe mais 2 conserva 7 ao guardar um formulário antigo.

O formulário client mostra gravação pendente, sucesso e erros acessíveis com
roles de status/alert. Usa useActionState e impede o reset dos campos. Uma
validação recusada preserva nome, quantidade e select de risco; corrigir os
dados guarda normalmente. Abortar o POST antes de chegar ao servidor mostra
mensagem traduzida, mantém os campos e permite guardar após restabelecer rede.
A repetição de reforços/vendas/preços/recompensas é tratada separadamente em B59–B60, abaixo; a criação de posições não faz parte dessa proteção.

O endpoint de edição confirma sessão e apenas expõe mensagens de validação
conhecidas. Exceções de SQL/infraestrutura dão uma mensagem genérica, verificada
com um trigger fictício de falha. A primeira submissão inválida mantém a página
e não provoca erros de execução no browser.

Mensagens novas revistas em português e inglês. Os outros 13 idiomas têm
fallback inglês nestas novas chaves, com a mesma cobertura e variáveis.
Revisão React: sem efeitos novos, sem estado pessoal global, validação no
servidor e feedback sem expor diagnósticos internos.

## Repetir operações após perder a resposta — B59–B60

Os 23 primeiros casos novos reproduziram 22 falhas antes da correção. Quatro
casos adicionais verificam erro de validação recuperável, diagnóstico de SQL
excluído da resposta, sessão expirada e operação desconhecida. Todos os 27
passaram depois da correção.

Preço, reforço, venda e recompensa exigem um identificador aleatório por
tentativa. O servidor normaliza o identificador e os valores antes de comparar
o pedido. Um recibo em `audit_log`, com `entityType=holding_operation`, é gravado
na mesma transação da alteração, snapshot aplicável e auditoria descritiva.
O bloqueio da posição e a chave única do recibo fazem uma repetição confirmar a
operação original sem executar de novo. Uma falha da escrita desfaz também o
recibo, permitindo repetir a tentativa original após recuperar.

O mesmo identificador com outros valores, outra posição ou outra operação é
recusado. Um recibo de outra pessoa também é recusado, sem expor dados dessa
pessoa. O recibo sobrevive à eliminação da posição, mas não a recria. Estes
recibos têm função de integridade e não podem ser removidos como logs descartáveis.
Uma venda integral pode ser repetida mesmo depois de a quantidade chegar a zero;
repetir uma atualização de preço antiga não desfaz uma avaliação mais recente.

Os quatro formulários usam o mesmo componente com `useActionState`, mantêm
campos e identificador em caso de erro e desativam envio durante gravação e
depois do sucesso. «Registar outra operação» limpa os campos, cria uma tentativa
distinta e permite uma segunda operação intencional com valores iguais. Erros
previstos aparecem no formulário; exceções da infraestrutura recebem texto
genérico. A sessão é validada antes de qualquer uma das quatro operações.
As novas mensagens foram revistas em português e inglês, com fallback inglês
nos restantes 13 catálogos. A revisão React confirmou ausência de efeitos novos
ou estado pessoal partilhado, fronteira client limitada ao formulário e feedback
com `aria-busy`, `role=status` e `role=alert`.

No navegador, cada um dos quatro POSTs foi enviado realmente ao servidor local:
o ensaio esperou pelo commit na base temporária e só então abortou a resposta.
O formulário mostrou o erro traduzido e conservou os campos. Repetir confirmou
o sucesso, sem mudar a linha da posição, a quantidade de snapshots ou a auditoria
guardados antes da repetição. Uma segunda recompensa de 0,25, iniciada pelo botão
explícito, levou o total de 0,25 a 0,50.

O identificador permanece em memória na página aberta. Não se promete recuperar
automaticamente uma tentativa depois de recarregar, fechar a página ou reiniciar
o aparelho; não existe uma fila offline persistente para estas operações. Depois
de uma confirmação incerta, conferir a posição antes de iniciar um pedido novo.

## Percurso completo no navegador

Compilação de produção local em `127.0.0.1:3017`, ligada exclusivamente a PGlite
em memória em `127.0.0.1:54337`, com migrações reais, duas contas fictícias e um
papel sem BYPASSRLS. O browser só pode contactar o servidor local; pedidos
externos do servidor usam um proxy inativo. Não há conta, palavra-passe ou chave
real nos dados do ensaio. O servidor e a base temporária foram encerrados no fim.

Passaram 58 verificações:

| Percurso | Computador EN 1440×950 | Telemóvel PT 390×844 |
| --- | --- | --- |
| Criar posição e confirmar um snapshot inicial na base | Aprovado | Aprovado |
| Editar e confirmar nome, classificação e preços persistidos | Aprovado | Aprovado |
| Preço atual vazio usa o custo, sem data de avaliação inventada | Aprovado | Aprovado |
| Erro de validação no formulário preserva texto, número e classificação | Aprovado | Aprovado |
| Corrigir dados e guardar apresenta confirmação de sucesso | Aprovado | Aprovado |
| Interromper POST antes do servidor e repetir edição preserva os campos | Aprovado | Aprovado |
| Afetar 25,5%, recarregar e alterar para 40%, mantendo uma linha | Aprovado | Aprovado |
| Recusar vazio, negativo e percentagem superior a 100 no formulário | Aprovado | Aprovado |
| Remover com zero explícito, conservando o saldo da conta | Aprovado | Aprovado |
| Reforçar de 2 para 3 unidades, recalculando preço médio de 10 para 12 | Aprovado | Aprovado |
| Vender uma unidade a 15, restando 2 e lucro realizado de 3 | Aprovado | Aprovado |
| Atualizar preço para 14 e confirmar um novo snapshot | Aprovado | Aprovado |
| Registar recompensa de 0,25 sem alterar saldo da conta | Aprovado | Aprovado |
| Perder a resposta após gravar cada uma das quatro operações, conservando campos | Aprovado | Aprovado |
| Repetir cada operação confirma sucesso sem novas escritas | Aprovado | Aprovado |
| Iniciar explicitamente outra operação limpa e desbloqueia cada formulário | Aprovado | Aprovado |
| Venda excessiva recusada no formulário, com mensagem traduzida | Aprovado | Aprovado |
| Segunda recompensa intencional com dados iguais fica registada separadamente | Aprovado | Aprovado |
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
