import { useMemo, useState } from 'react'

const scenarios = [
  {
    id: 1,
    title: 'Quiet Individual Study',
    groupSize: 1,
    needsWhiteboard: false,
    needsOutlet: true,
    noiseTolerance: 'low',
    preferredZone: 'silent',
  },
  {
    id: 2,
    title: 'Deep Work Sprint',
    groupSize: 2,
    needsWhiteboard: true,
    needsOutlet: true,
    noiseTolerance: 'low',
    preferredZone: 'focus',
  },
  {
    id: 3,
    title: 'Team Brainstorming',
    groupSize: 5,
    needsWhiteboard: true,
    needsOutlet: false,
    noiseTolerance: 'high',
    preferredZone: 'collab',
  },
  {
    id: 4,
    title: 'Presentation Practice',
    groupSize: 4,
    needsWhiteboard: false,
    needsOutlet: true,
    noiseTolerance: 'medium',
    preferredZone: 'media',
  },
]

const rooms = [
  {
    id: 'A101',
    name: 'Silent North Nook',
    capacity: 2,
    whiteboard: false,
    outlets: true,
    zone: 'silent',
    noise: 'low',
    distance: 2,
  },
  {
    id: 'B204',
    name: 'Idea Lab',
    capacity: 6,
    whiteboard: true,
    outlets: true,
    zone: 'collab',
    noise: 'high',
    distance: 4,
  },
  {
    id: 'C311',
    name: 'Focus Pod',
    capacity: 3,
    whiteboard: true,
    outlets: true,
    zone: 'focus',
    noise: 'low',
    distance: 3,
  },
  {
    id: 'D120',
    name: 'Media Practice Room',
    capacity: 5,
    whiteboard: false,
    outlets: true,
    zone: 'media',
    noise: 'medium',
    distance: 5,
  },
  {
    id: 'E018',
    name: 'Commons Booth',
    capacity: 4,
    whiteboard: false,
    outlets: false,
    zone: 'collab',
    noise: 'high',
    distance: 1,
  },
]

const zoneLabel = {
  silent: 'Silent',
  focus: 'Focus',
  collab: 'Collaboration',
  media: 'Media',
}

function scoreRoom(room, scenario) {
  let score = 0
  if (room.capacity >= scenario.groupSize) score += 3
  if (room.whiteboard === scenario.needsWhiteboard) score += 2
  if (!scenario.needsWhiteboard && !room.whiteboard) score += 1
  if (room.outlets === scenario.needsOutlet) score += 2
  if (room.zone === scenario.preferredZone) score += 3
  if (room.noise === scenario.noiseTolerance) score += 2
  score += Math.max(0, 6 - room.distance)
  return score
}

function rankRooms(scenario) {
  return rooms
    .map((room) => ({ ...room, score: scoreRoom(room, scenario) }))
    .sort((a, b) => b.score - a.score)
}

function App() {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [showOnlyBest, setShowOnlyBest] = useState(false)

  const scenario = scenarios[scenarioIndex]
  const ranked = useMemo(() => rankRooms(scenario), [scenario])
  const displayRooms = showOnlyBest ? ranked.slice(0, 1) : ranked

  const nextScenario = () => {
    setScenarioIndex((current) => (current + 1) % scenarios.length)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Library Room Optimizer Trainer</h1>
        <p>
          Practice matching user needs with the best library space. The same trainer is shown as a full web interface and
          as a Google Pixel 9 Pro XL mobile UI.
        </p>
      </header>

      <section className="preview-grid">
        <article className="panel web-ui">
          <h2>Web UI</h2>
          <TrainerCard
            scenario={scenario}
            rankedRooms={displayRooms}
            onNextScenario={nextScenario}
            showOnlyBest={showOnlyBest}
            setShowOnlyBest={setShowOnlyBest}
          />
        </article>

        <article className="panel mobile-wrapper">
          <h2>Google Pixel 9 Pro XL UI</h2>
          <div className="pixel-frame">
            <div className="pixel-notch" />
            <div className="pixel-screen">
              <TrainerCard
                scenario={scenario}
                rankedRooms={displayRooms}
                onNextScenario={nextScenario}
                showOnlyBest={showOnlyBest}
                setShowOnlyBest={setShowOnlyBest}
                compact
              />
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}

function TrainerCard({ scenario, rankedRooms, onNextScenario, showOnlyBest, setShowOnlyBest, compact = false }) {
  return (
    <div className={`trainer-card ${compact ? 'compact' : ''}`}>
      <div className="scenario-row">
        <div>
          <p className="eyebrow">Scenario</p>
          <h3>{scenario.title}</h3>
        </div>
        <button type="button" onClick={onNextScenario}>
          Next
        </button>
      </div>

      <ul className="scenario-meta">
        <li>Group: {scenario.groupSize}</li>
        <li>Zone: {zoneLabel[scenario.preferredZone]}</li>
        <li>Whiteboard: {scenario.needsWhiteboard ? 'Required' : 'Not needed'}</li>
        <li>Outlets: {scenario.needsOutlet ? 'Required' : 'Not needed'}</li>
        <li>Noise tolerance: {scenario.noiseTolerance}</li>
      </ul>

      <label className="toggle">
        <input type="checkbox" checked={showOnlyBest} onChange={(event) => setShowOnlyBest(event.target.checked)} />
        Show only best match
      </label>

      <div className="room-list">
        {rankedRooms.map((room, index) => (
          <article key={room.id} className={`room-item ${index === 0 ? 'top' : ''}`}>
            <div>
              <h4>
                #{index + 1} {room.name}
              </h4>
              <p>
                {zoneLabel[room.zone]} · Capacity {room.capacity} · {room.distance} min walk
              </p>
            </div>
            <strong>{room.score} pts</strong>
          </article>
        ))}
      </div>
    </div>
  )
}

export default App
