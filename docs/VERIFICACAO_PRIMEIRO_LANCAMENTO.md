# Edição de lançamento sem investimentos — 30/10/2026

O estado das tarefas está em [TAREFAS.md](../TAREFAS.md), R08/R09. As instruções
estão em [PRIMEIRO_LANCAMENTO.md](PRIMEIRO_LANCAMENTO.md). Código local, sem
alterar a base, os segredos ou a configuração da Vercel/Google.

## Implementação e limites

`APP_EDITION=money` seleciona uma edição na compilação. Um valor público
derivado e injetado pelo Next é partilhado pelo servidor e browser; o cabeçalho
`X-MoneyOS-Edition` permite verificar o deployment. O modo completo é o padrão
da cópia de casa. Não há serviço de feature flags ou dependência nova.

A mesma regra filtra menus, pesquisa, abas e atalhos. O proxy recusa as páginas
adiadas e `/api/sync` com 404/no-store. Os relatórios impõem `money` no servidor,
mesmo perante um parâmetro `scope=investments`, incluindo o PDF. O dashboard,
a análise inicial e o guia usam uma experiência dedicada às finanças do dia a
dia; configurações do dashboard completo não utilizadas ficam ocultas.

42 ações de investimento/exportação de posições são recusadas antes de qualquer
acesso à base ou fornecedor externo, incluindo pedidos diretos de Server
Actions. Entradas de ações, páginas e payloads não dependem de esconder botões.
Alertas e widgets omitem investimentos; leituras necessárias aos totais antigos
continuam a usar os árbitros financeiros existentes. Não foram alterados
registos, definições de património, RLS ou migrações.

Contas novas oferecem bank/cash/other. A edição de uma conta antiga preserva o
tipo e os campos de significado/split escondidos, em vez de os repor. Ligações
de corretoras e importação de extratos de investimento não aparecem. O CSV
bancário bloqueia, nesta edição, ficheiros identificados como extratos de
corretora. O backup completo continua a guardar os registos anteriores;
o botão separado de exportação de posições não é oferecido.

No Android `store`, os cinco receivers de investimento e o serviço de linhas
de posições são desativados no manifesto; os quatro widgets de dinheiro ficam
ativos. `home` conserva o manifesto completo. Versão 0.9.0, código 11.

## Evidência

- **3376 testes em 219 ficheiros**: 31 casos novos; um deles comprova 42 ações
  recusadas sem tocar na base ou rede. Regras de edição/caminhos, menus/abas,
  configuração e verificações existentes do modo completo aprovadas.
- Compilações de produção das edições money/full, TypeScript, lint dirigido e
  diff aprovados. Revisão React: nenhuma dependência ou estado global pessoal
  novo, componentes de leitura no servidor e decisões de edição partilhadas.
- **52 verificações de navegador**, compilação money local, EN 1440×950 e PT
  390×844; Simple e Complex, menus/pesquisa, 14 páginas por idioma sem overflow,
  objetivo criado e confirmado, despesa real e alteração de saldo/widget.
- Base PGlite temporária com migrações reais, papel sem BYPASSRLS e duas pessoas
  fictícias; pedidos externos bloqueados. Sem acesso financeiro à produção.
- Património sintético de 1025 (conta 1000 e ativo antigo 25) passa a 1005 após
  despesa 20; os dados do ativo ficam iguais. O backup de cada pessoa inclui
  o seu ativo antigo e exclui o da outra.
- Pedidos diretos a páginas adiadas e ao sync recusados; manipulação do scope
  não habilita relatórios de investimento. CSV/PDF descarregados e JSON lido.
- Nenhum erro de execução no navegador ou servidor. O primeiro ensaio teve um
  seletor com uma tradução PT inexata no teste de download; corrigido o seletor
  e o tratamento de promessas do ensaio, sem alterar a exportação da app.
- `assembleStoreDebug lintStoreDebug` aprovado. Manifesto final inspecionado:
  investimentos/allocation/movers/dividends/open trades disabled; dashboard,
  net worth, where money is e cash flow mantidos. APK só para validação técnica.

Reprodução/evidência ignorada no Git em
`.local-checkpoints/qr-e2e/money-launch.mjs` e `money-launch/`. Capturas com
dados fictícios em `docs/play-store/money-v1/`. PGlite numa ligação não certifica
carga; emulação do browser não comprova WebView, widgets ou Android real.
O teste de compilação nativa não é um AAB final assinado nem aprovação da Play.

R01/R03/R04/R05/R06 continuam a identificar a validação real de alojamento,
backup do serviço, operação, hardware e acesso público. Não houve publicação,
criação de conta Google, compra ou pagamento nesta passagem.
