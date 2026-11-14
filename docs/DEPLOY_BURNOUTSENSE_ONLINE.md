# Publicar o BurnoutSense: Vercel, Render e domínio próprio

Guia para publicar a branch `main` em `burnoutsense.online`. As configurações
abaixo precisam ser realizadas nas contas dos provedores; alterações locais e
um commit não configuram Vercel, Render, SMTP nem DNS automaticamente.

## Ordem da primeira publicação

1. Disponibilizar o commit da `main` no GitHub por push.
2. Preparar a caixa `lembrete@burnoutsense.online` e o DNS de e-mail na Hostinger.
3. Criar o PostgreSQL no Render.
4. Criar a IA privada, enviar o pacote RF/A e confirmar `/ready`.
5. Criar o backend NestJS, configurar o ambiente e aplicar as migrações.
6. Conectar `api.burnoutsense.online` ao backend e aguardar HTTPS.
7. Criar o projeto Next.js na Vercel e conectar raiz/www.
8. Validar login, registros, IA e recuperação de senha; depois habilitar lembretes.

**Atenção ao plano:** o backend Free do Render bloqueia saída SMTP nas portas
25, 465 e 587 e pode dormir por inatividade. Para manter o SMTP Hostinger deste
projeto e o lembrete ao meio-dia, use uma instância paga sempre ativa para o
NestJS. A IA privada com disco também usa recursos pagos. O PostgreSQL Free
expira após 30 dias e não é a escolha de produção com dados reais. Confira
limites, orçamento e backups antes de contratar; este guia não cria cobranças.

## 1. Arquitetura final

| Endereço/recurso | Serviço |
| --- | --- |
| `https://burnoutsense.online` | Next.js na Vercel |
| `https://www.burnoutsense.online` | Redirecionamento para o endereço sem www |
| `https://api.burnoutsense.online` | NestJS no Render |
| Endereço privado do Render | FastAPI com o RF/A, acessível somente ao NestJS |
| Banco privado do Render | PostgreSQL |

Não é necessário BFF: frontend e API usam HTTPS no mesmo site, com origens
diferentes. Os cookies pertencem somente ao host da API, sem atributo Domain.
O navegador envia cookies HttpOnly, Secure e SameSite=Lax. O frontend não lê
tokens de sessão, nem recebe esses tokens no JSON de autenticação.

O backend exige a origem exata e um token CSRF nas operações de alteração.
Não adicione `*.vercel.app`, `*` ou domínios de previews à origem de produção.
Os links padrão `vercel.app` e `onrender.com` não são os endereços de uso final.

## 2. Antes de começar

1. Tenha acesso ao DNS do domínio, ao GitHub, à Vercel e ao Render.
2. Ative MFA nas contas administrativas e limite quem acessa as variáveis privadas.
3. Selecione **`main`** como branch de produção na Vercel e nos dois serviços de
   código do Render. Não deixe `codex/acompanhamento-local` selecionada por engano.
4. Confirme que o commit desejado aparece no GitHub em `main`. Se estiver apenas
   local, publique com `git push origin main`. Não use push forçado.
5. Separe o pacote privado RF/A de origem confiável e confirme seus hashes conforme
   [RF_A_TEAM_SETUP.md](RF_A_TEAM_SETUP.md). Não publique artefatos nem `.env` no Git.
6. Separe orçamento para banco, backend sempre ativo e IA. O domínio não paga esses
   serviços. Recursos gratuitos podem dormir, expirar ou ter restrições; confira os
   limites atuais antes de usar dados reais.

## 3. Criar o PostgreSQL no Render

1. No Render, escolha **New > Postgres**.
2. Escolha nome, região e plano adequados. Use a mesma região para banco, API e IA.
3. Aguarde o banco ficar disponível.
4. Copie a **Internal Database URL** para a configuração privada da API.
5. Restrinja acesso externo e configure backup/retenção de acordo com o plano.

Use banco dedicado à aplicação publicada. O banco do seu computador não é
transferido automaticamente. Não importe contas de testes nem dados de pesquisa.
Não use `prisma migrate reset`, `db push` ou remoção de volumes.

## 4. Publicar a IA privada no Render

### 4.1 Criar o serviço

1. Conecte o repositório GitHub no Render.
2. Escolha **New > Private Service**, não Static Site e não Background Worker.
3. Escolha a branch definida na etapa 2 e a mesma região do banco/API.
4. Configure **Root Directory: `ai-service`** e runtime **Docker**.
5. Use o Dockerfile desse diretório. Não adicione modelo nem credenciais à imagem.
6. Configure um disco persistente, com montagem em `/var/data` e tamanho compatível
   com os quatro arquivos privados. Esse recurso depende de plano pago.
7. Configure as variáveis abaixo no painel; nunca no repositório.

```dotenv
PORT=8000
BURNOUTSENSE_MODEL_DIR=/var/data/rf-a-candidate-v1
BURNOUTSENSE_DATASET_VERSION=rf-a-candidate-v1
BURNOUTSENSE_EXPERIMENTAL_MODEL=true
BURNOUTSENSE_TRUST_LOCAL_MODEL=true
BURNOUTSENSE_ENVIRONMENT=production
BURNOUTSENSE_SHADOW_RIDGE_ENABLED=false
BURNOUTSENSE_API_KEY=GERAR_UM_SEGREDO_PROPRIO_COM_PELO_MENOS_32_CARACTERES
```

O Dockerfile usa Python 3.12.14 e o snapshot `requirements-linux-py312.lock`,
incluindo scikit-learn 1.5.1. O pipeline não é retreinado. A validação de
prontidão continua obrigatória: um build bem-sucedido não prova que o modelo carregou.

### 4.2 Entregar o pacote privado

Depois do primeiro deploy, `/health` pode funcionar mesmo sem modelo. Isso é esperado
durante a instalação, mas **não habilita o fluxo da aplicação**.

1. No Render, cadastre sua chave pública SSH em **Account Settings > SSH Public
   Keys**. Se ainda não tiver um par de chaves, gere um no PowerShell:

```powershell
ssh-keygen -t ed25519 -C "burnoutsense-render"
```

Escolha uma senha para proteger a chave privada. Não sobrescreva uma chave
existente: reutilize uma autorizada ou escolha outro nome de arquivo. Cadastre
somente o arquivo `.pub`; nunca envie a chave privada. O Dockerfile prepara o
diretório SSH exigido pelo Render e não executa servidor SSH próprio.

2. No serviço da IA, copie o comando de conexão em **Connect > SSH**.
3. Conecte-se e crie a pasta de destino:

```sh
mkdir -p /var/data/rf-a-candidate-v1
chmod 700 /var/data/rf-a-candidate-v1
```

4. Transfira por canal privado os quatro arquivos para essa pasta:
   `context_regressor.private.joblib`, `candidate-manifest.private.json`,
   `input-schema.json`, `v2-reference.aggregate.json`.
5. Para transferência do computador, use o host/usuário SSH exatos mostrados pelo
   Render. Exemplo genérico de SCP, substituindo os placeholders:

```powershell
scp "CAMINHO_PRIVADO/context_regressor.private.joblib" "USUARIO@HOST_SSH:/var/data/rf-a-candidate-v1/"
```

Repita para os outros três arquivos. Não copie o `.env` local: configure segredos
pelo painel. Não use links públicos ou cole base64 do joblib em arquivos versionados.
O manifesto de integridade da equipe deve ser recebido por canal confiável separado;
compare os hashes antes de carregar o pacote.

Use OpenSSH recente, com transferência SFTP padrão. Se seu cliente antigo exigir,
siga a orientação de SCP/SFTP do Render. Confira a impressão digital SSH do
servidor com a documentação oficial antes de aceitar a primeira conexão.

6. Reinicie o serviço depois de disponibilizar o pacote.
7. Pelo Shell privado do Render, consulte `/ready` sem imprimir a chave:

```sh
python -c 'import os,urllib.request; r=urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/ready",headers={"X-API-Key":os.environ["BURNOUTSENSE_API_KEY"]})); print(r.status)'
```

O resultado precisa ser 200. Se for 503, investigue pacote, hashes e versões; não
substitua a previsão por um resultado fictício. Use um contexto fictício de
`/v1/examples` para uma chamada autenticada a `/v1/predict` e confira o RF/A.
Não envie respostas reais à rotina de teste.

8. Copie o endereço **interno** do serviço. A API usará, por exemplo,
   `http://NOME_INTERNO_DA_IA:8000`, com a chave compartilhada somente entre servidores.

Se o provedor/plano não permitir disco e SSH, será necessário outro mecanismo
privado e autenticado para entregar o artefato. Não há download público automático
nem modelo embutido neste repositório.

## 5. Publicar o NestJS no Render

1. Escolha **New > Web Service** e conecte o mesmo repositório via GitHub.
2. Defina **Branch: `main`**, **Root Directory: `backend`**, runtime **Node**.
   Escolha uma instância paga para o SMTP Hostinger e mantenha uma única instância
   nesta primeira publicação. Não execute outro agendador externo em paralelo.
3. O arquivo `.node-version` solicita Node 22. Não deixe uma variável antiga
   `NODE_VERSION` sobrescrever essa escolha com outra versão principal.
4. Use este **Build Command**:

```sh
corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --frozen-lockfile --prod=false && pnpm exec prisma generate && pnpm run build
```

5. No **Pre-Deploy Command**, configure:

```sh
pnpm exec prisma migrate deploy
```

O `--prod=false` é intencional no build: Nest CLI, TypeScript e Prisma CLI são
necessários para compilar e aplicar migrações mesmo com `NODE_ENV=production`.

O pre-deploy depende do plano. Se ele não estiver disponível, use, para uma única
instância deste protótipo, o Start Command `pnpm exec prisma migrate deploy && node dist/main.js`.
Não rode migrações destrutivas e não rode `migrate dev` em produção.

A migração `20261113010000_harden_daily_reminders` renomeia um campo usado pelo
agendador. Nesta atualização, pare as instâncias antigas antes de aplicá-la e
inicie apenas a versão nova depois. Não trate essa mudança como deploy sem
interrupção com agendadores antigos ativos. Ela preserva contas e preferências.

6. Com pre-deploy configurado, o **Start Command** é:

```sh
node dist/main.js
```

7. Configure **Health Check Path: `/health`**. Esse endpoint confirma a API e a
   conexão com o banco, não a prontidão do RF/A; valide `/ready` separadamente.
8. Configure as variáveis do ambiente:

| Variável | Valor/como preencher |
| --- | --- |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://burnoutsense.online`, sem barra final |
| `DATABASE_URL` | Internal Database URL do PostgreSQL |
| `JWT_ACCESS_SECRET` | Segredo aleatório próprio, com pelo menos 32 caracteres |
| `CSRF_SECRET` | Outro segredo aleatório independente, com pelo menos 32 caracteres |
| `JWT_ACCESS_EXPIRES_IN` | `30m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `TRUST_PROXY_HOPS` | `1`, confirmando a topologia do proxy do Render |
| `AI_SERVICE_URL` | URL interna da IA com porta, sem barra final |
| `AI_SERVICE_API_KEY` | Mesmo segredo de `BURNOUTSENSE_API_KEY` da IA |
| `ESBEU_ASSESSMENTS_ENABLED` | `true` |
| `DAILY_CONTEXT_EVOLUTION_ENABLED` | `true` |
| `GEMINI_GUIDANCE_ENABLED` | `true` se a integração estiver configurada |
| `GEMINI_API_KEY` | Chave privada e válida do projeto da equipe |
| `GEMINI_MODEL` | Modelo habilitado na conta, conforme `.env.example` |
| `DAILY_REMINDER_ENABLED` | Começar com `false`; habilitar após validar SMTP |
| `DAILY_REMINDER_HOUR` | `12` |
| `DAILY_REMINDER_MINUTE` | `0` |
| `DAILY_REMINDER_TIMEZONE` | `America/Sao_Paulo` |

O Render fornece `PORT`; não force a porta 3001 do seu computador em produção.
O NestJS escuta em `0.0.0.0` para receber as conexões do proxy.

Para gerar cada segredo, rode este comando localmente e leve o valor diretamente
ao painel privado, sem salvá-lo em código, print de tela ou commit:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Rode separadamente para JWT, CSRF e autenticação da IA. `JWT_REFRESH_SECRET` não é
mais necessário: refresh tokens são segredos aleatórios com hash SHA-256 no banco.
Isso não muda a proteção das senhas humanas, que continuam com bcrypt e salt.

### E-mail e lembrete

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e
`SMTP_FROM` conforme o provedor de e-mail. `SMTP_SECURE=false` com porta 587 usa
STARTTLS quando disponível, enquanto porta 465 normalmente usa `true`.
Confirme as exigências do seu provedor e não use uma senha normal de Gmail.

A equipe definiu `lembrete@burnoutsense.online` como remetente dos lembretes.
No hPanel, abra **E-mails**, gerencie essa caixa e consulte a configuração de
aplicativos/dispositivos. Se o serviço for **Hostinger Mail**, a configuração
SMTP padrão é a seguinte; confirme os dados exibidos para sua caixa:

```dotenv
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=lembrete@burnoutsense.online
SMTP_PASS=SENHA_SMTP_DA_CAIXA_POSTAL
SMTP_FROM="BurnoutSense <lembrete@burnoutsense.online>"
```

Na Hostinger, confira primeiro se o webmail dessa caixa envia e recebe mensagens.
Em **E-mails > Gerenciar > Configurações do domínio**, conecte ou valide MX, SPF,
DKIM e DMARC usando os valores exibidos para esse serviço. Se os nameservers
continuarem na Hostinger, use a conexão automática quando disponível. Não crie
dois registros SPF independentes para o mesmo host e não apague os registros de
e-mail quando apontar o site para a Vercel.

Configure a senha autorizada para SMTP dessa caixa apenas no `.env` privado do
backend ou em **Environment** no Render. Ela não é a senha da conta administrativa
da Hostinger. Não a envie no chat nem a publique no Git. Se o painel indicar Titan
ou outro serviço de e-mail, use o servidor e a autenticação desse serviço em vez
de assumir `smtp.hostinger.com`. Não desative a validação de certificados TLS.

O exemplo versionado identifica o remetente, mas mantém a senha vazia e o agendador
desligado. Ele não substitui `.env` existentes nem configura automaticamente o
Render. Depois de preencher as variáveis privadas, reinicie o NestJS.
O texto e o HTML do lembrete não dependem de usar Gmail ou domínio próprio.

O mesmo remetente e SMTP também atendem a
[recuperação de senha](PASSWORD_RECOVERY.md). Esses envios são solicitados pela
pessoa no login e não dependem da preferência de lembrete diário. O link expira
em 30 minutos, funciona uma vez e encerra as sessões anteriores após a redefinição.
Antes de publicar, aplique também a migração `20261114010000_add_password_reset`.

Se futuramente optar por Gmail, use as configurações SMTP do Google e uma senha
de aplicativo, quando disponível, com verificação em duas etapas. Não basta trocar
o remetente para Gmail mantendo o servidor SMTP da Hostinger, ou vice-versa.

Um domínio comprado não cria uma caixa postal nem um serviço SMTP. Para enviar
como `@burnoutsense.online`, verifique o domínio no provedor de e-mail e configure
SPF/DKIM/DMARC conforme ele orientar. Não remova registros MX/TXT existentes ao
configurar o site. No Render Free, as portas 465 e 587 estão bloqueadas: trocar
a senha ou alternar entre essas portas não contorna a limitação do plano.

Não há mais botão nem rota de teste manual de e-mail. Valide primeiro o fluxo
com os testes automatizados, que simulam SMTP sem mensagens reais. Para validar
entrega real, autorize e configure um ambiente isolado, com remetente e destinatário
controlados pela equipe, e use o agendador na janela configurada; não habilite
envios para contas reais só para teste. Depois habilite
`DAILY_REMINDER_ENABLED=true`. O agendador atual roda dentro do NestJS: se o
serviço dormir ou ficar parado, o envio não tem execução garantida. Para lembrete
diário previsível, use serviço sempre ativo; não prometa pontualidade em plano que dorme.

### Primeiro teste de e-mail publicado

1. Mantenha `DAILY_REMINDER_ENABLED=false` e crie uma conta de validação com uma
   caixa de entrada real controlada pela equipe, sem respostas acadêmicas reais.
2. Saia e clique em **Esqueci minha senha** no domínio final. Solicite o link para
   essa conta e confira remetente, spam e URL `https://burnoutsense.online/redefinir-senha`.
3. Redefina a senha, confira a confirmação por e-mail e entre com a nova senha.
   O link não pode funcionar novamente. A resposta genérica da solicitação não
   comprova entrega; confira a caixa postal e logs sanitizados do backend.
4. Para validar o agendador, ative a preferência de lembrete dessa conta e salve.
   Sem check-in de hoje, habilite `DAILY_REMINDER_ENABLED=true` e observe a janela
   das **12h às 12h10, America/Sao_Paulo**. O NestJS precisa estar ativo na janela.
5. Para testar antes desse horário, use um ambiente de homologação isolado com
   banco e destinatários de teste e um horário alguns minutos à frente. Não
   altere o horário de produção para disparar e-mails para todos os usuários.
6. Na produção, restaure/mantenha hora `12`, minuto `0`, fuso `America/Sao_Paulo`.
   Depois do teste, remova somente a conta de validação. Contas novas precisam
   ativar e salvar a preferência; quem já registrou o dia não recebe o lembrete.

## 6. Configurar o domínio da API

1. No serviço NestJS do Render, abra **Settings > Custom Domains**.
2. Adicione somente `api.burnoutsense.online`.
3. No painel DNS de quem gerencia o domínio, adicione o registro indicado pelo Render:
   normalmente **CNAME**, nome `api`, destino `SEU-SERVICO.onrender.com`.
4. Use o destino exato do painel; não copie um nome de exemplo deste guia.
5. Remova apenas registros conflitantes para o mesmo host `api`, preservando e-mail
   e outros subdomínios. Se usar Cloudflare, comece como DNS only, sem proxy extra.
6. Clique em **Verify** e aguarde a emissão do certificado TLS.
7. Confira `https://api.burnoutsense.online/health` e o status 200.

Sem TLS pronto, não teste autenticação de produção por HTTP e não remova Secure
para contornar o erro. O prefixo `__Host-` exige cookies seguros e restritos ao host.

## 7. Publicar o Next.js na Vercel

1. Escolha **Add New > Project** e importe `MiltonPenha/BurnoutSense` via GitHub.
2. Configure **Root Directory: `frontend`** e **Framework Preset: Next.js**.
3. Selecione Node 22.x nas configurações do projeto.
4. Use **Install Command: `npm ci`** e **Build Command: `npm run build`**.
   Deixe o Output Directory no padrão do Next.js; não use `out` nem exportação estática.
5. Defina **Production Branch: `main`** nas configurações Git/Production do projeto.
6. Em **Environment Variables**, ambiente **Production**, configure:

```dotenv
NEXT_PUBLIC_API_URL=https://api.burnoutsense.online
```

Não coloque JWT, CSRF_SECRET, SMTP, DATABASE_URL, chave do Gemini ou da IA na Vercel
como variáveis `NEXT_PUBLIC_*`. A URL da API é pública; as chaves não são.

7. Faça o deploy e confira os logs de build. Se mudar a variável pública depois,
   faça um novo deploy: ela é incorporada ao bundle durante o build.
8. Em **Settings > Domains**, adicione `burnoutsense.online` e
   `www.burnoutsense.online`. Configure www como redirecionamento para a raiz.
9. No DNS, adicione exatamente os registros mostrados pela Vercel para `@` e `www`.
   Os destinos podem ser específicos do projeto; não use IPs antigos de tutoriais.
10. Aguarde **Valid Configuration** e o certificado HTTPS.

Não aponte o domínio raiz para o Render e a Vercel ao mesmo tempo. Cada host deve
ter um destino coerente: raiz/www para Vercel; api para Render.

### 7.1 DNS na Hostinger

O domínio foi comprado na Hostinger. Ela pode continuar responsável pelo registro
e DNS; não é necessário transferir o domínio nem contratar hospedagem nela para
usar a arquitetura deste guia.

1. Entre no hPanel da Hostinger e abra **Domínios > DNS**. Se a interface mostrar
   a lista de domínios, escolha **Gerenciar** em `burnoutsense.online`.
2. Abra **DNS / Nameservers** e a aba **Registros DNS** (DNS records).
3. Confira os nameservers ativos. Mantenha os da Hostinger se já forem os atuais.
   Se forem de outro provedor, edite a zona ativa nesse provedor; alterar somente
   a lista exibida na Hostinger não muda a delegação existente.
4. Antes de editar, exporte ou guarde uma cópia dos registros atuais.
5. Depois de adicionar os domínios nos painéis da Vercel e do Render, preencha
   **Tipo**, **Nome**, **Valor/Aponta para** e **TTL** conforme os valores informados:

| Nome na Hostinger | Tipo | Destino |
| --- | --- | --- |
| `@` | Exatamente o solicitado pela Vercel | Valor exibido para `burnoutsense.online` |
| `www` | Normalmente CNAME; confirmar no painel | Destino exibido pela Vercel |
| `api` | CNAME | Host do serviço NestJS indicado pelo Render |
| Nome de verificação, se solicitado | TXT | Conteúdo exato fornecido pelo respectivo provedor |

6. Use **Adicionar registro** ou edite o registro existente. Preserve o TTL padrão
   se não houver orientação específica. Um destino CNAME é um host, sem `https://`,
   porta ou caminho.
7. Remova apenas conflitos dos hosts alterados, como um endereço antigo de
   estacionamento. Não restaure a zona inteira nem apague MX, SPF, DKIM ou DMARC.
8. Volte aos provedores e confirme a validação DNS e HTTPS. A propagação não é
   instantânea; evite trocar os valores repetidamente enquanto aguarda.

O redirecionamento de `www` para a raiz deve ser configurado na Vercel, não apenas
por CNAME: DNS aponta o host, mas não executa redirecionamento HTTP.

Não troque nameservers para os da Vercel por conta deste guia: a opção escolhida
é manter a zona DNS na Hostinger e adicionar os registros de cada serviço.

O preview em `*.vercel.app` não é o ambiente final de autenticação: ele é outro site
em relação à API. Para homologação, use um frontend e API separados no mesmo domínio
de homologação, com origem e banco próprios. Não abra CORS de produção para todos
os previews para fazer esse teste funcionar.

## 8. Validar a publicação

1. Abra `https://burnoutsense.online` e cadastre uma conta fictícia.
2. Confirme login, F5, nova aba e logout sem alterar o layout.
3. Em DevTools > Application/Storage > Cookies, selecione o host da API:
   `__Host-bs_access`, `__Host-bs_refresh` e `__Host-bs_csrf` devem ser HttpOnly,
   Secure, SameSite=Lax e Path=/, sem Domain compartilhado.
4. Em Local Storage, não deve haver valores em `burnoutsense.auth.accessToken`
   ou `burnoutsense.auth.refreshToken`. As chaves antigas são removidas pelo cliente.
5. Em Network, as respostas de login/cadastro/refresh devem conter usuário e token
   CSRF, nunca accessToken ou refreshToken. Token CSRF não é credencial de login.
6. Requisições de alteração precisam de `X-CSRF-Token`, origem autorizada e cookies.
   Falta de CSRF/origem deve retornar 403; sessão inválida, 401.
7. Complete um contexto fictício, salve hoje e depois ontem; ontem não deve mudar
   o índice atual. Confira histórico e comparação 7 + 7 quando houver 14 dias válidos.
8. Valide dicas do Gemini e o agendamento de lembrete separadamente, conforme a
   seção de e-mail. Contas novas começam com o lembrete desligado: ative e salve
   a preferência para receber. Não há mais envio manual pela página de perfil.
9. Verifique em navegador móvel e pelo menos dois navegadores diferentes.
10. Remova somente a conta fictícia de validação pelo próprio aplicativo.

Esta migração não altera senhas nem dados acadêmicos. Sessões antigas não são
compatíveis com o novo contrato: usuários precisam entrar novamente. JWTs novos
incluem sid, e a API consulta a sessão para rejeitar acessos após revogação.

## 9. Atualizações automáticas e branch

Commit no computador não atualiza o site. O fluxo é:

1. Alterar e testar localmente.
2. Fazer commit quando autorizado.
3. Fazer push para a branch vinculada aos provedores.
4. Aguardar build/deploy com sucesso na Vercel e no Render.

Na Vercel, confirme a integração Git e Production Branch. No Render, confirme
**Auto-Deploy: On Commit** ou **After CI Checks Pass**. Se configurado como Off,
o deploy será manual. Previews de outras branches não substituem a produção.

Mudanças só no frontend podem publicar apenas a Vercel. Porém alterações de
contrato, como esta migração de autenticação, precisam de backend e frontend
compatíveis. Na primeira publicação, planeje a atualização conjunta. Migrações
do banco são aplicadas no Render, não pela Vercel.

Não configure exclusões por pasta que ignorem dependências ou migrações necessárias.
Se o build falhar, confira qual versão está efetivamente ativa antes de testar.

## 10. Diagnóstico e retorno

| Sintoma | Conferir |
| --- | --- |
| Login funciona localmente, mas não no domínio | HTTPS, FRONTEND_URL exata, API URL do build e cookies do host api |
| 403 ORIGIN_INVALID | Origem real do navegador; raiz/www e ausência de barra final |
| 403 CSRF_INVALID | Cookies bloqueados, chamadas sem credentials e header CSRF; atualizar a página |
| F5 encerra a sessão | /auth/session, /auth/refresh, validade/revogação e atributos dos cookies |
| 502 ou timeout | Serviço ativo, porta do Render e logs sanitizados |
| Índice indisponível | Chave da IA, endereço interno, pacote privado e /ready autenticado |
| E-mail não chega | SMTP, spam, endereço válido, limites do plano e serviço sempre ativo |

Não faça downgrade para HTTP, libere CORS com wildcard ou reintroduza tokens em
localStorage como correção temporária. Para voltar uma versão, alinhe o deploy dos
dois serviços e exija novo login, preservando banco, volume da IA e artefatos.

## Referências oficiais

- [Hostinger: gerenciar registros DNS](https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/)
- [Hostinger: nameservers e delegação DNS](https://www.hostinger.com/support/1696789-how-to-change-nameservers-at-hostinger/)
- [Hostinger: configuração SMTP da caixa postal](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/)
- [Hostinger: conectar o DNS de e-mail](https://www.hostinger.com/support/8671304-set-up-a-domain-for-hostinger-email-automatically/)
- [Google: senhas de aplicativo](https://support.google.com/accounts/answer/185833)
- [Vercel: domínio próprio](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Vercel: integração Git](https://vercel.com/docs/git)
- [Render: domínio próprio](https://render.com/docs/custom-domains)
- [Render: deploy e migrações](https://render.com/docs/deploys)
- [Render: limitações do plano Free, incluindo SMTP](https://render.com/docs/free)
- [Render: Node](https://render.com/docs/node-version)
- [Render: serviços privados](https://render.com/docs/private-services)
- [Render: discos](https://render.com/docs/disks)
- [Render: SSH](https://render.com/docs/ssh)
- [NestJS: CSRF](https://docs.nestjs.com/security/csrf)
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
