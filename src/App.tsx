import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { CaseSummary, ImportedCaseDraft, ScreenKey, SessionEnvelope } from './domain/types'
import {
  approveImportedDraft,
  createSession,
  getActiveSession,
  importPdf,
  listCases,
  listImportedDrafts,
  resetSession,
  submitTurn,
  updateImportedDraft,
} from './runtime/api'

const weakAreas = ['Urgent chest communication', 'Ranked differentials under pressure', 'Board-style report closing statements']

const assignedCases = [
  { title: 'ABR-style emergency drill', due: 'Due tomorrow 07:00', count: 3 },
  { title: 'Breast and MSK staging set', due: 'Due Apr 16', count: 2 },
]

function App() {
  const [screen, setScreen] = useState<ScreenKey>('dashboard')
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [importedDrafts, setImportedDrafts] = useState<ImportedCaseDraft[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string>('')
  const [selectedDraftId, setSelectedDraftId] = useState<string>('')
  const [sessionEnvelope, setSessionEnvelope] = useState<SessionEnvelope | null>(null)
  const [draftResponse, setDraftResponse] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function hydrate() {
      try {
        const [items, drafts, active] = await Promise.all([listCases(), listImportedDrafts(), getActiveSession()])
        setCases(items)
        setImportedDrafts(drafts)
        setSelectedCaseId(active?.caseItem.id ?? items[0]?.id ?? '')
        setSelectedDraftId(drafts[0]?.id ?? '')
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

  const activeCase = useMemo(() => cases.find((item) => item.id === selectedCaseId) ?? cases[0] ?? null, [cases, selectedCaseId])
  const selectedDraft = useMemo(() => importedDrafts.find((item) => item.id === selectedDraftId) ?? importedDrafts[0] ?? null, [importedDrafts, selectedDraftId])
  const runtimeCase = sessionEnvelope?.caseItem ?? activeCase
  const transcript = sessionEnvelope?.session.transcript ?? []

  async function refreshCaseData() {
    const [items, drafts] = await Promise.all([listCases(), listImportedDrafts()])
    setCases(items)
    setImportedDrafts(drafts)
    setSelectedCaseId((current) => current || items[0]?.id || '')
    setSelectedDraftId((current) => current || drafts[0]?.id || '')
  }

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

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setBusy(true)
      setError(null)
      const result = await importPdf(file)
      await refreshCaseData()
      setSelectedDraftId(result.drafts[0]?.id ?? '')
      setScreen('imports')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF import failed')
    } finally {
      event.target.value = ''
      setBusy(false)
    }
  }

  async function handleDraftFieldChange(field: keyof ImportedCaseDraft, value: string) {
    if (!selectedDraft) return

    const nextDraft = { ...selectedDraft, [field]: value }
    setImportedDrafts((current) => current.map((draft) => (draft.id === nextDraft.id ? nextDraft : draft)))
    await updateImportedDraft(nextDraft)
  }

  async function handleDraftListChange(field: 'findings' | 'differential' | 'management' | 'candidateTasks', value: string) {
    await handleDraftFieldChange(field, value.split('\n').map((item) => item.trim()).filter(Boolean) as never)
  }

  async function handleApproveDraft() {
    if (!selectedDraft) return

    try {
      setBusy(true)
      setError(null)
      const approved = await approveImportedDraft(selectedDraft.id)
      await refreshCaseData()
      setSelectedCaseId(approved.id)
      setScreen('library')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve imported draft')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !activeCase) return <div className="loading-shell">Loading ABR runtime...</div>

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">ABR Oral Board AI</p>
          <h1>Radiologist examiner training, not chatbot cosplay.</h1>
          <p className="muted">Now with review-first PDF imports for turning ABR-style source docs into editable case drafts.</p>
        </div>

        <nav className="nav">
          {[
            ['dashboard', 'Learner dashboard'],
            ['library', 'Case library'],
            ['imports', 'PDF imports'],
            ['session', 'Live session'],
            ['debrief', 'Debrief'],
            ['faculty', 'Faculty review'],
          ].map(([key, label]) => (
            <button key={key} className={screen === key ? 'nav-item active' : 'nav-item'} onClick={() => setScreen(key as ScreenKey)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card stack-gap">
          <div className="status-line"><span className="status-dot" />Runtime {sessionEnvelope ? sessionEnvelope.session.status.replace('_', ' ') : 'ready'}</div>
          <strong>{sessionEnvelope ? `${sessionEnvelope.session.candidateName} · ${sessionEnvelope.caseItem.code}` : 'No active session'}</strong>
          <p className="muted small-copy">AI role locked: radiologist examiner</p>
          <p className="muted small-copy">{sessionEnvelope?.session.examinerConsistencyNote ?? 'Examiner flow mirrors ABR-style probing.'}</p>
          <label className="secondary-btn file-input-btn">
            {busy ? 'Working...' : 'Import source PDF'}
            <input type="file" accept="application/pdf" onChange={handleImport} disabled={busy} />
          </label>
        </div>
      </aside>

      <main className="main">
        <Header sessionEnvelope={sessionEnvelope} cases={cases} drafts={importedDrafts} />
        {error && <div className="error-banner">{error}</div>}
        {screen === 'dashboard' && <Dashboard activeCase={activeCase} onStart={handleStart} busy={busy} cases={cases} drafts={importedDrafts} />}
        {screen === 'library' && <CaseLibrary activeCaseId={selectedCaseId} cases={cases} onSelect={setSelectedCaseId} onStart={handleStart} busy={busy} />}
        {screen === 'imports' && (
          <ImportsScreen
            drafts={importedDrafts}
            selectedDraft={selectedDraft}
            onSelect={setSelectedDraftId}
            onFieldChange={handleDraftFieldChange}
            onListChange={handleDraftListChange}
            onApprove={handleApproveDraft}
            busy={busy}
          />
        )}
        {screen === 'session' && <LiveSession activeCase={runtimeCase ?? activeCase} sessionEnvelope={sessionEnvelope} draftResponse={draftResponse} onDraftChange={setDraftResponse} onSubmit={handleSubmit} onReset={handleReset} busy={busy} transcriptCount={transcript.length} />}
        {screen === 'debrief' && <Debrief activeCase={runtimeCase ?? activeCase} sessionEnvelope={sessionEnvelope} onRestart={handleReset} />}
        {screen === 'faculty' && <FacultyReview activeCase={runtimeCase ?? activeCase} sessionEnvelope={sessionEnvelope} drafts={importedDrafts} />}
      </main>
    </div>
  )
}

function Header({ sessionEnvelope, cases, drafts }: { sessionEnvelope: SessionEnvelope | null; cases: CaseSummary[]; drafts: ImportedCaseDraft[] }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">MVP status</p>
        <h2>{sessionEnvelope ? 'Live oral simulation active' : 'ABR-style runtime plus PDF ingestion online'}</h2>
      </div>
      <div className="topbar-meta">
        <div>
          <span className="meta-label">Current phase</span>
          <strong>{sessionEnvelope ? sessionEnvelope.session.phase : 'Import → review → approve → simulate'}</strong>
        </div>
        <div>
          <span className="meta-label">Case bank</span>
          <strong>{cases.length} launchable cases</strong>
        </div>
        <div>
          <span className="meta-label">Draft imports</span>
          <strong>{drafts.length} reviewable drafts</strong>
        </div>
      </div>
    </header>
  )
}

function Dashboard({ activeCase, onStart, busy, cases, drafts }: { activeCase: CaseSummary; onStart: (caseId: string) => Promise<void>; busy: boolean; cases: CaseSummary[]; drafts: ImportedCaseDraft[] }) {
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
          <div className="detail-block"><strong>{cases.length} cases</strong><p className="muted">Seeded and approved import cases can both launch live oral sessions.</p></div>
          <div className="detail-block"><strong>{drafts.length} review drafts</strong><p className="muted">PDF content lands in an editable queue instead of auto-trusted live cases.</p></div>
          <div className="detail-block"><strong>Role still locked</strong><p className="muted">Imported cases still run inside the same radiologist-examiner session model.</p></div>
        </div>
      </div>
    </section>
  )
}

function CaseLibrary({ activeCaseId, cases, onSelect, onStart, busy }: { activeCaseId: string; cases: CaseSummary[]; onSelect: (caseId: string) => void; onStart: (caseId: string) => Promise<void>; busy: boolean }) {
  return (
    <section className="screen-grid">
      <div className="panel filter-bar">
        {['Neuro', 'Chest', 'Abdomen', 'MSK', 'Breast', 'Imported-ready'].map((label) => <span key={label} className="pill">{label}</span>)}
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

function ImportsScreen({ drafts, selectedDraft, onSelect, onFieldChange, onListChange, onApprove, busy }: {
  drafts: ImportedCaseDraft[]
  selectedDraft: ImportedCaseDraft | null
  onSelect: (draftId: string) => void
  onFieldChange: (field: keyof ImportedCaseDraft, value: string) => Promise<void>
  onListChange: (field: 'findings' | 'differential' | 'management' | 'candidateTasks', value: string) => Promise<void>
  onApprove: () => Promise<void>
  busy: boolean
}) {
  return (
    <section className="imports-layout">
      <div className="panel column-panel">
        <div>
          <p className="eyebrow">Imported drafts</p>
          <h3>Review before launch</h3>
        </div>
        <div className="draft-list">
          {drafts.length === 0 && <p className="muted">Import a PDF to generate draft ABR cases.</p>}
          {drafts.map((draft) => (
            <button key={draft.id} className={draft.id === selectedDraft?.id ? 'draft-item active-case' : 'draft-item'} onClick={() => onSelect(draft.id)}>
              <div>
                <strong>{draft.title}</strong>
                <p className="muted small-copy">{draft.category} · pages {draft.sourcePages.join(', ')}</p>
              </div>
              <span className="pill subtle">{draft.status}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel column-panel span-two">
        {!selectedDraft ? (
          <div>
            <p className="eyebrow">No draft selected</p>
            <h3>Import a source PDF to begin.</h3>
          </div>
        ) : (
          <>
            <div className="split-actions">
              <div>
                <p className="eyebrow">Draft editor</p>
                <h3>{selectedDraft.title}</h3>
              </div>
              <button className="primary-btn" disabled={busy || selectedDraft.status === 'approved'} onClick={() => void onApprove()}>
                {selectedDraft.status === 'approved' ? 'Approved' : busy ? 'Saving...' : 'Approve into case bank'}
              </button>
            </div>

            <div className="editor-grid">
              <Field label="Title" value={selectedDraft.title} onChange={(value) => void onFieldChange('title', value)} />
              <Field label="Category" value={selectedDraft.category} onChange={(value) => void onFieldChange('category', value)} />
              <Field label="Subspecialty" value={selectedDraft.subspecialty} onChange={(value) => void onFieldChange('subspecialty', value)} />
              <Field label="Modality" value={selectedDraft.modality} onChange={(value) => void onFieldChange('modality', value)} />
              <Field label="Clinical context" value={selectedDraft.clinicalContext} onChange={(value) => void onFieldChange('clinicalContext', value)} multiline />
              <Field label="Objective" value={selectedDraft.objective} onChange={(value) => void onFieldChange('objective', value)} multiline />
              <Field label="Findings" value={selectedDraft.findings.join('\n')} onChange={(value) => void onListChange('findings', value)} multiline />
              <Field label="Differential" value={selectedDraft.differential.join('\n')} onChange={(value) => void onListChange('differential', value)} multiline />
              <Field label="Management" value={selectedDraft.management.join('\n')} onChange={(value) => void onListChange('management', value)} multiline />
              <Field label="Candidate tasks" value={selectedDraft.candidateTasks.join('\n')} onChange={(value) => void onListChange('candidateTasks', value)} multiline />
              <Field label="Teaching point" value={selectedDraft.teachingPoint} onChange={(value) => void onFieldChange('teachingPoint', value)} multiline />
              <Field label="Review notes" value={selectedDraft.reviewNotes} onChange={(value) => void onFieldChange('reviewNotes', value)} multiline />
            </div>

            <div className="score-list compact-grid">
              <div className="detail-block"><span className="meta-label">Confidence</span><p>{Math.round(selectedDraft.confidence * 100)}%</p></div>
              <div className="detail-block"><span className="meta-label">Source pages</span><p>{selectedDraft.sourcePages.join(', ')}</p></div>
              <div className="detail-block"><span className="meta-label">Overall discussion</span><p>{selectedDraft.overallDiscussion || 'None extracted'}</p></div>
            </div>

            <div className="detail-block">
              <span className="meta-label">Source excerpt</span>
              <p>{selectedDraft.sourceExcerpt}</p>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className="field-block">
      <span className="meta-label">{label}</span>
      {multiline ? <textarea className="text-input" value={value} onChange={(event) => onChange(event.target.value)} /> : <input className="text-input single-line-input" value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
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
        <div className="detail-block"><span className="meta-label">History</span><p>{activeCase.history}</p></div>
        <div className="detail-block"><span className="meta-label">Candidate vignette</span><p>{activeCase.vignette}</p></div>
        <div className="detail-block">
          <span className="meta-label">Candidate tasks</span>
          <ul className="clean-list compact">{activeCase.candidateTasks.map((task) => <li key={task}>{task}</li>)}</ul>
        </div>
        <div className="detail-block">
          <span className="meta-label">Revealed facts</span>
          <ul className="clean-list compact">{(sessionEnvelope?.session.revealedFacts ?? activeCase.findings.slice(0, 1)).map((finding) => <li key={finding}>{finding}</li>)}</ul>
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
          <div className="pill-row"><span className="pill subtle">Role locked</span><span className="pill subtle">Radiologist examiner</span></div>
        </div>
        <div className="viewer-canvas">
          <div className="scan-frame runtime-frame">
            <div><span className="meta-label">Expected answer frame</span><p>{activeCase.sampleAnswerFrame.join(' → ')}</p></div>
            <div><span className="meta-label">Hidden diagnosis</span><p>{activeCase.hiddenDiagnosis}</p></div>
            <div><span className="meta-label">Teaching point</span><p>{activeCase.keyTeachingPoint}</p></div>
          </div>
          <div className="viewer-overlay"><span>{activeCase.modality}</span><span>{activeCase.subspecialty}</span></div>
        </div>
      </div>

      <div className="panel column-panel">
        <div className="stack-row">
          <div><p className="eyebrow">Examiner transcript</p><h3>Strict radiologist examiner</h3></div>
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
        <div className="pill-row"><span className="pill">Overall score {debrief?.overallScore ?? '--'}</span><span className="pill">Critical misses {debrief?.criticalMisses ?? '--'}</span><span className="pill">Case {activeCase.code}</span></div>
        <button className="secondary-btn" onClick={() => void onRestart()}>Clear and restart</button>
      </div>
      <div className="panel"><p className="eyebrow">Strong candidate answer</p><p>{debrief?.strongAnswer ?? 'Awaiting completed session output.'}</p></div>
      <div className="panel"><p className="eyebrow">Competency breakdown</p><div className="score-list">{(debrief?.scoreBreakdown ?? []).map((score) => <div key={score.label} className="score-row"><div><strong>{score.label}</strong><p className="muted">{score.note}</p></div><span>{score.score.toFixed(1)}</span></div>)}</div></div>
      <div className="panel"><p className="eyebrow">Next steps</p><ul className="clean-list compact">{(debrief?.nextSteps ?? []).map((item) => <li key={item}>{item}</li>)}</ul><div className="detail-block"><span className="meta-label">Recommended follow-up case</span><p>{activeCase.title}</p></div></div>
    </section>
  )
}

function FacultyReview({ activeCase, sessionEnvelope, drafts }: { activeCase: CaseSummary; sessionEnvelope: SessionEnvelope | null; drafts: ImportedCaseDraft[] }) {
  const debrief = sessionEnvelope?.session.debrief
  return (
    <section className="screen-grid two-up">
      <div className="panel">
        <p className="eyebrow">Session oversight</p>
        <h3>{sessionEnvelope?.session.candidateName ?? 'KB Resident'} · PGY-5 · {activeCase.code}</h3>
        <div className="score-row"><span className="meta-label">AI disposition</span><strong>{debrief?.disposition ?? 'Pending'}</strong></div>
        <div className="score-row"><span className="meta-label">Session status</span><strong>{sessionEnvelope?.session.status ?? 'idle'}</strong></div>
        <div className="detail-block"><span className="meta-label">Governance notes</span><p>{sessionEnvelope?.session.examinerConsistencyNote ?? 'Examiner stays in role, probes, and avoids tutoring drift.'}</p></div>
      </div>
      <div className="panel">
        <p className="eyebrow">Import governance</p>
        <div className="detail-block"><span className="meta-label">Review queue</span><p>{drafts.length} imported drafts, {drafts.filter((item) => item.status === 'approved').length} approved for launch.</p></div>
        <div className="detail-block"><span className="meta-label">Calibration prompt</span><p>Did the imported or seeded case preserve an oral-board rhythm of observation, synthesis, and management without collapsing into generic tutoring?</p></div>
      </div>
      <div className="panel span-two">
        <p className="eyebrow">Transcript audit</p>
        <div className="transcript-list faculty-transcript">{(sessionEnvelope?.session.transcript ?? []).map((turn) => <div key={`faculty-${turn.id}`} className={turn.speaker === 'Examiner' ? 'bubble examiner' : turn.speaker === 'Learner' ? 'bubble learner' : 'bubble system'}><span className="meta-label">{turn.speaker} · {turn.phase}</span><p>{turn.text}</p></div>)}</div>
      </div>
    </section>
  )
}

export default App
