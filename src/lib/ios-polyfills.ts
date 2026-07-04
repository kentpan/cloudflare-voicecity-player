/**
 * Lightweight runtime polyfills for older Safari / WeChat WebView engines
 * (notably iOS 13.3.1 on iPhone 8 Plus, WeChat 8.0.48).
 *
 * The precompiled react-dom + Next.js client bundles use a handful of ES2021/ES2022
 * features that land only on later iOS versions:
 *   - String.prototype.replaceAll()  → iOS 13.4+
 *   - Array.prototype.at()           → iOS 15.4+
 *   - Object.hasOwn()                → iOS 15.4+
 *   - Promise.any()                  → iOS 15+
 *   - Array.prototype.findLast()     → iOS 15.4+
 *
 * Without these, the very first JS that runs throws a SyntaxError/TypeError and the
 * whole app appears "frozen" (page renders, but nothing is clickable). This string is
 * inlined into <head> via a <script> tag in layout.tsx so it executes before any
 * chunk is evaluated.
 *
 * Keep this string small and self-contained — it runs on every browser, including
 * modern ones (the `if` guards make the assignments no-ops where the feature exists).
 */
export const IOS_POLYFILL_SCRIPT = `
(function(){
  // ===== 0) UA 检测:polyfill 仅 iOS < 14, 横幅仅本地开发 + 手机端(?debug 强制) =====
  var ua = '';
  try { ua = navigator.userAgent || ''; } catch(e) {}
  var iosMatch = ua.match(/iPhone OS (\\d+)_(\\d+)/);
  var iosMajor = iosMatch ? parseInt(iosMatch[1], 10) : 99;
  var needPolyfill = iosMajor < 14;
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|MicroMessenger/i.test(ua);
  var isDev = false;
  try { isDev = location.port !== '' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; } catch(e) {}
  var isDebug = false;
  try { isDebug = location.search.indexOf('debug') !== -1; } catch(e) {}
  var showBanner = (isDev && isMobile) || isDebug;
  if (!needPolyfill && !showBanner) return;

  if (needPolyfill) {
  // ===== 1) iOS < 14 运行时 API polyfill =====
  try {
    // Object.hasOwn (iOS 15.4+)
    if (typeof Object.hasOwn !== 'function') {
      Object.hasOwn = function(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
      };
    }
  } catch(e) {}
  try {
    // String.prototype.replaceAll (iOS 13.4+)
    if (typeof String.prototype.replaceAll !== 'function') {
      String.prototype.replaceAll = function(search, replacement) {
        if (search instanceof RegExp) {
          if (!search.global) {
            throw new TypeError('replaceAll must be called with a global RegExp');
          }
          return this.replace(search, replacement);
        }
        var esc = String(search).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        return this.replace(new RegExp(esc, 'g'), replacement);
      };
    }
  } catch(e) {}
  try {
    // Array.prototype.at (iOS 15.4+)
    if (typeof Array.prototype.at !== 'function') {
      Array.prototype.at = function(n) {
        n = Math.trunc(n) || 0;
        if (n < 0) n += this.length;
        if (n < 0 || n >= this.length) return undefined;
        return this[n];
      };
    }
  } catch(e) {}
  try {
    // String.prototype.at (iOS 15.4+)
    if (typeof String.prototype.at !== 'function') {
      String.prototype.at = function(n) {
        n = Math.trunc(n) || 0;
        var s = String(this);
        if (n < 0) n += s.length;
        if (n < 0 || n >= s.length) return undefined;
        return s.charAt(n);
      };
    }
  } catch(e) {}
  try {
    // Array.prototype.findLast (iOS 15.4+)
    if (typeof Array.prototype.findLast !== 'function') {
      Array.prototype.findLast = function(cb, thisArg) {
        for (var i = this.length - 1; i >= 0; i--) {
          if (cb.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
      };
    }
  } catch(e) {}
  try {
    // Array.prototype.findLastIndex (iOS 15.4+)
    if (typeof Array.prototype.findLastIndex !== 'function') {
      Array.prototype.findLastIndex = function(cb, thisArg) {
        for (var i = this.length - 1; i >= 0; i--) {
          if (cb.call(thisArg, this[i], i, this)) return i;
        }
        return -1;
      };
    }
  } catch(e) {}
  try {
    // Promise.any (iOS 15+)
    if (typeof Promise !== 'undefined' && typeof Promise.any !== 'function') {
      Promise.any = function(iterable) {
        return new Promise(function(resolve, reject) {
          var items = Array.isArray(iterable) ? iterable : Array.from(iterable);
          var pending = items.length;
          var errors = new Array(items.length);
          if (pending === 0) {
            reject(new AggregateError([], 'All promises were rejected'));
            return;
          }
          items.forEach(function(p, i) {
            Promise.resolve(p).then(resolve, function(err) {
              errors[i] = err;
              if (--pending === 0) reject(new AggregateError(errors, 'All promises were rejected'));
            });
          });
        });
      };
    }
  } catch(e) {}
  try {
    // AggregateError (iOS 15+)
    if (typeof AggregateError === 'undefined') {
      function AggregateError(errors, message) {
        var e = new Error(message);
        e.name = 'AggregateError';
        e.errors = Array.isArray(errors) ? errors : Array.from(errors || []);
        return e;
      }
      if (typeof window !== 'undefined') window.AggregateError = AggregateError;
      if (typeof globalThis !== 'undefined') globalThis.AggregateError = AggregateError;
    }
  } catch(e) {}
  try {
    // structuredClone (iOS 15.4+) — minimal fallback
    if (typeof structuredClone !== 'function') {
      structuredClone = function(value) {
        if (value === null || typeof value !== 'object') return value;
        return JSON.parse(JSON.stringify(value));
      };
    }
  } catch(e) {}
  try {
    // WeakRef (iOS 14.5+) — used by Next's clone-response util in the client bundle.
    // A true WeakRef can't be polyfilled (needs engine GC integration), but the
    // usage pattern here only reads .deref() immediately, so a strong-ref shim works.
    if (typeof WeakRef === 'undefined') {
      WeakRef = function(target) {
        this._target = target;
      };
      WeakRef.prototype.deref = function() {
        return this._target;
      };
      if (typeof window !== 'undefined') window.WeakRef = WeakRef;
      if (typeof globalThis !== 'undefined') globalThis.WeakRef = WeakRef;
    }
  } catch(e) {}
  try {
    // FinalizationRegistry (iOS 14.5+) — companion to WeakRef. The Next client code
    // only constructs one and never relies on the callback firing, so a no-op shim
    // is safe.
    if (typeof FinalizationRegistry === 'undefined') {
      FinalizationRegistry = function() {
        this.register = function() {};
        this.unregister = function() {};
      };
      if (typeof window !== 'undefined') window.FinalizationRegistry = FinalizationRegistry;
      if (typeof globalThis !== 'undefined') globalThis.FinalizationRegistry = FinalizationRegistry;
    }
  } catch(e) {}
  try {
    // ResizeObserver (iOS 13.4+) — used by Radix UI for measuring elements. On iOS
    // 13.3.1 it's missing, so we provide a minimal shim that reports the element's
    // getBoundingClientRect once + observes on a polling fallback. Radix only needs
    // the callback to fire with contentRect; it tolerates a no-op observer.
    if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
      window.ResizeObserver = function(callback) {
        this._callback = callback;
        this._elements = [];
        this._poll = null;
      };
      window.ResizeObserver.prototype.observe = function(target) {
        this._elements.push(target);
        // Fire once immediately with the current size so layout-driven components
        // (Radix popper, etc.) get an initial measurement.
        try {
          var rect = target.getBoundingClientRect();
          this._callback([{ target: target, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
        } catch(e) {}
        // Start a light polling fallback (every 200ms) so size changes are reported.
        if (!this._poll) {
          var self = this;
          this._poll = setInterval(function() {
            for (var i = 0; i < self._elements.length; i++) {
              var el = self._elements[i];
              if (!el) continue;
              try {
                var r = el.getBoundingClientRect();
                self._callback([{ target: el, contentRect: r, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], self);
              } catch(e) {}
            }
          }, 200);
        }
      };
      window.ResizeObserver.prototype.unobserve = function(target) {
        var idx = this._elements.indexOf(target);
        if (idx !== -1) this._elements.splice(idx, 1);
      };
      window.ResizeObserver.prototype.disconnect = function() {
        this._elements = [];
        if (this._poll) { clearInterval(this._poll); this._poll = null; }
      };
      if (typeof globalThis !== 'undefined') globalThis.ResizeObserver = window.ResizeObserver;
    }
  } catch(e) {}
  try {
    // TransformStream (iOS < 14.5) — used by Next 16 dev-mode debug channel
    // (next/dist/client/dev/debug-channel.js: getOrCreateDebugChannelReadableWriterPair).
    // iOS 13.3.1 Safari 13.0.4 has ReadableStream but NOT TransformStream, so
    // appBootstrap throws ReferenceError before React mounts.
    // Stub with proper backpressure: readable.read() returns a pending Promise
    // when no data is available (instead of { done: true }), which prevents the
    // Flight client from throwing "Connection closed" on premature stream end.
    if (typeof self !== 'undefined' && typeof self.TransformStream === 'undefined') {
      self.TransformStream = function(transformer) {
        var t = transformer || {};
        var queue = [];
        var rsClosed = false;
        var rsError = null;
        var pendingReads = [];
        var controller = {
          enqueue: function(chunk) {
            if (rsClosed || rsError) return;
            if (pendingReads.length > 0) {
              var r = pendingReads.shift();
              r.resolve({ value: chunk, done: false });
            } else {
              queue.push(chunk);
            }
          },
          close: function() {
            if (rsClosed || rsError) return;
            rsClosed = true;
            while (pendingReads.length > 0) {
              var r = pendingReads.shift();
              r.resolve({ value: undefined, done: true });
            }
          },
          error: function(e) {
            if (rsError || rsClosed) return;
            rsError = e || new Error('Stream errored');
            while (pendingReads.length > 0) {
              var r = pendingReads.shift();
              r.reject(rsError);
            }
          }
        };
        this.readable = {
          getReader: function() {
            return {
              read: function() {
                if (queue.length > 0) {
                  return Promise.resolve({ value: queue.shift(), done: false });
                }
                if (rsError) return Promise.reject(rsError);
                if (rsClosed) return Promise.resolve({ value: undefined, done: true });
                return new Promise(function(resolve, reject) {
                  pendingReads.push({ resolve: resolve, reject: reject });
                });
              },
              cancel: function() { return Promise.resolve(); },
              releaseLock: function() {}
            };
          },
          tee: function() { return [this, this]; }
        };
        this.writable = {
          getWriter: function() {
            var closed = false;
            return {
              write: function(chunk) {
                try {
                  if (t.transform) t.transform(chunk, controller);
                  else controller.enqueue(chunk);
                } catch(e) {}
                return Promise.resolve();
              },
              close: function() {
                if (closed) return Promise.resolve();
                closed = true;
                controller.close();
                return Promise.resolve();
              },
              abort: function(e) {
                controller.error(e);
                return Promise.resolve();
              },
              get closed() { return new Promise(function(){}); },
              get ready() { return Promise.resolve(); }
            };
          },
          get locked() { return false; }
        };
      };
    }
  } catch(e) {}
  try {
    // performance.measure / performance.mark — React 19's dev runtime calls these
    // with measure names containing Unicode (zero-width space, emoji, fiber objects)
    // that iOS 13.3.1's performance.measure() rejects with "The string did not match
    // the expected pattern". Wrap them to swallow that specific error so React's
    // profiler doesn't crash hydration. (These are dev-only profiling calls.)
    if (typeof window !== 'undefined' && window.performance) {
      var origMeasure = performance.measure ? performance.measure.bind(performance) : null;
      var origMark = performance.mark ? performance.mark.bind(performance) : null;
      if (origMeasure) {
        performance.measure = function() {
          try {
            return origMeasure.apply(performance, arguments);
          } catch(e) {
            // "The string did not match the expected pattern" — ignore
            return;
          }
        };
      }
      if (origMark) {
        performance.mark = function() {
          try {
            return origMark.apply(performance, arguments);
          } catch(e) {
            return;
          }
        };
      }
      if (performance.clearMeasures) {
        var origClearMeasures = performance.clearMeasures.bind(performance);
        performance.clearMeasures = function() {
          try { origClearMeasures.apply(performance, arguments); } catch(e) {}
        };
      }
      if (performance.clearMarks) {
        var origClearMarks = performance.clearMarks.bind(performance);
        performance.clearMarks = function() {
          try { origClearMarks.apply(performance, arguments); } catch(e) {}
        };
      }
    }
  } catch(e) {}
  } // end if (needPolyfill)

  // ===== 2) 早期错误捕获 + plain-DOM 红色横幅 (本地开发 + 手机端, 初始隐藏) =====
  // 在 React 挂载前就能显示错误, React 挂载失败也能看到
  if (showBanner) {
  try {
    window.__capturedErrors = window.__capturedErrors || [];
    var banner = document.createElement('div');
    banner.id = '__early_error_banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;' +
      'max-height:40vh;overflow-y:auto;background:rgba(220,38,38,0.95);color:#fff;' +
      'font:12px/1.4 -apple-system,monospace;padding:8px 10px;text-align:left;direction:ltr;' +
      'display:none;';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;margin-bottom:4px;display:flex;justify-content:space-between;';
    var titleText = document.createElement('span');
    titleText.textContent = 'JS Error (0)';
    var btnStyle = 'background:rgba(255,255,255,0.2);color:#fff;border:0;border-radius:4px;padding:2px 8px;font-size:11px;margin-left:4px;cursor:pointer;';
    var copyBtn = document.createElement('button');
    copyBtn.textContent = '复制';
    copyBtn.style.cssText = btnStyle;
    copyBtn.onclick = function(){
      var errs = window.__capturedErrors;
      if (!errs.length) { copyBtn.textContent = '无错误'; setTimeout(function(){ copyBtn.textContent='复制'; },1500); return; }
      var lines = [];
      for (var i = 0; i < errs.length; i++) {
        var e = errs[i];
        var line = '#' + (i+1) + ': ' + (e.message || 'Error');
        if (e.source) line += '\\n  at ' + e.source + (e.lineno ? ':'+e.lineno : '') + (e.colno ? ':'+e.colno : '');
        if (e.stack) line += '\\n' + e.stack;
        lines.push(line);
      }
      var text = lines.join('\\n---\\n');
      var done = function(){ copyBtn.textContent='已复制'; setTimeout(function(){ copyBtn.textContent='复制'; },1500); };
      var fail = function(){
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch(_) { copyBtn.textContent='复制失败'; setTimeout(function(){ copyBtn.textContent='复制'; },1500); }
        document.body.removeChild(ta);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fail);
        } else { fail(); }
      } catch(_) { fail(); }
    };
    var clearBtn = document.createElement('button');
    clearBtn.textContent = '清除';
    clearBtn.style.cssText = btnStyle;
    clearBtn.onclick = function(){ window.__capturedErrors = []; banner.style.display='none'; titleText.textContent='JS Error (0)'; while(list.firstChild) list.removeChild(list.firstChild); };
    title.appendChild(titleText);
    title.appendChild(copyBtn);
    title.appendChild(clearBtn);
    banner.appendChild(title);
    var list = document.createElement('div');
    banner.appendChild(list);
    function attachBanner(){ if (banner.parentNode) return; if (document.body) document.body.appendChild(banner); else document.documentElement.appendChild(banner); }
    function pushErr(err){
      if (window.__capturedErrors.length < 10) window.__capturedErrors.push(err);
      attachBanner();
      banner.style.display = 'block';
      titleText.textContent = 'JS Error (' + window.__capturedErrors.length + ')';
      var item = document.createElement('div');
      item.style.cssText = 'border-top:1px solid rgba(255,255,255,0.3);padding-top:4px;margin-top:4px;word-break:break-all;white-space:pre-wrap;';
      var msg = document.createElement('div');
      msg.textContent = err.message || 'Error';
      item.appendChild(msg);
      if (err.source || err.lineno) {
        var loc = document.createElement('div');
        loc.style.cssText = 'opacity:0.85;margin-top:2px;';
        loc.textContent = (err.source||'') + (err.lineno?':'+err.lineno:'') + (err.colno?':'+err.colno:'');
        item.appendChild(loc);
      }
      if (err.stack) {
        var det = document.createElement('details');
        det.style.cssText = 'margin-top:4px;';
        var sum = document.createElement('summary');
        sum.style.cssText = 'cursor:pointer;opacity:0.85;';
        sum.textContent = 'stack';
        var pre = document.createElement('pre');
        pre.style.cssText = 'white-space:pre-wrap;margin:4px 0 0;font-size:10px;';
        pre.textContent = err.stack;
        det.appendChild(sum);
        det.appendChild(pre);
        item.appendChild(det);
      }
      list.appendChild(item);
    }
    window.__pushEarlyError = pushErr;

    function extractErr(e, fallback){
      if (!e) return { message: fallback || 'Error (no detail)', stack: '' };
      var name = (e && e.name) ? e.name : '';
      var msg = (e && e.message) ? e.message : '';
      if (!msg) { try { msg = String(e); } catch(_) { msg = ''; } }
      var full = msg;
      if (name && msg && msg.indexOf(name) !== 0) full = name + ': ' + msg;
      else if (name && !msg) full = name;
      if (!full) full = fallback || 'Error (no detail)';
      return { message: full, stack: (e && e.stack) ? e.stack : '' };
    }

    window.addEventListener('error', function(ev){
      if (ev.target && ev.target !== window && ev.target.tagName) {
        var tag = ev.target.tagName.toLowerCase();
        var src = ev.target.src || ev.target.href || '';
        pushErr({ message: '[load] ' + tag + ' load failed: ' + src, source: src, lineno: 0, colno: 0, stack: '' });
        return;
      }
      var e = ev.error;
      var info = extractErr(e, ev.message);
      if ((!info.message || info.message === 'Error (no detail)') && ev.filename) {
        info.message = 'Error at ' + ev.filename + ':' + (ev.lineno || 0) + ':' + (ev.colno || 0);
      }
      pushErr({ message: info.message, source: (e && (e.fileName || e.sourceURL)) || ev.filename || '', lineno: (e && e.lineNumber) || ev.lineno || 0, colno: ev.colno || 0, stack: info.stack });
    }, true);
    window.addEventListener('unhandledrejection', function(ev){
      var r = ev.reason;
      var info;
      if (r instanceof Error) {
        info = extractErr(r, 'Unhandled promise rejection');
      } else if (r != null) {
        var msg = '';
        if (r && r.message) msg = r.message;
        else { try { msg = (typeof r === 'object') ? JSON.stringify(r) : String(r); } catch(_) { msg = String(r); } }
        info = { message: msg || 'Unhandled promise rejection', stack: (r && r.stack) ? r.stack : '' };
      } else {
        info = { message: 'Unhandled promise rejection (reason: ' + String(r) + ')', stack: '' };
      }
      pushErr({ message: info.message, stack: info.stack });
    }, true);

    var _origConsoleError = console.error ? console.error.bind(console) : null;
    if (_origConsoleError) {
      console.error = function(){
        var args = Array.prototype.slice.call(arguments);
        var parts = [];
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (a instanceof Error) {
            parts.push((a.name||'Error') + ': ' + (a.message||'') + (a.stack ? '\\n' + a.stack : ''));
          } else if (typeof a === 'string') {
            parts.push(a);
          } else if (a != null) {
            try { parts.push(JSON.stringify(a)); } catch(_) { parts.push(String(a)); }
          }
        }
        var full = parts.join(' ');
        if (full) pushErr({ message: '[console] ' + full, source: '', lineno: 0, colno: 0, stack: '' });
        return _origConsoleError.apply(console, args);
      };
    }
  } catch(e){}
  } // end if (showBanner)
})();
`;
