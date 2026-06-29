import { useState, useEffect, useRef } from "react";
import { useClinicData, useSchedules, useSettings } from "./useFirestore.js";
import * as XLSX from "xlsx";

// ─── UNPRICED RULES ──────────────────────────────────────────────────────────
const UNPRICED_RULES = {
  "Triple S":       { type:"pct_hawaii_cms", pct:2.75, label:"275% of Hawaii CMS" },
  "Aetna":          { type:"pct_billed",     pct:0.90, label:"90% of billed charge" },
  "ELAN":           { type:"pct_hawaii_cms", pct:3.50, label:"350% of Hawaii CMS" },
  "UHC":            { type:"pct_billed",     pct:0.90, label:"90% of billed charge" },
  "Cigna":          { type:"pct_billed",     pct:0.50, label:"50% of billed charge" },
  "MAPFRE":         { type:"pct_billed",     pct:0.80, label:"80% of billed charge" },
  "Optimum Global": { type:"pct_hawaii_cms", pct:3.50, label:"350% Hawaii CMS (or 90% billed)" },
  "Medicare":       { type:"medicare",       pct:1.00, label:"CMS published rate" },
  "Medicaid":       { type:"pct_medicare",   pct:1.00, label:"100% of Medicare" },
};

// ─── FEE SCHEDULES ───────────────────────────────────────────────────────────
// Each entry: { [CPT]: { rate: number, units: number } }  OR legacy number (rate only, units=1)
const INIT_SCHEDULES = {
  "Triple S": {
    "67028":{rate:1252.70,units:1},"65855":{rate:2366.56,units:1},"66821":{rate:1980.43,units:1},
    "66761":{rate:2828.03,units:1},"67228":{rate:5819.32,units:1},"67210":{rate:3872.06,units:1},
    "66710":{rate:1560.66,units:1},"66984":{rate:4244.72,units:1},"66982":{rate:6258.78,units:1},
    "66170":{rate:3620.46,units:1},"67036":{rate:8642.83,units:1},"67108":{rate:8862.13,units:1},
    "92134":{rate:76.95,units:1},"92083":{rate:309.42,units:1},"92250":{rate:149.93,units:1},
    "92136":{rate:122.94,units:1},"76514":{rate:18.84,units:1},"92020":{rate:176.24,units:1},
    "92004":{rate:976.76,units:1},"92014":{rate:534.12,units:1},"92012":{rate:295.99,units:1},
    "99214":{rate:191.04,units:1},"99213":{rate:138.57,units:1},
    "J9035":{rate:260.29,units:1},"J0178":{rate:3602.48,units:1},"J7312":{rate:738.93,units:1},
    "J3301":{rate:6.64,units:1},"J2778":{rate:1424.29,units:1},
  },
  "Aetna": {
    "67028":{rate:1353.43,units:1},"65855":{rate:2434.65,units:1},"66821":{rate:2035.77,units:1},
    "66761":{rate:2908.93,units:1},"67228":{rate:6280.70,units:1},"67210":{rate:4178.55,units:1},
    "66710":{rate:1605.26,units:1},"66984":{rate:4758.63,units:1},"66982":{rate:6433.21,units:1},
    "66170":{rate:3720.08,units:1},"67036":{rate:5815.43,units:1},"67108":{rate:9567.12,units:1},
    "92083":{rate:516.85,units:1},"92250":{rate:503.90,units:1},"92136":{rate:161.74,units:1},
    "76514":{rate:6.08,units:1},"92020":{rate:189.71,units:1},"92004":{rate:957.08,units:1},
    "92014":{rate:575.22,units:1},"92012":{rate:321.05,units:1},"99214":{rate:296.73,units:1},"99213":{rate:216.47,units:1},
  },
  "ELAN": {
    "67028":{rate:881.25,units:1},"65855":{rate:2215.75,units:1},"66821":{rate:1833.27,units:1},
    "66761":{rate:2705.07,units:1},"67228":{rate:3916.58,units:1},"67210":{rate:2604.91,units:1},
    "66710":{rate:1519.38,units:1},"66984":{rate:3893.01,units:1},"66982":{rate:5740.31,units:1},
    "66170":{rate:3526.18,units:1},"67036":{rate:5509.08,units:1},"67108":{rate:8190.58,units:1},
    "92134":{rate:180.56,units:1},"92083":{rate:305.46,units:1},"92250":{rate:346.53,units:1},
    "92136":{rate:152.74,units:1},"76514":{rate:18.60,units:1},"92020":{rate:119.32,units:1},
    "92004":{rate:681.21,units:1},"92014":{rate:479.58,units:1},"92012":{rate:286.87,units:1},
    "99214":{rate:187.28,units:1},"99213":{rate:135.09,units:1},"J9035":{rate:185.97,units:1},
  },
  "UHC": {
    "67028":{rate:1233.00,units:1},"65855":{rate:2229.00,units:1},"66821":{rate:1947.00,units:1},
    "66761":{rate:2661.00,units:1},"67228":{rate:5427.00,units:1},"67210":{rate:3810.00,units:1},
    "66710":{rate:1534.00,units:1},"66984":{rate:4175.00,units:1},"66982":{rate:6156.00,units:1},
    "66170":{rate:3561.00,units:1},"67036":{rate:5566.00,units:1},"67108":{rate:8276.00,units:1},
    "92083":{rate:471.00,units:1},"92250":{rate:461.00,units:1},"92136":{rate:154.00,units:1},
    "76514":{rate:16.00,units:1},"92020":{rate:174.00,units:1},"92004":{rate:829.00,units:1},
    "92014":{rate:513.00,units:1},"92012":{rate:288.00,units:1},"99214":{rate:241.00,units:1},
    "99213":{rate:179.00,units:1},"J9035":{rate:187.00,units:1},
  },
  "Cigna": {
    "67028":{rate:668.17,units:1},"65855":{rate:1680.00,units:1},"66821":{rate:1390.00,units:1},
    "66761":{rate:2051.00,units:1},"67228":{rate:3103.21,units:1},"67210":{rate:1975.07,units:1},
    "66710":{rate:1142.77,units:1},"66984":{rate:2951.71,units:1},"66982":{rate:4352.35,units:1},
    "66170":{rate:2650.41,units:1},"67036":{rate:4141.98,units:1},"67108":{rate:5205.59,units:1},
    "92134":{rate:160.00,units:1},"92083":{rate:160.15,units:1},"92250":{rate:262.74,units:1},
    "92136":{rate:114.73,units:1},"76514":{rate:27.53,units:1},"92020":{rate:90.47,units:1},
    "92004":{rate:448.62,units:1},"92014":{rate:335.03,units:1},"92012":{rate:227.18,units:1},
    "99214":{rate:182.24,units:1},"99213":{rate:129.62,units:1},"J9035":{rate:120.20,units:1},
    "J0178":{rate:1470.75,units:1},"J7312":{rate:302.80,units:1},"J3301":{rate:3.71,units:1},"J2778":{rate:799.05,units:1},
  },
};

// Helper: get rate and units from a schedule entry (supports legacy number format)
function getSchedEntry(sched, cpt) {
  if (!sched || !cpt) return null;
  const e = sched[cpt.toUpperCase()];
  if (e == null) return null;
  if (typeof e === "number") return { rate: Number(e) || 0, units: 1 };
  const rate = Number(e.rate ?? e) || 0;
  const units = Number(e.units) || 1;
  return { rate, units };
}

const DEFAULT_PAYERS = [
  { id:"medicare", name:"Medicare", color:"#1e4080", isBase:true,  hasSchedule:false, lastUpdated:"01/01/26", source:"CMS 2026 PFS Final Rule CMS-1832-F. CF=$33.4009.", uploadedFile:null, parsedData:null },
  { id:"medicaid", name:"Medicaid", color:"#3a7ab0", isBase:false, hasSchedule:false, lastUpdated:"01/01/26", source:"USVI Medicaid: 100% of Medicare (confirmed remittance).", uploadedFile:null, parsedData:null },
  { id:"triple_s", name:"Triple S", color:"#1a4d90", isBase:false, hasSchedule:true,  lastUpdated:"04/01/26", source:"VIE Triple S Professional Fees, effective 04/01/26.", uploadedFile:"TSS_VIE_Professional_Fees_Effective_040126.xls", parsedData:null },
  { id:"aetna",    name:"Aetna",    color:"#2255a0", isBase:false, hasSchedule:true,  lastUpdated:"04/01/26", source:"Aetna Professional Fees Final, effective 04/01/26.", uploadedFile:"AETNA_Professional_Fees_Final_040126.xlsx", parsedData:null },
  { id:"elan",     name:"ELAN",     color:"#3a6ab0", isBase:false, hasSchedule:true,  lastUpdated:"04/01/26", source:"ELAN Professional Fees CPI, effective 04/01/26.", uploadedFile:"ELAN_Professional_Fees_CPI_040126.xlsx", parsedData:null },
  { id:"uhc",      name:"UHC",      color:"#3468aa", isBase:false, hasSchedule:true,  lastUpdated:"04/01/26", source:"UHC VIE Equicare Maximum Fee Schedule, effective 04/01/26.", uploadedFile:"UHC_VIE_Professional_Fees_040126.xlsx", parsedData:null },
  { id:"cigna",    name:"Cigna",    color:"#5888c8", isBase:false, hasSchedule:true,  lastUpdated:"03/09/26", source:"Cigna Professional Fees, effective 03/09/26.", uploadedFile:"3_9_2026_Cigna_Professional_Fees.xlsx", parsedData:null },
  { id:"mapfre",   name:"MAPFRE",   color:"#7098d0", isBase:false, hasSchedule:false, lastUpdated:null,       source:"No schedule. Default: 80% of billed if no prior agreement.", uploadedFile:null, parsedData:null },
];

const CATEGORIES = ["Injectable","Laser","Procedure","Diagnostic","Office Visit"];

// billingUnits: how many units billed per encounter (default 1)
const DEFAULT_ITEMS = [
  { id:"avastin",    name:"Avastin",          category:"Injectable",   cptCode:"J9035",  ourCost:60,    medicarerate:72,    billedAmt:0, billingUnits:1, notes:"Bevacizumab – ASP+6%" },
  { id:"eylea",      name:"Eylea",            category:"Injectable",   cptCode:"J0178",  ourCost:1850,  medicarerate:2113,  billedAmt:0, billingUnits:1, notes:"Aflibercept 2mg – ASP+6%" },
  { id:"eylea_hd",   name:"Eylea HD",         category:"Injectable",   cptCode:"J0177",  ourCost:2390,  medicarerate:2734,  billedAmt:0, billingUnits:1, notes:"Aflibercept 8mg – ASP+6%" },
  { id:"vabysmo",    name:"Vabysmo",          category:"Injectable",   cptCode:"J0179",  ourCost:2190,  medicarerate:2494,  billedAmt:0, billingUnits:1, notes:"Faricimab – ASP+6%" },
  { id:"izervay",    name:"Izervay",          category:"Injectable",   cptCode:"J3398",  ourCost:2580,  medicarerate:2943,  billedAmt:0, billingUnits:1, notes:"Avacincaptad Pegol – ASP+6%" },
  { id:"ozurdex",    name:"Ozurdex",          category:"Injectable",   cptCode:"J7312",  ourCost:1240,  medicarerate:1413,  billedAmt:0, billingUnits:1, notes:"Dexamethasone Implant – ASP+6%" },
  { id:"durysta",    name:"Durysta",          category:"Injectable",   cptCode:"J7351",  ourCost:890,   medicarerate:1015,  billedAmt:0, billingUnits:1, notes:"Bimatoprost Implant – ASP+6%" },
  { id:"kenalog",    name:"Kenalog",          category:"Injectable",   cptCode:"J3301",  ourCost:12,    medicarerate:18,    billedAmt:0, billingUnits:1, notes:"Triamcinolone – ASP+6%" },
  { id:"lucentis",   name:"Lucentis",         category:"Injectable",   cptCode:"J2778",  ourCost:1960,  medicarerate:2236,  billedAmt:0, billingUnits:1, notes:"Ranibizumab 0.1mg – ASP+6%" },
  { id:"inj_admin",  name:"Injection Admin",  category:"Injectable",   cptCode:"67028",  ourCost:0,     medicarerate:118,   billedAmt:0, billingUnits:1, notes:"Intravitreal injection admin fee" },
  { id:"slt",        name:"SLT",              category:"Laser",        cptCode:"65855",  ourCost:0,     medicarerate:222,   billedAmt:0, billingUnits:1, notes:"Selective Laser Trabeculoplasty" },
  { id:"yag_cap",    name:"YAG Capsulotomy",  category:"Laser",        cptCode:"66821",  ourCost:0,     medicarerate:318,   billedAmt:0, billingUnits:1, notes:"Posterior capsulotomy" },
  { id:"yag_lpi",    name:"YAG Iridotomy",    category:"Laser",        cptCode:"66761",  ourCost:0,     medicarerate:265,   billedAmt:0, billingUnits:1, notes:"Laser peripheral iridotomy" },
  { id:"prp",        name:"PRP",              category:"Laser",        cptCode:"67228",  ourCost:0,     medicarerate:395,   billedAmt:0, billingUnits:1, notes:"Panretinal photocoagulation" },
  { id:"focal_laser",name:"Focal/Grid Laser", category:"Laser",        cptCode:"67210",  ourCost:0,     medicarerate:280,   billedAmt:0, billingUnits:1, notes:"Macular photocoagulation" },
  { id:"cyclo",      name:"Cyclophotocoag.",  category:"Laser",        cptCode:"66710",  ourCost:0,     medicarerate:486,   billedAmt:0, billingUnits:1, notes:"Transscleral CPC" },
  { id:"cataract",   name:"Cataract (66984)", category:"Procedure",    cptCode:"66984",  ourCost:0,     medicarerate:622,   billedAmt:0, billingUnits:1, notes:"Routine cataract" },
  { id:"cataract_c", name:"Complex Cataract", category:"Procedure",    cptCode:"66982",  ourCost:0,     medicarerate:892,   billedAmt:0, billingUnits:1, notes:"Complex cataract extraction" },
  { id:"trabecu",    name:"Trabeculectomy",   category:"Procedure",    cptCode:"66170",  ourCost:0,     medicarerate:1245,  billedAmt:0, billingUnits:1, notes:"Filtering surgery" },
  { id:"vitrect",    name:"Vitrectomy",       category:"Procedure",    cptCode:"67036",  ourCost:0,     medicarerate:1580,  billedAmt:0, billingUnits:1, notes:"Pars plana vitrectomy" },
  { id:"ret_detach", name:"Retinal Detach.",  category:"Procedure",    cptCode:"67108",  ourCost:0,     medicarerate:1820,  billedAmt:0, billingUnits:1, notes:"Repair retinal detachment" },
  { id:"istent",     name:"iStent / MIGS",    category:"Procedure",    cptCode:"0671T",  ourCost:850,   medicarerate:1240,  billedAmt:0, billingUnits:1, notes:"Micro-invasive glaucoma surgery" },
  { id:"oct",        name:"OCT",              category:"Diagnostic",   cptCode:"92134",  ourCost:0,     medicarerate:42,    billedAmt:0, billingUnits:1, notes:"Optical coherence tomography" },
  { id:"vf",         name:"Visual Field",     category:"Diagnostic",   cptCode:"92083",  ourCost:0,     medicarerate:56,    billedAmt:0, billingUnits:1, notes:"Comprehensive visual field" },
  { id:"fundus",     name:"Fundus Photo",     category:"Diagnostic",   cptCode:"92250",  ourCost:0,     medicarerate:37.32, billedAmt:0, billingUnits:1, notes:"Fundus photography – confirmed $37.32" },
  { id:"iol_biom",   name:"IOL Biometry",     category:"Diagnostic",   cptCode:"92136",  ourCost:0,     medicarerate:115,   billedAmt:0, billingUnits:1, notes:"Argos / optical biometry" },
  { id:"pachy",      name:"Pachymetry",       category:"Diagnostic",   cptCode:"76514",  ourCost:0,     medicarerate:28,    billedAmt:0, billingUnits:1, notes:"Corneal thickness" },
  { id:"gonio",      name:"Gonioscopy",       category:"Diagnostic",   cptCode:"92020",  ourCost:0,     medicarerate:38,    billedAmt:0, billingUnits:1, notes:"Gonioscopy" },
  { id:"new_comp",   name:"New Pt – Comp.",   category:"Office Visit", cptCode:"92004",  ourCost:0,     medicarerate:176,   billedAmt:0, billingUnits:1, notes:"Comprehensive new patient" },
  { id:"est_comp",   name:"Est Pt – Comp.",   category:"Office Visit", cptCode:"92014",  ourCost:0,     medicarerate:116,   billedAmt:0, billingUnits:1, notes:"Comprehensive established" },
  { id:"est_int",    name:"Est Pt – Inter.",  category:"Office Visit", cptCode:"92012",  ourCost:0,     medicarerate:74,    billedAmt:0, billingUnits:1, notes:"Intermediate established" },
  { id:"em_99214",   name:"E/M 99214",        category:"Office Visit", cptCode:"99214",  ourCost:0,     medicarerate:148,   billedAmt:0, billingUnits:1, notes:"Level 4 established E/M" },
  { id:"em_99213",   name:"E/M 99213",        category:"Office Visit", cptCode:"99213",  ourCost:0,     medicarerate:96,    billedAmt:0, billingUnits:1, notes:"Level 3 established E/M" },
];

const fmt  = (n) => (n == null || isNaN(Number(n))) ? "—" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2}).format(Number(n));
const fmtK = (n) => (n == null || isNaN(Number(n))) ? "—" : Math.abs(Number(n))>=1000 ? `$${(Number(n)/1000).toFixed(1)}k` : fmt(n);

// useLs replaced by Firestore hooks in useFirestore.js

// Sanitize a single item coming from Firestore — ensure all numeric fields exist
function sanitizeItem(item) {
  return {
    ...item,
    ourCost:      Number(item.ourCost)      || 0,
    medicarerate: Number(item.medicarerate) || 0,
    billedAmt:    Number(item.billedAmt)    || 0,
    billingUnits: Number(item.billingUnits) || 1,
  };
}

// Compute reimbursement.
// Returns { ratePerUnit, totalReimb, billedAmt, units, source, onSchedule }
//
// ON SCHEDULE:
//   ratePerUnit  = fee schedule rate (the schedule gives rate PER billing unit)
//   totalReimb   = ratePerUnit × item.billingUnits
//   billedAmt    = totalReimb  (billing amount must match total reimbursement)
//
// UNPRICED (% of billed):
//   billedAmt    = what we charge (user-set; floor/target help guide this)
//   totalReimb   = billedAmt × paybackPct
//   ratePerUnit  = totalReimb / item.billingUnits
//
// UNPRICED (% of CMS/Medicare):
//   ratePerUnit  = medicarerate × rule.pct
//   totalReimb   = ratePerUnit × item.billingUnits
//   billedAmt    = totalReimb
function computeRate(rawItem, payerName, schedules, billedAmtParam=0) {
  const item      = sanitizeItem(rawItem);
  const cpt       = (item.cptCode || "").toUpperCase();
  const itemUnits = item.billingUnits || 1;
  const mcr       = item.medicarerate || 0;

  // ── Medicare ───────────────────────────────────────────────────────────────
  if (payerName === "Medicare") {
    // medicarerate is already the total for 1 unit — treat as rate per unit
    const rpu   = +(mcr).toFixed(4);
    const total = +(rpu * itemUnits).toFixed(2);
    return { ratePerUnit:rpu, totalReimb:total, billedAmt:total, units:itemUnits, source:"medicare", onSchedule:true };
  }

  // ── On fee schedule ────────────────────────────────────────────────────────
  const sched = schedules?.[payerName];
  const entry = getSchedEntry(sched, cpt);
  if (entry && typeof entry.rate === "number") {
    // Schedule rate = rate per billing unit
    const rpu   = +(Number(entry.rate) || 0);
    const total = +(rpu * itemUnits).toFixed(2);
    return { ratePerUnit:rpu, totalReimb:total, billedAmt:total, units:itemUnits, source:"schedule", onSchedule:true };
  }

  // ── Manual override ────────────────────────────────────────────────────────
  if (item.overrides?.[payerName] != null) {
    const rpu   = +(Number(item.overrides[payerName]) || 0);
    const total = +(rpu * itemUnits).toFixed(2);
    return { ratePerUnit:rpu, totalReimb:total, billedAmt:total, units:itemUnits, source:"override", onSchedule:false };
  }

  // ── Unpriced rules ─────────────────────────────────────────────────────────
  const rule = UNPRICED_RULES[payerName];
  if (!rule) {
    const rpu = mcr;
    return { ratePerUnit:rpu, totalReimb:+(rpu*itemUnits).toFixed(2), billedAmt:+(rpu*itemUnits).toFixed(2), units:itemUnits, source:"fallback", onSchedule:false };
  }

  if (rule.type === "pct_hawaii_cms" || rule.type === "pct_medicare") {
    // Rate per unit = Medicare rate × multiplier
    const rpu   = +((mcr * rule.pct).toFixed(4));
    const total = +(rpu * itemUnits).toFixed(2);
    return { ratePerUnit:rpu, totalReimb:total, billedAmt:total, units:itemUnits, source: rule.type==="pct_hawaii_cms"?"unpriced_cms":"pct_mcr", onSchedule:false, paybackPct:null };
  }

  if (rule.type === "pct_billed") {
    // billedAmt drives everything — what we charge determines what we get back
    const bill = Number(billedAmtParam) || 0;
    if (bill > 0) {
      const total = +(bill * rule.pct).toFixed(2);
      const rpu   = +(total / itemUnits).toFixed(4);
      return { ratePerUnit:rpu, totalReimb:total, billedAmt:bill, units:itemUnits, source:"unpriced_billed", onSchedule:false, paybackPct:rule.pct };
    }
    // No bill amount set yet
    return { ratePerUnit:null, totalReimb:null, billedAmt:null, units:itemUnits, source:"unpriced_billed", onSchedule:false, paybackPct:rule.pct };
  }

  const rpu = mcr;
  return { ratePerUnit:rpu, totalReimb:+(rpu*itemUnits).toFixed(2), billedAmt:+(rpu*itemUnits).toFixed(2), units:itemUnits, source:"fallback", onSchedule:false };
}

function downloadCSV(fn,h,r){
  const e=(v)=>`"${String(v??'').replace(/"/g,'""')}"`;
  const c=[h.map(e).join(','),...r.map(row=>row.map(e).join(','))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:'text/csv'}));a.download=fn;a.click();
}

// Simple CSV parser for uploaded fee schedules
// Parse a spreadsheet ArrayBuffer (XLS/XLSX/CSV) using SheetJS
// Returns { CPT: { rate, units } } or null on failure
function parseScheduleFile(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const result = {};
    let totalParsed = 0;

    // Try every sheet — schedules sometimes span multiple sheets or the data
    // is on the second sheet (e.g. "Fees", "8A", "Professional", "2026")
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      // Convert to array of arrays (raw values)
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) continue;

      // Find the header row — scan first 15 rows for a row containing "code" or "cpt"
      let headerRowIdx = -1;
      let codeIdx = -1, rateIdx = -1, unitIdx = -1;

      for (let r = 0; r < Math.min(15, rows.length); r++) {
        const cells = rows[r].map(c => String(c).toLowerCase().trim());
        const ci = cells.findIndex(c =>
          c === "code" || c === "cpt" || c === "proc code" ||
          c.startsWith("proc") || c.includes("hcpcs")
        );
        const ri = cells.findIndex(c =>
          c.includes("fee") || c.includes("rate") || c.includes("reimb") ||
          c.includes("allow") || c.includes("amount") || c.includes("payment")
        );
        if (ci >= 0 && ri >= 0) {
          headerRowIdx = r;
          codeIdx = ci;
          rateIdx = ri;
          unitIdx = cells.findIndex(c => c.includes("unit") || c.includes("qty"));
          break;
        }
      }

      if (headerRowIdx < 0) continue; // no header found in this sheet

      // Parse data rows
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const rawCode = String(row[codeIdx] || "").trim().toUpperCase();
        const rawRate = row[rateIdx];

        // Skip empty or non-code rows
        if (!rawCode || rawCode.length < 4) continue;
        // Only accept valid CPT (5 digits) or HCPCS (letter + 4 digits) formats
        if (!/^[A-Z0-9]{4,7}$/.test(rawCode)) continue;

        const rate = parseFloat(String(rawRate).replace(/[$,\s]/g, ""));
        if (isNaN(rate) || rate <= 0) continue;

        const rawUnits = unitIdx >= 0 ? row[unitIdx] : 1;
        const units = parseInt(String(rawUnits || "1")) || 1;

        result[rawCode] = { rate: Math.round(rate * 100) / 100, units };
        totalParsed++;
      }
    }

    return totalParsed > 0 ? result : null;
  } catch (err) {
    console.error("parseScheduleFile error:", err);
    return null;
  }
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App({ user, onSignOut }) {
  const [items,    setItems,    itemsReady]    = useClinicData("items",     DEFAULT_ITEMS);
  const [payers,   setPayers,   payersReady]   = useClinicData("payers",    DEFAULT_PAYERS);
  // Tracked CPT codes — only these are loaded on startup for speed
  const PAYER_NAMES   = DEFAULT_PAYERS.map(p => p.name);
  const TRACKED_CPTS  = items.map(i => i.cptCode.toUpperCase());
  const [schedules, setSchedules, schedReady, loadFullSchedule, writeFullUpload] =
    useSchedules(PAYER_NAMES, INIT_SCHEDULES, TRACKED_CPTS);
  const [targetPct,setTargetPct,settingsReady]   = useSettings();
  const [selPayer, setSelPayer] = useState("Medicare");
  const [catFilter,setCatFilter]= useState("All");
  const [showSettings,setShowSettings] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const appReady = itemsReady && payersReady && schedReady && settingsReady;

  if (!appReady) {
    return (
      <div style={{fontFamily:"'DM Mono',monospace",minHeight:"100vh",background:"#f0f5fb",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center",color:"#7a9ab8"}}>
          <div style={{fontSize:28,marginBottom:12,animation:"spin 1.2s linear infinite",display:"inline-block"}}>⟳</div>
          <div style={{fontSize:12}}>Loading clinic data…</div>
          <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
        </div>
      </div>
    );
  }

  const updateItem = (id,field,val) => setItems(p=>p.map(i=>i.id===id?{...i,[field]:val}:i));
  const addItem    = (it) => setItems(p=>[...p,{...it,id:it.name.toLowerCase().replace(/\W/g,'_')+'_'+Date.now(),billedAmt:0,billingUnits:it.billingUnits||1,overrides:{}}]);
  const removeItem = (id) => setItems(p=>p.filter(i=>i.id!==id));

  const filtered   = catFilter==="All" ? items : items.filter(i=>i.category===catFilter);
  const catCounts  = CATEGORIES.reduce((a,c)=>({...a,[c]:items.filter(i=>i.category===c).length}),{});
  const selPayerObj= payers.find(p=>p.name===selPayer)||payers[0];

  return (
    <div style={{fontFamily:"'DM Mono',monospace",background:"#f0f5fb",minHeight:"100vh",color:"#1a2d4a"}}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div className="hdr">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setShowSettings(true)} className="hdr-gear" title="Fee Schedule Manager">⚙</button>
          <div>
            <div className="hdr-title">Plessen Ophthalmology &nbsp;<span className="hdr-em">Reimbursement Tracker</span></div>
            <div className="hdr-sub"><span className="live"/>Real fee schedules  |  Triple S  |  Aetna  |  ELAN  |  UHC  |  Cigna  |  04/01/26</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,.45)",lineHeight:1.8}}>Medicare CF $33.4009  |  CMS-1832-F  |  2026</div>
          <div style={{display:"flex",alignItems:"center",gap:8,borderLeft:"1px solid rgba(255,255,255,.15)",paddingLeft:14}}>
            <span style={{fontSize:9,color:"rgba(255,255,255,.6)"}}>{user?.displayName?.split(" ")[0]||user?.email}</span>
            <button onClick={onSignOut} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:5,color:"#fff",fontSize:9,cursor:"pointer",padding:"3px 10px",fontFamily:"inherit"}}>Sign out</button>
          </div>
        </div>
      </div>

      {/* PROFIT TARGET BAR — compact, no multiplier text */}
      <div style={{background:"#fff",borderBottom:"2px solid #c8d8ec",padding:"8px 24px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:700,color:"#1a2d4a"}}>🎯 Profit Target:</span>
        <TargetPctInput value={targetPct} onChange={setTargetPct}/>
        <div style={{display:"flex",gap:4}}>
          {[10,20,30,40,50].map(p=>(
            <button key={p} onClick={()=>setTargetPct(p)} style={{padding:"2px 7px",borderRadius:3,border:"1px solid",borderColor:targetPct===p?"#1e4080":"#dce8f4",background:targetPct===p?"#1e4080":"#fff",color:targetPct===p?"#fff":"#7a9ab8",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>{p}%</button>
          ))}
        </div>
      </div>

      {/* INSURANCE SELECTOR + CATEGORY FILTER */}
      <div style={{background:"#fff",borderBottom:"1px solid #dce8f4",padding:"8px 24px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:"#7a9ab8",fontWeight:500}}>Viewing:</span>
          <select value={selPayer} onChange={e=>setSelPayer(e.target.value)}
            style={{padding:"5px 10px",fontSize:11,borderRadius:4,background:"#f0f5fb",color:"#1a2d4a",border:"2px solid #1e4080",outline:"none",fontFamily:"inherit",fontWeight:600,cursor:"pointer"}}>
            {payers.map(p=><option key={p.id} value={p.name}>{p.name}{p.hasSchedule?" ✓":""}</option>)}
          </select>
          {selPayerObj&&(
            <span style={{fontSize:9,padding:"2px 8px",borderRadius:3,background:selPayerObj.hasSchedule?"rgba(26,112,64,.1)":"rgba(200,80,0,.1)",color:selPayerObj.hasSchedule?"#1a7040":"#a04000",fontWeight:600}}>
              {selPayerObj.hasSchedule?"✓ Schedule loaded":"No schedule — unpriced rules apply"}
            </span>
          )}
          {selPayerObj?.lastUpdated&&<span style={{fontSize:8,color:"#7a9ab8"}}>Updated: {selPayerObj.lastUpdated}</span>}
        </div>
        <div style={{width:1,height:16,background:"#dce8f4"}}/>
        {["All",...CATEGORIES].map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)} className={`cat-btn${catFilter===c?" on":""}`}>
            {c}{c==="All"?` (${items.length})`:` (${catCounts[c]||0})`}
          </button>
        ))}
      </div>

      {/* SUMMARY BAR */}
      <SummaryBar items={items} payer={selPayer} schedules={schedules} targetPct={targetPct}/>

      {/* CARDS */}
      <div style={{padding:"16px 24px 60px"}}>
        {CATEGORIES.filter(c=>catFilter==="All"||c===catFilter).map(cat=>{
          const catItems=filtered.filter(i=>i.category===cat);
          if(!catItems.length) return null;
          return (
            <div key={cat} style={{marginBottom:28}}>
              <div style={{fontSize:10,color:"#1e4080",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                <span className={`cbadge c-${cat.replace(/ /g,"_")}`}>{cat}</span>
                <span style={{color:"#7a9ab8",fontSize:9,fontWeight:400}}>{catItems.length} items</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {catItems.map(item=>(
                  <ItemCard key={item.id} item={item} payerName={selPayer} schedules={schedules} targetPct={targetPct} onEdit={()=>setEditItem(item)} onRemove={()=>removeItem(item.id)}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showSettings&&<FeeScheduleManager payers={payers} setPayers={setPayers} items={items} addItem={addItem} removeItem={removeItem} schedules={schedules} setSchedules={setSchedules} loadFullSchedule={loadFullSchedule} writeFullUpload={writeFullUpload} onClose={()=>setShowSettings(false)}/>}
      {editItem&&<EditItemModal item={editItem} payerName={selPayer} schedules={schedules} targetPct={targetPct} onSave={(id,f,v)=>updateItem(id,f,v)} onClose={()=>setEditItem(null)}/>}
    </div>
  );
}

// ─── TARGET PCT INPUT ────────────────────────────────────────────────────────
function TargetPctInput({value,onChange}) {
  const [ed,setEd]=useState(false);
  const [lc,setLc]=useState(value);
  const commit=()=>{const n=parseInt(lc);if(!isNaN(n)&&n>=0&&n<=500)onChange(n);else setLc(value);setEd(false);};
  return (
    <div onClick={()=>{setLc(value);setEd(true);}} style={{display:"flex",alignItems:"center",gap:4,background:"#eef4fb",border:"2px solid #1e4080",borderRadius:6,padding:"3px 10px",cursor:"text"}}>
      {ed
        ? <input autoFocus value={lc} onChange={e=>setLc(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setLc(value);setEd(false);}}} style={{width:36,fontSize:20,fontFamily:"'Libre Baskerville',serif",color:"#1e4080",background:"transparent",border:"none",outline:"none",textAlign:"right"}}/>
        : <span style={{fontSize:22,fontFamily:"'Libre Baskerville',serif",color:"#1e4080",fontWeight:700,minWidth:34,textAlign:"right"}}>{value}</span>
      }
      <span style={{fontSize:14,color:"#1e4080",fontWeight:700}}>%</span>
    </div>
  );
}

// ─── SUMMARY BAR ─────────────────────────────────────────────────────────────
function SummaryBar({items,payer,schedules,targetPct}) {
  let totalReimb=0,totalCost=0,meetTarget=0;
  items.forEach(item=>{
    const res=computeRate(item,payer,schedules,item.billedAmt||0);
    const rate=res.totalReimb??0;
    totalReimb+=rate; totalCost+=item.ourCost||0;
    const profit=rate-(item.ourCost||0);
    const pct=(item.ourCost||0)>0?(profit/(item.ourCost||0)*100):100;
    if(pct>=targetPct)meetTarget++;
  });
  return (
    <div style={{display:"flex",background:"#e8f0fa",borderBottom:"1px solid #dce8f4",overflowX:"auto"}}>
      <div className="s-item"><div className="s-lbl">Items</div><div className="s-val">{items.length}</div></div>
      <div className="s-item"><div className="s-lbl">Total Reimb. ({payer})</div><div className="s-val">{fmtK(totalReimb)}</div></div>
      <div className="s-item"><div className="s-lbl">Total Drug Cost</div><div className="s-val" style={{color:"#c0392b"}}>{fmtK(totalCost)}</div></div>
      <div className="s-item"><div className="s-lbl">Est. Profit</div><div className="s-val" style={{color:totalReimb-totalCost>=0?"#1a7040":"#c0392b"}}>{fmtK(totalReimb-totalCost)}</div></div>
      <div className="s-item"><div className="s-lbl">Meet {targetPct}% Target</div><div className="s-val" style={{color:"#1a7040"}}>{meetTarget}/{items.length}</div></div>
    </div>
  );
}

// ─── ITEM CARD ────────────────────────────────────────────────────────────────
function ItemCard({item,payerName,schedules,targetPct,onEdit,onRemove}) {
  const [showMenu,setShowMenu]=useState(false);
  const menuRef=useRef(null);
  useEffect(()=>{
    if(!showMenu)return;
    const h=(e)=>{if(menuRef.current&&!menuRef.current.contains(e.target))setShowMenu(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[showMenu]);

  const res        = computeRate(item,payerName,schedules,item.billedAmt||0);
  const perUnit    = res.ratePerUnit;    // rate per billing unit
  const totalReimb = res.totalReimb;     // ratePerUnit × billingUnits
  const billedAmt  = res.billedAmt;      // what we bill (= totalReimb when on schedule)
  const units      = res.units;
  const cost       = item.ourCost||0;
  const itemUnits  = item.billingUnits||1;
  const onSched    = res.onSchedule;
  const rule       = UNPRICED_RULES[payerName];
  const reimb      = totalReimb??0;
  const estProfit  = reimb-cost;
  const estProfitPct = cost>0?(estProfit/cost*100):null;
  const meetsTarget  = estProfitPct!=null?estProfitPct>=targetPct:reimb>0;
  // For unpriced % of billed: what to charge to hit floor / target
  const floorBill  = (!onSched&&rule?.pct&&cost>0)?+(cost/rule.pct).toFixed(2):null;
  const targetBill = (!onSched&&rule?.pct&&cost>0)?+(cost*(1+targetPct/100)/rule.pct).toFixed(2):null;
  const profColor  = (p,t)=>p<0?"#c0392b":t?"#1a7040":"#1e4080";

  return (
    <div style={{background:"#fff",border:"1px solid #dce8f4",borderRadius:8,overflow:"visible",boxShadow:"0 1px 4px rgba(30,64,128,.06)",position:"relative"}}>
      {/* Header */}
      <div style={{padding:"10px 12px 8px",borderBottom:"1px solid #eef4fb",background:"#f8fafd",borderRadius:"8px 8px 0 0",display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:12,color:"#1a2d4a",fontWeight:700}}>{item.name}</div>
          <div style={{fontSize:8,color:"#7a9ab8",marginTop:1}}>{item.cptCode}  |  {item.notes}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span className={`cbadge c-${item.category.replace(/ /g,"_")}`}>{item.category}</span>
          <span style={{fontSize:8,padding:"2px 6px",borderRadius:3,background:onSched?"rgba(26,112,64,.1)":"rgba(200,80,0,.1)",color:onSched?"#1a7040":"#a04000",fontWeight:600}}>
            {onSched?"📋 Schedule":"★ Unpriced"}
          </span>
          <div style={{position:"relative"}} ref={menuRef}>
            <button onClick={()=>setShowMenu(p=>!p)} style={{background:"#1e4080",border:"none",borderRadius:4,color:"#fff",width:22,height:22,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>⋯</button>
            {showMenu&&(
              <div style={{position:"absolute",right:0,top:26,background:"#fff",border:"1px solid #dce8f4",borderRadius:6,boxShadow:"0 4px 16px rgba(30,64,128,.15)",zIndex:50,minWidth:130}}>
                <button onClick={()=>{setShowMenu(false);onEdit();}} className="menu-item">✏️ Edit Item</button>
                <button onClick={()=>{setShowMenu(false);onRemove();}} className="menu-item danger">🗑 Remove</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* COST SECTION */}
      <div style={{padding:"8px 12px",borderBottom:"1px solid #eef4fb"}}>
        <div className="sec-label">Cost</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
          <div className="card-row"><span className="card-lbl">Our Cost</span><span className="card-val">{cost>0?fmt(cost):"—"}</span></div>
          <div className="card-row"><span className="card-lbl">Bill Amt</span><span className="card-val" style={{color:"#1e4080",fontWeight:600}}>{billedAmt!=null?fmt(billedAmt):<span style={{color:"#c8d8ec",fontSize:8}}>set bill amt</span>}</span></div>
          <div className="card-row"><span className="card-lbl">Bill Units</span><span className="card-val" style={{fontWeight:600}}>{itemUnits}</span></div>
        </div>
        {!onSched&&floorBill&&(
          <div style={{marginTop:5,background:"#fff8e0",border:"1px solid #f0d070",borderRadius:4,padding:"5px 8px"}}>
            <div style={{fontSize:7,color:"#a07000",textTransform:"uppercase",fontWeight:700,marginBottom:2}}>Billing Targets ({rule?.label})</div>
            <div style={{display:"flex",gap:12}}>
              <div className="card-row"><span className="card-lbl">Floor</span><span className="card-val" style={{color:"#c03020",fontWeight:600}}>{fmt(floorBill)}</span></div>
              <div className="card-row"><span className="card-lbl">Target ({targetPct}%)</span><span className="card-val" style={{color:"#1a7040",fontWeight:700}}>{fmt(targetBill)}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* BILL & PROFIT SECTION */}
      <div style={{padding:"8px 12px"}}>
        <div className="sec-label">Bill &amp; Profit</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:6}}>
          <div className="card-row"><span className="card-lbl">Rate/Unit</span><span className="card-val" style={{fontWeight:600}}>{perUnit!=null?fmt(perUnit):"—"}</span></div>
          <div className="card-row"><span className="card-lbl">Bill Units</span><span className="card-val">{itemUnits}</span></div>
          <div className="card-row"><span className="card-lbl">Total Reimb.</span><span className="card-val" style={{color:"#1e4080",fontWeight:700}}>{totalReimb!=null?fmt(totalReimb):<span style={{color:"#c8d8ec",fontSize:8}}>set bill amt</span>}</span></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <div style={{background:"rgba(30,64,128,.04)",borderRadius:4,padding:"5px 8px"}}>
            <div style={{fontSize:7,color:"#7a9ab8",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Est. Profit</div>
            <div style={{fontSize:11,fontWeight:700,color:profColor(estProfit,meetsTarget)}}>{estProfit>=0?"+":""}{fmt(estProfit)}</div>
            {estProfitPct!=null&&<div style={{fontSize:8,color:"#7a9ab8"}}>{Number(estProfitPct||0).toFixed(0)}% on cost</div>}
            <div style={{fontSize:7,color:meetsTarget?"#1a7040":"#7a9ab8",marginTop:1}}>{meetsTarget?`✓ meets ${targetPct}%`:"vs drug cost"}</div>
          </div>
          <div style={{background:"rgba(26,112,64,.04)",borderRadius:4,padding:"5px 8px"}}>
            <div style={{fontSize:7,color:"#7a9ab8",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Actual Profit</div>
            <div style={{fontSize:11,fontWeight:700,color:profColor(estProfit,meetsTarget)}}>{estProfit>=0?"+":""}{fmt(estProfit)}</div>
            {estProfitPct!=null&&<div style={{fontSize:8,color:"#7a9ab8"}}>{Number(estProfitPct||0).toFixed(0)}% margin</div>}
            <div style={{fontSize:7,color:"#7a9ab8",marginTop:1}}>reimb − cost</div>
          </div>
        </div>
        {estProfitPct!=null&&(
          <div style={{marginTop:5,height:3,background:"#eef4fb",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.max(0,Math.min(estProfitPct,100))}%`,background:meetsTarget?"#1a7040":"#1e4080",borderRadius:2}}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EDIT ITEM MODAL ──────────────────────────────────────────────────────────
function EditItemModal({item,payerName,schedules,targetPct,onSave,onClose}) {
  const [cost,   setCost]   = useState(item.ourCost||0);
  const [billed, setBilled] = useState(item.billedAmt||0);
  const [units,  setUnits]  = useState(item.billingUnits||1);
  const res        = computeRate({...item,billingUnits:units},payerName,schedules,billed);
  const totalReimb = res.totalReimb;
  const perUnit    = res.ratePerUnit;
  const onSched    = res.onSchedule;
  const rule    = UNPRICED_RULES[payerName];
  const floorBill  = (!onSched&&rule?.pct&&cost>0)?+(cost/rule.pct).toFixed(2):null;
  const targetBill = (!onSched&&rule?.pct&&cost>0)?+(cost*(1+targetPct/100)/rule.pct).toFixed(2):null;

  const handleSave=()=>{onSave(item.id,"ourCost",cost);onSave(item.id,"billedAmt",billed);onSave(item.id,"billingUnits",units);onClose();};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(30,64,128,.2)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}} >
      <div style={{background:"#fff",border:"1px solid #c8d8ec",borderRadius:10,padding:26,width:400,maxWidth:"92vw",boxShadow:"0 8px 32px rgba(30,64,128,.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div>
            <div style={{fontFamily:"'Libre Baskerville',serif",fontSize:16,color:"#1a2d4a"}}>Edit Item</div>
            <div style={{fontSize:9,color:"#7a9ab8",marginTop:2}}>{item.name}  |  {item.cptCode}</div>
          </div>
          <button onClick={onClose} style={{background:"#c0392b",border:"none",borderRadius:6,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>×</button>
        </div>
        <div style={{background:"#f4f8fd",borderRadius:6,padding:"10px 14px",marginBottom:16,fontSize:10,color:"#7a9ab8",lineHeight:1.6}}>
          Only <strong style={{color:"#1a2d4a"}}>Our Cost</strong>, <strong style={{color:"#1a2d4a"}}>Bill Amount</strong>, and <strong style={{color:"#1a2d4a"}}>Billing Units</strong> are editable here. Reimbursement rates update in <strong style={{color:"#1e4080"}}>⚙ Fee Schedule Manager</strong>.
        </div>
        {[["Our Cost ($)","number",cost,setCost],["Billing Units","number",units,setUnits]].map(([lbl,type,val,setVal])=>(
          <div key={lbl} style={{marginBottom:12}}>
            <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>{lbl}</div>
            <input type={type} value={val} onChange={e=>setVal(+e.target.value)} style={{width:"100%",padding:"8px 10px",fontSize:13,borderRadius:4,background:"#f8fafd",color:"#1a2d4a",border:"1px solid #c8d8ec",outline:"none",fontFamily:"inherit"}}/>
          </div>
        ))}
        {onSched?(
          <div style={{marginBottom:12,background:"#f4f8fd",borderRadius:4,padding:"10px 12px"}}>
            <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:2}}>Bill Amount (auto — matches fee schedule)</div>
            <div style={{fontSize:14,color:"#1e4080",fontWeight:700}}>{fmt(totalReimb)}</div>
            <div style={{fontSize:8,color:"#7a9ab8",marginTop:2}}>Rate/unit {fmt(perUnit)} × {units} unit{units!==1?"s":""} = {fmt(totalReimb)}</div>
          </div>
        ):(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Bill Amount</div>
            <input type="number" value={billed} onChange={e=>setBilled(+e.target.value)} style={{width:"100%",padding:"8px 10px",fontSize:13,borderRadius:4,background:"#f8fafd",color:"#1a2d4a",border:"1px solid #c8d8ec",outline:"none",fontFamily:"inherit"}}/>
            {(floorBill||targetBill)&&(
              <div style={{marginTop:6,display:"flex",gap:8}}>
                {floorBill&&<button onClick={()=>setBilled(floorBill)} style={{flex:1,padding:"5px 0",borderRadius:3,border:"1px solid #c03020",background:"rgba(192,48,32,.05)",color:"#c03020",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>Floor {fmt(floorBill)}</button>}
                {targetBill&&<button onClick={()=>setBilled(targetBill)} style={{flex:1,padding:"5px 0",borderRadius:3,border:"1px solid #1a7040",background:"rgba(26,112,64,.05)",color:"#1a7040",fontSize:9,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>Target {fmt(targetBill)}</button>}
              </div>
            )}
          </div>
        )}
        <div style={{background:"#eef4fb",borderRadius:4,padding:"8px 12px",marginBottom:14,fontSize:10}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
            <span style={{color:"#7a9ab8"}}>Rate/unit:</span><span style={{color:"#1a2d4a",fontWeight:600}}>{perUnit!=null?fmt(perUnit):"—"}</span>
            <span style={{color:"#7a9ab8"}}>Total reimb:</span><span style={{color:"#1e4080",fontWeight:600}}>{totalReimb!=null?fmt(totalReimb):"set bill amt"}</span>
            <span style={{color:"#7a9ab8"}}>Est. profit:</span><span style={{color:((totalReimb??0)-cost)>=0?"#1a7040":"#c0392b",fontWeight:600}}>{fmt((totalReimb??0)-cost)}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleSave} style={{flex:1,padding:"9px 0",borderRadius:4,border:"none",background:"#1e4080",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Save Changes</button>
          <button onClick={onClose}   style={{padding:"9px 16px",borderRadius:4,border:"1px solid #c8d8ec",background:"transparent",color:"#7a9ab8",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── FEE SCHEDULE MANAGER ────────────────────────────────────────────────────
function FeeScheduleManager({payers,setPayers,items,addItem,removeItem,schedules,setSchedules,loadFullSchedule,writeFullUpload,onClose}) {
  const [tab,       setTab]        = useState("schedules");
  const [activePyr, setActivePyr]  = useState(payers.find(p=>p.hasSchedule)||payers[0]);
  const [search,    setSearch]     = useState("");
  const [catF,      setCatF]       = useState("All");
  const [compareOpen, setCompareOpen] = useState(false);
  const [editCell,  setEditCell]   = useState(null);
  const [editVal,   setEditVal]    = useState("");
  const [localSched,setLocalSched] = useState(()=>JSON.parse(JSON.stringify(schedules)));
  // Keep localSched in sync when schedules prop updates (e.g. after upload)
  useEffect(()=>{ setLocalSched(JSON.parse(JSON.stringify(schedules))); },[schedules]);
  const [dirty,     setDirty]      = useState(false);
  const [viewParsed, setViewParsed]= useState(null);  // payer to view parsed data
  const [newItem,   setNewItem]    = useState({name:"",cptCode:"",category:"Injectable",ourCost:0,medicarerate:0,billingUnits:1,notes:""});
  const [uploading, setUploading]  = useState(false);
  const [uploadMsg, setUploadMsg]  = useState("");
  const [uploadParsed,setUploadParsed]=useState(null); // parsed result from upload
  const fileRef = useRef(null);

  const allCpts = [...new Set([...items.map(i=>i.cptCode.toUpperCase()),...Object.values(localSched).flatMap(s=>Object.keys(s))])].sort();
  const cptInfo = {}; items.forEach(i=>{cptInfo[i.cptCode.toUpperCase()]=i;});

  const sorted = allCpts.filter(cpt=>{
    const it=cptInfo[cpt];
    if(search&&!cpt.toLowerCase().includes(search.toLowerCase())&&!(it?.name||"").toLowerCase().includes(search.toLowerCase())) return false;
    if(catF!=="All"&&it?.category!==catF) return false;
    return true;
  }).sort((a,b)=>{const ca=cptInfo[a]?.category||"ZZZ",cb=cptInfo[b]?.category||"ZZZ";return ca.localeCompare(cb)||(cptInfo[a]?.name||a).localeCompare(cptInfo[b]?.name||b);});

  const startEdit=(pn,cpt)=>{setEditCell({pn,cpt});const e=getSchedEntry(localSched[pn],cpt);setEditVal(e?e.rate:"");};
  const commitEdit=()=>{
    if(!editCell)return;
    const v=parseFloat(editVal);
    setLocalSched(prev=>{
      const next={...prev,[editCell.pn]:{...(prev[editCell.pn]||{})}};
      const existing=getSchedEntry(prev[editCell.pn],editCell.cpt);
      if(!isNaN(v)&&v>0) next[editCell.pn][editCell.cpt]={rate:v,units:existing?.units||1};
      else delete next[editCell.pn][editCell.cpt];
      return next;
    });
    setDirty(true);setEditCell(null);
  };
  const saveEdits=()=>{setSchedules(localSched);setDirty(false);};

  const handleAddItem=()=>{
    if(!newItem.name.trim()||!newItem.cptCode.trim())return;
    addItem({...newItem});
    setNewItem({name:"",cptCode:"",category:"Injectable",ourCost:0,medicarerate:0,billingUnits:1,notes:""});
  };

  const handleUpload=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    e.target.value = "";
    setUploading(true); setUploadMsg("Parsing file…"); setUploadParsed(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buffer = ev.target.result;
        const parsed = parseScheduleFile(buffer);
        if (!parsed || Object.keys(parsed).length === 0) {
          setUploadMsg(`⚠ Could not find CPT codes and rates in "${file.name}". Try exporting as CSV from Excel.`);
          setUploading(false);
          return;
        }
        const totalCount = Object.keys(parsed).length;
        setUploadMsg(`Parsed ${totalCount} codes — saving to Firestore…`);
        // writeFullUpload: chunks the full schedule, saves to Firestore,
        // and updates active_rates (lean) so FSM and cards stay in sync
        const result = await writeFullUpload(activePyr.name, parsed);
        const now = new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"2-digit"});
        setPayers(prev => prev.map(p =>
          p.id === activePyr.id
            ? {...p, lastUpdated:now, hasSchedule:true, uploadedFile:file.name}
            : p
        ));
        // localSched will sync automatically via the useEffect above
        setUploadParsed(parsed);
        setUploadMsg(`✓ Saved ${result.total} codes in ${result.chunks} chunk(s). ${result.tracked} match tracked items — rates updated live.`);
        setDirty(false);
      } catch(err) {
        setUploadMsg("✗ Error: " + err.message);
      }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadAllCSV=()=>{
    const pn=payers.filter(p=>!p.isBase).map(p=>p.name);
    const h=["CPT","Service","Category","Billing Units","Notes",...pn];
    const r=sorted.map(cpt=>{const it=cptInfo[cpt];const e=getSchedEntry(localSched[it?.name],cpt)||{};return[cpt,it?.name||"",it?.category||"",it?.billingUnits||1,it?.notes||"",...pn.map(payerName=>{const ent=getSchedEntry(localSched[payerName],cpt);return ent?ent.rate:`UNPRICED: ${UNPRICED_RULES[payerName]?.label||""}`;})];});
    downloadCSV("Plessen_All_Schedules.csv",h,r);
  };

  const downloadPayerCSV=(pn)=>{
    const h=["CPT","Service","Category","Billing Units","Rate","Rate/Unit","Notes"];
    const r=sorted.map(cpt=>{const it=cptInfo[cpt];const ent=getSchedEntry(localSched[pn],cpt);const u=ent?.units||1;return[cpt,it?.name||"",it?.category||"",it?.billingUnits||1,ent?ent.rate:`UNPRICED`,ent?+(ent.rate/u).toFixed(4):"",it?.notes||""];});
    downloadCSV(`${pn.replace(/\s/g,"_")}_Plessen.csv`,h,r);
  };

  const downloadOriginal=(payer)=>{
    if(!payer.uploadedFile){alert("No original file on record for this payer.");return;}
    alert(`Original file: "${payer.uploadedFile}"\n\nThe original uploaded file is stored by filename reference. In a deployed environment, this button would retrieve the file from server storage. The parsed data is available via "View Parsed".`);
  };

  const coveredCount=(pn)=>Object.keys(localSched[pn]||{}).filter(c=>allCpts.includes(c)).length;

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",flexDirection:"column",background:"#f0f5fb",fontFamily:"'DM Mono',monospace"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a3a6a,#1e4080)",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:5,color:"#fff",fontSize:11,cursor:"pointer",padding:"4px 12px",fontFamily:"inherit"}}>← Back</button>
          <div>
            <div style={{fontFamily:"'Libre Baskerville',serif",fontSize:17,color:"#fff"}}>⚙ Fee Schedule Manager</div>
            <div style={{fontSize:8,color:"rgba(255,255,255,.55)",letterSpacing:".06em",textTransform:"uppercase",marginTop:1}}>View  |  Edit  |  Add Items  |  Upload  |  Compare  |  Download</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {dirty&&<span style={{fontSize:9,color:"#ffd080",background:"rgba(255,200,0,.15)",padding:"3px 8px",borderRadius:4}}>● Unsaved edits</span>}
          {dirty&&<button onClick={saveEdits} style={{padding:"5px 12px",borderRadius:4,border:"1px solid #7fd0a8",background:"rgba(100,200,140,.2)",color:"#7fd0a8",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Save Edits</button>}
          <button onClick={()=>setCompareOpen(true)} style={{padding:"5px 12px",borderRadius:4,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.12)",color:"#fff",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>⊞ Compare</button>
          <button onClick={downloadAllCSV} style={{padding:"5px 12px",borderRadius:4,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>⬇️ Download All</button>
          <button onClick={onClose} style={{background:"#c0392b",border:"none",borderRadius:6,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>×</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{background:"#fff",borderBottom:"2px solid #dce8f4",display:"flex",flexShrink:0}}>
        {[["schedules","📋 Fee Schedules"],["add","➕ Add Item"],["upload","⬆️ Upload Schedule"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"10px 20px",border:"none",borderBottom:tab===t?"3px solid #1e4080":"3px solid transparent",background:tab===t?"#f0f5fb":"transparent",color:tab===t?"#1e4080":"#7a9ab8",fontSize:10,fontWeight:tab===t?700:400,cursor:"pointer",fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── TAB: FEE SCHEDULES ── */}
      {tab==="schedules"&&(
        <>
          {/* Payer cards */}
          <div style={{display:"flex",background:"#fff",borderBottom:"1px solid #dce8f4",overflowX:"auto",flexShrink:0}}>
            {payers.map(py=>{
              const hasSched=!!localSched[py.name];
              const cnt=hasSched?coveredCount(py.name):0;
              const isAct=activePyr?.id===py.id;
              return (
                <div key={py.id} onClick={()=>setActivePyr(py)}
                  style={{padding:"10px 14px",cursor:"pointer",borderRight:"1px solid #eef4fb",minWidth:140,borderBottom:isAct?"3px solid #1e4080":"3px solid transparent",background:isAct?"#f4f8fd":"#fff",flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:isAct?"#1e4080":"#1a2d4a"}}>{py.name}</div>
                  <div style={{fontSize:8,color:hasSched?"#1a7040":"#a04000",marginTop:1,fontWeight:600}}>{py.isBase?"CMS Baseline":hasSched?`✓ ${cnt} codes`:"No schedule"}</div>
                  {py.lastUpdated&&<div style={{fontSize:7,color:"#7a9ab8",marginTop:1}}>Updated: {py.lastUpdated}</div>}
                  {py.uploadedFile&&<div style={{fontSize:7,color:"#7a9ab8",marginTop:1,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={py.uploadedFile}>📁 {py.uploadedFile}</div>}
                  <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                    {hasSched&&<button onClick={e=>{e.stopPropagation();downloadPayerCSV(py.name);}} style={{padding:"2px 6px",fontSize:7,borderRadius:2,border:"1px solid #dce8f4",background:"#f8fafd",color:"#3a6ab0",cursor:"pointer",fontFamily:"inherit"}}>⬇️ CSV</button>}
                    {py.uploadedFile&&<button onClick={e=>{e.stopPropagation();downloadOriginal(py);}} style={{padding:"2px 6px",fontSize:7,borderRadius:2,border:"1px solid #dce8f4",background:"#f8fafd",color:"#3a6ab0",cursor:"pointer",fontFamily:"inherit"}}>⬇️ Original</button>}
                    {(hasSched||py.parsedData)&&<button onClick={e=>{e.stopPropagation();setViewParsed(py);}} style={{padding:"2px 6px",fontSize:7,borderRadius:2,border:"1px solid #1e4080",background:"rgba(30,64,128,.06)",color:"#1e4080",cursor:"pointer",fontFamily:"inherit"}}>👁 View Parsed</button>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div style={{padding:"7px 20px",background:"#fff",borderBottom:"1px solid #dce8f4",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search CPT or name…" style={{padding:"4px 9px",fontSize:10,borderRadius:3,background:"#f8fafd",color:"#1a2d4a",border:"1px solid #dce8f4",outline:"none",fontFamily:"inherit",width:160}}/>
            {["All",...CATEGORIES].map(c=><button key={c} onClick={()=>setCatF(c)} style={{padding:"2px 8px",borderRadius:3,border:"1px solid",borderColor:catF===c?"#1e4080":"#dce8f4",background:catF===c?"#1e4080":"#fff",color:catF===c?"#fff":"#7a9ab8",fontSize:8,cursor:"pointer",fontFamily:"inherit"}}>{c}</button>)}
            <span style={{fontSize:8,color:"#7a9ab8",marginLeft:"auto"}}>{sorted.length} codes  |  click rate to edit  |  ✎ units also editable</span>
          </div>

          {/* Table */}
          <div style={{flex:1,overflowY:"auto",overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",minWidth:600}}>
              <thead>
                <tr>
                  <th style={{...TH,textAlign:"left",position:"sticky",left:0,zIndex:20,minWidth:170}}>Service</th>
                  <th style={{...TH,textAlign:"left",minWidth:65}}>CPT</th>
                  <th style={{...TH,textAlign:"left",minWidth:85}}>Category</th>
                  <th style={{...TH,textAlign:"right",minWidth:80,borderLeft:"2px solid #c8d8ec",color:"#1e4080"}}>
                    {activePyr?.name} Rate
                    <div style={{fontWeight:300,fontSize:7,color:"#7a9ab8",marginTop:1}}>{activePyr?.isBase?"CMS":localSched[activePyr?.name]?"Schedule — click to edit":UNPRICED_RULES[activePyr?.name]?.label||"—"}</div>
                  </th>
                  <th style={{...TH,textAlign:"right",minWidth:80}}>Rate/Unit</th>
                  <th style={{...TH,textAlign:"center",minWidth:60}}>Sched. Units</th>
                  <th style={{...TH,textAlign:"center",minWidth:70}}>Item Bill Units</th>
                  <th style={{...TH,textAlign:"center",minWidth:80}}>On Schedule</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((cpt,idx)=>{
                  const item=cptInfo[cpt];
                  const py=activePyr;if(!py)return null;
                  const hasSched=py.isBase||!!localSched[py.name];
                  const entry=py.isBase?{rate:item?.medicarerate,units:item?.billingUnits||1}:getSchedEntry(localSched[py.name],cpt);
                  const isEd=editCell?.pn===py.name&&editCell?.cpt===cpt;
                  const onSch=py.isBase?true:(hasSched&&entry!=null);
                  const perUnit=entry?+(entry.rate/(entry.units||1)).toFixed(4):null;
                  const schedUnits=entry?.units||1;
                  const itemBillUnits=item?.billingUnits||1;
                  return (
                    <tr key={cpt} style={{background:idx%2===0?"#fff":"#f8fafd"}}>
                      <td style={{...TD,position:"sticky",left:0,background:idx%2===0?"#fff":"#f8fafd",zIndex:5,borderRight:"1px solid #eef4fb"}}>
                        {item?<><div style={{fontSize:11,fontWeight:500,color:"#1a2d4a"}}>{item.name}</div><div style={{fontSize:7,color:"#7a9ab8"}}>{item.notes}</div></>:<span style={{fontSize:9,color:"#7a9ab8"}}>—</span>}
                      </td>
                      <td style={{...TD,fontSize:10,color:"#7a9ab8",fontStyle:"italic"}}>{cpt}</td>
                      <td style={{...TD}}>{item?.category?<span className={`cbadge c-${item.category.replace(/ /g,"_")}`}>{item.category}</span>:<span style={{color:"#c8d8ec"}}>—</span>}</td>
                      {/* Rate cell — editable */}
                      <td style={{...TD,textAlign:"right",borderLeft:"2px solid #c8d8ec",cursor:(!py.isBase&&hasSched)?"text":"default",background:!onSch&&hasSched?"rgba(200,80,0,.03)":"rgba(30,64,128,.02)"}}
                        onClick={()=>!py.isBase&&hasSched&&startEdit(py.name,cpt)}>
                        {isEd
                          ? <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")setEditCell(null);}} style={{width:90,fontSize:12,padding:"2px 4px",border:"1px solid #3a6ab0",borderRadius:2,background:"#fff",color:"#1a2d4a",fontFamily:"inherit",outline:"none",textAlign:"right"}}/>
                          : entry!=null
                            ? <span style={{fontSize:12,fontWeight:600,color:"#1a2d4a"}}>${Number(entry.rate||0).toFixed(2)}{!py.isBase&&hasSched&&<span style={{fontSize:7,color:"#7a9ab8",marginLeft:4}}>✎</span>}</span>
                            : <span style={{fontSize:9,color:hasSched?"#c03020":"#7a9ab8"}}>{hasSched?"★ Not listed":UNPRICED_RULES[py.name]?.label||"—"}{hasSched&&!py.isBase&&<div style={{fontSize:7,color:"#3a6ab0",cursor:"pointer"}}>+ click to add</div>}</span>
                        }
                      </td>
                      <td style={{...TD,textAlign:"right",fontSize:10,color:"#3a6ab0"}}>{perUnit!=null?`$${perUnit.toFixed(2)}`:"—"}</td>
                      <td style={{...TD,textAlign:"center",fontSize:10,color:"#1a2d4a",fontWeight:500}}>{schedUnits}</td>
                      <td style={{...TD,textAlign:"center",fontSize:10,color:"#1a2d4a"}}>{itemBillUnits}</td>
                      <td style={{...TD,textAlign:"center"}}>{py.isBase?<span style={{fontSize:9,color:"#1e4080"}}>CMS</span>:onSch?<span style={{fontSize:12,color:"#1a7040"}}>✓</span>:<span style={{fontSize:12,color:"#c03020"}}>★</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{background:"#fff",borderTop:"1px solid #dce8f4",padding:"6px 20px",display:"flex",gap:16,alignItems:"center",fontSize:8,color:"#7a9ab8",flexShrink:0}}>
            <span><span style={{color:"#1a7040"}}>✓</span> On schedule</span>
            <span><span style={{color:"#c03020"}}>★</span> Unpriced — rule applies</span>
            <span>Rate/Unit = Total Rate ÷ Schedule Units</span>
            {dirty&&<span style={{color:"#a07000"}}>● Click "Save Edits" to apply</span>}
          </div>
        </>
      )}

      {/* ── TAB: ADD ITEM ── */}
      {tab==="add"&&(
        <div style={{flex:1,overflowY:"auto",padding:"24px"}}>
          <div style={{maxWidth:580}}>
            <div style={{fontFamily:"'Libre Baskerville',serif",fontSize:18,color:"#1a2d4a",marginBottom:6}}>Add Tracked Item</div>
            <div style={{fontSize:10,color:"#7a9ab8",marginBottom:20,lineHeight:1.7,background:"#eef4fb",borderRadius:6,padding:"10px 14px"}}>
              Rates auto-populate from each payer's fee schedule when a CPT code matches. If not on a schedule, the payer's unpriced rule applies automatically.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {[["Name","name","text","e.g. Beovu"],["CPT / J-Code","cptCode","text","e.g. J0180"],["Medicare Rate ($)","medicarerate","number",""],["Our Cost ($)","ourCost","number",""],["Billing Units","billingUnits","number","1"],["Notes","notes","text",""]].map(([lbl,fld,type,ph])=>(
                <div key={fld} style={{gridColumn:fld==="notes"?"1/-1":"auto"}}>
                  <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>{lbl}</div>
                  <input type={type} value={newItem[fld]} placeholder={ph} onChange={e=>setNewItem(p=>({...p,[fld]:type==="number"?+e.target.value:e.target.value}))}
                    style={{width:"100%",padding:"7px 10px",fontSize:12,borderRadius:4,background:"#f8fafd",color:"#1a2d4a",border:"1px solid #c8d8ec",outline:"none",fontFamily:"inherit"}}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Category</div>
                <select value={newItem.category} onChange={e=>setNewItem(p=>({...p,category:e.target.value}))} style={{width:"100%",padding:"7px 10px",fontSize:12,borderRadius:4,background:"#f8fafd",color:"#1a2d4a",border:"1px solid #c8d8ec",outline:"none",fontFamily:"inherit"}}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {newItem.cptCode.trim()&&(
              <div style={{marginTop:20}}>
                <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8,fontWeight:600}}>Preview — rates from all payers</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                  {payers.map(py=>{
                    const cpt=newItem.cptCode.toUpperCase();
                    const entry=py.isBase?{rate:newItem.medicarerate||0,units:newItem.billingUnits||1}:getSchedEntry(localSched[py.name],cpt);
                    const onSch=entry!=null;
                    const rule=UNPRICED_RULES[py.name];
                    const perUnit=entry?+(entry.rate/(entry.units||1)).toFixed(2):null;
                    return (
                      <div key={py.id} style={{background:onSch?"rgba(26,112,64,.05)":"rgba(200,80,0,.04)",border:"1px solid",borderColor:onSch?"rgba(26,112,64,.2)":"rgba(200,80,0,.15)",borderRadius:5,padding:"8px 10px"}}>
                        <div style={{fontSize:9,fontWeight:700,color:"#1a2d4a"}}>{py.name}</div>
                        {onSch
                          ? <>
                              <div style={{fontSize:12,fontWeight:700,color:"#1a7040",marginTop:2}}>${Number(entry.rate||0).toFixed(2)}</div>
                              <div style={{fontSize:8,color:"#7a9ab8"}}>${Number(perUnit||0).toFixed(2)}/unit  |  {entry.units} unit{entry.units!==1?"s":""}</div>
                            </>
                          : <div style={{fontSize:8,color:"#c03020",marginTop:2}}>★ {rule?.label||"Unpriced"}</div>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button onClick={handleAddItem} disabled={!newItem.name.trim()||!newItem.cptCode.trim()}
              style={{marginTop:20,width:"100%",padding:"10px 0",borderRadius:5,border:"none",background:newItem.name.trim()&&newItem.cptCode.trim()?"#1e4080":"#c8d8ec",color:"#fff",fontSize:12,cursor:newItem.name.trim()&&newItem.cptCode.trim()?"pointer":"not-allowed",fontFamily:"inherit",fontWeight:600}}>
              ➕ Add to Tracker
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: UPLOAD ── */}
      {tab==="upload"&&(
        <div style={{flex:1,overflowY:"auto",padding:"24px"}}>
          <div style={{maxWidth:580}}>
            <div style={{fontFamily:"'Libre Baskerville',serif",fontSize:18,color:"#1a2d4a",marginBottom:6}}>Upload Fee Schedule</div>
            <div style={{fontSize:10,color:"#7a9ab8",marginBottom:20,lineHeight:1.7}}>Upload a CSV fee schedule. The system will auto-parse CPT codes and rates. XLS/XLSX files should be exported to CSV first.</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9,color:"#7a9ab8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Select Payer</div>
              <select value={activePyr?.name||""} onChange={e=>setActivePyr(payers.find(p=>p.name===e.target.value)||payers[0])}
                style={{width:"100%",padding:"8px 10px",fontSize:12,borderRadius:4,background:"#f8fafd",color:"#1a2d4a",border:"2px solid #1e4080",outline:"none",fontFamily:"inherit",fontWeight:600}}>
                {payers.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            {activePyr&&(
              <div style={{marginBottom:16,background:"#f4f8fd",borderRadius:6,padding:"12px 14px",fontSize:10,color:"#7a9ab8",lineHeight:1.8}}>
                <div style={{color:"#1a2d4a",fontWeight:600,marginBottom:4}}>{activePyr.name}</div>
                <div>Last updated: <strong style={{color:"#1e4080"}}>{activePyr.lastUpdated||"Never uploaded"}</strong></div>
                <div>File on record: <strong style={{color:"#1a2d4a"}}>{activePyr.uploadedFile||"None"}</strong></div>
                <div>Status: <strong style={{color:activePyr.hasSchedule?"#1a7040":"#a04000"}}>{activePyr.hasSchedule?"✓ Schedule loaded":"No schedule"}</strong></div>
                <div>Unpriced rule: {UNPRICED_RULES[activePyr.name]?.label||"N/A"}</div>
              </div>
            )}
            <div onClick={()=>fileRef.current?.click()}
              style={{border:"2px dashed #a8c0e0",borderRadius:8,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:"#f8fafd",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#1e4080";e.currentTarget.style.background="#eef4fb";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#a8c0e0";e.currentTarget.style.background="#f8fafd";}}>
              <div style={{fontSize:32,marginBottom:8}}>{uploading?"⏳":"📤"}</div>
              <div style={{fontSize:12,color:"#1a2d4a",fontWeight:600}}>{uploading?"Parsing…":"Click to upload fee schedule (CSV)"}</div>
              <div style={{fontSize:9,color:"#7a9ab8",marginTop:4}}>CSV preferred  |  Expects "Code" and "Fee" columns  |  for {activePyr?.name}</div>
              <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.txt" style={{display:"none"}} onChange={handleUpload}/>
            </div>
            {uploadMsg&&(
              <div style={{marginTop:14,background:uploadParsed?"rgba(26,112,64,.08)":"rgba(200,80,0,.08)",border:`1px solid ${uploadParsed?"rgba(26,112,64,.25)":"rgba(200,80,0,.25)"}`,borderRadius:6,padding:"12px 14px",fontSize:10,color:uploadParsed?"#1a7040":"#a04000",lineHeight:1.7}}>
                {uploadMsg}
                {uploadParsed&&<div style={{marginTop:6}}><button onClick={()=>setViewParsed(activePyr)} style={{padding:"4px 12px",borderRadius:3,border:"1px solid #1e4080",background:"rgba(30,64,128,.08)",color:"#1e4080",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>👁 View Parsed Data</button></div>}
              </div>
            )}
            {dirty&&<div style={{marginTop:10,background:"rgba(232,160,32,.08)",border:"1px solid rgba(232,160,32,.3)",borderRadius:4,padding:"8px 12px",fontSize:9,color:"#a07000"}}>● Don't forget to click <strong>Save Edits</strong> in the Schedule tab to apply uploaded rates.</div>}
          </div>
        </div>
      )}

      {/* Compare modal (inside FSM) */}
      {compareOpen&&<CompareModal payers={payers} items={items} schedules={localSched} targetPct={30} onClose={()=>setCompareOpen(false)}/>}

      {/* View Parsed modal */}
      {viewParsed&&<ViewParsedModal payer={viewParsed} items={items} loadFullSchedule={loadFullSchedule} onClose={()=>setViewParsed(null)}/>}
    </div>
  );
}

// ─── VIEW PARSED MODAL ────────────────────────────────────────────────────────
function ViewParsedModal({payer,items,loadFullSchedule,onClose}) {
  const [schedule, setSchedule] = useState({});
  const [loading,  setLoading]  = useState(true);
  useEffect(()=>{
    setLoading(true);
    loadFullSchedule(payer.name).then(full=>{setSchedule(full);setLoading(false);}).catch(()=>setLoading(false));
  },[payer.name]); // eslint-disable-line
  const cptInfo={}; items.forEach(i=>{cptInfo[i.cptCode.toUpperCase()]=i;});
  const entries=Object.entries(schedule).sort((a,b)=>a[0].localeCompare(b[0]));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(30,64,128,.3)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}} >
      <div style={{background:"#fff",borderRadius:10,boxShadow:"0 12px 48px rgba(30,64,128,.2)",width:"80vw",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#1a3a6a,#1e4080)",padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontFamily:"'Libre Baskerville',serif",fontSize:16,color:"#fff"}}>👁 Parsed Schedule — {payer.name}</div>
            <div style={{fontSize:8,color:"rgba(255,255,255,.6)",marginTop:2}}>View only  |  {entries.length} codes loaded  |  Last updated: {payer.lastUpdated||"—"}</div>
          </div>
          <button onClick={onClose} style={{background:"#c0392b",border:"none",borderRadius:6,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>×</button>
        </div>
        {payer.uploadedFile&&<div style={{background:"#f4f8fd",padding:"8px 20px",fontSize:9,color:"#7a9ab8",borderBottom:"1px solid #dce8f4",flexShrink:0}}>📁 Source file: <strong style={{color:"#1a2d4a"}}>{payer.uploadedFile}</strong></div>}
        <div style={{flex:1,overflowY:"auto"}}>
          {loading ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"#7a9ab8",fontSize:12}}>
              <div style={{fontSize:24,marginBottom:8,display:"inline-block",animation:"spin 1.2s linear infinite"}}>⟳</div>
              <div>Loading full schedule…</div>
              <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
            </div>
          ) : (
          <table style={{borderCollapse:"collapse",width:"100%"}}>
            <thead>
              <tr>
                {[["CPT Code","left"],["Service Name","left"],["Category","left"],["Total Rate","right"],["Rate / Unit","right"],["Schedule Units","center"]].map(([h,a])=>(
                  <th key={h} style={{...TH,textAlign:a,position:"sticky",top:0}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(([cpt,entry],idx)=>{
                const e=typeof entry==="number"?{rate:entry,units:1}:entry;
                const it=cptInfo[cpt.toUpperCase()];
                return (
                  <tr key={cpt} style={{background:idx%2===0?"#fff":"#f8fafd"}}>
                    <td style={{...TD,fontFamily:"monospace",fontSize:11,color:"#1e4080",fontWeight:600}}>{cpt}</td>
                    <td style={{...TD,fontSize:11,color:"#1a2d4a"}}>{it?.name||<span style={{color:"#c8d8ec"}}>—</span>}</td>
                    <td style={{...TD}}>{it?.category?<span className={`cbadge c-${it.category.replace(/ /g,"_")}`}>{it.category}</span>:<span style={{color:"#c8d8ec",fontSize:9}}>—</span>}</td>
                    <td style={{...TD,textAlign:"right",fontSize:12,fontWeight:700,color:"#1a2d4a"}}>{fmt(e.rate)}</td>
                    <td style={{...TD,textAlign:"right",fontSize:11,color:"#3a6ab0"}}>{fmt(+(e.rate/(e.units||1)).toFixed(4))}</td>
                    <td style={{...TD,textAlign:"center",fontSize:11,color:"#1a2d4a"}}>{e.units||1}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        <div style={{padding:"10px 20px",background:"#e8f0fa",borderTop:"1px solid #dce8f4",fontSize:9,color:"#7a9ab8",flexShrink:0}}>
          {loading ? "Loading…" : (entries.length + " codes  |  view-only  |  edit rates in the Fee Schedules tab")}
        </div>
      </div>
    </div>
  );
}

// ─── COMPARE MODAL ────────────────────────────────────────────────────────────
function CompareModal({payers,items,schedules,targetPct,onClose}) {
  const [payerA,setPayerA]=useState(payers[0]?.name||"");
  const [payerB,setPayerB]=useState(payers[2]?.name||"");
  const [cat,   setCat]   =useState("All");
  const filtered=cat==="All"?items:items.filter(i=>i.category===cat);
  const getR=(item,pn)=>computeRate(item,pn,schedules,item.billedAmt||0);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(30,64,128,.35)",zIndex:550,display:"flex",alignItems:"center",justifyContent:"center"}} >
      <div style={{background:"#fff",borderRadius:10,boxShadow:"0 12px 48px rgba(30,64,128,.2)",width:"92vw",maxWidth:960,maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#1a3a6a,#1e4080)",padding:"13px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{fontFamily:"'Libre Baskerville',serif",fontSize:17,color:"#fff"}}>⊞ Compare Insurance Rates</div>
          <button onClick={onClose} style={{background:"#c0392b",border:"none",borderRadius:6,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>×</button>
        </div>
        <div style={{padding:"10px 20px",background:"#f8fafd",borderBottom:"1px solid #dce8f4",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
          {[["Payer A",payerA,setPayerA,"#1e4080"],["Payer B",payerB,setPayerB,"#3a6ab0"]].map(([lbl,val,setVal,bc])=>(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:"#7a9ab8",fontWeight:600}}>{lbl}:</span>
              <select value={val} onChange={e=>setVal(e.target.value)} style={{padding:"5px 10px",fontSize:11,borderRadius:4,background:"#fff",color:"#1a2d4a",border:`2px solid ${bc}`,outline:"none",fontFamily:"inherit",fontWeight:600}}>
                {payers.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          ))}
          <span style={{fontSize:18,color:"#c8d8ec"}}>vs</span>
          <div style={{width:1,height:20,background:"#dce8f4"}}/>
          {["All",...CATEGORIES].map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"3px 8px",borderRadius:3,border:"1px solid",borderColor:cat===c?"#1e4080":"#dce8f4",background:cat===c?"#1e4080":"#fff",color:cat===c?"#fff":"#7a9ab8",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>{c}</button>)}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%"}}>
            <thead>
              <tr>
                {[["Service","left",180],["CPT","left",65],["Cat.","left",80],["Units","right",55],[`${payerA} Rate`,"right",120],[`${payerA} Profit`,"right",100],[`${payerB} Rate`,"right",120],[`${payerB} Profit`,"right",100],["Diff","right",100],["Better","center",70]].map(([h,a,w])=>(
                  <th key={h} style={{...TH,textAlign:a,minWidth:w}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item,idx)=>{
                const resA=getR(item,payerA),resB=getR(item,payerB);
                const rA=resA.totalReimb??0,rB=resB.totalReimb??0;
                const pA=rA-(item.ourCost||0),pB=rB-(item.ourCost||0);
                const diff=rA-rB;
                const better=diff>0?payerA:diff<0?payerB:"Tie";
                const units=item.billingUnits||1;
                return (
                  <tr key={item.id} style={{background:idx%2===0?"#fff":"#f8fafd"}}>
                    <td style={{...TD,fontSize:11,fontWeight:500,color:"#1a2d4a"}}>{item.name}</td>
                    <td style={{...TD,fontSize:9,color:"#7a9ab8",fontStyle:"italic"}}>{item.cptCode}</td>
                    <td style={{...TD}}><span className={`cbadge c-${item.category.replace(/ /g,"_")}`}>{item.category}</span></td>
                    <td style={{...TD,textAlign:"right",fontSize:10,color:"#1a2d4a"}}>{units}</td>
                    <td style={{...TD,textAlign:"right"}}>
                      <div style={{fontSize:11,fontWeight:600,color:"#1a2d4a"}}>{rA>0?fmt(rA):"—"}</div>
                      <div style={{fontSize:7,color:resA.onSchedule?"#1a7040":"#c03020"}}>{resA.onSchedule?"📋 schedule":"★ "+UNPRICED_RULES[payerA]?.label}</div>
                    </td>
                    <td style={{...TD,textAlign:"right",fontSize:11,fontWeight:600,color:pA>=0?"#1e4080":"#c0392b"}}>{pA>=0?"+":""}{fmt(pA)}</td>
                    <td style={{...TD,textAlign:"right"}}>
                      <div style={{fontSize:11,fontWeight:600,color:"#1a2d4a"}}>{rB>0?fmt(rB):"—"}</div>
                      <div style={{fontSize:7,color:resB.onSchedule?"#1a7040":"#c03020"}}>{resB.onSchedule?"📋 schedule":"★ "+UNPRICED_RULES[payerB]?.label}</div>
                    </td>
                    <td style={{...TD,textAlign:"right",fontSize:11,fontWeight:600,color:pB>=0?"#1e4080":"#c0392b"}}>{pB>=0?"+":""}{fmt(pB)}</td>
                    <td style={{...TD,textAlign:"right",fontSize:11,fontWeight:700,color:diff>0?"#1a7040":diff<0?"#c0392b":"#7a9ab8"}}>{diff>0?"+":""}{fmt(diff)}</td>
                    <td style={{...TD,textAlign:"center",fontSize:9,fontWeight:700,color:better===payerA?"#1e4080":better===payerB?"#3a6ab0":"#7a9ab8"}}>{better}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{padding:"10px 20px",background:"#e4eef8",borderTop:"2px solid #c8d8ec",display:"flex",gap:24,flexWrap:"wrap",fontSize:10,flexShrink:0}}>
          {[payerA,payerB].map(pn=>{const tot=filtered.reduce((s,it)=>s+(getR(it,pn).totalReimb??0),0);const totP=filtered.reduce((s,it)=>s+(getR(it,pn).totalReimb??0)-(it.ourCost||0),0);return(
            <div key={pn} style={{display:"flex",gap:14,alignItems:"center"}}>
              <span style={{color:"#7a9ab8",fontWeight:600}}>{pn}:</span>
              <span>Total: <strong style={{color:"#1e4080"}}>{fmtK(tot)}</strong></span>
              <span>Profit: <strong style={{color:totP>=0?"#1a7040":"#c0392b"}}>{fmtK(totP)}</strong></span>
            </div>
          );})}
          <span style={{marginLeft:"auto",color:"#7a9ab8"}}>Net diff: <strong style={{color:"#1a2d4a"}}>{fmtK(filtered.reduce((s,it)=>{const rA=getR(it,payerA).totalReimb??0,rB=getR(it,payerB).totalReimb??0;return s+(rA-rB);},0))}</strong></span>
        </div>
      </div>
    </div>
  );
}

const TH = {fontSize:9,letterSpacing:".05em",textTransform:"uppercase",color:"#7a9ab8",padding:"8px 10px",borderBottom:"2px solid #dce8f4",background:"#f0f5fb",whiteSpace:"nowrap",fontFamily:"'DM Mono',monospace",fontWeight:500};
const TD = {padding:"7px 10px",borderBottom:"1px solid #eef4fb",verticalAlign:"middle"};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#f0f5fb;color:#1a2d4a;}
button,input,select{font-family:'DM Mono',monospace;}
.hdr{padding:13px 24px;border-bottom:1px solid #c8d8ec;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#1a3a6a 0%,#1e4080 100%);}
.hdr-title{font-family:'Libre Baskerville',serif;font-size:18px;font-weight:400;color:#fff;}
.hdr-em{color:#a8d0f8;font-style:italic;}
.hdr-sub{font-size:9px;color:rgba(255,255,255,.55);letter-spacing:.06em;text-transform:uppercase;margin-top:2px;}
.live{display:inline-block;width:5px;height:5px;border-radius:50%;background:#a8d0f8;margin-right:5px;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.hdr-gear{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:7px;color:#fff;width:36px;height:36px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.hdr-gear:hover{background:rgba(255,255,255,.22);}
.s-item{padding:8px 18px;border-right:1px solid #dce8f4;display:flex;flex-direction:column;gap:2px;white-space:nowrap;}
.s-lbl{font-size:8px;color:#7a9ab8;text-transform:uppercase;letter-spacing:.07em;}
.s-val{font-size:13px;font-family:'Libre Baskerville',serif;color:#1e4080;}
.cat-btn{padding:4px 10px;border-radius:3px;border:1px dashed #dce8f4;background:#f8fafd;color:#7a9ab8;font-size:9px;cursor:pointer;transition:all .15s;font-family:inherit;}
.cat-btn:hover{color:#1a2d4a;border-color:#a8c0e0;}
.cat-btn.on{background:#1e4080;border-color:#1e4080;color:#fff;border-style:solid;}
.sec-label{font-size:8px;color:#7a9ab8;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:5px;}
.card-row{display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;gap:6px;}
.card-lbl{font-size:8px;color:#7a9ab8;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;}
.card-val{font-size:10px;color:#1a2d4a;text-align:right;}
.menu-item{display:block;width:100%;padding:8px 14px;background:none;border:none;text-align:left;font-size:10px;color:#1a2d4a;cursor:pointer;font-family:inherit;}
.menu-item:hover{background:#f0f5fb;}
.menu-item.danger{color:#c0392b;}
.menu-item.danger:hover{background:#fff5f5;}
.cbadge{display:inline-block;padding:2px 5px;border-radius:3px;font-size:7px;letter-spacing:.04em;text-transform:uppercase;font-weight:600;}
.c-Injectable{background:rgba(30,64,128,.1);color:#1e4080;}
.c-Laser{background:rgba(30,80,160,.09);color:#1e50a0;}
.c-Procedure{background:rgba(58,106,176,.08);color:#3a6ab0;}
.c-Diagnostic{background:rgba(52,104,170,.07);color:#3468aa;}
.c-Office_Visit{background:rgba(72,120,184,.07);color:#4878b8;}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#f0f5fb}
::-webkit-scrollbar-thumb{background:#c8d8ec;border-radius:3px}
`;
