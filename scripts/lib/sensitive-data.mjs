// Shared outbound boundary. Recognizable credentials are rejected; private prose
// still needs a user-selected excerpt and the host's data access policy.
const INVISIBLE = /[\p{Cf}\u034f\u180b-\u180d\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u;
const CREDENTIAL_LABEL = /^(?:password|passwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|[a-z0-9_]*api[_-]?key|비밀\s?번호|비밀번호|비번|패스워드|인증\s?키|액세스\s?키|api\s?키)$/i;
const CREDENTIAL = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\bapikey_[a-f0-9]{32}_[a-f0-9]{64}\b|\b(?:sk[-_][A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|(?:ts|tsk|typesafe)[_-][A-Za-z0-9_-]{16,})\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b(?:authorization\s*[:=]\s*(?:bearer|basic)\s+\S+|(?:[A-Z0-9_]*API[_-]?KEY|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret)\s*["']?\s*[:=]\s*["']?[^\s"',;]{4,})|\b[a-z][a-z0-9+.-]*:\/\/[^\s:/?#@]*:[^\s/?#@]+@|\bxox[abposr]-[A-Za-z0-9-]{10,}|\bxapp-[0-9]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/[A-Za-z0-9_/-]{20,}|\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])|(?:비밀번호|비번|패스워드|인증\s?키|api\s?키)\s*["']?\s*[:=]\s*["']?[^\s"',;]{4,}/i;

export function unsafeJevText(value, literals = []) {
  if (typeof value !== 'string') return true;
  if (INVISIBLE.test(value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
      || Buffer.from(value, 'utf8').toString('utf8') !== value) return true;
  const normalized = value.normalize('NFKC');
  return CREDENTIAL.test(value) || CREDENTIAL.test(normalized)
    || literals.some(literal => typeof literal === 'string' && literal.length > 0
      && (value.includes(literal) || normalized.includes(literal.normalize('NFKC'))));
}

export function validateJevStructure(value, literals = []) {
  const active = new Set();
  let nodes = 0, bytes = 0;
  function visit(item, depth, label) {
    if (++nodes > 10000 || depth > 32) throw new Error('Invalid outbound structure');
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item);
      if (bytes > 65536 || unsafeJevText(item, literals)) throw new Error('Invalid outbound text');
    } else if (item !== null && typeof item === 'object') {
      if (active.has(item) || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item))) throw new Error('Invalid outbound structure');
      active.add(item);
      const fields = Object.getOwnPropertyDescriptors(item);
      if (Array.isArray(item)) {
        if (item.length > 10000 || Object.keys(fields).length !== item.length + 1) throw new Error('Invalid outbound array');
        for (let i = 0; i < item.length; i++) {
          const field = fields[i];
          if (!field || !Object.hasOwn(field, 'value')) throw new Error('Invalid outbound field');
          visit(field.value, depth + 1);
        }
      } else {
        for (const [key, field] of Object.entries(fields)) {
          if (!Object.hasOwn(field, 'value') || !field.enumerable) throw new Error('Invalid outbound field');
          visit(key, depth + 1);
          visit(field.value, depth + 1, key);
        }
      }
      active.delete(item);
    } else if (!['number', 'boolean'].includes(typeof item) && item !== null) throw new Error('Invalid outbound value');
    else if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Invalid outbound number');
    if (typeof label === 'string' && CREDENTIAL_LABEL.test(label.normalize('NFKC').trim())
        && ['string', 'number', 'boolean'].includes(typeof item) && (typeof item !== 'string' || item.trim())) throw new Error('Credential-labelled value');
  }
  visit(value, 0);
}
