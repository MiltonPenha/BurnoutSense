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

## Formulário oficial da pesquisa: Etapa 1

`training/form_schema.py` define o instrumento de pesquisa, independentemente do
contrato de previsão do protótipo. Não importa arquivos, acessa respostas, treina
modelos ou calcula escores. O pipeline de classificação descrito nas seções
seguintes continua preservado e **não deve receber respostas deste formulário**.

### Fontes e convenções

Conferido com `Formulario.pdf`, exportado em 19/10/2026, páginas 5–17.
Os textos mantêm as perguntas, removendo apenas numeração, quebras de linha,
asteriscos de obrigatoriedade e ligaduras tipográficas do PDF. A fonte científica
é Carlotto e Câmara (2020), Anexo 1, página 22,
[DOI 10.33448/rsd-v9i7.4013](https://doi.org/10.33448/rsd-v9i7.4013), CC BY 4.0.
O texto integral foi conferido na
[cópia disponibilizada pela autora](https://www.researchgate.net/publication/341259867_Escala_de_Avaliacao_da_Sindrome_de_Burnout_em_Estudantes_Universitarios_ESB-eu_construcao_e_evidencias_de_validade),
pois o download da editora retornou HTTP 403 neste ambiente.

Cada `FieldDefinition` contém identificador, nome, pergunta, grupo, tipo,
natureza, ordem física, obrigatoriedade, alternativas ou intervalo, unidade,
instruções e tratamento de resposta especial. Itens da escala incluem dimensão,
ordem no instrumento e metadado de inversão. Tuplas, dataclasses congeladas e
mapas somente de leitura evitam mutações acidentais.

Os identificadores são nomes semânticos em inglês; `esbeu_01` a `esbeu_14`
acompanham os itens científicos. `form_order` registra o número físico do Google
Forms, e não a posição de coluna em um CSV. O e-mail ocupa a pergunta física 3;
matrícula é a física 4 e lógica 3. Os 39 campos analíticos usam as ordens físicas
1, 2 e 4–40.

| Grupo | Quantidade | Identificadores |
| --- | ---: | --- |
| Elegibilidade | 3 | `consent`, `adult`, `enrolled` |
| Caracterização acadêmica | 7 | `age_range`, `course_area`, `semester`, `course_shift`, `subject_count`, `mandatory_hours_week`, `independent_hours_week` |
| Trabalho e rotina | 5 | `employment`, `work_hours_week`, `sleep_hours`, `sleep_quality`, `physical_activity_days` |
| Demandas | 5 | `subject_overload`, `assessment_pressure`, `extraclass_overload`, `study_rest_difficulty`, `study_work_difficulty` |
| Relações e apoio | 4 | `teacher_difficulties`, `peer_difficulties`, `personal_support`, `academic_support` |
| Financeiro | 1 | `financial_concern` |
| ESB-eu | 14 | `esbeu_01`–`esbeu_14` |

### Tipos, domínios e valores especiais

- `category`: texto exato das alternativas documentadas; natureza nominal ou
  ordinal. Atividade física permanece categórica ordinal (`0 dias` a `7 dias`),
  conforme a pergunta; nenhuma codificação estatística foi aplicada.
- `integer`: inteiro Python estrito, sem aceitar booleanos nem floats integrais.
  Semestre: 1–12; disciplinas: 0–15; escalas ordinais: 0–4.
- `number`: `int` ou `float` finito; horas aceitam decimais. Valores negativos
  são rejeitados pela semântica de duração. O PDF não mostra limites superiores
  para horas; eles não foram presumidos. A equipe deverá conferir as regras do
  Forms antes da importação. Não se impõem soma de horas ou jornadas presumidas.
- `labels` documenta as âncoras das escalas. Strings vazias nessa tupla indicam
  rótulos intermediários não informados no formulário; não são respostas aceitas.
- `None` representa exclusivamente ausência e é rejeitado em todos os campos
  analíticos, pois são obrigatórios. Campo omitido também é ausência.
- Zero continua sendo resposta válida nos campos que o permitem.
- `SpecialValue.NOT_APPLICABLE` representa `Não se aplica`, permitido somente
  em `study_work_difficulty`. O texto exato dessa alternativa é convertido para
  o enum. Nunca equivale a zero, ausência ou erro; não é um código numérico.
- Resposta inválida gera `ResponseValidationError`, com identificador conhecido
  e motivo. Diagnósticos não ecoam valores nem nomes de colunas desconhecidas.

As funções recebem valores **canônicos Python**, não células brutas de CSV.
Por exemplo, `7.5` é aceito, enquanto `"7,5"`, `"7.5"`, `"0 — Nunca"`, `NaN`,
strings vazias e marcadores improvisados são rejeitados. O importador futuro
deverá analisar explicitamente decimais e alternativas rotuladas; conversões,
normalização de cabeçalhos e serialização de enums estão fora desta etapa.

### Elegibilidade e privacidade

`is_eligible` valida os três critérios e retorna verdadeiro somente para
`Sim, concordo em participar.`, `Sim`, `Sim`. Respostas negativas são válidas
estruturalmente, mas tornam o registro inelegível. Critérios ausentes ou inválidos
geram erro; o artigo original não acrescenta critérios à elegibilidade do TCLE.
`validate_record` exige elegibilidade antes de admitir um registro completo e
gera `IneligibleRecordError` quando ela não é satisfeita.

Quem informa `Não, apenas estudo` deve informar zero em `work_hours_week`,
conforme a orientação explícita. Não se deduz a resposta de conciliação a partir
da situação profissional atual: essa pergunta se refere às últimas quatro semanas.

`ADMINISTRATIVE_FIELDS` identifica `tcle_email` e sua pergunta original, fora de
`ANALYTICAL_FIELDS` e de `FIELDS_BY_ID`. O futuro importador deve excluir essa
coluna antes da validação. `ADMINISTRATIVE_HEADERS` permite reconhecê-la por ID
ou pergunta exata. `validate_record` rejeita campos administrativos e quaisquer
colunas extras, inclusive metadados de exportação, sem registrar seu conteúdo.
Não há identificadores de conta, mecanismos de vinculação ou exemplos pessoais.

### ESB-eu e reutilização na Etapa 2

O Anexo 1 confirma o mapeamento e apresenta somas diretas, sem inversão:

| Dimensão | Itens | `reverse_scored` |
| --- | --- | --- |
| Desgaste emocional e físico (`DEF`) | 01–06 | `False` |
| Distanciamento (`DIST`) | 07–10 | `False` |
| Ineficácia da formação (`INEF`) | 11–14 | `False` |

Todos os itens são obrigatórios e aceitam inteiros de 0 a 4: Nunca, Raramente,
Às vezes, Frequentemente e Todos os dias. Não há cálculo de médias, pontos de
corte, porcentagens ou classes de risco no novo módulo.

`esbeu_scoring.py`, na próxima etapa, poderá consumir `ESBEU_FIELDS`,
`ESBEU_BY_DIMENSION` e os valores já validados. Primeiro será necessário definir
explicitamente a política de registros incompletos; esta etapa rejeita ausências
e não imputa respostas. Exemplo de uso sem dados de participantes:

```python
from training.form_schema import ESBEU_BY_DIMENSION, validate_schema, validate_value

validate_schema()  # verifica integridade do instrumento
assert validate_value("esbeu_01", 0) == 0  # exemplo inteiramente sintético
```

### Testes e auditoria do legado

Na pasta `ai-service`, sem instalar dependências adicionais:

```bash
python -m unittest discover -s tests -v
python -m compileall -q app training tests
```

Os testes cobrem os 39 campos, distribuição 3/22/14, exclusão administrativa,
imutabilidade, duplicações, integridade das definições, tipos, alternativas,
limites, valores não finitos, elegibilidade e respostas especiais. Todos os
registros usados são sintéticos. Não havia suíte Python, configuração de estilo
ou tipagem no repositório; adotou-se `unittest` da biblioteca padrão.

Auditoria da estrutura existente:

- `training/load_data.py`: carrega Kaggle e oferece amostra sintética do
  protótipo; preservado, sem executar carregamento ou treinamento.
- `training/preprocess.py`: aliases legados, alvo `risk_level`, coerção numérica
  e imputação por mediana/zero; preservados porque o treinamento os usa.
  Removidos somente `encode_categorical_columns`, seu import `LabelEncoder` e
  `DEFAULT_EXCLUDED_FEATURES`, sem referências no repositório.
- `training/train_model.py`, `eda.py` e `evaluate_model.py`: classificação,
  balanceamento e métricas do protótipo; revisão futura junto à regressão.
- `app/schemas.py` e `app/predictor.py`: contrato ativo, classes de risco,
  heurísticas de pontuação e uso de `sleep_quality` como horas de sono.
  O novo `sleep_quality` é ordinal 0–4 e **não é intercambiável** com o legado.
- NestJS consome `/predict` e aplica calibrações/fallbacks; frontend e Prisma
  continuam vinculados ao protótipo. Alterar esses contratos agora quebraria
  compatibilidade. Frontend local usa Next.js 16/React 19 e JavaScript, diferente
  da stack histórica descrita na solicitação; não foi modificado.

Não foram encontradas classes duplicadas que justificassem remoção nesta etapa.
Nenhuma dependência foi adicionada ou removida: Scikit-learn continua necessário
ao pipeline ativo. Não houve refatoração de API, banco ou interface.

### Pendências do instrumento e limites da verificação

O PDF indica que a resposta positiva à pergunta de idade pula para a pergunta
física 4, aparentando contornar o e-mail opcional da pergunta 3. Além disso,
orientações mencionam envio automático do TCLE e o termo descreve envio pela
equipe. A equipe deve conferir a navegação e o procedimento no Google Forms;
esta implementação não acessa nem altera o formulário online.

As regras ocultas de validação do Google Forms e os cabeçalhos exatos da futura
exportação não aparecem no PDF. Devem ser conferidos antes de criar o importador,
sem acessar respostas reais nesta etapa. O mapeamento e a pontuação direta dos
14 itens foram confirmados; não há recodificação presumida pendente.

O arquivo de modelo treinado não está presente no checkout; a verificação da API
deve se limitar aos contratos, saúde e resposta esperada de indisponibilidade,
sem gerar modelo novo. As verificações desta etapa não equivalem a um teste
completo da plataforma com banco, navegador e modelo treinado.

## Dataset do protótipo

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
  "risk_score": 9.2,
  "model_used": "Random Forest [final_without_dropout_or_internet]",
  "main_factors": ["Nivel de estresse elevado"]
}
```

`risk_level` é a classe prevista pelo classificador. `confidence` é a probabilidade da classe prevista quando o modelo oferece `predict_proba`. `risk_score` é uma escala visual contínua de 1 a 10 derivada das probabilidades do modelo: `1 + 9 * (P_MEDIUM * 0.5 + P_HIGH)`, com pequenos ajustes preventivos controlados por fatores observados. O `risk_score` não é probabilidade direta de burnout nem diagnóstico clínico.

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
