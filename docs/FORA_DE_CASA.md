# Usar o Money OS fora de casa

Decidido a 23 de setembro de 2026: o site passa a poder correr **na Vercel**, com
endereço `https` fixo, usando a mesma base de dados Neon que já usas. Desde 30 de
setembro tem contas: qualquer pessoa cria a sua e usa-a de qualquer lado, sem o
teu PC ligado (ver [PARA_A_FAMILIA.md](PARA_A_FAMILIA.md)).

Isto não substitui o que tens em casa. O site continua a correr no PC com o
`SITE_PARA_TELEMOVEL.cmd`; a nuvem é uma segunda cópia do mesmo código, ligada à
mesma base de dados.

## 1. Pôr o site na Vercel

1. Entra em [vercel.com](https://vercel.com) com o teu GitHub. Se a Vercel disser
   que já existe uma conta com o email da GitHub, entra pelo método com que a
   criaste (*Last Used*, ou **Continue with Email**) e liga depois a GitHub em
   **avatar → Settings → Authentication**.
2. **Add New → Project** e escolhe o repositório `money-os`. O projeto é Next.js,
   por isso não é preciso configurar nada da compilação.
3. Em **Environment Variables**, põe:

   | Variável | O que meter |
   | --- | --- |
   | `DATABASE_URL` | A do utilizador da app, **não** a do teu `.env` antigo: o `npm run db:app-role` escreve-a em `for-vercel.txt`. |
   | `APP_EMAIL` | O teu email. A tua primeira entrada reclama com ele a tua conta de dono. |
   | `APP_PASSWORD` | A palavra-passe dessa primeira entrada. Depois disso já não é lida. |
   | `APP_SECRET` | O mesmo do `.env`, ou um novo (um novo fecha as sessões abertas). |
   | `COOKIE_SECURE` | `true`. Na internet o cookie da sessão só deve viajar cifrado. |
   | `MAX_ACCOUNTS` | Quantas contas o site aceita no total (por defeito 10). |
   | `OPERATOR_NAME` | O teu nome, como responsável na política de privacidade (`/privacy`). |
   | `CONTACT_EMAIL` | O email para pedidos de privacidade e de apagar conta. Aparece **publicamente** em `/privacy`, `/terms` e `/delete-account`. |

   A `DATABASE_ADMIN_URL` também **não** vai para a Vercel: serve só para mudar
   a estrutura da base de dados, e isso faz-se a partir do teu PC.

   **A `ENCRYPTION_KEY` não vai para a Vercel.** É ela que abre os segredos das
   corretoras guardados na base de dados, e a regra do projeto é que só existe
   no teu PC (README, *Where your API keys live*). A base de dados na Neon tem
   os segredos cifrados; sem a chave, nem a Neon nem a Vercel os conseguem ler.
   Sem ela, a cópia da Vercel mostra o que foi sincronizado em casa e não tenta
   abrir segredo nenhum: nessas ligações aparece *Synced where its key is* em
   vez de *Sync now*.

   E **não** ponhas estas, mesmo que a Vercel as traga ao importar o
   `.env.example`: `POSTGRES_PASSWORD` (só serve ao docker-compose; na nuvem a
   base de dados é a Neon), `SYNC_INTERVAL_SECONDS` e `IBKR_GATEWAY_URL` (não
   funcionam na nuvem). Apaga-as no `—` ao lado.

   Se já puseste a `ENCRYPTION_KEY` na Vercel: apaga-a, faz **Redeploy**, e
   apaga também os deploys antigos (**Deployments → ⋯ → Delete**). Cada deploy
   guarda a sua própria cópia das variáveis, e um deploy antigo continuaria a
   tê-la.

   Os valores vão **sem as aspas** que têm no `.env`.

4. **Deploy**. No fim ficas com um endereço `https://money-os-xxxx.vercel.app`
   (o que aparece em **Domains**). Uma variável mudada depois só conta com
   **Redeploy**. Os endereços compridos de cada deploy estão atrás do login da
   Vercel; se o de **Domains** também estiver, desliga **Vercel
   Authentication** em **Settings → Deployment Protection**.
5. Abre-o: aparece a página de entrada.

### O que não funciona na nuvem

- **Sincronizar as corretoras com chave** (Trading 212, MEXC, Bybit, Binance,
  OKX, Kraken, SnapTrade): de propósito, porque a chave que lhes abre os
  segredos fica em casa. Os valores sincronizados em casa aparecem na nuvem na
  mesma. A Hyperliquid não guarda segredo e sincroniza em qualquer lado.
- **A Interactive Brokers**: o conector fala com um gateway em
  `https://localhost:5000`, que é o teu PC. Continua a funcionar na cópia de casa.
- **A sincronização automática** (`/api/sync`): na Vercel não corre. Em casa,
  com `SYNC_SECRET` no `.env`, o `SITE_PARA_TELEMOVEL.cmd` sincroniza tudo a cada
  15 minutos enquanto a janela dele estiver aberta — incluindo as corretoras com
  chave, que só podem sincronizar aí — e o resultado aparece também no site
  publicado, porque a base de dados é a mesma.
- **As duas cópias partilham a base de dados.** O que gravas em casa aparece na
  nuvem e vice-versa; não são dois sítios diferentes.

### O que muda em segurança

O site deixa de estar só na tua rede. O que o protege é a palavra-passe de cada
conta, o limite de tentativas e as sessões que expiram. Por isso: palavras-passe
longas, e `COOKIE_SECURE=true`.

Cada pessoa só vê o que é seu: é a própria base de dados que o garante, e a app
recusa arrancar se estiver ligada com um utilizador que o pudesse ignorar.
