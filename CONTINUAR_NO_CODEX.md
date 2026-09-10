# Continuar o Money OS no Codex local

## Objetivo do utilizador

Usar o site existente como base para a aplicação móvel, mantendo o design,
gráficos, cores e funcionalidades do PC e adaptando a navegação ao telemóvel.
A interface simplificada independente criada em mobile/ foi rejeitada como
direção do produto. Aproveitar componentes úteis dessa implementação sem tratar
essa interface como a experiência pretendida.

O requisito inicial era armazenamento exclusivamente no dispositivo. Depois, o
utilizador propôs contas e sincronização PC/telemóvel, com login apenas Google
e Apple. Registar essa nova direção; autenticação, isolamento entre utilizadores
e sincronização ainda não foram implementados. O site atual é single-user.
Encriptação ponta a ponta com chaves das corretoras no dispositivo foi discutida
como proposta, não é uma propriedade atual da sincronização. Projetar recuperação
e ligação de dispositivos antes de afirmar que essa proteção está disponível.

Backlog: registo rápido de despesas/receitas, widget e ações em notificações,
formulário compacto, offline, sincronização sem duplicados e desfazer.

## Código e estado

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

Pasta completa:
C:\Users\joao2\Downloads\money-os-local-mobile\money-os

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

1. Inspecionar o estado local e preservar as alterações. Se houver Git, criar
   uma branch de trabalho; se não houver, preparar um checkpoint seguro sem
   incluir segredos, dependências ou builds.
2. Verificar diferenças face ao repositório remoto antes de integrar trabalho
   mais recente do Claude; não substituir automaticamente esta cópia por main.
3. Inventariar os ecrãs e operações do site e determinar como reutilizar a UI
   com adaptação móvel e a nova direção de conta/sincronização.
4. Apresentar os impactos técnicos concretos e iniciar a implementação por
   etapas verificáveis, sem eliminar funcionalidades para simular conclusão.
5. Usar os comandos locais para investigar erros e testar no emulador sempre
   que possível. Pedir ao utilizador apenas interação que exija a sua presença.

Comunicar em português simples e distinguir trabalho concluído, propostas e
dependências por configurar. O Codex local não recebe automaticamente esta conversa.
