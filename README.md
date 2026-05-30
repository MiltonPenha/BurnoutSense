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

## Fluxo do protótipo TCC1

O fluxo principal validado para a entrega do TCC1 é:

```text
cadastro -> login -> registro diário -> backend -> ai-service -> banco -> histórico/dashboard
```

O frontend deve priorizar os resultados persistidos pelo backend, incluindo nível de risco, confiança, principais fatores e modelo utilizado. Cálculos locais podem existir apenas como fallback quando não houver resultado real salvo.

Para instruções de execução do ambiente local, consulte [INSTRUCOES_COLABORADORES.md](./INSTRUCOES_COLABORADORES.md).

Também há uma tela simples de homologação em `/status` para verificar backend, banco, AI Service e carregamento do modelo durante a apresentação.

---

## Privacidade e LGPD

Os dados coletados têm finalidade acadêmica e preventiva, limitada ao acompanhamento dos indicadores informados pelo estudante. O projeto deve manter minimização de dados, uso restrito ao contexto do TCC, transparência sobre limitações do modelo e aviso claro de que a análise não substitui avaliação clínica.

Como evolução futura, recomenda-se implementar exclusão completa de conta e dados, revisão de consentimento e políticas formais para eventual uso fora do ambiente acadêmico.

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
