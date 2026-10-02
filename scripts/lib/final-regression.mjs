import { LEGACY_WORKFLOW_PROFILE, getWorkflowProfile } from './workflow-profiles.mjs';
import { inspectQa } from './qa-report.mjs';
import { physicalWorkspace, readSafe, sha256 } from './quality-files.mjs';

export const FINAL_REGRESSION_CHECKS = Object.freeze([
  'e2e-regression', 'screenshot-regression', 'keyboard-regression',
  'mouse-regression', 'design-regression', 'console-regression'
]);

// Inspection never runs project commands or rewrites earlier completion history.
export async function inspectFinalRegression(workspaceRoot, workflowProfile = LEGACY_WORKFLOW_PROFILE) {
  try {
    const root = await physicalWorkspace(workspaceRoot);
    const qa = await inspectQa(root, getWorkflowProfile(workflowProfile).milestones.final, { workflowProfile });
    if (qa.status !== 'current' || qa.verdict !== 'PASS') {
      throw new Error('Final regression report is missing, failed or stale');
    }
    // This validates the recorded reviewer mode, not an authenticated identity.
    if (workflowProfile !== LEGACY_WORKFLOW_PROFILE && qa.report.verifier.mode !== 'independent') {
      throw new Error('Final regression requires a recorded independent reviewer mode');
    }
    if (!FINAL_REGRESSION_CHECKS.every(id => qa.report.outcomes.some(outcome =>
      outcome.id === id && outcome.status === 'pass'))) {
      throw new Error('Final regression report must cover all six required matrices');
    }
    const artifact = qa.artifacts.find(entry => entry.path === 'dist/index.html');
    if (!artifact || sha256(await readSafe(root, 'dist/index.html')) !== artifact.sha256) {
      throw new Error('Final regression snapshot does not bind the current final HTML');
    }
    const reportPath = `step_archive/outputs/qa-reports/${qa.report_sha256}.report.json`;
    if (sha256(await readSafe(root, reportPath, 64 * 1024)) !== qa.report_sha256) {
      throw new Error('Final regression report changed during inspection');
    }
    return { verdict: 'PASS', report_sha256: qa.report_sha256,
      report_path: reportPath, artifact_sha256: artifact.sha256 };
  } catch (error) {
    return { verdict: 'INCOMPLETE', error: error.message };
  }
}
