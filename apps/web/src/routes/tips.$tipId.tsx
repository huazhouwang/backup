import { createFileRoute } from '@tanstack/react-router'

import { TipDetail } from '../features/tips/TipDetail'

export const Route = createFileRoute('/tips/$tipId')({
  component: Tip,
})

function Tip() {
  const { tipId } = Route.useParams()
  return <TipDetail tipId={tipId} />
}
