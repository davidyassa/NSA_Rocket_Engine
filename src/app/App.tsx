import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Brain, ChartNoAxesCombined, ChevronRight, ClipboardList, Database, LayoutGrid, Orbit, Route as RouteIcon, RotateCcw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { CheckinEntry } from '../contracts';
import { RADLAB_MANIFEST } from '../data/nasa';
import { evaluateCheckin } from '../engine';
import { Assessment } from '../features/assessment/Assessment';
import { Checkin } from '../features/checkin/Checkin';
import { CognitiveLab } from '../features/cognitive/CognitiveLab';
import { Dashboard } from '../features/dashboard/Dashboard';
import { NasaHazards } from '../features/hazards/NasaHazards';
import { Timeline } from '../features/timeline/Timeline';
import { DEMO_OPTIONS, type ScenarioId } from '../scenarios';
import { radlabEventSol } from '../sim';
import { DemoData } from './DemoData';
import { entryFromCheckin, useMissionStore } from './store';

const Trends = lazy(() => import('../features/trends/Trends').then(({ Trends }) => ({ default: Trends })));

const navigation = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid },
  { to: '/check-in', label: 'Sol check-in', Icon: ClipboardList },
  { to: '/cognitive', label: 'Cognitive lab', Icon: Brain },
  { to: '/hazards', label: 'NASA 5 hazards', Icon: ShieldAlert },
  { to: '/assessment', label: 'Assessment', Icon: Activity },
  { to: '/trends', label: 'Trends', Icon: ChartNoAxesCombined },
  { to: '/timeline', label: 'Timeline', Icon: RouteIcon },
  { to: '/demo', label: 'Demo and data', Icon: Database },
];

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mission = useMissionStore((state) => state.mission);
  const warning = useMissionStore((state) => state.warning);
  const saveCheckin = useMissionStore((state) => state.saveCheckin);
  const loadScenario = useMissionStore((state) => state.loadScenario);
  const resetDemo = useMissionStore((state) => state.resetDemo);
  const [resetError, setResetError] = useState('');
  const [revision, setRevision] = useState(0);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);

  const { scenario, prefill } = DEMO_OPTIONS[mission.scenarioId];
  const records = useMemo(
    () => [...scenario.history, ...(mission.entries[mission.scenarioId] ?? [])],
    [scenario, mission.entries, mission.scenarioId],
  );
  const latest = records.at(-1) ?? null;
  const assessment = useMemo(
    () => latest ? evaluateCheckin(latest, records, {
      events: scenario.events,
      archiveEvent: {
        sol: radlabEventSol(scenario.missionContext),
        date: RADLAB_MANIFEST.verifiedEventReading.timestampArchive.slice(0, 10),
      },
    }) : null,
    [latest, records, scenario],
  );
  const isLogged = latest?.sol === scenario.startSol;
  const section = navigation.find((item) => item.to === pathname)?.label ?? 'Dashboard';
  const { profile, startSol } = scenario;
  const initials = profile.displayName.split(' ').map((part) => part[0]).join('');

  useEffect(() => {
    document.title = `Sol Check · ${section}`;
    window.scrollTo(0, 0);
    if (pathname !== '/') main.current?.focus({ preventScroll: true });
  }, [pathname, section]);

  function submit(entry: CheckinEntry) {
    saveCheckin(entry);
    navigate('/assessment');
  }

  function switchScenario(scenarioId: ScenarioId) {
    loadScenario(scenarioId);
    navigate('/');
  }

  function confirmReset() {
    try {
      resetDemo();
      setRevision((value) => value + 1);
      resetDialog.current?.close();
      navigate('/');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'The demo could not be reset.');
    }
  }

  return (
    <div className="app-shell">
      <button className="skip-link" type="button" onClick={() => main.current?.focus()}>Skip to content</button>
      <aside className="sidebar">
        <Link to="/" className="wordmark">
          <span className="wordmark-icon"><Orbit size={22} strokeWidth={1.8} aria-hidden="true" /></span>
          <span>Sol Check</span>
        </Link>

        <div className="sidebar-body">
          <p className="sidebar-label">Crew health</p>
          <nav aria-label="Main navigation" className="side-nav">
            {navigation.map(({ to, label, Icon }) => (
              <NavLink end={to === '/'} key={to} to={to}>
                <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="reset-link" onClick={() => {
            setResetError('');
            resetDialog.current?.showModal();
          }}>
            <RotateCcw size={16} aria-hidden="true" /> Reset demo
          </button>
          <div className="crew-profile">
            <span className="crew-avatar" aria-hidden="true">{initials}</span>
            <div>
              <strong>{profile.displayName}</strong>
              <span>Synthetic crew</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="work-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Mission</span><ChevronRight size={13} aria-hidden="true" /><strong>{section}</strong>
          </div>
          <div className="topbar-meta">
            <span className="topbar-sol">SOL {startSol}</span>
            <span className="badge badge-synthetic"><span className="badge-dot" /> Synthetic demo</span>
          </div>
        </header>
        <main className="main-content" id="main-content" ref={main} tabIndex={-1}>
          {warning && <p className="storage-warning" role="alert">{warning}</p>}
          <Routes>
            <Route path="/" element={<Dashboard scenario={scenario} records={records} latest={latest} assessment={assessment} />} />
            <Route path="/check-in" element={
              <Checkin
                key={`${mission.scenarioId}:${revision}`}
                sol={startSol}
                profile={profile}
                demoPrefill={prefill}
                initialEntry={isLogged && latest ? entryFromCheckin(latest) : undefined}
                onSubmit={submit}
              />
            } />
            <Route path="/cognitive" element={<CognitiveLab currentSol={startSol} />} />
            <Route path="/hazards" element={<NasaHazards />} />
            <Route path="/assessment" element={<Assessment key={`${mission.scenarioId}:${revision}`} assessment={assessment} records={records} mission={scenario.missionContext} />} />
            <Route path="/trends" element={
              <Suspense fallback={<p role="status">Loading trends…</p>}>
                <Trends key={mission.scenarioId} records={records} />
              </Suspense>
            } />
            <Route path="/timeline" element={<Timeline key={mission.scenarioId} scenario={scenario} records={records} />} />
            <Route path="/demo" element={<DemoData scenario={scenario} records={records} scenarioId={mission.scenarioId} onLoad={switchScenario} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="workspace-footer">
            <ShieldCheck size={15} aria-hidden="true" />
            Research-informed prototype · Not a diagnosis
          </footer>
        </main>
      </div>

      <dialog className="reset-dialog" ref={resetDialog} aria-labelledby="reset-title">
        <button type="button" className="dialog-close" aria-label="Close" onClick={() => resetDialog.current?.close()}>
          <X size={20} />
        </button>
        <h2 id="reset-title">Reset demo?</h2>
        <p>This clears local demo check-ins from all three scenarios and restores the Sol 43 scenario on this device.</p>
        {resetError && <p role="alert" className="storage-warning">{resetError}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" autoFocus onClick={() => resetDialog.current?.close()}>Cancel</button>
          <button type="button" className="button button-primary" onClick={confirmReset}>Reset demo</button>
        </div>
      </dialog>
    </div>
  );
}
