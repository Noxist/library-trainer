import { useEffect, useMemo, useState } from "react";

const STEP_TITLES = [
  "Dein Kürzel",
  "Deine Pünktlichkeit",
  "Warten ohne Raum",
  "Stabilität"
];

const BUCKETS = ["MORNING", "MIDDAY", "AFTERNOON", "EVENING"];

function SliderField({ label, value, min, max, onChange }) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-sm text-slate-700">
        <span>{label}</span>
        <span className="font-medium text-slate-900">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

export default function OnboardingModal({ open, profile, userId, onClose, onSave }) {
  const [step, setStep] = useState(0);
  const [draftUserId, setDraftUserId] = useState(userId || "");
  const [draftProfile, setDraftProfile] = useState(profile);


  useEffect(() => {
    if (!open) return;
    setDraftUserId(userId || "");
    setDraftProfile(profile);
    setStep(0);
  }, [open, userId, profile]);

  const canContinue = useMemo(() => {
    if (step === 0) return draftUserId.trim().length > 0;
    return true;
  }, [step, draftUserId]);

  if (!open) return null;

  function updateBucket(bucket, key, value) {
    setDraftProfile((prev) => ({
      ...prev,
      delayByBucket: {
        ...prev.delayByBucket,
        [bucket]: {
          ...prev.delayByBucket[bucket],
          [key]: value
        }
      }
    }));
  }

  function submit() {
    onSave({ ...draftProfile, userId: draftUserId || draftProfile.userId }, draftUserId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-900/50 p-0 md:items-center md:justify-center md:p-6">
      <div className="max-h-[95vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-xl md:max-w-2xl md:rounded-2xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Schritt {step + 1} / 4</p>
            <h2 className="text-xl font-semibold text-slate-900">{STEP_TITLES[step]}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600">Schliessen</button>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Bitte gib ein Kürzel ein. So bleiben deine Einstellungen lokal gespeichert.</p>
            <input
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
              placeholder="z. B. leandro"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Morgens oft später, abends stabiler. Das Modell nutzt das für Check-in Risiko (15-Minuten-Regel).</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {BUCKETS.map((bucket) => (
                <div key={bucket} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">{bucket}</p>
                  <div className="space-y-3">
                    <SliderField
                      label="Ø Verspätung (Min)"
                      value={draftProfile.delayByBucket[bucket].meanMin}
                      min={0}
                      max={15}
                      onChange={(v) => updateBucket(bucket, "meanMin", v)}
                    />
                    <SliderField
                      label="Schwankung (Std Min)"
                      value={draftProfile.delayByBucket[bucket].stdMin}
                      min={0}
                      max={10}
                      onChange={(v) => updateBucket(bucket, "stdMin", v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SliderField
              label="Ab wann wird Warten richtig mühsam?"
              value={draftProfile.gapAnnoyance.shortBrutalFromMin}
              min={5}
              max={45}
              onChange={(v) => setDraftProfile((prev) => ({
                ...prev,
                gapAnnoyance: { ...prev.gapAnnoyance, shortBrutalFromMin: v }
              }))}
            />
            <SliderField
              label="Ab wann ist eine Lücke leichter auszuhalten?"
              value={draftProfile.gapAnnoyance.longOkFromMin}
              min={30}
              max={180}
              onChange={(v) => setDraftProfile((prev) => ({
                ...prev,
                gapAnnoyance: { ...prev.gapAnnoyance, longOkFromMin: v }
              }))}
            />
            <p className="text-sm text-slate-600">Kurze Lücken sind brutal. Lange Lücken sind nervig, aber weniger schlimm pro Minute.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-sm text-slate-700">
            <p>Stabilität misst: wie wenig Umziehen und wie lange zusammenhängend du arbeiten kannst.</p>
            <p>Viele kurze Blöcke und viele verschiedene Räume wirken instabil.</p>
            <div className="rounded-xl bg-slate-50 p-3">
              <p>Beispiel A: 1 Raum, 3 lange Blöcke → eher stabil</p>
              <p>Beispiel B: 4 Räume, viele kurze Blöcke → eher instabil</p>
            </div>
            <SliderField
              label="Produktivitätsverlust pro Raumwechsel (Min)"
              value={draftProfile.switchAnnoyance.switchLossMin}
              min={5}
              max={25}
              onChange={(v) => setDraftProfile((prev) => ({
                ...prev,
                switchAnnoyance: { ...prev.switchAnnoyance, switchLossMin: v }
              }))}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={step === 0}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Zurück
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => prev + 1)}
              disabled={!canContinue}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              Weiter
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Start Training
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
