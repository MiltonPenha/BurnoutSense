import Link from "next/link";

export function EsbeuIntegrationNotice() {
  return (
    <section className="card" aria-label="Acompanhamento ESB-eu">
      <h1>Acompanhamento ESB-eu</h1>
      <p>O BurnoutSense utiliza o escore contínuo da ESB-eu, de 0 a 4.</p>
      <p>O formulário e as visualizações desta interface estão aguardando a integração com a nova metodologia. O registro anterior foi desativado.</p>
      <p>Os registros históricos permanecem preservados. Não são geradas faixas de risco ou pontuações locais nesta tela.</p>
      <Link href="/perfil">Acessar perfil</Link>
    </section>
  );
}
