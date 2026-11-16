# Desenvolvimento local

O [guia do fluxo diário](DAILY_TRACKING_LOCAL_SETUP.md) é a referência para
preparar o PostgreSQL de desenvolvimento e iniciar Next.js (3000), NestJS (3001)
e FastAPI (8000). O [guia RF/A](RF_A_TEAM_SETUP.md) cobre ambiente Python,
configuração e verificação dos quatro arquivos privados. O CSV de pesquisa fica
fora do fluxo de inferência.

## Problemas comuns

- Se uma DLL do Prisma estiver em uso, identifique e encerre apenas o processo
  de desenvolvimento do backend antes de rodar `pnpm exec prisma generate`.
  Preserve as dependências e o banco.
- O FastAPI não carrega `.env.example` automaticamente. Em `ai-service`, pode-se
  iniciar pelo script abaixo com a configuração privada já preparada.

```powershell
.\run_api.ps1 -EnvFile $ConfigPrivada -Python $Python -Port 8000
```

- `app.configure_local` atende o pacote histórico v1, com
  `run-manifest.private.json`. Para RF/A, use o guia da equipe. Para comparação
  local opcional com Ridge, consulte [Ridge em paralelo](../research/RIDGE_SHADOW.md).
- Em Windows restrito, `BURNOUTSENSE_TEST_TMPDIR` pode apontar para um diretório
  temporário externo e gravável, separado dos dados da pesquisa.

## Testes

Execute os blocos no diretório de cada subprojeto após instalar as dependências.

Em `ai-service`, com `$Python` apontando para o executável do ambiente virtual
compatível e as dependências de `requirements-dev.txt` instaladas:

```powershell
& $Python -B -m unittest discover -s tests
& $Python -m pip check
```

Em `backend`:

```powershell
pnpm test --runInBand
pnpm build
```

Em `frontend`:

```powershell
npm run typecheck
npm run lint
node --test tests/*.test.mjs
npm run build
```

O procedimento de [homologação com navegador e PostgreSQL isolado](../architecture/ETAPA_10_INTEGRATION.md#testes-reproduzíveis)
usa contas e entradas fictícias. O [guia do fluxo diário](DAILY_TRACKING_LOCAL_SETUP.md)
inclui verificações de cronologia, histórico e recálculo com o artefato RF/A.

Antes de publicar, confira os arquivos no índice do Git. CSVs de pesquisa,
modelos treinados, segredos e relatórios individuais ficam fora do repositório.
