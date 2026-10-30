# Primeiro lançamento — site e Google Play

Direção escolhida pelo utilizador a 30/10/2026: preparar os dois canais em
paralelo, começando pelas finanças do dia a dia. O estado das tarefas está
apenas em [TAREFAS.md](../TAREFAS.md), R08/R09 e R01–R06.

## Produto desta versão

Contas e saldos manuais, receitas/despesas, transferências, poupanças,
orçamentos, objetivos, subscrições, valores esperados, análise de despesas,
relatórios de dinheiro em CSV/PDF e backup completo. O dashboard e o guia
apresentam esta experiência. Bibliotecas e projeções avançadas ficam também
fora desta primeira edição, para não expor atalhos a funcionalidades adiadas.

Investimentos, corretoras, trades, dividendos, pesquisa de ativos, nomes de
tickers e sincronização de corretoras ficam na edição completa. Nenhum registo
anterior é eliminado ou convertido. Os cálculos existentes continuam a contar
os dados anteriores; o dashboard explica a presença de ativos antigos e o
backup completo continua a incluí-los. Não somar outra vez os investimentos
às contas nem apresentar o património como se fosse todo dinheiro disponível.

A edição completa é também disponibilizada à conta original do dono,
identificada no servidor por `OWNER_USER_ID`, mesmo numa compilação money.
As outras contas continuam na edição reduzida. A decisão não pode ser mudada
por parâmetros ou preferências do cliente. O cabeçalho identifica a compilação,
enquanto menus e operações seguem a sessão. Na APK store os widgets de
investimento continuam desativados; o dono precisa da APK home para os usar.

## Configuração do site

Configurar `APP_EDITION=money` no ambiente Vercel destinado ao primeiro
lançamento **antes de compilar/publicar**. A variável é uma configuração pública
do produto, não um segredo. `next.config.ts` deriva o valor do browser a partir
dela; servidor e cliente usam a mesma edição da compilação. É necessário um
novo deployment para mudar de edição. Um valor diferente de `full`/`money`
impede compilar. Ausência ou `full` mantém a edição completa da cópia de casa.
O `.env` real não foi alterado por esta preparação.

A versão pode ser confirmada pelo cabeçalho HTTP `X-MoneyOS-Edition: money`.
Este cabeçalho identifica a compilação; não substitui autenticação nem valida
que as outras configurações de lançamento estejam prontas.

Para a primeira beta, seguir o acesso por convite de
[PREPARAR_TESTE_FECHADO.md](PREPARAR_TESTE_FECHADO.md). O comando
`npm.cmd run release:check -- --money` verifica também a seleção desta edição,
sem imprimir segredos, ligar à base ou alterar a configuração local/publicada.
O comando não comprova a configuração da Vercel.

Não é necessário comprar domínio: pode usar-se o endereço HTTPS da Vercel.
`OPERATOR_NAME` e `CONTACT_EMAIL` têm de ser dados reais confirmados para
publicação. Um email normal dedicado ao suporte serve; serviço de envio
automático e domínio próprio são decisões separadas. A recuperação existente
usa um código guardado pelo utilizador; esta versão não promete recuperação
por email. Confirmação de email ainda não foi implementada (R01).

## Preparação da Google Play

O utilizador confirmou que ainda não tem conta de programador. Deve criá-la
na [Play Console](https://play.google.com/console/signup) e completar a
verificação pedida pela Google. A inscrição tem um pagamento único de 25 USD,
feito diretamente à Google; não enviar documentos, dados de pagamento ou
palavras-passe pelo chat. Ver
[instruções oficiais](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).

Para uma conta pessoal nova, o acesso à produção exige pelo menos 12 testadores
inscritos continuamente durante 14 dias, seguido do pedido de acesso e revisão.
Preparar o site e a Play em paralelo não elimina estes passos. Ver
[requisitos oficiais](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

A versão Android preparada é **0.9.0, código 11**. O flavor `store` mantém os
widgets Dashboard, Net worth, Where money is e Cash flow e desativa os cinco de
investimentos/trades/dividendos no manifesto final. O flavor `home` mantém os
widgets completos. Não foi alterado o identificador da aplicação.

`assembleStoreDebug` produziu um APK de validação técnica; não é o AAB assinado
para a Play. Para criar a chave de envio e o AAB final, usar o procedimento
existente `CRIAR_APP_PLAY_STORE.cmd`, com a palavra-passe introduzida localmente.
O site reduzido tem de estar publicado antes de distribuir a app: o Android
abre o endereço publicado, e compilar um APK não atualiza esse site.

Textos e capturas com dados fictícios estão em
[play-store/money-v1/FICHA.md](play-store/money-v1/FICHA.md). A ficha desta fase
deve descrever gestão de finanças pessoais, sem acompanhamento de investimentos
ou ligações automáticas a corretoras. Os formulários da Play devem corresponder
à versão enviada e aos fornecedores efetivamente usados.

## Ordem da publicação

Confirmar configuração, contacto público e recuperação/backup do serviço (R04),
publicar o site reduzido com autorização e validar nele registo/BotID, entrada,
recuperação, duas contas isoladas e apagamento com dados fictícios. Em paralelo,
concluir a conta Google, assinatura, ficha e conta de demonstração, enviar para
teste e validar widgets, notificações e downloads num Android real (R05).

Esta preparação local não abriu registos, enviou convites, criou conta Google,
comprou domínio, fez pagamentos ou publicou código. Validação técnica em
[VERIFICACAO_PRIMEIRO_LANCAMENTO.md](VERIFICACAO_PRIMEIRO_LANCAMENTO.md).
