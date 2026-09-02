# Money OS — o que faz e o que falta

Estado a 1 de setembro de 2026. 1895 testes em 98 ficheiros, 37 migrations,
41 tabelas, 92 módulos de lógica, 30 módulos de acesso a dados, 33 páginas.

Este documento é para ti, não para mostrar a ninguém. Inclui as limitações e as
coisas que estão mal, porque a lista do que falta só é útil se for honesta.

> **Mantém isto atualizado.** Durante uma semana este ficheiro listou como
> pendentes o câmbio histórico e os preços automáticos, ambos já construídos —
> e isso levou a que fossem propostos outra vez como trabalho a fazer. Um
> documento que mente sobre o que está feito é pior do que não existir: manda-te
> resolver problemas resolvidos.

Para saber **como se usa** cada ecrã, o manual está dentro da app, em
`/manual`. Este ficheiro é o estado do projeto, não as instruções.

---

## O princípio que manda em tudo

A app separa **dinheiro garantido** de **dinheiro exposto ao mercado**, e nunca
os mistura num número só sem dizer.

Isto veio de uma coisa que disseste no início: *dinheiro investido não é
garantido*. Toda a arquitetura pende sobre isso. Por isso o menu tem uma secção
chamada "Não garantido", por isso o Net Worth mostra sempre a parte flutuante
entre parênteses, e por isso os investimentos vivem num módulo à parte da
contabilidade.

Nos cartões do painel, os parênteses passaram a mostrar o **ganho ou perda não
realizado** em vez da parte flutuante. A razão é prática: numa carteira toda
investida os dois números eram o mesmo, e `629,67 € (629,67 €)` não diz nada. O
que não é garantido continua lá, na linha por baixo, a âmbar — o princípio não
mudou, mudou onde está escrito.

O segundo princípio é derivado do primeiro: **o mesmo dinheiro nunca pode ser
contado duas vezes.** Isto falhou cinco vezes durante o desenvolvimento, sempre
de maneira diferente, e é a razão pela qual existe um único ficheiro
(`src/lib/accounting/networth.ts`) que define o que é património. Todas as
páginas leem de lá. Não há uma segunda fórmula em lado nenhum.

---

# PARTE 1 — O que a app já faz

## Contas

Contas bancárias, corretoras, exchanges, dinheiro físico. Cada uma tem a sua
própria moeda; só os totais somados é que são convertidos.

- **Reconciliação assistida.** Ao atualizares o saldo real, classificas a
  diferença: juros, receita, despesa, depósito, levantamento ou correção. A
  classificação tem consequências contabilísticas reais — não é só um registo.
  "Correção" é o caso "enganei-me a apontar", e não cria movimento nenhum.
- **Estados**: RECONCILED, STALE (saldo velho), OVERALLOCATED (prometeste a
  buckets mais do que tens).
- **Arquivar** preserva o histórico; **apagar** só é oferecido para contas
  a que nada aponta.
- **Limpeza de contas vazias.** Contas deixadas para trás por tentativas de
  ligação falhadas, listadas com nome e apagáveis em bloco. Uma conta só conta
  como vazia se não tiver saldo, transações, posições, alocações, ligações,
  imports nem snapshots.
- **Filtros e ordenação** no Dashboard: pesquisa, tipo, moeda, só sincronizadas,
  esconder vazias. Ordena pelo **valor convertido**, não pelo número em bruto.

## Buckets (dinheiro com objetivo)

Dinheiro real posto de lado dentro de uma conta. Faz parte do património.

- Objetivo em valor, com indicador quando é atingido.
- **Plano por percentagem**: dizes 25% para X, 30% para Y, e a app mostra o
  desvio e tem um botão para aplicar.
- Ajuda a manter a soma nos 100% — quando mexes numa percentagem, sugere ajustar
  as outras em vez de te deixar criar um plano impossível.
- Aviso de sobre-alocação quando prometes mais do que a conta tem.

## Orçamentos (limites de gasto)

Limite mensal por categoria de despesa. **Não é a mesma coisa que um bucket** e
a app insiste nisso: um bucket é dinheiro que existe, um orçamento é uma
intenção. Um orçamento não move nem guarda nada, e passar do limite não te custa
nada além de saberes que passaste.

- Uma linha por categoria por mês, para que editar dezembro não reescreva aquilo
  contra o qual novembro foi julgado.
- Barra de progresso com **marca vertical a mostrar onde vai o mês** — 80% gasto
  no dia 10 é um problema, no dia 28 é normal.
- Aviso de "à frente do ritmo", calado no início e no fim do mês, onde não
  serve de nada.
- Separa gastos **sem categoria** de gastos **em categorias sem limite**. São
  problemas diferentes e pedem ações diferentes.
- Copiar limites do mês anterior, sem sobrepor o que já lá está.

## Subscrições

O que sai todos os meses aconteça o que acontecer.

- Cadências semanal, mensal, trimestral e anual, normalizadas para custo mensal
  e anual. Semanal conta 52 pagamentos, não 48.
- Ordenadas por **custo anual**, não pelo valor da cobrança: 25 €/mês custa mais
  que 99 €/ano, mas ordenar pelo valor cru põe os 99 € à frente.
- Próxima cobrança rola sozinha para a frente; o dia 31 encolhe para o último
  dia dos meses curtos, como fazem os emissores dos cartões.
- Cancelar **não apaga** — fica o registo do que deixaste de pagar, e a app
  lembra-te de confirmar no extrato daí a um mês.
- Nada disto entra em nenhum total. Uma subscrição é uma *previsão*; a cobrança
  real chega como transação normal e é contada aí.

## Cash Flow

Receitas, despesas e transferências entre contas próprias.

- Categorias e subcategorias, criadas e geridas por ti.
- Transferência é um par ligado de transações, não uma despesa mais uma receita
  soltas.
- Tags por transação.
- Edição e remoção com confirmação.

## Importar extratos

O problema: cada banco escreve um ficheiro diferente, e ler diretamente as
contas precisa de licença de Open Banking. O tier gratuito em que projetos
pessoais se apoiavam (Nordigen) fechou.

A solução: a app fixa **um** formato e dá-te uma instrução que converte
qualquer coisa nesse formato.

- Instrução gerada com **as tuas categorias e a tua moeda** já lá dentro.
- Proíbe explicitamente as três coisas que estragam um import em silêncio:
  separador de milhares, cercas de markdown à volta da resposta, e valores sem
  sinal. E proíbe inventar, juntar ou "corrigir" linhas.
- Deteta a cerca ``` esquecida no ficheiro e diz-te exatamente isso.
- **Um ficheiro nunca cria uma categoria nova.** Se o AI escrever "Groceries"
  onde tens "Food", fica em branco. Já foi preciso limpar 48 categorias
  duplicadas neste projeto uma vez.
- Uma categoria só é aplicada se pertencer ao lado certo do registo: "Salário"
  numa despesa é ignorado.
- Pré-visualização de todas as linhas antes de escrever fosse o que fosse, com
  duplicados e ilegíveis marcados.
- **Undo por ficheiro** — remove todas as transações que vieram daquele import.
- Também aceita o CSV do próprio banco com mapeamento manual de colunas, e
  suporta colunas débito/crédito separadas ou uma coluna assinada.
- O parser de valores aguenta `1.234,56`, `1,234.56`, menos à direita,
  parênteses e símbolos de moeda. As datas são dia-primeiro (europeu) e rejeitam
  31 de fevereiro.

## OKX, e a terceira credencial

O sétimo connector. Lê a conta de negociação e usa o `eqUsd` que a própria OKX
publica por moeda — em vez de ir buscar preços, o que é uma chamada a menos e
garante que a app e o ecrã da OKX não podem discordar sobre quanto vale uma
posição.

**Trouxe uma mudança de esquema.** A OKX e a KuCoin emitem *três* coisas: chave,
segredo e uma passphrase escolhida ao criar a chave, exigida em cada pedido
assinado. A app só guardava duas. Há agora uma coluna `encrypted_passphrase`,
encriptada como o segredo, em coluna própria e não empacotada dentro dele — um
blob com estrutura escondida lá dentro é uma coisa que ninguém consegue
consultar e toda a gente se esquece de desembrulhar.

**A armadilha desta API:** o `code` é uma *string* e o sucesso é `"0"` — que em
JavaScript é *truthy*. `if (!code)` é falso no sucesso e falso na falha;
`if (code)` é verdadeiro nos dois. Só uma comparação explícita acerta, e a
resposta errada aqui é uma conta que parece não ter nada. Confirmado contra a API
real: um pedido bom responde `code: "0"`, um mau responde `code: "51000"`.

Lê a conta de negociação. A Funding é uma conta separada na OKX com endpoint
próprio, e o ecrã de ligação diz isso.

## Corretoras por extrato

Para **corretoras**, ao contrário das exchanges, quase nenhuma dá API de leitura
a pessoas singulares: eram a IBKR e a Trading 212, e ambas já estão ligadas. A
Degiro não tem API pública, e os clientes que existem são engenharia inversa
sobre o login — mesma objeção da Trade Republic. A Revolut e os bancos passam por
PSD2 e exigem licença AISP.

O caminho que funciona é o extrato, e o importador aprendeu três coisas:

**Os nomes das colunas noutras línguas.** Uma corretora exporta na língua da
conta: a Degiro escreve "Data" e "Quantidade" a um português e "Datum" e
"Aantal" a um holandês. As palavras de *tipo* já estavam traduzidas em seis
línguas há muito; os *títulos das colunas* não estavam, portanto um ficheiro cujo
conteúdo a app sabia ler era recusado pelos cabeçalhos.

**Palavras de tipo na ordem em que a corretora as escreve.** A Revolut escreve
"BUY - MARKET", que depois de tirar a pontuação fica BUYMARKET — e a tabela só
tinha MARKETBUY. A mesma palavra na outra ordem é a mesma palavra.

**Ficheiros sem coluna de tipo nenhuma.** O extrato de transações da Degiro não
tem: uma compra é quantidade positiva e uma venda é negativa, e não há mais nada
na linha que diga qual. Agora o sinal é lido — mas só em último recurso, só se o
ficheiro tiver coluna de ISIN (que é o que o marca como negociação e não como
despesa), e o ecrã diz quantas linhas vão ser tipadas assim **antes** de
importares. Uma linha sem quantidade — um depósito, uma taxa, um dividendo — não
é adivinhada: é reportada como ilegível.

> **Aviso honesto:** estes formatos foram escritos a partir da forma documentada
> de cada extrato, não de ficheiros reais passados pela app. Provam que o
> importador aguenta a *forma*; um ficheiro a sério continua a ser o que
> encontra o detalhe em que ninguém pensou.

## Investimentos

Módulo separado da contabilidade, de propósito.

- Posições com símbolo, quantidade, preço de entrada, P&L calculado.
- **Long e short.**
- **Reforçar** (preço médio recalculado) e **vender parcialmente** (P&L
  realizado guardado à parte do não realizado — uma estimativa nunca é misturada
  com dinheiro que saiu mesmo da mesa).
- **Tags de alocação** em quatro eixos: risco, retorno esperado, horizonte
  temporal, liquidez.
- **Tipos de ativo**: cash parado, stablecoin, staking, cripto, ações, ETF,
  obrigações, imobiliário, outro. APR só aparece nos tipos que rendem.
- Ligação a uma conta existente — a conta é uma *etiqueta de localização*, o
  saldo dela é cash parado e as posições são contadas por cima, sem sobreposição.
- **Playlists**: grupos de posições que tens.
- **Watchlist**: coisas que não tens, com preço-alvo e notas.

## O que deves (passivos)

O maior erro conceptual que a app teve, e não foi um teste que o apanhou — foi
ler uma lista do que uma app de finanças deve fazer.

Durante meses a app somou **ativos** e chamou ao resultado património. Isso está
certo para quem não tem hipoteca, crédito automóvel nem saldo de cartão, e
errado para quase toda a gente — e o erro corria na direção lisonjeira.

O `computeNetWorth` reporta agora `assets`, `liabilities` e um `total` que é a
diferença. Dever mais do que se tem aparece como negativo, não é limado a zero.

Duas decisões dentro disso:

- **A dívida sai do número de topo e de mais nada.** O `cash`, a carteira e o
  `guaranteed` continuam a descrever só os ativos — uma hipoteca não torna o
  dinheiro na conta menos gastável.
- **As fatias de propósito somam aos ativos, não ao património.** Uma hipoteca
  não é um quinto propósito que o dinheiro serve; é dinheiro que não se tem.
  Subtraí-la lá encolheria o "livre para gastar" pelo empréstimo inteiro — o
  conselho errado no dia em que há prestação para pagar.

**A armadilha que isto podia ter criado:** as contas podem ficar negativas, por
decisão, porque cartões e descobertos ficam mesmo. Esse saldo já reduziu o
património uma vez. Por isso cada dívida declara se já é um saldo negativo numa
conta — mesma regra do `balanceMeaning`, aplicada ao outro lado do balanço.

A página diz o que um saldo não diz: quanto custa dever por mês, e quando a
dívida acaba. O `payoffMonths` devolve **"nunca"** em vez de um número enorme
quando o pagamento só cobre os juros — a armadilha do pagamento mínimo é
*nunca*, e "417 anos" faria isso parecer muito tempo.

## Retorno a sério: TWR e TIR

Lucro sobre o custo deixa de ser um retorno assim que entra ou sai dinheiro:
depositar 500 € torna a carteira maior sem nada ter desempenhado. Duas medidas
agora, lado a lado, e nenhuma é chamada *o* retorno — respondem a perguntas
diferentes e discordarem é o caso normal.

- **TWR** (time-weighted) retira depósitos e levantamentos. Responde a *"as
  minhas escolhas foram boas?"*.
- **TIR** (money-weighted, o XIRR de uma folha de cálculo) mantém-nos. Responde
  a *"como é que o meu dinheiro se portou?"*.

**Ambas se recusam a responder nesta conta, e esse é o resultado que interessa.**

A primeira execução deu um TWR de **+8091% em 18 dias**. A matemática estava
certa: a série de valor começa a 7 de agosto porque foi quando as contas foram
ligadas, e a app a ser preenchida leu-se como uma carteira a multiplicar. E a
TIR nem se resolvia — contribuições líquidas de **−46 €** contra uma carteira de
**730 €**, aritmeticamente impossível, porque os depósitos de três plataformas
não estão registados em lado nenhum.

Dois guardas, cada um testado:

- `historyLooksLikePerformance` rejeita uma série que começa abaixo de um quinto
  do próprio pico. Nada nos dados distingue uma carteira a crescer de uma app a
  ser preenchida — ambas são "o valor subiu" — por isso a regra é a forma.
- `contributionsExplainValue` rejeita a TIR quando o que entrou não explica o que
  se tem. Um registo incompleto de contribuições não é uma imprecisão pequena
  nesta métrica; é outra pergunta a ser respondida.

Onde falta número, a página escreve **"Not measurable yet"** com a razão, nunca
um traço — um traço lê-se como zero, e zero é uma medição.

**O que os faz aparecer**, sem mais trabalho: o TWR assim que houver um período
de histórico que comece com a carteira já completa; a TIR quando os depósitos
das outras plataformas estiverem registados.

## Contra o mercado

O TWR ao lado do que o índice fez **na mesma janela**, com a diferença em pontos
percentuais e as duas linhas sobrepostas, ambas a começar em 100.

Três decisões que decidem se isto é honesto:

**Compara-se o TWR, nunca o património.** O património sobe quando pões dinheiro
lá dentro e um índice não tem acontecimento equivalente — sobrepor os dois faria
um depósito parecer um dia em que bateste o mercado. A linha da carteira é a do
retorno com depósitos e levantamentos removidos, que é a mesma coisa que o nível
de um índice é.

**A janela é a que o teu retorno cobre, não a do índice.** Se a série do índice
não chega ao início do teu histórico, a app recusa em vez de comparar onze meses
de mercado contra dois da carteira e apresentar a diferença como desempenho.

**O proxy é um ETF de acumulação, e isso é a parte que carrega o peso.** Não há
série gratuita do "S&P 500 com dividendos", mas há do ETF que o segue — e a
classe de ações importa mais do que o índice. Um fundo de acumulação reinveste
os dividendos por dentro, portanto o preço dele *é* uma série de retorno total.
Um de distribuição perde o dividendo no preço a cada pagamento, o que subavaliaria
o índice em cerca do rendimento dele todos os anos: uns dois pontos num tracker
mundial, pequeno o suficiente para parecer certo e grande o suficiente para
inverter o veredicto. A app mostra o símbolo que cotou, para poderes conferir.

S&P 500 via SXR8.DE e MSCI World via EUNL.DE, ambos em euros na Xetra — o que
evita precisar de uma série histórica de câmbios que a app não guarda. A série
fica guardada na base de dados; um refresh falhado deixa o gráfico de ontem de
pé em vez de o esvaziar.

## Alertas

A app sempre soube que um orçamento estourou, que uma subscrição cobra amanhã,
que um saldo não é confirmado há dois meses, que uma sincronização está a
falhar. Nunca dizia nada.

O motor decide; o canal por onde te chega é outra pergunta e ainda não está
respondida. Por agora é um sino na barra de topo, que **só existe quando há algo
a dizer** — um ícone sempre presente e quase sempre vazio ensina-te a ignorá-lo.

Três regras moldaram os limiares:

- **Um alerta tem de ser acionável.** "A carteira mexeu 3%" é um facto, não um
  alerta.
- **O silêncio é o estado normal.** O contador conta só crítico e aviso; uma
  subscrição a cobrar sexta pertence à lista, não a um número que significa
  "algo está mal".
- **Um alerta não pode ser uma segunda opinião.** Lê pelas mesmas funções que as
  páginas, nunca com consultas próprias.

E os limiares, que são juízos: o ritmo do orçamento só dispara depois de 1/5 do
período; as subscrições avisam a 3 dias e não a 1, para dar margem de cancelar;
um saldo manual fica velho aos 60 dias e não aos 30; uma ligação que **nunca**
sincronizou não diz nada, porque acabaste de a criar.

## Telemóvel: instalável

O esqueleto era `w-56 shrink-0` a qualquer largura, o que num ecrã de 375px
deixava **87px** para o conteúdo. Agora é uma barra fixa acima dos 768px e uma
gaveta abaixo, com fundo escurecido, fecho por Escape, por toque fora, por botão
e ao navegar.

Com `manifest.webmanifest`, ícones desenhados a partir da marca, `apple-touch-
icon` e área segura para o entalhe, a app **instala-se no ecrã principal**.

O service worker **não guarda nada em cache** — nem uma página, nem uma resposta
da API. Cada ecrã é um número lido ao vivo, e um património servido de cache é
indistinguível de um atual. Existe só para que tocar no ícone sem ligação abra
uma página que explica, em vez do erro do browser.

**Dois obstáculos que ninguém adivinharia**, ambos resolvidos e ambos registados
porque voltarão a morder: o manifest, o service worker, a página offline e os
ícones estavam atrás do redirecionamento de login e devolviam 307, o que impedia
a instalação por completo; e `md:hidden` **não funciona** num `.icon-btn`, porque
o `globals.css` define `display` depois do import do Tailwind e ganha por ser
mais tardio.

## Preços automáticos

Construído depois da primeira versão deste documento, que o listava como falta.

Posições em ações e ETFs são avaliadas a partir do **ISIN**, sem teres de
escrever preços à mão. A cadeia é ISIN → símbolo → cotação, e tem três
verificações, cada uma existente porque faltou uma vez:

1. **A moeda tem de vir declarada e bater certo.** A primeira versão deixava
   passar qualquer resposta que omitisse o campo. Um número sem etiqueta é o
   único caso em que estar errado é indetetável. Recusa, nunca converte.
2. **O preço tem de ser recente.** Uma praça que deixou de negociar há anos
   continua a responder, com o instrumento certo e a última cotação que teve.
   O SXR8 andava nos 425 € em 2021 e nos 714 € em 2026, e a app mostrava 425.
3. **O conjunto tem de concordar com a corretora.** Os preços são todos
   recolhidos, a soma é comparada com o que a conta declara, e só então
   gravados. Gravar cada preço à medida que chega foi o que deixou onze preços
   individualmente plausíveis produzirem uma carteira a perder quando estava a
   ganhar.

## Câmbio histórico

Também listado como falta na primeira versão, e também já feito.

Cada snapshot guarda **a taxa do dia**, por isso o gráfico do património deixa
de reescrever o passado à taxa de hoje. Com um pormenor honesto: está resolvido
**para a frente**. Os snapshots antigos não têm taxa guardada e continuam a usar
a de hoje — mas o gráfico **diz que esse troço é aproximado**, em vez de o
apresentar como exato. O erro não desapareceu do passado; deixou de ser
invisível.

## Histórico de trades

O que *fizeste*, por oposição ao que tens. As outras tabelas descrevem o
presente e são substituídas a cada sincronização — uma posição que fechaste
simplesmente deixa de ser devolvida, e era por isso que não deixava rasto
nenhum.

- Duas fontes: os fills que as plataformas reportam (a Hyperliquid dá-os todos)
  e a importação de extrato para as que não reportam.
- Re-sincronizar é gratuito: a deduplicação usa o id de trade da própria
  plataforma.
- **Comissões ficam ao lado do valor, nunca dentro dele.** Somá-las ao montante
  faria o livro subtraí-las duas vezes.
- **P&L realizado fica nulo quando o fill abriu posição** em vez de fechar. A
  Hyperliquid escreve "0.0" nesses casos e guardá-lo poria no histórico trades
  empatadas que nunca existiram.

Quatro painéis por cima: resultado ao longo do tempo, resultado por
instrumento, com que frequência negoceias, e quanto tempo aguentas uma posição.
As comissões são sempre uma linha própria — numa conta pequena costumam ser
maiores do que o resultado, e só a linha líquida diz isso.

Horas em **UTC**, e a página di-lo. A app não sabe onde estavas quando
colocaste cada ordem, e um gráfico com horas erradas seria lido como facto.

## Filtrar o histórico de trades

Instrumento, tipo, conta, direção e intervalo de datas, na página do histórico.

**O ponto não é esconder linhas da tabela — é que todas as figuras se
recalculam sobre o que resta.** Filtras para BTC e a curva de P&L, a taxa de
acerto, o tempo médio de posição e o tamanho médio passam todos a ser sobre o
BTC. Mostrar a taxa de acerto da conta inteira ao lado de linhas de um
instrumento seriam duas respostas para a mesma pergunta, e nada no ecrã diria
qual era qual.

Sai de graça do desenho: o `lib/trading/stats.ts` são funções puras sobre um
array, portanto filtrar é chamá-las outra vez com menos linhas. Não há uma
segunda implementação de "taxa de acerto", e não pode haver.

As opções vêm dos dados, não de uma lista fixa — cada uma tem pelo menos uma
linha, portanto nenhuma escolha isolada deixa o ecrã vazio. Duas escolhas
combinadas já podem, e aí o ecrã diz que cada filtro tem eventos mas não têm
nenhum em comum.

**Três vazios diferentes, e o ecrã distingue-os.** Nada corresponde; há eventos
mas nenhum é compra ou venda (dividendos e transferências não têm resultado de
negociação); ou há trades mas nenhum fechou posição ainda. Os três desenham
gráficos vazios e querem dizer coisas diferentes.

## Escrever ou colar no histórico

O importador do histórico só aceitava **ficheiro**. Agora tem dois botões:
*Upload a file* e *Paste or type*.

A caixa de texto serve os dois casos que o ficheiro não servia: um trade que te
lembras e queres registar, e uma tabela copiada da página da corretora. Antes
tinhas de gravar isso num ficheiro sem razão nenhuma.

**É o mesmo leitor.** Extraí a análise do `handleFile` para uma função só, que
os dois caminhos chamam — dar a cada um o seu parser é como os dois começam a
discordar sobre que colunas são obrigatórias. Uma linha que seria recusada num
ficheiro é recusada aqui, com a mesma razão.

O botão **"Start from an example"** preenche a caixa com o cabeçalho e três
linhas de exemplo, porque a primeira linha tem de ser o cabeçalho e escrever
isso de memória não é razoável.

O texto colado é resumido em SHA-256 como um ficheiro, portanto colar as mesmas
linhas duas vezes é reconhecido como o mesmo lote. E fica no histórico de
imports com a data — o **Undo** funciona igual para o que escreveste à mão.

## P&L realizado, como as plataformas o reportam

O que cada plataforma diz que as trades fechadas renderam, **lido e nunca
reconstruído**. Um número calculado aqui com o nosso próprio método de custo
discordaria em silêncio do que a corretora te mostra, e não haveria forma de
saber qual estava certo.

Quando uma plataforma não diz, fica **desconhecido** — não zero. "Não realizaste
nada" e "ninguém nos disse" não podem aparecer iguais.

## Manual

Em `/manual`, dentro da app. Usa as mesmas palavras dos ecrãs, de propósito: se
um rótulo mudar e o manual continuar com o antigo, a diferença fica visível a
quem estiver a ler ao lado do ecrã.

## Análise da carteira

- Agrupável por nove eixos: playlist, conta, tipo de ativo, risco, retorno,
  horizonte, liquidez, long/short, posição.
- Ordenável por sete colunas em ambas as direções.
- **Vistas guardadas**: nomeias uma combinação e voltas lá num clique. Como o
  estado vive no URL, a vista é marcável nos favoritos. O que está guardado é
  validado ao ser lido — uma vista gravada antes de uma opção mudar de nome
  degrada em vez de abrir um ecrã vazio.
- Estável vs flutuante, resumo de staking, maiores movimentos.
- **Avisos de concentração** (HHI e número efetivo de posições).
- **Avisos de desencontro horizonte/risco**: dinheiro de curto prazo numa
  posição volátil.
- Botão para incluir ou excluir spot e stablecoins da análise.

## Kraken

O quinto connector, e o primeiro construído sem uma conta por trás. Lê saldos
(`BalanceEx`), a avaliação da conta (`TradeBalance`) e preços públicos. Nenhum
endpoint que mova seja o que for é sequer importado, e a chave que pede só
precisa da permissão *Query Funds*.

Três coisas desta API decidiram o desenho:

**Um erro chega com HTTP 200.** A Kraken responde a uma chave errada com
`{"error":["EAPI:Invalid key"],"result":{}}` e um estado 200. Quem só olha para
o estado lê uma conta vazia — uma credencial errada a aparecer como uma carteira
que desapareceu. O `krakenError` existe para isso nunca ser lido como dado.

**Os códigos de ativo não são tickers.** Bitcoin é `XXBT`, euro é `ZEUR`, e os
prefixos X e Z são um esquema antigo que a Kraken deixou de aplicar. A regra não
pode ser "tirar a primeira letra": `XTZ` é Tezos, e ficaria `TZ`. Os sufixos
também contam — `.S` é staking e `.F` é o produto de rendimento, e ambos são o
mesmo ativo noutro estado.

**O nome de um par é da corretora, não teu.** O DOGE tem código `XXDG` e negoceia
no par `XDGUSD` — e um par chamado `XXDGZUSD` **não existe**. Construir o nome a
partir dos códigos daria nada, e um preço em falta é indistinguível de um ativo
não listado, portanto a moeda ficaria sem preço para sempre sem ninguém perceber
porquê. O connector pergunta que pares existem e junta pelo identificador, que é
a mesma lição que a Hyperliquid ensinou cara.

Verificado contra a API real no que não precisa de credenciais: 1437 pares lidos,
oito preços resolvidos, e a assinatura reproduz exatamente o vetor publicado na
documentação da Kraken. **Por verificar:** os dois endpoints privados, que
precisam de uma chave.

## Binance

O sexto connector, e o segundo construído sem conta. Lê a carteira **Spot** e
avalia-a com os preços públicos. Só precisa da permissão *Enable Reading*.

**Lê a Spot e mais nada, e diz isso antes de ligares.** O dinheiro em Funding,
Simple Earn, Futuros ou produtos bloqueados vive em carteiras separadas, cada
uma com o seu endpoint e a sua resposta, e nenhuma se escreve sem uma chave real
sem adivinhar o formato. Apresentar um total parcial como se fosse inteiro é o
erro que este projeto mais vezes já removeu, portanto o limite está escrito no
ecrã de ligação em vez de escondido.

A regra dos símbolos aqui é o **inverso** da Kraken, e as duas saem do mesmo
princípio: usar a direção que a corretora define.

Verifiquei contra o `exchangeInfo` real que `symbol === baseAsset + quoteAsset`
nos **3645 símbolos**, sem uma única exceção — portanto compor `BTC` + `USDT` e
procurar o resultado é exato. Mas o sentido contrário não é: **oito símbolos
reais decompõem-se de duas maneiras** contra a própria lista de cotações da
Binance. O `BTCBUSD` é (BTC, BUSD) e também lê como (BTCB, USD). Quem partisse a
string para saber o que ela cota acertaria quase sempre e erraria em silêncio
naqueles — que é o pior resultado possível. Aqui compõe-se, nunca se decompõe.

O `exchangeInfo` são 16,65 MB e o `ticker/price` são 153 KB, o que é a razão
prática para os preços virem do segundo.

Verificado contra a API real no que não precisa de credenciais: 3080 símbolos
com preço lidos de 3688 devolvidos — e os 608 que caíram são **todos** preço
exatamente zero, pares há muito deslistados (BCC, HSR, OAX, MCO). Os preços
batem com os que a Kraken dá a 0,14%, que é a diferença normal entre duas
exchanges. A assinatura reproduz o vetor publicado pela Binance. **Por
verificar:** o `/api/v3/account`, que precisa de uma chave.

## Verificar um connector contra a tua conta

`scripts/probe-kraken.mjs`, `probe-binance.mjs` e `probe-okx.mjs`, ao lado dos
que já existiam para a Bybit, a Hyperliquid e a IBKR.

Cada um chama os endpoints a sério com as tuas chaves, e imprime a **forma** da
resposta com todos os valores substituídos por `<amount>` — dá para colar a
saída sem expor quanto tens. As credenciais assinam o pedido e nunca são
impressas.

A parte útil é a última linha de cada um: **os campos que a resposta traz e o
parser não lê.** É aí que aparece uma carteira que falta ou um estado que não
está a ser tratado, e não é coisa que um teste encontre — os testes verificam o
que já se percebeu.

Correndo-os com credenciais falsas, o caminho de erro dos três ficou verificado
contra a realidade:

| Venue | Resposta a uma chave errada |
|---|---|
| Kraken | **HTTP 200** com o erro no corpo — a armadilha contra a qual o connector foi desenhado |
| Binance | HTTP 401, `code -2015`, que significa chave *ou* IP *ou* permissão |
| OKX | HTTP 401, `code "50119"` — string, e o sucesso é `"0"` |

Falta o caminho de sucesso dos três, que precisa de chaves reais.

## Ligações a plataformas

Arquitetura: Connector → Normalizer → Base de dados → UI. Acrescentar uma
plataforma é um `case` e uma pasta.

**Só de leitura por construção.** A interface `Connector` não tem nenhum método
capaz de colocar uma ordem ou mover fundos. Não é uma promessa, é a forma do
código.

| Plataforma | Estado | Notas |
|---|---|---|
| Hyperliquid | Funciona | Endpoint público, sem credenciais. Traz também o histórico de trades |
| Trading 212 | Funciona | Chave API, gerada com as permissões de ordens desligadas |
| Bybit (global) | Funciona | Chave API + secret, IP na allowlist |
| Bybit EU | **Impossível** | Ver abaixo |
| Interactive Brokers | Funciona | Precisa do gateway local a correr num computador |
| Trade Republic | Só CSV | Sem API pública, por decisão. Ver `docs/trade-republic.md` |

- Credenciais cifradas com **AES-256-GCM**, IV novo por cifragem, autenticado.
  A chave-mestra vem do ambiente e nunca entra na base de dados. Ao mostrar,
  vês os últimos 4 caracteres.
- Sincronização automática enquanto o separador está aberto, e manual a pedido.
- Indicador de frescura por ligação.
- **Hyperliquid HIP-3**: o `clearinghouseState` só devolve um mercado de cada
  vez e `ALL_DEXES` dá erro 500, por isso a app percorre os `perpDexs` um a um.
  Sem isto as posições em mercados como SILVER e GOLD não apareciam.
- Se uma ligação não der, é oferecido converter em conta manual em vez de
  ficar um erro permanente na página.
- Ao apagar uma ligação, a conta vazia que ela criou vai atrás.
- Scripts de diagnóstico: `probe-hyperliquid.mjs`, `probe-bybit.mjs`,
  `probe-ibkr.mjs`.

## Moeda e câmbio

- Moeda base configurável: EUR, USD, GBP, CHF, BRL.
- Taxas automáticas, com atualização a pedido.
- Taxas fixadas à mão são **respeitadas** e nunca sobrepostas por uma
  atualização automática.
- **Sem taxa, o valor fica de fora do total e é nomeado.** Nunca é somado a 1:1.
  Isto já causou um erro real: 100 EUR + 87,70 USD apareciam como 187,70 €.

## Onde o dinheiro é gasto

Terceiro separador do Analytics, e o par do lado dos investimentos: mesma ideia,
a outra metade da app.

**Filtros:** categoria, subcategoria, comerciante, conta, intervalo de datas, e
um interruptor entre custos comprometidos e o que escolheste gastar. Mais
atalhos para o mês passado, os últimos 3 meses, os últimos 12 e o ano corrente —
escrever duas datas para perguntar "como foi o mês passado" é atrito que faz uma
página não ser usada.

**Gráficos:** rosca por categoria, barras de entradas contra saídas mês a mês,
barras por dia da semana com o fim de semana noutra cor, e uma tabela ordenável
por gasto, quota, número de transações e maior transação. A tabela é clicável —
clicar numa linha filtra por ela.

Podes trocar o eixo entre **categoria, subcategoria, comerciante e conta** sem
perder o filtro. O comerciante costuma ser o mais acionável dos quatro.

Três decisões que decidem se os números são honestos:

**As transferências nunca contam como gasto.** Mover 500 € da conta à ordem para
a poupança não é gastar, e contá-lo fazia o mês parecer 500 € mais caro do que
foi.

**O que não tem categoria é nomeado, nunca deitado fora.** Aparece como
"Uncategorised" e o ecrã diz quanto é — é a pilha que vale a pena arrumar
primeiro, e escondê-la faria as quotas somar 100% descrevendo menos dinheiro do
que gastaste.

**Convertido antes de agrupar.** Esta é a mesma tabela de transações onde o
`actions/stats.ts` deitava fora a moeda; aqui a conversão acontece na ação e as
moedas sem taxa são deixadas de fora **e nomeadas**, nunca contadas como zero.

> **Está vazio, e vai estar até lançares transações.** Tens 0 na base de dados.
> A página funciona — verifiquei o caminho vazio contra a tua base a sério — e
> mostra uma explicação em vez de gráficos em branco. Nada aqui foi visto com
> dados reais, que é exatamente o teste que falta.

## Analytics

- Património ao longo do tempo, com **um ponto por cada medição real** e linhas
  retas entre eles. Uma curva suave desenharia valores em dias que nunca foram
  medidos.
- Dinheiro por localização e por objetivo, em donuts.
- Retornos por período, maior queda até hoje, poupança e gasto mensais,
  projeções, e quando cada objetivo chega ao fim.
- Concentração e runway.

## Biblioteca

Livros e cursos, com progresso de leitura, capas e favoritos. Não toca nas
contas — está na app porque aprender sobre dinheiro e geri-lo andam juntos.

A posição editorial é **dados, não código**: o que lidera a biblioteca sai dos
campos `editorialRank`, `heroFeatured` e `specialBadge` da própria linha, nunca
de uma comparação por título. Há um teste que muda o nome do livro e verifica
que nada se mexe.

Os seeds são idempotentes por slug: voltar a correr um acrescenta o que falta e
não sobrepõe nada que tenhas editado.

## Temas

Oito temas: quatro acentos (Gold, Emerald, Indigo, Monocromático) vezes claro e
escuro. O monocromático não tem matiz nenhuma — o escuro é preto a sério, o
claro é branco a sério.

**E tem um terceiro eixo.** No monocromático podes escolher se a cor que
*significa* alguma coisa volta:

- **Nenhuma** — um ganho é mais claro, uma perda mais escura. Aguenta ser
  impresso e é legível para quem não separa vermelho de verde.
- **Verde, vermelho e ativos** — a página continua a preto e branco, e as únicas
  partes com cor passam a ser as que querem dizer alguma coisa: ganho/perda, e a
  paleta que distingue um ativo do outro nos gráficos.

Só aparece no monocromático, porque nos outros acentos os sinais já são a cores
e não haveria nada para repor.

Ao construir isto descobriu-se que o tema monocromático **não era monocromático**:
o gráfico de rosca tinha quatro cores fixas no código, portanto a partir da
quinta fatia desenhava azul, roxo e ciano numa página que tinha deitado fora
todas as matizes. As cores das fatias são tokens do tema agora.

## Backup

- Exportação completa em JSON e CSV, 28 tabelas.
- Restauro com validação antes de escrever.
- Não deves ficar preso a esta app para chegares aos teus próprios dados.

## Outras

- Login com sessão por cookie e proteção de todas as rotas.
- Temas com variante clara e escura.
- **Modo privacidade** que esconde valores — para usar em público.
- Registo de auditoria do que a app fez.
- Sincronização agendada por `POST /api/sync` com segredo partilhado, para
  correr num servidor com o browser fechado.
- Docker Compose com Postgres para deploy.

---

# PARTE 2 — O que falta

Ordenado por quanto acho que te faria falta, não por dificuldade.

## Erros conhecidos e coisas por acabar

**Metade da app nunca foi usada a sério.** Zero transações, zero subscrições,
zero transferências, zero alocações de buckets. O lado dos investimentos tem 187
movimentos e quatro plataformas ligadas, e foi por isso que os erros dele
apareceram. O lado do dinheiro não está certo — está *por estrear*, o que é
diferente e pior de avaliar.

Havia uma prova disso e já está corrigida: o `src/actions/stats.ts` deitava fora
a moeda das transações antes de as somar, portanto a primeira despesa em dólares
teria estragado a média mensal, a taxa de poupança, a autonomia e as duas
projeções. Agora converte antes de agrupar e a página nomeia as moedas para as
quais não há taxa, em vez de as contar como euros.

Na mesma passagem apareceram mais duas do mesmo erro, ambas corrigidas: o
`summariseCashFlows` somava depósitos e levantamentos através das moedas do
extrato (agora recusa-se e devolve a lista de moedas, para quem tem taxas
converter), e os passivos eram a única componente do património que não dizia o
que não tinha conseguido converter — uma hipoteca numa moeda sem taxa
desaparecia, e o património ficava mais alto do que é, sem marcador nenhum.

O que **continua** por converter: dentro do `getStatementBreakdown`, os totais de
custo, juros, dividendos e taxas são somados em bruto através das moedas do
ficheiro (vêm assim do `reconstructHoldings`). Num extrato de moeda única — o
caso normal — estão certos. Num extrato misto o ecrã avisa que aqueles totais
são somas de coisas diferentes, mas ainda não os converte. Fazê-lo implica passar
uma taxa por dentro da reconstrução.

**Duas medidas de retorno estão retidas.** O TWR e a TIR não podem ser
calculados com os dados de hoje — ver a secção acima. Não é um defeito do
cálculo; é falta de histórico e de registo de contribuições, e ambos se
resolvem sozinhos com o tempo.

**A metade dos investimentos não é o problema; a do dinheiro é.** Vale a pena
notar a assimetria: os investimentos têm 187 movimentos e quatro plataformas
ligadas, e foi por isso que os erros deles apareceram. Cada erro encontrado foi
encontrado da mesma maneira — alguém abriu um ecrã e disse *isto está mal*.

**IBKR expira a sessão.** O gateway da IB desliga a sessão ao fim de algumas
horas e obriga a novo login no browser. É desenho deles, não há volta. A app
deteta e explica, mas continua a ser chato.

**Sem limite de tentativas no login.** Numa app pessoal atrás de uma password
é aceitável, mas se alguma vez a puseres na internet aberta, isto é o primeiro
buraco. (O segundo buraco, esse já foi tapado: o `APP_PASSWORD` caía para
`"changeme"` e o `APP_SECRET` para `"dev-secret-change-me"` quando não estavam
definidos. Como o repositório é público, qualquer pessoa que encontrasse uma
instância arrancada sem `.env` entrava, e podia calcular o cookie de sessão a
partir do código. Agora rebenta a dizer o que falta, como o `ENCRYPTION_KEY`
sempre fez.)

**Uma tabela de segurança por apagar.** `investment_activities_pre0033` guarda a
cópia dos 107 registos anteriores à migração da tabela de movimentos. Verificado
que nenhuma linha se perderia; fica até dizeres que sai.

**Bybit EU não tem solução.** As chaves da bybit.eu ficam presas aos servidores
das aplicações aprovadas por eles — nenhum endereço teu vai coincidir. Não é um
bug meu, é restrição do lado deles, confirmada contra a tua conta real. A única
saída seria o Broker Program, que exige empresa registada e volume de negociação
que um tracker não gera.

## Funcionalidades que faltam

Por ordem do que faria mais diferença, não do que é mais fácil.

**Transações recorrentes** passou a ser a primeira, porque a comparação com um
índice já está feita — ver a Parte 1.

**Transações recorrentes.** As subscrições dizem o que *vai* sair, mas não
criam as transações. Continuas a lançar o Netflix à mão todos os meses, ou a
esperar pelo extrato. O passo natural é a app propor a transação quando a data
chega, para tu confirmares — nunca criar sozinha, porque uma transação
inventada num registo financeiro é pior do que uma em falta.

**Alertas fora da app.** O motor está feito e o sino existe — ver a Parte 1 —
mas só te avisa se abrires a app. Falta o canal: notificação push, email, ou
ambos. O service worker de que a push precisa já está instalado, portanto o que
falta é a decisão e as chaves VAPID, não a infraestrutura.

**Relatório mensal.** Um resumo do mês fechado: quanto entrou, quanto saiu,
onde falhaste o orçamento, como está o património contra o mês anterior.
A informação já existe toda espalhada; falta juntá-la numa página que se leia
de uma vez.

**Anexar recibos.** Uma foto ou PDF por transação. Implica guardar ficheiros,
incluí-los no backup e no restauro — custo alto para o valor.

**Obrigações a sério.** O tipo de ativo existe, mas uma obrigação tem cupão e
maturidade, não preço de mercado. Modelada como está, dá um número errado com
ar de certo. Só vale a pena se tiveres alguma.

**Mais plataformas.** A Kraken e a Binance já estão feitas — ver a Parte 1 — e
**faltam testar contra contas reais**, que é o único passo que descobre erros de
connector neste projeto. Da Binance falta também ler as carteiras Funding e
Earn, que a app avisa que não lê. Fica a Coinbase, que mudou para chaves CDP com
JWT ES256 — bastante mais superfície e um alvo em movimento, portanto mau
candidato para construir sem uma chave para testar.

A Revolut pessoal e os bancos portugueses passam por PSD2 e exigem licença
AISP. A Degiro não tem API pública: os clientes que existem são engenharia
inversa sobre o login, o que os põe na mesma objeção da Trade Republic — seriam
credenciais capazes de mover dinheiro. A Trade Republic saiu desta lista: fica
em CSV, e a razão está em `docs/trade-republic.md`.

**Multi-utilizador.** A app assume uma pessoa. Contas partilhadas, ou dar
acesso a alguém, não existe. É o que separa esta app de uma que possa ser
distribuída a estranhos, mais do que qualquer funcionalidade desta lista.

**Widgets e ecrã principal.** A app já instala no telemóvel e funciona lá — ver
a Parte 1. O que falta é o que só um app nativo dá: widgets no ecrã principal e
biometria. Nenhum dos dois vale, por si, o custo de embrulhar isto em Capacitor
e passar pela revisão das lojas.

## Coisas que decidi não fazer

Ficam aqui para não voltarmos a discuti-las do zero.

**Metas de rendimento por fonte.** Um orçamento para receitas é uma lista de
desejos. Podes controlar o que gastas; não podes decidir receber mais 500 €.

**Impedir saldo negativo.** Contas *podem* legitimamente ficar negativas —
cartões de crédito, margem, descobertos. Proibir seria modelar mal a realidade.
Um *aviso* faria sentido; uma proibição não.

**Open Banking.** Precisa de licença. O Enable Banking é o substituto
self-service do Nordigen, mas nunca foi testado com bancos portugueses.

---

# PARTE 3 — Notas técnicas para o futuro

Coisas que custaram tempo a descobrir e que vale a pena não redescobrir.

**Um ficheiro `"use server"` só pode exportar funções async.** Um único
`export const` invalida silenciosamente *todos* os exports do módulo. O `tsc`
não apanha. Só o `next build` apanha.

**Nunca escrevas uma migration à mão.** O `drizzle-kit migrate` aplica o que
está listado em `drizzle/meta/_journal.json`. Um ficheiro sem entrada no journal
é ignorado **em silêncio**, e a app rebenta em runtime longe do erro. Corre
`npx drizzle-kit generate`.

**As bibliotecas em `src/lib/` não tocam na base de dados.** É por isso que há
1592 testes sem precisar de Postgres. As queries ficam em `src/actions/`.

**`balancesAreSeparatePool`** é o campo que impede a quinta variante do erro de
contagem dupla. Cada connector declara se os saldos que devolve estão *fora* do
equity ou já *dentro* dele. A Bybit unificada tem-nos dentro; somar os dois
duplicava o dinheiro.

**A âncora dos testes é a realidade, não a minha aritmética.** Três vezes
durante o desenvolvimento um teste falhou e o código estava certo — era a minha
expectativa que estava mal. Quando um teste falha, verifica primeiro qual dos
dois lados está errado.

**Os testes não apanham este tipo de erro.** Vale a pena olhar para isto de
frente: durante a semana de 21 a 23 de agosto foram encontrados e corrigidos
cerca de dez números errados no ecrã — o HYPE a valer 0,09 em vez de 76, dólares
mostrados como euros, margem a dizer 149 € em vez de 9 €, a Análise a mostrar um
terço da carteira. **Os 1592 testes estavam todos verdes o tempo todo.**

Nenhum foi apanhado por um teste. Todos foram apanhados da mesma maneira:
alguém abriu um ecrã, olhou para um número e disse *isto está mal*. Os testes
protegem contra regressões no que já se percebeu; não descobrem o que ainda
ninguém percebeu. Dados reais num ecrã é que fazem isso.

**Nunca emparelhes dois arrays por posição quando ambos têm identificador.** O
`spotMetaAndAssetCtxs` da Hyperliquid devolve `[meta, contextos]` e é natural
assumir que `contextos[i]` descreve `universe[i]`. Não descreve — nem sequer têm
o mesmo tamanho (326 contra 717 numa resposta real). Cada contexto diz a que par
pertence no campo `coin`. Ler por posição avaliou o HYPE a 0,092721 quando o par
dele dizia 76,51, e desviou todos os outros tokens spot pelo mesmo deslocamento.

**Um zero de uma API pode significar "não aplicável".** Numa conta unificada da
Hyperliquid a sub-conta de perps não tem colateral próprio — está tudo no spot —
por isso o `withdrawable` responde `0.0`. Lido como medição, declarou a carteira
inteira empenhada: 149,29 € de margem contra uma posição que prendia 9,15 €.
Duas vezes na mesma semana, no mesmo connector, um zero passou por medição.

**Converter antes de somar: já vai em dez sítios.** A conta ao adicionar uma
soma nunca é "são a mesma moeda?" mas "o que as converte?". Os últimos cinco
estavam todos no mesmo ficheiro, incluindo um denominador de yield — uma
percentagem errada com ar perfeitamente normal.

**Um token de CSS usado em qualquer sítio tem de existir em todos os temas.** O
`--border-strong` estava definido em três dos oito temas. Nos outros cinco as
bordas que o usavam caíam para `currentColor` — uma linha de base de gráfico
desenhada na cor do texto.

**Um número certo com dados errados continua errado.** O TWR deu +8091% e a
matemática estava impecável — a série de valor é que começava no dia em que as
contas foram ligadas. A lição não é "verificar a fórmula", é que uma fórmula
correta alimentada por dados que não a suportam produz exatamente aquilo que
ninguém deteta: um número plausível. Quando uma métrica depende de histórico,
escreve o guarda **antes** de a mostrares.

**Antes de mexer num árbitro, lê os testes dele.** Os passivos entraram no
`networth.ts` sem partir nenhum dos 26 testes existentes, e isso não foi sorte:
os passivos entram a zero por omissão, e essa foi a restrição de desenho. Os
testes daquele ficheiro guardam decisões que não se veem no código.

**`md:hidden` não funciona num `.icon-btn`.** O `globals.css` define
`display: inline-flex` depois do `@import "tailwindcss"`; à mesma
especificidade, a regra mais tardia ganha e a utilidade é ignorada em silêncio.
Põe a variante num invólucro. Qualquer utilidade de `display` nessas classes bate
na mesma parede.

**O hot reload pode deixar um módulo velho em memória.** Uma gaveta de navegação
pareceu completamente morta durante minutos — o botão existia, nada por cima, e
o clique não fazia nada — porque o botão e o provider estavam a ler contextos
diferentes. Se acrescentares um contexto e ele parecer não funcionar, recarrega
antes de procurar o bug.

**O `proxy.ts` bloqueia mais do que julgas.** O manifest, o service worker, a
página offline e os ícones devolviam 307 para o login, o que impedia a instalação
por completo. Ao acrescentar qualquer ficheiro estático que o browser vá buscar
fora de uma sessão, confirma que passa.

**Uma migration pode ter corrido sem estar no journal.** Uma tabela foi dada
como nunca criada e tinha 107 linhas reais lá dentro. O `drizzle-kit migrate`
recusou-se com `42P07` em vez de fazer alguma coisa destrutiva, e foi só por
isso que se apanhou antes dos dados. Confirma sempre contra a base de dados, não
contra o histórico de ficheiros.
