import { toast } from 'sonner'

function hasMessage(value: unknown): value is { message?: unknown } {
  return typeof value === 'object' && value !== null && 'message' in value
}

export function normalizeErrorMessage(error: unknown, fallback: string): string {
  let message = ''

  if (typeof error === 'string') {
    message = error
  } else if (error instanceof Error) {
    message = error.message
  } else if (hasMessage(error) && typeof error.message === 'string') {
    message = error.message
  }

  const text = message.trim()
  if (!text) return fallback

  const lower = text.toLowerCase()
  if (lower === 'load failed' || lower.includes('failed to fetch') || lower.includes('network error')) {
    return '网络连接失败，请稍后重试'
  }
  if (lower.includes('abort') || lower.includes('timed out') || lower.includes('timeout')) {
    return '请求超时，请稍后重试'
  }
  if (lower === 'offline' || (lower.includes('503') && lower.includes('offline'))) {
    return '当前离线，请检查网络连接'
  }

  return text
}

export function toastError(error: unknown, fallback: string) {
  toast.error(normalizeErrorMessage(error, fallback))
}
