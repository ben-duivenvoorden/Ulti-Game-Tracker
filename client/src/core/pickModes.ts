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
  /** Short label for the PlayerPane header (e.g. "PICK BLOCKER"). */
  paneLabel: string
  /** Full instruction shown in the ActionPane context strip. */
  contextLabel: string | ((ctx: { defendingShort: string }) => string)
  /** Display name for the PickModePlaceholder badge (e.g. "Blocked by Defence"). */
  displayName: string
  /** Accent color (CSS var). */
  color: string
  /** Background color tint for the PlayerPane (CSS var). */
  bgColor: string
  /** What happens when a player is tapped while in this mode. */
  onTap: PickTapAction
}

export const PICK_MODES = {
  'block-pick': {
    paneLabel:    'PICK BLOCKER',
    contextLabel: ({ defendingShort }) => `PICK BLOCKER FROM ${defendingShort}`,
    displayName:  'Blocked by Defence',
    color:        'var(--color-block)',
    bgColor:      'var(--color-block-bg)',
    onTap:        { eventType: 'block', team: 'defending' },
  },
  'intercept-pick': {
    paneLabel:    'PICK INTERCEPTOR',
    contextLabel: ({ defendingShort }) => `PICK INTERCEPTOR FROM ${defendingShort}`,
    displayName:  'Intercepted by Defence',
    color:        'var(--color-intercept)',
    bgColor:      'var(--color-intercept-bg)',
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
