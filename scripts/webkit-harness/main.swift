// Minimal WKWebView harness: open the app in the system WebKit (the engine Safari
// uses on this Mac), click a key with a real (synthesised) mouse event, and print
// what the page reports while it starts: console output, errors, audio status.
//   swiftc -O scripts/webkit-harness/main.swift -o .cache/webkit-harness
//   .cache/webkit-harness http://localhost:4199/?debug [seconds] [--no-gesture]
import AppKit
import WebKit

let args = CommandLine.arguments
let url = URL(string: args.count > 1 ? args[1] : "http://localhost:4199/?debug")!
let seconds = args.count > 2 ? Double(args[2]) ?? 10 : 10
let noGesture = args.contains("--no-gesture")
// --js-start: start audio from injected JS with autoplay allowed (tests the engine
// pipeline in real WebKit independently of how a gesture is delivered)
let jsStart = args.contains("--js-start") || args.contains("--js-start-strict")
// --js-start-strict: same, but with Safari's default autoplay policy (no gesture)
let strict = args.contains("--js-start-strict")

final class Logger: NSObject, WKScriptMessageHandler {
  let t0 = Date()
  func userContentController(_ uc: WKUserContentController, didReceive m: WKScriptMessage) {
    print(String(format: "[%6.0f ms] %@", Date().timeIntervalSince(t0) * 1000, "\(m.body)"))
    fflush(stdout)
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let logger = Logger()
let cfg = WKWebViewConfiguration()
// Safari's default: audio may only start from a user gesture
cfg.mediaTypesRequiringUserActionForPlayback = jsStart && !strict ? [] : .all
let uc = WKUserContentController()
uc.add(logger, name: "log")
let hook = """
(function(){
  const send = (k, a) => { try { window.webkit.messageHandlers.log.postMessage(k + ' ' + Array.from(a).map(x => { try { return typeof x === 'string' ? x : (x && x.stack) || JSON.stringify(x) } catch { return String(x) } }).join(' ')) } catch {} };
  for (const k of ['log','warn','error','info']) { const o = console[k].bind(console); console[k] = function(){ send(k, arguments); o.apply(null, arguments) } }
  window.addEventListener('error', e => send('pageerror', [e.message + ' @' + e.filename + ':' + e.lineno]));
  window.addEventListener('unhandledrejection', e => send('rejection', [String(e.reason && (e.reason.stack || e.reason))]));
})();
"""
uc.addUserScript(WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: false))
cfg.userContentController = uc
let win = NSWindow(contentRect: NSRect(x: 80, y: 80, width: 1280, height: 820), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
let web = WKWebView(frame: win.contentView!.bounds, configuration: cfg)
web.autoresizingMask = [.width, .height]
win.contentView!.addSubview(web)
win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
win.makeFirstResponder(web)
web.load(URLRequest(url: url))

func js(_ s: String, _ done: @escaping (String) -> Void) {
  web.evaluateJavaScript(s) { r, e in done(e.map { "JS error: \($0)" } ?? "\(r ?? "nil")") }
}
func click(_ x: CGFloat, _ y: CGFloat) {
  // page coordinates (top-left origin) -> window coordinates (bottom-left origin)
  let p = NSPoint(x: x, y: web.bounds.height - y)
  for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
    if let e = NSEvent.mouseEvent(with: type, location: p, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: win.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) {
      win.sendEvent(e)
    }
  }
}
let probe = "JSON.stringify({status: window.__piano && __piano.status, error: window.__piano && __piano.error, ctx: window.__piano && __piano.ctx && {state: __piano.ctx.state, rate: __piano.ctx.sampleRate}, ready: !!(window.__piano && __piano.piano), lamp: (document.querySelector('.status')||{}).textContent, ua: navigator.userAgent.slice(-40)})"

DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
  js("(() => { const k = document.querySelector('.key[data-midi=\"60\"]'); k.scrollIntoView({block:'nearest', inline:'center'}); const r = k.getBoundingClientRect(); return JSON.stringify([r.left + r.width/2, r.top + r.height*0.85]) })()") { s in
    print("key at \(s)")
    if jsStart {
      js("window.__piano.start(); 'called'") { r in print("js start -> \(r)") }
    } else if !noGesture, let d = s.data(using: .utf8), let a = try? JSONSerialization.jsonObject(with: d) as? [Double], a.count == 2 {
      click(CGFloat(a[0]), CGFloat(a[1]))
      print("clicked")
    }
    var n = 0
    Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { t in
      n += 1
      js(probe) { r in print(String(format: "t+%.1fs %@", Double(n) * 0.5, r)); fflush(stdout) }
      if Double(n) * 0.5 >= seconds {
        t.invalidate()
        js("JSON.stringify(window.__diag ? __diag.lines : null)") { r in print("diag \(r)"); exit(0) }
      }
    }
  }
}
app.run()
