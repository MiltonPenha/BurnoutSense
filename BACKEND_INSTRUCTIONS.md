# Instrucoes do Backend

Este documento orienta os colaboradores a rodar e testar o backend NestJS do BurnoutSense.

O backend usa autenticacao propria com access token JWT e refresh token opaco com rotacao e revogacao. A classificacao de risco agora vem do microsservico FastAPI em `ai-service/`; o backend nao calcula mais o `riskLevel` com regra mockada.

## Estrutura

- `AuthModule`: registro, login, refresh token e logout
- `UsersModule`: perfil autenticado e exclusao de conta
- `AssessmentsModule`: criacao e historico das avaliacoes
- `ResultsModule`: consulta dos resultados de predicao
- `AiModule`: integracao com o microsservico FastAPI de IA
- `PrismaModule`: acesso ao PostgreSQL

## Variaveis de ambiente

Crie `backend/.env` a partir de `backend/.env.example`:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://burnoutsense:burnoutsense@localhost:5432/burnoutsense?schema=public"
FRONTEND_URL="http://localhost:3000"
JWT_ACCESS_SECRET="change-this-access-secret"
JWT_REFRESH_SECRET="change-this-refresh-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
AI_SERVICE_URL="http://localhost:8000"
```

Nunca versionar `.env` real, tokens, senhas ou secrets.

## Como rodar

```bash
docker compose up -d
cd backend
corepack prepare pnpm@9.15.0 --activate
corepack pnpm install
cp .env.example .env
corepack pnpm run prisma:generate
corepack pnpm run prisma:migrate
corepack pnpm run seed
corepack pnpm run start:dev
```

No Windows PowerShell, crie o `.env` assim:

```powershell
Copy-Item .env.example .env
```

A API ficara em `http://localhost:3001`.

## Como rodar o microsservico de IA

Antes de criar uma avaliacao em `POST /assessments`, o `ai-service` precisa estar rodando e com o modelo treinado em `ai-service/saved_models/burnout_model.pkl`.

```bash
cd ai-service
pip install -r requirements.txt
python -m training.train_model
uvicorn app.main:app --reload
```

Se o modelo ainda nao existir, o backend retornara erro ao tentar gerar a predicao. Isso e intencional para evitar usar classificacao mockada sem perceber.

## Fluxo de autenticacao

1. `POST /auth/register` cria o usuario, salva `passwordHash` e retorna tokens.
2. `POST /auth/login` valida senha e retorna tokens.
3. O frontend envia `Authorization: Bearer <accessToken>` nas rotas protegidas.
4. `POST /auth/refresh` recebe o refresh token, revoga a sessao antiga e emite novos tokens.
5. `POST /auth/logout` revoga a sessao atual ou todas as sessoes do usuario.

O refresh token nao e salvo em texto puro. O banco guarda apenas `refreshTokenHash` em `auth_sessions`.

## Endpoints

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Users

- `GET /users/me`
- `PATCH /users/me`
- `DELETE /users/me`

`PATCH /users/me` permite atualizar `name`, `emailAlerts` e `dailyReminder`. O e-mail de login nao e alterado por esse endpoint.

### Assessments

- `POST /assessments`
- `GET /assessments`
- `GET /assessments/:id`

### Results

- `GET /results/:assessmentId`

### AI

- `POST /ai/predict`

O endpoint `POST /ai/predict` usa o mesmo fluxo do backend: envia os indicadores para `AI_SERVICE_URL/predict`, normaliza o `risk_level` para `LOW`, `MEDIUM` ou `HIGH` e retorna fatores explicativos derivados dos indicadores enviados.

## Seguranca e LGPD no prototipo

- Senhas sao armazenadas com hash bcrypt.
- Access token tem expiracao curta.
- Refresh token e opaco, rotacionado e revogavel.
- Helmet e usado para headers basicos de seguranca.
- CORS e restrito por `FRONTEND_URL`.
- Login/register/refresh tem rate limit.
- `passwordHash`, tokens e senhas nao devem aparecer em logs ou respostas.
- Cada usuario acessa apenas suas proprias avaliacoes e resultados.
- `DELETE /users/me` remove a conta e dados relacionados por cascata.
- O sistema coleta apenas dados necessarios ao prototipo: nome, e-mail, senha e indicadores da avaliacao.
- A classificacao e uma estimativa preventiva, nao diagnostico clinico.

## Testes manuais

Veja `backend/http/requests.http` para exemplos de chamadas no REST Client, Insomnia ou Postman.
