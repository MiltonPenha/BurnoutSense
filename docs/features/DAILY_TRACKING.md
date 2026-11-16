# Acompanhamento diário e atualização experimental do contexto

<a id="status-and-scientific-boundary"></a>

## Escopo

O RF/A é o regressor contextual privado da aplicação. Ele recebe 22 entradas
e estima o escore global ESB-eu. O adaptador `daily-window/1.experimental`
prepara o contexto a partir dos check-ins elegíveis. A concordância com uma
chamada direta ao RF/A verifica a integração de software. A validade
científica dessa adaptação, sua calibração e a compatibilidade com a população
e o período de referência do treinamento ainda precisam de avaliação.

O exemplo do backend deixa `DAILY_CONTEXT_EVOLUTION_ENABLED=false`. Para
desenvolvimento e demonstração do TCC, habilite a opção no `backend/.env` local
conforme o [guia de execução](../getting-started/DAILY_TRACKING_LOCAL_SETUP.md). O Gemini é
opcional e recebe o percentual do índice para gerar orientações gerais.
Respostas dos check-ins, notas e identificadores da conta ficam na aplicação.
[Integração Gemini](GEMINI_GUIDANCE.md)

<a id="product-flow"></a>

## Fluxo na aplicação

1. O estudante responde ao contexto inicial de 22 campos sobre as últimas quatro
   semanas. O RF/A já consegue calcular o primeiro índice.
2. O check-in em duas etapas coleta humor, horas e qualidade do sono, pressão
   de avaliações, dificuldade de conciliar estudos e descanso, apoio pessoal
   percebido e uma nota opcional.
3. O seletor aceita a data de hoje ou uma data anterior válida. O servidor
   rejeita dias futuros ou inexistentes. Cada conta tem um registro por dia.
   Ao reabrir uma data, a tela carrega o registro salvo para edição.
4. Salvar ou editar o check-in mais recente pela **data de referência** pode
   recalcular o índice se o adaptador estiver ativo e as entradas mudarem.
   Salvar uma data anterior retorna `historical` e atualiza o histórico.
   Esse registro pode participar do próximo cálculo ao salvar o dia mais recente.
5. O painel compara as medianas dos sete check-ins completos mais recentes com
   as dos sete anteriores. Os 14 dias distintos devem estar na janela de 28
   dias, e os sete mais recentes devem estar nos últimos 14 dias. Horas de sono
   são descritas separadamente. O destaque exige dois sinais ordinais mudando
   pelo menos um nível na mesma direção ou um sinal mudando pelo menos dois,
   sem sinal em direção oposta. O acesso à revisão fica no painel, sem modal.
6. A revisão guiada oferece quatro temas: estudos, trabalho, relações e hábitos
   e finanças. Eles cobrem 12 campos que não repetem as observações diárias.
   Após sete dias sem revisão completa ou guiada, o painel sugere um tema
   aplicável, priorizando o menos recentemente confirmado. Adiar oculta o
   convite por sete dias naquele navegador. A escolha manual continua
   disponível. O estudante confirma as mudanças, e o modelo recebe os 22 campos.
   A revisão tem origem `guided_review` e preserva o corte de evidências e a
   base confirmada separada, para evitar reaproveitar médias como respostas.

<a id="exact-transformation"></a>

## Transformação dos check-ins

- A janela vai de hoje menos 27 dias até hoje, inclusive, no fuso
  `DAILY_REMINDER_TIMEZONE` (padrão `America/Sao_Paulo`).
- A âncora é a avaliação confirmada mais recente da conta (`context` ou
  `guided_review`). Uma revisão guiada guarda separadamente a base confirmada.
- Só entram observações completas do formato atual, salvas ou editadas desde
  a última confirmação de contexto completo e dentro da janela. Uma nova
  revisão completa redefine o corte; a revisão guiada o preserva. Registros
  legados continuam no histórico, sem reaproveitar energia ou demanda genérica.
- `sleep_hours` é a média aritmética das horas registradas, arredondada a três
  casas decimais. Para `sleep_quality`, `assessment_pressure`,
  `study_rest_difficulty` e `personal_support`, calcula-se a média aritmética
  e arredonda-se ao inteiro permitido de 0 a 4, com metades para cima.
- Os 17 campos restantes vêm da base confirmada. Humor e notas ficam no
  histórico. Dias ausentes ficam fora da média, sem zeros, pesos ou dias
  fictícios. Um dia observado já pode mudar a entrada, com pouca evidência.
- Um registro retroativo pode acionar previsão quando é o mais recente pela
  data de referência. Registros fora da janela ficam só no histórico. Edições
  substituem a observação do dia.
- Ao excluir um check-in, a chave estrangeira em cascata remove os resultados
  em que ele foi o acionador (`triggerCheckInId`), sob bloqueio por conta.
  Resultados que apenas usaram o dia como evidência permanecem. O novo cálculo
  usa as observações restantes ou a base confirmada quando faltam observações.

O valor exibido em percentual corresponde à posição do escore na escala
0–4. Mudanças na previsão não demonstram efeito causal ou mudança clínica.

<a id="provenance-and-persistence"></a>

## Proveniência e persistência

A origem da avaliação distingue `context`, `guided_review` e
`daily_experimental`. Resultados derivados guardam as 22 entradas, a previsão,
a versão do modelo, o consentimento original, a versão do adaptador, a âncora,
as datas da janela, os IDs e revisões das evidências diárias, a quantidade de
dias observados, os métodos, os campos agregados e herdados, e a impressão
digital do contexto. Escores observados do questionário não são copiados para
uma avaliação derivada. Novos resultados também guardam a data de referência
e as datas de criação e revisão do check-in acionador, separadas da data do
cálculo. Origens legadas ficam como registradas. Recálculos sem acionador
registram atualização da janela ou exclusão como motivo.

O gráfico usa o último cálculo de cada data em São Paulo. As vistas semanal
(segunda a domingo, padrão) e mensal calculam a média dos dias disponíveis com
o mesmo peso por dia. Períodos sem avaliações aparecem como lacunas. A série
completa independe da paginação. Na vista diária, marcadores de check-ins usam
a data de referência, e pontos de índice usam a data do cálculo.

O salvamento diário ocorre antes da previsão. Em caso de falha da IA, o dia
continua salvo e o painel pode oferecer nova tentativa para o contexto pendente.
Um bloqueio por conta serializa os cálculos. O backend reconfere a âncora e as
evidências após a inferência para evitar publicar resultado desatualizado.

O dia mais recente guarda `indexProcessedRevision` mesmo se as entradas não
mudaram. A atualização dessa marca preserva `updatedAt`. Alterações somente
históricas não criam pendência, inclusive ao chamar a rota de nova tentativa.
Falhas do dia mais recente podem ser retomadas. A expiração de toda a
evidência e as exclusões também podem acionar recálculo, com motivos próprios.
A mudança de data por si só não libera alterações históricas pendentes.
Ao salvar o dia mais recente, vale a janela daquele momento.

## API

- `GET /daily-check-ins/overview` devolve data atual, dias recentes, contagem
  de dias distintos, início da janela, estado do adaptador e cálculo pendente.
- `GET /daily-check-ins/day/:date` devolve o registro da conta ou `null`.
- `PUT /daily-check-ins` recebe data, humor, `sleepHours`, `observations` com
  os quatro campos ordinais e nota opcional. `historical` indica salvamento sem
  novo cálculo.
- `PUT /daily-check-ins/today` atende clientes antigos. Observações legadas
  sem os campos atuais ficam fora do cálculo.
- `POST /daily-check-ins/recalculate` tenta recalcular sem salvar outro dia.
- `GET /daily-check-ins` pagina os registros da conta. `DELETE /daily-check-ins/:id`
  exclui o registro da conta e retorna o estado do recálculo com HTTP 200.
- `GET /esbeu-assessments/current` e `POST /esbeu-assessments/review` atendem
  à revisão do contexto com confirmação explícita e reutilização de
  consentimento válido já salvo.
- `POST /esbeu-assessments/guided-review` aplica campos permitidos do tema após
  confirmação, rejeita avaliação desatualizada e registra campos alterados e
  estimativa anterior.
- `GET /esbeu-assessments/review-topics` devolve temas e sugestão opcional.
- `GET /esbeu-assessments/trend` devolve a série da conta com datas de cálculo
  e dos check-ins vinculados, sem respostas ou notas.

<a id="deployment-and-verification"></a>

## Migrações e validação

As migrações `20261104010000_add_daily_check_ins`,
`20261104020000_add_daily_context_evolution` e
`20261110010000_add_guided_context_review` introduzem as estruturas de
acompanhamento. `20261110020000_allow_guided_context_source` amplia as origens,
e `20261110030000_link_check_in_predictions` vincula resultados acionados por
check-ins sem reconstruir origens antigas. `20261113010000_track_processed_check_in_revision`
adiciona a marca de revisão processada. A migração `20261110040000_track_daily_reminders`
inicia o controle de entregas, complementado pela migração de
[confiabilidade dos lembretes](DAILY_REMINDERS.md).

O [guia local](../getting-started/DAILY_TRACKING_LOCAL_SETUP.md) cobre geração do cliente Prisma,
migrações, inicialização e testes com contas fictícias. Os testes verificam
agregação por dias disponíveis, arredondamento ordinal, entradas iguais,
troca de evidências, consentimento, fuso, datas inválidas e futuras, isolamento
entre contas, edição retroativa, falha da IA, exclusão e responsividade.
A verificação integrada compara o valor persistido com inferência direta
usando o mesmo contexto e o pacote RF/A privado.
