import type { SessionEnvelope, SessionStartRequest, SubmitTurnRequest } from '../domain/types'
import { seededCases } from './mockData'
import { startMockSession, submitMockTurn } from './sessionEngine'

let activeSession: SessionEnvelope | null = null

function wait(ms = 250) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function listCases() {
  await wait(120)
  return seededCases
}

export async function getActiveSession() {
  await wait(80)
  return activeSession
}

export async function createSession(request: SessionStartRequest) {
  await wait()
  activeSession = startMockSession(request)
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
