# Criação e repetição de registos — 29/10/2026

Esta passagem verifica B63–B67 e alarga A04. O estado e as prioridades permanecem
apenas em [TAREFAS.md](../TAREFAS.md). Não houve publicação nem dados reais alterados.

## Problemas reproduzidos

Dos 32 testes iniciais, 31 falharam antes da correção: repetir criações fazia
novos objetivos, orçamentos e subscrições; repetir uma adição reservava o valor
outra vez, mesmo depois de a reserva ter sido alterada/libertada; criação de
objetivo e auditoria podiam ficar separadas. Valores inválidos da meta eram
aceites ou arredondados, e vírgula/vazio opcional não eram tratados coerentemente.

Mais 15 casos verificam mensagens de validação/sucesso, sessão expirada,
diagnósticos da base excluídos, edição do objetivo com rollback e normalização
de categorias/data opcional de orçamento. Os 47 casos novos passaram após correção.

O ensaio no navegador revelou ainda dois problemas de apresentação: criar o
primeiro orçamento mudava o valor inicial do painel e escondia a confirmação;
com vários objetivos, os controlos de prioridades alargavam a página do telemóvel
de 390 a 433 px e dificultavam abrir os painéis.

## Implementação

As criações e a adição ao objetivo exigem uma tentativa com UUID aleatório,
gerada no dispositivo pelo gerador já existente, compatível com HTTP da rede de
casa. O servidor confirma sessão, valida o formato e normaliza os valores.
O recibo `manual_request` é gravado em `audit_log` na mesma transação da operação.
O conteúdo do formulário é comparado pela sua impressão SHA256, para o recibo não
guardar outra cópia de descrições ou notas privadas.
O novo registo usa o identificador da tentativa; a criação é atómica com as
ligações de categorias e com a auditoria descritiva.

Um pedido repetido confirma a operação original sem nova linha ou auditoria.
Valores diferentes, outro tipo de registo ou recibo de outra pessoa são recusados.
As leituras de recibos e registos respeitam a RLS; não se escolhe o dono pelo
formulário. Apagar um registo não apaga o recibo nem autoriza recriá-lo com um
pedido antigo. Uma falha da transação desfaz também o recibo e permite repetir.
Estes recibos têm função de integridade e não podem ser podados como logs comuns.

Adições mantêm o bloqueio de conta/objetivo já existente. Uma tentativa antiga
não altera um total exato gravado depois, nem volta a criar uma reserva libertada.
Uma tentativa nova com o mesmo valor continua a ser uma adição distinta. Não se
movimenta dinheiro: saldos e transações ficam fora destas operações.

Criação e edição de objetivos partilham validação da meta: duas casas decimais,
vírgula aceite, vazio opcional desconhecido, zero explícito válido e valores
negativos/especiais recusados. A edição é atómica com a sua auditoria.
Mensagens têm contexto do objetivo/reserva, sem lhes chamar saldo de uma conta.

## Formulários e apresentação

`RetryableForm` usa `useActionState`, conserva campos, selects e checkboxes após
recusa ou falha de transporte e apresenta estado pendente, erro e sucesso com
`aria-busy`, `role=alert` e `role=status`. Desativa envio durante gravação e após
sucesso. «Criar outro registo» remonta o formulário e inicia uma tentativa nova.
Só erros esperados de validação são devolvidos; exceções da base recebem texto
genérico. O identificador vive na página aberta: não existe fila offline
persistente para recuperar a tentativa após fechar ou recarregar o browser.
Após confirmação incerta, conferir o registo antes de iniciar uma tentativa nova.

O painel de novo orçamento tem valor inicial estável e conserva a confirmação
após criar o primeiro. A largura original do formulário abrange também sucesso
e nova tentativa. As prioridades de objetivos só mudam abaixo de 768 px:
nome/percentagem ficam na primeira linha e o valor restante/controlos na seguinte,
com campo de largura própria e áreas de toque maiores. As três etiquetas PT
revistas nesta área referem objetivos e valor «por atingir».

Novas mensagens revistas em PT/EN; os restantes 13 catálogos mantêm fallback
inglês nas chaves novas. Revisão React: sem efeitos ou estado pessoal global
novos, ações no servidor, reset explícito e feedback acessível.

## Validação

- **3310 testes aprovados em 217 ficheiros**, com 47 casos novos.
- TypeScript e compilação de produção aprovados; lint dos ficheiros alterados
  sem erros ou avisos e diff sem erros de espaços.
- Base de testes PGlite em memória, migrações reais e papel sem BYPASSRLS.
- Rollback com gatilhos sintéticos; isolamento por pessoa; pedidos repetidos,
  simultâneos, alterados e antigos depois de apagar/libertar.
- A mesma suite confirma objetivos com 100 EUR + 125 USD = 200 EUR ou 250 USD,
  conservando moeda/valor das afetações, e aviso explícito para taxa em falta.

**41 verificações no navegador:** compilação de produção local em
127.0.0.1:3017, base exclusivamente temporária em 127.0.0.1:54337, duas pessoas
fictícias, pedidos externos bloqueados. Computador EN 1440×950 e telemóvel PT
390×844 completaram os quatro formulários.

Para cada formulário, o ensaio enviou realmente o POST, esperou pelo commit e
abortou a resposta. Confirmou campos/seleções/checkboxes preservados, repetição
com sucesso e igualdade de todos os registos, ligações, reservas e contagem de
auditoria antes/depois da repetição. O envio fica bloqueado no sucesso; começar
outra tentativa limpa/desbloqueia os campos. Uma segunda criação com dados iguais
e uma segunda adição de 10 levam deliberadamente a dois registos ou reserva de 20.

Validações de meta negativa e categoria em falta mantêm os campos e mensagens
traduzidas. Confirmados saldos intactos e zero movimentos criados. Objetivos,
orçamentos e subscrições sem overflow; painéis abertos por cliques normais,
sem forçar os cliques. Logs do servidor e erros de execução do navegador limpos.
Capturas de computador e telemóvel inspecionadas visualmente.

Guião e evidência na pasta ignorada `.local-checkpoints/qr-e2e/`:
`creation-launch.mjs` e `creation-launch/`, com `result.json`, `server.log` e oito
capturas de sucesso, uma por formulário/largura. Para repetir após compilar:

```cmd
cd /d C:\Users\joao2\Projects\money-os-f17
node node_modules\tsx\dist\cli.mjs .local-checkpoints\qr-e2e\creation-launch.mjs .local-checkpoints\qr-e2e\creation-launch
```

PGlite serializa numa ligação e não comprova carga com várias ligações. Emulação
de viewport/toque não comprova Android físico, WebView, widgets ou notificações.
Não se fizeram migrações, instalação de dependências, publicação ou ensaios na
base de produção nesta passagem.
