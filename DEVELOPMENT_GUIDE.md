# Desenvolvimento local

Mantenha PostgreSQL de desenvolvimento e três processos separados: frontend
Next.js (3000), backend NestJS (3001) e FastAPI (8000). O backend usa HTTP e não
importa treinamento Python. Consulte o [README](README.md) para instalação.

## RF/A privado

O fluxo atual usa `rf-a-candidate-v1`, preservando seu caráter experimental.
Siga [RF_A_TEAM_SETUP.md](docs/RF_A_TEAM_SETUP.md) para receber e verificar o
pacote, criar ambiente compatível e configurar o processo. O CSV não é necessário
para inferência. O `.env.example` da IA não é carregado automaticamente.

Configure `BURNOUTSENSE_MODEL_DIR`,
`BURNOUTSENSE_DATASET_VERSION=rf-a-candidate-v1`,
`BURNOUTSENSE_TRUST_LOCAL_MODEL=true`, `BURNOUTSENSE_EXPERIMENTAL_MODEL=true`
e `BURNOUTSENSE_API_KEY` própria, com pelo menos 24 caracteres. A mesma chave
deve estar em `AI_SERVICE_API_KEY` do NestJS, nunca no frontend.

Em `ai-service`, com `$Python` definido para o venv compatível:

```powershell
& $Python -B -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Alternativa com configuração privada externa já preparada:

```powershell
.\run_api.ps1 -EnvFile $ConfigPrivada -Python $Python -Port 8000
```

`/health` verifica processo; `/ready` autenticado confirma o modelo. Ausência
do pacote não gera escore alternativo. Use `/v1/examples` para entradas fictícias.

O utilitário `app.configure_local` atende o pacote histórico v1 baseado em
`run-manifest.private.json`. Ele não configura os pacotes RF/A ou Ridge atuais.
A documentação científica v1 permanece em [MODEL_CARD.md](ai-service/MODEL_CARD.md).

## Ambiente Python

Use Python 3.12 em venv separado. Para reproduzir artefatos Windows AMD64, siga
[ambiente v2](docs/ML_OPTIMIZATION_V2_ENVIRONMENT.md). `requirements.txt` fixa
dependências diretas; `requirements-dev.txt` inclui testes. Esses arquivos não
substituem a conferência das versões exigidas pelo pacote.

```powershell
& $Python -B -m unittest discover -s tests
& $Python -m pip check
```

Em Windows restrito, `BURNOUTSENSE_TEST_TMPDIR` pode apontar para uma pasta
temporária externa gravável. Não use a pasta de respostas.

## Backend, frontend e banco

Em `backend`, use `pnpm install --frozen-lockfile`, configure `.env` sem
sobrescrever configuração existente e confira `DATABASE_URL`. Em banco de
desenvolvimento autorizado:

```powershell
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm start:dev
```

Se uma DLL do Prisma estiver em uso, identifique e encerre apenas o backend de
desenvolvimento correspondente antes de gerar o cliente. Não apague dependências
nem resete o banco para resolver o bloqueio.

Em `frontend`, use `npm ci`, configure `NEXT_PUBLIC_API_URL` e execute
`npm run dev`. Nunca exponha chaves da IA com `NEXT_PUBLIC_`.

Gravações do contrato antigo estão retiradas (410). Dashboard, registro e
histórico usam `esbeu_assessments`, com distinção observado/estimado. Não converta
registros antigos. Lembretes ficam desativados por padrão; SMTP não é pré-requisito
da inferência local.

## Ridge opcional

A comparação sob demanda está em [RIDGE_SHADOW.md](docs/RIDGE_SHADOW.md).
É desativada por padrão, exige autenticação, ambiente local/teste, loopback,
origem confiável e hash próprio. Não é chamada pelo NestJS e não altera a resposta
oficial. Não é necessário retreinar para usar um pacote privado aprovado.

## Testes e privacidade

Em `backend`: `pnpm test --runInBand` e `pnpm build`. Em `frontend`:
`node --test tests/esbeu-form.test.mjs` e `npm run build`.

A homologação com navegador e banco usa ambiente próprio e fixtures fictícias;
veja [Etapa 10](docs/ETAPA_10_INTEGRATION.md). Não use o banco da aplicação.

Antes de publicar, confira Git e índice. Não inclua CSVs, modelos, segredos ou
relatórios individuais. Treinamentos são privados e explícitos; novas avaliações
não alimentam modelos automaticamente.
