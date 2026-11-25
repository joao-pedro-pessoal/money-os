# PDF, widgets e alertas: limites e reutilização privada

Implementação local de 25/11/2026 em `codex/google-login`. O estado e o trabalho
restante pertencem a [TAREFAS.md](../TAREFAS.md), R10. Este documento descreve o
contrato e a evidência; não certifica a operação publicada.

## Pedidos e concorrência

O contrato HTTP está em [read-api.openapi.yaml](read-api.openapi.yaml). Os três
GETs verificam a sessão antes de admitir trabalho ou consultar resultados
guardados. As respostas são privadas e `no-store`, incluindo erros; não há
identificador de pessoa no pedido. A revogação de sessões existente é mantida.

Os contadores usam o mecanismo PostgreSQL da migração 0075, partilhado entre
instâncias. As chaves são HMAC com o `APP_SECRET` existente, sem email ou IP em
claro. Na cópia de casa sem cabeçalho de origem continuam ativos os limites por
pessoa e globais. Não foi criado um segredo novo.

| Operação | Pessoa: minuto / hora | Ligação: minuto / hora | Em execução: pessoa / global |
| --- | --- | --- | --- |
| PDF | 3 / 20 | 15 / 100 | 1 / 2 |
| Widget HTTP | 12 / 240 | 60 / 1 200 | 12 / 32 |
| Alertas HTTP ou RPC | 12 / 240 | 60 / 1 200 | 12 / 32 |
| Cálculo de widgets | Sem janela adicional | Sem janela adicional | 1 / 4 |
| Cálculo de alertas | Sem janela adicional | Sem janela adicional | 1 / 4 |

Um pedido que reutiliza dados continua a gastar a quota HTTP. O RPC público
`getAlerts` partilha a quota com o endpoint Android. O layout chama o serviço
interno `pageAlerts`: navegar não gasta a quota pública, mas mantém autenticação,
reutilização privada e limites de cálculos. Não existe um parâmetro do cliente
para saltar a quota. Limites devolvem 429 e `Retry-After`; falhas de serviço
devolvem 503 genérico. Uma falha de alertas apresenta indisponibilidade na barra
superior, preservando a página. Alertas vazios válidos continuam a ser sucesso.

Os handlers têm prazo de 300 segundos. As reservas de execução expiram aos
360 segundos; o token só pode libertar a sua própria reserva. Não existe uma
transação ou conexão reservada durante todo o cálculo.

## Resultados privados de 15 segundos

A migração **0076_daffy_black_crow.sql**, gerada com snapshot e journal, cria
`private_snapshots`. Usa `ownedBy()`, chave composta por pessoa e variante, RLS
com `USING` e `WITH CHECK`, e FK para `users` com eliminação em cascata. O papel
normal da app precisa das permissões da nova tabela, mantendo NOBYPASSRLS. Não
se deve usar a conexão administrativa para servir estes dados.

Widgets variam por edição e idioma verificados no servidor. Alertas guardam
as regras antes da tradução e variam por edição. Não há dados pessoais em
estado global do processo nem cache HTTP partilhada. Um UPSERT atómico escolhe
um escritor; outros pedidos aguardam até cinco segundos, sem reter uma conexão,
ou recebem limite temporário. A reserva do escritor dura 310 segundos; um
escritor antigo não publica nem desbloqueia o resultado de outro token.

A validade para reutilização é **15 segundos desde o fim do cálculo**. Uma
alteração pode, portanto, demorar até 15 segundos a aparecer nos widgets ou
alertas. `updatedAt`/`checkedAt` identifica o cálculo reutilizado. O texto JSON
não ultrapassa 1 MiB: um resultado maior é devolvido, mas não é guardado.

Validade não significa eliminação física aos 15 segundos. Resultados são
substituídos ao renovar; uma renovação também remove resultados próprios
expirados há mais de um minuto e sem escritor ativo. Eliminar a conta remove-os
em cascata. O restauro financeiro elimina-os na mesma transação, invalidando
também escritores antigos; falha do restauro recua essa eliminação.

São dados derivados e recomputáveis, excluídos do backup financeiro pessoal de
46 tabelas. Um backup integral da base pode conter estas linhas privadas, tal
como outros dados da base. A política de privacidade EN/PT e a data legal foram
atualizadas para descrever esta reutilização e as quotas.

## Limites do PDF

| Limite por omissão | Variável de servidor |
| --- | --- |
| 3 660 dias | `PDF_MAX_DAYS` |
| 100 000 linhas nas fontes | `PDF_MAX_SOURCE_ROWS` |
| 10 000 entradas somadas nos arrays do relatório | `PDF_MAX_RENDER_ROWS` |
| 4 MiB no PDF final | `PDF_MAX_BYTES` |

São configurações sem credenciais, não segredos. Valores configurados têm de
ser inteiros positivos até 1 000 000 000. Os limites de texto são constantes:
20 000 caracteres por string e 1 000 000 no conjunto do relatório.

A fronteira HTTP recusa parâmetros desconhecidos, repetidos, enums inválidos,
datas inválidas ou invertidas antes de carregar dados. A página e o PDF usam o
mesmo resolvedor de períodos e os mesmos cálculos; a normalização tolerante
da página mantém-se. A edição money força o âmbito money mesmo com um scope
de investimentos no URL.

Antes de carregar históricos para Node, o servidor conta fontes com subconsultas
SQL limitadas a teto + 1, sob RLS. Inclui as fontes de património antigo mesmo
na edição money, e fontes auxiliares de categorias, orçamentos e investimento.
Na parte de investimentos inclui também a série pública de benchmarks guardada
na base. O teto é conservador: soma fontes disponíveis, não apenas movimentos
no intervalo escolhido. Encurtar o período não evita o teto de histórico; nesse
caso usa-se CSV ou revê-se a configuração para a capacidade disponível.

Após calcular o relatório, o servidor limita arrays e texto antes de carregar
fontes/desenhar páginas, e limita os bytes do PDF produzido. Datas/valores e
fórmulas financeiras não foram redefinidos. Parâmetros inválidos dão 400,
intervalo/dados/saída excessivos 413, quota 429. O botão evita duplo envio e
mostra mensagens EN/PT, inclusive quando o alojamento devolve um erro não JSON.
A exportação CSV existente mantém-se. Outros idiomas usam fallback inglês.

## Evidência local de 25/11/2026

- Suite completa: **4 088 testes em 258 ficheiros**; TypeScript, lint de `src`
  e compilação webpack da edição money aprovados. Compilação numa cópia
  isolada, sem `.env`, com configuração sintética e endereço de base inutilizável;
  nenhum artefacto da `.next` original foi substituído. Contrato OpenAPI lido
  como YAML e journal/snapshot da migração conferidos.
- PGlite com todas as migrações reais e papel sem BYPASSRLS: isolamento entre
  duas pessoas, recusa de dono forjado, sessão revogada antes de reutilizar,
  concorrência com um escritor, expiração, recuperação de falha/crash, limite
  de tamanho, tokens antigos e eliminação da conta.
- Restauro: dados derivados ausentes do ficheiro financeiro; falha SQL recua
  a invalidação; sucesso elimina a cache.
- HTTP/RPC: quotas partilhadas, 429 com prazo, 503 distinto de alertas vazios,
  autenticação antes dos contadores, erros sem diagnósticos privados, limites
  do PDF antes das fontes e dados de outra pessoa fora da contagem.
- Navegador com handlers e componentes reais, sessão sintética e PostgreSQL
  descartável: dois pedidos de widgets e dois de alertas deram 200 com a mesma
  data de cálculo; três PDFs deram 200 e o seguinte 429; mensagem portuguesa
  com prazo visível a 390 px, sem transbordo horizontal observado.

O ensaio no navegador decorreu num pequeno harness isolado, não na app inteira.
Não comprovou guardar o ficheiro no Android. PGlite serializa numa conexão;
estes testes não medem carga real de múltiplas instâncias. Não houve acesso a
contas reais, base persistente, Google, Play Console ou alterações à Vercel.
