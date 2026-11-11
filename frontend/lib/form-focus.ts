export function focusFormField(id: string) {
  requestAnimationFrame(() => {
    const field = document.getElementById(id);
    const input = field?.matches("input, select, textarea") ? field : field?.querySelector("input, select, textarea");
    if (input instanceof HTMLElement) input.focus();
    else field?.focus();
  });
}
