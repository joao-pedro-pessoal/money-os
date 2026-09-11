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

## Fronteira entre credenciais e dados — decidido

As chaves de API ficam no dispositivo e nunca saem dele. Os dados financeiros
derivados — saldos, posições, P&L, movimentos — sincronizam através do servidor
para que a mesma conta funcione em vários dispositivos. Ao mudar de dispositivo,
a pessoa reintroduz as chaves; o histórico financeiro chega pela sincronização.

| Fica no dispositivo | Atravessa o servidor |
| --- | --- |
| Chave, segredo, passphrase, endereço | Saldos e posições |
| Chave da base local | P&L realizado e não realizado |
| Código de recuperação | Movimentos, categorias, buckets |

O que isto resolve: um servidor comprometido não expõe nenhuma credencial de
corretora, porque nenhuma lá esteve. É a aplicação do que o checklist legal já
exigia — chaves apenas em Keychain/Keystore/SecureStore, sem proxy central.

As chaves são por dispositivo. Qualquer dispositivo onde sejam introduzidas passa
a ler as corretoras; um telemóvel e um computador podem ambos ter as suas. Não
são sincronizadas entre dispositivos em nenhuma circunstância — é o que as
mantém fora do servidor.

**Uma chave distinta por dispositivo, não a mesma chave copiada.** As corretoras
permitem emitir várias chaves de leitura para a mesma conta. Com uma chave por
dispositivo, perder o computador significa revogar na corretora apenas a chave
desse computador, e o telemóvel continua a funcionar. Com a mesma chave em ambos,
revogar por causa de um aparelho perdido desliga todos os outros ao mesmo tempo,
e no pior momento possível. O ecrã de ligação deve identificar a que dispositivo
pertence cada chave e a data da última leitura bem-sucedida, para que a pessoa
saiba qual revogar.

O que isto não resolve, e não deve ser apresentado como resolvido:

- As chaves continuam a passar pelo código da aplicação. Mantê-las fora de
  logs, relatórios de erro, exportações, cópias de segurança do sistema
  operativo e capturas de ecrã continua a ser obrigação da implementação.
- Guardar no dispositivo não protege contra malware, phishing, roubo do
  aparelho nem contra o comprometimento da própria corretora.
- Saldos e movimentos são dados pessoais. A partir do momento em que saem do
  dispositivo, aplicam-se integralmente as obrigações de RGPD do checklist:
  aviso de privacidade, base legal, prazos de retenção, direito a apagar e a
  exportar, e plano de resposta a violação de dados.

### Só os dispositivos decifram — decidido

O servidor guarda os dados financeiros cifrados e **não consegue lê-los**. A
chave de decifragem existe apenas nos dispositivos do utilizador. Não há
recuperação pelo operador: ninguém com acesso ao servidor consegue abrir os
dados de ninguém, nem por pedido do próprio utilizador, nem por pedido de
terceiros.

Foi a alternativa escolhida contra a outra possível — servidor capaz de
decifrar, com recuperação por email ou palavra-passe. Essa devolveria ao
operador a leitura de todas as contas, que é exatamente a responsabilidade que
esta arquitetura existe para não ter. A capacidade de recuperar os dados de
alguém é a mesma capacidade de os ler; não existe terceira via.

O login Google/Apple não altera nada disto. Prova identidade; não entrega uma
chave. Entrar na conta num dispositivo novo dá acesso à conta, não aos dados.

### Recuperação

Dois caminhos, por esta ordem de uso esperado.

**1. Outro dispositivo já ligado autoriza o novo.** É o caminho principal e
cobre o caso realista — trocar de telemóvel tendo ainda o computador. Enquanto
existir um dispositivo ligado, não é preciso mais nada.

**2. Seed de doze palavras, mostrada uma única vez na configuração.** O mesmo
formato das carteiras de criptomoeda: doze palavras de uma lista fechada, com
verificação embutida que deteta uma palavra mal escrita. Doze palavras dão 128
bits de entropia e escrevem-se num papel sem ambiguidade — doze *caracteres*
não serviriam, e a distinção tem de estar clara no ecrã.

A chave de cifragem deriva da seed; a seed nunca sai do dispositivo e nunca
chega ao servidor. Guardada pelo utilizador onde entender: gestor de
palavras-passe, papel, cofre. Serve para a perda total e simultânea de todos os
dispositivos, e é também o que se escreve no site do PC para abrir uma sessão.

Revogar um dispositivo gera uma seed nova, pelo que a anterior deixa de abrir
seja o que for.

O ecrã de configuração tem de dizer, de forma legível e não em letra pequena,
que perder todos os dispositivos e o código significa perder os dados. É
verdade, não tem volta, e uma pessoa que descubra isto depois foi enganada.

**O código de recuperação nunca é enviado por email**, nem por mensagem, nem
por qualquer canal que passe pelo servidor. Duas razões independentes, e cada
uma chega:

- O email é habitualmente também a forma de recuperar a palavra-passe da conta.
  Com o código lá dentro, uma única invasão da caixa de correio dá as duas
  metades — entrada na conta e decifragem dos dados.
- Para o servidor enviar o código, teria de o ver. A partir desse momento a
  afirmação de que não consegue ler os dados deixa de ser verdadeira, e a
  decisão acima fica desfeita.

### Identidade: email, Google ou Apple

Três formas de entrar na mesma conta: email, conta Google ou conta Apple.
Qualquer delas prova quem a pessoa é e nada mais: entrar num dispositivo novo dá
acesso à conta, não aos dados. Sem a seed, o que vem do servidor continua
fechado. Quem comprometer o email, a conta Google ou a conta Apple entra na
conta e não vê nada — que é a propriedade que torna esta separação útil.

Duas consequências de ter três entradas em vez de uma:

- **As três têm de levar à mesma conta.** Quem se regista por email e mais tarde
  entra com o Google do mesmo endereço não pode acabar com duas contas vazias e
  os dados divididos entre elas. A associação de um método novo a uma conta
  existente exige estar autenticado nessa conta, nunca apenas coincidir no
  endereço.
- **O Apple pode esconder o endereço.** Com "Ocultar o meu email", a Apple
  entrega um endereço de reencaminhamento diferente do verdadeiro. Uma regra que
  junte contas por email falha aqui em silêncio, e é mais uma razão para a
  associação ser feita de dentro da conta e não inferida.

### O site do PC passa a decifrar no browser

Consequência estrutural da decisão B, e a que mais trabalho implica.

Hoje o servidor Next.js lê o PostgreSQL, calcula os totais e envia HTML pronto.
Isso pressupõe um servidor capaz de ler os dados, o que deixa de ser verdade. O
site passa a descarregar o bloco cifrado, decifrá-lo no browser com a seed, e
calcular do lado do cliente — o modelo das versões web do Bitwarden e do Proton.

O que sobrevive sem alterações: **`src/lib/**` inteiro.** A regra que obriga
esses módulos a serem funções puras, sem base de dados, sem React e sem rede, é
exatamente o que os torna executáveis no browser. Os arbitradores todos —
`networth.ts`, `positionView.ts`, `unallocated.ts`, `holdingSource.ts` — correm
lá tal como estão. A regra de pureza deixa de ser disciplina de testes e passa a
ser o que viabiliza o produto.

O que não sobrevive: os módulos de `src/actions/**`, que existem para falar com
a base de dados, e as páginas que dependem deles.

Um browser guarda uma chave pior do que um telemóvel guarda. O site deve pedir a
seed a cada sessão em vez de manter o utilizador ligado indefinidamente, e essa
diferença de comportamento entre o site e a aplicação é deliberada.

### O que sincroniza

Tudo excepto as chaves de API: movimentos, contas, posições, P&L,
classificações por trade, buckets, orçamentos, watchlist, biblioteca e
preferências. As credenciais das corretoras não sincronizam em circunstância
nenhuma — é o que define a fronteira.

### Conflitos entre dispositivos

Fundir por omissão; mostrar conflito só quando o mesmo registo foi editado nos
dois lados. Isto depende de uma condição que não pode falhar: **cada registo
precisa de um identificador próprio e estável**, criado no dispositivo que o
origina. É o identificador que faz o mesmo movimento, chegado por dois
caminhos, ser reconhecido como um só.

Sem isso, a fusão soma-o duas vezes e quebra a regra que o resto deste projeto
existe para proteger: um movimento só pode afetar o saldo uma vez.

### Construção criptográfica do cofre sincronizado

Vive em `src/lib/vault/`, partilhado pelo site e pela aplicação — a aplicação já
importa `src/lib` da raiz, e duas implementações de cifra seriam a segunda
definição mais perigosa que este projeto poderia ter.

**Bibliotecas.** `@noble/ciphers`, `@noble/hashes` e `@scure/bip39`, versão exata
2.4.0, as mesmas que a aplicação já usa para os backups. Auditadas, do mesmo autor, e
nenhuma lista de palavras escrita à mão: uma lista com uma palavra errada gera seeds
que nenhuma outra implementação reconhece, sem erro nenhum.

**Seed.** BIP39, lista inglesa, doze palavras, 128 bits de entropia. A soma de
verificação embutida recusa uma palavra mal escrita antes de se tentar decifrar.

**Chave.** HKDF-SHA256 sobre a entropia da seed, com a etiqueta
`money-os-sync-vault:v1`, produzindo 32 bytes. Não PBKDF2: uma função lenta protege
palavras-passe fracas, e 128 bits aleatórios não precisam dela — 600 000 iterações
em cada abertura de sessão no PC seriam custo sem benefício. A etiqueta é diferente
da do backup, pelo que uma chave de um nunca abre o outro.

**Cifra.** AES-256-GCM, com um nonce aleatório de 12 bytes por versão.

**Dados autenticados.** O formato, o identificador do utilizador e o número da versão
entram na cifra como dados autenticados, sem serem cifrados. É o que impede um
servidor não confiável de duas coisas que de outro modo passariam despercebidas:
entregar o cofre de uma pessoa a outra, e servir uma versão antiga como se fosse a
atual. A segunda só é apanhada se o cliente se lembrar da versão mais alta que já
viu e recusar uma inferior — requisito da camada de sincronização, não da cifra.

**Envelope.** Validado de forma estrita e com tamanhos limitados antes de qualquer
derivação de chave, como o backup já faz. Chave e texto decifrado são apagados da
memória depois de usados.

**Revogação.** Uma seed nova é uma chave nova, e o estado atual é cifrado outra vez
com ela.

Nada disto foi revisto por terceiros. O checklist exige uma revisão de segurança
independente antes de guardar dados de outras pessoas.

### Antes de lhe chamar cifragem ponta a ponta

O checklist exige demonstrar que o servidor não consegue decifrar, e documentar
ligação, revogação e recuperação de dispositivos. Enquanto isso não estiver
demonstrado, a funcionalidade descreve-se pelo que faz e não com essa etiqueta.

### Revogar um dispositivo perdido

A partir de um dispositivo de confiança: terminar a sessão do dispositivo
perdido e gerar uma chave nova. A operação tem quatro partes e nenhuma é
opcional.

1. O servidor deixa de aceitar aquele dispositivo. Ele não recebe mais dados.
2. Gera-se uma chave de cifragem nova e os dados no servidor são cifrados de
   novo com ela, feito pelo dispositivo de confiança, que é quem tem a chave
   antiga.
3. Os restantes dispositivos ligados recebem a chave nova pelo mesmo mecanismo
   que autoriza um dispositivo novo.
4. **Mostra-se um código de recuperação novo.** O anterior abre a chave antiga
   e deixa de servir. Se a pessoa guardar o antigo e deitar fora o novo, fica
   sem recuperação sem saber.

**O que isto não faz, e tem de ser dito ao utilizador:** os dados que já estavam
no dispositivo perdido continuam lá. Revogar limita o acesso futuro, não apaga o
passado, e um aparelho mantido offline nunca recebe a ordem de terminar sessão.
O que protege o que já lá está é o bloqueio do próprio dispositivo — biometria
ou código — e é por isso que a aplicação recusa guardar dados financeiros num
telemóvel sem bloqueio configurado.

Duas ações que o ecrã de revogação tem de indicar ao mesmo tempo:

- **Revogar na corretora a chave de API daquele dispositivo.** É aqui que a
  decisão de emitir uma chave por dispositivo compensa: revoga-se aquela e as
  restantes continuam a funcionar.
- Se o dispositivo foi roubado e não apenas perdido, tratar as credenciais como
  comprometidas, independentemente do bloqueio.

### Apagar a conta

Os dados no servidor são apagados. Três consequências a resolver antes de
anunciar a funcionalidade:

- **Cópias de segurança.** Se o servidor tiver backups, os dados sobrevivem
  neles depois de apagados da base. O checklist exige regras declaradas de
  expiração de cópias; sem elas, "apagado" é falso durante o tempo que a cópia
  durar. Definir o prazo e dizê-lo no aviso de privacidade.
- **Cópias locais.** O que está nos dispositivos não desaparece por se apagar a
  conta. Ou a aplicação limpa o cofre local ao detetar a conta apagada, ou o
  ecrã diz que é preciso desinstalar — nunca deixar a pessoa a supor.
- **Exportar antes de apagar.** O RGPD dá direito à portabilidade, e apagar sem
  oferecer exportação transforma um direito no exercício de outro. A exportação
  tem de existir antes de a eliminação ser oferecida.

### Consequências que a fronteira cria

**Só um dispositivo com chaves consegue ler a corretora.** O servidor não pode
atualizar saldos por iniciativa própria, porque não tem credenciais. Um
dispositivo sem chaves — ou com a aplicação fechada — não produz leituras novas.

**A leitura acontece à entrada na aplicação.** Ao abrir, um dispositivo que
tenha chaves lê as corretoras e envia o resultado para o servidor; um dispositivo
sem chaves apenas recebe o que o servidor já tem. Não há leitura agendada no
servidor, porque isso exigiria lá guardar credenciais. Quatro pontos que a
implementação tem de resolver:

- **Intervalo mínimo entre leituras.** Abrir a aplicação cinco vezes seguidas não
  pode produzir cinco chamadas à corretora. As corretoras limitam a frequência de
  pedidos e uma aplicação que os esgota fica bloqueada.
- **Estado durante a leitura.** Entre abrir e a resposta chegar existe um intervalo
  em que os números no ecrã ainda são os anteriores. Têm de aparecer como
  anteriores durante esse período, não como recém-lidos.
- **Falha não apaga a última leitura boa.** Rede indisponível, chave revogada ou
  corretora em baixo devem deixar o valor anterior no lugar, identificado com a
  data em que foi lido e com o erro visível. É a regra já aplicada ao conector
  MEXC: uma sincronização que falha alto preserva o saldo anterior, uma que
  termina vazia sobrepõe-se a ele.
- **Escrita por dispositivo.** Dois dispositivos com as mesmas chaves podem ler em
  simultâneo. A leitura mais recente por conta e corretora ganha; nenhum saldo
  pode ser somado duas vezes por ter chegado por dois caminhos.

**Num dispositivo novo, os dados sincronizados são antigos.** Antes de as chaves
serem reintroduzidas, o ecrã mostra a última leitura feita noutro aparelho. Isso
é uma leitura antiga e tem de aparecer como tal, com data e origem, pela mesma
regra que `assessStaleness` já aplica às reconstruções. Um saldo antigo
apresentado como atual é a falha que o resto deste projeto existe para evitar.

## Novo conector: BloFin — viável, por construir

O nome escreve-se **BloFin**, com "l" minúsculo, não "BioFin". O logótipo e boa
parte da imprensa usam uma letra que se lê como "i" maiúsculo, e a grafia errada
domina os resultados de pesquisa. Registado aqui porque procurar por "BioFin"
devolve a corretora errada ou nada.

Corretora de perpétuos e futuros, sediada nas Ilhas Caimão. Tem API REST pública
e documentada em <https://docs.blofin.com>, com chaves de permissão `READ`
separadas de `TRADE` e `TRANSFER`. É ligável e cumpre a exigência do checklist de
usar credenciais só de leitura. Seria o nono conector.

### O que a documentação diz

Base: `https://openapi.blofin.com`. Existe ambiente de demonstração em
`https://demo-trading-openapi.blofin.com`, útil para construir sem expor a conta
real. Limites: 500 pedidos por minuto por IP, com suspensão de cinco minutos ao
exceder.

**Credenciais iguais às da OKX**: chave, segredo e passphrase, as três em cada
pedido. Isto significa que o esquema já suporta a plataforma sem alterações — a
coluna `encrypted_passphrase` e o `PLATFORM_SETUP.needsPassphrase` existem desde
a OKX e não é preciso migração nenhuma.

**Forma do erro também igual à da OKX**: `code` em texto, `"0"` é sucesso, texto
em `msg`. Aplica-se a mesma armadilha já documentada — `"0"` é *truthy*, portanto
um teste de veracidade dá a resposta errada nos dois sentidos, e a resposta
errada é uma conta cheia que aparece vazia.

### Onde não é a OKX, e é aqui que se perde tempo

Parecer a OKX é precisamente o que torna este conector perigoso de escrever. A
MEXC copiou a API da Binance endpoint a endpoint e inverteu o sinal dos códigos
de erro; a lição foi que a forma de uma venue nunca se assume portável.

**A assinatura é diferente e não pode ser reaproveitada da OKX.** Três diferenças,
qualquer uma delas produzindo uma assinatura inválida que se lê exatamente como
uma chave errada:

- **Ordem do prehash**: `path + method + timestamp + nonce + body`. A OKX assina
  `timestamp + method + path + body`.
- **Existe um nonce**, enviado em `ACCESS-NONCE`. A OKX não tem.
- **A codificação tem um passo a mais.** HMAC-SHA256, depois o digest em
  hexadecimal, depois esse *texto hexadecimal* convertido em bytes, e só então
  Base64. A documentação avisa explicitamente que não é `hex2bytes` mas
  `string2bytes`. A implementação óbvia — hex direto para Base64 — dá uma
  assinatura errada.

Cabeçalhos: `ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-TIMESTAMP`, `ACCESS-NONCE`,
`ACCESS-PASSPHRASE`. A passphrase viaja em cabeçalho e não entra na assinatura.

**Seis tipos de conta, um pedido por cada.** `GET /api/v1/asset/balances` exige o
parâmetro `accountType`, e existem `funding`, `futures`, `spot`, `earn`,
`copy_trading` e `inverse_contract`. Ler só um e apresentar o resultado como o
total da conta é a falha mais repetida deste projeto. Ou se leem vários e se diz
quais, ou o âmbito fica declarado em `readsOnly` — nunca em silêncio. Posições em
`GET /api/v1/trade/positions`.

### Por confirmar contra uma chave real

A documentação foi lida através de um resumo automático, não linha a linha, e
nenhum destes pontos foi ainda visto numa resposta verdadeira. Antes de a
plataforma aparecer no seletor:

- Uma assinatura válida, construída pelo passo `string2bytes` descrito acima.
- A resposta a uma chave deliberadamente inválida, para confirmar que o erro
  chega em `code`/`msg` e não noutro campo — foi assim que se apanhou o
  `message` do contrato da MEXC.
- Que campos traz o saldo (`balance`, `available`, `frozen`, `bonus`) e em que
  moeda, para decidir a `reportingCurrency` da ligação.
- Se as posições declaram P&L realizado por operação. Se declararem, o número da
  venue ganha e nada é derivado para esse símbolo.
- Se os símbolos se compõem de base + quote, ou se só se podem partir.

O ambiente de demonstração permite fazer isto sem pôr a conta real em risco.

### Situação regulatória, para decidires

A BloFin **não é autorizada ao abrigo do MiCA** e não consta do registo da ESMA.
O período de transição terminou a 1 de julho de 2026, e a partir daí só
prestadores registados podem servir clientes europeus. A BloFin continua a
aceitar utilizadores da UE como plataforma *offshore*, ou seja, fora desse
regime e não sob ele. Nenhum país da UE consta da sua lista de restrições; os
Estados Unidos, Canadá, Singapura e mais de quarenta países constam.

Isto não impede a ligação técnica — ao contrário da bybit.eu, que emite chaves
impossíveis de autenticar a partir da máquina do utilizador. É informação
factual porque o checklist exige verificar o estatuto regulatório de cada
corretora, e porque quem tem lá o dinheiro decide com ela.

### Onde o código toca

Acrescentar uma plataforma mexe em quatro sítios, e três em quatro é pior do que
nenhum — a plataforma aparece no formulário, é aceite e guardada, e só rebenta na
primeira sincronização com "No connector for platform". Faltar `NEEDS_SECRET` é
pior ainda: o segredo fica guardado sem cifra, em silêncio.

- `PLATFORM_LABELS` em `src/lib/connectors/constants.ts` — põe-na no seletor
- `PLATFORM_SETUP` no mesmo ficheiro — o que pede ao utilizador, os passos, os avisos e o `readsOnly`
- `NEEDS_SECRET` — decide se a credencial é cifrada
- o `switch` em `src/actions/connections.ts` — constrói o conector

`src/lib/connectors/__tests__/wiring.test.ts` falha se algum destes ficar por
fazer. No mobile, o conector tem de usar o transporte nativo injetado e a sua
allowlist exata, sem seguir redirecionamentos com cabeçalhos de autenticação.

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

### Página de cada ativo e ligações externas — implementado

Pedido do utilizador em 9 de setembro de 2026. **Implementado; esta entrada
esteve marcada como pendente até 10 de setembro e quase levou a reconstruir o
que já existia.** A página vive em `src/app/(app)/investments/asset/[symbol]`
e as ligações em `src/lib/portfolio/externalLinks.ts`, com testes ao lado.

Foi além do critério mínimo: cada tipo de ativo recebe o seu próprio conjunto
de serviços — TradingView, CoinGecko e CoinMarketCap para crypto; justETF e
Trackinsight para ETFs; Stock Analysis e OpenInsider para ações; DeFiLlama para
stablecoins e staking; Investing.com e Trading Economics para obrigações,
matérias-primas e índices. Continua em aberto apenas indicar outros serviços a
acrescentar.

O que segue era o pedido original, mantido como registo do critério.

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
