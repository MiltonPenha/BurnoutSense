# Recuperação de senha

No login, **Esqueci minha senha** abre `/esqueci-senha`. A aplicação solicita o
e-mail do cadastro e responde de forma genérica, sem revelar se a conta existe.
O envio usa o mesmo `SMTP_*` dos lembretes, com o remetente configurado como
`BurnoutSense <lembrete@burnoutsense.online>`.

## Fluxo e segurança

- `POST /auth/forgot-password`, com `{ email }`, aceita até 3 pedidos por minuto
  por IP. A consulta da conta e o envio são assíncronos; a resposta não aguarda SMTP.
- Uma conta recebe no máximo uma nova solicitação por minuto. A reserva é atômica
  no banco, inclusive com múltiplas instâncias. Um novo link substitui o anterior.
- O token usa 32 bytes aleatórios criptográficos. Somente seu SHA-256 fica no banco.
- O link vence em 30 minutos e pode ser usado uma vez. Não autentica a conta.
- A URL vem exclusivamente de `FRONTEND_URL`, nunca do cabeçalho Host.
- O segredo vai no fragmento `#token=...`, que não é enviado ao servidor da página.
  A tela remove esse fragmento da barra de endereço e o mantém somente em memória.
  Ao atualizar a página, reabra o link recebido; não há token em localStorage.
- `POST /auth/reset-password`, com `{ token, password }`, valida a senha, consome
  o token e atualiza a senha com bcrypt/custo 10 numa transação. Todas as sessões
  anteriores são revogadas na mesma transação. A pessoa precisa entrar novamente.
- Os dois endpoints exigem a origem autorizada e CSRF, mesmo sem login.
- Um e-mail de confirmação é solicitado após o sucesso. Nenhuma senha é enviada.
- A preferência de lembrete diário não bloqueia esses e-mails transacionais de
  segurança. Eles não são alertas de risco nem campanhas.

## Configuração

1. Configure a caixa e os `SMTP_*` conforme o
   [guia de publicação](DEPLOY_BURNOUTSENSE_ONLINE.md). Preencher `.env.example`
   não substitui seu `.env` privado. Não use senha administrativa da Hostinger.
2. Em produção, use `FRONTEND_URL=https://burnoutsense.online`, com HTTPS válido.
   Em desenvolvimento, use a URL local. Não crie variável pública com a senha SMTP.
3. Pare agendadores antigos e aplique `prisma migrate deploy` no banco autorizado;
   essa entrega inclui as migrações de confiabilidade do lembrete e recuperação.
   Gere o cliente Prisma e reinicie o NestJS. Não use reset nem `db push`.
4. A recuperação funciona mesmo com `DAILY_REMINDER_ENABLED=false`.

O processamento assíncrono é local ao processo, não uma fila durável: se ele parar
antes do envio, o usuário poderá solicitar outro link após um minuto. Aceite SMTP
não garante chegada à caixa de entrada. Em falhas, a resposta pública permanece
genérica e os logs não devem conter destinatário, link, token, senha ou resposta
bruta do provedor. O limite por IP do NestJS atual é local à instância; para escala
horizontal, compartilhe o armazenamento do throttler ou complemente no gateway.

## Validar

Use contas fictícias e SMTP simulado. Verifique link válido, expirado e reutilizado;
senha fraca; confirmação divergente; login com a nova senha e rejeição da antiga;
revogação de sessões existentes; resposta igual para conta desconhecida; CSRF e
limites. Não envie para usuários reais como teste e não escreva tokens em prints.

Com o frontend local na porta 3000, backend compilado e migrações aplicadas,
execute `node backend/test/verify-password-recovery.cjs` a partir da raiz, com
`BURNOUTSENSE_PLAYWRIGHT_MODULE` apontando para o Playwright instalado. A porta
3001 precisa estar livre: o teste cria uma API temporária com SMTP substituído
em memória, usa uma conta fictícia e a remove ao final. Não rode outro NestJS
nessa porta durante esse teste.

O envio real depende de configurar a credencial privada da caixa e das regras de
SMTP do ambiente de hospedagem. Testes automatizados simulados não comprovam
entrega de e-mail real.

Referência: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
