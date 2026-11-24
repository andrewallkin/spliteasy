export const DEFAULT_CURRENCY = 'ZAR'
export const DEFAULT_LOCALE = 'en-ZA'

const CURRENCY_ALIASES: Record<string, string> = {
  R: 'ZAR',
  RAND: 'ZAR',
  RANDS: 'ZAR',
}

const acceptedCodes = new Set<string>([DEFAULT_CURRENCY])

export function resolveCurrencyCode(currencyCode?: string | null): string {
  const raw = (currencyCode ?? '').trim().toUpperCase()
  const code = CURRENCY_ALIASES[raw] ?? raw
  if (!/^[A-Z]{3}$/.test(code) || !isWellFormedCurrency(code)) return DEFAULT_CURRENCY
  return code
}

function isWellFormedCurrency(code: string): boolean {
  if (acceptedCodes.has(code)) return true
  try {
    new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: code }).format(0)
    acceptedCodes.add(code)
    return true
  } catch {
    return false
  }
}

export function formatCurrency(amount: number, currencyCode: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: resolveCurrencyCode(currencyCode),
  }).format(amount)
}
