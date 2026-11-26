# Histórico registado e taxas de câmbio manuais

Revisão local de 25–26 de novembro de 2026, ramo `codex/google-login`.
O estado atual do trabalho permanece exclusivamente em `TAREFAS.md`.

## Significado dos valores

As fotografias de contas e posições não guardam a dívida separada de cada data.
A série mantém os montantes e as conversões anteriores, mas passa a chamar-se
«valor registado», com esse alcance explícito. O património líquido atual
continua a descontar a dívida atual pelo árbitro existente.

No cenário sintético usado na validação, a conta tem hoje 1000 EUR e uma dívida
separada de 250 EUR: o património líquido atual é 750 EUR. As fotografias guardam
800 EUR em 1 de outubro e 1200 EUR em 2 de outubro. O histórico termina em
1200 EUR e a variação entre os registos é +400 EUR. Não se aplica a dívida de
hoje retroativamente às fotografias nem se compara 750 com 800.

`src/lib/accounting/recordedHistory.ts` centraliza os textos partilhados com os
relatórios e usa `periodReturns` para o resumo, sem uma segunda fórmula de
variação. História ausente resulta em valores nulos; um único registo não
inventa uma variação. Zero registado mantém o significado de zero. Os nomes
internos antigos das séries mantêm-se por compatibilidade. As preferências de
painéis conservam as mesmas chaves.

Painel money/full, análise, estatísticas e tooltip do gráfico passam a identificar
o alcance da série. As variações incluem entradas, saídas e movimentos do
mercado; não são apresentadas como retorno de investimento. As estatísticas
mostram a data do último registo. As janelas e os cálculos existentes de
`periodReturns`/`drawdown` não foram alterados.

## API e widgets Android

`/api/widget` conserva `netWorth` como património líquido atual e a série
existente. Acrescenta `history`, com `basis: recorded-assets`, `latestValue`,
`change` e `latestDate`. O resumo segue os mesmos pontos entregues ao gráfico,
com o primeiro e o último preservados na redução da série. O objeto é opcional
no contrato de leitura para compatibilidade com clientes anteriores.
A variante da cache privada passa de `widget:v1` para `widget:v2`, mantendo RLS,
quota, sessão e duração de 15 segundos.

O widget principal mantém o património atual, identifica o alcance do gráfico
e mostra a data do gráfico separada da data da leitura. O antigo widget
«Net worth» passa a «Recorded value»: mostra o último valor da série e apenas
uma variação reconhecida pelo resumo do servidor. Com um servidor/cache antigo,
a ausência de resumo produz «Change unavailable». Sem série, o valor é «—».
O tile de património atual conserva o seu nome e cálculo.

Android `0.10.1`, `versionCode 14`: textos novos em inglês/português e fallback
inglês nos outros 13 idiomas. O aviso usa 12 sp; os widgets principal e de
histórico pedem pelo menos 160 dp de altura. A imagem antiga de pré-visualização
que dizia «Net worth» deixa de ser referenciada pelo widget de histórico.
Não se remove o ficheiro antigo nem se altera o protótipo `mobile/`.

Um APK anterior continua com os rótulos anteriores até ser atualizado; acrescentar
metadados no servidor não corrige a interface desses APKs. A compilação debug
não comprova o aspeto num launcher real, um AAB assinado nem instalação pela Play.

## Escrita de taxas manuais

`src/lib/fx/manual.ts` valida sem converter a taxa através de `Number`:

- código de três letras, normalizado para maiúsculas; não é uma lista completa
  de moedas ISO suportadas por fornecedores;
- EUR protegido como referência constante de valor 1;
- valor positivo, até dez algarismos antes e dez depois do separador decimal;
- ponto ou vírgula decimal, sem expoentes, agrupamentos, negativos ou especiais;
- intervalo representável de 0.0000000001 a 9999999999.9999999999, sem arredondar
  silenciosamente ao guardar em `numeric(20,10)`.

A ação direta `setManualRate` e o resultado tipado `submitManualRate` verificam
a sessão e partilham o orçamento `fx-manual`. Os tetos são 20/minuto e 120/hora
por pessoa, 60/minuto e 600/hora por ligação, uma execução por pessoa e oito
globais. O orçamento, os fingerprints e as reservas usam o mecanismo distribuído
já existente; não há nova tabela, prazo de conservação ou fornecedor. O aviso de
privacidade já cobre contadores de atualizações de câmbios e os seus prazos.

A atualização é um único upsert sob RLS, com a chave pessoa/moeda, preservando
o estado manual perante atualizações automáticas. Não faz pedidos a fornecedores.
O formulário bloqueia envios concorrentes, mostra estado de gravação e conserva
os campos após erro ou quota. Validação e limites têm respostas seguras EN/PT.
Uma resposta perdida manda recarregar para verificar a taxa atual; não promete
que uma gravação confirmada pela base foi desfeita. Revalidar a interface ou
libertar uma reserva não transforma uma escrita já concluída numa falha anunciada.

## Evidência local e alcance

A suite final passou 4141 testes em 263 ficheiros. TypeScript e lint de `src`
passaram. As compilações Next 16.4.6 com webpack de money e full passaram numa
cópia isolada, sem ficheiros de ambiente e com URLs PostgreSQL fictícios no
loopback. O aviso sobre múltiplos lockfiles refere-se à cópia descartável dentro
do worktree; a pasta `.next` original não foi usada. Inclui precisão/limites
decimais, quota partilhada entre RPCs, recusa
sem substituir a taxa anterior, sessão e isolamento de duas pessoas em PostgreSQL
PGlite com migrações reais e papel sem bypass de RLS. O handler de widgets foi
exercitado com os serviços financeiros reais e fetch externo proibido.

`android-shell/tests/run-cache-tests.cmd` recompilou home/store debug e passou
24 verificações de sessão/cache/respostas antigas. `lintStoreDebug --offline`
passou com zero erros e 43 avisos; não se apresenta o lint como isento de avisos.

O navegador usou componentes, ações e páginas reais com sessão sintética e base
PGlite descartável. Confirmou os 750 EUR atuais separados dos 1200 EUR históricos,
a variação +400 EUR e data de 2 de outubro em EN/PT; a consola do navegador não
registou erros. O servidor de desenvolvimento registou um erro de escrita num
stream durante a navegação entre idiomas; as páginas seguintes devolveram 200 e
os estados visíveis foram confirmados. Também houve avisos de dimensões do
gráfico durante transições de painéis fechados.
No formulário, confirmou recusa de EUR e precisão excessiva, gravação exata de
1.2345678901, quota com mensagens EN/PT, conservação dos campos e da taxa anterior.
A 390 px, o formulário não teve overflow horizontal; também foi revisto no desktop.
A apresentação de widgets num aparelho real não foi verificada neste ensaio.

Não se leu `.env`, não se usaram contas/dados reais e não houve push, publicação,
alterações na Vercel, ligação à base publicada ou migração persistente. As
verificações operacionais de lançamento e as restantes quotas mantêm o estado
registado em `TAREFAS.md`.
