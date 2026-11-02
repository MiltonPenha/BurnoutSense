# Ambiente experimental v2 — referência Windows

## Diagnóstico e escopo

Referência inspecionada a partir do commit
`6b9ef81eac13bca2c1153e1a1365cb3f8a3d72e8`: ambiente virtual externo ao
repositório, CPython 3.12.14, Windows AMD64 de 64 bits. Nenhum pacote foi instalado
ou atualizado nesta etapa. Os requisitos de produção/desenvolvimento existentes
permanecem inalterados.

`requirements.txt` fixa FastAPI, uvicorn[standard], pandas, NumPy, scikit-learn e
joblib; `requirements-dev.txt` acrescenta httpx. As transitivas estavam abertas.
O snapshot separado `ai-service/requirements-v2-windows-py312.txt` registra as
48 distribuições efetivamente instaladas, incluindo pip25.0.1, sem escolher novas
versões. O extra standard de uvicorn foi preservado para declarar suas dependências
condicionais, mesmo que o freeze simples mostre somente uvicorn.

Núcleo científico: NumPy1.26.4, pandas2.2.2, scikit-learn1.5.1, joblib1.4.2;
transitivas relevantes: SciPy1.17.1, threadpoolctl3.7.0, python-dateutil3.0.0,
pytz2026.6 e tzdata2026.6. São versões observadas no ambiente, não recomendações
de atualização. `pip check` passou no ambiente de referência.

Não há dependência externa nova exclusiva da v2: os módulos reutilizam o núcleo
científico e a biblioteca padrão. FastAPI/uvicorn/httpx e suas transitivas são
mantidos para reproduzir também os testes da API e os metadados exigidos pelo
executor/contratos. Não se propõe uma segunda resolução mínima, pois ela ainda
não teria sido validada com a suíte completa.

## Estratégia

Usar `venv` e pip, sem introduzir gerenciador adicional. O snapshot fixa versões
diretas e transitivas separadamente da aplicação. O verificador stdlib
`ai-service/tools/verify_v2_environment.py` compara a plataforma e o conjunto
**exato** instalado, incluindo pacotes extras e duplicatas. Retorno 0 significa
correspondência de metadados; 2 indica divergência ou falha da auditoria.

### Gramática aceita e diagnósticos

O verificador usa somente a biblioteca padrão. Nomes devem ter de 1 a 200
caracteres ASCII, começar e terminar com letra ou dígito, e conter internamente
somente letras, dígitos, ponto, hífen ou underscore. Normaliza caixa e sequências
de `-`, `_` e `.` para um hífen. Nomes como `Typing_Extensions` e
`typing-extensions` são equivalentes; duplicatas após normalização são rejeitadas.
Nomes apenas de pontuação são inválidos.

Versões usam um **subconjunto estrito de PEP 440**, não um parser completo:
segmentos inteiros não negativos separados por pontos, sem zeros iniciais
(exceto o próprio zero), com até 128 caracteres. Exemplos: `0.0.5`, `1.26.4`,
`2026.10.23`. Não aceita epochs, pré-releases, dev/post releases, versões locais,
prefixo `v`, sinais ou espaços. Essa limitação deliberada cobre as 48 versões
observadas; uma versão PEP 440 válida fora desse subconjunto exige revisão,
não relaxamento automático da auditoria.

As linhas de requisitos devem ser `nome==versao`, ou `uvicorn[standard]==versao`;
outros extras, operadores, URLs e caminhos são rejeitados. Linhas vazias e
comentários iniciados em `#` são permitidos. Nomes e versões também são validados
nos metadados instalados, antes de comparação ou inclusão nos diagnósticos.
Dois valores igualmente inválidos nunca constituem correspondência.

Metadados inválidos tornam `matches=False` e são representados por códigos e
contagens em `diagnostic_counts`: `invalid_distribution_name`,
`invalid_distribution_version`, `duplicate_distribution_name`,
`direct_url_metadata`. Não são reproduzidos nomes inválidos, strings de versão
ou conteúdo de direct_url.json. `invalid_version_names`, `missing`, `unexpected`
e `version_mismatches` contêm somente nomes sintaticamente válidos normalizados.
O total instalado conta inclusive registros inválidos e duplicados.

Erros de leitura, snapshot inválido e exceções inesperadas no processamento ou
na renderização produzem somente `ENVIRONMENT_AUDIT_FAILED` em stderr, sem JSON
parcial nem traceback. Argumentos desconhecidos produzem
`ENVIRONMENT_ARGUMENTS_INVALID`, sem ecoar os argumentos. Auditoria normal:
retorno0 somente se tudo corresponder; retorno2 para divergência, metadados
inválidos ou falha. Informações de runtime não reconhecidas são omitidas como
`null`, preservando a indicação de plataforma incompatível.

Limite: validação sintática não comprova que um nome válido é público ou autêntico.
Um valor que satisfaça a gramática pode ainda representar um pacote privado;
os diagnósticos devem permanecer sob controle do operador. Isso não é um detector
universal de informações pessoais nem autenticação dos metadados.

Isso é um snapshot de versões, **não um lock criptográfico dos artefatos**. Não
foram inventados hashes de wheels a partir de nomes, versões ou arquivos RECORD.
RECORD refere-se a arquivos instalados, não prova o SHA-256 da distribuição
original. Os metadados observados não tinham direct_url.json; isso também não
autentica a origem dos pacotes.

## Recriação futura, sem dados presentes

Executar em Windows AMD64, usando um executável CPython **3.12.14** previamente
verificado. Não confiar no primeiro `python` ou `py -3.12` disponível sem conferir
patch, arquitetura e origem. Definir caminhos locais por variáveis; nenhum dado
ou ambiente virtual deve ser colocado no repositório.

Exemplo PowerShell, a partir da raiz do projeto, apenas para preparação futura:

```powershell
# Definir antes: $ReferencePython (CPython 3.12.14) e $V2Environment (destino externo novo).
if (Test-Path -LiteralPath $V2Environment) { throw 'Escolha um ambiente novo' }
& $ReferencePython -m venv $V2Environment
if ($LASTEXITCODE -ne 0) { throw 'Falha na criacao do ambiente; interromper preparacao' }
$V2Python = Join-Path $V2Environment 'Scripts/python.exe'
& $V2Python -m pip --isolated install --only-binary=:all: -r ai-service/requirements-v2-windows-py312.txt
if ($LASTEXITCODE -ne 0) { throw 'Instalacao incompleta; nao substituir versoes' }
& $V2Python -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Dependencias inconsistentes' }
& $V2Python -B ai-service/tools/verify_v2_environment.py
if ($LASTEXITCODE -ne 0) { throw 'Ambiente diferente da referencia' }
```

O snapshot inclui pip25.0.1; ele também será fixado. Não executar upgrade genérico
de pip/pacotes. `--only-binary=:all:` impede compilação local silenciosa; se um
wheel exato não estiver disponível, interromper e registrar a pendência.
`--isolated` reduz influência da configuração pessoal do pip, mas não substitui
origem confiável, revisão dos artefatos ou isolamento operacional. A instalação
usa rede somente na preparação, nunca enquanto dados privados estiverem presentes.

Esses comandos de instalação **não foram executados nesta etapa**. A recriação
limpa e a disponibilidade de todos os wheels ainda precisam de confirmação.

## Hashes e reprodução offline — pendência explícita

Antes de uma futura execução científica, coletar em preparação separada os wheels
exatos para CPython3.12/Windows AMD64, registrar nomes/tags/SHA-256 e revisar sua
origem. Criar arquivo adicional completamente fixado com hashes reais, incluindo
todas as dependências, e testar instalação com `--require-hashes` em venv novo.
Após revisão, permitir instalação offline com wheelhouse verificado,
`--no-index` e `--find-links`. Não usar o snapshot atual com a alegação de que
`--require-hashes` já foi satisfeito.

O hash do snapshot emitido pelo verificador é do texto normalizado LF; não é hash
de wheel. Arquivar também versão/hash/origem do próprio Python. Artefatos de
instalação não pertencem a diretórios de respostas privadas e não precisam ser
versionados com o código. Definir armazenamento separado, controlado e revisado.

## Verificação e testes sintéticos

Além do verificador, executar `pip check`: o primeiro compara o snapshot, o
segundo avalia compatibilidade declarada das dependências. A verificação por
metadata não certifica binários, comportamento ou segurança das versões.
O script não instala pacotes, não abre CSV, não importa os modelos científicos,
não executa treinamento e não habilita modo real.

Testes novos do verificador ficam embutidos em modo separado para manter esta
alteração limitada aos três arquivos autorizados. A partir da raiz:

```powershell
& $V2Python -B ai-service/tools/verify_v2_environment.py --self-test
```

Esse modo executa 16 testes com metadados fictícios, sentinelas de URLs/caminhos,
falhas simuladas e uma conferência das 48 distribuições do ambiente auditado.
Retorna0 se os testes passarem ou1 se houver falha. Não abre dados de participantes
e não instala pacotes. A conferência de referência exige o Windows/Python fixados;
não interpretar uma falha em outra plataforma como autorização para alterar pins.
Os testes embutidos são executados separadamente e não entram na contagem da
suíte descoberta em `ai-service/tests`.

A partir de `ai-service`, usando o executável explícito do venv:

```powershell
& $V2Python -B -m unittest discover -s tests -p test_private_v2_contracts.py -v
& $V2Python -B -m unittest discover -s tests -q
```

Os contratos têm 31 testes; a suíte auditada tem 243 testes, todos sintéticos ou
fixtures artificiais. São contagens de referência, não resultados presumidos em
uma futura máquina. A suíte inclui duas avaliações integrais sintéticas; não
executar outra demonstração de treinamento apenas para verificar o ambiente.
Temporários dos testes devem ficar fora do repositório, em diretório controlado.

O protocolo em `docs/ML_OPTIMIZATION_V2_PROTOCOL.md` deve permanecer idêntico ao
commit94afa61. Conferir com Git e `validate_protocol_bytes()` antes de qualquer
execução futura. O snapshot não muda conjuntos, catálogo, seeds ou pipelines.
Uma atualização de biblioteca exige ambiente novo, justificativa e revisão dos
contratos/parâmetros efetivos; não regenerar o snapshot automaticamente só para
fazer uma divergência passar.

## Limitações e dados reais

Este snapshot se destina exclusivamente a Windows AMD64 e CPython3.12.14. Linux,
macOS, ARM64 e outras versões exigem resolução/auditoria próprias; por exemplo,
uvicorn[standard] inclui uvloop em plataformas compatíveis fora do Windows.
Não remover esse pacote extra do verificador para aparentar equivalência.
BLAS/OpenMP, CPU, wheels e bibliotecas nativas podem alterar resultados mesmo
com versões nominais iguais. Registrar `numpy.show_config()`,
`sklearn.show_versions()`, plataforma e configurações de threads em manifesto
privado futuro. Não mudar limites de threads para buscar resultados favoráveis.

Continuam pendentes a validação dos wheels e da recriação limpa, a verificação
institucional/consentimento, a confirmação privada da população/independência e
o mecanismo real separado ainda não implementado/aprovado. Correspondência do
ambiente não autoriza processamento real, não valida cientificamente o protocolo
e não promove modelo. O executor sintético continua bloqueando dados reais.
