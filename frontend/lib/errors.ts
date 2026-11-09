export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "ApiError"; }
}

export function getError(error: unknown): { message: string; status: number } {
  if (error instanceof ApiError) return error;
  return { message: error instanceof Error ? error.message : "Não foi possível concluir a operação.", status: 0 };
}
