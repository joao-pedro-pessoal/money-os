# Continuar o Money OS no Codex local

Atualizado a **5 de outubro de 2026**. Substitui a versão de 17 de setembro, que
descrevia um site de uma só pessoa e um cofre que já não existem.

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
| `C:\Users\joao2\Projects\money-os-f17` | **Pasta de trabalho.** Branch `f17-relatorios`. | **Sim. Trabalhar só aqui.** |
| `C:\Users\joao2\Projects\money-os` | Pasta principal, branch `main` (= `adb5a72`, o que está publicado). Tem **49 ficheiros alterados e 3 novos por publicar de outra sessão** (modo privacidade: componente `Private`, `src/lib/privacy.ts`). É também a pasta de onde corre o site de casa. | **Não.** Não fazer commit, não apagar, não mudar de branch (as duas pastas partilham o repositório; mudar de branch lá mudava a pasta da outra sessão), não correr `next dev` lá. |

O branch `f17-relatorios` já está no GitHub e tem um endereço de teste na Vercel
(protegido por login Vercel). **Não fazer push nem juntar ao `main` sem o
utilizador pedir, de cada vez** — o repositório é público e o `main` publica o site.
Fazer commits locais no branch está bem.

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
  derivada), código de recuperação, até `MAX_ACCOUNTS` contas.
- **Separação entre pessoas:** no próprio Postgres (Neon), por *row-level
  security*: cada tabela tem `user_id` e uma política. A app liga-se como
  `moneyos_app`, que não a consegue contornar. Ver a secção "Every person's rows
  are Postgres's to keep apart" do `CLAUDE.md`.
- **Chaves das corretoras:** cifradas na base de dados; só a `ENCRYPTION_KEY` do
  `.env` do PC as abre. **A Vercel não tem essa chave, de propósito** — no site
  publicado as ligações com chave estão desligadas para toda a gente. A Trading
  212 e a MEXC do dono só sincronizam enquanto o `SITE_PARA_TELEMOVEL.cmd` está
  aberto no PC (de 15 em 15 minutos). A Hyperliquid não usa chave e sincroniza em
  qualquer lado. A IBKR precisa do Client Portal Gateway ligado no PC.
- **No branch `f17-relatorios`** (por cima do `main`):
  - `ad5fc8d`, `e9ed41d` — relatórios à medida (F17): período livre, dinheiro e/ou
    investimentos, PDF com gráficos desenhado pela app (`pdf-lib`), CSV.
  - `b448f2d` — botão **Install app** e bloqueio da tradução automática do browser.
  - `6ca412f` — **Settings → On your phone** e atalhos no ícone (Record expense / income).
  - `610bfbb` — **português**, fase 1 (F18): escolha num cookie lido também pelo
    servidor; menus, abas, entrada, registo rápido e Definições traduzidos.
    Palavras em `src/lib/i18n/messages.ts`.
  - `17b8586` — 10 erros dos relatórios corrigidos (H32 no `TAREFAS.md`).

## 3. Trabalho pedido agora: os erros B01–B09

Encontrados numa revisão do branch a 05/10/2026; estão também na secção 2 do
`TAREFAS.md`. Corrigir no branch, com um teste para cada um que seja lógica.
Linhas referem-se ao commit `17b8586`.

**B01 — Com Português escolhido, as páginas ainda não traduzidas deixaram de poder
ser traduzidas pelo browser.** `src/app/layout.tsx:146` põe `translate="no"` e
`lang={language}` na página inteira. Antes deste branch, o Chrome do utilizador
traduzia o Painel, as Contas e os Investimentos; agora ficam em inglês sem
alternativa até serem traduzidos (F18). *Proposta:* com uma língua diferente de
inglês, não bloquear a tradução na página inteira; marcar com `translate="no"` e
`lang` da língua escolhida só o que já está traduzido (menus, Definições, registo
rápido, entrada) e, sempre, o que é do utilizador (nomes de contas, categorias,
lojas e valores — o componente `Money` é o sítio óbvio). As páginas por traduzir
ficam com `lang="en"` (resolve também B06). Confirmar num telemóvel real que o
Chrome oferece traduzir o resto e respeita as partes marcadas.

**B02 — O botão Install app promete uma instalação que o browser não faz no site de
casa.** `src/lib/ui/install.ts:47`. Pelo Wi-Fi o site é
`http://192.168.x.x:3000`, que não é um contexto seguro (secção "A phone on the
Wi-Fi is not a secure context" do `CLAUDE.md`): o Chrome só lá põe um marcador,
sem atalhos nem página offline. *Proposta:* acrescentar
`secure: window.isSecureContext` ao `InstallEnvironment` e uma rota própria que
diz para abrir o endereço publicado; a página `settings/phone` deve dizer o
mesmo. Testes em `src/lib/ui/__tests__/install.test.ts`.

**B03 — Um atalho com a sessão expirada perde o pedido.** `src/proxy.ts:43`
redireciona para `/login` sem guardar o destino, e `LoginScreen` faz
`router.replace("/")`. Quem usa o atalho "Record expense" depois de 30 dias sem
entrar fica no painel sem o formulário. *Proposta:* `/login?next=<caminho>` e,
depois de entrar, voltar a esse caminho — **só caminhos relativos que comecem por
`/` e não por `//`** (senão é um redirecionamento aberto). Testar a validação.

**B04 — A escolha de língua local nunca é limpa.** `src/components/LanguageContext.tsx:39`:
`chosen` sobrepõe-se ao valor do servidor para sempre. Com duas abas, mudar a
língua numa deixa a outra com metade em cada língua até recarregar. *Proposta:*
largar `chosen` quando o valor vindo do servidor mudar ou o igualar.

**B05 — Erros do registo rápido em inglês com Português escolhido.**
`src/components/QuickEntry.tsx:108` só traduz as mensagens conhecidas em
`messages.ts` (`server`); as que `createQuickTransaction` passa da validação
(`error.message`) aparecem em inglês. *Proposta:* juntar essas mensagens ao mapa
`server` (há um teste em `src/lib/i18n/__tests__/messages.test.ts` que verifica as
mensagens de recusa; fazer o mesmo para estas).

**B06 — `lang="pt"` em páginas cujo texto ainda é inglês.** Mesmo sítio que B01;
um leitor de ecrã pronuncia o inglês com regras portuguesas. Resolve-se com B01.

**B07 — Firefox no computador recebe instruções para um menu que não existe.**
`src/lib/ui/install.ts:47` devolve `menu` para o Firefox de Windows (o próprio
teste o afirma); o Firefox de computador não instala sites. *Proposta:* uma rota
que diz que este browser não instala e sugere Chrome ou Edge; o Firefox de
Android continua em `menu`.

**B08 — O CSV não diz porque falta um valor.** `src/lib/reports/investments.ts:489`:
quando o registo de depósitos está incompleto, "Change not explained by deposits"
fica vazio sem a razão (`unexplainedWithheld`), ao contrário do ecrã e do PDF. Pôr
a razão na linha. Ver "Zero is not a measurement" no `CLAUDE.md`.

**B09 — Nomes das abas traduzidos pelo texto inglês.** `src/lib/i18n/messages.ts:637`
(`labelIn`). Renomear uma aba em `src/lib/navigation.ts` perde a tradução sem
nenhum teste falhar. *Proposta mínima:* o teste deve percorrer as listas reais
(as de `lib/navigation.ts`, os grupos do `Nav.tsx` — exportá-los ou passá-los
para `lib/navigation.ts` — e `TABS` de `SettingsTabs.tsx`), não uma lista escrita
à mão.

Pendente da revisão anterior, menor: a lista de posições de hoje
(`getPortfolioItems`) é lida duas vezes por relatório. Usada em 13 sítios, alguns
nas páginas por publicar da outra sessão — não partilhar o resultado sem rever
cada um.

## 4. Como verificar

Na pasta de trabalho:

```
cd /d C:\Users\joao2\Projects\money-os-f17
npx tsc --noEmit
npx vitest run
npx eslint src
npm run build
```

No commit `17b8586`: tipos sem erros, **2789 testes**, lint com 3 avisos antigos
(`src/lib/connectors/bybit/__tests__/connector.test.ts`) e 0 erros, build a passar.
Depois de correr o servidor de desenvolvimento, o Next reescreve `next-env.d.ts`:
repor com `git checkout -- next-env.d.ts` antes de fazer commit.

Para ver no browser: servidor de desenvolvimento **na pasta de trabalho, na porta
3001** (`npm run dev -- --port 3001`). Nunca na pasta principal: os tipos que o
Next gera em `.next/dev/types` ficaram a apontar para ficheiros deste branch e
partiram o site de casa (corrigido a 05/10 apagando só `.next/dev/types`).

**A base de dados é a real (Neon, a de produção).** Para testar com sessão:
criar uma conta de teste pela página de entrada em `localhost` (email e
palavra-passe inventados), pôr dados de exemplo só nessa conta com um script que
use `asUser(<id dela>)`, e **apagá-la no fim** (`db.delete(users)` dentro de
`asUser` apaga tudo em cascata; confirmar que ficam 0 linhas). Scripts temporários
numa pasta `.f17-tmp/` (ignorada pelo git). Nunca tocar na conta `owner` nem ler
dados de outras pessoas. Limite de criação de contas: 5 por hora, 20 por dia.

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
- Compilar a app Android antiga: `android-shell\gradlew.bat assembleDebug` com o
  JDK 17. `lintDebug` tem dois erros antigos conhecidos.
- Emulador `Pixel_10_Pro_XL` (API 37.1); tem PIN e não é desbloqueado pelo agente.
- Não alterar firewall nem definições do Windows; pedir ao utilizador o que exigir
  a presença dele (iniciar sessão, desbloquear o telemóvel, aceitar termos).

## 6. Depois dos erros

Por ordem, conforme o `TAREFAS.md`: o utilizador experimentar o endereço de teste
e decidir juntar o branch ao `main`; o sincronizador leve no PC; as restantes
páginas em português (F18), depois de publicado o trabalho de privacidade da outra
sessão; e o plano da Play Store (F19, F20), que ainda tem decisões do utilizador
por tomar.
