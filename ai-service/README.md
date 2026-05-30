# BurnoutSense AI Service

Microsservico de IA do BurnoutSense para o TCC1. Ele usa FastAPI, Pandas e Scikit-learn para treinar e servir uma classificacao preventiva de risco de burnout academico.

O servico nao realiza diagnostico clinico. A resposta e uma estimativa computacional para apoio preventivo e academico.

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
    student_mental_health_burnout_1M.csv
  saved_models/
    burnout_model.pkl
    training_report.json
    training_summary.md
  MODEL_CARD.md
  requirements.txt
```

## Dataset

Dataset de referencia:

```text
Student Lifestyle, Mental Health & Burnout Insight
```

Baixe o CSV e salve em:

```text
ai-service/dataset/student_mental_health_burnout_1M.csv
```

O CSV nao deve ser versionado no Git porque e grande. A pasta `dataset/` fica no repositorio apenas com README e `.gitkeep`.

## Instalar Dependencias

```bash
pip install -r requirements.txt
```

## Treinar Modelo

Na pasta `ai-service`:

```bash
python -m training.train_model
```

O treinamento atual:

- padroniza nomes de colunas;
- identifica `risk_level`;
- normaliza `Low`, `Medium`, `High` para `low`, `medium`, `high`;
- executa auditoria basica do dataset;
- compara DummyClassifier, LogisticRegression, RandomForest, ExtraTrees, HistGradientBoosting e LinearSVC;
- testa cenarios de features;
- remove `dropout_risk` e `internet_usage` do modelo final;
- salva `saved_models/burnout_model.pkl`;
- atualiza `saved_models/training_report.json`;
- atualiza `saved_models/training_summary.md`.

## Modelo Atual

Modelo selecionado:

```text
Random Forest [final_without_dropout_or_internet]
```

Features finais:

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

Features removidas do modelo final:

- `dropout_risk`: possivel vazamento/variavel derivada de risco.
- `internet_usage`: redundante com `screen_time`.

## Metricas Atuais

- Accuracy: 0.8259
- Balanced accuracy: 0.7542
- Precision macro: 0.6390
- Recall macro: 0.7542
- F1 macro: 0.6804
- High recall: 0.6430
- High F1-score: 0.4868

As metas de `high` ainda nao foram atingidas. Isso deve aparecer como limitacao tecnica no TCC1, sem mascarar o resultado com accuracy.

## Rodar API

```bash
uvicorn app.main:app --reload
```

Ou use:

```powershell
.\run_api.ps1
```

## Endpoints

### GET /health

Retorna status basico do servico.

### POST /predict

Exemplo:

```json
{
  "study_hours": 8,
  "sleep_quality": 4,
  "stress_level": 8,
  "screen_time": 7,
  "social_support": 3,
  "financial_stress": 6,
  "academic_performance": 65,
  "exam_pressure": 8,
  "anxiety_score": 7,
  "depression_score": 5,
  "physical_activity": 2,
  "family_expectation": 7
}
```

Resposta:

```json
{
  "risk_level": "high",
  "confidence": 0.72,
  "model_used": "Random Forest [final_without_dropout_or_internet]",
  "main_factors": ["Nivel de estresse elevado"]
}
```

### GET /model-info

Retorna modelo usado, estrategia de treino, features, quantidade de registros, data de treino, metricas principais, importancia das features e aviso preventivo.

### GET /model-metrics

Retorna matriz de confusao, metricas gerais, metricas por classe, labels da matriz e status das metas de qualidade.

## Documentos Tecnicos

Leia tambem:

- `MODEL_CARD.md`
- `saved_models/training_summary.md`
- `saved_models/training_report.json`

Esses arquivos documentam a auditoria, as features finais, os modelos comparados e as limitacoes.
