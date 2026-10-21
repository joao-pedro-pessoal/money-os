# Instruções para o Codex — português completo (F18)

Escrito pelo Claude a 21/10/2026, depois de verificar a app toda. O estado e a
prioridade continuam no `TAREFAS.md` (linha F18); este documento é o
procedimento.

## Antes de começar

- Trabalhar **só** em `C:\Users\joao2\Projects\money-os-f17`, ramo `f19-play-store`.
- Ler `AGENTS.md`, `CLAUDE.md`, `TAREFAS.md` e `CONTINUAR_NO_CODEX.md`.
- Não publicar, não fazer push, não correr `db:migrate`, não mexer em
  `C:\Users\joao2\Projects\money-os`.
- **Não usar tradução automática por serviços online.** O script
  `scripts/translate-language-catalogs.py` usava um endpoint não oficial do
  Google Translate e ficou fora do repositório de propósito: não o usar.
- Português **europeu**, a tratar o utilizador por **"tu"** (nunca "você").

## O que a verificação encontrou

A verificação abriu as 44 páginas, em português e inglês, no telemóvel e no
computador, com dados inventados: **nenhum erro** de servidor, de página ou de
consola, e nenhuma página sai do ecrã do telemóvel. O problema é o português:
37 sítios ainda em inglês e cerca de 100 textos sem tradução nenhuma.
Resultados completos em
`.local-checkpoints/qr-e2e/sweep-out/english-in-pt-21-10.json`.

### Causa principal: textos que chegam como propriedades e nunca passam por `uiText`

Corrigir **no componente que desenha o texto** (é aí que deve traduzir), não em
cada chamada — assim um texto novo não volta a escapar:

| Onde é desenhado | De onde vem | Quantos |
| --- | --- | --- |
| `Entry` em `src/app/(app)/manual/page.tsx` (propriedade `where`) | as 23 secções do manual | 23, nenhum no catálogo |
| `src/components/ConnectionForm.tsx:90` (`steps`) | `src/lib/connectors/constants.ts` | 60, 54 sem tradução |
| subtítulos dos passos em `src/app/(app)/import/page.tsx` (`subtitle=`) | a própria página | 3 |
| cartões de `src/app/(app)/analytics/page.tsx:122,128,135` (`note=`) | a própria página | 3 |
| `src/app/(app)/investments/page.tsx:203` (`note=`) | a própria página | 1 |
| `src/components/BalanceMeaningField.tsx:52` (`help`) | `src/lib/accounting/balanceScope.ts` | 3, já no catálogo |
| `src/app/(app)/expected/page.tsx:142` | `ARRIVALS` em `src/lib/accounting/expected.ts` | já no catálogo |
| `src/app/(app)/subscriptions/page.tsx:110` | `CADENCES` em `src/lib/accounting/subscriptions.ts` | já no catálogo |
| `src/components/AccountsCard.tsx:104,194` | `TYPE_LABELS` (Bank, Broker, Cash…) | já no catálogo |
| `src/components/InvestmentReport.tsx:171`, `src/components/PortfolioReturns.tsx:48` (motivos retidos) | `src/lib/reports/investments.ts:230`, `src/actions/investments.ts:1165` | 2 |
| `BenchmarkCard` | `src/lib/portfolio/benchmark.ts:117` | 1 |
| notas com `realisedNote(...)` (`investments/analysis/page.tsx:340`, `investments/page.tsx:88`) | `src/lib/trading/realised.ts:248` | 2 |
| grupos "Crypto", "Stocks" em `src/components/PortfolioTable.tsx` | etiquetas de `src/lib/portfolio/tags.ts` | já no catálogo |
| botões de profundidade em `src/components/SpendingAnalysis.tsx:278` ("account"…) | a própria página | já no catálogo |

### Frases montadas aos bocados (a pior: a página de Relatórios)

O ecrã mostra "Este month até agora", "contra month antes", "média de 3 mais
cedo months", "Monthly report · October 2026". O nome do período ("month") e os
meses entram em inglês dentro de frases traduzidas. Regras:

- **Uma frase inteira por chave**, com variáveis só para números e nomes:
  `"This month so far — …"`, `"This week so far — …"` em vez de
  `"This {0} so far"` com `{0}` = "month".
- **Singular e plural em chaves separadas** (`"{0} closing fill, as the venues
  state it"` / `"{0} closing fills, as the venues state it"`).
- Ficheiros: `src/app/(app)/analytics/report/page.tsx` (incluindo a linha 92),
  `src/components/InvestmentReport.tsx:85,123`, `src/lib/reports/monthly.ts`,
  `src/lib/reports/investments.ts`, e o PDF em `src/lib/reports/pdf.ts:266,290`
  (já recebe `translate`).
- `src/app/(app)/statistics/page.tsx:19` e `:156` montam frases com
  concatenação — passar a `uiText` com variáveis.

### Datas e dinheiro

- Os meses aparecem em inglês ("17 Oct 2026", "October 2026", "September
  2026"). Procurar `toLocaleDateString(` e `"en-GB"` e usar
  `localeOf(língua)` de `src/lib/i18n/languages.ts`, como já faz
  `src/app/api/widget/route.ts`.
- `explainFree` em `src/lib/accounting/unallocated.ts:176` escreve
  "3100.00 EUR is assigned to buckets": formatar o valor como dinheiro (como
  `fmt` em `src/lib/format.ts`) e traduzir as quatro frases com variáveis.

### Traduções erradas que ainda existem

Procurar em `src/lib/i18n/full/pt.json`: "equilíbrio" (o ecrã diz "O que esse
equilíbrio significa?" ao criar uma conta), "Corrigido" (é "Fixo" — fixo e
variável), e rever as entradas curtas (até quatro palavras), onde a tradução
automática errou mais vezes ("Lista de reprodução", "Tipo de recurso",
"vagas", "Renda recorde" já foram corrigidas).

### Vocabulário a usar

Saldo · Livre · Movimentos · Objetivos (buckets) · Listas (playlists) ·
Carteira · Património líquido · Registo rápido · Fixo / Variável ·
Definições · Ligação · Ficheiro · Guardar · Eliminar · Ganho não realizado ·
Descarregar · Entrar. Manter em inglês: **Simple**, **Complex**, **Money OS**.

## Catálogos

- Cada chave nova tem de existir nos **15** ficheiros `src/lib/i18n/full/*.json`
  (o teste `fullCatalogs.test.ts` exige-o, com as mesmas variáveis).
- Português: tradução cuidada. As outras 13 línguas: traduzir só se tiveres
  confiança; senão, copiar o texto inglês e acrescentar ao `TAREFAS.md` (F18)
  quantas chaves ficaram por traduzir em cada língua.
- Mensagens do servidor (recusas de entrada, etc.) vivem noutro sítio:
  `src/lib/i18n/source.ts` (português) e `src/lib/i18n/catalogs/*.json`
  (chave `server.<frase>`).

## Como confirmar

1. `npx tsc --noEmit -p .`, `npx vitest run`, `npx eslint src`, `npm run build`.
2. Verificação no browser, com dados inventados e sem tocar na base publicada
   (precisa do `npm run build` acabado):

   ```cmd
   cd /d C:\Users\joao2\Projects\money-os-f17\.local-checkpoints\qr-e2e
   node ..\..\node_modules\tsx\dist\cli.mjs sweep.ts
   ```

   Abre as 44 páginas em português e inglês, telemóvel e computador (cerca de
   10 minutos). Resultado em `sweep-out/sweep.json` e uma fotografia por página
   em `sweep-out/sweep/`. Objetivo: `status` 200 e `problems` vazio em todas,
   `overflow` 0 no telemóvel, e em `english` só "Simple", "Complex" e dados
   inventados (nomes de bancos, comerciantes). O detetor só apanha frases com
   duas ou mais palavras inglesas comuns ou que já existem no catálogo: ver
   também as fotografias de `phone-pt_*.jpg`.

## Ao acabar

- Um commit por grupo de correções (Relatórios, manual, ligações, datas…).
- Atualizar a linha F18 do `TAREFAS.md` com o que ficou feito e o que falta.

## Opcional, se sobrar tempo (da revisão de código de 21/10)

- `src/app/layout.tsx:129` envia o catálogo inteiro (250–450 KB) em cada página,
  até o inglês, que traduz inglês para inglês.
- `src/lib/i18n/text.ts:28` traduz frases já com os valores lá dentro,
  comparando-as com centenas de padrões; traduzir o modelo antes de pôr os
  valores evita o trabalho e o risco de reescrever um nome do utilizador.
- `src/components/MultiSelect.tsx:54` monta "Clear " + nome; usar uma chave
  `"Clear {0}"`.
