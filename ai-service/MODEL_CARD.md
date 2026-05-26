# BurnoutSense Model Card

## Objetivo do Modelo

O microsservico de IA do BurnoutSense e um prototipo academico para classificacao preventiva de risco de burnout academico em estudantes universitarios.

O modelo nao possui finalidade clinica ou diagnostica. Seu objetivo nesta etapa e demonstrar viabilidade tecnica para o TCC 1, utilizando aprendizado de maquina para classificar niveis de risco academico.

## Dataset

Dataset de referencia:

Student Lifestyle, Mental Health & Burnout Insight

https://www.kaggle.com/datasets/ayeshasiddiqa123/student-health

Arquivo local utilizado no treinamento atual:

```text
dataset/student_mental_health_burnout_1M.csv
```

## Variavel-Alvo

A variavel-alvo do modelo e:

```text
risk_level
```

Essa coluna ja existe no dataset original. Ela nao foi criada aleatoriamente pelo codigo do projeto.

Os rotulos originais sao normalizados da seguinte forma:

```text
Low    -> low
Medium -> medium
High   -> high
```

Portanto, a API pode retornar:

```text
low
medium
high
```

## Variaveis de Entrada

O prototipo atual utiliza os seguintes indicadores quando disponiveis:

- `study_hours`
- `academic_performance`
- `exam_pressure`
- `stress_level`
- `anxiety_score`
- `depression_score`
- `sleep_quality`
- `physical_activity`
- `screen_time`
- `internet_usage`
- `social_support`
- `family_expectation`
- `financial_stress`
- `dropout_risk`

## Modelos Avaliados

O script de treinamento avalia:

- Random Forest
- SVM Linear

O modelo salvo e utilizado pela API e:

```text
Random Forest
```

## Estrategia de Treinamento

O dataset possui desbalanceamento entre as classes, com uma quantidade muito maior de registros `low` do que `high`.

Para reduzir esse impacto, o treinamento atual utiliza amostragem customizada no conjunto de treino:

```text
low: 100000
medium: 50000
high: 11000
```

A amostragem e aplicada somente no conjunto de treino. O conjunto de teste mantem a distribuicao original dos dados, permitindo uma avaliacao mais proxima do cenario real.

## Avaliacao

Os dados sao separados em treino e teste. Isso significa que o modelo e avaliado em registros que nao foram usados durante o ajuste, reduzindo o risco de apenas memorizar os dados de treinamento.

As metricas geradas sao salvas em:

```text
saved_models/training_report.json
saved_models/training_summary.md
```

Metricas principais do modelo atual:

```text
Accuracy: 0.8652
Precision: 0.8704
Recall: 0.8652
F1-score: 0.8674
```

Metricas por classe:

```text
high   -> precision: 0.5112 | recall: 0.5512 | f1-score: 0.5304
low    -> precision: 0.9326 | recall: 0.9090 | f1-score: 0.9206
medium -> precision: 0.6765 | recall: 0.7331 | f1-score: 0.7037
```

## Limitacoes

- O dataset original e desbalanceado, com muito mais exemplos `low` do que `high`.
- A amostragem customizada melhora a identificacao de `medium` e `high`, mas ainda nao representa uma solucao final.
- O modelo atual e um prototipo inicial para TCC 1, nao uma versao final de producao.
- No TCC 2, recomenda-se avaliar validacao cruzada, ajuste de hiperparametros, tecnicas adicionais para desbalanceamento e versionamento de modelos.
- As predicoes devem ser interpretadas como indicadores academicos preventivos, nao como conclusoes medicas.
