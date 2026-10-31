# Contrato de integração ESB-eu

## Separação dos serviços

NestJS continua responsável por autenticação JWT, usuários e banco. FastAPI é um microsserviço independente. `AiService` é exclusivamente um cliente HTTP, configurado com `AI_SERVICE_URL` e `AI_SERVICE_API_KEY`. Não existe inferência ou treinamento no processo Node, nem fallback local.

Rotas NestJS autenticadas:

- `POST /ai/predict`: encaminha `{ "context": { ...22 campos... } }` a `/v1/predict`.
- `GET /ai/model`: metadados do artefato.
- `GET /ai/metrics`: comparação agregada da validação interna final.

A chave de serviço só fica no servidor. O JWT do usuário não substitui a chave no FastAPI. Use rede interna/TLS quando os serviços estiverem em hosts distintos; o script local vincula a IA a 127.0.0.1.

## Payload e apresentação

Obtenha as chaves, tipos e enumerações canônicas em `GET /v1/schema` da IA; não invente mapeamentos para as perguntas diárias anteriores. São 22 campos contextuais, obrigatórios; não envie e-mail, identificador, elegibilidade nem itens ESB-eu na previsão. Exemplos gerados do esquema estão em `/v1/examples` e são explicitamente artificiais.

Resposta de previsão: `kind=estimated_score`, `esbeu_overall` numérico de 0 a 4, `model_name`, `dataset_version`, `contract_version`. A interface pode arredondar para duas casas para exibição, preservando o valor original no armazenamento. Identifique como “ESB-eu estimada pelo contexto”. Não converta para porcentagem, confiança, escala 1–10 ou faixa diagnóstica.

Os 14 itens são usados separadamente em `POST /v1/esbeu/score` para escore observado e dimensões. Não são 14 preditores adicionais. Não exiba dimensões estimadas: o alvo do modelo é apenas o escore geral.

Erros: 401 chave inválida na IA; 422 contrato inválido ou estimativa fora de domínio; 503 modelo/serviço indisponível; 502 resposta incoerente recebida pelo backend. Mostre estado indisponível, sem gerar pontuação alternativa.

## Retirada do fluxo anterior

Scripts, relatórios de treino, classificador, normalizadores, fatores heurísticos, calibração, alertas por classe, cálculo local e geração externa de insights foram retirados. As rotas POST/PATCH `/assessments` e GET `/results/...` respondem 410; GET/DELETE de avaliações antigas preservam o controle de propriedade. Não se convertem resultados históricos para ESB-eu.

Prisma mantém esquema e migrações históricos para não destruir registros. Essa retenção é armazenamento histórico, sem classificador ativo. A futura persistência ESB-eu precisa de migração aditiva e tabelas/contratos próprios; não reutilize `riskLevel`, `riskScore` ou `confidence`. O novo formulário/dashboard completo não foi implementado nesta entrega: as telas antigas mostram aviso explícito, mantendo autenticação, perfil e status.

## Métricas e validação

Confira [métricas oficiais e critérios](docs/ESBEU_METRICS.md). Testar um exemplo em `/v1/validation/compare` não comprova generalização. `/v1/validation/evaluate` calcula métricas somente dos exemplos enviados, sem treino; use apenas dados autorizados. Os resultados científicos reportáveis estão em `/v1/validation/metrics` com escopo de CV interna aninhada.
