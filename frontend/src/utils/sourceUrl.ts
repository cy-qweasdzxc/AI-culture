export function safeSourceUrl(value?: string | null): string | undefined {
  try {
    const url = new URL(value ?? '')
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/** Audit status is displayed by SourceStatus, separately from the source name. */
export function sourceName(value: string): string {
  return value
    .replace(/[（(]自动发布[，,]未经人工核验[）)]/g, '')
    .replace(/^演示资料$/, '参考资料')
    .trim()
}
