# Performance do acompanhamento

## Otimizacoes de 16/11/2026

- A validacao do JWT consulta a identidade e a sessao ativa com um filtro
  relacional em uma unica consulta. Revogacao e expiracao continuam verificadas
  em cada requisicao protegida; nao existe cache de autorizacao no servidor.
- Somente `/auth/session` e `GET /users/me` solicitam o perfil completo ao
  guard. As demais rotas nao carregam foto, senha ou hash de refresh.
- A restauracao de sessao devolve o token CSRF junto do perfil. Quando nao ha
  cookies de acesso nem de refresh, o frontend nao tenta renovar uma sessao
  inexistente. A coordenacao de refresh entre abas permanece ativa.
- O frontend reaproveita o perfil validado pelo login/restauracao no cache em
  memoria, isolado por conta e geracao da sessao. O TTL continua em 5 segundos;
  mutacoes, logout e troca de conta invalidam esse cache.
- O resumo diario reutiliza os dias que ja consultou na janela de 28 dias para
  avaliar pendencias, sem consultar os mesmos dias duas vezes. Consultas
  independentes ao contexto sao iniciadas juntas.
- O grafico comeca a carregar em paralelo ao restante do painel. Ao abrir o
  check-in, um resumo ainda fresco pode fornecer o dia sem outra chamada HTTP.
  Fora da janela ou depois do TTL, a consulta normal continua sendo realizada.
- Alteracoes de indice recarregam os registros, nao o perfil que nao mudou.
  Salvar dados do perfil continua atualizando a interface e invalidando leituras.
- As confirmacoes dos temas de revisao sao lidas em uma consulta, preservando
  a confirmacao mais recente de cada tema e o filtro de propriedade.

Nao foram alterados o RF/A, seu treinamento, os arredondamentos, a media dos
28 dias, a comparacao de 7 + 7 check-ins ou a regra de datas retroativas.
As transacoes, o bloqueio por usuario e a revalidacao apos inferencia permanecem.

## Medicao

Teste HTTPS local: navegador -> Next.js em modo de producao -> NestJS isolado
-> PostgreSQL autorizado no Render. O RF/A privado real foi utilizado. A conta
era ficticia e foi removida ao final; SMTP foi substituido em memoria para nao
enviar e-mails reais. Nenhuma resposta pessoal, chave ou SQL foi registrado.

Tres amostras por endpoint, em execucoes antes e depois. Valores aproximados
apos aquecimento; variacoes de rede nao sao uma promessa de tempo em producao:

| Endpoint | Antes | Depois | Consultas SQL antes -> depois |
|---|---:|---:|---:|
| `/auth/session` | 427 ms | 150-210 ms | 3 -> 1 |
| `/users/me` | 427 ms | 150-200 ms | 3 -> 1 |
| `/daily-check-ins/overview` | 990 ms | 430-450 ms | 7 -> 4 |
| `/esbeu-assessments/review-topics` | 900-1320 ms | 710-820 ms | 9 -> 5 |

O painel passou a usar 6 requisicoes de API em vez de 7 na recarga, sem a
consulta duplicada ao perfil. No teste otimizado, calendario e grafico ficaram
prontos em aproximadamente 1-2 s apos aquecimento. O tempo do Gemini e medido separadamente:
a primeira geracao pode levar varios segundos, mas nao bloqueia o calendario,
o grafico nem o formulario. Seu cache existente continua ativo. Algumas rodadas
retornaram orientacoes indisponiveis: o teste nao afirma entrega de conteudo
pelo Gemini em todas as execucoes.

Esses tempos nao incluem o salto externo Vercel -> Cloudflare -> PC. O banco
remoto, o tunel, a rede domestica e o provedor Gemini ainda acrescentam latencia.

## Reproduzir

Leia primeiro o [guia local](../getting-started/DAILY_TRACKING_LOCAL_SETUP.md) e
o [modo banca](../getting-started/DEMO_BANCA.md). Gere os builds do backend e
do frontend; o build do frontend para este teste deve usar
`NEXT_PUBLIC_API_URL=/api`. Use somente banco autorizado e o RF/A configurado.

Em `backend/`, defina no terminal:

```powershell
$env:BURNOUTSENSE_DEMO_TEST_AUTHORIZED='true'
$env:BURNOUTSENSE_PERFORMANCE_LABEL='after'
$env:BURNOUTSENSE_OPENSSL='<caminho do openssl.exe>'
$env:BURNOUTSENSE_PLAYWRIGHT_MODULE='<caminho do modulo playwright>'
node test/verify-hybrid-demo.cjs
```

O teste le a configuracao privada de `.demo/backend.env`, cria seus proprios
processos nas portas 4302, 3330 e 3443 e os encerra ao terminar. Nao reinicia o
tunel ou o backend da demonstracao. Relatorios e capturas ficam em
`.run-logs/hybrid-demo/`, ignorado pelo Git. O certificado autoassinado e aceito
somente pelo navegador de teste; nao ha alteracao no TLS da aplicacao publicada.

Para publicar as melhorias, sera necessario atualizar o frontend na Vercel e
reiniciar o backend local com o novo build. Reiniciar o supervisor do modo
banca tambem reinicia o Quick Tunnel: confira a URL privada gerada e atualize
`BACKEND_PROXY_URL` na Vercel, com um novo deploy, caso o endereco tenha mudado.
