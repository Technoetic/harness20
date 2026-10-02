// Pure shared definition registry. Persisted records never use the fresh default.
export const LEGACY_WORKFLOW_PROFILE = "legacy-50-v1";
export const DEFAULT_WORKFLOW_PROFILE = "research-free-36-v1";

const retained = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,21,25,30,31,32,33,34,35,36,37,38,39,41,42,44,45,46,47,48,49,50];

function definition(id, originals, sourceDirectory, targetDirectory) {
  const coordinate = original => {
    const index = originals.indexOf(original);
    return index < 0 ? null : index + 1;
  };
  return Object.freeze({
    id,
    stepCount: originals.length,
    originalSteps: Object.freeze(originals),
    sourceDirectory,
    targetDirectory,
    indexPath: `${targetDirectory}/index.json`,
    milestones: Object.freeze({
      dependency: coordinate(21), planning: coordinate(25), design: coordinate(30),
      implementation: coordinate(37), final: coordinate(50),
      quality: Object.freeze([38,44,50].map(coordinate)),
      independentQa: Object.freeze((id === LEGACY_WORKFLOW_PROFILE ? [39,40,43,46,47,48] : [39,46,47,48]).map(coordinate)),
      jev: Object.freeze((id === LEGACY_WORKFLOW_PROFILE ? [16,24,25,30,37,45,49] : [25,30,37,45,49]).map(coordinate))
    })
  });
}

const profiles = new Map([
  [LEGACY_WORKFLOW_PROFILE, definition(LEGACY_WORKFLOW_PROFILE,
    Array.from({ length:50 }, (_,i) => i + 1), "assets/steps", "codex/assets/steps")],
  [DEFAULT_WORKFLOW_PROFILE, definition(DEFAULT_WORKFLOW_PROFILE, retained,
    `assets/profiles/${DEFAULT_WORKFLOW_PROFILE}/steps`, `codex/assets/profiles/${DEFAULT_WORKFLOW_PROFILE}/steps`)]
]);

export function getWorkflowProfile(id) {
  const profile = profiles.get(id);
  if (!profile) throw new Error(`Unknown workflow profile: ${String(id)}`);
  return profile;
}

export function defaultWorkflowProfile() {
  return getWorkflowProfile(DEFAULT_WORKFLOW_PROFILE);
}

// State/progress resolver. Receipts without a count need their own schema validation.
export function resolveWorkflowProfile(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Workflow record must be an object");
  }
  const version = record.schema_version;
  let profile;
  if (version === undefined || version === 1) {
    if (Object.hasOwn(record, "workflow_profile")) {
      throw new Error("Profile-marked workflow record requires schema_version 2");
    }
    profile = getWorkflowProfile(LEGACY_WORKFLOW_PROFILE);
  } else if (version === 2) {
    profile = getWorkflowProfile(record.workflow_profile);
  } else {
    throw new Error("Unknown workflow record schema_version");
  }
  if (record.total_steps !== profile.stepCount) {
    throw new Error(`Workflow total_steps must match profile count ${profile.stepCount}`);
  }
  return profile;
}

function requireStep(number, count) {
  if (!Number.isInteger(number) || number < 1 || number > count) {
    throw new Error(`Step number must be an integer from 1 through ${count}`);
  }
}

export function originalStepNumber(profileId, number) {
  const profile = getWorkflowProfile(profileId);
  requireStep(number, profile.stepCount);
  return profile.originalSteps[number - 1];
}

export function profileStepNumber(profileId, original) {
  requireStep(original, 50);
  const index = getWorkflowProfile(profileId).originalSteps.indexOf(original);
  return index < 0 ? null : index + 1;
}

export function stepPhase(profileId, number) {
  const original = originalStepNumber(profileId, number);
  if (original <= 5) return "preflight";
  if (original <= 15) return "tooling";
  if (original <= 24) return profileId === LEGACY_WORKFLOW_PROFILE ? "research" : "planning";
  if (original <= 30) return "planning";
  if (original <= 38) return "implementation";
  if (original <= 44) return "review";
  return "e2e";
}
