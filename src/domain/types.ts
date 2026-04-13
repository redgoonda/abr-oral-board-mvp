export type ScreenKey = 'dashboard' | 'library' | 'session' | 'debrief' | 'faculty'

export type Difficulty = 'Junior' | 'Standard' | 'Advanced'
export type SessionStatus = 'idle' | 'in_progress' | 'completed'
export type SessionPhase = 'opening' | 'interpretation' | 'differential' | 'management' | 'closing' | 'debrief'
export type Speaker = 'Examiner' | 'Learner' | 'System'

export interface ExaminerCue {
  when: 'opening' | 'after-interpretation' | 'after-differential' | 'after-management'
  text: string
}

export interface CaseSummary {
  id: string
  code: string
  title: string
  subspecialty: string
  modality: string
  difficulty: Difficulty
  duration: string
  objective: string
  vignette: string
  history: string
  findings: string[]
  differential: string[]
  management: string[]
  examinerOpening: string
  hiddenDiagnosis: string
  keyTeachingPoint: string
  candidateTasks: string[]
  observationChecklist: string[]
  synthesisChecklist: string[]
  managementChecklist: string[]
  examinerPrompts: Partial<Record<Exclude<SessionPhase, 'debrief'>, string>>
  examinerCues: ExaminerCue[]
  sampleAnswerFrame: string[]
  practicalNotes?: string[]
}

export interface TranscriptTurn {
  id: string
  speaker: Speaker
  text: string
  phase: SessionPhase
  timestamp: string
}

export interface SessionScore {
  label: string
  score: number
  note: string
}

export interface SessionDebrief {
  disposition: 'Pass' | 'Borderline' | 'Needs work'
  summary: string
  strongAnswer: string
  nextSteps: string[]
  scoreBreakdown: SessionScore[]
  overallScore: number
  criticalMisses: number
}

export interface OralSession {
  id: string
  caseId: string
  candidateName: string
  status: SessionStatus
  phase: SessionPhase
  startedAt: string
  updatedAt: string
  revealedFacts: string[]
  transcript: TranscriptTurn[]
  draftResponse: string
  turnCount: number
  examinerConsistencyNote: string
  phaseGuidance: string
  debrief?: SessionDebrief
}

export interface SessionStartRequest {
  caseId: string
  candidateName: string
}

export interface SubmitTurnRequest {
  sessionId: string
  response: string
}

export interface SessionEnvelope {
  caseItem: CaseSummary
  session: OralSession
}
