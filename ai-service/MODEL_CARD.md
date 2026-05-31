# BurnoutSense Model Card

## Objetivo do Modelo

O microsservico de IA do BurnoutSense e um prototipo academico para classificacao preventiva de risco de burnout academico em estudantes universitarios.

O modelo nao possui finalidade clinica ou diagnostica. O resultado deve ser interpretado como uma estimativa computacional de apoio preventivo.

## Dataset

Dataset de referencia:

```text
Student Lifestyle, Mental Health & Burnout Insight
```

https://www.kaggle.com/datasets/ayeshasiddiqa123/student-health

Arquivo local utilizado no treinamento atual:

```text
dataset/student_mental_health_burnout_1M.csv
```

O dataset local analisado possui 1.000.000 registros, sem valores ausentes e sem duplicados.

Distribuicao da variavel-alvo:

- `Low`: 766.645
- `Medium`: 218.275
- `High`: 15.080

A classe `High` representa aproximadamente 1,5% do dataset. Esse desbalanceamento e a principal limitacao tecnica do modelo.

## Variavel-Alvo

A variavel-alvo e:

```text
risk_level
```

Os rotulos originais sao normalizados como:

```text
Low    -> low
Medium -> medium
High   -> high
```

## Features Finais

O modelo final usa:

- `study_hours`
- `academic_performance`
- `exam_pressure`
- `stress_level`
- `anxiety_score`
- `depression_score`
- `sleep_quality`
- `physical_activity`
- `screen_time`
- `social_support`
- `family_expectation`
- `financial_stress`

Nota: a feature `sleep_quality` recebe a coluna `sleep_hours` do dataset. No produto, o nome deve ser revisado com cuidado para diferenciar horas de sono de qualidade percebida do sono.

## Features Removidas do Modelo Final

- `dropout_risk`: removida por ser uma variavel de risco derivada/adjacente, com potencial de vazamento e baixa compatibilidade com o fluxo atual do produto.
- `internet_usage`: removida por alta redundancia com `screen_time` (`correlacao ~= 0.89`).

As colunas `burnout_score` e `mental_health_index` nao sao usadas como features porque parecem indicadores agregados fortemente relacionados ao alvo, o que caracterizaria vazamento de dados.

## Modelos Avaliados

Foram comparados:

- DummyClassifier como baseline
- LogisticRegression com `class_weight="balanced"`
- RandomForestClassifier
- ExtraTreesClassifier
- HistGradientBoostingClassifier com pesos de amostra
- LinearSVC com `class_weight="balanced"`

Foram testados cenarios com todas as features, sem `dropout_risk` e sem `dropout_risk`/`internet_usage`.

## Modelo Final

Modelo selecionado:

```text
Random Forest [final_without_dropout_or_internet]
```

Estrategia de treino:

```text
focused_high_recall_sampling
```

Amostragem aplicada apenas no treino:

- `high`: 40.000
- `medium`: 70.000
- `low`: 100.000

O conjunto de teste manteve a distribuicao original para avaliar o comportamento em um cenario mais realista.

## Saida do Modelo em Producao

O endpoint `/predict` retorna tres informacoes diferentes:

- `risk_level`: classe prevista pelo classificador (`low`, `medium` ou `high`).
- `risk_score`: escala visual de 1 a 10 calculada a partir de `risk_level` e `confidence`.
- `confidence`: probabilidade da classe prevista quando o modelo possui `predict_proba`.

O `risk_score` nao e uma classe fixa. Para evitar exibicoes pre-setadas, ele varia dentro da faixa de cada classe:

- `low`: 1 a 4.
- `medium`: 5 a 7.
- `high`: 8 a 10.

Para `low`, maior confianca aproxima o score de 1. Para `medium` e `high`, maior confianca aproxima o score do topo da faixa. Essa regra e uma calibracao visual para o prototipo TCC1, nao uma metrica clinica.

## Metricas do Modelo Final

- Accuracy: 0.8259
- Balanced accuracy: 0.7542
- Precision macro: 0.6390
- Recall macro: 0.7542
- F1 macro: 0.6804
- High precision: 0.3917
- High recall: 0.6430
- High F1-score: 0.4868

Matriz de confusao, na ordem `high`, `low`, `medium`:

```text
[[2424, 2, 1344], [48, 161699, 29914], [3717, 8504, 42348]]
```

## Criterios de Qualidade

Metas definidas para o TCC:

- Accuracy >= 0.80: atingida
- F1 macro >= 0.70: nao atingida
- Recall da classe high >= 0.70: nao atingida
- F1 da classe high >= 0.65: nao atingida

O modelo final e tecnicamente mais defensavel por evitar features problemáticas, mas ainda precisa ser melhorado para capturar a classe `high` com qualidade suficiente.

## Importancia das Features

Ranking global do modelo final:

- `stress_level`: 0.262925
- `anxiety_score`: 0.174816
- `depression_score`: 0.151558
- `sleep_quality`: 0.086222
- `exam_pressure`: 0.071902
- `social_support`: 0.064352
- `study_hours`: 0.039573
- `financial_stress`: 0.034136
- `family_expectation`: 0.030181
- `academic_performance`: 0.028511
- `screen_time`: 0.027913
- `physical_activity`: 0.027912

## Limitacoes

- Classe `high` muito rara no dataset.
- A classe `high` ainda apresenta F1 abaixo do desejado.
- Variaveis como `depression_score` e `anxiety_score` exigem cuidado etico e de privacidade, pois podem ser sensiveis.
- O campo `sleep_quality` precisa ser melhor padronizado entre dataset, backend e frontend.
- O campo de humor predominante nao existe como feature do treinamento atual e nao deve influenciar a predicao.
- O `risk_score` e uma escala visual derivada da classe e da confianca, nao uma saida clinica independente.
- O modelo nao substitui avaliacao profissional.

## Recomendacoes

- Para TCC1, manter este modelo como prototipo funcional e documentar as limitacoes.
- Para TCC2, avaliar engenharia de features, calibracao de probabilidades, validacao cruzada, limiares por classe e dataset complementar.
- Evitar usar `burnout_score`, `mental_health_index` e `dropout_risk` como entradas diretas do produto sem justificativa metodologica forte.
