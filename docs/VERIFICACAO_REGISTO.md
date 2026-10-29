# Verificação do registo — 29/10/2026

Esta passagem implementa B61–B62. O estado e as prioridades permanecem apenas
em [TAREFAS.md](../TAREFAS.md). Não houve publicação nem alterações à base real.

## Implementação

O SDK oficial BotID 1.5.12 é inicializado antes da interação, através de
`instrumentation-client.ts`, com o percurso exato `/api/register`, método POST e
nível Basic. Um booleano público de compilação, derivado de `VERCEL=1`, controla
a inicialização. A cópia local não inicializa desafios do fornecedor.

`signUp` mantém validação estrita, convite, campo-armadilha e limite por origem.
No alojamento Vercel, a verificação BotID acontece antes de consultar contas,
calcular hashes ou criar o utilizador. Só aceita resultado humano explícito,
sem marca de bot, bot verificado ou bypass. Resposta incompleta, exceção do SDK,
falha de OIDC ou do serviço recusam o registo com mensagem genérica. A mesma
verificação aplica-se a chamadas diretas da ação; a rota HTTP não é uma forma
alternativa de a evitar. Não há bypass controlado pelo corpo/cabeçalhos do cliente.

Uma rota dedicada evita que o desafio intercepte as ações de entrada e de
recuperação, que continuam a funcionar com os seus limites anteriores. O
formulário envia a chave derivada no dispositivo, mantendo a palavra-passe
fora dos pedidos de registo. O resultado de recuperação e o cookie de sessão
continuam a ser produzidos pela implementação existente.

A rota exige Origin da mesma origem, rejeita Sec-Fetch-Site cross-site e aceita
apenas JSON. Como Route Handlers não herdam a proteção de origem das Server
Actions, essa validação é explícita. Usa o Host público e o protocolo do pedido,
sem confiar em X-Forwarded-Host. O ensaio revelou que request.url pode conter
hostname/porta internos do Next; a correção usa uma autoridade nova, sem
conservar a porta interna ao trocar apenas o hostname.

O corpo é limitado a 4096 bytes, incluindo pedidos em streaming sem tamanho
declarado; o excesso cancela a leitura. JSON inválido, tipos de conteúdo errados
e origem recusada não chegam à ação. As respostas usam Cache-Control: no-store.
Erros inesperados devolvem mensagem genérica e não diagnósticos da infraestrutura.

## Verificação

- Suite completa: **3263 testes aprovados em 217 ficheiros**, 44 novos.
- TypeScript e compilação de produção aprovados.
- Lint dos ficheiros de código/testes alterados sem erros nem avisos; diff limpo.
- Testes de BotID: resultado humano, bots, bots verificados, bypass, resultado
  incompleto, falhas do SDK, cópia local, convite, limite e campo-armadilha.
- Testes de rota: origem, Host interno/público, X-Forwarded-Host forjado,
  Content-Type, JSON inválido, corpo ausente/grande/em streaming, 429 e erro seguro.
- Testes do cliente: apenas o POST de registo é protegido, nível Basic e
  inicialização limitada a compilações do alojamento.
- Privacidade: novo parágrafo nos 15 idiomas, na mesma posição, explicando sinais
  técnicos e cookies de segurança. Data do texto atualizada. A descrição da
  ausência de perfis refere agora perfis publicitários, para não negar os sinais
  necessários à proteção. As três mensagens UI novas têm PT/EN e fallback inglês
  nos restantes 13 idiomas.
- Revisão React: sem novos efeitos ou estado pessoal global; inicialização do
  SDK antes da interação; campos preservados perante recusa; sem chave ou segredo
  de fornecedor enviado ao browser. O sinal público é apenas uma opção de build.

## Navegador com dados fictícios

Passaram **19 verificações**, usando uma compilação de produção local,
PostgreSQL embebido em memória com migrações reais, papel sem BYPASSRLS e
tráfego externo bloqueado. Computador EN a 1440×950 e emulação de telemóvel PT
a 390×844 completaram oito percursos cada:

1. Convite errado recusado, mantendo os campos.
2. Recusa simulada do fornecedor traduzida, com formulário preservado.
3. Pedido contém chave derivada e não contém a palavra-passe original.
4. Registo real local cria conta, categorias iniciais, sessão e código.
5. Confirmar que o código foi guardado continua para o destino solicitado.
6. Nova entrada com palavra-passe funciona.
7. Recuperação altera a palavra-passe, roda o código e inicia a sessão.
8. Privacidade mostra BotID sem overflow horizontal.

As três verificações adicionais confirmam origem alheia recusada sem criar conta,
GET com 405 e ausência de erros de execução no navegador. O servidor não registou
erros nesta passagem. Capturas do formulário de recusa e da privacidade foram
inspecionadas. O servidor e a base temporários foram encerrados no fim.

O erro do fornecedor no browser foi simulado na resposta HTTP; a recusa efetiva
da ação foi verificada com o SDK simulado nos testes de servidor. O caminho de
registo/entrada/recuperação usou o servidor real ligado apenas à base temporária.
Não foi exercido o classificador real do BotID nem comprovado OIDC na Vercel.
O teste de viewport/toque não comprova a WebView num Android físico.

Guião e evidência locais na pasta ignorada `.local-checkpoints/qr-e2e/`:
`registration-launch.mjs` e `registration-launch/{result.json,server.log,
desktop-en-refusal.png,phone-pt-refusal.png,desktop-en-privacy.png,phone-pt-privacy.png}`.

## Dependências e segurança

A auditoria detetou um aviso high do Zod anterior a 4.6.6. Atualizado para
**4.6.6** com alteração compatível, sem audit fix --force. Depois da alteração,
`npm audit --omit=dev` devolveu zero avisos. A instalação/auditoria completa
conserva quatro avisos moderate nas dependências de desenvolvimento. Não foi
demonstrada exploração na Money OS.

Fontes primárias consultadas:

- [BotID: instalação e verificação](https://vercel.com/docs/botid/get-started).
- [Comportamento local do BotID](https://vercel.com/docs/botid/local-development-behavior).
- [Aviso Zod GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

O utilizador confirmou nesta passagem que ainda não tem domínio nem serviço de
email. Nenhum fornecedor de envio foi provisionado, não se alterou a configuração
publicada e nenhum email foi enviado. A consulta de integrações pelo conector
devolveu 403; a alternativa CLI não tinha sessão, e foi encerrada sem autenticar.
Esta passagem não implementa nem afirma confirmação de email.
