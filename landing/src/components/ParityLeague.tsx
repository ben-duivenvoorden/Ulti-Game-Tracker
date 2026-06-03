import { ChartIcon } from './icons'
import Reveal from './Reveal'

export default function ParityLeague() {
  return (
    <section id="parity" className="border-t border-border/60 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <Reveal>
          <p className="font-mono text-sm uppercase tracking-widest text-accent-2">Companion project</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Parity League
            <span className="ml-3 align-middle text-base font-medium text-muted">Brisbane, Australia</span>
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Parity League, an ultimate league in Brisbane, will use Ulti Game
            Tracker to collect each game&rsquo;s log and turn it into the stats
            that run the competition — standings, player and line analytics, and
            segmented-scoring reconciliation across devices.
          </p>
        </Reveal>

        {/* Decorative stats panel — illustrates "log → per-player stats". */}
        <Reveal delay={120}>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surf/50 p-6">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
            />
            <div className="flex items-center gap-2 text-muted">
              <ChartIcon className="h-5 w-5 text-accent-2" />
              <span className="font-mono text-xs uppercase tracking-widest">Player stats</span>
            </div>

            {(() => {
              const cols = ['Goals', 'Assists', 'Blocks', 'Turnovers', 'Possessions']
              const players: { name: string; stats: number[] }[] = [
                { name: 'A. Okafor', stats: [4, 3, 2, 1, 18] },
                { name: 'M. Petrov', stats: [2, 5, 0, 2, 22] },
                { name: 'J. Tanaka', stats: [3, 1, 1, 0, 14] },
                { name: 'L. Brennan', stats: [1, 4, 3, 3, 19] },
              ]
              return (
                <table className="mt-5 w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-right font-mono text-[10px] uppercase tracking-wide text-dim">
                      <th className="pb-2 text-left font-medium tracking-widest">Player</th>
                      {cols.map((c) => (
                        <th key={c} className="pb-2 pl-1.5 align-bottom font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(({ name, stats }) => (
                      <tr key={name} className="border-t border-border/60">
                        <td className="py-2.5 text-left font-medium text-content">{name}</td>
                        {stats.map((v, i) => (
                          <td
                            key={cols[i]}
                            className={`py-2.5 pl-1.5 text-right font-mono ${i === 0 ? 'text-accent-2' : 'text-muted'}`}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}

            <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-widest text-dim">
              Illustrative
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
