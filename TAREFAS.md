# Money OS — tarefas e estado do projeto

Atualizado em **18 de setembro de 2026**.

**Esta é a única lista de tarefas do projeto.** Atualizar estados, prioridades e
novos pedidos aqui. Os outros documentos guardam instruções de utilização,
decisões técnicas e histórico; as listas antigas não definem trabalho atual.

Esta consolidação cruza a documentação com o código consultado e as verificações
recentes. Não constitui uma nova validação completa de todas as funcionalidades.
Valores da auditoria são uma fotografia desta data, não valores a fixar no código.

## 1. Direção atual

- **Produto em uso:** o site existente e a app Android em `android-shell/`, que
  abre esse site servido pelo PC. Preservar o design e as funcionalidades; a
  interface mantém-se em inglês, incluindo Simple e Complex.
- **Próxima prioridade:** A01–A03 concluídos a 17/09. Seguem A04–A08 e os ecrãs
  do telemóvel que ainda forem reportados.
- **Evolução futura, quando pedida:** usar a mesma experiência com dados locais,
  offline e sincronização entre PC e telemóvel. A interface separada de `mobile/`
  não é o modelo visual escolhido; o seu armazenamento, conectores e cofre podem
  ser reaproveitados.
- Esta lista não autoriza publicação, distribuição ou alterações aos dados reais.

## 2. Prioridade atual — aplicação em uso

| ID | Tarefa | Estado e critério de conclusão |
| --- | --- | --- |
| A01 | Validar a app Android num telemóvel real | **Concluído pelo utilizador (17/09/2026).** Critério original: Por validar: abrir, autenticar, importar ficheiro, exportar para Transferências, voltar, teclado e ecrã sem ligação. Confirmar também gráficos por toque, privacidade e modos Simple/Complex. |
| A02 | Reconciliar a Interactive Brokers | **Concluído pelo utilizador (17/09/2026).** Critério original: A auditoria de 15/09 voltou a encontrar um movimento de 100 EUR numa conta USD, saldo guardado de 134,24 USD e leitura do conector de 34,24 USD. Investigar a origem e preparar a correção antes de modificar dados. Concluir quando moeda, saldo e dinheiro livre estiverem reconciliados. A nota antiga de “resolvido” não descreve os dados atuais. |
| A03 | Atualizar saldo e valor investido da Trade Republic | **Concluído pelo utilizador (17/09/2026).** Critério original: Depende dos valores atuais da corretora. A última auditoria encontrou 450,83 EUR declarados como investidos e 456,09 EUR em holdings: diferença de 5,26 EUR. Reconciliar sem somar investimentos já incluídos no saldo. |
| A04 | Completar a validação funcional por área | Existem testes e verificações parciais. Testar receitas/despesas, transferências, subscrições, objetivos e orçamentos: criar, editar, cancelar, repetir pedidos, desfazer e persistência. Incluir várias moedas, falhas de rede e estados preenchidos. |
| A05 | Corrigir totais de extratos com várias moedas | Documentado como pendente em `getStatementBreakdown`: custos, juros, dividendos e taxas ainda podem ser somados em bruto. Converter com taxas adequadas antes de totalizar; nomear o que não pode ser convertido. Confirmar o caminho atual antes de editar. |
| A06 | Unificar as preferências de painéis | Definir a precedência entre preferências no servidor e escolhas no browser, incluindo Simple/Complex. Preservar escolhas guardadas e verificar recarregamento e mudança de dispositivo. |
| A07 | Afinar os ecrãs que ainda apresentam dificuldades no telemóvel | Trabalho contínuo orientado pelos problemas reportados. As correções recentes de menu, símbolo USD e ordem dos gráficos estão concluídas na secção 5. |
| A08 | Confirmar o destino das contas arquivadas com saldo | A auditoria recente ainda nomeia contas antigas arquivadas. Confirmar se são histórico, duplicados ou contas a reativar; continuam fora dos totais. Não apagar nem reativar com base apenas nas notas antigas de consolidação. |

## 3. Funcionalidades por desenvolver

A ordem abaixo preserva a prioridade proposta na lista anterior de funcionalidades;
não significa que todas tenham sido pedidas para implementação imediata.

| ID | Tarefa | Resultado esperado / dependências |
| --- | --- | --- |
| F01 | Propor transações recorrentes | **Feito a 17/09/2026** (H15 na secção 5). Possível a seguir: o mesmo para Expected money (receitas previstas). O aviso no sino e no telemóvel ficou feito com F02. |
| F02 | Alertas fora da app | **Feito a 17/09/2026, app 0.7.0** (H16 na secção 5): notificações no telemóvel, sem serviço externo nem credenciais. Possível a seguir, se pedido: email (exige uma conta de envio e a sua palavra-passe, configurada pelo utilizador no `.env`) e o envio automático do relatório mensal. |
| F03 | Relatório mensal | **Feito a 17/09/2026** (H14 na secção 5). Possível a seguir, se pedido: relatório anual e envio automático no fim do mês (depende de F02). |
| F04 | Anexar recibos | Foto/PDF associado à transação, com armazenamento, exportação, backup, restauro e eliminação coerentes. |
| F05 | Completar o modelo de obrigações | Acrescentar cupões e maturidade, com uma definição explícita da avaliação. Priorizar quando existir uma obrigação real para validar. |
| F06 | Validar e ampliar conectores | Testar Kraken, Binance e restantes caminhos de sucesso ainda sem validação com contas reais. Acrescentar Funding/Earn da Binance. Coinbase é candidata, dependente de credenciais de teste e confirmação da API. |
| F07 | Implementar BloFin | Desenho documentado, conector por construir. Confirmar o âmbito e validar com uma chave de leitura real; seguir os pontos de integração do plano técnico. |
| F08 | Widgets e ações em notificações | **Feito a 17/09/2026, app 0.6.0** (H09–H13 na secção 5): widget, atalhos, botão nas definições rápidas e notificação abrem o registo rápido; nove widgets com valores. Falta validar no telemóvel real e, se pedido, registar o valor diretamente na notificação sem abrir a app (exige uma rota de escrita própria, sessão e proteção contra duplicados). |

### Comparação com o getquin (18/09/2026)

O que o getquin oferece e a Money OS ainda não. Ordem = prioridade proposta: as
primeiras usam a fonte de preços que já existe (Yahoo) e não precisam de contas
novas. Fontes consultadas: site do getquin e análises de 2026 (Capitally, EU
Investing Hub, Fight to FIRE).

| ID | Tarefa | Resultado esperado / dependências |
| --- | --- | --- |
| F09 | Distribuição por setor, país e região | **Feito a 18/09/2026** (H18 na secção 5). Possível a seguir: a mesma divisão no widget Allocation; países dos ETFs só com outra fonte de dados (a do Yahoo não os dá). Critério original: Para ações e ETFs, ler setor e país da fonte de preços e mostrar a carteira por setor, país e região (Investment Analysis e widget Allocation). O que não tiver classificação aparece como "Unclassified", nunca repartido por palpite. ETFs sem dados de composição contam pelo país/região declarado ou ficam por classificar. |
| F10 | Ver dentro dos ETFs (look-through) | **Feito a 18/09/2026** (H19 na secção 5). Critério original: Somar as maiores posições de cada ETF às ações detidas diretamente, para mostrar a concentração real (ex.: Apple em três ETFs). A fonte só dá as maiores posições (top 10): mostrar a parte coberta e a parte desconhecida, sem extrapolar. Depende de F09 para a mesma leitura de dados. |
| F11 | Custos dos investimentos | Custo anual dos ETFs/fundos (TER) × valor detido, e comissões pagas por ano a partir das execuções importadas; total em € por ano e por conta. TER em falta fica "unknown", não 0. |
| F12 | Calendário de dividendos com datas do mercado | Juntar às estimativas pelo ritmo dos pagamentos as datas anunciadas (ex-dividend e pagamento) quando a fonte as dá, indicando qual é anunciada e qual é estimada; previsão de rendimento para os próximos 12 meses. |
| F13 | Plano de reforma / independência financeira | A partir do património, poupança mensal real (Cash flow) e retorno assumido, a idade ou data em que se atinge um objetivo, com cenários; hipóteses sempre visíveis e editáveis. Reaproveitar "Future scenarios" de Analytics e os objetivos dos buckets. |
| F14 | Mais tipos de ativos alternativos | Arte, colecionáveis, participações em startups, veículos: tipo de ativo próprio, avaliação manual com data e aviso de avaliação antiga (como os saldos manuais). |
| F15 | Análise assistida por IA | Perguntas sobre a carteira e resumo de risco/custos. Exige uma chave de API paga e enviar dados para fora do PC: só com decisão explícita do utilizador; nunca recomendações de compra/venda (ver "What it deliberately won't do"). |
| F16 | Comunidade e partilha | Partilhar uma vista da carteira (percentagens, sem valores) por link. Depende de E01 (acesso fora de casa) e de publicação; comunidade/fórum fica fora do âmbito de uma app pessoal. |

Já coberto noutras tarefas: ligações a milhares de bancos e corretoras (F06/F07;
bancos exigem Open Banking, que exige licença — decisão registada) e usar a app fora
de casa (E01–E05).

## 4. Acesso fora de casa e evolução independente do PC

### O que já existe nesta área

- O **site financeiro atual continua a ser de um utilizador**, com palavra-passe
  própria e dependência do servidor. A app Android atual não lhe acrescenta offline.
- A aplicação separada `mobile/` tem armazenamento local cifrado, bloqueio,
  backups, conectores de leitura e implementação de sincronização manual do cofre.
- O servidor `/api/vault` tem tabelas separadas, registo/login por email e
  palavra-passe, sessões, revogação por dispositivo e controlo de versões.
- O login do **cofre** já limita tentativas; o login do **site** ainda não.
- O protocolo e o servidor têm testes documentados. Isto não significa que o
  site atual use o cofre, que haja paridade funcional ou que a experiência final
  entre dispositivos tenha sido validada em hardware.

### Trabalho restante

| ID | Tarefa | Estado e critério de conclusão |
| --- | --- | --- |
| E01 | Preparar o site para acesso fora da rede de casa | Configurar HTTPS e limitar tentativas no login do site. Verificar sessões e acesso real. A publicação é uma etapa separada, quando solicitada. |
| E02 | Integrar a experiência web com o cofre local | Preservar as funcionalidades e o design escolhidos, definir a migração dos dados do site e a decifragem no browser do PC. Não importar a base/ações web para o bundle nativo nem duplicar regras financeiras. |
| E03 | Completar identidade e isolamento | Acrescentar Google/Apple e associação segura de métodos à conta existente. Link por email permanece uma opção por configurar; email com palavra-passe já existe no cofre. Validar duas pessoas sem acesso cruzado e a migração do atual utilizador único. |
| E04 | Sincronizar ao abrir a aplicação | A sincronização do cofre é manual. Automatizar receção e leituras das corretoras nos dispositivos com chaves, com intervalo mínimo, data/origem e estados de progresso/erro; preservar a última leitura válida. |
| E05 | Completar offline e sincronização na experiência escolhida | Reaproveitar o protocolo existente. Validar fila persistente, repetição, falha a meio, edições concorrentes, restauro, eliminações e dois dispositivos sem duplicar movimentos nem saldos. |
| E06 | Completar ligação, recuperação e revogação de dispositivos | Validar autorização de um novo dispositivo e recuperação pelas 12 palavras. Ao revogar, renovar a chave e o código de recuperação e atualizar os dispositivos de confiança. Atualmente a revogação corta a sessão, sem essa rotação. |
| E07 | Encerrar a sessão no servidor ao deixar de sincronizar | Atualmente o dispositivo esquece o token, que continua válido no servidor até expirar. Revogá-lo no servidor e testar o comportamento sem rede. |
| E08 | Limitar registos e retenção do cofre | Limitar criação de contas e definir remoção de versões antigas; hoje as versões permanecem até apagar a conta. |
| E09 | Completar o fluxo de eliminação de conta | Validar exportação prévia, comportamento das cópias locais e prazo de retenção dos backups do servidor; comunicar o alcance real da eliminação. |
| E10 | Rever segurança, privacidade e distribuição | Aplicar o checklist de referência à implementação final, incluindo revisão independente do cofre antes de o usar com dados de terceiros. Preparar textos e políticas com base no comportamento verificado. |
| E11 | Validar a integração nativa em Android/iOS | Testar SQLCipher, Keystore/Keychain, biometria/código, bloqueio, ficheiros, backup/restauro e conectores em dispositivos reais. Exportar um bundle não equivale a testar uma aplicação instalada. |
| E12 | Preparar distribuição, quando solicitada | Binários de produção assinados, identificação da app, ícones, capturas, suporte e validação dos requisitos das lojas. A app Android local já existe; não está publicada nas lojas. |
| E13 | Validar interesse e preparar divulgação, quando solicitado | A proposta anterior era observar cinco pessoas a configurar a app com os seus dados antes de investir na distribuição. Preparar descrição, tópicos e capturas do projeto apenas quando essa etapa avançar. |

Hoje, no site e na app Android, as chaves das corretoras estão cifradas na base de
dados e só se decifram com a `ENCRYPTION_KEY` do `.env` do PC; não ficam só num
dispositivo. Decisões do desenho futuro: chaves de corretoras ficam em cada dispositivo,
preferencialmente distintas por dispositivo; o servidor recebe dados financeiros
cifrados; recuperação não entrega a chave ao operador. Estas decisões não devem
ser apresentadas como propriedades já demonstradas do site atual.

## 5. Concluído — não voltar a propor como tarefa nova

| Área | Entregue | Limite relevante |
| --- | --- | --- |
| Adaptação móvel | Páginas responsivas, navegação inferior, painéis recolhíveis, modos Simple/Complex e tabelas compactas | Verificações em navegador não substituem A01/A04. |
| H19 — Dentro dos ETFs (18/09/2026) | Investment Analysis → Sectors, countries and regions → **Inside your ETFs**: as 15 empresas com mais peso, com o que tens diretamente, através dos ETFs, total e % das ações+ETFs, e por que fundos vem. Mesma empresa em listagens diferentes junta-se pelo nome sem forma jurídica. Diz quanto dos fundos as ~10 maiores posições cobrem; o resto não é repartido. Os ETFs já lidos voltam a ser lidos no botão para trazer as posições. Coluna nova `top_holdings` (migration 0046, aplicada) | TypeScript, lint, build e testes (5 novos). Verificado com dados públicos (EUNL.DE, SXR8.DE, APC.DE): Apple direta e nos dois ETFs numa só linha. Não visto com sessão iniciada. |
| H18 — Setores, países e regiões (18/09/2026) | Investment Analysis → **Sectors, countries and regions**: ações e ETFs por setor, país e região (América do Norte, Europa, Ásia-Pacífico, América Latina, Médio Oriente e África, Other). Botão *Look up sectors & countries* lê o Yahoo Finance (25 por vez; só os símbolos saem do PC); ações pelo setor e sede, ETFs pelos pesos por setor; países de ETFs não reportados ficam "Unclassified". Símbolos do preço automático, da Trading 212 (`AAPL_US_EQ`, `VUSAl_EQ`) e nomes de extrato (pesquisa). Lista de correspondências com *Forget*. Tabela nova `asset_profiles` (migration 0045, aplicada) | TypeScript, lint e build; 2391 testes (14 novos). Fluxo Yahoo verificado com símbolos públicos (SAP.DE, AAPL, EUNL.DE). Não visto com sessão iniciada nem com as posições reais. |
| H17 — Revisão de bugs (18/09/2026) | Corrigido: o alerta "charges in N days" lia a data guardada sem a avançar e deixava de avisar a partir do segundo mês (e inventava datas a partir da criação); Record expense numa conta de outra moeda gravava o valor da subscrição como se fosse na moeda da conta; confirmar/saltar uma cobrança cuja despesa ou subscrição desapareceu lançava erro; data da despesa sugerida em UTC; mudar o dia da subscrição depois de responder voltava a propor a mesma cobrança; relatório com mês futuro ou mês vazio no endereço. Revistos sem erros novos: playlists, widgets, registo rápido, app Android (lint só com os 2 erros antigos) | TypeScript, build e 2377 testes. Não visto com sessão iniciada. Fica registado, sem correção: meses contados em UTC na página de despesas e no relatório; valores sem taxa de câmbio contam 0 nos totais de Open positions e no widget. |
| H16 — Alertas no telemóvel (17/09/2026) | App Android 0.7.0: Settings → **Alert notifications** (só dentro da app). A app pede `GET /api/alerts` (atrás da sessão) de ~30 em 30 minutos com `JobScheduler` e notifica cada alerta uma vez; retira os que o site deixa de reportar; tocar abre a página do alerta; no ecrã bloqueado só "Something needs your attention". O site decide com `shouldNotify` (crítico e aviso; subscrições e watchlist também). Novo alerta por cobrança de subscrição por confirmar (também no sino); "charges today" deixa de aparecer para subscrições com data, que já pedem confirmação. Sem push externo nem email | Site: TypeScript, lint, build e 2376 testes (4 novos); `/api/alerts` sem sessão redireciona para o login. App compilada. Não visto num telemóvel. Exige reinstalar o APK e reiniciar o site. |
| H15 — Cobranças de subscrições para confirmar (17/09/2026) | Na data de cada subscrição ativa com data, “Subscription charges to confirm” aparece no dashboard (os 3 primeiros) e em Subscriptions (todos): **Record expense** (conta, valor e data editáveis; na moeda da conta), **Yes, that's it** quando uma despesa já registada parece ser essa cobrança (mesma moeda, ±10%, ±5 dias, mesma conta se definida; o nome conta a favor) ou **Skip**. Nada é criado sem escolha. Tabela nova `subscription_charges` (migration 0044, aplicada) com par único subscrição+dia: um duplo toque ou outro aparelho não regista duas vezes. Só cobranças dos últimos 31 dias e depois da subscrição existir. Lógica em `src/lib/accounting/subscriptionCharges.ts` (12 testes) | TypeScript, lint, build e 2372 testes; migration aplicada à base real e `db:generate` sem diferenças. Não visto com sessão iniciada. |
| H14 — Relatório mensal (17/09/2026) | Analytics → **Monthly report** (`/analytics/report`): escolher o mês; receitas, despesas, saldo e taxa de poupança com comparação ao mês anterior e média de até 3 meses anteriores com dados; despesas por categoria com variação ("new" sem mês anterior); fixo vs variável; orçamentos mensais do mês; maiores despesas; património no início e no fim do mês; dinheiro movido para investimentos à parte. **Download CSV** (também na app, para Transferências) e **Print / save as PDF** (escondido na app). Lógica em `src/lib/reports/monthly.ts` sobre as funções de Where it goes (13 testes) | TypeScript, lint dos ficheiros, build e 2360 testes. Não visto com sessão iniciada. |
| H13 — Todas as posições no widget Investments (17/09/2026) | App Android 0.6.0: o widget Investments lista todas as posições numa lista que desliza (`ListView` + `PositionsListService`), cada uma com valor, P&L em euros e percentagem sobre o custo, a cores; tocar numa linha abre Investments. `/api/widget` envia todas as posições com `percent` (null sem custo medido, testado) | Site: TypeScript, build e 2347 testes. App compilada; lint sem erros novos. Não visto num telemóvel. |
| H12 — Mais widgets de investimentos (17/09/2026) | App Android 0.5.0: Investments mostra mais posições conforme a altura (até 10); novos widgets Allocation (tipo de ativo), Winners & losers (retorno sobre o custo; só posições com custo medido; nenhuma aparece nas duas listas), Dividends (total, este ano, próximo estimado) e Open trades (P&L não realizado, margem, cada trade). `/api/widget` ganha `allocation`, `movers`, `dividends` e `trading`, com as funções das páginas Investments, Dividends e Open positions; `movers` testado. Imagens de exemplo para os quatro | Site: TypeScript, build e 2346 testes. App compilada; lint sem erros novos. Widgets ainda não vistos num telemóvel. |
| H11 — Widget Investments e pré-visualizações (17/09/2026) | App Android 0.4.0: widget Investments (valor da carteira, P&L não realizado e %, 3 maiores posições com P&L; “—” sem resultado medido não aparece como 0) a partir de `investments` em `/api/widget`, com os mesmos cálculos da página Investments. Todos os widgets passam a ter imagem de exemplo e descrição na lista de widgets, em vez de uma caixa escura | Site: TypeScript, build e 2344 testes. App compilada; lint sem erros novos; imagens verificadas. Widgets ainda não vistos num telemóvel. |
| H10 — Widgets com valores e botões nas definições rápidas (17/09/2026) | App Android 0.3.0: widgets Money OS (património, mês e linha), Net worth (gráfico e variação), Where the money is (donut e percentagens) e Cash flow (entradas, saídas e saldo do mês), cada um abre a página correspondente e tem ↻; botões Record expense e Net worth nas definições rápidas (Net worth escondido com o telemóvel bloqueado). Rota `GET /api/widget` atrás da sessão; última resposta guardada no telemóvel e mostrada com a hora | Site: TypeScript, build e 2343 testes (6 novos). App compilada, lint Android sem erros novos e instalada no emulador; emulador bloqueado com PIN, por isso widgets e botões não foram vistos a funcionar. Exige reinstalar o APK e reiniciar o site. |
| H09 — Widget, atalhos e notificação para registar gastos (17/09/2026) | App Android 0.2.0: widget no ecrã principal com Despesa e Receita; atalhos ao tocar sem largar no ícone; notificação fixa opcional (Settings → Quick entry notification, só dentro da app) com Despesa e Receita, reposta ao reiniciar o telemóvel. Todos abrem a app já no formulário de registo rápido do site (`?quick=` ou evento `money-os:quick-entry`); nada é gravado fora do formulário | Compilado (`assembleDebug`) e instalado no emulador; o emulador está bloqueado com PIN, por isso widget, atalhos e notificação não foram vistos a funcionar. Site: TypeScript, lint, build e 2337 testes. Exige reinstalar o APK. |
| H08 — Open positions Simple e Connections simples (17/09/2026) | Open positions em Simple: sem tags, entrada, mark, tamanho, notas nem nota de dupla contagem; ficam valor, P&L/ROE e liquidação, equity e disponível, número de posições e P&L total. Connections no telemóvel (Simple e Complex): cartão com plataforma, estado, valor, última sincronização e Sync now; conta, ID, detalhe do valor, sincronizações recentes e Remove em “Details” | Complex e PC mantêm o resto. TypeScript, lint, build e 2337 testes; sem sessão iniciada não foi visto com dados reais. |
| H07 — Open positions e Connections (17/09/2026) | Open positions no telemóvel: posições abertas primeiro, indicadores 2×2 compactos, cartões com ativo, lado, alavancagem, P&L/ROE e valor, tamanho, entrada, mark e liquidação; saldos spot e posições próprias em cartões com tags; nota de dupla contagem recolhível. PC mantém tabelas; Total notional passa a usar a moeda base. Connections (PC e telemóvel): nome da plataforma, valor da conta em destaque, borda com a cor do estado, contagem de ligações com erro; no telemóvel botões a toda a largura e sincronizações recentes recolhíveis em lista; equity dos registos na moeda da ligação | TypeScript, lint, build e 2337 testes; sem sessão iniciada não foi visto com dados reais. |
| H06 — Dividends no telemóvel (17/09/2026) | Abaixo de 768 px: um cartão com o total recebido e, por baixo, instrumentos e juros; “Expected next” e “Instruments that pay you” com símbolo redondo, valor em destaque e etiquetas (ritmo, rendimento 12m, último pagamento); “By year” com barra a toda a largura; “Every dividend” agrupado por mês; origem dos valores no fim. Textos longos escondidos no telemóvel | PC sem alterações. Mesmos valores e moedas. TypeScript, lint, build e 2337 testes; visual verificado numa pré-visualização a 375 px com dados de exemplo, sem sessão iniciada. |
| H05 — Posições nas playlists (17/09/2026) | Em Investments → Playlists, “Positions by playlist” mostra cada playlist com as suas posições: nome com ligação ao ativo, conta, valor, P&L não realizado (e %) e peso na playlist; o nome na tabela de resumo salta para a lista. No PC abrem todas; no telemóvel cada uma abre com um toque. Valores na moeda base | Mesmas posições que os totais da tabela. TypeScript, lint, build e 2337 testes passaram; sem sessão iniciada não foi visto no navegador. |
| H04 — Trade history no telemóvel (17/09/2026) | Resumo de trades fechados/P&L; filtros em duas colunas recolhíveis; cartões com ativo, conta, data e resultado; detalhes de abertura/tags por expansão; 15 trades de cada vez; depois dos filtros: Daily P&L calendar, Account & P&L evolution e Result by kind of trade abertos, restantes gráficos minimizados no telemóvel; lista e importações a seguir | Desktop mantém tabela e gráficos. TypeScript, lint dos ficheiros, build e 2337 testes passaram. Navegador: Simple/Complex a 320/390/430 px, filtros, limpar, mostrar mais sem mudar totais, abertura de detalhes e desktop 1440 px; sem overflow nem erros de browser, CSS 200 na porta 3000. |
| H03 — Ordem da Analysis (17/09/2026, substitui a ordem de H02) | Dois quadros iniciais: Portfolio overview (valor, custo, P&L monetário e percentual juntos) e Cash & stablecoins vs other assets; depois Performance; restantes secções abaixo e minimizáveis | Percentagem realizada indicada como indisponível: falta o custo das posições fechadas neste resumo. TypeScript, lint e build passaram; ordem e minimizar/expandir verificados em Simple 390 px, Complex 320 px e PC 1440 px, sem overflow nem erros de browser; CSS 200. |
| H02 — Investment Analysis (17/09/2026) | Removido Back to positions; gráficos por conta e tipo de ativo no topo; explicação de Cash & stablecoins e do filtro ON/OFF; removida a alegação de capital garantido; extrato numa secção recolhível abaixo dos detalhes | TypeScript, lint da página e build passaram. Navegador: Simple 390 px, Complex 320 px e PC 1440 px; gráficos, explicação e filtro verificados, sem overflow nem erros de browser; CSS 200 na porta 3000. Cálculos preservados. |
| H01 — Holdings: atalhos (17/09/2026) | Substituídos Playlists, Watchlist e Analysis por What you hold e Portfolio value over time; atalhos para as secções da página, com gráfico acessível em ambos os modos | Build, TypeScript, lint da página e 2337 testes passaram. Navegador: 320/390 px em Simple/Complex e desktop 1440 px; ambos os atalhos funcionam, sem overflow nem erros de browser, CSS 200 na porta 3000. Lint global mantém erros externos à alteração; auditoria mantém A02. |
| Navegação | Pesquisa “Find a page”, seleção de resultado, limpeza e Escape | Verificada em telemóvel simulado e desktop. |
| Dashboard e holdings | Gráfico Allocation antes dos holdings no telemóvel; gráfico de “Where the money is” acima das contas | Alterações de apresentação, sem correção dos dados de A02/A03. |
| Holdings no telemóvel | Resumo compacto em duas colunas, carteira em destaque, lista antes do histórico, pesquisa direta e controlos maiores | Apenas abaixo de 768 px; verificados Simple/Complex, pesquisa, agrupamento, filtros e PC a 1440 px. Build e 2337 testes passaram. |
| Cash flow | Melhorias limitadas ao telemóvel (<768 px); PC recuperado com formulários abertos, filtros em linha e tabela completa | Corrigido CSS 404 reiniciando o servidor na porta 3000 após build; verificados estilos de Home/Accounts/Cash flow e interações em Simple/Complex. |
| Accounts | Linhas compactas de cerca de 66 px no telemóvel, com nome, saldo, livre e estado; detalhe da conta separado em “Overview” e “Manage account”, com arquivamento acessível nas ações da conta | Mantém histórico e transações ao arquivar; validação visual feita no preview. |
| Idiomas da interface | Seletor local com English, Português, Español, Français, Deutsch, Italiano, Nederlands, Polski, Türkçe, 日本語, 한국어 e 简体中文; menu global, barra superior e atributo de acessibilidade traduzidos | A tradução de páginas específicas continua a ser uma etapa futura; nomes e dados financeiros não são traduzidos automaticamente. |
| Moeda | USD mostra apenas `$`, também nos formatadores partilhados de gráficos | Mantém a moeda e os valores recebidos por cada componente. |
| Controlos dos painéis | Removidos os botões gerais “Minimize panels” / “Expand panels”; cada painel continua a abrir e recolher pelo seu cabeçalho/seta | As escolhas individuais continuam guardadas no dispositivo. |
| Analytics | Período e agrupamento em seletores compactos; filtros detalhados de despesas recolhíveis; “Your progress” separado de “Future scenarios”, com hipóteses editáveis e comparação a 0% | Os cenários não alteram dados; a poupança sugerida identifica os meses registados que usa. |
| Registo rápido | Receita/despesa, formulário compacto, proteção contra repetição e desfazer | Ainda não é uma fila offline persistente após fechar a janela. |
| Poupanças | Descontos, cashback e aba Poupanças no site e mobile | Testes em hardware continuam pendentes. |
| Ativos | Pesquisa, identificação de bolsa, páginas de detalhe e ligações externas | Melhorias adicionais devem partir de um caso concreto. |
| Trades | Classificações por execução, associação por ID de posição quando disponível e FIFO identificado nos restantes casos | Exatidão depende do que o broker fornece. |
| Análise | Performance open/closed/both e calendário diário de P&L | Preservar as fontes e definições financeiras existentes. |
| Património | Reclassificação de collateral crypto volátil como exposição ao mercado | Não elimina diferenças de dados declarados como A03. |
| Cotações e retorno | Preços automáticos, câmbio histórico e comparação com benchmark | TWR/TIR podem continuar sem medição por insuficiência de histórico/contribuições; não inventar resultados. |
| Instalação atual | App Android que abre o site do PC | Exige PC ligado e acesso ao servidor. |
| Cofre futuro | Armazenamento local e partes de identidade/sincronização implementados | Consultar a secção 4; integração com a experiência atual incompleta. |

Validação da última alteração (18/09/2026, revisão de bugs): **2377 testes
aprovados**, build e TypeScript aprovados, sem alterações de esquema. `npx eslint src`
tem um erro anterior a estas alterações em `src/components/LanguageContext.tsx`
(setState dentro de um efeito) e os três avisos Bybit. A app Android compila; o
`lintDebug` tem dois erros antigos (`onBackPressed`, `local.properties`). Auditoria com a inconsistência de A02. Estes resultados
não certificam os fluxos futuros da secção 4.

## 6. Limites e decisões que não são tarefas de implementação

- **Trade Republic:** manter importação CSV; não construir conector a partir de
  credenciais de login. Ver a decisão técnica de referência.
- **Bybit EU e sessão IBKR:** limitações documentadas dos fornecedores; confirmar
  as condições atuais antes de propor integrações ou alternativas.
- **Bancos/Open Banking:** requer uma avaliação própria dos fornecedores e do
  enquadramento aplicável; não está autorizado como integração nesta lista.
- **Não bloquear saldos negativos:** podem ser legítimos; um eventual aviso é
  diferente de proibir a operação.
- **Metas de rendimento por fonte:** ficaram fora da direção anterior; só
  reabrir a decisão por novo pedido.
- **Histórico insuficiente:** tratar como dados indisponíveis, não como defeito
  de cálculo nem valor zero.

## 7. Documentos de referência

Estes documentos explicam o funcionamento ou preservam decisões e verificações;
o estado das tarefas é mantido apenas aqui.

- [Regras do projeto](CLAUDE.md) e [instruções para agentes](AGENTS.md).
- [Catálogo de funcionalidades e histórico](FEATURES.md).
- [Passagem de trabalho e ambiente Windows](CONTINUAR_NO_CODEX.md).
- [Uso e instalação da app Android atual](docs/APP_ANDROID.md).
- [Plano técnico do cofre e sincronização](docs/PLANO_MOBILE.md).
- [Adaptação responsiva e verificações](docs/ADAPTACAO_RESPONSIVA.md).
- [Histórico dos pedidos de trades e ativos](docs/REVISAO_PEDIDOS_TRADES_ATIVOS.md).
- [Registo rápido](docs/REGISTO_RAPIDO.md) e [poupanças/cashback](docs/POUPANCAS_DESCONTOS_CASHBACK.md).
- [Revisão dos dados restaurados](docs/REVIEW_DADOS_RESTAURADOS.md).
- [Checklist de segurança e privacidade](docs/LEGAL_SECURITY_CHECKLIST.md).
- [Validação nativa e distribuição](mobile/RELEASE.md).
- [Decisão sobre Trade Republic](docs/trade-republic.md).

## 8. Como manter esta lista

1. Registar cada novo pedido numa linha com ID, estado e critério de conclusão.
2. Ao concluir, atualizar esta lista e guardar a evidência no documento técnico
   relevante. Não criar uma segunda lista de pendentes nesse documento.
3. Se uma tarefa reaparecer, registar a nova evidência e data, como em A02;
   não apagar o histórico nem confiar num estado antigo.
4. Distinguir sempre código implementado, validação em navegador, validação em
   dispositivo real e publicação. Uma etapa não prova as restantes.
