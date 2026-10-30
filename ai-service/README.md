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
strings vazias e marcadores improvisados são rejeitados. O importador da Etapa 3
faz conversões explícitas na fronteira CSV; os validadores canônicos continuam
sem coerção textual. Não há normalização automática de cabeçalhos ou serialização
de enums neste módulo de esquema.

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

### ESB-eu e cálculo dos escores (Etapa 2)

O Anexo 1 confirma o mapeamento e apresenta somas diretas, sem inversão:

| Dimensão | Itens | `reverse_scored` |
| --- | --- | --- |
| Desgaste emocional e físico (`DEF`) | 01–06 | `False` |
| Distanciamento (`DIST`) | 07–10 | `False` |
| Ineficácia da formação (`INEF`) | 11–14 | `False` |

Todos os itens são obrigatórios e aceitam inteiros de 0 a 4: Nunca, Raramente,
Às vezes, Frequentemente e Todos os dias. `form_schema.py` mantém apenas as
definições e validações; o cálculo está em `training/esbeu_scoring.py`.

`calculate_esbeu_scores(record)` recebe um mapeamento com os 14 IDs canônicos,
revalida cada item usando `validate_value` e retorna a dataclass imutável
`EsbeuScores`, com médias aritméticas sem arredondamento:

- `overall`: soma dos 14 itens dividida por 14.
- `emotional_physical_exhaustion`: média dos 6 itens DEF.
- `distancing`: média dos 4 itens DIST.
- `training_inefficacy`: média dos 4 itens INEF.

A média geral não é a média simples das três dimensões. Os agrupamentos vêm
de `ESBEU_BY_DIMENSION`; as definições não são duplicadas no módulo de cálculo.
Todos os resultados usam a escala original 0–4, sem pontos de corte, diagnóstico,
porcentagens, inversões ou classificação de risco.

Somente inteiros Python de 0 a 4 são aceitos. Ausências, `None`, booleanos,
strings, floats (inclusive `2.0`) e respostas especiais geram
`ResponseValidationError`, identificando o item sem expor seu valor. Não há
imputação nem cálculo parcial. O mapeamento recebido não é modificado.

Um registro analítico completo, já aprovado por `validate_record`, também pode
ser fornecido. O cálculo lê somente os itens ESB-eu; não lê nem retorna campos
extras. A validação de consentimento/elegibilidade e a exclusão de campos
administrativos continuam sob responsabilidade de `form_schema` e do futuro
importador. O cálculo isolado não admite participantes na base de pesquisa.

Exemplo inteiramente sintético, executado a partir de `ai-service`:

```python
from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import ESBEU_FIELDS

synthetic_record = {field.identifier: 2 for field in ESBEU_FIELDS}
scores = calculate_esbeu_scores(synthetic_record)
assert scores.overall == 2.0
```

Não há dependências adicionais, acesso a arquivos/banco ou integração com a API
legada. As próximas etapas podem consumir as quatro médias sem repetir fórmulas.
Políticas de dados incompletos permanecem reservadas para discussão futura.

### Importador Google Forms (Etapa 3)

`training.import_forms.import_forms_csv(source, header_mapping, *, delimiter=",",
encoding="utf-8-sig")` aceita caminho (`str`/`Path`) ou stream de texto.
Caminhos são abertos somente para leitura, com suporte ao BOM UTF-8. Streams
devem estar decodificados; não são fechados nem modificados, mas a leitura avança.

O mapeamento é **cabeçalho literal → ID canônico**, em mapping ou sequência de
pares. Exige os 39 campos exatamente uma vez. Não normaliza numeração, acentos,
espaços, pontuação ou quebras de linha e não presume cabeçalhos oficiais.
Cabeçalhos ausentes, vazios ou duplicados e mapas ambíguos abortam a operação.

Exemplo inteiramente sintético, a partir de `ai-service`:

```python
import csv
from io import StringIO
from training.form_schema import ANALYTICAL_FIELDS
from training.import_forms import import_forms_csv

mapping = {f"Pergunta fictícia {i}": field.identifier
           for i, field in enumerate(ANALYTICAL_FIELDS, 1)}
stream = StringIO(newline="")
writer = csv.writer(stream)
writer.writerow(mapping)
writer.writerow([field.choices[0] if field.choices else field.minimum
                 for field in ANALYTICAL_FIELDS])
stream.seek(0)
result = import_forms_csv(stream, mapping)
assert result.eligible_count == 1
```

A conversão é restrita: inteiros textuais, decimais com ponto/vírgula (sem
milhares ou expoentes) e alternativas `n — texto` com rótulo canônico exato.
Categorias mantêm o texto integral; não há múltipla seleção no esquema atual.
Floats textuais como `2.0` não são aceitos nos itens inteiros. Células vazias ou
só com espaços representam ausência. `Não se aplica` mantém o enum canônico
somente no campo autorizado. Não há imputação nem conversão estatística.

A partir da Etapa 4.1, a estrutura CSV é verificada primeiro (incluindo número
de células). Depois, consentimento, idade e matrícula são validados em sequência
com `validate_value`. Uma negativa válida interrompe a participação: campos
posteriores vazios ou incompatíveis não invalidam essa recusa. Critério ausente
ou inválido antes da interrupção é erro, mesmo se houver uma negativa posterior.
Com os três critérios positivos, todos os 39 campos passam pela conversão e por
`validate_record`. Nenhum registro inelegível é retornado para análise. O esquema
canônico permanece inalterado; o importador agora respeita os saltos do formulário.
Não há cálculo automático de escores.

`ImportResult` retorna `rows_read`, `eligible_count`, `ineligible_count`,
`rejected_count`, `records`, `issues` e `excluded_columns`. Apenas registros
elegíveis são retidos, na ordem original, em tuplas de mapas somente de leitura.
`RowIssue` contém linha lógica CSV (cabeçalho = 1, independente de células
multilinha), tipo `invalid`/`ineligible`, ID canônico quando aplicável e motivo.
Informa-se o primeiro erro da linha; respostas rejeitadas não são armazenadas.

Somente colunas explicitamente aprovadas entram na saída. Extras, como e-mail
administrativo e timestamp, são descartados e sinalizados exclusivamente pelas
posições a partir de 1 em `excluded_columns`, sem nomes ou conteúdos. Cabeçalhos
administrativos conhecidos não podem ser mapeados. O responsável pelo mapa deve
conferir a origem semântica de cada coluna; o importador não tenta adivinhá-la.

CSV vazio aborta; somente cabeçalhos retorna zero registros. Falhas de leitura,
codificação e sintaxe geram `FormsImportError` sanitizado, sem resultados parciais
ou exceção interna encadeada. Erros de célula rejeitam somente a linha. Não se
devem registrar streams nem respostas brutas em logs.

O modo configurável continua exigindo um mapa literal aprovado. A Etapa 4.1
acrescenta um modo oficial descrito abaixo, baseado nas convenções documentadas,
sem consultar respostas de participantes. A Etapa 4 poderá consumir
`result.records`; serialização de enums e pré-processamento estatístico são
responsabilidades futuras. Nenhuma dependência adicional foi necessária.

Testes específicos: `python -m unittest discover -s tests -p test_import_forms.py -v`.

### Compatibilidade com a exportação oficial (Etapa 4.1)

`official_header_mapping()` gera um mapa somente de leitura com os 39 campos,
usando enunciados e ordens de `form_schema.py`. As perguntas lógicas 1–25 usam
`n. enunciado`: após a posição física 3 (e-mail), subtrai-se uma posição. Os
14 enunciados ESB-eu são usados sem prefixos. O cabeçalho de `work_hours_week`
recebe exatamente um espaço final, conforme a exportação descrita. Não há trim,
fuzzy matching ou associação pela posição das colunas recebidas.

`import_official_forms_csv(source, *, delimiter=",", encoding="utf-8-sig")` exige
exatamente esses 39 cabeçalhos e as colunas `Carimbo de data/hora` e
`E-mail para recebimento da cópia do TCLE`, totalizando 41. A ordem física do CSV
pode variar; o mapeamento continua literal. Cabeçalhos desconhecidos, ausentes
ou duplicados abortam com erro seguro. As duas colunas administrativas são
descartadas sem armazenar seus nomes/valores nos diagnósticos do resultado.

O importador configurável `import_forms_csv` permanece disponível. O parâmetro
opcional `allowed_extra_headers` exige o conjunto exato de cabeçalhos mapeados
mais os extras declarados; `None` mantém o descarte/sinalização de extras da
Etapa 3. `import_official_forms_csv` usa esse controle para verificar as 41 colunas.

Inteiros simples 0–4 e alternativas com travessão, como `2 — Às vezes` e
`2 — Moderadamente`, passam pela conversão já existente, com rótulos exatos do
esquema. Decimais como `5,5`, `5.5` e `8.0` são aceitos nos campos numéricos
decimais. Campos inteiros continuam rejeitando `2.0`; o contrato canônico não
foi relaxado. `Não se aplica` continua distinto de zero e ausência. Não houve
alteração de itens, inversão, dimensões ou fórmulas ESB-eu.

Uso futuro, apenas com arquivo local autorizado fora do repositório:
`result = import_official_forms_csv(private_path)` (importar a função de
`training.import_forms`). Nenhum arquivo real foi aberto para implementar ou
verificar esta etapa. A compatibilidade foi testada exclusivamente com CSVs
manualmente sintetizados segundo o formato documentado na solicitação. Se a
exportação mudar, o modo oficial falhará explicitamente; revisar a documentação
de cabeçalhos ou fornecer mapa aprovado, sem inspecionar respostas privadas.

Testes: `python -m unittest discover -s tests -p test_official_forms_csv.py -v`.
A suíte completa permanece `python -m unittest discover -s tests -v`. Os testes
incluem interrupções por consentimento/idade/matrícula, privacidade, espaço final,
41 colunas e cálculos independentes sobre exemplos ESB-eu sintéticos. O teste
anterior de inelegibilidade foi atualizado para a nova precedência solicitada,
sem retirar as verificações de erro dos critérios e dos registros elegíveis.

### Pré-processamento para regressão (Etapa 4)

`training/regression_preprocessing.py` é independente de `preprocess.py`, ainda
utilizado pelo treinamento de classificação. Não lê arquivos, treina modelos ou
produz métricas. Reutiliza o esquema e `calculate_esbeu_scores`.

`prepare_regression_data(records, predictors=ALLOWED_PREDICTORS)` recebe registros
canônicos completos e elegíveis, inclusive `ImportResult.records`, revalida-os e
retorna `RegressionData`: `X` (DataFrame canônico), `y` (Series `esbeu_overall`) e
`predictors` (tupla ordenada). Os índices posicionais de X/y coincidem e preservam
a ordem da entrada. Nenhum ajuste ocorre nessa preparação. O contêiner é frozen;
os DataFrames/Series retornados são cópias independentes, mas continuam mutáveis.

A lista explícita permitida contém os 22 campos contextuais:
`age_range`, `course_area`, `semester`, `course_shift`, `subject_count`,
`mandatory_hours_week`, `independent_hours_week`, `employment`, `work_hours_week`,
`sleep_hours`, `sleep_quality`, `physical_activity_days`, `subject_overload`,
`assessment_pressure`, `extraclass_overload`, `study_rest_difficulty`,
`study_work_difficulty`, `teacher_difficulties`, `peer_difficulties`,
`personal_support`, `academic_support`, `financial_concern`.

`validate_predictors` permite apenas subconjuntos não vazios e sem duplicatas
dessa lista. Itens/escores ESB-eu, consentimento, elegibilidade, e-mail, metadados
e campos derivados/desconhecidos são proibidos. Registros com extras também são
rejeitados pelo esquema. Alterar os itens do desfecho não altera X. Não existe
seleção automática por tipo numérico nem seleção baseada em y.

`build_regression_preprocessor(predictors=ALLOWED_PREDICTORS, scale_numeric=True)`
retorna um `Pipeline` **não ajustado**, com `ContextFrameValidator` seguido de
`ColumnTransformer`. X deve conter exatamente os preditores configurados, na
mesma ordem, tanto no fit quanto no transform. O validador rejeita ausências,
tipos incorretos, alternativas inválidas e colunas extras antes da codificação.

- Valores quantitativos e ordinais inteiros mantêm os valores canônicos antes
  do escalonamento opcional por `StandardScaler`.
- Categorias ordinais textuais (`age_range`, `physical_activity_days`) seguem
  os índices 0-based das alternativas ordenadas do esquema. São postos ordinais,
  não idades exatas ou intervalos de duração presumidos.
- Categorias nominais usam `OneHotEncoder`, sem ordem artificial. Não há campos
  contextuais binários no instrumento atual; os critérios binários são excluídos.
- `study_work_difficulty` usa One-Hot para as respostas 0–4 e `Não se aplica`.
  Essa estratégia preserva as alternativas sem atribuir posição ordinal ao NA.
  Não se faz imputação numérica para esse campo nem se confunde NA com zero.
- As categorias One-Hot são aprendidas apenas no treino. Categorias não vistas
  nesse ajuste, mesmo válidas no instrumento, causam erro explícito em novos
  registros, sem reajustar o codificador. Isso inclui NA ausente no treino.
- Todos os campos são obrigatórios: ausências são rejeitadas, sem imputação ou
  criação de desfechos parciais. Registros vazios/inelegíveis são rejeitados.

Exemplo com registros inteiramente fictícios, em `ai-service`:

```python
from training.form_schema import ANALYTICAL_FIELDS
from training.regression_preprocessing import (
    prepare_regression_data, build_regression_preprocessor,
)

synthetic = {f.identifier: f.choices[0] if f.choices else f.minimum
             for f in ANALYTICAL_FIELDS}
data = prepare_regression_data([synthetic, dict(synthetic)])
X_train, X_test = data.X.iloc[:1], data.X.iloc[1:]
processor = build_regression_preprocessor(data.predictors)
train_matrix = processor.fit_transform(X_train)
test_matrix = processor.transform(X_test)
feature_names = processor.get_feature_names_out()
```

João deverá dividir os registros/índices de X e y antes do ajuste. Para validação
cruzada, inserir o pré-processador não ajustado no Pipeline de cada estimador,
ajustando novamente somente no treino de cada fold. Nunca ajustar antes da
divisão nem usar `fit_transform` no conjunto de teste. Para preservar unidades,
`scale_numeric=False` desativa a padronização. A saída é uma matriz densa; nomes
e ordem das características ficam disponíveis após fit, com prefixos
`numeric__`/`categorical__`. As definições e unidades originais permanecem em
`FIELDS_BY_ID`; os passos ajustados expõem categorias e parâmetros aprendidos.

Testes: `python -m unittest discover -s tests -p test_regression_preprocessing.py -v`.
A suíte completa permanece `python -m unittest discover -s tests -v`. Os testes
usam apenas dados sintéticos e cobrem isolamento de estatísticas, categorias,
proibição de preditores e estabilidade da transformação. Nenhuma dependência
foi adicionada. Verificação local realizada com scikit-learn 1.8.0/pandas 2.3.3;
as versões fixadas em requirements (1.5.1/2.2.2) não foram executadas neste ambiente.
O legado continua com sua imputação e aliases próprios, sem reutilização dessas
regras no fluxo de regressão. O formato documentado do CSV oficial é tratado na
Etapa 4.1 acima. Modelos e avaliação pertencem à Etapa 5 e não foram implementados aqui.

### Testes e auditoria do legado

Na pasta `ai-service`, sem instalar dependências adicionais:

```bash
python -m unittest discover -s tests -v
python -m unittest discover -s tests -p test_esbeu_scoring.py -v
python -m compileall -q app training tests
```

`tests/test_esbeu_scoring.py` cobre extremos, resultados manuais, agrupamentos,
ponderação correta da média geral, contribuição individual dos itens, respostas
inválidas, imutabilidade, preservação da entrada e compatibilidade com a Etapa 1.

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

As regras ocultas de validação do Google Forms não aparecem no PDF. O formato
de cabeçalhos documentado posteriormente na Etapa 4.1 está implementado sem
acessar respostas reais. Mudanças futuras exigem revisão explícita do mapa.
O mapeamento e a pontuação direta dos
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
