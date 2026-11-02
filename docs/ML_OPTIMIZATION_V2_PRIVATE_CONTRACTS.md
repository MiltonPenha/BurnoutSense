# Contratos operacionais privados v2 — execução não implementada

`training.private_v2_contracts` contém somente estruturas e validadores. Não há
CLI, leitura de CSV, chamada de treinamento, escrita de saídas ou mecanismo de
liberação real. O executor sintético permanece inalterado.

## Contratos

| Estrutura | Finalidade |
| --- | --- |
| `FrozenEvaluationConfig` | Tuplas imutáveis de A/B/C e 21 candidatas; protocolo 5×3×3/42. |
| `OperationalPreflight` | Resultado técnico com códigos fechados de problemas. |
| `HumanReviewRecord` | Registros declarativos separados de revisão institucional e da população. |
| `ExecutionState` | Estados de preparação; nenhum estado executável ou aprovação científica. |
| `SafeDestinations` | Caminhos resolvidos após conferência de metadados. |
| `ProvenanceManifest` | Proveniência, hashes, versões e estado consistente de preparação. |
| `AggregateOutputs` | Envelope do relatório, verificação e comparação, validado por lista estrita de campos. |
| `ProvenanceOutputBinding` | Resultado documental explícito: hashes, estrutura, completude analítica, estado e limites institucionais. |

Os dataclasses são congelados, mas anotações Python não impõem invariantes sozinhas.
É obrigatório invocar os validadores. Na configuração e nos mapas do manifesto,
tipos exatos são conferidos antes de qualquer conversão: tuplas de pares, tuplas
de strings, `V2Candidate`, `Candidate` e parâmetros escalares canônicos. Listas,
dicionários e subclasses equivalentes são rejeitados onde a estrutura deve ser
imutável. Objetos aceitos não permitem atribuição comum aos campos nem mutação
dos contêineres internos. Isso não é uma barreira contra código Python que
deliberadamente contorne dataclasses congelados ou altere as constantes do módulo.
O envelope de saídas contém mapeamentos
mutáveis: validar imediatamente antes de qualquer futura serialização, sem
alterações concorrentes. Os validadores não modificam os argumentos.

## Configuração e protocolo

`validate_config()` compara tipos e conteúdo recursivamente com uma referência
de profundidade fixa, incluindo A/B/C, candidatas, parâmetros e ordem. Não aceita
grades alternativas. Não usa equivalência JSON para provar imutabilidade e não
percorre recursivamente um grafo arbitrário de entrada.

Também constrói, **sem fit**, os 21 pipelines e compara seus parâmetros efetivos
com referências literais independentes dos builders: todos os parâmetros de
Dummy, Ridge, floresta (incluindo 100 árvores) e SVR da versão 1.5.1. Confere
tipos/ordem dos passos, preditores selecionados e validados, scaler, vocabulários
categóricos literais, one-hot, configuração do ColumnTransformer e ausência de
cache/verbose nos pipelines. Não compara dois pipelines gerados pelos mesmos
defaults para estabelecer a referência. Divergências são rejeitadas, sem alterar
o experimento. Esses valores foram extraídos do protocolo e da implementação
aprovados; não são novas escolhas de hiperparâmetros.

`validate_protocol_bytes()` recebe bytes do documento fornecidos pelo chamador.
Não abre arquivos. Compara SHA-256 com o protocolo revisado, normalizando somente
CRLF para LF para acomodar o checkout do Git. Não normaliza outras alterações.
O hash representa integridade textual, não validade científica ou autoria.

```python
from training.private_v2_contracts import (
    FrozenEvaluationConfig, validate_config, OperationalPreflight,
    HumanReviewRecord, preparation_state,
)

validate_config(FrozenEvaluationConfig())
state = preparation_state(OperationalPreflight(True), HumanReviewRecord())
# AWAITING_INSTITUTION; não autoriza execução ou abertura de CSV.
```

## Separação das etapas

`preparation_state()` distingue falha operacional, espera de revisão institucional
e espera de revisão da população. Mesmo com ambas registradas e pré-validação
aprovada, retorna `EXPERIMENT_NOT_IMPLEMENTED`. A propriedade
`real_execution_enabled` é sempre inicializada como `False` e não é argumento
dos construtores. Um manifesto finalizado deve coincidir com o estado derivado;
`PLANNED` representa apenas preparação inicial, não um manifesto finalizado válido.

As revisões humanas usam enums distintos e referências SHA-256 a evidências
privadas; uma flag, um dicionário `authorized=True` ou uma enum sem evidência
compatível são rejeitados. A revisão da população não pode preceder o registro
institucional. Esses registros não autenticam documentos, não conferem seu
conteúdo/alcance, não comprovam consentimento nem autorização. São metadados
declarados por um futuro responsável, sujeitos a verificação humana externa.

## Caminhos e proveniência

`validate_paths()` verifica somente metadados: fonte existente, destino novo,
pais existentes, ambos sob raiz privada explícita e fora do repositório; também
rejeita ancestrais identificados como repositório Git, symlinks e reparse points
Windows. Não lê o conteúdo da fonte, não a copia e não cria/reserva o destino.
Por isso a conferência **não elimina corridas de filesystem**: um futuro executor
precisará revalidar permissões/identidade, usar criação exclusiva e diretórios
controlados, além de isolamento de rede. Testes usam somente arquivos fictícios.

`validate_manifest()` exige commit hexadecimal, árvore limpa, hash do protocolo,
configuração exata, cobertura dos módulos exigidos, hashes bem formados, versões
diretas fixadas e Python 3.12.x. O hash do ambiente completo, os compromissos
privados de população/partições e o hash de entrada são apenas validados como
metadados: não há leitura das fontes alegadas nem autenticação desses valores.
O manifesto não transporta caminhos, emails, identificadores ou texto livre.
O compromisso da população não revela registros individuais e fica privado.

`source_sha256` inclui o contrato e o módulo comparativo. Um futuro executor
exigirá revisão do contrato para incluir seu próprio código. `libraries` fixa as
dependências diretas auditadas; `environment_sha256` deve futuramente vincular o
ambiente completo/transitivo, que este módulo não instala nem verifica sozinho.

`output_sha256` pode ser vazio em preparação. Para vincular saídas existentes,
`validate_provenance_outputs()` confronta os três hashes: `report`, `verification`
e `comparison`; ausência ou divergência resulta em `hashes_match=False`.
São hashes de JSON canônico UTF-8, com chaves ordenadas,
`ensure_ascii=False`, `allow_nan=False` e os separadores padrão de `json.dumps`.
Não correspondem automaticamente aos bytes de um JSON formatado com indentação.

### Hash válido não significa execução válida

A função agora retorna `ProvenanceOutputBinding`, nunca um Booleano de sucesso.
O uso de `bool(binding)` é rejeitado com `EXPLICIT_BINDING_STATUS_REQUIRED`, para
evitar que um objeto retornado seja confundido com autorização ou aprovação.
Seus eixos são separados:

- `hashes_match`: somente correspondência documental dos três hashes;
- `output_structure_valid`: lista permitida e consistência dos objetos de saída;
- `analytical_complete`: completude do relatório, `False` para incompletude e
  `None` quando a estrutura não passa na validação;
- `preparation_state`: estado declarado e validado do manifesto;
- `preparation_compatibility`: `invalid_output_structure`, `preflight_failed`,
  `real_executor_unavailable` ou `synthetic_documents_only`;
- `human_authorization`: sempre `not_established_by_metadata`;
- `execution_certified` e `real_execution_enabled`: sempre `False`.

O primeiro impedimento aplicável é registrado nessa ordem: estrutura inválida,
pré-validação falha, origem real declarada sem executor disponível. Uma origem
sintética com pré-validação aprovada pode ser vinculada como documentação sintética
mesmo sem revisão institucional, sem confundir isso com prontidão real. Registros
de ambas as revisões também não liberam origem real. Um relatório completo com
hashes corretos e manifesto `PREFLIGHT_FAILED` mantém a completude **analítica**
separada, mas é explicitamente incompatível na preparação e nunca execução
certificada. Não há um campo global `approved`, `authorized` ou `complete`.

Manifestos malformados e grafos cíclicos/profundos geram erros sanitizados. Objetos
JSON limitados que violam o esquema retornam `output_structure_valid=False`,
preservando a separação em relação aos hashes. Não serializar as saídas originais
apenas porque os hashes correspondem: a lista permitida precisa passar.

## Saídas permitidas

`validate_aggregate_outputs()` verifica recursivamente campos exatos, tipos e
vocabulários fechados no relatório padrão, candidatos, métricas, auditorias,
diagnósticos, frequências e pareamentos. Strings de falha/aviso não podem conter
mensagens arbitrárias. Dados como `records`, `predictions` e campos inesperados
em qualquer nível são rejeitados. O relatório exige configuração congelada e
versões diretas pertinentes. A verificação deve corresponder ao verificador
existente; a comparação deve corresponder à reconstrução a partir dessa origem.
Isso impede campos extras também nessas duas saídas, sem modificar seus contratos.

Antes de JSON/conversões/verificação, uma caminhada iterativa verifica os grafos
de saída: tipos JSON exatos, chaves string, números finitos, máximo de 32 níveis,
200.000 nós visitados e 200.000 elementos por contêiner. Ciclos são rejeitados;
referências compartilhadas sem ciclos são permitidas. Na configuração a
profundidade é limitada pela forma da referência; nos mapas do manifesto são
admitidos apenas pares de strings. A proteção não depende de esconder
`RecursionError`. Alterar limites requer revisão; eles não mudam a validação
cruzada nem a população científica.

Retorna `True` somente para completude técnica. Um relatório incompleto, mas com
estrutura e diagnósticos permitidos, pode retornar `False`; falhas permanecem na
origem. Estruturas inválidas geram `ContractError` com código fixo, sem ecoar
valores ou exceções internas. A validação não deve ser usada como filtro que
apaga diagnósticos: futura persistência deverá preservar os diagnósticos seguros.

Limite: uma lista permitida não prova que um número foi realmente agregado.
Valores individuais disfarçados de métricas não são detectáveis sem proveniência
do produtor. Os contratos não autenticam resultados nem impedem chamadas diretas
às bibliotecas por outro código. Nenhum retorno equivale a autorização real.

## Verificação sintética

```text
python -m unittest discover -s tests -p test_private_v2_contracts.py -v
python -m unittest discover -s tests -q
```

As fixtures dos novos testes são agregados inventados consistentes com 15 folds,
não resultados de treinamento ou evidência científica. Testam mutação do protocolo,
configurações inválidas, campos inesperados, dados individuais fictícios,
destinos existentes, caminhos inseguros, estados, manifestos, flags indevidas,
incompletude e vinculação de hashes. A suíte anterior continua cobrindo o fluxo
sintético de treinamento. Há regressões para os quatro problemas da revisão:
contêineres mutáveis, defaults alterados temporariamente em memória, cruzamentos
de origem/estado/revisões/completude e grafos cíclicos ou profundos. Os testes de
defaults apenas constroem estimadores; não executam treinamento. Não acessar CSV
real para testar estes contratos.

Incompatibilidades intencionais: representações mutáveis anteriormente aceitas
agora são rejeitadas; `validate_provenance_outputs()` deixou de retornar Booleano
e de lançar erro apenas por hash divergente. Seus consumidores futuros deverão
examinar cada campo do resultado. Não há consumidor de execução real implementado.
