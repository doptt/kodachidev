import { LensedWork } from './LensedWork'
import { WorkIntro } from './WorkIntro'

/**
 * Work, in two parts: the black hole and the fall into it (WorkIntro, which
 * owns the #work anchor, so "Work" in the nav lands on it), then the projects
 * themselves in the lensed sky on the other side (LensedWork).
 */
export function Work() {
  return (
    <>
      <WorkIntro />
      <LensedWork />
    </>
  )
}
