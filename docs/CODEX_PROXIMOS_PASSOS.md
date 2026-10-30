# Próximos passos para o Codex — 30/10/2026

Plano pedido pelo utilizador depois de instalar a APK 0.9.0 e usar a versão
publicada. Cada tarefa tem o porquê, onde mexer e quando está concluída. O estado
fica nas linhas C1–C7 de [TAREFAS.md](../TAREFAS.md) (secção «Plano para o
Codex»); este documento é o procedimento.

## Onde está o produto

- **Publicado:** `aed9f12` em `main` → <https://money-os-brown.vercel.app>,
  compilado com `APP_EDITION=money` (sem investimentos). Sem migrações pendentes
  (última: 0071). Interface em **inglês por defeito**; o utilizador quer o
  lançamento em inglês — trata o inglês como a língua principal e o português
  como a segunda revista.
- **Telemóvel:** APK `store` 0.9.0 (código 11) instalada; abre o site publicado,
  não precisa de nova APK para mudanças no site.
- **Último trabalho (F25):** barra Simple/Complex passou para Definições → Geral;
  tocar numa conta abre `AccountQuick` (registar despesa/receita nessa conta,
  acertar saldo com `submitAccountBalance`); gráficos rápidos (`DonutChart compact`,
  `ProgressBars`) no painel e no topo de Contas, Subscrições, Orçamentos e
  Objetivos.

## Regras

- Trabalhar só em `C:\Users\joao2\Projects\money-os-f17`, ramo `f19-play-store`.
  Não trabalhar ao mesmo tempo que o Claude nesta pasta.
- **Não** fazer push, publicar, alterar a Vercel, correr `db:migrate`, ligar à
  base de produção, nem usar palavras-passe reais. Nenhuma tarefa abaixo precisa
  de migração; se uma solução parecer precisar, parar e escrever em TAREFAS.md.
- Sem tradução automática online. Português de Portugal, a tratar por «tu».
  Os 15 catálogos `src/lib/i18n/full/*.json` têm de ter as mesmas chaves e
  variáveis (`fullCatalogs.test.ts`); Simple e Complex ficam em inglês.
- Uma tarefa por commit (mensagem com o ID), testes antes de cada commit, linha
  da tarefa atualizada em TAREFAS.md.
- Ler AGENTS.md, CLAUDE.md e TAREFAS.md antes de começar.

## C1 — Números e gráficos no formato da língua escolhida

**Porquê.** Com a app em inglês os valores aparecem como `12 298,77 €` e os eixos
dos gráficos como `4 mil`: o formato está fixo em português.

**Onde.** `fmt` em `src/lib/format.ts` usa `"pt-PT"` para todas as línguas; há
mais ~29 `"pt-PT"` fixos fora de `src/lib/i18n` (eixos compactos em
`NetWorthChart.tsx`, `SpendingAnalysis.tsx`, `IndependencePlan.tsx`,
`ProjectionScenario.tsx`, e outros — procurar com `grep -rn '"pt-PT"' src`).

**O que fazer.** Formatar com o locale da língua escolhida (`localeOf(language)`:
no servidor `currentLanguage()`, no cliente `useLanguage()`), mantendo a moeda
da conta. Inglês → `€12,298.77` e `4K`; português continua `12 298,77 €`.
Os campos preenchidos para editar (ex.: saldo em `AccountQuick`) mostram o
separador decimal da língua **sem** separador de milhares — `manualAmount` e
`manualBalance` aceitam vírgula ou ponto, mas recusam `12,298.77`. CSV continua
legível por máquina (não mudar o formato numérico das exportações).

**Concluído quando** os testes de formatação cobrem en e pt, e o painel, Contas,
Movimentos (gráfico por mês), relatórios no ecrã e PDF mostram o formato da
língua em ambas.

## C2 — Edição completa só na conta do dono

**Porquê.** Ao publicar `APP_EDITION=money` o utilizador deixou de ver os seus
investimentos no telemóvel (os dados continuam na base). Quer a versão completa
na sua conta e a versão só dinheiro para os outros, no mesmo site.

**Regra proposta.** A edição completa vale para o utilizador com id
`OWNER_USER_ID` (`"owner"`, `src/db/schema.ts`) — a conta que reclamou os dados
originais, que é a do utilizador. Sem variável nova nem migração. A decisão é só
do servidor, a partir da sessão; nenhuma ação, cookie ou parâmetro a muda. A
cópia de casa (`APP_EDITION` vazio/`full`) fica igual.

**Onde.** Hoje `INVESTMENTS_ENABLED` é uma constante de compilação
(`src/lib/release/edition.ts`) usada em ~32 ficheiros: `proxy.ts` (`availablePath`
devolve 404), `requireInvestments()` nas 42 ações, menus e abas calculados ao
carregar o módulo (`ANALYTICS_TABS`, `INVESTMENT_TABS`, grupos em
`src/lib/navigation.ts`), `loadReport` (força `money`), `/api/widget`, alertas,
importação, dashboard (`MoneyOverview` vs. painel completo).

**O que fazer.**
1. `investmentsFor(userId)` no servidor: `true` se a compilação é `full` **ou** o
   utilizador é o dono. `requireInvestments()` passa a assíncrona e lê a sessão.
2. O layout `(app)` passa a edição a um contexto do cliente só para mostrar ou
   esconder; menus e abas passam a funções da edição em vez de constantes.
3. O `proxy.ts` decide por sessão (já lê `readSession`); sem sessão continua a
   mandar para a entrada, outro utilizador recebe 404 nas páginas adiadas.
4. Relatórios, PDF, widget e alertas seguem a mesma decisão.

**Concluído quando** testes provam, numa compilação `money`: o dono vê e usa
investimentos (páginas, ações, relatórios, widget); outra conta recebe 404 e
ações recusadas antes da base; sem sessão vai para a entrada. Compilações
`money` e `full` aprovadas. Nota: a APK `store` desliga os widgets de
investimentos no manifesto — o dono vê-os só com a APK `home` (registar, não mudar).

## C3 — Primeira entrada numa conta nova

**Porquê.** Uma conta nova abre um painel vazio; testadores e quem revê a app na
Google precisam de saber por onde começar.

**O que fazer.** Em `MoneyOverview`, enquanto faltar algum passo, um cartão
«Get started» com três passos que se marcam sozinhos a partir dos dados:
(1) criar a primeira conta com o saldo de hoje, (2) registar um movimento
(abre o registo rápido com o evento `money-os:quick-entry`), (3) criar um
orçamento ou um objetivo. Desaparece quando os três estão feitos; pode ser
fechado. Textos curtos em en e pt (e as chaves nos 15 catálogos).

**Concluído quando** um teste/verificação no navegador mostra o cartão numa
conta vazia, cada passo marcado depois de feito e o cartão ausente numa conta
com dados.

## C4 — Só inglês e português na edição de lançamento

**Porquê.** Só en e pt foram revistos. A 30/10 apareceram erros de tradução
automática noutras línguas (ex.: «Interest» como curiosidade em de, it, nl, pl,
ru, hi, zh-CN, ja — corrigido só nessas chaves).

**O que fazer.** Na edição `money`, o seletor de língua oferece só English e
Português; um cookie com outra língua cai para inglês. A cópia completa mantém
as 15. Não apagar catálogos. Atualizar a política de privacidade/termos só se
mencionarem as línguas.

**Concluído quando** testes cobrem o seletor nas duas edições e o fallback.

## C5 — Textos que ficam na língua errada

**O que fazer.**
- Descrições criadas pelo sistema ao acertar saldos ficam gravadas em inglês
  (`"Expense (reconciliation)"`, `"Interest (reconciliation)"`, `"Deposit
  (reconciliation)"` …, `src/actions/accounts.ts`). Traduzir **na apresentação**
  quando a descrição é exatamente uma destas (padrão do commit `40beef7`), sem
  reescrever dados.
- `TransactionList.tsx` ~linha 201: frase «Amounts recorded in another currency…»
  sem `uiText`.
- Subscrições: `` ` · ${totals.inactiveCount} cancelled` `` sem tradução nem plural.
- Correr a verificação de páginas sobre uma compilação `money`
  (`.local-checkpoints/qr-e2e/sweep.ts`, ou `money-launch.mjs`) em **en e pt**:
  em inglês procurar português, em português procurar inglês. Corrigir o que
  aparecer nas páginas da edição money.

**Concluído quando** a verificação não encontra texto da outra língua nas
páginas da edição money (registar a contagem antes/depois).

## C6 — Acertar saldo na página da conta como no painel rápido

**Porquê.** `/accounts/[id]` ainda usa `<form action={updateAccountBalance}>`:
sem identificador de tentativa e, perante um erro (ex.: tipo que não corresponde
à direção, agora recusado no servidor), mostra a página de erro.

**O que fazer.** Usar `EditForm` + `submitAccountBalance` e a mesma escolha de
tipos por direção de `AccountQuick` (extrair essa lógica para um módulo
partilhado e testá-la). Manter `updateAccountBalance` só se ainda tiver outros
usos; senão remover com os testes.

**Concluído quando** erro e sucesso aparecem no próprio formulário, e uma
repetição após perda de resposta não regista a diferença duas vezes.

## C7 — Cópia de segurança de todo o serviço (preparar, não executar)

**Porquê.** Hoje só há exportação por pessoa (R04). A decisão de onde guardar é
do utilizador; o Codex prepara o resto.

**O que fazer.** Procedimento e script que façam a cópia da base inteira a partir
de `DATABASE_ADMIN_URL` (lido do ambiente, nunca impresso), com verificação de
integridade e restauro ensaiado **só** numa base local/temporária com dados
fictícios (migrações reais, RLS e duas contas). Documentar retenção sugerida e
como restaurar uma só pessoa. Não ligar à produção.

**Concluído quando** o ensaio local de cópia → restauro passa e o procedimento
está em `docs/` com os passos que o utilizador tem de fazer.

## Bloqueado (não começar)

- **Recuperação de conta por email:** espera a escolha de domínio/serviço de
  envio pelo utilizador (R01).

## Do utilizador (fora do Codex)

- Vercel: `REGISTRATION_MODE=invite`, `REGISTRATION_INVITE_CODE`,
  `MAX_ACCOUNTS`, `OPERATOR_NAME`, `CONTACT_EMAIL`.
- Conta de programador Google Play (verificação demora dias), chave de envio
  com `CRIAR_APP_PLAY_STORE.cmd`, 12 testadores durante 14 dias.
- Testar no telemóvel: widgets de dinheiro, notificações, painel da conta.

## Verificação antes de cada commit

```
npx tsc --noEmit -p .
npx vitest run
npx eslint <ficheiros alterados>
$env:APP_EDITION="money"; npx next build; Remove-Item Env:APP_EDITION
```

E a verificação de páginas (C5) quando a tarefa muda ecrãs. Ao acabar: resumo em
TAREFAS.md e aviso ao utilizador de que está pronto para revisão e publicação
(publica o Claude, com autorização).
