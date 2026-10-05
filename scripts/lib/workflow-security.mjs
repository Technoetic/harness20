import { sha256 } from './quality-files.mjs';

export const WORKFLOW_SECURITY_POLICY = 'owasp-v1';
export function assertWorkflowTopicPin(binding, topicBytes) {
  // Existing untagged runs retain their historical schema; never silently bless
  // their content as a newly secured run. New bootstraps always tag the binding.
  if (!Object.hasOwn(binding,'security_policy')) return;
  if (binding.security_policy !== WORKFLOW_SECURITY_POLICY || !/^[a-f0-9]{64}$/.test(binding.topic_sha256 ?? '')
      || !Buffer.isBuffer(topicBytes) || topicBytes.length > 1024 * 1024 || sha256(topicBytes) !== binding.topic_sha256) {
    throw Error('Approved TOPIC scope pin is missing, invalid or changed');
  }
}
