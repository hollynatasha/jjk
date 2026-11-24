// MediaPipe's native C++ logs arrive through console.error/console.warn, e.g.
// "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." or "W1011
// 16:56:21.392000 1 gl_context.cc:1135] OpenGL error checking is disabled".
// Those go to console.debug so a red console means a real problem; E/F lines
// and everything else pass through.
const NATIVE_CHATTER = /^(INFO: |[IW]\d{4} \d\d:\d\d:\d\d\.\d+\s)/;
const routed = new WeakSet();
export function routeNativeLogs(con = console) {
  if (routed.has(con)) return;
  routed.add(con);
  for (const level of ['error', 'warn']) {
    const original = con[level].bind(con);
    con[level] = (...args) => {
      if (typeof args[0] === 'string' && NATIVE_CHATTER.test(args[0])) con.debug('[mediapipe]', ...args);
      else original(...args);
    };
  }
}
export const isNativeChatter = (line) => NATIVE_CHATTER.test(line);
