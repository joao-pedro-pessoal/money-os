# Verificação local C1–C7

Procedimento: [CODEX_PROXIMOS_PASSOS.md](CODEX_PROXIMOS_PASSOS.md).
O estado das tarefas é mantido apenas em [TAREFAS.md](../TAREFAS.md).
Sem push, publicação, acesso à Vercel, migrações na produção, ligação à base
real, palavras-passe reais ou tradução automática online nesta passagem.

## C1 — Formatação da língua

`fmt`, números e valores editáveis recebem a língua explicitamente. Inglês é
o padrão; a moeda pertence ao montante e não é convertida pela formatação.
Componentes usam o contexto de língua; componentes do servidor e PDF usam a
língua do pedido. Eixos compactos mostram `4K` em inglês e `4 mil` em português.
Os campos de edição usam um separador decimal, sem agrupamento, dígitos aceites
pelo validador e sem controlos bidirecionais. As 15 línguas são cobertas para
não estragar a edição completa; en e pt são os formatos de apresentação revistos.
Não foram modificados formatos numéricos de CSV, cálculos ou valores guardados.

Validação: **3406 testes em 221 ficheiros**, TypeScript, lint dos ficheiros
alterados, build `APP_EDITION=money` e diff aprovados. O processo de validação
sobrepõe configurações com valores sintéticos e URL de base exclusivamente
loopback antes de o Next poder ler `.env`; pedidos HTTP externos bloqueados.

**15 verificações no navegador**, computador EN 1440×950 e telemóvel PT
390×844, com PostgreSQL temporário PGlite, migrações reais e RLS. Painel,
Contas, Movimentos, relatório, campo do painel rápido sem milhares, eixos e
geração de PDF confirmados. Sem erros de execução. Texto extraído dos dois
PDFs locais com pypdf confirma `€4,000.50` e `4000,50 €`. Ensaios apenas com
contas e registos fictícios. Os scripts de ensaio não contactam fornecedores.

Evidência local ignorada: `.local-checkpoints/qr-e2e/c1-c7/C1/`
(resultado, servidor, capturas, PDFs e texto extraído) e `c1-ui.mjs`.
