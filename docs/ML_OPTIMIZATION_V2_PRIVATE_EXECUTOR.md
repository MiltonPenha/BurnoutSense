# Executor privado v2 — implementação para revisão, testes somente sintéticos

## Limite desta entrega

`training.run_private_optimization_v2` implementa uma API local separada. Não
modifica o executor sintético, os contratos preparatórios anteriores, a v1 ou o
protocolo congelado. Não há CLI, procura automática de CSVs, flag `--authorized`,
assinador de aprovações ou autorização implícita. A tarefa de implementação não
autoriza chamar a API com participantes. Os testes usam somente arquivos inventados.

A informação da equipe sobre confirmação institucional é contexto ainda sujeito
à conferência humana do documento, de seu alcance e do TCLE. O software não decide
sobre CEP, consentimento, validade institucional ou permissão de publicação.

## Auditoria e contrato científico

A implementação foi iniciada na branch `feature/ml-optimization-v2`, base
`7640f7496ab25ddce5fef86d47d5d092c953f081`, após inspeção dos seis commits,
protocolo integral, importador, pré-processamento, experimento, verificador,
comparação e contratos privados. São reutilizados:

- `validate_protocol_bytes` e `validate_config`: integridade textual, A/B/C,
  21 candidatas e parâmetros efetivos, sem ajustar estimadores;
- `audit_environment`: CPython3.12.14/WindowsAMD64 e as48 distribuições fixadas;
- `import_official_forms_csv`: esquema literal e elegibilidade;
- `prepare_regression_data`: X com22 preditores, y como média dos14 itens;
- `run_optimization_v2`: protocolo5×3×3/42, MAE primário, seleção somente interna;
- `verify_optimization_v2`, `compare_predictor_sets`, `validate_aggregate_outputs`:
  consistência e lista permitida das saídas, sem escolha pelos resultados externos.

O catálogo, os desempates, métricas, conjuntos e fórmulas de partições não mudam.
Não há modelo final, serialização ou promoção para a aplicação.

### As41 colunas oficiais

O importador exige o conjunto exato de2 cabeçalhos administrativos,3 critérios,
22 campos contextuais e14 itens. A ordem física é resolvida pelos cabeçalhos;
não são aceitas colunas extras ou correspondência aproximada. O exemplo do
gerador sintético pode ordenar as colunas de forma diferente do Google Forms,
preservando o mesmo conjunto literal.

A fonte autoritativa é `OFFICIAL_ADMINISTRATIVE_HEADERS` mais as chaves de
`official_header_mapping()`. Os administrativos são `Carimbo de data/hora` e
`E-mail para recebimento da cópia do TCLE`. Questões analíticas1–25 recebem o
prefixo numérico conforme o esquema; os14 itens ESB-eu não recebem esse prefixo.
O cabeçalho da questão12 (horas de trabalho/estágio) termina com um espaço.
Encoding fixo UTF-8 com BOM opcional, delimitador vírgula; números decimais
seguem a conversão oficial, inclusive vírgula decimal entre aspas.

Não copiar cabeçalhos a partir de um CSV privado para configurar o código. Para
inspecionar somente o esquema público, em `ai-service`:

```python
from training.import_forms import OFFICIAL_ADMINISTRATIVE_HEADERS, official_header_mapping
headers = (*OFFICIAL_ADMINISTRATIVE_HEADERS, *official_header_mapping())
assert len(headers) == 41
```

## Duas etapas e revisão externa

1. `describe_runtime()` inspeciona somente código, protocolo, Git e ambiente.
2. O responsável externo confere documento institucional, TCLE, finalidade
   acadêmica, condições de não publicação, controle de acesso e isolamento de rede.
3. Esse responsável prepara um registro documental autenticado, vinculado à
   entrada, documentos, destino, código e ambiente exatos. Somente então a API
   pode abrir o CSV indicado.
4. `inspect_private_input(plan)` lê/importa o CSV e devolve somente contagens,
   hashes e compromissos agregados. Não treina nem escreve arquivos.
5. O responsável confere contagens, exclusões e independência, comparabilidade
   com a v1 e a proveniência da coleta, e autentica uma segunda revisão.
6. `run_private_evaluation(plan)` revalida tudo, inclusive os mesmos bytes de
   entrada, antes de reservar um destino novo e executar a avaliação congelada.

Não impor39/36 como contagens observadas: são números históricos informados.
O responsável precisa reconciliar os totais atuais; o executor não deduplica,
imputa ou remove registros para obter um número esperado. Uma diferença de
população exige revisão do plano científico antes do treinamento.

Os registros anteriores de `private_v2_contracts` continuam representando
preparação e não são reinterpretados como autorização de execução. O novo
manifesto tem versão própria `private-v2-execution/1`; não é um manifesto
preparatório artificialmente marcado como executado.

## Autenticação dos registros de revisão

Ambos os arquivos são JSON UTF-8 com chaves exatas `record` e `signature`.
`signature` é HMAC-SHA256 hexadecimal sobre o JSON canônico de `record`:
`json.dumps(record, sort_keys=True, ensure_ascii=False, allow_nan=False,
separators=(',', ':')).encode('utf-8')`. Não há chave ou assinatura pronta para
uso real neste repositório. A chave de32 bytes deve ser aleatória, provisionada
externamente pelo responsável e protegida. A chave repetitiva dos testes é
deliberadamente fictícia e nunca deve ser reutilizada.

Os diretórios de confiança e de dados devem ser disjuntos. Quem pode trocar a
chave e as revisões pode produzir novas declarações: HMAC verifica autenticidade
**sob a chave provisionada**, não identidade institucional, autoria individual ou
validade jurídica/ética. O controle da chave e a conferência humana são requisitos
externos. Uma chave escolhida pelo próprio operador sem esse processo não prova
autorização. Não há emissão automática de registros pelo executor.

### Registro documental

Chaves exatas de `record`:

| Campo | Conteúdo |
| --- | --- |
| version | `private-v2-document-review/1` |
| decision | `institution_and_tcle_reviewed` |
| scope | `academic_evaluation_no_publication` |
| data_origin | `synthetic` ou `real_authorized`, declarativo |
| input_sha256 | SHA-256 dos bytes da entrada autorizada |
| institution_sha256 / tcle_sha256 | SHA-256 dos documentos conferidos |
| protocol_sha256 | Hash normalizado do protocolo congelado |
| code_sha256 / environment_sha256 | Valores de `describe_runtime()` |
| destination_sha256 | Valor de `destination_sha256(destino)`: caminho absoluto resolvido, grafia exata em UTF-8 |
| issued_utc / expires_utc | UTC no formato `YYYY-MM-DDTHH:MM:SSZ`, janela máxima24h |

Janela, assinatura, campos, documentos e proveniência são verificados antes da
leitura do CSV. Não basta uma flag, uma frase de confirmação ou um hash sem revisão.
Para origem real declarada, a árvore Git precisa estar limpa. Nesta entrega em
desenvolvimento, os testes usam origem sintética e hashes do código efetivo.

### Integridade do Git

As chamadas Git removem todas as variáveis herdadas `GIT_*`, desabilitam arquivos
de configuração global/sistema, hooks, fsmonitor e cache de arquivos não rastreados.
Usam caminhos literais e não adquirem locks opcionais. O comando de status exige
`--porcelain=v1 --untracked-files=all --ignore-submodules=none`, independentemente
de `status.showUntrackedFiles` local ou herdado. O Git executável é ferramenta
confiável do ambiente; isso não protege contra sua substituição maliciosa.

A raiz efetiva precisa corresponder ao repositório esperado. HEAD/status são
reconferidos no fim da inspeção. Para cada arquivo obrigatório, comparam-se a
entrada versionada no HEAD, a entrada do índice em estágio0 e o conteúdo de
trabalho. Blobs são lidos do HEAD capturado; não se confia apenas no status, que
poderia ocultar mudanças por flags do índice. Somente a equivalência CRLF/LF é
admitida nesses arquivos textuais. O hash bruto dos arquivos continua registrado.
Entradas ambíguas, conflitos, comandos Git com falha e raiz incorreta bloqueiam
a pré-validação com erro fixo.

`required_files_match_head` e `required_files_not_matching_head` registram o
resultado. Origem real exige árvore limpa **e** todos os obrigatórios versionados
e correspondentes ao HEAD, inclusive o executor. O HEAD é o commit atual vinculado
à revisão por `code_sha256`, não uma constante que impediria um futuro commit
revisado. No desenvolvimento sintético, arquivos ainda não commitados podem ser
testados, mas ficam explicitamente marcados como divergentes; nunca são declarados
integridade real aprovada. Depois do commit será necessário emitir novas revisões.

### Identidade do destino

Não se utiliza `casefold`, conversão de caixa nem normalização Unicode na identidade
criptográfica. `straße` e `strasse` geram compromissos distintos. Diferenças de
caixa na grafia do componente ainda inexistente também são rejeitadas por uma
revisão anterior, conservadoramente, mesmo em filesystem sem distinção de caixa.
Componentes `.`/`..` que resolvam inequivocamente ao mesmo caminho têm a mesma
identidade. Pais existentes são resolvidos pelo filesystem.

Symlinks/reparse points são rejeitados antes da resolução. No Windows, rejeitam-se
UNC/namespaces especiais, nomes reservados, streams alternativos e componentes
terminados em ponto/espaço. Se a identidade não puder ser demonstrada, não há
fallback para uma normalização mais permissiva. O caminho não é incluído em
mensagens ou manifestos. Revisões produzidas pela identidade antiga precisam ser
renovadas: código e compromisso mudaram.

### Registro da população

Contém as chaves exatas de `asdict(PopulationInspection)`, mais:

- `version=private-v2-population-review/1`;
- `decision=population_reviewed_for_this_evaluation`;
- `data_origin`, igual ao registro documental;
- `independence=independent_observations_reviewed`;
- `exclusions=eligibility_and_exclusions_reviewed`;
- `v1_pairing=not_established` ou `documented_by_responsible`;
- `issued_utc` e `expires_utc`, com a mesma regra de janela.

As contagens são `rows_read`, `eligible`, `ineligible`, `rejected`. O número
elegível mínimo operacional é10 para suportar as partições implementadas; isso
não demonstra suficiência estatística. Independência, exclusões e equivalência
v1 são decisões humanas documentadas: não são inferidas automaticamente da
ausência de identificadores ou de totais iguais. O executor não faz comparação
v1/v2 nem certifica pareamento v1 por uma declaração.

## Procedimento privado futuro — requer revisão e autorização separadas

Sem iniciar dados reais nesta entrega, o responsável deverá preparar o ambiente
auditado, rede isolada, diretórios com ACLs restritas e os documentos/revisões.
Usar um processo dedicado e os caminhos explicitamente definidos, fora do repo:

```python
from training.run_private_optimization_v2 import PrivatePlan, inspect_private_input, run_private_evaluation

plan = PrivatePlan(
    source=PRIVATE_CSV, output=NEW_PRIVATE_OUTPUT, private_root=PRIVATE_DATA_ROOT,
    trust_root=PRIVATE_TRUST_ROOT, institution_document=REVIEWED_INSTITUTION_DOCUMENT,
    tcle_document=REVIEWED_TCLE, documentary_review=AUTHENTICATED_DOCUMENT_REVIEW,
    population_review=AUTHENTICATED_POPULATION_REVIEW, verification_key=TRUSTED_KEY,
)
# Somente depois da revisão documental externa autenticada:
inspection = inspect_private_input(plan)
# Pausa operacional: responsável revisa população e prepara o segundo registro.
# Somente numa sessão posteriormente autorizada:
result = run_private_evaluation(plan)
```

Essas variáveis são definidas em sessão privada, não em código versionado. Não
imprimir dados em memória, respostas, exceções internas ou documentos. Inspeção
e avaliação reabrem apenas os caminhos explicitamente autorizados; não fazem
busca por arquivos existentes no computador. Cada avaliação usa destino novo.

## Proteções e proveniência

- Entrada regular, de link único, limite10MiB; documentos também têm limite10MiB;
  revisões têm limite1MiB e chave exatamente32 bytes.
- Caminhos resolvidos, ancestrais sem symlinks/reparse points e fora de qualquer
  repositório identificado. O destino precisa ser novo, sob a raiz privada.
- Windows: proprietário e permissões Allow só para o usuário atual, SYSTEM e
  Administradores; falha de inspeção/ACL é bloqueante. A checagem usa somente
  módulos nativos do Windows PowerShell, com caminho de módulos controlado no
  processo filho e sem resolução de nomes de domínio para os SIDs das regras.
  Não altera ACLs de arquivos reais. Cabe ao responsável provisionar as permissões.
- Conferência de inode/dispositivo, tamanho, mtime e número de links antes/durante
  a leitura; o SHA-256 é dos mesmos bytes importados em memória. Nunca escreve,
  move, modifica ou copia a entrada para um arquivo intermediário.
- Documentos e registros têm hashes, não conteúdo, nas saídas. A chave não é
  exportada. População/ordem e partições têm compromissos HMAC agregados privados,
  sem hashes individuais ou índices exportados. `Não se aplica` é representado
  pela string canônica apenas para o compromisso, sem mudar X/y.
- Código, commit, estado Git, protocolo, snapshot, ambiente completo e módulo
  comparativo são vinculados. Código/ambiente são reconferidos antes e após o fit.
- Rede Python por socket é bloqueada durante avaliação; stdout/stderr Python são
  descartados. Isso não é sandbox de sistema operacional: rede deve estar
  bloqueada externamente e não se admite código nativo não confiável.
- Reserva exclusiva do diretório e arquivos em modo `x`; nenhuma sobrescrita,
  remoção ou reutilização automática de resultados anteriores.

ACLs e revalidações reduzem riscos, mas não eliminam ataques de administradores,
alterações concorrentes de ancestrais ou substituição de código no processo.
Não executar em diretórios compartilhados ou processo multithread com outras
atividades: o bloqueio de sockets e redirecionamento de streams é temporário e
global ao processo. Os mecanismos não substituem isolamento operacional.

## Saídas e falhas

Somente no novo destino privado:

- `started.json`: estado fixo de início, sem dados;
- `report.aggregate.json`: relatório v2 existente;
- `verification.aggregate.json`: verificação técnica;
- `comparison.aggregate.json`: os12 contrastes por família;
- `manifest.json`: configuração, contagens, hashes, compromissos e proveniência;
- `prepared.json`: status e hashes de todos os cinco artefatos anteriores;
- `finished.json`: `technically_complete` ou `incomplete`, vinculado ao hash de `prepared.json`;
- `failed.json`: criado em falha fatal posterior à reserva, com código fixo.

A estrutura do relatório é validada pela lista permitida existente antes de
serialização. Não há respostas, cabeçalhos privados, identificadores, linhas de
erro do importador, previsões individuais, escores individuais ou modelo salvo.
Os hashes de saída são calculados sobre os bytes canônicos efetivamente escritos.
Cada gravação é exclusiva, com flush/fsync. A preparação ocorre somente após
relatórios e manifesto serem gravados; o marcador final vem depois da preparação.
Não se usa rename com substituição de arquivos existentes. Os arquivos de
preparação são preservados e não são provas de conclusão sozinhos.
Avisos/falhas agregadas são preservados; execução incompleta não é aprovada por
descartar folds. A API retorna `PrivateRunResult` com estado e completude técnica,
sempre exigindo revisão humana. `scientific_approval` é sempre falso no manifesto.

Se a avaliação gerar relatório inconsistente mas permitido, suas falhas são
preservadas com estado incompleto. Se a estrutura contiver campos proibidos ou
ocorrer falha fatal, não se serializa o objeto inseguro; preserva-se o diagnóstico
fixo. Pode haver arquivos parciais de uma gravação interrompida: não são apagados
nem retomados automaticamente. A ausência do estado final impede aceitar a execução.

### Consumidor e regra de conclusão

`validate_completed_run(diretorio, expected_result=None)` é somente de leitura.
Retorna `ArtifactConclusion(valid_artifacts, status, technically_complete, issues,
requires_human_review=True)`. Deve ser usado ao auditar resultados, sem inferir
autorização ética ou validade científica do estado técnico.

Para aceitar um conjunto, exige os sete arquivos exatos, JSON válido, estado de
início, preparação e conclusão coerentes, todos os hashes da preparação, hash da
preparação no marcador final, hashes dos três relatórios no manifesto, protocolo,
contagens e configuração compatíveis, além da validação das saídas agregadas.
Se `expected_result` for fornecido, o retorno da API também deve concordar. A API
faz essa checagem antes de retornar. Um conjunto íntegro com status `incomplete`
pode ter `valid_artifacts=True`, mas sempre `technically_complete=False`.

**Qualquer presença de `failed.json` invalida a conclusão**, independentemente de
seu conteúdo e da existência de `finished.json` ou de um manifesto completo. Uma
falha tardia pode preservar os dois marcadores como evidência; não é interpretada
como sucesso. Campos/hash/arquivos ausentes ou alterados também invalidam o conjunto.
Os hashes não autenticam um produtor malicioso capaz de reescrever todos os arquivos.

Todas as operações posteriores à reserva pertencem ao tratamento de falhas,
inclusive `started.json`. Se a reserva falhar, não se escreve dentro de um destino
cuja propriedade exclusiva não foi obtida. Depois da reserva, tenta-se gravar
`failed.json`; se o disco/permissões também impedirem essa gravação, preservam-se
as evidências e a API retorna erro sanitizado. Nenhuma evidência é sobrescrita
para forçar um diagnóstico. A ausência de um marcador de falha não prova que
nenhum erro ocorreu: falhas simultâneas de armazenamento podem impedir o registro.

O consumidor verifica um instante, não uma transação distribuída ou garantia
absoluta de durabilidade. Alterações concorrentes e falha irregistrável após a
última gravação não podem ser excluídas apenas pela leitura dos arquivos. Em caso
de erro da API, queda do processo ou inconsistência operacional, tratar a execução
como não aceita até investigação humana, mesmo se algum marcador parecer completo.

Recuperação: interromper, manter o diretório intacto e privado, conferir erros
fixos, marcadores e hashes com o consumidor, investigar armazenamento/permissões
e não usar os resultados para conclusões. Não apagar, retomar ou reutilizar o
destino automaticamente. Uma nova tentativa exige destino novo e novas revisões
vinculadas a ele; isso não autoriza mudar seeds, população ou hiperparâmetros.

## Testes e interpretação

```text
python -B -m unittest discover -s tests -p test_run_private_optimization_v2.py -v
python -B -m unittest discover -s tests -p test_private_v2_contracts.py -v
python -B -m unittest discover -s tests -q
```

Os testes geram CSVs e documentos fictícios em temporários externos. A maioria
usa relatórios inventados para testar os controles; um teste executa o protocolo
completo em36 registros fictícios, com conferência nativa de ACLs. A chave de
teste e as revisões fictícias não comprovam autorização real. As métricas não
são apresentadas como resultados científicos.

Com cerca de36 respostas reais válidas, se confirmadas, folds terão7/8 registros,
escolhas podem ser instáveis e os15 folds reutilizam pessoas. Não há validação
externa, equivalência demonstrada, diagnóstico ou intervalo de confiança pelo
desvio dos folds. Comparações v1/v2 continuam sujeitas às diferenças de grade e
desempate; não atribuir melhorias exclusivamente à redução de variáveis.

Antes da primeira entrada real: revisar esta implementação, conferir instituição
e TCLE, provisionar chave/ACLs e registros externos, confirmar população e
independência, fixar código limpo e ambiente, autorizar a sessão específica e
garantir armazenamento privado. Nenhuma dessas pendências foi resolvida usando
participantes nesta tarefa.
