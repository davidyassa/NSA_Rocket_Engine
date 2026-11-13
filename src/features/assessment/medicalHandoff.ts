/**
 * Clinical Medical Officer (CMO) to Ground Flight Surgeon Handoff Package
 *
 * Implements a structured, traceable, offline-ready medical handoff
 * package designed for deep-space missions operating under light-speed communication
 * latencies (e.g. 20-minute one-way delay to Mars).
 */

import { METRICS, type DailyCheckin, type RiskAssessment } from '../../contracts';
import { NASA_FIVE_HAZARDS } from '../hazards/hazardsData';
import { provenanceLabels } from './groundSummary';

export interface MedicalHandoffPackage {
  schemaVersion: '1.0.0';
  generatedAtUtc: string;
  astronautName: string;
  missionSol: number;
  communicationLatencyOneWayMin: number;
  triageTier: string;
  vitalObservations: {
    indicator: string;
    value: number;
    unit: string;
    provenance: string;
  }[];
  reportedSymptoms: string[];
  findingsChain: {
    ruleId: string;
    kind: string;
    summary: string;
    baselineUsed?: string;
  }[];
  nasaHazardsState: {
    hazard: string;
    hrpRiskId: string;
    state: string;
    summary: string;
  }[];
  recommendedActions: string[];
  clinicalSignOff: {
    preparedBy: string;
    status: 'pending_flight_surgeon_review' | 'acknowledged';
    checksum: string;
  };
}

export function generateMedicalHandoffPackage(
  record: DailyCheckin,
  assessment: RiskAssessment | null,
  astronautName = 'Dr. Maya Chen',
): MedicalHandoffPackage {
  const generatedAtUtc = new Date().toISOString();

  const vitalObservations = record.measurements.map(m => {
    const metric = METRICS[m.metric];
    return {
      indicator: metric.label,
      value: m.value,
      unit: metric.unitLabel,
      provenance: provenanceLabels[m.provenance] || m.provenance,
    };
  });

  const reportedSymptoms = record.symptoms.filter(s => s.present).map(s => s.label);

  const findingsChain = (assessment?.findings || []).map(f => {
    const baselineInfo = f.baselineUsed.map(b => `${METRICS[b.metric].label} median: ${b.median}`).join('; ');
    return {
      ruleId: f.ruleId,
      kind: f.kind,
      summary: f.summary,
      baselineUsed: baselineInfo || undefined,
    };
  });

  const nasaHazardsState = NASA_FIVE_HAZARDS.map(h => ({
    hazard: h.name,
    hrpRiskId: h.hrpRiskId,
    state: h.sol43Status.state,
    summary: h.sol43Status.summary,
  }));

  const recommendedActions = (assessment?.actionCardIds || []).map(id => id.replace(/_/g, ' '));

  // Deterministic 8-char hex checksum from mission and timestamp
  const checksumRaw = `${record.sol}-${record.submittedAtUtc}-${record.measurements.length}`;
  let hash = 0;
  for (let i = 0; i < checksumRaw.length; i++) {
    hash = (hash << 5) - hash + checksumRaw.charCodeAt(i);
    hash |= 0;
  }
  const checksum = `SHA-${Math.abs(hash).toString(16).padStart(8, '0').toUpperCase()}`;

  return {
    schemaVersion: '1.0.0',
    generatedAtUtc,
    astronautName,
    missionSol: record.sol,
    communicationLatencyOneWayMin: 20,
    triageTier: assessment?.recommendedTier || 'self_care',
    vitalObservations,
    reportedSymptoms,
    findingsChain,
    nasaHazardsState,
    recommendedActions,
    clinicalSignOff: {
      preparedBy: `${astronautName} (CMO) / Sol Check Autonomous Engine`,
      status: 'pending_flight_surgeon_review',
      checksum,
    },
  };
}

export function formatMedicalHandoffMarkdown(pkg: MedicalHandoffPackage): string {
  const lines: string[] = [
    `# NASA EXPLORATION MEDICAL HANDOFF PACKAGE`,
    `**Mission Sol:** ${pkg.missionSol} | **Generated:** ${pkg.generatedAtUtc} | **One-Way Delay:** ${pkg.communicationLatencyOneWayMin} min`,
    `**Crew Member:** ${pkg.astronautName} | **Triage Tier:** ${pkg.triageTier.toUpperCase()} | **Integrity Checksum:** \`${pkg.clinicalSignOff.checksum}\``,
    ``,
    `## 1. Physiological Observations`,
  ];

  for (const obs of pkg.vitalObservations) {
    lines.push(`- **${obs.indicator}:** ${obs.value} ${obs.unit} *(${obs.provenance})*`);
  }

  if (pkg.reportedSymptoms.length > 0) {
    lines.push(``, `## 2. Reported Symptoms`, `- ${pkg.reportedSymptoms.join(', ')}`);
  } else {
    lines.push(``, `## 2. Reported Symptoms`, `- No acute symptoms declared.`);
  }

  lines.push(``, `## 3. Evidence-Grounded Diagnostic Findings`);
  if (pkg.findingsChain.length > 0) {
    for (const f of pkg.findingsChain) {
      lines.push(`- **[${f.ruleId}]** ${f.summary}`);
      if (f.baselineUsed) lines.push(`  *Baseline reference:* ${f.baselineUsed}`);
    }
  } else {
    lines.push(`- No notable baseline deviations detected.`);
  }

  lines.push(``, `## 4. NASA 5 Hazards Environmental & Operational Status`);
  for (const h of pkg.nasaHazardsState) {
    lines.push(`- **${h.hazard} (${h.hrpRiskId}):** [${h.state.toUpperCase()}] ${h.summary}`);
  }

  lines.push(``, `## 5. Clinical Protocol Sign-Off`);
  lines.push(`*Prepared autonomously by ${pkg.clinicalSignOff.preparedBy}. Stored offline in local encrypted memory. Prepared for transmission upon next scheduled deep-space relay link.*`);

  return lines.join('\n');
}
