import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChartNoAxesCombined, ClipboardList, Database, Ellipsis, LayoutGrid, Route as RouteIcon, RotateCcw, ShieldAlert, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { CheckinEntry } from '../contracts';
import rocketEngineMark from '../ui/assets/nasa/rocket-engine.webp';
import { RADLAB_MANIFEST } from '../data/nasa';
import { evaluateCheckin } from '../engine';
import { Assessment } from '../features/assessment/Assessment';
import { Checkin } from '../features/checkin/Checkin';
import { CognitiveLab } from '../features/cognitive/CognitiveLab';
import { Dashboard } from '../features/dashboard/Dashboard';
// import { NasaHazards } from '../features/hazards/NasaHazards';
import { Timeline } from '../features/timeline/Timeline';
// import { CrewMedicalOfficer } from '../features/cmo/CrewMedicalOfficer';
import { DEMO_OPTIONS, type ScenarioId } from '../scenarios';
import { radlabEventSol } from '../sim';
import { DemoData } from './DemoData';
import { RouteErrorBoundary, lazyWithReload } from './lazyRoute';
import { confirmTap } from './native';
import { entryFromCheckin, useMissionStore } from './store';

const Trends = lazyWithReload(() => import('../features/trends/Trends').then(({ Trends }) => ({ default: Trends })));

const navigation = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid },
  { to: '/check-in', label: 'Check-in', Icon: ClipboardList },
  // { to: '/cognitive', label: 'Cognitive lab', Icon: Brain },
  // { to: '/hazards', label: 'NASA 5 hazards', Icon: ShieldAlert },
  { to: '/assessment', label: 'Assessment', Icon: Activity },
  // { to: '/cmo', label: 'CMO console', Icon: Stethoscope },
  { to: '/trends', label: 'Trends', Icon: ChartNoAxesCombined },
  { to: '/timeline', label: 'Timeline', Icon: RouteIcon },
  { to: '/demo', label: 'Demo and data', Icon: Database },
];

/** Phone bottom bar: Dashboard · Assessment · Check-in (centre) · Timeline · More (CMO, trends, cognitive, hazards, demo). */
const bottomNavigation = ['/', '/assessment', '/check-in', '/timeline'] as const;

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
  const [moreOpen, setMoreOpen] = useState(false);
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
      environment: scenario.environment,
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
    setMoreOpen(false);
  }, [pathname, section]);

  function submit(entry: CheckinEntry) {
    saveCheckin(entry);
    void confirmTap();
    navigate('/assessment');
  }

  function switchScenario(scenarioId: ScenarioId) {
    loadScenario(scenarioId);
    navigate('/');
  }

  function openReset() {
    setMoreOpen(false);
    setResetError('');
    resetDialog.current?.showModal();
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
        <Link to="/" className="wordmark" aria-label="Sol Check dashboard">
          <span className="wordmark-icon"><img src={rocketEngineMark} alt="" /></span>
          <span className="wordmark-name">Sol Check</span>
        </Link>

        <div className="sidebar-body">
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
          <button type="button" className="reset-link" onClick={openReset}>
            <RotateCcw size={16} aria-hidden="true" /> <span>Reset demo</span>
          </button>
        </div>
      </aside>

      <div className="work-area">
        <main className="main-content" data-route={pathname} id="main-content" ref={main} tabIndex={-1}>
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
            <Route path="/assessment" element={<Assessment key={`${mission.scenarioId}:${revision}`} assessment={assessment} records={records} mission={scenario.missionContext} />} />
            <Route path="/trends" element={
              <RouteErrorBoundary name="Trends">
                <Suspense fallback={<p role="status">Loading trends…</p>}>
                  <Trends key={mission.scenarioId} records={records} />
                </Suspense>
              </RouteErrorBoundary>
            } />
            <Route path="/timeline" element={<Timeline key={mission.scenarioId} scenario={scenario} records={records} />} />
            <Route path="/demo" element={<DemoData scenario={scenario} records={records} scenarioId={mission.scenarioId} onLoad={switchScenario} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation (compact)">
        {bottomNavigation.map((to) => {
          const item = navigation.find((entry) => entry.to === to)!;
          const isCheckin = to === '/check-in';
          return (
            <NavLink end={to === '/'} key={to} to={to} className={isCheckin ? 'bottom-nav-checkin' : undefined}>
              <item.Icon size={isCheckin ? 24 : 20} strokeWidth={1.75} aria-hidden="true" />
              <span>{isCheckin ? 'Check-in' : item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen((open) => !open)}>
          <Ellipsis size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
      <div id="more-sheet" className="more-sheet" data-open={moreOpen} hidden={!moreOpen}>
        {navigation.filter(({ to }) => !(bottomNavigation as readonly string[]).includes(to)).map(({ to, label, Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={openReset}>
          <RotateCcw size={18} aria-hidden="true" /> <span>Reset demo</span>
        </button>
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
