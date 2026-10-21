import Layout from './components/layout/Layout'
import Hero from './components/sections/Hero'
import Reviews from './components/sections/Reviews'
import Services from './components/sections/Services'
import Work from './components/sections/Work'
import About from './components/sections/About'
import Contact from './components/sections/Contact'

export default function App() {
  return (
    <Layout>
      <Hero />
      <Services />
      <Work />
      <About />
      <Contact />
      <Reviews />
    </Layout>
  )
}