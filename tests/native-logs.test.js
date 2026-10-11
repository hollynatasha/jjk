import { describe, it, expect } from 'vitest';
import { routeNativeLogs, isNativeChatter } from '../src/media/native-logs.js';

function fakeConsole() {
  const seen = { error: [], warn: [], debug: [] };
  return { seen, error: (...a) => seen.error.push(a.join(' ')), warn: (...a) => seen.warn.push(a.join(' ')), debug: (...a) => seen.debug.push(a.join(' ')) };
}

describe('MediaPipe native log routing', () => {
  it('moves INFO and W/I glog lines to debug and leaves real errors alone', () => {
    const con = fakeConsole();
    routeNativeLogs(con);
    con.error('INFO: Created TensorFlow Lite XNNPACK delegate for CPU.');
    con.warn('W1011 16:56:21.236000 2172416 gl_context.cc:1135] OpenGL error checking is disabled');
    con.error('E1011 16:56:21.236000 2172416 calculator_graph.cc:887] INVALID_ARGUMENT: bad input');
    con.error('Hand model failed to load');
    con.warn('Effects overlay mode');
    expect(con.seen.debug).toHaveLength(2);
    expect(con.seen.error).toEqual(['E1011 16:56:21.236000 2172416 calculator_graph.cc:887] INVALID_ARGUMENT: bad input', 'Hand model failed to load']);
    expect(con.seen.warn).toEqual(['Effects overlay mode']);
  });

  it('installs once per console', () => {
    const con = fakeConsole();
    routeNativeLogs(con);
    routeNativeLogs(con);
    con.error('INFO: once');
    expect(con.seen.debug).toHaveLength(1);
  });

  it('only matches the native prefixes', () => {
    expect(isNativeChatter('INFO: x')).toBe(true);
    expect(isNativeChatter('I0101 00:00:00.1 x')).toBe(true);
    expect(isNativeChatter('Information: x')).toBe(false);
    expect(isNativeChatter('W1011 is not a timestamp')).toBe(false);
  });
});
