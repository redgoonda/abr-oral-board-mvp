import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { CaseSummary, Difficulty, ImportResult, ImportedCaseDraft, ImportedDocumentSummary } from '../domain/types'

const PARSER_VERSION = 'abr-pdf-v1'

const categoryMap: Record<string, { subspecialty: string; prefix: string }> = {
  ABDOMEN: { subspecialty: 'Abdominal Imaging', prefix: 'ABD' },
  BREAST: { subspecialty: 'Breast Imaging', prefix: 'BRE' },
  CHEST: { subspecialty: 'Thoracic Imaging', prefix: 'CHE' },
  MUSCULOSKELETAL: { subspecialty: 'Musculoskeletal', prefix: 'MSK' },
  'NUCLEAR RADIOLOGY': { subspecialty: 'Nuclear Radiology', prefix: 'NUC' },
  NEURORADIOLOGY: { subspecialty: 'Neuroradiology', prefix: 'NEU' },
  PEDIATRICS: { subspecialty: 'Pediatric Imaging', prefix: 'PED' },
}

interface ParsedPage {
  pageNumber: number
  text: string
}

interface ParsedCaseChunk {
  category: string
  title: string
  pages: number[]
  text: string
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').replace(/ ?([,:;.])/g, '$1').trim()
}

function toSentenceList(value: string) {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueNonEmpty(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function detectCategory(text: string) {
  const normalized = normalizeWhitespace(text)
  for (const category of Object.keys(categoryMap)) {
    if (normalized.startsWith(`${category} `) || normalized === category) return category
  }
  return null
}

function parseChunkStart(text: string, inheritedCategory: string | null) {
  const normalized = normalizeWhitespace(text)
  let category = inheritedCategory
  const detected = detectCategory(normalized)
  let remainder = normalized

  if (detected) {
    category = detected
    remainder = normalized.slice(detected.length).trim()
  }

  const startIndex = remainder.search(/Image Series 1:|Clinical information:/i)
  if (startIndex <= 0 || !category) return null

  const rawTitle = remainder.slice(0, startIndex).replace(/[:\-\s]+$/g, '').trim()
  if (!rawTitle || rawTitle.length < 3) return null

  return {
    category,
    title: rawTitle,
  }
}

function extractSentenceBucket(sentences: string[], patterns: RegExp[], limit = 4) {
  return uniqueNonEmpty(
    sentences.filter((sentence) => patterns.some((pattern) => pattern.test(sentence))).map(cleanSentence).slice(0, limit),
  )
}

function cleanSentence(value: string) {
  return value
    .replace(/^[A-Z][A-Z ]+\s+[^:]+:\s*Image Series 1:\s*[^.]*\.?\s*/i, '')
    .replace(/^[A-Z][A-Z ]+\s+[^-]+-\s*Clinical information:\s*[^.]*\.?\s*/i, '')
    .replace(/^The candidate should\s*/i, '')
    .replace(/^They should\s*/i, '')
    .replace(/^A superior candidate will\s*/i, '')
    .replace(/^Overall:\s*/i, '')
    .replace(/^The examiner will note that\s*/i, 'Examiner note: ')
    .trim()
}

function inferClinicalContext(text: string) {
  const match = normalizeWhitespace(text).match(/Clinical information:\s*([^.]*(?:\.|$))/i)
  if (match) return cleanSentence(match[1])
  const firstSentence = toSentenceList(text).find((sentence) => /candidate should|identify|describe|recognize/i.test(sentence))
  return cleanSentence(firstSentence ?? 'Imported from PDF. Review and refine before use.')
}

function inferModality(text: string) {
  const imageSeriesMatches = [...text.matchAll(/Image Series \d+:\s*(.*?)(?=The candidate should|They should|A superior candidate will|Overall:|$)/gi)]
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean)
  const clinicalSeriesMatches = [...text.matchAll(/Image series:\s*(.*?)(?=The candidate should|They should|A superior candidate will|Overall:|$)/gi)]
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean)
  const seriesMatches = [...imageSeriesMatches, ...clinicalSeriesMatches]
  return uniqueNonEmpty(seriesMatches).join(' + ') || 'Imported imaging series'
}

function inferDifficulty(text: string): Difficulty {
  const normalized = normalizeWhitespace(text)
  if (/staging|discordant|metastases|management significance|lymph node|vascular involvement/i.test(normalized)) return 'Advanced'
  if (/return to screening|simple cyst|benign/i.test(normalized)) return 'Junior'
  return 'Standard'
}

function buildCandidateTasks(findings: string[], differential: string[], management: string[]) {
  return uniqueNonEmpty([
    findings[0] ? `Describe the key imaging observations: ${findings[0]}` : 'Describe the key imaging findings.',
    differential[0] ? `State the leading synthesis or diagnosis: ${differential[0]}` : 'State the leading diagnosis and one alternative.',
    management[0] ? `Close with the recommendation: ${management[0]}` : 'Give the next-step recommendation and urgency.',
  ])
}

function keywordChecklist(items: string[]) {
  return uniqueNonEmpty(
    items
      .flatMap((item) => item.toLowerCase().split(/[^a-z0-9]+/))
      .filter((token) => token.length >= 5)
      .slice(0, 8),
  )
}

export function buildNormalizedCase(draft: ImportedCaseDraft, index: number): CaseSummary {
  const categoryInfo = categoryMap[draft.category] ?? { subspecialty: draft.subspecialty, prefix: 'IMP' }
  const code = `${categoryInfo.prefix}-${String(index + 1).padStart(3, '0')}`
  const observationChecklist = keywordChecklist(draft.findings)
  const synthesisChecklist = keywordChecklist(draft.differential.length ? draft.differential : [draft.teachingPoint])
  const managementChecklist = keywordChecklist(draft.management)

  return {
    id: `imported-case-${draft.id}`,
    code,
    title: draft.title,
    subspecialty: draft.subspecialty,
    modality: draft.modality,
    difficulty: inferDifficulty(`${draft.overallDiscussion} ${draft.sourceExcerpt}`),
    duration: '12 min',
    objective: draft.objective,
    vignette: draft.clinicalContext,
    history: draft.clinicalContext,
    findings: draft.findings.length ? draft.findings : ['Review imported source text and refine findings before exam use.'],
    differential: draft.differential.length ? draft.differential : ['Imported source did not cleanly resolve a ranked differential.'],
    management: draft.management.length ? draft.management : ['Review imported source and add a recommendation before using this case live.'],
    examinerOpening: `Start with the most important imaging finding in ${draft.title}, then give your leading diagnosis and next-step recommendation.`,
    hiddenDiagnosis: draft.differential[0] ?? draft.teachingPoint,
    keyTeachingPoint: draft.teachingPoint,
    candidateTasks: draft.candidateTasks,
    observationChecklist,
    synthesisChecklist,
    managementChecklist,
    examinerPrompts: {
      interpretation: 'Tighten the imaging description and prioritize the most exam-relevant abnormalities.',
      differential: 'Now rank the diagnosis and defend the leading choice.',
      management: 'Give the recommendation, urgency, and who needs the result.',
      closing: 'Close with a concise radiologist-style impression and recommendation.',
    },
    examinerCues: [
      { when: 'opening', text: 'Imported draft, review completed before live use.' },
      { when: 'after-interpretation', text: 'Push for disciplined oral-board description.' },
      { when: 'after-differential', text: 'Require ranking, not a loose list.' },
      { when: 'after-management', text: 'Demand a concrete next step.' },
    ],
    sampleAnswerFrame: ['Observation', 'Synthesis', 'Management'],
    practicalNotes: [
      `Imported from PDF pages ${draft.sourcePages.join(', ')} via ${PARSER_VERSION}.`,
      `Confidence ${(draft.confidence * 100).toFixed(0)}%. Faculty review recommended before relying on this case.`,
    ],
  }
}

function chunkCases(pages: ParsedPage[]) {
  const chunks: ParsedCaseChunk[] = []
  let current: ParsedCaseChunk | null = null
  let currentCategory: string | null = null

  for (const page of pages) {
    if (!page.text || /Index of Oral Exam Categories/i.test(page.text)) continue

    const chunkStart = parseChunkStart(page.text, currentCategory)
    if (chunkStart) {
      currentCategory = chunkStart.category
      if (current) chunks.push(current)
      current = {
        category: chunkStart.category,
        title: chunkStart.title,
        pages: [page.pageNumber],
        text: page.text,
      }
      continue
    }

    const detected = detectCategory(page.text)
    if (detected) currentCategory = detected

    if (current) {
      current.pages.push(page.pageNumber)
      current.text = `${current.text}\n${page.text}`
    }
  }

  if (current) chunks.push(current)
  return chunks
}

async function extractPdfPagesFromBytes(data: Uint8Array) {
  const pdf = await getDocument({ data }).promise
  const pages: ParsedPage[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normalizeWhitespace(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
    pages.push({ pageNumber, text })
  }

  return { pages, pageCount: pdf.numPages }
}

export async function importCasesFromPdf(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const { pages, pageCount } = await extractPdfPagesFromBytes(new Uint8Array(buffer))
  return buildImportResult(file.name, pages, pageCount)
}

export async function importCasesFromPdfBytes(fileName: string, bytes: Uint8Array): Promise<ImportResult> {
  const { pages, pageCount } = await extractPdfPagesFromBytes(bytes)
  return buildImportResult(fileName, pages, pageCount)
}

function buildImportResult(fileName: string, pages: ParsedPage[], pageCount: number): ImportResult {
  const document: ImportedDocumentSummary = {
    id: crypto.randomUUID(),
    fileName,
    importedAt: new Date().toISOString(),
    pageCount,
    parserVersion: PARSER_VERSION,
    sourceLabel: fileName,
  }

  const chunks = chunkCases(pages)

  const drafts = chunks.map((chunk, index) => {
    const sentences = toSentenceList(chunk.text)
    const overallMatch = chunk.text.match(/Overall:\s*(.+)$/i)
    const overallDiscussion = cleanSentence(overallMatch?.[1] ?? '')
    const findings = extractSentenceBucket(sentences, [/identify/i, /describe/i, /recognize/i, /note/i], 4)
    const differential = extractSentenceBucket(sentences, [/differential/i, /diagnos/i, /favor/i, /exclude/i, /distinguish/i], 4)
    const management = extractSentenceBucket(sentences, [/recommend/i, /management/i, /return to screening/i, /treatment/i, /consult/i, /biopsy/i, /MRI/i, /CT/i], 4)
    const objective = overallDiscussion || cleanSentence(sentences.find((sentence) => /candidate should/i.test(sentence)) ?? 'Imported for structured review.')
    const clinicalContext = inferClinicalContext(chunk.text)
    const modality = inferModality(chunk.text)
    const teachingPoint = overallDiscussion || differential[0] || findings[0] || 'Imported case draft requires faculty review.'
    const confidence = Math.min(0.95, 0.35 + chunk.pages.length * 0.08 + (overallDiscussion ? 0.2 : 0) + (findings.length + differential.length + management.length) * 0.03)

    const draft: ImportedCaseDraft = {
      id: crypto.randomUUID(),
      documentId: document.id,
      status: 'draft',
      sourceTitle: chunk.title,
      title: chunk.title,
      category: chunk.category,
      subspecialty: categoryMap[chunk.category]?.subspecialty ?? chunk.category,
      modality,
      clinicalContext,
      objective,
      findings,
      differential,
      management,
      teachingPoint,
      overallDiscussion,
      candidateTasks: buildCandidateTasks(findings, differential, management),
      sourceExcerpt: chunk.text.slice(0, 2400),
      sourcePages: chunk.pages,
      reviewNotes: '',
      confidence,
    }

    draft.normalizedCase = buildNormalizedCase(draft, index)
    return draft
  })

  return { document, drafts }
}
