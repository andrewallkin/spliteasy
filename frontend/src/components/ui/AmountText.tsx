import { formatCurrency } from '@/utils/currency'

type Tone = 'owe' | 'owed' | 'neutral' | 'settled'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const tones: Record<Tone, string> = {
  owe: 'text-rose-600',
  owed: 'text-emerald-600',
  settled: 'text-emerald-600',
  neutral: 'text-ink',
}
const sizes: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl tracking-tight',
  xl: 'text-[34px] leading-tight tracking-tight',
}

export function AmountText({ amount, tone = 'neutral', size = 'md', currency, className = '' }: { amount: number; tone?: Tone; size?: Size; currency?: string; className?: string }) {
  return <span className={`font-extrabold tabular-nums ${tones[tone]} ${sizes[size]} ${className}`}>{formatCurrency(amount, currency)}</span>
}
