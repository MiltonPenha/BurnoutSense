export const passwordRules = [
  { id: "minLength", label: "Mínimo de 8 caracteres", test: (password: string) => password.length >= 8 },
  { id: "uppercase", label: "Pelo menos 1 letra maiúscula", test: (password: string) => /[A-Z]/.test(password) },
  { id: "lowercase", label: "Pelo menos 1 letra minúscula", test: (password: string) => /[a-z]/.test(password) },
  { id: "number", label: "Pelo menos 1 número", test: (password: string) => /\d/.test(password) }
];
