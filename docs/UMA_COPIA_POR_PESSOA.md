# Uma cópia do Money OS para cada pessoa

Escrito a 30 de setembro de 2026. Cada pessoa da família fica com o Money OS
**inteiro** — todas as páginas que tu tens: Analytics, Savings, Budgets,
Buckets, Subscriptions, Coming in, Library, Investments, Settings — num endereço
seu, com uma base de dados só sua.

É diferente do cofre (`/vault`, em [PARA_A_FAMILIA.md](PARA_A_FAMILIA.md)): o
cofre é cifrado no aparelho da pessoa, mas só tem contas e movimentos. A cópia
tem tudo, e em troca não é cifrada dessa maneira (ver *O que tens de saber*,
no fim).

Por pessoa, são três passos: um comando no teu PC, um projeto novo na Vercel e
uma mensagem para ela.

## Passo 1 — a base de dados dela (no teu PC)

Abre o `cmd` e escreve, trocando `ana` pelo nome (letras minúsculas e números,
sem espaços) e o email pelo dela:

```
cd /d C:\Users\joao2\Projects\money-os
npm run new-person -- ana ana@email.pt
```

Isto, sozinho:

- cria a base de dados `moneyos_ana` no teu servidor Neon, ao lado da tua;
- cria um utilizador da base de dados só para ela, que abre a base dela e mais
  nenhuma — nem a tua;
- prepara as tabelas e as categorias iniciais;
- escreve `instances\ana.env` com o que a Vercel precisa, incluindo a
  palavra-passe dela, gerada ao acaso.

O `instances\ana.env` fica **só no teu PC**: o Git ignora essa pasta. Guarda-o;
é lá que está a palavra-passe dela se alguma vez a esquecer.

Correr o comando outra vez para o mesmo nome não muda nada do que já existe:
só atualiza a base.

## Passo 2 — o projeto dela na Vercel

1. Em [vercel.com](https://vercel.com): **Add New → Project** e escolhe
   `money-os` — o mesmo repositório do teu.
2. Em **Project Name** escreve `money-os-ana`. É daí que vem o endereço.
3. Abre **Environment Variables**. Abre `instances\ana.env` no Bloco de Notas,
   copia as linhas que **não** começam por `#` e cola-as no primeiro campo
   (**Key**): a Vercel reparte-as sozinha. Têm de aparecer seis: `DATABASE_URL`,
   `APP_EMAIL`, `APP_PASSWORD`, `APP_SECRET`, `COOKIE_SECURE` e
   `SYNC_MAX_ACCOUNTS`.
4. **Deploy**.
5. Em **Settings → Deployment Protection**, desliga **Vercel Authentication**.
   Sem isto, ela vê o login da Vercel em vez do dela.
6. Em **Domains** está o endereço dela (algo como
   `https://money-os-ana.vercel.app`). Abre-o numa janela anónima e entra com o
   email e a palavra-passe do ficheiro, para confirmar.

## Passo 3 — o que lhe dizes

Manda-lhe o endereço, o email e a palavra-passe (a linha `APP_PASSWORD` do
ficheiro). No telemóvel: abrir o endereço no Chrome ou no Safari e usar
**Adicionar ao ecrã principal** — fica com ícone, como uma app.

A página de entrada dela não mostra nada de cofres: é só o email e a
palavra-passe.

## Atualizações

Todas as cópias vêm do mesmo repositório: cada vez que envias para o GitHub,
**todas** se atualizam sozinhas.

Quando uma atualização muda a base de dados (uma migração nova), as bases de
todos têm de mudar **antes** de enviares:

```
cd /d C:\Users\joao2\Projects\money-os
npm run db:migrate-all
```

Isso atualiza a tua base e a de cada pessoa que está em `instances\`. (Se for eu
a fazer a alteração, faço isto antes de enviar.)

## O que tens de saber

- **Tu consegues ver os dados deles.** As bases estão no teu Neon e os projetos
  na tua Vercel. O cofre impedia isso; a cópia não. Se alguém quiser que nem tu
  vejas, tem de criar contas próprias na Neon e na Vercel e seguir
  [FORA_DE_CASA.md](FORA_DE_CASA.md) com a sua base.
- **A palavra-passe dela só tu a mudas**: na Vercel, no projeto dela, a
  variável `APP_PASSWORD`, e depois **Deployments → ⋯ → Redeploy**. Não há
  "esqueci-me" numa cópia.
- **Corretoras com chave API** (Bybit, Trading 212, Kraken…) precisam de uma
  `ENCRYPTION_KEY` no projeto dela. A regra "a chave fica em casa" era para as
  tuas; para ela, se precisar, gera uma com
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  e põe-na só no projeto dela. Sem ela, a cópia funciona, mas não guarda chaves.
- **Espaço:** o plano gratuito da Neon tem um limite de espaço por projeto,
  partilhado por todas as bases. A tua usa hoje 16 MB; uma cópia nova começa
  quase vazia. Vê em Neon → **Billing** se estiveres perto.
- **Quem já usava o cofre** não leva os dados para a cópia automaticamente:
  tem de os voltar a pôr.
- **Apagar uma cópia:** na Vercel, **Settings → Delete Project** no projeto
  dela. A base de dados fica no Neon até a apagares — pede-me.
