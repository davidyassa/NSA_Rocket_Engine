import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BookOpen, Brain, ChartNoAxesCombined, ChevronDown, ClipboardList, Database, Ellipsis, Info, LayoutGrid, MessagesSquare, Radiation, Route as RouteIcon, RotateCcw, ShieldAlert, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isNavItemActive } from './navigation';
import { radiationSimCondition, useRadiationSimStore } from '../features/radiation/radiationSimStore';
import { SPACECRAFT_COMPARTMENTS } from '../features/radiation/radiationData';
import { guideFor } from '../features/assistant/pageGuides';
import type { CheckinEntry } from '../contracts';
import rocketEngineMark from '../ui/assets/nasa/rocket-engine.webp';
import { RADLAB_MANIFEST } from '../data/nasa';
import { evaluateCheckin } from '../engine';
import { Assessment } from '../features/assessment/Assessment';
import { Checkin } from '../features/checkin/Checkin';
import { CognitiveLab } from '../features/cognitive/CognitiveLab';
import { Dashboard } from '../features/dashboard/Dashboard';
import { routineChecklistItems } from '../features/dashboard/RoutineChecklist';
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
import { activeSol, useMissionStore } from './store';
import { tasksForScenario, useFollowUpStore } from '../features/followups/useFollowUpStore';
import { AskSol } from '../features/assistant/AskSol';
import { SolDock } from '../features/assistant/SolDock';
import type { DialogueAction } from '../features/assistant/dialogue';
import type { MissionEvidence } from '../features/assistant/missionAnswers';
import type { AssistantContext } from '../features/assistant/respond';

const Trends = lazyWithReload(() => import('../features/trends/Trends').then(({ Trends }) => ({ default: Trends })));

const primaryNavigation = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid },
  { to: '/hazards/radiation', label: 'Radiation monitor', Icon: Radiation },
  { to: '/check-in', label: 'Sol check-in', Icon: ClipboardList },
  { to: '/cognitive', label: 'Cognitive lab', Icon: Brain },
  { to: '/assessment', label: 'Assessment', Icon: Activity },
  { to: '/cmo', label: 'CMO console', Icon: Stethoscope },
  { to: '/trends', label: 'Trends', Icon: ChartNoAxesCombined },
  { to: '/timeline', label: 'Timeline', Icon: RouteIcon },
  { to: '/assistant', label: 'Ask Sol', Icon: MessagesSquare },
];
/** Grouped under the sidebar's "About" disclosure. */
const aboutNavigation = [
  { to: '/hazards', label: 'Hazards', Icon: ShieldAlert },
  { to: '/demo', label: 'Demo and data', Icon: Database },
];
const navigation = [...primaryNavigation, ...aboutNavigation];
type NavItem = (typeof navigation)[number];

function NavItemLink({ item, pathname, className, iconSize = 18, strokeWidth = 1.65, text }: {
  item: NavItem;
  pathname: string;
  className?: string;
  iconSize?: number;
  strokeWidth?: number;
  text?: string;
}) {
  const active = isNavItemActive(item.to, pathname);
  const classes = [className, active ? 'active' : undefined].filter(Boolean).join(' ');
  return (
    <Link to={item.to} className={classes || undefined} aria-current={active ? 'page' : undefined}>
      <item.Icon size={iconSize} strokeWidth={strokeWidth} aria-hidden="true" />
      <span>{text ?? item.label}</span>
    </Link>
  );
}

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
  const tasks = useFollowUpStore((state) => state.tasks);
  const [resetError, setResetError] = useState('');
  const [revision, setRevision] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const aboutHasActive = aboutNavigation.some(({ to }) => isNavItemActive(to, pathname));
  const [aboutOpen, setAboutOpen] = useState(aboutHasActive);
  const resetRadiationSim = useRadiationSimStore((state) => state.reset);
  const radiationKey = useRadiationSimStore((state) => state.scenarioKey);
  const radiationFrame = useRadiationSimStore((state) => state.frameIndex);
  const [timelineSol, setTimelineSol] = useState<number>();
  const [timelineControl, setTimelineControl] = useState<{ action: NonNullable<DialogueAction['timeline']> }>();
  const [checkinDraft, setCheckinDraft] = useState<MissionEvidence['checkinDraft']>();
  const [officerReview, setOfficerReview] = useState<MissionEvidence['officerReview']>();
  const [controlled, setControlled] = useState(false);
  const [controlLabel, setControlLabel] = useState('');
  const controlTimer = useRef<number>(0);
  const [voiceDraft, setVoiceDraft] = useState<{ scope: string; patches: NonNullable<DialogueAction['checkin']>[] }>();
  const [radiationRoom, setRadiationRoom] = useState('flight-deck');
  const [roomCommand, setRoomCommand] = useState<{ id: string; n: number }>();
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
  const draftScope = `${scenarioId}:${sol}:${revision}`;
  const radiationCondition = useMemo(() => radiationSimCondition(radiationKey, radiationFrame), [radiationKey, radiationFrame]);
  const roomReading = radiationCondition.scenario.frames[radiationCondition.frameIndex]?.find(reading => reading.roomId === radiationRoom);
  const routine = routineChecklistItems(sol, latest, mission.checklist?.[scenarioId]?.[sol] ?? []);
  const assistantContext: AssistantContext = {
    crewName: profile.displayName,
    sol,
    oneWayDelayMinutes: scenario.missionContext.oneWayDelayMinutes,
    latest, assessment, history: records,
    mission: {
      scenario, vigilance, routine, timelineSol, checkinDraft, officerReview,
      followUps: tasksForScenario(tasks, scenarioId),
      isolation: mission.isolationPlans?.[scenarioId]?.[sol],
      radiation: {
        status: radiationCondition.assessment.status,
        label: radiationCondition.assessment.statusLabel,
        frame: radiationCondition.frameIndex + 1,
        room: SPACECRAFT_COMPARTMENTS.find(room => room.id === radiationRoom)?.name,
        doseRate: roomReading?.radiationDoseRateMsvH ?? null,
        origin: roomReading?.origin ?? 'simulated',
      },
    },
  };

  function applySolAction(action: DialogueAction) {
    window.clearTimeout(controlTimer.current);
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    let label = 'Sol is here';
    if (action.checkin) {
      label = 'Filling in your check-in';
      const patch = action.checkin;
      setVoiceDraft(previous => ({
        scope: draftScope,
        patches: [...(previous?.scope === draftScope ? previous.patches : []), patch],
      }));
    }
    if (action.routine) {
      label = 'Updating your checklist';
      const { id, checked } = action.routine;
      const item = routine.find(entry => entry.id === id);
      if (item && !item.recorded && item.checked !== checked) useMissionStore.getState().toggleChecklistItem(id, sol);
    }
    if (action.scroll) {
      label = action.scroll === 'top' ? 'Scrolling to the top' : action.scroll === 'bottom' ? 'Scrolling to the bottom' : `Scrolling ${action.scroll}`;
      if (action.scroll === 'top' || action.scroll === 'bottom') window.scrollTo({ top: action.scroll === 'top' ? 0 : document.documentElement.scrollHeight, behavior });
      else window.scrollBy({ top: (action.scroll === 'up' ? -1 : 1) * window.innerHeight * 0.8, behavior });
    }
    if (typeof action.scrollLines === 'number' && action.scrollLines !== 0) {
      label = `Scrolling ${action.scrollLines < 0 ? 'up' : 'down'} ${Math.abs(action.scrollLines)} line${Math.abs(action.scrollLines) === 1 ? '' : 's'}`;
      const parsed = parseFloat(getComputedStyle(document.body).lineHeight);
      const lineHeight = Number.isFinite(parsed) ? parsed : 24;
      window.scrollBy({ top: action.scrollLines * lineHeight, behavior });
    }
    if (action.scrollTo) {
      label = `Scrolling to ${action.scrollTo}`;
      const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const want = norm(action.scrollTo);
      if (want) {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-target],h1,h2,h3,h4,h5,h6,[id]'));
        const hit = candidates.find((element) => {
          const text = norm(element.getAttribute('data-scroll-target') || element.id || element.textContent || '');
          return text.length > 1 && (text === want || text.includes(want) || want.includes(text));
        });
        hit?.scrollIntoView({ behavior, block: 'start' });
      }
    }
    if (action.radiationRoom) {
      const name = SPACECRAFT_COMPARTMENTS.find((room) => room.id === action.radiationRoom)?.name ?? 'the compartment';
      label = `Opening ${name}`;
      setRadiationRoom(action.radiationRoom);
      setRoomCommand((previous) => ({ id: action.radiationRoom!, n: (previous?.n ?? 0) + 1 }));
    }
    if (action.timeline) { label = 'Controlling the timeline'; setTimelineControl({ action: action.timeline }); }
    if (action.navigate) {
      if (action.navigateLabel) label = action.navigateLabel;
      else if (label === 'Sol is here') label = `Opening ${guideFor(action.navigate.split('?')[0]).name}`;
      navigate(action.navigate);
    }
    setControlLabel(label);
    setControlled(true);
    controlTimer.current = window.setTimeout(() => setControlled(false), 2600);
  }
  useEffect(() => () => window.clearTimeout(controlTimer.current), []);
  useEffect(() => {
    if (pathname !== '/timeline') setTimelineControl(undefined);
  }, [pathname]);
  const initials = profile.displayName.split(' ').map((part) => part[0]).join('');

  useEffect(() => {
    document.title = `Sol Check · ${section}`;
    window.scrollTo(0, 0);
    if (pathname !== '/') main.current?.focus({ preventScroll: true });
    setMoreOpen(false);
  }, [pathname, section]);

  useEffect(() => {
    if (aboutHasActive) setAboutOpen(true);
  }, [aboutHasActive, pathname]);

  useEffect(() => {
    if (latest && assessment && latest.sol >= seed.startSol) syncFollowUps(latest, assessment, scenarioId);
  }, [latest, assessment, scenarioId, seed.startSol, syncFollowUps]);

  function submit(entry: CheckinEntry) {
    saveCheckin(entry);
    setVoiceDraft(undefined);
    void confirmTap();
    navigate('/assessment');
  }

  function switchScenario(scenarioId: ScenarioId) {
    loadScenario(scenarioId);
    setVoiceDraft(undefined);
    setRadiationRoom('flight-deck');
    resetRadiationSim();
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
      setVoiceDraft(undefined);
      setRadiationRoom('flight-deck');
      resetRadiationSim();
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
            {primaryNavigation.map((item) => <NavItemLink key={item.to} item={item} pathname={pathname} />)}
            <div className="side-nav-group" data-has-active={aboutHasActive || undefined}>
              <button
                type="button"
                className="side-nav-group-toggle"
                aria-expanded={aboutOpen}
                aria-controls="side-nav-about"
                onClick={() => setAboutOpen((open) => !open)}
              >
                <Info size={18} strokeWidth={1.65} aria-hidden="true" />
                <span>About</span>
                <ChevronDown size={16} className="side-nav-chevron" aria-hidden="true" />
              </button>
              <div id="side-nav-about" className="side-nav-submenu" hidden={!aboutOpen}>
                {aboutNavigation.map((item) => <NavItemLink key={item.to} item={item} pathname={pathname} />)}
              </div>
            </div>
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
                voiceDraft={voiceDraft?.scope === draftScope ? voiceDraft.patches : undefined}
                onAssistantDraft={setCheckinDraft}
                onSubmit={submit}
              />
            } />
            <Route path="/cognitive" element={<CognitiveLab key={`${scenarioId}:${sol}:${revision}`} currentSol={sol}
              history={vigilance} onSave={(session) => saveVigilance(scenarioId, session)} />} />
            <Route path="/hazards" element={<NasaHazards />} />
            <Route path="/hazards/radiation" element={<RadiationHazard scenario={scenario} onInspectRoom={setRadiationRoom} command={roomCommand} />} />
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
              scenarioId={scenarioId} latest={latest} assessment={assessment} records={records} vigilance={vigilance} onAssistantReview={setOfficerReview} />} />
            <Route path="/trends" element={
              <RouteErrorBoundary name="Trends">
                <Suspense fallback={<p role="status">Loading trends…</p>}>
                  <Trends key={scenarioId} records={records} vigilance={vigilance} sol={sol} />
                </Suspense>
              </RouteErrorBoundary>
            } />
            <Route path="/timeline" element={<Timeline key={mission.scenarioId} scenario={scenario} records={records} onInspect={setTimelineSol} voiceControl={timelineControl} />} />
            <Route path="/demo" element={<DemoData scenario={scenario} records={records} scenarioId={mission.scenarioId} onLoad={switchScenario} />} />
            <Route path="/assistant" element={<AskSol ctx={assistantContext} onAction={applySolAction} />} />
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
            <NavItemLink key={to} item={item} pathname={pathname} className={isCheckin ? 'bottom-nav-checkin' : undefined}
              iconSize={isCheckin ? 24 : 20} strokeWidth={1.75} text={isCheckin ? 'Check-in' : item.label} />
          );
        })}
        <button type="button" aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen((open) => !open)}>
          <Ellipsis size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
      <div id="more-sheet" className="more-sheet" data-open={moreOpen} hidden={!moreOpen}>
        {navigation.filter(({ to }) => !(bottomNavigation as readonly string[]).includes(to)).map((item) => (
          <NavItemLink key={item.to} item={item} pathname={pathname} />
        ))}
        <button type="button" onClick={openReset}>
          <RotateCcw size={18} aria-hidden="true" /> <span>Reset demo</span>
        </button>
      </div>

      <SolDock ctx={assistantContext} onAction={applySolAction} />
      {controlled && (
        <div className="sol-island" role="status">
          <span className="sol-island-dot" aria-hidden="true"><span className="sol-island-dot-glow" /></span>
          <span className="sol-island-label">{controlLabel || 'Sol is here'}</span>
        </div>
      )}

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
