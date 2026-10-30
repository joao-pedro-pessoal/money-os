# Verificação local C1–C7

Procedimento: [CODEX_PROXIMOS_PASSOS.md](CODEX_PROXIMOS_PASSOS.md).
O estado das tarefas é mantido apenas em [TAREFAS.md](../TAREFAS.md).
Sem push, publicação, acesso à Vercel, migrações na produção, ligação à base
real, palavras-passe reais ou tradução automática online nesta passagem.

## C1 — Formatação da língua

`fmt`, números e valores editáveis recebem a língua explicitamente. Inglês é
o padrão; a moeda pertence ao montante e não é convertida pela formatação.
Componentes usam o contexto de língua; componentes do servidor e PDF usam a
língua do pedido. Eixos compactos mostram `4K` em inglês e `4 mil` em português.
Os campos de edição usam um separador decimal, sem agrupamento, dígitos aceites
pelo validador e sem controlos bidirecionais. As 15 línguas são cobertas para
não estragar a edição completa; en e pt são os formatos de apresentação revistos.
Não foram modificados formatos numéricos de CSV, cálculos ou valores guardados.

Validação: **3406 testes em 221 ficheiros**, TypeScript, lint dos ficheiros
alterados, build `APP_EDITION=money` e diff aprovados. O processo de validação
sobrepõe configurações com valores sintéticos e URL de base exclusivamente
loopback antes de o Next poder ler `.env`; pedidos HTTP externos bloqueados.

**15 verificações no navegador**, computador EN 1440×950 e telemóvel PT
390×844, com PostgreSQL temporário PGlite, migrações reais e RLS. Painel,
Contas, Movimentos, relatório, campo do painel rápido sem milhares, eixos e
geração de PDF confirmados. Sem erros de execução. Texto extraído dos dois
PDFs locais com pypdf confirma `€4,000.50` e `4000,50 €`. Ensaios apenas com
contas e registos fictícios. Os scripts de ensaio não contactam fornecedores.

Evidência local ignorada: `.local-checkpoints/qr-e2e/c1-c7/C1/`
(resultado, servidor, capturas, PDFs e texto extraído) e `c1-ui.mjs`.

## C2 — Edição efetiva por sessão

A compilação define a edição de base; só a identidade de sessão validada do
dono (`OWNER_USER_ID`) recebe a edição completa na compilação money. Não se
usa email, corpo de ação, parâmetro ou cookie de edição. A função central de
identidade aceita uma restrição que apenas pode limitar a identidade assinada;
assim outra conta é recusada antes de ler dados. O dono continua sujeito à
verificação de existência e revogação da sessão. Sem sessão, o proxy envia para
a entrada antes de decidir os destinos disponíveis.

O contexto do cliente só controla apresentação. Listas de menus, pesquisa e
abas são funções da edição efetiva e não constantes avaliadas ao carregar o
módulo. Todas as 42 ações aguardam a autorização do servidor. Relatórios/PDF,
widgets e alertas usam a mesma decisão, sem guardar a edição de uma pessoa em
estado global. O cabeçalho X-MoneyOS-Edition identifica a compilação de base,
não os privilégios do utilizador. Não foi introduzida variável ou migração.

Validação: **3416 testes em 222 ficheiros**, TypeScript, lint e compilações
money/full aprovados. Testes cobrem identidade restrita, sessões inválidas,
revogadas e conta eliminada; ações de outra pessoa recusadas sem base/rede,
identidade exata do dono, alternância de pessoas e comportamento da cópia full.

**11 verificações no navegador** numa compilação money: destinos sem sessão
redirecionam; dono acede a investimentos/definições/trends, outra conta recebe
404; menus, widgets e relatórios seguem a sessão; parâmetros/cookies adicionais
não alteram acesso. Uma atualização real de preço do dono passou de 25 para 30
e foi confirmada no widget. PDFs reais gerados para as duas pessoas: texto
extraído confirma o símbolo DEMO no relatório de investimentos do dono e a
ausência dele no relatório forçado a dinheiro da outra pessoa. Sem erros de
execução no navegador ou servidor.

O ensaio PGlite usa um adaptador de teste que serializa leases de todas as pools
e reaplica identidade por lease: há um único backend PGlite, ao contrário das
ligações PostgreSQL independentes em produção. O código de conexão da app não
foi alterado para contornar essa limitação. Isto não mede carga nem concorrência
com múltiplos backends. Evidência ignorada em `c1-c7/C2/`, `c2-ui.mjs` e
`single-backend-pool.cjs`. A APK store continua sem os widgets de investimento
no manifesto; o dono usa a APK home para estes widgets. Nenhum Android, segredo,
produção ou configuração externa foi alterado nesta tarefa.

## C3 — Primeiros passos

O cartão no painel money usa os dados já existentes da pessoa: conta ativa ou
arquivada, qualquer movimento e orçamento ou objetivo. Não infere movimento de
uma previsão. O registo usa o evento quick-entry existente, sem criar outro
formulário. Sem conta ativa o botão de movimento está desativado. A conclusão
retira o cartão; o fecho é uma preferência por pessoa e aparelho, com alternativa
em memória se o armazenamento estiver indisponível. A privacidade descreve-a.

Validação: **3436 testes em 223 ficheiros**, TypeScript, lint e compilação money.
**11 verificações no navegador**: em inglês no computador e português no
telemóvel, uma pessoa sem dados vê três passos, cria uma conta com saldo, abre o
registo rápido a partir do cartão e cria um objetivo. Cada passo é marcado e o
cartão desaparece ao terminar. O fecho persiste após recarregar; sem armazenamento
funciona durante a visita. Sem erros de execução. Migrações reais só na base
PGlite fictícia, sem serviços externos. Evidência ignorada em `c1-c7/C3/` e
`c3-ui.mjs`.

## C4 — Línguas revistas na edição pública

A política partilhada de línguas depende da compilação: money oferece inglês
e português, full mantém 15. Privilégios de investimento não alteram esta
política pública. Cookie, estado inicial do cliente, alteração de preferência e
preferência antiga são normalizados; inglês é a alternativa. Os catálogos não
foram apagados. Os documentos legais não enumeram línguas disponíveis e não
precisaram de alteração nesta tarefa.

Validação: **3460 testes em 224 ficheiros**, TypeScript, lint e compilação money.
Os testes exercitam todos os 15 valores, valores inválidos e a renderização real
do seletor e do fornecedor de língua nas duas edições. **7 verificações no
navegador** confirmam o seletor na entrada e Definições, cookies ar/de/ja e
inválido, preferência antiga em armazenamento e mudanças en → pt → en. Dono e
outra pessoa seguem a mesma lista de duas línguas. Sem erros de execução.
Evidência ignorada em `c1-c7/C4/` e `c4-ui.mjs`.

## C5 — Verificação de inglês e português

Cinco descrições canónicas exatas de reconciliação são traduzidas só na
apresentação, incluindo a lista de Movimentos, Poupança e o painel completo.
Notas parecidas, nomes de contas, categorias e lojas ficam intactos. Ações de
gravação e exportações de dados não foram alteradas. Tipos de movimentos,
aviso cambial, filtro ativo, contagens de subscrições singular/plural, rótulos
de Poupança, novas categorias e instruções de atalhos passam pela tradução.
Os atalhos descritos na edição money não incluem investimentos. O nome da
instituição Trade Republic continua um nome próprio no exemplo português.

Validação: **3478 testes em 225 ficheiros**, TypeScript, lint e compilação money.
Uma auditoria antes e depois percorreu os mesmos **74 estados**: 26 destinos no
computador em cada língua e sete destinos no telemóvel em cada língua, com
painéis e detalhes abertos, filtro de movimentos e folha rápida da conta.
Inclui painel, contas e detalhe, dívidas, juros, movimentos e edição, poupança
com desconto/cashback, orçamentos, objetivos e detalhe, subscrições ativas e
canceladas, receitas previstas, análise, relatório preenchido e vazio,
definições (geral/categorias/câmbio/dados/telemóvel), manual e páginas legais.

Usaram-se migrações reais, pessoas/nomes fictícios e base PGlite local. São
contados textos distintos por língua/aparelho/destino/estado que correspondem a
copy da outra língua, acrescidos dos padrões de diagnóstico de reconciliação,
tipos, canceladas e aviso cambial. O mesmo classificador final é aplicado aos
textos capturados antes e depois. Excluem-se registos pessoais, códigos de
moeda, Simple/Complex (reservados pela especificação) e «Data», que é português
correto para uma data. Resultado revisto: **47 ocorrências (20 textos) → 0**;
inglês já tinha zero. Os nomes pessoais em inglês não foram traduzidos para
obter esse resultado. Isto descreve a cobertura observada, não todas as
combinações de dados e erros possíveis. Sem erros no navegador ou servidor.

Foram gerados oito PDFs reais por passagem (duas línguas, dois aparelhos,
períodos com dados e vazio). A extração dos dois PDFs portugueses do computador
confirma que October/Made on presentes antes desapareceram, substituídos por
outubro/Criado em, incluindo cabeçalho, mensagem vazia e rodapé. O teste de
regressão cobre a mensagem vazia e o rodapé. Evidência ignorada em `c1-c7/C5/`,
com capturas de texto, contagens, PDFs e o script de classificação. Não houve
tradução online, alteração de registos ou ligações externas.

## C6 — Acerto de saldo com confirmação no formulário

A página da conta usa EditForm e submitAccountBalance, a ação idempotente que
a folha rápida já utilizava. Os campos e escolhas por direção são partilhados;
a leitura da direção segue o validador manual, aceita ponto/vírgula e não
interpreta milhares nem notação científica. O servidor continua a validar a
mudança real e a identidade. A ação antiga foi removida depois de confirmar que
não tinha outros usos; os respetivos testes de falhas agora chamam a ação comum.
Não houve alteração dos montantes, regras financeiras, esquema ou migrações.

Validação: **3495 testes em 226 ficheiros**, TypeScript, lint e compilação money.
Testes de escolhas incluem saldo negativo, zero, centésimos e entrada inválida;
os testes reais em PGlite mantêm atomicidade, RLS, autorização e idempotência.
**15 verificações no navegador**, inglês/computador e português/telemóvel:
campos e escolhas, erro de formato, tipo incompatível injetado e recusado no
servidor, gravação e repetição, nova edição e equivalência com a folha rápida.

Para testar perda de resposta, o navegador enviou a ação real e o teste esperou
a resposta do servidor depois da gravação, interrompendo a entrega ao cliente.
A base já continha saldo 950,50, um movimento de -49,50 e uma auditoria. O
formulário mostrou o erro de ligação e permitiu repetir; o segundo pedido
levou o mesmo requestId e confirmou sucesso, mantendo exatamente esses valores
e contagens. Alterar depois para 970,50 criou apenas o novo movimento de 20.
Ambas as línguas passaram, sem página de erro nem erros de execução. Evidência
ignorada em `c1-c7/C6/` e `c6-ui.mjs`. Só dados fictícios locais.

## C7 — Cópia integral preparada e restauro fictício real

Comandos novos: `backup:service` (create/verify/restore-local) e
`backup:rehearse`. Nenhum carrega dotenv, usa DATABASE_URL como alternativa ou
imprime credenciais. O criador usa DATABASE_ADMIN_URL explícito e recusa rede
remota por omissão. A opção de origem remota existe para uma execução futura
autorizada, não foi usada nesta tarefa. O restaurador só aceita loopback,
verifica integridade antes de abrir o destino e recusa objetos existentes.

O arquivo custom PostgreSQL de toda a base é cifrado em fluxo com AES-256-GCM;
salt/nonce aleatórios, cabeçalho autenticado, scrypt e chave no ambiente. Há
checksum SHA-256 do arquivo cifrado. Não se escreve arquivo temporário em
texto simples, não se substituem ficheiros existentes e não se promove nada.
pg_restore verifica o catálogo antes do destino e restaura em uma transação.
Owners/grants e segredos de infraestrutura são tratados no procedimento,
que também explica recuperação por pessoa via base isolada + exportação JSON
existente, retenção proposta de sete dias e decisões anteriores à ativação.

Validação final: **3511 testes em 227 ficheiros**, TypeScript, lint e compilação
`APP_EDITION=money` aprovados. Testes novos cobrem limites de ligação, opções de
clientes, credenciais só no ambiente, remoção de segredos não necessários,
checksums, assinatura, chave errada e adulteração mesmo com checksum recalculado.
O comando de ajuda foi executado sem ligação à base.

O ensaio adicional usou **PostgreSQL 16.2 real**, portátil no Ubuntu local,
com servidor temporário só em 127.0.0.1:54339. As ferramentas públicas foram
extraídas no workspace, sem instalação de serviço. Aplicaram-se as migrações
reais apenas à origem fictícia e criaram-se duas pessoas, quatro contas,
movimentos, objetivos/alocações, orçamentos, recibos e estado partilhado.
**11 verificações passaram**: role limitada não produz uma cópia parcial;
pg_dump de administrador → cifra → verificação → pg_restore real; chave errada
e alteração recusadas; destino ocupado e ficheiro existente preservados; todas
as **54 tabelas** e respetivos dados, migrações, sequências, flags RLS e
**45 políticas** iguais; role da app sem bypass não lê/altera/insere linhas
de outra pessoa. O servidor temporário é encerrado ao concluir a verificação.

A evidência ignorada está em `c1-c7/C7/`, com result.json, arquivo fictício
cifrado e checksum, logs de controlos e ensaio. O código de reprodução está em
scripts/rehearse-service-backup.ts. A chave aleatória fictícia do ensaio ficou
só no processo; para repetir, usa uma pasta nova. Não se ligou à produção,
não se correu db:migrate, não se mudou configuração externa nem se agendou
qualquer cópia real. Destino, retenção final e ativação continuam por decidir
pelo responsável, conforme a tarefa.
