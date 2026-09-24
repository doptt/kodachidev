import Layout from './components/layout/Layout'
import Hero from './components/sections/Hero'
import Reviews from './components/sections/Reviews'
import Services from './components/sections/Services'
import About from './components/sections/About'
import Contact from './components/sections/Contact'

export default function App() {
  return (
    <Layout>
      <Hero />
      <Reviews />
      <Services />
      <About />
      <Contact />
    </Layout>
  )
}
