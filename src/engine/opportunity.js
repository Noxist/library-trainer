// Gap >= 60 min => Info-Listen
export function scanOpportunities(dayIndex, atIdx) {
  const stableFreeRooms = [];
  const imminentLossRooms = [];
  const recentlyVacatedRooms = [];

  for (const r of dayIndex.roomIds) {
    const occ = dayIndex.slotsByRoom.get(r);
    if (!occ) continue;

    const now = occ[atIdx] ?? 1;
    const prev = atIdx > 0 ? occ[atIdx - 1] : 1;
    const next = atIdx + 1 < occ.length ? occ[atIdx + 1] : 1;

    // 0 frei, 1 besetzt
    if (prev === 1 && now === 0) recentlyVacatedRooms.push(r);
    if (now === 0 && next === 1) imminentLossRooms.push(r);

    // stabil frei: ab jetzt noch mindestens 4 Slots (=60min) frei
    if (now === 0) {
      let freeCount = 0;
      for (let k = atIdx; k < occ.length && occ[k] === 0; k++) freeCount++;
      if (freeCount >= 4) stableFreeRooms.push(r);
    }
  }

  return { stableFreeRooms, imminentLossRooms, recentlyVacatedRooms };
}

