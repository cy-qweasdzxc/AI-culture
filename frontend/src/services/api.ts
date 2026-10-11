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
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 45000)
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: init?.signal ?? controller.signal,
    })
  } catch (error) {
    throw new ApiError(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'REQUEST_TIMEOUT'
        : 'NETWORK_ERROR',
      '服务暂时无法连接，请重试。旅程进度以服务端记录为准。',
      0,
    )
  } finally {
    window.clearTimeout(timeout)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
      code?: string
      message?: string
    }
    throw new ApiError(
      body.error?.code ?? body.code ?? 'UNKNOWN',
      body.error?.message ?? body.message ?? '请求失败，请重试。',
      res.status,
    )
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
