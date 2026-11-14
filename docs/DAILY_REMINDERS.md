# Lembretes de check-in

No acompanhamento da rotina, somente lembretes diários são enviados por e-mail.
Mensagens transacionais de [recuperação de senha](PASSWORD_RECOVERY.md) são
independentes dessa preferência. A preferência do lembrete vem do perfil
salvo. Os disparos ocorrem pelo agendador. A aba Notificações permite
habilitar ou desabilitar o lembrete diário.
Notificações visuais de conclusão, erro e sessão expirada continuam existindo.

O horário padrão é 12h em America/Sao_Paulo. O agendador aceita uma janela de
dez minutos após o horário configurado para tentativas após falhas. Há no máximo
três tentativas por usuário/dia, separadas por pelo menos um minuto.
Um check-in cuja data de referência seja hoje suprime o lembrete; cadastrar
apenas um dia retroativo ou revisar o contexto não conta como check-in de hoje.

Contas novas começam com o lembrete desligado. Para receber, habilite a
preferência no perfil e salve. A migração preserva os valores das contas existentes.

O agendador seleciona usuários que habilitaram a preferência e ainda não
registraram o dia local. A atualização que autoriza cada envio verifica
novamente esses critérios, o endereço selecionado e a ausência de envio
anterior. Uma alteração confirmada antes da leitura dessa atualização impede
o envio. Após a autorização, ainda existe uma janela entre a leitura e a
chamada SMTP. O sistema deixa de poder cancelar o envio quando inicia
sendMail, mesmo que o servidor ainda esteja recebendo a mensagem. Check-in e
perfil seguem livres para gravar durante a comunicação.

A tabela daily_reminder_deliveries registra submissionStartedAt antes de
chamar o SMTP. Essa marca impede outra submissão, mesmo após reinício.
Com sentAt preenchido, o SMTP confirmou o aceite. Com sentAt vazio e
submissionStartedAt preenchido, a submissão está em curso ou o sistema reteve
a tentativa sem confirmação. Uma resposta SMTP temporária explícita de
rejeição (MAIL FROM, RCPT TO ou DATA) libera retentativa dentro da janela.
A falta de configuração SMTP também libera, pois não houve conexão. Outras
falhas, incluindo falta de resposta a DATA, não liberam reenvio. Logs
registram falhas sem endereço ou resposta bruta do provedor.

Essa política pode perder um lembrete se o processo parar depois de gravar
submissionStartedAt e antes do envio. Ela evita retentar automaticamente
uma mensagem que o Gmail pode já ter aceitado. Não limpe a marca só porque
sentAt está vazio. Revise o evento com o provedor, se disponível. Aceite SMTP
não confirma entrega na caixa. O agendador verifica a janela também antes de
autorizar cada envio. Não há recuperação automática após a janela.

Pare as instâncias antigas do agendador antes de aplicar a migração que
renomeia claimedAt. A migração bloqueia retentativas de tentativas antigas
sem aceite registrado e preserva confirmações e preferências existentes.

Para testar, use os testes unitários com nodemailer simulado. O teste de
navegador valida a preferência e a ausência da rota manual. Durante a verificação
local, o processo pode usar DAILY_REMINDER_ENABLED=false sem alterar o .env.
Não envie e-mails reais nem exponha configurações privadas sem autorização.
