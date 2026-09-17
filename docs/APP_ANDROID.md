# App Android — o site no telemóvel

Decidido a 13 de setembro de 2026: para já, a app do telemóvel é **o próprio site**,
aberto a partir do PC, com todas as funcionalidades e os mesmos temas. No telemóvel,
cada página abre com o essencial, e o resto fica fechado a um toque. A navegação e os
ecrãs de uso diário têm uma disposição própria para larguras pequenas.

Isto é o caminho A. O caminho B (o site a correr dentro do telemóvel, com os dados
cifrados só lá) continua no [PLANO_MOBILE.md](PLANO_MOBILE.md), e a app em `mobile/`
é a base dele. As duas apps têm identificadores diferentes e podem estar instaladas ao
mesmo tempo.

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
