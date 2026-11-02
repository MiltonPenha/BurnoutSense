# Avaliação local simplificada v2

Fluxo adicional autorizado pelo responsável, separado do executor privado HMAC.
Não altera a v1, o protocolo congelado, os modelos, os conjuntos ou a API.

Usar o Python reproduzido e, em `ai-service`, executar:

```powershell
& $V2Python -B -m training.run_local_optimization_v2 --output $NovaPastaPrivadaDeInspecao
```

A única entrada é `Path.home()/BurnoutSense-v2-private-data/input/BurnoutSense_Form_v1.0.csv`.
Seu SHA-256 precisa corresponder à cópia controlada registrada. Caminhos, ausência
de redirecionamentos, link único, ACLs, estabilidade da leitura, ambiente, módulos
científicos e protocolo são conferidos pelos validadores existentes. A entrada
original, documentos e chave não são modificados nem a chave é lida.

A inspeção usa o importador oficial, descarta administrativos e prepara X/y sem
fit. Contagens de ausências em todas as linhas incluem negativos de elegibilidade
que podem ter campos posteriores em branco. Rejeições são contadas pelo primeiro
erro oficial; motivos de inelegibilidade pelo primeiro critério negativo válido.
Perfis analíticos idênticos são sinalizados, nunca removidos automaticamente.
Ausência de perfis idênticos não demonstra independência entre participantes.

Após apresentar a inspeção e revisar a adequação, a avaliação usa um destino novo:

```powershell
& $V2Python -B -m training.run_local_optimization_v2 --evaluate --expected-input-sha256 $HashDaInspecao --output $NovaPastaPrivadaDeAvaliacao
```

Não há flags para alterar o protocolo: A/B/C, 21 candidatas, 5 externos x 3
repetições x 3 internos, seed 42. Reutiliza run/verify/compare e a lista permitida
dos relatórios. O principal resultado é o procedimento de seleção, não um vencedor
escolhido retrospectivamente pelas médias externas. Não faz refit final ou exporta
modelo, respostas, índices de participantes ou previsões individuais.

O manifesto registra hashes, versões, commit, Git eventualmente sujo pelos novos
arquivos autorizados e o hash do novo módulo, além das condições operacionais.
Diretórios/arquivos existentes não são sobrescritos. Falhas fatais têm código fixo;
diagnósticos científicos incompletos são preservados e não recebem status completo.

## Rede e limites

O Windows permanece conectado. Não há chamadas HTTP, APIs, Gemini ou serviços
externos neste fluxo. O bloqueio temporário de sockets Python e descarte de
stdout/stderr dos módulos reduzem exposição acidental, mas NÃO isolam o processo
no sistema operacional. Bibliotecas nativas, processos externos, administradores,
alterações concorrentes, agentes de sincronização/backup ou software comprometido
continuam riscos. Não executar concorrendo com outras tarefas no mesmo processo.
Os subprocessos dos validadores existentes são Git e PowerShell local para ACLs.

Resultados e gráficos agregados continuam privados. Comparação v1/v2 é apenas
descritiva quando população, ordem e partições não estão comprovadamente iguais;
não atribuir diferenças exclusivamente à redução de variáveis. Os 15 folds
reutilizam participantes e seu desvio padrão não é intervalo de confiança.

Testes: `python -B -m unittest discover -s tests -p test_run_local_optimization_v2.py -v`.
Todos os testes novos usam exclusivamente dados fictícios.
