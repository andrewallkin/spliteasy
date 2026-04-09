import { isAxiosError } from 'axios'

const EMAIL_ALLOWLIST_REJECTION_HINT = 'not allowed to use this application'

export function getErrorMessage(error: unknown, fallback = 'Something went wrong') {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'response' in error) {
    const maybeResponse = error as { response?: { data?: { detail?: string } } }
    return maybeResponse.response?.data?.detail ?? fallback
  }
  return fallback
}

/** Message for window.alert when the API rejects the email allowlist; null if a different error. */
export function getEmailAllowlistRejectionMessage(error: unknown): string | null {
  if (!isAxiosError(error) || error.response?.status !== 403) return null
  const msg = getErrorMessage(error, '')
  if (!msg.includes(EMAIL_ALLOWLIST_REJECTION_HINT)) return null
  return msg
}
