# BurnoutSense AI Service

Prototipo tecnico do microsservico de Inteligencia Artificial do BurnoutSense para TCC 1.

O servico usa FastAPI, Pandas, NumPy e Scikit-learn para carregar dados de estudantes, treinar modelos iniciais e expor uma predicao simples de risco de burnout academico. A classificacao tem finalidade academica e preventiva, sem valor diagnostico ou clinico.

## Estrutura

```text
ai-service/
  app/
    main.py
    predictor.py
    schemas.py
  training/
    load_data.py
    preprocess.py
    eda.py
    evaluate_model.py
    train_model.py
  dataset/
    student_health.csv
  saved_models/
    burnout_model.pkl
    training_report.json
    training_summary.md
  MODEL_CARD.md
  requirements.txt
```

## Dataset

Use como referencia o dataset Student Lifestyle, Mental Health & Burnout Insight:

https://www.kaggle.com/datasets/ayeshasiddiqa123/student-health

Baixe o CSV e salve em:

```text
ai-service/dataset/student_health.csv
```

Neste prototipo tambem e possivel usar outro nome de arquivo, informando o caminho no comando de treinamento.

O pipeline faz:

- leitura do CSV;
- padronizacao basica dos nomes das colunas;
- verificacao de valores ausentes;
- identificacao da variavel-alvo de risco;
- normalizacao das classes `Low`, `Medium` e `High` para `low`, `medium` e `high`;
- selecao inicial de indicadores;
- conversao numerica simples;
- analise exploratoria inicial;
- treino e teste com Random Forest e SVM;
- avaliacao com Accuracy, Precision, Recall, F1-score e Confusion Matrix.
- geracao de relatorio tecnico em JSON e Markdown.

## Como rodar

Crie e ative um ambiente virtual, depois instale as dependencias:

```bash
pip install -r requirements.txt
```

Treine o modelo com o CSV real:

```bash
python -m training.train_model
```

Para o arquivo de 1 milhao de linhas usado neste projeto, uma execucao rapida de prototipo pode usar amostragem:

```bash
python -m training.train_model --dataset dataset/student_mental_health_burnout_1M.csv --sample-size 100000
```

Treine com amostragem customizada para reduzir o impacto do desbalanceamento entre classes:

```bash
python -m training.train_model --dataset dataset/student_mental_health_burnout_1M.csv --balance-train --class-sample-sizes high=11000,medium=50000,low=100000
```

Caso ainda nao tenha o CSV localmente, gere um modelo apenas demonstrativo:

```bash
python -m training.train_model --allow-synthetic
```

Inicie a API:

```bash
uvicorn app.main:app --reload
```

## Endpoints

### GET /health

Resposta:

```json
{
  "status": "ok",
  "service": "BurnoutSense AI Service"
}
```

### POST /predict

Entrada:

```json
{
  "study_hours": 8,
  "sleep_quality": 3,
  "stress_level": 5,
  "screen_time": 7,
  "social_support": 2,
  "financial_stress": 4
}
```

O endpoint tambem aceita campos opcionais como `academic_performance`, `exam_pressure`, `anxiety_score`, `depression_score`, `physical_activity`, `internet_usage`, `family_expectation` e `dropout_risk`. Quando esses campos nao sao enviados, o servico usa medianas calculadas no treinamento.

Resposta esperada:

```json
{
  "risk_level": "high",
  "model_used": "Random Forest"
}
```

Exemplo para classe `low`:

```json
{
  "study_hours": 3,
  "sleep_quality": 8,
  "stress_level": 2,
  "screen_time": 4,
  "social_support": 8,
  "financial_stress": 2,
  "exam_pressure": 3,
  "anxiety_score": 2,
  "depression_score": 1,
  "dropout_risk": 1
}
```

Exemplo para classe `medium`:

```json
{
  "study_hours": 6,
  "sleep_quality": 5,
  "stress_level": 5,
  "screen_time": 6,
  "social_support": 5,
  "financial_stress": 5,
  "exam_pressure": 5,
  "anxiety_score": 5,
  "depression_score": 4,
  "dropout_risk": 3
}
```

Exemplo para classe `high`:

```json
{
  "study_hours": 9,
  "sleep_quality": 3,
  "stress_level": 8,
  "screen_time": 8,
  "social_support": 2,
  "financial_stress": 7,
  "exam_pressure": 8,
  "anxiety_score": 7,
  "depression_score": 7,
  "dropout_risk": 6
}
```

### GET /model-info

Retorna metadados resumidos do modelo salvo:

```json
{
  "model_name": "Random Forest",
  "training_strategy": "custom_class_sampling",
  "target_column": "risk_level",
  "risk_classes": ["high", "low", "medium"],
  "feature_count": 14,
  "feature_names": ["study_hours", "academic_performance"],
  "dataset_source": "dataset/student_mental_health_burnout_1M.csv",
  "training_records": 100000,
  "metrics_summary": {
    "accuracy": 0.8652,
    "precision": 0.8704,
    "recall": 0.8652,
    "f1_score": 0.8674
  }
}
```

### GET /model-metrics

Retorna metricas tecnicas detalhadas do modelo salvo:

```json
{
  "model_name": "Random Forest",
  "training_strategy": "custom_class_sampling",
  "metrics_summary": {
    "accuracy": 0.8652,
    "precision": 0.8704,
    "recall": 0.8652,
    "f1_score": 0.8674
  },
  "per_class_metrics": {
    "high": {"precision": 0.5112, "recall": 0.5512, "f1_score": 0.5304, "support": 3770},
    "low": {"precision": 0.9326, "recall": 0.909, "f1_score": 0.9206, "support": 191661},
    "medium": {"precision": 0.6765, "recall": 0.7331, "f1_score": 0.7037, "support": 54569}
  },
  "confusion_matrix": [[2078, 1, 1691], [8, 174217, 17436], [1979, 12588, 40002]],
  "confusion_matrix_labels": ["high", "low", "medium"]
}
```

## Observacao

O arquivo `saved_models/burnout_model.pkl` e gerado pelo script de treinamento. Quando o CSV real for adicionado, execute o treinamento novamente para substituir o modelo demonstrativo por um modelo baseado no dataset do Kaggle.

Leia tambem `MODEL_CARD.md` e `saved_models/training_summary.md` para uma explicacao resumida do modelo, da variavel-alvo e das limitacoes do prototipo.
