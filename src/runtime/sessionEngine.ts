import type { CaseSummary, OralSession, SessionDebrief, SessionEnvelope, SessionPhase, SessionStartRequest, SubmitTurnRequest, TranscriptTurn } from '../domain/types'
import { defaultDebrief, seededCases } from './mockData'

const phaseOrder: SessionPhase[] = ['opening', 'interpretation', 'differential', 'management', 'closing', 'debrief']

const fallbackPromptByPhase: Record<Exclude<SessionPhase, 'debrief'>, string> = {
  opening: 'Good. Now tighten your interpretation around the key imaging abnormality.',
  interpretation: 'Now rank the differential. Give me the top diagnosis and one reasonable alternative.',
  differential: 'Commit to management. What is your recommendation and who needs to know now?',
  management: 'Close with a concise radiologist-style impression and next step.',
  closing: 'Session complete. Debrief is ready.',
}

const phaseGuidanceByPhase: Record<Exclude<SessionPhase, 'debrief'>, string> = {
  opening: 'Start with the biggest imaging finding, then give a clean board-style orientation sentence.',
  interpretation: 'Describe the image findings like a radiologist examiner expects, short and specific.',
  differential: 'Rank the diagnosis. Do not give a loose list.',
  management: 'Give the next action, urgency, and who needs to be contacted.',
  closing: 'End with a report-style impression and recommendation.',
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

function learnerTurns(transcript: TranscriptTurn[]) {
  return transcript.filter((turn) => turn.speaker === 'Learner')
}

function rubricHits(caseItem: CaseSummary, transcript: TranscriptTurn[]) {
  const learnerText = learnerTurns(transcript)
    .map((turn) => turn.text.toLowerCase())
    .join(' ')

  const hitCount = (items: string[]) => items.filter((item) => learnerText.includes(item.toLowerCase())).length

  return {
    observation: hitCount(caseItem.observationChecklist),
    synthesis: hitCount(caseItem.synthesisChecklist),
    management: hitCount(caseItem.managementChecklist),
  }
}

function communicationScoreForTranscript(transcript: TranscriptTurn[]) {
  const learnerCount = Math.max(learnerTurns(transcript).length, 1)
  const conciseTurns = learnerTurns(transcript).filter((turn) => turn.text.length <= 320).length
  return Math.min(5, 3.7 + conciseTurns / learnerCount)
}

function buildDebrief(caseItem: CaseSummary, transcript: TranscriptTurn[]): SessionDebrief {
  const hits = rubricHits(caseItem, transcript)
  const observationScore = Math.min(5, 2.8 + hits.observation * 0.7)
  const synthesisScore = Math.min(5, 2.7 + hits.synthesis * 0.75)
  const managementScore = Math.min(5, 2.7 + hits.management * 0.8)
  const communicationScore = communicationScoreForTranscript(transcript)
  const overallScore = Math.round(((observationScore + synthesisScore + managementScore + communicationScore) / 20) * 100)
  const missedCriticalManagement = hits.management === 0

  return {
    ...defaultDebrief,
    disposition: overallScore >= 84 ? 'Pass' : overallScore >= 74 ? 'Borderline' : 'Needs work',
    summary: `Case ${caseItem.code}: ${caseItem.keyTeachingPoint} This debrief uses an ABR-style oral sequence of interpretation, ranked differential, and management.`,
    strongAnswer: `${caseItem.sampleAnswerFrame.join('. ')}. Leading diagnosis: ${caseItem.hiddenDiagnosis}`,
    overallScore,
    scoreBreakdown: [
      {
        label: 'Observation',
        score: observationScore,
        note: `Recognized ${hits.observation}/${caseItem.observationChecklist.length} core findings.`,
      },
      {
        label: 'Synthesis',
        score: synthesisScore,
        note: `Captured ${hits.synthesis}/${caseItem.synthesisChecklist.length} differential and reasoning elements.`,
      },
      {
        label: 'Management',
        score: managementScore,
        note: `Covered ${hits.management}/${caseItem.managementChecklist.length} management targets.`,
      },
      {
        label: 'Communication',
        score: communicationScore,
        note: 'Stayed mostly concise and role-consistent through the oral sequence.',
      },
    ],
    nextSteps: [
      `Repeat ${caseItem.subspecialty.toLowerCase()} with another case and commit to the top diagnosis earlier.`,
      'Use one sentence for the actionable finding and one sentence for the recommendation.',
      'Keep the radiologist-examiner rhythm: finding, diagnosis, recommendation.',
    ],
    criticalMisses: missedCriticalManagement ? 1 : 0,
  }
}

function revealedFactsForTurn(caseItem: CaseSummary, transcript: TranscriptTurn[]) {
  return caseItem.findings.slice(0, Math.min(caseItem.findings.length, learnerTurns(transcript).length + 1))
}

function buildExaminerPrompt(caseItem: CaseSummary, phase: Exclude<SessionPhase, 'debrief'>, transcript: TranscriptTurn[]) {
  const cueMap = {
    opening: 'opening',
    interpretation: 'after-interpretation',
    differential: 'after-differential',
    management: 'after-management',
  } as const

  const prompt = caseItem.examinerPrompts[phase] ?? fallbackPromptByPhase[phase]
  const cue = caseItem.examinerCues.find((item) => item.when === cueMap[phase as keyof typeof cueMap])
  const learnerCount = learnerTurns(transcript).length

  if (phase === 'closing') {
    return `${prompt} Keep it concise.`
  }

  return cue && learnerCount > 0 ? `${prompt} ${cue.text}` : prompt
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
    turnCount: 0,
    examinerConsistencyNote: 'Examiner remains in radiologist oral-board role, probing but not tutoring.',
    phaseGuidance: phaseGuidanceByPhase.opening,
    transcript: [
      createTurn('System', 'opening', `Case setup: ${caseItem.history}`),
      createTurn('Examiner', 'opening', caseItem.examinerOpening),
    ],
  }

  return { caseItem, session }
}

export function submitMockTurn(current: SessionEnvelope, request: SubmitTurnRequest): SessionEnvelope {
  if (current.session.id !== request.sessionId) {
    throw new Error('Session mismatch')
  }

  const currentPhase = current.session.phase
  const learnerTurn = createTurn('Learner', currentPhase, request.response)
  const transcript = [...current.session.transcript, learnerTurn]
  const revealedFacts = revealedFactsForTurn(current.caseItem, transcript)
  const next = nextPhase(currentPhase)

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
        turnCount: current.session.turnCount + 1,
        revealedFacts,
        phaseGuidance: 'Review the scored debrief and compare your answer structure to the expected oral flow.',
        transcript: [...transcript, createTurn('System', 'debrief', 'Debrief ready.')],
        debrief,
      },
    }
  }

  const examinerPrompt = buildExaminerPrompt(current.caseItem, next, transcript)
  const examinerTurn = createTurn('Examiner', next, examinerPrompt)

  return {
    caseItem: current.caseItem,
    session: {
      ...current.session,
      updatedAt: nowIso(),
      phase: next,
      turnCount: current.session.turnCount + 1,
      revealedFacts,
      draftResponse: '',
      phaseGuidance: phaseGuidanceByPhase[next],
      transcript: [...transcript, examinerTurn],
    },
  }
}
