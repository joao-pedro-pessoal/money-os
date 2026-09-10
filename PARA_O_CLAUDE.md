# Continuar a adaptação móvel do Money OS

Foi criada uma app React Native/Expo em `mobile/`, independente do servidor Next.js.
Base: commit 49680e8. Alterações: commit 9ec9f6d, branch local feat/mobile-local-vault.
O envio para o GitHub não foi possível sem autenticação. Nada foi publicado nas lojas.

## Objetivo do João
Dados financeiros e chaves no telemóvel de cada utilizador, ligações diretas de leitura às corretoras, sem servidor central de dados financeiros e sem conta Money OS obrigatória.

## Como integrar
Se o projeto já avançou entretanto, não substituir a pasta inteira pelo ZIP.
Usar `mobile-local-vault.patch` para aplicar as alterações numa branch e resolver eventuais conflitos preservando o trabalho novo. O patch inclui a app, testes, instruções e a exclusão de `mobile` no tsconfig da versão web.
Ler primeiro `mobile/AGENTS.md`, `mobile/README.md` e `mobile/RELEASE.md`.

## O que foi verificado
- 40 testes da app móvel passaram, incluindo persistência SQLite real, transferências, backups cifrados, importação, bloqueio e ciclo de credenciais.
- 457 testes dos conectores passaram com o adaptador de assinaturas móvel.
- TypeScript móvel sem erros; migrations sem diferenças.
- Prebuild nativo Android/iOS gerado com as regras de privacidade.
- Bundles Hermes Android/iOS exportados com sucesso.
- A versão web manteve os 2202 testes a passar, TypeScript sem erros, lint sem erros (3 avisos anteriores) e build com sucesso.

## Próximo trabalho necessário
Construir e instalar uma build nativa num Android e num iPhone. Não usar Expo Go: a app recusa SQLite sem SQLCipher.
Validar Keychain/Keystore, SQLCipher, biometria/código, bloqueio, seleção e partilha de ficheiros, restauro noutro dispositivo e as APIs reais de cada corretora.
Não afirmar que já foi testado em hardware ou que já há um APK/IPA: não foram produzidos binários assinados.
A app móvel ainda não contém todas as funcionalidades da versão web; os limites estão em `mobile/README.md`. O JSON de backup antigo da versão web não é aceite como backup móvel; pode importar histórico em CSV.

Não adicionar servidor de credenciais, telemetria, backup automático para uma cloud do Money OS ou permissões de negociação. Se precisar de modificar integrações, manter as regras de leitura e reusar os cálculos existentes.
