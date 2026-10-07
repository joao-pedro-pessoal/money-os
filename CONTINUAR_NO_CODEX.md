# Continuar o Money OS no Codex local

Atualizado a **7 de outubro de 2026**. Substitui a versão de 5 de outubro, que
pedia a correção de B01–B09 — já feita e publicada.

Ler primeiro, por esta ordem: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) (as
regras do código — tudo o que lá está já correu mal pelo menos uma vez) e
[TAREFAS.md](TAREFAS.md) (a única lista de tarefas). O Codex não recebe a conversa
com o Claude; o que precisa está aqui e nesses três ficheiros.

Comunicar com o utilizador em **português simples**: não é programador, usa
Windows e o `cmd`. Dar comandos completos, com caminhos absolutos. Distinguir o
que está feito, o que é proposta e o que depende dele.

---

## 1. Onde trabalhar — importante

| Pasta | O que é | Pode mexer? |
| --- | --- | --- |
| `C:\Users\joao2\Projects\money-os-f17` | **Pasta de trabalho.** Branch `f19-play-store`, igual ao `main` publicado (`04c6e78`). | **Sim. Trabalhar só aqui.** |
| `C:\Users\joao2\Projects\money-os` | Pasta principal, branch `main` local **parado em `adb5a72`** (antes da publicação de 07/10). Tem **cerca de 52 ficheiros alterados por publicar de outra sessão** (modo privacidade: componente `Private`, `src/lib/privacy.ts`). É também a pasta de onde corre o site de casa. | **Não.** Não fazer commit, não apagar, não mudar de branch nem fazer `git pull` (as duas pastas partilham o repositório; mexer lá mexe no trabalho da outra sessão), não correr `next dev` lá. |

**Não fazer push nem juntar ao `main` sem o utilizador pedir, de cada vez** — o
repositório é público e o `main` publica o site na Vercel. Commits locais no
branch estão bem.

A pasta de trabalho tem uma **cópia real** de `node_modules` (copiada com
`robocopy /E /XJ`), não uma ligação. O `npm ci` falha nesta máquina: a
configuração do npm recusa pacotes de endereços diretos (o `xlsx` vem de
`cdn.sheetjs.com`). Não alterar essa configuração; para instalar um pacote novo do
registo oficial, `npm install <pacote>` funciona porque o `xlsx` já lá está.

Tem também uma cópia do `.env` (está no `.gitignore`). **Nunca o ler para a saída,
nunca o pôr num commit, nunca copiar valores para documentação ou mensagens.**

## 2. O que existe hoje

- **Site publicado:** https://money-os-brown.vercel.app — várias pessoas, conta
  por email e palavra-passe (a palavra-passe nunca sai do browser; vai uma chave
  derivada), código de recuperação, até `MAX_ACCOUNTS` contas. Funções na Vercel
  em Frankfurt (`vercel.json`), ao lado da base de dados.
- **Separação entre pessoas:** no próprio Postgres (Neon), por *row-level
  security*: cada tabela tem `user_id` e uma política. A app liga-se como
  `moneyos_app`, que não a consegue contornar. Ver "Every person's rows are
  Postgres's to keep apart" no `CLAUDE.md`.
- **Chaves das corretoras:** cifradas na base de dados; só a `ENCRYPTION_KEY` do
  `.env` do PC as abre. **A Vercel não tem essa chave, de propósito** — no site
  publicado as ligações com chave estão desligadas para toda a gente. A Trading
  212 e a MEXC do dono só sincronizam enquanto o `SITE_PARA_TELEMOVEL.cmd` está
  aberto no PC. A Hyperliquid não usa chave. A IBKR precisa do Client Portal Gateway.
- **Publicado a 07/10/2026** (histórico H28–H34 no `TAREFAS.md`):
  - relatórios à medida (F17): período livre, dinheiro e/ou investimentos, PDF com
    gráficos (`pdf-lib`) e CSV;
  - botão **Install app**, **Settings → On your phone**, atalhos no ícone;
  - **português**, fase 1 (F18) e as correções B01–B09 (tradução por regiões,
    instalação em http e Firefox, atalhos que passam pelo login, etc.);
  - **Play Store, fase 1** (F19): versão `store` da app Android
    (`android-shell/app/build.gradle`), páginas públicas `/privacy`, `/terms`,
    `/delete-account` (texto em `src/lib/legal/documents.ts`),
    `CRIAR_APP_PLAY_STORE.cmd`, guia em `docs/PLAY_STORE.md`;
  - **um só Realized P&L** (`realisedTradeTotal` em `src/lib/trading/realised.ts`)
    em Investments, Analysis e "Where the gains came from", e classificação de
    trades partilhada pelos fills do mesmo trade
    (`src/lib/trading/sharedClassification.ts`), usada pelas playlists.

## 3. Trabalho pedido agora: procurar erros

O utilizador quer uma **revisão à procura de erros** no código publicado. Onde
procurar primeiro, por ser o mais recente e o menos visto com dados reais:

1. **Números de investimentos:** `src/lib/trading/realised.ts`
   (`realisedTradeTotal`, `deriveRealisedPnl`), `src/lib/trading/sharedClassification.ts`,
   `src/actions/investmentActivity.ts` (`loadTradeRows`, `getRealisedTrades`),
   `src/actions/dividends.ts` (`getRealisedTotal`, `getGainAttribution`),
   `src/actions/playlists.ts`, `src/lib/portfolio/classifiedPerformance.ts`.
   O erro recorrente é o de "A second definition is worse than a wrong one" e
   "Double counting is the recurring bug" no `CLAUDE.md`: duas páginas a responder
   à mesma pergunta de maneiras diferentes, ou a mesma coisa somada duas vezes.
2. **Relatórios (F17):** `src/lib/reports/*`, `src/actions/reports.ts`,
   `src/app/api/report/pdf/route.ts` — períodos nos limites, moedas sem taxa,
   meses parciais, PDF com textos que as fontes padrão não desenham.
3. **Língua (F18):** `src/lib/i18n/*`, `src/components/LanguageContext.tsx`,
   `src/app/layout.tsx` — texto que fica em inglês com Português escolhido, ou
   nomes do utilizador traduzidos.
4. **Contas e páginas públicas:** `src/actions/auth.ts`, `src/proxy.ts`,
   `src/lib/accounts/publicPaths.ts`, `src/lib/accounts/returnPath.ts` — tudo o que
   abre sem sessão ou redireciona.
5. **App Android:** `android-shell/` — versões `home` e `store`, widgets, alertas.

Regras para o que se encontrar:

- **Registar** cada erro na secção 2 do `TAREFAS.md` como **B10, B11…**, com
  ficheiro e linha, o que falha (com um exemplo concreto) e a correção proposta.
- **Corrigir** os que forem claros, **com um teste** para cada um que seja lógica,
  em commits locais no branch. Os que dependem de uma decisão do utilizador ficam
  só registados.
- **Diagnosticar antes de adivinhar** ("Diagnose before you guess" no `CLAUDE.md`):
  quando um número parece errado, confirmar com os dados, só a ler — ver secção 4.
- No fim, dizer ao utilizador o que foi encontrado, o que foi corrigido e o que
  precisa dele, e **perguntar antes de publicar**.

Já conhecidos — **não voltar a reportar**:

- Os trades de HYPE (7,01 €) não contam na playlist Sato, embora a posição HYPE
  esteja lá: por regra, uma posição não reclama trades. Pergunta feita ao
  utilizador, sem resposta ainda.
- `getPortfolioItems` é lido mais de uma vez por pedido (usado em 13 sítios,
  alguns nas páginas por publicar da outra sessão).
- Páginas ainda em inglês com Português escolhido (resto do F18) e textos da app
  Android a misturar inglês e português.
- `OPERATOR_NAME`, `CONTACT_EMAIL` e `MAX_ACCOUNTS=40` ainda por pôr na Vercel
  (passo do utilizador); até lá as páginas legais remetem para a Play Store.
- B01 ainda precisa de confirmação num telemóvel real.

## 4. Como verificar

Na pasta de trabalho:

```
cd /d C:\Users\joao2\Projects\money-os-f17
npx tsc --noEmit
npx vitest run
npx eslint src
npm run build
```

No commit `04c6e78`: tipos sem erros, **2836 testes**, lint com 3 avisos antigos
(`src/lib/connectors/bybit/__tests__/connector.test.ts`) e 0 erros, build a passar.
Depois de correr o servidor de desenvolvimento, o Next pode reescrever
`next-env.d.ts`: repor com `git checkout -- next-env.d.ts` antes de fazer commit.

Para ver no browser: servidor de desenvolvimento **na pasta de trabalho, na porta
3001** (`npm run dev -- --port 3001`). Nunca na pasta principal: os tipos que o
Next gera em `.next/dev/types` ficaram uma vez a apontar para ficheiros deste
branch e partiram o site de casa.

**A base de dados é a real (Neon, a de produção).**

- **Para testar com sessão:** criar uma conta de teste pela página de entrada em
  `localhost` (email e palavra-passe inventados), pôr dados de exemplo só nessa
  conta com um script que use `asUser(<id dela>)`, e **apagá-la no fim** (Definições
  → Apagar a minha conta, ou `db.delete(users)` dentro de `asUser`; confirmar que
  ficam 0 linhas). Limite de criação de contas: 5 por hora, 20 por dia.
- **Para diagnosticar um número da conta do dono:** um script em `.f17-tmp/`
  (ignorada pelo git) que corre as funções das páginas dentro de
  `asUser(OWNER_USER_ID, …)`, **só a ler**. Nunca escrever na conta `owner` nem ler
  dados de outras pessoas. Não pôr valores reais do dono em commits sem lhe
  perguntar: o repositório é público.

Se algum dia for preciso apagar a pasta de trabalho: primeiro listar e remover
com `cmd /c rmdir` qualquer ligação (*reparse point*) lá dentro, sobretudo em
`.next`. Um `git worktree remove --force` seguiu uma ligação e esvaziou o
`node_modules/pg` verdadeiro uma vez.

Os ficheiros desta pasta usam fim de linha CRLF (`core.autocrlf=true`); o git
normaliza no commit.

## 5. Ambiente Windows

- Android SDK: `C:\Users\joao2\AppData\Local\Android\Sdk`.
- JDK 17 para compilar Android:
  `C:\Users\joao2\AppData\Local\Programs\Eclipse Adoptium\jdk-17.0.20.101-hotspot`.
  O utilizador precisa do Java habitual para a faculdade: definir `JAVA_HOME`/`PATH`
  **só no processo** que compila, nunca globalmente.
- Compilar a app Android: `android-shell\gradlew.bat assembleHomeDebug` (a de casa) ou
  `assembleStoreDebug` (a da loja), com o JDK 17. A versão para a Play Store só se cria
  assinada, com `CRIAR_APP_PLAY_STORE.cmd` (`docs/PLAY_STORE.md`); a chave de envio fica em
  `%USERPROFILE%\MoneyOS-PlayStore` e **nunca** é criada nem usada pelo agente.
  `lintDebug` tem dois erros antigos conhecidos.
- O emulador `Pixel_10_Pro_XL` (API 37.1) tem PIN e não é desbloqueado pelo agente.
  Para testar a app, criar um emulador temporário com o mesmo system image
  (`avdmanager create avd`, `-no-window -wipe-data`) e apagá-lo no fim.
- Não alterar firewall nem definições do Windows; pedir ao utilizador o que exigir
  a presença dele (iniciar sessão, desbloquear o telemóvel, aceitar termos).

## 6. Depois da revisão

Conforme o `TAREFAS.md`: os passos da Play Store do utilizador
(`docs/PLAY_STORE.md`); o que falta de código antes da produção (limites por
endereço e anti-robô na criação de conta, registo de erros, cópias de segurança);
as restantes páginas em português (F18), depois de publicado o trabalho de
privacidade da outra sessão; e a fase 2 da Play Store (F20), que ainda tem
decisões do utilizador por tomar.
