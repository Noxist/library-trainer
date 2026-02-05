import { distMeters, metersToWalkSlots } from "./distance.js";
import { idxToMinutes, minutesToTime } from "./time.js";
import { scanOpportunities } from "./opportunity.js";

const MIN_BLOCK_SLOTS = 4; // 60min
const MAX_BLOCK_SLOTS = 16; // 4h
const MIN_BUFFER_SLOTS = 1; // 15min Puffer

export function generateTwoStrategies({ dayIndex, matrix, mode, horizonMin, accounts, scenarioId }) {
  const policyA = mode === "HUSTLE" ? "SAFE_LONG" : "SAFE_STABLE";
  const policyB = mode === "HUSTLE" ? "AGGRO_MAX" : "AGGRO_SMART";

  const A = buildStrategy({ dayIndex, matrix, policy: policyA, horizonMin, accounts, scenarioId });
  const B = buildStrategy({ dayIndex, matrix, policy: policyB, horizonMin, accounts, scenarioId, avoid: A });

  return { strategyA: A, strategyB: B };
}

function buildStrategy({ dayIndex, matrix, policy, horizonMin, accounts, scenarioId, avoid }) {
  const startMin = 8 * 60;
  const startIdx = minutesToIdxSafe(dayIndex, startMin);
  const horizonSlots = Math.floor(horizonMin / 15);

  const blocks = [];
  let curIdx = startIdx;
  let curRoom = null;

  for (let a = 0; a < accounts; a++) {
    // Ziel: einen Block <=4h finden, der ab curIdx startbar ist
    const candidate = pickNextBlock({ dayIndex, matrix, policy, curIdx, curRoom, avoid });
    if (!candidate) break;

    blocks.push(candidate);
    curRoom = candidate.room;
    curIdx = candidate.endIdx;

    // Stop wenn Horizon erreicht
    if ((curIdx - startIdx) >= horizonSlots) break;
  }

  // Opportunitäten sammeln für große Gaps (>=60min = 4 Slots)
  const opportunities = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const gapSlots = blocks[i + 1].startIdx - blocks[i].endIdx;
    if (gapSlots >= 4) {
      opportunities.push({
        atTime: idxToHHMM(dayIndex, blocks[i].endIdx),
        gapMin: gapSlots * 15,
        ...scanOpportunities(dayIndex, blocks[i].endIdx)
      });
    }
  }

  return { policy, blocks: blocks.map(b => ({ ...b, startTime: idxToHHMM(dayIndex, b.startIdx), endTime: idxToHHMM(dayIndex, b.endIdx) })), opportunities };
}

function pickNextBlock({ dayIndex, matrix, policy, curIdx, curRoom, avoid }) {
  // Erzeuge Kandidaten: alle Räume, alle freien Runs, die ab curIdx starten oder danach
  const candidates = [];

  for (const room of dayIndex.roomIds) {
    const runs = dayIndex.freeRunsByRoom.get(room) || [];
    for (const run of runs) {
      if (run.endIdx - run.startIdx < MIN_BLOCK_SLOTS) continue;

      // start muss >= curIdx sein
      const startIdx = Math.max(run.startIdx, curIdx);
      if (startIdx >= run.endIdx) continue;

      const maxLen = Math.min(MAX_BLOCK_SLOTS, run.endIdx - startIdx);
      if (maxLen < MIN_BLOCK_SLOTS) continue;

      // Feasibility: walkSlots + buffer in Gap reinpassen
      let walkSlots = 0;
      if (curRoom) {
        const meters = distMeters(matrix, curRoom, room);
        walkSlots = metersToWalkSlots(meters);
        const gapSlots = startIdx - curIdx;
        if (gapSlots < walkSlots + MIN_BUFFER_SLOTS) continue;
      }

      // Blocklaenge heuristisch: Policy steuert "wie lang"
      const len = chooseLenSlots(policy, maxLen);
      const endIdx = startIdx + len;

      // Avoid-Mechanik für Strategy B: Soft-Penalty wenn exakt gleiche Wahl
      const avoidPenalty = avoid ? similarityPenalty(avoid, room, startIdx, endIdx) : 0;

      // interner Score (nicht ML): laenger, weniger wait, weniger distance, plus avoidPenalty
      const waitSlots = startIdx - curIdx;
      const internalScore =
        len * 2
        - waitSlots * (policy.includes("AGGRO") ? 0.5 : 1.0)
        - walkSlots * (policy.includes("AGGRO") ? 0.7 : 1.2)
        - avoidPenalty;

      candidates.push({ room, startIdx, endIdx, walkSlots, waitSlots, internalScore });
    }
  }

  candidates.sort((a, b) => b.internalScore - a.internalScore);

  // Nimm beste, aber mit Diversity: falls avoid existiert, nicht identisch
  for (const c of candidates) {
    if (!avoid) return { room: c.room, startIdx: c.startIdx, endIdx: c.endIdx };
    if (!isIdenticalToAvoid(avoid, c.room, c.startIdx, c.endIdx)) return { room: c.room, startIdx: c.startIdx, endIdx: c.endIdx };
  }
  return candidates.length ? { room: candidates[0].room, startIdx: candidates[0].startIdx, endIdx: candidates[0].endIdx } : null;
}

function chooseLenSlots(policy, maxLen) {
  if (policy === "SAFE_LONG") return Math.min(maxLen, 16);
  if (policy === "AGGRO_MAX") return Math.min(maxLen, 16);
  if (policy === "SAFE_STABLE") return Math.min(maxLen, 12);
  if (policy === "AGGRO_SMART") return Math.min(maxLen, 10);
  return Math.min(maxLen, 12);
}

function similarityPenalty(avoid, room, s, e) {
  // Bestrafe, wenn Block stark überlappt mit einem Block aus avoid
  let p = 0;
  for (const b of avoid.blocks) {
    if (b.room !== room) continue;
    const ov = Math.max(0, Math.min(e, b.endIdx) - Math.max(s, b.startIdx));
    p += ov;
  }
  return p;
}

function isIdenticalToAvoid(avoid, room, s, e) {
  // Identisch, wenn erster Block gleich
  const first = avoid.blocks[0];
  if (!first) return false;
  return first.room === room && first.startIdx === s && first.endIdx === e;
}

function minutesToIdxSafe(dayIndex, min) {
  // Find nächster SlotIndex >= min
  const t = dayIndex.slotTimes;
  for (let i = 0; i < t.length; i++) {
    const m = Number(t[i].slice(0, 2)) * 60 + Number(t[i].slice(3, 5));
    if (m >= min) return i;
  }
  return 0;
}

function idxToHHMM(dayIndex, idx) {
  const min = idxToMinutes(idx, dayIndex.dayStartMin);
  return minutesToTime(min);
}

