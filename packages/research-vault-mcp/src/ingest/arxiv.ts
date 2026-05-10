import type { ArxivMetadata } from '../types.js'

const ARXIV_API = 'https://export.arxiv.org/api/query'

/**
 * Parse an ArXiv ID from various URL formats.
 * Handles:
 *   https://arxiv.org/abs/2501.00001
 *   http://arxiv.org/abs/2501.00001v2
 *   abs/2501.00001
 *   2501.00001v2
 */
export function parseArxivId(value: string): string | null {
  // Bare versioned ID: 2501.00001v2
  if (/^\d{4}\.\d{4,}(v\d+)?$/.test(value.trim())) {
    return value.trim()
  }
  // URL or abs/ shorthand
  const m = value.match(/(?:arxiv\.org\/abs\/|abs\/?)(\d{4}\.\d{4,}(?:v\d+)?)/i)
  return m ? m[1] : null
}

export async function fetchArxivMetadata(id: string): Promise<ArxivMetadata> {
  const url = `${ARXIV_API}?id_list=${id}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ArXiv API error: ${res.status}`)
  const xml = await res.text()
  return parseArxivXml(xml)
}

function parseArxivXml(xml: string): ArxivMetadata {
  // Extract title
  const titleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').trim()
    : null

  // Extract abstract/summary
  const summaryMatch = xml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)
  const abstract = summaryMatch
    ? summaryMatch[1].replace(/\s+/g, ' ').trim()
    : null

  // Extract all authors
  const authors: string[] = []
  const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi
  let m
  while ((m = authorRe.exec(xml)) !== null) {
    authors.push(m[1].replace(/\s+/g, ' ').trim())
  }

  // Extract categories
  const categories: string[] = []
  const catRe = /<category[^>]*term="([^"]+)"/gi
  while ((m = catRe.exec(xml)) !== null) categories.push(m[1])

  return {
    title,
    authors: authors.length ? authors : null,
    abstract,
    arxivId: null,  // set by caller
    categories: categories.length ? categories : null
  }
}
