# Dataset

O CSV real usado no treinamento nao fica versionado neste repositorio porque e grande.

Baixe o dataset Student Lifestyle, Mental Health & Burnout Insight:

https://www.kaggle.com/datasets/ayeshasiddiqa123/student-health

Salve o arquivo CSV nesta pasta com o nome:

```text
student_mental_health_burnout_1M.csv
```

O caminho final esperado pelo treinamento e:

```text
ai-service/dataset/student_mental_health_burnout_1M.csv
```

Depois disso, a partir da pasta `ai-service`, gere o modelo real:

```bash
python -m training.train_model
```

Isso cria o arquivo:

```text
ai-service/saved_models/burnout_model.pkl
```

Se o grupo preferir versionar o CSV ou o `.pkl`, use Git LFS em vez de Git normal.
