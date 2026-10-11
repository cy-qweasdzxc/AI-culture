import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useJourney } from '@/engine/journeyStore'

export default function RequireJourney({ children }: { children: ReactElement }) {
  const state = useJourney((s) => s.state)
  if (state === 'CREATED') return <Navigate to="/role" replace />
  return children
}
