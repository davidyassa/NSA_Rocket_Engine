import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BookOpen, Brain, ChartNoAxesCombined, ClipboardList, Database, Ellipsis, LayoutGrid, MessagesSquare, Radiation, Route as RouteIcon, RotateCcw, ShieldAlert, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { CheckinEntry } from '../contracts';
import rocketEngineMark from '../ui/assets/nasa/rocket-engine.webp';
import { RADLAB_MANIFEST } from '../data/nasa';
import { evaluateCheckin } from '../engine';
import { Assessment } from '../features/assessment/Assessment';
import { Checkin } from '../features/checkin/Checkin';
import { CognitiveLab } from '../features/cognitive/CognitiveLab';
import { Dashboard } from '../features/dashboard/Dashboard';
import { NasaHazards } from '../features/hazards/NasaHazards';
import { RadiationHazard } from '../features/radiation/RadiationHazard';
import { DistanceHazard } from '../features/hazards/DistanceHazard';
import { IsolationHazard } from '../features/hazards/IsolationHazard';
import { Timeline } from '../features/timeline/Timeline';
import { CrewMedicalOfficer } from '../features/cmo/CrewMedicalOfficer';
import { DEMO_OPTIONS, type ScenarioId } from '../scenarios';
import { radlabEventSol } from '../sim';
import { DemoData } from './DemoData';
import { RouteErrorBoundary, lazyWithReload } from './lazyRoute';
import { confirmTap } from './native';
import { GLOSSARY } from '../content/plainLanguage';
import { activeSol, entryFromCheckin, useMissionStore } from './store';
import { useFollowUpStore } from '../features/followups/useFollowUpStore';
import { AskSol } from '../features/assistant/AskSol';

const Trends = lazyWithReload(() => import('../features/trends/Trends').then(({ Trends }) => ({ default: Trends })));

const navigation = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid },
  { to: '/hazards/radiation', label: 'Radiation monitor', Icon: Radiation },
  { to: '/check-in', label: 'Sol check-in', Icon: ClipboardList },
  { to: '/cognitive', label: 'Cognitive lab', Icon: Brain },
  { to: '/hazards', label: 'Hazards', Icon: ShieldAlert },
  { to: '/assessment', label: 'Assessment', Icon: Activity },
  { to: '/cmo', label: 'CMO console', Icon: Stethoscope },
  { to: '/trends', label: 'Trends', Icon: ChartNoAxesCombined },
  { to: '/timeline', label: 'Timeline', Icon: RouteIcon },
  { to: '/assistant', label: 'Ask Sol', Icon: MessagesSquare },
  { to: '/demo', label: 'Demo and data', Icon: Database },
];

/** Phone bottom bar: Dashboard · Assessment · Check-in (centre) · Timeline · More (CMO, trends, cognitive, hazards, demo). */
const bottomNavigation = ['/', '/assessment', '/check-in', '/timeline'] as const;
const routeLabels: Record<string, string> = {
  '/hazards/radiation': 'Space radiation monitoring',
  '/radiation': 'Space radiation monitoring',
  '/hazards/isolation': 'Isolation and confinement',
  '/hazards/distance': 'Distance from Earth',
};

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mission = useMissionStore((state) => state.mission);
  const warning = useMissionStore((state) => state.warning);
  const saveCheckin = useMissionStore((state) => state.saveCheckin);
  const loadScenario = useMissionStore((state) => state.loadScenario);
  const resetDemo = useMissionStore((state) => state.resetDemo);
  const advanceSol = useMissionStore((state) => state.advanceSol);
  const saveVigilance = useMissionStore((state) => state.saveVigilance);
  const saveIsolationPlan = useMissionStore((state) => state.saveIsolationPlan);
  const syncFollowUps = useFollowUpStore((state) => state.syncWithAssessment);
  const resetFollowUps = useFollowUpStore((state) => state.resetTasks);
  const [resetError, setResetError] = useState('');
  const [revision, setRevision] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const glossaryDialog = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);

  const { scenarioId } = mission;
  const { scenario: seed, prefill } = DEMO_OPTIONS[scenarioId];
  const sol = activeSol(mission);
  const scenario = useMemo(() => ({ ...seed, startSol: sol }), [seed, sol]);
  const vigilance = mission.vigilance?.[scenarioId] ?? [];
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
  const section = routeLabels[pathname] ?? navigation.find((item) => item.to === pathname)?.label ?? 'Dashboard';
  const { profile, startSol } = scenario;
  const initials = profile.displayName.split(' ').map((part) => part[0]).join('');

  useEffect(() => {
    document.title = `Sol Check · ${section}`;
    window.scrollTo(0, 0);
    if (pathname !== '/') main.current?.focus({ preventScroll: true });
    setMoreOpen(false);
  }, [pathname, section]);

  useEffect(() => {
    if (latest && assessment && latest.sol >= seed.startSol) syncFollowUps(latest, assessment, scenarioId);
  }, [latest, assessment, scenarioId, seed.startSol, syncFollowUps]);

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
      resetFollowUps();
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
          <span className="wordmark-name">Sol Check<small>Rocket Engine</small></span>
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
          <button type="button" className="reset-link" onClick={openReset}>
            <RotateCcw size={16} aria-hidden="true" /> <span>Reset demo</span>
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
          <Link to="/" className="mobile-wordmark" aria-label="Sol Check dashboard"><img src={rocketEngineMark} alt="" /></Link>
          <button type="button" className="glossary-button" onClick={() => glossaryDialog.current?.showModal()}>
            <BookOpen size={16} aria-hidden="true" /> <span>Words explained</span>
          </button>
        </header>
        <main className="main-content" data-route={pathname} id="main-content" ref={main} tabIndex={-1}>
          {warning && <p className="storage-warning" role="alert">{warning}</p>}
          <Routes>
            <Route path="/" element={<Dashboard scenario={scenario} records={records} latest={latest} assessment={assessment} />} />
            <Route path="/check-in" element={
              <Checkin
                key={`${scenarioId}:${sol}:${revision}`}
                sol={startSol}
                profile={profile}
                demoPrefill={sol === seed.startSol ? prefill : undefined}
                initialEntry={isLogged && latest ? entryFromCheckin(latest) : undefined}
                onSubmit={submit}
              />
            } />
            <Route path="/cognitive" element={<CognitiveLab key={`${scenarioId}:${sol}:${revision}`} currentSol={sol}
              history={vigilance} onSave={(session) => saveVigilance(scenarioId, session)} />} />
            <Route path="/hazards" element={<NasaHazards />} />
            <Route path="/hazards/radiation" element={<RadiationHazard scenario={scenario} />} />
            <Route path="/radiation" element={<Navigate to="/hazards/radiation" replace />} />
            <Route path="/space-radiation" element={<Navigate to="/hazards/radiation" replace />} />
            <Route path="/hazards/distance" element={<DistanceHazard scenario={scenario} />} />
            <Route path="/hazards/isolation" element={<IsolationHazard key={`${scenarioId}:${sol}:${revision}`}
              scenario={scenario} current={isLogged ? latest : null} assessment={isLogged ? assessment : null} records={records}
              vigilance={vigilance} plans={mission.isolationPlans?.[scenarioId]}
              onSavePlan={(plan) => saveIsolationPlan(scenarioId, sol, plan)}
              onAdvance={() => { advanceSol(scenarioId, sol); navigate('/check-in'); }} />} />
            <Route path="/assessment" element={<Assessment key={`${scenarioId}:${revision}`} assessment={assessment} records={records}
              mission={scenario.missionContext} scenarioId={scenarioId} vigilance={vigilance} />} />
            <Route path="/cmo" element={<CrewMedicalOfficer key={`${scenarioId}:${sol}:${revision}`} scenario={scenario}
              scenarioId={scenarioId} latest={latest} assessment={assessment} records={records} vigilance={vigilance} />} />
            <Route path="/trends" element={
              <RouteErrorBoundary name="Trends">
                <Suspense fallback={<p role="status">Loading trends…</p>}>
                  <Trends key={scenarioId} records={records} vigilance={vigilance} sol={sol} />
                </Suspense>
              </RouteErrorBoundary>
            } />
            <Route path="/timeline" element={<Timeline key={mission.scenarioId} scenario={scenario} records={records} />} />
            <Route path="/demo" element={<DemoData scenario={scenario} records={records} scenarioId={mission.scenarioId} onLoad={switchScenario} />} />
            <Route path="/assistant" element={<AskSol scenario={scenario} records={records} latest={latest} assessment={assessment} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="workspace-footer">
            <ShieldCheck size={15} aria-hidden="true" />
            Research-informed prototype · Not a diagnosis
          </footer>
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

      <dialog className="reset-dialog glossary-dialog" ref={glossaryDialog} aria-labelledby="glossary-title">
        <button type="button" className="dialog-close" aria-label="Close" onClick={() => glossaryDialog.current?.close()}>
          <X size={20} />
        </button>
        <h2 id="glossary-title">Words explained</h2>
        <p>Health words used in Sol Check, in everyday language.</p>
        <dl className="glossary-list">
          {GLOSSARY.map(({ term, meaning }) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" autoFocus onClick={() => glossaryDialog.current?.close()}>Close</button>
        </div>
      </dialog>

      <dialog className="reset-dialog" ref={resetDialog} aria-labelledby="reset-title">
        <button type="button" className="dialog-close" aria-label="Close" onClick={() => resetDialog.current?.close()}>
          <X size={20} />
        </button>
        <h2 id="reset-title">Reset demo?</h2>
        <p>This clears demo check-ins, vigilance results, countermeasure plans, and follow-up tasks from this device. The demo returns to Sol 43.</p>
        {resetError && <p role="alert" className="storage-warning">{resetError}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" autoFocus onClick={() => resetDialog.current?.close()}>Cancel</button>
          <button type="button" className="button button-primary" onClick={confirmReset}>Reset demo</button>
        </div>
      </dialog>
    </div>
  );
}
