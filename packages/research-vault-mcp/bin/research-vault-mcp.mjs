#!/usr/bin/env node
/**
 * CLI entry point for @syndash/research-vault-mcp.
 *
 * The server is Bun-native. The npm bin is a small Node-compatible shim so
 * `npx` can install the package, then delegate execution to `bun`.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = join(__dirname, '..')

const compiledServer = join(pkgRoot, 'dist', 'server.js')
const sourceServer = join(pkgRoot, 'src', 'server.ts')

function parseTransport(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) return args[i + 1]
    if (args[i]?.startsWith('--transport=')) return args[i].split('=')[1]
  }
  return 'stdio'
}

function runWithBun(entrypoint, args) {
  const child = spawn('bun', [entrypoint, ...args], {
    cwd: pkgRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      MCP_TRANSPORT: parseTransport(args),
    },
  })

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })

  child.on('error', err => {
    console.error('research-vault-mcp: failed to spawn bun')
    console.error('Install Bun first: https://bun.sh')
    console.error(err.message)
    process.exit(1)
  })
}

function main() {
  const args = process.argv.slice(2)

  if (existsSync(compiledServer)) {
    runWithBun(compiledServer, args)
  } else if (existsSync(sourceServer)) {
    runWithBun(sourceServer, args)
  } else {
    console.error('research-vault-mcp: neither dist/server.js nor src/server.ts found')
    process.exit(1)
  }
}

main()
