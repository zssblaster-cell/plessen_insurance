import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";

// Firestore paths (2 segments each — valid):
//   plessen/items
//   plessen/payers
//   plessen/settings
//   plessen/sched_triple_s   ← one doc per payer (avoids 1MB limit)
//   plessen/sched_aetna
//   plessen/sched_elan
//   plessen/sched_uhc
//   plessen/sched_cigna
//   plessen/sched_medicare
//   plessen/sched_medicaid
//   plessen/sched_mapfre

function clinicDoc(docId) {
  return doc(db, "plessen", docId);
}

// Map payer name → Firestore doc id
function schedDocId(payerName) {
  return "sched_" + payerName.toLowerCase().replace(/[\s/]+/g, "_");
}

// Debounce helper
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ─── Generic clinic document hook ─────────────────────────────────────────────
export function useClinicData(docId, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [ready, setReady] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const writeToFirestore = useCallback(
    debounce(async (newValue) => {
      try {
        await setDoc(
          clinicDoc(docId),
          { data: newValue, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        console.error(`Firestore write ${docId}:`, err);
      }
    }, 800),
    [docId]
  );

  useEffect(() => {
    const ref = clinicDoc(docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setValue(snap.data().data ?? defaultValue);
        } else {
          setDoc(ref, { data: defaultValue, updatedAt: serverTimestamp() }).catch(console.error);
          setValue(defaultValue);
        }
        setReady(true);
      },
      (err) => {
        console.error(`Firestore ${docId} listener error:`, err);
        setValue(defaultValue);
        setReady(true);
      }
    );
    return () => unsub();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setData = useCallback((updaterOrValue) => {
    setValue(prev => {
      const next = typeof updaterOrValue === "function"
        ? updaterOrValue(prev)
        : updaterOrValue;
      writeToFirestore(next);
      return next;
    });
  }, [writeToFirestore]);

  return [value, setData, ready];
}

// ─── Schedules hook — one Firestore doc per payer ─────────────────────────────
// The rest of the app sees a single `schedules` object: { "Triple S": {...}, "Aetna": {...}, ... }
// Internally each payer's rates live in their own Firestore document to stay under the 1MB limit.
export function useSchedules(payerNames, initSchedules) {
  // Combined schedules object visible to the app
  const [schedules, setSchedulesState] = useState(initSchedules);
  // Track readiness per payer
  const [readySet, setReadySet] = useState(new Set());
  const ready = readySet.size >= payerNames.length;

  useEffect(() => {
    const unsubs = payerNames.map(payerName => {
      const docId = schedDocId(payerName);
      const ref   = clinicDoc(docId);
      const init  = initSchedules[payerName] || {};

      return onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data().data ?? {};
            setSchedulesState(prev => ({ ...prev, [payerName]: data }));
          } else {
            // Seed with initial data for this payer
            setDoc(ref, { data: init, updatedAt: serverTimestamp() }).catch(console.error);
            setSchedulesState(prev => ({ ...prev, [payerName]: init }));
          }
          setReadySet(prev => new Set([...prev, payerName]));
        },
        (err) => {
          console.error(`Firestore sched ${payerName} error:`, err);
          setSchedulesState(prev => ({ ...prev, [payerName]: init }));
          setReadySet(prev => new Set([...prev, payerName]));
        }
      );
    });

    return () => unsubs.forEach(u => u());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // setSchedules: accepts full schedules object or updater function
  // Writes only the payers that actually changed, one doc per payer
  const setSchedules = useCallback((updaterOrValue) => {
    setSchedulesState(prev => {
      const next = typeof updaterOrValue === "function"
        ? updaterOrValue(prev)
        : updaterOrValue;

      // Write only changed payer docs
      payerNames.forEach(payerName => {
        const prevData = prev[payerName];
        const nextData = next[payerName];
        if (nextData !== prevData) {
          const docId = schedDocId(payerName);
          setDoc(
            clinicDoc(docId),
            { data: nextData || {}, updatedAt: serverTimestamp() },
            { merge: true }
          ).catch(err => console.error(`Firestore write sched ${payerName}:`, err));
        }
      });

      return next;
    });
  }, [payerNames]); // eslint-disable-line react-hooks/exhaustive-deps

  return [schedules, setSchedules, ready];
}

// ─── Settings hook ─────────────────────────────────────────────────────────────
export function useSettings() {
  const [targetPct, setTargetPctState] = useState(30);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ref = clinicDoc("settings");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setTargetPctState(snap.data().targetPct ?? 30);
      } else {
        setDoc(ref, { targetPct: 30, updatedAt: serverTimestamp() }).catch(console.error);
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  const setTargetPct = useCallback(async (pct) => {
    setTargetPctState(pct);
    try {
      await setDoc(
        clinicDoc("settings"),
        { targetPct: pct, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error("Firestore settings write:", err);
    }
  }, []);

  return [targetPct, setTargetPct, ready];
}
