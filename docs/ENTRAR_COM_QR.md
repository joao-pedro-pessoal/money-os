# Entrar com QR

No aparelho novo, abrir o mesmo endereço do Money OS usado no telemóvel.
Na entrada, escolher **Sign in with QR / Entrar com QR** e **Show new QR**.
Usar a câmara do telemóvel onde já existe uma sessão, abrir a ligação, conferir
a conta apresentada e escrever o número de seis dígitos mostrado no aparelho
novo. Carregar em **Approve sign-in / Aprovar entrada**. O aparelho novo entra
automaticamente e conserva o destino pedido antes da autenticação.

Se a ligação abrir num browser sem sessão, entrar nesse browser e voltar a ler
o QR. A sessão da app Android e a do Chrome podem ser diferentes. Este fluxo usa
a câmara normal do telemóvel; não acrescenta um leitor dentro da app Android.
Um endereço localhost do computador não é acessível pelo telemóvel; usar o
endereço do site ou o endereço de rede do PC, acessível nos dois aparelhos.

Nunca aprovar um QR enviado por outra pessoa. A aprovação dá ao aparelho novo
acesso à conta e aos dados. O pedido dura cinco minutos, aceita cinco tentativas
do número e serve uma vez. Cancelar ou gerar outro QR invalida o anterior no
mesmo browser. Sair da página sem cancelar deixa o pedido válido até expirar.

## Instalação técnica

A migração gerada `0066_flowery_vivisector.sql` cria apenas `qr_sign_ins`, uma
tabela temporária de autenticação. Aplicar pelo fluxo habitual `npm run db:migrate`
ao ambiente de destino antes de disponibilizar o código. Confirmar as permissões
do utilizador da app na nova tabela. A migração foi ensaiada numa base PGlite
isolada; não foi aplicada à base real nem houve publicação.

O QR é gerado localmente no browser, sem serviço externo. O URL leva apenas a
capacidade de aprovação, no fragmento, não uma sessão nem a capacidade de obter
uma sessão. Esta última fica num cookie HttpOnly separado, SameSite=Lax e Secure
quando COOKIE_SECURE=true. A base guarda hashes dos dois segredos. Aprovar exige
uma sessão válida consultada diretamente na base e o número mostrado no outro
aparelho. A obtenção da sessão elimina atomicamente o pedido aprovado.

A sessão nova conserva a data de emissão da sessão que aprovou para que uma
recuperação ou revogação concorrente também a invalide. Pedidos expirados são
limpos na criação seguinte. Há um limite global de 500 pedidos armazenados;
limites por origem no alojamento continuam parte da preparação pública em R01.

Verificação isolada: `npm test -- src/actions/__tests__/qr-sign-in.test.ts`.
O estado de entrega e a validação nos aparelhos estão no `TAREFAS.md`, F21.

Validação de 11/10/2026: 2903 testes aprovados entre a suite e a repetição de
um teste de leitura de ficheiros que excedeu cinco segundos sob carga; inclui
12 cenários PostgreSQL e duas renderizações PT/EN novos. TypeScript, build e
lint aprovados (apenas os três avisos Bybit já existentes). Auditoria npm das
dependências de produção sem vulnerabilidades conhecidas. A leitura física do
QR e a aprovação entre dois aparelhos continuam por confirmar.
