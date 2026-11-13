import { avatarColor } from '@/lib/theme'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizes: Record<Size, string> = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
}

type AvatarProps = {
  name: string
  src?: string | null
  /** Used to pick a stable colour; falls back to name. */
  colorKey?: string
  size?: Size
  shape?: 'circle' | 'rounded'
  className?: string
  onError?: () => void
}

export function Avatar({ name, src, colorKey, size = 'md', shape = 'circle', className = '', onError }: AvatarProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden font-extrabold text-white ${sizes[size]} ${radius} ${src ? 'bg-surface-tertiary' : avatarColor(colorKey ?? name)} ${className}`}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" onError={onError} /> : name.charAt(0).toUpperCase()}
    </span>
  )
}

type Person = { id: string; name: string; src?: string | null }

export function AvatarStack({ people, max = 4, size = 'xs', className = '' }: { people: Person[]; max?: number; size?: Size; className?: string }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className={`flex items-center ${className}`}>
      {shown.map((p, i) => (
        <Avatar key={p.id} name={p.name} src={p.src} colorKey={p.id} size={size} className={`ring-2 ring-white ${i > 0 ? '-ml-2' : ''}`} />
      ))}
      {extra > 0 && (
        <span className={`-ml-2 inline-flex items-center justify-center rounded-full bg-white font-bold text-ink-secondary ring-2 ring-white ${sizes[size]}`}>+{extra}</span>
      )}
    </div>
  )
}
