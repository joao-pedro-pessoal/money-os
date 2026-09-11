# Revisão dos pedidos de trades e ativos

## Implementado

- Nomes clicáveis nos holdings, posições live, saldos spot, watchlist e histórico.
- Links externos apenas na página de informação do ativo. A edição do holding tem um link interno para essa página.
- Pesquisa curta de ETFs mantém qualificadores como Information Technology; S&P 500 abre o índice no TradingView, identificado como índice.
- A tabela de trades mostra apenas operações de instrumentos com P&L realizado finito. Um resultado realizado de zero continua válido; um evento explicitamente Open não é um fecho.
- Cada fecho tem uma linha e tags próprias, guardadas por ID de atividade. O editor agregado por instrumento foi removido.
- O formulário de classificação por trade usa o mesmo vocabulário das posições abertas: tipo de ativo, risco, retorno esperado, horizonte, liquidez, taxa anual quando aplicável, playlist e notas. Guarda em `trade_classifications` por `activity_id`, sem herdar classificações atuais do ativo. Os grupos da análise leem essas classificações individuais. A migração gerada `0040_sticky_wendell_vaughn` foi aplicada à base local e os backups incluem as classificações e os eventos de que dependem.
- Formulários de tags dentro da célula, com estado de gravação, confirmação e erro.
- Aberturas associadas por FIFO dentro da mesma conta, conexão, moeda, símbolo e direção. As quantidades consumidas não são reutilizadas; fechos parciais continuam separados.
- A associação é apenas uma estimativa visual. Não altera o P&L do broker nem grava uma ligação como se fosse confirmada pelo broker.
- Cálculo de P&L derivado separado por conta/conexão/moeda antes de aplicar o algoritmo existente de custo médio.

## Limites e tarefas pendentes

- Os eventos atuais têm ID de execução, mas não um ID comum de posição que confirme open/close. Reversões e histórico incompleto exigem confirmação ou dados adicionais do broker.
- Pesquisa e sugestões automáticas de ativos e identificação de bolsas ainda precisam de trabalho.
- Preço médio agora inclui holdings manuais, posições live e spot por conta/origem. Não mistura moedas; para posições cuja moeda de cotação não é fornecida, identifica as unidades do broker.
- Completar minimização de todos os painéis da aplicação; a alteração anterior cobriu apenas componentes Section.
- Reconciliar diferenças já existentes entre exposição de investimentos e classificação do património, incluindo collateral crypto.
- Login Google/Apple, isolamento de utilizadores, sincronização cifrada, offline, gestão e recuperação de dispositivos, revisão de segurança/privacidade e checklist legal.
- Aplicação instalável, widgets, notificações, testes em dispositivos e distribuição.

## Verificação

- Suite completa: 2.220 testes aprovados; mais quatro testes de links aprovados depois.
- Testes de associação incluem ciclos repetidos, fechos parciais, shorts, P&L zero e isolamento por conta/conexão/moeda.
- Browser: gravação/recarregamento de tags, estrutura da tabela, navegação de holdings e links apenas no detalhe.
- TypeScript, ESLint e build aprovados.
- Auditoria local sem invariantes quebradas; quatro notas financeiras preexistentes para revisão.


## Correção de classificação e P&L — 2026-09-10

- A análise combina posições abertas e execuções realizadas pelas classificações próprias de cada registo. Não associa resultados pelo ticker; inclui ativos totalmente vendidos.
- Todas as dimensões partilhadas são preservadas: tipo, risco, retorno esperado, horizonte, liquidez e playlist. Os saldos spot deixam de perder risco e horizonte.
- O detalhe distingue posições abertas e trades fechados e identifica conta/data. Capital e P&L não realizado pertencem às posições abertas; resultados realizados pertencem aos trades.
- Holdings, análise e playlists usam a mesma fonte de posições e o mesmo cálculo de P&L, incluindo o preço de entrada personalizado quando aplicável.
- Guardar classificações atualiza a análise e as restantes páginas de investimentos. Registos sem classificação continuam em Unset; não recebem tags de outra operação do mesmo ativo.
- Validação: 2237 testes, TypeScript e ESLint passaram. Teste no navegador guardou classificações em duas execuções do mesmo ticker, confirmou persistência e presença individual na análise por horizonte. Fixtures removidas no final.

Plano ainda pendente: pesquisa automática de ativos; minimizar todos os painéis; reconciliar diferenças de classificação do património; autenticação Google/Apple e isolamento de utilizadores; sincronização encriptada PC/mobile e offline; ligação/revogação/recuperação de dispositivos; revisão de segurança, privacidade e obrigações legais; instalação, widgets e notificações; testes em dispositivos reais e distribuição.


## Associação por posição do broker — concluída em 2026-09-10

- O histórico guarda separadamente o ID da posição, a data de criação e a indicação de resumo de posição. Um ID de ordem ou execução não é tratado como ID comum de abertura/fecho.
- O matching respeita conta, ligação, moeda, instrumento, direção e ID de posição. Fechos parciais consomem apenas a quantidade disponível, sem reutilizar aberturas nem misturar IDs. Sem ID, a associação continua identificada como estimativa FIFO.
- A MEXC fornece um resumo por posição encerrada. O detalhe mostra ID e data de criação quando disponíveis; não são criadas execuções fictícias de abertura. Referência: [API oficial MEXC, histórico de posições](https://mexcdevelop.github.io/apidocs/contract_v1_en/#get-the-user-s-history-position-information).
- Migração 0041 gerada pelo Drizzle e aplicada à base local; segunda geração sem alterações. Backups incluem os novos campos na tabela de atividades.
- Sincronização local MEXC atualizou 14 posições históricas com ID e preservou as classificações existentes.
- Validação: 2245 testes; TypeScript e ESLint; navegador confirmou seleção da abertura pelo ID em vez da mais antiga de outro ID, e apresentação do resumo com data. Fixtures removidas no final.
- Limite: a associação exata entre execuções depende de o feed fornecer um ID comum de posição. Os feeds que fornecem apenas IDs de ordens/execuções mantêm FIFO identificado como estimativa. A data de criação de um resumo não substitui detalhes individuais que o broker não fornece.


## Performance by: open / closed / both (2026-09-11)

Implementado e documentado em [Filtro de estado de performance](FILTRO_ESTADO_PERFORMANCE.md).


## Daily P&L calendar (2026-09-11)

Implementado no Trade History e documentado em [Calendario de P&L](CALENDARIO_PNL.md).
