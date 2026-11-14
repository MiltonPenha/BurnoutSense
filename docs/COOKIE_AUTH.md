# Sessão web por cookies

## Contrato

- GET `/auth/csrf`: entrega o token CSRF público da sessão e define seu cookie HttpOnly.
- POST `/auth/register` e `/auth/login`: recebem os dados de acesso; retornam somente
  `{ user, csrfToken }`, com credenciais em Set-Cookie.
- GET `/auth/session`: retorna `{ user }` quando a sessão está válida, ou 401.
- POST `/auth/refresh`: recebe o refresh pelo cookie, gira o segredo de forma atômica
  e retorna `{ user, csrfToken }`; não recebe refresh em JSON.
- POST `/auth/logout`: valida o refresh quando disponível, revoga a sessão correspondente
  e limpa cookies, mesmo quando o JWT de acesso venceu.
- POST `/auth/forgot-password`: solicita a recuperação com resposta genérica.
- POST `/auth/reset-password`: consome o link de uso único e redefine a senha,
  revogando todas as sessões da conta. Veja [o fluxo completo](PASSWORD_RECOVERY.md).

As operações de alteração exigem Origin igual a FRONTEND_URL e X-CSRF-Token válido.
Clientes de teste/CLI também precisam seguir o bootstrap CSRF e usar cookie jar.
Bearer legado não é aceito. JWTs antigos sem sid e hashes de refresh antigos exigem
novo login; não há fallback para localStorage.

## Proteções e limites

Senhas humanas continuam com bcrypt, salt e custo 10. Refresh tokens são valores
aleatórios de 64 bytes e têm hash SHA-256 de todos os bytes, comparado em tempo
constante. São segredos de alta entropia, não senhas humanas; não use SHA-256 para
trocar o hashing das senhas. O banco guarda hash, nunca o refresh em texto claro.

O JWT de acesso contém sub e sid. O guard verifica assinatura HS256, expiração,
usuário e AuthSession não revogada/expirada. O refresh tem prazo absoluto de 7 dias
por padrão, sem prolongamento a cada renovação. O acesso dura 30 minutos por padrão.

O segredo de refresh gira com compare-and-swap no banco. O browser usa Web Locks
para coordenar a renovação entre abas e single-flight dentro da aba. Conflitos de
renovação não limpam cookies de uma sessão vencedora. Navegadores sem Web Locks
usam o fluxo de compatibilidade e ainda precisam tratar respostas de conflito.

Cookies são HttpOnly, host-only, Path=/ e SameSite=Lax. Em produção, usam Secure
e prefixo __Host-. Em desenvolvimento local HTTP não usam esse prefixo nem Secure.
Use localhost nos dois serviços, sem alternar com 127.0.0.1 na mesma sessão.

A identidade visual vem de /auth/session, não de presença de uma flag local. Cache
e rascunhos são isolados por conta e geração da sessão. Eventos entre abas contêm
somente marcadores, não tokens. Preferências visuais podem continuar locais.
Falha de rede não deve ser confundida com credencial inválida. Se um logout não
conseguir alcançar o backend, a interface limpa a sessão local e marca uma tentativa
pendente de encerramento; não se promete revogação remota enquanto estiver offline.

HttpOnly reduz exfiltração de credenciais via JavaScript, mas XSS ainda pode operar
a sessão. Cookies não substituem prevenção de XSS, autorização por proprietário,
HTTPS, revisão de dependências e controles organizacionais de privacidade.

## Configuração

NODE_ENV=production exige FRONTEND_URL em HTTPS, JWT_ACCESS_SECRET com pelo menos
32 caracteres e CSRF_SECRET independente com pelo menos 32 caracteres. Não configure
Domain=.burnoutsense.online. CORS permite a origem exata e credentials, sem wildcard.
JWT_REFRESH_SECRET deixou de ser utilizado. Em desenvolvimento, se CSRF_SECRET
estiver vazio, um segredo efêmero é gerado no processo; um restart pode exigir novo
bootstrap CSRF, não a exclusão da conta.

## Validação local

Leia primeiro [o guia de execução](DAILY_TRACKING_LOCAL_SETUP.md). Com os quatro
serviços locais ativos e envio automático de e-mails desligado:

```powershell
$env:BURNOUTSENSE_PLAYWRIGHT_MODULE = 'CAMINHO_DO_MODULO_PLAYWRIGHT'
node backend/test/verify-cookie-auth.cjs
node backend/test/verify-check-in-chronology.cjs
node backend/test/verify-dashboard-flow.cjs
```

Os testes usam e removem apenas contas fictícias. A suite de cookies cobre ausência
de tokens em JSON/storage, CSRF/origem, F5, nova aba, renovação, falha de rede,
inatividade e rejeição de uma sessão revogada. Os atributos de produção e as regras
de rotação têm testes unitários. Validar em HTTPS real continua obrigatório após
o deploy; testes HTTP locais não comprovam DNS/TLS ou configuração dos provedores.

Veja [o passo a passo de publicação](DEPLOY_BURNOUTSENSE_ONLINE.md).
