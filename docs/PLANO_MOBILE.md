# Money OS: continuação a partir do site

Inspeção local: 8 de setembro de 2026. Esta preparação não altera a interface nem a lógica financeira e não publica nada.

## Estado verificado

- Não existe `.git` nesta pasta. Não é possível atribuir alterações a commits ou criar uma branch sem primeiro estabelecer um repositório local. Não foi executado pull, merge, push ou substituição por main.
- Checkpoint anterior às alterações desta preparação: `.local-checkpoints/before-mobile-20260908.zip`, com 602 entradas. SHA256: `E3B74CA842BDF22A513CB788325C8FBED9591AEEFA69BA0620093B05A190A03E`.
- O checkpoint contém os ficheiros selecionados do projeto, excluindo dependências, builds, pastas nativas geradas, configurações `.env`, bases locais, cofres, keystores, CSV, patches e logs. Não é um backup dos dados pessoais nem da instalação Android. Os originais continuam no lugar.
- Site declarado: Next.js 16.3.0, React 19.2.8. Sem `node_modules` na raiz, sem `.env` e sem `DATABASE_URL` no processo. Os guias exigidos em `node_modules/next/dist/docs/` ainda não estão disponíveis; devem ser lidos antes de editar código Next.js.
- Mobile declarado: Expo 57.0.20, React Native 0.86.3. Dependências e pasta Android presentes.
- Node 24.18.0, npm 11.16.0; Java habitual 23.0.1. JDK 17 indicado e executável adb existem nos caminhos da passagem de trabalho. Não foram alterados JAVA_HOME, PATH ou definições globais.
- `mobile/src/storage/database.ts` já converte caminhos Android em URI `file://`, codificando segmentos e preservando URIs existentes. Não foi alterada a pasta da base nem a chave.
- `IDEAS.md` não existe nesta cópia. O backlog conhecido está preservado abaixo; o conteúdo integral do ficheiro ausente não foi reconstruído por suposição.
- Validação executada em `mobile`: typecheck aprovado; 40 testes móveis aprovados em 6 ficheiros; 457 testes de conectores aprovados em 21 ficheiros. A passagem de trabalho refere 44 testes móveis: diferença por investigar ao comparar versões.
- Vitest emitiu aviso sobre a futura mudança do carregador de configuração; não houve falhas de testes.
- Build web, auditoria da base real, exportações, compilação Android e abertura nativa do cofre não foram validadas nesta preparação. Não houve mudanças de comportamento que exigissem gerar migrações.
- Comparação com o remoto pendente: fazer numa pasta separada antes de integrar trabalho do Claude. A base `49680e8` e os commits mencionados na passagem de trabalho são referências documentais, não história local confirmada.

## Direção e limites técnicos

A base visual e funcional é `src/app` e `src/components` do site. Manter temas, tipografia, gráficos, operações e explicações dos valores. `mobile/src/ui` não é o modelo visual a seguir.

O site já inclui menu lateral que se transforma em gaveta no telemóvel, fecho ao navegar, bloqueio do scroll de fundo, controlo de privacidade, temas e metadados de instalação web. Isso não prova acessibilidade completa, funcionamento offline ou compatibilidade nativa.

Primeira implementação: adaptar o próprio site responsivo e verificar os fluxos em larguras móveis. Os componentes HTML/CSS e gráficos atuais dependem do ambiente web; não podem ser importados diretamente como componentes React Native. O layout também lê alertas no servidor e as páginas usam Server Actions/PostgreSQL. Uma exportação estática ou uma WebView isolada não fornece automaticamente essas operações, armazenamento cifrado ou offline.

A escolha do invólucro nativo fica para uma prova técnica posterior. Reaproveitar do mobile o que for compatível: parsers e regras financeiras, transporte de leitura, armazenamento, backups e bloqueio. Nunca importar `src/db` ou Server Actions para o bundle nativo. Não adicionar uma segunda definição dos totais financeiros.

Google/Apple, isolamento entre utilizadores e sincronização são a nova direção, ainda não implementada. Login sozinho não torna a base single-user segura para várias pessoas. Encriptação ponta a ponta é proposta: definir acesso do PC, posse das chaves, ligação/revogação de dispositivos e recuperação antes de a prometer. Não enviar chaves das corretoras para um proxy central.

## Inventário de paridade a validar

Inventário das rotas e componentes existentes; não equivale a testes funcionais concluídos.

| Área do site | Rotas / componentes de referência | Critério móvel |
| --- | --- | --- |
| Resumo | `/`, NetWorthChart, AccountsCard, CompositionCard, BenchmarkCard | Mesmos totais, avisos de dados parciais e gráficos legíveis |
| Análise | `/analytics`, `/analytics/spending`, `/statistics`, `/money-map` | Filtros, períodos, distribuição e comparações preservados |
| Contas | `/accounts`, `/accounts/[id]`, `/interest`, `/liabilities` | Criar/editar, consultar saldos, juros e passivos sem duplicações |
| Movimentos | `/transactions`, `/transactions/[id]/edit`, `/import` | Registar, editar e importar; preservar moeda e prevenção de duplicados |
| Planeamento | `/budgets`, `/buckets`, `/buckets/[id]`, `/subscriptions`, `/expected` | Orçamentos, distribuição, recorrências e entradas previstas acessíveis |
| Investimentos | `/investments`, `/investments/[id]`, `/investments/analysis` | Tabela, detalhes, etiquetas, fontes e custos desconhecidos preservados |
| Histórico e rendimentos | `/investments/history`, `/investments/dividends` | Histórico, resultados e fontes de dividendos/juros coerentes |
| Organização da carteira | `/investments/watchlist`, `/investments/playlists` | Listas e operações mantidas |
| Posições e ligações | `/positions`, `/connections` | Leituras, configurações, estado e âmbito das corretoras visíveis |
| Biblioteca | `/library`, `/library/[slug]`, `/library/new` | Capas, filtros, favoritos e formulários preservados |
| Preferências e dados | `/settings`, `/settings/categories`, `/settings/rates`, `/settings/data` | Temas, categorias, câmbios, importação/exportação e backups acessíveis |
| Ajuda e acesso | `/manual`, `/login`, TopBar, AlertBell | Ajuda, sessão, alertas e privacidade utilizáveis por toque e teclado |

## Etapas de implementação

### Ideia registada: página de cada ativo e ligações externas

Pedido do utilizador em 9 de setembro de 2026. Estado: planeado, ainda não implementado.

- Em todos os locais onde aparece um ativo — incluindo posições abertas e
  watchlist — clicar no nome ou símbolo deve abrir a respetiva página de detalhes.
- Reaproveitar a página existente de investimentos em `/investments/[id]`;
  estender a experiência aos ativos da watchlist e às posições que ainda não
  tenham esse acesso. A watchlist atual apresenta o nome/símbolo sem ligação.
- A página deve ter uma secção de ligações externas para consultar o ativo em
  serviços como **TradingView**. O utilizador indicará os outros sites mais tarde;
  manter essa lista pendente, sem escolher serviços adicionais por suposição.
- Quando existir uma correspondência confirmada, abrir a página do instrumento
  correto no serviço externo, respeitando bolsa/mercado. Não adivinhar a cotação
  a partir de um símbolo ambíguo.
- Manter a distinção entre ativos detidos e apenas acompanhados: abrir uma página
  da watchlist não cria uma posição nem altera os totais financeiros.

Critério de conclusão: nome/símbolo clicável em posições abertas e watchlist,
página de detalhes correspondente e ligação funcional para TradingView; outros
serviços serão acrescentados após o utilizador os indicar.

1. **Estabelecer a base executável.** Comparar esta cópia com o remoto em checkout separado, sem substituir ficheiros locais. Instalar dependências pelos lockfiles, ler os guias Next.js locais e configurar uma base de desenvolvimento isolada. Executar testes, lint, build e auditoria quando houver configuração. Não copiar ou migrar dados reais automaticamente. Saída: diferenças documentadas e site local verificável.
2. **Adaptar a estrutura do site.** Validar menu, foco, teclado, retorno de foco, áreas seguras, separadores, cabeçalho e alvos de toque. Preservar os oito temas e a opção de cores de sinal. Comparar a 360, 390, 430 e 1280 px; sem scroll horizontal da página nem perda de opções. Tabelas podem ter scroll próprio claramente utilizável. Saída: navegação e dashboard completos no telemóvel, com comparação visual no PC.
3. **Completar paridade por área.** Movimentos/contas primeiro; planeamento; investimentos/análises; biblioteca/preferências. Em cada área testar consultar, criar, editar, cancelar, filtros, erros e operações existentes de remoção/desfazer. Gráficos têm de permitir consultar valores por toque. Não esconder funcionalidades para declarar conclusão. Executar as verificações financeiras relevantes e testes web obrigatórios por alteração.
4. **Registo rápido.** Formulário compacto de despesa/receita com conta, moeda correta, valor, categoria e data; confirmar persistência e permitir desfazer. Só depois ligar atalhos nativos, widget e ações em notificações. Saída: operação registada uma vez, com recuperação de erro e sem depender de um formulário extenso.
5. **Contas e isolamento.** Desenhar identidade Google/Apple, associação de contas e sessões; aplicar propriedade a todas as leituras, escritas, ficheiros e tarefas. Migrações sempre geradas. Testar duas pessoas sem acesso cruzado antes de ativar sincronização. Definir a migração do atual utilizador único sem perda de dados.
6. **Offline e sincronização.** Definir modelo local, fila persistente, identificadores idempotentes, versões/conflitos e eliminações sincronizadas. Testar repetição, falha a meio, edição concorrente e dois dispositivos: um movimento só pode afetar o saldo uma vez. Decidir cifragem e recuperação antes de implementar o protocolo; mostrar estados pendente/erro/sincronizado.
7. **Integração nativa.** Provar reutilização da UI web com as necessidades nativas antes de escolher a solução final. Validar cofre, biometria, bloqueio, teclado, partilhas, backups e conectores no emulador/dispositivo. JDK 17 apenas no processo de compilação; manter Java da faculdade. Exportar JavaScript não equivale a produzir ou validar APK/IPA. Publicação fica fora desta fase.

## Compilações futuras no Windows

O processo de compilação deverá definir temporariamente `JAVA_HOME=C:\Users\joao2\AppData\Local\Programs\Eclipse Adoptium\jdk-17.0.20.101-hotspot` e antepor o respetivo `bin` ao PATH apenas nesse processo. Num script `.cmd`, usar `setlocal`/`endlocal`; não usar `setx` nem mudar Java global ou as definições da faculdade. Não é necessário trocar Java para testes TypeScript/Vitest.

## Entrega de 9 de setembro de 2026

A base executável e a primeira adaptação da navegação/dashboard estão implementadas nesta cópia.

### Comparação e preservação

- Remoto consultado apenas para leitura. HEAD/main continua em `49680e8baae798817baedf5ad835bf67addc8436`.
- Cópia separada em `.local-checkpoints/upstream`. Comparação de 553 ficheiros com o checkpoint anterior, normalizando apenas fins de linha: diferenças anteriores em `CLAUDE.md`, `README.md` e `tsconfig.json`. Nenhuma diferença anterior encontrada nos ficheiros do site arquivados em `src`.
- Três ficheiros do remoto não constavam do checkpoint por exclusão deliberada: `.env.example`, `data/covers.csv` e a fixture CSV de Trading 212. Não foram tratados como ficheiros apagados.
- Preservados o mobile, os lockfiles e as alterações anteriores. Nenhum commit, push, deploy ou integração automática do remoto.

### Site local

- Dependências web instaladas com `npm ci`, sem atualizar o lockfile.
- PostgreSQL portátil 18.4, apenas em `127.0.0.1:55432`, base `moneyos_mobile_dev`, dentro de `.local-checkpoints/postgres-data`. Não instalou serviço global nem alterou o Java. O Docker original continua a indicar PostgreSQL 16; a validação local não é um teste dessa imagem Docker.
- Migrações existentes aplicadas à nova base; nenhuma migração criada. Configuração e credenciais geradas apenas em `.local-checkpoints/local-env.json`, ignorado pelo Git. Não foi criado/substituído `.env` de produção.
- Três contas, histórico e dois movimentos fictícios, identificados com DEMO, permitem testar o site real com gráficos preenchidos. Não foram importados dados pessoais ou credenciais de corretoras.
- A implementação portátil segue a [documentação do embedded-postgres](https://github.com/leinelissen/embedded-postgres). Ferramentas separadas em `.local-checkpoints/tooling`; não são dependências de produção da aplicação.
- TypeScript e ESLint excluem os checkpoints para não compilar a cópia do remoto nem as ferramentas locais.

### Alterações visíveis

- Dashboard empilha os blocos no telemóvel; a partir de 390 px usa duas colunas nos indicadores e mantém as cinco colunas no PC.
- Contas e gráfico circular deixam de disputar metade da largura de um telemóvel. A tabela de movimentos tem scroll próprio quando necessário.
- Menu fechado deixa de ser percorrível pelo teclado. Aberto, mantém o foco dentro do painel, bloqueia a página de fundo e devolve o foco ao fechar. Escape, fecho por toque, seleção da página atual e mudança para largura de PC libertam o painel corretamente.
- Botões do cabeçalho e itens do menu têm alvos de toque de pelo menos 44 px no telemóvel. O painel respeita as áreas seguras.
- Explicações dos indicadores abrem por toque, rato ou teclado, fecham com Escape e cabem na largura móvel.
- Gráficos deixam de depender de animações de entrada que, durante os testes de redimensionamento, deixavam a linha/sectores sem desenho. Tooltips ficam contidos no telemóvel; o gráfico circular permite quebrar nomes extensos. Valores, fontes financeiras, cores e temas continuam os existentes.

### Validação executada

- 2 202 testes web aprovados em 119 ficheiros; TypeScript aprovado.
- ESLint em `src`: zero erros; os três avisos Bybit já documentados permanecem.
- Build final de produção aprovado. `db:generate`: sem alterações no esquema.
- Auditoria primeiro sobre a base vazia, depois sobre os dados fictícios: nenhuma invariante quebrada. Isto não constitui auditoria dos dados pessoais do utilizador.
- Login real e páginas alimentadas por PostgreSQL, verificadas em navegador Edge isolado. Agent Browser verificou o arranque/login; Playwright executou os testes detalhados após uma falha de comunicação do daemon do Agent Browser.
- Dashboard vazio e preenchido a 360, 390, 430 e 1280 px: sem transbordo horizontal da página. Menu, foco em ambos os sentidos, Escape, navegação para Contas, seleção da página atual e redimensionamento aprovados.
- Explicações por toque, tabela aberta, gráfico por toque e ocultação de tooltips no modo de privacidade aprovados. Os oito temas foram capturados e verificados quanto ao transbordo. Sem erros JavaScript nos fluxos testados.
- Evidência local: `.local-checkpoints/verification/`, incluindo `dashboard-390.png`, `dashboard-1280.png`, imagens dos temas e `results.json`. Teste repetível nesta instalação: `node .local-checkpoints/verify-mobile.mjs`.
- Ainda não validado num telemóvel físico ou no emulador Android nesta etapa. Login Google/Apple, sincronização e offline continuam por implementar. A adaptação das restantes páginas é a etapa seguinte.

### Abrir a pré-visualização

Se o servidor desta sessão ainda estiver ativo, abrir `http://127.0.0.1:3000`. A password local está em `.local-checkpoints/ACESSO_LOCAL.txt`.

Para voltar a iniciar nesta instalação, fazer duplo clique em `PREVIEW_LOCAL.cmd`, ou executar no cmd.exe:

```bat
cd /d "C:\Users\joao2\Downloads\money-os-local-mobile\money-os"
PREVIEW_LOCAL.cmd
```

Manter a janela aberta e usar Ctrl+C para parar. Não iniciar uma segunda instância se o site já estiver a correr. O lançador depende das ferramentas ignoradas preparadas nesta cópia; não é um instalador autónomo para outra máquina. A base mantém os dados fictícios entre arranques.

Próxima entrega: adaptar os formulários e listas de Contas/Movimentos, verificando criar, editar, cancelar e desfazer, antes de avançar para as restantes áreas do inventário.
