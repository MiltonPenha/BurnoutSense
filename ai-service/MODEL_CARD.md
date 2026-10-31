# Modelo contextual ESB-eu — base final v1

## Uso e procedência

Regressão acadêmica do escore geral observado da ESB-eu (média dos 14 itens, 0–4), usando somente 22 campos contextuais. Dados reais de formulário; não são dados artificiais. Testes de software e exemplos HTTP são gerados do esquema e não reproduzem participantes.

Versão: `BurnoutSense-final-v1-20261030`. Foram recebidas 39 respostas: 36 elegíveis e válidas, 2 inelegíveis e 1 rejeitada por valor inválido em `work_hours_week`. O artefato final é Ridge com alpha=10, pipeline completo e 40 atributos transformados. O artefato e a base ficam em armazenamento local privado.

## Seleção e validação

Grade predefinida com 24 configurações dos cinco modelos; CV aninhada 5×3 externa e 3 interna, seed 42. A seleção interna minimiza MAE, seguida de RMSE, dispersão e simplicidade em empates exatos. Foram 1.228 ajustes por execução, sem falhas. A repetição reproduziu as métricas. O reajuste final usa os 36 registros; métricas de treino não são apresentadas como teste.

Random Forest teve menor MAE externo médio (0,3601), mas Ridge foi selecionado na avaliação interna final (alpha=10). Não se trocou o vencedor depois de examinar os folds externos. Veja [tabela e interpretação](../docs/ESBEU_METRICS.md).

## Limites

A amostra é pequena, com categorias raras e categorias previstas pelo formulário ausentes do treino. O vocabulário completo do esquema mantém colunas estáveis; uma categoria ausente não possui efeito específico aprendido. Categoria desconhecida é rejeitada. Não há imputação com base no conjunto completo, seleção de atributos pelo alvo ou uso dos itens ESB-eu como entrada.

Os resultados são validação interna para esta versão da base, sem coorte externa independente. A dispersão dos folds não é intervalo de confiança. R² negativo é preservado; o procedimento completo de seleção apresentou R² médio -0,0513, o que limita afirmações de generalização. Não se infere eficácia clínica nem se classificam pessoas. Novas respostas exigem nova versão e nova execução registrada, sem sobrescrever esta base final.

## Inferência e privacidade

Saída `esbeu_overall`, contínua e finita em 0–4. Valores fora desse domínio são rejeitados, sem corte silencioso. Não há intervalo individual ou confiança percentual calibrada. Escore observado e estimado possuem contratos distintos.

A API carrega somente artefato local de origem conhecida, com confiança explicitamente configurada, SHA-256 e versões compatíveis de NumPy, pandas, scikit-learn e joblib. Hash verifica integridade, não torna pickle desconhecido seguro. Não recebe CSV, não treina via HTTP, não persiste requisições e não envia respostas a provedores externos.
