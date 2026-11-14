# BurnoutSense: rodar o fluxo diário localmente

Este é o roteiro para a equipe do TCC e para o Codex ao iniciar ou diagnosticar
a aplicação. **O recálculo pelos check-ins faz parte do fluxo esperado de
desenvolvimento e demonstração.** O termo *experimental* descreve a validação
científica da adaptação, não uma instrução para pular essa funcionalidade.

## 1. O que está sendo habilitado

O primeiro índice é calculado a partir do contexto completo de 22 campos.
Nos check-ins, o NestJS usa os dias elegíveis da janela de 28 dias para atualizar
cinco desses campos: horas de sono, qualidade do sono, pressão de provas e
prazos, dificuldade de conciliar estudos e descanso e apoio percebido. Os outros
17 continuam vindo do último contexto completo confirmado. O FastAPI recebe o
contexto no mesmo formato e roda **o mesmo RF/A já treinado**. Não é necessário
esperar 28 registros, ter o CSV de pesquisa ou retreinar o modelo.

Há duas configurações distintas:

| Onde | Variável | O que faz |
|---|---|---|
| FastAPI | `BURNOUTSENSE_EXPERIMENTAL_MODEL=true` | Seleciona o carregador do pacote RF/A `rf-a-candidate-v1`. |
| NestJS | `DAILY_CONTEXT_EVOLUTION_ENABLED=true` | Habilita a atualização do contexto a partir dos check-ins. |

O valor `false` de `backend/.env.example` evita ativação implícita em
ambientes novos. Para testar o fluxo do TCC, use `true` no arquivo **local**
`backend/.env`, sem mudar o exemplo versionado. O índice não é diagnóstico
nem probabilidade de burnout. Veja [a especificação técnica](DAILY_TRACKING.md)
para as regras de elegibilidade e os limites da integração.

## 2. Subir os serviços

Use terminais separados no VS Code. Pré-requisitos: Node.js compatível com o
Next.js do projeto (mínimo 20.9), npm, pnpm (versão do `backend/package.json`),
PostgreSQL de desenvolvimento e Python 3.12 em venv. Use uma versão do código
que já inclua os check-ins, a revisão rápida e suas migrações. Não sobrescreva arquivos
`.env` existentes.

**PostgreSQL.** Se já houver um banco local autorizado, use-o e confira a
`DATABASE_URL`. Para usar o PostgreSQL do projeto com Docker, execute na raiz,
com o Docker iniciado:

```powershell
docker compose up -d postgres
docker compose exec -T postgres pg_isready -U burnoutsense -d burnoutsense
```

**FastAPI (porta 8000).** Siga o [guia RF/A da equipe](RF_A_TEAM_SETUP.md) para
receber o pacote privado por canal restrito, verificar os hashes e preparar o
venv. No Windows AMD64, use o snapshot indicado no guia, com
`scikit-learn==1.5.1` e `joblib==1.4.2`. Não use o Python global por engano
nem atualize essas bibliotecas para tentar carregar o modelo.

Em `ai-service/`, com `$Python` apontando para o executável do venv e as
variáveis do RF/A configuradas conforme o guia:

```powershell
& $Python --version
& $Python -m pip check
& $Python -B -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Confira `GET /health` e depois `GET /ready` com o cabeçalho `X-API-Key`,
conforme o guia RF/A. Use a mesma chave em `GET /v1/model` para confirmar
`model_name: random_forest` e `dataset_version: rf-a-candidate-v1`.
`/ready` confirma o carregamento do artefato configurado.
Ridge, Gemini e SMTP não são requisitos para este teste.

**NestJS (porta 3001).** Em `backend/`, crie a configuração só se não existir:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Configure `DATABASE_URL` para o banco local, segredos JWT próprios e
`AI_SERVICE_API_KEY` com a mesma chave privada de `BURNOUTSENSE_API_KEY`
no FastAPI. Não use a chave em variáveis `NEXT_PUBLIC_*`. Confira:

```dotenv
PORT=3001
FRONTEND_URL=http://localhost:3000
CSRF_SECRET=
AI_SERVICE_URL=http://127.0.0.1:8000
ESBEU_ASSESSMENTS_ENABLED=true
DAILY_CONTEXT_EVOLUTION_ENABLED=true
DAILY_REMINDER_ENABLED=false
DAILY_REMINDER_TIMEZONE=America/Sao_Paulo
```

Com o banco local confirmado, execute no mesmo diretório:

```powershell
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate status
pnpm exec prisma migrate deploy
pnpm start:dev
```

Migrações pendentes são normais em uma instalação nova. Em caso de falha,
divergência ou banco de origem incerta, pare e investigue antes de aplicar
migrações. Não use reset, `db push` ou remoção de volumes. Se o NestJS já
estiver rodando, reinicie-o após alterar o `.env`. Confira também se não há
uma variável do processo sobrescrevendo o valor do arquivo.

**Next.js (porta 3000).** Em `frontend/`:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev
```

Confirme `NEXT_PUBLIC_API_URL=http://localhost:3001` em `frontend/.env.local`.
Use `http://localhost:3000` no navegador. A sessão agora usa cookies e CSRF,
não tokens no localStorage. Não misture localhost e 127.0.0.1 no mesmo fluxo.
Se alterar as portas, atualize as URLs correspondentes no frontend e no backend.
Abra [o painel local](http://localhost:3000) com os quatro serviços ativos.
Leia [a autenticação por cookies](COOKIE_AUTH.md) para adaptar clientes de teste.

## 3. Validar sem usar dados reais

1. Use uma conta fictícia nova em banco de desenvolvimento. O gráfico combina
   resultados já calculados. Uma conta nova começa com os resultados do modelo
   ativo na demonstração. Clique em **Fazer
   primeiro registro**, complete o contexto com respostas fictícias e confira
   se o primeiro índice aparece no painel.
2. Clique em **Novo registro**. Salve o check-in de hoje com respostas de sono
   e rotina diferentes do contexto inicial. O formulário deve voltar ao
   painel, mostrar o salvamento e marcar o dia como registrado. Confira também
   a lista **Check-ins diários** no histórico.
3. Se o número ficar igual, confira a resposta autenticada
   de `PUT /daily-check-ins` na aba **Rede** do navegador. O campo
   `indexUpdate.status` distingue os casos:

| Status | Como interpretar |
|---|---|
| `updated` | Um novo cálculo foi salvo. O número pode ser igual, mesmo com entradas diferentes. |
| `unchanged` | As entradas agregadas não mudaram, então não houve nova chamada ao RF/A. |
| `historical` | Dia anterior ao check-in mais recente salvo no histórico, sem recalcular o índice atual. |
| `disabled` | Confira os dois flags do NestJS e reinicie o processo. |
| `needs_context` | Confirme que a conta tem um contexto inicial válido e consentimento atual. |
| `unavailable` ou `superseded` | O dia foi salvo, mas o resultado não foi publicado. Confira a prontidão da IA ou o estado mais recente antes de tentar atualizar novamente. |

Em `GET /daily-check-ins/overview`, `evolution.enabled` deve ser `true`
e `evolution.recordedDays` conta os dias elegíveis para o próximo cálculo. Os dias
efetivamente utilizados ficam na proveniência do índice salvo. Um dia
retroativo fora da janela aparece no histórico, mas não altera o índice.
Um dia pode ser editado sem duplicar o registro; não use datas futuras.

Para testar o aviso, grave 14 dias recentes em uma conta fictícia: sete
com sono de baixa qualidade e pressão alta e sete posteriores com respostas
melhores. Abra o painel e confira o aviso de melhora. Inverta os grupos para
testar o aviso de atenção. Altere apenas um dia em uma sequência estável para
confirmar que não abre um aviso. Em **Revisar minha rotina**, confirme uma
mudança e verifique a origem **Revisão rápida** no histórico; os check-ins
devem continuar registrados. O aviso acompanha as respostas, mesmo quando o
RF/A devolve o mesmo índice.

Para testar a ordem, salve hoje e depois ontem: o segundo salvamento deve retornar
`historical`, sem novo índice. Salvar ou editar novamente o dia mais recente permite
recalcular a média dos dias elegíveis. Se ontem ainda for a data mais recente da conta,
ele também pode calcular; ao salvar hoje depois disso, hoje passa a ser a referência.

Se faltar o pacote, a chave ou a versão de Python correta, informe qual
pré-requisito falhou. Não substitua a previsão real por dados fictícios e não
registre chaves, respostas ou dados pessoais no relatório de teste.

## 4. Conferir dashboard e histórico

A dashboard não repete o índice da sidebar nem a tabela de índices recentes.
O gráfico começa em Semanal e permite Diário/Mensal. As médias usam o último
cálculo de cada dia, no fuso de São Paulo. Check-ins retroativos não deslocam
previsões atuais para o passado.

Na vista diária, as bolinhas mostram índices pela data de cálculo. Os losangos
marcam os check-ins recentes pela data escolhida pelo estudante. Se os dias 11
e 12 forem registrados no dia 12 e os cálculos acontecerem no dia 12, o gráfico
mostra dois losangos e uma bolinha para o último cálculo do dia 12.

Novos índices vinculam explicitamente o check-in que originou o cálculo.
As datas de referência, cadastro, edição e cálculo são distintas. Excluir
um dia exclui seus índices diretamente vinculados e recalcula o estado atual,
preservando avaliações iniciais, revisões e resultados originados por outros dias.
Registros antigos sem vínculo não recebem associações inventadas.

O cartão de rotina recente resume o último check-in e dá acesso à revisão.
Quando há registros suficientes, apresenta a comparação de melhora ou piora
na própria dashboard. A conclusão do check-in aparece em notificação temporária.
Consulte [os lembretes diários](DAILY_REMINDERS.md) para o envio por e-mail.
As dicas gerais usam uma [integração opcional com Gemini](GEMINI_GUIDANCE.md).

O teste de integração abaixo exige os serviços locais e uma instalação do
Playwright indicada em BURNOUTSENSE_PLAYWRIGHT_MODULE. Ele cria e remove
somente contas fictícias e verifica que a antiga rota de envio manual
retorna HTTP 404 sem disparar e-mails:

```powershell
node backend/test/verify-dashboard-flow.cjs
```

O teste específico de ordem das datas e comparação 7 + 7 usa o mesmo ambiente.
Ele valida hoje/ontem, edição retroativa, ausência de pendência artificial e a média
preservada, removendo somente sua própria conta fictícia ao finalizar:

```powershell
node backend/test/verify-check-in-chronology.cjs
```
