import type { FormField } from "@/lib/types";

export function SchemaField({ field, prefix, value, onChange, error }: { field: FormField; prefix: string; value: string; onChange: (value: string) => void; error?: string }) {
  const id = `${prefix}-${field.identifier}`;
  if (field.choices.length && field.choices.length <= 5) {
    const options = field.choices.map((choice, index) => ({ value: String(index), label: field.labels[index] || String(choice) }));
    if (field.allows_not_applicable) options.push({ value: "na", label: "Não se aplica" });
    return <fieldset className="context-choice-field" id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}><legend>{field.question}</legend>
      <div className="context-choices">{options.map((option) => <label key={option.value} className={value === option.value ? "selected" : ""}>
        <input id={`${id}-${option.value}`} type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}</div><small className="field-hint" id={`${id}-hint`}>{field.instructions}</small>{error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </fieldset>;
  }
  return <div className="field esbeu-field">
    <label htmlFor={id}>{field.question}</label>
    {field.choices.length ? <select id={id} name={id} required value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}>
      <option value="" disabled>Selecione uma resposta</option>
      {field.choices.map((choice, index) => <option key={index} value={index}>{choice}{field.labels[index] ? ` — ${field.labels[index]}` : ""}</option>)}
      {field.allows_not_applicable && <option value="na">Não se aplica</option>}
    </select> : <input id={id} name={id} type="text" inputMode={field.data_type === "integer" ? "numeric" : "decimal"} required value={value} onChange={(event) => onChange(event.target.value)} maxLength={20}
      aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} />}
    <small id={`${id}-hint`} className="field-hint">{[field.instructions, field.unit].filter(Boolean).join(" · ")}</small>
    {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}
