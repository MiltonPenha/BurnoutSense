# Métricas e contrato ESB-eu

Base real final `BurnoutSense-final-v1-20261030`, com 36 respostas elegíveis e válidas. CV aninhada: 5 folds externos × 3 repetições, 3 internos, seed 42; 24 configurações predefinidas. Média não ponderada ± desvio padrão amostral de 15 folds externos; não são intervalos de confiança.

| Modelo/procedimento | MAE ↓ | RMSE ↓ | R² ↑ |
|---|---:|---:|---:|
| dummy | 0.4792 ± 0.1389 | 0.5838 ± 0.1797 | -0.3914 ± 0.8372 |
| linear | 1.4467 ± 0.8426 | 1.7559 ± 0.9932 | -18.8242 ± 23.5787 |
| ridge | 0.3875 ± 0.1436 | 0.4611 ± 0.1762 | 0.1319 ± 0.4678 |
| random_forest | 0.3601 ± 0.1250 | 0.4538 ± 0.1738 | 0.1119 ± 0.6821 |
| svr | 0.3920 ± 0.1252 | 0.4694 ± 0.1563 | 0.0105 ± 0.6994 |
| inner_selection_procedure | 0.4016 ± 0.1177 | 0.4926 ± 0.1492 | -0.0513 ± 0.6782 |

## Modelo final e interpretação

O artefato final permanece **Ridge, alpha=10**, escolhido pela seleção interna e reajustado em toda a base elegível. Random Forest teve menor MAE/RMSE externo médio; essa observação não autoriza trocar retrospectivamente o vencedor e relatar a mesma CV como avaliação imparcial da nova seleção. Reporte os dois fatos. As métricas de uma família não são teste independente do artefato reajustado.

O procedimento completo de seleção apresentou MAE 0,4016, RMSE 0,4926 e R² -0,0513. Esse R² e a dispersão elevada limitam conclusões sobre generalização. Há evidência interna descritiva de menor erro em algumas famílias frente ao Dummy; não há validação externa nem demonstração de eficácia clínica.

## Ideais matemáticos e critérios de engenharia

- MAE: ideal 0, em pontos ESB-eu; resume erro absoluto típico. Ridge apresentou 0,3875 ponto de MAE externo médio por família.
- RMSE: ideal 0, em pontos ESB-eu; penaliza erros maiores. Analise junto do MAE.
- R²: ideal 1; zero corresponde ao desempenho do preditor da média do próprio conjunto de teste e valores negativos são possíveis. Preserve negativos e use null com motivo quando indefinido.
- Dummy é a referência experimental nos mesmos folds. Reduzir erro frente a ele é critério comparativo; não há limiar clínico universal de MAE/RMSE estabelecido neste projeto.
- Não há “acurácia de 90%”, precisão/recall/F1, porcentagem de burnout ou confiança individual para esta regressão. Não derive intervalos de confiança do desvio padrão de folds sobrepostos.

## Backend e frontend

A aplicação persiste: tipo observado/estimado, escore original, contrato, nome e versão do modelo/base, data de inferência e versão do formulário. Manter itens observados separados do contexto e sem uso como preditores. Exibir escore contínuo 0–4 com duas casas somente na apresentação. A tabela própria `esbeu_assessments` preserva esses dados sem converter classificações históricas.

Mostrar métricas científicas no contexto de validação do modelo, nunca como confiança do usuário. Distinguir `/v1/validation/metrics` (CV final agregada) de `/v1/validation/evaluate` (métricas dos exemplos enviados pelo chamador, sem CV). Entrada de treino enviada ao último endpoint não é teste independente.

Amostra pequena, níveis raros e alternativas do formulário ausentes no treino devem acompanhar a apresentação dos resultados. One-hot usa vocabulário fixado pelo formulário; categoria ausente tem coluna estável, mas não evidência aprendida específica. Novas respostas originam nova versão de base, protocolo e relatório.

Não foram criados limites novos silenciosamente: valem os limites aprovados em `form_schema.py`. Por exemplo, horas de sono têm mínimo 0 e não têm máximo contratado; um máximo fisiológico não foi introduzido nesta migração. A regra já existente de trabalho exige 0 horas quando a opção indica que não trabalha.
