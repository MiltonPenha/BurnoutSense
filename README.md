# BurnoutSense

## Plataforma inteligente para apoio preventivo ao burnout acadêmico

O BurnoutSense é uma aplicação web acadêmica voltada à identificação preventiva de sinais associados ao burnout em estudantes universitários. O sistema coleta registros diários, envia os indicadores para um serviço de Machine Learning e apresenta um histórico com nível de risco, fatores relevantes, alertas preventivos e recomendações geradas por IA.

O projeto não possui finalidade clínica ou diagnóstica. Ele funciona como uma ferramenta computacional de apoio, acompanhamento e estudo no contexto do TCC.

## Objetivo

Desenvolver uma solução full stack capaz de:

- registrar indicadores acadêmicos, comportamentais e de bem-estar;
- classificar preventivamente o risco de burnout acadêmico;
- manter histórico de avaliações por estudante;
- apoiar a interpretação dos resultados com alertas e recomendações;
- documentar limitações técnicas e éticas do uso de IA nesse contexto.

## Fluxo principal

```text
cadastro -> login -> registro diário -> backend -> ai-service -> banco -> histórico/dashboard
```

O frontend prioriza os resultados persistidos pelo backend, incluindo nível de risco, confiança, principais fatores e modelo utilizado. Cálculos locais existem apenas como fallback quando ainda não há resultado real salvo.

## Funcionalidades atuais

- Cadastro e login de usuários.
- Registro diário de indicadores acadêmicos e de bem-estar.
- Edição e exclusão de registros.
- Validação de data, impedindo registros futuros.
- Validação de horas, impedindo que sono, estudo e tempo de tela ultrapassem 24 horas no mesmo dia.
- Classificação de risco via AI Service.
- Histórico de registros com risco, humor, estresse, sono e pressão acadêmica.
- Dashboard com métricas consolidadas.
- Alertas preventivos e recomendações geradas por IA generativa.
- Tela `/status` para verificar backend, banco, AI Service e carregamento do modelo.

## Inteligência Artificial

O projeto utiliza dois tipos de IA:

- **Modelo preditivo local:** classifica o risco de burnout acadêmico por meio do AI Service em Python/FastAPI.
- **IA generativa opcional:** gera alertas preventivos e recomendações no dashboard a partir do resultado real do último registro.

### Modelo preditivo

O AI Service utiliza Scikit-learn para servir um modelo treinado a partir do dataset de referência:

[Student Lifestyle, Mental Health & Burnout Insight](https://www.kaggle.com/datasets/ayeshasiddiqa123/student-health)

Modelo atual documentado no AI Service:

- Random Forest
- Estratégia final sem `dropout_risk` e `internet_usage`
- Métricas e limitações registradas em `ai-service/MODEL_CARD.md`

### Features utilizadas pelo modelo

- Horas de estudo
- Desempenho acadêmico
- Pressão acadêmica
- Nível de estresse
- Ansiedade
- Depressão
- Qualidade do sono
- Atividade física
- Tempo de tela
- Suporte social
- Expectativa familiar
- Estresse financeiro

O campo de humor predominante é mantido como contexto visual do registro, mas não é convertido em feature enviada ao modelo, pois não há feature equivalente no treinamento atual.

### Resultado exibido

O resultado preventivo separa três conceitos:

- `riskLevel`: classe prevista pelo modelo (`LOW`, `MEDIUM` ou `HIGH`).
- `riskScore`: escala visual de 1 a 10 usada na interface.
- `confidence`: confiança/probabilidade da classe prevista.

O `riskScore` não é fixo por classe. Ele varia dentro da faixa de cada nível: baixo entre 1 e 4, moderado entre 5 e 7 e alto entre 8 e 10, usando a confiança retornada pelo modelo.

### IA generativa

Os alertas e recomendações do dashboard podem ser gerados com Gemini, usando:

```env
GEMINI_API_KEY=""
GEMINI_INSIGHTS_MODEL="gemini-2.5-flash-lite"
```

Também existe suporte opcional para OpenAI como alternativa:

```env
OPENAI_API_KEY=""
OPENAI_INSIGHTS_MODEL="gpt-5.4-mini"
```

Sem chave de IA generativa, o sistema mantém a classificação de risco do modelo local, mas não inventa recomendações mockadas.

## Regras do registro diário

- A data pode ser hoje ou uma data passada.
- Datas futuras são bloqueadas no frontend e no backend.
- Horas de sono, estudo e tempo de tela começam em `0`.
- Sliders começam no ponto médio da escala.
- A soma de sono, estudo e tempo de tela não pode ultrapassar 24 horas.
- Humor é salvo apenas como informação contextual.
- Cenários severos de sono muito baixo, estresse alto e pressão acadêmica alta recebem calibração preventiva para reduzir subestimação de risco alto.

## Arquitetura

```text
BurnoutSense/
  frontend/    Next.js + React
  backend/     NestJS + Prisma
  ai-service/  FastAPI + Scikit-learn
```

### Frontend

- Next.js
- React
- CSS modular/global do projeto

### Backend

- Node.js
- NestJS
- Prisma
- JWT
- PostgreSQL

### AI Service

- Python
- FastAPI
- Scikit-learn
- Pandas
- NumPy

### Infraestrutura

- Docker
- Docker Compose
- PostgreSQL

## Execução local

Para instruções de execução do ambiente local, consulte [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md).

Resumo do fluxo recomendado:

1. Subir o PostgreSQL com Docker.
2. Configurar os arquivos `.env`.
3. Rodar migrations do Prisma.
4. Subir o AI Service.
5. Subir o backend.
6. Subir o frontend.
7. Validar o fluxo em `/status`.

## Privacidade e LGPD

Os dados coletados têm finalidade acadêmica e preventiva, limitada ao acompanhamento dos indicadores informados pelo estudante. O projeto deve manter minimização de dados, uso restrito ao contexto do TCC, transparência sobre limitações do modelo e aviso claro de que a análise não substitui avaliação clínica.

Como evolução futura, recomenda-se implementar exclusão completa de conta e dados, revisão de consentimento e políticas formais para eventual uso fora do ambiente acadêmico.

## Integrantes

- João Rafael Jordão Pereira
- Mateus Nauhan Vieira Matos
- Milton Rogério Dotto Penha Junior

## Orientador

Prof. Marco Antônio Montebello Junior

## Instituição

Centro Universitário Facens

## Status do Projeto

Em desenvolvimento.

## Licença

Projeto acadêmico desenvolvido para fins educacionais.
