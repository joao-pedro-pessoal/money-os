# Pôr o Money OS a funcionar para outras pessoas

Atualizado a 30 de setembro de 2026. O Money OS passou a ter **contas**: qualquer
pessoa abre o endereço, carrega em **Create an account** e fica com a app
inteira — todas as páginas que tu tens — vazia e só sua. Tu não crias nada para
ninguém.

Cada pessoa só vê o que é seu. Quem o garante é a própria base de dados: cada
registo sabe de quem é, e a base recusa mostrar ou gravar registos de outra
conta, mesmo que uma página se esqueça de filtrar.

Os teus dados de antes — contas, movimentos, investimentos, tudo — passaram para
a **tua** conta.

O cofre (`/vault`) e as cópias por pessoa foram retirados: esta é agora a única
maneira.

## Passo 1 — uma vez, no teu PC e na Vercel

A app passa a entrar na base de dados com um utilizador próprio, que não
consegue passar por cima da separação entre contas. O que tinhas até agora
consegue, e por isso a app recusa arrancar com ele.

1. No `cmd`:

   ```
   cd /d C:\Users\joao2\Projects\money-os
   npm run db:app-role
   ```

   Isto cria esse utilizador e muda o teu `.env`: `DATABASE_URL` passa a ser o
   da app, e o antigo fica em `DATABASE_ADMIN_URL`, só para atualizar a
   estrutura da base de dados. Escreve também `for-vercel.txt`, com o valor para
   a Vercel.
2. Na Vercel, **Settings → Environment Variables**:
   - troca o valor de `DATABASE_URL` pelo que está em `for-vercel.txt`, sem
     aspas;
   - acrescenta `MAX_ACCOUNTS` com quantas contas aceitas no total (por
     defeito 10; sobe quando quiseres);
   - apaga `SYNC_MAX_ACCOUNTS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
     `GOOGLE_REDIRECT_ORIGIN`, se lá estiverem: já não servem;
   - não ponhas lá a `DATABASE_ADMIN_URL`.
3. **Deployments → ⋯ → Redeploy**. Depois apaga o `for-vercel.txt`.

## Passo 2 — a tua primeira entrada

Entra com a `APP_EMAIL` e a `APP_PASSWORD`. É isso que reclama a tua conta de
dono. Aparece um **código de recuperação**: guarda-o (num papel, ou num gestor
de palavras-passe). É a única maneira de escolher uma palavra-passe nova se a
esqueceres.

Daí em diante entras como toda a gente: o teu email e a tua palavra-passe.

## Passo 3 — o que dizes a cada pessoa

Manda-lhes o endereço (o de **Domains** na Vercel) e isto:

1. Abre o endereço e carrega em **Create an account**, por baixo do botão
   *Sign in*.
2. Escolhe o email e uma palavra-passe **longa**, com 12 caracteres ou mais.
3. Aparece um **código de recuperação**. Guarda-o: sem ele, uma palavra-passe
   esquecida não tem volta — ninguém a pode repor, nem eu.
4. No telemóvel: abre o endereço no Chrome ou no Safari e carrega em **Install
   app** (na página de entrada, ou em **Settings → On your phone**). No
   Android e no computador instala com um toque; no iPhone mostra os passos —
   **Partilhar → Adicionar ao ecrã principal**. Fica com ícone, como uma app. Não
   há loja nem ficheiro para descarregar: a app é o próprio site.
5. **Atalhos (Android):** carregar uns segundos no ícone **Money OS** mostra
   **Record expense**, **Record income**, **Cash Flow** e **Investments**.
   Arrastando um deles para o ecrã fica um ícone próprio — por exemplo, um toque e
   abre logo o registo de uma despesa. O passo a passo está em **Settings → On
   your phone**. No iPhone não há atalhos: o botão **+ Add entry** faz o mesmo.

**Widgets:** a app instalada pelo navegador não pode ter widgets no ecrã inicial
— nenhum navegador o permite, nem no Android nem no iPhone. Os widgets são da app
Android à parte (`android-shell/`), que se instala por ficheiro e hoje só funciona
no Wi-Fi de casa, com o PC ligado.

**Língua:** a app abre em inglês. Para português, escolhe **Português** no canto
da página de entrada ou em **Settings → Language** (Definições → Idioma). Já
estão em português os menus, a entrada e a criação de conta, o registo rápido e
as Definições; as outras páginas ainda estão em inglês e passam a português por
fases. Os nomes das tuas contas e categorias e os valores nunca são traduzidos.
O navegador já não traduz a app sozinho: essa tradução mudava também os teus
nomes e podia estragar as páginas.

**Se esqueceres a palavra-passe:** na página de entrada, **Forgot your
password?**, e depois o email, o código de recuperação e uma palavra-passe nova.
O código fica gasto e aparece outro, para guardar.

**Um código novo** (perdido, ou visto por alguém): **Settings → Your account →
New recovery code**. Pede a palavra-passe primeiro.

**Um telemóvel perdido:** **Settings → Log out other devices** termina a sessão
em todos os outros aparelhos.

**Quem tinha um cofre** entra com o mesmo email e a mesma palavra-passe, e
recebe logo o seu código de recuperação. O que estava no cofre não passou: estava
cifrado no aparelho dessa pessoa, e o servidor nunca o conseguiu ler.

## O que tens de saber

- **Tu consegues ver os dados deles.** Estão numa base de dados tua. A separação
  impede cada conta de ver as outras, não impede o dono do servidor. É assim em
  qualquer serviço deste género; diz-lhes.
- **Antes de abrir a desconhecidos**, segue a
  [lista de verificação legal e de segurança](LEGAL_SECURITY_CHECKLIST.md).
  Guardar dados financeiros de outras pessoas traz obrigações (RGPD): política de
  privacidade, apagar dados a pedido, avisar de falhas.
- **Apagar a própria conta:** **Settings → Your account → Delete my account**.
  Pede o email escrito à mão e a palavra-passe, e apaga tudo o que a conta tem,
  sem volta. A tua conta de dono não se apaga por aí.
- **Orçamentos contam como dinheiro reservado:** com 700 na conta e um orçamento
  de 300 este mês, o **Free Cash** mostra 400 e o **Allocated Cash** 300, mesmo
  antes de gastares. Só conta o que falta gastar no período atual.
- **Chaves API das corretoras** (Bybit, Trading 212, Kraken…) não funcionam no
  site publicado, para ninguém. As tuas continuam só em casa, como combinado.
  Contas à mão, movimentos, extratos, CSV e ligações sem chave funcionam.
- **A app nativa** (a pasta `mobile/`, que não é o site) sincronizava com os
  cofres. Os cofres foram retirados, por isso essa sincronização deixou de
  funcionar. No telemóvel usa-se o site.
- **Limites contra abusos:** no máximo `MAX_ACCOUNTS` contas, 5 novas por hora e
  20 por dia; dez palavras-passe erradas bloqueiam essa conta durante 15
  minutos.
- **A sincronização automática** (`/api/sync`, se a tiveres ligada) passa por
  cada conta, uma de cada vez.
