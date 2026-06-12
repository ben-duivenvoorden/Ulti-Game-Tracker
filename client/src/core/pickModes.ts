import type { RawEventType, TeamId, UiMode } from './types'
import { otherTeam } from './types'

// ─── Pick-mode registry ───────────────────────────────────────────────────────
// Single source of truth for "tap a player to resolve a pending action" flows.
// Adding a new pick mode = one entry here + one entry in UiMode in types.ts.

export interface PickTapAction {
  eventType: RawEventType
  team: 'possession' | 'defending'
}

export interface PickModeConfig {
  /** Full instruction shown in the mode banner while picking. */
  contextLabel: string | ((ctx: { defendingShort: string }) => string)
  /** What happens when a player is tapped while in this mode. */
  onTap: PickTapAction
}

export const PICK_MODES = {
  'block-pick': {
    contextLabel: ({ defendingShort }) => `PICK BLOCKER FROM ${defendingShort}`,
    onTap:        { eventType: 'block', team: 'defending' },
  },
  'intercept-pick': {
    contextLabel: ({ defendingShort }) => `PICK INTERCEPTOR FROM ${defendingShort}`,
    onTap:        { eventType: 'intercept', team: 'defending' },
  },
} as const satisfies Record<Exclude<UiMode, 'idle'>, PickModeConfig>

export type PickUiMode = keyof typeof PICK_MODES

export function isPickMode(m: UiMode): m is PickUiMode {
  return m !== 'idle'
}

/** Which team's players should be active (tappable) during this pick mode? */
export function pickActiveTeam(mode: PickUiMode, possession: TeamId): TeamId {
  return PICK_MODES[mode].onTap.team === 'defending' ? otherTeam(possession) : possession
}

/** Resolve the contextLabel for an ActionPane render. */
export function resolveContextLabel(mode: PickUiMode, ctx: { defendingShort: string }): string {
  const l = PICK_MODES[mode].contextLabel
  return typeof l === 'function' ? l(ctx) : l
}
