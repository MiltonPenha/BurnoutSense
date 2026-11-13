# Dicas e recomendações com Gemini

O RF/A privado continua calculando o índice sem alterações. O Gemini apenas
escreve orientações breves de autocuidado a partir do percentual já calculado.
Não recebe nome, e-mail, identificador, texto livre ou as 22 respostas do contexto.
As orientações não são diagnóstico nem uma explicação causal da previsão.

## Configuração local

No `backend/.env`, ignorado pelo Git:

```dotenv
GEMINI_GUIDANCE_ENABLED=true
GEMINI_API_KEY="configure-sua-chave-local"
GEMINI_MODEL="gemini-3.1-flash-lite"
```

Reinicie o NestJS após mudar o ambiente. Uma variável herdada do terminal tem
precedência sobre o `.env`: remova uma chave antiga do processo antes de iniciar.
No PowerShell, quando houver uma chave herdada incorreta:

```powershell
Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
npm run start:dev
```

Nunca utilize `NEXT_PUBLIC_*` para essa chave. Não publique chaves em commits,
capturas, testes ou mensagens; substitua credenciais que tenham sido expostas.

## Fluxo

1. A dashboard solicita `GET /guidance/:assessmentId` com autenticação.
2. O backend verifica a propriedade do registro antes de qualquer chamada externa.
3. O escore de 0 a 4 é convertido para percentual com uma casa decimal.
4. Gemini recebe somente esse percentual e as instruções de autocuidado.
5. Retornam duas dicas e duas recomendações; a partir de 66% exibidos, três por lista,
   com propostas mais graduais e incentivo a procurar apoio se o desconforto persistir.
   Essa variação editorial não cria classes clínicas ou novos cortes do RF/A.
6. O backend valida formato, quantidade e tamanho. React apresenta somente texto.

Cache anônimo por percentual/modelo/versão do prompt: até 24 horas, limitado a
256 entradas. Percentuais iguais podem reutilizar orientações iguais, inclusive
entre contas, porque não há conteúdo pessoal nelas. Reiniciar o backend limpa
o cache. Solicitações simultâneas equivalentes são agrupadas; falhas têm espera
de 60 segundos e nunca são substituídas por uma resposta fictícia.

O painel consulta as orientações para a avaliação mais recente ao carregar ou
quando o identificador da avaliação muda. O check-in pode alterar o percentual
indiretamente, pelo recálculo do RF/A. Com a mesma porcentagem arredondada,
as orientações podem ser reutilizadas até o cache expirar. A rotina recente
compara os check-ins no BurnoutSense, sem enviar essa comparação ao Gemini.

A geração tem limite de 20 segundos, duas chamadas simultâneas e a proteção
global de requisições do NestJS. Falhas do Gemini não impedem salvar check-ins
nem visualizar o índice. O conteúdo pode variar mesmo para índices próximos.
Antes de uso com estudantes reais, revisar transparência, base legal,
condições de tratamento do fornecedor e avaliação humana das orientações.

## Validação

Testes unitários usam respostas claramente fictícias, sem rede. O teste real
opcional deve usar exclusivamente registros e contas fictícias de desenvolvimento.
Não há envio de e-mails para validar esta integração. O custo e a disponibilidade
dependem da conta do Gemini; sem acesso válido, o painel informa indisponibilidade
e permite tentar novamente.
