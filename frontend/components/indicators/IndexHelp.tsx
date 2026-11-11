import { Info } from "lucide-react";
import "./IndexHelp.css";

export function IndexHelp() {
  return <details className="index-help"><summary><Info size={14} aria-hidden="true" />Entenda este número</summary>
    <p>O percentual mostra sua posição na escala de indicadores, não a chance de ter burnout nem um diagnóstico. As cores são referências visuais, não categorias clínicas.</p>
  </details>;
}
