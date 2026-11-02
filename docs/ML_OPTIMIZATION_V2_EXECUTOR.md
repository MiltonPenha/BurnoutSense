# Executor v2 — somente demonstração sintética

O novo módulo `training.run_optimization_v2` integra o importador oficial,
pré-processamento, experimento padrão e verificação técnica. Não modifica a v1
nem os cinco arquivos já commitados da v2. Não promove nem salva modelo final.

## Uso

No diretório `ai-service`, com as dependências de `requirements-dev.txt`:

```powershell
python -m training.run_optimization_v2 --synthetic-demo --input <novo-csv-externo> --output <novo-diretorio-externo>
```

Os caminhos são argumentos, sem locais pessoais fixos. Os diretórios-pais devem
existir. Tanto o CSV quanto o diretório de saída devem ser novos, separados e
fora do repositório. Nenhum diretório existente é reutilizado. Links simbólicos
nos destinos são rejeitados e os caminhos resolvidos são verificados. Usar um
diretório externo privado sob controle do operador, sem alterações concorrentes
de links/junctions por terceiros durante a execução.

`--input` neste modo é **destino do CSV fictício**, nunca um arquivo a importar
fornecido pelo operador. Se ele já existir, a execução é rejeitada antes de ler
seu conteúdo. O CSV é criado com exclusividade (`xb`). O diretório de saída é
reservado com `exist_ok=False`; os JSONs usam modo `x`, sem sobrescrita.

A ausência de `--synthetic-demo` retorna código 2 e
`REAL_DATA_EXECUTION_DISABLED`, antes de examinar caminhos. Não existe flag de
autorização real. `data_origin` é sempre `synthetic`. Adicionar um rótulo não
habilita dados de participantes: uma futura capacidade real exigirá revisão
explícita do código e autorização humana externa.

## Fluxo e protocolo

- Gera 30 respostas válidas fictícias por padrão (configurável com `--records`,
  inteiro entre 30 e 100). CSV oficial com 41 colunas, BOM UTF-8, alternativas
  rotuladas, vírgula decimal e NA. Colunas administrativas contêm apenas a marca
  `SYNTHETIC_ONLY`, sem e-mail ou horário.
- Importa uma cópia em memória dos bytes que acabou de gerar. Não reabre o arquivo
  do argumento, evitando que sua substituição passe a alimentar dados reais.
- Confere contagens esperadas: todas as linhas sintéticas devem ser elegíveis,
  sem rejeições. Prepara X/y com os módulos canônicos.
- Executa A/B/C, 21 candidatas, 5 folds externos, 3 internos, 3 repetições e seed
  42. Não há opção CLI que reduza ou altere a grade/protocolo.
- Verifica integridade e frequências com `verify_optimization_v2`.

O gerador ESB-eu usa `random.Random(42)` local: sorteia cada item como inteiro
uniforme 0–4, sem usar contexto, escore derivado ou posição modular da linha.
Cada resposta continua exportada com o rótulo oficial. A mesma configuração
produz os mesmos bytes; aumentar a contagem preserva as linhas anteriores.
O estado aleatório global não é alterado. O manifesto registra versão do
gerador (`independent-esbeu-items/2`), semente e estratégia.

Diagnóstico do gerador anterior: ele já produzia cinco escores gerais distintos,
mas os 14 itens de cada registro eram idênticos e iguais a `i % 5`, repetindo
escalas contextuais. A alteração remove essa relação artificial direta; não
busca simular uma distribuição científica ou assegurar desempenho de modelos.
O alvo fictício é independente das entradas por construção do gerador. Modelos
flexíveis ainda podem sobreajustar amostras pequenas; a demonstração não prova
generalização nem impõe metas de desempenho.

O CSV exigido para a demonstração contém somente respostas inventadas. Os
relatórios de saída contêm apenas diagnósticos agregados, nunca esse CSV,
respostas individuais, índices de participantes ou previsões individuais.

## Saídas

Somente dentro do diretório externo recém-criado:

- `report.aggregate.json`: relatório agregado do protocolo v2.
- `verification.json`: completude técnica, códigos de inconsistência e exigência
  de revisão humana. Diagnósticos são preservados mesmo quando complete=False.
- `manifest.json`: origem sintética, proibição de execução real, marcador de
  ausência de resultado científico, hash SHA-256 dos bytes da entrada, contagens,
  protocolo, catálogo, versões das bibliotecas/Python e commit Git.

O manifesto inclui hashes dos arquivos Python relevantes e indica árvore suja,
pois o commit Git sozinho não identifica código ainda não commitado. Não contém
caminhos absolutos de entrada/saída nem variáveis de ambiente. O Git é consultado
somente para proveniência, sem fetch, commit ou publicação.

Não são criados logs de respostas. A CLI imprime apenas código fixo de sucesso
ou erro, sem traceback ou mensagens de estimadores. Se o operador redirecionar
stdout/stderr, deve fazê-lo para armazenamento externo privado. Código de saída
0 indica demonstração tecnicamente completa; 2 indica erro ou incompletude.
Nenhum desses estados representa aprovação científica/institucional.

Se houver interrupção/falha fatal antes dos JSONs, podem permanecer CSV fictício
e diretório parcial. Eles não são apagados nem reutilizados automaticamente;
inspecionar somente esse ambiente sintético e escolher destinos novos na próxima
tentativa. Falha fatal retorna código fixo, sem persistir exceções brutas.

## Testes

```powershell
python -m unittest discover -s tests -p test_run_optimization_v2.py -v
python -m unittest discover -s tests -q
```

Testes do executor usam diretórios temporários externos, CSVs fictícios e uma
grade compacta para testes de contrato. A execução CLI de demonstração usa o
protocolo completo, sem simulação dos modelos. Os testes de integração anteriores
também continuam exercitando o protocolo completo duas vezes.

Na revisão do gerador, os 14 testes específicos e a suíte completa de 199 testes
passaram no ambiente Python 3.12 com requisitos fixados. Os testes abrangem
contagens sintéticas 30/31/100, validade de todos os itens, diversidade do alvo,
variação dentro de grupos com a mesma escala contextual, preservação do estado
aleatório global e reprodutibilidade do CSV. A demonstração CLI completa com 30
linhas foi reexecutada e seu relatório foi verificado: 21 candidatas, 12
comparações com 15 folds, 15 seleções e completude técnica, sem expor métricas
como resultados científicos. Os resultados antigos não foram sobrescritos.

## Antes de qualquer capacidade real futura

Revisar explicitamente o bloqueio de modo real, sem removê-lo nesta etapa.
Confirmar autorização do responsável e requisitos de consentimento, esquema
oficial, independência das linhas e armazenamento privado. Registrar ambiente,
versão/hash da coleta e destinos exclusivos, sem sobrescrever a v1. Não substituir
essa revisão por flags, rótulos ou resultados desta demonstração.
