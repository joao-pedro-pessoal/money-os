# Revisão dos dados restaurados

Este documento regista as decisões pendentes do passo 2. A auditoria é
executada na base local e não altera automaticamente o histórico.

## 1. Transação com moeda incompatível

Existe uma única linha:

- conta: **Interactive Brokers** (ativa, USD);
- data: 1 de setembro de 2026;
- tipo: income;
- valor: **100.00 EUR**;
- descrição: vazia.

Há duas correções possíveis e ambas mudam o significado do histórico:

- manter o valor como **100 EUR** e movê-lo para uma conta EUR adequada; ou
- manter a conta Interactive Brokers USD e alterar a moeda para **USD**.

Não é seguro escolher automaticamente. A alteração da moeda também exige
decidir se o saldo da conta deve ser corrigido ou se a linha representa uma
entrada histórica que já está refletida no saldo.

**Resolvido em 10 de setembro de 2026: a linha foi apagada pelo utilizador.**
A causa já não existe no código — `createTransaction` lê a conta e carimba a
moeda dela, e a auditoria falha se alguma transação discordar da sua conta.

Fica por confirmar uma consequência separada: o saldo guardado da Interactive
Brokers estava 100 acima do que o conector reporta, e esse desvio foi criado
por esta mesma linha. Apagar a transação só corrige o saldo se a eliminação
tiver revertido a soma feita na criação. Correr `npm run audit` responde a
isto; enquanto não for corrido, o desvio deve considerar-se em aberto.

## 2. Contas arquivadas com saldo

As quatro contas abaixo estão inativas e não têm movimentos, posições nem
ligações ativas:

| Conta | Moeda | Saldo |
| --- | --- | ---: |
| Interactive Brokers | EUR | 32.77 |
| T212 | EUR | 100.00 |
| Tr | EUR | 452.76 |
| TR | EUR | 1,000.00 |

Estão fora dos totais por estarem arquivadas. Podem ser contas antigas
duplicadas, saldos que queres manter como histórico, ou registos que devem ser
reativados. Não foram eliminadas.

## Estado após a consolidação

O utilizador pediu a remoção dos duplicados. Na base local foram removidos os
três registos DEMO, as contas duplicadas de Hyperliquid, MEXC, Trading 212 e
Trade Republic, e a conta arquivada Interactive Brokers em EUR. Os snapshots e
pagamentos de juros dos duplicados foram transferidos para a conta canónica
antes da remoção. A base antiga não foi alterada.

Ficaram sete contas únicas: Cash, Hyperliquid, Interactive Brokers, MEXC,
Rvoult, Trade Republic e Trading 212. O histórico restaurado permanece nas
contas canónicas. A auditoria atual não encontra invariantes quebradas; as
diferenças de classificação do portfólio e os custos desconhecidos continuam
visíveis como notas financeiras, não como duplicados de contas.

Foi guardado um backup local dos registos removidos em
`.local-checkpoints/pre-dedupe-local-data.json`, antes da consolidação.
