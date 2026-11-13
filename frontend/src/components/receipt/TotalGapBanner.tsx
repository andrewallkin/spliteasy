import { formatCurrency } from '@/utils/currency'

const CENT = 0.01

export function receiptTotalGap(
  items: { final_line_total: string }[],
  totalAmount: string,
): { itemsTotal: number; receiptTotal: number; difference: number } | null {
  const receiptTotal = parseFloat(totalAmount)
  if (!Number.isFinite(receiptTotal)) return null
  const itemsTotal = items.reduce((sum, item) => sum + (parseFloat(item.final_line_total) || 0), 0)
  const rawDifference = Math.round((itemsTotal - receiptTotal) * 100) / 100
  if (Math.abs(rawDifference) <= CENT) return null
  return { itemsTotal, receiptTotal, difference: Math.abs(rawDifference) }
}

export function TotalGapBanner({
  items,
  totalAmount,
  currency,
}: {
  items: { final_line_total: string }[]
  totalAmount: string
  currency: string
}) {
  const gap = receiptTotalGap(items, totalAmount)
  if (!gap) return null
  return (
    <p className="rounded-[20px] border-[1.5px] border-orange-200 bg-orange-50/60 px-3 py-2 text-xs font-semibold leading-5 text-orange-700">
      We checked this twice and the items still do not add up to the receipt total. Items{' '}
      {formatCurrency(gap.itemsTotal, currency)}, receipt {formatCurrency(gap.receiptTotal, currency)}{' '}
      ({formatCurrency(gap.difference, currency)} difference). You can edit any row or the total.
    </p>
  )
}
