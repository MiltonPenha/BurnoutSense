# Desenvolvimento local

Mantenha os três processos separados: frontend Next.js (3000), backend NestJS (3001) e IA FastAPI (8000). O backend usa HTTP e não importa o treinamento Python.

## IA

Use Python 3.12 e ambiente virtual. Em `ai-service/`, instale `python -m pip install -r requirements.txt`. Para testes, instale também `-r requirements-dev.txt` e execute `python -m unittest discover -s tests -v`. Em ambientes Windows restritos, `BURNOUTSENSE_TEST_TMPDIR` deve apontar para uma pasta temporária gravável fora do repositório.

Gere a configuração privada, somente para o artefato produzido localmente:

```powershell
python -m app.configure_local --model-dir 'CAMINHO_PRIVADO/treinamento' --output 'CAMINHO_PRIVADO/service.private.env' --dataset-version BurnoutSense-final-v1-20261030 --trust-generated-model
.\run_api.ps1 -EnvFile 'CAMINHO_PRIVADO/service.private.env'
```

O gerador não sobrescreve arquivos e não exibe a chave. Consulte o arquivo privado localmente para configurar a mesma chave em `AI_SERVICE_API_KEY` do backend. Nunca use `NEXT_PUBLIC_` para essa chave. O script aceita `-Python CAMINHO_PYTHON` e `-Port 8000`. Abra `http://127.0.0.1:8000/docs`; use Authorize com `X-API-Key`.

O modelo e seus quatro arquivos de suporte necessários são descritos no README do serviço. A API não precisa do CSV para funcionar. `/health` verifica processo; `/ready` verifica carregamento real do modelo e autenticação.

## Backend e frontend

Em `backend/`: instale pelo `pnpm-lock.yaml` congelado, configure `.env` a partir de `.env.example`, execute `pnpm prisma:generate`, `pnpm build` e `pnpm test --runInBand`. Gere o cliente sem aplicar migrações durante esta revisão. Banco e autenticação continuam próprios do NestJS.

Em `frontend/`: `npm ci`, `npm run lint`, `npm run build`, `npm run dev`. Configure somente `NEXT_PUBLIC_API_URL` conforme `.env.example`. Não exponha a chave da IA no navegador.

As gravações antigas de avaliações estão retiradas (410). Dashboard, registro e histórico mostram aviso de transição. A futura integração deve usar o esquema contextual e persistir resultados ESB-eu em contrato próprio, com versão de base/modelo e distinção observado/estimado. Nenhum cálculo local deve produzir um resultado alternativo.

O agendador de lembretes permanece desativado por padrão durante a transição. Autenticação, perfil e notificações genéricas não enviam respostas da pesquisa para serviços de IA externos.

## Revisão de privacidade

Antes de qualquer commit, confira `git status --short` e a lista de arquivos rastreados. Nenhum CSV, planilha de respostas, pickle/joblib, env privado ou relatório individual pode ser incluído. Não execute `git add -f` para esses arquivos. Relatórios públicos devem conter apenas agregados revisados. O treinamento local é iniciado por `python -m training.run_research_training --config CAMINHO_CONFIG_PRIVADA`, com consentimento e configuração privados documentados; não rode automaticamente sobre respostas novas.
