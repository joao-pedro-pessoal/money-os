# Pôr o Money OS a funcionar para a família

Escrito a 27 de setembro de 2026. É a lista do que falta fazer **fora do
código**, por ordem, para a tua família poder usar isto. O código já está
pronto: o que falta são contas tuas (GitHub, Vercel, Google) que só tu podes
criar.

Cada pessoa da família tem um **cofre** seu em `/vault`: contas, categorias,
movimentos, transferências e orçamentos, cifrados no telemóvel ou no PC dela. O
servidor guarda texto que não consegue ler. Ninguém vê o dinheiro de ninguém —
nem tu, que és o dono do servidor.

## Passo 0 — mandar o código para o GitHub

Estão três alterações por enviar. Sem isto a Vercel não tem o que compilar.
Pede-me, que eu envio.

## Passo 1 — a Vercel (o endereço na internet)

Sem isto só funciona dentro de casa, com o teu PC ligado.

1. Vai a [vercel.com](https://vercel.com) e entra.

   Se ao entrares pela GitHub aparecer *«There is already an account associated
   with your GitHub email address»*, é porque já tens conta feita com esse
   email. Entra pelo método antigo (o botão marcado *Last Used*, ou **Continue
   with Email**, que manda um código) e depois liga a GitHub em **avatar →
   Settings → Authentication**. Não uses *Sign Up*: criava uma segunda conta.

2. **Add New → Project**, escolhe `money-os`. Não configures nada da
   compilação; é Next.js e a Vercel reconhece-o. Se não aparecer nenhum
   repositório, há um botão para instalar a app da Vercel na tua conta GitHub —
   dá-lhe acesso só a `money-os`.
3. Em **Environment Variables**, põe estas seis, uma a uma:

   | Variável | O que meter |
   | --- | --- |
   | `DATABASE_URL` | A mesma do teu `.env` (a da Neon, com `neon.tech` no meio). |
   | `APP_EMAIL` | O teu email. Entras com ele e com a `APP_PASSWORD`. |
   | `APP_PASSWORD` | **Uma nova, longa.** Passa a estar exposta à internet. |
   | `APP_SECRET` | O mesmo do `.env` (um novo fecha as sessões abertas). |
   | `COOKIE_SECURE` | `true`. |
   | `SYNC_MAX_ACCOUNTS` | Quantas pessoas aceitas. Para uma família, `6` ou `10`. |

   Põe a `APP_EMAIL` também no `.env` de casa, numa linha nova:
   `APP_EMAIL="o-teu-email"`. Sem ela, qualquer email que não seja de um cofre
   entra como dono só com a palavra-passe — funciona, mas o email não conta.

   **A `ENCRYPTION_KEY` fica em casa.** É a chave que abre os segredos das
   corretoras, e só existe no teu PC. A Neon guarda esses segredos cifrados, e
   sem a chave nem a Neon nem a Vercel os leem. A cópia da Vercel mostra o que
   foi sincronizado em casa; as corretoras com chave sincronizam-se em casa.

   **Não importes o `.env.example` inteiro.** Ele tem linhas que só servem cá em
   casa, e a Vercel copia-as todas:

   - `ENCRYPTION_KEY` — ver acima.
   - `POSTGRES_PASSWORD` — é da base de dados em contentor (docker-compose). Na
     nuvem a base de dados é a Neon, e chega-se lá pelo `DATABASE_URL`.
   - `SYNC_INTERVAL_SECONDS` e `IBKR_GATEWAY_URL` — não funcionam na nuvem.
   - `SYNC_SECRET` — fica para quando quiseres sincronização agendada.

   Se já lá estiverem, apaga-as no `—` ao lado. Se a `ENCRYPTION_KEY` já lá
   esteve num deploy, apaga também esse deploy (**Deployments → ⋯ → Delete**):
   cada deploy guarda a sua cópia das variáveis.

   **Sem aspas.** No `.env` os valores estão entre `"…"`, e as aspas não fazem
   parte deles. Na Vercel mete só o que está dentro: com aspas, a palavra-passe
   passa a ter aspas.

4. **Deploy**. Mudar uma variável **depois** não muda o site que já está a
   correr: só conta depois de **Deployments → ⋯ → Redeploy**.
5. Confirma no endereço que está em **Domains**, na página do projeto (algo
   como `https://money-os-xxxx.vercel.app`): a raiz mostra a página de
   entrada. Tu entras com a `APP_EMAIL` e a `APP_PASSWORD`; a família entra na
   mesma página, com o email e a palavra-passe do cofre de cada um.

   Os outros endereços da Vercel (os compridos, com letras ao calhas e o nome
   da tua conta no meio) estão protegidos pela própria Vercel: tu passas porque
   tens sessão iniciada nela, a família não. Abre o de **Domains** numa janela
   anónima; se pedir login da Vercel, desliga **Vercel Authentication** em
   **Settings → Deployment Protection**.

   Se não conseguires entrar, a página **Logs** do projeto diz porquê. Uma
   variável em falta aparece pelo nome: *«APP_PASSWORD is not set»*.

Isto não substitui o que tens em casa. O `SITE_PARA_TELEMOVEL.cmd` continua a
funcionar, e as duas cópias usam a **mesma base de dados** — o que gravas num
sítio aparece no outro.

**O que não funciona na nuvem:** sincronizar as corretoras com chave (de
propósito — a chave fica em casa), a Interactive Brokers (o conector fala com um
gateway no teu PC) e a sincronização automática. Isso continua a ser feito em
casa, e o resultado aparece na nuvem.

## Passo 2 — entrar com a Google (podes saltar)

O cofre funciona com **email e palavra-passe** sem nada disto. A Google só
poupa uma palavra-passe a quem já tem conta Google. Os passos estão em
[FORA_DE_CASA.md](FORA_DE_CASA.md): criar um projeto na consola da Google, um
*OAuth client ID* do tipo *Web application*, e registar como endereço de
retorno, exatamente:

```
https://o-teu-endereco.vercel.app/api/vault/google/callback
```

Depois põe `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel e faz
*Redeploy*. Enquanto o projeto Google estiver em modo de teste, só entram os
emails que puseres em **Test users**.

## Passo 3 — o que dizes a cada pessoa

Manda-lhes o endereço `https://…vercel.app` e isto:

**No computador, a primeira vez**

1. Abre o endereço e carrega em **Create your vault**, por baixo do botão
   *Sign in*. Escolhe o email e uma palavra-passe **longa** (12 caracteres ou
   mais): é ela que tranca o cofre.
2. Aparecem **doze palavras de recuperação**. Escreve-as num papel, guardado onde
   guardas documentos. Não são para entrar — para isso chega o email e a
   palavra-passe. São a única forma de voltar a entrar se esqueceres a
   palavra-passe. **Ninguém as pode devolver** — nem eu, nem o servidor.
3. Se o computador for só teu, marca **This phone or computer is mine**: assim
   fica aberto até carregares em *Lock and sign out*. Num computador partilhado,
   deixa desmarcado.

**Das outras vezes**

Só o email e a palavra-passe, na página de entrada. O cofre tem um menu à
esquerda como o teu: **Dashboard**, **Accounts**, **Cash Flow** e, no fundo,
**Devices** e **Lock and sign out**.

**Se esqueceres a palavra-passe**

Na página de entrada, **Forgot your password?**: o email, as doze palavras e
uma palavra-passe nova. O cofre fica igual; só muda a palavra-passe. Sem as
doze palavras e sem a palavra-passe não há forma de entrar.

**Quem já tinha cofre antes de 30 de setembro**

Na primeira entrada com email e palavra-passe, o site pede as doze palavras
**uma última vez** (*One more step*). Depois disso, basta o email e a
palavra-passe, em todos os aparelhos.

**No telemóvel, com o código QR**

1. No computador, com o cofre aberto, vai a **Devices** e carrega em **Open on
   your phone → Show the code**.
2. Aponta a câmara do telemóvel ao código e abre a ligação que aparece.
3. O computador pergunta *«Android phone · Chrome scanned the code and wants to
   open your vault»* (ou o nome do teu telemóvel). Se for o telemóvel que tens na
   mão, carrega em **Yes, let it in**.
4. O telemóvel abre o cofre sozinho, sem escrever email nem palavra-passe, e
   fica aberto até carregares em **Lock and sign out**.
5. No Chrome ou no Safari, usa **Adicionar ao ecrã principal**. Fica com ícone,
   como uma app, e abre diretamente no cofre.

O código dura 5 minutos e só funciona uma vez. Se alguém o fotografar, só
consegue que te apareça a pergunta no computador — por isso, se o nome não for
o do teu telemóvel, carrega em **No**.

**No computador, com o telemóvel**

O contrário: o cofre está aberto no telemóvel e o computador não tem sessão.

1. Na página de entrada do computador, carrega em **Sign in with your phone**.
   Aparece um código.
2. Aponta a câmara do telemóvel ao código e abre a ligação.
3. O telemóvel pergunta *«Windows computer · Chrome is asking to open your
   vault»* (com o nome do teu computador). Se for o computador que tens à
   frente, carrega em **Yes, sign it in**.
4. O computador abre o cofre sozinho. Se alguém te mandar um código destes por
   mensagem, carrega em **No**: abria o teu cofre no computador dessa pessoa.

Para isto funcionar, o telemóvel tem de ter o cofre guardado (**This phone or
computer is mine** marcado).

O código tem de ser mostrado a partir do endereço da Vercel (ou do endereço do
PC na rede de casa). Aberto como `localhost`, o computador avisa que o telemóvel
não o consegue abrir.

**Os aparelhos**

Em **Devices**, no menu do cofre, aparece cada aparelho com sessão aberta.
**Sign out** tira-o de lá. Num telemóvel perdido: tira-o em Devices e muda a
palavra-passe (**Forgot your password?**, com as doze palavras). Se o cofre
estava guardado nele, as doze palavras também estavam.

## O que isto ainda não é

Dito de frente, para ninguém contar com o que não existe:

- O cofre é um **gestor de orçamento**: contas, gastos por tipo, orçamentos e o
  mês. **Não tem investimentos**, corretoras, dividendos nem relatórios — isso
  vive do teu lado, o que entra com palavra-passe.
- **O menu do cofre é mais curto que o teu.** As tuas páginas (Analytics,
  Savings, Budgets, Buckets, Subscriptions, Coming in, Library, Investments)
  leem a tua base de dados no servidor. O cofre só existe decifrado no aparelho
  da pessoa, por isso cada página tem de ser refeita para correr no browser
  sobre o cofre. Os orçamentos já fazem parte do cofre; falta-lhes a página.
- **Quem entrar com a Google num email que já tem conta de palavra-passe é
  recusado.** Juntar os dois métodos na mesma conta é trabalho por fazer
  (tarefa E03).
- **A palavra-passe é o que tranca o cofre.** O servidor nunca a vê, mas guarda
  as doze palavras fechadas com uma chave que só ela dá. Quem tivesse uma cópia
  da base de dados podia tentar adivinhá-la — cada tentativa é lenta de
  propósito, mas uma palavra-passe curta ou usada noutros sítios cai. Por isso
  pede-se uma longa.
- **As doze palavras não se recuperam.** Com elas muda-se a palavra-passe;
  perdidas as duas, o cofre fica fechado para sempre.
- **A app de telemóvel nativa** (a pasta `mobile/`, que não é o site) ainda entra
  à moda antiga. Um cofre que já passou a entrar só com a palavra-passe não abre
  lá; no telemóvel usa o site.
- Dois aparelhos a gravar ao mesmo tempo: o segundo é avisado e volta a ler
  antes de gravar. Não se perde nada, mas às vezes há que repetir.
- **Qualquer pessoa que descubra o endereço pode criar uma conta**, até ao
  limite de `SYNC_MAX_ACCOUNTS`. Não vê nada de ninguém, mas ocupa um lugar.
  Convites (só entra quem tu convidas) é trabalho por fazer.
- **A cifra nunca foi revista por alguém de fora.** O checklist do projeto pede
  essa revisão antes de guardar dados de outras pessoas a sério.

## Se preferires ficar só em casa

Não é obrigatório pôr nada na internet. Com o `SITE_PARA_TELEMOVEL.cmd` a
correr, quem estiver na tua rede abre `http://IP-do-teu-PC:3000/vault` e usa o
cofre igual. As limitações: só dentro de casa, e só com o teu PC ligado.
