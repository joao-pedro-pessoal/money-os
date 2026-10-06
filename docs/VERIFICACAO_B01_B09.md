# Verificação das correções B01–B09

6 de outubro de 2026. Trabalho local em `f17-relatorios`, exclusivamente em
`C:\Users\joao2\Projects\money-os-f17`. Sem push, publicação ou junção ao `main`.
O estado das tarefas está em [TAREFAS.md](../TAREFAS.md).

## Alterações

- A página continua declarada em inglês. Escolher Português permite a tradução
  automática do conteúdo por traduzir. Menus, entrada, registo rápido, Definições
  gerais e No telemóvel declaram a língua escolhida e recusam tradução automática.
  Categorias, câmbios e dados, ainda em inglês, não herdam essa recusa.
- Nomes e descrições dos registos, opções de contas/categorias, símbolos,
  playlists e valores têm marcação própria para não serem traduzidos. Os
  componentes monetários partilhados protegem também os valores escondidos.
  Estas alterações de apresentação não mudam fontes, moedas nem cálculos.
- A instalação distingue HTTP inseguro e Firefox no computador. O primeiro
  aponta para o site publicado; o segundo sugere Chrome/Edge. Não apresenta
  um botão de instalação que não pode funcionar nesses casos.
- O login preserva o destino do atalho, validado tanto na entrada como no
  cliente. Inclui proteção contra normalização de caminhos para `//`.
- A preferência provisória de língua é libertada após confirmação do servidor;
  alterações noutra aba provocam atualização do conteúdo do servidor.
- As validações do registo rápido têm traduções; as listas reais da navegação
  alimentam os testes de cobertura das traduções.
- O CSV inclui a razão de retenção da variação além dos depósitos. Não transforma
  um valor indisponível em zero.

## Verificações automáticas

- `npm test`: **2811 testes aprovados**, em 171 ficheiros (22 testes adicionais).
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado, incluindo a verificação de tipos.
- `npm run lint -- src`: apenas os três avisos antigos dos testes Bybit após
  correção de uma regra de estilo no novo teste de renderização, revalidado à parte.
- `npm run db:generate`: **No schema changes, nothing to migrate**.
- `npm run audit`, com `AS_USER` restrito à conta temporária: **No invariant broken**.

Os novos testes cobrem destinos de login válidos e maliciosos, reconciliação da
língua, atributos de tradução e língua no HTML renderizado, validações reais do
registo rápido, rotas de instalação e explicação do valor em falta no CSV. O teste
das traduções percorre os dados usados pelos próprios menus e abas.

## Navegador e dados de teste

Servidor de produção local desta pasta na porta 3001. Verificado com uma conta
temporária criada pela página de entrada e dados fictícios inseridos apenas sob
o seu `asUser`:

- Sem sessão, `/?quick=expense` chega ao login com o destino preservado.
- Após criar a conta e continuar, abre o registo rápido. Confirmado também ao
  entrar novamente com email e palavra-passe, em português.
- Alterar a língua numa segunda aba atualiza menus e Definições na primeira.
- Um valor negativo no registo rápido devolve a mensagem em português.
- Página de movimentos a 390 px: conteúdo e estilos visíveis, sem overflow
  horizontal ou erros de JavaScript. Documento com `lang="en"` e tradução
  permitida, apesar da preferência portuguesa. Entrada vista também em desktop.

A conta temporária foi apagada em `asUser`, depois de conferir o email e o ID
guardado durante a preparação. Confirmados **zero registos** com esse ID em todas
as tabelas com `user_id`. Não foram consultados nem alterados os dados do `owner`
ou de outras pessoas.

Não foi feita tradução automática num telemóvel físico, instalação real ou teste
num Firefox real. A decisão para HTTP/Firefox está coberta por testes; tentativas
adicionais de navegação pelo endereço de rede não deram uma verificação conclusiva.
A ferramenta de navegador perdeu sessões durante algumas tentativas; só os
percursos concluídos acima são apresentados como verificados.
