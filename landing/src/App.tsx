import Nav from './components/Nav'
import Hero from './components/Hero'
import Mission from './components/Mission'
import Features from './components/Features'
import ParityLeague from './components/ParityLeague'
import Platforms from './components/Platforms'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-content selection:bg-accent/30">
      <Nav />
      <main>
        <Hero />
        <Mission />
        <Features />
        <ParityLeague />
        <Platforms />
      </main>
      <Footer />
    </div>
  )
}
