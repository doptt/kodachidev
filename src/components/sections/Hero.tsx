import { useIsPhone } from '../../hooks/useIsPhone'
import PhoneHero from './PhoneHero'
import ScrollHero from './ScrollHero'

// Phones get the intro over a painted galaxy. Everything else gets the live,
// scroll-driven scene.
export default function Hero() {
  return useIsPhone() ? <PhoneHero /> : <ScrollHero />
}
