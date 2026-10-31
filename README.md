# BurnoutSense

Projeto de TCC que estima o escore contínuo geral da ESB-eu, de 0 a 4, a partir de 22 variáveis contextuais autorizadas de pesquisa por formulário. Os 14 itens da escala definem o alvo e nunca entram como preditores. Não há classes diagnósticas, risco baixo/médio/alto, confiança percentual ou escala visual 1–10.

## Arquitetura

- `frontend/`: Next.js; formulário ESB-eu, dashboard contínuo, histórico paginado, autenticação, perfil e status.
- `backend/`: NestJS, autenticação e PostgreSQL/Prisma. Cliente HTTP do microsserviço; não treina nem executa modelos Python.
- `ai-service/`: FastAPI independente; valida contexto, calcula escore observado, estima escore contextual e publica métricas agregadas. Treinamento é uma execução local separada da API.

Fluxo: navegador → NestJS autenticado → HTTP com chave de serviço → FastAPI → pipeline privado. O CSV não participa da inferência.

## Dados e treinamento

A base final versionada é real, coletada por Forms: 39 respostas, 36 elegíveis e válidas, 2 inelegíveis e 1 rejeitada. O exportador tem 41 colunas, das quais 39 analíticas e 2 administrativas descartadas. Consentimento e independência das respostas foram declarados pelo responsável; isso não substitui documentação institucional.

Os cinco modelos são Dummy, LinearRegression, Ridge, RandomForestRegressor e SVR. A validação usa CV aninhada: 5 folds externos × 3 repetições, 3 folds internos, seed 42 e 24 configurações. Pré-processamento é ajustado dentro de cada fold. Ridge alpha=10 foi selecionado pelo protocolo interno e reajustado nos 36 registros; Random Forest apresentou o menor MAE externo médio. Consulte [cartão do modelo](ai-service/MODEL_CARD.md).

## Execução e revisão

Veja [guia local](DEVELOPMENT_GUIDE.md), [API e treinamento](ai-service/README.md), [contrato de integração](BACKEND_INSTRUCTIONS.md) e [métricas](docs/ESBEU_METRICS.md).

CSV, identificadores, respostas, modelos serializados e credenciais ficam fora do repositório. `.gitignore` protege extensões de dados e artefatos, mas não substitui a revisão de arquivos já rastreados. Não publique relatórios privados.

O classificador anterior, seu treinamento, relatórios e fallbacks foram retirados da árvore de trabalho. Nenhum CSV ou binário desse classificador estava presente/rastreado no estado examinado. O histórico Git não foi reescrito. Esquema e migrações históricos do banco permanecem para preservar registros existentes; novas gravações no contrato anterior retornam HTTP 410. Não há migração destrutiva automática.

A Etapa 10 implementa consentimento de uso versionado, elegibilidade, itens ESB-eu opcionais e avaliações privadas por conta. A migração adiciona `esbeu_assessments`, sem importar o CSV de pesquisa ou alterar tabelas antigas. Veja [implantação, homologação e rollback](docs/ETAPA_10_INTEGRATION.md). Novas avaliações não são incorporadas automaticamente ao treinamento.
