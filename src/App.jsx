import { useEffect, useMemo, useState } from 'react'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const ROOM_CAPACITIES = {
  'A-204': 16,
  'A-206': 10,
  'A-231': 10,
  'A-233': 10,
  'A-235': 10,
  'A-237': 6,
  'A-241': 10,
  'D-202': 10,
  'D-204': 16,
  'D-206': 10,
  'D-231': 10,
  'D-233': 10,
  'D-235': 10,
  'D-237': 6,
  'D-239': 10,
  'D-243': 10,
}

const ROOM_NAMES = Object.keys(ROOM_CAPACITIES)
const SWITCH_MINUTES = 15
const LR0 = 0.25
const L2 = 0.02
const PRECISION_WINDOW = 20
const URL_LOG_LIMIT = 50

const INITIAL_WEIGHTS = {
  walk: -1.1,
  wait: -1.6,
  sw: -1.2,
  size: 1.1,
}

function roomTier(size) {
  if (size === 6) return 0
  if (size === 10) return 4
  if (size === 16) return 5
  return 0
}

function clampWeight(key, value) {
  if (key === 'wait') return Math.max(-8, Math.min(8, value))
  return Math.max(-5, Math.min(5, value))
}

function pickFromRanges(ranges) {
  const roll = Math.random()
  let cumulative = 0
  for (const range of ranges) {
    cumulative += range.weight
    if (roll <= cumulative) {
      const span = range.max - range.min + 1
      return range.min + Math.floor(Math.random() * span)
    }
  }
  const fallback = ranges[ranges.length - 1]
  return fallback.min
}

function sampleWalkPerBlock() {
  return pickFromRanges([
    { weight: 0.72, min: 0, max: 60 },
    { weight: 0.22, min: 61, max: 140 },
    { weight: 0.06, min: 141, max: 250 },
  ])
}

function sampleWaitPerBlock() {
  return pickFromRanges([
    { weight: 0.72, min: 0, max: 45 },
    { weight: 0.23, min: 46, max: 90 },
    { weight: 0.05, min: 91, max: 140 },
  ])
}

function sampleBlocks() {
  return pickFromRanges([
    { weight: 0.35, min: 1, max: 1 },
    { weight: 0.45, min: 2, max: 2 },
    { weight: 0.2, min: 3, max: 3 },
  ])
}

function sampleRooms(blocks) {
  const picked = []
  for (let i = 0; i < blocks; i += 1) {
    picked.push(ROOM_NAMES[Math.floor(Math.random() * ROOM_NAMES.length)])
  }
  return picked
}

function buildOption() {
  const blocks = sampleBlocks()
  const rooms = sampleRooms(blocks)
  const switches = blocks - 1
  const walkMeters = Array.from({ length: blocks }, () => sampleWalkPerBlock()).reduce((a, b) => a + b, 0)
  const waitMinutes = Array.from({ length: blocks }, () => sampleWaitPerBlock()).reduce((a, b) => a + b, 0)
  const sizeBonus = rooms.reduce((sum, room) => sum + roomTier(ROOM_CAPACITIES[room]), 0)
  const effectiveWait = waitMinutes + switches * SWITCH_MINUTES

  return {
    rooms,
    blocks,
    switches,
    walkMeters,
    waitMinutes,
    effectiveWait,
    sizeBonus,
  }
}

function computeFeatures(option) {
  return {
    walk: option.walkMeters / 250,
    wait: Math.sqrt(option.effectiveWait) / Math.sqrt(140 + 2 * SWITCH_MINUTES),
    sw: option.switches / 2,
    size: option.sizeBonus / 15,
  }
}

function scoreOption(option, weights) {
  const features = computeFeatures(option)
  const score =
    weights.walk * features.walk +
    weights.wait * features.wait +
    weights.sw * features.sw +
    weights.size * features.size

  return { score, features }
}

function evaluatePair(optionA, optionB, weights) {
  const scoredA = scoreOption(optionA, weights)
  const scoredB = scoreOption(optionB, weights)
  const maxScore = Math.max(scoredA.score, scoredB.score)
  const expA = Math.exp(scoredA.score - maxScore)
  const expB = Math.exp(scoredB.score - maxScore)
  const probA = expA / (expA + expB)
  const probB = 1 - probA
  const predicted = probA >= probB ? 'A' : 'B'
  const confidence = Math.max(probA, probB)

  return {
    scoreA: scoredA.score,
    scoreB: scoredB.score,
    featuresA: scoredA.features,
    featuresB: scoredB.features,
    probA,
    probB,
    predicted,
    confidence,
  }
}

function generateRound(weights) {
  const optionA = buildOption()
  const optionB = buildOption()
  return {
    optionA,
    optionB,
    evaluation: evaluatePair(optionA, optionB, weights),
  }
}

function computePrecision(log) {
  const sample = log.slice(-PRECISION_WINDOW)
  if (sample.length === 0) return 0
  const correct = sample.filter((entry) => entry.correct).length
  return (correct / sample.length) * 100
}

function toCsv(log) {
  const headers = [
    'ts',
    'round',
    'predicted',
    'confidence',
    'probA',
    'probB',
    'choice',
    'correct',
    'A_rooms',
    'A_blocks',
    'A_walkMeters',
    'A_waitMinutes',
    'A_switches',
    'A_effectiveWait',
    'A_sizeBonus',
    'B_rooms',
    'B_blocks',
    'B_walkMeters',
    'B_waitMinutes',
    'B_switches',
    'B_effectiveWait',
    'B_sizeBonus',
    'w_walk',
    'w_wait',
    'w_sw',
    'w_size',
  ]

  const escapeCell = (value) => {
    const str = String(value ?? '')
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`
    }
    return str
  }

  const rows = log.map((entry) =>
    [
      entry.ts,
      entry.round,
      entry.predicted,
      entry.confidence,
      entry.probA,
      entry.probB,
      entry.choice,
      entry.correct,
      entry.A_rooms,
      entry.A_blocks,
      entry.A_walkMeters,
      entry.A_waitMinutes,
      entry.A_switches,
      entry.A_effectiveWait,
      entry.A_sizeBonus,
      entry.B_rooms,
      entry.B_blocks,
      entry.B_walkMeters,
      entry.B_waitMinutes,
      entry.B_switches,
      entry.B_effectiveWait,
      entry.B_sizeBonus,
      entry.w_walk,
      entry.w_wait,
      entry.w_sw,
      entry.w_size,
    ]
      .map(escapeCell)
      .join(','),
  )

  return [headers.join(','), ...rows].join('\n')
}

function triggerDownload(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function parseHashState() {
  const rawHash = window.location.hash.startsWith('#state=') ? window.location.hash.slice(7) : ''
  if (!rawHash) return null

  try {
    const decoded = decompressFromEncodedURIComponent(rawHash)
    if (!decoded) return null
    const parsed = JSON.parse(decoded)
    return parsed
  } catch {
    return null
  }
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

function metricBarValue(metric, option) {
  if (metric === 'walk') return Math.min(100, (option.walkMeters / 750) * 100)
  if (metric === 'wait') return Math.min(100, (option.waitMinutes / 420) * 100)
  return Math.min(100, (option.switches / 2) * 100)
}

function App() {
  const initialState = useMemo(() => {
    const hashState = parseHashState()
    const safeWeights = hashState?.weights ? { ...INITIAL_WEIGHTS, ...hashState.weights } : INITIAL_WEIGHTS
    const safeLog = Array.isArray(hashState?.log) ? hashState.log : []
    const round = Number.isFinite(hashState?.round) && hashState.round > 0 ? Math.floor(hashState.round) : safeLog.length + 1
    const restoredRound = hashState?.currentRound

    if (restoredRound?.optionA && restoredRound?.optionB && restoredRound?.evaluation) {
      return {
        weights: safeWeights,
        log: safeLog,
        round,
        currentRound: restoredRound,
      }
    }

    return {
      weights: safeWeights,
      log: safeLog,
      round,
      currentRound: generateRound(safeWeights),
    }
  }, [])

  const [weights, setWeights] = useState(initialState.weights)
  const [log, setLog] = useState(initialState.log)
  const [round, setRound] = useState(initialState.round)
  const [currentRound, setCurrentRound] = useState(initialState.currentRound)
  const [feedback, setFeedback] = useState(null)

  const precisionLastN = useMemo(() => computePrecision(log), [log])

  useEffect(() => {
    const payload = {
      weights,
      round,
      currentRound,
      log: log.slice(-URL_LOG_LIMIT),
    }
    const encoded = compressToEncodedURIComponent(JSON.stringify(payload))
    history.replaceState(null, '', `#state=${encoded}`)
  }, [weights, round, currentRound, log])

  useEffect(() => {
    if (!feedback) return undefined
    const id = setTimeout(() => setFeedback(null), 1800)
    return () => clearTimeout(id)
  }, [feedback])

  const onChoose = (choice) => {
    const { optionA, optionB, evaluation } = currentRound
    const previousWeights = { ...weights }
    const actualA = choice === 'A' ? 1 : 0
    const error = actualA - evaluation.probA
    const lr = LR0 / Math.sqrt(round)

    const dFeatures = {
      walk: evaluation.featuresA.walk - evaluation.featuresB.walk,
      wait: evaluation.featuresA.wait - evaluation.featuresB.wait,
      sw: evaluation.featuresA.sw - evaluation.featuresB.sw,
      size: evaluation.featuresA.size - evaluation.featuresB.size,
    }

    const updatedWeights = {
      walk: clampWeight('walk', weights.walk + lr * error * dFeatures.walk - L2 * weights.walk),
      wait: clampWeight('wait', weights.wait + lr * error * dFeatures.wait - L2 * weights.wait),
      sw: clampWeight('sw', weights.sw + lr * error * dFeatures.sw - L2 * weights.sw),
      size: clampWeight('size', weights.size + lr * error * dFeatures.size - L2 * weights.size),
    }

    const correct = evaluation.predicted === choice
    const entry = {
      ts: new Date().toISOString(),
      round,
      predicted: evaluation.predicted,
      confidence: Number(evaluation.confidence.toFixed(6)),
      probA: Number(evaluation.probA.toFixed(6)),
      probB: Number(evaluation.probB.toFixed(6)),
      choice,
      correct,
      A_rooms: optionA.rooms.map((room) => `${room} (${ROOM_CAPACITIES[room]})`).join(' | '),
      A_blocks: optionA.blocks,
      A_walkMeters: optionA.walkMeters,
      A_waitMinutes: optionA.waitMinutes,
      A_switches: optionA.switches,
      A_effectiveWait: optionA.effectiveWait,
      A_sizeBonus: optionA.sizeBonus,
      B_rooms: optionB.rooms.map((room) => `${room} (${ROOM_CAPACITIES[room]})`).join(' | '),
      B_blocks: optionB.blocks,
      B_walkMeters: optionB.walkMeters,
      B_waitMinutes: optionB.waitMinutes,
      B_switches: optionB.switches,
      B_effectiveWait: optionB.effectiveWait,
      B_sizeBonus: optionB.sizeBonus,
      w_walk: Number(previousWeights.walk.toFixed(6)),
      w_wait: Number(previousWeights.wait.toFixed(6)),
      w_sw: Number(previousWeights.sw.toFixed(6)),
      w_size: Number(previousWeights.size.toFixed(6)),
    }

    setLog((prev) => [...prev, entry])
    setWeights(updatedWeights)
    setRound((prev) => prev + 1)
    setCurrentRound(generateRound(updatedWeights))
    setFeedback({
      correct,
      confidence: evaluation.confidence,
      predicted: evaluation.predicted,
      choice,
    })
  }

  const exportCsv = () => {
    const csv = toCsv(log)
    triggerDownload('library-room-optimizer-log.csv', 'text/csv;charset=utf-8', csv)
  }

  const exportJson = () => {
    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        app: 'Library Room Optimizer Trainer',
      },
      weights,
      precisionLastN,
      settings: {
        SWITCH_MINUTES,
      },
      log,
    }
    triggerDownload('library-room-optimizer-state.json', 'application/json;charset=utf-8', JSON.stringify(payload, null, 2))
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Library Room Optimizer Trainer</h1>
              <p className="mt-2 text-sm text-slate-600">Online-Status: Online</p>
            </div>
            <p className="text-base font-semibold">Runde: {round}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <OptionCard optionKey="A" option={currentRound.optionA} onChoose={onChoose} />
          <OptionCard optionKey="B" option={currentRound.optionB} onChoose={onChoose} />
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label={`Praezision (letzte ${PRECISION_WINDOW})`} value={`${precisionLastN.toFixed(1)}%`} />
            <StatCard label="Entscheidungen gesamt" value={String(log.length)} />
            <StatCard label="Switch-Kosten" value={`${SWITCH_MINUTES} Minuten`} />
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Gelerntes Gewichtungs-Profil</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <WeightCell label="walk" value={weights.walk} />
              <WeightCell label="wait" value={weights.wait} />
              <WeightCell label="sw" value={weights.sw} />
              <WeightCell label="size" value={weights.size} />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={exportCsv}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-700 sm:w-auto"
            >
              CSV Export (ENTSCHEIDUNGS-LOG)
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="w-full rounded-xl bg-slate-200 px-5 py-3 text-base font-semibold text-slate-900 transition hover:bg-slate-300 sm:w-auto"
            >
              JSON Export (Weights + Settings + Log)
            </button>
          </div>
        </section>
      </div>

      {feedback && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
            <p className="font-semibold">{feedback.correct ? 'Vorhersage korrekt' : 'Vorhersage nicht korrekt'}</p>
            <p className="mt-1">
              Prognose: {feedback.predicted}, Wahl: {feedback.choice}, Sicherheit: {formatPercent(feedback.confidence)}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}

function OptionCard({ optionKey, option, onChoose }) {
  const roomLabels = option.rooms.map((room) => `${room} (${ROOM_CAPACITIES[room]})`)
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Option {optionKey}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {roomLabels.map((roomLabel) => (
          <li key={`${optionKey}-${roomLabel}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            {roomLabel}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-4">
        <MetricBar label="Fussweg (m)" value={option.walkMeters} widthPercent={metricBarValue('walk', option)} />
        <MetricBar label="Wartezeit (min)" value={option.waitMinutes} widthPercent={metricBarValue('wait', option)} />
        <MetricBar label="Raumwechsel (Anzahl)" value={option.switches} widthPercent={metricBarValue('sw', option)} />
      </div>

      <button
        type="button"
        onClick={() => onChoose(optionKey)}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-5 py-4 text-lg font-semibold text-white transition hover:bg-indigo-500"
      >
        Waehlen
      </button>
    </article>
  )
}

function MetricBar({ label, value, widthPercent }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{value}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200">
        <div className="h-3 rounded-full bg-indigo-500" style={{ width: `${Math.max(widthPercent, 4)}%` }} />
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function WeightCell({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
      <p className="text-sm uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value.toFixed(3)}</p>
    </div>
  )
}

export default App
