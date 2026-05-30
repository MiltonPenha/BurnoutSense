# Development Guide

This guide describes the recommended local setup for BurnoutSense development and TCC1 validation.

## Prerequisites

- Node.js.
- npm for the frontend.
- pnpm for the backend.
- Python 3.11 or newer for the AI service.
- Docker Desktop for PostgreSQL.

## Recommended Startup Order

1. Start PostgreSQL.
2. Configure backend and frontend environment variables.
3. Run Prisma migrations.
4. Train or validate the AI model.
5. Start the AI service.
6. Start the backend.
7. Start the frontend.

## PostgreSQL With Docker

From the project root:

```bash
docker compose up -d postgres
```

Local database settings:

- Host: `localhost`
- Port: `5432`
- User: `burnoutsense`
- Password: `burnoutsense`
- Database: `burnoutsense`

Current note: `docker-compose.yml` starts PostgreSQL only. Backend, frontend, and the AI service are still started separately.

## Backend

Enter the backend folder:

```bash
cd backend
```

Install dependencies:

```bash
pnpm install
```

Create `.env` from `.env.example` and check these values:

```env
DATABASE_URL="postgresql://burnoutsense:burnoutsense@localhost:5432/burnoutsense?schema=public"
FRONTEND_URL="http://localhost:3000"
AI_SERVICE_URL="http://localhost:8000"
JWT_ACCESS_SECRET="change-this-access-secret"
JWT_REFRESH_SECRET="change-this-refresh-secret"
```

Generate the Prisma Client and apply migrations:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

Open Prisma Studio:

```bash
pnpm prisma:studio
```

Start the backend:

```bash
pnpm start:dev
```

Default URL: `http://localhost:3001`

## Frontend

Enter the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Start the frontend:

```bash
npm run dev
```

Default URL: `http://localhost:3000`

## AI Service

Enter the AI service folder:

```bash
cd ai-service
```

Create and activate a virtual environment if needed:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Train the model when the dataset file is available:

```bash
python -m training.train_model
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Useful endpoints:

- `GET http://localhost:8000/health`
- `POST http://localhost:8000/predict`
- `GET http://localhost:8000/model-info`
- `GET http://localhost:8000/model-metrics`

## Technical Status

With the backend, database, and AI service running, open:

```text
http://localhost:3000/status
```

This page calls `GET http://localhost:3001/status` and shows:

- Backend online/offline.
- Database online/offline.
- AI Service online/offline.
- Model loaded or unavailable.

## Manual Validation Flow

1. Open `http://localhost:3000`.
2. Create an account.
3. Log in.
4. Create a daily assessment record.
5. Confirm that the backend called the AI service.
6. Confirm that the prediction result was saved in `prediction_results`.
7. Check the dashboard, history, and assessment detail pages.
8. Edit a record and confirm it redirects back to history.
9. Check the technical status page.
10. Delete a record and confirm the list updates.

## TCC1 Notes

- BurnoutSense is an academic preventive support tool.
- The result is not a clinical diagnosis.
- Screen time is stored as a separate variable because it can overlap with study or work time.
- Advanced AI improvements, tuning, and deeper scientific comparisons are left for TCC2.
