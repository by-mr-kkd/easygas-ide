/**
 * Browser-side replacement for `google.script.run` used by the page that is hosted outside GAS
 * (GitHub Pages): every server call becomes a POST of `{fn,args}` to the deployed web app, answered
 * by the dispatcher in `EgsRemote.gs`. The AI keeps writing ordinary google.script.run code.
 */

/** Only the plain /exec form (verified cross-origin). Domain-scoped `/a/...` URLs need a Google login. */
export const EXEC_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export class InvalidExecUrlError extends Error {
  readonly code = "INVALID_EXEC_URL";
  readonly url: string;
  constructor(url: string) {
    super("ลิงก์เว็บแอปไม่ถูกต้อง ต้องเป็นลิงก์ที่ลงท้ายด้วย /exec จาก script.google.com");
    this.name = "InvalidExecUrlError";
    this.url = url;
  }
}

export function assertExecUrl(url: string): void {
  if (!EXEC_URL_RE.test(url)) throw new InvalidExecUrlError(url);
}

const URL_PLACEHOLDER = "__EGS_EXEC_URL__";

// ES2017, no dependencies, no comments (it is inlined as-is). Keep every "<" out of string literals.
const SHIM_SOURCE = `(function () {
  var EXEC_URL = ${URL_PLACEHOLDER};
  var MSG_NETWORK = 'เชื่อมต่อระบบหลังบ้านไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่';
  var MSG_BAD_ANSWER = 'ระบบหลังบ้านตอบกลับผิดรูปแบบ กรุณาลองใหม่อีกครั้ง';
  var MSG_FILE = 'หน้านี้ยังส่งไฟล์แนบจากฟอร์มไม่ได้ กรุณาตัดช่องแนบไฟล์ออก';
  var MSG_ARGS = 'ข้อมูลที่ส่งไปต้องเป็นค่าที่แปลงเป็น JSON ได้';

  function toError(name, message, cause) {
    var err = new Error(message);
    if (name) err.name = name;
    if (cause !== undefined) err.cause = cause;
    return err;
  }

  function addField(out, name, value) {
    if (!(name in out)) { out[name] = value; return; }
    if (!Array.isArray(out[name])) out[name] = [out[name]];
    out[name].push(value);
  }

  function formToObject(form) {
    var out = {};
    var els = form.elements || [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = String(el.type || '').toLowerCase();
      if (!el.name || el.disabled) continue;
      if (type === 'file') {
        if (el.files && el.files.length) throw toError('EgsFormError', MSG_FILE);
        continue;
      }
      if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image' || type === 'fieldset') continue;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      if (type === 'select-multiple') {
        var opts = el.options || [];
        for (var j = 0; j < opts.length; j++) if (opts[j].selected) addField(out, el.name, opts[j].value);
        continue;
      }
      addField(out, el.name, el.value);
    }
    return out;
  }

  function isForm(v) {
    return !!v && typeof v === 'object' && String(v.tagName || '').toUpperCase() === 'FORM';
  }

  function prepareArgs(args) {
    if (args.length === 1 && isForm(args[0])) return [formToObject(args[0])];
    return args;
  }

  function parseAnswer(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw toError('EgsRemoteError', MSG_BAD_ANSWER, e); }
    if (!data || typeof data !== 'object' || typeof data.ok !== 'boolean') throw toError('EgsRemoteError', MSG_BAD_ANSWER);
    return data;
  }

  function settle(state, value, err) {
    if (err) {
      if (state.fail) state.fail(err, state.user);
      else console.error('google.script.run.' + state.fn + ' failed:', err);
      return;
    }
    if (state.ok) state.ok(value, state.user);
  }

  function send(state, args) {
    var body;
    try {
      body = JSON.stringify({ fn: state.fn, args: prepareArgs(args) });
    } catch (e) {
      var err = e && e.name === 'EgsFormError' ? e : toError('EgsArgsError', MSG_ARGS, e);
      Promise.resolve().then(function () { settle(state, undefined, err); });
      return;
    }
    fetch(EXEC_URL, { method: 'POST', body: body, redirect: 'follow' })
      .then(function (res) { return res.text(); }, function (e) { throw toError('EgsNetworkError', MSG_NETWORK, e); })
      .then(parseAnswer)
      .then(function (data) { return { data: data }; }, function (e) { return { err: e }; })
      .then(function (r) {
        if (r.err) return settle(state, undefined, r.err);
        if (r.data.ok) return settle(state, r.data.value, null);
        var e = r.data.error || {};
        settle(state, undefined, toError(e.name ? String(e.name) : 'Error', e.message !== undefined ? String(e.message) : 'Error'));
      });
  }

  var SKIP = { then: 1, toJSON: 1, constructor: 1, valueOf: 1, toString: 1, inspect: 1 };

  function makeRunner(state) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (typeof prop !== 'string' || SKIP[prop]) return undefined;
        if (prop === 'withSuccessHandler') return function (h) { return makeRunner({ ok: h, fail: state.fail, user: state.user }); };
        if (prop === 'withFailureHandler') return function (h) { return makeRunner({ ok: state.ok, fail: h, user: state.user }); };
        if (prop === 'withUserObject') return function (u) { return makeRunner({ ok: state.ok, fail: state.fail, user: u }); };
        return function () {
          send({ ok: state.ok, fail: state.fail, user: state.user, fn: prop }, Array.prototype.slice.call(arguments));
        };
      }
    });
  }

  function currentLocation() {
    var params = new URLSearchParams(window.location.search);
    var parameter = {}, parameters = {};
    params.forEach(function (value, key) {
      if (!(key in parameter)) parameter[key] = value;
      (parameters[key] = parameters[key] || []).push(value);
    });
    return { hash: window.location.hash.replace(/^#/, ''), parameter: parameter, parameters: parameters };
  }

  function buildUrl(params, hash) {
    var search = window.location.search;
    if (params && typeof params === 'object') {
      var q = new URLSearchParams();
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (Array.isArray(v)) v.forEach(function (x) { q.append(k, String(x)); });
        else if (v !== undefined && v !== null) q.append(k, String(v));
      });
      var s = q.toString();
      search = s ? '?' + s : '';
    }
    var h = hash === undefined || hash === null ? window.location.hash : (hash ? '#' + String(hash).replace(/^#/, '') : '');
    return window.location.pathname + search + h;
  }

  var changeHandler = null;
  window.addEventListener('popstate', function (ev) {
    if (changeHandler) changeHandler({ state: ev.state, location: currentLocation() });
  });

  var noop = function () {};
  window.google = {
    script: {
      run: makeRunner({ ok: null, fail: null, user: undefined }),
      host: { close: noop, setHeight: noop, setWidth: noop, editor: { focus: noop }, origin: window.location.origin },
      url: { getLocation: function (cb) { if (cb) cb(currentLocation()); } },
      history: {
        push: function (state, params, hash) { window.history.pushState(state === undefined ? null : state, '', buildUrl(params, hash)); },
        replace: function (state, params, hash) { window.history.replaceState(state === undefined ? null : state, '', buildUrl(params, hash)); },
        setChangeHandler: function (fn) { changeHandler = typeof fn === 'function' ? fn : null; }
      }
    }
  };
})();`;

/** JS-safe, HTML-safe string literal: no `<` (so no `</script>`), no line terminators, ASCII only. */
function jsStringLiteral(value: string): string {
  return JSON.stringify(value).replace(/[<>]|[^\x20-\x7e]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** The shim's JavaScript source for the given web app. Pure ASCII, so it is safe in any encoding. */
export function buildRunShim(execUrl: string): string {
  assertExecUrl(execUrl);
  const src = SHIM_SOURCE.replace(URL_PLACEHOLDER, jsStringLiteral(execUrl))
    .replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  // A "<" in the source could only come from an edit above; a `</script>` or `<!--` would cut the page.
  if (/<\/|<!--/.test(src)) throw new Error("run shim source must not contain </ or <!--");
  return src;
}

/** `<script>` tag ready to inline before the page's own scripts. */
export function runShimScriptTag(execUrl: string): string {
  return `<script data-egs-run-shim>\n${buildRunShim(execUrl)}\n</script>`;
}
