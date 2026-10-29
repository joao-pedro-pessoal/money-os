# Edição e recuperação de pedidos — 29/10/2026

Esta passagem verifica B68–B70 e alarga A04. O estado das tarefas permanece
apenas em [TAREFAS.md](../TAREFAS.md). Código local, sem publicação ou dados reais alterados.

## Problemas reproduzidos e implementação

Dos 26 testes iniciais, 24 falharam antes da correção: repetir uma edição antiga
podia repor o nome/meta de um objetivo, o limite de um orçamento ou uma afetação
anterior depois de uma alteração mais recente; uma libertação antiga podia
apagar uma nova reserva. As ações aceitavam pedidos sem identificador e sessão
não verificada explicitamente. A prioridade do objetivo era arredondada ou
convertida silenciosamente, e omitir o campo repunha-a em zero. A alteração de
limite do orçamento não era atómica com um registo descritivo de auditoria.

As três ações exigem agora uma tentativa UUID e sessão. O recibo duradouro
`manual_request` em `audit_log` integra a transação da alteração e da auditoria.
Usa os tipos distintos `bucket:edit`, `budget:limit` e `allocation:set`,
identifica o alvo e compara os dados normalizados pela impressão SHA256,
sem guardar outra cópia de descrições. Leituras/escritas respeitam a RLS.
Recibos não podem ser podados como logs comuns.

Repetir o mesmo pedido confirma a primeira gravação, sem nova alteração ou
auditoria; repetir depois de uma edição mais recente deixa essa edição intacta.
Dados, alvo, tipo ou pessoa diferentes para a mesma tentativa são recusados.
Objetivos/orçamentos são bloqueados antes da gravação; afetações mantêm o
bloqueio de conta e objetivo. Falha na auditoria desfaz também a alteração e
o recibo. As afetações continuam sem mexer em saldos ou transações.

A prioridade é um inteiro de 0 a 9999, de acordo com a coluna numeric(4,0).
Campo omitido ou vazio conserva a prioridade atual. Limites continuam a exigir
um valor positivo com até duas casas decimais; valores exatos de afetação
admitem zero para libertar e recusam negativos. Alterar um limite invalida
também a página inicial, que usa o orçamento para calcular reservas.

## Formulários

`EditForm`, baseado em `useActionState`, é usado na edição de objetivos,
no limite de orçamento e no total exato de afetação nas páginas do objetivo
e da conta. Conserva campos e seleções perante validação ou perda de ligação,
com `aria-busy`, estado pendente, erro e confirmação acessíveis.
Durante a gravação desativa os campos e o envio. Após sucesso confirmado,
os campos permanecem editáveis e Guardar fica bloqueado até uma alteração.
Essa alteração inicia uma tentativa nova; um clique repetido sem mudar dados
não reaplica a operação. O reset automático do formulário é impedido.

Após erro, o identificador mantém-se. Numa resposta perdida deve repetir-se
com os mesmos dados para confirmar a gravação antes de editar de novo.
O identificador vive apenas na página aberta: recarregar/fechar não conserva
uma fila offline nem um histórico local da tentativa. A proteção aplica-se
à repetição do mesmo pedido; não é controlo de versões de todas as edições
intencionais feitas em páginas antigas.

Os rótulos PT «Editar objetivo» e «Eliminar objetivo» substituem as traduções
incorretas com «intervalo» nesta página.
Os adaptadores devolvem mensagens esperadas de validação e excluem diagnósticos
internos da base. As novas mensagens foram revistas em PT/EN; os outros 13
catálogos usam fallback inglês. Revisão React: sem efeitos, dependências ou
estado pessoal global novos; dados no servidor, estado local limitado ao envio.

## Validação

- **3345 testes aprovados em 217 ficheiros**, 35 casos novos nesta passagem.
- Compilação de produção/TypeScript, lint dos ficheiros alterados e diff aprovados.
- PGlite em memória com migrações reais, papel sem BYPASSRLS e duas pessoas
  fictícias. Repetição, dados alterados, sessão expirada, recibo de outra pessoa,
  valores inválidos, prioridade omitida e falha de auditoria cobertos.
- **53 verificações no navegador**, computador EN 1440×950 e telemóvel PT
  390×844, sobre compilação de produção local. Pedidos externos bloqueados;
  base temporária em 127.0.0.1:54337 e servidor em 127.0.0.1:3017.
- Os quatro formulários passaram validação inline, falha antes de escrever,
  perda da resposta depois do POST/commit e repetição sem qualquer escrita extra.
  Todos os campos/seleções são comparados, assim como registos e auditoria.
- Uma segunda página guardou uma edição mais recente do objetivo antes de a
  primeira página repetir o pedido antigo: os novos valores ficaram intactos.
- Alterar um campo após sucesso reativa o botão e grava uma edição distinta.
  Inclui libertar uma afetação com zero; saldos e movimentos não se alteram.
- Sem overflow nas três páginas, erros de execução no navegador ou erros de
  servidor. Foram apenas corrigidos seletores do ensaio para abrir a vista
  «Manage account» e os painéis, sem forçar cliques em elementos ocultos.

Reprodução/evidência local ignorada pelo Git:
`.local-checkpoints/qr-e2e/edit-launch.mjs` e `edit-launch/`
(resultado, log e oito capturas). Usa dependências locais do ensaio anterior.
O PGlite serializa numa ligação; estes ensaios não medem carga com múltiplas
ligações. A emulação não comprova Android real. Sem alteração de esquema.
