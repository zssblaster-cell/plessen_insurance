import { useState, useEffect, useCallback, useRef } from "react";
import {
  doc, onSnapshot, setDoc, getDoc,
  serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase.js";

const MAX_ENTRIES_PER_CHUNK = 400;
const MAX_BYTES_PER_CHUNK   = 700_000;

function clinicDoc(docId) {
  return doc(db, "plessen", docId);
}

function chunkDocId(payerName, idx) {
  return "sched_" + payerName.toLowerCase().replace(/[\s/]+/g, "_") + "_" + idx;
}

export function chunkSchedule(scheduleObj) {
  const entries = Object.entries(scheduleObj || {});
  const chunks = [];
  let cur = {}, curBytes = 0;
  for (const [cpt, val] of entries) {
    const bytes = JSON.stringify({ [cpt]: val }).length;
    if ((curBytes + bytes > MAX_BYTES_PER_CHUNK || Object.keys(cur).length >= MAX_ENTRIES_PER_CHUNK)
        && Object.keys(cur).length > 0) {
      chunks.push(cur); cur = {}; curBytes = 0;
    }
    cur[cpt] = val; curBytes += bytes;
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
      if (snap.exists()) setValue(snap.data().data ?? defaultValue);
      else { setDoc(clinicDoc(docId), { data: defaultValue, updatedAt: serverTimestamp() }).catch(console.error); setValue(defaultValue); }
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

// ─── Schedules hook ──────────────────────────────────────────────────────────
//
// Firestore layout:
//   plessen/active_rates  → { payerName: { CPT: {rate,units} }, ... }
//                           Only contains CPT codes tracked in items.
//                           This is what the app reads on startup and in real time.
//                           Updated whenever a file is uploaded.
//
//   plessen/sched_index   → { payerName: ["sched_triple_s_0", ...] }
//   plessen/sched_*_N     → { data: { CPT: {rate,units} } }  (full schedule chunks)
//                           Only fetched on-demand (View Parsed).
//
// Key design:
//   - active_rates has an onSnapshot listener → any write to it updates the UI instantly
//   - writeFullUpload writes chunks first, then writes active_rates → triggers the listener
//   - No INIT_SCHEDULES seeding — if active_rates is empty for a payer, that payer
//     shows as unpriced until a file is uploaded

export function useSchedules(payerNames) {
  const [schedules,  setSchedulesState] = useState(() => {
    const s = {}; payerNames.forEach(p => { s[p] = {}; }); return s;
  });
  const [ready, setReady] = useState(false);
  const indexRef     = useRef({});
  const fullCacheRef = useRef({});

  // ── Real-time listener on active_rates ────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      clinicDoc("active_rates"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // Merge into per-payer structure, strip updatedAt
          const merged = {};
          payerNames.forEach(p => { merged[p] = data[p] || {}; });
          setSchedulesState(merged);
        }
        // If doc doesn't exist yet that's fine — stays empty until upload
        setReady(true);
      },
      (err) => {
        console.error("active_rates listener:", err);
        setReady(true);
      }
    );
    return () => unsub();
  }, []); // eslint-disable-line

  // ── setSchedules: for manual edits in FSM ─────────────────────────────────
  // Writes only the changed payers' entries to active_rates
  const setSchedules = useCallback((updaterOrValue) => {
    setSchedulesState(prev => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
      const changedPayers = payerNames.filter(p => next[p] !== prev[p]);
      if (changedPayers.length === 0) return next;

      (async () => {
        try {
          // Read current active_rates, merge changed payers, write back
          const arSnap = await getDoc(clinicDoc("active_rates"));
          const existing = arSnap.exists() ? arSnap.data() : {};
          const update = { ...existing, updatedAt: serverTimestamp() };
          changedPayers.forEach(p => { update[p] = next[p] || {}; });
          await setDoc(clinicDoc("active_rates"), update, { merge: true });
          // onSnapshot listener will pick this up and update state automatically
        } catch (err) {
          console.error("setSchedules write:", err);
        }
      })();

      return next;
    });
  }, [payerNames]); // eslint-disable-line

  // ── writeFullUpload: called after file parse ───────────────────────────────
  // 1. Chunk and save the full schedule
  // 2. Extract tracked CPTs → write to active_rates
  // 3. onSnapshot fires → schedules state updates instantly in UI
  const writeFullUpload = useCallback(async (payerName, fullParsed, trackedCpts) => {
    try {
      // Step 1: chunk the full schedule
      const chunks = chunkSchedule(fullParsed);
      const docIds = chunks.map((_, i) => chunkDocId(payerName, i));
      const batch  = writeBatch(db);
      chunks.forEach((chunk, i) => {
        batch.set(clinicDoc(docIds[i]), { data: chunk, updatedAt: serverTimestamp() });
      });

      // Step 2: update the index
      const idxSnap  = await getDoc(clinicDoc("sched_index"));
      const newIndex = { ...(idxSnap.exists() ? idxSnap.data() : {}), [payerName]: docIds };
      batch.set(clinicDoc("sched_index"), { ...newIndex, updatedAt: serverTimestamp() });

      // Step 3: extract tracked CPTs and write to active_rates
      // trackedCpts is passed in fresh from the caller so it's always current
      const lean = {};
      const cptSet = new Set(trackedCpts.map(c => c.toUpperCase()));
      Object.entries(fullParsed).forEach(([cpt, val]) => {
        if (cptSet.has(cpt.toUpperCase())) lean[cpt.toUpperCase()] = val;
      });

      // Read current active_rates and merge
      const arSnap   = await getDoc(clinicDoc("active_rates"));
      const existing = arSnap.exists() ? arSnap.data() : {};
      const newAr    = { ...existing, [payerName]: lean, updatedAt: serverTimestamp() };
      batch.set(clinicDoc("active_rates"), newAr);

      await batch.commit();

      // Update refs
      indexRef.current = newIndex;
      fullCacheRef.current[payerName] = fullParsed;

      // onSnapshot on active_rates will fire automatically and update schedules state
      console.log(`✓ ${payerName}: ${chunks.length} chunk(s), ${Object.keys(fullParsed).length} total codes, ${Object.keys(lean).length} tracked`);

      return {
        chunks: chunks.length,
        total:   Object.keys(fullParsed).length,
        tracked: Object.keys(lean).length,
      };
    } catch (err) {
      console.error(`writeFullUpload ${payerName}:`, err);
      throw err;
    }
  }, []); // eslint-disable-line

  // ── loadFullSchedule: on-demand, only for View Parsed ─────────────────────
  const loadFullSchedule = useCallback(async (payerName) => {
    if (fullCacheRef.current[payerName]) return fullCacheRef.current[payerName];
    try {
      const idxSnap = await getDoc(clinicDoc("sched_index"));
      const docIds  = idxSnap.exists() ? (idxSnap.data()[payerName] || []) : [];
      if (docIds.length === 0) return {};
      const snaps = await Promise.all(docIds.map(id => getDoc(clinicDoc(id))));
      const full  = stitchChunks(snaps.map(s => s.exists() ? (s.data().data || {}) : {}));
      fullCacheRef.current[payerName] = full;
      return full;
    } catch (err) {
      console.error(`loadFullSchedule ${payerName}:`, err);
      return {};
    }
  }, []);

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
