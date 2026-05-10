import { adminBlockedGuidance, readonlyBlockedGuidance } from './guidance.ts'
import { getActiveProfile, profileAllowsMutation, type McpProfile } from './profile.ts'
import { errorEnvelope } from './response.ts'

interface NamedTool {
  name: string
}

export const READONLY_TOOL_NAMES = new Set([
  'vault_status',
  'vault_taxonomy',
  'vault_search',
  'vault_get',
  'vault_batch_analyze',
])

export const MUTATION_TOOL_NAMES = new Set([
  'vault_raw_ingest',
  'vault_note_save',
  'vault_delete',
])

function isDeleteOrAdminTool(name: string): boolean {
  return name === 'vault_delete' || name.includes('_delete') || name.includes('_admin') || name.startsWith('admin_')
}

export function visibleToolsForProfile<T extends NamedTool>(
  tools: T[],
  profile: McpProfile = getActiveProfile(),
): T[] {
  return tools.filter(tool => isToolAllowed(tool.name, profile))
}

export function isToolAllowed(name: string, profile: McpProfile = getActiveProfile()): boolean {
  if (profile === 'admin') return true
  if (profile === 'readonly') return READONLY_TOOL_NAMES.has(name)
  return !isDeleteOrAdminTool(name)
}

export function blockedToolResponse(name: string, profile: McpProfile = getActiveProfile()) {
  const guidance = isDeleteOrAdminTool(name)
    ? adminBlockedGuidance(name, profile)
    : readonlyBlockedGuidance(name, profile)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ...errorEnvelope(guidance.reason, guidance.next_step, { profile }),
        agent_guidance: guidance,
      }),
    }],
    isError: true,
  }
}

export function configureAllowed(profile: McpProfile = getActiveProfile()): boolean {
  return profileAllowsMutation(profile)
}
