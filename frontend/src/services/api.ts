/**
 * API 客户端封装：统一 /api 前缀、JSON 编解码与稳定错误码处理。
 * 约定见 docs/api-contract.md：错误不得暴露内部堆栈，按 error.code 分支处理。
 */

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include', // 匿名 Session 使用 HttpOnly Cookie
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string }
    throw new ApiError(body.code ?? 'UNKNOWN', body.message ?? res.statusText, res.status)
  }
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
}
