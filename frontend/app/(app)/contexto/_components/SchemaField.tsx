import type { FormField } from "@/lib/types";

export function SchemaField({ field, prefix, value, onChange }: { field: FormField; prefix: string; value: string; onChange: (value: string) => void }) {
  const id = `${prefix}-${field.identifier}`;
  if (field.choices.length && field.choices.length <= 5) {
    const options = field.choices.map((choice, index) => ({ value: String(index), label: field.labels[index] || String(choice) }));
    if (field.allows_not_applicable) options.push({ value: "na", label: "Não se aplica" });
    return <fieldset className="context-choice-field"><legend>{field.question}</legend>
      <div className="context-choices">{options.map((option) => <label key={option.value} className={value === option.value ? "selected" : ""}>
        <input id={`${id}-${option.value}`} type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}</div><small className="field-hint">{field.instructions}</small>
    </fieldset>;
  }
  return <div className="field esbeu-field">
    <label htmlFor={id}>{field.question}</label>
    {field.choices.length ? <select id={id} name={id} required value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={`${id}-hint`}>
      <option value="" disabled>Selecione uma resposta</option>
      {field.choices.map((choice, index) => <option key={index} value={index}>{choice}{field.labels[index] ? ` — ${field.labels[index]}` : ""}</option>)}
      {field.allows_not_applicable && <option value="na">Não se aplica</option>}
    </select> : <input id={id} name={id} type="number" required value={value} onChange={(event) => onChange(event.target.value)} min={field.minimum ?? undefined} max={field.maximum ?? undefined}
      step={field.data_type === "integer" ? "1" : "any"} aria-describedby={`${id}-hint`} />}
    <small id={`${id}-hint`} className="field-hint">{[field.instructions, field.unit].filter(Boolean).join(" · ")}</small>
  </div>;
}
