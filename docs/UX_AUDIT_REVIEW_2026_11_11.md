# Revisão de UX e integração Gemini - 11/11/2026

## Escopo e limites

Comparação da auditoria de 10/11/2026 com o workspace atual, leitura dos fluxos
de autenticação, contexto, check-in, histórico, perfil, ajuda e status. A auditoria
original avaliou commits anteriores e declarou não ter executado a interface;
portanto, suas observações não devem ser tratadas como defeitos reproduzidos em
todas as telas. Esta revisão acrescenta testes locais com contas fictícias.

As seções de prioridades abaixo registram o diagnóstico anterior às correções.
As propostas foram aprovadas e implementadas em 11/11/2026, conforme o resumo
de entrega ao final. O RF/A, o treinamento e as entradas do modelo foram preservados.

## O que já melhorou em relação ao recorte do PDF

- Gráfico compacto com períodos diário, semanal e mensal e tabela alternativa.
- Check-ins com referência e datas de cadastro/atualização distintas no histórico.
- Coluna complementar removida da tabela principal, conforme decisão do produto.
- Seletores de mês/ano próprios, em português e operáveis por teclado.
- Feedback de rotina na dashboard, sem modal que interrompa o estudante.
- Escolha de temas de revisão centralizada, com cartões e ações responsivas.
- Dicas e recomendações reais em duas caixas; carregamento, falha e tentativa
  novamente; indicação de que são sugestões de IA, não diagnóstico.
- Abas do histórico com relacionamento entre abas/painéis e teclado. O problema
  equivalente no perfil ainda deve ser tratado separadamente.

## Prioridades propostas

### 1. Contraste dos controles - alta

`globals.css` define o destaque `#60A5FA`; `primitives.css` aplica esse fundo em
`.button`. Branco sobre esse azul tem contraste de aproximadamente 2,54:1;
`#F9FAFB` tem 2,43:1 e `#374151`, 4,05:1. Os três ficam abaixo de 4,5:1 para
texto comum. Os estilos de links, botões e temas também produzem diferenças
entre telas; não é suficiente avaliar uma única captura.

Proposta: preservar o azul da marca e criar um token específico de ação com
texto/fundo contrastantes. Conferir foco, hover e estados nos dois temas.
Aceite: medições dos pares realmente renderizados, incluindo login/cadastro,
avanço do check-in e botão de novo registro.

### 2. Modais e menu móvel - alta

Os diálogos de excluir conta e remover foto no perfil são `div role="dialog"`;
a atribuição de ARIA, sozinha, não move nem prende o foco. O menu móvel fecha
com Escape e bloqueia rolagem, mas seu painel fechado permanece no DOM com
transformação visual, sem `inert`. Revisar também o retorno ao acionador.

Proposta: aproveitar o padrão de diálogo nativo já usado no calendário ou um
componente compartilhado com foco inicial, ciclo de Tab, Escape e restauração.
No menu fechado, tornar a navegação efetivamente inativa; no aberto, impedir
foco/interação no conteúdo ao fundo. Não alterar fluxos de exclusão ou dados.

Reprodução no navegador: o modal de excluir conta abriu com foco fora dele e
continuou visível após Escape. Em 390px, Tab alcançou links do menu fechado.
Esses comportamentos foram confirmados sem excluir dados de uma conta real.

### 3. Abas do perfil - média

O perfil tem `role="tab"` e `aria-selected`, mas faltam o relacionamento
`aria-controls`/painel, entrada única por Tab e movimentação por setas.

Proposta: aplicar o padrão já utilizado no histórico, com painéis identificados,
Home/End e foco visível. Preservar o comportamento de salvar preferências.

### 4. Erros e continuidade dos formulários - média

Login usa mensagem visual sem anúncio explícito por `role="alert"`; contexto
e check-in anunciam um erro geral, mas não marcam o campo específico como
inválido nem vinculam a mensagem à resposta. O contexto mantém respostas na
memória do componente, não um rascunho recuperável após recarregar.

Proposta: erros curtos ao lado da pergunta, `aria-invalid`, `aria-describedby`
e foco no primeiro problema. Avaliar rascunho com expiração e isolamento por
conta/sessão, sem salvar indiscriminadamente respostas sensíveis no navegador.
Testar especialmente zero, vírgula decimal, campo vazio e troca de data.

### 5. Leitura e densidade no celular - média

O corpo usa 14px e cai globalmente para 13px no celular. Instruções, datas e
metadados frequentemente usam 11-13px. As telas cabem, mas isso não prova
conforto de leitura, sobretudo com baixa visão ou maior ampliação.

Proposta: testar 16px em campos e textos principais, mantendo metadados
secundários menores quando adequados. Reduzir pesos excessivos e separar
melhor pergunta, instrução e resposta sem aumentar títulos de todos os cartões.
Aceite: leitura e formulários com zoom de 200%, além de 320/390/768/1024/1440px.

### 6. Significado do índice sem sobrecarga - média

A ajuda já informa que o percentual não é chance de burnout. A sidebar e os
detalhes, porém, mostram principalmente o número. As faixas verde/amarela/vermelha
podem sugerir uma classificação clínica, embora os cortes visuais não tenham
sido estabelecidos como limiares clínicos do RF/A.

Proposta: ajuda opcional curta junto ao indicador, como "Entenda este número",
informando que ele representa uma posição na escala, não diagnóstico ou
probabilidade. Manter explicações extensas no "Como funciona". Não mudar
cálculo, treinar monotonicidade artificial nem impor variações ao percentual.

O gráfico já tem tabela acessível e dados por período. Como refinamento futuro,
avaliar foco nos pontos e leitura do valor sem depender do hover, sem aumentar
novamente sua área na dashboard.

### 7. CSS e carregamentos repetidos - média

Há declarações repetidas de `.page`, `.button`, `.card` e `.sidebar` em estilos
compartilhados e regras globais fora das camadas. Isso explica diferenças como
fontes de controles herdadas inesperadamente. Os hooks de carregamento também
são instanciados em mais de uma sidebar e em páginas da mesma navegação.

No teste intensivo de várias rotas, consultas repetidas chegaram a produzir
indisponibilidade de carregamento compatível com o limite de requisições.
Uma varredura automatizada é mais intensa que o uso habitual: confirmar a
frequência no uso manual antes de mudar limites de proteção.

Proposta: centralizar tokens e regras base sem mover estilos específicos para
`globals.css`; manter estilos de página/componente separados. Compartilhar
estado/carregamento por sessão, deduplicar consultas e oferecer recuperação de
falha. Não resolver apenas aumentando o limite global de requisições.

### 8. Transparência e avaliação das orientações - antes de uso real

O texto do perfil foi corrigido para informar o envio do percentual ao Gemini.
Isso não equivale a uma validação jurídica de LGPD nem torna um indicador de
saúde irrelevante para privacidade por estar sem identificadores diretos.

Antes de disponibilizar a estudantes reais, revisar base legal, comunicação,
contratos/condições do fornecedor, retenção, controles de acesso e avaliação
humana do conteúdo gerado. Sugestões condicionadas apenas ao índice não podem
explicar quais fatores da rotina individual causaram o resultado.

## Validação e evidências

- Gemini real aceitou a nova chave e gerou orientações para índices fictícios
  de 20%, 50% e 80%, com 2/2/3 itens por lista; cache confirmado.
- Testes unitários do backend: 82 passaram, incluindo 17 da nova integração.
- Testes unitários do frontend: 21 passaram; build e checagem de tipos passaram.
- `backend/test/verify-dashboard-flow.cjs`: fluxo diário, datas, exclusão,
  navegação, temas e calendário; somente contas fictícias, removidas ao final.
- `backend/test/verify-guidance.cjs`: teste real opt-in de autenticação,
  propriedade dos registros, geração, cache, exibição, estados de falha e
  capturas dos principais fluxos em 390px/1440px nos dois temas. Também verifica
  a dashboard em 320px/768px/1024px.
- Evidências locais ficam em `.run-logs/ux-audit/`, ignoradas pelo Git.
- A revisão prática de orientações terminou com 34 verificações e 24 capturas.
  O botão de novo registro no tema escuro apresentou texto `#F9FAFB` sobre
  `#60A5FA` (aproximadamente 2,43:1). As quatro abas do perfil estavam sem
  `id`/`aria-controls`, todas com `tabIndex=0`.

Não foi atribuída nota de conformidade. Ainda é necessária validação manual
com leitor de tela, zoom e usuários representativos. A revisão não certifica
acessibilidade completa nem validade clínica.

## Ordem recomendada para aprovação

1. Contraste e teclado: modais, menu e abas.
2. Erros por campo e leitura móvel.
3. Ajuda curta do índice e clareza do fluxo.
4. Consolidação gradual do CSS e das consultas, com regressão visual.

Preservar a identidade visual atual e aplicar mudanças pequenas e verificáveis.
Não é necessário recomeçar a interface.

## Entrega após aprovação - 11/11/2026

1. Contraste: tokens separados para marca, ações, links, foco e gráfico. Botões
   principais usam azul com texto branco acima de 4,5:1 nos dois temas.
2. Modais/menu: diálogo nativo compartilhado, foco inicial e retido, Escape,
   retorno ao acionador e menu fechado excluído do percurso de Tab.
3. Perfil: abas com painéis associados e setas/Home/End, sem antecipar o
   salvamento de tema ou notificações.
4. Formulários: erros por pergunta, anúncio e foco, entrada decimal com vírgula
   e zero preservado. Contexto recuperável por sessão/conta, com expiração de
   duas horas e limpeza após envio/logout, sem restaurar consentimento.
5. Leitura: base e campos de 16px, instruções maiores e menor dependência de
   pesos excessivos. Sem redução global da fonte no celular.
6. Índice: explicação curta e opcional na sidebar e nos detalhes. Não foi
   adicionada uma seção científica permanente à dashboard.
7. Manutenção: CSS base/primitivas/sidebar consolidado, estado compartilhado
   por provider, cache curto de leituras e invalidação após mutações.

O teste de aceite específico concluiu 70 verificações. Em cinco navegações
internas por links, não houve novas chamadas de perfil/lista compartilhada.
O fluxo completo ainda enviou exatamente 22 campos ao modelo. Os testes usam
somente contas fictícias, removidas ao final. Consulte [as convenções de
interface](DESIGN.md) para manutenção e critérios de regressão.

A varredura posterior das seis telas nos dois temas passou em 37 verificações
e gerou 24 capturas. Confirmou botões brancos sobre `#2563EB`, quatro abas
associadas a painéis, foco inicial dentro do modal, Escape funcionando e menu
fechado fora do teclado. Os 28 testes unitários do frontend passaram; lint,
checagem de tipos e build de produção também passaram.

## Referências

- Documento fornecido: BurnoutSense_Auditoria_Design_UX_10-11-2026.pdf,
  sete páginas, diagnóstico estático referente a commits anteriores.
- [WCAG 2.2: contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [WAI-ARIA APG: abas](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
- [WAI-ARIA APG: diálogos modais](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- [Gemini: geração de conteúdo](https://ai.google.dev/api/generate-content).
- [Configuração da integração](GEMINI_GUIDANCE.md).
