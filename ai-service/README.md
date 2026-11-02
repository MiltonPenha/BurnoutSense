# Microsserviço independente ESB-eu

FastAPI serve regressão contextual ESB-eu. O NestJS consome HTTP; treinamento e inferência Python permanecem em `ai-service/`. Não há treinamento dentro do backend nem upload de CSV na API. O fluxo atual utiliza RF/A; o Ridge candidato é uma comparação local separada, sem substituir a previsão oficial.

## Preparação

Python 3.12; dependências diretas fixadas em `requirements.txt`, testes em `requirements-dev.txt`. Para os artefatos auditados Windows AMD64, consulte o [ambiente reproduzível](../docs/ML_OPTIMIZATION_V2_ENVIRONMENT.md). Veja [execução local](../DEVELOPMENT_GUIDE.md). Configure externamente `BURNOUTSENSE_MODEL_DIR`, `BURNOUTSENSE_DATASET_VERSION`, `BURNOUTSENSE_TRUST_LOCAL_MODEL=true` apenas para artefato conhecido e `BURNOUTSENSE_API_KEY` com pelo menos 24 caracteres.

O pacote RF/A usa `context_regressor.private.joblib`, `candidate-manifest.private.json`, `input-schema.json` e `v2-reference.aggregate.json`, com `BURNOUTSENSE_EXPERIMENTAL_MODEL=true` e versão `rf-a-candidate-v1`. Consulte [instalação RF/A](../docs/RF_A_TEAM_SETUP.md). Esse flag seleciona o carregador RF/A; não ativa o Ridge.

O carregador histórico v1, mantido para compatibilidade, usa `context_regressor.private.joblib`, `run-manifest.private.json`, `comparison.aggregate.json` e `protocol.private.json`, com o flag RF/A desligado. Não misture os formatos de pacote. Hash confirma integridade, não confiança em pickle. Versões das bibliotecas devem coincidir; configuração, CSV e artefatos ficam fora do Git. `/health` responde sem modelo, mas `/ready` e a previsão exigem pacote válido.

## Endpoints

Todas as rotas abaixo, exceto `/health`, exigem `X-API-Key`. Swagger: `/docs`.

| Método/rota | Finalidade |
|---|---|
| GET `/health` | Processo ativo; não garante modelo pronto |
| GET `/ready` | Modelo e relatórios carregados e verificados |
| GET `/v1/schema` | Esquemas canônicos dos 22 contextos e 14 itens |
| GET `/v1/examples` | Requisições artificiais geradas do esquema |
| POST `/v1/context/validate` | Valida contexto sem previsão |
| GET `/v1/model` | Nome, versão, preditores e domínio do modelo |
| GET `/v1/validation/metrics` | Agregados da CV aninhada já realizada |
| POST `/v1/predict` | `{context: {...}}` → ESB-eu geral estimada |
| POST `/v1/experimental/shadow/predict` | Comparação RF/A e Ridge; somente quando explicitamente habilitada em ambiente local/teste e conexão loopback |
| POST `/v1/esbeu/score` | `{items: {...}}` → ESB-eu observada e dimensões |
| POST `/v1/validation/compare` | `{context: {...}, items: {...}}` → observado, estimado e erro absoluto |
| POST `/v1/validation/evaluate` | `{cases: [{context: {...}, items: {...}}]}` → MAE, RMSE e R² agregados de 1–100 exemplos |

Os dois últimos endpoints não fazem CV, não reentrenam e não persistem exemplos. O escopo do lote é `caller_examples_not_cross_validation`. R² é `null`, com motivo, para alvo constante ou menos de dois exemplos; valores negativos são preservados. Não use as respostas de treino como teste independente.

Previsão exige exatamente os 22 contextos, com tipos e alternativas do esquema. Itens da escala e campos administrativos são rejeitados. Valores devem ser finitos, sem coerção de texto ou booleanos para números. Categoria válida do formulário, mesmo ausente do treino, é codificada pelo vocabulário completo; desconhecida é rejeitada. Os limites do esquema existente foram preservados (por exemplo, não foi criado um máximo novo para horas de sono).

Falhas de validação são sanitizadas, sem ecoar valores. A API não grava corpos de requisição, e o script desativa access logs. Limite de corpo 256 KiB, lote máximo 100. Erros 401/422/503; estimativas fora de 0–4 são rejeitadas sem clipping.

## Ridge shadow opcional

A rota shadow é ausente por padrão e em ambiente `production`. Exige a chave de serviço, `BURNOUTSENSE_SHADOW_RIDGE_ENABLED=true`, ambiente `local`/`test`, origem loopback, diretório privado próprio, SHA-256 aprovado e confiança específica no Ridge. Pode retornar 403 para origem não local. Não exponha a instância por proxy público.

Retorna `official`, `candidate` e `shadow_status`. Uma falha do Ridge mantém o objeto oficial e retorna candidato nulo com código sanitizado. `/v1/predict`, `/ready`, `/v1/model` e métricas oficiais não consultam o Ridge; não há persistência ou envio automático pelo NestJS. Escala 0–4, sem conversão 1–10. Veja [contratos, treinamento e ativação](../docs/RIDGE_SHADOW.md).

## Teste manual sem dados da pesquisa

Em Swagger, autorize a chave, execute `/ready`, copie o exemplo artificial de `/v1/examples` e use-o em `/v1/predict`, `/v1/validation/compare` ou `/v1/validation/evaluate`. Essas previsões servem ao teste funcional da API, não são resultados de participantes. Consulte métricas científicas em `/v1/validation/metrics`.

## Treinamento e contratos

`form_schema.py` define 39 campos analíticos; `import_forms.py` valida o CSV oficial de 41 colunas e descarta os dois campos administrativos. `esbeu_scoring.py` calcula o alvo; `regression_preprocessing.py` mantém os 22 preditores autorizados. `regression_models.py` constrói os cinco pipelines. `regression_evaluation.py` avalia configurações fixas (Etapa 6). `research_audit.py`, `regression_experiments.py` e `run_research_training.py` auditam e executam a CV aninhada privada (Etapas 7–8). `research_finalization.py` verifica fechamento; `regression_inference.py` persiste e verifica o pipeline.

Execute testes com `python -m unittest discover -s tests -v`. São dados artificiais exclusivos para software. A base real nunca é fixture. Consulte [cartão do modelo](MODEL_CARD.md) e [métricas](../docs/ESBEU_METRICS.md).

`train_rf_candidate.py` prepara o RF/A; `train_ridge_candidate.py` prepara o Ridge em diretório novo e privado, com 36 reais e 100 sintéticos corrigidos de peso 0,25. Exige gerador e referências privados revisados, não fornecidos automaticamente pelo Git. O refit final e a seleção interna não são nova avaliação de generalização. O [cartão v1](MODEL_CARD.md) e as métricas históricas permanecem preservados; as análises posteriores são exploratórias e pós-hoc.

## Metadados para a Etapa 10

`GET /v1/schema` também devolve `form_version=forms/1.0` e 36 definições públicas (22 contextuais e 14 itens), com perguntas, tipos, alternativas, rótulos, limites e instruções derivados de `form_schema.py`. O frontend não mantém cópia de categorias ou perguntas.

Previsão e `/v1/model` incluem `model_version=sha256:<identificador do artefato>` para rastreabilidade exata. É um identificador de integridade, não o modelo serializado, parâmetro aprendido, assinatura de participante ou índice de confiança. A configuração de confiança de origem continua obrigatória. O backend persiste esse identificador com cada avaliação; não envia userId, consentimento ou e-mail ao microsserviço.
