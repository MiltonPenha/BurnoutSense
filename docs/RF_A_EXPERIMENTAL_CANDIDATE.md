# Candidato experimental Random Forest/A

Este fluxo separado não altera o protocolo v2 nem promove um modelo para
produção. A família RF/A foi escolhida após análises exploratórias dos mesmos
36 participantes. Não há validação independente do candidato final. O MAE
0,3543 ± 0,1255 descreve os folds RF/A anteriores; não garante precisão
individual, diagnóstico ou desempenho em novos estudantes.

## Treinamento e artefato

`training/train_rf_candidate.py` utiliza o CSV controlado privado já autorizado,
o importador oficial e `prepare_regression_data()`. Exige os mesmos hashes de
entrada, código científico e ambiente da avaliação v2, 36 registros utilizáveis
e permissões privadas. Os itens ESB-eu calculam somente o desfecho.

A busca é restrita às duas configurações RF/A existentes: 100 árvores,
`max_depth=2` ou `3`, `min_samples_leaf=3`, seed 42 e demais padrões preservados.
Aplica KFold interno de 3 folds, shuffle e seed 42 aos 36 registros; escolhe
menor MAE, depois RMSE e ordem do catálogo. Esse procedimento de ajuste final
segue a convenção já existente em `regression_experiments.py`, sem reutilizar
resultados externos para escolher a profundidade. O pré-processamento é
ajustado em cada treinamento interno. Depois reajusta o pipeline inteiro nos
36 registros. Não faz nova avaliação externa ou calibração.

Dentro de `ai-service`, com o Python reproduzido:

```powershell
& $Python -B -m training.train_rf_candidate --output $NovoDiretorioPrivado
if ($LASTEXITCODE -ne 0) { throw 'Treinamento não concluído' }
```

`$Python` é o executável do venv auditado. O destino deve ser novo, com pai
privado existente, sob a raiz privada e fora do Git. Não reutilizar destinos
anteriores. A entrada controlada é definida no fluxo local existente, sem
busca automática de outros CSVs.

Arquivos de saída:

- `context_regressor.private.joblib`: pipeline validado, transformação e RF.
- `candidate-manifest.private.json`: versão local, parâmetros, escores internos,
  seed, população agregada, versões, commit, hashes de entrada/fontes/artefatos.
- `input-schema.json`: contrato público das 22 variáveis, sem respostas.
- `v2-reference.aggregate.json`: métricas agregadas preexistentes por família A
  e do procedimento completo v2; não métricas de teste do ajuste final.
- Em falha: `failed.json`; o carregador rejeita esse diretório. Preservar as
  evidências, investigar e usar outro destino na próxima tentativa.

O modelo é sensível: árvores podem revelar estatísticas de treinamento. Todos
esses artefatos permanecem privados, sem upload ou versionamento Git. Pickle/
joblib pode executar código; o hash verifica integridade, não procedência.
Somente carregar a geração local conhecida. Preservar ACLs, impedir alteração
por terceiros e conferir o manifesto por canal confiável.

## Integração explícita de desenvolvimento

O carregador original da v1 continua sendo o padrão. Ativar o novo carregador
somente no processo local de desenvolvimento, por configuração externa:

```dotenv
BURNOUTSENSE_MODEL_DIR=<diretorio privado do candidato>
BURNOUTSENSE_DATASET_VERSION=rf-a-candidate-v1
BURNOUTSENSE_TRUST_LOCAL_MODEL=true
BURNOUTSENSE_EXPERIMENTAL_MODEL=true
BURNOUTSENSE_API_KEY=<segredo local, minimo de 24 caracteres>
```

Não copiar o segredo para código, chat, logs ou frontend. Um arquivo privado
`local-development.private.env` pode conter essa configuração. Para iniciar
o serviço no loopback usando esse arquivo, dentro de `ai-service`:

```powershell
& $Python -B -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log --env-file $ArquivoEnvPrivado
```

O backend usa os campos existentes `AI_SERVICE_URL=http://127.0.0.1:8000` e
`AI_SERVICE_API_KEY` igual ao segredo Python, além da configuração habitual de
autenticação e banco **de desenvolvimento**. Não há mudança de banco ou
migração para o candidato. O frontend mantém seu endpoint do backend.

Fluxo: Next.js → NestJS autenticado → FastAPI com `X-API-Key` → pipeline privado.
`POST /ai/predict` do NestJS encaminha `{"context": {...}}` para `/v1/predict`.
O formulário existente recebe o esquema canônico pelo backend. As avaliações
da aplicação continuam separando estimativa contextual e escore observado.
A interface identifica a estimativa como experimental e sem validação
independente. Não guarda o CSV de treinamento no banco.

## Contrato

A entrada contém **exatamente** os identificadores em `ALLOWED_PREDICTORS`, na
ordem canônica, incluindo `teacher_difficulties`. Categorias, limites numéricos
e valores `Não se aplica` são publicados em `/v1/schema` e `input-schema.json`.
Todos os campos são obrigatórios; ausência, null, infinitos, booleanos em
campos numéricos, categorias desconhecidas, campos extras e incoerência entre
emprego e horas são rejeitados. Não há imputação. Os 14 itens não são aceitos
no contexto; pertencem ao endpoint de escore observado.

Saída de `/v1/predict`:

```json
{
  "kind": "estimated_score",
  "esbeu_overall": 1.5,
  "model_name": "random_forest",
  "dataset_version": "rf-a-candidate-v1",
  "model_version": "sha256:<64 caracteres hexadecimais>",
  "contract_version": "esbeu-context-regression/1",
  "experimental": true
}
```

O número é apenas exemplo do contrato, não uma resposta real. O pipeline
carregado usa o mesmo pré-processamento persistido. Valores não finitos ou
fora de 0–4 são recusados, sem clipping. `422` indica contexto/estimativa
inválidos; `401`, chave inválida; `503`, modelo/configuração indisponíveis.
Não há probabilidade clínica, faixas novas, confiança ou fallback fictício.

`/v1/model` informa `validation_scope=exploratory_post_selection` e
`experimental=true`. `/v1/validation/metrics` informa
`scope=exploratory_v2_reference_not_candidate_validation`: as quatro famílias
de A e o procedimento completo da v2 são referências históricas explícitas.
Os escores internos usados para escolher a profundidade ficam no manifesto
privado e não são estimativa imparcial de generalização.

## Testes e limites

```powershell
& $Python -B -m unittest tests.test_rf_candidate tests.test_api -q
& $Python -B -m unittest discover -s tests -q
```

Os testes usam somente fixtures fictícias; nenhum CSV real é fixture. Verificam
reprodução de ajustes, persistência, hash, tipos, contrato HTTP e autenticação.
O teste existente `backend/test/verify-esbeu-e2e.py` aceita o arquivo privado de
configuração e verifica o candidato pelo NestJS. Cria seu próprio PostgreSQL,
contas e respostas fictícias em destino novo externo ao Git, sem acessar o
banco da aplicação. O teste opcional de navegador verifica Next.js e o rótulo
experimental. Seus parâmetros incluem `--private-env`, `--output`, `--pg-bin`,
`--node` e opcionalmente `--playwright-module`.

Treinamento e inferência não usam APIs externas. O treinamento utiliza o
bloqueio Python de sockets do fluxo local; isso não é isolamento de rede do
Windows. Inferência local necessita comunicação loopback entre serviços. Não
configurar o cliente NestJS para endpoints externos com dados pessoais. Não
registrar corpos de requisições, segredos ou previsões de participantes.

Seed e versões fixas favorecem reprodução no ambiente auditado; não prometem
identidade binária ou numérica entre todas as plataformas. O manifesto registra
fontes ainda não commitadas; os hashes, e não apenas o HEAD, identificam essa
implementação. Preservar uma cópia privada das fontes executadas para auditoria.
O comportamento nos extremos observado anteriormente permanece limitação.
Esta implementação não autoriza publicação do modelo ou uso clínico.
