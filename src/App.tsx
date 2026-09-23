import Layout from './components/Layout'
import Hero from './components/Hero'
import Work from './components/Work'
import Services from './components/Services'
import About from './components/About'
import Contact from './components/Contact'

export default function App() {
  return (
    <Layout>
      <Hero />
      <Work />
      <Services />
      <About />
      <Contact />
    </Layout>
  )
}
