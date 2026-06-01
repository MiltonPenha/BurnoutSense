# Guia de Desenvolvimento

Este guia descreve a forma recomendada de executar o BurnoutSense em ambiente local para desenvolvimento e validação do TCC1.

## Pré-requisitos

- Node.js.
- npm para o frontend.
- pnpm para o backend.
- Python 3.11 ou superior para o ai-service.
- Docker Desktop para subir o PostgreSQL.

## Ordem Recomendada de Execução

1. Subir o PostgreSQL.
2. Configurar as variáveis de ambiente do backend e do frontend.
3. Rodar as migrations do Prisma.
4. Treinar ou validar o modelo de IA.
5. Subir o ai-service.
6. Subir o backend.
7. Subir o frontend.

## PostgreSQL com Docker

Na raiz do projeto:

```bash
docker compose up -d postgres
```

Configuração local do banco:

- Host: `localhost`
- Porta: `5432`
- Usuário: `burnoutsense`
- Senha: `burnoutsense`
- Banco: `burnoutsense`

Observação atual: o `docker-compose.yml` sobe apenas o PostgreSQL. Backend, frontend e ai-service ainda devem ser executados separadamente.

## Backend

Entre na pasta do backend:

```bash
cd backend
```

Instale as dependências:

```bash
pnpm install
```

Crie o arquivo `.env` a partir de `.env.example` e confira estes valores:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://burnoutsense:burnoutsense@localhost:5432/burnoutsense?schema=public"
FRONTEND_URL="http://localhost:3000"
JWT_ACCESS_SECRET="change-this-access-secret"
JWT_REFRESH_SECRET="change-this-refresh-secret"
JWT_ACCESS_EXPIRES_IN="30m"
JWT_REFRESH_EXPIRES_IN="7d"
AI_SERVICE_URL="http://localhost:8000"
ENABLE_PREVENTIVE_CALIBRATION=false
SMTP_HOST=""
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="BurnoutSense <no-reply@burnoutsense.local>"
DAILY_REMINDER_ENABLED=true
DAILY_REMINDER_HOUR=12
DAILY_REMINDER_MINUTE=0
DAILY_REMINDER_TIMEZONE="America/Sao_Paulo"
#GEMINI_API_KEY=""
GEMINI_INSIGHTS_MODEL="gemini-2.5-flash-lite"
#OPENAI_API_KEY=""
OPENAI_INSIGHTS_MODEL="gpt-5.4-mini"
```

`GEMINI_API_KEY` é a opção recomendada para gerar alertas preventivos e recomendações por IA generativa no dashboard. `OPENAI_API_KEY` continua opcional como alternativa. Sem uma dessas chaves, o sistema mantém o resultado de risco da IA local, mas não inventa dicas pré-prontas.

As variáveis `SMTP_*` habilitam envio real de e-mails. Sem SMTP configurado, o teste de notificações informa `not_configured` e o backend não simula envio real. O lembrete diário usa `DAILY_REMINDER_*` e roda no backend enquanto a aplicação estiver ativa.

### Regras do registro diário

- A data do registro pode ser hoje ou uma data passada, mas não pode ser futura.
- Horas de sono precisam ser maiores que zero para salvar o registro.
- A soma de horas de sono, horas de estudo e tempo de tela não pode ultrapassar 24 horas.
- O humor predominante é salvo como contexto visual do registro, mas não é convertido em feature enviada para o modelo de IA.
- A calibração preventiva do backend fica desligada por padrão (`ENABLE_PREVENTIVE_CALIBRATION=false`). Se ativada, ela apenas ajusta levemente o score e marca a origem como `MODEL_WITH_PREVENTIVE_CALIBRATION`, sem transformar `LOW` ou `MEDIUM` diretamente em `HIGH`.

Gere o Prisma Client e aplique as migrations:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

Abra o Prisma Studio:

```bash
pnpm prisma:studio
```

Suba o backend:

```bash
pnpm start:dev
```

URL padrão: `http://localhost:3001`

## Frontend

Entre na pasta do frontend:

```bash
cd frontend
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo `.env.local` a partir de `.env.example`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Suba o frontend:

```bash
npm run dev
```

URL padrão: `http://localhost:3000`

## AI Service

Entre na pasta do ai-service:

```bash
cd ai-service
```

Crie e ative um ambiente virtual, se necessário:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

Treine o modelo quando o arquivo do dataset estiver disponível:

```bash
python -m training.train_model
```

Suba a API:

```bash
uvicorn app.main:app --reload --port 8000
```

Endpoints úteis:

- `GET http://localhost:8000/health`
- `POST http://localhost:8000/predict`
- `GET http://localhost:8000/model-info`
- `GET http://localhost:8000/model-metrics`

## Status Técnico

Com backend, banco e ai-service rodando, acesse:

```text
http://localhost:3000/status
```

Essa tela consulta `GET http://localhost:3001/status` e mostra:

- Backend online/offline.
- Banco online/offline.
- AI Service online/offline.
- Modelo carregado ou indisponível.

## Fluxo Manual de Validação

1. Abrir `http://localhost:3000`.
2. Criar uma conta.
3. Fazer login.
4. Criar um registro diário.
5. Confirmar que o backend chamou o ai-service.
6. Confirmar que o resultado da predição foi salvo em `prediction_results`.
7. Conferir dashboard, histórico e detalhe do registro.
8. Editar um registro e confirmar retorno ao histórico.
9. Conferir a tela de status técnico.
10. Atualizar perfil e testar preferências de notificação.
11. Excluir um registro e confirmar atualização da lista.

## Observações de TCC1

- O BurnoutSense é uma ferramenta acadêmica de apoio preventivo.
- O resultado não representa diagnóstico clínico.
- Tempo de tela é armazenado como variável separada, pois pode ocorrer junto com estudo ou trabalho.
- Melhorias avançadas de IA, tuning e comparações científicas mais profundas ficam para o TCC2.
