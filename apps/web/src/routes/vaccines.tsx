import { createFileRoute } from '@tanstack/react-router'

import { useSelectedBaby } from '../features/babies/use-babies'
import { VaccinesPage } from '../features/vaccines/VaccinesPage'

export const Route = createFileRoute('/vaccines')({
  component: Vaccines,
})

function Vaccines() {
  const { baby } = useSelectedBaby()
  return baby ? <VaccinesPage baby={baby} /> : null
}
