// The brand wordmark — the violet/cyan bolt favicon + "Ulti Game Tracker".

export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 font-bold tracking-tight ${className}`}>
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      <span className="text-content">
        Ulti<span className="text-muted font-medium"> Game Tracker</span>
      </span>
    </span>
  )
}
