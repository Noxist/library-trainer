// src/engine/dayIndex.js
import { timeToMinutes } from "./time.js";

export function listDays(dataset) {
  return Object.keys(dataset.days || {}).sort();
}

export function buildDayIndexForDay(dataset, day) {
  const roomsObj = dataset.days?.[day];
  if (!roomsObj) throw new Error(`Day not found: ${day}`);

  const roomIds = Object.keys(roomsObj);
  if (roomIds.length === 0) throw new Error(`No rooms for day: ${day}`);

  const sampleRoom = roomsObj[roomIds[0]];
  const slotTimes = Object.keys(sampleRoom.slots).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const dayStartMin = timeToMinutes(slotTimes[0]);
  const dayEndMin = timeToMinutes(slotTimes[slotTimes.length - 1]) + 15;

  const slotsByRoom = new Map();
  const freeRunsByRoom = new Map();

  for (const r of roomIds) {
    const slotsObj = roomsObj[r].slots;
    const arr = new Uint8Array(slotTimes.length);
    for (let i = 0; i < slotTimes.length; i++) {
      const t = slotTimes[i];
      // 0 = frei, 1 = besetzt
      arr[i] = slotsObj[t] ? 1 : 0;
    }
    slotsByRoom.set(r, arr);
    freeRunsByRoom.set(r, computeFreeRuns(arr));
  }

  return {
    day,
    roomIds,
    slotTimes,
    dayStartMin,
    dayEndMin,
    slotsByRoom,
    freeRunsByRoom
  };
}

function computeFreeRuns(occArr) {
  const runs = [];
  let i = 0;
  while (i < occArr.length) {
    while (i < occArr.length && occArr[i] === 1) i++;
    const start = i;
    while (i < occArr.length && occArr[i] === 0) i++;
    const end = i;
    if (end > start) runs.push({ startIdx: start, endIdx: end });
  }
  return runs;
}

