export const ROOM_META = {
  "A-204": 16,
  "A-206": 10,
  "A-231": 10,
  "A-233": 10,
  "A-235": 10,
  "A-237": 6,
  "A-241": 10,
  "D-202": 10,
  "D-204": 16,
  "D-206": 10,
  "D-231": 10,
  "D-233": 10,
  "D-235": 10,
  "D-237": 6,
  "D-239": 10,
  "D-243": 10
};

export function getSeats(room) {
  return Object.prototype.hasOwnProperty.call(ROOM_META, room) ? ROOM_META[room] : null;
}

export function getRoomSizeLabel(seats) {
  if (typeof seats !== "number") return "mittel";
  if (seats <= 6) return "klein";
  if (seats <= 10) return "mittel";
  if (seats >= 16) return "gross";
  return "mittel";
}
