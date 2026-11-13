# RF/A experimental — instalação da equipe

CSV não é necessário para inferência. O modelo e seus arquivos auxiliares são
privados: receber por canal restrito, nunca por commit ou anexo público de PR.
Não carregar joblib de fonte desconhecida. Hash comprova integridade, não origem.

## Código e ambiente

Para a versão publicada em main, após preservar alterações locais:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
```

Não descarte alterações ou force atualizações se houver divergência. Na primeira
instalação, clone o repositório da equipe. Para testar uma entrega ainda em PR,
selecione a branch indicada no PR em vez de main; não misture trabalhos locais.

O RF/A continua sendo o modelo oficial do fluxo atual, ainda experimental no
sentido científico. A comparação [Ridge shadow](RIDGE_SHADOW.md) é opcional,
desativada por padrão e não exige substituir este pacote ou configurar o frontend.

Referência: Windows AMD64, CPython 3.12.14. Criar venv externo ao repositório
usando essa versão instalada, sem alterar Python global:

```powershell
python --version
python -m venv $Venv
if ($LASTEXITCODE -ne 0) { throw 'Falha criando venv' }
$Python = Join-Path $Venv 'Scripts/python.exe'
& $Python -m pip install -r ai-service/requirements-v2-windows-py312.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha instalando snapshot' }
& $Python ai-service/tools/verify_v2_environment.py
& $Python -m pip check
```

Definir `$Venv` antes com um novo caminho externo. O snapshot de 48 versões não
é um lock de hashes; seguir a documentação de ambiente para auditoria mais
forte. NumPy 1.26.4, pandas 2.2.2, scikit-learn 1.5.1 e joblib 1.4.2 precisam
coincidir com o artefato. Não atualizar automaticamente se houver divergência.

## Pacote privado

Receber quatro arquivos, juntos, em diretório local restrito fora do Git:
`context_regressor.private.joblib`, `candidate-manifest.private.json`,
`input-schema.json`, `v2-reference.aggregate.json`. Receber também o manifesto
`rf-a-candidate-v1.sha256.json`, separado da pasta de quatro arquivos, por canal
confiável. Não compartilhar configurações ou chaves de outra máquina.

```powershell
$Hashes = Get-Content $ManifestoIntegridade -Raw | ConvertFrom-Json
foreach ($Entry in $Hashes.PSObject.Properties) {
  $Atual = (Get-FileHash (Join-Path $ModeloDir $Entry.Name) -Algorithm SHA256).Hash
  if ($Atual.ToLowerInvariant() -ne $Entry.Value) { throw 'Integridade inválida' }
}
```

Definir `$ModeloDir` e `$ManifestoIntegridade` com os arquivos recebidos.
SHA-256 esperado do modelo:
`6b26b0b3eb7f0c2c342d157498387c7196a685e04a4009bfe236bdeb64b7c72c`.
O pacote contém estatísticas aprendidas de pesquisa e deve continuar privado.

## FastAPI — terminal 1

Dentro de `ai-service`, configurar somente o processo local:

```powershell
$env:BURNOUTSENSE_MODEL_DIR = $ModeloDir
$env:BURNOUTSENSE_DATASET_VERSION = 'rf-a-candidate-v1'
$env:BURNOUTSENSE_TRUST_LOCAL_MODEL = 'true'
$env:BURNOUTSENSE_EXPERIMENTAL_MODEL = 'true'
# BURNOUTSENSE_API_KEY: provisionar segredo próprio com pelo menos 24 caracteres.
& $Python -B -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Não colocar segredo em Git, frontend ou captura de terminal.
Saúde pública: `http://127.0.0.1:8000/health`. Prontidão autenticada:

```powershell
$Headers = @{ 'X-API-Key' = $env:BURNOUTSENSE_API_KEY }
Invoke-RestMethod http://127.0.0.1:8000/ready -Headers $Headers
$Exemplo = Invoke-RestMethod http://127.0.0.1:8000/v1/examples -Headers $Headers
$Body = $Exemplo.prediction_request | ConvertTo-Json -Depth 10
Invoke-RestMethod http://127.0.0.1:8000/v1/predict -Method Post -Headers $Headers -ContentType 'application/json' -Body $Body
```

O exemplo é fictício e não salva avaliação. Esperado: `experimental=true`,
`model_name=random_forest`, versão `rf-a-candidate-v1`, escore de 0 a 4.

## Backend e frontend — terminais separados

PostgreSQL deve ser exclusivamente de desenvolvimento. Configurar as variáveis
reais de `backend/.env.example` em ambiente privado: DATABASE_URL, PORT=3001,
FRONTEND_URL=http://localhost:3000, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
AI_SERVICE_URL=http://127.0.0.1:8000 e AI_SERVICE_API_KEY igual ao segredo do
FastAPI. Manter DAILY_REMINDER_ENABLED=false para teste. Não reutilizar os
segredos ilustrativos do exemplo. Não executar migrações em produção.

Dentro de `backend`:

```powershell
pnpm install --frozen-lockfile
pnpm prisma:generate
# Somente após conferir DATABASE_URL do banco local de desenvolvimento:
pnpm exec prisma migrate deploy
pnpm start:dev
```

Dentro de `frontend`, configurar NEXT_PUBLIC_API_URL=http://localhost:3001:

```powershell
npm ci
npm run dev
```

Acesse http://localhost:3000 com uma conta fictícia e use **Fazer primeiro
registro** para preencher as 22 perguntas. A medição direta é opcional.
Confira o índice na interface e confirme `random_forest` e `rf-a-candidate-v1`
em `GET /v1/model`, com a chave de serviço.

## Problemas e retorno

- `/health` responde mas `/ready` retorna 503: conferir diretório externo,
  quatro arquivos, hashes, versões, ausência de `failed.json`, modo experimental
  e confiança local. Reiniciar após trocar pacote: o serviço mantém cache.
- 401: chave ausente/divergente; 422: contexto inválido ou estimativa fora do
  domínio; 503 no NestJS: conferir URL/porta/chave e disponibilidade do Python.
- `No module named training`: iniciar a partir de `ai-service`, com a mesma
  estrutura de código que define as classes persistidas.
- Reversão: parar processos e restaurar as variáveis anteriores; remover ou
  definir BURNOUTSENSE_EXPERIMENTAL_MODEL=false e restaurar o diretório/versão
  anteriores. O carregador original exige seu próprio pacote v1; o pacote RF/A
  não vira compatível com ele ao desligar a flag. Sem pacote anterior, manter
  indisponibilidade explícita, sem fallback fictício. Não apagar histórico.

O modelo é exploratório, sem validação independente. Métricas exibidas são
referências v2, não garantia individual ou diagnóstico. A regra de aplicabilidade
estudo/trabalho permanece documentada; não houve recodificação do candidato.
