# Frontend BurnoutSense

A interface usa Next.js, React e TypeScript em modo estrito. No App Router,
os grupos `(auth)` e `(app)` organizam arquivos sem alterar os endereços.

| Rotas | Fluxo |
|---|---|
| `/cadastro`, `/login` | Cadastro e sessão por cookies |
| `/esqueci-senha`, `/redefinir-senha` | Recuperação de acesso por e-mail |
| `/contexto` | Formulário inicial e revisão de contexto |
| `/registro` | Check-in por data |
| `/dashboard` | Calendário, gráfico, rotina recente e orientações quando configuradas |
| `/historico`, `/historico/:id` | Histórico e detalhe dos resultados |
| `/perfil`, `/como-funciona` | Preferências, lembrete diário, tema e explicação do índice |

As páginas e os componentes React usam `.tsx`. Hooks, cliente HTTP e contratos
sem JSX usam `.ts`. Estilos de tela ficam junto à rota. Componentes compartilhados
ficam em `components/layout`, `components/indicators` e `components/ui`.
O tema e as bases ficam em `app/globals.css` e `app/product.css`. Veja
[convenções da interface](../docs/design/DESIGN.md).

O cliente usa sessão por cookies e envia o token CSRF nas operações de
alteração. No gráfico diário, os índices aparecem na data do cálculo e os
check-ins na data registrada. O histórico separa check-ins e resultados.
O percentual representa a posição da estimativa na escala de 0 a 4.
[Acompanhamento diário](../docs/features/DAILY_TRACKING.md) ·
[Autenticação](../docs/architecture/COOKIE_AUTH.md) ·
[Dicas e recomendações](../docs/features/GEMINI_GUIDANCE.md)

Para iniciar os serviços, siga o [guia do fluxo diário](../docs/getting-started/DAILY_TRACKING_LOCAL_SETUP.md).
Para validação, execute em `frontend`:

```powershell
npm run typecheck
npm run lint
node --test tests/*.test.mjs
npm run build
```

Use um Node compatível com a versão registrada em `.node-version` e com o
carregamento nativo de TypeScript para os testes `.test.mjs`. Os testes de
navegador com PostgreSQL isolado usam o procedimento de
[homologação](../docs/architecture/ETAPA_10_INTEGRATION.md#testes-reproduzíveis).
