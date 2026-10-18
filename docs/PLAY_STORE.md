# Money OS na Play Store — fase 1 (F19)

Preparado a 6 de outubro de 2026, no branch `f19-play-store`. É a app Android que
já existe (`android-shell/`), agora numa versão **loja** que abre o site publicado
(`https://money-os-brown.vercel.app`) em vez do computador de casa. Tudo funciona
nela menos as corretoras com chave (Trading 212, MEXC…), que continuam a
sincronizar só a partir do PC (fase 2, F20).

Este documento tem três partes: o plano e o calendário, o que já está feito no
código, e o que só tu podes fazer, por ordem.

## Plano e calendário (atualizado a 15/10/2026)

Cerca de **4 a 6 semanas** no total. O que mais demora não é código: é a
verificação da conta de programador (dias), os **14 dias** do teste fechado e as
revisões da Google (até uma semana cada).

| Fase | Quem | O quê | Quando |
| --- | --- | --- | --- |
| 0. Publicar o site | Tu, depois eu | Aplicar as migrações à base publicada (passo 1); eu publico o código e confirmo o site; tu pões as variáveis na Vercel | Esta semana |
| 1. Conta de programador | Tu | Criar e verificar a conta (passo 2) | **Já, em paralelo** — a verificação demora dias |
| 2. Preparar o envio | Tu e eu | Chave e ficheiro `.aab` (passo 3); conta de demonstração (passo 6) — eu preparo os dados inventados e tiro as capturas de ecrã | Depois da fase 0 |
| 3. Play Console | Tu | Criar a app, formulários e ficha da loja (passos 4, 5 e 7) | Depois das fases 1 e 2 |
| 4. Teste fechado | Tu convidas; eu corrijo | 15–20 convidados, pelo menos 12 inscritos durante 14 dias seguidos (passo 8); eu corrijo o que reportarem e faço o que falta antes da produção (fim deste documento) | ~3 semanas, com a revisão |
| 5. Produção | Tu | Pedir acesso à produção; lançar primeiro para uma parte (por exemplo 20%) e depois para todos | ~1 semana de revisão |

**Riscos a vigiar:**

- A Google recusa apps que são "só um site dentro de uma app". A nossa tem
  widgets, notificações, atalhos e registo rápido: a ficha da loja e as capturas
  devem mostrá-los.
- O nome **Money OS** pode já existir na Play Store: procurar antes da fase 3.
- Os textos de privacidade e termos devem ser revistos por um jurista antes da
  produção (não do teste fechado).

## O que já está feito

- **Duas versões da app Android**, no mesmo código (`android-shell/app/build.gradle`):
  - `home` — como até aqui: pede o endereço do PC e funciona no Wi-Fi de casa.
  - `store` — abre o site publicado, só por https, sem pedir endereço. Se não houver
    internet, mostra "Sem ligação" com **Tentar outra vez** (sem "Mudar endereço").
  - As duas têm o mesmo identificador, `com.joaonovais.moneyos.site`. **Para instalar
    a da loja, desinstala primeiro a que puseste por cabo** (as assinaturas são
    diferentes e o Android recusa trocar uma pela outra).
  - Versão 0.8.0, código 10. Cada envio para a loja precisa de um código maior.
- **Páginas públicas**, que a Google exige e que abrem sem sessão, em inglês e
  português:
  - Política de privacidade: `/privacy`
  - Termos de utilização: `/terms`
  - Como apagar a conta (também sem a app): `/delete-account`

  Têm ligações no ecrã de entrada (por baixo do formulário), na criação de conta
  ("Ao criar a conta, aceitas os Termos de utilização e a Política de privacidade")
  e em **Definições → Privacidade e termos**. Apagar a conta dentro da app já
  existia (Definições → A tua conta).
- **Uma frase corrigida no ecrã de entrada:** dizia que "só tu vês" os teus
  registos. Quem administra a base de dados consegue vê-los; agora diz que
  "mais nenhum utilizador" os vê, e a política de privacidade explica o resto.
- **O texto dos alertas no telemóvel** já não diz que só funcionam no Wi-Fi de casa.
- **`CRIAR_APP_PLAY_STORE.cmd`** cria o ficheiro que se envia à Google (`.aab`),
  assinado com a tua chave de envio. Testado do princípio ao fim com uma chave
  descartável (já apagada).
- **A versão Android exigida pela Google em 2026** (`targetSdk 36`, Android 16)
  já está no `android-shell/app/build.gradle`.
- **Proteções do site** (B36–B38 no `TAREFAS.md`, por publicar): restauro de
  backup numa conta criada de novo, CSV que já não corre fórmulas no Excel, e
  cabeçalhos de segurança (nenhum outro site mostra a app dentro de uma moldura).
- **`vercel.json`** põe as funções do site em Frankfurt (`fra1`), ao lado da base de
  dados (Neon, também em Frankfurt). Os dados ficam na UE e cada página fica mais
  rápida, porque deixa de atravessar o Atlântico em cada consulta.

## O que tens de fazer, por ordem

Antes dos convites, seguir também `PREPARAR_TESTE_FECHADO.md`: configuração de
acesso, verificação local e ensaio com dados fictícios. O estado atual está em
R01–R06 do `TAREFAS.md`; testes automatizados não substituem estes ensaios.

### 1. Publicar esta versão do site

As páginas de privacidade têm de estar no site publicado antes de as indicares à
Google.

**Primeiro a base de dados, depois o código** — ao contrário, o site publicado
procura tabelas e colunas que ainda não existem. Abre o `cmd` (Windows + R,
`cmd`, Enter) e corre, uma linha de cada vez:

```cmd
cd /d C:\Users\joao2\Projects\money-os-f17
npm run db:migrate
```

Aparece um aviso grande sobre "SSL modes", que é normal; no fim tem de aparecer
`Migrations applied.`. Diz-me logo a seguir: eu junto o branch ao `main`, que
publica o site, e confirmo que ficou bem. (Estas atualizações só acrescentam
coisas, por isso o site antigo continua a funcionar entre os dois passos.)

Depois, na Vercel (**Settings → Environment Variables**, ambiente
**Production**), acrescenta:

| Variável | Valor | Para quê |
| --- | --- | --- |
| `OPERATOR_NAME` | o teu nome | aparece na política de privacidade como responsável |
| `CONTACT_EMAIL` | um email teu para estes assuntos | aparece **publicamente** nas três páginas |
| `MAX_ACCOUNTS` | `40` | por defeito são 10 contas: não chega para 12 testadores e os revisores da Google |
| `REGISTRATION_MODE` | `invite` | só cria conta quem tiver o código de convite |
| `REGISTRATION_INVITE_CODE` | um código aleatório com 32 ou mais caracteres, criado num gestor de palavras-passe | o código que envias **em privado** aos testadores; nunca em capturas, links ou no repositório. Detalhes em `PREPARAR_TESTE_FECHADO.md` |

Depois **Deployments → ⋯ → Redeploy**. Confirma em
`https://money-os-brown.vercel.app/privacy` que aparecem o teu nome e o email.

O email fica público: se não quiseres usar o pessoal, cria um Gmail só para a
Money OS e usa esse também como contacto de programador na Google.

### 2. Conta de programador Google

1. Abre <https://play.google.com/console> com o Gmail que vai ser o dono da app.
2. Escolhe conta **pessoal**. Paga os **25 USD** (uma vez só).
3. A Google pede a verificação de identidade (documento) e que confirmes um
   telemóvel Android com a app Play Console. Pode demorar alguns dias — por isso
   este passo pode e deve começar já, em paralelo com o passo 1.
4. Uma conta pessoal criada agora tem de passar pelo teste fechado (passo 8)
   antes de poder publicar para toda a gente. Uma conta pessoal criada antes de
   13 de novembro de 2023 está isenta.

### 3. Criar o ficheiro da app

1. Na pasta do projeto, faz duplo clique em **`CRIAR_APP_PLAY_STORE.cmd`**.
2. **Na primeira vez** cria a tua chave de envio em `C:\Users\joao2\MoneyOS-PlayStore`.
   O Java pede uma palavra-passe duas vezes — enquanto escreves não aparece nada,
   é normal. Escolhe uma nova, com 12 ou mais caracteres, e guarda-a num gestor de
   palavras-passe.
3. **Faz uma cópia da pasta `C:\Users\joao2\MoneyOS-PlayStore`** para uma pen ou para
   a nuvem. Se a perderes, a Google consegue trocar a chave, mas demora dias.
4. O script pede a palavra-passe e compila. No fim mostra o ficheiro, por exemplo
   `C:\Users\joao2\MoneyOS-PlayStore\money-os-0.8.0-10.aab`.

### 4. Criar a app na Play Console

**Criar app** → nome **Money OS** · idioma predefinido **Português (Portugal)** ·
**App** · **Gratuita** · aceita as declarações. Antes, procura "Money OS" na Play
Store: se já houver uma app com esse nome, a Google pode pedir outro.

### 5. Conteúdo da app (Painel → "Configurar a app")

| Secção | Resposta |
| --- | --- |
| Política de privacidade | `https://money-os-brown.vercel.app/privacy` |
| Acesso à app | **Parte da funcionalidade está restrita** → indica o email e a palavra-passe de uma **conta de demonstração** (ver passo 6) |
| Anúncios | Não tem anúncios |
| Classificação de conteúdo | Categoria **Utilidade / produtividade**; responde **não** a violência, sexo, linguagem, jogo, drogas, partilha de localização; os utilizadores **não** interagem entre si |
| Público-alvo | **18 anos ou mais** |
| App de notícias | Não |
| ID de publicidade | Não usa |
| Apps governamentais / saúde | Não |
| Funcionalidades financeiras | Escolhe só as de **gestão de finanças pessoais** (registo de gastos, orçamentos, agregação de contas e acompanhamento de investimentos **sem** negociação). Não escolhas empréstimos, banca, pagamentos, negociação nem carteira de cripto |

**Segurança dos dados** (Data safety):

- A app recolhe dados? **Sim.** Partilha com terceiros? **Não** (os fornecedores de
  alojamento e base de dados não contam como partilha).
- Cifrados em trânsito? **Sim.** As pessoas podem pedir que sejam apagados? **Sim.**
- URL para apagar a conta: `https://money-os-brown.vercel.app/delete-account`
- Tipos de dados:
  - **Informações pessoais → Endereço de email** — recolhido, obrigatório; fins:
    **Funcionalidade da app** e **Gestão da conta**.
  - **Informações financeiras → Outras informações financeiras** e **Histórico de
    compras** — recolhidos, opcionais (cada pessoa decide o que regista); fim:
    **Funcionalidade da app**.
- Não são adicionados localização, contactos, fotos, identificadores do aparelho
  ou estatísticas de utilização. A preparação de 09/10 inclui eventos genéricos
  de falha do servidor nos logs do alojamento, sem conteúdo do pedido nem valores
  financeiros. Rever a declaração de diagnósticos e os registos do fornecedor na
  submissão final; não declarar ausência de relatórios de falhas sem essa revisão.

### 6. Conta de demonstração para os revisores

Os revisores da Google não conseguem criar dinheiro a sério para ver a app. Cria tu
uma conta normal no site publicado (por exemplo com um Gmail novo só para isto) —
com `REGISTRATION_MODE=invite` usa o código de convite — e dá à Google esse email e
essa palavra-passe na secção "Acesso à app". Nunca uses a tua conta verdadeira.

Os dados **inventados** estão em [`play-store/demo-account-backup.json`](play-store/demo-account-backup.json):
5 contas (Banco Aurora, Corretora Delta…), 158 movimentos de sete meses, 3
orçamentos, 5 subscrições, 6 investimentos com histórico, listas e nomes de
tickers. Nada disto é de ninguém. Para os pôr na conta de demonstração:
**Definições → Dados → Restaurar**, escolher o ficheiro e escrever `RESTORE`.
O restauro foi ensaiado numa conta nova, com as migrações reais e a segurança
por linhas.

As datas são relativas ao dia em que o ficheiro foi gerado (18/10/2026). Se a
revisão da Google for muito depois, pede-me um ficheiro novo, para "este mês"
não aparecer vazio.

As capturas de ecrã da ficha da loja também têm de vir desta conta: as tuas contas
verdadeiras ficariam públicas. Posso tirá-las eu no tamanho de telemóvel: tu entras
na conta de demonstração no meu browser (eu não escrevo palavras-passe) e eu
fotografo os ecrãs, incluindo os widgets e o registo rápido.

### 7. Ficha da loja (textos prontos)

**Nome:** Money OS

**Descrição breve** (máx. 80 caracteres)
- PT: `Contas, gastos, orçamentos e investimentos num só lugar. Só lê, nunca mexe.`
- EN: `Accounts, spending, budgets and investments in one place. Read-only.`

**Descrição completa — PT**

```
A Money OS junta num só lugar o dinheiro que já tens: contas, dinheiro vivo, gastos, orçamentos, poupanças e investimentos.

• Painel com o património, o mês em curso e o que ainda vai sair e entrar
• Movimentos e categorias, com registo rápido a partir do ícone, de um widget ou da notificação
• Orçamentos, subscrições e dinheiro previsto
• Investimentos: posições, rentabilidade, dividendos e comparação com um índice
• Relatórios de qualquer período, em PDF com gráficos e em CSV
• Importação de extratos bancários
• Widgets no ecrã principal: património, mês, investimentos e mais
• Temas claros e escuros, e um modo privacidade que esconde os valores

A Money OS só lê e organiza: não compra, não vende, não transfere nem levanta dinheiro, e não dá conselhos de investimento. Os teus registos ficam separados dos de toda a gente; podes descarregar uma cópia completa ou apagar a conta quando quiseres.

Sem anúncios e sem rastreio. Código aberto (AGPL-3.0).

Em testes: algumas páginas ainda estão só em inglês.
```

**Descrição completa — EN**

```
Money OS brings the money you already have into one place: accounts, cash, spending, budgets, savings and investments.

• A dashboard with your net worth, this month, and what is still to come in and go out
• Movements and categories, with quick entry from the icon, a widget or a notification
• Budgets, subscriptions and expected money
• Investments: positions, returns, dividends and a comparison with an index
• Reports for any period, as a PDF with charts and as CSV
• Bank statement import
• Home-screen widgets: net worth, the month, investments and more
• Light and dark themes, and a privacy mode that hides the amounts

Money OS only reads and organises: it cannot buy, sell, transfer or withdraw money, and it gives no investment advice. Your records are kept apart from everyone else's; download a full copy or delete your account whenever you like.

No ads and no tracking. Open source (AGPL-3.0).
```

**Imagens:**
- Ícone 512×512: `public/icons/icon-512.png` (já existe).
- Imagem de destaque 1024×500: `docs/play-store/feature-graphic-pt.png` (e
  `feature-graphic-en.png` para a ficha em inglês).
- Pelo menos 2 capturas de ecrã do telemóvel, da conta de demonstração (passo 6).

### 8. Teste fechado (os 12 testadores, 14 dias)

1. Em <https://groups.google.com> cria um grupo, por exemplo `money-os-testadores`,
   e convida as pessoas (precisam de um Gmail e de um telemóvel Android).
   Convida **15 a 20**: a Google exige pelo menos 12 inscritos durante os 14 dias
   seguidos, e há sempre quem saia a meio.
2. Na Play Console: **Testes → Teste fechado → Criar faixa** → países: Portugal (e
   onde mais vivam os testadores) → **Testadores**: o email do grupo.
3. **Criar nova versão** → carrega o `.aab` do passo 3 → notas: "Primeira versão de
   teste." → **Rever e lançar**. A primeira revisão pode demorar alguns dias.
4. Envia aos testadores o **link de participação** que a Play Console mostra. Cada
   um: entra no grupo, abre o link, aceita, instala pela Play Store, cria a sua
   conta e **usa a app** — a Google quer ver uso real.
5. Guarda as opiniões e o que mudaste por causa delas: no fim a Google pergunta.
6. Ao fim de **14 dias seguidos com 12 ou mais inscritos**: **Painel → Pedir acesso
   à produção**.

Mensagem que podes mandar aos testadores:

```
Olá! Estou a testar a minha app de finanças pessoais, a Money OS, e preciso de 12 pessoas durante 14 dias para a pôr na Play Store.
1) Entra neste grupo: <link do grupo>
2) Abre este link no telemóvel e aceita: <link de participação>
3) Instala a Money OS pela Play Store, cria uma conta e usa-a de vez em quando.
4) Ao criar a conta, usa este código de convite (não o partilhes): <código>
Não saias do teste antes dos 14 dias. Diz-me o que achaste!
```

## Atualizar a app depois

- **Mudanças no site** (páginas, contas, relatórios…) chegam à app logo que o site é
  publicado: a app abre o site, não guarda uma cópia dele.
- **Mudanças na parte Android** (widgets, atalhos, notificações) precisam de versão
  nova: eu aumento o `versionCode`, tu corres `CRIAR_APP_PLAY_STORE.cmd` e carregas o
  ficheiro numa nova versão na Play Console.
- O endereço `money-os-brown.vercel.app` fica dentro da app. Se um dia passares para
  um domínio teu, é preciso uma versão nova da app (e voltar a entrar).

## O que ainda falta antes de abrir a toda a gente (produção)

Para o teste fechado chega o que está acima. Antes do pedido de produção:

- **Proteção na criação de conta:** hoje há limites globais (5 por hora, 20 por dia,
  `MAX_ACCOUNTS` no total). Falta limitar por endereço e uma verificação anti-robô,
  para alguém não esgotar as vagas de propósito.
- **Registo de erros** (hoje só os registos curtos da Vercel) e **cópias de segurança**
  além do histórico da Neon.
- **Traduções** das páginas e dos textos da própria app Android (notificações,
  widgets): em curso (F18); falta a revisão de linguagem antes de as dar como
  completas.
- A página **No telemóvel** ainda diz que os widgets são de uma app instalada por
  ficheiro; muda quando a app estiver na loja.
- **Revisão por um jurista** dos textos de privacidade e termos
  (`docs/LEGAL_SECURITY_CHECKLIST.md`).
