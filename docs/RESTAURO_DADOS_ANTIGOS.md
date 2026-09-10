# Restauro dos dados antigos — 9 de setembro de 2026

Foi feita uma cópia aditiva da base Neon indicada por
`C:\Users\joao2\Projects\money-os\.env` para a base local isolada da
pré-visualização (`.local-checkpoints/postgres-data`). A base antiga não foi
alterada e as três contas DEMO existentes foram preservadas.

Foram restaurados:

- 11 contas, 6 movimentos, 5 pagamentos de juros e 221 snapshots;
- 24 categorias, 1 bucket com 2 alocações e 1 budget;
- 11 posições, 55 snapshots de posições e 8 playlists;
- 2 registos de importação e 1 entrada de dinheiro previsto.

Não foram copiados `account_connections`, chaves, segredos ou posições que
dependessem de ligações a corretoras. As categorias foram associadas por nome
para que os movimentos e o budget continuassem a apontar para as categorias
locais já existentes.

## Auditoria

A auditoria confirmou os invariantes de net worth, portfolio, dividendos,
histórico e free cash. Manteve quatro avisos/problemas presentes nos dados:

- uma transação de 100 EUR numa conta USD;
- três linhas em USD sem taxa, deixadas fora dos totais convertidos;
- uma diferença de 8,92 EUR entre posições listadas e a parte classificada no
  net worth;
- saldos em contas arquivadas que não entram nos totais.

Esses valores não foram corrigidos automaticamente. A correção precisa da tua
decisão sobre moeda, conta e classificação para não reescrever o histórico.

Os testes de código continuam aprovados: 2 215 testes em 120 ficheiros.
