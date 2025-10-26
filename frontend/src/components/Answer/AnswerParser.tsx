import { cloneDeep } from 'lodash'

import { AskResponse, Citation } from '../../api'

export type ParsedAnswer = {
  citations: Citation[]
  markdownFormatText: string,
  generated_chart: string | null
} | null

export const enumerateCitations = (citations: Citation[]) => {
  const filepathMap = new Map()
  for (const citation of citations) {
    const { filepath } = citation
    let part_i = 1
    if (filepathMap.has(filepath)) {
      part_i = filepathMap.get(filepath) + 1
    }
    filepathMap.set(filepath, part_i)
    citation.part_index = part_i
  }
  return citations
}

/**
 * Minimal, isolated support for Azure AI Foundry Prompt Flow "tool" role messages.
 * Non-invasive: only used if no inline [docN] citations are found.
 * Maps Prompt Flow fields to existing Citation shape without mutating input.
 */
const extractPromptFlowCitations = (answer: AskResponse): Citation[] => {
  const anyAnswer = answer as any
  const choices = anyAnswer?.choices
  if (!Array.isArray(choices)) return []

  const out: Citation[] = []

  for (const choice of choices) {
    const messages = choice?.messages
    if (!Array.isArray(messages)) continue

    for (const msg of messages) {
      if (msg?.role !== 'tool' || msg?.content == null) continue

      let contentObj: any = msg.content
      if (typeof msg.content === 'string') {
        try {
          contentObj = JSON.parse(msg.content)
        } catch {
          continue
        }
      }

      const cits = contentObj?.citations
      if (!Array.isArray(cits)) continue

      for (let i = 0; i < cits.length; i++) {
        const pf = cits[i]
        out.push({
          id: pf?.docId ?? String(i + 1),
          content: pf?.content ?? '',
          title: pf?.title ?? null,
          filepath: pf?.source ?? pf?.filepath ?? null,
          url: pf?.url ?? null,
          metadata: pf?.page != null ? JSON.stringify({ page: pf.page }) : (pf?.metadata ?? null),
          chunk_id: pf?.chunk_id ?? null,
          reindex_id: null,
          part_index: pf?.page ?? undefined
        })
      }
    }
  }

  return out
}

export function parseAnswer(answer: AskResponse): ParsedAnswer {
  if (typeof answer.answer !== "string") return null
  let answerText = answer.answer
  const citationLinks = answerText.match(/\[(doc\d\d?\d?)]/g)

  const lengthDocN = '[doc'.length

  let filteredCitations = [] as Citation[]
  let citationReindex = 0

  // Existing behavior for inline [docN] citations (unchanged)
  citationLinks?.forEach(link => {
    // Replacing the links/citations with number
    const citationIndex = link.slice(lengthDocN, link.length - 1)
    const citation = cloneDeep(answer.citations[Number(citationIndex) - 1]) as Citation
    if (!filteredCitations.find(c => c.id === citationIndex) && citation) {
      answerText = answerText.replaceAll(link, ` ^${++citationReindex}^ `)
      citation.id = citationIndex // original doc index to de-dupe
      citation.reindex_id = citationReindex.toString() // reindex from 1 for display
      filteredCitations.push(citation)
    }
  })

  // Fallback: Prompt Flow tool citations (only if no inline citations were parsed)
  if (filteredCitations.length === 0) {
    const pfCitations = extractPromptFlowCitations(answer)
    if (pfCitations.length > 0) {
      pfCitations.forEach((c, idx) => {
        c.reindex_id = (idx + 1).toString()
      })
      filteredCitations = pfCitations
    }
  }

  filteredCitations = enumerateCitations(filteredCitations)

  return {
    citations: filteredCitations,
    markdownFormatText: answerText,
    generated_chart: answer.generated_chart
  }
}
