# BurnoutSense Training Summary

## Objective

Initial TCC 1 training pipeline for academic burnout risk classification.

The model predicts the target column `risk_level` using academic, emotional and behavioral indicators from the dataset. This prototype is preventive and academic only; it is not a clinical or diagnostic tool.

## Dataset

- Source file: `dataset\student_mental_health_burnout_1M.csv`
- Total records identified during EDA: 1000000
- Records used in this training run: 1000000
- Training strategy: `custom_class_sampling`
- Training timestamp: `2026-05-26T01:06:57.778162+00:00`

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

- `low`: 100000
- `medium`: 50000
- `high`: 11000

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
- `internet_usage`
- `social_support`
- `family_expectation`
- `financial_stress`
- `dropout_risk`

## Models Evaluated

- Random Forest
- SVM Linear

The API currently uses `Random Forest` as the saved production prototype model.

## Selected Model Metrics

- Accuracy: 0.8652
- Precision: 0.8704
- Recall: 0.8652
- F1-score: 0.8674
- Confusion Matrix: `[[2078, 1, 1691], [8, 174217, 17436], [1979, 12588, 40002]]`

## Per-Class Metrics

- `high`: precision=0.5112, recall=0.5512, f1-score=0.5304, support=3770
- `low`: precision=0.9326, recall=0.909, f1-score=0.9206, support=191661
- `medium`: precision=0.6765, recall=0.7331, f1-score=0.7037, support=54569

## Notes

- The train/test split evaluates the model on data not used during fitting.
- The test set keeps the original class distribution to make evaluation closer to real data.
- The training set may use balanced sampling to reduce bias toward the majority class.
- The `high` class has fewer examples than `low`, so recall for high-risk cases should still be monitored in TCC 2.
- Future improvements may include cross-validation, hyperparameter tuning, model versioning and database logging of predictions.
