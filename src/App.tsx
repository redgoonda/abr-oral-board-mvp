import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { CaseSummary, ScreenKey, SessionEnvelope } from './domain/types'
import { createSession, getActiveSession, listCases, resetSession, submitTurn } from './runtime/api'

const weakAreas = [
  'Urgent chest communication',
  'Ranked differentials under pressure',
  'Board-style report closing statements',
]

const assignedCases = [
  { title: 'ABR-style emergency drill', due: 'Due tomorrow 07:00', count: 3 },
  { title: 'Breast and MSK staging set', due: 'Due Apr 16', count: 2 },
]

function App() {
  const [screen, setScreen] = useState<ScreenKey>('dashboard')
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string>('')
  const [sessionEnvelope, setSessionEnvelope] = useState<SessionEnvelope | null>(null)
  const [draftResponse, setDraftResponse] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function hydrate() {
      try {
        const [items, active] = await Promise.all([listCases(), getActiveSession()])
        setCases(items)
        setSelectedCaseId(active?.caseItem.id ?? items[0]?.id ?? '')
        setSessionEnvelope(active)
        if (active?.session.status === 'completed') setScreen('debrief')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load runtime state')
      } finally {
        setLoading(false)
      }
    }

    void hydrate()
  }, [])

  const activeCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) ?? cases[0] ?? null,
    [cases, selectedCaseId],
  )

  const runtimeCase = sessionEnvelope?.caseItem ?? activeCase
  const transcript = sessionEnvelope?.session.transcript ?? []

  async function handleStart(caseId: string) {
    try {
      setBusy(true)
      setError(null)
      const nextSession = await createSession({ caseId, candidateName: 'KB Resident' })
      setSessionEnvelope(nextSession)
      setSelectedCaseId(caseId)
      setDraftResponse('')
      setScreen('session')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start session')
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit() {
    if (!sessionEnvelope || !draftResponse.trim()) return
    try {
      setBusy(true)
      setError(null)
      const nextSession = await submitTurn({ sessionId: sessionEnvelope.session.id, response: draftResponse.trim() })
      setSessionEnvelope(nextSession)
      setDraftResponse('')
      setScreen(nextSession.session.status === 'completed' ? 'debrief' : 'session')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit turn')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    await resetSession()
    setSessionEnvelope(null)
    setDraftResponse('')
    setScreen('dashboard')
  }

  if (loading || !activeCase) {
    return <div className="loading-shell">Loading ABR runtime...</div>
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">ABR Oral Board AI</p>
          <h1>Radiologist examiner training, not chatbot cosplay.</h1>
          <p className="muted">Expanded with ABR-style case cadence, stricter examiner behavior, and a stronger text-first oral flow.</p>
        </div>

        <nav className="nav">
          {[
            ['dashboard', 'Learner dashboard'],
            ['library', 'Case library'],
            ['session', 'Live session'],
            ['debrief', 'Debrief'],
            ['faculty', 'Faculty review'],
          ].map(([key, label]) => (
            <button key={key} className={screen === key ? 'nav-item active' : 'nav-item'} onClick={() => setScreen(key as ScreenKey)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <div className="status-line"><span className="status-dot" />Runtime {sessionEnvelope ? sessionEnvelope.session.status.replace('_', ' ') : 'ready'}</div>
          <strong>{sessionEnvelope ? `${sessionEnvelope.session.candidateName} · ${sessionEnvelope.caseItem.code}` : 'No active session'}</strong>
          <p className="muted small-copy">AI role locked: radiologist examiner</p>
          <p className="muted small-copy">{sessionEnvelope?.session.examinerConsistencyNote ?? 'Examiner flow mirrors ABR-style probing.'}</p>
        </div>
      </aside>

      <main className="main">
        <Header sessionEnvelope={sessionEnvelope} cases={cases} />
        {error && <div className="error-banner">{error}</div>}
        {screen === 'dashboard' && <Dashboard activeCase={activeCase} onStart={handleStart} busy={busy} cases={cases} />}
        {screen === 'library' && <CaseLibrary activeCaseId={selectedCaseId} cases={cases} onSelect={setSelectedCaseId} onStart={handleStart} busy={busy} />}
        {screen === 'session' && <LiveSession activeCase={runtimeCase ?? activeCase} sessionEnvelope={sessionEnvelope} draftResponse={draftResponse} onDraftChange={setDraftResponse} onSubmit={handleSubmit} onReset={handleReset} busy={busy} transcriptCount={transcript.length} />}
        {screen === 'debrief' && <Debrief activeCase={runtimeCase ?? activeCase} sessionEnvelope={sessionEnvelope} onRestart={handleReset} />}
        {screen === 'faculty' && <FacultyReview activeCase={runtimeCase ?? activeCase} sessionEnvelope={sessionEnvelope} />}
      </main>
    </div>
  )
}

function Header({ sessionEnvelope, cases }: { sessionEnvelope: SessionEnvelope | null; cases: CaseSummary[] }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">MVP status</p>
        <h2>{sessionEnvelope ? 'Live oral simulation active' : 'ABR-style text runtime expanded'}</h2>
      </div>
      <div className="topbar-meta">
        <div>
          <span className="meta-label">Current phase</span>
          <strong>{sessionEnvelope ? sessionEnvelope.session.phase : 'ABR-style sequence online'}</strong>
        </div>
        <div>
          <span className="meta-label">Case bank</span>
          <strong>{cases.length} seeded cases</strong>
        </div>
      </div>
    </header>
  )
}

function Dashboard({ activeCase, onStart, busy, cases }: { activeCase: CaseSummary; onStart: (caseId: string) => Promise<void>; busy: boolean; cases: CaseSummary[] }) {
  return (
    <section className="screen-grid two-up">
      <div className="panel hero-panel">
        <p className="eyebrow">Recommended next case</p>
        <h3>{activeCase.title}</h3>
        <p>{activeCase.objective}</p>
        <div className="pill-row">
          <span className="pill">{activeCase.subspecialty}</span>
          <span className="pill">{activeCase.modality}</span>
          <span className="pill">{activeCase.duration}</span>
        </div>
        <button className="primary-btn" disabled={busy} onClick={() => void onStart(activeCase.id)}>{busy ? 'Launching...' : 'Start oral simulation'}</button>
      </div>

      <div className="panel">
        <p className="eyebrow">Weak areas</p>
        <ul className="clean-list">{weakAreas.map((area) => <li key={area}>{area}</li>)}</ul>
      </div>

      <div className="panel">
        <p className="eyebrow">Assigned cases</p>
        {assignedCases.map((assignment) => (
          <div key={assignment.title} className="stack-row">
            <div>
              <strong>{assignment.title}</strong>
              <p className="muted">{assignment.count} cases</p>
            </div>
            <span className="pill subtle">{assignment.due}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <p className="eyebrow">What changed</p>
        <div className="score-list compact-grid">
          <div className="detail-block"><strong>{cases.length} cases</strong><p className="muted">Broader sample bank across neuro, abdomen, MSK, chest, and breast.</p></div>
          <div className="detail-block"><strong>Stricter examiner</strong><p className="muted">Probing, role-consistent radiologist flow instead of tutoring drift.</p></div>
          <div className="detail-block"><strong>ABR-style cadence</strong><p className="muted">Finding, ranked differential, recommendation, closing statement.</p></div>
        </div>
      </div>
    </section>
  )
}

function CaseLibrary({ activeCaseId, cases, onSelect, onStart, busy }: { activeCaseId: string; cases: CaseSummary[]; onSelect: (caseId: string) => void; onStart: (caseId: string) => Promise<void>; busy: boolean }) {
  return (
    <section className="screen-grid">
      <div className="panel filter-bar">
        {['Neuro', 'Chest', 'Abdomen', 'MSK', 'Breast'].map((label) => <span key={label} className="pill">{label}</span>)}
        <span className="pill subtle">ABR-style seeded flow</span>
      </div>

      <div className="case-list">
        {cases.map((item) => (
          <article key={item.id} className={item.id === activeCaseId ? 'panel case-card active-case' : 'panel case-card'}>
            <div className="case-card-head">
              <div>
                <p className="eyebrow">{item.code}</p>
                <h3>{item.title}</h3>
              </div>
              <span className="pill">{item.difficulty}</span>
            </div>
            <p>{item.objective}</p>
            <div className="pill-row">
              <span className="pill subtle">{item.subspecialty}</span>
              <span className="pill subtle">{item.modality}</span>
              <span className="pill subtle">{item.duration}</span>
            </div>
            <p className="muted">{item.vignette}</p>
            <div className="detail-block">
              <span className="meta-label">Expected oral shape</span>
              <p>{item.sampleAnswerFrame.join(' → ')}</p>
            </div>
            <div className="split-actions">
              <button className="secondary-btn" onClick={() => onSelect(item.id)}>Preview setup</button>
              <button className="primary-btn" disabled={busy} onClick={() => void onStart(item.id)}>{busy ? 'Starting...' : 'Launch'}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function LiveSession({ activeCase, sessionEnvelope, draftResponse, onDraftChange, onSubmit, onReset, busy, transcriptCount }: { activeCase: CaseSummary; sessionEnvelope: SessionEnvelope | null; draftResponse: string; onDraftChange: (value: string) => void; onSubmit: () => Promise<void>; onReset: () => Promise<void>; busy: boolean; transcriptCount: number }) {
  return (
    <section className="live-layout">
      <div className="panel column-panel">
        <div className="stack-row">
          <div>
            <p className="eyebrow">{activeCase.code}</p>
            <h3>{activeCase.title}</h3>
          </div>
          <span className="timer">{String(transcriptCount).padStart(2, '0')} turns</span>
        </div>
        <div className="detail-block">
          <span className="meta-label">History</span>
          <p>{activeCase.history}</p>
        </div>
        <div className="detail-block">
          <span className="meta-label">Candidate vignette</span>
          <p>{activeCase.vignette}</p>
        </div>
        <div className="detail-block">
          <span className="meta-label">Candidate tasks</span>
          <ul className="clean-list compact">
            {activeCase.candidateTasks.map((task) => <li key={task}>{task}</li>)}
          </ul>
        </div>
        <div className="detail-block">
          <span className="meta-label">Revealed facts</span>
          <ul className="clean-list compact">
            {(sessionEnvelope?.session.revealedFacts ?? activeCase.findings.slice(0, 1)).map((finding) => <li key={finding}>{finding}</li>)}
          </ul>
        </div>
        <div className="session-controls">
          <span className="pill">Phase: {sessionEnvelope?.session.phase ?? 'opening'}</span>
          <span className="pill subtle">{sessionEnvelope?.session.phaseGuidance ?? 'Start with the actionable finding.'}</span>
        </div>
      </div>

      <div className="panel viewer-panel">
        <div className="viewer-header">
          <div>
            <p className="eyebrow">Examiner flow</p>
            <h3>ABR-style progression</h3>
          </div>
          <div className="pill-row">
            <span className="pill subtle">Role locked</span>
            <span className="pill subtle">Radiologist examiner</span>
          </div>
        </div>
        <div className="viewer-canvas">
          <div className="scan-frame runtime-frame">
            <div>
              <span className="meta-label">Expected answer frame</span>
              <p>{activeCase.sampleAnswerFrame.join(' → ')}</p>
            </div>
            <div>
              <span className="meta-label">Hidden diagnosis</span>
              <p>{activeCase.hiddenDiagnosis}</p>
            </div>
            <div>
              <span className="meta-label">Teaching point</span>
              <p>{activeCase.keyTeachingPoint}</p>
            </div>
          </div>
          <div className="viewer-overlay">
            <span>{activeCase.modality}</span>
            <span>{activeCase.subspecialty}</span>
          </div>
        </div>
      </div>

      <div className="panel column-panel">
        <div className="stack-row">
          <div>
            <p className="eyebrow">Examiner transcript</p>
            <h3>Strict radiologist examiner</h3>
          </div>
          <span className="status-chip">{sessionEnvelope ? 'Connected' : 'Idle'}</span>
        </div>
        <div className="transcript-list">
          {(sessionEnvelope?.session.transcript ?? []).map((turn) => (
            <div key={turn.id} className={turn.speaker === 'Examiner' ? 'bubble examiner' : turn.speaker === 'Learner' ? 'bubble learner' : 'bubble system'}>
              <span className="meta-label">{turn.speaker} · {turn.phase}</span>
              <p>{turn.text}</p>
            </div>
          ))}
        </div>
        <div className="input-card">
          <span className="meta-label">Text submission</span>
          <textarea className="text-input" value={draftResponse} onChange={(event) => onDraftChange(event.target.value)} placeholder={sessionEnvelope ? 'Enter a concise oral-board answer here...' : 'Start a session from the dashboard or library first.'} disabled={!sessionEnvelope || sessionEnvelope.session.status === 'completed' || busy} />
          <div className="split-actions">
            <button className="secondary-btn" onClick={() => void onReset()}>Reset practice</button>
            <button className="primary-btn" disabled={!sessionEnvelope || !draftResponse.trim() || busy} onClick={() => void onSubmit()}>{busy ? 'Submitting...' : 'Submit turn'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function Debrief({ activeCase, sessionEnvelope, onRestart }: { activeCase: CaseSummary; sessionEnvelope: SessionEnvelope | null; onRestart: () => Promise<void> }) {
  const debrief = sessionEnvelope?.session.debrief
  return (
    <section className="screen-grid two-up">
      <div className="panel hero-panel success">
        <p className="eyebrow">Result</p>
        <h3>{debrief ? `${debrief.disposition}, with targeted coaching` : 'No completed session yet'}</h3>
        <p>{debrief?.summary ?? 'Complete a live simulation to generate a debrief.'}</p>
        <div className="pill-row">
          <span className="pill">Overall score {debrief?.overallScore ?? '--'}</span>
          <span className="pill">Critical misses {debrief?.criticalMisses ?? '--'}</span>
          <span className="pill">Case {activeCase.code}</span>
        </div>
        <button className="secondary-btn" onClick={() => void onRestart()}>Clear and restart</button>
      </div>

      <div className="panel">
        <p className="eyebrow">Strong candidate answer</p>
        <p>{debrief?.strongAnswer ?? 'Awaiting completed session output.'}</p>
      </div>

      <div className="panel">
        <p className="eyebrow">Competency breakdown</p>
        <div className="score-list">
          {(debrief?.scoreBreakdown ?? []).map((score) => (
            <div key={score.label} className="score-row">
              <div>
                <strong>{score.label}</strong>
                <p className="muted">{score.note}</p>
              </div>
              <span>{score.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">Next steps</p>
        <ul className="clean-list compact">{(debrief?.nextSteps ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="detail-block">
          <span className="meta-label">Recommended follow-up case</span>
          <p>{activeCase.title}</p>
        </div>
      </div>
    </section>
  )
}

function FacultyReview({ activeCase, sessionEnvelope }: { activeCase: CaseSummary; sessionEnvelope: SessionEnvelope | null }) {
  const debrief = sessionEnvelope?.session.debrief
  return (
    <section className="screen-grid two-up">
      <div className="panel">
        <p className="eyebrow">Session oversight</p>
        <h3>{sessionEnvelope?.session.candidateName ?? 'KB Resident'} · PGY-5 · {activeCase.code}</h3>
        <div className="score-row"><span className="meta-label">AI disposition</span><strong>{debrief?.disposition ?? 'Pending'}</strong></div>
        <div className="score-row"><span className="meta-label">Session status</span><strong>{sessionEnvelope?.session.status ?? 'idle'}</strong></div>
        <div className="detail-block">
          <span className="meta-label">Governance notes</span>
          <p>{sessionEnvelope?.session.examinerConsistencyNote ?? 'Examiner stays in role, probes, and avoids tutoring drift.'}</p>
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">Calibration prompt</p>
        <div className="detail-block">
          <span className="meta-label">Faculty question</span>
          <p>Did the learner identify the imaging finding, rank the diagnosis, and state the recommendation like a radiologist under oral-board pressure?</p>
        </div>
        <div className="detail-block">
          <span className="meta-label">Case answer frame</span>
          <p>{activeCase.sampleAnswerFrame.join(' → ')}</p>
        </div>
      </div>

      <div className="panel span-two">
        <p className="eyebrow">Transcript audit</p>
        <div className="transcript-list faculty-transcript">
          {(sessionEnvelope?.session.transcript ?? []).map((turn) => (
            <div key={`faculty-${turn.id}`} className={turn.speaker === 'Examiner' ? 'bubble examiner' : turn.speaker === 'Learner' ? 'bubble learner' : 'bubble system'}>
              <span className="meta-label">{turn.speaker} · {turn.phase}</span>
              <p>{turn.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default App
