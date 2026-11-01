# BurnoutSense — protocolo científico exploratório v2

## 1. Identificação, congelamento e limites

Especificação documental v2.0, registrada em 2026-11-01, antes de qualquer
execução v2 com participantes autorizada nesta sequência de trabalho.
Branch: `feature/ml-optimization-v2`. Implementação de referência:
`fa787bb87f2b70321c2114bd79295526052fdae2`, incluindo a infraestrutura
`38e88ca05ed9560efc6e4738c08f54eebad1ca4d`. Base v1:
`e89f5eee19f4edb0e4ec72ef20061f0db7cf5321`.

Este documento congela as escolhas abaixo para revisão humana e futura execução.
Não constitui pré-registro externo, validação científica, comprovação de
consentimento ou autorização institucional. Não relata resultados v2 reais.
Uma alteração de conjuntos, grade, critérios, população ou partições exige nova
versão justificada antes de examinar resultados dessa alteração. Mudanças após
observar resultados devem ser identificadas como novas análises exploratórias,
preservando esta especificação e os resultados anteriores.

O responsável informou historicamente **39 respostas totais e 36 válidas** na
avaliação v1. Essas contagens não foram verificadas nesta tarefa. Não se presume
que as três restantes sejam todas inelegíveis ou todas inválidas. Nenhum arquivo
de participantes foi aberto, importado ou processado para elaborar o protocolo.

Fontes técnicas inspecionadas, relativas à raiz do repositório:

- `ai-service/training/form_schema.py`, `import_forms.py`, `esbeu_scoring.py`;
- `ai-service/training/regression_preprocessing.py`, `regression_models.py`,
  `regression_evaluation.py`, `regression_experiments.py`;
- `ai-service/training/optimization_v2.py`, `optimization_v2_validation.py`,
  `run_optimization_v2.py`;
- `docs/ML_OPTIMIZATION_V2.md`, `docs/ML_OPTIMIZATION_V2_EXECUTOR.md`;
- `ai-service/requirements.txt` e `requirements-dev.txt`.

## 2. Pergunta e objeto da avaliação

Investigar se subconjuntos menores de variáveis contextuais apresentam erros e
dispersão semelhantes ou menores que o conjunto completo, sob a grade controlada
da v2. B/C são hipóteses conceituais formuladas após observar a v1; não são
subconjuntos previamente demonstrados superiores. A reutilização da coleta v1
não oferece validação externa independente nem elimina a adaptação da hipótese
ao conhecimento anterior.

O desfecho é `esbeu_overall`: média aritmética não arredondada dos 14 itens
ESB-eu, cada um inteiro entre 0 e 4, calculada por `calculate_esbeu_scores()`.
Não há inversão adicional de itens, limiar clínico ou classificação de risco.
Os itens e seus escores derivados nunca são preditores. As previsões são
contínuas e avaliadas sem clipping, inclusive quando extrapolam 0–4.

O objeto principal é o desempenho externo do **procedimento conjunto de seleção**
de conjunto, algoritmo e hiperparâmetros. As 12 comparações conjunto/família são
descrições complementares do efeito da representação e da busca interna.
Não há seleção de vencedor pelas médias externas para depois apresentar essa
mesma média como estimativa imparcial do vencedor.

## 3. População analítica e entrada canônica

O caminho compatível é `import_official_forms_csv()` →
`prepare_regression_data()` → `run_optimization_v2()` →
`verify_optimization_v2()`.

O importador oficial exige o conjunto exato dos 41 cabeçalhos, sem correspondência
aproximada: 39 campos analíticos (3 de elegibilidade, 22 contextuais e 14 itens)
e 2 administrativos. Usa por padrão vírgula e `utf-8-sig`; respeita os rótulos,
as categorias e o espaço final documentado no cabeçalho de horas de trabalho.
As posições das colunas são resolvidas por seus cabeçalhos.

Aplicam-se consentimento, maioridade e matrícula conforme o esquema. Uma negativa
válida encerra a elegibilidade; critério anterior ausente ou inválido rejeita a
linha. Registros elegíveis precisam conter todos os campos analíticos válidos.
Não há imputação, deduplicação automática, exclusão por erro preditivo ou remoção
de outliers baseada no alvo. Zeros válidos são preservados. A alternativa
`Não se aplica` é uma categoria própria somente no campo permitido.

A futura execução deverá reconciliar `lidos = elegíveis + inelegíveis + rejeitados`
e justificar diferenças frente às contagens históricas antes de avaliar modelos.
Não se ajustará a seleção de linhas para recuperar artificialmente o número 36.
Se a população diferir, documentar a alteração e revisar o congelamento antes da
busca; não afirmar pareamento com a v1 sem comprovar equivalência.

O responsável deverá confirmar independência das observações. Repetições por
participante, agrupamentos relevantes ou dependência temporal exigem revisão
prévia do desenho: o KFold implementado divide linhas, não grupos ou pessoas.
Identificadores administrativos não entram em X, nos relatórios ou nos logs.

## 4. Conjuntos congelados, na ordem efetiva do código

### A — completo, 22 preditores

```text
age_range
course_area
semester
course_shift
subject_count
mandatory_hours_week
independent_hours_week
employment
work_hours_week
sleep_hours
sleep_quality
physical_activity_days
subject_overload
assessment_pressure
extraclass_overload
study_rest_difficulty
study_work_difficulty
teacher_difficulties
peer_difficulties
personal_support
academic_support
financial_concern
```

### B — intermediário, 12 preditores

```text
mandatory_hours_week
independent_hours_week
sleep_hours
sleep_quality
subject_overload
assessment_pressure
extraclass_overload
study_rest_difficulty
study_work_difficulty
personal_support
academic_support
financial_concern
```

### C — reduzido, 7 preditores

```text
sleep_hours
sleep_quality
subject_overload
assessment_pressure
study_rest_difficulty
personal_support
financial_concern
```

São subsequências de `ALLOWED_PREDICTORS`, preservadas em tuplas em um mapeamento
somente leitura. Não há exclusão permanente de variáveis do projeto. A entrada
de `run_optimization_v2()` continua contendo os 22 preditores; a seleção ocorre
dentro de cada pipeline. O número de preditores originais não equivale ao número
de atributos após codificação.

## 5. Catálogo congelado: 21 candidatas na ordem efetiva

Os números abaixo são referências documentais, não novos identificadores da API.

| Ordem | Conjunto | Família | Parâmetros que distinguem a configuração |
| --- | --- | --- | --- |
| 1 | A | Dummy | strategy=mean |
| 2 | A | Ridge | alpha=1.0 |
| 3 | A | Ridge | alpha=10.0 |
| 4 | A | Random Forest | max_depth=2, min_samples_leaf=3 |
| 5 | A | Random Forest | max_depth=3, min_samples_leaf=3 |
| 6 | A | SVR | C=0.1, kernel=rbf |
| 7 | A | SVR | C=1.0, kernel=rbf |
| 8 | B | Dummy | strategy=mean |
| 9 | B | Ridge | alpha=1.0 |
| 10 | B | Ridge | alpha=10.0 |
| 11 | B | Random Forest | max_depth=2, min_samples_leaf=3 |
| 12 | B | Random Forest | max_depth=3, min_samples_leaf=3 |
| 13 | B | SVR | C=0.1, kernel=rbf |
| 14 | B | SVR | C=1.0, kernel=rbf |
| 15 | C | Dummy | strategy=mean |
| 16 | C | Ridge | alpha=1.0 |
| 17 | C | Ridge | alpha=10.0 |
| 18 | C | Random Forest | max_depth=2, min_samples_leaf=3 |
| 19 | C | Random Forest | max_depth=3, min_samples_leaf=3 |
| 20 | C | SVR | C=0.1, kernel=rbf |
| 21 | C | SVR | C=1.0, kernel=rbf |

Parâmetros comuns efetivos, conferidos por construção dos estimadores sem ajuste
no scikit-learn 1.5.1:

- Dummy: `constant=None`, `quantile=None`, `strategy=mean`.
- Ridge: alpha conforme tabela; `copy_X=True`, `fit_intercept=True`,
  `max_iter=None`, `positive=False`, `random_state=42`, `solver=auto`, `tol=1e-4`.
- Random Forest: profundidade conforme tabela; `n_estimators=100`,
  `min_samples_leaf=3`, `min_samples_split=2`, `max_features=1.0`,
  `criterion=squared_error`, `bootstrap=True`, `max_samples=None`,
  `max_leaf_nodes=None`, `min_weight_fraction_leaf=0.0`,
  `min_impurity_decrease=0.0`, `ccp_alpha=0.0`, `monotonic_cst=None`,
  `oob_score=False`, `warm_start=False`, `n_jobs=1`, `random_state=42`, `verbose=0`.
- SVR: C conforme tabela; `kernel=rbf`, `epsilon=0.1`, `gamma=scale`,
  `degree=3`, `coef0=0.0`, `shrinking=True`, `tol=0.001`, `cache_size=200`,
  `max_iter=-1`, `verbose=False`. Degree/coef0 não alteram o kernel RBF.

Não há busca adicional, novas seeds escolhidas por desempenho ou ajuste manual
após consultar folds externos. Parâmetros não variáveis não são graus de liberdade
para a execução congelada. `gamma=scale` é a mesma regra em A/B/C, mas seu valor
efetivo depende do treinamento e da representação; a comparação avalia pipelines
completos, não um efeito causal isolado de cada variável removida.

## 6. Pipeline e prevenção de vazamento

Cada trial cria uma nova instância: `SelectContext` → pipeline canônico
`preprocess` → `regressor`. Não há estado compartilhado entre ajustes.
`prepare_regression_data()` valida e calcula X/y sem aprender estatísticas.

`ContextFrameValidator` rejeita campos/valores inválidos; categorias textuais
ordinais usam posições fixas do esquema. Nominais e o campo com NA recebem
`OneHotEncoder(categories=..., handle_unknown=error, sparse_output=False)` com
vocabulário completo previamente definido no esquema. Categorias canônicas
ausentes do treinamento não precisam ser descobertas no teste.

As demais colunas passam pelo `StandardScaler` padrão, ajustado somente no treino
do trial. A implementação compartilha esse escalonamento com todas as famílias,
inclusive Dummy e floresta. As colunas one-hot não recebem esse scaler.
Não há imputação, seleção global por correlação, padronização global, utilização
dos itens para escolher preditores ou clipping de previsões na avaliação.

## 7. Validação aninhada e desempates

Configuração única: `ExperimentProtocol(outer_splits=5, inner_splits=3,
outer_repeats=3, random_state=42)`, KFold embaralhado e não estratificado.
Para repetição zero-based r=0,1,2 e fold externo f=1,...,5:

- seed externa: `(42 + r) mod 2**32`, isto é, 42, 43 e 44;
- seed interna: `(42 + 1000 + r*5 + f) mod 2**32`;
- seed dos estimadores que a recebem: sempre 42.

Em cada treinamento externo, todas as 21 candidatas compartilham as mesmas três
partições internas, construídas exclusivamente dentro desse treinamento.
Os índices internos são posicionais em relação ao treinamento externo.
Uma candidata com qualquer falha interna não participa da seleção naquele fold;
não se calcula seu desempenho usando somente os folds internos bem-sucedidos.

A ordenação lexicográfica é: (1) menor média interna de MAE; (2) menor média
interna de RMSE; (3) menor número de preditores originais; (4) família na ordem
`dummy`, `ridge`, `random_forest`, `svr`; (5) posição no catálogo de 21 candidatas.
São empates numéricos exatos, sem tolerância ou limiar adicional.

Congelam-se a escolha conjunta e a melhor configuração de cada um dos 12 grupos
conjunto/família antes de observar qualquer resultado externo. Os modelos desses
grupos são ajustados no treinamento externo e avaliados no teste externo. O
procedimento conjunto reutiliza o resultado do grupo correspondente à escolha
interna; não escolhe o grupo pelo resultado externo nem realiza um segundo ajuste
para esse resultado. São 15 avaliações externas por grupo e do procedimento,
com 1125 ajustes por execução completa sem falhas: `15*(21*3+12)`.

Não há seleção adicional de conjunto por família abrangendo A/B/C: o relatório
traz cada par conjunto/família separadamente. Não há ajuste final em toda a base,
serialização de modelo ou promoção para produção na v2.

## 8. Métricas, falhas e saídas

MAE é a medida primária; RMSE e R² são complementares. MAE/RMSE estão nas unidades
do escore ESB-eu. Calculam-se por fold e resumem-se por média aritmética não
ponderada e desvio-padrão amostral (`ddof=1`). O RMSE médio dos folds não é um
RMSE recalculado de previsões agrupadas. Não substituir essas definições.

R² negativo é preservado. Significa SSE maior que a variação em torno da média
do alvo no próprio teste; essa referência difere do Dummy, que usa média do
treinamento. Assim, R² negativo e comparação favorável ao Dummy não são
necessariamente contraditórios. R² indefinido recebe `null` com
`constant_target` ou `test_size_lt_2`, mesmo quando a previsão constante é perfeita.
Não converter indefinição para 0/1 nem descartar o motivo. A configuração padrão
exige pelo menos dois registros por teste externo; um teste menor que dois
indicaria divergência a investigar.

Cada resumo registra folds válidos, indefinidos e falhos; desvio com menos de
dois valores válidos é `null`. Indefinição matemática de R² não é falha de ajuste.
Erros de ajuste, previsão/métricas ou convergência são códigos explícitos;
`ConvergenceWarning` invalida o trial. Outros avisos são preservados e exigem
revisão de impacto, sem impressão de exceções ou respostas.

O baseline pareado é sempre `A/dummy`. Para cada fold, `delta = MAE(avaliado) -
MAE(Dummy)`: negativo/zero/positivo corresponde a vitória/empate/derrota, com
comparação exata a zero. Uma falha em qualquer membro exclui o par e contabiliza
a falha; não permite anunciar completude por média parcial. Dummy A/B/C possuem
a mesma previsão por média do treinamento quando os ajustes são válidos.

As frequências de conjunto, algoritmo e candidata descrevem as escolhas internas,
inclusive escolhas cujo ajuste externo depois falhou. Em execução completa,
cada uma das três somas deve ser 15; as frequências incluem configurações com zero.
Empates entre Dummy A/B/C favorecem C pelo menor número de preditores: frequência
alta de C/Dummy não demonstra informação preditiva das sete variáveis.

São preservados catálogo, protocolo, versões, auditoria interna, escolhas,
métricas e tamanhos agregados dos folds, resumos, pareamentos, falhas e frequências.
Não exportar respostas, identificadores, índices ou previsões por participante.
Mesmo relatórios por fold devem permanecer privados devido aos grupos pequenos.

## 9. Comparações previamente especificadas e interpretação

### 9.1 Procedimento completo versus Dummy

Relatar os 15 deltas, sua média/desvio e vitórias/empates/derrotas, junto aos
resumos de MAE/RMSE/R² e contagens. Média de delta menor que zero permite somente
a afirmação descritiva de menor MAE médio nessa avaliação; zero indica empate
nessa medida e maior que zero indica MAE médio maior. Não é um teste de
significância, utilidade clínica, equivalência ou validação externa.

### 9.2 A/B/C dentro da v2

Para cada família, relatar todos os contrastes pareados B−A, C−A e C−B nos mesmos
15 folds: diferenças de MAE como análise principal, RMSE como complemento,
média/desvio e contagens de sinais. Incluir Dummy como controle de equivalência
da referência. Os hiperparâmetros de cada conjunto/família continuam selecionados
internamente pela mesma grade. Não congelar retrospectivamente uma configuração
específica com base nos testes externos.

O relatório atual já contém os agregados por fold necessários para esses
contrastes, mas só calcula automaticamente o pareamento com Dummy. A derivação
privada de B−A/C−A/C−B é uma etapa descritiva futura, não implementada por este
documento. Se algum par faltar, registrar a incompletude e não mudar denominadores
silenciosamente. Não acrescentar uma seleção externa do melhor conjunto.

Estabilidade será descrita por desvios de MAE/RMSE, sinais das diferenças nos
folds, contagens por repetição e frequências de seleção. Menor dispersão é uma
descrição da avaliação, não garantia de estabilidade populacional. Apresentar
também o erro médio: menor desvio isolado não compensa erro maior. Frequências
não são probabilidades de superioridade. Não fixar retrospectivamente um número
de vitórias ou uma redução mínima de erro para declarar sucesso.

### 9.3 Comparação descritiva pareada com a v1

Exigir mesma população elegível, mesma ordem das linhas, desfecho, pré-processamento
compatível e partições efetivamente correspondentes. As fórmulas de seeds são
iguais nos códigos inspecionados; seeds iguais, sozinhas, não comprovam pareamento.
O responsável deverá conferir proveniência privada da coleta/ordem e identidade
das partições, sem publicar identificadores. Não presumir isso a partir de n=36.

Usar resultados externos agregados já preservados da v1, sem abrir ou substituir
modelos, manifestos ou relatórios privados nesta tarefa. Se os resultados
disponíveis forem apenas médias globais, a comparação pareada não será possível:
registrar a limitação, sem reconstruir pares fictícios. Uma nova execução v1
exigiria autorização separada e destinos novos.

Comparar procedimento v2 versus procedimento v1 e, separadamente, A/B/C por família
com a família correspondente na v1 (Dummy, Ridge, floresta e SVR). Definir
`delta_v1 = MAE(v2) - MAE(v1)` no mesmo fold e reportar os mesmos resumos de sinais
e diferenças, sem escolher apenas contrastes favoráveis. Linear v1 é contexto
histórico, pois não tem correspondente v2. Não comparar o erro de treinamento
do Ridge final com o desempenho externo da v2. Se as condições de pareamento
não forem satisfeitas, limitar-se à comparação não pareada de resumos, explicitada.

### 9.4 Limites das conclusões

Não foram definidos margens de equivalência/não inferioridade, relevância mínima
ou limiares clínicos. Portanto, diferenças pequenas não demonstram equivalência
nem benefício prático. Não se usará p<0,05 ou intervalo ingênuo para criar uma
regra de aprovação ausente deste protocolo. Não haverá testes de hipótese
confirmatórios ou declaração de vencedor estatisticamente validado nesta análise.

**Os 15 folds externos reutilizam participantes e não são 15 amostras
independentes.** Cada linha é avaliada uma vez por repetição; treinamentos e
testes se sobrepõem entre repetições. Não interpretar desvio-padrão como intervalo
de confiança, aplicar teste t/binomial ingênuo aos 15 resultados ou tratar a
contagem de vitórias como ensaios independentes.

Caso sejam confirmados 36 registros, os testes externos terão 7/8 registros,
treinamentos externos 28/29 e treinamentos internos 18–20. São tamanhos
condicionais ao n informado, não contagens observadas aqui. Categorias raras,
alta dimensão após codificação, restrição de variação do alvo e poucos casos
extremos podem tornar métricas e escolhas muito variáveis. As repetições não
aumentam o número de pessoas. A exclusão de respostas incompletas também pode
introduzir viés. Resultados sintéticos não estimam esses efeitos na pesquisa.

## 10. Diferenças efetivas entre v1 e v2

| Aspecto | v1 implementada | v2 congelada |
| --- | --- | --- |
| Conjuntos | 22 preditores | A22/B12/C7 |
| Candidatas | 24 em um conjunto | 7 por conjunto, 21 no total |
| Famílias | Dummy, Linear, Ridge, floresta, SVR | Dummy, Ridge, floresta, SVR |
| Ridge | alpha=0.1,1,10,100 | alpha=1,10 |
| Floresta | depth=2,3 × leaf=2,3,5 | depth=2,3; leaf=3 |
| SVR | kernel=linear,rbf × C=0.1,1,10 × epsilon=0.1,0.2 | kernel=rbf × C=0.1,1; epsilon=0.1 |
| Partições padrão | 5 externos × 3 internos × 3 repetições, seed42 | mesmas fórmulas e quantidades |
| Desempate | MAE, RMSE, desvio interno de MAE, complexidade da família, ordem estável | MAE, RMSE, tamanho do conjunto, ordem da família, posição no catálogo |
| Ordem da família no desempate | Dummy, Linear, Ridge, SVR, floresta | Dummy, Ridge, floresta, SVR |
| Ajuste final | busca interna em toda a base e refit após avaliação completa | ausente |

O desempate v1 usa desvio amostral interno e, em igualdade completa, a ordem
estável do catálogo; a v2 não usa esse desvio para seleção. Ambas avaliam o
procedimento separadamente das famílias. O modelo final da v1 não substitui a
avaliação externa desse procedimento.

**Nenhuma melhoria v2 versus v1 poderá ser atribuída exclusivamente à redução de
variáveis**, pois grade, famílias concorrentes e desempates mudaram. Mesmo A/v2
versus v1 não é uma reprodução integral da busca original. Os contrastes A/B/C
dentro da v2 mantêm a grade e as regras comuns e são a análise mais controlada
de representação, ainda exploratória e sem interpretação causal.

## 11. Integridade e reprodutibilidade exigidas no futuro

Antes de uma execução real, cumprir e registrar em armazenamento privado:

1. Autorização explícita do responsável e requisitos éticos/institucionais
   aplicáveis, consentimento compatível e controle de acesso. Um prompt ou
   `data_origin=real_authorized` não comprova esses requisitos.
2. Revisão explícita de uma capacidade de execução real. O executor atual
   permanece sintético; não usar exemplo de biblioteca como atalho ao bloqueio.
3. Versão/hash deste protocolo, commit e hashes do código efetivo, estado do Git
   e justificativa de eventuais diferenças documentais. Não aceitar alterações
   experimentais não rastreadas ou dependências silenciosamente atualizadas.
4. Python 3.12, preferencialmente 3.12.14 já auditado, e requisitos fixados:
   numpy1.26.4, pandas2.2.2, scikit-learn1.5.1, joblib1.4.2, FastAPI0.111.0,
   uvicorn0.30.1 e httpx0.28.1. Registrar também `pip freeze`, plataforma e
   dependências transitivas, não integralmente bloqueadas pelos requisitos atuais.
5. Suíte sintética completa e `pip check` aprovados nesse ambiente antes do uso
   real. Igualdade de reprodução é exigida no mesmo ambiente/configuração/ordem;
   não prometer igualdade bit a bit entre versões ou plataformas diferentes.
6. CSV autorizado somente fora do repositório; hash privado da entrada, esquema,
   encoding, delimitador, contagens reconciliadas, critérios de inclusão e ordem
   preservada. Não copiar CSV ou registros para fixtures, logs ou serviços externos.
7. Confirmar independência das linhas e a equivalência necessária para parear v1.
   Proveniência/assinaturas de partições, se necessárias, ficam privadas. O
   relatório atual não exporta índices nem certifica a identidade das linhas.
8. Conferir literalmente A/B/C, ordem das 21 candidatas e protocolo5/3/3/42
   contra esta especificação. Construir e registrar os parâmetros efetivos dos
   estimadores; isso não exige ajustar modelos. A aceitação genérica de grades
   pelo código/verificador não substitui essa conferência.
9. Destinos externos privados, exclusivos e novos para relatório, verificação,
   manifesto e logs sanitizados. Nenhuma sobrescrita da entrada ou da v1; nenhuma
   serialização de modelo, previsão individual, promoção ou publicação automática.

Após a futura execução autorizada, exigir:

- `verify_optimization_v2().complete=True`, `issues` vazio e revisão humana;
- 15 auditorias internas com 21 candidatas e zero falhas internas;
- 12 grupos com 15 folds cada e 15 folds do procedimento; tamanhos compatíveis,
  zero falhas externas e 15 pares válidos com Dummy por comparação;
- 15 MAEs/RMSEs válidos por comparação; para R², válidos + indefinidos = 15,
  cada indefinição justificada, sem substituir valores negativos ou nulos;
- frequências de conjunto, família e candidata coerentes e somando 15 cada;
- resumos, pareamentos, escolhas internas e códigos de aviso consistentes;
- JSON sem NaN/Infinity, respostas, identificadores ou previsões individuais;
- todos os diagnósticos preservados quando houver falha. Execução incompleta
  permanece incompleta e não é aprovada por excluir folds difíceis;
- repetição técnica no mesmo ambiente, se autorizada, em novo destino, com os
  mesmos dados/configuração/ordem e relatório agregado idêntico; qualquer
  divergência investigada antes de interpretar resultados. Essa repetição não
  constitui nova validação nem deve buscar uma seed mais favorável.

O verificador confere consistência do relatório, não recalcula métricas a partir
de previsões individuais nem certifica origem, consentimento, independência ou
ausência de vazamento em um produtor de relatórios arbitrário. `complete=True`
é completude técnica, nunca aprovação científica. Avisos devem ser revisados.

## 12. Documentação existente: esclarecimentos e pendências

- A lista conceitual de B em `ML_OPTIMIZATION_V2.md` começa por sono, mas o código
  a reordena canonicamente. A seção4 deste documento registra a ordem efetiva;
  não houve alteração de integrantes ou código.
- A documentação antiga registra 185 testes em uma revisão anterior; a do
  executor registra 199 após sua inclusão. São etapas históricas distintas,
  não uma exigência de retornar a 185 testes. Esta tarefa documental não executou
  novamente a suíte nem afirma uma nova aprovação de testes.
- O exemplo de execução privada da documentação geral é prospectivo. A CLI
  efetiva rejeita execução real com `REAL_DATA_EXECUTION_DISABLED`; nenhuma flag
  de autorização real existe. O exemplo não é autorização nem capacidade
  operacional aprovada para processar participantes nesta etapa.
- Código e verificador aceitam protocolos/grades alternativos consistentes,
  limitados a 60 candidatas. Este congelamento exige o padrão de 21; a conferência
  exata da configuração é uma obrigação operacional futura, ainda não uma
  restrição adicional implementada no verificador.
- O pareamento automático existente é contra Dummy; contrastes A/B/C e v1/v2
  requerem derivação privada dos agregados por fold e comprovação da equivalência
  das partições. Não são saídas automáticas novas criadas por este documento.
- O manifesto detalhado do executor atual é sintético. Não se presume que um
  executor real ou seu manifesto já existam. Dependências transitivas, autorização,
  proveniência real e armazenamento deverão ser revisados antes dessa capacidade.

Status: **especificação congelada documentalmente para revisão humana**.
Não houve treinamento científico, habilitação real, alteração da v1, promoção
de modelo ou validação científica decorrente da elaboração deste documento.
