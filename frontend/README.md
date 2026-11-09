# Frontend BurnoutSense

Next.js App Router + React + TypeScript em modo estrito. Os grupos entre parenteses
organizam as rotas sem alterar URLs. Paginas e componentes React usam `.tsx`;
hooks, contratos da API e bibliotecas sem JSX usam `.ts`.

```text
app/
  globals.css          Tema, fontes, reset e elementos globais
  layout.tsx           Layout raiz
  (auth)/
    auth.css           Apresentacao compartilhada da autenticacao
    cadastro/          page.tsx + cadastro.css
    login/             page.tsx + login.css
  (app)/
    dashboard/         page.tsx + dashboard.css
    registro/          page.tsx + registro.css + _components/
    contexto/          Acompanhamento inicial e revisao guiada + CSS proprio
    historico/         page.tsx + historico.css
      [id]/            page.tsx + detalhe.css
    perfil/            page.tsx + perfil.css
    status/            page.tsx + status.css
    como-funciona/     Explicacao simples para o estudante + CSS proprio
components/
  layout/              AppShell e estilos da navegacao
  indicators/          Resultados, tabela, grafico e estilos compartilhados
  ui/                  Primitivas compartilhadas: botoes, campos, avisos e modais
hooks/                 Estado compartilhado
lib/                   API, autenticacao e conversoes de apresentacao
tests/                 Testes do contrato e verificacao por navegador
```

Estilos de pagina ficam junto de `page.tsx`; componentes reutilizados mantem CSS
em sua propria pasta. As camadas CSS `components` e `pages` tornam explicita a
prioridade dos estilos das telas, independentemente da ordem da navegacao.

Validacao: `npm run typecheck`, `npm run lint`, `npm run build` e
`node --test tests/*.test.mjs` (Node 24 com suporte a TypeScript).
Configuracoes de ferramentas e scripts de teste Node podem continuar em `.mjs`;
nao sao componentes React.

O indice percentual e apenas `escore ESB-eu / 4 * 100`. O banco e a API mantem
os valores originais de 0 a 4. Nao representa probabilidade ou diagnostico.
O acompanhamento inicial e as revisoes de contexto consideram as ultimas quatro
semanas e calculam o indice imediatamente. Check-ins diarios leves sao salvos
separadamente, um por data escolhida (hoje ou dias anteriores), sem depender da IA
para persistir. Com `DAILY_CONTEXT_EVOLUTION_ENABLED=true`, observacoes diarias
atualizam cinco entradas do contexto em uma ponte experimental, e o RF/A real
recalcula o indice quando essas entradas mudam. Isso nao comprova compatibilidade
metodologica com o treinamento; a transformacao e seus dados de origem sao versionados.
A revisao reaproveita respostas e consentimento valido e requer confirmacao.
A inferencia exige o pacote RF/A privado da equipe. Veja `docs/DAILY_TRACKING.md`
na raiz para contratos, migracao e regras do acompanhamento.

O dashboard apresenta registros, indices e dois espacos separados para dicas e
recomendacoes. Enquanto a geracao nao estiver integrada, os espacos mostram
estados vazios, sem sugestoes prontas ou resultados ficticios. Metricas de
pesquisa e identificadores tecnicos ficam fora da interface do estudante;
os contratos e metadados persistidos pelo backend permanecem inalterados.
