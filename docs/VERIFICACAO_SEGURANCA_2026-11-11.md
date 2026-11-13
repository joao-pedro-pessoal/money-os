# Verificação de segurança do Money OS — 11/11/2026

Revisão do código do ramo `f19-play-store`, a partir de `f93ab857d6969b451f04e048ca7682e06a748c31`, em `C:\Users\joao2\Projects\money-os-f17`. **Há falhas relevantes por resolver; esta revisão não certifica a abertura pública.** O estado de acompanhamento está em R10 no `TAREFAS.md`.

Não houve acesso à base de dados de produção, consultas a contas reais, acesso à Vercel, migrações, commit ou push. A outra pasta `money-os` e os quatro itens preexistentes por registar não foram alterados. Não se testou carga contra o site publicado. As conclusões sobre a configuração publicada dependem exclusivamente do código e da documentação local; não foi lida a configuração atual do alojamento.

## Continuação autorizada: correções adicionais locais

Após «podes continuar», foram implementadas as correções técnicas abaixo. **Estado atual: 3847 testes aprovados em 242 ficheiros**, TypeScript, lint de src e compilação de produção money aprovados. Não houve alterações de esquema, migrações, ecrãs, fornecedores de autenticação, segredos, commit, push ou acesso à produção/Vercel. Permanecem as decisões sobre quotas, tetos de ficheiros e credenciais nos backups, além das validações integrais ainda assinaladas no inventário.

| Grupo / localização atual | O que mudou | Evidência antes/depois |
| --- | --- | --- |
| C1 — sessão nas entradas privadas: `src/actions/requestSession.ts:8`, `src/actions/releaseEdition.ts:22` | 167 ações passaram a verificar sessão antes de dados/serviços; outras 35 ficam protegidas também em full por requireInvestments. Widget, alertas e PDF verificam sessão dentro do handler, com 401 sem cache. O contexto interno asUser continua disponível exclusivamente ao servidor. | 202 regressões de ações reproduzidas antes; 202 aprovadas depois, mais a regra que impede novas ações privadas sem verificação, três handlers e cinco casos de sessão/contexto interno. Mensagens dos formulários já existentes preservadas nos testes. |
| C2 — revogação: `src/lib/auth.ts:101`, `src/db/client.ts:32`, `src/actions/sessionRevocation.ts:19` | Cookies novos v4 conservam milissegundos; v2/v3 não revogados continuam legíveis. Saiu o cache de 30 s entre pedidos. O pool confirma existência/revogação numa consulta parametrizada antes de atribuir a identidade em cada aquisição, sem recursão ao próprio db. | Nove falhas reproduzidas nos casos de precisão, identidade do pool e releitura de revogação; aprovadas depois. Também foram preservados QR, cookies antigos válidos e trabalho interno. |
| C3 — conta própria/importação: `src/actions/imports.ts:41`, `src/actions/brokerImport.ts:33`, `src/actions/brokerImport.ts:119`, `src/actions/connections.ts:486` | Conta própria confirmada antes de importar/pré-visualizar/ligar. A importação bancária grava movimentos na moeda da conta; importação, movimentos, saldo e auditoria ficam na mesma transação. Eventos de corretora e auditoria também são atómicos. | PostgreSQL em memória com migrações reais e RLS: recusas de conta alheia, USD preservado e rollback após falha do segundo movimento. Importação e ligação próprias mantêm-se válidas, sem chamadas à corretora. |
| C4 — referências do restauro: `src/actions/export.ts:199` | Antes de apagar dados, cada FK pessoal não nula tem de apontar a uma linha da própria cópia. A verificação deriva das FKs reais do esquema, descarta o dono e indexa referências para evitar procura quadrática. Não alterou o formato do backup. | Três falhas reproduzidas com referência de dívida, movimento e valor esperado a conta de outra pessoa; depois a cópia é recusada e os dados originais ficam intactos. Roundtrip, rollback e restauro para novo ID pessoal continuam aprovados. |
| C5/S05c — corridas de credenciais e renovação: `src/actions/auth.ts:78`, `src/actions/auth.ts:363`, `src/proxy.ts:10`, `src/actions/session.ts:40` | Uma verificação lenta da password só pode editar/apagar enquanto hash e cutoff continuarem iguais. Recuperação revoga também entradas iniciadas durante o hash. Sign-in e renovação do proxy usam o início do pedido, e Log out other devices só escreve se o cookie iniciador ainda não foi revogado. Isso impede que estas corridas emitam um cookie posterior à recuperação usando autorização antiga. | Cinco falhas em PostgreSQL reproduzidas para login/rehash, troca de código, eliminação e recuperação durante o hash; mais duas falhas de renovação/saída de aparelhos. Todas aprovadas depois, com casos de sucesso normal. |

**Risco residual e alcance:** o pool faz leituras adicionais de revogação; não foi medido desempenho sob carga. Pedidos/transações já admitidos podem terminar enquanto ocorre uma recuperação; as correções impedem que novas aquisições aceitem a identidade revogada ou que uma verificação/renovação antiga crie uma sessão posterior válida. Não é cancelamento de trabalho já em curso. Os ensaios são locais, incluindo PostgreSQL em memória e relógios/serviços simulados; não certificam a configuração publicada. A exposição histórica dos segredos S01 continua por resolver pelo utilizador.

## O que está bem

| Proteção confirmada no código e nos ensaios locais | Evidência e alcance |
| --- | --- |
| Hash de password lento, fila e bloqueio de tentativas | `src/lib/accounts/password.ts:23`, `src/actions/auth.ts:50`: scrypt N=2^15, dois hashes em execução e oito em espera. O bloqueio por conta e a verificação falsa para emails desconhecidos foram preservados; os testes existentes passaram. |
| Registo protegido no servidor | `src/actions/auth.ts:278`, `src/app/api/register/route.ts:11`: schema estrito, limites, BotID, mesma origem e corpo até 4096 bytes, incluindo streaming. Não foi ensaiada a classificação real do BotID na Vercel. |
| Isolamento financeiro por RLS previsto para todas as tabelas pessoais | `src/lib/__tests__/row-security.test.ts:65`: inventário do esquema e políticas nas migrações; suites locais com pessoas fictícias aprovadas. As exceções e a diferença entre 54 tabelas/45 políticas estão explicadas abaixo. Não confirma a instalação em produção. |
| Consultas parametrizadas | `src/db/client.ts:100` e inventário por função: Drizzle/SQL parametrizado; não foi encontrada concatenação de argumentos de pedidos em SQL nos endpoints. |
| Cookie HttpOnly e SameSite | `src/lib/auth.ts:159`: opções centralizadas. A exigência de Secure na Vercel foi reforçada nesta revisão, com teste antes/depois. |
| Código de recuperação guardado só como hash e consumido atomicamente | `src/lib/accounts/credentials.ts:88`, `src/actions/auth.ts:337`: SHA-256 de código aleatório, rotação e condição no UPDATE. O alcance das correções de revogação está descrito em C2/C5. |
| QR com validade e uso único | `src/actions/qrSignIn.ts:18`, `src/actions/qrSignIn.ts:58`, `src/actions/qrSignIn.ts:78`: capacidades separadas, cinco minutos, cinco palpites, aprovação autenticada e consumo com bloqueio. Testes de expiração, replay e concorrência aprovados. |
| Texto pessoal tratado como texto | `src/lib/reports/pdf.ts:545`, `src/app/api/widget/route.ts:32`, `src/app/api/alerts/route.ts:18`: texto desenhado por pdf-lib ou devolvido em JSON/React; não é interpretado como HTML nesses fluxos. Detalhes do Android e CSV abaixo. |
| Valores privados ausentes do bundle estático pesquisado | Compilação money em cópia isolada, 74 ficheiros estáticos e grafo de 119 módulos cliente: sem valores privados/marcadores. As respostas de ações foram analisadas separadamente; foi aí que surgiu S07. |

## Resultado e alterações locais

| Referência | Resultado | Situação nesta revisão |
| --- | --- | --- |
| S01 — crítico | `APP_SECRET` e `APP_PASSWORD` do `.env` local são exatamente iguais a valores publicados no histórico de `.env.example`. | **Não alterados**, conforme pedido. Substituição/revogação pelo utilizador. Não se sabe se são os mesmos da Vercel. |
| S02 — alto | Faltavam verificações de sessão/revogação em ações e handlers. | **Corrigido localmente em C1:** 202 ações abrangidas e três handlers privados; contexto interno preservado. Inventário atual abaixo. |
| S03 — alto | Validação desigual de tipos, tamanhos, números, datas, moedas e referências. | **Parcialmente corrigido em C3/C4:** conta própria, moeda/atomicidade da importação e FKs do restauro. Schemas integrais, tetos e idempotência das importações continuam incompletos. |
| S04 — alto | Uma função interna devolvia a data de revogação de qualquer ID; outra permitia invocar diretamente a gravação de snapshots. | **Corrigido localmente:** leitor movido para módulo interno; escritor deixou de ser Server Action. |
| S05 — alto | Havia perda de precisão, cache entre pedidos e corridas de revogação/credenciais. | **Corrigido localmente em C2/C5:** v4, consulta fresca no pool, escritas condicionais e renovação sem reviver autorização antiga. Ver alcance dos testes e trabalho já em curso. |
| S06 — médio/alto | Só a autenticação/registo/QR têm contadores de pedidos. PDF, importação/exportação, câmbios, pesquisa, widget, alertas e sync não têm quotas completas. | Proposta concreta abaixo; nenhuma quota nova aplicada. |
| S07 — alto | `listConnections` devolvia `externalId` em bruto; para várias corretoras esse campo é a API key. A versão mascarada não removia o original. | **Corrigido localmente:** resposta exclui API key, segredo/passphrase cifrados e sessão bancária cifrada; mantém máscara e apresentação. O backup continua a incluir credenciais, por ser um formato de restauro — ver limite abaixo. |
| S08 — médio | `Secure` dependia apenas de `COOKIE_SECURE=true`, mesmo na Vercel. | **Corrigido localmente:** `VERCEL=1` força `Secure`; a cópia de casa por HTTP mantém o comportamento. |

As quatro correções iniciais e os cinco grupos da continuação estão identificados separadamente. Os testes das falhas foram executados antes/depois. O login próprio, os ecrãs e o formato do backup foram preservados; os movimentos CSV passaram a usar corretamente a moeda da conta. As alterações ficam apenas no worktree, sem commit/publicação.

## Cada falha: localização, efeito, evidência e correção

Esta tabela preserva os riscos e as localizações do **diagnóstico anterior à continuação**; as linhas atuais dos pontos corrigidos estão na tabela C1–C5 e no inventário final. **HEAD anterior** identifica o commit de partida da primeira passagem. O estado da última coluna foi atualizado; não se incluem valores secretos. As 273 ações do inventário não são 273 vulnerabilidades independentes.

| Falha / gravidade | Ficheiro:linha | Risco e evidência | Correção proposta / estado |
| --- | --- | --- | --- |
| S01 — crítico: segredo/password públicos | `.env.example:3` e `.env.example:2` no commit `67105d3`; `.env.example:4` e `.env.example:3` no commit `43a89f0` | Comparação em memória confirmou igualdade exata com APP_SECRET e APP_PASSWORD locais. Quem conhece o secret pode assinar cookies; o valor público da password deixa de ser uma credencial privada. A utilização dos mesmos valores na Vercel não foi verificada. | Não alterados. O utilizador deve substituir os valores nos ambientes afetados; mudar só APP_PASSWORD não troca a password de uma conta já reclamada. |
| S02a — alto: ações sem sessão própria | `src/actions/export.ts:70`, `src/actions/accounts.ts:119`; todas as ocorrências estão no inventário | As entradas não recusam sessão ausente/revogada antes de executar. A RLS restringe linhas, mas não substitui autenticação; um dispatcher numa página pública pode chamar ações referenciadas no build. Confirmado por leitura de código e manifesto local, sem exploração em produção. | **Corrigido localmente em C1:** autenticação antes de trabalho/DB; trabalho interno apenas por contexto do servidor. |
| S02b — alto: guarda de edição não é sessão universal | `src/actions/releaseEdition.ts:12`, `src/actions/releaseEdition.ts:21` | Na edição full, currentInvestments retorna true sem verificar pessoa. Não se pode usar requireInvestments como autenticação universal. Na edição money a mesma guarda restringe ao dono autenticado. | **Corrigido localmente em C1:** requireInvestments verifica também sessão em full. |
| S02c — médio/alto: pedido externo anterior à autenticação | `src/actions/connections.ts:670`, `src/actions/connections.ts:1053`, `src/actions/fx.ts:35` | syncConnectionAction e autoSyncAction fazem refreshRates antes da guarda posterior; refreshRates também é uma ação exportada sem sessão. O serviço externo pode ser chamado antes de qualquer recusa. | **Corrigido localmente em C1:** verificação antes de refreshRates e na própria ação de câmbios. |
| S03a — alto: restauro com validação superficial | `src/actions/export.ts:138`, `src/actions/export.ts:153`, `src/lib/backup/index.ts:96` | A inspeção analisa JSON sem teto próprio e valida envelope/listas, sem schema completo das linhas. O restauro remove userId, mas confia em conteúdo/referências; a transação protege rollback, não a validade do conteúdo. | **Parcial em C4:** FKs pessoais validadas na própria cópia antes de apagar. Schema integral e tetos continuam por implementar. |
| S03b — alto: extrato de corretora sem teto próprio/conta confirmada | `src/actions/brokerImport.ts:32`, `src/actions/brokerImport.ts:116` | Parser no servidor, mas sem teto explícito de linhas/campos e sem leitura que confirme a conta própria antes de inserir. Uma FK simples não faz essa confirmação. | **Parcial em C3:** conta própria e transação aplicadas. Tetos/schema completo/lotes limitados continuam propostos. |
| S03c — alto: importação bancária parcial e pouco validada | `src/actions/imports.ts:39` | A ação confia na forma do array, valida apenas parte de cada linha, não confirma a conta própria e escreve em vários passos sem transação integral. Pode deixar importação parcial e dados incoerentes. | **Parcial em C3:** conta própria, moeda e transação aplicadas. Schema integral, limites e idempotência continuam por concluir. |
| S03d — alto: linhas de investimento confiadas ao cliente | `src/actions/investmentActivity.ts:54` | Confirma conta própria e usa transação, mas não valida integralmente tipos, números finitos/faixas, datas, moeda, hash ou volume das linhas recebidas. | Revalidar o array no servidor e impor tetos antes de cálculos/SQL. Proposta. |
| S03e — médio: códigos, IDs e textos sem validação integral | `src/actions/accounts.ts:119`, `src/actions/fx.ts:66`, `src/actions/transactions.ts:44` | Exemplos: moeda/tipo de conta sem whitelist; taxa aceita código não vazio sem confirmar moeda; limit da listagem sem inteiro/teto. O inventário aponta os restantes campos/funções e os validadores que já existem. | Reutilizar parsers e schemas comuns; definir tetos coerentes sem alterar dados existentes. Proposta. |
| S04a — médio: leitor interno exposto como ação | `src/actions/session.ts:42` no **HEAD anterior**; agora `src/actions/sessionRevocation.ts:16` | Aceitava qualquer ID para consultar a data de revogação; users não tem own_rows. O teste de fronteira falhou antes e passou depois. O manifesto final não contém esse endpoint. | **Corrigido localmente:** helper fora de use server, com imports ajustados e comportamento de cache preservado. |
| S04b — alto: escritor de snapshots exposto | `src/actions/snapshots.ts:24` no **HEAD anterior**; agora `src/actions/snapshots.ts:25` | O export de um módulo use server tornava o escritor invocável com valores fornecidos diretamente, sem ser uma operação financeira autorizada. Teste de fronteira falhou antes; manifesto final sem writeSnapshot. | **Corrigido localmente:** snapshots.ts passou a helper interno. Não mudou o cálculo nem o histórico existente. |
| S05a — alto: sessão do mesmo segundo não revogada | `src/lib/auth.ts:154`, `src/actions/auth.ts:361` | endedBy usa segundos inteiros e comparação estrita; uma sessão antiga do mesmo segundo da recuperação continua a passar. Comportamento confirmado pelo teste existente do mesmo segundo. | **Corrigido localmente em C2/C5:** precisão em milissegundos, cutoff após o hash e testes de concorrência. |
| S05b — alto: revogação não aplicada em todos os caminhos | `src/actions/sessionRevocation.ts:7`, `src/db/client.ts:32` | Cache até 30 s; o pool só verifica assinatura/idade. Ações sem currentUserId/hasSession podem aceitar cookie revogado em entradas públicas; a RLS lê a identidade do cookie sem revogação. | **Corrigido localmente em C1/C2/C5:** sem TTL de 30 s; atribuição de identidade com leitura fresca e renovação/escritas protegidas. |
| S06a — médio/alto: CPU/leitura sem quota | `src/app/api/report/pdf/route.ts:19`, `src/app/api/widget/route.ts:31`, `src/app/api/alerts/route.ts:17`, `src/actions/export.ts:70` | Não existe admissão persistente por pessoa/ligação nem limite agregado de concorrência nestas entradas. Pedidos repetidos refazem trabalho; cache/no-store não é quota. | Valores, concorrência e contrato 429 propostos na secção 4. Sem implementação. |
| S06b — médio/alto: chamadas externas sem quota completa | `src/actions/assetSearch.ts:10`, `src/actions/quotes.ts:69`, `src/actions/connections.ts:697`, `src/actions/fx.ts:35`, `src/app/api/sync/route.ts:25` | Timeouts, frescura, lotes e segredo reduzem casos normais, mas não impedem chamadas repetidas/concorrentes admitidas pelo servidor. | Quotas distribuídas por pessoa/IP, locks e limites globais do fornecedor/agendador. Proposta. |
| S06c — médio: recusas nem sempre têm HTTP 429 | `src/actions/auth.ts:154`, `src/actions/auth.ts:269`, `src/actions/qrSignIn.ts:18`, `src/app/api/register/route.ts:48` | As ações devolvem outcomes/busy; o retorno normal não fixa status HTTP 429. A rota de registo mapeia o limite por ligação para 429, mas outras recusas usam 400. | Contrato HTTP e mensagem tipada descritos na proposta; não chamar a um throw genérico uma resposta 429. |
| S07a — alto: chave bruta na resposta de ligações | `src/actions/connections.ts:152` | O spread incluía externalId e a sessão bancária cifrada, apesar da máscara. Teste com chave fictícia comprovou a presença antes e a ausência depois. | **Corrigido localmente:** campos de credenciais excluídos da resposta; apresentação mantém a máscara. |
| S07b — alto: backup individual contém API key | `src/actions/export.ts:70`, `src/actions/export.ts:49` | A exportação integral inclui account_connections; externalId contém API keys de várias corretoras. Segredos/passphrases/sessões estão cifrados; a chave mestra não é exportada. | Requer decisão sobre portabilidade, proteção e aviso do backup. Não foi modificado o formato. |
| S08 — médio: Secure dependia de configuração adicional | `src/lib/auth.ts:163` | Com VERCEL=1 e COOKIE_SECURE ausente/false, o cookie não recebia Secure. Dois testes reproduziram a falha antes; os casos de HTTP local/HTTPS próprio foram preservados. | **Corrigido localmente:** VERCEL=1 força Secure. Não foi alterada configuração na Vercel. |

### Como reproduzir cada falha

As reproduções abaixo são **locais e isoladas**. Usam pessoas/chaves/ficheiros fictícios, base simulada e `fetch` substituído por uma resposta simulada. Não se deve executar estes cenários contra o site publicado ou a base real. Um insert alcançado no simulador demonstra que a ação não fez a validação antes de construir a escrita; **não demonstra que a base real aceitou o registo ou que houve leitura/escrita de outra pessoa**. Os ensaios de handlers são chamadas diretas às funções; não são um teste HTTP de contorno do proxy.

Foi criado e executado `.local-checkpoints/security-review/reproduce.test.ts`, com **15 reproduções do diagnóstico inicial**. A configuração aponta agora exclusivamente à fonte anterior preservada em `.local-checkpoints/security-review/baseline-before-continuation/src`, sem .env ou dados pessoais. Aqui, um teste aprovado confirma o comportamento dessa versão antiga, **não que a falha continue no código atual**. As regressões atuais são verificadas na suite normal de 3847 testes. O resultado histórico está em `.local-checkpoints/security-review/reproduce-results.log`; estas evidências são locais e ignoradas pelo Git.

Para repetir os 15 casos no `cmd`, sem carregar `.env` nem contactar serviços:

```bat
cd /d C:\Users\joao2\Projects\money-os-f17
npm test -- --config .local-checkpoints/security-review/reproduce.config.ts --reporter=verbose
```

| Falha | Passos e resultado que reproduzem o problema | O que foi efetivamente verificado |
| --- | --- | --- |
| S01 | Comparar em memória APP_SECRET/APP_PASSWORD do `.env` com `.env.example` dos commits `67105d3` e `43a89f0`, sem imprimir os valores. `node .local-checkpoints/security-review/secrets.cjs` faz essa comparação e devolve apenas nomes/metadados e igualdade. | **Executado:** igualdade exata de ambos os valores locais. Não se comparou com Vercel nem se criaram cookies falsos para uma conta real. |
| S02a | No teste, a sessão está ausente; chamar `exportAllData()` com a base simulada. A função entra na transação e lê `accounts` em vez de recusar antes do acesso. | **Executado**, caso `S02a`. A possibilidade de despachar a ação por uma página pública é sustentada pelo código/manifesto; não foi explorada por HTTP na produção. O inventário identifica as outras entradas a rever. |
| S02b | Definir a edição pública como `full`, simular pessoa anónima e chamar `requireInvestments()`. A promise termina normalmente. | **Executado**, caso `S02b`. Para money existe restrição ao dono, já coberta pelos testes existentes; a falha é usar esta guarda como autenticação universal. |
| S02c | Com sessão ausente e `fetch` a lançar «synthetic offline», chamar `refreshRates()`. O contador de `fetch` chega a 1 antes de qualquer recusa de sessão. | **Executado**, caso `S02c`. A ordem de `refreshRates` antes da guarda em syncConnectionAction/autoSyncAction foi confirmada no código. Nenhum pedido saiu da máquina. |
| S03a | Passar a `inspectBackup` o texto `{"version":1,"data":{"accounts":[{"balance":"NaN","currency":"INVALID"}]}}`. A conta não tem ID/nome e tem valores inválidos; a inspeção responde `ok:true`, com avisos de tabelas ausentes. | **Executado**, caso `S03a`, sem chamar restoreBackup nem apagar dados. Demonstra a pré-validação insuficiente, não um restauro real aceite. |
| S03b | Criar CSV com cabeçalho `Date,Type,Amount,Currency` e 10001 linhas `2026-01-01,Deposit,1,EUR`. Chamar importBrokerStatement com conta fictícia alheia e base simulada. São entregues 10001 linhas ao insert de broker_events sem leitura prévia de accounts. | **Executado**, caso `S03b`. Confirma ausência de teto de linhas na ação e de verificação local do pai; não demonstra escrita cruzada em Postgres. |
| S03c | Chamar commitImport com conta fictícia, uma linha válida e `adjustBalance=false`: a escrita de transactions recebe o ID sem consultar accounts e não recebe currency. Num segundo ensaio, fazer falhar o segundo insert: o primeiro já foi emitido e nenhuma transação foi aberta. | **Dois casos executados**, ambos `S03c`. Confirmam a falta de moeda/ownership e de transação na ação. O ensaio usa persistência simulada, não foi gravado dinheiro real. |
| S03d | Simular conta própria existente e enviar uma linha com data `2026-02-30`, quantidade `-1`, amount `NaN`, moeda `INVALID` e hash `not-a-digest`. O construtor de insert recebe amount `"NaN"`, moeda `"INVALID"` e quantidade `"-1"`. | **Executado**, caso `S03d`. Confirma falta de validação antes do SQL; a aceitação final e as constraints reais não foram ensaiadas aqui. |
| S03e | Chamar setManualRate com `quote=NOT_A_CURRENCY` e `rate=1`. O insert simulado de exchange_rates recebe esse código. Para as restantes ocorrências, usar os parâmetros inválidos identificados na respetiva linha do inventário e verificar que são recusados antes de DB/cálculo. | **Executado** o exemplo da moeda, caso `S03e`; as outras ocorrências são análise de código e têm de ter regressões próprias ao serem corrigidas. |
| S04a | No snapshot do **HEAD anterior**, executar o novo teste `session-endpoint-boundary.test.ts`: falha porque sessionsNotBefore é exportado do módulo use server. Conferir que a função consulta users por um ID recebido, sem sessão. No código corrigido o teste passa e o manifesto não contém o helper. | **Falha antes e aprovação depois observadas** nesta revisão. Teste de fronteira/código, não exploração de um ID real. Não reverter o worktree para repetir: usar uma cópia isolada. |
| S04b | No mesmo snapshot anterior, o segundo caso de session-endpoint-boundary.test.ts falha pela diretiva use server em snapshots.ts. No código corrigido passa; writeSnapshot não aparece no manifesto. | **Falha antes e aprovação depois observadas**. Não foi invocada uma escrita arbitrária na base real. |
| S05a | Chamar `endedBy(new Date("2026-11-11T12:00:00.900Z"), new Date("2026-11-11T12:00:00.000Z"))`. A sessão é anterior à revogação, mas o resultado é `false`. | **Executado**, caso `S05a`, além do teste existente que conserva sessões do mesmo segundo. |
| S05b | Com relógio fictício, ler revogação nula às 12:00:00; fazer a base simulada passar a ter cutoff 12:00:01. Uma leitura às 12:00:29 ainda devolve null; às 12:00:31 lê o cutoff. | **Executado**, caso `S05b`. A atribuição da identidade no pool sem revogação foi confirmada no código; não foi ensaiada a combinação por HTTP com uma sessão real revogada. |
| S06a | Chamar quatro vezes o handler GET do PDF com o mesmo endereço local e renderer/fontes/relatório simulados. As quatro chamadas chegam ao renderer e devolvem 200; não há recusa 429 antes da geração. | **Executado**, caso `S06a`. Não é ensaio de carga nem prova de todas as rotas; ausência de quota nas restantes entradas desta classe foi conferida no código. |
| S06b | Simular sessão válida, base vazia e fornecedor indisponível; chamar searchAssets("SYNTHETIC") 40 vezes. O fetch simulado é chamado 40 vezes, sem quota entre tentativas. | **Executado**, caso `S06b`. Não houve 40 pedidos ao Yahoo real. As restantes entradas externas foram revistas no código; não se usaram chaves de corretoras. |
| S06c | Simular `admitted=false` e chamar signIn com email fictício válido e chave hex de 64 caracteres. Recebe-se `{kind:"refused",...}`, não um objeto Response/status HTTP. | **Executado**, caso `S06c`. Demonstra o contrato da função; o status do dispatcher Next não foi medido neste teste. O mapeamento de `/api/register` para 429/400 foi conferido no handler. |
| S07a | A base simulada devolve ligação com externalId `synthetic-api-key-do-not-send`. Antes da correção, connection-output-security.test.ts falha porque a resposta contém externalId; depois passa e a chave integral não aparece no JSON da resposta. | **Falha antes e aprovação depois observadas**. Também se verificou a exclusão dos três campos cifrados. Nenhuma chave real foi usada. |
| S07b | Colocar `externalId=SYNTHETIC_KEY_FOR_AUDIT` numa ligação simulada e chamar exportAllData. Em `data.accountConnections[0].externalId` aparece o valor integral. | **Executado**, caso `S07b`. É a cópia individual completa, ainda sem alteração de formato; não confundir com a resposta listConnections já corrigida. |
| S08 | Nos testes hosted-cookie-security, definir VERCEL=1 e COOKIE_SECURE ausente ou false. Antes, sessionCookieOptions devolvia secure=false; depois devolve true. Sem Vercel, HTTP local continua false e HTTPS configurado continua true. | **Dois casos falharam antes; quatro passaram depois.** Não foi alterado o cookie/configuração de uma sessão real na Vercel. |

### O que corrigi na primeira passagem

| Correção local | Alteração concreta | Teste de regressão |
| --- | --- | --- |
| S04a | sessionsNotBefore passou de ação exportada em session.ts para helper interno sessionRevocation.ts; imports do proxy/Settings e teste de cache ajustados. | `src/actions/__tests__/session-endpoint-boundary.test.ts:5`, mais os testes de identidade/cache existentes. |
| S04b | Retirada a diretiva use server do escritor interno em snapshots.ts; o cálculo e os chamadores foram preservados. | `src/actions/__tests__/session-endpoint-boundary.test.ts:12`. |
| S07a | listConnections deixa de devolver externalId e credenciais cifradas; mantém externalIdMasked e os restantes dados usados no ecrã. | `src/actions/__tests__/connection-output-security.test.ts:15`. |
| S08 | VERCEL=1 passa a forçar cookie Secure; a cópia de casa por HTTP continua suportada. | `src/lib/__tests__/hosted-cookie-security.test.ts:7`. |

São quatro correções, **sete casos de regressão novos**, com cinco falhas iniciais observadas. Não foram alterados ecrãs/textos, o formato do backup, quotas de pedidos, passwords, segredos, esquema ou dados reais. Tudo permanece sem commit e sem publicação.

### O que precisa de decisão ou ação tua

Autenticação, revogação, os casos de ownership/atomicidade identificados nas importações/ligações e as FKs do restauro foram corrigidos nesta continuação, mantendo o login próprio. Os schemas e as regras de validação ainda incompletos continuam identificados por função. **Não exigem escolher outro sistema de login**, nem todas as tarefas técnicas dependem de uma decisão de produto.

| Tema | Decisão/ação concreta | Porque não avancei nessa parte |
| --- | --- | --- |
| S01 — valores publicados | Substituir APP_SECRET e APP_PASSWORD nos ambientes que ainda usam os valores públicos; mudar a password de uma conta já reclamada pelo fluxo próprio. Confirmar por tua iniciativa se a Vercel usa os mesmos, sem os copiar para a conversa. | Pediste expressamente para eu não mudar os segredos encontrados. A rotação do secret termina as sessões antigas; mudar APP_PASSWORD no ambiente não muda o hash da conta existente. |
| S06 — novos limites e mensagens | Aprovar ou ajustar os valores por pessoa/ligação, concorrência e mensagens 429 da secção 4. | Afetam pedidos legítimos, frequência de atualização e o que a pessoa vê; pediste confirmação para alterações visíveis. Nenhum limite novo foi aplicado. |
| S03 — dimensão dos ficheiros | Decidir o teto dos imports e o tamanho de backup que deve ser suportado. Há proposta de 10000 linhas para CSV; backups grandes precisam de solução que respeite o limite atual de 1 MiB das ações. | Um teto novo pode recusar um ficheiro que hoje entra. Não devo escolher um valor que torne cópias legítimas inutilizáveis. As validações técnicas de tipos/ownership são uma questão separada. |
| S07b — credenciais no backup | Manter a cópia completa com proteção/aviso explícito do ficheiro, ou excluir credenciais e pedir que sejam introduzidas após restauro; uma cópia completa cifrada seria uma terceira opção, com um fluxo próprio. | Altera o formato, a portabilidade e a experiência de restauro. Retirar silenciosamente as chaves deixaria uma cópia incompleta. |
| Sync — segredo no endereço | Decidir se se pode retirar a compatibilidade do POST com `?secret=...`, depois de adaptar os agendadores que eventualmente a usem, e passar a usar apenas header/Bearer. | Pode interromper um agendador existente. Nesta revisão só foram assinalados o risco de logs/histórico e o caminho por headers já disponível. |
| Commit e publicação | Apenas quando os pedires expressamente. Publicação/configuração/migrações de produção continuam fora desta entrega. | Instrução tua: não fazer push; commit só se pedires; não tocar na produção/Vercel. Não interpretei «entrega» como autorização. |

Confirmação de email e `OPERATOR_NAME`, `CONTACT_EMAIL`, `MAX_ACCOUNTS`, `REGISTRATION_MODE` continuam **apenas listados fora do âmbito**, como pediste. Não foram provisionados domínio, serviço de envio ou variáveis.

## 1. Chaves fora do browser

### Compilação e pesquisa

Compilação de produção com `APP_EDITION=money` e `VERCEL=1`, usando Next **16.4.1**. Para não substituir `.next` de um eventual servidor em execução, foi usada uma cópia isolada do código atual em `.local-checkpoints/security-review/build`, dentro deste worktree, sem copiar `.env` ou `.env.local`. O `node_modules` dessa cópia aponta apenas para o deste mesmo worktree. A base foi configurada para um endereço fictício em loopback, porta 1; não foi usada a base real.

Foram colocados marcadores fictícios distintos em `APP_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `SYNC_SECRET`, `CRON_SECRET` e `APP_PASSWORD`. A pesquisa em **74 ficheiros de `.next/static`** não encontrou os marcadores nem valores locais das variáveis privadas pesquisadas. O nome `ENCRYPTION_KEY` aparece uma vez em texto de ajuda; **o nome não é o valor da chave**. A enumeração dos leitores de ambiente em `src` e `next.config.ts` não encontrou outra variável pública da app além de `NEXT_PUBLIC_PRODUCT_EDITION` e `NEXT_PUBLIC_REGISTRATION_BOT_PROTECTION`.

Percorrido o grafo de imports de **119 módulos com `use client`**, incluindo reexports e imports dinâmicos literais, excluindo imports só de tipos: não foi encontrado caminho de código executável no browser para um módulo que leia os segredos. Os imports de módulos `use server` são referências RPC, não inclusão do código servidor no bundle. Isto não protege os valores devolvidos por uma ação: S07 era precisamente uma fuga na resposta, invisível à pesquisa do bundle estático.

O grafo é análise estática e não substitui auditoria de todos os valores passados por props/respostas. Não há módulos de aplicação com resolução dinâmica arbitrária de imports que tenham sido aprovados por este procedimento.

### Histórico do Git — S01

Foi analisado `git log --all -p --no-ext-diff`: **293 commits**, cerca de **35,2 MB de patches**. A pesquisa incluiu nomes de variáveis privadas, atribuições de credenciais, URLs de Postgres com credenciais, formatos comuns de tokens/chaves privadas e comparação em memória com os valores locais, sem os imprimir ou gravar no relatório.

**Confirmação exata:** `APP_SECRET` e `APP_PASSWORD` locais coincidem com o antigo `.env.example`, introduzido em `67105d390e1c7fa96d245e94712e23b75c458b0d` (linhas 3 e 2 respetivamente), e também presente em `43a89f036b1c16ae6cd700c979e4181cd8858bc9` (linhas 4 e 3). O valor da password é um exemplo público, não uma password privada escolhida de novo. O secret também deve ser tratado como público. Não foram expostos os seus valores nesta revisão.

**Ação do utilizador:** substituir `APP_SECRET` e `APP_PASSWORD` em todos os ambientes que ainda usem estes valores. Mudar `APP_SECRET` invalida os cookies assinados com o anterior. A password da conta já reclamada está guardada como hash na tabela `users`: **mudar só `APP_PASSWORD` não muda essa password**; é necessário usar a recuperação própria da conta para escolher outra. Não foi consultado o estado dessa conta.

Não foi encontrada correspondência dos valores locais de `DATABASE_URL`, `DATABASE_ADMIN_URL`, `ENCRYPTION_KEY` ou `SYNC_SECRET` no histórico pesquisado. As outras ocorrências analisadas eram exemplos, comandos de geração, nomes de campos, variáveis de execução ou credenciais fictícias dos testes. A pesquisa não prova a ausência de um segredo com nome/formato arbitrário, nem conhece valores que só existam na Vercel ou na base de dados. **Não alterar a `ENCRYPTION_KEY` por causa deste resultado:** não houve evidência de exposição dela e a sua troca impediria abrir credenciais existentes.

### Respostas e cópias de segurança — S07

`listConnections` já removia `encryptedSecret` e `encryptedPassphrase`, mas o spread do resto da linha incluía `externalId` e `encryptedSession`. Os conectores Bybit, Binance, OKX, MEXC, Kraken e Trading 212 usam `externalId` como API key. A resposta agora exclui estes campos e conserva `externalIdMasked`. Teste com dados fictícios confirma a ausência na serialização.

**Limite por resolver:** `exportAllData` exporta integralmente `account_connections`, incluindo `externalId` e credenciais cifradas. O utilizador que exporta o seu backup recebe portanto a API key em bruto; o segredo/passphrase/sessão ficam cifrados. Nunca é exportada a chave mestra `ENCRYPTION_KEY`. Alterar este comportamento exige decidir como manter o restauro das ligações e explicar o conteúdo sensível do ficheiro. Não foi alterado o formato do backup nem a base. A edição money não elimina automaticamente ligações antigas dos backups.

## 2. Validação, autenticação e consultas

### Como ler o inventário

A contagem foi feita sobre o código, não sobre o número referido no pedido: **antes das correções havia 52 ficheiros `.ts` diretamente em `src/actions`, dos quais 42 com diretiva `use server`, e 275 funções async exportadas**. Depois da continuação: **54 ficheiros, 41 módulos `use server`, 273 ações**. Os novos helpers são `sessionRevocation.ts` e `requestSession.ts`; `snapshots.ts` deixou de declarar ações; `sessionsNotBefore` saiu de `session.ts`. Os restantes 13 módulos são helpers, listados no fim. Ficheiros de testes não entram na contagem.

Cada função exportada tem uma linha abaixo, com referência ao código. `P` significa que as consultas observadas usam Drizzle/`sql` parametrizado, diretamente ou através das funções chamadas. Não foram encontrados `sql.raw`, `eval` de SQL ou concatenação de valores de pedidos em comandos SQL nos endpoints. SQL constante, nomes de tabelas definidos no código e `sql` com `${valor}` são distintos de concatenar texto do pedido. `—` significa que a função não consulta a base. **P não significa validação completa ou autorização correta.**

O inventário foi atualizado para o código corrigido: **167 ações passaram a requireServerSession**, incluindo as duas que antes chamavam refreshRates cedo demais; mais **35 ações** verificam sessão pela guarda requireInvestments reforçada. As outras entradas privadas mantêm verificadores/delegação explícitos. As exceções públicas são os protocolos de registo/login/recuperação e as capacidades do QR, identificados como tal. Há testes de recusa por entrada e uma regra que deteta novos exports privados sem verificação.

`E` significa guarda de edição **e sessão**, também em full, ou contexto interno asUser previamente estabelecido no servidor. Na edição money mantém a restrição ao dono. O cliente não escolhe esse contexto interno. O inventário inclui também as áreas escondidas pela edição money; a ausência de um botão nunca serve como verificação.

**S02/S05 — estado atual:** as ações privadas verificam sessão antes de trabalho; o pool também confirma diretamente existência/cutoff numa consulta parametrizada antes de selecionar a identidade de cada conexão. Essa consulta usa o client já adquirido, evitando recursão ao próprio db. Não há resultado retido durante 30 s entre pedidos. A renovação e as escritas protegidas por password não podem reviver uma autorização anterior à recuperação. A necessidade de autorizar cada ação é consistente com a [documentação do Next](https://nextjs.org/docs/app/guides/data-security).

**S03:** `String(formData.get(...))`, tipos TypeScript e validação feita só no componente não constituem schemas completos no servidor. Os parsers manuais existentes de dinheiro/data são úteis e devem ser reutilizados. Faltam sobretudo limites de texto/listas/IDs, códigos de moeda nas ações antigas e validação integral nas importações/restauro. Restrições SQL e RLS são camadas adicionais; uma FK simples não garante que o pai pertence à mesma pessoa.

### Rotas em `src/app/api`

| Rota/método | Sessão/autorização dentro do handler | Tipos, tamanhos e limites | SQL | Limite de pedidos |
| --- | --- | --- | --- | --- |
| [`/api/register` POST](../src/app/api/register/route.ts) | Público por intenção; `signUp` valida chave, registo e BotID no servidor. | Origem obrigatória igual ao Host, recusa cross-site e tipo diferente de JSON; 4096 bytes também por streaming; JSON + Zod estrito. | P | Por ligação e globais; esta rota devolve 429 para `TOO_MANY_ATTEMPTS`. |
| [`/api/alerts` GET](../src/app/api/alerts/route.ts) | **Sim:** hasSession antes de dados; 401 sem cache se ausente/revogada. | Sem parâmetros; JSON sem cache. | P | Quota de frequência ainda não aplicada. |
| [`/api/widget` GET](../src/app/api/widget/route.ts) | **Sim:** hasSession antes de dados; 401 sem cache se ausente/revogada. | Sem parâmetros; cálculos partilhados e JSON sem cache. | P | Quota de frequência ainda não aplicada. |
| [`/api/report/pdf` GET](../src/app/api/report/pdf/route.ts) | **Sim:** hasSession antes de fontes/dados/render; 401 sem cache. | Período/scope normalizados; falta teto de intervalo/linhas/concorrência. | P | Quota ainda não aplicada. |
| [`/api/sync` POST](../src/app/api/sync/route.ts) | Segredo em header, Bearer ou query; não usa cookie por intenção. Comparação em tempo constante. | Segredo não configurado →503; errado →401. Sem payload de importação. | P | Nenhum limite global/lock de execução. |
| [`/api/sync` GET](../src/app/api/sync/route.ts) | Só Bearer; aceita um dos segredos configurados. | Sem segredo no endereço; sem parâmetros de trabalho. | P | Nenhum limite global/lock; o cron diário não impede chamadas repetidas. |

### Ficheiros recebidos — S03

| Entrada | O que existe | O que falta no servidor |
| --- | --- | --- |
| Extrato da corretora (`previewBrokerStatement`/`importBrokerStatement`) | Sessão e conta própria antes do parser; eventos/auditoria numa transação; datas/números reconhecidos e chave natural. | Tetos explícitos de bytes/linhas/colunas/campos, schema integral e tamanho de lote SQL. |
| Movimentos bancários (`commitImport`) | Sessão, conta própria bloqueada, moeda da conta e transação integral com auditoria/saldo; validação parcial de data/amount e categoria própria. | Schema completo, tetos e idempotência da importação. |
| Atividade de investimento (`commitInvestmentActivityImport`) | Conta própria, transação e deduplicação por hash/fingerprint. | Não confiar no array já analisado no browser: validar tipos, datas reais, moedas, números finitos/faixas/precisão, hash e contagens; tetos de linhas/campos. |
| Cópia JSON (`inspectBackup`/`restoreBackup`) | Sessão antes do parsing; RESTORE, versão/listas/poupanças; FKs pessoais dentro da cópia antes de apagar; transação, remoção de userId e rollback. | Teto antes de JSON.parse, contagens/profundidade e schema completo de campos por tabela. A inspeção ainda pode aprovar campos inválidos que o restauro/base depois recusa. |

O Next instalado limita corpos de Server Actions a **1 MiB** por omissão (`node_modules/next/dist/server/app-render/action-handler.js`), incluindo os ramos de streaming. Não foi aumentado em `next.config.ts`. Esse teto limita o pedido HTTP serializado; **não substitui teto de linhas, validação antes de parsing, custo cumulativo ou quotas de pedidos**. Também não limita chamadas internas diretas de helpers. O seletor `accept=.csv/.json` e os parsers nos componentes são conveniência do browser, contornável por POST direto. O servidor recebe texto/arrays, não deve confiar no nome ou MIME escolhido no cliente. A referência a PDF no importador de investimento é um procedimento de conversão fora da app; não é um parser PDF de upload no servidor.

Proposta para decisão: imports CSV até 1 MiB de texto e 10000 linhas, 100 colunas, 20000 caracteres por descrição, lote SQL de 500; pedido acima do teto serializado atual continua 413. Backup: escolher um teto de produto compatível com backups existentes, com contagem total e por tabela; **não impor cegamente 10000 linhas a históricos legítimos**. Para permitir backups maiores que 1 MiB será necessário um handler dedicado com leitura limitada e quota antes de parsing, mantendo o limite geral das ações. Uma falha deve preservar os dados e identificar o limite ultrapassado.

### Texto em relatórios, widgets e alertas

Os relatórios PDF são desenhados por `pdf-lib` com `page.drawText` (`src/lib/reports/pdf.ts`), incluindo nomes de categorias/contas e descrições. Não existe interpretação de HTML, template de comando ou inserção de operadores PDF vindos desses textos; a biblioteca codifica o texto. Não se deve aplicar escape HTML a este texto, pois apareceria literalmente no PDF. Persistem riscos de custo para textos muito longos e excesso de linhas, tratados em S03/S06.

No site, os textos destes fluxos são interpolados como nós React; não foi encontrada inserção de texto pessoal por `dangerouslySetInnerHTML`/`innerHTML` nesses fluxos. As rotas de widget e alertas devolvem JSON, com Content-Type próprio e `nosniff` nos cabeçalhos globais. No Android, widgets usam `setTextViewText` e alertas `setContentTitle`/`setContentText`/`BigTextStyle.bigText`; não usam `Html.fromHtml` para estes valores. Um nome contendo `<script>` é texto, não código. Os CSV também têm `spreadsheetSafe` para prefixos de fórmulas, além de quoting normal.

### RLS: 54 tabelas e 45 políticas

O ensaio C7 de 30/10 contou **53 tabelas da aplicação + `drizzle.__drizzle_migrations` =54**; dessas tabelas da aplicação, **45 tinham linhas pessoais e política `own_rows`**, e 8 eram exceções explícitas. A referência em `TAREFAS.md` é essa fotografia histórica, não 9 tabelas pessoais desprotegidas.

O esquema atual acrescentou `expected_arrivals` nas migrações 0072–0073: **54 tabelas da app =46 pessoais +8 exceções**; com a tabela de migrações seriam 55 no mesmo ensaio. As 46 têm `ownedBy()`, FK de `user_id` e política prevista nas migrações. `row-security.test.ts` percorre os objetos reais do esquema, exige dono/default/FK, existência de ENABLE RLS e `own_rows`, e verifica regras de unicidade. Passou nesta revisão. A lista de exceções é:

| Tabela(s) | Porque não usam `own_rows` |
| --- | --- |
| `users` | Contém emails, hashes e revogação; o login tem de procurar a conta antes de haver sessão. **Contém dados pessoais**; as ações têm de filtrar/autorizar explicitamente. |
| `qr_sign_ins` | Handshakes anónimos; capacidades independentes, validade, aprovação e consumo atómico. Contém associação a uma pessoa depois de aprovada. |
| `request_limits` | Contador pré-login por impressão HMAC do IP, retida até 24 h; dado pseudonimizado, não um dado público. |
| `asset_profiles`, `fund_holdings`, `company_moves`, `asset_logos`, `benchmark_prices` | Informação pública de mercados, partilhada. As escritas precisam de proteção contra abuso. |

**Alcance do teste:** a cobertura do inventário de tabelas financeiras é completa; a cobertura de segurança de todas as tabelas com dados de pessoas não se reduz a esse teste. O teste procura texto nas migrações, não demonstra por si só que a política final tem USING/WITH CHECK corretos, que não foi desativada depois, ou que o ambiente publicado aplicou todas as migrações. Os testes PGlite de fluxos/backup/QR exercitam RLS e concorrência dos casos documentados, com pessoas fictícias; não são um ensaio de produção ou de carga multiligação. Foi conferida a expressão `user_id = current_setting('app.user_id', true)` em USING e WITH CHECK das políticas atuais. Não foi encontrada migração posterior a desativá-las.

`db/client.ts` recusa roles superuser/BYPASSRLS e endereços pooler; parametriza `set_config`. Não foi verificada a role real de produção nesta revisão. Ser dono de uma tabela pode igualmente contornar RLS sem BYPASSRLS quando FORCE RLS não está ativo: as permissões/ownership da role têm de ser verificadas num ensaio isolado de lançamento. E as FKs simples de filhos não comprovam ownership dos pais, pelo que os validadores das ações e do restauro continuam necessários.

## 3. Login próprio

| Verificação | Resultado |
| --- | --- |
| Passwords e fila | Mantidos scrypt N=2^15 no servidor, fila 2 em execução/8 à espera, bloqueio por conta e decoy para endereço desconhecido. Não foi trocado o sistema de autenticação. |
| Cookie de sessão | HttpOnly, SameSite=Lax, path=/, 30 dias; renovação após um dia. V4 com milissegundos; cookies v2/v3 ainda válidos continuam aceites. Secure obrigatório na Vercel. |
| Mudar password | Não existe uma ação separada de mudança normal da password neste código. O caminho existente é `recoverAccount`; rehash no login não é uma mudança de password. |
| Usar recuperação | Código só como hash, consumo/rotação atómicos; cutoff calculado após o hash; nova sessão no cutoff. Verificações antigas não podem substituir credenciais ou obter renovação posterior válida. Testes locais C2/C5 aprovados. |
| Gerar outro código | `replaceRecoveryCode` exige sessão e password; troca o hash. Não muda password nem revoga sessões, por intenção do fluxo atual. |
| Apagar conta | Sessão/password/email, DELETE condicionado à credencial e cutoff ainda atuais; cascata e cookie removido. Leituras frescas da conta inexistente recusam a identidade, sem cache de 30 s. Dono continua recusado. |
| QR | Validade 5 minutos, tokens aleatórios hex64, hashes no servidor, cookie do requerente separado do segredo de aprovação, 5 palpites, aprovação com sessão e revogação fresca, consumo com row lock e DELETE; não reutilizável. Testes existentes de expiração/replay/concorrência/revogação passaram. |
| POST de outro site | Ações do Next com Origin diferente do Host são recusadas; não há `allowedOrigins` alargado. `/api/register` exige origem e recusa cross-site explicitamente. `/api/sync` usa segredo, não credenciais cookie; os restantes handlers são GET. |

**S05 — resultado após a continuação:** a comparação passou a milissegundos, os cookies novos preservam essa precisão e o cutoff de recuperação é posterior ao cálculo do hash. Saiu o TTL de 30 s entre pedidos; o pool verifica existência/revogação ao adquirir a conexão. As escritas de password/código/eliminação confirmam que a credencial não mudou durante a verificação, e o proxy não renova com uma data posterior a uma recuperação concorrente. Os casos antigos v2/v3 sem revogação continuam legíveis. Pedidos/transações já admitidos não são cancelados; o alcance exato e os ensaios estão em C2/C5.

O Next instalado **aceita pedido sem Origin com aviso**, como está explícito no seu `action-handler.js`; Origin `null` ou de outro host é recusado. SameSite e a política de origem mitigam POST de browser alheio; não se deve declarar que todo POST sem Origin é recusado. Cabeçalhos Host encaminhados têm de continuar a ser definidos por um proxy de confiança. `/api/sync` POST ainda aceita segredo no query string: preferir header, porque endereços podem entrar em logs/histórico; retirar essa compatibilidade requer decisão sobre os agendadores existentes.

## 4. Limites de pedidos

### O que já existe

| Operação | Limite efetivo no código | Resposta |
| --- | --- | --- |
| Entrada | Por ligação: 30/10 min; por conta: 10 falhas bloqueiam 15 min. | Server Action devolve outcome/mensagem; não garante HTTP 429. |
| Registo | Por ligação: 5/h e 10/dia; global: 5/h e 20/dia; `MAX_ACCOUNTS` (10 por omissão); convite/fechado opcionais; honeypot e BotID no alojamento. | `/api/register` devolve 429 para limite por ligação; os limites globais/lotação devolvem recusa 400. A chamada direta à ação devolve outcome, não 429. |
| Recuperação | Por ligação: 10/h, mais bloqueio da conta para códigos errados. | Outcome/mensagem; sem 429 contratual. |
| Novo QR | Por ligação: 20/10 min; global: 500 handshakes vivos; cada um 5 min. | Resultado `busy`; sem 429 contratual. |
| Aprovação QR | 5 palpites por handshake, incremento atómico; tokens necessários. | `invalid`, sem quota agregada por pessoa/IP. |
| Hashes | 2 trabalhos simultâneos, 8 em espera, por processo. | Recusa `busy`; não é quota distribuída entre instâncias. |
| Filtros guardados | 30 por âmbito/pessoa e config 8000 caracteres. | Limite de armazenamento, não frequência; contagem e inserção separadas sujeitas a corrida. |
| Preços, logos e perfis | Frescura, seleção de itens em falta e lotes: por exemplo pesquisa Yahoo 6 s, perfis 25/pressão, logos 60/pressão/250 empresas. | Reduz trabalho normal; não é limite persistente de pedidos nem impede concorrência/bypass por chamadas diretas. |
| AutoSync/cron | Intervalos no cliente e cron diário. | Não impedem pedidos diretos ou sobrepostos ao servidor. |

O endereço é obtido de `x-real-ip`/`x-forwarded-for`; sem ele o limitador permite passar. Na [Vercel estes headers são definidos pela plataforma](https://vercel.com/docs/headers/request-headers). Na cópia de casa, aceitar cabeçalhos arbitrários de um cliente não constitui um limite por ligação de confiança. Os contadores atuais são persistentes em Postgres; a fila de hashes é só local ao processo. O contador de tentativas insere antes de contar, e a suite existente cobre corridas; não substitui ensaio com múltiplas ligações reais.

### Proposta para aprovação, sem implementação nesta revisão

Valores iniciais para uma app pessoal com registo aberto; ajustar com métricas num ensaio isolado. Uma pessoa com vários aparelhos partilha a quota de pessoa. Várias pessoas atrás do mesmo router partilham só a quota mais larga por ligação. Uma quota por IP não substitui a de pessoa. Cache e pedidos repetidos com o mesmo identificador devem evitar refazer trabalho.

| Grupo / entradas | Por pessoa | Por ligação | Concorrência / proteção adicional |
| --- | --- | --- | --- |
| Pesquisa de ativos `searchAssets`, símbolos/ISIN e cotações avulsas | 30/min, 300/h | 120/min | 2 simultâneas/pessoa; cache curto por consulta normalizada; consulta≤100 caracteres. |
| Atualizar preços, benchmark, perfis, fundos, logos | 2/min e 30/h por grupo | 10/min e 100/h | 1 lote/pessoa/grupo; TTL existente + lock distribuído; quotas adicionais globais do fornecedor. |
| Sincronizar corretora (Bybit, OKX, etc.) | 1/ligação a corretora/60 s e 10/h; sync global pessoal 1/5 min | 30/h | 1 execução por ligação a corretora; não aceitar `trigger=scheduled` como dispensa de quota vinda do browser. |
| Câmbios `refreshRates`, `unpinRate` | 2/min, 20/h | 20/min | Cache global da resposta pública, aplicação por pessoa; 1 refresh em curso. |
| PDF `/api/report/pdf` | 3/min, 20/h | 15/min, 100/h | 1 geração/pessoa; teto global de trabalho; validar intervalo/linhas antes de carregar fontes. |
| Exportações JSON/CSV | 2/min, 10/h | 10/min, 50/h | 1/pessoa; leitura consistente; responder sem cache; decidir conteúdo sensível do backup. |
| Pré-visualizar/importar CSV | Preview 5/min; commit 2/min e 20/h | 20/min, 100/h | 1 commit/pessoa; validar bytes/linhas antes de parsing/DB; idempotência e transação. |
| Inspecionar/restaurar backup | Inspeção 3/min; restauro 1/5 min e 3/dia | 10/min; restauro 10/h | 1 restauro/pessoa; autenticação antes de parsing; ficheiro completo validado antes de apagar. |
| Widget | 12/min, 240/h | 60/min, 1200/h | Agrupar pedidos simultâneos da mesma pessoa; cache privado de 15 s, nunca resposta partilhada. |
| Alertas (ação e API) | 12/min, 240/h | 60/min, 1200/h | Cache privado/coalescência 15 s; não chamar serviços externos durante polling. |
| Escritas comuns (ações restantes) | 60/min, 1000/h | 300/min | Montantes/IDs validados; repetir recibo não duplica a operação; teto de texto/listas independente. |
| Recuperação, novo código e apagar conta | Preservar bloqueio e limites existentes; 5 verificações de password/min por conta | Manter recuperação 10/h; novo código/apagar 10/h por ligação | Admitir antes do hash, preservando fila 2+8; não contar retries de rede como novas operações financeiras. |
| Criar/aprovar/consumir QR | Criar mantém 20/10 min por IP; aprovação 10/min por pessoa; consumo 30/min por handshake | 120/min para polling | Manter 5 tentativas/capacidades/TTL e uso único; não bloquear o polling legítimo do ecrã. |
| `/api/sync` com segredo | Não é endpoint por pessoa; só o agendador | 6/h por origem autenticada | **1 execução global**, lock distribuído com validade; intervalo mínimo 5 min global; pedido simultâneo →429. |

Para rotas: **HTTP 429**, `Retry-After` em segundos, `Cache-Control: no-store`, corpo estável, por exemplo `{"error":"rate_limited","message":"Demasiados pedidos. Tenta novamente dentro de 60 segundos.","retryAfter":60}`; inglês conforme a língua do pedido. A mensagem nunca deve ecoar chaves, IPs ou diagnósticos. Para ações, devolver resultado tipado e apresentar a mesma mensagem; se o requisito é **status HTTP 429 em todas**, é necessário admitir o pedido num handler/camada HTTP antes do dispatcher, porque o retorno normal de uma Server Action não define esse status. Não usar um simples `throw` e chamar-lhe 429.

A admissão deve acontecer depois de autenticar a pessoa e antes de CPU/serviços externos. Usar contador/lock atómico **partilhado entre instâncias**, quota simultânea e token de execução para impedir que uma tarefa liberte o lock de outra. O trabalho interno autenticado do cron tem contexto próprio; não expor uma opção do cliente para saltar quotas. Não guardar IP em claro; manter HMAC e retenção curta como nos contadores existentes. A implementação poderá necessitar de migração local gerada e ensaio isolado, nunca migração automática em produção.

## Fora do âmbito, apenas registado

- **Confirmação de email:** por implementar; depende de domínio e serviço de envio escolhido pelo utilizador, por exemplo Resend. Não foi criado fornecedor, domínio, conta, API key ou envio.
- **Variáveis ainda indicadas como em falta na Vercel:** `OPERATOR_NAME`, `CONTACT_EMAIL`, `MAX_ACCOUNTS`, `REGISTRATION_MODE`. Apenas reproduzido o estado fornecido pelo utilizador/documentação; não foram consultadas nem alteradas.

## Evidência de validação

Os testes de regressão novos estão em `hosted-cookie-security.test.ts`, `session-endpoint-boundary.test.ts` e `connection-output-security.test.ts`; os testes existentes de identidade/cache foram ajustados ao helper interno. Foram reproduzidas cinco falhas iniciais em sete casos novos: dois casos do cookie, os dois endpoints internos e a resposta da ligação; os dois outros casos preservam HTTP local e HTTPS próprio. Nenhum teste usou passwords/chaves reais ou base de produção.

As ferramentas de reprodução, inventários e resultados redigidos sem valores secretos estão em `.local-checkpoints/security-review/`, ignorada pelo Git. Incluem snapshot de build isolado, grafo de imports e pesquisa do histórico. Não são um segundo plano de tarefas. O snapshot usa exclusivamente ficheiros deste worktree e dependências já instaladas.

Resultados finais de testes/build/lint registados no fim desta revisão.

## Inventário de todas as ações exportadas

As linhas abaixo refletem o código após as quatro correções locais. Nenhuma indicação «parcial» deve ser lida como aprovação de validação integral. Nas entradas só de ID, o efeito da RLS é separado da falta de formato/tamanho; nas leituras sem argumentos não há dados externos a validar, mas continua a ser necessária autenticação. Os checks feitos só em funções chamadas estão identificados como helpers quando estabelecem uma verificação de sessão explícita.

### src/actions/accounts.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listAccountsWithState`](../src/actions/accounts.ts#L29) (29) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listArchivedAccounts`](../src/actions/accounts.ts#L102) (102) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createAccount`](../src/actions/accounts.ts#L122) (122) | Sim: requireServerSession (sessão ou contexto interno) | Saldo por manualBalance (12 dígitos/2 casas); instituição/nome obrigatórios; faltam enums/moeda e tetos de texto. | P |
| [`updateAccount`](../src/actions/accounts.ts#L160) (160) | Sim: requireServerSession (sessão ou contexto interno) | Instituição/nome obrigatórios; balanceMeaning normalizado; percentagem cortada a 0–100; enums/moeda/textos/ID sem validação integral. | P |
| [`archiveAccount`](../src/actions/accounts.ts#L230) (230) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`unarchiveAccount`](../src/actions/accounts.ts#L239) (239) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`listAccountUsage`](../src/actions/accounts.ts#L255) (255) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listRemovableAccounts`](../src/actions/accounts.ts#L308) (308) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`removeEmptyAccounts`](../src/actions/accounts.ts#L321) (321) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`setAccountBalance`](../src/actions/accounts.ts#L366) (366) | Sim: helper verifica sessão | manualBalance e requestId; conta própria bloqueada e recibo; classificação não tem whitelist completa, ID sem formato/teto. | P |
| [`submitAccountBalance`](../src/actions/accounts.ts#L383) (383) | Sim: helper verifica sessão | Sessão e resultado controlado; delega validação em setAccountBalance. | P |
| [`getAccount`](../src/actions/accounts.ts#L465) (465) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`getAccountSnapshots`](../src/actions/accounts.ts#L471) (471) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |

### src/actions/alerts.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getAlerts`](../src/actions/alerts.ts#L42) (42) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/analytics.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getNetWorthOverTime`](../src/actions/analytics.ts#L25) (25) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getMoneyByLocation`](../src/actions/analytics.ts#L67) (67) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getTotalNetWorthOverTime`](../src/actions/analytics.ts#L101) (101) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/assetInfo.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getAssetInfo`](../src/actions/assetInfo.ts#L14) (14) | E: edição + sessão também em full; contexto interno permitido | symbol.trim/uppercase sem tipo/formato/teto antes de uso; consulta parametrizada. | P |
| [`saveAssetNote`](../src/actions/assetInfo.ts#L31) (31) | Sim: verificador local | Símbolo obrigatório≤500, nota≤20000; FormData coercivo; sem schema integral de símbolo. | P |

### src/actions/assetSearch.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`searchAssets`](../src/actions/assetSearch.ts#L10) (10) | Sim: verificador local | searchQuery corta a 100 caracteres, mínimo 2 para pesquisar; sem schema de tipo; timeout 6 s, até 12 resultados. | P |

### src/actions/auth.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`signIn`](../src/actions/auth.ts#L160) (160) | Público: chave/password + limites | Zod estrito: email≤254, chave hex64, password legacy≤PASSWORD_MAX; limites antes do hash. | P |
| [`signUp`](../src/actions/auth.ts#L278) (278) | Público: chave + BotID + limites | Zod estrito: email≤254, chave hex64, convite≤256/honeypot≤200; BotID/limites antes de criar. | P |
| [`recoverAccount`](../src/actions/auth.ts#L337) (337) | Público: código + limites | Zod estrito: email≤254, chave hex64, código≤64 e alfabeto/comprimento próprios; limite e UPDATE atómico. | P |
| [`replaceRecoveryCode`](../src/actions/auth.ts#L387) (387) | Sim: currentUserId + password | Zod estrito com chave hex64; sessão/password/bloqueio; UPDATE condicionado à password e revogação ainda iguais após o hash. | P |
| [`deleteAccount`](../src/actions/auth.ts#L424) (424) | Sim: currentUserId + password | Zod estrito com chave hex64/email≤254; sessão/password/email próprios; dono recusado; DELETE condicionado à credencial ainda atual. | P |
| [`accountEmail`](../src/actions/auth.ts#L454) (454) | Sim: currentUserId; null sem sessão | Sem argumentos externos. | P |

### src/actions/benchmark.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getBenchmarkChoice`](../src/actions/benchmark.ts#L25) (25) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setBenchmarkChoice`](../src/actions/benchmark.ts#L31) (31) | E: edição + sessão também em full; contexto interno permitido | Lista fechada de benchmarks; argumento id sem schema de tipo/tamanho; dados Yahoo validados para moeda e preços. | P |
| [`refreshBenchmark`](../src/actions/benchmark.ts#L59) (59) | E: edição + sessão também em full; contexto interno permitido | Lista fechada de benchmarks; argumento id sem schema de tipo/tamanho; dados Yahoo validados para moeda e preços. | P |
| [`getBenchmarkComparison`](../src/actions/benchmark.ts#L153) (153) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getBenchmarkFreshness`](../src/actions/benchmark.ts#L216) (216) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/brokerImport.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`previewBrokerStatement`](../src/actions/brokerImport.ts#L33) (33) | E: edição + sessão também em full; contexto interno permitido | Sessão e conta própria antes de analisar CSV; parser no servidor; faltam tetos próprios de bytes/linhas/campos. | P |
| [`importBrokerStatement`](../src/actions/brokerImport.ts#L119) (119) | E: edição + sessão também em full; contexto interno permitido | Sessão e conta própria com bloqueio; eventos/auditoria atómicos; parser CSV no servidor; faltam schema completo e tetos. | P |
| [`getContributionBreakdown`](../src/actions/brokerImport.ts#L186) (186) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`adoptStatementPositions`](../src/actions/brokerImport.ts#L304) (304) | E: edição + sessão também em full; contexto interno permitido | Sessão e conta própria confirmadas; escrita/auditoria em transação; faltam tetos próprios de bytes/linhas/campos e schema completo. | P |
| [`adoptAllStatements`](../src/actions/brokerImport.ts#L322) (322) | E: edição + sessão também em full; contexto interno permitido | Sem argumentos externos. | P |
| [`listKnownIsins`](../src/actions/brokerImport.ts#L457) (457) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getImportedStatements`](../src/actions/brokerImport.ts#L463) (463) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getStatementBreakdown`](../src/actions/brokerImport.ts#L514) (514) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getStatementHistory`](../src/actions/brokerImport.ts#L620) (620) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/buckets.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listBucketsWithTotals`](../src/actions/buckets.ts#L16) (16) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getBucket`](../src/actions/buckets.ts#L32) (32) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`createBucket`](../src/actions/buckets.ts#L47) (47) | Sim: helper verifica sessão | manualRequestId, meta manual opcional não negativa; nome obrigatório; descrição/cor/nome sem teto. | P |
| [`submitBucketCreation`](../src/actions/buckets.ts#L63) (63) | Sim: helper verifica sessão | Sessão e resultado controlado; delega em createBucket. | P |
| [`updateBucket`](../src/actions/buckets.ts#L67) (67) | Sim: helper verifica sessão | Meta manual e prioridade inteira 0–9999; confirma objetivo próprio; textos/cor/ID sem teto. | P |
| [`submitBucketEdit`](../src/actions/buckets.ts#L87) (87) | Sim: helper verifica sessão | Sessão e resultado controlado; delega em updateBucket. | P |
| [`deleteBucket`](../src/actions/buckets.ts#L92) (92) | Sim: requireServerSession (sessão ou contexto interno) | Apenas String(id); sem tipo/formato/tamanho/confirmar existência antes da auditoria. | P |
| [`addToAllocation`](../src/actions/buckets.ts#L112) (112) | Sim: helper verifica sessão | manualRequestId/manualBalance; conta ativa e objetivo próprios; total não negativo; IDs sem teto. | P |
| [`submitAllocationAddition`](../src/actions/buckets.ts#L117) (117) | Sim: helper verifica sessão | Sessão e resultado controlado; delega em addToAllocation. | P |
| [`setAllocation`](../src/actions/buckets.ts#L122) (122) | Sim: helper verifica sessão | manualRequestId/manualBalance; conta/objetivo próprios e montante não negativo; IDs sem teto. | P |
| [`submitExactAllocation`](../src/actions/buckets.ts#L127) (127) | Sim: helper verifica sessão | Sessão e resultado controlado; delega em setAllocation. | P |

### src/actions/budgets.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listBudgets`](../src/actions/budgets.ts#L69) (69) | Sim: requireServerSession (sessão ou contexto interno) | offset sem verificação de tipo, inteiro, finito ou faixa. | P |
| [`getKeptForBudgets`](../src/actions/budgets.ts#L118) (118) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getBudgetsLeft`](../src/actions/budgets.ts#L125) (125) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createBudget`](../src/actions/budgets.ts#L138) (138) | Sim: helper verifica sessão | Montante/data/período e categorias próprias validados na criação; nomes/notas/listas/IDs sem teto integral. | P |
| [`submitBudgetCreation`](../src/actions/budgets.ts#L178) (178) | Sim: helper verifica sessão | Montante/data/período e categorias próprias validados na criação; nomes/notas/listas/IDs sem teto integral. | P |
| [`updateBudget`](../src/actions/budgets.ts#L182) (182) | Sim: helper verifica sessão | manualRequestId/manualAmount; orçamento próprio; ID sem formato/teto. | P |
| [`submitBudgetLimit`](../src/actions/budgets.ts#L198) (198) | Sim: helper verifica sessão | Montante/data/período e categorias próprias validados na criação; nomes/notas/listas/IDs sem teto integral. | P |
| [`toggleBudgetCategory`](../src/actions/budgets.ts#L203) (203) | Sim: requireServerSession (sessão ou contexto interno) | Confirma orçamento/categoria própria de despesa e conserva última categoria; booleano normalizado; IDs sem teto. | P |
| [`setBudgetRollover`](../src/actions/budgets.ts#L224) (224) | Sim: requireServerSession (sessão ou contexto interno) | ID coercivo, rollover convertido por igualdade a true; falta schema de ID/booleano. | P |
| [`deleteBudget`](../src/actions/budgets.ts#L232) (232) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`getUnbudgetedSpending`](../src/actions/budgets.ts#L241) (241) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/connections.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`canStoreSecrets`](../src/actions/connections.ts#L130) (130) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P (sessão) |
| [`listConnections`](../src/actions/connections.ts#L145) (145) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos; resposta agora exclui API key e todas as credenciais cifradas; só identificador mascarado. | P |
| [`listPositionsForConnection`](../src/actions/connections.ts#L181) (181) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`listAllPositions`](../src/actions/connections.ts#L187) (187) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setPositionTags`](../src/actions/connections.ts#L273) (273) | E: edição + sessão também em full; contexto interno permitido | Conector valida identificador/região e conta própria ao ligar; faltam tetos de rótulos/chaves e schema integral. | P |
| [`listBalances`](../src/actions/connections.ts#L377) (377) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getSyncLogs`](../src/actions/connections.ts#L476) (476) | Sim: requireServerSession (sessão ou contexto interno) | connectionId e limit sem tipo/formato/teto; limit pode pedir demasiadas linhas. | P |
| [`createConnection`](../src/actions/connections.ts#L486) (486) | E: edição + sessão também em full; contexto interno permitido | Conector valida identificador/região e conta própria ao ligar; faltam tetos de rótulos/chaves e schema integral. | P |
| [`deleteConnection`](../src/actions/connections.ts#L605) (605) | E: edição + sessão também em full; contexto interno permitido | ID obtido por coerção; falta schema integral de formato/tamanho. Guarda de edição E. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`convertToManual`](../src/actions/connections.ts#L658) (658) | E: edição + sessão também em full; contexto interno permitido | Conector valida identificador/região e conta própria ao ligar; faltam tetos de rótulos/chaves e schema integral. | P |
| [`syncConnectionAction`](../src/actions/connections.ts#L681) (681) | Sim: requireServerSession antes de refreshRates | Conector valida identificador/região e conta própria ao ligar; faltam tetos de rótulos/chaves e schema integral. | P |
| [`syncConnection`](../src/actions/connections.ts#L709) (709) | E: edição + sessão também em full; contexto interno permitido | Conector valida identificador/região e conta própria ao ligar; faltam tetos de rótulos/chaves e schema integral. | P |
| [`autoSyncAction`](../src/actions/connections.ts#L1065) (1065) | Sim: requireServerSession antes de refreshRates | Sem argumentos externos. | P |
| [`syncAllConnections`](../src/actions/connections.ts#L1076) (1076) | E: edição + sessão também em full; contexto interno permitido | Conector valida identificador/região e conta própria ao ligar; faltam tetos de rótulos/chaves e schema integral. | P |

### src/actions/dashboard.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getAccountComposition`](../src/actions/dashboard.ts#L43) (43) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getPortfolioItems`](../src/actions/dashboard.ts#L139) (139) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getMonthShape`](../src/actions/dashboard.ts#L553) (553) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getFixedRunway`](../src/actions/dashboard.ts#L610) (610) | Sim: requireServerSession (sessão ou contexto interno) | availableCash sem tipo/finito/faixa. | P |

### src/actions/distribute.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listGoalsByPriority`](../src/actions/distribute.ts#L29) (29) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setPriority`](../src/actions/distribute.ts#L46) (46) | Sim: requireServerSession (sessão ou contexto interno) | Montante finito/positivo e recibo na aplicação; shares/strategy e dimensão da lista não têm schema integral. | P |
| [`moveGoal`](../src/actions/distribute.ts#L73) (73) | Sim: requireServerSession (sessão ou contexto interno) | Montante finito/positivo e recibo na aplicação; shares/strategy e dimensão da lista não têm schema integral. | P |
| [`getDefaultShares`](../src/actions/distribute.ts#L98) (98) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`planDistribution`](../src/actions/distribute.ts#L167) (167) | Sim: requireServerSession (sessão ou contexto interno) | amount validado como finito positivo em buildDistribution; strategy/shares sem schema integral/teto. | P |
| [`applyDistribution`](../src/actions/distribute.ts#L182) (182) | Sim: requireServerSession (sessão ou contexto interno) | Montante finito/positivo e recibo na aplicação; shares/strategy e dimensão da lista não têm schema integral. | P |
| [`submitDistribution`](../src/actions/distribute.ts#L244) (244) | Sim: requireServerSession (sessão ou contexto interno) | Montante finito/positivo e recibo na aplicação; shares/strategy e dimensão da lista não têm schema integral. | P |

### src/actions/dividends.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getDividendOverview`](../src/actions/dividends.ts#L183) (183) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getDividendsForTicker`](../src/actions/dividends.ts#L274) (274) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`getIncomePayments`](../src/actions/dividends.ts#L300) (300) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getRealisedTotal`](../src/actions/dividends.ts#L330) (330) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getGainAttribution`](../src/actions/dividends.ts#L375) (375) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/expected.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listExpected`](../src/actions/expected.ts#L65) (65) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listExpectedOptions`](../src/actions/expected.ts#L129) (129) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createExpected`](../src/actions/expected.ts#L196) (196) | Sim: requireServerSession (sessão ou contexto interno) | Montante/data/moeda/cadência e pais próprios; nome obrigatório; textos/IDs sem teto. | P |
| [`updateExpected`](../src/actions/expected.ts#L238) (238) | Sim: helper verifica sessão | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`submitExpectedEdit`](../src/actions/expected.ts#L268) (268) | Sim: helper verifica sessão | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`addToExpected`](../src/actions/expected.ts#L273) (273) | Sim: helper verifica sessão | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`submitExpectedAddition`](../src/actions/expected.ts#L288) (288) | Sim: helper verifica sessão | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`recordExpectedArrival`](../src/actions/expected.ts#L300) (300) | Sim: helper verifica sessão | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`submitExpectedArrival`](../src/actions/expected.ts#L362) (362) | Sim: helper verifica sessão | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`undoExpectedArrival`](../src/actions/expected.ts#L372) (372) | Sim: verificador local | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`countExpectedArrived`](../src/actions/expected.ts#L403) (403) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listExpectedArrivals`](../src/actions/expected.ts#L412) (412) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`stopExpected`](../src/actions/expected.ts#L438) (438) | Sim: requireServerSession (sessão ou contexto interno) | Montante/data/cadência/moeda e pais próprios verificados; textos/IDs sem teto integral. | P |
| [`deleteExpected`](../src/actions/expected.ts#L450) (450) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |

### src/actions/export.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`exportAllData`](../src/actions/export.ts#L73) (73) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos; exportação inclui externalId (API key) e credenciais cifradas das ligações. Ver S07. | P |
| [`exportTransactionsCsv`](../src/actions/export.ts#L90) (90) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`exportHoldingsCsv`](../src/actions/export.ts#L114) (114) | E: edição + sessão também em full; contexto interno permitido | Sem argumentos externos. | P |
| [`inspectBackup`](../src/actions/export.ts#L143) (143) | Sim: requireServerSession (sessão ou contexto interno) | JSON.parse sem teto prévio; validação superficial de listas/poupanças, sem schema integral das tabelas. | P (sessão) |
| [`restoreBackup`](../src/actions/export.ts#L159) (159) | Sim: requireServerSession (sessão ou contexto interno) | RESTORE explícito; remove userId e recusa FKs fora da própria cópia antes de apagar; faltam teto antes de JSON.parse e schema integral dos registos. | P |

### src/actions/exposure.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getExposure`](../src/actions/exposure.ts#L191) (191) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`refreshAssetProfiles`](../src/actions/exposure.ts#L436) (436) | Sim: verificador local | Sem argumentos externos. | P |
| [`refreshFundFiles`](../src/actions/exposure.ts#L655) (655) | Sim: verificador local | Sem argumentos externos. | P |
| [`refreshCompanyMoves`](../src/actions/exposure.ts#L804) (804) | Sim: verificador local | Sem argumentos externos. | P |
| [`refreshCompanyDetails`](../src/actions/exposure.ts#L894) (894) | Sim: verificador local | Sem argumentos externos. | P |
| [`forgetAssetProfile`](../src/actions/exposure.ts#L962) (962) | Sim: verificador local | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`getFeesByYear`](../src/actions/exposure.ts#L974) (974) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getAnnouncedDividends`](../src/actions/exposure.ts#L984) (984) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`heldSymbols`](../src/actions/exposure.ts#L1001) (1001) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/fx.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getRates`](../src/actions/fx.ts#L16) (16) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listRates`](../src/actions/fx.ts#L26) (26) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`refreshRates`](../src/actions/fx.ts#L38) (38) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`refreshRatesAction`](../src/actions/fx.ts#L64) (64) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setManualRate`](../src/actions/fx.ts#L71) (71) | Sim: requireServerSession (sessão ou contexto interno) | Taxa manual finita >0; código de moeda apenas não vazio e ≠EUR, sem lista/regex/teto; unpin idem. | P |
| [`unpinRate`](../src/actions/fx.ts#L92) (92) | Sim: requireServerSession (sessão ou contexto interno) | Taxa manual finita >0; código de moeda apenas não vazio e ≠EUR, sem lista/regex/teto; unpin idem. | P |

### src/actions/imports.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getExistingKeys`](../src/actions/imports.ts#L20) (20) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`commitImport`](../src/actions/imports.ts#L41) (41) | Sim: requireServerSession (sessão ou contexto interno) | Sessão, conta própria bloqueada e moeda retirada da conta; importação/saldo/auditoria atómicos; schema de linhas e tetos ainda parciais. | P |
| [`listImports`](../src/actions/imports.ts#L137) (137) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`undoImport`](../src/actions/imports.ts#L164) (164) | Sim: requireServerSession (sessão ou contexto interno) | Conta própria bloqueada, moeda da conta e transação integral; linhas só com validação parcial de data/amount; faltam schema/tetos/idempotência. | P |

### src/actions/interest.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getInterestOutlook`](../src/actions/interest.ts#L27) (27) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`calculateInterest`](../src/actions/interest.ts#L85) (85) | Sim: requireServerSession (sessão ou contexto interno) | Datas só por Date.parse; faltam formato estrito, ordem e intervalo máximo; accountId sem teto. | P |
| [`checkPayment`](../src/actions/interest.ts#L115) (115) | Sim: requireServerSession (sessão ou contexto interno) | accountId, amount, from/to confiados; faltam tipos, finito, Date válida e intervalo. | P |
| [`setAccountRate`](../src/actions/interest.ts#L133) (133) | Sim: requireServerSession (sessão ou contexto interno) | APR finito ≥0 sem teto superior; retenção 0–100; dayCount inválido normalizado para 365; ID sem teto. | P |

### src/actions/investmentActivity.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getExistingInvestmentFingerprints`](../src/actions/investmentActivity.ts#L47) (47) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`commitInvestmentActivityImport`](../src/actions/investmentActivity.ts#L56) (56) | Sim: requireServerSession (sessão ou contexto interno) | Import confirma conta própria e duplicado; confia em rows/types/datas/moedas/contagens, sem schema/tetos. | P |
| [`listInvestmentActivity`](../src/actions/investmentActivity.ts#L147) (147) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`undoInvestmentActivityImport`](../src/actions/investmentActivity.ts#L212) (212) | Sim: requireServerSession (sessão ou contexto interno) | Import confirma conta própria e duplicado; confia em rows/types/datas/moedas/contagens, sem schema/tetos. | P |
| [`getTradeAnalysis`](../src/actions/investmentActivity.ts#L389) (389) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getRealisedTrades`](../src/actions/investmentActivity.ts#L452) (452) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listTagNames`](../src/actions/investmentActivity.ts#L482) (482) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setInvestmentActivityTags`](../src/actions/investmentActivity.ts#L489) (489) | Sim: verificador local | Import confirma conta própria e duplicado; confia em rows/types/datas/moedas/contagens, sem schema/tetos. | P |
| [`setTradeClassification`](../src/actions/investmentActivity.ts#L508) (508) | Sim: verificador local | Import confirma conta própria e duplicado; confia em rows/types/datas/moedas/contagens, sem schema/tetos. | P |

### src/actions/investments.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listHoldingsWithPnL`](../src/actions/investments.ts#L137) (137) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getHolding`](../src/actions/investments.ts#L172) (172) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`getHoldingSnapshots`](../src/actions/investments.ts#L178) (178) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`createHolding`](../src/actions/investments.ts#L183) (183) | E: edição + sessão também em full; contexto interno permitido | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`setHoldingTags`](../src/actions/investments.ts#L277) (277) | E: edição + sessão também em full; contexto interno permitido | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`updateHolding`](../src/actions/investments.ts#L309) (309) | E: edição + sessão também em full; contexto interno permitido | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`submitHoldingEdit`](../src/actions/investments.ts#L378) (378) | Sim: verificador local | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`submitHoldingOperation`](../src/actions/investments.ts#L419) (419) | Sim, via holdingOperationRequest | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`updateHoldingPrice`](../src/actions/investments.ts#L435) (435) | Sim: helper verifica sessão | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`deleteHolding`](../src/actions/investments.ts#L469) (469) | E: edição + sessão também em full; contexto interno permitido | ID obtido por coerção; falta schema integral de formato/tamanho. Guarda de edição E. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`getPortfolioValueOverTime`](../src/actions/investments.ts#L494) (494) | Sim: requireServerSession (sessão ou contexto interno) | onlyWhatAddsOnTop sem validação de booleano. | P |
| [`getPortfolioAt`](../src/actions/investments.ts#L531) (531) | Sim: requireServerSession (sessão ou contexto interno) | date sem verificação de tipo, dia real ou faixa. | P |
| [`listAccountsForHoldings`](../src/actions/investments.ts#L702) (702) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`addRewards`](../src/actions/investments.ts#L709) (709) | Sim: helper verifica sessão | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`getPortfolioAnalysis`](../src/actions/investments.ts#L762) (762) | Sim: requireServerSession (sessão ou contexto interno) | includeStable sem validação de booleano. | P |
| [`getGroupedPerformance`](../src/actions/investments.ts#L862) (862) | Sim: requireServerSession (sessão ou contexto interno) | Enums, booleanos, filtros e listas sem schema integral na entrada; filtros parcialmente normalizados. | P |
| [`getUnitemisedInvestments`](../src/actions/investments.ts#L907) (907) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getPortfolioContribution`](../src/actions/investments.ts#L957) (957) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`reinforceHolding`](../src/actions/investments.ts#L1037) (1037) | Sim: helper verifica sessão | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`sellHolding`](../src/actions/investments.ts#L1089) (1089) | Sim: helper verifica sessão | Criação/edição/operações usam validadores de quantidades/preços/moeda e pais próprios; textos/IDs/listas continuam parciais. | P |
| [`getPortfolioReturns`](../src/actions/investments.ts#L1165) (1165) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/liabilities.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listLiabilities`](../src/actions/liabilities.ts#L21) (21) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createLiability`](../src/actions/liabilities.ts#L107) (107) | Sim: requireServerSession (sessão ou contexto interno) | Saldo/pagamento/APR/moeda/tipo e conta própria verificados; nomes/notas/IDs sem teto integral. | P |
| [`updateLiability`](../src/actions/liabilities.ts#L145) (145) | Sim: requireServerSession (sessão ou contexto interno) | Saldo/pagamento/APR/moeda/tipo e conta própria verificados; nomes/notas/IDs sem teto integral. | P |
| [`deleteLiability`](../src/actions/liabilities.ts#L176) (176) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |

### src/actions/library.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listResources`](../src/actions/library.ts#L46) (46) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getResourceBySlug`](../src/actions/library.ts#L162) (162) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`listTaxonomy`](../src/actions/library.ts#L169) (169) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`missingSeedCount`](../src/actions/library.ts#L200) (200) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getLibraryStats`](../src/actions/library.ts#L207) (207) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createResource`](../src/actions/library.ts#L233) (233) | Sim: requireServerSession (sessão ou contexto interno) | Tipos/alguns enums/URLs http(s) verificados; textos/IDs/taxonomias sem teto; números normalizados sem limites completos. | P |
| [`updateResource`](../src/actions/library.ts#L369) (369) | Sim: requireServerSession (sessão ou contexto interno) | Tipos/alguns enums/URLs http(s) verificados; textos/IDs/taxonomias sem teto; números normalizados sem limites completos. | P |
| [`setProgress`](../src/actions/library.ts#L456) (456) | Sim: requireServerSession (sessão ou contexto interno) | Tipos/alguns enums/URLs http(s) verificados; textos/IDs/taxonomias sem teto; números normalizados sem limites completos. | P |
| [`toggleFavourite`](../src/actions/library.ts#L521) (521) | Sim: requireServerSession (sessão ou contexto interno) | Tipos/alguns enums/URLs http(s) verificados; textos/IDs/taxonomias sem teto; números normalizados sem limites completos. | P |
| [`toggleFeatured`](../src/actions/library.ts#L548) (548) | Sim: requireServerSession (sessão ou contexto interno) | Tipos/alguns enums/URLs http(s) verificados; textos/IDs/taxonomias sem teto; números normalizados sem limites completos. | P |
| [`archiveResource`](../src/actions/library.ts#L561) (561) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`refreshStarterDetails`](../src/actions/library.ts#L590) (590) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`staleStarterCount`](../src/actions/library.ts#L689) (689) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`seedLibrary`](../src/actions/library.ts#L715) (715) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/logos.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`refreshLogos`](../src/actions/logos.ts#L81) (81) | Sim: verificador local | Sem argumentos externos. | P |
| [`topUpLogos`](../src/actions/logos.ts#L158) (158) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`logosFor`](../src/actions/logos.ts#L307) (307) | Sim: requireServerSession (sessão ou contexto interno) | Lista de símbolos sem tipo/tamanho/número máximo. | P |

### src/actions/monthAhead.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getMonthAhead`](../src/actions/monthAhead.ts#L20) (20) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/networth.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getNetWorth`](../src/actions/networth.ts#L23) (23) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/playlists.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listPlaylistsWithTotals`](../src/actions/playlists.ts#L28) (28) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`listPlaylists`](../src/actions/playlists.ts#L59) (59) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createPlaylist`](../src/actions/playlists.ts#L64) (64) | E: edição + sessão também em full; contexto interno permitido | Nome obrigatório; números só finitos ou null; faltam tipos/moeda/precisão/faixas e tetos de textos/IDs. | P |
| [`updatePlaylist`](../src/actions/playlists.ts#L83) (83) | E: edição + sessão também em full; contexto interno permitido | Nome obrigatório; números só finitos ou null; faltam tipos/moeda/precisão/faixas e tetos de textos/IDs. | P |
| [`deletePlaylist`](../src/actions/playlists.ts#L101) (101) | E: edição + sessão também em full; contexto interno permitido | ID obtido por coerção; falta schema integral de formato/tamanho. Guarda de edição E. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`listWatchlist`](../src/actions/playlists.ts#L119) (119) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`addWatchlistItem`](../src/actions/playlists.ts#L141) (141) | E: edição + sessão também em full; contexto interno permitido | Nome obrigatório; números só finitos ou null; faltam tipos/moeda/precisão/faixas e tetos de textos/IDs. | P |
| [`updateWatchlistItem`](../src/actions/playlists.ts#L161) (161) | E: edição + sessão também em full; contexto interno permitido | Nome obrigatório; números só finitos ou null; faltam tipos/moeda/precisão/faixas e tetos de textos/IDs. | P |
| [`deleteWatchlistItem`](../src/actions/playlists.ts#L182) (182) | E: edição + sessão também em full; contexto interno permitido | ID obtido por coerção; falta schema integral de formato/tamanho. Guarda de edição E. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |

### src/actions/purpose.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listPurposes`](../src/actions/purpose.ts#L97) (97) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getHoldingAllocations`](../src/actions/purpose.ts#L136) (136) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`setHoldingAllocation`](../src/actions/purpose.ts#L177) (177) | E: edição + sessão também em full; contexto interno permitido | Percentagem finita 0–100, duas casas e pais próprios; IDs/remoção sem formato/teto. | P |
| [`removeHoldingAllocation`](../src/actions/purpose.ts#L222) (222) | E: edição + sessão também em full; contexto interno permitido | ID obtido por coerção; falta schema integral de formato/tamanho. Guarda de edição E. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`overAllocatedHoldings`](../src/actions/purpose.ts#L232) (232) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/qrSignIn.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`createQrSignIn`](../src/actions/qrSignIn.ts#L18) (18) | Público: cria capacidades + limite | Sem argumentos externos. | P |
| [`cancelQrSignIn`](../src/actions/qrSignIn.ts#L42) (42) | Capacidade: cookie independente | Sem argumentos externos. | P |
| [`qrApprover`](../src/actions/qrSignIn.ts#L50) (50) | Sim: assinatura + revogação fresca | Sem argumentos externos. | P |
| [`approveQrSignIn`](../src/actions/qrSignIn.ts#L58) (58) | Sim: assinatura + revogação fresca | Tokens hex64/código 6 dígitos/cookie verificados; TTL 300 s, 5 tentativas e consumo atómico; tipos não têm schema explícito. | P |
| [`consumeQrSignIn`](../src/actions/qrSignIn.ts#L78) (78) | Capacidade: cookie + id + aprovador | Tokens hex64/código 6 dígitos/cookie verificados; TTL 300 s, 5 tentativas e consumo atómico; tipos não têm schema explícito. | P |

### src/actions/quotes.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`checkQuoteSymbol`](../src/actions/quotes.ts#L70) (70) | E: edição + sessão também em full; contexto interno permitido | Símbolos/ISIN/moedas/opções sem schema/tetos integrais; respostas/preços/moedas/frescura do fornecedor validados. | P |
| [`fetchYahooQuote`](../src/actions/quotes.ts#L153) (153) | E: edição + sessão também em full; contexto interno permitido | Símbolos/ISIN/moedas/opções sem schema/tetos integrais; respostas/preços/moedas/frescura do fornecedor validados. | P |
| [`setQuoteSymbol`](../src/actions/quotes.ts#L218) (218) | E: edição + sessão também em full; contexto interno permitido | Símbolos/ISIN/moedas/opções sem schema/tetos integrais; respostas/preços/moedas/frescura do fornecedor validados. | P |
| [`refreshQuotedPrices`](../src/actions/quotes.ts#L252) (252) | E: edição + sessão também em full; contexto interno permitido | Símbolos/ISIN/moedas/opções sem schema/tetos integrais; respostas/preços/moedas/frescura do fornecedor validados. | P |
| [`findSymbolForIsin`](../src/actions/quotes.ts#L340) (340) | E: edição + sessão também em full; contexto interno permitido | Símbolos/ISIN/moedas/opções sem schema/tetos integrais; respostas/preços/moedas/frescura do fornecedor validados. | P |
| [`autoPriceHoldings`](../src/actions/quotes.ts#L494) (494) | E: edição + sessão também em full; contexto interno permitido | Sem argumentos externos. | P |
| [`getPricingCrossCheck`](../src/actions/quotes.ts#L688) (688) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`probeIbkrQuotes`](../src/actions/quotes.ts#L736) (736) | E: edição + sessão também em full; contexto interno permitido | Símbolos/ISIN/moedas/opções sem schema/tetos integrais; respostas/preços/moedas/frescura do fornecedor validados. | P |
| [`forgetFoundPrices`](../src/actions/quotes.ts#L846) (846) | E: edição + sessão também em full; contexto interno permitido | Sem argumentos externos. | P |
| [`autoRefreshPricesAction`](../src/actions/quotes.ts#L884) (884) | E: edição + sessão também em full; contexto interno permitido | Sem argumentos externos. | P |
| [`lastQuoteRefreshAt`](../src/actions/quotes.ts#L895) (895) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/savedViews.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listAnalysisViews`](../src/actions/savedViews.ts#L24) (24) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`saveAnalysisView`](../src/actions/savedViews.ts#L44) (44) | Sim: requireServerSession (sessão ou contexto interno) | Filtros: tipo/string≤8000, scope fechado, JSON e 30 registos; schema do JSON na leitura; IDs parciais. | P |
| [`deleteSavedView`](../src/actions/savedViews.ts#L81) (81) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |
| [`listSavedFilters`](../src/actions/savedViews.ts#L102) (102) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`saveFilters`](../src/actions/savedViews.ts#L110) (110) | Sim: requireServerSession (sessão ou contexto interno) | scope/nome/config strings; scope fechado, nome limpo, config≤8000/JSON; limite de 30 sujeito a corrida concorrente. | P |
| [`deleteSavedFilters`](../src/actions/savedViews.ts#L140) (140) | Sim: requireServerSession (sessão ou contexto interno) | id string ≤64; formato/vazio não recusados. | P |

### src/actions/savings.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getSavingsData`](../src/actions/savings.ts#L20) (20) | Sim: verificador local | Sem argumentos externos. | P |
| [`updatePurchaseSavings`](../src/actions/savings.ts#L35) (35) | Sim: verificador local | Poupança/ligação e pais próprios validados; IDs sem formato/teto; registo delega em createQuickTransaction. | P |
| [`linkCashback`](../src/actions/savings.ts#L50) (50) | Sim: verificador local | Poupança/ligação e pais próprios validados; IDs sem formato/teto; registo delega em createQuickTransaction. | P |
| [`unlinkCashback`](../src/actions/savings.ts#L67) (67) | Sim: verificador local | Poupança/ligação e pais próprios validados; IDs sem formato/teto; registo delega em createQuickTransaction. | P |
| [`recordCashback`](../src/actions/savings.ts#L79) (79) | Sim: verificador local | Poupança/ligação e pais próprios validados; IDs sem formato/teto; registo delega em createQuickTransaction. | P |

### src/actions/session.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`currentUserId`](../src/actions/session.ts#L22) (22) | É o verificador; null sem sessão | Cookie assinado, idade, userId e revogação; restrição opcional não permite escolher outra identidade. | P |
| [`hasSession`](../src/actions/session.ts#L30) (30) | É o verificador; false sem sessão | Sem argumentos externos. | P |
| [`logOutOtherDevices`](../src/actions/session.ts#L40) (40) | Sim: currentUserId | Sem argumentos externos. | P |

### src/actions/settings.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getBaseCurrency`](../src/actions/settings.ts#L23) (23) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setBaseCurrency`](../src/actions/settings.ts#L29) (29) | Sim: requireServerSession (sessão ou contexto interno) | Moedas em lista/opções fechadas e conta própria; getAll/listas/IDs sem limites completos; inválidos por vezes normalizados. | P |
| [`getFavouriteCurrencies`](../src/actions/settings.ts#L58) (58) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setFavouriteCurrencies`](../src/actions/settings.ts#L67) (67) | Sim: requireServerSession (sessão ou contexto interno) | Moedas em lista/opções fechadas e conta própria; getAll/listas/IDs sem limites completos; inválidos por vezes normalizados. | P |
| [`getDashboardCurrency`](../src/actions/settings.ts#L105) (105) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setDashboardCurrency`](../src/actions/settings.ts#L120) (120) | Sim: requireServerSession (sessão ou contexto interno) | Moedas em lista/opções fechadas e conta própria; getAll/listas/IDs sem limites completos; inválidos por vezes normalizados. | P |
| [`getDashboardWindowPreferences`](../src/actions/settings.ts#L146) (146) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setDashboardWindowPreferences`](../src/actions/settings.ts#L157) (157) | Sim: requireServerSession (sessão ou contexto interno) | Moedas em lista/opções fechadas e conta própria; getAll/listas/IDs sem limites completos; inválidos por vezes normalizados. | P |
| [`getDefaultAccountId`](../src/actions/settings.ts#L187) (187) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setDefaultAccountId`](../src/actions/settings.ts#L200) (200) | Sim: requireServerSession (sessão ou contexto interno) | Moedas em lista/opções fechadas e conta própria; getAll/listas/IDs sem limites completos; inválidos por vezes normalizados. | P |

### src/actions/spending.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getSpendingAnalysis`](../src/actions/spending.ts#L26) (26) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/stats.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getStatistics`](../src/actions/stats.ts#L19) (19) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/subscriptionCharges.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getDueSubscriptionCharges`](../src/actions/subscriptionCharges.ts#L51) (51) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`recordSubscriptionCharge`](../src/actions/subscriptionCharges.ts#L143) (143) | Sim: verificador local | Montante/datas/answer e pais próprios verificados; dueOn não confirmado como ocorrência proposta; IDs sem teto. | P |
| [`answerSubscriptionCharge`](../src/actions/subscriptionCharges.ts#L220) (220) | Sim: verificador local | Montante/datas/answer e pais próprios verificados; dueOn não confirmado como ocorrência proposta; IDs sem teto. | P |

### src/actions/subscriptions.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`listSubscriptions`](../src/actions/subscriptions.ts#L42) (42) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`getSubscriptionTotals`](../src/actions/subscriptions.ts#L81) (81) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createSubscription`](../src/actions/subscriptions.ts#L95) (95) | Sim, via saveSubscription → manualRequestId | manualRequestId/manualAmount/manualDate, moeda/cadência e conta/categoria próprias; textos/IDs sem teto. | P |
| [`submitSubscriptionCreation`](../src/actions/subscriptions.ts#L99) (99) | Sim: helper verifica sessão | Montante/data/moeda/cadência e pais próprios; tamanhos de nomes/notas/IDs não limitados integralmente. | P |
| [`updateSubscription`](../src/actions/subscriptions.ts#L103) (103) | Sim: requireServerSession (sessão ou contexto interno) | manualAmount/manualDate, moeda/cadência e pais próprios; a edição salta manualRequestId/sessão; textos/ID sem teto. | P |
| [`toggleSubscription`](../src/actions/subscriptions.ts#L156) (156) | Sim: requireServerSession (sessão ou contexto interno) | Estado true/false explícito, confirma linha própria; ID sem formato/teto. | P |
| [`deleteSubscription`](../src/actions/subscriptions.ts#L178) (178) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |

### src/actions/symbolNames.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getSymbolNames`](../src/actions/symbolNames.ts#L22) (22) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`setSymbolName`](../src/actions/symbolNames.ts#L28) (28) | Sim: verificador local | cleanSymbol: 1–300 caracteres, sem controlos; cleanSymbolName: até 60; FormData coercivo, sem schema global. | P |
| [`listSymbolsToName`](../src/actions/symbolNames.ts#L48) (48) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |

### src/actions/transactions.ts

| Função (linha) | Sessão/autorização dentro da chamada | Validação no servidor / lacuna | SQL |
| --- | --- | --- | --- |
| [`getQuickEntryOptions`](../src/actions/transactions.ts#L23) (23) | Sim: verificador local | Sem argumentos externos. | P |
| [`listTransactions`](../src/actions/transactions.ts#L45) (45) | Sim: requireServerSession (sessão ou contexto interno) | limit sem verificação de inteiro, finito ou teto. | P |
| [`createTransaction`](../src/actions/transactions.ts#L102) (102) | Sim: verificador local | manualAmount/manualDate/tipo; conta/categoria/cashback próprios; descrições/merchant/IDs sem teto. | P |
| [`createQuickTransaction`](../src/actions/transactions.ts#L187) (187) | Sim: verificador local | Sessão, requestId UUID com prefixo, tipo fechado e valores/datas; delegates validações de createTransaction; textos sem teto. | P |
| [`undoQuickTransaction`](../src/actions/transactions.ts#L202) (202) | Sim: verificador local | Montante/data/tipo e pais próprios nas escritas; textos/IDs sem tetos; limit da listagem sem validação. | P |
| [`createTransfer`](../src/actions/transactions.ts#L215) (215) | Sim: verificador local | Montantes/datas/requestId e contas próprias/ativas/distintas; duas moedas usam valores reais; texto/IDs sem teto integral. | P |
| [`submitTransfer`](../src/actions/transactions.ts#L272) (272) | Sim, via createTransfer antes de DB | Delega em createTransfer: sessão, montantes/datas/requestId/contas próprias; resultado sanitizado. | P |
| [`createInterestPayment`](../src/actions/transactions.ts#L289) (289) | Sim: verificador local | Montante/data e conta própria; verificar intervalos/IDs/tetos de texto de forma integral. | P |
| [`submitInterestPayment`](../src/actions/transactions.ts#L321) (321) | Sim, via createInterestPayment antes de DB | Delega em createInterestPayment: sessão, montante/data/requestId/conta própria; resultado sanitizado. | P |
| [`getTransaction`](../src/actions/transactions.ts#L331) (331) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`isTransferLeg`](../src/actions/transactions.ts#L337) (337) | Sim: requireServerSession (sessão ou contexto interno) | Parâmetros sem schema integral de tipo/formato/tamanho/faixa; consulta/seleção limitada pela RLS quando pessoal. | P |
| [`updateTransaction`](../src/actions/transactions.ts#L347) (347) | Sim: verificador local | Montante/data/tipo e ligações próprias verificados; textos/IDs sem teto integral. | P |
| [`deleteTransaction`](../src/actions/transactions.ts#L401) (401) | Sim: verificador local | Sessão e transação própria; bloqueio de transferências e reversão atómica; ID sem formato/teto. | P |
| [`listCategories`](../src/actions/transactions.ts#L437) (437) | Sim: requireServerSession (sessão ou contexto interno) | Sem argumentos externos. | P |
| [`createCategory`](../src/actions/transactions.ts#L442) (442) | Sim: requireServerSession (sessão ou contexto interno) | Nome obrigatório e kind income/expense; nome sem teto e FormData coercivo. | P |
| [`setCategoryFixed`](../src/actions/transactions.ts#L468) (468) | Sim: requireServerSession (sessão ou contexto interno) | ID coercivo e booleano por comparação com true; sem schema de ID/booleano. | P |
| [`deleteCategory`](../src/actions/transactions.ts#L479) (479) | Sim: requireServerSession (sessão ou contexto interno) | ID obtido por coerção; falta schema integral de formato/tamanho. RLS limita a linha; confirmar dependências/referências próprias continua necessário. | P |

## Módulos de src/actions que não são endpoints

| Módulo | Exports de execução | Observação |
| --- | --- | --- |
| [`attemptGate.ts`](../src/actions/attemptGate.ts) | `admitted` | Limite persistente antes de login; sem endpoint próprio. |
| [`language.ts`](../src/actions/language.ts) | `currentLanguage`, `words` | Cookie de língua normalizado para catálogo conhecido; sem DB. |
| [`manualRequest.ts`](../src/actions/manualRequest.ts) | `manualRequestId`, `claimManualRequest`, `manualEntryResult` | Sessão, requestId e recibo; não recebe funções/transações do browser. |
| [`pageLanguage.ts`](../src/actions/pageLanguage.ts) | `pageCatalog`, `textForRequest` | Catálogos locais; sem DB ou pedido externo. |
| [`platformTotals.ts`](../src/actions/platformTotals.ts) | `getAccountPlatformTotals` | Agrega linhas pessoais; chamadores autenticam e o pool verifica revogação. |
| [`playlistChoice.ts`](../src/actions/playlistChoice.ts) | `PLAYLISTS_SENT`, `chosenPlaylists` | Normaliza IDs e filtra playlists próprias; falta teto da lista. |
| [`registrationBot.ts`](../src/actions/registrationBot.ts) | `registrationBotRefusal` | Verifica BotID no servidor, fechado perante falha. |
| [`releaseEdition.ts`](../src/actions/releaseEdition.ts) | `investmentsFor`, `currentInvestments`, `requireInvestments` | Guarda de edição e sessão em requireInvestments, incluindo full; contexto interno do servidor preservado. |
| [`reportFonts.ts`](../src/actions/reportFonts.ts) | `reportFonts` | Fontes locais de lista fechada por língua; a rota verifica sessão antes de carregar. |
| [`reports.ts`](../src/actions/reports.ts) | `loadReport` | Normaliza período/scope; entrada PDF e ações de dados verificam sessão; quotas ainda por aplicar. |
| [`requestSession.ts`](../src/actions/requestSession.ts) | `SessionRequiredError`, `requireServerSession` | Verifica sessão ou contexto interno asUser; helper não invocável por RPC. |
| [`sessionRevocation.ts`](../src/actions/sessionRevocation.ts) | `sessionsNotBefore`, `forgetSessionRevocation` | Leitor interno; memoização do render e partilha só de consultas pendentes; sem TTL entre pedidos. |
| [`snapshots.ts`](../src/actions/snapshots.ts) | `writeSnapshot` | Escritor interno, sem endpoint próprio; chamadores devem fornecer valores verificados. |

## Verificação final desta alteração local

- **`npm test`: 3847 testes aprovados em 242 ficheiros**, incluindo os sete casos iniciais, 246 casos adicionais da continuação e as suites existentes de RLS, QR, recuperação concorrente, backup e fluxos financeiros com PostgreSQL em memória. Repetido no fim a pedido do utilizador.
- **`npx tsc --noEmit` aprovado**, executado separadamente na raiz deste worktree no controlo final.
- **Build de produção money + VERCEL=1 aprovado**, com verificação TypeScript do Next. Repetida pesquisa nos 74 ficheiros estáticos após as correções: nenhum valor secreto/marcador; apenas o nome ENCRYPTION_KEY em ajuda.
- **`npm run lint -- src` aprovado**, sem erros ou avisos, cobrindo todos os ficheiros de código/testes alterados/criados; `git diff --check` aprovado.
- Não houve alterações de esquema; não se executou db:migrate, db:generate, audit contra base real, release/deploy ou chamadas a corretoras.
- Os resultados locais não confirmam a configuração/estado das migrações da Vercel, a classificação real do BotID, a revogação em todos os caminhos HTTP ou resistência a carga. Permanecem os limites descritos acima.
