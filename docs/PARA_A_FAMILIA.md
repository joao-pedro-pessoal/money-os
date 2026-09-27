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
   | `APP_PASSWORD` | **Uma nova, longa.** Passa a estar exposta à internet. |
   | `APP_SECRET` | O mesmo do `.env` (um novo fecha as sessões abertas). |
   | `ENCRYPTION_KEY` | **Exatamente a mesma** do `.env`. |
   | `COOKIE_SECURE` | `true`. |
   | `SYNC_MAX_ACCOUNTS` | Quantas pessoas aceitas. Para uma família, `6` ou `10`. |

   **Não importes o `.env.example` inteiro.** Ele tem linhas que só servem cá em
   casa, e a Vercel copia-as todas:

   - `POSTGRES_PASSWORD` — é da base de dados em contentor (docker-compose). Na
     nuvem a base de dados é a Neon, e chega-se lá pelo `DATABASE_URL`.
   - `SYNC_INTERVAL_SECONDS` e `IBKR_GATEWAY_URL` — não funcionam na nuvem.
   - `SYNC_SECRET` — fica para quando quiseres sincronização agendada.

   Se já lá estiverem, apaga-as no `—` ao lado.

   **Sem aspas.** No `.env` os valores estão entre `"…"`, e as aspas não fazem
   parte deles. Na Vercel mete só o que está dentro: com aspas, a palavra-passe
   passa a ter aspas, e a `ENCRYPTION_KEY` deixa de abrir as chaves das
   corretoras.

4. **Deploy**. Mudar uma variável **depois** não muda o site que já está a
   correr: só conta depois de **Deployments → ⋯ → Redeploy**.
5. Confirma no endereço que está em **Domains**, na página do projeto (algo
   como `https://money-os-xxxx.vercel.app`): a raiz pede a tua palavra-passe, e
   `/vault` abre sem ela.

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

**O que não funciona na nuvem:** a Interactive Brokers (o conector fala com um
gateway no teu PC) e a sincronização automática. Isso continua a ser feito em
casa.

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

Manda-lhes o endereço `https://…vercel.app/vault` e estas quatro linhas:

1. Abre o endereço e carrega em **Create an account** (ou *Continue with
   Google*).
2. Aparecem **doze palavras**. Escreve-as num papel, guardado onde guardas
   documentos.
3. Essas doze palavras são a chave. **Ninguém as pode devolver** — nem eu, nem o
   servidor, nem a Google. Perdê-las é perder o que está lá dentro.
4. No telemóvel: abre no Chrome ou Safari e usa **Adicionar ao ecrã principal**.
   Fica com ícone, como uma app.

Numa segunda pessoa, num segundo aparelho, entra-se com o mesmo email e as
mesmas doze palavras. É o mesmo cofre, e as alterações passam de um aparelho
para o outro.

## O que isto ainda não é

Dito de frente, para ninguém contar com o que não existe:

- O cofre é um **gestor de orçamento**: contas, gastos por tipo, orçamentos e o
  mês. **Não tem investimentos**, corretoras, dividendos nem relatórios — isso
  vive do teu lado, o que entra com palavra-passe.
- **Quem entrar com a Google num email que já tem conta de palavra-passe é
  recusado.** Juntar os dois métodos na mesma conta é trabalho por fazer
  (tarefa E03).
- **Não há reposição de palavra-passe** nem de doze palavras.
- Dois aparelhos a gravar ao mesmo tempo: o segundo é avisado e volta a ler
  antes de gravar. Não se perde nada, mas às vezes há que repetir.

## Se preferires ficar só em casa

Não é obrigatório pôr nada na internet. Com o `SITE_PARA_TELEMOVEL.cmd` a
correr, quem estiver na tua rede abre `http://IP-do-teu-PC:3000/vault` e usa o
cofre igual. As limitações: só dentro de casa, e só com o teu PC ligado.
