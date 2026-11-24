# Login Google — implementação local

O Money OS mantém as suas contas, sessões e dados. Google comprova a identidade;
não recebe registos financeiros. Funcionalidade desligada por omissão.

## Contrato de autenticação

- `POST /api/auth/google/start`: mesma origem, corpo JSON limitado; inicia login,
  associação autenticada ou confirmação de uma operação. Em Android exige desafio
  de uma prova aleatória que permanece na camada nativa.
- `GET /api/auth/google/callback`: retorno OIDC web com state, PKCE e nonce;
  vinculado ao cookie HttpOnly do navegador iniciador.
- `POST /api/auth/google/native`: consulta o desafio ou valida o ID token nativo;
  exige o cookie iniciador e a prova nativa. Nunca devolve uma sessão.
- `POST /api/auth/google/complete`: consome a tentativa validada, uma vez, no
  navegador/WebView iniciador; em Android exige também a prova nativa.
- `POST /api/register/google`: cria uma conta apenas depois de Google validado,
  com BotID, convite e capacidade global partilhados com o registo próprio.

Identidades são únicas por emissor/sub; emails iguais nunca associam contas.
Tentativas duram cinco minutos; provas verificadas duram sessenta segundos.
Operações pendentes não sobrevivem à revogação ou alteração das credenciais.
Após a entrega inicial, um rascunho exclusivo de registo pode durar até ao fim
dos cinco minutos originais, para ler os termos; já não serve para emitir login.

## Arquitetura e dados

`auth_identities` associa `users.id` a `issuer`/`subject`, com uma identidade Google
por conta. Guarda o email apresentado pelo fornecedor, sem mudar automaticamente
o email Money OS: esse email participa na derivação da palavra-passe existente.
Não se guardam tokens Google para utilização futura, nem se pede acesso offline.

`google_auth_requests` guarda capacidades derivadas, nonce, finalidade, validade
e eventual conta iniciadora. O segredo do navegador é HttpOnly; a prova Android
permanece nativa. PKCE web deriva do segredo temporário e de APP_SECRET, sem
guardar o verifier em claro. O registo tem teto global de 500 pedidos pendentes,
limpeza de expirados e limites por ligação. São metadados de autenticação
anteriores ao login, exceções explícitas à RLS financeira como users/QR.

O cookie temporário Android usa SameSite=None/Secure para suportar o POST nativo
da WebView sem iniciador web; só é aceite com a prova nativa independente. O
cookie de sessão Money OS mantém HttpOnly/Secure/SameSite=Lax. Origin ausente ou
opaco é admitido exclusivamente nos handlers nativos protegidos por capacidades;
origens de outros sites e Sec-Fetch-Site cross-site são recusados.

`users.auth_version` e `sessions_not_before` impedem a conclusão de operações
autorizadas antes de uma recuperação ou alteração de métodos. A recuperação
define uma palavra-passe, roda o código, revoga sessões e suspende Google.
O dono nunca toma nem apaga uma conta existente por colisão de email.

A migração **0074_bent_archangel** foi gerada pelo Drizzle: SQL, snapshot e journal.
Não foi aplicada a nenhuma base persistente. O código pressupõe a migração mesmo
com Google desligado, porque o modelo users passa a incluir auth_version.
Identidades e pedidos de autenticação não pertencem ao backup/restauro individual
de registos financeiros; a eliminação da conta apaga-os por cascade.

## Configuração a preparar, sem ativar nesta sessão

| Nome | Tipo | Utilização |
| --- | --- | --- |
| GOOGLE_LOGIN_ENABLED | público/configuração | `false` por omissão; só `true` ativa |
| GOOGLE_AUTH_ORIGIN | público | origem canónica exata, sem barra final; HTTPS, ou HTTP localhost exclusivamente em testes locais |
| GOOGLE_CLIENT_ID | público | cliente OAuth web e audiência do backend |
| GOOGLE_CLIENT_SECRET | **segredo do servidor** | troca do código web; nunca NEXT_PUBLIC, APK ou Git |
| GOOGLE_ANDROID_CLIENT_IDS | públicos | lista separada por vírgulas dos clientes Android autorizados |

O segredo existente APP_SECRET continua obrigatório e assina as sessões Money OS.
Nenhum valor real foi criado, copiado para ficheiros ou alterado nesta implementação.

No Google Auth Platform, preparar projetos distintos de teste e produção, público
External, contactos, marca, homepage, privacidade e termos. O percurso web pede
somente `openid email`, com callback exato `GOOGLE_AUTH_ORIGIN` seguido de
`/api/auth/google/callback`. Não é necessário ativar Gmail, Drive ou Firebase Auth.
Verificar a propriedade do domínio e os requisitos de marca antes da abertura.

Para Android, registar **com.joaonovais.moneyos.site**, com SHA-1 do certificado
correto por build: debug para ensaios e certificado **Play App Signing** para a
instalação pela Play, que pode diferir do certificado de upload. O client ID web
chega à app pelo pedido autenticado de configuração; nenhum secret vai no APK.
Esta implementação usa Credential Manager, sem App Links nem OAuth na WebView.

Os novos pedidos de criação usam `/api/register/google`, incluído na proteção
BotID Basic cliente/servidor. A prova Google por si só nunca cria uma conta.
Convites, capacidade e bloqueio transacional final são partilhados com password.
Não se deve retirar BotID para fazer um cliente nativo registar-se diretamente:
a confirmação de registo pertence à página Money OS na WebView.

## Experiência e operações sensíveis

- Contas existentes associam Google nas Definições, depois da palavra-passe atual.
- Para contas só Google, as Definições permitem confirmar Google para renovar o
  código, definir uma palavra-passe ou apagar a conta. Cada confirmação serve uma
  finalidade e é consumida uma vez. Definir password permite depois desassociar.
- Um token novo prova a identidade Google para a operação; **não comprova** que a
  palavra-passe Google foi novamente introduzida. Não se promete reautenticação
  forçada do Google nem se trata o seletor de contas como tal.
- Logout explícito também cancela a tentativa Google pendente desse navegador.
- Android 0.10.0 / versionCode 13 usa uma ponte limitada à origem HTTPS e ao
  frame principal. O token fica entre SDK nativo e backend. A WebView recebe só
  a sessão Money OS por Set-Cookie após consumo da prova.
- Widgets/notificações são limpos quando a identidade local muda; o logout
  comunica clearCredentialState ao Credential Manager. Isso não termina a conta
  Google do aparelho nem revoga globalmente as permissões Google.
- Textos novos revistos em inglês/português, as línguas do lançamento. Na edição
  completa, línguas adicionais mostram as novas divulgações legais em inglês até
  revisão, preservando a tradução das secções anteriores.

## Evidência local e limites

Os testes usam dados fictícios, migrações reais em PostgreSQL em memória e um
servidor OIDC/JWKS em localhost. Exercitam assinatura, emissor, audiência,
validade, nonce, state, PKCE, isolamento de tentativas, consumo concorrente,
revogação, colisões de email, associação, recuperação, eliminação e controlos de
registo. Não foi obtido nenhum token de uma conta Google real.

Verificações de 24/11/2026:

- Suite completa: **3933 testes aprovados em 247 ficheiros**; depois, 58 casos da
  suite Google específica (incluindo o novo rascunho) e dois testes de interface
  para os controlos de recuperação de contas só Google também aprovados.
- TypeScript sem erros; lint src sem erros após corrigir uma declaração const.
- Compilação de produção money/webpack aprovada numa cópia isolada sem .env,
  com DATABASE_URL fictício em 127.0.0.1:9. O .next original não foi substituído.
- Segundo db:generate: **No schema changes**. Auditoria npm de produção: **0
  vulnerabilidades reportadas** nesta data; não é uma auditoria de segurança da app.
- assembleHomeDebug/assembleStoreDebug e lintHomeDebug/lintStoreDebug aprovados.
  Guarda de sessão: 10 casos de geração/cookie; 7 casos existentes de cache/sessão
  aprovados em cada flavor. Respostas antigas não podem repor cookies, valores
  de widgets ou notificações depois de uma mudança de conta.
- Navegador local: botão Google, recusa genérica sem diagnóstico privado,
  tradução EN/PT e registo próprio com convite preservado. Desktop e viewport
  de 390 px verificados, sem deslocamento horizontal; sem erros JavaScript.
  A recusa foi provocada pelo destino de base fictício, antes de contactar Google.

O build/lint Android `store` foi aprovado; isto é um APK de teste, não um AAB final
assinado nem uma instalação pela Play. Faltam as validações reais descritas em
R05/F29 no TAREFAS: configuração Cloud, BotID no alojamento, duas contas Google,
aparelhos reais e Play App Signing. As pendências de segurança/serviço continuam
em R10/R03/R04, sem serem encerradas por este trabalho.

Referências: [OIDC Google](https://developers.google.com/identity/openid-connect/openid-connect),
[Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation),
[limites de reautenticação](https://developers.google.com/identity/siwg/security-bundle).
