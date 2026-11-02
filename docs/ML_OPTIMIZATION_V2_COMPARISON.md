# Comparação descritiva A/B/C da v2

Implementa a derivação prevista na seção 9.2 de `ML_OPTIMIZATION_V2_PROTOCOL.md`,
sem alterar esse documento congelado ou o experimento. A função não lê arquivos,
não ajusta modelos, não habilita execução real e não escolhe um vencedor.

```python
from training.optimization_v2_comparison import compare_predictor_sets

# report: objeto de UMA execução v2 já disponível em memória.
# Nesta etapa utilizar exclusivamente resultados sintéticos.
analysis = compare_predictor_sets(report)
ridge_ba = analysis["contrasts"]["ridge"]["B-A"]
```

Não juntar grupos de execuções diferentes. Não fornecer médias globais no lugar
dos folds. Um relatório agregado privado futuro ainda requer autorização para
seu acesso e armazenamento fora do repositório; esta rotina não fornece isso.

## Estrutura e sinal

`contrasts` contém quatro famílias (`dummy`, `ridge`, `random_forest`, `svr`),
cada uma com `B-A`, `C-A`, `C-B`. A diferença é sempre erro do conjunto à esquerda
menos erro do conjunto à direita. **B−A negativo favorece B**. Esse exemplo e o
protocolo determinam o sinal; ele não favorece o subtraendo A.

Cada contraste retorna:

- `expected_pairs`, `valid_pairs`, `missing_pairs`, `complete`;
- `folds`: repetição/fold, deltas MAE/RMSE e diagnósticos fixos por lado;
- `mae` e `rmse`: `difference` com média, desvio amostral e contagens, além de
  `wins`, `ties`, `losses`, relativos ao conjunto à esquerda.
- `by_repeat`: os mesmos resumos MAE/RMSE por repetição, para descrever sinais
  e dispersão sem tratar repetições como novas amostras independentes.

Média não ponderada das diferenças dos pares válidos, desvio com `ddof=1`;
nenhum par válido implica média/desvio `null`, e um único par implica desvio
`null`. Igualdade é exatamente zero, sem tolerância nas vitórias/empates.
MAE e RMSE usam os mesmos pares válidos. Não se comparam médias globais.

`missing_pairs` conta todos os pares indisponíveis, inclusive falha/invalidade,
não apenas ausência física. Os diagnósticos distinguem `missing_fold`,
`failed_fold`, `missing_candidate`, `invalid_metrics`. Esses pares permanecem
na lista, com deltas `null`. No resumo reutilizado `MetricAggregate`, tais pares
são contabilizados em `failed_folds`; `undefined_folds` é zero para diferenças
MAE/RMSE. Não interpretar esse nome como prova de falha de treinamento em todos
os casos: consultar os diagnósticos.

Folds duplicados, fora do protocolo, com tamanhos incompatíveis ou candidatos de
outro conjunto/família são rejeitados por `ValueError` sanitizado. Folds
presentes sem falha e com `metrics` ausente ou vazio são classificados como
`invalid_metrics`, mantendo o par indisponível. Em folds bem-sucedidos,
`train_size` e `test_size` são obrigatórios: sua ausência é erro estrutural
rejeitado por `ValueError` sanitizado, não uma métrica inválida. Grupos/folds
ausentes ficam explícitos. O pareamento é por `(repeat, fold)` e independe da
ordem da lista. Os tamanhos devem corresponder ao KFold descrito por n e protocolo.

O resultado inclui `source_verification`, obtido do verificador existente. Sua
lista de problemas preserva os códigos de inconsistência da origem. `complete`
global exige origem tecnicamente completa e todos os pares disponíveis. Um
contraste pode ter todos os pares e ainda pertencer a uma origem incompleta.
Os dados de entrada não são modificados; diagnósticos originais permanecem no
relatório de origem. Não se copiam mensagens de exceção, payloads arbitrários,
respostas ou previsões para a análise.

## Compatibilidade e limites

Identidades e tamanhos compatíveis são necessários, mas não provam a identidade
dos participantes nas partições. Os relatórios atuais não têm assinaturas de
composição dos folds. A garantia depende de usar um relatório intacto produzido
por uma única execução com partições compartilhadas. O verificador não autentica
proveniência, consentimento nem validação científica. Grades/protocolos compactos
são aceitos para testes; uma avaliação futura congelada exige conferir 21
candidatas e 5×3×3/42 conforme o protocolo, separadamente.

Exemplo inventado de dois folds (não é execução científica): erros MAE de A
`[1, 1]`, B `[0.5, 1.5]`, C `[0.5, 0.5]`. B−A é `[-0.5, 0.5]`, média 0,
desvio amostral aproximadamente 0.7071, uma vitória e uma derrota. C−A é
`[-0.5, -0.5]`; C−B é `[0, -1]`. Esses valores servem apenas para conferir sinais.

Apresentar todos os contrastes, inclusive Dummy. Não transformar diferenças em
seleção externa, equivalência, significância, acurácia ou benefício clínico. Os
15 folds do protocolo completo reutilizam participantes; desvios não são
intervalos de confiança. Não alterar denominadores silenciosamente quando há
incompletude e não publicar agregados privados sem revisão.

## Testes sintéticos

No diretório `ai-service`, com `requirements-dev.txt`:

```text
python -m unittest discover -s tests -p test_optimization_v2_comparison.py -v
python -m unittest discover -s tests -q
```

Os novos testes usam agregados inventados e uma execução sintética compacta;
não abrem CSVs nem dependem de participantes. A suíte existente mantém o teste
de duas execuções integrais 5×3×3 com 21 candidatas.
