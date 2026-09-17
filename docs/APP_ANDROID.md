# App Android — o site no telemóvel

Decidido a 13 de setembro de 2026: para já, a app do telemóvel é **o próprio site**,
aberto a partir do PC, com todas as funcionalidades e os mesmos temas. No telemóvel,
cada página abre com o essencial, e o resto fica fechado a um toque. A navegação e os
ecrãs de uso diário têm uma disposição própria para larguras pequenas.

Isto é o caminho A. O caminho B (o site a correr dentro do telemóvel, com os dados
cifrados só lá) continua no [PLANO_MOBILE.md](PLANO_MOBILE.md), e a app em `mobile/`
é a base dele. As duas apps têm identificadores diferentes e podem estar instaladas ao
mesmo tempo.

**Versão atual da app: 0.7.0** (17 de setembro de 2026). Resumo do que tem: o site
completo, disposição própria no telemóvel com modos Simple e Complex, registo rápido
a partir de widget, atalhos do ícone, definições rápidas e notificação, nove
widgets com valores e alertas como notificações. Detalhes nas secções abaixo.

**Para atualizar a app no telemóvel:** reinicia o site no PC (`SITE_PARA_TELEMOVEL.cmd`)
e instala o APK novo por cima do antigo (passos 2 e 3). Mantém-se o endereço, a sessão
e os widgets já colocados; um widget cujo formato mudou (como o Investments na 0.6.0)
deve ser retirado e colocado outra vez.

## Como usar

1. **No PC**, abre `SITE_PARA_TELEMOVEL.cmd` (duplo clique na pasta do projeto). Prepara
   a versão mais recente do site, põe-no a correr e mostra o endereço a usar, por
   exemplo `http://192.168.1.129:3000`. Na primeira vez o Windows pergunta se o Node.js
   pode usar a rede: escolhe **Redes privadas** e **Permitir**. Deixa a janela aberta.
2. **Passa a app para o telemóvel**, com o cabo USB:
   - Liga o telemóvel ao PC e desbloqueia-o.
   - No telemóvel, puxa a barra de notificações, toca na notificação do USB ("A
     carregar este dispositivo via USB") e escolhe **Transferência de ficheiros**.
     Enquanto estiver só a carregar, o Explorador do Windows mostra o telemóvel com a
     pasta vazia.
   - No Explorador: **Este PC → (o teu telemóvel) → Armazenamento interno → Download**.
   - Arrasta para lá o ficheiro
     `C:\Users\joao2\Projects\money-os\android-shell\app\build\outputs\apk\debug\app-debug.apk`.
     Não está no Git: é o resultado de compilar (ver "Compilar", abaixo).
3. **Instala-a no telemóvel**: abre o **Gestor de ficheiros** → **Transferências** →
   toca em `app-debug.apk`. O Android pede para autorizar o Gestor de ficheiros a
   instalar apps desconhecidas; autoriza e carrega em **Instalar**. Os telemóveis Xiaomi
   e POCO podem mostrar ainda um aviso de segurança antes de instalar.
4. Abre a app **Money OS**, escreve o endereço do passo 1 e inicia sessão com a
   palavra-passe do site.

O telemóvel tem de estar no mesmo Wi-Fi que o PC. Se o PC mudar de endereço, a app
mostra "Sem ligação ao Money OS" com o botão **Mudar endereço**.

No PC, o endereço é **http://localhost:3000**, incluindo `:3000`.
O arranque usa `scripts/start-phone-site.ps1`: substitui uma instância antiga
identificada como sendo deste projeto antes de compilar, recusa parar outros
programas na porta 3000 e impede dois arranques simultâneos. Se falhar, a janela
fica aberta com o erro e o registo fica em `.local-checkpoints/site-startup.log`.

## O que a app faz

Para atualizar o site no telemóvel: fecha a janela antiga do site no PC, abre
`SITE_PARA_TELEMOVEL.cmd`, espera por "Ready" e deixa a janela aberta. No telemóvel,
fecha a app na lista de aplicações recentes e volta a abri-la. Não é necessário
reinstalar o APK nem terminar sessão.

Para terminar sessão: **More → Log out**, no fim do menu. Na versão anterior sem
barra inferior, o menu abre pelo botão ☰. O botão Log out está disponível depois
de atualizar o site. Termina a sessão neste aparelho, sem apagar os dados financeiros.

A pasta `android-shell/` é uma app Android mínima, em Java e sem bibliotecas: um único
ecrã com o site em ecrã inteiro. Nada financeiro fica guardado nela. Acrescenta o que um
separador do browser daria:

- **Escolher ficheiros** para importar extratos e backups.
- **Guardar exportações** (CSV, JSON, backups) na pasta Transferências. O site cria
  estes ficheiros como *blobs* e liberta-os logo a seguir, e uma WebView não os guarda
  sozinha; o `shell.js` segura cada ficheiro o tempo suficiente e passa-o à app.
- **Voltar** com o gesto do Android, página a página.
- **Ligações para outros sites** (corretoras, TradingView) abrem no browser, fora da app.
- A cor das barras do sistema segue o tema do site.

## Compilar

Com o Android SDK instalado. O JDK 17 é definido só para este comando, sem mudar o Java
da faculdade:

```bat
cd /d C:\Users\joao2\Projects\money-os\android-shell
set "JAVA_HOME=C:\Users\joao2\AppData\Local\Programs\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
gradlew.bat assembleDebug
```

O `local.properties` (fora do Git) aponta para o SDK com barras normais:
`sdk.dir=C:/Users/joao2/AppData/Local/Android/Sdk`. Com barras invertidas por escapar,
o Gradle falha com "A sintaxe do nome do ficheiro… é incorreta".

## Telemóvel mais simples: painéis

### Dois modos no telemóvel

No topo de cada página podes escolher **Simple** ou **Complex**. O Complex
mantém a interface anterior e é a opção inicial. A escolha fica guardada neste
navegador/app; no PC continua a aparecer a interface completa.

O Simple mostra três indicadores principais no início, atalhos para o dia a dia,
contas mais compactas e movimentos com o valor em destaque. **Add entry** fica no
centro da barra inferior. Investimentos e as outras páginas continuam em **More**.
Gráficos, indicadores adicionais e ferramentas abrem pelos respetivos botões.

Os valores e os cálculos são os mesmos. As escolhas de painéis e secções abertas
ficam separadas entre modos, para regressar ao Complex sem perder a organização.
Os avisos de estado das contas continuam visíveis no Simple.

A interface usa inglês nos dois modos. No telemóvel, as tabelas largas mostram
cada registo em campos identificados, organizados verticalmente, e os separadores
distribuem-se por várias linhas. Não é necessário deslizar para os lados para
chegar às colunas. No computador mantém-se a tabela completa.

- Barra inferior com Home, Accounts, Cash flow, Invest e More. More abre o menu
  completo; os atalhos identificam também as subpáginas da sua secção.
- Botão **Add entry** ao alcance do polegar, com formulário aberto a partir da
  parte inferior do ecrã. Mantém o registo rápido e a opção de desfazer existentes.
- Contas e movimentos apresentam os mesmos dados em cartões com rótulos no
  telemóvel, mantendo as tabelas no PC. Os filtros de movimentos abrem num botão.
- O património total ganha destaque no dashboard. Cabeçalhos dos painéis são
  clicáveis e os controlos, alertas e campos dos orçamentos cabem no ecrã.
- Estas alterações chegam ao telemóvel ao reiniciar o site no PC com
  `SITE_PARA_TELEMOVEL.cmd`; não exigem recompilar o APK.

- `PanelFrame` e `Section` aceitam `essential`. Num ecrã com menos de 768 px só os
  painéis essenciais abrem; os outros começam fechados. A regra está em
  `src/lib/ui/panels.ts` (`startsCollapsed`), com testes: uma escolha já feita no
  aparelho ganha sempre, e `essential` nunca abre o que o PC mantém fechado.
- `MobileFold` dobra no telemóvel blocos que não são painéis — o gráfico, a auditoria e
  as ferramentas de preços em Investments, os formulários do Cash Flow (o botão + já
  regista movimentos). No PC não desenha nada de seu.
- Essenciais por página: Accounts, How this account has moved, Priority (buckets),
  This month (dashboard), Still coming, Accruing right now, Investment returns, Price
  history, Debts, Spot balances / Your own positions / Position detail, How the money
  has moved e Saving & spending, Active (subscrições), totais e histórico em Savings, e
  o manual inteiro (o índice precisa das secções abertas).

### Ecrãs com versão própria no telemóvel

- **Trade history:** resumo, filtros, Daily P&L calendar, Account & P&L evolution e
  Result by kind of trade abertos; os outros gráficos começam minimizados; trades em
  cartões, 15 de cada vez.
- **Dividends:** cartão com o total, pagadores em cartões, pagamentos por mês.
- **Open positions:** posições abertas primeiro, em cartões. Em Simple ficam só o
  valor, o P&L e a liquidação — sem tags nem preços para editar.
- **Connections:** cartão curto com plataforma, estado, valor, última sincronização e
  Sync now; o resto, incluindo Remove, em **Details**.
- **Playlists:** cada playlist abre com as posições que tem.

### Registar um gasto sem abrir a app primeiro (versão 0.2.0)

- **Widget:** toca sem largar num espaço vazio do ecrã principal → **Widgets** →
  **Money OS** → arrasta **Registo rápido** para o ecrã. Tem os botões **− Despesa** e
  **+ Receita**.
- **Atalhos:** toca sem largar no ícone da Money OS → **Despesa** ou **Receita**. Podes
  arrastar um atalho para o ecrã principal.
- **Notificação:** na app, **Settings → Quick entry notification**. Fica na barra de
  notificações com **Despesa** e **Receita**. O Android pede autorização da primeira vez;
  se a recusaste, a app abre as definições de notificações. Volta depois de reiniciar o
  telemóvel; desliga-se no mesmo sítio.

Todos abrem a app diretamente no formulário de registo rápido, já em despesa ou
receita. Nada é gravado sem carregar em **Save**, por isso o desfazer e a proteção
contra registos repetidos continuam a valer. Com a sessão terminada, abre o login.
Continua a precisar do PC ligado e do mesmo Wi-Fi.

Como funciona: `QuickEntry.java` cria os `PendingIntent` (ação
`com.joaonovais.moneyos.site.QUICK_ENTRY`, extra `quick`), `QuickEntryWidget.java` é o
widget, `res/xml/shortcuts.xml` os atalhos e `QuickEntryRestore.java` repõe a
notificação no arranque. A `MainActivity` (agora `singleTask`) guarda o pedido e, quando
a página do site acaba de carregar, deixa-o em `window.__moneyOsQuickEntry` e envia o
evento `money-os:quick-entry`; o `QuickEntry.tsx` abre o formulário. O interruptor em
Settings (`PhoneQuickEntrySettings.tsx`) só aparece dentro da app e usa a ponte
`MoneyOSAndroid.setQuickNotification`.

**Para atualizar a app no telemóvel** é preciso instalar o APK novo por cima do antigo
(os passos 2 e 3 de "Como usar"); os dados e a sessão mantêm-se.

### Widgets com valores e botões nas definições rápidas (versão 0.3.0)

**Widgets** (toca sem largar no ecrã principal → **Widgets** → **Money OS**):

| Widget | Mostra | Ao tocar abre |
| --- | --- | --- |
| **Money OS** | Património, saldo deste mês e a linha do património | Dashboard |
| **Net worth** | Património, variação desde o início do registo e o gráfico maior | Analytics |
| **Where the money is** | Donut com os 4 sítios com mais dinheiro, o resto em "Other", e percentagens | Dashboard |
| **Cash flow** | Saldo do mês, entradas e saídas, e as duas barras | Cash flow |
| **Investments** (0.6.0) | Valor da carteira, P&L não realizado (€ e %) e **todas as posições** numa lista que desliza dentro do widget, cada uma com valor, P&L em euros e em % (retorno sobre o custo; "—" quando não há custo medido) | Investments |
| **Allocation** (0.5.0) | Donut da carteira por tipo de ativo, com percentagens | Investment Analysis |
| **Winners & losers** (0.5.0) | Melhores e piores posições pelo retorno sobre o custo, em % e em dinheiro; mais linhas quando o widget é mais alto | Investments |
| **Dividends** (0.5.0) | Total recebido, este ano (valor e pagamentos) e o próximo pagamento estimado | Dividends |
| **Open trades** (0.5.0) | P&L não realizado das posições alavancadas, número e margem usada, e cada trade com lado, alavancagem e P&L | Open positions |

- Atualizam sozinhos de 30 em 30 minutos (o mínimo que o Android deixa), ao sair da
  app e ao tocar em **↻**.
- Em baixo dizem de quando são os valores. Fora de casa mostram os últimos valores
  lidos, com a hora ("Offline · figures from …"). Sem sessão: "Open the app and log in".
- Os valores ficam visíveis no ecrã principal para quem desbloquear o telemóvel.
- Na lista de widgets cada um aparece com uma imagem de exemplo e uma descrição. Sem
  isso o launcher desenhava o próprio widget ainda sem valores — uma caixa escura
  igual para todos. As imagens estão em `res/drawable-nodpi/widget_preview_*.png` e
  são desenhadas com o Edge a partir de `android-shell/previews/previews.html`
  (`render-previews.cmd`); ao mudar um widget, mudar também a imagem.

**Definições rápidas** (onde estão a lanterna e o Wi-Fi): puxa o painel até ao fim,
toca no lápis ✏️ e arrasta para cima:

- **Record expense** — abre o registo rápido numa despesa.
- **Net worth** — mostra o património por baixo do nome; com o telemóvel bloqueado
  mostra "Unlock to see". Ao tocar abre o dashboard.

Como funciona: o site tem a rota `GET /api/widget` (atrás da sessão, como as páginas)
com património, a linha do património (até 60 pontos), os sítios com mais dinheiro e
entradas/saídas do mês, todos na moeda base e calculados pelas mesmas funções do
dashboard (`src/lib/widgets/summary.ts`, com testes). A app pede-a com o cookie da
WebView (`WidgetData.java`), guarda a última resposta nas preferências da app e desenha
os gráficos em `Charts.java`; `MoneyWidgets.java` tem os widgets, `PositionsListService.java` as linhas da lista do Investments e `Tiles.java`
os dois botões. **Isto é a única coisa financeira guardada no telemóvel:** os últimos
valores dos widgets.

### Alertas como notificações (versão 0.7.0)

**Ligar:** na app, **Settings → Alerts on this phone → Alert notifications**. Na
primeira vez o Android pergunta se a Money OS pode enviar notificações: **Permitir**.
Se já tiver sido recusado, a app abre as definições de notificações do Android.

- Chega uma notificação para o que o sino do site mostraria e merece interromper: um
  orçamento ultrapassado ou a gastar depressa demais, uma subscrição a cobrar nos
  próximos 3 dias ou com uma cobrança por confirmar, um saldo manual sem atualizar há
  60 dias, uma ligação a falhar, um preço da watchlist atingido. Não notifica "valor
  sem tipo de ativo", que fica só no sino.
- **Cada alerta uma vez.** Se o afastares não volta enquanto o site o continuar a
  reportar. Quando o problema se resolve a notificação desaparece; se voltar a
  acontecer, notifica outra vez.
- Tocar abre a página do alerta (Budgets, Subscriptions, a conta, Connections…).
- No ecrã bloqueado aparece só "Money OS — Something needs your attention", sem valores.
- **Verifica cerca de 30 em 30 minutos** (o Android decide o momento exato e pode
  atrasar com a bateria em poupança) e ao ligar o interruptor. Continua depois de
  reiniciar o telemóvel.
- **Só ouve enquanto chega ao PC**: mesmo Wi-Fi, PC ligado e site a correr. Fora de
  casa não chega nada — nem um aviso antigo.

Como funciona: o site tem `GET /api/alerts` (atrás da sessão), a lista do sino
filtrada por `shouldNotify` em `src/lib/alerts/rules.ts`. A app (`Alerts.java`) pede-a
com o cookie da WebView através de `Site.java` num `JobService` periódico, guarda os
ids já notificados e publica cada alerta novo com o id como etiqueta. A decisão fica
no site; a app não tem regras próprias. Não há serviço de push nem email: nada sai do
PC e do telemóvel.

### Chaves das corretoras

A app não guarda chaves. Estão na base de dados do site, cifradas, e só se decifram
com a `ENCRYPTION_KEY` do `.env` do PC. Chaves só num dispositivo existem apenas na
app separada `mobile/` (tarefa E02).

## Correções para http na rede local

O telemóvel chega ao site por `http://192.168.…`, que para o browser não é um
"contexto seguro". Três funções do browser não existem aí, e três ecrãs falhavam:

- `crypto.randomUUID` — o botão + e os formulários de cashback. Agora
  `src/lib/money/quickEntryId.ts`.
- `navigator.clipboard` — os botões de copiar o prompt de conversão. Agora
  `src/components/copyText.ts`.
- `crypto.subtle` — a impressão digital dos ficheiros importados. Agora
  `src/lib/hash/sha256.ts`, que dá o mesmo resultado que o do browser, testado contra o
  do Node.

## Limites

- **Só funciona em casa**, no mesmo Wi-Fi, com o PC ligado e o `.cmd` a correr.
- **O tráfego na rede local não é cifrado** (http). Quem estiver no mesmo Wi-Fi e o
  quiser ler consegue ver as páginas e a palavra-passe no login. Numa rede de casa é
  aceitável; numa rede partilhada não. Pôr o site na internet exige https e o limite de
  tentativas no login, que ainda não existe.
- Sem internet ou sem o PC, a app não mostra nada: não há modo offline.
- É uma build de depuração, não assinada para a Play Store.
