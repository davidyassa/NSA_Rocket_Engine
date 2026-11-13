import type { DailyCheckin, MetricId, RiskAssessment } from '../../contracts';
import type { ScenarioId } from '../../scenarios';

export type FollowUpStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'awaiting_measurement'
  | 'awaiting_medical_review'
  | 'resolved'
  | 'escalated';

export interface AuditEntry {
  timestampUtc: string;
  action: string;
  actor: string;
  details?: string;
}

export interface FollowUpTask {
  id: string;
  astronautId: string;
  scenarioId?: ScenarioId;
  sol: number;
  title: string;
  description: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedRole: 'astronaut' | 'crew_medical_officer' | 'ground_flight_surgeon';
  status: FollowUpStatus;
  ruleId?: string;
  metric?: MetricId;
  createdAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc?: string;
  notes?: string;
  auditTrail: AuditEntry[];
}

export function generateFollowUpTasks(
  checkin: DailyCheckin,
  assessment: RiskAssessment,
  existingTasks: readonly FollowUpTask[] = [],
  scenarioId?: ScenarioId,
): FollowUpTask[] {
  const tasks: FollowUpTask[] = [...existingTasks];
  const nowUtc = checkin.submittedAtUtc;

  function upsertTask(taskData: Omit<FollowUpTask, 'updatedAtUtc' | 'auditTrail'>) {
    const existingIndex = tasks.findIndex(t => t.id === taskData.id && t.astronautId === taskData.astronautId);
    if (existingIndex >= 0) {
      // Preserve status and audit history if already existing
      return;
    }
    tasks.push({
      ...taskData,
      scenarioId,
      updatedAtUtc: nowUtc,
      auditTrail: [
        {
          timestampUtc: nowUtc,
          action: 'CREATED',
          actor: 'Autonomous Decision Engine',
          details: `Generated from rule ${taskData.ruleId ?? 'system'}`,
        },
      ],
    });
  }

  const combined = assessment.findings.find((finding) => finding.ruleId === 'combined-sleep-mood');
  // 1. Sustained lower trend or urgent symptoms -> CMO review task
  if (assessment.recommendedTier === 'crew_medical_officer') {
    upsertTask({
      id: `task-cmo-sol-${checkin.sol}`,
      astronautId: checkin.astronautId,
      sol: checkin.sol,
      title: 'Crew Medical Officer Clinical Review',
      description: combined ? 'Review sustained lower sleep and mood, including any saved vigilance results.' : 'Review the check-in findings and reported symptoms.',
      reason: combined?.summary ?? 'Assessment recommends onboard medical review.',
      priority: 'urgent',
      assignedRole: 'crew_medical_officer',
      status: 'awaiting_medical_review',
      ruleId: combined?.ruleId,
      createdAtUtc: nowUtc,
    });
  }

  // 2. Data quality entry issues -> Remeasurement task
  if (assessment.dataQualityWarnings.length > 0) {
    upsertTask({
      id: `task-entry-quality-sol-${checkin.sol}`,
      astronautId: checkin.astronautId,
      sol: checkin.sol,
      title: 'Blood Pressure Dual-Entry Verification',
      description: assessment.dataQualityWarnings.join(' '),
      reason: 'Physical relational rule failed (systolic must strictly exceed diastolic).',
      priority: 'high',
      assignedRole: 'astronaut',
      status: 'awaiting_measurement',
      ruleId: 'entry-quality',
      metric: 'bp_systolic',
      createdAtUtc: nowUtc,
    });
  }

  // 3. Fatigue or a combined sleep and mood trend -> rest and vigilance follow-up
  const hasFatigue = checkin.symptoms.some(s => s.id === 'fatigue' && s.present);
  if (hasFatigue || combined) {
    upsertTask({
      id: `task-fatigue-sol-${checkin.sol}`,
      astronautId: checkin.astronautId,
      sol: checkin.sol,
      title: 'Fatigue & Sleep Hygiene Protocol',
      description: 'Plan the next sleep opportunity and complete a vigilance check in Cognitive Lab.',
      reason: hasFatigue ? 'Fatigue reported at check-in.' : 'Sleep and mood both met the sustained lower-trend rule.',
      priority: 'medium',
      assignedRole: 'astronaut',
      status: 'open',
      ruleId: hasFatigue ? 'reported-symptoms' : combined?.ruleId,
      createdAtUtc: nowUtc,
    });
  }

  // 4. Optical Camera low quality scan -> Retest task
  const hasCameraEstimate = checkin.measurements.some(m => m.source === 'camera_estimate');
  if (hasCameraEstimate) {
    upsertTask({
      id: `task-camera-provenance-sol-${checkin.sol}`,
      astronautId: checkin.astronautId,
      sol: checkin.sol,
      title: 'Verify Optical Heart Rate with Manual Pulse',
      description: 'Optical rPPG estimate used. Cross-check against palpated radial pulse if convenient.',
      reason: 'Contactless estimate carries optical motion uncertainty.',
      priority: 'low',
      assignedRole: 'astronaut',
      status: 'open',
      metric: 'heart_rate',
      createdAtUtc: nowUtc,
    });
  }

  const hasHeartSoundEstimate = checkin.measurements.some(m => m.metric === 'heart_rate' && m.source === 'microphone_estimate');
  if (hasHeartSoundEstimate) {
    upsertTask({
      id: `task-heart-sound-provenance-sol-${checkin.sol}`,
      astronautId: checkin.astronautId,
      sol: checkin.sol,
      title: 'Verify Heart-Sound Heart Rate with Manual Pulse',
      description: 'Count your wrist pulse to cross-check the heart-sound estimate.',
      reason: 'Microphone readings can be affected by phone placement, movement and background sound.',
      priority: 'low',
      assignedRole: 'astronaut',
      status: 'open',
      metric: 'heart_rate',
      createdAtUtc: nowUtc,
    });
  }

  return tasks;
}

export function updateTaskStatus(
  task: FollowUpTask,
  newStatus: FollowUpStatus,
  actor: string,
  notes?: string
): FollowUpTask {
  const timestampUtc = new Date().toISOString();
  return {
    ...task,
    status: newStatus,
    updatedAtUtc: timestampUtc,
    completedAtUtc: newStatus === 'resolved' ? timestampUtc : task.completedAtUtc,
    notes: notes ?? task.notes,
    auditTrail: [
      ...task.auditTrail,
      {
        timestampUtc,
        action: `STATUS_CHANGED_TO_${newStatus.toUpperCase()}`,
        actor,
        details: notes,
      },
    ],
  };
}
