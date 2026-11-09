# BurnoutSense

Antes de instalar, iniciar ou diagnosticar a aplicação localmente, leia o
[guia de execução do fluxo diário](docs/DAILY_TRACKING_LOCAL_SETUP.md).

- Para desenvolvimento e demonstração do TCC, execute o fluxo completo:
  PostgreSQL, FastAPI com o RF/A privado, NestJS e Next.js. Habilite
  `DAILY_CONTEXT_EVOLUTION_ENABLED=true` no `backend/.env` local e mantenha
  `ESBEU_ASSESSMENTS_ENABLED=true`. Reinicie o NestJS após alterar o ambiente.
- O recálculo diário agrega dados no backend e usa o RF/A existente. Não
  retreine, troque o modelo ou use um resultado fictício para contornar falhas.
- Se faltar o pacote RF/A ou o Python compatível, informe o bloqueio e siga o
  [guia de instalação da equipe](docs/RF_A_TEAM_SETUP.md). Não exponha chaves,
  configurações privadas, artefatos ou dados pessoais em logs ou commits.
- Use banco de desenvolvimento autorizado e contas fictícias para validação.
  Preserve dados e configurações existentes. Não use `prisma migrate reset`,
  `prisma db push` nem remova volumes para corrigir a instalação.
