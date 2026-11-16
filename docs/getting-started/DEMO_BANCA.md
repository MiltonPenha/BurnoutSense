# Demonstração híbrida da banca: 17 de novembro de 2026

Este é o caminho escolhido para o TCC, não uma hospedagem permanente:

`Navegador -> burnoutsense.online (Vercel /api) -> túnel HTTPS -> NestJS no PC -> FastAPI/RF-A no PC`

O NestJS usa o PostgreSQL externo do Render. O pacote privado e o Python 3.12
permanecem no PC. Não é necessário contratar backend, IA ou disco no Render.
Não se altera o treinamento nem se substituem previsões por resultados fictícios.

## 1. Arquivos privados no PC

O comando `node scripts/demo.mjs init --ai-env CAMINHO_DO_ENV_PRIVADO_DA_IA`
cria `.demo/backend.env` e `.demo/ai.env`, sem sobrescrever arquivos existentes
nem o `.env` de desenvolvimento. A pasta `.demo` inteira é ignorada pelo Git.
No computador já configurado, não rode init novamente: edite os arquivos existentes.

No VS Code, abra `.demo/backend.env` e confira:

- `DATABASE_URL`: **External Database URL**, não Internal, com `?sslmode=require`.
  Se já houver parâmetros, acrescente `&sslmode=require` sem duplicar parâmetros.
- `HOST=127.0.0.1`, `PORT=4301`, `NODE_ENV=production`.
- `FRONTEND_URL=https://burnoutsense.online`.
- `JWT_ACCESS_SECRET`, `CSRF_SECRET` e `DEMO_GATEWAY_SECRET`: já gerados,
  independentes. Não divulgue nem coloque em variáveis `NEXT_PUBLIC_*`.
- `AI_SERVICE_URL=http://127.0.0.1:4800` e chave correspondente à IA privada.
- `DAILY_CONTEXT_EVOLUTION_ENABLED=true` e `ESBEU_ASSESSMENTS_ENABLED=true`.
- `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`.
- `SMTP_USER=lembrete@burnoutsense.online` e remetente com esse endereço.
- `SMTP_PASS`: **preencha a senha dessa caixa postal**. Não é a senha administrativa
  da Hostinger. Não copie uma senha antiga de Gmail.
- Comece com `DAILY_REMINDER_ENABLED=false`; habilite após o teste de e-mail.

No Render, restrinja o acesso externo do banco ao IP público da conexão do PC,
quando possível. Se a conexão de internet mudar de IP, revise essa autorização.
O banco Free tem prazo de expiração; confirme que cobre a data da apresentação.
Nunca compartilhe a URL, senha ou capturas de `.demo`. Se divulgadas, troque as
credenciais no provedor e atualize o arquivo privado.

## 2. Preparar e iniciar

Pré-requisitos: dependências do projeto instaladas, pacote privado íntegro,
Python 3.12 com scikit-learn 1.5.1/joblib 1.4.2 e Node compatível. Não atualize
essas bibliotecas. O script verifica as versões antes de iniciar.

Na raiz do projeto, instale o túnel oficial (uma vez):

```powershell
node scripts/demo.mjs install
```

O executável fica em `.tools`, ignorado pelo Git. O download vem do repositório
oficial Cloudflare e o SHA-256 é comparado ao digest do release.

Se precisar compilar novamente, no terminal do backend:

```powershell
cd backend
pnpm exec prisma generate
pnpm run build
cd ..
```

Após conferir o banco selecionado, aplique somente migrações pendentes:

```powershell
node scripts/demo.mjs migrate --confirm
```

O comando usa o arquivo privado e não executa reset ou db push.
Para iniciar, mantenha um terminal aberto na raiz:

```powershell
node scripts/demo.mjs run
```

Ele inicia a IA em `127.0.0.1:4800`, o NestJS em `127.0.0.1:4301`, verifica
prontidão e abre o túnel apenas para o backend. Não abra portas do roteador ou
desative o firewall. As portas de desenvolvimento 3001/8000 não são modificadas.
Os serviços de desenvolvimento comuns não são necessários para a banca.

O terminal imprime `BACKEND_PROXY_URL=https://....trycloudflare.com` e a URL
fica também em `.demo/tunnel-url.txt`. A chave nunca é impressa.

Se a demonstração já tiver sido iniciada em segundo plano pelo assistente,
não rode outra instância. Confira com:

```powershell
node scripts/demo.mjs check
```

Para encerrar o supervisor criado em segundo plano: `node scripts/demo.mjs stop`.
O script confere a identidade do processo antes de encerrar sua árvore. Em uma
execução manual no terminal, use Ctrl+C. Não encerre processos genéricos de Node
ou Python do computador: podem pertencer a outros projetos.

## 3. Publicar o frontend na Vercel

As alterações do proxy precisam estar commitadas e no GitHub antes do deploy.
Conecte `MiltonPenha/BurnoutSense`, branch `main`, Root Directory `frontend`,
framework Next.js, Node 22. Install Command `npm ci`; Build Command `npm run build`.
Deixe o Output Directory no padrão e habilite publicação da branch main.

Em **Settings > Environment Variables**, configure apenas em **Production**:

| Nome | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api` |
| `BACKEND_PROXY_URL` | URL HTTPS atual de `.demo/tunnel-url.txt`, sem barra final |
| `DEMO_APP_ORIGIN` | `https://burnoutsense.online` |
| `DEMO_GATEWAY_SECRET` | Mesmo valor de `.demo/backend.env`, sem as aspas delimitadoras |

As três últimas variáveis são do servidor, nunca `NEXT_PUBLIC_*`. Não coloque
DATABASE_URL, SMTP_PASS, JWT, CSRF_SECRET ou chave da IA na Vercel. Se alterar
variáveis, faça um novo deploy para garantir que a configuração esteja ativa.
Não exponha as variáveis privadas em prints ou logs de build.

O supervisor também gera `.demo/vercel.env`, contendo somente esses quatro
campos. Use esse arquivo privado para copiar os valores ou a opção de importar
variáveis `.env`, quando disponível no painel. Não importe backend.env ou ai.env
na Vercel. Para regenerar o arquivo com o túnel atual: `node scripts/demo.mjs vercel-env`.

O navegador chama somente `/api` no domínio do site. O Route Handler do Next.js
adiciona a chave do gateway e encaminha requisições ao endereço fixo configurado,
sem seguir redirecionamentos. Cookies individuais são preservados, com HttpOnly,
Secure e SameSite=Lax. Não há retorno a tokens em localStorage, liberação de CORS
com wildcard, nem exposição direta da IA. Quem acessa o túnel sem a chave recebe 403.

O proxy aceita somente um Quick Tunnel HTTPS configurado pelo responsável (ou
localhost HTTP em testes locais). A Cloudflare termina o HTTPS e pode processar
as requisições e o cabeçalho do gateway; não é criptografia ponta a ponta entre
Vercel e PC. Use uma chave exclusiva, nunca JWT, senha do banco ou SMTP. A demonstração
deve usar dados fictícios e isso requer concordância com o uso desses provedores.

Nesta demonstração o NestJS enxerga o túnel como origem de rede compartilhada:
limites por IP podem ser compartilhados entre participantes. Não desative os
limites; evite muitas tentativas de login seguidas e aguarde um minuto se houver 429.

## 4. Domínio na Hostinger

Na Vercel, adicione `burnoutsense.online` e `www.burnoutsense.online` em Domains.
Redirecione www para a raiz. No DNS da Hostinger, ajuste somente os registros
de raiz `@` e www para os valores exatos indicados pela Vercel e aguarde HTTPS.
Preserve MX, SPF, DKIM, DMARC, autodiscover e autoconfig do e-mail.

**Neste modo não é necessário configurar `api.burnoutsense.online`, transferir
nameservers para Cloudflare ou contratar Private Service no Render.**
Não teste login pelo preview `vercel.app`: a origem autorizada é o domínio final.

## 5. Validar no domínio final

1. Abra `/api/health`: deve mostrar apenas status ok. Sem conexão, confira PC,
   supervisor, URL do túnel e variáveis da Vercel; nunca remova o gateway ou CSRF.
2. Crie conta fictícia, entre, atualize com F5, abra outra aba e saia. Confira
   cookies HttpOnly/Secure no domínio do frontend, não no trycloudflare.com.
3. Complete contexto fictício e check-in. Confirme índice pelo RF/A, histórico,
   retorno ao painel, edição e registro retroativo sem recalcular o dia atual.
4. Use conta com caixa postal controlada para testar Esqueci minha senha.
   O link deve apontar para o domínio final e funcionar uma vez por até 30 minutos.
   Confirme o e-mail de alteração e login com a nova senha. Dados reais de pesquisa
   e contas de terceiros não são necessários para validar o sistema.
5. Valide as dicas do Gemini separadamente; sua chave e quota ficam no backend.
6. Para o lembrete, mantenha hora 12, minuto 0 e fuso America/Sao_Paulo. Ative
   `DAILY_REMINDER_ENABLED=true` em `.demo/backend.env` (nao em `backend/.env`).
   Confira `node scripts/demo.mjs check-email`, que testa TLS/autenticacao sem
   enviar mensagens. Depois reinicie o supervisor,
   atualize a URL do túnel na Vercel e faça redeploy. O usuário também precisa
   ativar e salvar a preferência. Quem já tem check-in de hoje não recebe.
   O backend precisa estar ativo das 12h as 12h10; iniciar depois disso nao
   recupera o lembrete daquele dia. Na inicializacao e em `check`, confira a
   mensagem `Lembrete diario: ATIVO` e o horario configurado.
   Não mude a hora para disparar para todos; teste horários alternativos somente
   em ambiente isolado com destinatários controlados.

## 6. Manter até a banca

- Mantenha o PC ligado, conectado à tomada e à internet; configure manualmente
  o Windows para não suspender quando conectado. Apagar a tela é diferente de suspender.
- Não feche o terminal do supervisor. Reinício, queda de rede, atualização do
  sistema ou parada do túnel podem interromper o site. Não há SLA nessa opção.
- O Quick Tunnel é temporário. Ao reiniciar, copie a nova URL para BACKEND_PROXY_URL
  na Vercel e faça redeploy; não mude a chave do gateway sem atualizar ambos os lados.
- Teste de outro dispositivo e outra rede antes do dia 17. Faça nova checagem
  antes da arguição e mantenha também a demonstração local como contingência.
- Os logs privados ficam em `.demo/logs`. Não publique esses arquivos nem os `.env`.
- Leve internet confiável e uma demonstração gravada como reserva. Isso não
  substitui o funcionamento real, mas cobre falhas externas durante a apresentação.

## Testes e referências

Testes unitários do proxy: `cd frontend` e `node --test tests/backend-proxy.test.mjs`.
Testes do gateway: suíte Jest do backend. Testes automatizados não comprovam a
configuração da conta Vercel, DNS ou entrega de e-mail: valide o domínio final.

- [Cloudflare Quick Tunnels: testes e limites](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Render: conexão externa ao PostgreSQL](https://render.com/docs/postgresql-creating-connecting)
