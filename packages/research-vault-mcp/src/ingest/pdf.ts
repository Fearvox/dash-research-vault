// packages/research-vault-mcp/src/ingest/pdf.ts

/**
 * Convert PDF to markdown using markitdown (preferred) or pandoc.
 * Uses Bun.spawn for process execution — no child_process module needed.
 * Returns null if neither tool is available.
 */
export async function convertPdfToMarkdown(pdfPath: string): Promise<string | null> {
  // Try markitdown first
  try {
    const proc = Bun.spawn(['markitdown', pdfPath], { timeout: 60_000 })
    const [exited] = await proc.exited
    if (exited === 0) {
      const output = await new Response(proc.stdout as Blob).text()
      if (output.trim()) return output
    }
  } catch {}

  // Fallback: pandoc
  try {
    const proc = Bun.spawn(['pandoc', '--to', 'markdown', pdfPath], { timeout: 60_000 })
    const [exited] = await proc.exited
    if (exited === 0) {
      const output = await new Response(proc.stdout as Blob).text()
      if (output.trim()) return output
    }
  } catch {}

  return null
}