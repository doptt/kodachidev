import { useIsPhone } from '../../hooks/useIsPhone'
import PhoneHero from './PhoneHero'
import ScrollHero from './ScrollHero'

// Phones get the intro with a pre-rendered black hole. Everything else gets
// the live, scroll-driven scene.
export default function Hero() {
  return useIsPhone() ? <PhoneHero /> : <ScrollHero />
}
