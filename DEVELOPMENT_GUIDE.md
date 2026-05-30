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
DATABASE_URL="postgresql://burnoutsense:burnoutsense@localhost:5432/burnoutsense?schema=public"
FRONTEND_URL="http://localhost:3000"
AI_SERVICE_URL="http://localhost:8000"
JWT_ACCESS_SECRET="change-this-access-secret"
JWT_REFRESH_SECRET="change-this-refresh-secret"
```

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
10. Excluir um registro e confirmar atualização da lista.

## Observações de TCC1

- O BurnoutSense é uma ferramenta acadêmica de apoio preventivo.
- O resultado não representa diagnóstico clínico.
- Tempo de tela é armazenado como variável separada, pois pode ocorrer junto com estudo ou trabalho.
- Melhorias avançadas de IA, tuning e comparações científicas mais profundas ficam para o TCC2.
