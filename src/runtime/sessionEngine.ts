import type { CaseSummary, OralSession, SessionDebrief, SessionEnvelope, SessionPhase, SessionStartRequest, SubmitTurnRequest, TranscriptTurn } from '../domain/types'
import { defaultDebrief, seededCases } from './mockData'

const phaseOrder: SessionPhase[] = ['opening', 'interpretation', 'differential', 'management', 'closing', 'debrief']

const promptByPhase: Record<Exclude<SessionPhase, 'debrief'>, string> = {
  opening: 'Good start. Now anchor your interpretation in the key imaging abnormality.',
  interpretation: 'Tighten it up. Give me your ranked differential and tell me why the top choice wins.',
  differential: 'Now commit to management. Who are you calling and what is the time-sensitive risk?',
  management: 'Before we close, tell me the one teaching pearl you would want a junior resident to remember.',
  closing: 'Session complete. I am generating your debrief now.',
}

function nowIso() {
  return new Date().toISOString()
}

function createTurn(speaker: TranscriptTurn['speaker'], phase: SessionPhase, text: string): TranscriptTurn {
  return {
    id: crypto.randomUUID(),
    speaker,
    phase,
    text,
    timestamp: nowIso(),
  }
}

function getCase(caseId: string): CaseSummary {
  const caseItem = seededCases.find((item) => item.id === caseId)
  if (!caseItem) throw new Error(`Case not found: ${caseId}`)
  return caseItem
}

function nextPhase(current: SessionPhase): SessionPhase {
  const currentIndex = phaseOrder.indexOf(current)
  return phaseOrder[Math.min(currentIndex + 1, phaseOrder.length - 1)]
}

function buildDebrief(caseItem: CaseSummary, transcript: TranscriptTurn[]): SessionDebrief {
  const learnerTurns = transcript.filter((turn) => turn.speaker === 'Learner')
  const mentionedManagement = learnerTurns.some((turn) => /urgent|call|activate|consult|escalat/i.test(turn.text))
  const mentionedDifferential = learnerTurns.some((turn) => /differential|consider|versus|likely|most likely/i.test(turn.text))
  const overallScore = 78 + (mentionedManagement ? 4 : 0) + (mentionedDifferential ? 2 : 0)

  return {
    ...defaultDebrief,
    disposition: overallScore >= 84 ? 'Pass' : 'Borderline',
    summary: `Case ${caseItem.code}: ${caseItem.keyTeachingPoint} ${mentionedManagement ? 'You were decisive about escalation.' : 'Push harder on explicit escalation language.'}`,
    strongAnswer: `Leading diagnosis: ${caseItem.hiddenDiagnosis} ${caseItem.management[0]}. ${caseItem.management[1]}.`,
    overallScore,
    scoreBreakdown: defaultDebrief.scoreBreakdown.map((item) => {
      if (item.label === 'Differential' && mentionedDifferential) return { ...item, score: 4.2, note: 'Ranked alternatives more explicitly.' }
      if (item.label === 'Management' && mentionedManagement) return { ...item, score: 4.8, note: 'Named the escalation path clearly.' }
      return item
    }),
    nextSteps: [
      `Repeat ${caseItem.subspecialty.toLowerCase()} with a fresh case.`,
      'State your top diagnosis in the first sentence.',
      'End with one explicit action recommendation.',
    ],
    criticalMisses: mentionedManagement ? 0 : 1,
  }
}

export function startMockSession(request: SessionStartRequest): SessionEnvelope {
  const caseItem = getCase(request.caseId)
  const startedAt = nowIso()
  const session: OralSession = {
    id: crypto.randomUUID(),
    caseId: caseItem.id,
    candidateName: request.candidateName,
    status: 'in_progress',
    phase: 'opening',
    startedAt,
    updatedAt: startedAt,
    revealedFacts: [caseItem.findings[0]],
    draftResponse: '',
    transcript: [createTurn('Examiner', 'opening', caseItem.examinerOpening)],
  }

  return { caseItem, session }
}

export function submitMockTurn(current: SessionEnvelope, request: SubmitTurnRequest): SessionEnvelope {
  if (current.session.id !== request.sessionId) {
    throw new Error('Session mismatch')
  }

  const currentPhase = current.session.phase
  const learnerTurn = createTurn('Learner', currentPhase, request.response)
  const next = nextPhase(currentPhase)
  const transcript = [...current.session.transcript, learnerTurn]
  const revealedFacts = current.caseItem.findings.slice(0, Math.min(current.caseItem.findings.length, transcript.filter((turn) => turn.speaker === 'Learner').length + 1))

  if (next === 'debrief') {
    const debrief = buildDebrief(current.caseItem, transcript)
    return {
      caseItem: current.caseItem,
      session: {
        ...current.session,
        updatedAt: nowIso(),
        status: 'completed',
        phase: 'debrief',
        draftResponse: '',
        revealedFacts,
        transcript: [...transcript, createTurn('System', 'debrief', 'Debrief ready.')],
        debrief,
      },
    }
  }

  const examinerTurn = createTurn('Examiner', next, promptByPhase[next],)

  return {
    caseItem: current.caseItem,
    session: {
      ...current.session,
      updatedAt: nowIso(),
      phase: next,
      revealedFacts,
      draftResponse: '',
      transcript: [...transcript, examinerTurn],
    },
  }
}
