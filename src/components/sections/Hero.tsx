import { useIsPhone } from '../../hooks/useIsPhone'
import PhoneHero from './PhoneHero'
import ScrollHero from './ScrollHero'

// Phones get the intro over a lighter black hole with no scroll timeline.
// Everything else gets the full, scroll-driven scene.
export default function Hero() {
  return useIsPhone() ? <PhoneHero /> : <ScrollHero />
}
