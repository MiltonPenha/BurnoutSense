# Convenções de interface

## Organização

- `frontend/app/globals.css`: tokens, fontes/base, resets e regras globais.
- `frontend/components/ui/primitives.css`: controles e primitivas compartilhadas.
- Componentes reutilizados mantêm seus próprios arquivos CSS ao lado do TSX.
- Cada página mantém o CSS da sua rota. Não colocar estilos de uma página
  específica no arquivo global.
- Ordem das camadas: `base`, `components`, `pages`. Evitar regras fora das
  camadas para contornar conflitos; corrigir a origem da sobreposição.

## Cores e leitura

O azul de marca `--primary` continua em `#60A5FA`; não é o fundo padrão de
botões com texto branco. As ações usam `--action: #2563EB`, hover `#1D4ED8`
e texto branco, com contraste superior a 4,5:1. Links e foco têm tokens próprios
para cada tema. Cores das faixas do indicador não definem categorias clínicas.

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
