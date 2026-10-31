// Convert only public schema fields, preserving numeric zero and the NA option.
export function readSchemaFields(fields, data, prefix) {
  const result = {};
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

export function formatEsbeu(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 4
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : "Indisponível";
}
