# BurnoutSense ML Optimization v2 — protocolo exploratório

Base: `origin/feature/ml-experiments`, commit
`e89f5eee19f4edb0e4ec72ef20061f0db7cf5321`. Esta extensão não modifica a v1,
seus relatórios, artefatos, contratos HTTP ou integração da aplicação.

## Hipótese e limites

Investigar se menos variáveis contextuais melhoram estabilidade/generalização.
A hipótese foi formulada **após observar a v1**. Comparações na mesma coleta
são exploratórias; não constituem validação externa independente. Nenhum valor
de teste sintético é resultado científico. Não há diagnóstico ou classes de risco.

## Preditores e grade previamente fixada

`training.optimization_v2.PREDICTOR_SETS` contém:

- A: os 22 campos de `ALLOWED_PREDICTORS`.
- B: sleep_hours, sleep_quality, mandatory_hours_week, independent_hours_week,
  subject_overload, assessment_pressure, extraclass_overload,
  study_rest_difficulty, study_work_difficulty, personal_support,
  academic_support, financial_concern (12).
- C: sleep_hours, sleep_quality, subject_overload, assessment_pressure,
  study_rest_difficulty, personal_support, financial_concern (7).

Todos seguem a ordem canônica, independentemente da ordem da lista conceitual.
Itens, escores ESB-eu, consentimento e metadados não podem entrar nos pipelines.
Nenhuma variável é excluída do projeto. A entrada é `RegressionData` com os 22
preditores canônicos: `prepare_regression_data(imported.records)` preserva X/y.
O desfecho continua sendo calculado exclusivamente pelo módulo ESB-eu existente.

A grade padrão repete exatamente sete configurações por conjunto (21 candidatas):

| Família | Parâmetros variáveis |
| --- | --- |
| Dummy | média do treino |
| Ridge | alpha: 1, 10 |
| Random Forest | max_depth: 2, 3; min_samples_leaf: 3 |
| SVR | C: 0.1, 1; kernel: rbf |

Demais parâmetros são os defaults explícitos de `regression_models.py` da v1:
forest com 100 árvores/n_jobs=1; SVR epsilon=0.1/gamma=scale; seed=42.
Linear permanece na v1, sem participação na v2. A grade foi deliberadamente
reduzida em relação à v1: não atribuir diferenças v1–v2 exclusivamente à redução
de variáveis. **Dentro da v2**, as configurações são idênticas entre A/B/C.
Grades alternativas são limitadas a 60 candidatas, sem duplicatas, exigindo
as mesmas configurações/ordem e as quatro famílias em cada conjunto.
Congelar qualquer alteração antes de examinar resultados; não adaptar a grade
aos folds externos ou ampliar buscas retrospectivamente.

## Avaliação aninhada

`run_optimization_v2(data)` usa `ExperimentProtocol(5, 3, 3, 42)` por padrão:
5 folds externos, 3 internos, 3 repetições. KFold embaralhado com seeds registradas:
externa `(seed + repetição_zero_based) mod 2**32`; interna
`(seed + 1000 + repetição_zero_based * outer_splits + fold_1_based) mod 2**32`.
Todas as candidatas compartilham as mesmas partições de cada avaliação.

Em cada treino externo, validação interna seleciona conjuntamente conjunto,
algoritmo e parâmetros. Critério: menor MAE médio interno, depois RMSE; empates
exatos preferem menos preditores, ordem dummy/ridge/forest/svr e ordem do catálogo.
Uma candidata com qualquer falha interna fica indisponível naquele treino externo;
não é avaliada pela média de apenas seus folds bem-sucedidos.
Todas as escolhas são congeladas **antes** de calcular resultados externos.

Relatam-se também os 12 grupos A/B/C × família, cada um com hiperparâmetros
selecionados internamente. São comparações descritivas para inspeção de complexidade;
não escolher retrospectivamente o vencedor por suas médias externas e apresentar
essa média como desempenho imparcial. A avaliação do procedimento conjunto é
reportada separadamente. Dummy A é a referência pareada em cada fold externo;
Dummy B/C permanece na comparação controlada (mesma previsão por média de y).

O pipeline é seleção determinística de colunas → pipeline canônico de
validação/codificação/escalonamento → regressor. Cada trial cria instâncias novas.
Nenhum estado de teste entra no fit. Vocabulários categóricos completos vêm do
esquema, sem aprender categorias de teste. NA mantém representação própria.
Não há seleção por associações globais, imputação global ou clipping das previsões.

Não há ajuste de modelo final, serialização, promoção a produção ou seleção
baseada nos resultados externos. Essa decisão exige uma etapa posterior revisada.

## Relatório retornado

Um dict JSON-serializável, sem modelos ajustados ou dados individuais:

- Versão, origem declarada (`synthetic` ou `real_authorized`), protocolo, número
  agregado de registros, versões de NumPy/pandas/scikit-learn, conjuntos e catálogo.
- Auditoria por treino externo: candidatas, médias internas MAE/RMSE,
  número de falhas e códigos de erro/aviso sem mensagens de estimadores.
- Folds externos por grupo e do procedimento: escolha, métricas, tamanhos
  agregados de treino/teste, falhas e avisos. Nenhum índice de participante,
  resposta individual ou previsão é retornado.
- Média e desvio-padrão amostral entre folds de MAE, RMSE e R², contagens de
  válidos, indefinidos e falhos. R² negativo é preservado; indefinido é null com
  motivo `constant_target`/`test_size_lt_2`. Desvio com menos de dois valores é null.
- Diferença pareada `MAE(candidato) − MAE(Dummy)`: negativa indica melhoria;
  média, desvio, contagem de pares e número de vitórias/empates/derrotas.
  Falha em qualquer membro exclui o par e é contada explicitamente.
- Frequências de escolha de conjuntos, famílias e configurações (inclusive zero).
  São escolhas **tentadas**; falha externa posterior não apaga a seleção interna.

Não interpretar desvio-padrão de folds sobrepostos como intervalo de confiança.
Não há acurácia percentual, risco clínico ou confiança individual. Métricas
indefinidas/falhas não são fabricadas; uma execução com falhas exige revisão.

## Execução privada futura — não realizada nesta tarefa

Após autorização local explícita, confirmar consentimento, independência das
linhas e configuração literal do CSV. Fixar protocolo/grade, registrar hash da
base em manifesto privado e usar ambientes de dependências compatíveis. A opção
`data_origin` é metadado, **não autorização automática**.

Exemplo de integração futura, a partir de `ai-service`, somente em sessão privada:

```python
import json
from pathlib import Path
from training.import_forms import import_official_forms_csv
from training.regression_preprocessing import prepare_regression_data
from training.optimization_v2 import run_optimization_v2
from training.optimization_v2_validation import verify_optimization_v2

repo = Path.cwd().resolve().parent
# Definir em sessão autorizada; nunca colocar caminhos privados em código versionado.
input_path = Path(PRIVATE_INPUT).resolve()
output_path = Path(NEW_PRIVATE_V2_REPORT).resolve()
assert not input_path.is_relative_to(repo)
assert not output_path.is_relative_to(repo)
assert input_path != output_path
assert output_path.suffix == ".json"
# Não abrir nem sobrescrever relatórios/modelos/manifestos da v1.
assert not output_path.exists()
# Somente o responsável pode autorizar; este prompt é uma barreira operacional,
# não comprovação de consentimento ou aprovação institucional.
confirmation = input("Autorização explícita do responsável já obtida? Digite EXECUTAR V2: ")
if confirmation != "EXECUTAR V2":
    raise SystemExit("Execução não confirmada.")
data = prepare_regression_data(import_official_forms_csv(input_path).records)
report = run_optimization_v2(data, data_origin="real_authorized")
verification = verify_optimization_v2(report)
# Preservar os diagnósticos mesmo se a verificação reprovar a completude.
with output_path.open("x", encoding="utf-8") as stream:
    json.dump(report, stream, ensure_ascii=False, allow_nan=False, indent=2)
if not verification.complete:
    raise RuntimeError("Execução incompleta/inconsistente; revisar o relatório privado.")
# complete=True significa somente integridade técnica. Revisão humana continua obrigatória.
```

Não imprimir data.X, data.y, registros, previsões ou exceções internas. Manter até
os relatórios agregados em armazenamento privado; combinações em grupos pequenos
podem ser sensíveis. Não versionar CSV, modelos, saídas ou manifestos privados.
Não executar v1/v2 no mesmo destino. Nada é enviado a serviços externos.
Os resultados v1 informados pelo pesquisador não são copiados, recalculados ou
substituídos por este módulo. Não há execução no import do módulo.

## Testes

```powershell
cd ai-service
python -m unittest discover -s tests -p test_optimization_v2.py -v
python -m unittest discover -s tests -q
python -m compileall -q training tests
```

Todos usam respostas fictícias geradas em memória. Os testes unitários usam protocolo
reduzido 2×2×1 e 12 candidatas (uma por família/conjunto, forest com duas árvores)
para verificar infraestrutura; isso não é a execução científica 5×3×3.
O catálogo padrão 21/protocolo 5×3×3 são verificados como configuração, sem busca
com participantes. A suíte API existente exige `httpx` de `requirements-dev.txt`; arquivos
temporários dos testes existentes podem exigir execução local fora do sandbox.

## Revisão final: completude e protocolo sintético integral

`optimization_v2_validation.verify_optimization_v2(report)` devolve
`V2Verification(complete, issues, requires_human_review=True)`. Não modifica o
relatório nem apaga falhas. Verifica catálogo, conjuntos, folds, tamanhos das
partições, métricas, justificativas de R², seleção determinada pela auditoria
interna, resumos, pareamento e frequências. Qualquer falha interna ou externa,
comparação incompleta, conteúdo malformado ou inconsistência impede `complete`.
Não fornece selo de aprovação científica nem valida a origem/consentimento dos
dados. O rótulo `real_authorized` continua sendo metadado declarativo.

O teste `test_optimization_v2_final.py` acrescenta 30 registros sintéticos e
executa o protocolo padrão completo duas vezes: 5 folds externos × 3 internos ×
3 repetições, com as 21 candidatas e os hiperparâmetros originais. Verifica as
15 avaliações externas de cada comparação, 15 escolhas, igualdade dos relatórios
nas repetições, ausência de dados individuais e separação das partições em cada
trial interno/externo. São 1125 ajustes sintéticos por execução; nenhum resultado
desses ajustes é evidência científica sobre participantes.

```powershell
python -m unittest discover -s tests -p 'test_optimization_v2*.py' -v
```

Para reprodução das versões fixadas, usar Python 3.12 em ambiente virtual isolado
e instalar `requirements-dev.txt`, que inclui `requirements.txt`. Os requisitos
originais não são modificados por essa revisão. As dependências transitivas não
possuem lock completo: registrar também `pip freeze` no ambiente privado de uma
execução científica. Executar a suíte completa antes de autorizar a coleta real.

A integração privada continua usando `import_official_forms_csv`, sem nomes de
colunas presumidos fora do seu mapa oficial. O responsável deve verificar versão
do formulário, consentimento, autorização aplicável e armazenamento privado.
O prompt de confirmação não substitui essa evidência externa. O módulo não
acessa CSVs, não obtém autorização institucional e não promove modelos.

### Verificação do ambiente nesta revisão

O ambiente isolado Python 3.12.14, fora do repositório, foi instalado a partir de
`requirements-dev.txt`: FastAPI 0.111.0, uvicorn 0.30.1, pandas 2.2.2, NumPy
1.26.4, scikit-learn 1.5.1, joblib 1.4.2 e httpx 0.28.1. `pip check` passou.
A suíte Python completa executou 185 testes com sucesso, incluindo as duas
execuções integrais sintéticas da v2. O teste de integração também passou no
ambiente local Python 3.14.4/scikit-learn 1.8.0. Não se exige igualdade numérica
de relatórios entre versões diferentes; a reprodutibilidade é testada no mesmo
ambiente com seed fixa.

Os cinco testes unitários de formulário frontend passaram. Jest/backend e E2E
não foram executados nesta revisão: as dependências Node locais não estão
instaladas e o E2E também requer PostgreSQL/serviços isolados. Essa limitação não
é aprovação do fluxo de produção e não autoriza execução com participantes.
