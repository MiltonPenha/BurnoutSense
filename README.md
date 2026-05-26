# BurnoutSense

## Plataforma Inteligente para Detecção Precoce de Burnout Acadêmico

---

## Sobre o Projeto

O BurnoutSense é uma plataforma web desenvolvida com o objetivo de identificar sinais precoces de burnout acadêmico em estudantes universitários utilizando técnicas de Inteligência Artificial e Machine Learning.

A aplicação analisa indicadores acadêmicos, emocionais e comportamentais para realizar classificações de risco relacionadas ao esgotamento acadêmico, atuando como uma ferramenta computacional de apoio preventivo.

---

## Objetivo

Desenvolver uma aplicação inteligente capaz de auxiliar na identificação preventiva de burnout acadêmico por meio de modelos supervisionados de Machine Learning e análise de dados comportamentais.

---

## Inteligência Artificial

A Inteligência Artificial representa o núcleo principal do projeto, sendo responsável pela análise e classificação do risco de burnout acadêmico.

### Modelos Utilizados

- Random Forest
- Support Vector Machine (SVM)

### Variáveis Analisadas

- Horas de estudo
- Qualidade do sono
- Nível de estresse
- Ansiedade
- Tempo de tela
- Desempenho acadêmico
- Suporte social

---

## Dataset

### Student Lifestyle, Mental Health & Burnout Insight

Dataset disponível em:

https://www.kaggle.com/datasets/ayeshasiddiqa123/student-health

---

## Arquitetura da Aplicação

A aplicação será estruturada de forma modular e desacoplada.

### Frontend

- React
- Next.js
- TypeScript
- Tailwind CSS

### Backend

- Node.js
- NestJS

### Microsserviço de Inteligência Artificial

- Python
- FastAPI
- Scikit-learn
- Pandas
- NumPy

### Banco de Dados

- PostgreSQL

### Infraestrutura

- Docker
- Docker Compose

---

## Funcionalidades Previstas

- Cadastro de usuários
- Autenticação
- Registro de indicadores acadêmicos e emocionais
- Dashboard de risco
- Classificação automatizada
- Histórico de avaliações

---

## Métricas de Avaliação

Os modelos de Machine Learning serão avaliados utilizando:

- Accuracy
- Precision
- Recall
- F1-Score

---

## Observações

O BurnoutSense não possui finalidade clínica ou diagnóstica, funcionando exclusivamente como ferramenta computacional de apoio preventivo.

---

## Instruções Técnicas

O backend NestJS está em `backend/` e usa autenticação própria com JWT access token e refresh token revogável.

### Rodar PostgreSQL

```bash
docker compose up -d
```

### Rodar Backend

```bash
cd backend
corepack prepare pnpm@9.15.0 --activate
corepack pnpm install
cp .env.example .env
corepack pnpm run prisma:generate
corepack pnpm run prisma:migrate
corepack pnpm run seed
corepack pnpm run start:dev
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### Variáveis de Ambiente do Backend

```env
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=
PORT=3001
```

### Fluxo de Autenticação

1. Registrar usuário em `POST /auth/register`.
2. Fazer login em `POST /auth/login`.
3. Usar `Authorization: Bearer <accessToken>` em rotas protegidas.
4. Renovar token em `POST /auth/refresh`.
5. Fazer logout em `POST /auth/logout`.

O refresh token é salvo no banco apenas como hash e pode ser revogado.

### Testar Avaliação

Após login, envie uma avaliação para `POST /assessments` com os indicadores acadêmicos e comportamentais. O backend salva a avaliação, executa a IA simulada e retorna `riskLevel`, `confidence` e `mainFactors`.

### Frontend

Quando o frontend Next.js estiver disponível, configure:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

O login deve chamar `/auth/login`, guardar o `accessToken` em memória/contexto para o protótipo e enviar o header:

```http
Authorization: Bearer <accessToken>
```

Para produção, a preferência é evoluir para cookies `httpOnly`/`Secure` para o refresh token.

### Segurança e LGPD

- Senhas são armazenadas com hash bcrypt.
- Access token tem expiração curta.
- Refresh token é opaco, rotacionado e revogável.
- O backend usa Helmet, CORS restrito e rate limiting em autenticação.
- O sistema não retorna `passwordHash`.
- Cada usuário acessa apenas suas próprias avaliações e resultados.
- Os dados são usados apenas para cadastro, autenticação, preenchimento de avaliação, estimativa preventiva e histórico do próprio estudante.
- O protótipo coleta apenas dados necessários: nome, e-mail, senha e indicadores da avaliação.
- `DELETE /users/me` permite excluir a conta e dados relacionados.
- A classificação automatizada não é diagnóstico e exibe fatores principais usados na estimativa.

---

## Integrantes

- João Rafael Jordão Pereira
- Mateus Nauhan Vieira Matos
- Milton Rogério Dotto Penha Junior

---

## Orientador

Prof. Marco Antônio Montebello Junior

---

## Instituição

Centro Universitário Facens

---

## Status do Projeto

Em desenvolvimento.

---

## Licença

Projeto acadêmico desenvolvido para fins educacionais.
