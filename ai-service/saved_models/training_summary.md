# BurnoutSense Training Summary

## Objective

Initial TCC 1 training pipeline for academic burnout risk classification.

The model predicts the target column `risk_level` using academic, emotional and behavioral indicators from the dataset. This prototype is preventive and academic only; it is not a clinical or diagnostic tool.

## Dataset

- Source file: `C:\Users\USER\Desktop\TCC\BurnoutSense\ai-service\dataset\student_mental_health_burnout_1M.csv`
- Total records identified during EDA: 1000000
- Records used in this training run: 1000000
- Training strategy: `focused_high_recall_sampling`
- Training timestamp: `2026-05-29T22:38:08.166814+00:00`

## Target

- Target column: `risk_level`
- Normalized classes: `high`, `low`, `medium`

Original dataset labels are normalized as:

- `Low` -> `low`
- `Medium` -> `medium`
- `High` -> `high`

## Target Distribution

- `Low`: 766645
- `Medium`: 218275
- `High`: 15080

## Training Class Distribution

Before balancing:

- `low`: 574984
- `medium`: 163706
- `high`: 11310

After balancing:

- `high`: 40000
- `medium`: 70000
- `low`: 100000

## Input Features

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

## Models Evaluated

- DummyClassifier baseline
- Logistic Regression with class balancing
- Random Forest with class balancing
- Extra Trees with class balancing
- HistGradientBoosting with sample weights
- Linear SVC with class balancing

The API currently uses `Random Forest [final_without_dropout_or_internet]` as the saved production prototype model.

## Selected Model Metrics

- Accuracy: 0.8259
- Balanced Accuracy: 0.7542
- Precision macro: 0.6390
- Recall macro: 0.7542
- F1 macro: 0.6804
- High recall: 0.6430
- High F1-score: 0.4868
- Confusion Matrix: `[[2424, 2, 1344], [48, 161699, 29914], [3717, 8504, 42348]]`

Quality targets:

- `accuracy` >= 0.8: met
- `f1_macro` >= 0.7: not met
- `high_recall` >= 0.7: not met
- `high_f1_score` >= 0.65: not met

## Feature Importance

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

## Per-Class Metrics

- `high`: precision=0.3917, recall=0.643, f1-score=0.4868, support=3770
- `low`: precision=0.95, recall=0.8437, f1-score=0.8937, support=191661
- `medium`: precision=0.5753, recall=0.776, f1-score=0.6608, support=54569

## Notes

- The train/test split evaluates the model on data not used during fitting.
- The test set keeps the original class distribution to make evaluation closer to real data.
- The training set may use balanced sampling to reduce bias toward the majority class.
- The final model excludes `dropout_risk` because it behaves like a risk-derived variable and can cause leakage or weak product compatibility.
- The final model excludes `internet_usage` because it is highly redundant with `screen_time`.
- The `high` class has far fewer examples than `low`, so recall and F1 for high-risk cases should still be monitored in TCC 2.
- Future improvements may include cross-validation, hyperparameter tuning, model versioning and database logging of predictions.
