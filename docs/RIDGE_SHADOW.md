# Ridge candidato: comparação local em paralelo ao RF/A

## Arquitetura encontrada e preservada

O formulário converte as 22 respostas canônicas em `context`. O NestJS envia
somente esse contexto ao FastAPI em `POST /v1/predict`, usando `X-API-Key`.
O serviço carrega o pacote RF/A explicitamente configurado, valida os campos,
reordena as colunas por `ALLOWED_PREDICTORS` e executa o pipeline persistido.
O NestJS valida e persiste exclusivamente a previsão oficial em
`estimatedOverall`. O frontend apresenta esse número com duas casas decimais
e `/ 4`. **Não há conversão para 1–10 no fluxo ESB-eu atual.**

O pipeline transforma ordinais textuais em ranks canônicos, padroniza numéricas
e codifica nominais com one-hot usando o vocabulário fixo do formulário.
`study_work_difficulty` usa one-hot para 0–4 e “Não se aplica”, preservado como
categoria separada. Valores ausentes ou inválidos são rejeitados; não há nova
imputação. Os 14 itens nunca são preditores. A medição direta opcional continua
independente da estimativa contextual.

Nenhuma regra de orientação, alerta, classificação, autenticação ou persistência
foi modificada. O carregador RF/A e os arquivos do backend/frontend não precisam
de mudanças para utilizar esta comparação.

## Isolamento implementado

`POST /v1/experimental/shadow/predict` é uma comparação **sob demanda**, local,
autenticada e desativada por padrão. Não é captura automática das avaliações
dos estudantes. O NestJS não chama esse endpoint e não há seletor no frontend.
`/v1/predict`, `/ready`, `/v1/model` e as métricas oficiais continuam usando
exclusivamente o modelo oficial configurado.

O endpoint só é registrado com `BURNOUTSENSE_SHADOW_RIDGE_ENABLED=true` e
`BURNOUTSENSE_ENVIRONMENT=local` ou `test`. A conexão deve vir de IP loopback;
`X-Forwarded-For` não concede acesso. Não exponha a instância por proxy público:
um proxy local pode ocultar a origem remota. Vincule o servidor a `127.0.0.1`.
Uma configuração declarada como `local` não comprova que a máquina seja de
desenvolvimento; a configuração e a exposição de rede precisam ser revisadas.

O Ridge tem carregador, cache, diretório, confiança e SHA-256 separados. Não há
fallback que o promova ao modelo oficial. Ausência, corrupção ou exceção do
Ridge geram um status sanitizado no endpoint de comparação; a previsão RF/A
permanece disponível. A rota oficial sequer executa o Ridge.

Os dois modelos compartilham o processo Python: isso isola falhas tratadas,
mas não protege contra encerramento do processo ou esgotamento de recursos.
Não há novos logs de respostas, previsões ou gravações no banco.

## Treinamento final reproduzível

O comando `training.train_ridge_candidate` recebe caminhos explícitos. Entrada,
gerador, referência e saída devem permanecer na raiz privada fora do Git.
O destino deve ser novo, e o programa não sobrescreve artefatos. Não execute
sem autorização do responsável pelos dados. A opção `--trust-generator` confirma
confiança técnica no código Python local revisado; não é autorização institucional.

Pré-requisitos: ambiente Python compatível do snapshot v2; CSV controlado cujo
hash corresponda à execução anterior; diretório privado do experimento
`dimensional-time-correction-...` com `generator.py`, manifesto e referência;
gerador dimensional original no layout privado esperado pela versão corrigida.
Não instale geradores ou modelos de procedência desconhecida.

Esses componentes não são baixados nem descobertos automaticamente pelo comando.
O gerador corrigido atualmente procura o diretório irmão original pelo nome
abaixo. Preserve esse layout no armazenamento privado fornecido pelo responsável:

```text
runs/
  dimensional-plus100-20261102-01/
    experiment.py
  dimensional-time-correction-20261102-01/
    generator.py
    manifest.json
    integrity.sha256.json
    results.aggregate.json
```

`$ExperimentoCorrigido` deve apontar à segunda pasta. Os scripts e manifestos
devem ter origem conhecida e os hashes esperados; o CSV controlado também precisa
corresponder à referência. O comando recusa referências ausentes/incompatíveis.
Esses pré-requisitos são para reproduzir o treinamento privado, não para inferir
com o pacote pronto. Não copie a estrutura privada inteira para o Git.

O treinador verifica os hashes dos dois códigos e carrega somente os corpos
originais das funções de geração e orçamento temporal. Não importa o script
experimental inteiro, que tem dependências complementares fora desta entrega.
Fórmulas, ruídos e sequência de chamadas ao RNG permanecem os mesmos. Os códigos
continuam exigindo origem confiável: essa seleção por AST não é um sandbox.

No diretório `ai-service`, substitua as variáveis abaixo pelos caminhos privados
da máquina. Nenhum CSV ou artefato treinado deve ser adicionado ao Git.

```powershell
& $Python -B -m training.train_ridge_candidate `
  --input $CsvControlado `
  --experiment-dir $ExperimentoCorrigido `
  --private-root $RaizPrivada `
  --output $NovoDiretorioRidge `
  --trust-generator
if ($LASTEXITCODE -ne 0) { throw 'Treinamento privado não concluído.' }
```

Procedimento fixo:

1. Verificar caminhos, permissões, hashes de entrada/gerador/referência e protocolo.
2. Importar os 36 reais válidos e seus 22 contextuais; calcular y pela média dos
   14 itens, sem incluir itens ou dimensões em X.
3. Comparar alpha 1 e 10 em `KFold(3, shuffle=True, random_state=42)`. Em cada
   treinamento interno, gerar 100 novos perfis corrigidos; validar somente nos
   reais reservados. Seeds sintéticas `SeedSequence([42,0,0,j+1])`, j de 0 a 2.
   Escolher MAE, depois RMSE e ordem da grade.
4. Gerar 100 perfis corrigidos com seed 42 usando somente o treinamento final
   de 36 pessoas para exclusões de semelhança. Não ler o CSV misto fixo.
5. Ajustar o pipeline em 36 reais com peso 1 e 100 artificiais com peso 0,25.
   O StandardScaler continua sem pesos, ajustado nessa mistura de treinamento.
6. Repetir o ajuste e verificar seleção e coeficientes idênticos. Persistir um
   único candidato final. Essa repetição é verificação de reprodução, não avaliação.

O gerador tem versão `dimensional-weekly-budget/2`, reserva de 21 horas semanais
e rejeição por `7 × sono + estudo obrigatório + independente + trabalho + 21 <= 168`.
Reutiliza as fórmulas/ruídos originais sem corrigir os 14 itens dos perfis aceitos.
Os 100 artificiais **não representam novos participantes**.

Saídas privadas:

- `context_regressor.private.joblib`: pipeline com contrato, versões, coeficientes,
  scaler aprendido e categorias; nenhuma matriz de respostas é salva.
- `input-schema.json`: contrato canônico das 22 entradas.
- `ridge-candidate-manifest.private.json`: origem/quantidades/pesos, alpha,
  gerador/seed/hash, seleção interna, versões, ordem das colunas, hashes de entrada
  e referências, escopo exploratório e reprodução.
- `failed.json`, quando uma execução reservada falhar: invalida o candidato.

Os parâmetros aprendidos do scaler e do encoder estão dentro do pipeline
persistido; o manifesto registra sua estratégia e a ordem das colunas expandidas.
Não interpretar as métricas de seleção interna como generalização. As métricas
externas no manifesto são referências do experimento anterior, não medidas de
desempenho do refit final.

## Ativar e desativar a comparação

Mantenha as variáveis RF/A descritas em `RF_A_TEAM_SETUP.md`, inclusive diretório,
versão, confiança e chave. O CSV não é necessário para inferência.

Somente em um processo local dedicado, configure adicionalmente:

```powershell
$env:BURNOUTSENSE_ENVIRONMENT = 'local'
$env:BURNOUTSENSE_SHADOW_RIDGE_ENABLED = 'true'
$env:BURNOUTSENSE_SHADOW_RIDGE_DIR = $DiretorioRidge
$env:BURNOUTSENSE_SHADOW_RIDGE_SHA256 = $Sha256AprovadoDoRidge
$env:BURNOUTSENSE_TRUST_SHADOW_RIDGE = 'true'
& $Python -B -m uvicorn app.main:app --host 127.0.0.1 --port 8002 --no-access-log
```

A porta 8002 é uma sugestão para uma instância local separada, sem redirecionar o
NestJS existente. Use uma porta livre. `BURNOUTSENSE_MODEL_DIR` continua sendo o
RF/A; nunca aponte essa variável para o Ridge. O hash aprovado deve ser conferido
com o manifesto de origem conhecida. Hash não transforma um pickle desconhecido
em seguro: carregá-lo pode executar código.

Envie o mesmo corpo de `/v1/predict`, com somente `context`, para a rota shadow,
usando a chave existente no header. Não cole a chave em documentação ou logs.
Para obter uma entrada inteiramente fictícia, use `/v1/examples` autenticado.

Contrato aditivo:

```json
{
  "scope": "local_shadow_not_official",
  "official": { "esbeu_overall": 1.5, "model_name": "random_forest", "...": "metadados existentes" },
  "candidate": { "esbeu_overall": 1.4, "model_name": "ridge", "...": "metadados próprios" },
  "shadow_status": "available",
  "shadow_code": null
}
```

O exemplo é ilustrativo; os objetos completos seguem `PredictionResponse`, com
versão do dataset e SHA-256 do modelo. São aceitos apenas escores finitos de 0 a 4.
Não há conversão 1–10, porcentagem de risco ou clipping silencioso. Uma previsão
Ridge fora do domínio retorna `rejected`, código `SHADOW_OUTSIDE_DOMAIN` e
`candidate=null`. Falha de carga/execução retorna `unavailable` e
`SHADOW_UNAVAILABLE`. O objeto `official` mantém a previsão RF/A válida.
Falha do próprio RF/A continua sendo erro oficial, sem substituição pelo Ridge.

Para desativar, encerre a instância local ou defina
`BURNOUTSENSE_SHADOW_RIDGE_ENABLED=false` e reinicie seu processo. A rota deixa
de existir. Não é necessário alterar RF/A, frontend, backend ou banco.

## Testes e limites da entrega

```powershell
& $Python -B -m unittest discover -s tests -p test_ridge_shadow.py
& $Python -B -m unittest discover -s tests
```

Os testes unitários usam somente fixtures fictícias e artefatos temporários:
reprodução, gerador por treinamento interno, 22 campos e ordem, NA, entradas
inválidas, confiança/hash, modelos separados, gates local/produção, autenticação,
loopback, falhas e domínio. Os resultados executados e a comparação fictícia com
os dois artefatos reais estão no relatório privado da execução.

Verificações executadas nesta implementação:

| Verificação | Resultado |
|---|---|
| Testes específicos Ridge/shadow | 21 aprovados |
| Suíte Python na árvore isolada de publicação | 314 aprovados |
| Testes backend na árvore isolada de publicação | 23 aprovados |
| Testes unitários do formulário frontend | 5 aprovados |
| Build NestJS e build Next.js com Webpack | Aprovados |
| `pip check`, sintaxe Python e `git diff --check` | Aprovados |
| Comparação HTTP em memória com os dois modelos reais | 3 contextos fictícios, RF/A inalterado |

O treinamento privado escolheu alpha 10. A reprodução do refit foi verificada;
os resultados históricos de MAE/RMSE/R² não foram recalculados como avaliação
do modelo final. A comparação local ocorreu por transporte ASGI, sem rede ou
banco; não foi uma nova sessão de navegador, nem teste de implantação.
Os testes finais usaram uma árvore isolada com apenas os arquivos desta entrega;
testes e alterações locais de outros trabalhos não fazem parte dessas contagens.
As dependências Node existentes foram reutilizadas por ligação de diretório, sem
instalação. O Turbopack recusou essa ligação externa; o build foi concluído com
`npm run build -- --webpack`, sem mudar a configuração da aplicação.

A correção do carregamento das funções do gerador foi comparada ao carregamento
anterior em três seeds: perfis completos e contadores foram idênticos. Essa
verificação não leu o CSV real nem retreinou o candidato persistido.

Arquivos desta implementação: `app/shadow_ridge.py`, `training/train_ridge_candidate.py`,
`tests/test_ridge_shadow.py`, este documento e mudanças aditivas em
`app/main.py`, `app/settings.py`, `app/schemas.py` e `.env.example`.

O candidato foi escolhido após vários experimentos sobre os mesmos 36 estudantes.
As métricas são pós-hoc e não demonstram eficácia clínica ou generalização em
novos participantes. Comparar entradas fictícias verifica software e comportamento,
não qualidade científica. Nova validação real independente e revisão humana
continuam necessárias antes de considerar qualquer substituição do RF/A.
Mesmo sem respostas armazenadas dentro do pipeline, o artefato não deve ser
considerado automaticamente anônimo: mantenha-o privado e compartilhe somente
com os responsáveis autorizados.
