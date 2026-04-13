import type {
  ImportResult,
  ImportedCaseDraft,
  SessionEnvelope,
  SessionStartRequest,
  SubmitTurnRequest,
} from '../domain/types'
import { seededCases } from './mockData'
import { buildNormalizedCase, importCasesFromPdf } from './importer'
import { startMockSession, submitMockTurn } from './sessionEngine'

let activeSession: SessionEnvelope | null = null
let importedDrafts: ImportedCaseDraft[] = []
let approvedCases = [] as typeof seededCases

function wait(ms = 250) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function listCases() {
  await wait(120)
  return [...seededCases, ...approvedCases]
}

export async function listImportedDrafts() {
  await wait(100)
  return importedDrafts
}

export async function getActiveSession() {
  await wait(80)
  return activeSession
}

export async function createSession(request: SessionStartRequest) {
  await wait()
  activeSession = startMockSession(request, [...seededCases, ...approvedCases])
  return activeSession
}

export async function submitTurn(request: SubmitTurnRequest) {
  if (!activeSession) throw new Error('No active session')
  await wait()
  activeSession = submitMockTurn(activeSession, request)
  return activeSession
}

export async function resetSession() {
  await wait(80)
  activeSession = null
}

export async function importPdf(file: File): Promise<ImportResult> {
  await wait(120)
  const result = await importCasesFromPdf(file)
  importedDrafts = [...result.drafts, ...importedDrafts]
  return result
}

export async function updateImportedDraft(nextDraft: ImportedCaseDraft) {
  await wait(80)
  const draftIndex = importedDrafts.findIndex((draft) => draft.id === nextDraft.id)
  const normalizedCase = buildNormalizedCase(nextDraft, Math.max(draftIndex, 0))
  const hydratedDraft = { ...nextDraft, normalizedCase }
  importedDrafts = importedDrafts.map((draft) => (draft.id === hydratedDraft.id ? hydratedDraft : draft))
  return hydratedDraft
}

export async function approveImportedDraft(draftId: string) {
  await wait(80)
  const draft = importedDrafts.find((item) => item.id === draftId)
  if (!draft?.normalizedCase) throw new Error('Draft not found or not normalized')

  const normalizedCase = draft.normalizedCase
  importedDrafts = importedDrafts.map((item) => (item.id === draftId ? { ...item, status: 'approved', normalizedCase } : item))
  approvedCases = [...approvedCases.filter((item) => item.id !== normalizedCase.id), normalizedCase]

  return normalizedCase
}
