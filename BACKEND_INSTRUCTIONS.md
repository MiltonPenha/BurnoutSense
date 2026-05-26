# Instruções do Backend

Este documento orienta os colaboradores a rodar e testar o backend NestJS do BurnoutSense.

O backend usa autenticação própria com access token JWT e refresh token opaco com rotação e revogação.

## Estrutura

- `AuthModule`: registro, login, refresh token e logout
- `UsersModule`: perfil autenticado e exclusão de conta
- `AssessmentsModule`: criação e histórico das avaliações
- `ResultsModule`: consulta dos resultados de predição
- `AiModule`: simulador de classificação para o TCC1
- `PrismaModule`: acesso ao PostgreSQL

## Variáveis de ambiente

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

A API ficará em `http://localhost:3001`.

## Fluxo de autenticação

1. `POST /auth/register` cria o usuário, salva `passwordHash` e retorna tokens.
2. `POST /auth/login` valida senha e retorna tokens.
3. O frontend envia `Authorization: Bearer <accessToken>` nas rotas protegidas.
4. `POST /auth/refresh` recebe o refresh token, revoga a sessão antiga e emite novos tokens.
5. `POST /auth/logout` revoga a sessão atual ou todas as sessões do usuário.

O refresh token não é salvo em texto puro. O banco guarda apenas `refreshTokenHash` em `auth_sessions`.

## Endpoints

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Users

- `GET /users/me`
- `DELETE /users/me`

### Assessments

- `POST /assessments`
- `GET /assessments`
- `GET /assessments/:id`

### Results

- `GET /results/:assessmentId`

### AI

- `POST /ai/predict`

## Segurança e LGPD no protótipo

- Senhas são armazenadas com hash bcrypt.
- Access token tem expiração curta.
- Refresh token é opaco, rotacionado e revogável.
- Helmet é usado para headers básicos de segurança.
- CORS é restrito por `FRONTEND_URL`.
- Login/register/refresh têm rate limit.
- `passwordHash`, tokens e senhas não devem aparecer em logs ou respostas.
- Cada usuário acessa apenas suas próprias avaliações e resultados.
- `DELETE /users/me` remove a conta e dados relacionados por cascata.
- O sistema coleta apenas dados necessários ao protótipo: nome, e-mail, senha e indicadores da avaliação.
- A classificação é uma estimativa preventiva, não diagnóstico clínico.

## Testes manuais

Veja `backend/http/requests.http` para exemplos de chamadas no REST Client, Insomnia ou Postman.
