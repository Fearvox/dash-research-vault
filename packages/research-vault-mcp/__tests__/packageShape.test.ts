import { describe, test, expect } from 'bun:test'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))

describe('@syndash/research-vault-mcp package shape (npx publish readiness)', () => {
  test('has scoped name @syndash/research-vault-mcp', () => {
    expect(pkg.name).toBe('@syndash/research-vault-mcp')
  })

  test('name passes npm lowercase+scope regex', () => {
    expect(pkg.name).toMatch(/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/)
  })

  test('has version', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('has bin entry', () => {
    expect(pkg.bin).toBeDefined()
    expect(typeof pkg.bin).toBe('object')
    expect(pkg.bin['research-vault-mcp']).toBeTruthy()
  })

  test('bin entry file exists', () => {
    const binPath = pkg.bin['research-vault-mcp']
    expect(existsSync(join(PKG_ROOT, binPath))).toBe(true)
  })

  test('bin entry is executable', () => {
    const binPath = join(PKG_ROOT, pkg.bin['research-vault-mcp'])
    const mode = statSync(binPath).mode
    const isExecutableByOwner = (mode & 0o100) !== 0
    expect(isExecutableByOwner).toBe(true)
  })

  test('has description (>= 20 chars)', () => {
    expect(typeof pkg.description).toBe('string')
    expect(pkg.description.length).toBeGreaterThan(20)
  })

  test('has repository with correct shape', () => {
    expect(pkg.repository).toBeDefined()
    expect(pkg.repository.type).toBe('git')
    expect(pkg.repository.url).toMatch(/github\.com/)
    expect(pkg.repository.directory).toBe('packages/research-vault-mcp')
  })

  test('has publishConfig.access=public (required for scoped name)', () => {
    expect(pkg.publishConfig?.access).toBe('public')
  })

  test('has files allowlist for compiled publish artifact', () => {
    expect(Array.isArray(pkg.files)).toBe(true)
    expect(pkg.files.length).toBeGreaterThan(0)
    expect(pkg.files).toContain('README.md')
    expect(pkg.files).toContain('package.json')
    expect(pkg.files).toContain('dist/**/*.js')
  })

  test('builds before npm pack', () => {
    expect(pkg.scripts?.prepack).toBe('bun run build')
  })

  test('uses Apache-2.0 package license', () => {
    expect(pkg.license).toBe('Apache-2.0')
  })

  test('README.md documents stdio launch', () => {
    const readme = readFileSync(join(PKG_ROOT, 'README.md'), 'utf8')
    expect(readme).toContain('--transport=stdio')
    expect(readme).toContain('Dash Research Vault')
    expect(readme).not.toContain('not yet published')
  })

  test('bin defaults to stdio transport', () => {
    const bin = readFileSync(join(PKG_ROOT, pkg.bin['research-vault-mcp']), 'utf8')
    expect(bin).toContain("return 'stdio'")
  })

  test('type=module for ESM', () => {
    expect(pkg.type).toBe('module')
  })

  test('has keywords array', () => {
    expect(Array.isArray(pkg.keywords)).toBe(true)
    expect(pkg.keywords).toContain('mcp')
  })

  test('README documents Bun-native runtime contract', () => {
    const readme = readFileSync(join(PKG_ROOT, 'README.md'), 'utf8')
    expect(readme).toContain('Bun-native')
    expect(readme).toContain('`npx` is supported as an install/launch shim')
    expect(readme).toContain('must have `bun` available on `PATH`')
  })

  test('CHANGELOG is packaged and documents current version', () => {
    expect(pkg.files).toContain('CHANGELOG.md')
    const changelog = readFileSync(join(PKG_ROOT, 'CHANGELOG.md'), 'utf8')
    expect(changelog).toContain(`## ${pkg.version}`)
  })
})
