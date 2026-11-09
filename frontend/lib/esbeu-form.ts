import type { ContextValues, FormField } from "./types";

// Convert only public schema fields, preserving numeric zero and the NA option.
export function readSchemaFields(fields: FormField[], data: { get: (key: string) => unknown }, prefix: string): ContextValues {
  const result: ContextValues = {};
  for (const field of fields) {
    const raw = data.get(`${prefix}-${field.identifier}`);
    if (typeof raw !== "string" || raw.trim() === "") throw new Error(`Responda: ${field.name}.`);
    if (raw === "na" && field.allows_not_applicable) result[field.identifier] = "Não se aplica";
    else if (field.choices.length) {
      if (!/^\d+$/.test(raw) || Number(raw) >= field.choices.length) throw new Error("Alternativa inválida.");
      result[field.identifier] = field.choices[Number(raw)];
    } else {
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || (field.data_type === "integer" && !Number.isInteger(value))
        || (field.minimum !== null && value < field.minimum) || (field.maximum !== null && value > field.maximum)) {
        throw new Error(`Confira: ${field.name}.`);
      }
      result[field.identifier] = value;
    }
  }
  return result;
}

export function formatEsbeu(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 4
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : "Indisponível";
}

// Display normalization only; persistence and scientific metrics stay on 0-4.
export function indexPercentage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 4
    ? value * 25 : null;
}

export function formatIndex(value: unknown) {
  const percentage = indexPercentage(value);
  return percentage === null ? "Indisponível"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(percentage)}%`;
}

export function indexColorBand(value: unknown) {
  const percentage = indexPercentage(value);
  if (percentage === null) return "neutral";
  const displayed = Math.round(percentage * 10) / 10;
  return displayed < 31 ? "green" : displayed < 66 ? "yellow" : "red";
}

export function contextToInputs(fields: FormField[], context: ContextValues = {}): Record<string, string> {
  return Object.fromEntries(fields.map((field) => {
    const value = context[field.identifier];
    if (value === undefined || value === null) return [field.identifier, ""];
    if (value === "Não se aplica" && field.allows_not_applicable) return [field.identifier, "na"];
    if (field.choices.length) {
      const index = field.choices.indexOf(value);
      return [field.identifier, index < 0 ? "" : String(index)];
    }
    return [field.identifier, String(value)];
  }));
}
