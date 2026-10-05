// Scan before JSON.parse: duplicates and resource limits must not be erased by parsing.
// This validates data only. No model-produced string is evaluated as code.
export function parseStrictJson(text, { maxDepth = 32, maxNodes = 10000 } = {}) {
  if (typeof text !== 'string' || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 64
      || !Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 100000) throw new Error('Invalid JSON limits');
  let position = 0, nodes = 0;
  const fail = () => { throw new Error('Invalid or ambiguous bounded JSON'); };
  const whitespace = () => { while (/[\x20\t\n\r]/.test(text[position] ?? '') && position < text.length) position++; };
  const string = () => {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === '\\') { position++; continue; }
      if (char === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, position)); } catch { fail(); }
        for (let i=0;i<value.length;i++) {
          const code = value.charCodeAt(i);
          if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
          } else if (code >= 0xdc00 && code <= 0xdfff) fail();
        }
        return value;
      }
    }
    fail();
  };
  const value = depth => {
    whitespace();
    if (depth > maxDepth || ++nodes > maxNodes) fail();
    const char = text[position];
    if (char === '"') { string(); return; }
    if (char === '{' || char === '[') {
      position++; whitespace();
      const close = char === '{' ? '}' : ']';
      const keys = new Set();
      if (text[position] === close) { position++; return; }
      for (;;) {
        whitespace();
        if (char === '{') {
          if (text[position] !== '"' || ++nodes > maxNodes) fail();
          const key = string();
          if (keys.has(key)) fail();
          keys.add(key); whitespace();
          if (text[position++] !== ':') fail();
        }
        value(depth+1); whitespace();
        if (text[position] === close) { position++; return; }
        if (text[position++] !== ',') fail();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(position));
    if (!token || (token[0] !== 'true' && token[0] !== 'false' && token[0] !== 'null' && !Number.isFinite(Number(token[0])))) fail();
    position += token[0].length;
  };
  value(0); whitespace();
  if (position !== text.length) fail();
  return JSON.parse(text);
}
