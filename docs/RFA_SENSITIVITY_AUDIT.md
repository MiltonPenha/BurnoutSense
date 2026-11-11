# Auditoria local de sensibilidade do RF/A

Execute na raiz, com o FastAPI local pronto e a configuração privada da IA
no `backend/.env`:

```powershell
node --test backend/test/audit-rfa-sensitivity.test.cjs
node backend/test/audit-rfa-sensitivity.cjs
```

O utilitário usa somente HTTP de inferência no loopback. Não importa Prisma,
não lê contas, não carrega joblib diretamente e não chama treinamento.
Não altera contexto, registros, parâmetros, artefatos ou limites da interface.
A chave é lida do arquivo privado e não é incluída no relatório.

## O que é testado

- As 22 entradas, em seis contextos inteiramente fictícios: três intensidades
  de demandas, com e sem estágio.
- Todas as categorias do esquema e grades explícitas de valores numéricos
  em `audit-rfa-sensitivity.cjs`.
- Um campo por vez. Exceção explícita: vínculo é testado junto com jornada e
  aplicabilidade para não inventar um estudante que apenas estuda e trabalha.
- Uma matriz adicional de vínculo, jornada e dificuldade de conciliação.
- Repetição da mesma entrada, ordem das chaves e rejeição de entradas inválidas.

O resultado em `.run-logs/rfa-sensitivity/` inclui `report.html`,
`summary.md`, `audit.json` e `predictions.csv`. A pasta é ignorada pelo Git.
Os JSONs contêm somente bases e previsões fictícias, não respostas da pesquisa.
Cada execução substitui esses relatórios; preserve cópias separadas para
comparar versões. Não publique CSVs nem artefatos privados do treinamento.

## Como interpretar

Amplitude é a diferença entre a maior e a menor previsão de uma curva, não
importância global nem efeito causal. Pontos percentuais são calculados pela
normalização de 0–4 para 0–100, sem transformar a saída em probabilidade.

As hipóteses de direção para avaliações de pressão, dificuldade, sono e apoio
são critérios de investigação, não regras clínicas. Faixa etária, curso,
semestre, horas e atividade física não recebem uma regra universal de
melhor/pior. Vínculo é uma comparação acoplada, não um efeito isolado.
Uma curva plana não prova que a variável é ignorada em todo o domínio.
Uma inversão não prova, sozinha, erro de código ou treinamento.

Não se consultou a cobertura dos perfis na amostra privada. As combinações
podem estar fora da distribuição conhecida e os extremos observados não são
limites globais. Esse teste não calcula MAE, R² ou validade longitudinal, pois
não há medidas observadas de referência nesses perfis.

Antes de mudar o modelo, a equipe deve comparar os sinais com as definições
das perguntas, a codificação do pipeline e a distribuição privada autorizada,
e avaliar alternativas em um procedimento separado, preservando o RF/A atual.
