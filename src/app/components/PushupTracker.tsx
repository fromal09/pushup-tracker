'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Rep {
  ts:       number;
  complete: boolean;
}

interface Session {
  startTs:    number;
  endTs:      number;
  durationMs: number;
  complete:   number;
  incomplete: number;
  total:      number;
}

interface Stats {
  total:      number;
  incomplete: number;
  sessions:   Session[];
  streaks:    { current: number; best: number };
  todayN:     number;
  weekN:      number;
  dayDist:    number[];
  hourDist:   number[];
  failDay:    number[];
  bestSession: Session | null;
  avgPerSess: number;
  bestDay:    [string, number] | null;
  lifetime:   number;
  incRate:    string;
  sessionPR:  number;
  dayPR:      number;
  estDays:    number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GOAL                  = 1_000_000;
const SESSION_GAP_MS        = 10 * 60 * 1000;
const MIN_REP_MS            = 1500;
const INCOMPLETE_TIMEOUT_MS = 5 * 1000;

const fmt = (n: number) => n.toLocaleString('en-US');

const BG   = '#f4f6ff';
const SURF = '#ffffff';
const EDGE = '#dce2f7';
const TEXT = '#05051c';
const DIM  = '#8a93c4';
const ELEC = '#1a3fff';
const PINK = '#ff0077';
const GRN  = '#00e57a';
const NRED = '#ff2244';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function deriveSessions(reps: Rep[], breaks: number[] = []): Session[] {
  if (!reps.length) return [];
  const out: Session[] = [];
  let g: Rep[] = [reps[0]];
  for (let i = 1; i < reps.length; i++) {
    const timeGap     = reps[i].ts - reps[i-1].ts >= SESSION_GAP_MS;
    const forcedBreak = breaks.some(b => b > reps[i-1].ts && b <= reps[i].ts);
    if (!timeGap && !forcedBreak) g.push(reps[i]);
    else { out.push(buildSess(g)); g = [reps[i]]; }
  }
  out.push(buildSess(g));
  return out;
}

function buildSess(g: Rep[]): Session {
  const done = g.filter(r => r.complete);
  const fail = g.filter(r => !r.complete);
  return {
    startTs:    g[0].ts,
    endTs:      g[g.length - 1].ts,
    durationMs: g[g.length - 1].ts - g[0].ts,
    complete:   done.length,
    incomplete: fail.length,
    total:      g.length,
  };
}

function calcStreaks(reps: Rep[]) {
  const days = [...new Set(
    reps.filter(r => r.complete).map(r => new Date(r.ts).toDateString())
  )].map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
  if (!days.length) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = (days[i].getTime() - days[i - 1].getTime()) / 86400000;
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const since = Math.floor((Date.now() - days[days.length - 1].getTime()) / 86400000);
  return { current: since <= 1 ? run : 0, best };
}

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
const fmtDur  = (ms: number) => ms < 60000
  ? `${Math.round(ms / 1000)}s`
  : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

function makeDemoReps(): Rep[] {
  const out: Rep[] = [];
  let ts = Date.now() - 29 * 86400000;
  for (let day = 0; day < 30; day++) {
    const sess = day % 7 === 0 ? 0 : day % 3 === 0 ? 2 : 1;
    for (let s = 0; s < sess; s++) {
      const hour  = s === 0 ? 6 + Math.random() * 3 : 17 + Math.random() * 3;
      const start = ts + hour * 3600000;
      const count = 20 + Math.floor(Math.random() * 40);
      for (let r = 0; r < count; r++) {
        const complete = Math.random() > 0.06;
        out.push({ ts: start + r * (2200 + Math.random() * 1800), complete });
      }
    }
    ts += 86400000;
  }
  return out.sort((a, b) => a.ts - b.ts);
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const SHEET = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Barlow+Condensed:wght@300;400;600;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${BG}; }
  button { font-family: 'Barlow Condensed', sans-serif; cursor: pointer; }
  button:active { opacity: .8; transform: scale(.98); }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-thumb { background: ${EDGE}; border-radius: 2px; }

  @keyframes epulse {
    0%,100% { text-shadow: 0 0 6px rgba(26,63,255,.9), 0 0 14px rgba(26,63,255,.6), 0 0 28px rgba(26,63,255,.4), 0 0 56px rgba(26,63,255,.15); }
    50%     { text-shadow: 0 0 10px rgba(26,63,255,1), 0 0 22px rgba(26,63,255,.85), 0 0 44px rgba(26,63,255,.55), 0 0 88px rgba(26,63,255,.28), 0 0 160px rgba(26,63,255,.1); }
  }
  @keyframes gpulse {
    0%,100% { text-shadow: 0 0 6px rgba(0,229,122,.9), 0 0 14px rgba(0,229,122,.6), 0 0 28px rgba(0,229,122,.4); }
    50%     { text-shadow: 0 0 12px rgba(0,229,122,1), 0 0 26px rgba(0,229,122,.85), 0 0 52px rgba(0,229,122,.6); }
  }
  @keyframes ppulse {
    0%,100% { text-shadow: 0 0 8px rgba(255,0,119,1), 0 0 18px rgba(255,0,119,.8), 0 0 36px rgba(255,0,119,.5); }
    50%     { text-shadow: 0 0 14px rgba(255,0,119,1), 0 0 30px rgba(255,0,119,.9), 0 0 60px rgba(255,0,119,.6), 0 0 120px rgba(255,0,119,.3); }
  }
  @keyframes fburst {
    0%   { color: ${PINK}; text-shadow: 0 0 12px rgba(255,0,119,1), 0 0 52px rgba(255,0,119,.65); }
    100% { color: ${TEXT}; text-shadow: 0 0 6px rgba(26,63,255,.9), 0 0 28px rgba(26,63,255,.4); }
  }
  @keyframes halo-fade {
    0%   { opacity:.7; transform:translate(-50%,-50%) scale(1); }
    100% { opacity:0;  transform:translate(-50%,-50%) scale(2.6); }
  }
  @keyframes dot-glow { 0%,100%{opacity:1} 50%{opacity:.5} }
  @keyframes pr-pop   { 0%{transform:scale(1.18)} 100%{transform:scale(1)} }

  .enum       { color:${TEXT}; animation:epulse 2.8s ease-in-out infinite; font-family:'Orbitron',monospace; }
  .enum.flash { animation:fburst .28s ease-out forwards; }
  .enum-green { color:${GRN};  animation:gpulse 2s   ease-in-out infinite; font-family:'Orbitron',monospace; }
  .enum-pink  { color:${PINK}; animation:ppulse 1.4s ease-in-out infinite; font-family:'Orbitron',monospace; }

  .neon-ring { position:absolute; top:50%; left:50%; border-radius:50%; pointer-events:none; animation:halo-fade .38s ease-out forwards; }
  .pr-pop    { animation:pr-pop .22s ease-out forwards; }

  .up-dot   { background:${GRN};  box-shadow:0 0 6px ${GRN},0 0 14px ${GRN};   animation:dot-glow 1.8s ease-in-out infinite; }
  .down-dot { background:${NRED}; box-shadow:0 0 6px ${NRED},0 0 14px ${NRED}; animation:dot-glow .7s  ease-in-out infinite; }

  .primary-btn { background:${ELEC}; color:#fff; border:none; font-weight:900; letter-spacing:.22em; text-transform:uppercase;
                 box-shadow:0 0 14px rgba(26,63,255,.55),0 0 28px rgba(26,63,255,.28); transition:box-shadow .2s; }
  .primary-btn:hover     { box-shadow:0 0 22px rgba(26,63,255,.8),0 0 44px rgba(26,63,255,.45); }
  .primary-btn:disabled  { background:${EDGE}; color:${DIM}; box-shadow:none; }

  .ghost-btn { background:transparent; border:1.5px solid ${EDGE}; color:${DIM}; transition:all .15s; }
  .ghost-btn:hover { border-color:${ELEC}; color:${ELEC}; box-shadow:0 0 8px rgba(26,63,255,.18); }

  .tab-active   { border-bottom:2.5px solid ${ELEC}; color:${ELEC}; }
  .tab-inactive { border-bottom:2.5px solid transparent; color:${DIM}; }
`;

// ─── Component ────────────────────────────────────────────────────────────────
const REP_DEPTH_M = 0.30;

interface Milestone { label: string; note: string; m: number; color: string; icon: string; }
interface MilestoneSection { section: string; items: Milestone[]; }

const HEIGHT_MILESTONES: MilestoneSection[] = [
  { section: 'People & everyday things', items: [
    { label: 'David (age 7)',         note: 'Your kid',                 m: 1.22,   color: '#1a3fff', icon: '👦' },
    { label: 'You (6 ft)',            note: '',                         m: 1.83,   color: '#1a3fff', icon: '🧍' },
    { label: 'Basketball hoop',       note: '',                         m: 3.05,   color: '#00e57a', icon: '🏀' },
    { label: 'Two-story house',       note: '',                         m: 7.6,    color: '#00e57a', icon: '🏠' },
  ]},
  { section: 'Trees', items: [
    { label: 'Ponderosa pine',        note: 'Colorado native',          m: 30,     color: '#3B6D11', icon: '🌲' },
    { label: 'Giant sequoia',         note: 'Tallest species',          m: 84,     color: '#3B6D11', icon: '🌲' },
    { label: 'Hyperion',              note: "World's tallest tree",     m: 115.9,  color: '#3B6D11', icon: '🌲' },
  ]},
  { section: 'Famous structures', items: [
    { label: 'Statue of Liberty',     note: 'Torch to base',            m: 93,     color: '#7F77DD', icon: '🗽' },
    { label: 'Eiffel Tower',          note: '',                         m: 330,    color: '#7F77DD', icon: '🗼' },
    { label: 'Burj Khalifa',          note: "World\'s tallest building", m: 828,  color: '#7F77DD', icon: '🏙️' },
  ]},
  { section: 'Mountains', items: [
    { label: 'Pikes Peak',            note: 'Colorado icon',            m: 4302,   color: '#888780', icon: '⛰️' },
    { label: 'Longs Peak',            note: 'Your backyard',            m: 4346,   color: '#888780', icon: '⛰️' },
    { label: 'Mont Blanc',            note: 'Highest in Alps',          m: 4808,   color: '#888780', icon: '⛰️' },
    { label: 'Denali',                note: 'Highest in N. America',    m: 6190,   color: '#5F5E5A', icon: '⛰️' },
    { label: 'Mount Everest',         note: "World\'s highest peak",   m: 8849,   color: '#5F5E5A', icon: '🏔️' },
  ]},
  { section: 'Space', items: [
    { label: 'Edge of space',         note: 'Kármán line — 100 km',    m: 100000, color: '#185FA5', icon: '🚀' },
    { label: 'ISS orbit',             note: '408 km up',                m: 408000, color: '#185FA5', icon: '🛸' },
    { label: '1,000,000 reps',        note: '300 km — the goal',        m: 300000, color: '#ff0077', icon: '⚡' },
  ]},
];

function fmtMilestoneM(m: number): string {
  if (m >= 1000000) return (m / 1000000).toFixed(2) + 'M km';
  if (m >= 1000)    return Math.round(m / 1000) + ' km';
  if (m >= 100)     return Math.round(m) + ' m';
  if (m >= 1)       return m.toFixed(1) + ' m';
  return Math.round(m * 100) + ' cm';
}

function fmtMilestoneReps(m: number): string {
  const r = Math.ceil(m / REP_DEPTH_M);
  if (r >= 1000000) return (r / 1000000).toFixed(2) + 'M';
  if (r >= 1000)    return Math.round(r / 1000) + 'k';
  return r.toLocaleString();
}

export default function PushupTracker() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const samplerCvs  = useRef<HTMLCanvasElement>(null);
  const displayCvs  = useRef<HTMLCanvasElement>(null);
  const overlayCvs  = useRef<HTMLCanvasElement>(null);
  const raf         = useRef<number>(0);
  const posRef      = useRef<'up' | 'down'>('up');
  const incTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downMinBRef = useRef<number>(Infinity);
  const lastRepTs   = useRef<number>(0);
  const tabRef      = useRef<'track' | 'stats' | 'height'>('track');
  const haloKey         = useRef<number>(0);
  const faceDetAvail    = useRef<boolean>(false);
  const faceDetector    = useRef<any>(null);
  const latestFaceW     = useRef<number>(0);
  const latestBrightness = useRef<number>(128);
  const calFaceUpRef    = useRef<number>(0);
  const calFaceSamples  = useRef<number[]>([]);
  const sessionDrawCvs  = useRef<HTMLCanvasElement>(null);
  const sessionOvlCvs   = useRef<HTMLCanvasElement>(null);
  const sessionDrawRaf  = useRef<number>(0);
  const calPhaseRef  = useRef<'position' | 'countdown'>('position');
  const calSamples   = useRef<number[]>([]);
  const calStabBuf   = useRef<number[]>([]);
  const cntDownStart = useRef<number | null>(null);

  const [tab,      setTab]      = useState<'track' | 'stats' | 'height'>('track');
  const setTabSynced = (t: 'track' | 'stats' | 'height') => {
    if (t !== 'track' && tabRef.current === 'track') {
      setSessionBreaks(prev => [...prev, Date.now()]);
    }
    tabRef.current = t; setTab(t);
  };
  const [phase,    setPhase]    = useState<'intro' | 'cal' | 'active'>('intro');
  const [calStep,    setCalStep]    = useState<'up' | 'down'>('up');
  const [calCntDown, setCalCntDown] = useState(5);
  const [calStable,  setCalStable]  = useState(false);
  const [calUp,    setCalUp]    = useState<number | null>(null);
  const [calDown,  setCalDown]  = useState<number | null>(null);
  const [posState, setPosState] = useState<'up' | 'down'>('up');
  const [camReady, setCamReady] = useState(false);
  const [camErr,   setCamErr]   = useState<string | null>(null);
  const [flash,    setFlash]    = useState(false);
  const [haloId,   setHaloId]   = useState<number | null>(null);
  const [badCal,   setBadCal]   = useState(false);
  const [reps,        setReps]       = useState<Rep[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionBreaks, setSessionBreaks] = useState<number[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saveErr,  setSaveErr]  = useState(false);


  useEffect(() => {
    if ('FaceDetector' in window) {
      try {
        faceDetector.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        faceDetAvail.current = true;
        console.log('FaceDetector: available');
      } catch (e) { console.log('FaceDetector init failed:', e); }
    } else {
      console.log('FaceDetector: not available — brightness only');
    }
  }, []);

  // ── Load saved calibration from localStorage
  useEffect(() => {
    const u = localStorage.getItem('pu_calUp');
    const d = localStorage.getItem('pu_calDown');
    if (u && d) { setCalUp(parseFloat(u)); setCalDown(parseFloat(d)); }
  }, []);

  // ── Load reps from DB on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/reps')
      .then(r => r.json())
      .then((data: Rep[]) => { setReps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── Save rep to DB (optimistic — state already updated) ────────────────────
  const saveRep = useCallback((rep: Rep) => {
    fetch('/api/reps', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...rep, recorded_at: new Date(rep.ts).toISOString() }),
    }).catch(() => setSaveErr(true));
  }, []);


  // ── Session camera draw + position overlay ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !sessionActive) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const dc = sessionDrawCvs.current, oc = sessionOvlCvs.current, v = videoRef.current;
      if (dc && oc) {
        const p = dc.parentElement;
        const W = p?.offsetWidth || 320, H = p?.offsetHeight || 240;
        dc.width = W; dc.height = H; oc.width = W; oc.height = H;
        if (v && v.readyState >= 2 && v.videoWidth) {
          const dctx = dc.getContext('2d')!;
          const vAR = v.videoWidth / v.videoHeight, cAR = W / H;
          let sx: number, sy: number, sw: number, sh: number;
          if (vAR > cAR) { sh = v.videoHeight; sw = sh * cAR; sx = (v.videoWidth - sw) / 2; sy = 0; }
          else            { sw = v.videoWidth;  sh = sw / cAR; sx = 0; sy = (v.videoHeight - sh) / 2; }
          dctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
        }
        const ctx = oc.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2;
        const rx = Math.min(W, H) * 0.28, ry = Math.min(W, H) * 0.40;
        const ringColor = posRef.current === 'down' ? '#ff2244' : '#1a3fff';
        ctx.save();
        ctx.shadowColor = ringColor; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = ringColor; ctx.lineWidth = 2.5;
        ctx.stroke(); ctx.restore();
      }
      sessionDrawRaf.current = requestAnimationFrame(loop);
    };
    sessionDrawRaf.current = requestAnimationFrame(loop);
    const faceInterval = setInterval(async () => {
      if (!faceDetector.current || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const faces = await faceDetector.current.detect(videoRef.current);
        latestFaceW.current = faces.length > 0 ? faces[0].boundingBox.width : 0;
      } catch (e) {}
    }, 150);
    return () => { alive = false; cancelAnimationFrame(sessionDrawRaf.current); clearInterval(faceInterval); };
  }, [phase, sessionActive]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats: Stats = useMemo(() => {
    const done = reps.filter(r => r.complete);
    const fail = reps.filter(r => !r.complete);
    const sessions   = deriveSessions(reps, sessionBreaks);
    const streaks    = calcStreaks(reps);
    const todayStr   = new Date().toDateString();
    const todayN     = done.filter(r => new Date(r.ts).toDateString() === todayStr).length;
    const weekN      = done.filter(r => Date.now() - r.ts < 7 * 86400000).length;
    const dayDist    = Array(7).fill(0) as number[];
    const hourDist   = Array(24).fill(0) as number[];
    const failDay    = Array(7).fill(0) as number[];
    done.forEach(r => { dayDist[new Date(r.ts).getDay()]++; hourDist[new Date(r.ts).getHours()]++; });
    fail.forEach(r =>   failDay[new Date(r.ts).getDay()]++);
    const sorted     = [...sessions].sort((a, b) => b.complete - a.complete);
    const dayReps: Record<string, number> = {};
    done.forEach(r => { const k = new Date(r.ts).toDateString(); dayReps[k] = (dayReps[k] || 0) + 1; });
    const bestDayArr = Object.entries(dayReps).sort((a, b) => b[1] - a[1]);
    const bestDay    = bestDayArr.length ? bestDayArr[0] as [string, number] : null;
    const avgPerSess = sessions.length ? Math.round(done.length / sessions.length) : 0;
    const lifetime   = Math.max(0, GOAL - done.length);
    const incRate    = reps.length ? ((fail.length / reps.length) * 100).toFixed(1) : '0.0';
    const sessionPR  = sorted[0]?.complete || 0;
    const todaySessions = sessions.filter(s => new Date(s.startTs).toDateString() === todayStr);
    const dayPR = todaySessions.length ? Math.max(...todaySessions.map(s => s.complete)) : 0;
    let estDays: number | null = null;
    if (done.length && reps.length) {
      const span = Math.max(1, (Date.now() - reps[0].ts) / 86400000);
      estDays = Math.ceil(lifetime / (done.length / span));
    }
    return { total: done.length, incomplete: fail.length, sessions, streaks,
             todayN, weekN, dayDist, hourDist, failDay, bestSession: sorted[0] || null,
             avgPerSess, bestDay, lifetime, incRate, sessionPR, dayPR, estDays };
  }, [reps, sessionBreaks]);

  const sessionReps = useMemo(() => {
    if (!reps.length) return 0;
    const cut = reps[reps.length - 1].ts - SESSION_GAP_MS;
    return reps.filter(r => r.ts >= cut && r.complete).length;
  }, [reps]);

  const bestPR  = Math.max(stats.sessionPR, stats.dayPR);
  const prState = sessionReps > 0 && bestPR > 0
    ? sessionReps > bestPR  ? 'new'
    : sessionReps === bestPR ? 'matching'
    : 'chasing'
    : 'chasing';

  // ── Pause on visibility change
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        posRef.current = 'up';
        setPosState('up');
        if (incTimer.current) clearTimeout(incTimer.current);
        downMinBRef.current = Infinity;
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);


  const getSignal = useCallback((calUpVal: number, calDownVal: number): number => {
    const b     = latestBrightness.current;
    const range = Math.max(1, calUpVal - calDownVal);
    const bNorm = Math.max(0, Math.min(1, (b - calDownVal) / range));
    if (!faceDetAvail.current || calFaceUpRef.current === 0) return bNorm;
    const faceW       = latestFaceW.current;
    const fNorm       = Math.min(1, faceW / calFaceUpRef.current);
    const faceVisible = faceW > calFaceUpRef.current * 0.12;
    const fWeight     = faceVisible ? 0.60 : 0.15;
    return fNorm * fWeight + bNorm * (1 - fWeight);
  }, []);

  // ── Brightness sampler ─────────────────────────────────────────────────────
  const sample = useCallback((): number | null => {
    const v = videoRef.current, c = samplerCvs.current;
    if (!v || !c || v.readyState < 2 || !v.videoWidth) return null;
    const S = 80; c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, (v.videoWidth - S) / 2, (v.videoHeight - S) / 2, S, S, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const result = lum / (d.length / 4);
    latestBrightness.current = result;
    return result;
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      const v = videoRef.current; if (!v) return;
      v.srcObject = stream;
      await new Promise<void>(res => { v.onloadedmetadata = () => res(); });
      await v.play();
      setCamReady(true);
    } catch (e: unknown) {
      setCamErr(e instanceof Error ? e.message : 'Camera unavailable');
    }
  }, []);

  // ── Calibration draw + auto-detect ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'cal') return;
    let alive = true;
    const STAB_WINDOW = 25, STAB_THRESHOLD = 5, COUNTDOWN_S = 2;
    const loop = () => {
      if (!alive) return;
      const dc = displayCvs.current, oc = overlayCvs.current, v = videoRef.current;
      if (dc && oc) {
        const p = dc.parentElement;
        const W = p?.offsetWidth || 320, H = p?.offsetHeight || 240;
        dc.width = W; dc.height = H; oc.width = W; oc.height = H;
        if (v && v.readyState >= 2 && v.videoWidth) {
          const dctx = dc.getContext('2d')!;
          const vAR = v.videoWidth / v.videoHeight, cAR = W / H;
          let sx, sy, sw, sh;
          if (vAR > cAR) { sh = v.videoHeight; sw = sh * cAR; sx = (v.videoWidth - sw) / 2; sy = 0; }
          else            { sw = v.videoWidth;  sh = sw / cAR; sx = 0; sy = (v.videoHeight - sh) / 2; }
          dctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
        }
        const ctx = oc.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2;
        const rx = Math.min(W, H) * 0.28, ry = Math.min(W, H) * 0.40;
        const isCD     = calPhaseRef.current === 'countdown';
        const elapsed  = isCD && cntDownStart.current ? Date.now() - cntDownStart.current : 0;
        const progress = Math.min(1, elapsed / (COUNTDOWN_S * 1000));
        const secsLeft = Math.max(0, COUNTDOWN_S - Math.floor(elapsed / 1000));
        const isReady  = calStabBuf.current.length >= STAB_WINDOW;
        const ovalClr  = isCD ? '#00e57a' : isReady ? '#ffb800' : 'rgba(200,210,255,0.6)';
        ctx.save();
        ctx.shadowColor = ovalClr; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = ovalClr; ctx.lineWidth = 2.5;
        ctx.setLineDash(isCD ? [] : [9, 6]); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
        if (isCD) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, Math.min(W, H) * 0.46, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.strokeStyle = '#00e57a'; ctx.lineWidth = 6;
          ctx.shadowColor = '#00e57a'; ctx.shadowBlur = 14;
          ctx.stroke(); ctx.restore();
          ctx.save();
          ctx.font = '900 ' + Math.round(Math.min(W, H) * 0.17) + 'px Arial Black, Arial, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#00e57a'; ctx.shadowColor = '#00e57a'; ctx.shadowBlur = 18;
          ctx.fillText(String(secsLeft), cx, cy); ctx.restore();
        }
      }
      // Auto-cal state machine
      if (camReady) {
        const b = sample();
        if (b !== null) {
          calStabBuf.current.push(b);
          if (calStabBuf.current.length > STAB_WINDOW) calStabBuf.current.shift();
          if (calPhaseRef.current === 'position' && calStabBuf.current.length >= STAB_WINDOW) {
            const mean = calStabBuf.current.reduce((a, x) => a + x, 0) / calStabBuf.current.length;
            const sd = Math.sqrt(calStabBuf.current.reduce((a, x) => a + (x - mean) ** 2, 0) / calStabBuf.current.length);
            if (sd < STAB_THRESHOLD) {
              calPhaseRef.current = 'countdown';
              cntDownStart.current = Date.now();
              calSamples.current = [];
              setCalStable(true);
            }
          }
          if (calPhaseRef.current === 'countdown' && cntDownStart.current !== null) {
            calSamples.current.push(b);
            if (calStep === 'up' && faceDetAvail.current && faceDetector.current && videoRef.current && videoRef.current.readyState >= 2) {
              faceDetector.current.detect(videoRef.current).then((faces: any[]) => {
                if (faces.length > 0) calFaceSamples.current.push(faces[0].boundingBox.width);
              }).catch(() => {});
            }
            const ms = Date.now() - cntDownStart.current;
            setCalCntDown(Math.max(0, COUNTDOWN_S - Math.floor(ms / 1000)));
            if (ms >= COUNTDOWN_S * 1000) {
              const avg = calSamples.current.reduce((a, x) => a + x, 0) / calSamples.current.length;
              if (calStep === 'up') {
                setCalUp(avg);
                if (calFaceSamples.current.length > 0) {
                  calFaceUpRef.current = calFaceSamples.current.reduce((a, x) => a + x, 0) / calFaceSamples.current.length;
                  calFaceSamples.current = [];
                  console.log('Face UP calibrated:', calFaceUpRef.current);
                }
                setCalStep('down');
                calPhaseRef.current = 'position';
                calStabBuf.current = [];
                cntDownStart.current = null;
                setCalStable(false);
                setCalCntDown(5);
              } else {
                setCalDown(avg);
                localStorage.setItem('pu_calUp', String(calUp));
                localStorage.setItem('pu_calDown', String(avg));
                const rep = { ts: Date.now(), complete: true, depth: 1.0 };
                setReps(p => [...p, rep]); saveRep(rep);
                haloKey.current++; setHaloId(haloKey.current);
                setFlash(true); setTimeout(() => setFlash(false), 260);
                if (alive) setPhase('active');
                return;
              }
            }
          }
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf.current); };
  }, [phase, calStep, camReady, sample, saveRep, calUp]);

  // ── Active tracking loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !sessionActive || calUp == null || calDown == null) return;
    const range = calUp - calDown;
    if (range < 8) { setBadCal(true); return; }
    setBadCal(false);
    const DN_THRESH = 0.38;
    const UP_THRESH = 0.52;
    posRef.current = 'up'; downMinBRef.current = Infinity;

    const tick = () => {
      const b = sample();
      if (b != null) {
        if (posRef.current === 'down') downMinBRef.current = Math.min(downMinBRef.current, b);
          const sig = getSignal(calUp, calDown);
          console.log('[signal]', sig.toFixed(3), posRef.current, 'dn<', DN_THRESH, 'up>', UP_THRESH);
          if (posRef.current === 'up' && sig <= DN_THRESH && Date.now() - lastRepTs.current > MIN_REP_MS && tabRef.current === 'track') {
          posRef.current = 'down'; setPosState('down'); downMinBRef.current = b;
          incTimer.current = setTimeout(() => {
            if (posRef.current !== 'down') return;
            const rep: Rep = { ts: Date.now(), complete: false };
            setReps(p => [...p, rep]); saveRep(rep); lastRepTs.current = Date.now();
            posRef.current = 'up'; setPosState('up'); downMinBRef.current = Infinity;
          }, INCOMPLETE_TIMEOUT_MS);
          } else if (posRef.current === 'down' && sig >= UP_THRESH && tabRef.current === 'track') {
          clearTimeout(incTimer.current!);
          const rep: Rep = { ts: Date.now(), complete: true };
          setReps(p => [...p, rep]); saveRep(rep); lastRepTs.current = Date.now();
          setFlash(true); haloKey.current++; setHaloId(haloKey.current);
          setTimeout(() => setFlash(false), 260);
          posRef.current = 'up'; setPosState('up'); downMinBRef.current = Infinity;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf.current); if (incTimer.current) clearTimeout(incTimer.current); };
  }, [phase, sessionActive, calUp, calDown, sample, saveRep, getSignal]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleBegin = () => {
    calPhaseRef.current = 'position';
    calSamples.current = [];
    calStabBuf.current = [];
    cntDownStart.current = null;
    setCalCntDown(5);
    setCalStable(false);
    setCalStep('up');
    calFaceSamples.current = [];
    calFaceUpRef.current = 0;
    startCam();
    setPhase('cal');
  };
  const handleLock  = () => {
    const b = sample(); if (b == null) return;
    if (calStep === 'up') { setCalUp(b); setCalStep('down'); }
    else {
      setCalDown(b);
      localStorage.setItem('pu_calUp', String(calUp));
      localStorage.setItem('pu_calDown', String(b));
      // DOWN lock = rep 1
      const rep: Rep = { ts: Date.now(), complete: true };
      setReps(p => [...p, rep]); saveRep(rep);
      setFlash(true); haloKey.current++; setHaloId(haloKey.current);
      setTimeout(() => setFlash(false), 260);
      setPhase('active');
    }
  };
  const handleRecal = () => {
    cancelAnimationFrame(raf.current);
    if (incTimer.current) clearTimeout(incTimer.current);
    setCalUp(null); setCalDown(null); setCalStep('up'); setPhase('cal');
  };


  const handleBeginSession = () => {
    setSessionBreaks(prev => [...prev, Date.now()]);
    setSessionActive(true);
  };
  const handleEndSession = () => {
    cancelAnimationFrame(sessionDrawRaf.current);
    setSessionBreaks(prev => [...prev, Date.now()]);
    setSessionActive(false);
    setPosState('up');
    posRef.current = 'up';
  };

  const pctDone   = (GOAL - stats.lifetime) / GOAL;
  const prClass   = prState === 'new' ? 'enum-pink' : prState === 'matching' ? 'enum-green' : 'enum';
  const prLabel   = prState === 'new' ? '🔥 NEW PR' : prState === 'matching' ? '= SESSION PR' : 'SESSION PR';
  const prColor   = prState === 'new' ? PINK : prState === 'matching' ? GRN : DIM;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{SHEET}</style>
        <div className="enum" style={{ fontSize: '1.5rem', fontWeight: 700 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Barlow Condensed', sans-serif", color: TEXT, display: 'flex', flexDirection: 'column' }}>
      <style>{SHEET}</style>
      <canvas ref={samplerCvs} style={{ display: 'none' }} />
      <video  ref={videoRef} playsInline muted autoPlay
              style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1 }} />

      {saveErr && (
        <div style={{ background: NRED, color: '#fff', fontSize: '.65rem', letterSpacing: '.15em', textAlign: 'center', padding: '.4rem' }}>
          Rep save failed — check connection
        </div>
      )}

      {/* ══ INTRO ══════════════════════════════════════════════════════════ */}
      {phase === 'intro' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 2rem', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(26,63,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(26,63,255,.06) 1px,transparent 1px)`, backgroundSize: '40px 40px' }} />
          <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(26,63,255,.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', maxWidth: 480 }}>
            <div style={{ fontSize: '.58rem', letterSpacing: '.6em', color: DIM, textTransform: 'uppercase', marginBottom: '2.5rem' }}>Lifetime Mission</div>
            <div className="enum" style={{ fontSize: 'clamp(2rem,10vw,5.5rem)', fontWeight: 900, lineHeight: 0.88, textAlign: 'center', width: '100%', marginBottom: '1.2rem' }}>{fmt(GOAL)}</div>
            <div style={{ fontSize: '.75rem', letterSpacing: '.4em', color: DIM, textTransform: 'uppercase', marginBottom: '3.5rem' }}>push-ups to zero</div>
            {stats.total > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '.75rem 1.25rem', background: SURF, border: `1.5px solid ${EDGE}` }}>
                <span className="enum" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{fmt(stats.lifetime)}</span>
                <span style={{ fontSize: '.7rem', color: DIM, letterSpacing: '.2em', marginLeft: '.75rem' }}>REMAINING</span>
              </div>
            )}
            <div style={{ border: `1.5px solid ${EDGE}`, padding: '1.5rem', marginBottom: '2.5rem', background: SURF }}>
              <p style={{ color: DIM, fontSize: '1rem', lineHeight: 1.8 }}>
                Phone face-up between your hands.<br />
                Front camera reads depth from below.<br />
                Locking your DOWN position counts as rep one.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {calUp !== null && calDown !== null && (
                <button className="primary-btn" onClick={() => { startCam(); setPhase('active'); }}
                  style={{ fontSize: '1.1rem', padding: '1rem 2.75rem', fontFamily: "'Barlow Condensed', sans-serif", background: '#00c060', boxShadow: '0 0 14px rgba(0,192,96,.55)' }}>
                  Resume ⚡
                </button>
              )}
              <button className={calUp !== null && calDown !== null ? 'ghost-btn' : 'primary-btn'} onClick={handleBegin}
                style={{ fontSize: '1.1rem', padding: '1rem 2.75rem', fontFamily: "'Barlow Condensed', sans-serif" }}>
                {calUp !== null && calDown !== null ? 'Recalibrate' : 'Begin'}
              </button>
              {stats.total === 0 && (
                <button className="ghost-btn"
                  onClick={() => { setReps(makeDemoReps()); setCalUp(100); setCalDown(30); setPhase('active'); }}
                  style={{ fontSize: '.9rem', letterSpacing: '.18em', textTransform: 'uppercase', padding: '1rem 1.5rem' }}>
                  Demo Mode
                </button>
              )}
              {stats.total > 0 && (
                <button className="ghost-btn" onClick={() => { setPhase('active'); setCalUp(100); setCalDown(30); }}
                  style={{ fontSize: '.9rem', letterSpacing: '.18em', textTransform: 'uppercase', padding: '1rem 1.5rem' }}>
                  View Stats
                </button>
              )}
            </div>
            <div style={{ marginTop: '2rem', fontSize: '.58rem', color: DIM, letterSpacing: '.12em', lineHeight: 2 }}>
              Max screen brightness · front camera faces up
            </div>
          </div>
        </div>
      )}

      {/* ══ CALIBRATION ════════════════════════════════════════════════════ */}
      {phase === 'cal' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '.8rem 1.25rem', borderBottom: `1.5px solid ${EDGE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: SURF }}>
            <div style={{ display: 'flex', gap: '.75rem' }}>
              {(['up', 'down'] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%',
                    background: calStep === s ? ELEC : (s === 'up' && calStep === 'down') ? GRN : EDGE,
                    boxShadow: calStep === s ? `0 0 6px ${ELEC},0 0 12px ${ELEC}` : (s === 'up' && calStep === 'down') ? `0 0 6px ${GRN}` : '' }} />
                  <span style={{ fontSize: '.6rem', letterSpacing: '.3em', color: calStep === s ? ELEC : DIM, textTransform: 'uppercase' }}>
                    {s === 'up' ? '01 UP' : '02 DOWN'}
                  </span>
                </div>
              ))}
            </div>
            <span className="enum" style={{ fontSize: '1rem', fontWeight: 700 }}>{fmt(stats.lifetime)}</span>
          </div>

          <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
            <canvas ref={displayCvs} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <canvas ref={overlayCvs} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            {!camReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)' }}>
                {camErr
                  ? <div style={{ color: NRED, fontSize: '.9rem', textAlign: 'center', padding: '1rem', maxWidth: 260 }}><div style={{ fontSize: '1.8rem', marginBottom: '.5rem' }}>⚡</div>{camErr}</div>
                  : <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.75rem', letterSpacing: '.25em' }}>Starting camera…</span>}
              </div>
            )}
            {calStep === 'down' && camReady && (
              <div style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.65)', border: `1px solid ${ELEC}`, color: '#fff', fontSize: '.7rem', letterSpacing: '.15em', padding: '.45rem 1rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px rgba(26,63,255,.4)` }}>
                This lock counts as REP 1 ⚡
              </div>
            )}
          </div>

          <div style={{ padding: '1.25rem', borderTop: `1.5px solid ${EDGE}`, background: SURF }}>
            <div style={{ fontSize: '.6rem', letterSpacing: '.3em', textTransform: 'uppercase', marginBottom: '.4rem', transition: 'color .4s',
              color: calStable ? GRN : ELEC,
              textShadow: calStable ? `0 0 10px ${GRN}` : '0 0 8px rgba(26,63,255,.6)' }}>
              {calStep === 'up'
                ? calStable ? `Holding UP — ${calCntDown}s…` : 'Step 1 — UP position'
                : calStable ? `Holding DOWN — ${calCntDown}s…` : 'Step 2 — DOWN position · rep 1'}
            </div>
            <div style={{ fontSize: '1rem', color: DIM, lineHeight: 1.7, marginBottom: '1rem' }}>
              {calStep === 'up'
                ? calStable
                  ? 'Locked on. Hold completely still…'
                  : 'Get in push-up position above the phone, arms fully extended. The oval turns green when steady — then hold 5 seconds.'
                : calStable
                  ? 'Locked on. Hold completely still…'
                  : 'Lower your chest all the way to the floor. Hold still. The oval turns green when detected — this counts as rep one.'}
            </div>
            {camReady && (
              <button className="ghost-btn" onClick={() => {
                calPhaseRef.current = 'position';
                calSamples.current = [];
                calStabBuf.current = [];
                cntDownStart.current = null;
                setCalStable(false);
                setCalCntDown(5);
              }} style={{ width: '100%', fontSize: '.75rem', letterSpacing: '.18em', textTransform: 'uppercase', padding: '.65rem' }}>
                Restart calibration
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══ ACTIVE ═════════════════════════════════════════════════════════ */}
      {phase === 'active' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: `1.5px solid ${EDGE}`, background: SURF }}>
            {(['track', 'stats', 'height'] as const).map(t => (
              <button key={t} onClick={() => setTabSynced(t)}
                className={tab === t ? 'tab-active' : 'tab-inactive'}
                style={{ flex: 1, background: 'none', border: 'none', fontSize: '.65rem', letterSpacing: '.38em', textTransform: 'uppercase', padding: '.9rem 0', marginBottom: '-1.5px' }}>
                {t}
              </button>
            ))}
          </div>

          {/* ── TRACK ────────────────────────────────────────────────────── */}
          {tab === 'track' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

              {!sessionActive ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: '1rem', background: BG }}>

                  {/* Dual PR hero */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    {([
                      { label: 'Session PR', value: stats.sessionPR, color: ELEC },
                      { label: 'Day PR',     value: stats.dayPR,     color: PINK },
                    ] as const).map(({ label, value, color }) => (
                      <div key={label} style={{ background: SURF, border: `1.5px solid ${EDGE}`, padding: '1rem .75rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '140%', height: '100%', background: `radial-gradient(ellipse,${color}12 0%,transparent 70%)`, pointerEvents: 'none' }} />
                        <div style={{ fontSize: '.52rem', letterSpacing: '.38em', color, textTransform: 'uppercase', marginBottom: '.4rem', textShadow: `0 0 8px ${color}` }}>{label}</div>
                        <div className="enum" style={{ fontSize: 'clamp(1.8rem,9vw,3.5rem)', fontWeight: 900, lineHeight: 1 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Lifetime */}
                  <div style={{ background: SURF, border: `1.5px solid ${EDGE}`, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.5rem' }}>
                      <Lbl>Remaining</Lbl>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        {haloId && <div key={haloId} className="neon-ring" style={{ width: 200, height: 80, background: 'radial-gradient(ellipse,rgba(255,0,119,.28) 0%,transparent 70%)' }} />}
                        <div className={`enum${flash ? ' flash' : ''}`} style={{ fontSize: 'clamp(1.4rem,7vw,2.8rem)', fontWeight: 900, lineHeight: 1 }}>{fmt(stats.lifetime)}</div>
                      </div>
                    </div>
                    <div style={{ height: 3, background: EDGE, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pctDone * 100}%`, borderRadius: 2, background: `linear-gradient(90deg,${ELEC},${PINK})`, boxShadow: '0 0 8px rgba(26,63,255,.45)' }} />
                    </div>
                    <div style={{ fontSize: '.52rem', color: DIM, letterSpacing: '.15em', marginTop: '.4rem' }}>{(pctDone * 100).toFixed(6)}% complete</div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: 'flex', gap: '.75rem' }}>
                    {[
                      { label: 'Today',  value: fmt(stats.todayN) },
                      { label: 'Streak', value: `${stats.streaks.current}d` },
                      { label: 'Week',   value: fmt(stats.weekN) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ flex: 1, background: SURF, border: `1.5px solid ${EDGE}`, padding: '.7rem .5rem', textAlign: 'center' }}>
                        <div className="enum" style={{ fontSize: 'clamp(1rem,5vw,1.6rem)', fontWeight: 700, lineHeight: 1 }}>{value}</div>
                        <Lbl style={{ marginTop: '.25rem' }}>{label}</Lbl>
                      </div>
                    ))}
                  </div>

                  <div style={{ flex: 1 }} />

                  <button className="primary-btn" onClick={handleBeginSession}
                    style={{ width: '100%', fontSize: '1.2rem', padding: '1.1rem', fontFamily: "'Barlow Condensed', sans-serif", background: '#00e57a', boxShadow: '0 0 18px rgba(0,229,122,.55)', color: '#05051c' }}>
                    Begin Session
                  </button>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <GhostBtn onClick={handleRecal}>Recalibrate</GhostBtn>
                    <GhostBtn onClick={() => { cancelAnimationFrame(raf.current); setPhase('intro'); }}>Exit</GhostBtn>
                  </div>
                </div>

              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                  {/* Top bar */}
                  <div style={{ padding: '.6rem 1.25rem', borderBottom: `1px solid ${EDGE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: SURF }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <div className={posState === 'down' ? 'down-dot' : 'up-dot'} style={{ width: 9, height: 9, borderRadius: '50%' }} />
                      <span style={{ fontSize: '.6rem', letterSpacing: '.3em', color: DIM, textTransform: 'uppercase' }}>{posState === 'down' ? 'DOWN' : 'UP'}</span>
                    </div>
                    <span className="enum" style={{ fontSize: '.95rem', fontWeight: 700 }}>{fmt(stats.lifetime)} left</span>
                  </div>

                  {/* Camera */}
                  <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
                    <canvas ref={sessionDrawCvs} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                    <canvas ref={sessionOvlCvs}  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '1.5rem', pointerEvents: 'none' }}>
                      <div style={{ position: 'relative' }}>
                        {haloId && <div key={haloId} className="neon-ring" style={{ width: 220, height: 100, background: 'radial-gradient(ellipse,rgba(255,0,119,.4) 0%,transparent 70%)' }} />}
                        <div className={`enum${flash ? ' flash' : ''}`}
                          style={{ fontSize: 'clamp(3rem,16vw,7rem)', fontWeight: 900, lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,.7)', WebkitTextStroke: '1px rgba(0,0,0,.25)' }}>
                          {sessionReps}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '2rem', marginTop: '.5rem' }}>
                        {[
                          { label: 'Day PR',     value: stats.dayPR,     color: PINK },
                          { label: 'Session PR', value: stats.sessionPR, color: ELEC },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '1rem', fontWeight: 700, color, textShadow: `0 0 8px ${color},0 1px 8px rgba(0,0,0,.6)` }}>{value}</div>
                            <div style={{ fontSize: '.5rem', letterSpacing: '.2em', color: 'rgba(255,255,255,.6)', textTransform: 'uppercase' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* End */}
                  <div style={{ padding: '1rem 1.25rem', background: SURF, borderTop: `1.5px solid ${EDGE}` }}>
                    <button className="primary-btn" onClick={handleEndSession}
                      style={{ width: '100%', fontSize: '1rem', padding: '.85rem', fontFamily: "'Barlow Condensed', sans-serif", background: '#ff2244', boxShadow: '0 0 14px rgba(255,34,68,.5)' }}>
                      End Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STATS ────────────────────────────────────────────────────── */}
          {tab === 'stats' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem', background: BG }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: 500, margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
                  {[
                    { label: 'Total Reps',   value: fmt(stats.total) },
                    { label: 'Today',        value: fmt(stats.todayN) },
                    { label: 'This Week',    value: fmt(stats.weekN) },
                    { label: 'Sessions',     value: fmt(stats.sessions.length) },
                    { label: 'Session PR',   value: fmt(stats.sessionPR) },
                    { label: 'Incomplete %', value: `${stats.incRate}%` },
                  ].map(c => (
                    <div key={c.label} style={{ background: SURF, border: `1.5px solid ${EDGE}`, padding: '.75rem .4rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(26,63,255,.06)' }}>
                      <div className="enum" style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
                      <Lbl style={{ marginTop: '.3rem' }}>{c.label}</Lbl>
                    </div>
                  ))}
                </div>

                <Sect title="Streaks">
                  <Row label="Current streak" value={`${stats.streaks.current} day${stats.streaks.current !== 1 ? 's' : ''}`} accent />
                  <Row label="Best streak"    value={`${stats.streaks.best} days`} />
                  {stats.bestDay && <Row label="Best single day" value={`${stats.bestDay[1]} reps — ${fmtDate(new Date(stats.bestDay[0]).getTime())}`} />}
                </Sect>

                {stats.bestSession && (
                  <Sect title="Session PR">
                    <Row label="Reps"       value={stats.bestSession.complete} accent />
                    <Row label="Date"       value={fmtDate(stats.bestSession.startTs)} />
                    <Row label="Started"    value={fmtTime(stats.bestSession.startTs)} />
                    <Row label="Duration"   value={fmtDur(stats.bestSession.durationMs)} />
                    <Row label="Incomplete" value={stats.bestSession.incomplete} />
                  </Sect>
                )}

                <Sect title="Recent Sessions">
                  {stats.sessions.slice(-6).reverse().map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '.65rem 0', borderBottom: `1px solid ${EDGE}` }}>
                      <div>
                        <div style={{ fontSize: '.9rem', color: TEXT }}>{fmtDate(s.startTs)} · {fmtTime(s.startTs)}</div>
                        <div style={{ fontSize: '.6rem', color: DIM, marginTop: '.15rem' }}>
                          {fmtDur(s.durationMs)}
                          {s.incomplete > 0 && <span style={{ color: NRED, textShadow: `0 0 6px ${NRED}` }}> · {s.incomplete} incomplete</span>}
                        </div>
                      </div>
                      <div className="enum" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.complete}</div>
                    </div>
                  ))}
                </Sect>

                <Sect title="Form">
                  <Row label="Total incomplete" value={fmt(stats.incomplete)} />
                  <Row label="Incomplete rate"  value={`${stats.incRate}%`} />
                  <div style={{ marginTop: '1rem' }}><Lbl style={{ marginBottom: '.5rem' }}>Incomplete by day</Lbl><NeonBars data={stats.failDay} labels={['S','M','T','W','T','F','S']} color={NRED} glow={NRED} h={40} /></div>
                </Sect>

                <Sect title="Day of Week"><NeonBars data={stats.dayDist} labels={['Sun','Mon','Tue','Wed','Thu','Fri','Sat']} color={ELEC} glow={ELEC} h={80} /></Sect>

                <Sect title="Time of Day"><HeatMap data={stats.hourDist} /></Sect>

                <Sect title="Lifetime Progress">
                  <Row label="Completed"  value={fmt(stats.total)} accent />
                  <Row label="Remaining"  value={fmt(stats.lifetime)} />
                  <Row label="% Complete" value={`${((stats.total / GOAL) * 100).toFixed(6)}%`} />
                  {stats.estDays && <Row label="Est. days at current pace" value={fmt(stats.estDays)} />}
                  <div style={{ marginTop: '.75rem', height: 6, background: EDGE, borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${(stats.total / GOAL) * 100}%`, borderRadius: 3, background: `linear-gradient(90deg,${ELEC},${PINK})`, boxShadow: '0 0 8px rgba(26,63,255,.5)' }} />
                  </div>
                </Sect>
              </div>
            </div>
          )}

          {/* ── HEIGHT ───────────────────────────────────────────────────────── */}
          {tab === 'height' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem', background: BG }}>
              <div style={{ maxWidth: 500, margin: '0 auto' }}>

                {/* Current height hero */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1.25rem', background: SURF, border: `1.5px solid ${EDGE}` }}>
                  <div style={{ fontSize: '.55rem', letterSpacing: '.38em', color: DIM, textTransform: 'uppercase', marginBottom: '.4rem' }}>Your stack height</div>
                  <div className="enum" style={{ fontSize: 'clamp(2rem,10vw,4rem)', fontWeight: 900, lineHeight: 1 }}>
                    {fmtMilestoneM(stats.total * REP_DEPTH_M)}
                  </div>
                  <div style={{ fontSize: '.75rem', color: DIM, marginTop: '.4rem' }}>
                    {stats.total.toLocaleString()} reps × 30cm each
                  </div>
                </div>

                {HEIGHT_MILESTONES.map(sec => {
                  const heightM = stats.total * REP_DEPTH_M;
                  return (
                    <div key={sec.section} style={{ marginBottom: '1.5rem', background: SURF, border: `1.5px solid ${EDGE}`, padding: '1rem 1rem .5rem', boxShadow: '0 1px 8px rgba(26,63,255,.05)' }}>
                      <div style={{ fontSize: '.58rem', letterSpacing: '.4em', color: ELEC, textTransform: 'uppercase', marginBottom: '.75rem', paddingBottom: '.5rem', borderBottom: `1px solid ${EDGE}`, textShadow: '0 0 10px rgba(26,63,255,.5)' }}>
                        {sec.section}
                      </div>
                      {sec.items.map(item => {
                        const reached  = heightM >= item.m;
                        const pct      = Math.min(100, (heightM / item.m) * 100);
                        const allUnreached = sec.items.filter(i => heightM < i.m);
                        const isNext   = !reached && allUnreached.indexOf(item) === 0;

                        return (
                          <div key={item.label} style={{ marginBottom: '.6rem', opacity: reached || isNext ? 1 : 0.4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.2rem' }}>
                              <div style={{ fontSize: '.88rem', color: TEXT, display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                                {item.note && <span style={{ fontSize: '.72rem', color: DIM }}>{item.note}</span>}
                                {isNext && <span style={{ fontSize: '.6rem', padding: '1px 7px', background: 'rgba(26,63,255,.1)', color: ELEC, borderRadius: 20, letterSpacing: '.05em' }}>next</span>}
                                {reached && <span style={{ fontSize: '.6rem', padding: '1px 7px', background: 'rgba(0,229,122,.12)', color: '#00a855', borderRadius: 20, letterSpacing: '.05em' }}>done</span>}
                              </div>
                              <div style={{ fontSize: '.72rem', color: reached ? item.color : DIM, fontFamily: "'Orbitron',monospace", textAlign: 'right' }}>
                                {reached ? fmtMilestoneM(item.m) : fmtMilestoneReps(item.m) + ' reps'}
                              </div>
                            </div>
                            <div style={{ height: 5, background: EDGE, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: pct.toFixed(1) + '%',
                                background: reached ? item.color : `linear-gradient(90deg, ${ELEC}, ${PINK})`,
                                borderRadius: 3,
                                boxShadow: reached ? `0 0 6px ${item.color}` : '0 0 6px rgba(26,63,255,.4)',
                                transition: 'width .5s ease',
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function Lbl({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: '.55rem', letterSpacing: '.3em', color: DIM, textTransform: 'uppercase', ...style }}>{children}</div>;
}
function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="ghost-btn" onClick={onClick} style={{ fontSize: '.6rem', letterSpacing: '.2em', textTransform: 'uppercase', padding: '.3rem .7rem' }}>{children}</button>;
}
function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: SURF, border: `1.5px solid ${EDGE}`, padding: '1rem 1rem .25rem', boxShadow: '0 1px 8px rgba(26,63,255,.05)' }}>
      <div style={{ fontSize: '.58rem', letterSpacing: '.4em', color: ELEC, textTransform: 'uppercase', marginBottom: '.7rem', paddingBottom: '.5rem', borderBottom: `1px solid ${EDGE}`, textShadow: '0 0 10px rgba(26,63,255,.5)' }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.45rem 0' }}>
      <span style={{ fontSize: '.88rem', color: DIM }}>{label}</span>
      <span className={accent ? 'enum' : ''} style={{ fontFamily: accent ? "'Orbitron',monospace" : 'inherit', fontSize: accent ? '.9rem' : '.95rem', color: accent ? ELEC : TEXT, fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function NeonBars({ data, labels, color, glow, h }: { data: number[]; labels: string[]; color: string; glow: string; h: number }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.3rem', height: h }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
            <div style={{ width: '100%', height: `${(v / max) * 100}%`, background: color, opacity: 0.8, minHeight: v > 0 ? 2 : 0, boxShadow: v > 0 ? `0 0 6px ${glow},0 0 12px ${glow}` : '' }} />
          </div>
          <div style={{ fontSize: '.5rem', color: DIM }}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}
function HeatMap({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const rows: [number, number][] = [[0, 5], [6, 11], [12, 17], [18, 23]];
  const rlab = ['12a', '6a', '12p', '6p'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
      {rows.map(([s, e], ri) => (
        <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <div style={{ width: '2rem', fontSize: '.55rem', color: DIM, textAlign: 'right', flexShrink: 0 }}>{rlab[ri]}</div>
          <div style={{ display: 'flex', flex: 1, gap: 2 }}>
            {Array.from({ length: e - s + 1 }, (_, k) => {
              const h = s + k, v = data[h], intensity = v / max;
              const bg = intensity > 0.5 ? `rgba(255,0,119,${0.2 + intensity * 0.75})` : `rgba(26,63,255,${0.15 + intensity * 1.2})`;
              return <div key={h} title={`${h}:00 — ${v} reps`} style={{ flex: 1, height: 20, background: bg, borderRadius: 2, boxShadow: v > 0 ? `0 0 4px ${bg}` : '' }} />;
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: '.52rem', color: DIM, textAlign: 'center', marginTop: '.35rem', letterSpacing: '.1em' }}>blue → pink intensity by hour</div>
    </div>
  );
}
