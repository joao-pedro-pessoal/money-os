# Adaptação dos restantes ecrãs — 9 de setembro de 2026

## Playlists, Dividends, Open positions e Connections — 17 de setembro de 2026

Padrão usado nestas páginas (componentes de servidor, sem `useMobileMode`): a
versão de telemóvel é marcação própria com a classe `…-phone-only` e a do PC fica
com `…-desktop-only`; o CSS em `globals.css` troca uma pela outra abaixo de 768 px.
O Simple usa `[data-mobile-ui="simple"]` dentro do mesmo `@media`. Os valores vêm
dos mesmos dados nas duas versões.

- **Playlists** (PC e telemóvel): `listPlaylistsWithTotals` devolve também
  `positions`, as mesmas posições que formam os totais. Cada playlist é um
  `PanelFrame` (aberto no PC, fechado no telemóvel) com posição, conta, valor, P&L
  não realizado (e %) e peso. “—” quando não há custo conhecido. Os valores passam a
  usar a moeda base em vez de assumir euros.
- **Dividends** (`dividends-*`): um cartão com o total e duas caixas (instrumentos,
  juros); símbolo redondo em Expected next e nos pagadores; etiquetas com ritmo,
  rendimento 12m e último pagamento; By year com a barra numa linha própria; Every
  dividend agrupado por mês; origem dos valores no fim.
- **Open positions** (`positions-*`, `position-card`, `Fact`): posições abertas
  primeiro (CSS `order`), indicadores 2×2, cartões para posições, saldos spot e
  posições próprias; nota de dupla contagem num `MobileFold`. Em Simple
  (`positions-simple-hide` e `Fact detail`) saem tags, tamanho, entrada, mark, custo
  médio, origem do preço, Spot balances/Margin in use/Total notional e a nota. O
  Total notional passou a usar a moeda base.
- **Connections** (PC e telemóvel): nome da plataforma por `PLATFORM_LABELS`, valor
  em destaque, borda com a cor do estado e contagem de ligações com erro. No
  telemóvel (Simple e Complex) `connection-extra` e `connection-remove` ficam
  escondidos; conta, ID, detalhe do valor, sincronizações recentes e Remove estão
  em `<details>` Details. O equity dos registos usa a moeda da ligação.

Verificação: TypeScript, lint, build e 2337 testes. Dividends visto numa
pré-visualização estática a 375 px com o CSS compilado e dados de exemplo; as
outras páginas não foram vistas com sessão iniciada.

## Trade history no telemóvel — 17 de setembro de 2026

Abaixo de 768 px, `/investments/history` passa a chamar-se **Trade history** e
abre por esta ordem (CSS `order` em `.trade-history-view`, sem mudar o PC):

1. Resumo com trades fechados e P&L realizado, os avisos de câmbio e de custo
   médio e, com filtros ativos, a descrição e **Clear filters**.
2. **Filters**, recolhível (`MobileFold`), com os campos em duas colunas.
3. Os gráficos, por pedido: **Daily P&L calendar**, **Account & P&L evolution** e
   **Result by kind of trade** abertos (`essential`); Result by instrument, How
   long you hold e How often you trade começam minimizados no telemóvel. Todos
   minimizam pela seta; no PC abrem todos, pela mesma ordem.
4. A lista: um cartão por trade fechado com ativo, conta, data, tipo e P&L;
   **Trade details** mostra hora de fecho, descrição, quantidade, valor líquido,
   `OpeningDetails` e as tags. Mostra 15 de cada vez (**Show more trades**); mudar
   um filtro volta aos 15. Os totais usam sempre o conjunto filtrado completo.
5. **Statements and imports**, recolhível.

No PC continua a tabela; `OpeningDetails` passou a ser um componente usado pelas
duas vistas. O cartão só aparece depois da hidratação (`useMobileMode().phone`),
por isso o primeiro desenho no telemóvel é a tabela.

Verificação: TypeScript, lint dos ficheiros alterados, build e 2337 testes. O
site na porta 3000 serve o CSS novo. A navegação com sessão iniciada foi feita
pelo Codex (320/390/430 px em Simple/Complex e PC 1440 px); o telemóvel real
foi validado pelo utilizador (A01, 17/09).

## Analytics e controlos de painéis — 15 de setembro de 2026

Os botões gerais “Minimize panels” / “Expand panels” saíram do layout. Os
cabeçalhos e setas de cada painel continuam a abrir/recolher o respetivo conteúdo.
O gráfico do Overview usa seletores de período e agrupamento. Em Where it goes,
o período fica visível e os filtros detalhados abrem por botão, mantendo escolhas
e indicando filtros ativos mesmo quando fechados.

Trends & projections separa “Your progress” de “Future scenarios”. O histórico
explica fluxo mensal e alterações de património; detalhes ficam recolhíveis.
Os cenários permitem escolher poupança mensal, taxa e prazo, reutilizando `project`
e comparando com 0% de crescimento. Não gravam hipóteses nem alteram movimentos.
O período das médias é descrito pelos meses registados, sem prometer três meses
completos quando não existem. O manual acompanha esta organização.

Verificação: build/TypeScript e lint aprovados; suite de 2337 testes aprovada;
57 verificações de navegador em 320, 390 e 1280 px, incluindo filtros, datas,
painéis individuais, troca de vistas, cenários com campo vazio e levantamentos,
e privacidade. Inspeção adicional do modo Simple e de capturas finais. Sem erros
JavaScript. Script local: `.local-checkpoints/verify-analytics-ui.mjs`.
A auditoria inicial voltou a identificar a inconsistência IBKR já registada em
[TAREFAS.md](../TAREFAS.md); esta alteração não modifica dados financeiros.

## Pesquisa no menu — 15 de setembro de 2026

O campo **Find a page** permite pesquisar as páginas do menu e os separadores
de contas, análise e investimentos, incluindo juros, dividendos, histórico,
ligações e importação. Funciona em Simple, Complex e no computador. Limpar a
pesquisa recupera o menu; Escape limpa primeiro o texto e, num segundo toque,
fecha o menu móvel. Selecionar um resultado abre a página e fecha o menu.

Verificação desta alteração: 2 337 testes aprovados, TypeScript e build de
produção aprovados, lint do site sem erros (três avisos Bybit anteriores) e
esquema sem alterações. No Edge, pelo endereço HTTP da rede local, passaram
18 verificações de pesquisa, navegação e largura nos dois modos (320, 390 e
430 px) e no computador (1280 px), sem erros JavaScript. Script de reprodução:
`.local-checkpoints/verify-nav-search.mjs`. Sem teste num telemóvel físico.
A auditoria mantém a inconsistência antiga de moeda da Interactive Brokers.

## Adaptação inicial

O site existente foi adaptado para larguras móveis. A implementação usa as
mesmas páginas, ações, cálculos financeiros, cores e temas da versão de PC.

- Painéis lado a lado e grupos de campos passam para uma coluna no telemóvel.
  Os indicadores e painéis recuperam as colunas em larguras maiores.
- Todas as tabelas das páginas e componentes têm um contentor com deslocamento
  horizontal, acessível por teclado, preservando os cabeçalhos e todas as colunas.
- Campos usam texto de 16 px e altura mínima de 44 px no telemóvel. Botões,
  seletores por botão e ações de confirmação têm áreas de toque maiores.
- Separadores de páginas e preferências permitem deslocamento horizontal e
  identificam a página atual para tecnologias de apoio.
- Cabeçalhos dos detalhes de investimentos e objetivos acomodam nomes longos
  e ações. Preferências e formulários da biblioteca adaptam-se à largura.

Abrange Contas, Movimentos, Orçamentos, Objetivos, Subscrições, Entradas
previstas, Passivos, Juros, Investimentos e suas subpáginas, Posições,
Ligações, Biblioteca, Análise, Estatísticas, Mapa do dinheiro, Importação,
Preferências e Manual. Os componentes partilhados também beneficiam o dashboard.

## Verificação

- 2 202 testes existentes aprovados em 119 ficheiros.
- Build de produção e TypeScript aprovados.
- ESLint sem erros; permanecem os três avisos anteriores nos testes Bybit.
- 132 verificações de largura em 33 páginas, a 360, 390, 430 e 1280 px:
  sem transbordo horizontal da página e sem erros JavaScript.
- Verificação adicional do detalhe de investimento a 360, 390, 430, 640,
  768 e 1280 px; quatro variantes do formulário da biblioteca e todas as
  opções do formulário de tipo de ativo.
- Deslocamento da tabela por teclado, abertura da edição de um movimento,
  gravação de um objetivo pela Server Action e cancelamento da eliminação
  verificados no navegador.
- Auditoria financeira da base local DEMO sem invariantes quebradas.

Foi usado Edge automatizado com Playwright. A tentativa com Agent Browser
falhou por timeout do daemon. Capturas e resultados ficam em
`.local-checkpoints/verification-all/`. Os registos temporários criados para
testar investimentos, objetivos, subscrições e biblioteca foram removidos.
O checkpoint dos ficheiros adaptados inicialmente fica em
`.local-checkpoints/before-all-screens/`.

Esta é uma adaptação responsiva do site. Não implementa login Google/Apple,
sincronização, offline ou distribuição nativa. A verificação não equivale a
testes em telemóvel físico, Safari/iOS, integrações reais com corretoras ou
certificação de todos os fluxos financeiros. Alguns ecrãs foram verificados
com estado vazio; os estados preenchidos usaram apenas dados de demonstração.

Para abrir nesta instalação, executar `PREVIEW_LOCAL.cmd` na raiz do projeto.

## Melhoria de utilização no telemóvel — 13 de setembro de 2026

O site tem agora atalhos inferiores, registo rápido em painel inferior, contas e
movimentos em cartões com rótulos, filtros de movimentos recolhidos e cabeçalhos
de painéis clicáveis. O dashboard destaca o património total. Foram corrigidos
o transbordo dos controlos dos orçamentos e a posição dos alertas no telemóvel.

A verificação da build de produção encontrou ainda uma interação entre a
otimização do CSS e `:has()`: os botões de `MobileFold` desapareciam. O seletor
do contentor vazio usa agora `:where()`, para não aumentar a especificidade da
regra dos botões quando o otimizador as junta.

Verificação desta alteração:

- 2 333 testes aprovados; TypeScript e build de produção aprovados.
- ESLint sem erros, com os três avisos Bybit anteriores; sem alterações ao esquema.
- 40 verificações na build de produção: Dashboard, Accounts, Cash Flow, Savings,
  Budgets, Buckets, Subscriptions, Coming in, Library e Settings, a 320, 390, 430 e
  1280 px, sem transbordo horizontal da página.
- Edge automatizado através de Agent Browser, no endereço HTTP da rede local
  (`isSecureContext === false`). Menu, foco, Escape, abertura e cancelamento de
  registo rápido, pesquisa, limpeza dos filtros, persistência dos painéis e tema
  claro verificados. Os orçamentos foram também verificados a 360 e 768 px.
- A auditoria inicial encontrou uma transação antiga de Interactive Brokers em
  EUR numa conta USD. A alteração de interface não corrige essa inconsistência.

Capturas e resultados locais: `.local-checkpoints/phone-verification/`.
Não houve testes num telemóvel físico nem em Safari/iOS nesta alteração.

## Modos Simples e Complexo — 14 de setembro de 2026

O seletor no topo das páginas móveis guarda a escolha neste navegador/app.
Complexo mantém a interface anterior. Simples reduz os indicadores do início,
acrescenta atalhos, compacta contas e movimentos e coloca Registar no centro da
barra inferior. Mais permite chegar às restantes páginas, incluindo investimentos.
Painéis e secções abertas usam preferências separadas por modo. No PC mantém-se
a interface completa, mesmo que o modo Simples tenha sido escolhido.

Verificados na build de produção: mudança de modo sem alterar valores,
persistência após recarregar, recuperação dos painéis do modo Complexo, acesso
às páginas adicionais, importação, logout e funcionamento sem localStorage.
As 24 verificações de largura dos ecrãs Dashboard, Accounts e Cash Flow, nos dois
modos a 320, 390, 430 e 1280 px, passaram sem transbordo. Passaram também os
2 333 testes, TypeScript e build; ESLint mantém apenas os três avisos anteriores.
O esquema e os cálculos financeiros não foram alterados. A auditoria mantém a
inconsistência antiga de moeda de Interactive Brokers já descrita acima.

Capturas locais em `.local-checkpoints/mobile-modes/` e
`.local-checkpoints/phone-verification/`. A verificação foi feita em Edge,
através do endereço HTTP da rede local, sem teste num telemóvel físico.

## Revisão de bugs — 14 de setembro de 2026

Corrigidos após a introdução dos dois modos:

- Ocultar valores não fazia nada se o navegador recusasse gravar preferências.
  A escolha passa a funcionar durante a sessão, incluindo voltar a mostrar.
- Painéis sem preferência guardada ficavam compactados ao passar de uma janela
  de telemóvel para uma janela de computador. Agora acompanham a largura.
- Secções já utilizadas ignoravam mudanças de preferência noutro separador,
  por manterem em memória um valor antigo. O evento de armazenamento invalida-o.
- Os avisos não fechavam com Escape nem tinham botão de fechar. Têm agora botão,
  foco inicial, navegação por teclado dentro do diálogo e retorno ao sino.
- Os movimentos recentes usavam sempre o símbolo EUR, mesmo quando o servidor
  devolvia valores noutra moeda base. A moeda devolvida acompanha agora os
  valores; conversões aproximadas e movimentos sem taxa disponível são indicados.

Os quatro problemas de interação foram reproduzidos antes e deixaram de ocorrer
na build corrigida, em Edge sobre HTTP da rede local. Passaram 2 333 testes,
TypeScript, build e lint do site (três avisos Bybit anteriores). Sem mudanças ao
esquema. O lint geral inclui também `mobile/`, a aplicação nativa separada,
onde nesta execução encontrou oito erros e um aviso; não foram alterados aqui.
A auditoria apenas de leitura continua a assinalar o movimento antigo de 100 EUR
numa conta USD da Interactive Brokers e a diferença de saldo associada. Nenhum
registo financeiro foi modificado nesta revisão.

Reprodução e verificação locais: `.local-checkpoints/bug-check.mjs`.
Os testes de interação dos dois modos e as 24 verificações de largura passaram
novamente após estas correções, sem erros de JavaScript observados no navegador.

## Dados sem deslocação horizontal e interface em inglês — 14 de setembro de 2026

O teste anterior verificava a largura da página, mas permitia tabelas com barras
de deslocação dentro dos painéis. Com todos os painéis abertos, a tabela de
Positions chegava a 1697 px dentro de um painel de 324 px. O novo
`ResponsiveTable` apresenta tabelas largas como registos com campos identificados
em duas colunas no telemóvel. As etiquetas vêm dos cabeçalhos apresentados,
incluindo preferências de colunas e totais de grupos com `colSpan`. Os mesmos
valores, links e controlos continuam na tabela do computador. Tabelas pequenas
ajustam texto e espaçamento; separadores passam a ocupar várias linhas. O seletor
de mês do calendário também foi ajustado para caber a 320 px.

A interface dos dois modos está em inglês: **Simple / The essentials** e
**Complex / All options**, incluindo navegação, atalhos, opções e indicadores.

Verificação: 21 páginas nos dois modos, a 320, 390, 430 e 1280 px, com painéis
abertos e medição dos contentores internos. Dos 168 casos iniciais, os dois que
falharam eram o calendário a 320 px; após a correção, os oito casos do histórico
foram repetidos e passaram. Testados também filtros e colunas de investimentos,
igualdade dos valores entre formatos e modos, menu, importação e registo rápido.
Passaram 2337 testes (incluindo quatro novos para etiquetas, colunas reordenadas,
totais e preservação dos controlos), TypeScript e build. Lint do site sem erros,
com os três avisos Bybit anteriores. Sem alterações ao esquema ou aos cálculos.

Capturas em `.local-checkpoints/compact-phone/`; resultados em
`.local-checkpoints/compact-phone-results.json` e
`.local-checkpoints/compact-phone-history-results.json`. Testado em Edge sobre
HTTP da rede local; sem teste num dispositivo físico ou em Safari/iOS.
