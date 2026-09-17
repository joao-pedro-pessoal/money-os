# Continuar o Money OS no Codex local

> **Tarefas e estado atual:** [TAREFAS.md](TAREFAS.md) é a lista única do projeto.
> Esta passagem de trabalho mantém o contexto e os caminhos do ambiente; registos antigos devem ser lidos com a sua data.

## Objetivo do utilizador

Usar o site existente como base para a aplicação móvel, mantendo o design,
gráficos, cores e funcionalidades do PC e adaptando a navegação ao telemóvel.
A interface simplificada independente criada em mobile/ foi rejeitada como
direção do produto. Aproveitar componentes úteis dessa implementação sem tratar
essa interface como a experiência pretendida.

**Decisão de 13 de setembro de 2026 (caminho A):** por agora, a app do telemóvel é o
próprio site, aberto a partir do PC pela app Android em `android-shell/`, com todas as
funcionalidades. No telemóvel cada página abre só com o essencial (painéis
`essential` e `MobileFold`). Ver `docs/APP_ANDROID.md` e as duas secções sobre o
telemóvel no `CLAUDE.md`. O caminho B — o site a correr no telemóvel, com os dados
cifrados só lá — continua descrito no `docs/PLANO_MOBILE.md`, com `mobile/` como base.

A evolução futura está descrita em `docs/PLANO_MOBILE.md`. O site financeiro
continua single-user, mas o cofre móvel já tem implementação parcial de login
por email, armazenamento cifrado e sincronização manual. A integração com a
experiência atual ainda não está concluída. Ver a secção 4 de
[TAREFAS.md](TAREFAS.md) para o estado consolidado.

## Código e estado

- Estado a 17 de setembro de 2026: `main` no GitHub inclui o trabalho de telemóvel
  (Simple/Complex, navegação inferior, tabelas em cartões, Trade history, Dividends,
  Open positions, Connections e posições nas playlists). A01, A02 e A03 foram
  concluídos pelo utilizador. 2337 testes.
- Chaves das corretoras no site: cifradas na base de dados (Neon), decifradas só com
  a `ENCRYPTION_KEY` do `.env`. Não ficam só num dispositivo; isso existe apenas em
  `mobile/` e é a tarefa E02.

- Repositório original: https://github.com/joao-pedro-pessoal/money-os
- Base usada nesta sessão: 49680e8baae798817baedf5ad835bf67addc8436.
- Site: Next.js 16.3, React, TypeScript, Drizzle e PostgreSQL.
- mobile/: Expo 57 / React Native 0.86, SQLCipher, SecureStore, autenticação
  do dispositivo, movimentos manuais, importações, backups encriptados e
  conectores de leitura direta. Não contém todas as funcionalidades do site.
- A cópia enviada ao utilizador veio de um ZIP; pode não conter histórico Git.
  Não assumir que está ligada à branch remota ou que inclui commits recentes.
- Commits da cópia de trabalho do assistente: 9ec9f6d (mobile), 0d08297
  (correção do URI do cofre), 6c684c4 (IDEAS.md). Não foram enviados ao GitHub.
- O ZIP inicial não incluía os dois últimos commits. O ficheiro database.ts
  corrigido e IDEAS.md foram entregues separadamente. Verificar se foram copiados.
- Ler AGENTS.md, CLAUDE.md e mobile/AGENTS.md antes de editar. As restrições da
  implementação local existente não equivalem a uma arquitetura multiutilizador
  já decidida. Preservar as regras financeiras e não publicar alterações sem pedido.

## Windows do utilizador

Pasta completa (desde 2026-09-13):
C:\Users\joao2\Projects\money-os

O branch `feat/mobile-app` foi juntado ao `main` nesse dia e os dois partilham
agora o mesmo histórico. Trabalhar no `main` desta pasta. A cópia antiga em
C:\Users\joao2\Downloads\money-os-local-mobile\money-os já não é a pasta de
trabalho: só guarda a base de testes local e as capturas em `.local-checkpoints`.

SDK Android:
C:\Users\joao2\AppData\Local\Android\Sdk

JDK 17 para compilar mobile:
C:\Users\joao2\AppData\Local\Programs\Eclipse Adoptium\jdk-17.0.20.101-hotspot

O utilizador precisa de manter o seu Java habitual para a faculdade. Definir
JAVA_HOME/PATH apenas no processo usado para compilar; não alterar globalmente.
Tem Android Studio e o emulador Pixel_10_Pro_XL (API 37.1). A compilação do
projeto usa compileSdk 36. Falta de espaço no disco C: impediu inicialmente o
arranque do emulador; posteriormente arrancou. O Java 25 do Android Studio
causou falhas configureCMakeDebug; usando JDK 17 a app chegou ao ecrã do cofre.

## Último erro e correção

O Android devolve SQLite.defaultDatabaseDirectory como caminho absoluto sem
esquema. expo-file-system File exige URI. Em mobile/src/storage/database.ts,
converter caminhos iniciados por / para file://, codificando os segmentos e
preservando URIs existentes, antes de verificar File.exists. Não mudar a pasta
real da base de dados nem regenerar a chave de um cofre existente.

A correção passou typecheck, 44 testes móveis, 457 testes dos conectores,
db:generate sem alterações e exportação dos bundles Android/iOS. A abertura
do cofre após esta correção ainda não foi confirmada no emulador do utilizador.
Não confundir bundles exportados com APK/IPA nem testes simulados com validação
nativa de SQLCipher/biometria.

## Próximo trabalho

Consultar apenas [TAREFAS.md](TAREFAS.md): a secção 2 trata da aplicação atual e
a secção 4 da evolução futura. O caminho B só avança quando for pedido.

Usar os comandos locais para investigar erros e testar no emulador sempre que
possível. Pedir ao utilizador apenas interação que exija a sua presença, como
iniciar sessão ou desbloquear o telemóvel.

Comunicar em português simples e distinguir trabalho concluído, propostas e
dependências por configurar. O Codex local não recebe automaticamente esta conversa.
