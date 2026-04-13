import { useState } from 'react'
import './App.css'

type ScreenKey = 'dashboard' | 'library' | 'session' | 'debrief' | 'faculty'

type CaseSummary = {
  id: string
  code: string
  title: string
  subspecialty: string
  modality: string
  difficulty: 'Junior' | 'Standard' | 'Advanced'
  duration: string
  objective: string
  vignette: string
  findings: string[]
  differential: string[]
  management: string[]
}

type Turn = {
  speaker: 'Examiner' | 'Learner'
  text: string
  phase: string
}

const cases: CaseSummary[] = [
  {
    id: '1',
    code: 'NEU-017',
    title: 'Acute posterior circulation stroke workup',
    subspecialty: 'Neuroradiology',
    modality: 'CTA Head/Neck',
    difficulty: 'Standard',
    duration: '12 min',
    objective: 'Practice vascular localization, high-stakes communication, and thrombectomy triage.',
    vignette: '65-year-old with sudden vertigo, diplopia, and gait instability. Review CTA and state the most likely diagnosis and immediate management priorities.',
    findings: ['Occlusion of the left vertebral artery V4 segment', 'Diminished basilar tip opacification', 'No large parenchymal hemorrhage on non-contrast images'],
    differential: ['Basilar thromboembolic disease', 'Severe vertebrobasilar atherosclerotic stenosis'],
    management: ['Activate stroke team', 'Recommend urgent neurointerventional evaluation', 'Clarify hemorrhage exclusion before thrombolysis discussion'],
  },
  {
    id: '2',
    code: 'ABD-031',
    title: 'Occult bowel ischemia on CT abdomen',
    subspecialty: 'Abdominal Imaging',
    modality: 'CT Abdomen/Pelvis',
    difficulty: 'Advanced',
    duration: '14 min',
    objective: 'Identify subtle ischemic signs and defend operative urgency.',
    vignette: '72-year-old with atrial fibrillation, pain out of proportion, and rising lactate. Interpret the contrast-enhanced CT and prioritize next steps.',
    findings: ['Segmental hypoenhancement of mid-small bowel', 'Mesenteric edema with trace free fluid', 'Abrupt SMA branch cutoff'],
    differential: ['Acute mesenteric ischemia', 'Closed loop obstruction with vascular compromise'],
    management: ['Urgent surgical consultation', 'Communicate bowel threat explicitly', 'Recommend CTA review and anticoagulation discussion in context'],
  },
  {
    id: '3',
    code: 'MSK-008',
    title: 'Aggressive distal femur lesion',
    subspecialty: 'MSK',
    modality: 'MRI Knee',
    difficulty: 'Standard',
    duration: '10 min',
    objective: 'Structure malignant bone tumor differential and staging recommendations.',
    vignette: '18-year-old with progressive knee pain and palpable mass. Review MRI and describe the lesion, differential, and staging workup.',
    findings: ['Metaphyseal marrow replacing lesion in distal femur', 'Large soft tissue component', 'Periosteal reaction with cortical breakthrough'],
    differential: ['Osteosarcoma', 'Ewing sarcoma'],
    management: ['Recommend dedicated radiographs and chest CT', 'Advise orthopedic oncology referral', 'Avoid unplanned biopsy pathway'],
  },
]

const transcript: Turn[] = [
  {
    speaker: 'Examiner',
    phase: 'Interpretation',
    text: 'You are the on-call radiology candidate. Walk me through the key CTA findings and start with what is immediately actionable.',
  },
  {
    speaker: 'Learner',
    phase: 'Interpretation',
    text: 'There is poor opacification of the distal left vertebral artery extending into the vertebrobasilar junction, concerning for acute thromboembolic occlusion in the posterior circulation.',
  },
  {
    speaker: 'Examiner',
    phase: 'Differential',
    text: 'Be more specific. What are you seeing at the basilar tip, and how does that change urgency?',
  },
  {
    speaker: 'Learner',
    phase: 'Management',
    text: 'Basilar tip flow is attenuated, so this is potentially evolving basilar ischemia. I would urgently communicate this to the stroke team and neurointerventional service.',
  },
  {
    speaker: 'Examiner',
    phase: 'Management',
    text: 'Good. Before you call, what critical exclusion do you need from the non-contrast series?',
  },
]

const scoreBreakdown = [
  { label: 'Detection', score: 4.5, note: 'Localized the culprit vascular lesion quickly.' },
  { label: 'Description', score: 4.1, note: 'Used crisp, board-style language.' },
  { label: 'Differential', score: 3.8, note: 'Could rank competing etiologies more explicitly.' },
  { label: 'Management', score: 4.7, note: 'Communicated urgency and escalation well.' },
  { label: 'Communication', score: 4.2, note: 'Strong structure under pressure.' },
]

const weakAreas = [
  'Chest emergency imaging',
  'Prioritizing differentials under time pressure',
  'MSK tumor staging recommendations',
]

const assignedCases = [
  { title: 'Weekend stroke callback set', due: 'Due tomorrow 07:00', count: 3 },
  { title: 'GI emergency board drill', due: 'Due Apr 16', count: 2 },
]

function App() {
  const activeCase = cases[0]
  const [screen, setScreen] = useState<ScreenKey>('dashboard')

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">ABR Oral Board AI</p>
          <h1>Radiologist examiner training, not chatbot cosplay.</h1>
          <p className="muted">Web-first MVP with learner flow, case runtime scaffolding, and faculty review surfaces.</p>
        </div>

        <nav className="nav">
          {[
            ['dashboard', 'Learner dashboard'],
            ['library', 'Case library'],
            ['session', 'Live session'],
            ['debrief', 'Debrief'],
            ['faculty', 'Faculty review'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={screen === key ? 'nav-item active' : 'nav-item'}
              onClick={() => setScreen(key as ScreenKey)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="status-dot" />
          AI role locked: <strong>radiologist examiner</strong>
        </div>
      </aside>

      <main className="main">
        <Header />
        {screen === 'dashboard' && <Dashboard activeCase={activeCase} />}
        {screen === 'library' && <CaseLibrary activeCase={activeCase} />}
        {screen === 'session' && <LiveSession activeCase={activeCase} />}
        {screen === 'debrief' && <Debrief activeCase={activeCase} />}
        {screen === 'faculty' && <FacultyReview activeCase={activeCase} />}
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">MVP status</p>
        <h2>Core learner journey scaffolded</h2>
      </div>
      <div className="topbar-meta">
        <div>
          <span className="meta-label">Current phase</span>
          <strong>Phase 2, text-first simulation</strong>
        </div>
        <div>
          <span className="meta-label">Pilot stance</span>
          <strong>3 seeded cases, strict examiner guardrails</strong>
        </div>
      </div>
    </header>
  )
}

function Dashboard({ activeCase }: { activeCase: CaseSummary }) {
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
        <button className="primary-btn">Start oral simulation</button>
      </div>

      <div className="panel">
        <p className="eyebrow">Weak areas</p>
        <ul className="clean-list">
          {weakAreas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
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
        <p className="eyebrow">Recent performance</p>
        <div className="trend-card">
          <div>
            <span className="metric">84%</span>
            <p className="muted">Average last 5 sessions</p>
          </div>
          <div className="trend-bars">
            {[72, 76, 81, 85, 84].map((value) => (
              <span key={value} style={{ height: `${value}px` }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function CaseLibrary({ activeCase }: { activeCase: CaseSummary }) {
  return (
    <section className="screen-grid">
      <div className="panel filter-bar">
        <span className="pill">Neuro</span>
        <span className="pill">Chest</span>
        <span className="pill">Abdomen</span>
        <span className="pill">MSK</span>
        <span className="pill subtle">Duration under 15 min</span>
      </div>

      <div className="case-list">
        {cases.map((item) => (
          <article key={item.id} className={item.id === activeCase.id ? 'panel case-card active-case' : 'panel case-card'}>
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
            <div className="split-actions">
              <button className="secondary-btn">Preview setup</button>
              <button className="primary-btn">Launch</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function LiveSession({ activeCase }: { activeCase: CaseSummary }) {
  return (
    <section className="live-layout">
      <div className="panel column-panel">
        <div className="stack-row">
          <div>
            <p className="eyebrow">{activeCase.code}</p>
            <h3>{activeCase.title}</h3>
          </div>
          <span className="timer">07:42</span>
        </div>
        <div className="detail-block">
          <span className="meta-label">Candidate vignette</span>
          <p>{activeCase.vignette}</p>
        </div>
        <div className="detail-block">
          <span className="meta-label">Revealed facts</span>
          <ul className="clean-list compact">
            {activeCase.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </div>
        <div className="session-controls">
          <span className="pill">Text fallback active</span>
          <span className="pill subtle">Phase: management</span>
        </div>
      </div>

      <div className="panel viewer-panel">
        <div className="viewer-header">
          <div>
            <p className="eyebrow">Image viewer</p>
            <h3>CTA series stack</h3>
          </div>
          <div className="pill-row">
            <span className="pill subtle">Axial</span>
            <span className="pill subtle">MIP</span>
          </div>
        </div>
        <div className="viewer-canvas">
          <div className="scan-frame" />
          <div className="viewer-overlay">
            <span>Slice 84 / 126</span>
            <span>Window 70 / Level 35</span>
          </div>
        </div>
      </div>

      <div className="panel column-panel">
        <div className="stack-row">
          <div>
            <p className="eyebrow">Examiner transcript</p>
            <h3>Strict radiologist examiner</h3>
          </div>
          <span className="status-chip">Connected</span>
        </div>
        <div className="transcript-list">
          {transcript.map((turn, index) => (
            <div key={`${turn.speaker}-${index}`} className={turn.speaker === 'Examiner' ? 'bubble examiner' : 'bubble learner'}>
              <span className="meta-label">{turn.speaker} · {turn.phase}</span>
              <p>{turn.text}</p>
            </div>
          ))}
        </div>
        <div className="input-card">
          <span className="meta-label">Text fallback submission</span>
          <p className="input-shell">No intracranial hemorrhage is visible, so I would escalate immediately for reperfusion pathway consideration...</p>
          <div className="split-actions">
            <button className="secondary-btn">Pause practice</button>
            <button className="primary-btn">Submit turn</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function Debrief({ activeCase }: { activeCase: CaseSummary }) {
  return (
    <section className="screen-grid two-up">
      <div className="panel hero-panel success">
        <p className="eyebrow">Result</p>
        <h3>Pass, with targeted differential coaching</h3>
        <p>You identified posterior circulation occlusion quickly and escalated appropriately. The biggest gap was explicitly ranking alternatives before management discussion.</p>
        <div className="pill-row">
          <span className="pill">Overall score 84</span>
          <span className="pill">Critical misses 0</span>
          <span className="pill">Duration 11m 52s</span>
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">Strong candidate answer</p>
        <p>
          This CTA demonstrates acute posterior circulation thromboembolic disease with distal left vertebral artery occlusion and attenuated basilar tip flow. I would report this as a stroke-team critical result, confirm absence of hemorrhage on the companion non-contrast series, and recommend immediate neurointerventional evaluation.
        </p>
      </div>

      <div className="panel">
        <p className="eyebrow">Competency breakdown</p>
        <div className="score-list">
          {scoreBreakdown.map((score) => (
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
        <ul className="clean-list compact">
          <li>Do one abdomen vascular emergency case this week.</li>
          <li>Practice ranking top 2 differentials before management in strict mode.</li>
          <li>Review vertebrobasilar thrombectomy inclusion pitfalls.</li>
        </ul>
        <div className="detail-block">
          <span className="meta-label">Recommended follow-up case</span>
          <p>{activeCase.title} → pair with ABD-031 for urgency contrast.</p>
        </div>
      </div>
    </section>
  )
}

function FacultyReview({ activeCase }: { activeCase: CaseSummary }) {
  return (
    <section className="screen-grid two-up">
      <div className="panel">
        <p className="eyebrow">Session oversight</p>
        <h3>KB Resident · PGY-5 · {activeCase.code}</h3>
        <div className="score-row">
          <span className="meta-label">AI disposition</span>
          <strong>Pass</strong>
        </div>
        <div className="score-row">
          <span className="meta-label">Faculty override</span>
          <strong>None applied</strong>
        </div>
        <div className="detail-block">
          <span className="meta-label">Governance notes</span>
          <p>Examiner stayed in radiologist-examiner role for all logged turns. No tutoring language detected.</p>
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">Review controls</p>
        <div className="split-actions stacked">
          <button className="secondary-btn">Add faculty note</button>
          <button className="secondary-btn">Borderline override</button>
          <button className="primary-btn">Flag AI issue</button>
        </div>
        <div className="detail-block">
          <span className="meta-label">Calibration prompt</span>
          <p>Did the learner explicitly connect basilar attenuation to urgent escalation before being led there by the examiner?</p>
        </div>
      </div>

      <div className="panel span-two">
        <p className="eyebrow">Transcript audit</p>
        <div className="transcript-list faculty-transcript">
          {transcript.map((turn, index) => (
            <div key={`${turn.speaker}-faculty-${index}`} className={turn.speaker === 'Examiner' ? 'bubble examiner' : 'bubble learner'}>
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
