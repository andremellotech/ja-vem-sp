import { ApiError, type Result } from "../contracts";
export async function request<T>(
  base: string,
  path: string,
  signal?: AbortSignal,
): Promise<Result<T>> {
  if (!base)
    throw new ApiError(
      "NOT_CONFIGURED",
      503,
      "A conexão com a SPTrans ainda não foi configurada.",
    );
  const r = await fetch(base.replace(/\/$/, "") + path, { signal });
  let body;
  try {
    body = await r.json();
  } catch {
    throw new ApiError(
      "PROVIDER_UNAVAILABLE",
      502,
      "O serviço retornou uma resposta inválida.",
    );
  }
  if (!r.ok)
    throw new ApiError(
      body.error?.code || "UNAVAILABLE",
      r.status,
      body.error?.message || "Não foi possível consultar a SPTrans.",
    );
  return body;
}
