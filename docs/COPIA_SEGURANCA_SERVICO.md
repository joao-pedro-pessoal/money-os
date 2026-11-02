# Cópia de segurança de todo o serviço

Preparado em 30/10/2026 — **não ativado nem executado em produção**.
O destino, a frequência e a retenção reais são escolhidos pelo responsável.
O ensaio usa exclusivamente dados fictícios e PostgreSQL temporário local.

## O que fica guardado

`npm run backup:service` copia a base inteira da Money OS: todas as pessoas,
identidades de entrada, dados financeiros, configurações, recibos de operações
idempotentes, tabelas partilhadas, esquema, funções, sequências, migrações e
políticas RLS. Não aplica filtros por pessoa ou por esquema. Usa `pg_dump` em
formato custom, que obtém uma fotografia consistente da base. A leitura exige
o endereço **direto** de administração em `DATABASE_ADMIN_URL`; a ligação
limitada da app não serve. [Documentação do pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

O arquivo é cifrado em fluxo com AES-256-GCM, salt/nonce aleatórios e chave
derivada por scrypt. O cabeçalho também é autenticado. A palavra-passe vem de
`BACKUP_PASSPHRASE`, com pelo menos 20 caracteres; prefere uma chave aleatória
gerada e guardada no gestor de palavras-passe. Não há ficheiro temporário em
texto simples. O ficheiro `.sha256` verifica a transferência; a autenticação
GCM deteta alterações mesmo se alguém recalcular esse checksum. **Sem a chave,
a cópia não é recuperável.** Guarda-a separada do arquivo.

Isto é uma cópia lógica de uma base, não do cluster PostgreSQL. Roles, passwords
de roles, permissões de infraestrutura, domínio, tarefas agendadas e segredos
do alojamento não são exportados. Owners e grants são reaplicados pelo
responsável no destino. Guarda separadamente a versão do código e o segredo
`ENCRYPTION_KEY` original, necessário para abrir credenciais de ligações já
cifradas na base. Mantém esse material cifrado e fora do Git. Não se deve voltar
a usar um `APP_SECRET` antigo depois de um restauro real do serviço.

## Preparar e criar uma cópia real, mais tarde

1. Escolhe uma pasta privada e destino de armazenamento cifrado, com acessos
   limitados e uma segunda cópia fora do aparelho. No Windows, confirma as ACL
   da pasta: o modo 0600 pedido pelo script não substitui as permissões Windows.
2. Instala clientes PostgreSQL de versão principal igual ou superior à base,
   com correções atuais. Define `PG_TOOLS_DIR` se não estiverem no PATH.
3. Carrega `DATABASE_ADMIN_URL` e `BACKUP_PASSPHRASE` do gestor de segredos para
   o ambiente do processo, sem os escrever em comandos, ficheiros ou logs. O
   script **não carrega `.env`** nem usa `DATABASE_URL` como alternativa. Nunca
   imprimas essas variáveis. Regista o commit do código separadamente.
4. Só quando o destino estiver escolhido e a operação autorizada, executa:

```powershell
# Exemplos para execução futura pelo responsável; não executados em produção.
# As variáveis de segredo já devem estar carregadas pelo gestor de segredos.
$env:PG_TOOLS_DIR = 'C:\Program Files\PostgreSQL\18\bin'
npm run backup:service -- create --file 'D:\DESTINO_PRIVADO\moneyos-DATA.moneyos.enc' --allow-remote-source
npm run backup:service -- verify --file 'D:\DESTINO_PRIVADO\moneyos-DATA.moneyos.enc'
```

O caminho é explícito e tem de ser novo; o script nunca substitui um ficheiro
existente. Funciona também em discos sem ligações físicas, como exFAT, FAT32 e algumas
unidades de rede. A origem remota é recusada por omissão, antes de abrir uma ligação;
`--allow-remote-source` só é aceite em `create`. Não há cópias automáticas nem
upload configurado. As credenciais vão no ambiente do cliente PostgreSQL,
nunca nos seus argumentos. O script não imprime URLs, passwords ou stderr do
cliente. Um erro/aviso impede a conclusão; verifica versão, acesso direto e
privilégios se a operação falhar. Ficheiros `.partial-*` são cifrados e não
contam como cópias válidas.

Depois da transferência, executa `verify` sobre a cópia no destino, confirma
que o processo terminou com código zero e conserva arquivo e checksum juntos.
Esta verificação não liga a nenhuma base. O script termina com erro se faltar
checksum, houver alteração, chave errada ou formato incompatível.

## Restauro de todo o serviço

1. Cria uma base **local, vazia e descartável**, a partir de `template0`, num
   PostgreSQL compatível. `DATABASE_RESTORE_URL` deve apontar para essa base;
   só são aceites `localhost`, `127.0.0.1` ou `::1`. Não há opção para restaurar
   remotamente nem `--clean`/substituição de dados existentes.
2. Carrega a chave da cópia em `BACKUP_PASSPHRASE`. Isola a cópia da app de
   cron/sync/notificações e rede externa para não aceder a brokers ou serviços
   reais guardados no arquivo.
3. Executa o restauro local:

```powershell
npm run backup:service -- restore-local --file 'D:\DESTINO_PRIVADO\moneyos-DATA.moneyos.enc'
```

Antes de escrever dados, o script verifica checksum, autenticação GCM, assinatura
do formato e catálogo do arquivo com `pg_restore --list`, e recusa uma base
com objetos de utilizador. Restaura em **uma transação**, com saída ao primeiro
erro, sem owners/grants da origem. Não corre migrações da app.
[Documentação do pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).

4. Confirma a tabela `drizzle.__drizzle_migrations`, quantidades e totais
   financeiros, referências e existência das políticas RLS. Usa código
   compatível com as migrações copiadas; não faças downgrade de esquema.
5. Recria a role da app com password nova, **NOSUPERUSER NOBYPASSRLS NOCREATEDB
   NOCREATEROLE**, sem ser dona de tabelas nem membro da role de administração.
   Concede CONNECT na base, USAGE no esquema public, SELECT/INSERT/UPDATE/DELETE
   nas tabelas e USAGE/SELECT nas sequências. Aplica também esses grants a
   objetos futuros da role que executa migrações. Testa duas pessoas com essa
   role; cada uma deve ler/escrever só as suas linhas. Não ligues a app como
   administrador. O ensaio abaixo executa estes grants e verificações.
6. Antes de qualquer promoção futura, revoga sessões e pedidos QR copiados,
   usa `APP_SECRET` novo e reconcilia as eliminações de contas efetuadas depois
   da data da cópia. Não ressuscites pessoas que pediram eliminação. Mantém os
   recibos `manual_request` no audit_log: são necessários para não repetir
   movimentos. Revalida estes passos na base recuperada e só então planeia uma
   mudança de ambiente, com autorização separada. O script não promove bases,
   altera alojamento ou publica código.

## Recuperar apenas uma pessoa

Não restaures diretamente uma tabela do arquivo: as tabelas contêm várias
pessoas e relações entre si. Restaura primeiro a cópia completa numa base local
isolada como acima. Usa a versão compatível da app com saída externa bloqueada
e role limitada por RLS. A pessoa autentica-se nessa cópia e descarrega a
**cópia completa JSON da sua conta** em Definições → Os teus dados. Isto usa a
exportação por pessoa existente; não inclui hashes de autenticação nem rows de
outras pessoas. Confirma a identidade e autorização antes de entregar o JSON.

Na conta de destino, a própria pessoa guarda primeiro uma cópia do estado
atual, inspeciona o JSON e usa o restauro existente com a confirmação RESTORE.
Esse restauro substitui os dados dessa pessoa: não é uma junção com movimentos
recentes. A identidade do dono das linhas é sempre a sessão atual; não se
copia a tabela users nem se recuperam passwords/sessões antigas. Se for uma
conta refeita, usa a nova identidade, só a pedido da pessoa; nunca recries uma
identidade eliminada automaticamente. Confirma totais, moedas, relações e a
ausência de alterações noutra conta. Apaga as cópias de trabalho privadas
depois da verificação. Os testes `backup-postgres.test.ts` cobrem esse percurso,
incluindo outro utilizador intacto e conta refeita com ID novo.

## Retenção proposta e decisões pendentes do responsável

Sugestão inicial: **uma cópia diária, no máximo sete dias**, mais uma cópia
antes de operações excecionais que expire no mesmo limite. Define a hora,
local e responsável; verifica a cópia de cada dia e ensaia um restauro mensal.
Apaga cópias expiradas em todos os destinos e usa versões de objetos com
expiração definida, evitando retenção indefinida sem intenção.

Antes da primeira cópia real, confirma esta retenção, ajusta os avisos de
privacidade/eliminação à retenção efetivamente escolhida e define o registo
de eliminações que será reaplicado se houver recuperação. Os avisos atuais
descrevem o serviço sem este novo arquivo operacional ativo. A sugestão não
ativa retenção, agenda ou armazenamento. Decide também quem guarda a chave e
como a obter se o aparelho principal se perder.

## Repetir o ensaio fictício

Num PostgreSQL descartável local com privilégio para criar bases/roles, define
apenas `BACKUP_REHEARSAL_ADMIN_URL` para a base administrativa local. Não uses
segredos ou ficheiros `.env` da app. Escolhe uma pasta de evidência nova:

```powershell
npm run backup:rehearse -- --local 'C:\PASTA_PRIVADA\ensaio-novo'
```

O ensaio cria bases e role com nomes aleatórios, aplica as migrações reais
apenas à origem fictícia, cria duas pessoas e dados, copia/cifra/verifica e
executa pg_restore no destino. Compara todas as tabelas (incluindo migrações e
estado partilhado), conteúdo, sequências, flags RLS e políticas; verifica
isolamento de leitura/escrita. Testa chave errada, adulteração, destino ocupado
e ficheiro já existente. Deixa as duas bases fictícias para inspeção; encerra
depois o servidor temporário. A chave aleatória do ensaio vive só no processo.

Opcionalmente, no Windows com clientes já disponíveis num WSL local,
`PG_TOOLS_WSL_DISTRO`, `PG_TOOLS_DIR` (caminho Linux) e `PG_TOOLS_LIB_DIR`
selecionam esses binários; não há instalação automática. O ensaio de 30/10 usou
PostgreSQL 16.2 portátil num Ubuntu local só em loopback, com **54 tabelas e
45 políticas RLS** recuperadas e iguais. Para operação real usa versões
atualizadas e compatíveis. A evidência está descrita em
[VERIFICACAO_C1_C7.md](VERIFICACAO_C1_C7.md).
