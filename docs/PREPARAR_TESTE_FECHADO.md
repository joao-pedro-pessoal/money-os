# Preparar o teste fechado

Procedimento técnico de 9 de outubro de 2026. O estado e os passos por concluir
estão apenas no `TAREFAS.md` (R01–R06). Este guia não autoriza publicação.

## Acesso por convite

O registo existente continua aberto se `REGISTRATION_MODE` não estiver definido.
Para um teste por convites, configurar **no ambiente publicado**, antes dos convites:

- `REGISTRATION_MODE=invite`.
- `REGISTRATION_INVITE_CODE`: código aleatório de 32 a 256 caracteres, criado num
  gestor de palavras-passe e enviado em privado aos convidados. Não usar
  `NEXT_PUBLIC_`, não pôr em URLs, capturas de ecrã, tickets ou no repositório.
- `MAX_ACCOUNTS=40` é a proposta inicial. Os limites globais de 5 novos registos
  por hora e 20 por dia continuam: distribuir os convites por várias horas/dias.

`REGISTRATION_MODE=closed` suspende novos registos sem impedir entradas ou
recuperações de contas existentes. Um modo desconhecido, ou o modo `invite` sem
um código válido, também fecha os registos. `open` mantém o comportamento anterior.

O código é partilhado e reutilizável. Alterá-lo invalida o anterior para novos
registos; não termina sessões nem remove contas existentes. Não comprova o email,
não substitui limites por origem e não é um serviço anti-robô. Não há convites
enviados automaticamente nem um fornecedor adicional.

## Verificação local da configuração

```cmd
cd /d C:\Users\joao2\Projects\money-os-f17
npm.cmd run release:check
```

O comando lê variáveis do processo e, para as que faltarem, o `.env` desta pasta.
Não apresenta valores nem segredos, não liga à base, não muda configurações e
**não consulta a Vercel**. Código de saída 1 significa configuração incompleta;
0 significa que estas verificações de configuração passaram, não que a app está
aprovada para lançamento.

A cópia local serve também o PC: é normal ter `COOKIE_SECURE=false` para HTTP e
`ENCRYPTION_KEY` para corretoras. **Não apagar a chave nem mudar a configuração do
PC para fazer este comando passar.** A configuração publicada é separada: HTTPS,
cookie seguro, chave de sessão aleatória, responsável e contacto público, acesso
por convites e ligação direta à base com o utilizador limitado da app. O comando
só reconhece alguns nomes de utilizador administrativos; o teste real de RLS e
o controlo de permissões da ligação continuam necessários.

## Registos de falhas

O hook de servidor do Next escreve eventos JSON `moneyos.server_error` nos logs
do alojamento, com hora, categoria genérica de erro, método HTTP e tipo de
operação. Não copia mensagem, stack, URL, headers, corpo do pedido ou utilizador.
É possível filtrar por esse nome de evento na ferramenta de logs existente.

Isto não substitui os logs próprios do Next/Vercel, que têm os seus próprios
conteúdos, nem captura todos os erros apanhados pelo código ou falhas no browser.
Não adiciona retenção prolongada, alertas ou outro fornecedor. Antes de ativar
um fornecedor desses, rever dados enviados, retenção, contrato e texto legal.

## Ensaio antes dos convites

Usar uma conta temporária com dados fictícios. Verificar instalação limpa,
registo com/sem convite, entrada, recuperação, movimentos, importação, exportação,
eliminação, widgets, notificações e perda de ligação. Confirmar que duas contas
não veem os dados uma da outra. Apagar apenas as contas temporárias no fim.

O restauro deve ser ensaiado numa base isolada. A exportação de uma pessoa não
substitui um backup de serviço completo. Não restaurar, apagar ou fazer testes de
carga sobre a base de produção. O guião da Play Console está em `PLAY_STORE.md`.

### Ensaio automático do backup individual

```cmd
npm.cmd test -- src/actions/__tests__/backup-postgres.test.ts
```

Usa PostgreSQL embebido (PGlite), em memória, com as migrações reais e duas
contas fictícias. Não carrega `.env` nem usa o cliente da base de produção.
Verifica exportação/restauro, rollback após uma linha inválida, isolamento por
RLS e o restauro numa conta apagada e criada de novo (B36). O proprietário escrito
no ficheiro é ignorado: as linhas ficam sempre com quem restaura, também quando o
ficheiro diz que são de outra conta.
A dependência é apenas de desenvolvimento e não entra no código da app.

Este ensaio não comprova a recuperação do serviço Neon, a retenção de backups,
o desempenho sob carga ou a reposição de utilizadores e configurações do serviço.
Esses critérios continuam na tarefa R04.
