/**
 * Scientific reference database for VitalStat insights.
 *
 * Every insight in the app cites a real study. This module centralizes
 * references so the text is consistent and updatable in one place.
 */

export interface StudyRef {
  /** Short citation: "Kodama 2009" */
  short: string;
  /** Sample size when relevant */
  n?: number;
  /** Key finding in one sentence */
  finding: string;
}

export const REFS = {
  // ── Cardiovascular & Mortality ──
  kodama2009: {
    short: "Kodama 2009",
    n: 33_000,
    finding: "1 MET (3.5 mL/kg/min) in plus = 13% mai putin risc de mortalitate cardiovasculara",
  },
  nauman2011: {
    short: "Nauman 2011 (HUNT)",
    n: 50_000,
    finding: "Puls repaus <60 bpm = 21% mai putin risc cardiovascular vs 70-79 bpm",
  },
  palatini2006: {
    short: "Palatini 2006",
    finding: "Pulsul de repaus ridicat este un factor de risc cardiovascular independent",
  },
  paluch2022: {
    short: "Paluch 2022",
    n: 78_500,
    finding: "Beneficiile pe mortalitate cresc rapid intre 4,000-8,000 pasi/zi si platesc dupa 10,000",
  },
  studenski2011: {
    short: "Studenski 2011",
    n: 34_000,
    finding: "Viteza de mers prezice mortalitatea la 10 ani la varstnici",
  },

  // ── HRV & Autonomic ──
  nunan2010: {
    short: "Nunan 2010",
    n: 1_906,
    finding: "Norme RMSSD pe grupe de varsta pentru adulti sanatosi",
  },
  umetani1998: {
    short: "Umetani 1998",
    n: 260,
    finding: "HRV scade natural ~0.5 ms/an incepand de la 25 ani",
  },
  voss2015: {
    short: "Voss 2015",
    n: 1_906,
    finding: "Norme HRV pe varsta si sex — referinta pentru percentile populationale",
  },
  buchheit2014: {
    short: "Buchheit 2014",
    finding: "ln(RMSSD) este cel mai fiabil marker al adaptarii autonome la antrenament",
  },
  plews2013: {
    short: "Plews 2013",
    finding: "CV-ul HRV pe 7 zile este un indicator mai puternic de supraantrenament decat media absoluta",
  },

  // ── Sleep ──
  vanDongen2003: {
    short: "Van Dongen 2003 (UPenn)",
    n: 48,
    finding: "Dupa 14 zile la 6h somn/noapte, performanta cognitiva = 2 nopti fara somn, dar subiectii nu constientizeaza",
  },
  nsf2015: {
    short: "NSF 2015",
    finding: "National Sleep Foundation recomanda 7-9h somn/noapte pentru adulti 18-64 ani",
  },
  ohayon2017: {
    short: "Ohayon 2017",
    finding: "Criteriile de calitate a somnului: latenta <20 min, eficienta >85%, treziri <1/noapte",
  },
  walker2017: {
    short: "Walker 2017",
    finding: "Somnul profund (deep/N3) este critic pentru consolidarea memoriei si curatarea metabolica cerebrala",
  },
  wittmann2006: {
    short: "Wittmann 2006",
    finding: "Social jet lag >1h (diferenta weekend/weekday) creste riscul de obezitate si depresie",
  },

  // ── Training & Exercise ──
  gabbett2016: {
    short: "Gabbett 2016",
    finding: "ACWR 0.8-1.3 = zona de risc minim de accidentare; >1.5 creste riscul de 2-3x",
  },
  hulin2014: {
    short: "Hulin 2014",
    finding: "Cresterea brusca a incarcarii (spike ratio >1.5) e cel mai puternic predictor de accidentare",
  },
  meeusen2013: {
    short: "Meeusen 2013",
    finding: "Overtraining: HRV scazut + RHR crescut + performanta redusa persistenta >2 saptamani",
  },
  halson2014: {
    short: "Halson 2014",
    finding: "Supraintrenarea functionala se rezolva in 1-2 saptamani de deload; non-functionala necesita luni",
  },
  banister1975: {
    short: "Banister 1975",
    finding: "Modelul Fitness-Fatigue: performanta = CTL - ATL (forma = fitness - oboseala)",
  },

  // ── Illness Detection ──
  radin2020: {
    short: "Radin 2020 (Stanford DETECT)",
    n: 32_000,
    finding: "Cresteri de RHR + scaderi de HRV cu 3-5 zile inainte de debutul simptomelor infectioase",
  },

  // ── Aging & Longevity ──
  tanaka2001: {
    short: "Tanaka 2001",
    n: 350,
    finding: "HR max = 208 - 0.7 x varsta (mai precis decat formula 220 - varsta)",
  },
  acsm2021: {
    short: "ACSM 2021 (ed. 11)",
    finding: "Ghid ACSM: tabele de percentile VO2 Max pe varsta si sex",
  },
} as const satisfies Record<string, StudyRef>;

export type RefKey = keyof typeof REFS;

/** Format a reference for inline display: "Kodama 2009, n=33,000" */
export function cite(key: RefKey): string {
  const ref = REFS[key];
  if ("n" in ref && ref.n) return `${ref.short}, n=${ref.n.toLocaleString("ro-RO")}`;
  return ref.short;
}
