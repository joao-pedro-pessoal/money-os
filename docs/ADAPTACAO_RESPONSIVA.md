# Adaptação dos restantes ecrãs — 9 de setembro de 2026

O site existente foi adaptado para larguras móveis. A implementação usa as
mesmas páginas, ações, cálculos financeiros, cores e temas da versão de PC.

- Painéis lado a lado e grupos de campos passam para uma coluna no telemóvel.
  Os indicadores e painéis recuperam as colunas em larguras maiores.
- Todas as tabelas das páginas e componentes têm um contentor com deslocamento
  horizontal, acessível por teclado, preservando os cabeçalhos e todas as colunas.
- Campos usam texto de 16 px e altura mínima de 44 px no telemóvel. Botões,
  seletores por botão e ações de confirmação têm áreas de toque maiores.
- Separadores de páginas e preferências permitem deslocamento horizontal e
  identificam a página atual para tecnologias de apoio.
- Cabeçalhos dos detalhes de investimentos e objetivos acomodam nomes longos
  e ações. Preferências e formulários da biblioteca adaptam-se à largura.

Abrange Contas, Movimentos, Orçamentos, Objetivos, Subscrições, Entradas
previstas, Passivos, Juros, Investimentos e suas subpáginas, Posições,
Ligações, Biblioteca, Análise, Estatísticas, Mapa do dinheiro, Importação,
Preferências e Manual. Os componentes partilhados também beneficiam o dashboard.

## Verificação

- 2 202 testes existentes aprovados em 119 ficheiros.
- Build de produção e TypeScript aprovados.
- ESLint sem erros; permanecem os três avisos anteriores nos testes Bybit.
- 132 verificações de largura em 33 páginas, a 360, 390, 430 e 1280 px:
  sem transbordo horizontal da página e sem erros JavaScript.
- Verificação adicional do detalhe de investimento a 360, 390, 430, 640,
  768 e 1280 px; quatro variantes do formulário da biblioteca e todas as
  opções do formulário de tipo de ativo.
- Deslocamento da tabela por teclado, abertura da edição de um movimento,
  gravação de um objetivo pela Server Action e cancelamento da eliminação
  verificados no navegador.
- Auditoria financeira da base local DEMO sem invariantes quebradas.

Foi usado Edge automatizado com Playwright. A tentativa com Agent Browser
falhou por timeout do daemon. Capturas e resultados ficam em
`.local-checkpoints/verification-all/`. Os registos temporários criados para
testar investimentos, objetivos, subscrições e biblioteca foram removidos.
O checkpoint dos ficheiros adaptados inicialmente fica em
`.local-checkpoints/before-all-screens/`.

Esta é uma adaptação responsiva do site. Não implementa login Google/Apple,
sincronização, offline ou distribuição nativa. A verificação não equivale a
testes em telemóvel físico, Safari/iOS, integrações reais com corretoras ou
certificação de todos os fluxos financeiros. Alguns ecrãs foram verificados
com estado vazio; os estados preenchidos usaram apenas dados de demonstração.

Para abrir nesta instalação, executar `PREVIEW_LOCAL.cmd` na raiz do projeto.
