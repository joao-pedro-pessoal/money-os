# Money OS — o que faz e o que falta

Estado a 14 de agosto de 2026. 431 testes em 21 ficheiros, 13 migrations,
28 tabelas no backup.

Este documento é para ti, não para mostrar a ninguém. Inclui as limitações e as
coisas que estão mal, porque a lista do que falta só é útil se for honesta.

---

## O princípio que manda em tudo

A app separa **dinheiro garantido** de **dinheiro exposto ao mercado**, e nunca
os mistura num número só sem dizer.

Isto veio de uma coisa que disseste no início: *dinheiro investido não é
garantido*. Toda a arquitetura pende sobre isso. Por isso o menu tem uma secção
chamada "Não garantido", por isso o Net Worth mostra sempre a parte flutuante
entre parênteses, e por isso os investimentos vivem num módulo à parte da
contabilidade.

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

## Ligações a plataformas

Arquitetura: Connector → Normalizer → Base de dados → UI. Acrescentar uma
plataforma é um `case` e uma pasta.

**Só de leitura por construção.** A interface `Connector` não tem nenhum método
capaz de colocar uma ordem ou mover fundos. Não é uma promessa, é a forma do
código.

| Plataforma | Estado | Notas |
|---|---|---|
| Hyperliquid | Funciona | Endpoint público, sem credenciais |
| Bybit (global) | Funciona | Chave API + secret, IP na allowlist |
| Bybit EU | **Impossível** | Ver abaixo |
| Interactive Brokers | Funciona | Precisa do gateway local a correr |

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

## Analytics

- Património ao longo do tempo, com **um ponto por cada medição real** e linhas
  retas entre eles. Uma curva suave desenharia valores em dias que nunca foram
  medidos.
- Dinheiro por localização e por objetivo, em donuts.
- Retornos por período, maior queda até hoje, poupança e gasto mensais,
  projeções, e quando cada objetivo chega ao fim.
- Concentração e runway.

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

**Taxas de câmbio históricas.** Os gráficos usam a taxa de *hoje* para todo o
histórico. Se tens contas em dólares, a linha do património está errada em
qualquer ponto que não seja hoje — e não te avisa disso. É o defeito mais sério
que a app tem neste momento, porque o número parece certo.

**IBKR expira a sessão.** O gateway da IB desliga a sessão ao fim de algumas
horas e obriga a novo login no browser. É desenho deles, não há volta. A app
deteta e explica, mas continua a ser chato.

**Preços não são atualizados sozinhos** para posições manuais. Quem sincroniza
tem preços reais; quem regista à mão tem de os atualizar. Falta uma fonte de
preços para ações, ETFs e cripto.

**Sem limite de tentativas no login.** Numa app pessoal atrás de uma password
é aceitável, mas se alguma vez a puseres na internet aberta, isto é o primeiro
buraco.

**Bybit EU não tem solução.** As chaves da bybit.eu ficam presas aos servidores
das aplicações aprovadas por eles — nenhum endereço teu vai coincidir. Não é um
bug meu, é restrição do lado deles, confirmada contra a tua conta real. A única
saída seria o Broker Program, que exige empresa registada e volume de negociação
que um tracker não gera.

## Funcionalidades que faltam

**Transações recorrentes.** As subscrições dizem o que *vai* sair, mas não
criam as transações. Continuas a lançar o Netflix à mão todos os meses, ou a
esperar pelo extrato. O passo natural é a app propor a transação quando a data
chega, para tu confirmares — nunca criar sozinha, porque uma transação
inventada num registo financeiro é pior do que uma em falta.

**Alertas.** Nada te avisa de nada. Um orçamento estourado, uma subscrição a
cobrar amanhã, um preço a chegar ao alvo da watchlist, uma conta com saldo
velho — a app sabe tudo isto e não faz nada com essa informação. Faltaria
escolher o canal: email, notificação do browser, ou só um sino dentro da app.

**Relatório mensal.** Um resumo do mês fechado: quanto entrou, quanto saiu,
onde falhaste o orçamento, como está o património contra o mês anterior.
A informação já existe toda espalhada; falta juntá-la numa página que se leia
de uma vez.

**Anexar recibos.** Uma foto ou PDF por transação. Implica guardar ficheiros,
incluí-los no backup e no restauro — custo alto para o valor.

**Obrigações a sério.** O tipo de ativo existe, mas uma obrigação tem cupão e
maturidade, não preço de mercado. Modelada como está, dá um número errado com
ar de certo. Só vale a pena se tiveres alguma.

**Mais plataformas.** Trade Republic, Revolut, Binance, Kraken, Degiro,
Coinbase. Cada uma é uma pasta e um `case` — a arquitetura aguenta. A questão
é sempre a mesma: a plataforma dá API de leitura sem exigir ser empresa?

**Multi-utilizador.** A app assume uma pessoa. Contas partilhadas, ou dar
acesso a alguém, não existe.

**Telemóvel.** Funciona no browser do telemóvel mas não foi desenhado para
ecrãs pequenos. As tabelas largas sofrem.

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
431 testes sem precisar de Postgres. As queries ficam em `src/actions/`.

**`balancesAreSeparatePool`** é o campo que impede a quinta variante do erro de
contagem dupla. Cada connector declara se os saldos que devolve estão *fora* do
equity ou já *dentro* dele. A Bybit unificada tem-nos dentro; somar os dois
duplicava o dinheiro.

**A âncora dos testes é a realidade, não a minha aritmética.** Três vezes
durante o desenvolvimento um teste falhou e o código estava certo — era a minha
expectativa que estava mal. Quando um teste falha, verifica primeiro qual dos
dois lados está errado.
