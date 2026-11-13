import { describe, expect, it } from 'vitest';
import { generateFollowUpTasks, updateTaskStatus } from './followUpEngine';
import type { DailyCheckin, RiskAssessment } from '../../contracts';

describe('Mission Health Action Center & Follow-Up Engine', () => {
  const dummyCheckin: DailyCheckin = {
    id: 'checkin-43',
    astronautId: 'maya-chen',
    sol: 43,
    submittedAtUtc: '2039-01-13T10:00:00Z',
    measurements: [
      {
        id: 'm1',
        astronautId: 'maya-chen',
        metric: 'heart_rate',
        value: 68,
        unit: 'bpm',
        observedAtUtc: '2039-01-13T10:00:00Z',
        provenance: 'user_entered',
      },
    ],
    symptoms: [{ id: 'fatigue', label: 'Fatigue', present: true }],
    note: '',
  };

  const dummyAssessment: RiskAssessment = {
    checkinId: 'checkin-43',
    findings: [],
    domainStatuses: {
      cardiovascular: 'no_change_detected',
      sleep: 'sustained_trend',
      behavioral: 'sustained_trend',
      metabolic: 'no_change_detected',
      temperature: 'no_change_detected',
      symptoms: 'sustained_trend',
    },
    dataQualityWarnings: [],
    recommendedTier: 'crew_medical_officer',
    actionCardIds: ['crew-review'],
    engineVersion: '1.3.0',
    overallState: 'escalation_recommended',
  };

  it('generates CMO review and fatigue follow-up tasks from Sol 43 assessment', () => {
    const tasks = generateFollowUpTasks(dummyCheckin, dummyAssessment);
    expect(tasks).toHaveLength(2);

    const cmoTask = tasks.find(t => t.assignedRole === 'crew_medical_officer');
    expect(cmoTask).toBeDefined();
    expect(cmoTask?.priority).toBe('urgent');
    expect(cmoTask?.status).toBe('awaiting_medical_review');
    expect(cmoTask?.auditTrail).toHaveLength(1);
    expect(cmoTask?.auditTrail[0].action).toBe('CREATED');

    const fatigueTask = tasks.find(t => t.id.includes('fatigue'));
    expect(fatigueTask).toBeDefined();
    expect(fatigueTask?.status).toBe('open');
  });

  it('generates data quality verification task when warnings are present', () => {
    const qualityAssessment: RiskAssessment = {
      ...dummyAssessment,
      recommendedTier: 'self_care',
      dataQualityWarnings: ['Systolic blood pressure must be greater than diastolic.'],
    };
    const tasks = generateFollowUpTasks(dummyCheckin, qualityAssessment);
    const qualityTask = tasks.find(t => t.ruleId === 'entry-quality');
    expect(qualityTask).toBeDefined();
    expect(qualityTask?.status).toBe('awaiting_measurement');
  });

  it('preserves existing tasks and tracks audit trail across state transitions', () => {
    const initialTasks = generateFollowUpTasks(dummyCheckin, dummyAssessment);
    const task = initialTasks[0];

    // Acknowledge task
    const acknowledged = updateTaskStatus(task, 'acknowledged', 'Dr. Victor Chen (CMO)', 'Reviewed sleep logs');
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.auditTrail).toHaveLength(2);
    expect(acknowledged.auditTrail[1].action).toBe('STATUS_CHANGED_TO_ACKNOWLEDGED');
    expect(acknowledged.auditTrail[1].actor).toBe('Dr. Victor Chen (CMO)');

    // Resolve task
    const resolved = updateTaskStatus(acknowledged, 'resolved', 'Dr. Victor Chen (CMO)', 'Rest cycle scheduled');
    expect(resolved.status).toBe('resolved');
    expect(resolved.completedAtUtc).toBeDefined();
    expect(resolved.auditTrail).toHaveLength(3);
  });
});
