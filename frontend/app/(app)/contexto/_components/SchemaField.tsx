import type { FormField } from "@/lib/types";
import { sleepQualityLabels } from "@/lib/daily-checkin";

const hints: Record<string, string> = {
  semester: "Se o curso for anual, conte dois semestres por ano.",
  subject_count: "Se não estiver cursando disciplinas, informe 0.",
  independent_hours_week: "Exclua as horas de aula e de atividades obrigatórias.",
  work_hours_week: "Se você não trabalha nem faz estágio, informe 0.",
  sleep_hours: "Conte seu período principal de sono, mesmo se for durante o dia.",
  study_work_difficulty: "Se você não trabalhou nem fez estágio no período, escolha “Não se aplica”."
};

const supportLabels = ["Nenhum apoio", "Pouco apoio", "Apoio moderado", "Bastante apoio", "Muito apoio"];
const scaleLabels: Record<string, string[]> = {
  sleep_quality: sleepQualityLabels,
  personal_support: supportLabels,
  academic_support: supportLabels
};

export function SchemaField({ field, prefix, value, onChange, error }: { field: FormField; prefix: string; value: string; onChange: (value: string) => void; error?: string }) {
  const id = `${prefix}-${field.identifier}`;
  const hint = hints[field.identifier];
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const notes = <>
    {hint && <small className="field-hint" id={`${id}-hint`}>{hint}</small>}
    {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
  </>;

  if (field.choices.length && field.choices.length <= 5) {
    const labels = scaleLabels[field.identifier];
    const options = field.choices.map((choice, index) => ({
      value: String(index),
      label: field.labels[index] || labels?.[Number(choice)] || String(choice)
    }));
    if (field.allows_not_applicable) options.push({ value: "na", label: "Não se aplica" });
    return (
      <fieldset className="context-choice-field" id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy}>
        <legend>{field.question}</legend>
        <div className="context-choices">
          {options.map((option) => (
            <label key={option.value} className={value === option.value ? "selected" : ""}>
              <input id={`${id}-${option.value}`} type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {notes}
      </fieldset>
    );
  }

  return (
    <div className="field esbeu-field">
      <label htmlFor={id}>{field.question}</label>
      {field.choices.length ? (
        <select id={id} name={id} required value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy}>
          <option value="" disabled>Selecione</option>
          {field.choices.map((choice, index) => <option key={index} value={index}>{choice}{field.labels[index] ? ` — ${field.labels[index]}` : ""}</option>)}
          {field.allows_not_applicable && <option value="na">Não se aplica</option>}
        </select>
      ) : (
        <input id={id} name={id} type="text" inputMode={field.data_type === "integer" ? "numeric" : "decimal"} required value={value} onChange={(event) => onChange(event.target.value)} maxLength={20} aria-invalid={Boolean(error)} aria-describedby={describedBy} />
      )}
      {notes}
    </div>
  );
}
