// src/engine/perfectioningGenerator.js

// Wir definieren Archetypen basierend auf deinem Report (Blind Spots & Redundanzen)
const SCENARIOS = [
  {
    name: "Wait vs. Distance Extrem",
    desc: "Testet: Ist Warten schlimmer als Laufen? (Füllt Blind Spot)",
    gen: () => {
      // A: Viel Laufen (300m), keine Wartezeit
      // B: Kein Laufen, viel Wartezeit (45 Min)
      return generatePair({
        distA: 0.5, waitA: 0.0, 
        distB: 0.0, waitB: 4.5  // ca 45 min penalty
      });
    }
  },
  {
    name: "Switch Stress Test",
    desc: "Testet: Kurze Blöcke mit vielen Wechseln vs. langer Block",
    gen: () => {
      // A: 3 Wechsel, aber 6h Zeit
      // B: 0 Wechsel, aber nur 4h Zeit
      return generatePair({
        switchA: 9.0, coverA: 360, // 3^2 = 9 Penalty
        switchB: 0.0, coverB: 240
      });
    }
  },
  {
    name: "Redundancy Breaker: Plan vs. Cover",
    desc: "Testet: Ist es schlimmer, das Ziel zu verfehlen oder gar nicht erst zu planen?",
    gen: () => {
      // Dein Report sagt: Planned & Covered korrelieren zu 100%. Wir brechen das.
      // A: Geplant 8h, Bekommen 4h (Enttäuschung)
      // B: Geplant 4h, Bekommen 4h (Erfüllung)
      // Wenn User A wählt: "Hauptsache 4h, der Plan ist egal". 
      // Wenn User B wählt: "Ich hasse es, wenn mein Plan nicht aufgeht."
      return generatePair({
        planA: 480, coverA: 240,
        planB: 240, coverB: 240
      });
    }
  },
  {
    name: "Switch Efficiency",
    desc: "Testet: Ist der Wechsel an sich schlimm oder der Zeitverlust?",
    gen: () => {
      // Report: switchPenalty <-> productiveLossMin (0.95 Korrelation).
      // Wir simulieren einen Wechsel ohne Zeitverlust (z.B. Raum direkt daneben)
      // A: 1 Wechsel, 0 Min Verlust
      // B: 0 Wechsel
      return generatePair({
        switchA: 1.0, lossA: 0.0,
        switchB: 0.0, lossB: 0.0
      });
    }
  }
];

function generatePair(overrides) {
  // Standard-Werte (langweilige Mitte)
  const base = {
    distanceNorm: 0.1,    // 60m
    waitPenalty: 0.0,
    switchPenalty: 0.0,
    stabilityPenalty: 0.0,
    productiveLossMin: 0.0,
    riskLateMin: 0.0,
    totalPlannedMin: 480, // 8h
    totalCoveredMin: 480
  };

  // Mappe die Kurznamen aus den Scenarios auf die echten Feature-Namen
  const mapKey = (k) => {
    if(k.startsWith("dist")) return "distanceNorm";
    if(k.startsWith("wait")) return "waitPenalty";
    if(k.startsWith("switch")) return "switchPenalty";
    if(k.startsWith("stab")) return "stabilityPenalty";
    if(k.startsWith("loss")) return "productiveLossMin";
    if(k.startsWith("risk")) return "riskLateMin";
    if(k.startsWith("plan")) return "totalPlannedMin";
    if(k.startsWith("cover")) return "totalCoveredMin";
    return k;
  };

  const featA = { ...base };
  const featB = { ...base };

  // Overrides anwenden
  Object.keys(overrides).forEach(k => {
    const val = overrides[k];
    const key = mapKey(k);
    if (k.endsWith("A")) featA[key] = val;
    if (k.endsWith("B")) featB[key] = val;
  });

  return { featA, featB };
}

// Erstellt "Fake"-Strategie-Objekte für die UI basierend auf den Features
export function featuresToStrategyDisplay(feat) {
  const steps = [];
  
  // Startzeit simulieren
  let currentTime = 8 * 60; // 08:00

  // 1. Wartezeit visualisieren
  if (feat.waitPenalty > 0.5) {
     // Grobe Rückrechnung: waitPenalty ist nicht linear, aber wir faken es für die UI
     const mins = Math.min(120, Math.round(feat.waitPenalty * 10)); 
     currentTime += mins;
  }

  // 2. Räume visualisieren (Switches)
  // switchPenalty = N^2. Also Wurzel ziehen für Anzahl.
  const numSwitches = Math.round(Math.sqrt(feat.switchPenalty || 0));
  const rooms = ["A-111 (Sim)", "B-222 (Sim)", "C-333 (Sim)", "D-444 (Sim)"];
  
  // Arbeitszeit verteilen
  const totalWork = feat.totalCoveredMin;
  const blockLen = Math.floor(totalWork / (numSwitches + 1));

  for(let i=0; i <= numSwitches; i++) {
    const start = currentTime;
    const end = start + blockLen;
    steps.push({
      room: rooms[i % rooms.length],
      start: minToTime(start),
      end: minToTime(end),
      duration: blockLen
    });
    currentTime = end + (feat.productiveLossMin / (numSwitches+1)); // Pause simulieren
  }

  return {
    steps,
    totalDuration: feat.totalCoveredMin,
    // Metadaten für die Cards
    forcedStats: {
        switches: numSwitches,
        distance: Math.round(feat.distanceNorm * 600) + "m",
        gap: feat.waitPenalty > 1 ? "Große Lücke" : "Keine",
        planned: feat.totalPlannedMin + " min"
    }
  };
}

function minToTime(m) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${h.toString().padStart(2,0)}:${min.toString().padStart(2,0)}`;
}

export function getNextPerfectionCase(index) {
  const scenario = SCENARIOS[index % SCENARIOS.length];
  const { featA, featB } = scenario.gen();
  
  // Leichtes Rauschen hinzufügen, damit nicht alle Fragen exakt gleich sind
  addNoise(featA);
  addNoise(featB);

  return {
    scenarioName: scenario.name,
    description: scenario.desc,
    featA,
    featB
  };
}

function addNoise(f) {
  f.distanceNorm += (Math.random() - 0.5) * 0.05;
  f.totalCoveredMin += Math.round((Math.random() - 0.5) * 15);
}
