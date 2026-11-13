import { Info } from "lucide-react";
import "./IndexHelp.css";

export function IndexHelp() {
  return <details className="index-help"><summary><Info size={14} aria-hidden="true" />Entenda este número</summary>
    <p>O índice apresenta o escore ESB-eu em uma escala de 0% a 100%. Cada ponto do escore original, de 0 a 4, equivale a 25 pontos percentuais. As cores são referências visuais. O percentual não indica chance de burnout nem diagnóstico.</p>
  </details>;
}
