export const DEFAULT_CURRENCY = 'ZAR'
export const DEFAULT_LOCALE = 'en-ZA'

export function formatCurrency(amount: number, currencyCode: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: currencyCode,
  }).format(amount)
}
