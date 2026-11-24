# Importação bancária, backup e admissão de pedidos

Implementação local de 24/11/2026 em `codex/google-login`. O estado de trabalho
e as pendências de lançamento são mantidos exclusivamente em [TAREFAS.md](../TAREFAS.md), R10.
Não foi consultada nem alterada uma base persistente, a Vercel ou a Play Console.

## Contrato e limites

O contrato HTTP está em [transfer-api.openapi.yaml](transfer-api.openapi.yaml).
Os novos handlers autenticam a sessão antes de ler o corpo, exigem JSON e
origem igual ao destino real do pedido, recusam `Sec-Fetch-Site: cross-site`
e respondem com `Cache-Control: no-store`. Não aceitam um identificador de
pessoa fornecido pelo cliente. As consultas continuam sob RLS.

| Entrada | Limite por omissão | Configuração no servidor |
| --- | --- | --- |
| Texto CSV bancário | 1 MiB em UTF-8 | `IMPORT_CSV_MAX_BYTES` |
| Registos CSV | 10 000 | `IMPORT_CSV_MAX_ROWS` |
| Colunas / caracteres por campo CSV | 100 / 20 000 | Constantes de produto |
| Backup JSON | 16 MiB em UTF-8 | `BACKUP_MAX_BYTES` |
| Registos de backup, somando tabelas | 100 000 | `BACKUP_MAX_ROWS` |
| Profundidade JSON | 32 | Constante de produto |
| Lote SQL | Até 500 linhas, abaixo de 60 000 parâmetros | Derivado das colunas |

Estas quatro variáveis são configuração pública em natureza, sem credenciais;
ficam no servidor e os limites efetivos são enviados aos formulários. Valores
inválidos falham explicitamente. Não foi criado um segredo novo: os contadores
usam o `APP_SECRET` existente para HMAC. Este continua a ser secreto e nunca é
enviado ao navegador. Recibos de restauro são independentes da rotação desse segredo.

O envelope HTTP do CSV fica limitado a 4 MiB, pois escapar o texto em JSON pode
aumentar o pedido. O texto extraído continua sujeito ao seu próprio teto de
1 MiB. Aumentar o limite configurado de CSV não aumenta automaticamente esse envelope.
`Content-Length` não é considerado prova do tamanho: a leitura pára ao atingir
o teto, mesmo sem esse cabeçalho ou com um valor falso. UTF-8 inválido é recusado.

## Percurso bancário

O navegador apresenta a pré-visualização; o servidor recebe o CSV original e o
mapeamento e volta a interpretar o ficheiro. Calcula o hash, contagem e totais;
não confia num array de movimentos ou hash produzido pelo cliente HTTP. Formatos
de corretora são recusados neste percurso. Linhas ilegíveis, zero e duplicados
internos seguem a seleção já apresentada na pré-visualização. Todos os movimentos
selecionados têm datas, montantes, descrição e campos opcionais validados.

O commit bloqueia a conta própria e repete a deteção de duplicados contra o
estado atual. Categorias são procuradas apenas entre as da pessoa e com o tipo
correto; não se criam categorias a partir do ficheiro. A moeda é a da conta.
Os movimentos, importação, saldo opcional e recibo ficam numa só transação.
O saldo continua sem ajuste por omissão: importar histórico não representa dinheiro novo.
Os totais usam cêntimos inteiros, sem acumular erros de vírgula flutuante.

Um UUID identifica a operação; o recibo associa-o à conta e ao conteúdo
normalizado. Repetição igual devolve o resultado guardado, sem novo commit.
Conteúdo diferente com o mesmo identificador é recusado. A ação antiga
`commitImport` continua autenticada e validada; sem UUID usa a impressão digital
do pedido para impedir a repetição. A anulação bloqueia a mesma conta, remove
movimentos e reverte o saldo numa única transação. Anular outra vez não volta
a subtrair; repetir o commit antigo depois da anulação é recusado.

## Inspeção e restauro

Os antigos RPCs `inspectBackup`/`restoreBackup` foram removidos. O upload direto
evita o envelope de 1 MiB das Server Actions, cujo limite geral não foi aumentado.
Inspeção e restauro usam a mesma validação. Todas as 46 tabelas do formato são
verificadas pelas colunas do esquema Drizzle: campos permitidos/obrigatórios,
nulabilidade, enumerações PostgreSQL, datas reais, booleanos, arrays, precisão e
escala numérica e chaves primárias sem duplicados. Não se cria uma segunda lista
manual de tipos SQL. Valores de texto legados mantêm a representação existente;
esta validação não redefine todas as regras semânticas das funcionalidades.

FKs, incluindo referências a playlists em arrays, têm de existir dentro do
próprio ficheiro. `userId` é descartado e preenchido pela conexão autenticada.
Backups antigos podem omitir tabelas/campos com valores por omissão, com avisos;
um envelope sem nenhuma tabela reconhecida é recusado. Tabelas desconhecidas
são ignoradas, mas contam para os limites de bytes, linhas e profundidade.
A compatibilidade com o antigo `playlistId` é mantida nas tabelas correspondentes.

Após validar o ficheiro completo, a substituição apaga na ordem inversa de
dependências e insere por lotes na ordem normal. Erros de restrições SQL ou
falhas tardias revertem a transação inteira. A confirmação `RESTORE`, um UUID
e o SHA-256 do ficheiro são exigidos pelo handler. O servidor verifica o checksum.
O UUID e o resultado são associados à pessoa autenticada; repetir um restauro
concluído devolve o recibo antes de gastar uma nova quota ou voltar a substituir dados.
Recibos operacionais de importação, anulação e restauro são preservados entre
restauros posteriores; os outros dados seguem o ficheiro. Não são credenciais de entrada.

Os botões bloqueiam durante o pedido, preservam os dados necessários à repetição
e apresentam falhas/limites em EN/PT. Uma falha de rede diz que o resultado não
pôde ser confirmado: não promete que nada foi gravado quando a resposta se perdeu.

## Quotas partilhadas

A migração **0075** cria `work_gates`, uma tabela interna sem dados financeiros,
fora do backup individual. A aplicação precisa das permissões habituais sobre
a tabela. A migração foi gerada pelo Drizzle e ensaiada com as migrações reais
num PostgreSQL temporário; não foi aplicada a um ambiente persistente.

| Grupo | Por pessoa | Por ligação | Simultâneas pessoa / global do grupo |
| --- | --- | --- | --- |
| Ler/interpretar CSV HTTP | 5/min | 20/min | 1 / 4 |
| Commit CSV | 2/min, 20/h | 20/min, 100/h | 1 / 4 |
| Exportar JSON/CSV | 2/min, 10/h | 10/min, 50/h | 1 / 4 |
| Inspecionar backup | 3/min | 10/min | 1 / 4 |
| Restaurar backup | 1/5 min, 3/dia | 10/h | 1 / 2 |

Admissão de pessoa, ligação e grupo é atómica, com locks obtidos numa ordem
estável. A ligação usa o endereço reportado pelo alojamento, guardado apenas
como HMAC; sem esse endereço, pessoa e grupo continuam limitados. Reservas
expiram ao fim de seis minutos, acima do prazo de 300 s dos handlers. Só o token
da execução pode libertar a sua reserva. Uma falha na libertação não transforma
uma gravação concluída num erro; a reserva expira. Registos inativos com mais
de um dia são removidos durante novas admissões. A privacidade descreve estes dados.

Handlers devolvem **429**, `Retry-After` e `{error:"rate_limited",message,retryAfter}`
antes do trabalho protegido. Exportações ainda são Server Actions: estão
limitadas, mas não se afirma que o seu dispatcher devolve HTTP 429.
Retries bem-sucedidos não gastam outra quota de commit/restauro; um retry CSV
ainda passa pela admissão de parsing HTTP. Quotas são definições em
`src/lib/accounts/workLimits.ts`, sem fornecedor adicional ou provisionamento.

## Condição de alojamento para 16 MiB

O limite padrão documentado da Vercel é 4,5 MB por pedido. A opção de pedidos
até 20 MiB, publicada em 20/11/2026 em beta, requer
`VERCEL_SUPPORT_LARGE_REQUEST_BODY=1`, Node.js/Fluid Compute e memória Performance
de 4 GB. O handler está preparado, mas **esta opção não foi ativada nem a sua
disponibilidade/custo foi confirmado para a conta atual**. A alternativa seria
um upload por partes/armazenamento, que não faz parte deste lote.
Não se declara suporte de 16 MiB no site publicado sem esse ensaio prévio.

Referências consultadas em 24/11:
[anúncio dos 20 MiB](https://vercel.com/changelog/vercel-functions-now-support-request-bodies-up-to-20mib),
[erro e requisitos](https://vercel.com/docs/errors/function_payload_too_large).
O tamanho das respostas de exportação continua dependente do transporte atual.

## Evidência e reprodução

Os testes específicos estão em `backup-schema.test.ts`, `transfer-http.test.ts`,
`work-gate-postgres.test.ts`, `backup-postgres.test.ts`,
`import-ownership-postgres.test.ts` e `lib/csv/__tests__/validation.test.ts`.
Cobrem autenticação antes de leitura, origem/Host local, UTF-8 e tamanho real,
limites, cada tabela, precisão/datas, RLS com duas pessoas, rollback tardio,
repetição/anulação, recibos após outro restauro/rotação de segredo, quotas
simultâneas e recuperação de uma reserva expirada. São ensaios locais, sem `.env`
ou chamadas a fornecedores. O ensaio em memória não substitui carga real sobre
várias instâncias e o pool de produção.

No navegador, um harness descartável em `.local-checkpoints/transfer-browser-1795545136`
importou os componentes e handlers reais com um adaptador PGlite em memória,
migrações reais e uma sessão sintética válida. Perdeu deliberadamente a primeira
resposta bem-sucedida de importação/restauro. Observado: um movimento, saldo
100 → 90, retry ainda 90; restauro para 100/zero movimentos, retry sem nova
substituição. CSV acima do teto e backup com montante inválido foram recusados,
com dados preservados. EN no computador e PT a 390 px, largura útil/scroll
375/375 e sem erros JavaScript no estado final. O servidor do ensaio foi parado.
O harness não integra o produto nem a publicação.

A compilação money foi feita numa cópia isolada, com endereços de base de dados
apontados para `127.0.0.1:9`. Verificação final: **4048 testes em 253 ficheiros**, TypeScript e lint src
aprovados; compilação money isolada aprovada e segundo generate sem alterações. Este lote não certifica segredos
rodados, backups/monitorização reais, login Google real, AAB assinado ou instalação Play.
