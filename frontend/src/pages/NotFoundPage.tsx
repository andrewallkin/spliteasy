import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pastel-lavender/30">
          <span className="text-3xl font-bold text-pastel-purple-deep">?</span>
        </div>
        <h1 className="text-xl font-bold text-ink">Page not found</h1>
        <p className="text-sm text-ink-secondary">The page you are looking for does not exist.</p>
        <Link to="/">
          <Button className="w-full">Go home</Button>
        </Link>
      </Card>
    </div>
  )
}
