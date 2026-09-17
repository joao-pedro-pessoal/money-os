# Continuar a adaptação móvel do Money OS

> **Tarefas e estado atual:** [TAREFAS.md](TAREFAS.md) é a lista única do projeto.
> Passagem de trabalho histórica; não usar as afirmações antigas de estado como descrição da aplicação atual.

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

## Próximo trabalho

Consultar [TAREFAS.md](TAREFAS.md), em especial a direção atual e E11/E12.
Este ficheiro é uma passagem de trabalho histórica da app Expo, anterior à
escolha do site existente como experiência visual e à primeira app Android.
Os critérios técnicos de aceitação mantêm-se em `mobile/RELEASE.md`.

Não adicionar servidor de credenciais, telemetria, backup automático para uma cloud do Money OS ou permissões de negociação. Se precisar de modificar integrações, manter as regras de leitura e reusar os cálculos existentes.
