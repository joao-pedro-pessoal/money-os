# Money OS — tarefas e estado do projeto

Atualizado em **17 de setembro de 2026**.

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
| F01 | Propor transações recorrentes | Na data de uma subscrição, propor a despesa para confirmação. Não criar movimentos financeiros automaticamente nem duplicar um movimento importado. |
| F02 | Alertas fora da app | Ligar o motor de alertas existente a push e/ou email. Escolher o canal e configurar o serviço e credenciais necessários. |
| F03 | Relatório mensal | Uma página com receitas, despesas, desvios ao orçamento e evolução do património no mês fechado, reutilizando os cálculos existentes. |
| F04 | Anexar recibos | Foto/PDF associado à transação, com armazenamento, exportação, backup, restauro e eliminação coerentes. |
| F05 | Completar o modelo de obrigações | Acrescentar cupões e maturidade, com uma definição explícita da avaliação. Priorizar quando existir uma obrigação real para validar. |
| F06 | Validar e ampliar conectores | Testar Kraken, Binance e restantes caminhos de sucesso ainda sem validação com contas reais. Acrescentar Funding/Earn da Binance. Coinbase é candidata, dependente de credenciais de teste e confirmação da API. |
| F07 | Implementar BloFin | Desenho documentado, conector por construir. Confirmar o âmbito e validar com uma chave de leitura real; seguir os pontos de integração do plano técnico. |
| F08 | Widgets e ações em notificações | **Primeira versão feita a 17/09/2026** (ver secção 5): widget, atalhos do ícone e notificação abrem o registo rápido do site. Falta validar no telemóvel real e, se pedido, registar o valor diretamente na notificação sem abrir a app (exige uma rota própria, sessão e proteção contra duplicados). |

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

Validação da última alteração da interface: **2337 testes aprovados**, build e
TypeScript aprovados, lint sem erros e com três avisos Bybit já existentes, sem
alterações de esquema. Auditoria com a inconsistência de A02. Estes resultados
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
