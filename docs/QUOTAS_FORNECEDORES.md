# Câmbios, pesquisa e sincronização: admissão de pedidos

Lote local de 25/11/2026, no ramo `codex/google-login`, depois de `c083714`.
O estado e o trabalho restante são mantidos em [TAREFAS.md](../TAREFAS.md), R10.
Não houve publicação, alteração de configuração alojada ou acesso a uma base
persistente. Este lote reutiliza `work_gates` da migração 0075, sem migração nova.

## Quotas

Os RPCs verificam sessão e, quando aplicável, edição antes de admitir trabalho.
As quotas residem no PostgreSQL, com a admissão atómica, relógio da base, HMAC,
limpeza e tokens de execução descritos em [IMPORTACOES_RESTAURO.md](IMPORTACOES_RESTAURO.md).
Não dependem da memória de uma instância nem de um sinal de autorização do cliente.

| Trabalho | Pessoa: minuto / hora | Ligação: minuto / hora | Em execução: pessoa / global |
| --- | --- | --- | --- |
| Atualizar câmbios ou voltar uma taxa a automática | 3 / 12 | 15 / 100 | 1 / 4 |
| Pesquisar ativos (`searchAssets`) | 20 / 240 | 60 / 1 200 | 2 / 8 |
| Sincronizar uma ligação | 10 / 60 | 30 / 180 | 1 / 4 |
| Sincronizar todas as ligações | 2 / 12 | 10 / 60 | 1 / 2 |
| Cron GET ou POST | 1 / 12, global | Não usa origem HTTP como identidade | 1 global |

Chamadas diretas, botões e execução automática usam os mesmos limites. O RPC
legado `refreshRatesAction` delega no mesmo serviço. A quota de sincronização
individual também se aplica dentro de um lote; `trigger=scheduled` não permite
saltá-la. Um lote aceita até 20 ligações ativas, recusando um conjunto maior
antes do primeiro fornecedor; a sincronização individual continua disponível.

Uma recusa individual não altera `lastSyncStatus` nem cria um erro no histórico
da plataforma. O cálculo e a persistência financeira do motor de sincronização
mantêm-se; este lote não os torna transacionais. Os tokens de execução expiram
em seis minutos. O handler do cron declara prazo de 300 segundos; uma cópia de
casa precisa de impor prazos equivalentes se os conectores demorarem mais que
a reserva. Não foi medida carga real nem demonstrada conclusão de todos os
utilizadores dentro desse prazo.

## Câmbios e pesquisa

O leitor HTTP interno usado nestes dois percursos tem prazo de oito segundos,
limite de 64 KiB durante a leitura, UTF-8 estrito e JSON. Recusa códigos de erro
e conteúdo não JSON sem expor o corpo do fornecedor. Usa URLs de fornecedores
definidas pelo servidor e `no-store`; não recebe um URL arbitrário do cliente.

Câmbios validam a referência EUR quando indicada, um objeto de taxas com 1–200
entradas, códigos de três letras maiúsculas e valores numéricos finitos entre
0,0000000001 e 1 000 000 000. EUR, se indicado, continua a valer 1. A conversão
financeira usa o mesmo `fetchRates`/`parseRates` e os árbitros existentes.
As atualizações ficam numa transação: uma falha SQL tardia recua todas as taxas.
O predicado SQL mantém taxas manuais, inclusive uma fixada durante o pedido.

Voltar uma taxa a automática partilha a quota e a transação com a atualização.
Uma falha ou recusa mantém a taxa manual. A interface apresenta sucesso,
indisponibilidade e prazo de quota em EN/PT. Perante perda da resposta no cliente,
diz que não foi possível confirmar a atualização e pede para consultar o estado;
não afirma que a gravação foi desfeita. A atualização manual de valores por
`setManualRate` não recebeu quota neste lote.

`searchAssets` recusa entradas não textuais ou acima de 200 caracteres antes
das consultas e do fornecedor. Mantém a normalização existente para até 100
caracteres de consulta, sugestões locais e a introdução manual do ticker.
Uma falha do fornecedor mantém os resultados locais sob RLS e as sugestões
verificadas; uma recusa de quota devolve `retryAfter` e mensagem localizada.
Não foi criada cache de consultas ou resultados pessoais.

## Cron

Contrato HTTP em [sync-api.openapi.yaml](sync-api.openapi.yaml). A autenticação
com `SYNC_SECRET`/`CRON_SECRET` precede o contador global e qualquer consulta a
utilizadores. Sem segredo configurado responde 503; credencial inválida dá 401.
GET e POST partilham quota e exclusão. 429 inclui `Retry-After`; todas as
respostas são privadas e `no-store`.

O percurso interno `withScheduledWork` não é um Server Action e só é chamado
pelo handler depois da autenticação. Não permite ao navegador escolher uma
pessoa. O cron conserva `asUser` sequencial, as quotas individuais e a regra de
edição de cada conta. Uma falha numa pessoa permite tentar a seguinte. Falhas
de câmbios, preços ou ligações dão 207; `accountsFailed` conta cada pessoa uma
vez. A resposta conserva contagens e identificação/estado das ligações,
removendo diagnósticos internos dos fornecedores.

`APP_SECRET`, `SYNC_SECRET` e `CRON_SECRET` continuam a ser segredos existentes.
Nomes de operações, limites, URLs e nomes dos cabeçalhos não são credenciais.
Nenhum segredo novo, alteração de `.env`, alteração de Vercel ou migração foi
necessário. A configuração e a rotação reais não foram confirmadas.

## Evidência local

- Suite completa: **4 110 testes em 260 ficheiros**, com `--maxWorkers=4`.
  Inclui PGlite, migrações reais, papel sem BYPASSRLS e dois utilizadores.
- TypeScript, lint de `src` e compilações webpack money/full aprovados. As
  compilações usaram uma cópia isolada, sem `.env`, com valores sintéticos e
  endereço de base inutilizável. O contrato OpenAPI foi validado como YAML.
- Ensaios HTTP em loopback exercitam o leitor real: sucesso, 503 HTML, resposta
  acima de 64 KiB, taxas inválidas e cancelamento. Testes confirmam rollback
  tardio, taxas manuais, quota partilhada e isolamento das sugestões locais.
- Testes de sincronização confirmam recusa antes do conector, ausência de falso
  erro de plataforma, concorrência, libertação após falha, RLS, limite de lote,
  autenticação do cron, GET/POST partilhados e continuação após falhas.
- Navegador num harness descartável com componentes/RPCs reais, PGlite e
  fornecedor HTTP local: mensagens EN/PT, pesquisa local durante indisponibilidade,
  atualização/automático e quarto pedido recusado. A 390 px, largura de conteúdo
  e viewport coincidiram. `AutoSync` mostrou a falha sintética sem anunciar sucesso.

No primeiro ensaio do navegador, um alias incompleto deixou os pedidos de taxas
e uma pesquisa pelo texto fictício `Synthetic` chegar aos fornecedores reais.
Esse ensaio não foi usado para comprovar os cenários simulados. O alias foi
corrigido e o harness passou a recusar qualquer fetch fora de loopback; os
registos do servidor local confirmaram os pedidos do ensaio repetido. Não foram
enviados dados de contas reais nem consultada a base publicada.

O CLI Postman 1.84.0 estava sem sessão/projeto; a pesquisa de mocks publicados
foi omitida. Os testes usam fixtures HTTP locais versionados nos próprios
ficheiros de teste, não uma simulação Postman publicada. As respostas sintéticas
modelam as formas lidas pelo código; não certificam contratos, disponibilidade
ou quotas dos fornecedores reais. A emulação do navegador não comprova Android
nem Play. As restantes conclusões operacionais pertencem a R10 em TAREFAS.md.
