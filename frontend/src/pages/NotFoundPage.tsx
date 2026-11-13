import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { QuestionIcon } from '@/components/ui/icons'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-warm px-5">
      <div className="w-full max-w-sm">
        <EmptyState
          icon={<QuestionIcon className="h-8 w-8" />}
          title="Page not found"
          description="The page you are looking for does not exist."
          action={
            <Link to="/">
              <Button variant="dark" size="lg" className="w-full">
                Go home
              </Button>
            </Link>
          }
        />
      </div>
    </div>
  )
}
