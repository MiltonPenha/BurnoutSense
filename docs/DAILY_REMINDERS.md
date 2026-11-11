# Lembretes de check-in

Somente lembretes diários são enviados por e-mail. A preferência vem do perfil
salvo; o botão de teste não sobrescreve preferências. Não há disparo por índice.
Notificações visuais de conclusão, erro e sessão expirada continuam existindo.

O horário padrão é 12h em America/Sao_Paulo. O agendador aceita uma janela de
dez minutos após o horário configurado para tentativas após falhas. Há no máximo
três tentativas por usuário/dia, separadas por pelo menos um minuto.
Um check-in cuja data de referência seja hoje suprime o lembrete; cadastrar
apenas um dia retroativo ou revisar o contexto não conta como check-in de hoje.

A tabela daily_reminder_deliveries mantém o envio confirmado por usuário/dia.
Uma reserva atômica impede duas instâncias de enviarem simultaneamente; ela
expira após cinco minutos em caso de interrupção. A preferência e o check-in
são conferidos novamente antes do envio. Confirmações persistidas evitam
duplicação após reiniciar o backend.

SMTP não oferece garantia de entrega exatamente uma vez: uma interrupção
entre a aceitação pelo provedor e a confirmação no banco ainda pode resultar
em repetição. Não se afirma entrega à caixa de entrada apenas pela aceitação
SMTP. Não há envio automático ao iniciar fora da janela configurada.

Para testar, use os testes unitários com nodemailer simulado. O teste de
navegador valida a preferência sem clicar em enviar. Durante a verificação
local, o processo pode usar DAILY_REMINDER_ENABLED=false sem alterar o .env.
Não envie e-mails reais nem exponha configurações privadas sem autorização.
