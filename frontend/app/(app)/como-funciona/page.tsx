import Link from "next/link";
import "./como-funciona.css";

export default function ComoFuncionaPage() {
  return <section className="page help-page">
    <header className="page-header"><div><p className="overline">Uma ajuda para começar</p><h1 className="page-title">Como funciona</h1>
      <p className="page-kicker">Um espaço para registrar sua rotina, acompanhar seus índices e receber apoio para o dia a dia.</p></div></header>
    <ol className="help-steps">
      <li><span aria-hidden="true">01</span><div><h2>Comece com seu primeiro índice</h2><p>Conte um pouco sobre seus estudos, descanso e rotina em etapas curtas. Pense nas últimas quatro semanas: seu primeiro índice aparece assim que concluir, sem esperar um mês de registros.</p></div></li>
      <li><span aria-hidden="true">02</span><div><h2>Registre como foi seu dia</h2><p>Conte sobre seu humor, sono, pressão dos estudos, descanso e apoio. Você pode escolher uma data anterior se esqueceu de registrar. Há um check-in por dia, que pode ser corrigido pelo histórico.</p></div></li>
      <li><span aria-hidden="true">03</span><div><h2>Atualize quando sua rotina mudar</h2><p>Escolha revisar sua rotina para encontrar suas respostas já preenchidas. Confira o que mudou e confirme para calcular um novo índice. Dicas e recomendações curtas aparecerão na tela principal quando estiverem disponíveis.</p></div></li>
    </ol>
    <section className="help-questions"><h2>O que você precisa saber</h2>
      <details><summary>O que a porcentagem significa?</summary><p>O índice apresenta o escore estimado da ESB-eu em uma escala de 0% a 100%. Cada ponto da escala original, de 0 a 4, equivale a 25 pontos percentuais. A porcentagem não indica chance de burnout nem diagnóstico.</p></details>
      <details><summary>Preciso responder todos os dias?</summary><p>Não. Registre no seu ritmo, sem precisar recuperar dias que passaram. O painel mostra quantos dias você acompanhou nas últimas quatro semanas, sem inventar respostas para os dias em branco.</p></details>
      <details><summary>O check-in muda meu índice?</summary><p>Na atualização diária em teste, seus registros dos últimos 28 dias ajudam a atualizar parte das informações do cálculo. Quando essas informações mudam, um novo índice é calculado. O número pode continuar igual; não forçamos uma mudança a cada registro. Os dias em branco não recebem respostas inventadas.</p></details>
      <details><summary>Por que ainda posso revisar minha rotina?</summary><p>Os check-ins não perguntam tudo. Informações como sua situação acadêmica ou profissional precisam ser revistas por você quando mudarem. A atualização diária ainda está sendo avaliada e não confirma melhora, piora ou diagnóstico de saúde.</p></details>
      <details><summary>Por que há perguntas complementares?</summary><p>Elas são opcionais e oferecem outro olhar para sua experiência acadêmica. O resultado aparece separado do índice calculado a partir da sua rotina.</p></details>
      <details><summary>Posso apagar meus registros?</summary><p>Sim. Abra um registro no histórico e escolha excluir. No perfil, você também pode excluir sua conta e os registros vinculados a ela.</p></details>
      <details><summary>Como são preparadas as dicas e recomendações?</summary><p>O Google Gemini recebe apenas o percentual do seu índice e propõe ações curtas de autocuidado. Seu nome, e-mail e respostas não são enviados. As sugestões não explicam a causa do resultado nem substituem orientação profissional.</p></details>
    </section>
    <p className="help-note">O BurnoutSense oferece apoio ao seu acompanhamento. Se precisar de ajuda, procure alguém de confiança ou o apoio estudantil da sua instituição. A aplicação não substitui orientação profissional.</p>
    <div className="form-actions"><Link href="/registro" className="button">Fazer um registro</Link><Link href="/dashboard" className="button secondary">Voltar ao início</Link></div>
  </section>;
}
