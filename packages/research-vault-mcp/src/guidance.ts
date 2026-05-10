import type { McpProfile } from './profile.ts'

export type GuidanceVerdict = 'PASS' | 'FLAG' | 'BLOCK'

export interface AgentGuidance {
  verdict: GuidanceVerdict
  reason: string
  next_step: string
  recommended_tool?: string
  retryable?: boolean
}

export function passGuidance(reason: string, next_step: string, recommended_tool?: string): AgentGuidance {
  return {
    verdict: 'PASS',
    reason,
    next_step,
    recommended_tool,
    retryable: false,
  }
}

export function flagGuidance(reason: string, next_step: string, recommended_tool?: string): AgentGuidance {
  return {
    verdict: 'FLAG',
    reason,
    next_step,
    recommended_tool,
    retryable: true,
  }
}

export function blockGuidance(reason: string, next_step: string, recommended_tool?: string): AgentGuidance {
  return {
    verdict: 'BLOCK',
    reason,
    next_step,
    recommended_tool,
    retryable: false,
  }
}

export function readonlyBlockedGuidance(toolName: string, profile: McpProfile): AgentGuidance {
  return blockGuidance(
    `${toolName} is unavailable while Research Vault MCP is running in ${profile} profile.`,
    'Use vault_search for readonly evidence, or switch to MCP_PROFILE=full for operator-approved non-destructive mutation in a private operator session.',
    'vault_search',
  )
}

export function adminBlockedGuidance(toolName: string, profile: McpProfile): AgentGuidance {
  return blockGuidance(
    `${toolName} is admin-only and unavailable while Research Vault MCP is running in ${profile} profile.`,
    'Use vault_search for readonly evidence, or start a private admin operator session with MCP_PROFILE=admin; readonly/full profiles are insufficient for destructive/admin tools.',
    'vault_search',
  )
}
