# Verificação local C1–C7

Procedimento: [CODEX_PROXIMOS_PASSOS.md](CODEX_PROXIMOS_PASSOS.md).
O estado das tarefas é mantido apenas em [TAREFAS.md](../TAREFAS.md).
Sem push, publicação, acesso à Vercel, migrações na produção, ligação à base
real, palavras-passe reais ou tradução automática online nesta passagem.

## C1 — Formatação da língua

`fmt`, números e valores editáveis recebem a língua explicitamente. Inglês é
o padrão; a moeda pertence ao montante e não é convertida pela formatação.
Componentes usam o contexto de língua; componentes do servidor e PDF usam a
língua do pedido. Eixos compactos mostram `4K` em inglês e `4 mil` em português.
Os campos de edição usam um separador decimal, sem agrupamento, dígitos aceites
pelo validador e sem controlos bidirecionais. As 15 línguas são cobertas para
não estragar a edição completa; en e pt são os formatos de apresentação revistos.
Não foram modificados formatos numéricos de CSV, cálculos ou valores guardados.

Validação: **3406 testes em 221 ficheiros**, TypeScript, lint dos ficheiros
alterados, build `APP_EDITION=money` e diff aprovados. O processo de validação
sobrepõe configurações com valores sintéticos e URL de base exclusivamente
loopback antes de o Next poder ler `.env`; pedidos HTTP externos bloqueados.

**15 verificações no navegador**, computador EN 1440×950 e telemóvel PT
390×844, com PostgreSQL temporário PGlite, migrações reais e RLS. Painel,
Contas, Movimentos, relatório, campo do painel rápido sem milhares, eixos e
geração de PDF confirmados. Sem erros de execução. Texto extraído dos dois
PDFs locais com pypdf confirma `€4,000.50` e `4000,50 €`. Ensaios apenas com
contas e registos fictícios. Os scripts de ensaio não contactam fornecedores.

Evidência local ignorada: `.local-checkpoints/qr-e2e/c1-c7/C1/`
(resultado, servidor, capturas, PDFs e texto extraído) e `c1-ui.mjs`.

## C2 — Edição efetiva por sessão

A compilação define a edição de base; só a identidade de sessão validada do
dono (`OWNER_USER_ID`) recebe a edição completa na compilação money. Não se
usa email, corpo de ação, parâmetro ou cookie de edição. A função central de
identidade aceita uma restrição que apenas pode limitar a identidade assinada;
assim outra conta é recusada antes de ler dados. O dono continua sujeito à
verificação de existência e revogação da sessão. Sem sessão, o proxy envia para
a entrada antes de decidir os destinos disponíveis.

O contexto do cliente só controla apresentação. Listas de menus, pesquisa e
abas são funções da edição efetiva e não constantes avaliadas ao carregar o
módulo. Todas as 42 ações aguardam a autorização do servidor. Relatórios/PDF,
widgets e alertas usam a mesma decisão, sem guardar a edição de uma pessoa em
estado global. O cabeçalho X-MoneyOS-Edition identifica a compilação de base,
não os privilégios do utilizador. Não foi introduzida variável ou migração.

Validação: **3416 testes em 222 ficheiros**, TypeScript, lint e compilações
money/full aprovados. Testes cobrem identidade restrita, sessões inválidas,
revogadas e conta eliminada; ações de outra pessoa recusadas sem base/rede,
identidade exata do dono, alternância de pessoas e comportamento da cópia full.

**11 verificações no navegador** numa compilação money: destinos sem sessão
redirecionam; dono acede a investimentos/definições/trends, outra conta recebe
404; menus, widgets e relatórios seguem a sessão; parâmetros/cookies adicionais
não alteram acesso. Uma atualização real de preço do dono passou de 25 para 30
e foi confirmada no widget. PDFs reais gerados para as duas pessoas: texto
extraído confirma o símbolo DEMO no relatório de investimentos do dono e a
ausência dele no relatório forçado a dinheiro da outra pessoa. Sem erros de
execução no navegador ou servidor.

O ensaio PGlite usa um adaptador de teste que serializa leases de todas as pools
e reaplica identidade por lease: há um único backend PGlite, ao contrário das
ligações PostgreSQL independentes em produção. O código de conexão da app não
foi alterado para contornar essa limitação. Isto não mede carga nem concorrência
com múltiplos backends. Evidência ignorada em `c1-c7/C2/`, `c2-ui.mjs` e
`single-backend-pool.cjs`. A APK store continua sem os widgets de investimento
no manifesto; o dono usa a APK home para estes widgets. Nenhum Android, segredo,
produção ou configuração externa foi alterado nesta tarefa.

## C3 — Primeiros passos

O cartão no painel money usa os dados já existentes da pessoa: conta ativa ou
arquivada, qualquer movimento e orçamento ou objetivo. Não infere movimento de
uma previsão. O registo usa o evento quick-entry existente, sem criar outro
formulário. Sem conta ativa o botão de movimento está desativado. A conclusão
retira o cartão; o fecho é uma preferência por pessoa e aparelho, com alternativa
em memória se o armazenamento estiver indisponível. A privacidade descreve-a.

Validação: **3436 testes em 223 ficheiros**, TypeScript, lint e compilação money.
**11 verificações no navegador**: em inglês no computador e português no
telemóvel, uma pessoa sem dados vê três passos, cria uma conta com saldo, abre o
registo rápido a partir do cartão e cria um objetivo. Cada passo é marcado e o
cartão desaparece ao terminar. O fecho persiste após recarregar; sem armazenamento
funciona durante a visita. Sem erros de execução. Migrações reais só na base
PGlite fictícia, sem serviços externos. Evidência ignorada em `c1-c7/C3/` e
`c3-ui.mjs`.
