import { useState } from 'react'
import type { DerivedGameState, RecordingOptions } from '@/core/types'
import { canRecord } from '@/core/engine'

interface ActionZoneProps {
  state: DerivedGameState
  recordingOptions: RecordingOptions
  /** True when the active team's current run hasn't had a recorded pass yet —
   *  GOAL and Receiver Error must be gated until at least one pass. */
  firstPossession: boolean
  /** A puller has been selected from the canvas (only meaningful in awaiting-pull). */
  pullerSelected: boolean

  onGoal:           () => void
  onThrowaway:      () => void
  onStall:          () => void
  onReceiverError:  () => void
  onBlock:          () => void
  onIntercept:      () => void
  onPull:           () => void
  onPullBonus:      () => void
  onBrick:          () => void
  onMore:           () => void
}

// ─── ActionZone ──────────────────────────────────────────────────────────────
// The fixed 2x2 button grid at the bottom of the Live Entry screen.
//
// Layout is constant across phases — the slots stay in the same screen
// positions so the recorder's thumb hits the right action without looking.
// Only the labels and handlers change.
//
// Slot map:
//   ┌──────────┬──────────┐
//   │  TL      │  TR      │
//   ├──────────┼──────────┤
//   │  BL      │  BR      │
//   └──────────┴──────────┘
//
// In-play (with holder):    GOAL  | TURNOVER ▾   /   BLOCK ▾ | MORE
// Awaiting-pull:            PULL  | BONUS        /   BRICK   | MORE
//
// TURNOVER and BLOCK open transient sub-bars rendered above the zone, so the
// canvas stays visible while the recorder picks a specific kind.

export function ActionZone(props: ActionZoneProps) {
  const { state, recordingOptions, firstPossession, pullerSelected } = props
  const [openSub, setOpenSub] = useState<'turnover' | 'block' | null>(null)

  const phase = state.gamePhase
  const inPlay = phase === 'in-play'
  const awaitingPull = phase === 'awaiting-pull'
  const hasHolder = state.discHolder !== null

  // ── In-play actions ────────────────────────────────────────────────────────
  const goalEnabled       = inPlay && hasHolder && !firstPossession && canRecord(state, 'goal')
  const throwawayEnabled  = inPlay && hasHolder && canRecord(state, 'turnover-throw-away')
  const recErrorEnabled   = inPlay && hasHolder && !firstPossession && canRecord(state, 'turnover-receiver-error')
  const stallEnabled      = inPlay && hasHolder && canRecord(state, 'turnover-stall') && recordingOptions.stall
  const blockEnabled      = inPlay && canRecord(state, 'block')
  const interceptEnabled  = inPlay && canRecord(state, 'intercept')

  // ── Awaiting-pull actions ──────────────────────────────────────────────────
  const pullEnabled       = awaitingPull && pullerSelected && canRecord(state, 'pull')
  const bonusEnabled      = awaitingPull && pullerSelected && canRecord(state, 'pull-bonus') && recordingOptions.pullBonus
  const brickEnabled      = awaitingPull && pullerSelected && canRecord(state, 'brick')   && recordingOptions.brick

  const closeSub = () => setOpenSub(null)

  return (
    <div className="flex-shrink-0 flex flex-col" style={{ borderTop: '1px solid var(--color-border)' }}>
      {/* Transient sub-bar — overlays above the action zone */}
      {openSub === 'turnover' && (
        <SubBar onCancel={closeSub}>
          <SubBarBtn label="Throwaway" disabled={!throwawayEnabled} onClick={() => { props.onThrowaway();      closeSub() }} />
          <SubBarBtn label="Rec Error" disabled={!recErrorEnabled}  onClick={() => { props.onReceiverError();  closeSub() }} />
          {recordingOptions.stall && (
            <SubBarBtn label="Stall" disabled={!stallEnabled} onClick={() => { props.onStall(); closeSub() }} />
          )}
        </SubBar>
      )}
      {openSub === 'block' && (
        <SubBar onCancel={closeSub}>
          <SubBarBtn label="Block"     disabled={!blockEnabled}     onClick={() => { props.onBlock();     closeSub() }} />
          <SubBarBtn label="Intercept" disabled={!interceptEnabled} onClick={() => { props.onIntercept(); closeSub() }} />
        </SubBar>
      )}

      {/* 2x2 main grid */}
      <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--color-border)' }}>
        {/* Top-left */}
        {inPlay
          ? <BigBtn label="GOAL" tone="success" disabled={!goalEnabled} onClick={() => { closeSub(); props.onGoal() }} />
          : <BigBtn label="PULL" tone="primary" disabled={!pullEnabled} onClick={() => { closeSub(); props.onPull() }} />
        }
        {/* Top-right */}
        {inPlay
          ? <BigBtn label="TURNOVER" tone="warn"
              caret
              disabled={!throwawayEnabled && !recErrorEnabled && !stallEnabled}
              active={openSub === 'turnover'}
              onClick={() => setOpenSub(s => s === 'turnover' ? null : 'turnover')} />
          : <BigBtn label="BONUS"    tone="primary"
              disabled={!bonusEnabled}
              hidden={!recordingOptions.pullBonus}
              onClick={() => { closeSub(); props.onPullBonus() }} />
        }
        {/* Bottom-left */}
        {inPlay
          ? <BigBtn label="BLOCK" tone="block"
              caret
              disabled={!blockEnabled && !interceptEnabled}
              active={openSub === 'block'}
              onClick={() => setOpenSub(s => s === 'block' ? null : 'block')} />
          : <BigBtn label="BRICK" tone="warn"
              disabled={!brickEnabled}
              hidden={!recordingOptions.brick}
              onClick={() => { closeSub(); props.onBrick() }} />
        }
        {/* Bottom-right: MORE — always present */}
        <BigBtn label="MORE" tone="neutral" onClick={() => { closeSub(); props.onMore() }} />
      </div>
    </div>
  )
}

// ─── Big action button ───────────────────────────────────────────────────────
// Each slot in the 2x2 grid. Tall, high-contrast, thumb-friendly.

type Tone = 'success' | 'warn' | 'block' | 'primary' | 'neutral'

interface BigBtnProps {
  label:     string
  tone:      Tone
  disabled?: boolean
  hidden?:   boolean
  caret?:    boolean   // shows a ▾ to hint at a sub-bar
  active?:   boolean   // sub-bar currently open
  onClick:   () => void
}

function BigBtn({ label, tone, disabled, hidden, caret, active, onClick }: BigBtnProps) {
  if (hidden) {
    // Keep the cell present (so the grid stays 2x2) but render nothing.
    return <div style={{ background: 'var(--color-bg)' }} />
  }
  const { bg, fg } = toneColours(tone, !!active)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer transition-opacity select-none"
      style={{
        background: bg,
        color:      fg,
        opacity:    disabled ? 0.35 : 1,
        height:     '100%',
        minHeight:  92,
        fontSize:   20,
        fontWeight: 800,
        letterSpacing: 1.5,
      }}
    >
      {label}{caret ? ' ▾' : ''}
    </button>
  )
}

function toneColours(tone: Tone, active: boolean): { bg: string; fg: string } {
  switch (tone) {
    case 'success': return { bg: active ? 'var(--color-success)'  : 'var(--color-success-bg)',  fg: active ? '#fff' : 'var(--color-success)' }
    case 'warn':    return { bg: active ? 'var(--color-warn)'     : 'var(--color-warn-bg)',     fg: active ? '#111' : 'var(--color-warn)'    }
    case 'block':   return { bg: active ? 'var(--color-block)'    : 'var(--color-block-bg)',    fg: active ? '#fff' : 'var(--color-block)'   }
    case 'primary': return { bg: active ? 'var(--color-team-a)'   : 'var(--color-surf-2)',      fg: active ? '#fff' : 'var(--color-content)' }
    case 'neutral': return { bg: 'var(--color-surf-2)', fg: 'var(--color-muted)' }
  }
}

// ─── Sub-bar (transient row above the grid) ──────────────────────────────────

function SubBar({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div
      className="flex items-stretch text-[13px] font-semibold tracking-wider"
      style={{
        background: 'var(--color-surf-2)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {children}
      <button
        onClick={onCancel}
        className="px-4 cursor-pointer"
        style={{ color: 'var(--color-muted)', borderLeft: '1px solid var(--color-border)' }}
        title="Cancel"
      >
        ✕
      </button>
    </div>
  )
}

function SubBarBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-3 cursor-pointer disabled:opacity-30 disabled:cursor-default"
      style={{ color: 'var(--color-content)' }}
    >
      {label}
    </button>
  )
}
