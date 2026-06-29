import { useState, useEffect, useCallback, useRef } from "react";
import {
  doc, onSnapshot, setDoc, getDoc,
  serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ENTRIES_PER_CHUNK = 400;
const MAX_BYTES_PER_CHUNK   = 700_000;

function clinicDoc(docId) {
  return doc(db, "plessen", docId);
}

function chunkDocId(payerName, idx) {
  return "sched_" + payerName.toLowerCase().replace(/[\s/]+/g, "_") + "_" + idx;
}

// ─── Chunk helpers ────────────────────────────────────────────────────────────
export function chunkSchedule(scheduleObj) {
  const entries = Object.entries(scheduleObj);
  const chunks  = [];
  let cur = {}, curBytes = 0;

  for (const [cpt, val] of entries) {
    const bytes = JSON.stringify({ [cpt]: val }).length;
    if ((curBytes + bytes > MAX_BYTES_PER_CHUNK || Object.keys(cur).length >= MAX_ENTRIES_PER_CHUNK)
        && Object.keys(cur).length > 0) {
      chunks.push(cur);
      cur = {}; curBytes = 0;
    }
    cur[cpt] = val;
    curBytes += bytes;
  }
  if (Object.keys(cur).length > 0) chunks.push(cur);
  return chunks;
}

function stitchChunks(arr) {
  const r = {};
  arr.forEach(c => Object.assign(r, c));
  return r;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ─── Generic clinic document hook ────────────────────────────────────────────
export function useClinicData(docId, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [ready, setReady] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const write = useCallback(debounce(async (v) => {
    try {
      await setDoc(clinicDoc(docId), { data: v, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.error(`Firestore write ${docId}:`, e); }
  }, 800), [docId]);

  useEffect(() => {
    const unsub = onSnapshot(clinicDoc(docId), snap => {
      if (snap.exists()) {
        setValue(snap.data().data ?? defaultValue);
      } else {
        setDoc(clinicDoc(docId), { data: defaultValue, updatedAt: serverTimestamp() }).catch(console.error);
        setValue(defaultValue);
      }
      setReady(true);
    }, err => { console.error(`Firestore ${docId}:`, err); setValue(defaultValue); setReady(true); });
    return () => unsub();
  }, [docId]); // eslint-disable-line

  const setData = useCallback((uov) => {
    setValue(prev => {
      const next = typeof uov === "function" ? uov(prev) : uov;
      write(next);
      return next;
    });
  }, [write]);

  return [value, setData, ready];
}

// ─── Lean active-rates hook ───────────────────────────────────────────────────
// On startup: only loads rates for CPT codes actually in `trackedCpts`.
// Full chunks are loaded on-demand via loadFullSchedule().
//
// Firestore layout:
//   plessen/sched_index   → { payerName: ["docId0","docId1",...], ... }
//   plessen/sched_*_0     → { data: { CPT: {rate,units} } }
//   plessen/active_rates  → { payerName: { CPT: {rate,units} } }  ← fast-load doc

export function useSchedules(payerNames, initSchedules, trackedCpts) {
  // schedules = lean view: only tracked CPTs (used by cards + FSM rate display)
  const [schedules,    setSchedulesState] = useState(() => {
    const s = {};
    payerNames.forEach(p => { s[p] = {}; });
    return s;
  });
  const [ready,        setReady]    = useState(false);
  const indexRef       = useRef({});   // { payerName: [docId, ...] }
  const fullCacheRef   = useRef({});   // { payerName: fullScheduleObj } — populated lazily

  // ── Startup: load active_rates doc (lean, fast) then seed if missing ────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Read index
        const idxSnap = await getDoc(clinicDoc("sched_index"));
        const index   = idxSnap.exists() ? idxSnap.data() : {};
        indexRef.current = index;

        // 2. Read active_rates (fast path — just tracked CPTs)
        const arSnap = await getDoc(clinicDoc("active_rates"));

        if (arSnap.exists() && Object.keys(arSnap.data()).some(k => payerNames.includes(k))) {
          // Active rates exist — use them directly
          if (!cancelled) {
            const ar = arSnap.data();
            setSchedulesState(ar);
            setReady(true);
          }
        } else {
          // First run — seed from initSchedules for tracked CPTs only
          const seedBatch  = writeBatch(db);
          const newIndex   = { ...index };
          const activeRates = {};

          for (const payerName of payerNames) {
            const full = initSchedules[payerName] || {};
            // Write full chunks
            const chunks = chunkSchedule(full);
            const docIds = chunks.map((_, i) => chunkDocId(payerName, i));
            chunks.forEach((chunk, i) => {
              seedBatch.set(clinicDoc(docIds[i]), { data: chunk, updatedAt: serverTimestamp() });
            });
            newIndex[payerName] = docIds;

            // Extract only tracked CPTs for active_rates
            const lean = {};
            trackedCpts.forEach(cpt => {
              const cptU = cpt.toUpperCase();
              if (full[cptU]) lean[cptU] = full[cptU];
            });
            activeRates[payerName] = lean;
          }

          seedBatch.set(clinicDoc("sched_index"),   { ...newIndex,   updatedAt: serverTimestamp() });
          seedBatch.set(clinicDoc("active_rates"),   { ...activeRates, updatedAt: serverTimestamp() });
          await seedBatch.commit();
          indexRef.current = newIndex;

          if (!cancelled) {
            setSchedulesState(activeRates);
            setReady(true);
          }
        }
      } catch (err) {
        console.error("useSchedules init error:", err);
        if (!cancelled) {
          // Fall back to init schedules for tracked codes
          const fallback = {};
          payerNames.forEach(p => {
            const full = initSchedules[p] || {};
            const lean = {};
            trackedCpts.forEach(cpt => {
              const u = cpt.toUpperCase();
              if (full[u]) lean[u] = full[u];
            });
            fallback[p] = lean;
          });
          setSchedulesState(fallback);
          setReady(true);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // ── setSchedules: update lean view + persist active_rates + re-chunk full ──
  const setSchedules = useCallback((updaterOrValue) => {
    setSchedulesState(prev => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;

      // Persist active_rates and re-chunk changed payers
      const changedPayers = payerNames.filter(p => next[p] !== prev[p]);
      if (changedPayers.length === 0) return next;

      (async () => {
        try {
          const batch    = writeBatch(db);
          const newIndex = { ...indexRef.current };

          for (const payerName of changedPayers) {
            const data = next[payerName] || {};

            // Re-chunk the full data for this payer
            // If we have a full cache use that merged with changes, else just use data
            const fullData = fullCacheRef.current[payerName]
              ? { ...fullCacheRef.current[payerName], ...data }
              : data;

            const chunks = chunkSchedule(fullData);
            const docIds = chunks.map((_, i) => chunkDocId(payerName, i));
            chunks.forEach((chunk, i) => {
              batch.set(clinicDoc(docIds[i]), { data: chunk, updatedAt: serverTimestamp() });
            });
            newIndex[payerName] = docIds;

            // Update full cache ref
            fullCacheRef.current[payerName] = fullData;
          }

          // Update index and active_rates
          batch.set(clinicDoc("sched_index"),  { ...newIndex, updatedAt: serverTimestamp() });
          batch.set(clinicDoc("active_rates"), { ...next,     updatedAt: serverTimestamp() });
          await batch.commit();
          indexRef.current = newIndex;
        } catch (err) {
          console.error("setSchedules write error:", err);
        }
      })();

      return next;
    });
  }, [payerNames]); // eslint-disable-line

  // ── loadFullSchedule: on-demand — used only by ViewParsedModal ───────────────
  const loadFullSchedule = useCallback(async (payerName) => {
    // Return from cache if available
    if (fullCacheRef.current[payerName]) return fullCacheRef.current[payerName];

    try {
      const docIds    = indexRef.current[payerName] || [];
      if (docIds.length === 0) return {};
      const snaps     = await Promise.all(docIds.map(id => getDoc(clinicDoc(id))));
      const full      = stitchChunks(snaps.map(s => s.exists() ? (s.data().data || {}) : {}));
      fullCacheRef.current[payerName] = full;
      return full;
    } catch (err) {
      console.error(`loadFullSchedule ${payerName}:`, err);
      return {};
    }
  }, []);

  // ── writeFullUpload: called after parse — writes chunks + updates active_rates
  const writeFullUpload = useCallback(async (payerName, fullParsed) => {
    try {
      const chunks   = chunkSchedule(fullParsed);
      const docIds   = chunks.map((_, i) => chunkDocId(payerName, i));
      const batch    = writeBatch(db);

      chunks.forEach((chunk, i) => {
        batch.set(clinicDoc(docIds[i]), { data: chunk, updatedAt: serverTimestamp() });
      });

      const newIndex = { ...indexRef.current, [payerName]: docIds };
      batch.set(clinicDoc("sched_index"), { ...newIndex, updatedAt: serverTimestamp() });

      // Extract only tracked CPTs for active_rates
      const lean = {};
      trackedCpts.forEach(cpt => {
        const u = cpt.toUpperCase();
        if (fullParsed[u]) lean[u] = fullParsed[u];
      });

      // Update active_rates for this payer
      const arSnap = await getDoc(clinicDoc("active_rates"));
      const existing = arSnap.exists() ? arSnap.data() : {};
      const newAr = { ...existing, [payerName]: lean, updatedAt: serverTimestamp() };
      batch.set(clinicDoc("active_rates"), newAr);

      await batch.commit();
      indexRef.current = newIndex;
      fullCacheRef.current[payerName] = fullParsed;

      // Update local state with the lean view
      setSchedulesState(prev => ({ ...prev, [payerName]: lean }));

      return { chunks: chunks.length, total: Object.keys(fullParsed).length, tracked: Object.keys(lean).length };
    } catch (err) {
      console.error(`writeFullUpload ${payerName}:`, err);
      throw err;
    }
  }, [trackedCpts]); // eslint-disable-line

  return [schedules, setSchedules, ready, loadFullSchedule, writeFullUpload];
}

// ─── Settings hook ────────────────────────────────────────────────────────────
export function useSettings() {
  const [targetPct, setTargetPctState] = useState(30);
  const [ready,     setReady]          = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(clinicDoc("settings"), snap => {
      if (snap.exists()) setTargetPctState(snap.data().targetPct ?? 30);
      else setDoc(clinicDoc("settings"), { targetPct: 30, updatedAt: serverTimestamp() }).catch(console.error);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const setTargetPct = useCallback(async (pct) => {
    setTargetPctState(pct);
    try {
      await setDoc(clinicDoc("settings"), { targetPct: pct, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.error("settings write:", e); }
  }, []);

  return [targetPct, setTargetPct, ready];
}
