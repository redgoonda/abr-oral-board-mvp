import type { CaseSummary, OralSession, SessionDebrief, SessionEnvelope, SessionPhase, SessionStartRequest, SubmitTurnRequest, TranscriptTurn } from '../domain/types'
import { defaultDebrief, seededCases } from './mockData'

const phaseOrder: SessionPhase[] = ['opening', 'interpretation', 'differential', 'management', 'closing', 'debrief']

const fallbackPromptByPhase: Record<Exclude<SessionPhase, 'debrief'>, string> = {
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

function rubricHits(caseItem: CaseSummary, transcript: TranscriptTurn[]) {
  const learnerText = transcript
    .filter((turn) => turn.speaker === 'Learner')
    .map((turn) => turn.text.toLowerCase())
    .join(' ')

  const hitCount = (items: string[]) => items.filter((item) => learnerText.includes(item.toLowerCase().split(/[(),]/)[0])).length

  return {
    observation: hitCount(caseItem.observationChecklist),
    synthesis: hitCount(caseItem.synthesisChecklist),
    management: hitCount(caseItem.managementChecklist),
  }
}

function buildDebrief(caseItem: CaseSummary, transcript: TranscriptTurn[]): SessionDebrief {
  const hits = rubricHits(caseItem, transcript)
  const observationScore = Math.min(5, 3.4 + hits.observation * 0.4)
  const synthesisScore = Math.min(5, 3.2 + hits.synthesis * 0.45)
  const managementScore = Math.min(5, 3.2 + hits.management * 0.5)
  const communicationScore = 4.1
  const overallScore = Math.round(((observationScore + synthesisScore + managementScore + communicationScore) / 20) * 100)

  return {
    ...defaultDebrief,
    disposition: overallScore >= 84 ? 'Pass' : overallScore >= 76 ? 'Borderline' : 'Needs work',
    summary: `Case ${caseItem.code}: ${caseItem.keyTeachingPoint} Observation, synthesis, and management were scored using the MVP oral-board rubric shape.`,
    strongAnswer: `Most likely diagnosis: ${caseItem.hiddenDiagnosis} Key recommendation: ${caseItem.management[0]}; ${caseItem.management[1].toLowerCase()}.`,
    overallScore,
    scoreBreakdown: [
      {
        label: 'Observation',
        score: observationScore,
        note: `Hit ${hits.observation}/${caseItem.observationChecklist.length} core observation elements.`,
      },
      {
        label: 'Synthesis',
        score: synthesisScore,
        note: `Hit ${hits.synthesis}/${caseItem.synthesisChecklist.length} synthesis elements.`,
      },
      {
        label: 'Management',
        score: managementScore,
        note: `Hit ${hits.management}/${caseItem.managementChecklist.length} management elements.`,
      },
      {
        label: 'Communication',
        score: communicationScore,
        note: 'Maintained concise oral-board style communication.',
      },
    ],
    nextSteps: [
      `Repeat ${caseItem.subspecialty.toLowerCase()} with a fresh case.`,
      'State your top diagnosis in the first sentence.',
      'Close with one explicit next-step recommendation.',
    ],
    criticalMisses: hits.management > 0 ? 0 : 1,
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

  const examinerPrompt = current.caseItem.examinerPrompts[next] ?? fallbackPromptByPhase[next]
  const examinerTurn = createTurn('Examiner', next, examinerPrompt)

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
