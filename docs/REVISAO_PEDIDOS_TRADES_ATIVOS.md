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


## Corre??o de classifica??o e P&L ? 2026-09-10

- A an?lise combina posi??es abertas e execu??es realizadas pelas classifica??es pr?prias de cada registo. N?o associa resultados pelo ticker; inclui ativos totalmente vendidos.
- Todas as dimens?es partilhadas s?o preservadas: tipo, risco, retorno esperado, horizonte, liquidez e playlist. Os saldos spot deixam de perder risco e horizonte.
- O detalhe distingue posi??es abertas e trades fechados e identifica conta/data. Capital e P&L n?o realizado pertencem ?s posi??es abertas; resultados realizados pertencem aos trades.
- Holdings, an?lise e playlists usam a mesma fonte de posi??es e o mesmo c?lculo de P&L, incluindo o pre?o de entrada personalizado quando aplic?vel.
- Guardar classifica??es atualiza a an?lise e as restantes p?ginas de investimentos. Registos sem classifica??o continuam em Unset; n?o recebem tags de outra opera??o do mesmo ativo.
- Valida??o: 2237 testes, TypeScript e ESLint passaram. Teste no navegador guardou classifica??es em duas execu??es do mesmo ticker, confirmou persist?ncia e presen?a individual na an?lise por horizonte. Fixtures removidas no final.

Plano ainda pendente: pesquisa autom?tica de ativos; minimizar todos os pain?is; reconciliar diferen?as de classifica??o do patrim?nio; autentica??o Google/Apple e isolamento de utilizadores; sincroniza??o encriptada PC/mobile e offline; liga??o/revoga??o/recupera??o de dispositivos; revis?o de seguran?a, privacidade e obriga??es legais; instala??o, widgets e notifica??es; testes em dispositivos reais e distribui??o.


## Associa??o por posi??o do broker ? conclu?da em 2026-09-10

- O hist?rico guarda separadamente o ID da posi??o, a data de cria??o e a indica??o de resumo de posi??o. Um ID de ordem ou execu??o n?o ? tratado como ID comum de abertura/fecho.
- O matching respeita conta, liga??o, moeda, instrumento, dire??o e ID de posi??o. Fechos parciais consomem apenas a quantidade dispon?vel, sem reutilizar aberturas nem misturar IDs. Sem ID, a associa??o continua identificada como estimativa FIFO.
- A MEXC fornece um resumo por posi??o encerrada. O detalhe mostra ID e data de cria??o quando dispon?veis; n?o s?o criadas execu??es fict?cias de abertura. Refer?ncia: [API oficial MEXC, hist?rico de posi??es](https://mexcdevelop.github.io/apidocs/contract_v1_en/#get-the-user-s-history-position-information).
- Migra??o 0041 gerada pelo Drizzle e aplicada ? base local; segunda gera??o sem altera??es. Backups incluem os novos campos na tabela de atividades.
- Sincroniza??o local MEXC atualizou 14 posi??es hist?ricas com ID e preservou as classifica??es existentes.
- Valida??o: 2245 testes; TypeScript e ESLint; navegador confirmou sele??o da abertura pelo ID em vez da mais antiga de outro ID, e apresenta??o do resumo com data. Fixtures removidas no final.
- Limite: a associa??o exata entre execu??es depende de o feed fornecer um ID comum de posi??o. Os feeds que fornecem apenas IDs de ordens/execu??es mant?m FIFO identificado como estimativa. A data de cria??o de um resumo n?o substitui detalhes individuais que o broker n?o fornece.
