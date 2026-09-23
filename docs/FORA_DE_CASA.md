# Usar o Money OS fora de casa, e entrar com a Google

Decidido a 23 de setembro de 2026: o site passa a poder correr **na Vercel**, com
endereço `https` fixo, usando a mesma base de dados Neon que já usas. Quem tem um
cofre (`/vault`) usa-o de qualquer lado, sem o teu PC ligado.

Isto não substitui o que tens em casa. O site continua a correr no PC com o
`SITE_PARA_TELEMOVEL.cmd`; a nuvem é uma segunda cópia do mesmo código, ligada à
mesma base de dados.

## 1. Pôr o site na Vercel

1. Cria conta em [vercel.com](https://vercel.com) com o teu GitHub.
2. **Add New → Project** e escolhe o repositório `money-os`. O projeto é Next.js,
   por isso não é preciso configurar nada da compilação.
3. Em **Environment Variables**, põe:

   | Variável | O que meter |
   | --- | --- |
   | `DATABASE_URL` | A mesma do teu `.env` (Neon). |
   | `APP_PASSWORD` | A tua palavra-passe do site. **Muda-a**: passa a estar exposta à internet. |
   | `APP_SECRET` | O mesmo do `.env`, ou um novo (um novo fecha as sessões abertas). |
   | `ENCRYPTION_KEY` | **Exatamente a mesma** do `.env`. Outra torna ilegíveis as chaves das corretoras. |
   | `COOKIE_SECURE` | `true`. Na internet o cookie da sessão só deve viajar cifrado. |
   | `SYNC_MAX_ACCOUNTS` | Quantas contas de cofre aceitas (por defeito 10). |

4. **Deploy**. No fim ficas com um endereço `https://money-os-xxxx.vercel.app`.
5. Abre-o: o site pede a palavra-passe, e `/vault` abre sem ela.

### O que não funciona na nuvem

- **A Interactive Brokers**: o conector fala com um gateway em
  `https://localhost:5000`, que é o teu PC. Continua a funcionar na cópia de casa.
- **A sincronização automática** (`/api/sync`): só corre se puseres `SYNC_SECRET` e
  alguém a chamar. Sem isso, sincronizas à mão.
- **As duas cópias partilham a base de dados.** O que gravas em casa aparece na
  nuvem e vice-versa; não são dois sítios diferentes.

### O que muda em segurança

O site deixa de estar só na tua rede. O que o protege é a palavra-passe, o limite
de tentativas e as sessões que expiram. Por isso: **muda a palavra-passe**, usa
uma longa, e mantém `COOKIE_SECURE=true`.

Os cofres não dependem disso: o que lá está é cifrado no aparelho de cada pessoa
e o servidor — em casa ou na Vercel — guarda texto que não consegue ler.

## 2. Entrar com a Google

A Google responde a uma pergunta: **quem é a pessoa**. Não abre o cofre. As doze
palavras continuam a ser a chave, e é por isso que o servidor continua sem poder
ler nada. Quem cria a conta com a Google recebe as doze palavras logo a seguir,
para escrever num papel.

### Preparar, uma vez

1. Vai a [console.cloud.google.com](https://console.cloud.google.com) e cria um
   projeto (o nome é só teu).
2. **APIs & Services → OAuth consent screen**: tipo *External*, nome da app
   "Money OS", o teu email de contacto. Em **Test users** acrescenta os emails das
   pessoas que vão usar, enquanto a app estiver em modo de teste.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, tipo
   *Web application*.
4. Em **Authorized redirect URIs** mete, exatamente:
   `https://o-teu-endereco.vercel.app/api/vault/google/callback`
5. Copia o **Client ID** e o **Client secret**.
6. Na Vercel, acrescenta:

   | Variável | O que meter |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | O Client ID. |
   | `GOOGLE_CLIENT_SECRET` | O Client secret. |
   | `GOOGLE_REDIRECT_ORIGIN` | Só se o endereço que registaste for diferente daquele por onde as pessoas entram (por exemplo, um domínio próprio). |

7. Faz **Redeploy**.

Sem estas variáveis o botão existe mas responde que não está configurado — não
falha nem finge.

### Como fica para quem usa

1. Abre `/vault` e carrega em **Continue with Google**.
2. Escolhe a conta Google.
3. Volta ao Money OS:
   - **conta nova**: aparecem as doze palavras, para escrever e confirmar;
   - **conta que já existe**: pede as doze palavras.
4. A partir daí é o cofre normal.

### Limites, ditos de frente

- **Um email com conta de palavra-passe não pode ser tomado pela Google.** Se já
  existe uma conta com esse endereço, a app recusa e manda entrar com a
  palavra-passe. Juntar os dois métodos na mesma conta é trabalho por fazer
  (tarefa E03).
- **A Google não recupera nada.** Quem perde as doze palavras perde o cofre, com
  ou sem Google.
- **Enquanto o projeto Google estiver em modo de teste**, só entram os emails que
  puseres em *Test users* (até 100).
