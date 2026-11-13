# Convenções de interface

## Organização

- `frontend/app/globals.css`: tokens, fontes/base, resets e regras globais.
- `frontend/app/product.css`: paleta do produto e fundo fotográfico translúcido
  compartilhado pelas telas, com ajustes para os dois temas e para celular.
- `frontend/components/ui/primitives.css`: controles e primitivas compartilhadas.
- Componentes reutilizados mantêm seus próprios arquivos CSS ao lado do TSX.
- Cada página mantém o CSS da sua rota. Não colocar estilos de uma página
  específica no arquivo global.
- Ordem das camadas: `base`, `components`, `pages`. Manter regras novas
  de componentes e páginas nas camadas correspondentes.

## Cores e leitura

As ações principais usam `--action` e `--action-ink`, com verde-petróleo no
tema claro e menta no escuro. Links e foco têm tokens próprios para cada tema.
O anel da sidebar preenche proporcionalmente ao índice e usa as faixas de cor
da interface. A transição respeita `prefers-reduced-motion`. As cores têm função
visual e não definem categorias clínicas.

Base de leitura e campos: 16px. Instruções e controles compactos: 14-15px;
metadados curtos podem ser menores sem substituir o texto principal. Não reduzir
globalmente a fonte no celular. Não usar fontes proporcionais à largura da tela.
Validar overflow, quebra de linha, foco e temas, não apenas a captura desktop.

## Interações

- `AccessibleDialog` usa diálogo nativo, foco inicial, ciclo de Tab/Shift+Tab,
  Escape, bloqueio do fundo e restauração do acionador. Operações em andamento
  podem impedir o fechamento para não sugerir cancelamento incorreto.
- Diálogos nativos preexistentes reutilizam `trapDialogFocus`.
- O menu móvel fechado não participa da navegação por teclado. Aberto, comporta-se
  como diálogo. Redimensionar para desktop fecha esse menu.
- Abas: `aria-controls`, `aria-labelledby`, painel associado, entrada única por
  Tab e setas/Home/End. Selecionar uma preferência não substitui salvar.
- Erros: mensagem junto ao campo, associação por `aria-describedby`, estado
  `aria-invalid` e foco no primeiro problema. Nunca reproduzir respostas privadas
  em erros ou logs.
- `IndexHelp` oferece a explicação curta e opcional do percentual; a ajuda longa
  permanece no "Como funciona".
- O painel resume o último check-in ou mostra mudanças da rotina quando há
  registros suficientes. A ação de revisão abre a escolha de tema.
- Os ícones de humor são compartilhados entre o formulário de check-in e o
  histórico. Editar e excluir têm ícones e rótulos de texto.

## Estado e dados temporários

`BurnoutStoreProvider` compartilha perfil e registros entre sidebar e páginas.
Leituras simultâneas da mesma sessão são agrupadas; cache de memória por até
cinco segundos. Mutação, troca de autenticação e logout invalidam o cache.
Ele não é persistido no navegador nem compartilhado entre credenciais.

O contexto em preenchimento pode ser recuperado em `sessionStorage` por até
duas horas, separado por conta e avaliação de origem. Não salva senha, tokens
ou confirmações de consentimento. É removido ao concluir ou sair; o estudante
pode descartar o rascunho recuperado. Bloqueio de armazenamento não impede o
preenchimento em memória. Isso não substitui uma avaliação de privacidade.

## Verificação

Executar `npm run typecheck`, `npm run lint`, `npm run build` e os testes de
`frontend/tests/*.test.mjs`. Testes locais de navegador:

- `backend/test/verify-dashboard-flow.cjs`: regressão do acompanhamento diário.
- `backend/test/verify-guidance.cjs`: orientações reais e páginas nos dois temas.
- `backend/test/verify-ux-improvements.cjs`: contraste, foco, rascunhos, formulários,
  isolamento de contas e reutilização de consultas.

Usar apenas contas fictícias de desenvolvimento e limpar ao final. Conferir
320, 390, 768, 1024 e 1440px; complementar com zoom e leitor de tela reais.
Não declarar conformidade WCAG completa com base somente nesses testes.
