# Documentação do BurnoutSense

O [README principal](../README.md) apresenta o projeto, a arquitetura e o início rápido.

## Instalação e demonstração

- [Executar o fluxo diário localmente](getting-started/DAILY_TRACKING_LOCAL_SETUP.md) — preparar PostgreSQL e iniciar FastAPI, NestJS e Next.js.
- [Configurar o pacote privado RF/A](getting-started/RF_A_TEAM_SETUP.md) — conferir origem e hashes, preparar o Python e testar a inferência.
- [Testes e diagnóstico de desenvolvimento](getting-started/DEVELOPMENT_GUIDE.md) — comandos por serviço e verificações em ambiente isolado.
- [Demonstração híbrida para a banca](getting-started/DEMO_BANCA.md) — roteiro de apresentação com backend e IA locais.

## Arquitetura e integração

- [Integração NestJS–FastAPI](architecture/BACKEND_INSTRUCTIONS.md) — contratos HTTP, esquema dos campos e erros de inferência.
- [Sessão por cookies e proteção CSRF](architecture/COOKIE_AUTH.md) — autenticação, renovação e configuração do navegador.
- [Desempenho e medições](architecture/PERFORMANCE.md) — otimizações, limites da infraestrutura híbrida e teste reproduzível.
- [Persistência, homologação e rollback](architecture/ETAPA_10_INTEGRATION.md) — consentimento, banco e testes integrados.
- [Frontend](../frontend/README.md) — rotas, organização de componentes e testes da interface.
- [Serviço de IA](../ai-service/README.md) — configuração e API Python, com inferência separada do treinamento.

## Funcionalidades

- [Check-ins e acompanhamento diário](features/DAILY_TRACKING.md) — janela de 28 dias, atualização experimental do contexto e histórico.
- [Lembretes por e-mail](features/DAILY_REMINDERS.md) — opt-in, agendamento, condições de envio e tratamento de falhas.
- [Recuperação de senha](features/PASSWORD_RECOVERY.md) — fluxo de redefinição, SMTP e teste em QA.
- [Orientações com Gemini](features/GEMINI_GUIDANCE.md) — integração opcional e dados enviados ao provedor.

## Design

- [Convenções da interface](design/DESIGN.md) — organização de estilos, temas, acessibilidade e verificações.

## Implantação

- [Publicação com Vercel, Render e domínio próprio](deployment/DEPLOY_BURNOUTSENSE_ONLINE.md) — roteiro de hospedagem, DNS, migrações e SMTP.

## Pesquisa e reprodução

O RF/A é o modelo experimental usado no fluxo da aplicação. O Ridge em paralelo é um
candidato opcional para comparação local. As avaliações históricas e demonstrações
sintéticas têm escopos próprios.

- [Treinamento e avaliação do RF/A](research/RF_A_EXPERIMENTAL_CANDIDATE.md) — procedimento e limitações do artefato usado na aplicação.
- [Auditoria de sensibilidade do RF/A](research/RFA_SENSITIVITY_AUDIT.md) — variações controladas de entrada e interpretação.
- [Ridge em paralelo](research/RIDGE_SHADOW.md) — comparação local, treinamento e controles de ativação.
- [Cartão do modelo v1](../ai-service/MODEL_CARD.md) — procedência e limites do artefato histórico.
- [Métricas históricas da v1](research/ESBEU_METRICS.md) — tabela de avaliação e critérios de interpretação.
- [Protocolo científico v2 congelado](ML_OPTIMIZATION_V2_PROTOCOL.md) — conjuntos, candidatas e critérios de avaliação. O executor privado lê esse arquivo pelo caminho atual.
- [Comparação A/B/C](research/ML_OPTIMIZATION_V2_COMPARISON.md) — análise pareada posterior à avaliação.
- [Ambiente Python da v2](research/ML_OPTIMIZATION_V2_ENVIRONMENT.md) — versões de referência e verificação no Windows.
- [Executor de demonstração sintética](research/ML_OPTIMIZATION_V2_EXECUTOR.md) — execução completa com dados fictícios.
- [Executor privado auditado](research/ML_OPTIMIZATION_V2_PRIVATE_EXECUTOR.md) — inspeção e avaliação com revisões autenticadas.
- [Executor local simplificado](research/ML_OPTIMIZATION_V2_LOCAL.md) — fluxo para a entrada privada controlada e limites de isolamento.
- [Registro da implementação inicial da v2](research/ML_OPTIMIZATION_V2.md) — hipótese, grade e decisões do primeiro desenho.
- [Registro dos contratos privados da v2](research/ML_OPTIMIZATION_V2_PRIVATE_CONTRACTS.md) — validadores e limites da etapa anterior ao executor.

## Arquivo histórico

- [Auditoria de UX de 11/11/2026](archive/UX_AUDIT_REVIEW_2026_11_11.md) — achados e evidências daquele recorte da interface.
