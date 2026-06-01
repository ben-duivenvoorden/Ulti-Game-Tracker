import { useState } from 'react'
import { IconBtn, InfoIcon } from '@/components/ui/Icons'
import { Btn } from '@/components/ui/Btn'
import { useRecordingOptions } from '@/core/selectors'

// The (i) bubble + scorer-info splash. The briefing text lives on the
// competition-config layer (RecordingOptions.scorerInfo) and is edited in Game
// Settings. Dropped into the LineSelection and LiveEntry headers so the scorer
// can pull it up while scoring or picking lines.
//
// `compact` renders a smaller 32 px bubble for the tighter LiveEntry header;
// the default 44 px target matches the sibling Settings / Teams icons on
// LineSelection.
export function ScorerInfoButton({ compact = false }: { compact?: boolean }) {
  const { scorerInfo } = useRecordingOptions()
  const [open, setOpen] = useState(false)

  const button = compact ? (
    <button
      onClick={() => setOpen(true)}
      title="Scorer info"
      aria-label="Scorer info"
      className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full cursor-pointer text-muted hover:text-content transition-colors"
    >
      <InfoIcon size={18} />
    </button>
  ) : (
    <IconBtn onClick={() => setOpen(true)} title="Scorer info">
      <InfoIcon />
    </IconBtn>
  )

  return (
    <>
      {button}
      {open && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-xl p-5 w-full max-w-sm flex flex-col gap-3 max-h-[80%]"
            style={{ background: 'var(--color-surf)', border: '1px solid var(--color-border-2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-xs font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>
              SCORER INFO
            </div>
            <div className="flex-1 overflow-y-auto text-sm whitespace-pre-wrap" style={{ color: 'var(--color-content)' }}>
              {scorerInfo.trim().length > 0
                ? scorerInfo
                : <span style={{ color: 'var(--color-muted)' }}>No information configured. Add it in Game Settings → Scorer Info.</span>}
            </div>
            <Btn variant="primary" size="md" full onClick={() => setOpen(false)}>Close</Btn>
          </div>
        </div>
      )}
    </>
  )
}
