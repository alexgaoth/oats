//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, a) => (a = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule ? t(a, "default", {
	value: n,
	enumerable: !0
}) : a, n)), l = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), i = Symbol.for("react.strict_mode"), a = Symbol.for("react.profiler"), o = Symbol.for("react.consumer"), s = Symbol.for("react.context"), c = Symbol.for("react.forward_ref"), l = Symbol.for("react.suspense"), u = Symbol.for("react.memo"), d = Symbol.for("react.lazy"), f = Symbol.for("react.activity"), p = Symbol.iterator;
	function m(e) {
		return typeof e != "object" || !e ? null : (e = p && e[p] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var h = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	}, g = Object.assign, _ = {};
	function v(e, t, n) {
		this.props = e, this.context = t, this.refs = _, this.updater = n || h;
	}
	v.prototype.isReactComponent = {}, v.prototype.setState = function(e, t) {
		if (typeof e != "object" && typeof e != "function" && e != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, e, t, "setState");
	}, v.prototype.forceUpdate = function(e) {
		this.updater.enqueueForceUpdate(this, e, "forceUpdate");
	};
	function y() {}
	y.prototype = v.prototype;
	function b(e, t, n) {
		this.props = e, this.context = t, this.refs = _, this.updater = n || h;
	}
	var x = b.prototype = new y();
	x.constructor = b, g(x, v.prototype), x.isPureReactComponent = !0;
	var S = Array.isArray;
	function C() {}
	var w = {
		H: null,
		A: null,
		T: null,
		S: null
	}, T = Object.prototype.hasOwnProperty;
	function E(e, n, r) {
		var i = r.ref;
		return {
			$$typeof: t,
			type: e,
			key: n,
			ref: i === void 0 ? null : i,
			props: r
		};
	}
	function ee(e, t) {
		return E(e.type, t, e.props);
	}
	function D(e) {
		return typeof e == "object" && !!e && e.$$typeof === t;
	}
	function te(e) {
		var t = {
			"=": "=0",
			":": "=2"
		};
		return "$" + e.replace(/[=:]/g, function(e) {
			return t[e];
		});
	}
	var ne = /\/+/g;
	function re(e, t) {
		return typeof e == "object" && e && e.key != null ? te("" + e.key) : t.toString(36);
	}
	function O(e) {
		switch (e.status) {
			case "fulfilled": return e.value;
			case "rejected": throw e.reason;
			default: switch (typeof e.status == "string" ? e.then(C, C) : (e.status = "pending", e.then(function(t) {
				e.status === "pending" && (e.status = "fulfilled", e.value = t);
			}, function(t) {
				e.status === "pending" && (e.status = "rejected", e.reason = t);
			})), e.status) {
				case "fulfilled": return e.value;
				case "rejected": throw e.reason;
			}
		}
		throw e;
	}
	function ie(e, r, i, a, o) {
		var s = typeof e;
		(s === "undefined" || s === "boolean") && (e = null);
		var c = !1;
		if (e === null) c = !0;
		else switch (s) {
			case "bigint":
			case "string":
			case "number":
				c = !0;
				break;
			case "object": switch (e.$$typeof) {
				case t:
				case n:
					c = !0;
					break;
				case d: return c = e._init, ie(c(e._payload), r, i, a, o);
			}
		}
		if (c) return o = o(e), c = a === "" ? "." + re(e, 0) : a, S(o) ? (i = "", c != null && (i = c.replace(ne, "$&/") + "/"), ie(o, r, i, "", function(e) {
			return e;
		})) : o != null && (D(o) && (o = ee(o, i + (o.key == null || e && e.key === o.key ? "" : ("" + o.key).replace(ne, "$&/") + "/") + c)), r.push(o)), 1;
		c = 0;
		var l = a === "" ? "." : a + ":";
		if (S(e)) for (var u = 0; u < e.length; u++) a = e[u], s = l + re(a, u), c += ie(a, r, i, s, o);
		else if (u = m(e), typeof u == "function") for (e = u.call(e), u = 0; !(a = e.next()).done;) a = a.value, s = l + re(a, u++), c += ie(a, r, i, s, o);
		else if (s === "object") {
			if (typeof e.then == "function") return ie(O(e), r, i, a, o);
			throw r = String(e), Error("Objects are not valid as a React child (found: " + (r === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : r) + "). If you meant to render a collection of children, use an array instead.");
		}
		return c;
	}
	function ae(e, t, n) {
		if (e == null) return e;
		var r = [], i = 0;
		return ie(e, r, "", "", function(e) {
			return t.call(n, e, i++);
		}), r;
	}
	function oe(e) {
		if (e._status === -1) {
			var t = e._result;
			t = t(), t.then(function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 1, e._result = t);
			}, function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 2, e._result = t);
			}), e._status === -1 && (e._status = 0, e._result = t);
		}
		if (e._status === 1) return e._result.default;
		throw e._result;
	}
	var k = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, A = {
		map: ae,
		forEach: function(e, t, n) {
			ae(e, function() {
				t.apply(this, arguments);
			}, n);
		},
		count: function(e) {
			var t = 0;
			return ae(e, function() {
				t++;
			}), t;
		},
		toArray: function(e) {
			return ae(e, function(e) {
				return e;
			}) || [];
		},
		only: function(e) {
			if (!D(e)) throw Error("React.Children.only expected to receive a single React element child.");
			return e;
		}
	};
	e.Activity = f, e.Children = A, e.Component = v, e.Fragment = r, e.Profiler = a, e.PureComponent = b, e.StrictMode = i, e.Suspense = l, e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = w, e.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(e) {
			return w.H.useMemoCache(e);
		}
	}, e.cache = function(e) {
		return function() {
			return e.apply(null, arguments);
		};
	}, e.cacheSignal = function() {
		return null;
	}, e.cloneElement = function(e, t, n) {
		if (e == null) throw Error("The argument must be a React element, but you passed " + e + ".");
		var r = g({}, e.props), i = e.key;
		if (t != null) for (a in t.key !== void 0 && (i = "" + t.key), t) !T.call(t, a) || a === "key" || a === "__self" || a === "__source" || a === "ref" && t.ref === void 0 || (r[a] = t[a]);
		var a = arguments.length - 2;
		if (a === 1) r.children = n;
		else if (1 < a) {
			for (var o = Array(a), s = 0; s < a; s++) o[s] = arguments[s + 2];
			r.children = o;
		}
		return E(e.type, i, r);
	}, e.createContext = function(e) {
		return e = {
			$$typeof: s,
			_currentValue: e,
			_currentValue2: e,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		}, e.Provider = e, e.Consumer = {
			$$typeof: o,
			_context: e
		}, e;
	}, e.createElement = function(e, t, n) {
		var r, i = {}, a = null;
		if (t != null) for (r in t.key !== void 0 && (a = "" + t.key), t) T.call(t, r) && r !== "key" && r !== "__self" && r !== "__source" && (i[r] = t[r]);
		var o = arguments.length - 2;
		if (o === 1) i.children = n;
		else if (1 < o) {
			for (var s = Array(o), c = 0; c < o; c++) s[c] = arguments[c + 2];
			i.children = s;
		}
		if (e && e.defaultProps) for (r in o = e.defaultProps, o) i[r] === void 0 && (i[r] = o[r]);
		return E(e, a, i);
	}, e.createRef = function() {
		return { current: null };
	}, e.forwardRef = function(e) {
		return {
			$$typeof: c,
			render: e
		};
	}, e.isValidElement = D, e.lazy = function(e) {
		return {
			$$typeof: d,
			_payload: {
				_status: -1,
				_result: e
			},
			_init: oe
		};
	}, e.memo = function(e, t) {
		return {
			$$typeof: u,
			type: e,
			compare: t === void 0 ? null : t
		};
	}, e.startTransition = function(e) {
		var t = w.T, n = {};
		w.T = n;
		try {
			var r = e(), i = w.S;
			i !== null && i(n, r), typeof r == "object" && r && typeof r.then == "function" && r.then(C, k);
		} catch (e) {
			k(e);
		} finally {
			t !== null && n.types !== null && (t.types = n.types), w.T = t;
		}
	}, e.unstable_useCacheRefresh = function() {
		return w.H.useCacheRefresh();
	}, e.use = function(e) {
		return w.H.use(e);
	}, e.useActionState = function(e, t, n) {
		return w.H.useActionState(e, t, n);
	}, e.useCallback = function(e, t) {
		return w.H.useCallback(e, t);
	}, e.useContext = function(e) {
		return w.H.useContext(e);
	}, e.useDebugValue = function() {}, e.useDeferredValue = function(e, t) {
		return w.H.useDeferredValue(e, t);
	}, e.useEffect = function(e, t) {
		return w.H.useEffect(e, t);
	}, e.useEffectEvent = function(e) {
		return w.H.useEffectEvent(e);
	}, e.useId = function() {
		return w.H.useId();
	}, e.useImperativeHandle = function(e, t, n) {
		return w.H.useImperativeHandle(e, t, n);
	}, e.useInsertionEffect = function(e, t) {
		return w.H.useInsertionEffect(e, t);
	}, e.useLayoutEffect = function(e, t) {
		return w.H.useLayoutEffect(e, t);
	}, e.useMemo = function(e, t) {
		return w.H.useMemo(e, t);
	}, e.useOptimistic = function(e, t) {
		return w.H.useOptimistic(e, t);
	}, e.useReducer = function(e, t, n) {
		return w.H.useReducer(e, t, n);
	}, e.useRef = function(e) {
		return w.H.useRef(e);
	}, e.useState = function(e) {
		return w.H.useState(e);
	}, e.useSyncExternalStore = function(e, t, n) {
		return w.H.useSyncExternalStore(e, t, n);
	}, e.useTransition = function() {
		return w.H.useTransition();
	}, e.version = "19.2.7";
})), u = /* @__PURE__ */ o(((e, t) => {
	t.exports = l();
})), d = /* @__PURE__ */ o(((e) => {
	function t(e, t) {
		var n = e.length;
		e.push(t);
		a: for (; 0 < n;) {
			var r = n - 1 >>> 1, a = e[r];
			if (0 < i(a, t)) e[r] = t, e[n] = a, n = r;
			else break a;
		}
	}
	function n(e) {
		return e.length === 0 ? null : e[0];
	}
	function r(e) {
		if (e.length === 0) return null;
		var t = e[0], n = e.pop();
		if (n !== t) {
			e[0] = n;
			a: for (var r = 0, a = e.length, o = a >>> 1; r < o;) {
				var s = 2 * (r + 1) - 1, c = e[s], l = s + 1, u = e[l];
				if (0 > i(c, n)) l < a && 0 > i(u, c) ? (e[r] = u, e[l] = n, r = l) : (e[r] = c, e[s] = n, r = s);
				else if (l < a && 0 > i(u, n)) e[r] = u, e[l] = n, r = l;
				else break a;
			}
		}
		return t;
	}
	function i(e, t) {
		var n = e.sortIndex - t.sortIndex;
		return n === 0 ? e.id - t.id : n;
	}
	if (e.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
		var a = performance;
		e.unstable_now = function() {
			return a.now();
		};
	} else {
		var o = Date, s = o.now();
		e.unstable_now = function() {
			return o.now() - s;
		};
	}
	var c = [], l = [], u = 1, d = null, f = 3, p = !1, m = !1, h = !1, g = !1, _ = typeof setTimeout == "function" ? setTimeout : null, v = typeof clearTimeout == "function" ? clearTimeout : null, y = typeof setImmediate < "u" ? setImmediate : null;
	function b(e) {
		for (var i = n(l); i !== null;) {
			if (i.callback === null) r(l);
			else if (i.startTime <= e) r(l), i.sortIndex = i.expirationTime, t(c, i);
			else break;
			i = n(l);
		}
	}
	function x(e) {
		if (h = !1, b(e), !m) if (n(c) !== null) m = !0, S || (S = !0, D());
		else {
			var t = n(l);
			t !== null && re(x, t.startTime - e);
		}
	}
	var S = !1, C = -1, w = 5, T = -1;
	function E() {
		return g ? !0 : !(e.unstable_now() - T < w);
	}
	function ee() {
		if (g = !1, S) {
			var t = e.unstable_now();
			T = t;
			var i = !0;
			try {
				a: {
					m = !1, h && (h = !1, v(C), C = -1), p = !0;
					var a = f;
					try {
						b: {
							for (b(t), d = n(c); d !== null && !(d.expirationTime > t && E());) {
								var o = d.callback;
								if (typeof o == "function") {
									d.callback = null, f = d.priorityLevel;
									var s = o(d.expirationTime <= t);
									if (t = e.unstable_now(), typeof s == "function") {
										d.callback = s, b(t), i = !0;
										break b;
									}
									d === n(c) && r(c), b(t);
								} else r(c);
								d = n(c);
							}
							if (d !== null) i = !0;
							else {
								var u = n(l);
								u !== null && re(x, u.startTime - t), i = !1;
							}
						}
						break a;
					} finally {
						d = null, f = a, p = !1;
					}
					i = void 0;
				}
			} finally {
				i ? D() : S = !1;
			}
		}
	}
	var D;
	if (typeof y == "function") D = function() {
		y(ee);
	};
	else if (typeof MessageChannel < "u") {
		var te = new MessageChannel(), ne = te.port2;
		te.port1.onmessage = ee, D = function() {
			ne.postMessage(null);
		};
	} else D = function() {
		_(ee, 0);
	};
	function re(t, n) {
		C = _(function() {
			t(e.unstable_now());
		}, n);
	}
	e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(e) {
		e.callback = null;
	}, e.unstable_forceFrameRate = function(e) {
		0 > e || 125 < e ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : w = 0 < e ? Math.floor(1e3 / e) : 5;
	}, e.unstable_getCurrentPriorityLevel = function() {
		return f;
	}, e.unstable_next = function(e) {
		switch (f) {
			case 1:
			case 2:
			case 3:
				var t = 3;
				break;
			default: t = f;
		}
		var n = f;
		f = t;
		try {
			return e();
		} finally {
			f = n;
		}
	}, e.unstable_requestPaint = function() {
		g = !0;
	}, e.unstable_runWithPriority = function(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 3:
			case 4:
			case 5: break;
			default: e = 3;
		}
		var n = f;
		f = e;
		try {
			return t();
		} finally {
			f = n;
		}
	}, e.unstable_scheduleCallback = function(r, i, a) {
		var o = e.unstable_now();
		switch (typeof a == "object" && a ? (a = a.delay, a = typeof a == "number" && 0 < a ? o + a : o) : a = o, r) {
			case 1:
				var s = -1;
				break;
			case 2:
				s = 250;
				break;
			case 5:
				s = 1073741823;
				break;
			case 4:
				s = 1e4;
				break;
			default: s = 5e3;
		}
		return s = a + s, r = {
			id: u++,
			callback: i,
			priorityLevel: r,
			startTime: a,
			expirationTime: s,
			sortIndex: -1
		}, a > o ? (r.sortIndex = a, t(l, r), n(c) === null && r === n(l) && (h ? (v(C), C = -1) : h = !0, re(x, a - o))) : (r.sortIndex = s, t(c, r), m || p || (m = !0, S || (S = !0, D()))), r;
	}, e.unstable_shouldYield = E, e.unstable_wrapCallback = function(e) {
		var t = f;
		return function() {
			var n = f;
			f = t;
			try {
				return e.apply(this, arguments);
			} finally {
				f = n;
			}
		};
	};
})), f = /* @__PURE__ */ o(((e, t) => {
	t.exports = d();
})), p = /* @__PURE__ */ o(((e) => {
	var t = u();
	function n(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function r() {}
	var i = {
		d: {
			f: r,
			r: function() {
				throw Error(n(522));
			},
			D: r,
			C: r,
			L: r,
			m: r,
			X: r,
			S: r,
			M: r
		},
		p: 0,
		findDOMNode: null
	}, a = Symbol.for("react.portal");
	function o(e, t, n) {
		var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
		return {
			$$typeof: a,
			key: r == null ? null : "" + r,
			children: e,
			containerInfo: t,
			implementation: n
		};
	}
	var s = t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function c(e, t) {
		if (e === "font") return "";
		if (typeof t == "string") return t === "use-credentials" ? t : "";
	}
	e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, e.createPortal = function(e, t) {
		var r = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
		if (!t || t.nodeType !== 1 && t.nodeType !== 9 && t.nodeType !== 11) throw Error(n(299));
		return o(e, t, null, r);
	}, e.flushSync = function(e) {
		var t = s.T, n = i.p;
		try {
			if (s.T = null, i.p = 2, e) return e();
		} finally {
			s.T = t, i.p = n, i.d.f();
		}
	}, e.preconnect = function(e, t) {
		typeof e == "string" && (t ? (t = t.crossOrigin, t = typeof t == "string" ? t === "use-credentials" ? t : "" : void 0) : t = null, i.d.C(e, t));
	}, e.prefetchDNS = function(e) {
		typeof e == "string" && i.d.D(e);
	}, e.preinit = function(e, t) {
		if (typeof e == "string" && t && typeof t.as == "string") {
			var n = t.as, r = c(n, t.crossOrigin), a = typeof t.integrity == "string" ? t.integrity : void 0, o = typeof t.fetchPriority == "string" ? t.fetchPriority : void 0;
			n === "style" ? i.d.S(e, typeof t.precedence == "string" ? t.precedence : void 0, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o
			}) : n === "script" && i.d.X(e, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0
			});
		}
	}, e.preinitModule = function(e, t) {
		if (typeof e == "string") if (typeof t == "object" && t) {
			if (t.as == null || t.as === "script") {
				var n = c(t.as, t.crossOrigin);
				i.d.M(e, {
					crossOrigin: n,
					integrity: typeof t.integrity == "string" ? t.integrity : void 0,
					nonce: typeof t.nonce == "string" ? t.nonce : void 0
				});
			}
		} else t ?? i.d.M(e);
	}, e.preload = function(e, t) {
		if (typeof e == "string" && typeof t == "object" && t && typeof t.as == "string") {
			var n = t.as, r = c(n, t.crossOrigin);
			i.d.L(e, n, {
				crossOrigin: r,
				integrity: typeof t.integrity == "string" ? t.integrity : void 0,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0,
				type: typeof t.type == "string" ? t.type : void 0,
				fetchPriority: typeof t.fetchPriority == "string" ? t.fetchPriority : void 0,
				referrerPolicy: typeof t.referrerPolicy == "string" ? t.referrerPolicy : void 0,
				imageSrcSet: typeof t.imageSrcSet == "string" ? t.imageSrcSet : void 0,
				imageSizes: typeof t.imageSizes == "string" ? t.imageSizes : void 0,
				media: typeof t.media == "string" ? t.media : void 0
			});
		}
	}, e.preloadModule = function(e, t) {
		if (typeof e == "string") if (t) {
			var n = c(t.as, t.crossOrigin);
			i.d.m(e, {
				as: typeof t.as == "string" && t.as !== "script" ? t.as : void 0,
				crossOrigin: n,
				integrity: typeof t.integrity == "string" ? t.integrity : void 0
			});
		} else i.d.m(e);
	}, e.requestFormReset = function(e) {
		i.d.r(e);
	}, e.unstable_batchedUpdates = function(e, t) {
		return e(t);
	}, e.useFormState = function(e, t, n) {
		return s.H.useFormState(e, t, n);
	}, e.useFormStatus = function() {
		return s.H.useHostTransitionStatus();
	}, e.version = "19.2.7";
})), m = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = p();
})), h = /* @__PURE__ */ o(((e) => {
	var t = f(), n = u(), r = m();
	function i(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function a(e) {
		return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
	}
	function o(e) {
		var t = e, n = e;
		if (e.alternate) for (; t.return;) t = t.return;
		else {
			e = t;
			do
				t = e, t.flags & 4098 && (n = t.return), e = t.return;
			while (e);
		}
		return t.tag === 3 ? n : null;
	}
	function s(e) {
		if (e.tag === 13) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function c(e) {
		if (e.tag === 31) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function l(e) {
		if (o(e) !== e) throw Error(i(188));
	}
	function d(e) {
		var t = e.alternate;
		if (!t) {
			if (t = o(e), t === null) throw Error(i(188));
			return t === e ? e : null;
		}
		for (var n = e, r = t;;) {
			var a = n.return;
			if (a === null) break;
			var s = a.alternate;
			if (s === null) {
				if (r = a.return, r !== null) {
					n = r;
					continue;
				}
				break;
			}
			if (a.child === s.child) {
				for (s = a.child; s;) {
					if (s === n) return l(a), e;
					if (s === r) return l(a), t;
					s = s.sibling;
				}
				throw Error(i(188));
			}
			if (n.return !== r.return) n = a, r = s;
			else {
				for (var c = !1, u = a.child; u;) {
					if (u === n) {
						c = !0, n = a, r = s;
						break;
					}
					if (u === r) {
						c = !0, r = a, n = s;
						break;
					}
					u = u.sibling;
				}
				if (!c) {
					for (u = s.child; u;) {
						if (u === n) {
							c = !0, n = s, r = a;
							break;
						}
						if (u === r) {
							c = !0, r = s, n = a;
							break;
						}
						u = u.sibling;
					}
					if (!c) throw Error(i(189));
				}
			}
			if (n.alternate !== r) throw Error(i(190));
		}
		if (n.tag !== 3) throw Error(i(188));
		return n.stateNode.current === n ? e : t;
	}
	function p(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e;
		for (e = e.child; e !== null;) {
			if (t = p(e), t !== null) return t;
			e = e.sibling;
		}
		return null;
	}
	var h = Object.assign, g = Symbol.for("react.element"), _ = Symbol.for("react.transitional.element"), v = Symbol.for("react.portal"), y = Symbol.for("react.fragment"), b = Symbol.for("react.strict_mode"), x = Symbol.for("react.profiler"), S = Symbol.for("react.consumer"), C = Symbol.for("react.context"), w = Symbol.for("react.forward_ref"), T = Symbol.for("react.suspense"), E = Symbol.for("react.suspense_list"), ee = Symbol.for("react.memo"), D = Symbol.for("react.lazy"), te = Symbol.for("react.activity"), ne = Symbol.for("react.memo_cache_sentinel"), re = Symbol.iterator;
	function O(e) {
		return typeof e != "object" || !e ? null : (e = re && e[re] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var ie = Symbol.for("react.client.reference");
	function ae(e) {
		if (e == null) return null;
		if (typeof e == "function") return e.$$typeof === ie ? null : e.displayName || e.name || null;
		if (typeof e == "string") return e;
		switch (e) {
			case y: return "Fragment";
			case x: return "Profiler";
			case b: return "StrictMode";
			case T: return "Suspense";
			case E: return "SuspenseList";
			case te: return "Activity";
		}
		if (typeof e == "object") switch (e.$$typeof) {
			case v: return "Portal";
			case C: return e.displayName || "Context";
			case S: return (e._context.displayName || "Context") + ".Consumer";
			case w:
				var t = e.render;
				return e = e.displayName, e ||= (e = t.displayName || t.name || "", e === "" ? "ForwardRef" : "ForwardRef(" + e + ")"), e;
			case ee: return t = e.displayName || null, t === null ? ae(e.type) || "Memo" : t;
			case D:
				t = e._payload, e = e._init;
				try {
					return ae(e(t));
				} catch {}
		}
		return null;
	}
	var oe = Array.isArray, k = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, A = r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, se = {
		pending: !1,
		data: null,
		method: null,
		action: null
	}, ce = [], le = -1;
	function j(e) {
		return { current: e };
	}
	function M(e) {
		0 > le || (e.current = ce[le], ce[le] = null, le--);
	}
	function N(e, t) {
		le++, ce[le] = e.current, e.current = t;
	}
	var ue = j(null), P = j(null), de = j(null), fe = j(null);
	function pe(e, t) {
		switch (N(de, t), N(P, e), N(ue, null), t.nodeType) {
			case 9:
			case 11:
				e = (e = t.documentElement) && (e = e.namespaceURI) ? Vd(e) : 0;
				break;
			default: if (e = t.tagName, t = t.namespaceURI) t = Vd(t), e = Hd(t, e);
			else switch (e) {
				case "svg":
					e = 1;
					break;
				case "math":
					e = 2;
					break;
				default: e = 0;
			}
		}
		M(ue), N(ue, e);
	}
	function me() {
		M(ue), M(P), M(de);
	}
	function he(e) {
		e.memoizedState !== null && N(fe, e);
		var t = ue.current, n = Hd(t, e.type);
		t !== n && (N(P, e), N(ue, n));
	}
	function ge(e) {
		P.current === e && (M(ue), M(P)), fe.current === e && (M(fe), Qf._currentValue = se);
	}
	var _e, ve;
	function ye(e) {
		if (_e === void 0) try {
			throw Error();
		} catch (e) {
			var t = e.stack.trim().match(/\n( *(at )?)/);
			_e = t && t[1] || "", ve = -1 < e.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
		}
		return "\n" + _e + e + ve;
	}
	var be = !1;
	function xe(e, t) {
		if (!e || be) return "";
		be = !0;
		var n = Error.prepareStackTrace;
		Error.prepareStackTrace = void 0;
		try {
			var r = { DetermineComponentFrameRoot: function() {
				try {
					if (t) {
						var n = function() {
							throw Error();
						};
						if (Object.defineProperty(n.prototype, "props", { set: function() {
							throw Error();
						} }), typeof Reflect == "object" && Reflect.construct) {
							try {
								Reflect.construct(n, []);
							} catch (e) {
								var r = e;
							}
							Reflect.construct(e, [], n);
						} else {
							try {
								n.call();
							} catch (e) {
								r = e;
							}
							e.call(n.prototype);
						}
					} else {
						try {
							throw Error();
						} catch (e) {
							r = e;
						}
						(n = e()) && typeof n.catch == "function" && n.catch(function() {});
					}
				} catch (e) {
					if (e && r && typeof e.stack == "string") return [e.stack, r.stack];
				}
				return [null, null];
			} };
			r.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
			var i = Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot, "name");
			i && i.configurable && Object.defineProperty(r.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
			var a = r.DetermineComponentFrameRoot(), o = a[0], s = a[1];
			if (o && s) {
				var c = o.split("\n"), l = s.split("\n");
				for (i = r = 0; r < c.length && !c[r].includes("DetermineComponentFrameRoot");) r++;
				for (; i < l.length && !l[i].includes("DetermineComponentFrameRoot");) i++;
				if (r === c.length || i === l.length) for (r = c.length - 1, i = l.length - 1; 1 <= r && 0 <= i && c[r] !== l[i];) i--;
				for (; 1 <= r && 0 <= i; r--, i--) if (c[r] !== l[i]) {
					if (r !== 1 || i !== 1) do
						if (r--, i--, 0 > i || c[r] !== l[i]) {
							var u = "\n" + c[r].replace(" at new ", " at ");
							return e.displayName && u.includes("<anonymous>") && (u = u.replace("<anonymous>", e.displayName)), u;
						}
					while (1 <= r && 0 <= i);
					break;
				}
			}
		} finally {
			be = !1, Error.prepareStackTrace = n;
		}
		return (n = e ? e.displayName || e.name : "") ? ye(n) : "";
	}
	function Se(e, t) {
		switch (e.tag) {
			case 26:
			case 27:
			case 5: return ye(e.type);
			case 16: return ye("Lazy");
			case 13: return e.child !== t && t !== null ? ye("Suspense Fallback") : ye("Suspense");
			case 19: return ye("SuspenseList");
			case 0:
			case 15: return xe(e.type, !1);
			case 11: return xe(e.type.render, !1);
			case 1: return xe(e.type, !0);
			case 31: return ye("Activity");
			default: return "";
		}
	}
	function Ce(e) {
		try {
			var t = "", n = null;
			do
				t += Se(e, n), n = e, e = e.return;
			while (e);
			return t;
		} catch (e) {
			return "\nError generating stack: " + e.message + "\n" + e.stack;
		}
	}
	var we = Object.prototype.hasOwnProperty, Te = t.unstable_scheduleCallback, Ee = t.unstable_cancelCallback, De = t.unstable_shouldYield, Oe = t.unstable_requestPaint, ke = t.unstable_now, Ae = t.unstable_getCurrentPriorityLevel, je = t.unstable_ImmediatePriority, Me = t.unstable_UserBlockingPriority, Ne = t.unstable_NormalPriority, Pe = t.unstable_LowPriority, Fe = t.unstable_IdlePriority, Ie = t.log, Le = t.unstable_setDisableYieldValue, Re = null, ze = null;
	function Be(e) {
		if (typeof Ie == "function" && Le(e), ze && typeof ze.setStrictMode == "function") try {
			ze.setStrictMode(Re, e);
		} catch {}
	}
	var Ve = Math.clz32 ? Math.clz32 : We, He = Math.log, Ue = Math.LN2;
	function We(e) {
		return e >>>= 0, e === 0 ? 32 : 31 - (He(e) / Ue | 0) | 0;
	}
	var Ge = 256, Ke = 262144, qe = 4194304;
	function Je(e) {
		var t = e & 42;
		if (t !== 0) return t;
		switch (e & -e) {
			case 1: return 1;
			case 2: return 2;
			case 4: return 4;
			case 8: return 8;
			case 16: return 16;
			case 32: return 32;
			case 64: return 64;
			case 128: return 128;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072: return e & 261888;
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return e & 3932160;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return e & 62914560;
			case 67108864: return 67108864;
			case 134217728: return 134217728;
			case 268435456: return 268435456;
			case 536870912: return 536870912;
			case 1073741824: return 0;
			default: return e;
		}
	}
	function Ye(e, t, n) {
		var r = e.pendingLanes;
		if (r === 0) return 0;
		var i = 0, a = e.suspendedLanes, o = e.pingedLanes;
		e = e.warmLanes;
		var s = r & 134217727;
		return s === 0 ? (s = r & ~a, s === 0 ? o === 0 ? n || (n = r & ~e, n !== 0 && (i = Je(n))) : i = Je(o) : i = Je(s)) : (r = s & ~a, r === 0 ? (o &= s, o === 0 ? n || (n = s & ~e, n !== 0 && (i = Je(n))) : i = Je(o)) : i = Je(r)), i === 0 ? 0 : t !== 0 && t !== i && (t & a) === 0 && (a = i & -i, n = t & -t, a >= n || a === 32 && n & 4194048) ? t : i;
	}
	function Xe(e, t) {
		return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
	}
	function Ze(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 4:
			case 8:
			case 64: return t + 250;
			case 16:
			case 32:
			case 128:
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return t + 5e3;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return -1;
			case 67108864:
			case 134217728:
			case 268435456:
			case 536870912:
			case 1073741824: return -1;
			default: return -1;
		}
	}
	function Qe() {
		var e = qe;
		return qe <<= 1, !(qe & 62914560) && (qe = 4194304), e;
	}
	function $e(e) {
		for (var t = [], n = 0; 31 > n; n++) t.push(e);
		return t;
	}
	function et(e, t) {
		e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
	}
	function tt(e, t, n, r, i, a) {
		var o = e.pendingLanes;
		e.pendingLanes = n, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= n, e.entangledLanes &= n, e.errorRecoveryDisabledLanes &= n, e.shellSuspendCounter = 0;
		var s = e.entanglements, c = e.expirationTimes, l = e.hiddenUpdates;
		for (n = o & ~n; 0 < n;) {
			var u = 31 - Ve(n), d = 1 << u;
			s[u] = 0, c[u] = -1;
			var f = l[u];
			if (f !== null) for (l[u] = null, u = 0; u < f.length; u++) {
				var p = f[u];
				p !== null && (p.lane &= -536870913);
			}
			n &= ~d;
		}
		r !== 0 && nt(e, r, 0), a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t));
	}
	function nt(e, t, n) {
		e.pendingLanes |= t, e.suspendedLanes &= ~t;
		var r = 31 - Ve(t);
		e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | n & 261930;
	}
	function rt(e, t) {
		var n = e.entangledLanes |= t;
		for (e = e.entanglements; n;) {
			var r = 31 - Ve(n), i = 1 << r;
			i & t | e[r] & t && (e[r] |= t), n &= ~i;
		}
	}
	function it(e, t) {
		var n = t & -t;
		return n = n & 42 ? 1 : at(n), (n & (e.suspendedLanes | t)) === 0 ? n : 0;
	}
	function at(e) {
		switch (e) {
			case 2:
				e = 1;
				break;
			case 8:
				e = 4;
				break;
			case 32:
				e = 16;
				break;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				e = 128;
				break;
			case 268435456:
				e = 134217728;
				break;
			default: e = 0;
		}
		return e;
	}
	function ot(e) {
		return e &= -e, 2 < e ? 8 < e ? e & 134217727 ? 32 : 268435456 : 8 : 2;
	}
	function st() {
		var e = A.p;
		return e === 0 ? (e = window.event, e === void 0 ? 32 : mp(e.type)) : e;
	}
	function ct(e, t) {
		var n = A.p;
		try {
			return A.p = e, t();
		} finally {
			A.p = n;
		}
	}
	var lt = Math.random().toString(36).slice(2), ut = "__reactFiber$" + lt, dt = "__reactProps$" + lt, ft = "__reactContainer$" + lt, pt = "__reactEvents$" + lt, mt = "__reactListeners$" + lt, ht = "__reactHandles$" + lt, gt = "__reactResources$" + lt, _t = "__reactMarker$" + lt;
	function vt(e) {
		delete e[ut], delete e[dt], delete e[pt], delete e[mt], delete e[ht];
	}
	function yt(e) {
		var t = e[ut];
		if (t) return t;
		for (var n = e.parentNode; n;) {
			if (t = n[ft] || n[ut]) {
				if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = df(e); e !== null;) {
					if (n = e[ut]) return n;
					e = df(e);
				}
				return t;
			}
			e = n, n = e.parentNode;
		}
		return null;
	}
	function bt(e) {
		if (e = e[ut] || e[ft]) {
			var t = e.tag;
			if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
		}
		return null;
	}
	function xt(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
		throw Error(i(33));
	}
	function St(e) {
		var t = e[gt];
		return t ||= e[gt] = {
			hoistableStyles: /* @__PURE__ */ new Map(),
			hoistableScripts: /* @__PURE__ */ new Map()
		}, t;
	}
	function Ct(e) {
		e[_t] = !0;
	}
	var wt = /* @__PURE__ */ new Set(), Tt = {};
	function Et(e, t) {
		Dt(e, t), Dt(e + "Capture", t);
	}
	function Dt(e, t) {
		for (Tt[e] = t, e = 0; e < t.length; e++) wt.add(t[e]);
	}
	var Ot = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), kt = {}, At = {};
	function jt(e) {
		return we.call(At, e) ? !0 : we.call(kt, e) ? !1 : Ot.test(e) ? At[e] = !0 : (kt[e] = !0, !1);
	}
	function Mt(e, t, n) {
		if (jt(t)) if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case "undefined":
				case "function":
				case "symbol":
					e.removeAttribute(t);
					return;
				case "boolean":
					var r = t.toLowerCase().slice(0, 5);
					if (r !== "data-" && r !== "aria-") {
						e.removeAttribute(t);
						return;
					}
			}
			e.setAttribute(t, "" + n);
		}
	}
	function Nt(e, t, n) {
		if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(t);
					return;
			}
			e.setAttribute(t, "" + n);
		}
	}
	function Pt(e, t, n, r) {
		if (r === null) e.removeAttribute(n);
		else {
			switch (typeof r) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(n);
					return;
			}
			e.setAttributeNS(t, n, "" + r);
		}
	}
	function Ft(e) {
		switch (typeof e) {
			case "bigint":
			case "boolean":
			case "number":
			case "string":
			case "undefined": return e;
			case "object": return e;
			default: return "";
		}
	}
	function It(e) {
		var t = e.type;
		return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
	}
	function Lt(e, t, n) {
		var r = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
		if (!e.hasOwnProperty(t) && r !== void 0 && typeof r.get == "function" && typeof r.set == "function") {
			var i = r.get, a = r.set;
			return Object.defineProperty(e, t, {
				configurable: !0,
				get: function() {
					return i.call(this);
				},
				set: function(e) {
					n = "" + e, a.call(this, e);
				}
			}), Object.defineProperty(e, t, { enumerable: r.enumerable }), {
				getValue: function() {
					return n;
				},
				setValue: function(e) {
					n = "" + e;
				},
				stopTracking: function() {
					e._valueTracker = null, delete e[t];
				}
			};
		}
	}
	function Rt(e) {
		if (!e._valueTracker) {
			var t = It(e) ? "checked" : "value";
			e._valueTracker = Lt(e, t, "" + e[t]);
		}
	}
	function zt(e) {
		if (!e) return !1;
		var t = e._valueTracker;
		if (!t) return !0;
		var n = t.getValue(), r = "";
		return e && (r = It(e) ? e.checked ? "true" : "false" : e.value), e = r, e === n ? !1 : (t.setValue(e), !0);
	}
	function Bt(e) {
		if (e ||= typeof document < "u" ? document : void 0, e === void 0) return null;
		try {
			return e.activeElement || e.body;
		} catch {
			return e.body;
		}
	}
	var Vt = /[\n"\\]/g;
	function Ht(e) {
		return e.replace(Vt, function(e) {
			return "\\" + e.charCodeAt(0).toString(16) + " ";
		});
	}
	function Ut(e, t, n, r, i, a, o, s) {
		e.name = "", o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" ? e.type = o : e.removeAttribute("type"), t == null ? o !== "submit" && o !== "reset" || e.removeAttribute("value") : o === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Ft(t)) : e.value !== "" + Ft(t) && (e.value = "" + Ft(t)), t == null ? n == null ? r != null && e.removeAttribute("value") : Gt(e, o, Ft(n)) : Gt(e, o, Ft(t)), i == null && a != null && (e.defaultChecked = !!a), i != null && (e.checked = i && typeof i != "function" && typeof i != "symbol"), s != null && typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" ? e.name = "" + Ft(s) : e.removeAttribute("name");
	}
	function Wt(e, t, n, r, i, a, o, s) {
		if (a != null && typeof a != "function" && typeof a != "symbol" && typeof a != "boolean" && (e.type = a), t != null || n != null) {
			if (!(a !== "submit" && a !== "reset" || t != null)) {
				Rt(e);
				return;
			}
			n = n == null ? "" : "" + Ft(n), t = t == null ? n : "" + Ft(t), s || t === e.value || (e.value = t), e.defaultValue = t;
		}
		r ??= i, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = s ? e.checked : !!r, e.defaultChecked = !!r, o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" && (e.name = o), Rt(e);
	}
	function Gt(e, t, n) {
		t === "number" && Bt(e.ownerDocument) === e || e.defaultValue === "" + n || (e.defaultValue = "" + n);
	}
	function Kt(e, t, n, r) {
		if (e = e.options, t) {
			t = {};
			for (var i = 0; i < n.length; i++) t["$" + n[i]] = !0;
			for (n = 0; n < e.length; n++) i = t.hasOwnProperty("$" + e[n].value), e[n].selected !== i && (e[n].selected = i), i && r && (e[n].defaultSelected = !0);
		} else {
			for (n = "" + Ft(n), t = null, i = 0; i < e.length; i++) {
				if (e[i].value === n) {
					e[i].selected = !0, r && (e[i].defaultSelected = !0);
					return;
				}
				t !== null || e[i].disabled || (t = e[i]);
			}
			t !== null && (t.selected = !0);
		}
	}
	function qt(e, t, n) {
		if (t != null && (t = "" + Ft(t), t !== e.value && (e.value = t), n == null)) {
			e.defaultValue !== t && (e.defaultValue = t);
			return;
		}
		e.defaultValue = n == null ? "" : "" + Ft(n);
	}
	function Jt(e, t, n, r) {
		if (t == null) {
			if (r != null) {
				if (n != null) throw Error(i(92));
				if (oe(r)) {
					if (1 < r.length) throw Error(i(93));
					r = r[0];
				}
				n = r;
			}
			n ??= "", t = n;
		}
		n = Ft(t), e.defaultValue = n, r = e.textContent, r === n && r !== "" && r !== null && (e.value = r), Rt(e);
	}
	function Yt(e, t) {
		if (t) {
			var n = e.firstChild;
			if (n && n === e.lastChild && n.nodeType === 3) {
				n.nodeValue = t;
				return;
			}
		}
		e.textContent = t;
	}
	var Xt = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
	function Zt(e, t, n) {
		var r = t.indexOf("--") === 0;
		n == null || typeof n == "boolean" || n === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, n) : typeof n != "number" || n === 0 || Xt.has(t) ? t === "float" ? e.cssFloat = n : e[t] = ("" + n).trim() : e[t] = n + "px";
	}
	function Qt(e, t, n) {
		if (t != null && typeof t != "object") throw Error(i(62));
		if (e = e.style, n != null) {
			for (var r in n) !n.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
			for (var a in t) r = t[a], t.hasOwnProperty(a) && n[a] !== r && Zt(e, a, r);
		} else for (var o in t) t.hasOwnProperty(o) && Zt(e, o, t[o]);
	}
	function $t(e) {
		if (e.indexOf("-") === -1) return !1;
		switch (e) {
			case "annotation-xml":
			case "color-profile":
			case "font-face":
			case "font-face-src":
			case "font-face-uri":
			case "font-face-format":
			case "font-face-name":
			case "missing-glyph": return !1;
			default: return !0;
		}
	}
	var en = /* @__PURE__ */ new Map([
		["acceptCharset", "accept-charset"],
		["htmlFor", "for"],
		["httpEquiv", "http-equiv"],
		["crossOrigin", "crossorigin"],
		["accentHeight", "accent-height"],
		["alignmentBaseline", "alignment-baseline"],
		["arabicForm", "arabic-form"],
		["baselineShift", "baseline-shift"],
		["capHeight", "cap-height"],
		["clipPath", "clip-path"],
		["clipRule", "clip-rule"],
		["colorInterpolation", "color-interpolation"],
		["colorInterpolationFilters", "color-interpolation-filters"],
		["colorProfile", "color-profile"],
		["colorRendering", "color-rendering"],
		["dominantBaseline", "dominant-baseline"],
		["enableBackground", "enable-background"],
		["fillOpacity", "fill-opacity"],
		["fillRule", "fill-rule"],
		["floodColor", "flood-color"],
		["floodOpacity", "flood-opacity"],
		["fontFamily", "font-family"],
		["fontSize", "font-size"],
		["fontSizeAdjust", "font-size-adjust"],
		["fontStretch", "font-stretch"],
		["fontStyle", "font-style"],
		["fontVariant", "font-variant"],
		["fontWeight", "font-weight"],
		["glyphName", "glyph-name"],
		["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
		["glyphOrientationVertical", "glyph-orientation-vertical"],
		["horizAdvX", "horiz-adv-x"],
		["horizOriginX", "horiz-origin-x"],
		["imageRendering", "image-rendering"],
		["letterSpacing", "letter-spacing"],
		["lightingColor", "lighting-color"],
		["markerEnd", "marker-end"],
		["markerMid", "marker-mid"],
		["markerStart", "marker-start"],
		["overlinePosition", "overline-position"],
		["overlineThickness", "overline-thickness"],
		["paintOrder", "paint-order"],
		["panose-1", "panose-1"],
		["pointerEvents", "pointer-events"],
		["renderingIntent", "rendering-intent"],
		["shapeRendering", "shape-rendering"],
		["stopColor", "stop-color"],
		["stopOpacity", "stop-opacity"],
		["strikethroughPosition", "strikethrough-position"],
		["strikethroughThickness", "strikethrough-thickness"],
		["strokeDasharray", "stroke-dasharray"],
		["strokeDashoffset", "stroke-dashoffset"],
		["strokeLinecap", "stroke-linecap"],
		["strokeLinejoin", "stroke-linejoin"],
		["strokeMiterlimit", "stroke-miterlimit"],
		["strokeOpacity", "stroke-opacity"],
		["strokeWidth", "stroke-width"],
		["textAnchor", "text-anchor"],
		["textDecoration", "text-decoration"],
		["textRendering", "text-rendering"],
		["transformOrigin", "transform-origin"],
		["underlinePosition", "underline-position"],
		["underlineThickness", "underline-thickness"],
		["unicodeBidi", "unicode-bidi"],
		["unicodeRange", "unicode-range"],
		["unitsPerEm", "units-per-em"],
		["vAlphabetic", "v-alphabetic"],
		["vHanging", "v-hanging"],
		["vIdeographic", "v-ideographic"],
		["vMathematical", "v-mathematical"],
		["vectorEffect", "vector-effect"],
		["vertAdvY", "vert-adv-y"],
		["vertOriginX", "vert-origin-x"],
		["vertOriginY", "vert-origin-y"],
		["wordSpacing", "word-spacing"],
		["writingMode", "writing-mode"],
		["xmlnsXlink", "xmlns:xlink"],
		["xHeight", "x-height"]
	]), tn = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
	function nn(e) {
		return tn.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
	}
	function rn() {}
	var an = null;
	function on(e) {
		return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
	}
	var sn = null, cn = null;
	function ln(e) {
		var t = bt(e);
		if (t && (e = t.stateNode)) {
			var n = e[dt] || null;
			a: switch (e = t.stateNode, t.type) {
				case "input":
					if (Ut(e, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name), t = n.name, n.type === "radio" && t != null) {
						for (n = e; n.parentNode;) n = n.parentNode;
						for (n = n.querySelectorAll("input[name=\"" + Ht("" + t) + "\"][type=\"radio\"]"), t = 0; t < n.length; t++) {
							var r = n[t];
							if (r !== e && r.form === e.form) {
								var a = r[dt] || null;
								if (!a) throw Error(i(90));
								Ut(r, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name);
							}
						}
						for (t = 0; t < n.length; t++) r = n[t], r.form === e.form && zt(r);
					}
					break a;
				case "textarea":
					qt(e, n.value, n.defaultValue);
					break a;
				case "select": t = n.value, t != null && Kt(e, !!n.multiple, t, !1);
			}
		}
	}
	var un = !1;
	function dn(e, t, n) {
		if (un) return e(t, n);
		un = !0;
		try {
			return e(t);
		} finally {
			if (un = !1, (sn !== null || cn !== null) && (bu(), sn && (t = sn, e = cn, cn = sn = null, ln(t), e))) for (t = 0; t < e.length; t++) ln(e[t]);
		}
	}
	function fn(e, t) {
		var n = e.stateNode;
		if (n === null) return null;
		var r = n[dt] || null;
		if (r === null) return null;
		n = r[t];
		a: switch (t) {
			case "onClick":
			case "onClickCapture":
			case "onDoubleClick":
			case "onDoubleClickCapture":
			case "onMouseDown":
			case "onMouseDownCapture":
			case "onMouseMove":
			case "onMouseMoveCapture":
			case "onMouseUp":
			case "onMouseUpCapture":
			case "onMouseEnter":
				(r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
				break a;
			default: e = !1;
		}
		if (e) return null;
		if (n && typeof n != "function") throw Error(i(231, t, typeof n));
		return n;
	}
	var pn = !(typeof window > "u" || window.document === void 0 || window.document.createElement === void 0), mn = !1;
	if (pn) try {
		var hn = {};
		Object.defineProperty(hn, "passive", { get: function() {
			mn = !0;
		} }), window.addEventListener("test", hn, hn), window.removeEventListener("test", hn, hn);
	} catch {
		mn = !1;
	}
	var gn = null, _n = null, vn = null;
	function yn() {
		if (vn) return vn;
		var e, t = _n, n = t.length, r, i = "value" in gn ? gn.value : gn.textContent, a = i.length;
		for (e = 0; e < n && t[e] === i[e]; e++);
		var o = n - e;
		for (r = 1; r <= o && t[n - r] === i[a - r]; r++);
		return vn = i.slice(e, 1 < r ? 1 - r : void 0);
	}
	function bn(e) {
		var t = e.keyCode;
		return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
	}
	function xn() {
		return !0;
	}
	function Sn() {
		return !1;
	}
	function Cn(e) {
		function t(t, n, r, i, a) {
			for (var o in this._reactName = t, this._targetInst = r, this.type = n, this.nativeEvent = i, this.target = a, this.currentTarget = null, e) e.hasOwnProperty(o) && (t = e[o], this[o] = t ? t(i) : i[o]);
			return this.isDefaultPrevented = (i.defaultPrevented == null ? !1 === i.returnValue : i.defaultPrevented) ? xn : Sn, this.isPropagationStopped = Sn, this;
		}
		return h(t.prototype, {
			preventDefault: function() {
				this.defaultPrevented = !0;
				var e = this.nativeEvent;
				e && (e.preventDefault ? e.preventDefault() : typeof e.returnValue != "unknown" && (e.returnValue = !1), this.isDefaultPrevented = xn);
			},
			stopPropagation: function() {
				var e = this.nativeEvent;
				e && (e.stopPropagation ? e.stopPropagation() : typeof e.cancelBubble != "unknown" && (e.cancelBubble = !0), this.isPropagationStopped = xn);
			},
			persist: function() {},
			isPersistent: xn
		}), t;
	}
	var wn = {
		eventPhase: 0,
		bubbles: 0,
		cancelable: 0,
		timeStamp: function(e) {
			return e.timeStamp || Date.now();
		},
		defaultPrevented: 0,
		isTrusted: 0
	}, Tn = Cn(wn), En = h({}, wn, {
		view: 0,
		detail: 0
	}), Dn = Cn(En), On, kn, An, F = h({}, En, {
		screenX: 0,
		screenY: 0,
		clientX: 0,
		clientY: 0,
		pageX: 0,
		pageY: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		getModifierState: Vn,
		button: 0,
		buttons: 0,
		relatedTarget: function(e) {
			return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
		},
		movementX: function(e) {
			return "movementX" in e ? e.movementX : (e !== An && (An && e.type === "mousemove" ? (On = e.screenX - An.screenX, kn = e.screenY - An.screenY) : kn = On = 0, An = e), On);
		},
		movementY: function(e) {
			return "movementY" in e ? e.movementY : kn;
		}
	}), jn = Cn(F), Mn = Cn(h({}, F, { dataTransfer: 0 })), Nn = Cn(h({}, En, { relatedTarget: 0 })), Pn = Cn(h({}, wn, {
		animationName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), Fn = Cn(h({}, wn, { clipboardData: function(e) {
		return "clipboardData" in e ? e.clipboardData : window.clipboardData;
	} })), In = Cn(h({}, wn, { data: 0 })), Ln = {
		Esc: "Escape",
		Spacebar: " ",
		Left: "ArrowLeft",
		Up: "ArrowUp",
		Right: "ArrowRight",
		Down: "ArrowDown",
		Del: "Delete",
		Win: "OS",
		Menu: "ContextMenu",
		Apps: "ContextMenu",
		Scroll: "ScrollLock",
		MozPrintableKey: "Unidentified"
	}, Rn = {
		8: "Backspace",
		9: "Tab",
		12: "Clear",
		13: "Enter",
		16: "Shift",
		17: "Control",
		18: "Alt",
		19: "Pause",
		20: "CapsLock",
		27: "Escape",
		32: " ",
		33: "PageUp",
		34: "PageDown",
		35: "End",
		36: "Home",
		37: "ArrowLeft",
		38: "ArrowUp",
		39: "ArrowRight",
		40: "ArrowDown",
		45: "Insert",
		46: "Delete",
		112: "F1",
		113: "F2",
		114: "F3",
		115: "F4",
		116: "F5",
		117: "F6",
		118: "F7",
		119: "F8",
		120: "F9",
		121: "F10",
		122: "F11",
		123: "F12",
		144: "NumLock",
		145: "ScrollLock",
		224: "Meta"
	}, zn = {
		Alt: "altKey",
		Control: "ctrlKey",
		Meta: "metaKey",
		Shift: "shiftKey"
	};
	function Bn(e) {
		var t = this.nativeEvent;
		return t.getModifierState ? t.getModifierState(e) : (e = zn[e]) ? !!t[e] : !1;
	}
	function Vn() {
		return Bn;
	}
	var I = Cn(h({}, En, {
		key: function(e) {
			if (e.key) {
				var t = Ln[e.key] || e.key;
				if (t !== "Unidentified") return t;
			}
			return e.type === "keypress" ? (e = bn(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Rn[e.keyCode] || "Unidentified" : "";
		},
		code: 0,
		location: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		repeat: 0,
		locale: 0,
		getModifierState: Vn,
		charCode: function(e) {
			return e.type === "keypress" ? bn(e) : 0;
		},
		keyCode: function(e) {
			return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		},
		which: function(e) {
			return e.type === "keypress" ? bn(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		}
	})), Hn = Cn(h({}, F, {
		pointerId: 0,
		width: 0,
		height: 0,
		pressure: 0,
		tangentialPressure: 0,
		tiltX: 0,
		tiltY: 0,
		twist: 0,
		pointerType: 0,
		isPrimary: 0
	})), Un = Cn(h({}, En, {
		touches: 0,
		targetTouches: 0,
		changedTouches: 0,
		altKey: 0,
		metaKey: 0,
		ctrlKey: 0,
		shiftKey: 0,
		getModifierState: Vn
	})), Wn = Cn(h({}, wn, {
		propertyName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), Gn = Cn(h({}, F, {
		deltaX: function(e) {
			return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
		},
		deltaY: function(e) {
			return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
		},
		deltaZ: 0,
		deltaMode: 0
	})), Kn = Cn(h({}, wn, {
		newState: 0,
		oldState: 0
	})), qn = [
		9,
		13,
		27,
		32
	], Jn = pn && "CompositionEvent" in window, L = null;
	pn && "documentMode" in document && (L = document.documentMode);
	var Yn = pn && "TextEvent" in window && !L, Xn = pn && (!Jn || L && 8 < L && 11 >= L), Zn = " ", Qn = !1;
	function $n(e, t) {
		switch (e) {
			case "keyup": return qn.indexOf(t.keyCode) !== -1;
			case "keydown": return t.keyCode !== 229;
			case "keypress":
			case "mousedown":
			case "focusout": return !0;
			default: return !1;
		}
	}
	function er(e) {
		return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
	}
	var tr = !1;
	function nr(e, t) {
		switch (e) {
			case "compositionend": return er(t);
			case "keypress": return t.which === 32 ? (Qn = !0, Zn) : null;
			case "textInput": return e = t.data, e === Zn && Qn ? null : e;
			default: return null;
		}
	}
	function rr(e, t) {
		if (tr) return e === "compositionend" || !Jn && $n(e, t) ? (e = yn(), vn = _n = gn = null, tr = !1, e) : null;
		switch (e) {
			case "paste": return null;
			case "keypress":
				if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
					if (t.char && 1 < t.char.length) return t.char;
					if (t.which) return String.fromCharCode(t.which);
				}
				return null;
			case "compositionend": return Xn && t.locale !== "ko" ? null : t.data;
			default: return null;
		}
	}
	var ir = {
		color: !0,
		date: !0,
		datetime: !0,
		"datetime-local": !0,
		email: !0,
		month: !0,
		number: !0,
		password: !0,
		range: !0,
		search: !0,
		tel: !0,
		text: !0,
		time: !0,
		url: !0,
		week: !0
	};
	function ar(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t === "input" ? !!ir[e.type] : t === "textarea";
	}
	function or(e, t, n, r) {
		sn ? cn ? cn.push(r) : cn = [r] : sn = r, t = Ed(t, "onChange"), 0 < t.length && (n = new Tn("onChange", "change", null, n, r), e.push({
			event: n,
			listeners: t
		}));
	}
	var sr = null, cr = null;
	function lr(e) {
		yd(e, 0);
	}
	function ur(e) {
		if (zt(xt(e))) return e;
	}
	function dr(e, t) {
		if (e === "change") return t;
	}
	var fr = !1;
	if (pn) {
		var R;
		if (pn) {
			var pr = "oninput" in document;
			if (!pr) {
				var z = document.createElement("div");
				z.setAttribute("oninput", "return;"), pr = typeof z.oninput == "function";
			}
			R = pr;
		} else R = !1;
		fr = R && (!document.documentMode || 9 < document.documentMode);
	}
	function mr() {
		sr && (sr.detachEvent("onpropertychange", hr), cr = sr = null);
	}
	function hr(e) {
		if (e.propertyName === "value" && ur(cr)) {
			var t = [];
			or(t, cr, e, on(e)), dn(lr, t);
		}
	}
	function gr(e, t, n) {
		e === "focusin" ? (mr(), sr = t, cr = n, sr.attachEvent("onpropertychange", hr)) : e === "focusout" && mr();
	}
	function _r(e) {
		if (e === "selectionchange" || e === "keyup" || e === "keydown") return ur(cr);
	}
	function vr(e, t) {
		if (e === "click") return ur(t);
	}
	function yr(e, t) {
		if (e === "input" || e === "change") return ur(t);
	}
	function br(e, t) {
		return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
	}
	var xr = typeof Object.is == "function" ? Object.is : br;
	function Sr(e, t) {
		if (xr(e, t)) return !0;
		if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
		var n = Object.keys(e), r = Object.keys(t);
		if (n.length !== r.length) return !1;
		for (r = 0; r < n.length; r++) {
			var i = n[r];
			if (!we.call(t, i) || !xr(e[i], t[i])) return !1;
		}
		return !0;
	}
	function Cr(e) {
		for (; e && e.firstChild;) e = e.firstChild;
		return e;
	}
	function wr(e, t) {
		var n = Cr(e);
		e = 0;
		for (var r; n;) {
			if (n.nodeType === 3) {
				if (r = e + n.textContent.length, e <= t && r >= t) return {
					node: n,
					offset: t - e
				};
				e = r;
			}
			a: {
				for (; n;) {
					if (n.nextSibling) {
						n = n.nextSibling;
						break a;
					}
					n = n.parentNode;
				}
				n = void 0;
			}
			n = Cr(n);
		}
	}
	function Tr(e, t) {
		return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Tr(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
	}
	function Er(e) {
		e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
		for (var t = Bt(e.document); t instanceof e.HTMLIFrameElement;) {
			try {
				var n = typeof t.contentWindow.location.href == "string";
			} catch {
				n = !1;
			}
			if (n) e = t.contentWindow;
			else break;
			t = Bt(e.document);
		}
		return t;
	}
	function Dr(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
	}
	var Or = pn && "documentMode" in document && 11 >= document.documentMode, kr = null, Ar = null, jr = null, Mr = !1;
	function Nr(e, t, n) {
		var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
		Mr || kr == null || kr !== Bt(r) || (r = kr, "selectionStart" in r && Dr(r) ? r = {
			start: r.selectionStart,
			end: r.selectionEnd
		} : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
			anchorNode: r.anchorNode,
			anchorOffset: r.anchorOffset,
			focusNode: r.focusNode,
			focusOffset: r.focusOffset
		}), jr && Sr(jr, r) || (jr = r, r = Ed(Ar, "onSelect"), 0 < r.length && (t = new Tn("onSelect", "select", null, t, n), e.push({
			event: t,
			listeners: r
		}), t.target = kr)));
	}
	function Pr(e, t) {
		var n = {};
		return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
	}
	var Fr = {
		animationend: Pr("Animation", "AnimationEnd"),
		animationiteration: Pr("Animation", "AnimationIteration"),
		animationstart: Pr("Animation", "AnimationStart"),
		transitionrun: Pr("Transition", "TransitionRun"),
		transitionstart: Pr("Transition", "TransitionStart"),
		transitioncancel: Pr("Transition", "TransitionCancel"),
		transitionend: Pr("Transition", "TransitionEnd")
	}, Ir = {}, Lr = {};
	pn && (Lr = document.createElement("div").style, "AnimationEvent" in window || (delete Fr.animationend.animation, delete Fr.animationiteration.animation, delete Fr.animationstart.animation), "TransitionEvent" in window || delete Fr.transitionend.transition);
	function Rr(e) {
		if (Ir[e]) return Ir[e];
		if (!Fr[e]) return e;
		var t = Fr[e], n;
		for (n in t) if (t.hasOwnProperty(n) && n in Lr) return Ir[e] = t[n];
		return e;
	}
	var zr = Rr("animationend"), Br = Rr("animationiteration"), Vr = Rr("animationstart"), Hr = Rr("transitionrun"), Ur = Rr("transitionstart"), Wr = Rr("transitioncancel"), Gr = Rr("transitionend"), Kr = /* @__PURE__ */ new Map(), qr = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
	qr.push("scrollEnd");
	function Jr(e, t) {
		Kr.set(e, t), Et(t, [e]);
	}
	var Yr = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, Xr = [], B = 0, Zr = 0;
	function Qr() {
		for (var e = B, t = Zr = B = 0; t < e;) {
			var n = Xr[t];
			Xr[t++] = null;
			var r = Xr[t];
			Xr[t++] = null;
			var i = Xr[t];
			Xr[t++] = null;
			var a = Xr[t];
			if (Xr[t++] = null, r !== null && i !== null) {
				var o = r.pending;
				o === null ? i.next = i : (i.next = o.next, o.next = i), r.pending = i;
			}
			a !== 0 && ni(n, i, a);
		}
	}
	function $r(e, t, n, r) {
		Xr[B++] = e, Xr[B++] = t, Xr[B++] = n, Xr[B++] = r, Zr |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
	}
	function ei(e, t, n, r) {
		return $r(e, t, n, r), ri(e);
	}
	function ti(e, t) {
		return $r(e, null, null, t), ri(e);
	}
	function ni(e, t, n) {
		e.lanes |= n;
		var r = e.alternate;
		r !== null && (r.lanes |= n);
		for (var i = !1, a = e.return; a !== null;) a.childLanes |= n, r = a.alternate, r !== null && (r.childLanes |= n), a.tag === 22 && (e = a.stateNode, e === null || e._visibility & 1 || (i = !0)), e = a, a = a.return;
		return e.tag === 3 ? (a = e.stateNode, i && t !== null && (i = 31 - Ve(n), e = a.hiddenUpdates, r = e[i], r === null ? e[i] = [t] : r.push(t), t.lane = n | 536870912), a) : null;
	}
	function ri(e) {
		if (50 < du) throw du = 0, fu = null, Error(i(185));
		for (var t = e.return; t !== null;) e = t, t = e.return;
		return e.tag === 3 ? e.stateNode : null;
	}
	var ii = {};
	function ai(e, t, n, r) {
		this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
	}
	function oi(e, t, n, r) {
		return new ai(e, t, n, r);
	}
	function si(e) {
		return e = e.prototype, !(!e || !e.isReactComponent);
	}
	function ci(e, t) {
		var n = e.alternate;
		return n === null ? (n = oi(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 65011712, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n.refCleanup = e.refCleanup, n;
	}
	function li(e, t) {
		e.flags &= 65011714;
		var n = e.alternate;
		return n === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = n.childLanes, e.lanes = n.lanes, e.child = n.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = n.memoizedProps, e.memoizedState = n.memoizedState, e.updateQueue = n.updateQueue, e.type = n.type, t = n.dependencies, e.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}), e;
	}
	function ui(e, t, n, r, a, o) {
		var s = 0;
		if (r = e, typeof e == "function") si(e) && (s = 1);
		else if (typeof e == "string") s = Uf(e, n, ue.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
		else a: switch (e) {
			case te: return e = oi(31, n, t, a), e.elementType = te, e.lanes = o, e;
			case y: return di(n.children, a, o, t);
			case b:
				s = 8, a |= 24;
				break;
			case x: return e = oi(12, n, t, a | 2), e.elementType = x, e.lanes = o, e;
			case T: return e = oi(13, n, t, a), e.elementType = T, e.lanes = o, e;
			case E: return e = oi(19, n, t, a), e.elementType = E, e.lanes = o, e;
			default:
				if (typeof e == "object" && e) switch (e.$$typeof) {
					case C:
						s = 10;
						break a;
					case S:
						s = 9;
						break a;
					case w:
						s = 11;
						break a;
					case ee:
						s = 14;
						break a;
					case D:
						s = 16, r = null;
						break a;
				}
				s = 29, n = Error(i(130, e === null ? "null" : typeof e, "")), r = null;
		}
		return t = oi(s, n, t, a), t.elementType = e, t.type = r, t.lanes = o, t;
	}
	function di(e, t, n, r) {
		return e = oi(7, e, r, t), e.lanes = n, e;
	}
	function fi(e, t, n) {
		return e = oi(6, e, null, t), e.lanes = n, e;
	}
	function pi(e) {
		var t = oi(18, null, null, 0);
		return t.stateNode = e, t;
	}
	function mi(e, t, n) {
		return t = oi(4, e.children === null ? [] : e.children, e.key, t), t.lanes = n, t.stateNode = {
			containerInfo: e.containerInfo,
			pendingChildren: null,
			implementation: e.implementation
		}, t;
	}
	var hi = /* @__PURE__ */ new WeakMap();
	function gi(e, t) {
		if (typeof e == "object" && e) {
			var n = hi.get(e);
			return n === void 0 ? (t = {
				value: e,
				source: t,
				stack: Ce(t)
			}, hi.set(e, t), t) : n;
		}
		return {
			value: e,
			source: t,
			stack: Ce(t)
		};
	}
	var _i = [], vi = 0, yi = null, bi = 0, xi = [], Si = 0, Ci = null, wi = 1, Ti = "";
	function Ei(e, t) {
		_i[vi++] = bi, _i[vi++] = yi, yi = e, bi = t;
	}
	function Di(e, t, n) {
		xi[Si++] = wi, xi[Si++] = Ti, xi[Si++] = Ci, Ci = e;
		var r = wi;
		e = Ti;
		var i = 32 - Ve(r) - 1;
		r &= ~(1 << i), n += 1;
		var a = 32 - Ve(t) + i;
		if (30 < a) {
			var o = i - i % 5;
			a = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, wi = 1 << 32 - Ve(t) + i | n << i | r, Ti = a + e;
		} else wi = 1 << a | n << i | r, Ti = e;
	}
	function Oi(e) {
		e.return !== null && (Ei(e, 1), Di(e, 1, 0));
	}
	function ki(e) {
		for (; e === yi;) yi = _i[--vi], _i[vi] = null, bi = _i[--vi], _i[vi] = null;
		for (; e === Ci;) Ci = xi[--Si], xi[Si] = null, Ti = xi[--Si], xi[Si] = null, wi = xi[--Si], xi[Si] = null;
	}
	function Ai(e, t) {
		xi[Si++] = wi, xi[Si++] = Ti, xi[Si++] = Ci, wi = t.id, Ti = t.overflow, Ci = e;
	}
	var ji = null, V = null, H = !1, Mi = null, Ni = !1, Pi = Error(i(519));
	function Fi(e) {
		throw Vi(gi(Error(i(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), e)), Pi;
	}
	function Ii(e) {
		var t = e.stateNode, n = e.type, r = e.memoizedProps;
		switch (t[ut] = e, t[dt] = r, n) {
			case "dialog":
				Q("cancel", t), Q("close", t);
				break;
			case "iframe":
			case "object":
			case "embed":
				Q("load", t);
				break;
			case "video":
			case "audio":
				for (n = 0; n < _d.length; n++) Q(_d[n], t);
				break;
			case "source":
				Q("error", t);
				break;
			case "img":
			case "image":
			case "link":
				Q("error", t), Q("load", t);
				break;
			case "details":
				Q("toggle", t);
				break;
			case "input":
				Q("invalid", t), Wt(t, r.value, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name, !0);
				break;
			case "select":
				Q("invalid", t);
				break;
			case "textarea": Q("invalid", t), Jt(t, r.value, r.defaultValue, r.children);
		}
		n = r.children, typeof n != "string" && typeof n != "number" && typeof n != "bigint" || t.textContent === "" + n || !0 === r.suppressHydrationWarning || Md(t.textContent, n) ? (r.popover != null && (Q("beforetoggle", t), Q("toggle", t)), r.onScroll != null && Q("scroll", t), r.onScrollEnd != null && Q("scrollend", t), r.onClick != null && (t.onclick = rn), t = !0) : t = !1, t || Fi(e, !0);
	}
	function Li(e) {
		for (ji = e.return; ji;) switch (ji.tag) {
			case 5:
			case 31:
			case 13:
				Ni = !1;
				return;
			case 27:
			case 3:
				Ni = !0;
				return;
			default: ji = ji.return;
		}
	}
	function Ri(e) {
		if (e !== ji) return !1;
		if (!H) return Li(e), H = !0, !1;
		var t = e.tag, n;
		if ((n = t !== 3 && t !== 27) && ((n = t === 5) && (n = e.type, n = !(n !== "form" && n !== "button") || Ud(e.type, e.memoizedProps)), n = !n), n && V && Fi(e), Li(e), t === 13) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			V = uf(e);
		} else if (t === 31) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			V = uf(e);
		} else t === 27 ? (t = V, Zd(e.type) ? (e = lf, lf = null, V = e) : V = t) : V = ji ? cf(e.stateNode.nextSibling) : null;
		return !0;
	}
	function zi() {
		V = ji = null, H = !1;
	}
	function Bi() {
		var e = Mi;
		return e !== null && (Zl === null ? Zl = e : Zl.push.apply(Zl, e), Mi = null), e;
	}
	function Vi(e) {
		Mi === null ? Mi = [e] : Mi.push(e);
	}
	var Hi = j(null), Ui = null, Wi = null;
	function Gi(e, t, n) {
		N(Hi, t._currentValue), t._currentValue = n;
	}
	function Ki(e) {
		e._currentValue = Hi.current, M(Hi);
	}
	function qi(e, t, n) {
		for (; e !== null;) {
			var r = e.alternate;
			if ((e.childLanes & t) === t ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t) : (e.childLanes |= t, r !== null && (r.childLanes |= t)), e === n) break;
			e = e.return;
		}
	}
	function Ji(e, t, n, r) {
		var a = e.child;
		for (a !== null && (a.return = e); a !== null;) {
			var o = a.dependencies;
			if (o !== null) {
				var s = a.child;
				o = o.firstContext;
				a: for (; o !== null;) {
					var c = o;
					o = a;
					for (var l = 0; l < t.length; l++) if (c.context === t[l]) {
						o.lanes |= n, c = o.alternate, c !== null && (c.lanes |= n), qi(o.return, n, e), r || (s = null);
						break a;
					}
					o = c.next;
				}
			} else if (a.tag === 18) {
				if (s = a.return, s === null) throw Error(i(341));
				s.lanes |= n, o = s.alternate, o !== null && (o.lanes |= n), qi(s, n, e), s = null;
			} else s = a.child;
			if (s !== null) s.return = a;
			else for (s = a; s !== null;) {
				if (s === e) {
					s = null;
					break;
				}
				if (a = s.sibling, a !== null) {
					a.return = s.return, s = a;
					break;
				}
				s = s.return;
			}
			a = s;
		}
	}
	function Yi(e, t, n, r) {
		e = null;
		for (var a = t, o = !1; a !== null;) {
			if (!o) {
				if (a.flags & 524288) o = !0;
				else if (a.flags & 262144) break;
			}
			if (a.tag === 10) {
				var s = a.alternate;
				if (s === null) throw Error(i(387));
				if (s = s.memoizedProps, s !== null) {
					var c = a.type;
					xr(a.pendingProps.value, s.value) || (e === null ? e = [c] : e.push(c));
				}
			} else if (a === fe.current) {
				if (s = a.alternate, s === null) throw Error(i(387));
				s.memoizedState.memoizedState !== a.memoizedState.memoizedState && (e === null ? e = [Qf] : e.push(Qf));
			}
			a = a.return;
		}
		e !== null && Ji(t, e, n, r), t.flags |= 262144;
	}
	function Xi(e) {
		for (e = e.firstContext; e !== null;) {
			if (!xr(e.context._currentValue, e.memoizedValue)) return !0;
			e = e.next;
		}
		return !1;
	}
	function Zi(e) {
		Ui = e, Wi = null, e = e.dependencies, e !== null && (e.firstContext = null);
	}
	function Qi(e) {
		return ea(Ui, e);
	}
	function $i(e, t) {
		return Ui === null && Zi(e), ea(e, t);
	}
	function ea(e, t) {
		var n = t._currentValue;
		if (t = {
			context: t,
			memoizedValue: n,
			next: null
		}, Wi === null) {
			if (e === null) throw Error(i(308));
			Wi = t, e.dependencies = {
				lanes: 0,
				firstContext: t
			}, e.flags |= 524288;
		} else Wi = Wi.next = t;
		return n;
	}
	var ta = typeof AbortController < "u" ? AbortController : function() {
		var e = [], t = this.signal = {
			aborted: !1,
			addEventListener: function(t, n) {
				e.push(n);
			}
		};
		this.abort = function() {
			t.aborted = !0, e.forEach(function(e) {
				return e();
			});
		};
	}, na = t.unstable_scheduleCallback, ra = t.unstable_NormalPriority, ia = {
		$$typeof: C,
		Consumer: null,
		Provider: null,
		_currentValue: null,
		_currentValue2: null,
		_threadCount: 0
	};
	function aa() {
		return {
			controller: new ta(),
			data: /* @__PURE__ */ new Map(),
			refCount: 0
		};
	}
	function oa(e) {
		e.refCount--, e.refCount === 0 && na(ra, function() {
			e.controller.abort();
		});
	}
	var sa = null, ca = 0, la = 0, ua = null;
	function da(e, t) {
		if (sa === null) {
			var n = sa = [];
			ca = 0, la = dd(), ua = {
				status: "pending",
				value: void 0,
				then: function(e) {
					n.push(e);
				}
			};
		}
		return ca++, t.then(fa, fa), t;
	}
	function fa() {
		if (--ca === 0 && sa !== null) {
			ua !== null && (ua.status = "fulfilled");
			var e = sa;
			sa = null, la = 0, ua = null;
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
	}
	function pa(e, t) {
		var n = [], r = {
			status: "pending",
			value: null,
			reason: null,
			then: function(e) {
				n.push(e);
			}
		};
		return e.then(function() {
			r.status = "fulfilled", r.value = t;
			for (var e = 0; e < n.length; e++) (0, n[e])(t);
		}, function(e) {
			for (r.status = "rejected", r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0);
		}), r;
	}
	var ma = k.S;
	k.S = function(e, t) {
		eu = ke(), typeof t == "object" && t && typeof t.then == "function" && da(e, t), ma !== null && ma(e, t);
	};
	var ha = j(null);
	function ga() {
		var e = ha.current;
		return e === null ? q.pooledCache : e;
	}
	function _a(e, t) {
		t === null ? N(ha, ha.current) : N(ha, t.pool);
	}
	function va() {
		var e = ga();
		return e === null ? null : {
			parent: ia._currentValue,
			pool: e
		};
	}
	var ya = Error(i(460)), ba = Error(i(474)), xa = Error(i(542)), Sa = { then: function() {} };
	function Ca(e) {
		return e = e.status, e === "fulfilled" || e === "rejected";
	}
	function wa(e, t, n) {
		switch (n = e[n], n === void 0 ? e.push(t) : n !== t && (t.then(rn, rn), t = n), t.status) {
			case "fulfilled": return t.value;
			case "rejected": throw e = t.reason, Oa(e), e;
			default:
				if (typeof t.status == "string") t.then(rn, rn);
				else {
					if (e = q, e !== null && 100 < e.shellSuspendCounter) throw Error(i(482));
					e = t, e.status = "pending", e.then(function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "fulfilled", n.value = e;
						}
					}, function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "rejected", n.reason = e;
						}
					});
				}
				switch (t.status) {
					case "fulfilled": return t.value;
					case "rejected": throw e = t.reason, Oa(e), e;
				}
				throw Ea = t, ya;
		}
	}
	function Ta(e) {
		try {
			var t = e._init;
			return t(e._payload);
		} catch (e) {
			throw typeof e == "object" && e && typeof e.then == "function" ? (Ea = e, ya) : e;
		}
	}
	var Ea = null;
	function Da() {
		if (Ea === null) throw Error(i(459));
		var e = Ea;
		return Ea = null, e;
	}
	function Oa(e) {
		if (e === ya || e === xa) throw Error(i(483));
	}
	var ka = null, Aa = 0;
	function ja(e) {
		var t = Aa;
		return Aa += 1, ka === null && (ka = []), wa(ka, e, t);
	}
	function Ma(e, t) {
		t = t.props.ref, e.ref = t === void 0 ? null : t;
	}
	function Na(e, t) {
		throw t.$$typeof === g ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(i(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
	}
	function Pa(e) {
		function t(t, n) {
			if (e) {
				var r = t.deletions;
				r === null ? (t.deletions = [n], t.flags |= 16) : r.push(n);
			}
		}
		function n(n, r) {
			if (!e) return null;
			for (; r !== null;) t(n, r), r = r.sibling;
			return null;
		}
		function r(e) {
			for (var t = /* @__PURE__ */ new Map(); e !== null;) e.key === null ? t.set(e.index, e) : t.set(e.key, e), e = e.sibling;
			return t;
		}
		function a(e, t) {
			return e = ci(e, t), e.index = 0, e.sibling = null, e;
		}
		function o(t, n, r) {
			return t.index = r, e ? (r = t.alternate, r === null ? (t.flags |= 67108866, n) : (r = r.index, r < n ? (t.flags |= 67108866, n) : r)) : (t.flags |= 1048576, n);
		}
		function s(t) {
			return e && t.alternate === null && (t.flags |= 67108866), t;
		}
		function c(e, t, n, r) {
			return t === null || t.tag !== 6 ? (t = fi(n, e.mode, r), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function l(e, t, n, r) {
			var i = n.type;
			return i === y ? d(e, t, n.props.children, r, n.key) : t !== null && (t.elementType === i || typeof i == "object" && i && i.$$typeof === D && Ta(i) === t.type) ? (t = a(t, n.props), Ma(t, n), t.return = e, t) : (t = ui(n.type, n.key, n.props, null, e.mode, r), Ma(t, n), t.return = e, t);
		}
		function u(e, t, n, r) {
			return t === null || t.tag !== 4 || t.stateNode.containerInfo !== n.containerInfo || t.stateNode.implementation !== n.implementation ? (t = mi(n, e.mode, r), t.return = e, t) : (t = a(t, n.children || []), t.return = e, t);
		}
		function d(e, t, n, r, i) {
			return t === null || t.tag !== 7 ? (t = di(n, e.mode, r, i), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function f(e, t, n) {
			if (typeof t == "string" && t !== "" || typeof t == "number" || typeof t == "bigint") return t = fi("" + t, e.mode, n), t.return = e, t;
			if (typeof t == "object" && t) {
				switch (t.$$typeof) {
					case _: return n = ui(t.type, t.key, t.props, null, e.mode, n), Ma(n, t), n.return = e, n;
					case v: return t = mi(t, e.mode, n), t.return = e, t;
					case D: return t = Ta(t), f(e, t, n);
				}
				if (oe(t) || O(t)) return t = di(t, e.mode, n, null), t.return = e, t;
				if (typeof t.then == "function") return f(e, ja(t), n);
				if (t.$$typeof === C) return f(e, $i(e, t), n);
				Na(e, t);
			}
			return null;
		}
		function p(e, t, n, r) {
			var i = t === null ? null : t.key;
			if (typeof n == "string" && n !== "" || typeof n == "number" || typeof n == "bigint") return i === null ? c(e, t, "" + n, r) : null;
			if (typeof n == "object" && n) {
				switch (n.$$typeof) {
					case _: return n.key === i ? l(e, t, n, r) : null;
					case v: return n.key === i ? u(e, t, n, r) : null;
					case D: return n = Ta(n), p(e, t, n, r);
				}
				if (oe(n) || O(n)) return i === null ? d(e, t, n, r, null) : null;
				if (typeof n.then == "function") return p(e, t, ja(n), r);
				if (n.$$typeof === C) return p(e, t, $i(e, n), r);
				Na(e, n);
			}
			return null;
		}
		function m(e, t, n, r, i) {
			if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return e = e.get(n) || null, c(t, e, "" + r, i);
			if (typeof r == "object" && r) {
				switch (r.$$typeof) {
					case _: return e = e.get(r.key === null ? n : r.key) || null, l(t, e, r, i);
					case v: return e = e.get(r.key === null ? n : r.key) || null, u(t, e, r, i);
					case D: return r = Ta(r), m(e, t, n, r, i);
				}
				if (oe(r) || O(r)) return e = e.get(n) || null, d(t, e, r, i, null);
				if (typeof r.then == "function") return m(e, t, n, ja(r), i);
				if (r.$$typeof === C) return m(e, t, n, $i(t, r), i);
				Na(t, r);
			}
			return null;
		}
		function h(i, a, s, c) {
			for (var l = null, u = null, d = a, h = a = 0, g = null; d !== null && h < s.length; h++) {
				d.index > h ? (g = d, d = null) : g = d.sibling;
				var _ = p(i, d, s[h], c);
				if (_ === null) {
					d === null && (d = g);
					break;
				}
				e && d && _.alternate === null && t(i, d), a = o(_, a, h), u === null ? l = _ : u.sibling = _, u = _, d = g;
			}
			if (h === s.length) return n(i, d), H && Ei(i, h), l;
			if (d === null) {
				for (; h < s.length; h++) d = f(i, s[h], c), d !== null && (a = o(d, a, h), u === null ? l = d : u.sibling = d, u = d);
				return H && Ei(i, h), l;
			}
			for (d = r(d); h < s.length; h++) g = m(d, i, h, s[h], c), g !== null && (e && g.alternate !== null && d.delete(g.key === null ? h : g.key), a = o(g, a, h), u === null ? l = g : u.sibling = g, u = g);
			return e && d.forEach(function(e) {
				return t(i, e);
			}), H && Ei(i, h), l;
		}
		function g(a, s, c, l) {
			if (c == null) throw Error(i(151));
			for (var u = null, d = null, h = s, g = s = 0, _ = null, v = c.next(); h !== null && !v.done; g++, v = c.next()) {
				h.index > g ? (_ = h, h = null) : _ = h.sibling;
				var y = p(a, h, v.value, l);
				if (y === null) {
					h === null && (h = _);
					break;
				}
				e && h && y.alternate === null && t(a, h), s = o(y, s, g), d === null ? u = y : d.sibling = y, d = y, h = _;
			}
			if (v.done) return n(a, h), H && Ei(a, g), u;
			if (h === null) {
				for (; !v.done; g++, v = c.next()) v = f(a, v.value, l), v !== null && (s = o(v, s, g), d === null ? u = v : d.sibling = v, d = v);
				return H && Ei(a, g), u;
			}
			for (h = r(h); !v.done; g++, v = c.next()) v = m(h, a, g, v.value, l), v !== null && (e && v.alternate !== null && h.delete(v.key === null ? g : v.key), s = o(v, s, g), d === null ? u = v : d.sibling = v, d = v);
			return e && h.forEach(function(e) {
				return t(a, e);
			}), H && Ei(a, g), u;
		}
		function b(e, r, o, c) {
			if (typeof o == "object" && o && o.type === y && o.key === null && (o = o.props.children), typeof o == "object" && o) {
				switch (o.$$typeof) {
					case _:
						a: {
							for (var l = o.key; r !== null;) {
								if (r.key === l) {
									if (l = o.type, l === y) {
										if (r.tag === 7) {
											n(e, r.sibling), c = a(r, o.props.children), c.return = e, e = c;
											break a;
										}
									} else if (r.elementType === l || typeof l == "object" && l && l.$$typeof === D && Ta(l) === r.type) {
										n(e, r.sibling), c = a(r, o.props), Ma(c, o), c.return = e, e = c;
										break a;
									}
									n(e, r);
									break;
								} else t(e, r);
								r = r.sibling;
							}
							o.type === y ? (c = di(o.props.children, e.mode, c, o.key), c.return = e, e = c) : (c = ui(o.type, o.key, o.props, null, e.mode, c), Ma(c, o), c.return = e, e = c);
						}
						return s(e);
					case v:
						a: {
							for (l = o.key; r !== null;) {
								if (r.key === l) if (r.tag === 4 && r.stateNode.containerInfo === o.containerInfo && r.stateNode.implementation === o.implementation) {
									n(e, r.sibling), c = a(r, o.children || []), c.return = e, e = c;
									break a;
								} else {
									n(e, r);
									break;
								}
								else t(e, r);
								r = r.sibling;
							}
							c = mi(o, e.mode, c), c.return = e, e = c;
						}
						return s(e);
					case D: return o = Ta(o), b(e, r, o, c);
				}
				if (oe(o)) return h(e, r, o, c);
				if (O(o)) {
					if (l = O(o), typeof l != "function") throw Error(i(150));
					return o = l.call(o), g(e, r, o, c);
				}
				if (typeof o.then == "function") return b(e, r, ja(o), c);
				if (o.$$typeof === C) return b(e, r, $i(e, o), c);
				Na(e, o);
			}
			return typeof o == "string" && o !== "" || typeof o == "number" || typeof o == "bigint" ? (o = "" + o, r !== null && r.tag === 6 ? (n(e, r.sibling), c = a(r, o), c.return = e, e = c) : (n(e, r), c = fi(o, e.mode, c), c.return = e, e = c), s(e)) : n(e, r);
		}
		return function(e, t, n, r) {
			try {
				Aa = 0;
				var i = b(e, t, n, r);
				return ka = null, i;
			} catch (t) {
				if (t === ya || t === xa) throw t;
				var a = oi(29, t, null, e.mode);
				return a.lanes = r, a.return = e, a;
			}
		};
	}
	var Fa = Pa(!0), Ia = Pa(!1), La = !1;
	function Ra(e) {
		e.updateQueue = {
			baseState: e.memoizedState,
			firstBaseUpdate: null,
			lastBaseUpdate: null,
			shared: {
				pending: null,
				lanes: 0,
				hiddenCallbacks: null
			},
			callbacks: null
		};
	}
	function za(e, t) {
		e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
			baseState: e.baseState,
			firstBaseUpdate: e.firstBaseUpdate,
			lastBaseUpdate: e.lastBaseUpdate,
			shared: e.shared,
			callbacks: null
		});
	}
	function Ba(e) {
		return {
			lane: e,
			tag: 0,
			payload: null,
			callback: null,
			next: null
		};
	}
	function Va(e, t, n) {
		var r = e.updateQueue;
		if (r === null) return null;
		if (r = r.shared, K & 2) {
			var i = r.pending;
			return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, t = ri(e), ni(e, null, n), t;
		}
		return $r(e, r, t, n), ri(e);
	}
	function Ha(e, t, n) {
		if (t = t.updateQueue, t !== null && (t = t.shared, n & 4194048)) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, rt(e, n);
		}
	}
	function Ua(e, t) {
		var n = e.updateQueue, r = e.alternate;
		if (r !== null && (r = r.updateQueue, n === r)) {
			var i = null, a = null;
			if (n = n.firstBaseUpdate, n !== null) {
				do {
					var o = {
						lane: n.lane,
						tag: n.tag,
						payload: n.payload,
						callback: null,
						next: null
					};
					a === null ? i = a = o : a = a.next = o, n = n.next;
				} while (n !== null);
				a === null ? i = a = t : a = a.next = t;
			} else i = a = t;
			n = {
				baseState: r.baseState,
				firstBaseUpdate: i,
				lastBaseUpdate: a,
				shared: r.shared,
				callbacks: r.callbacks
			}, e.updateQueue = n;
			return;
		}
		e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
	}
	var Wa = !1;
	function Ga() {
		if (Wa) {
			var e = ua;
			if (e !== null) throw e;
		}
	}
	function Ka(e, t, n, r) {
		Wa = !1;
		var i = e.updateQueue;
		La = !1;
		var a = i.firstBaseUpdate, o = i.lastBaseUpdate, s = i.shared.pending;
		if (s !== null) {
			i.shared.pending = null;
			var c = s, l = c.next;
			c.next = null, o === null ? a = l : o.next = l, o = c;
			var u = e.alternate;
			u !== null && (u = u.updateQueue, s = u.lastBaseUpdate, s !== o && (s === null ? u.firstBaseUpdate = l : s.next = l, u.lastBaseUpdate = c));
		}
		if (a !== null) {
			var d = i.baseState;
			o = 0, u = l = c = null, s = a;
			do {
				var f = s.lane & -536870913, p = f !== s.lane;
				if (p ? (Y & f) === f : (r & f) === f) {
					f !== 0 && f === la && (Wa = !0), u !== null && (u = u.next = {
						lane: 0,
						tag: s.tag,
						payload: s.payload,
						callback: null,
						next: null
					});
					a: {
						var m = e, g = s;
						f = t;
						var _ = n;
						switch (g.tag) {
							case 1:
								if (m = g.payload, typeof m == "function") {
									d = m.call(_, d, f);
									break a;
								}
								d = m;
								break a;
							case 3: m.flags = m.flags & -65537 | 128;
							case 0:
								if (m = g.payload, f = typeof m == "function" ? m.call(_, d, f) : m, f == null) break a;
								d = h({}, d, f);
								break a;
							case 2: La = !0;
						}
					}
					f = s.callback, f !== null && (e.flags |= 64, p && (e.flags |= 8192), p = i.callbacks, p === null ? i.callbacks = [f] : p.push(f));
				} else p = {
					lane: f,
					tag: s.tag,
					payload: s.payload,
					callback: s.callback,
					next: null
				}, u === null ? (l = u = p, c = d) : u = u.next = p, o |= f;
				if (s = s.next, s === null) {
					if (s = i.shared.pending, s === null) break;
					p = s, s = p.next, p.next = null, i.lastBaseUpdate = p, i.shared.pending = null;
				}
			} while (1);
			u === null && (c = d), i.baseState = c, i.firstBaseUpdate = l, i.lastBaseUpdate = u, a === null && (i.shared.lanes = 0), Gl |= o, e.lanes = o, e.memoizedState = d;
		}
	}
	function qa(e, t) {
		if (typeof e != "function") throw Error(i(191, e));
		e.call(t);
	}
	function Ja(e, t) {
		var n = e.callbacks;
		if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) qa(n[e], t);
	}
	var Ya = j(null), Xa = j(0);
	function Za(e, t) {
		e = Ul, N(Xa, e), N(Ya, t), Ul = e | t.baseLanes;
	}
	function Qa() {
		N(Xa, Ul), N(Ya, Ya.current);
	}
	function $a() {
		Ul = Xa.current, M(Ya), M(Xa);
	}
	var eo = j(null), to = null;
	function no(e) {
		var t = e.alternate;
		N(so, so.current & 1), N(eo, e), to === null && (t === null || Ya.current !== null || t.memoizedState !== null) && (to = e);
	}
	function ro(e) {
		N(so, so.current), N(eo, e), to === null && (to = e);
	}
	function io(e) {
		e.tag === 22 ? (N(so, so.current), N(eo, e), to === null && (to = e)) : ao(e);
	}
	function ao() {
		N(so, so.current), N(eo, eo.current);
	}
	function oo(e) {
		M(eo), to === e && (to = null), M(so);
	}
	var so = j(0);
	function co(e) {
		for (var t = e; t !== null;) {
			if (t.tag === 13) {
				var n = t.memoizedState;
				if (n !== null && (n = n.dehydrated, n === null || af(n) || of(n))) return t;
			} else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
				if (t.flags & 128) return t;
			} else if (t.child !== null) {
				t.child.return = t, t = t.child;
				continue;
			}
			if (t === e) break;
			for (; t.sibling === null;) {
				if (t.return === null || t.return === e) return null;
				t = t.return;
			}
			t.sibling.return = t.return, t = t.sibling;
		}
		return null;
	}
	var lo = 0, U = null, W = null, uo = null, fo = !1, po = !1, mo = !1, ho = 0, go = 0, _o = null, vo = 0;
	function yo() {
		throw Error(i(321));
	}
	function bo(e, t) {
		if (t === null) return !1;
		for (var n = 0; n < t.length && n < e.length; n++) if (!xr(e[n], t[n])) return !1;
		return !0;
	}
	function xo(e, t, n, r, i, a) {
		return lo = a, U = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, k.H = e === null || e.memoizedState === null ? Rs : zs, mo = !1, a = n(r, i), mo = !1, po && (a = Co(t, n, r, i)), So(e), a;
	}
	function So(e) {
		k.H = Ls;
		var t = W !== null && W.next !== null;
		if (lo = 0, uo = W = U = null, fo = !1, go = 0, _o = null, t) throw Error(i(300));
		e === null || nc || (e = e.dependencies, e !== null && Xi(e) && (nc = !0));
	}
	function Co(e, t, n, r) {
		U = e;
		var a = 0;
		do {
			if (po && (_o = null), go = 0, po = !1, 25 <= a) throw Error(i(301));
			if (a += 1, uo = W = null, e.updateQueue != null) {
				var o = e.updateQueue;
				o.lastEffect = null, o.events = null, o.stores = null, o.memoCache != null && (o.memoCache.index = 0);
			}
			k.H = Bs, o = t(n, r);
		} while (po);
		return o;
	}
	function wo() {
		var e = k.H, t = e.useState()[0];
		return t = typeof t.then == "function" ? jo(t) : t, e = e.useState()[0], (W === null ? null : W.memoizedState) !== e && (U.flags |= 1024), t;
	}
	function To() {
		var e = ho !== 0;
		return ho = 0, e;
	}
	function Eo(e, t, n) {
		t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~n;
	}
	function Do(e) {
		if (fo) {
			for (e = e.memoizedState; e !== null;) {
				var t = e.queue;
				t !== null && (t.pending = null), e = e.next;
			}
			fo = !1;
		}
		lo = 0, uo = W = U = null, po = !1, go = ho = 0, _o = null;
	}
	function Oo() {
		var e = {
			memoizedState: null,
			baseState: null,
			baseQueue: null,
			queue: null,
			next: null
		};
		return uo === null ? U.memoizedState = uo = e : uo = uo.next = e, uo;
	}
	function ko() {
		if (W === null) {
			var e = U.alternate;
			e = e === null ? null : e.memoizedState;
		} else e = W.next;
		var t = uo === null ? U.memoizedState : uo.next;
		if (t !== null) uo = t, W = e;
		else {
			if (e === null) throw U.alternate === null ? Error(i(467)) : Error(i(310));
			W = e, e = {
				memoizedState: W.memoizedState,
				baseState: W.baseState,
				baseQueue: W.baseQueue,
				queue: W.queue,
				next: null
			}, uo === null ? U.memoizedState = uo = e : uo = uo.next = e;
		}
		return uo;
	}
	function Ao() {
		return {
			lastEffect: null,
			events: null,
			stores: null,
			memoCache: null
		};
	}
	function jo(e) {
		var t = go;
		return go += 1, _o === null && (_o = []), e = wa(_o, e, t), t = U, (uo === null ? t.memoizedState : uo.next) === null && (t = t.alternate, k.H = t === null || t.memoizedState === null ? Rs : zs), e;
	}
	function Mo(e) {
		if (typeof e == "object" && e) {
			if (typeof e.then == "function") return jo(e);
			if (e.$$typeof === C) return Qi(e);
		}
		throw Error(i(438, String(e)));
	}
	function No(e) {
		var t = null, n = U.updateQueue;
		if (n !== null && (t = n.memoCache), t == null) {
			var r = U.alternate;
			r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
				data: r.data.map(function(e) {
					return e.slice();
				}),
				index: 0
			})));
		}
		if (t ??= {
			data: [],
			index: 0
		}, n === null && (n = Ao(), U.updateQueue = n), n.memoCache = t, n = t.data[t.index], n === void 0) for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = ne;
		return t.index++, n;
	}
	function Po(e, t) {
		return typeof t == "function" ? t(e) : t;
	}
	function Fo(e) {
		return Io(ko(), W, e);
	}
	function Io(e, t, n) {
		var r = e.queue;
		if (r === null) throw Error(i(311));
		r.lastRenderedReducer = n;
		var a = e.baseQueue, o = r.pending;
		if (o !== null) {
			if (a !== null) {
				var s = a.next;
				a.next = o.next, o.next = s;
			}
			t.baseQueue = a = o, r.pending = null;
		}
		if (o = e.baseState, a === null) e.memoizedState = o;
		else {
			t = a.next;
			var c = s = null, l = null, u = t, d = !1;
			do {
				var f = u.lane & -536870913;
				if (f === u.lane ? (lo & f) === f : (Y & f) === f) {
					var p = u.revertLane;
					if (p === 0) l !== null && (l = l.next = {
						lane: 0,
						revertLane: 0,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}), f === la && (d = !0);
					else if ((lo & p) === p) {
						u = u.next, p === la && (d = !0);
						continue;
					} else f = {
						lane: 0,
						revertLane: u.revertLane,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}, l === null ? (c = l = f, s = o) : l = l.next = f, U.lanes |= p, Gl |= p;
					f = u.action, mo && n(o, f), o = u.hasEagerState ? u.eagerState : n(o, f);
				} else p = {
					lane: f,
					revertLane: u.revertLane,
					gesture: u.gesture,
					action: u.action,
					hasEagerState: u.hasEagerState,
					eagerState: u.eagerState,
					next: null
				}, l === null ? (c = l = p, s = o) : l = l.next = p, U.lanes |= f, Gl |= f;
				u = u.next;
			} while (u !== null && u !== t);
			if (l === null ? s = o : l.next = c, !xr(o, e.memoizedState) && (nc = !0, d && (n = ua, n !== null))) throw n;
			e.memoizedState = o, e.baseState = s, e.baseQueue = l, r.lastRenderedState = o;
		}
		return a === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
	}
	function Lo(e) {
		var t = ko(), n = t.queue;
		if (n === null) throw Error(i(311));
		n.lastRenderedReducer = e;
		var r = n.dispatch, a = n.pending, o = t.memoizedState;
		if (a !== null) {
			n.pending = null;
			var s = a = a.next;
			do
				o = e(o, s.action), s = s.next;
			while (s !== a);
			xr(o, t.memoizedState) || (nc = !0), t.memoizedState = o, t.baseQueue === null && (t.baseState = o), n.lastRenderedState = o;
		}
		return [o, r];
	}
	function Ro(e, t, n) {
		var r = U, a = ko(), o = H;
		if (o) {
			if (n === void 0) throw Error(i(407));
			n = n();
		} else n = t();
		var s = !xr((W || a).memoizedState, n);
		if (s && (a.memoizedState = n, nc = !0), a = a.queue, ls(Vo.bind(null, r, a, e), [e]), a.getSnapshot !== t || s || uo !== null && uo.memoizedState.tag & 1) {
			if (r.flags |= 2048, is(9, { destroy: void 0 }, Bo.bind(null, r, a, n, t), null), q === null) throw Error(i(349));
			o || lo & 127 || zo(r, t, n);
		}
		return n;
	}
	function zo(e, t, n) {
		e.flags |= 16384, e = {
			getSnapshot: t,
			value: n
		}, t = U.updateQueue, t === null ? (t = Ao(), U.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
	}
	function Bo(e, t, n, r) {
		t.value = n, t.getSnapshot = r, Ho(t) && Uo(e);
	}
	function Vo(e, t, n) {
		return n(function() {
			Ho(t) && Uo(e);
		});
	}
	function Ho(e) {
		var t = e.getSnapshot;
		e = e.value;
		try {
			var n = t();
			return !xr(e, n);
		} catch {
			return !0;
		}
	}
	function Uo(e) {
		var t = ti(e, 2);
		t !== null && hu(t, e, 2);
	}
	function Wo(e) {
		var t = Oo();
		if (typeof e == "function") {
			var n = e;
			if (e = n(), mo) {
				Be(!0);
				try {
					n();
				} finally {
					Be(!1);
				}
			}
		}
		return t.memoizedState = t.baseState = e, t.queue = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: Po,
			lastRenderedState: e
		}, t;
	}
	function Go(e, t, n, r) {
		return e.baseState = n, Io(e, W, typeof r == "function" ? r : Po);
	}
	function Ko(e, t, n, r, a) {
		if (Ps(e)) throw Error(i(485));
		if (e = t.action, e !== null) {
			var o = {
				payload: a,
				action: e,
				next: null,
				isTransition: !0,
				status: "pending",
				value: null,
				reason: null,
				listeners: [],
				then: function(e) {
					o.listeners.push(e);
				}
			};
			k.T === null ? o.isTransition = !1 : n(!0), r(o), n = t.pending, n === null ? (o.next = t.pending = o, qo(t, o)) : (o.next = n.next, t.pending = n.next = o);
		}
	}
	function qo(e, t) {
		var n = t.action, r = t.payload, i = e.state;
		if (t.isTransition) {
			var a = k.T, o = {};
			k.T = o;
			try {
				var s = n(i, r), c = k.S;
				c !== null && c(o, s), Jo(e, t, s);
			} catch (n) {
				Xo(e, t, n);
			} finally {
				a !== null && o.types !== null && (a.types = o.types), k.T = a;
			}
		} else try {
			a = n(i, r), Jo(e, t, a);
		} catch (n) {
			Xo(e, t, n);
		}
	}
	function Jo(e, t, n) {
		typeof n == "object" && n && typeof n.then == "function" ? n.then(function(n) {
			Yo(e, t, n);
		}, function(n) {
			return Xo(e, t, n);
		}) : Yo(e, t, n);
	}
	function Yo(e, t, n) {
		t.status = "fulfilled", t.value = n, Zo(t), e.state = n, t = e.pending, t !== null && (n = t.next, n === t ? e.pending = null : (n = n.next, t.next = n, qo(e, n)));
	}
	function Xo(e, t, n) {
		var r = e.pending;
		if (e.pending = null, r !== null) {
			r = r.next;
			do
				t.status = "rejected", t.reason = n, Zo(t), t = t.next;
			while (t !== r);
		}
		e.action = null;
	}
	function Zo(e) {
		e = e.listeners;
		for (var t = 0; t < e.length; t++) (0, e[t])();
	}
	function Qo(e, t) {
		return t;
	}
	function $o(e, t) {
		if (H) {
			var n = q.formState;
			if (n !== null) {
				a: {
					var r = U;
					if (H) {
						if (V) {
							b: {
								for (var i = V, a = Ni; i.nodeType !== 8;) {
									if (!a) {
										i = null;
										break b;
									}
									if (i = cf(i.nextSibling), i === null) {
										i = null;
										break b;
									}
								}
								a = i.data, i = a === "F!" || a === "F" ? i : null;
							}
							if (i) {
								V = cf(i.nextSibling), r = i.data === "F!";
								break a;
							}
						}
						Fi(r);
					}
					r = !1;
				}
				r && (t = n[0]);
			}
		}
		return n = Oo(), n.memoizedState = n.baseState = t, r = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: Qo,
			lastRenderedState: t
		}, n.queue = r, n = js.bind(null, U, r), r.dispatch = n, r = Wo(!1), a = Ns.bind(null, U, !1, r.queue), r = Oo(), i = {
			state: t,
			dispatch: null,
			action: e,
			pending: null
		}, r.queue = i, n = Ko.bind(null, U, i, a, n), i.dispatch = n, r.memoizedState = e, [
			t,
			n,
			!1
		];
	}
	function es(e) {
		return ts(ko(), W, e);
	}
	function ts(e, t, n) {
		if (t = Io(e, t, Qo)[0], e = Fo(Po)[0], typeof t == "object" && t && typeof t.then == "function") try {
			var r = jo(t);
		} catch (e) {
			throw e === ya ? xa : e;
		}
		else r = t;
		t = ko();
		var i = t.queue, a = i.dispatch;
		return n !== t.memoizedState && (U.flags |= 2048, is(9, { destroy: void 0 }, ns.bind(null, i, n), null)), [
			r,
			a,
			e
		];
	}
	function ns(e, t) {
		e.action = t;
	}
	function rs(e) {
		var t = ko(), n = W;
		if (n !== null) return ts(t, n, e);
		ko(), t = t.memoizedState, n = ko();
		var r = n.queue.dispatch;
		return n.memoizedState = e, [
			t,
			r,
			!1
		];
	}
	function is(e, t, n, r) {
		return e = {
			tag: e,
			create: n,
			deps: r,
			inst: t,
			next: null
		}, t = U.updateQueue, t === null && (t = Ao(), U.updateQueue = t), n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e), e;
	}
	function as() {
		return ko().memoizedState;
	}
	function os(e, t, n, r) {
		var i = Oo();
		U.flags |= e, i.memoizedState = is(1 | t, { destroy: void 0 }, n, r === void 0 ? null : r);
	}
	function ss(e, t, n, r) {
		var i = ko();
		r = r === void 0 ? null : r;
		var a = i.memoizedState.inst;
		W !== null && r !== null && bo(r, W.memoizedState.deps) ? i.memoizedState = is(t, a, n, r) : (U.flags |= e, i.memoizedState = is(1 | t, a, n, r));
	}
	function cs(e, t) {
		os(8390656, 8, e, t);
	}
	function ls(e, t) {
		ss(2048, 8, e, t);
	}
	function us(e) {
		U.flags |= 4;
		var t = U.updateQueue;
		if (t === null) t = Ao(), U.updateQueue = t, t.events = [e];
		else {
			var n = t.events;
			n === null ? t.events = [e] : n.push(e);
		}
	}
	function ds(e) {
		var t = ko().memoizedState;
		return us({
			ref: t,
			nextImpl: e
		}), function() {
			if (K & 2) throw Error(i(440));
			return t.impl.apply(void 0, arguments);
		};
	}
	function fs(e, t) {
		return ss(4, 2, e, t);
	}
	function ps(e, t) {
		return ss(4, 4, e, t);
	}
	function ms(e, t) {
		if (typeof t == "function") {
			e = e();
			var n = t(e);
			return function() {
				typeof n == "function" ? n() : t(null);
			};
		}
		if (t != null) return e = e(), t.current = e, function() {
			t.current = null;
		};
	}
	function hs(e, t, n) {
		n = n == null ? null : n.concat([e]), ss(4, 4, ms.bind(null, t, e), n);
	}
	function gs() {}
	function _s(e, t) {
		var n = ko();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		return t !== null && bo(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
	}
	function vs(e, t) {
		var n = ko();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		if (t !== null && bo(t, r[1])) return r[0];
		if (r = e(), mo) {
			Be(!0);
			try {
				e();
			} finally {
				Be(!1);
			}
		}
		return n.memoizedState = [r, t], r;
	}
	function ys(e, t, n) {
		return n === void 0 || lo & 1073741824 && !(Y & 261930) ? e.memoizedState = t : (e.memoizedState = n, e = mu(), U.lanes |= e, Gl |= e, n);
	}
	function bs(e, t, n, r) {
		return xr(n, t) ? n : Ya.current === null ? !(lo & 42) || lo & 1073741824 && !(Y & 261930) ? (nc = !0, e.memoizedState = n) : (e = mu(), U.lanes |= e, Gl |= e, t) : (e = ys(e, n, r), xr(e, t) || (nc = !0), e);
	}
	function xs(e, t, n, r, i) {
		var a = A.p;
		A.p = a !== 0 && 8 > a ? a : 8;
		var o = k.T, s = {};
		k.T = s, Ns(e, !1, t, n);
		try {
			var c = i(), l = k.S;
			l !== null && l(s, c), typeof c == "object" && c && typeof c.then == "function" ? Ms(e, t, pa(c, r), pu(e)) : Ms(e, t, r, pu(e));
		} catch (n) {
			Ms(e, t, {
				then: function() {},
				status: "rejected",
				reason: n
			}, pu());
		} finally {
			A.p = a, o !== null && s.types !== null && (o.types = s.types), k.T = o;
		}
	}
	function Ss() {}
	function Cs(e, t, n, r) {
		if (e.tag !== 5) throw Error(i(476));
		var a = ws(e).queue;
		xs(e, a, t, se, n === null ? Ss : function() {
			return Ts(e), n(r);
		});
	}
	function ws(e) {
		var t = e.memoizedState;
		if (t !== null) return t;
		t = {
			memoizedState: se,
			baseState: se,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Po,
				lastRenderedState: se
			},
			next: null
		};
		var n = {};
		return t.next = {
			memoizedState: n,
			baseState: n,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Po,
				lastRenderedState: n
			},
			next: null
		}, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
	}
	function Ts(e) {
		var t = ws(e);
		t.next === null && (t = e.alternate.memoizedState), Ms(e, t.next.queue, {}, pu());
	}
	function Es() {
		return Qi(Qf);
	}
	function Ds() {
		return ko().memoizedState;
	}
	function Os() {
		return ko().memoizedState;
	}
	function ks(e) {
		for (var t = e.return; t !== null;) {
			switch (t.tag) {
				case 24:
				case 3:
					var n = pu();
					e = Ba(n);
					var r = Va(t, e, n);
					r !== null && (hu(r, t, n), Ha(r, t, n)), t = { cache: aa() }, e.payload = t;
					return;
			}
			t = t.return;
		}
	}
	function As(e, t, n) {
		var r = pu();
		n = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, Ps(e) ? Fs(t, n) : (n = ei(e, t, n, r), n !== null && (hu(n, e, r), Is(n, t, r)));
	}
	function js(e, t, n) {
		Ms(e, t, n, pu());
	}
	function Ms(e, t, n, r) {
		var i = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		};
		if (Ps(e)) Fs(t, i);
		else {
			var a = e.alternate;
			if (e.lanes === 0 && (a === null || a.lanes === 0) && (a = t.lastRenderedReducer, a !== null)) try {
				var o = t.lastRenderedState, s = a(o, n);
				if (i.hasEagerState = !0, i.eagerState = s, xr(s, o)) return $r(e, t, i, 0), q === null && Qr(), !1;
			} catch {}
			if (n = ei(e, t, i, r), n !== null) return hu(n, e, r), Is(n, t, r), !0;
		}
		return !1;
	}
	function Ns(e, t, n, r) {
		if (r = {
			lane: 2,
			revertLane: dd(),
			gesture: null,
			action: r,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, Ps(e)) {
			if (t) throw Error(i(479));
		} else t = ei(e, n, r, 2), t !== null && hu(t, e, 2);
	}
	function Ps(e) {
		var t = e.alternate;
		return e === U || t !== null && t === U;
	}
	function Fs(e, t) {
		po = fo = !0;
		var n = e.pending;
		n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
	}
	function Is(e, t, n) {
		if (n & 4194048) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, rt(e, n);
		}
	}
	var Ls = {
		readContext: Qi,
		use: Mo,
		useCallback: yo,
		useContext: yo,
		useEffect: yo,
		useImperativeHandle: yo,
		useLayoutEffect: yo,
		useInsertionEffect: yo,
		useMemo: yo,
		useReducer: yo,
		useRef: yo,
		useState: yo,
		useDebugValue: yo,
		useDeferredValue: yo,
		useTransition: yo,
		useSyncExternalStore: yo,
		useId: yo,
		useHostTransitionStatus: yo,
		useFormState: yo,
		useActionState: yo,
		useOptimistic: yo,
		useMemoCache: yo,
		useCacheRefresh: yo
	};
	Ls.useEffectEvent = yo;
	var Rs = {
		readContext: Qi,
		use: Mo,
		useCallback: function(e, t) {
			return Oo().memoizedState = [e, t === void 0 ? null : t], e;
		},
		useContext: Qi,
		useEffect: cs,
		useImperativeHandle: function(e, t, n) {
			n = n == null ? null : n.concat([e]), os(4194308, 4, ms.bind(null, t, e), n);
		},
		useLayoutEffect: function(e, t) {
			return os(4194308, 4, e, t);
		},
		useInsertionEffect: function(e, t) {
			os(4, 2, e, t);
		},
		useMemo: function(e, t) {
			var n = Oo();
			t = t === void 0 ? null : t;
			var r = e();
			if (mo) {
				Be(!0);
				try {
					e();
				} finally {
					Be(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		},
		useReducer: function(e, t, n) {
			var r = Oo();
			if (n !== void 0) {
				var i = n(t);
				if (mo) {
					Be(!0);
					try {
						n(t);
					} finally {
						Be(!1);
					}
				}
			} else i = t;
			return r.memoizedState = r.baseState = i, e = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: e,
				lastRenderedState: i
			}, r.queue = e, e = e.dispatch = As.bind(null, U, e), [r.memoizedState, e];
		},
		useRef: function(e) {
			var t = Oo();
			return e = { current: e }, t.memoizedState = e;
		},
		useState: function(e) {
			e = Wo(e);
			var t = e.queue, n = js.bind(null, U, t);
			return t.dispatch = n, [e.memoizedState, n];
		},
		useDebugValue: gs,
		useDeferredValue: function(e, t) {
			return ys(Oo(), e, t);
		},
		useTransition: function() {
			var e = Wo(!1);
			return e = xs.bind(null, U, e.queue, !0, !1), Oo().memoizedState = e, [!1, e];
		},
		useSyncExternalStore: function(e, t, n) {
			var r = U, a = Oo();
			if (H) {
				if (n === void 0) throw Error(i(407));
				n = n();
			} else {
				if (n = t(), q === null) throw Error(i(349));
				Y & 127 || zo(r, t, n);
			}
			a.memoizedState = n;
			var o = {
				value: n,
				getSnapshot: t
			};
			return a.queue = o, cs(Vo.bind(null, r, o, e), [e]), r.flags |= 2048, is(9, { destroy: void 0 }, Bo.bind(null, r, o, n, t), null), n;
		},
		useId: function() {
			var e = Oo(), t = q.identifierPrefix;
			if (H) {
				var n = Ti, r = wi;
				n = (r & ~(1 << 32 - Ve(r) - 1)).toString(32) + n, t = "_" + t + "R_" + n, n = ho++, 0 < n && (t += "H" + n.toString(32)), t += "_";
			} else n = vo++, t = "_" + t + "r_" + n.toString(32) + "_";
			return e.memoizedState = t;
		},
		useHostTransitionStatus: Es,
		useFormState: $o,
		useActionState: $o,
		useOptimistic: function(e) {
			var t = Oo();
			t.memoizedState = t.baseState = e;
			var n = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: null,
				lastRenderedState: null
			};
			return t.queue = n, t = Ns.bind(null, U, !0, n), n.dispatch = t, [e, t];
		},
		useMemoCache: No,
		useCacheRefresh: function() {
			return Oo().memoizedState = ks.bind(null, U);
		},
		useEffectEvent: function(e) {
			var t = Oo(), n = { impl: e };
			return t.memoizedState = n, function() {
				if (K & 2) throw Error(i(440));
				return n.impl.apply(void 0, arguments);
			};
		}
	}, zs = {
		readContext: Qi,
		use: Mo,
		useCallback: _s,
		useContext: Qi,
		useEffect: ls,
		useImperativeHandle: hs,
		useInsertionEffect: fs,
		useLayoutEffect: ps,
		useMemo: vs,
		useReducer: Fo,
		useRef: as,
		useState: function() {
			return Fo(Po);
		},
		useDebugValue: gs,
		useDeferredValue: function(e, t) {
			return bs(ko(), W.memoizedState, e, t);
		},
		useTransition: function() {
			var e = Fo(Po)[0], t = ko().memoizedState;
			return [typeof e == "boolean" ? e : jo(e), t];
		},
		useSyncExternalStore: Ro,
		useId: Ds,
		useHostTransitionStatus: Es,
		useFormState: es,
		useActionState: es,
		useOptimistic: function(e, t) {
			return Go(ko(), W, e, t);
		},
		useMemoCache: No,
		useCacheRefresh: Os
	};
	zs.useEffectEvent = ds;
	var Bs = {
		readContext: Qi,
		use: Mo,
		useCallback: _s,
		useContext: Qi,
		useEffect: ls,
		useImperativeHandle: hs,
		useInsertionEffect: fs,
		useLayoutEffect: ps,
		useMemo: vs,
		useReducer: Lo,
		useRef: as,
		useState: function() {
			return Lo(Po);
		},
		useDebugValue: gs,
		useDeferredValue: function(e, t) {
			var n = ko();
			return W === null ? ys(n, e, t) : bs(n, W.memoizedState, e, t);
		},
		useTransition: function() {
			var e = Lo(Po)[0], t = ko().memoizedState;
			return [typeof e == "boolean" ? e : jo(e), t];
		},
		useSyncExternalStore: Ro,
		useId: Ds,
		useHostTransitionStatus: Es,
		useFormState: rs,
		useActionState: rs,
		useOptimistic: function(e, t) {
			var n = ko();
			return W === null ? (n.baseState = e, [e, n.queue.dispatch]) : Go(n, W, e, t);
		},
		useMemoCache: No,
		useCacheRefresh: Os
	};
	Bs.useEffectEvent = ds;
	function Vs(e, t, n, r) {
		t = e.memoizedState, n = n(r, t), n = n == null ? t : h({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
	}
	var Hs = {
		enqueueSetState: function(e, t, n) {
			e = e._reactInternals;
			var r = pu(), i = Ba(r);
			i.payload = t, n != null && (i.callback = n), t = Va(e, i, r), t !== null && (hu(t, e, r), Ha(t, e, r));
		},
		enqueueReplaceState: function(e, t, n) {
			e = e._reactInternals;
			var r = pu(), i = Ba(r);
			i.tag = 1, i.payload = t, n != null && (i.callback = n), t = Va(e, i, r), t !== null && (hu(t, e, r), Ha(t, e, r));
		},
		enqueueForceUpdate: function(e, t) {
			e = e._reactInternals;
			var n = pu(), r = Ba(n);
			r.tag = 2, t != null && (r.callback = t), t = Va(e, r, n), t !== null && (hu(t, e, n), Ha(t, e, n));
		}
	};
	function Us(e, t, n, r, i, a, o) {
		return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, a, o) : t.prototype && t.prototype.isPureReactComponent ? !Sr(n, r) || !Sr(i, a) : !0;
	}
	function Ws(e, t, n, r) {
		e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Hs.enqueueReplaceState(t, t.state, null);
	}
	function Gs(e, t) {
		var n = t;
		if ("ref" in t) for (var r in n = {}, t) r !== "ref" && (n[r] = t[r]);
		if (e = e.defaultProps) for (var i in n === t && (n = h({}, n)), e) n[i] === void 0 && (n[i] = e[i]);
		return n;
	}
	function Ks(e) {
		Yr(e);
	}
	function qs(e) {
		console.error(e);
	}
	function Js(e) {
		Yr(e);
	}
	function Ys(e, t) {
		try {
			var n = e.onUncaughtError;
			n(t.value, { componentStack: t.stack });
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Xs(e, t, n) {
		try {
			var r = e.onCaughtError;
			r(n.value, {
				componentStack: n.stack,
				errorBoundary: t.tag === 1 ? t.stateNode : null
			});
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Zs(e, t, n) {
		return n = Ba(n), n.tag = 3, n.payload = { element: null }, n.callback = function() {
			Ys(e, t);
		}, n;
	}
	function Qs(e) {
		return e = Ba(e), e.tag = 3, e;
	}
	function $s(e, t, n, r) {
		var i = n.type.getDerivedStateFromError;
		if (typeof i == "function") {
			var a = r.value;
			e.payload = function() {
				return i(a);
			}, e.callback = function() {
				Xs(t, n, r);
			};
		}
		var o = n.stateNode;
		o !== null && typeof o.componentDidCatch == "function" && (e.callback = function() {
			Xs(t, n, r), typeof i != "function" && (ru === null ? ru = /* @__PURE__ */ new Set([this]) : ru.add(this));
			var e = r.stack;
			this.componentDidCatch(r.value, { componentStack: e === null ? "" : e });
		});
	}
	function ec(e, t, n, r, a) {
		if (n.flags |= 32768, typeof r == "object" && r && typeof r.then == "function") {
			if (t = n.alternate, t !== null && Yi(t, n, a, !0), n = eo.current, n !== null) {
				switch (n.tag) {
					case 31:
					case 13: return to === null ? Du() : n.alternate === null && Wl === 0 && (Wl = 3), n.flags &= -257, n.flags |= 65536, n.lanes = a, r === Sa ? n.flags |= 16384 : (t = n.updateQueue, t === null ? n.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), Gu(e, r, a)), !1;
					case 22: return n.flags |= 65536, r === Sa ? n.flags |= 16384 : (t = n.updateQueue, t === null ? (t = {
						transitions: null,
						markerInstances: null,
						retryQueue: /* @__PURE__ */ new Set([r])
					}, n.updateQueue = t) : (n = t.retryQueue, n === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : n.add(r)), Gu(e, r, a)), !1;
				}
				throw Error(i(435, n.tag));
			}
			return Gu(e, r, a), Du(), !1;
		}
		if (H) return t = eo.current, t === null ? (r !== Pi && (t = Error(i(423), { cause: r }), Vi(gi(t, n))), e = e.current.alternate, e.flags |= 65536, a &= -a, e.lanes |= a, r = gi(r, n), a = Zs(e.stateNode, r, a), Ua(e, a), Wl !== 4 && (Wl = 2)) : (!(t.flags & 65536) && (t.flags |= 256), t.flags |= 65536, t.lanes = a, r !== Pi && (e = Error(i(422), { cause: r }), Vi(gi(e, n)))), !1;
		var o = Error(i(520), { cause: r });
		if (o = gi(o, n), Xl === null ? Xl = [o] : Xl.push(o), Wl !== 4 && (Wl = 2), t === null) return !0;
		r = gi(r, n), n = t;
		do {
			switch (n.tag) {
				case 3: return n.flags |= 65536, e = a & -a, n.lanes |= e, e = Zs(n.stateNode, r, e), Ua(n, e), !1;
				case 1: if (t = n.type, o = n.stateNode, !(n.flags & 128) && (typeof t.getDerivedStateFromError == "function" || o !== null && typeof o.componentDidCatch == "function" && (ru === null || !ru.has(o)))) return n.flags |= 65536, a &= -a, n.lanes |= a, a = Qs(a), $s(a, e, n, r), Ua(n, a), !1;
			}
			n = n.return;
		} while (n !== null);
		return !1;
	}
	var tc = Error(i(461)), nc = !1;
	function rc(e, t, n, r) {
		t.child = e === null ? Ia(t, null, n, r) : Fa(t, e.child, n, r);
	}
	function ic(e, t, n, r, i) {
		n = n.render;
		var a = t.ref;
		if ("ref" in r) {
			var o = {};
			for (var s in r) s !== "ref" && (o[s] = r[s]);
		} else o = r;
		return Zi(t), r = xo(e, t, n, o, a, i), s = To(), e !== null && !nc ? (Eo(e, t, i), Oc(e, t, i)) : (H && s && Oi(t), t.flags |= 1, rc(e, t, r, i), t.child);
	}
	function ac(e, t, n, r, i) {
		if (e === null) {
			var a = n.type;
			return typeof a == "function" && !si(a) && a.defaultProps === void 0 && n.compare === null ? (t.tag = 15, t.type = a, oc(e, t, a, r, i)) : (e = ui(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
		}
		if (a = e.child, !kc(e, i)) {
			var o = a.memoizedProps;
			if (n = n.compare, n = n === null ? Sr : n, n(o, r) && e.ref === t.ref) return Oc(e, t, i);
		}
		return t.flags |= 1, e = ci(a, r), e.ref = t.ref, e.return = t, t.child = e;
	}
	function oc(e, t, n, r, i) {
		if (e !== null) {
			var a = e.memoizedProps;
			if (Sr(a, r) && e.ref === t.ref) if (nc = !1, t.pendingProps = r = a, kc(e, i)) e.flags & 131072 && (nc = !0);
			else return t.lanes = e.lanes, Oc(e, t, i);
		}
		return mc(e, t, n, r, i);
	}
	function sc(e, t, n, r) {
		var i = r.children, a = e === null ? null : e.memoizedState;
		if (e === null && t.stateNode === null && (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), r.mode === "hidden") {
			if (t.flags & 128) {
				if (a = a === null ? n : a.baseLanes | n, e !== null) {
					for (r = t.child = e.child, i = 0; r !== null;) i = i | r.lanes | r.childLanes, r = r.sibling;
					r = i & ~a;
				} else r = 0, t.child = null;
				return lc(e, t, a, n, r);
			}
			if (n & 536870912) t.memoizedState = {
				baseLanes: 0,
				cachePool: null
			}, e !== null && _a(t, a === null ? null : a.cachePool), a === null ? Qa() : Za(t, a), io(t);
			else return r = t.lanes = 536870912, lc(e, t, a === null ? n : a.baseLanes | n, n, r);
		} else a === null ? (e !== null && _a(t, null), Qa(), ao(t)) : (_a(t, a.cachePool), Za(t, a), ao(t), t.memoizedState = null);
		return rc(e, t, i, n), t.child;
	}
	function cc(e, t) {
		return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), t.sibling;
	}
	function lc(e, t, n, r, i) {
		var a = ga();
		return a = a === null ? null : {
			parent: ia._currentValue,
			pool: a
		}, t.memoizedState = {
			baseLanes: n,
			cachePool: a
		}, e !== null && _a(t, null), Qa(), io(t), e !== null && Yi(e, t, r, !0), t.childLanes = i, null;
	}
	function uc(e, t) {
		return t = Cc({
			mode: t.mode,
			children: t.children
		}, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
	}
	function dc(e, t, n) {
		return Fa(t, e.child, null, n), e = uc(t, t.pendingProps), e.flags |= 2, oo(t), t.memoizedState = null, e;
	}
	function fc(e, t, n) {
		var r = t.pendingProps, a = (t.flags & 128) != 0;
		if (t.flags &= -129, e === null) {
			if (H) {
				if (r.mode === "hidden") return e = uc(t, r), t.lanes = 536870912, cc(null, e);
				if (ro(t), (e = V) ? (e = rf(e, Ni), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: Ci === null ? null : {
						id: wi,
						overflow: Ti
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = pi(e), n.return = t, t.child = n, ji = t, V = null)) : e = null, e === null) throw Fi(t);
				return t.lanes = 536870912, null;
			}
			return uc(t, r);
		}
		var o = e.memoizedState;
		if (o !== null) {
			var s = o.dehydrated;
			if (ro(t), a) if (t.flags & 256) t.flags &= -257, t = dc(e, t, n);
			else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
			else throw Error(i(558));
			else if (nc || Yi(e, t, n, !1), a = (n & e.childLanes) !== 0, nc || a) {
				if (r = q, r !== null && (s = it(r, n), s !== 0 && s !== o.retryLane)) throw o.retryLane = s, ti(e, s), hu(r, e, s), tc;
				Du(), t = dc(e, t, n);
			} else e = o.treeContext, V = cf(s.nextSibling), ji = t, H = !0, Mi = null, Ni = !1, e !== null && Ai(t, e), t = uc(t, r), t.flags |= 4096;
			return t;
		}
		return e = ci(e.child, {
			mode: r.mode,
			children: r.children
		}), e.ref = t.ref, t.child = e, e.return = t, e;
	}
	function pc(e, t) {
		var n = t.ref;
		if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
		else {
			if (typeof n != "function" && typeof n != "object") throw Error(i(284));
			(e === null || e.ref !== n) && (t.flags |= 4194816);
		}
	}
	function mc(e, t, n, r, i) {
		return Zi(t), n = xo(e, t, n, r, void 0, i), r = To(), e !== null && !nc ? (Eo(e, t, i), Oc(e, t, i)) : (H && r && Oi(t), t.flags |= 1, rc(e, t, n, i), t.child);
	}
	function hc(e, t, n, r, i, a) {
		return Zi(t), t.updateQueue = null, n = Co(t, r, n, i), So(e), r = To(), e !== null && !nc ? (Eo(e, t, a), Oc(e, t, a)) : (H && r && Oi(t), t.flags |= 1, rc(e, t, n, a), t.child);
	}
	function gc(e, t, n, r, i) {
		if (Zi(t), t.stateNode === null) {
			var a = ii, o = n.contextType;
			typeof o == "object" && o && (a = Qi(o)), a = new n(r, a), t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null, a.updater = Hs, t.stateNode = a, a._reactInternals = t, a = t.stateNode, a.props = r, a.state = t.memoizedState, a.refs = {}, Ra(t), o = n.contextType, a.context = typeof o == "object" && o ? Qi(o) : ii, a.state = t.memoizedState, o = n.getDerivedStateFromProps, typeof o == "function" && (Vs(t, n, o, r), a.state = t.memoizedState), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function" || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (o = a.state, typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount(), o !== a.state && Hs.enqueueReplaceState(a, a.state, null), Ka(t, r, a, i), Ga(), a.state = t.memoizedState), typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
		} else if (e === null) {
			a = t.stateNode;
			var s = t.memoizedProps, c = Gs(n, s);
			a.props = c;
			var l = a.context, u = n.contextType;
			o = ii, typeof u == "object" && u && (o = Qi(u));
			var d = n.getDerivedStateFromProps;
			u = typeof d == "function" || typeof a.getSnapshotBeforeUpdate == "function", s = t.pendingProps !== s, u || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (s || l !== o) && Ws(t, a, r, o), La = !1;
			var f = t.memoizedState;
			a.state = f, Ka(t, r, a, i), Ga(), l = t.memoizedState, s || f !== l || La ? (typeof d == "function" && (Vs(t, n, d, r), l = t.memoizedState), (c = La || Us(t, n, c, r, f, l, o)) ? (u || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount()), typeof a.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = l), a.props = r, a.state = l, a.context = o, r = c) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
		} else {
			a = t.stateNode, za(e, t), o = t.memoizedProps, u = Gs(n, o), a.props = u, d = t.pendingProps, f = a.context, l = n.contextType, c = ii, typeof l == "object" && l && (c = Qi(l)), s = n.getDerivedStateFromProps, (l = typeof s == "function" || typeof a.getSnapshotBeforeUpdate == "function") || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (o !== d || f !== c) && Ws(t, a, r, c), La = !1, f = t.memoizedState, a.state = f, Ka(t, r, a, i), Ga();
			var p = t.memoizedState;
			o !== d || f !== p || La || e !== null && e.dependencies !== null && Xi(e.dependencies) ? (typeof s == "function" && (Vs(t, n, s, r), p = t.memoizedState), (u = La || Us(t, n, u, r, f, p, c) || e !== null && e.dependencies !== null && Xi(e.dependencies)) ? (l || typeof a.UNSAFE_componentWillUpdate != "function" && typeof a.componentWillUpdate != "function" || (typeof a.componentWillUpdate == "function" && a.componentWillUpdate(r, p, c), typeof a.UNSAFE_componentWillUpdate == "function" && a.UNSAFE_componentWillUpdate(r, p, c)), typeof a.componentDidUpdate == "function" && (t.flags |= 4), typeof a.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = p), a.props = r, a.state = p, a.context = c, r = u) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), r = !1);
		}
		return a = r, pc(e, t), r = (t.flags & 128) != 0, a || r ? (a = t.stateNode, n = r && typeof n.getDerivedStateFromError != "function" ? null : a.render(), t.flags |= 1, e !== null && r ? (t.child = Fa(t, e.child, null, i), t.child = Fa(t, null, n, i)) : rc(e, t, n, i), t.memoizedState = a.state, e = t.child) : e = Oc(e, t, i), e;
	}
	function _c(e, t, n, r) {
		return zi(), t.flags |= 256, rc(e, t, n, r), t.child;
	}
	var vc = {
		dehydrated: null,
		treeContext: null,
		retryLane: 0,
		hydrationErrors: null
	};
	function yc(e) {
		return {
			baseLanes: e,
			cachePool: va()
		};
	}
	function bc(e, t, n) {
		return e = e === null ? 0 : e.childLanes & ~n, t && (e |= Jl), e;
	}
	function xc(e, t, n) {
		var r = t.pendingProps, a = !1, o = (t.flags & 128) != 0, s;
		if ((s = o) || (s = e !== null && e.memoizedState === null ? !1 : (so.current & 2) != 0), s && (a = !0, t.flags &= -129), s = (t.flags & 32) != 0, t.flags &= -33, e === null) {
			if (H) {
				if (a ? no(t) : ao(t), (e = V) ? (e = rf(e, Ni), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: Ci === null ? null : {
						id: wi,
						overflow: Ti
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = pi(e), n.return = t, t.child = n, ji = t, V = null)) : e = null, e === null) throw Fi(t);
				return of(e) ? t.lanes = 32 : t.lanes = 536870912, null;
			}
			var c = r.children;
			return r = r.fallback, a ? (ao(t), a = t.mode, c = Cc({
				mode: "hidden",
				children: c
			}, a), r = di(r, a, n, null), c.return = t, r.return = t, c.sibling = r, t.child = c, r = t.child, r.memoizedState = yc(n), r.childLanes = bc(e, s, n), t.memoizedState = vc, cc(null, r)) : (no(t), Sc(t, c));
		}
		var l = e.memoizedState;
		if (l !== null && (c = l.dehydrated, c !== null)) {
			if (o) t.flags & 256 ? (no(t), t.flags &= -257, t = wc(e, t, n)) : t.memoizedState === null ? (ao(t), c = r.fallback, a = t.mode, r = Cc({
				mode: "visible",
				children: r.children
			}, a), c = di(c, a, n, null), c.flags |= 2, r.return = t, c.return = t, r.sibling = c, t.child = r, Fa(t, e.child, null, n), r = t.child, r.memoizedState = yc(n), r.childLanes = bc(e, s, n), t.memoizedState = vc, t = cc(null, r)) : (ao(t), t.child = e.child, t.flags |= 128, t = null);
			else if (no(t), of(c)) {
				if (s = c.nextSibling && c.nextSibling.dataset, s) var u = s.dgst;
				s = u, r = Error(i(419)), r.stack = "", r.digest = s, Vi({
					value: r,
					source: null,
					stack: null
				}), t = wc(e, t, n);
			} else if (nc || Yi(e, t, n, !1), s = (n & e.childLanes) !== 0, nc || s) {
				if (s = q, s !== null && (r = it(s, n), r !== 0 && r !== l.retryLane)) throw l.retryLane = r, ti(e, r), hu(s, e, r), tc;
				af(c) || Du(), t = wc(e, t, n);
			} else af(c) ? (t.flags |= 192, t.child = e.child, t = null) : (e = l.treeContext, V = cf(c.nextSibling), ji = t, H = !0, Mi = null, Ni = !1, e !== null && Ai(t, e), t = Sc(t, r.children), t.flags |= 4096);
			return t;
		}
		return a ? (ao(t), c = r.fallback, a = t.mode, l = e.child, u = l.sibling, r = ci(l, {
			mode: "hidden",
			children: r.children
		}), r.subtreeFlags = l.subtreeFlags & 65011712, u === null ? (c = di(c, a, n, null), c.flags |= 2) : c = ci(u, c), c.return = t, r.return = t, r.sibling = c, t.child = r, cc(null, r), r = t.child, c = e.child.memoizedState, c === null ? c = yc(n) : (a = c.cachePool, a === null ? a = va() : (l = ia._currentValue, a = a.parent === l ? a : {
			parent: l,
			pool: l
		}), c = {
			baseLanes: c.baseLanes | n,
			cachePool: a
		}), r.memoizedState = c, r.childLanes = bc(e, s, n), t.memoizedState = vc, cc(e.child, r)) : (no(t), n = e.child, e = n.sibling, n = ci(n, {
			mode: "visible",
			children: r.children
		}), n.return = t, n.sibling = null, e !== null && (s = t.deletions, s === null ? (t.deletions = [e], t.flags |= 16) : s.push(e)), t.child = n, t.memoizedState = null, n);
	}
	function Sc(e, t) {
		return t = Cc({
			mode: "visible",
			children: t
		}, e.mode), t.return = e, e.child = t;
	}
	function Cc(e, t) {
		return e = oi(22, e, null, t), e.lanes = 0, e;
	}
	function wc(e, t, n) {
		return Fa(t, e.child, null, n), e = Sc(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
	}
	function Tc(e, t, n) {
		e.lanes |= t;
		var r = e.alternate;
		r !== null && (r.lanes |= t), qi(e.return, t, n);
	}
	function Ec(e, t, n, r, i, a) {
		var o = e.memoizedState;
		o === null ? e.memoizedState = {
			isBackwards: t,
			rendering: null,
			renderingStartTime: 0,
			last: r,
			tail: n,
			tailMode: i,
			treeForkCount: a
		} : (o.isBackwards = t, o.rendering = null, o.renderingStartTime = 0, o.last = r, o.tail = n, o.tailMode = i, o.treeForkCount = a);
	}
	function Dc(e, t, n) {
		var r = t.pendingProps, i = r.revealOrder, a = r.tail;
		r = r.children;
		var o = so.current, s = (o & 2) != 0;
		if (s ? (o = o & 1 | 2, t.flags |= 128) : o &= 1, N(so, o), rc(e, t, r, n), r = H ? bi : 0, !s && e !== null && e.flags & 128) a: for (e = t.child; e !== null;) {
			if (e.tag === 13) e.memoizedState !== null && Tc(e, n, t);
			else if (e.tag === 19) Tc(e, n, t);
			else if (e.child !== null) {
				e.child.return = e, e = e.child;
				continue;
			}
			if (e === t) break a;
			for (; e.sibling === null;) {
				if (e.return === null || e.return === t) break a;
				e = e.return;
			}
			e.sibling.return = e.return, e = e.sibling;
		}
		switch (i) {
			case "forwards":
				for (n = t.child, i = null; n !== null;) e = n.alternate, e !== null && co(e) === null && (i = n), n = n.sibling;
				n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), Ec(t, !1, i, n, a, r);
				break;
			case "backwards":
			case "unstable_legacy-backwards":
				for (n = null, i = t.child, t.child = null; i !== null;) {
					if (e = i.alternate, e !== null && co(e) === null) {
						t.child = i;
						break;
					}
					e = i.sibling, i.sibling = n, n = i, i = e;
				}
				Ec(t, !0, n, null, a, r);
				break;
			case "together":
				Ec(t, !1, null, null, void 0, r);
				break;
			default: t.memoizedState = null;
		}
		return t.child;
	}
	function Oc(e, t, n) {
		if (e !== null && (t.dependencies = e.dependencies), Gl |= t.lanes, (n & t.childLanes) === 0) if (e !== null) {
			if (Yi(e, t, n, !1), (n & t.childLanes) === 0) return null;
		} else return null;
		if (e !== null && t.child !== e.child) throw Error(i(153));
		if (t.child !== null) {
			for (e = t.child, n = ci(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;) e = e.sibling, n = n.sibling = ci(e, e.pendingProps), n.return = t;
			n.sibling = null;
		}
		return t.child;
	}
	function kc(e, t) {
		return (e.lanes & t) === 0 ? (e = e.dependencies, !!(e !== null && Xi(e))) : !0;
	}
	function Ac(e, t, n) {
		switch (t.tag) {
			case 3:
				pe(t, t.stateNode.containerInfo), Gi(t, ia, e.memoizedState.cache), zi();
				break;
			case 27:
			case 5:
				he(t);
				break;
			case 4:
				pe(t, t.stateNode.containerInfo);
				break;
			case 10:
				Gi(t, t.type, t.memoizedProps.value);
				break;
			case 31:
				if (t.memoizedState !== null) return t.flags |= 128, ro(t), null;
				break;
			case 13:
				var r = t.memoizedState;
				if (r !== null) return r.dehydrated === null ? (n & t.child.childLanes) === 0 ? (no(t), e = Oc(e, t, n), e === null ? null : e.sibling) : xc(e, t, n) : (no(t), t.flags |= 128, null);
				no(t);
				break;
			case 19:
				var i = (e.flags & 128) != 0;
				if (r = (n & t.childLanes) !== 0, r ||= (Yi(e, t, n, !1), (n & t.childLanes) !== 0), i) {
					if (r) return Dc(e, t, n);
					t.flags |= 128;
				}
				if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), N(so, so.current), r) break;
				return null;
			case 22: return t.lanes = 0, sc(e, t, n, t.pendingProps);
			case 24: Gi(t, ia, e.memoizedState.cache);
		}
		return Oc(e, t, n);
	}
	function jc(e, t, n) {
		if (e !== null) if (e.memoizedProps !== t.pendingProps) nc = !0;
		else {
			if (!kc(e, n) && !(t.flags & 128)) return nc = !1, Ac(e, t, n);
			nc = !!(e.flags & 131072);
		}
		else nc = !1, H && t.flags & 1048576 && Di(t, bi, t.index);
		switch (t.lanes = 0, t.tag) {
			case 16:
				a: {
					var r = t.pendingProps;
					if (e = Ta(t.elementType), t.type = e, typeof e == "function") si(e) ? (r = Gs(e, r), t.tag = 1, t = gc(null, t, e, r, n)) : (t.tag = 0, t = mc(null, t, e, r, n));
					else {
						if (e != null) {
							var a = e.$$typeof;
							if (a === w) {
								t.tag = 11, t = ic(null, t, e, r, n);
								break a;
							} else if (a === ee) {
								t.tag = 14, t = ac(null, t, e, r, n);
								break a;
							}
						}
						throw t = ae(e) || e, Error(i(306, t, ""));
					}
				}
				return t;
			case 0: return mc(e, t, t.type, t.pendingProps, n);
			case 1: return r = t.type, a = Gs(r, t.pendingProps), gc(e, t, r, a, n);
			case 3:
				a: {
					if (pe(t, t.stateNode.containerInfo), e === null) throw Error(i(387));
					r = t.pendingProps;
					var o = t.memoizedState;
					a = o.element, za(e, t), Ka(t, r, null, n);
					var s = t.memoizedState;
					if (r = s.cache, Gi(t, ia, r), r !== o.cache && Ji(t, [ia], n, !0), Ga(), r = s.element, o.isDehydrated) if (o = {
						element: r,
						isDehydrated: !1,
						cache: s.cache
					}, t.updateQueue.baseState = o, t.memoizedState = o, t.flags & 256) {
						t = _c(e, t, r, n);
						break a;
					} else if (r !== a) {
						a = gi(Error(i(424)), t), Vi(a), t = _c(e, t, r, n);
						break a;
					} else {
						switch (e = t.stateNode.containerInfo, e.nodeType) {
							case 9:
								e = e.body;
								break;
							default: e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
						}
						for (V = cf(e.firstChild), ji = t, H = !0, Mi = null, Ni = !0, n = Ia(t, null, r, n), t.child = n; n;) n.flags = n.flags & -3 | 4096, n = n.sibling;
					}
					else {
						if (zi(), r === a) {
							t = Oc(e, t, n);
							break a;
						}
						rc(e, t, r, n);
					}
					t = t.child;
				}
				return t;
			case 26: return pc(e, t), e === null ? (n = kf(t.type, null, t.pendingProps, null)) ? t.memoizedState = n : H || (n = t.type, e = t.pendingProps, r = Bd(de.current).createElement(n), r[ut] = t, r[dt] = e, Pd(r, n, e), Ct(r), t.stateNode = r) : t.memoizedState = kf(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
			case 27: return he(t), e === null && H && (r = t.stateNode = ff(t.type, t.pendingProps, de.current), ji = t, Ni = !0, a = V, Zd(t.type) ? (lf = a, V = cf(r.firstChild)) : V = a), rc(e, t, t.pendingProps.children, n), pc(e, t), e === null && (t.flags |= 4194304), t.child;
			case 5: return e === null && H && ((a = r = V) && (r = tf(r, t.type, t.pendingProps, Ni), r === null ? a = !1 : (t.stateNode = r, ji = t, V = cf(r.firstChild), Ni = !1, a = !0)), a || Fi(t)), he(t), a = t.type, o = t.pendingProps, s = e === null ? null : e.memoizedProps, r = o.children, Ud(a, o) ? r = null : s !== null && Ud(a, s) && (t.flags |= 32), t.memoizedState !== null && (a = xo(e, t, wo, null, null, n), Qf._currentValue = a), pc(e, t), rc(e, t, r, n), t.child;
			case 6: return e === null && H && ((e = n = V) && (n = nf(n, t.pendingProps, Ni), n === null ? e = !1 : (t.stateNode = n, ji = t, V = null, e = !0)), e || Fi(t)), null;
			case 13: return xc(e, t, n);
			case 4: return pe(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Fa(t, null, r, n) : rc(e, t, r, n), t.child;
			case 11: return ic(e, t, t.type, t.pendingProps, n);
			case 7: return rc(e, t, t.pendingProps, n), t.child;
			case 8: return rc(e, t, t.pendingProps.children, n), t.child;
			case 12: return rc(e, t, t.pendingProps.children, n), t.child;
			case 10: return r = t.pendingProps, Gi(t, t.type, r.value), rc(e, t, r.children, n), t.child;
			case 9: return a = t.type._context, r = t.pendingProps.children, Zi(t), a = Qi(a), r = r(a), t.flags |= 1, rc(e, t, r, n), t.child;
			case 14: return ac(e, t, t.type, t.pendingProps, n);
			case 15: return oc(e, t, t.type, t.pendingProps, n);
			case 19: return Dc(e, t, n);
			case 31: return fc(e, t, n);
			case 22: return sc(e, t, n, t.pendingProps);
			case 24: return Zi(t), r = Qi(ia), e === null ? (a = ga(), a === null && (a = q, o = aa(), a.pooledCache = o, o.refCount++, o !== null && (a.pooledCacheLanes |= n), a = o), t.memoizedState = {
				parent: r,
				cache: a
			}, Ra(t), Gi(t, ia, a)) : ((e.lanes & n) !== 0 && (za(e, t), Ka(t, null, null, n), Ga()), a = e.memoizedState, o = t.memoizedState, a.parent === r ? (r = o.cache, Gi(t, ia, r), r !== a.cache && Ji(t, [ia], n, !0)) : (a = {
				parent: r,
				cache: r
			}, t.memoizedState = a, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = a), Gi(t, ia, r))), rc(e, t, t.pendingProps.children, n), t.child;
			case 29: throw t.pendingProps;
		}
		throw Error(i(156, t.tag));
	}
	function Mc(e) {
		e.flags |= 4;
	}
	function Nc(e, t, n, r, i) {
		if ((t = (e.mode & 32) != 0) && (t = !1), t) {
			if (e.flags |= 16777216, (i & 335544128) === i) if (e.stateNode.complete) e.flags |= 8192;
			else if (wu()) e.flags |= 8192;
			else throw Ea = Sa, ba;
		} else e.flags &= -16777217;
	}
	function Pc(e, t) {
		if (t.type !== "stylesheet" || t.state.loading & 4) e.flags &= -16777217;
		else if (e.flags |= 16777216, !Wf(t)) if (wu()) e.flags |= 8192;
		else throw Ea = Sa, ba;
	}
	function Fc(e, t) {
		t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag === 22 ? 536870912 : Qe(), e.lanes |= t, Yl |= t);
	}
	function Ic(e, t) {
		if (!H) switch (e.tailMode) {
			case "hidden":
				t = e.tail;
				for (var n = null; t !== null;) t.alternate !== null && (n = t), t = t.sibling;
				n === null ? e.tail = null : n.sibling = null;
				break;
			case "collapsed":
				n = e.tail;
				for (var r = null; n !== null;) n.alternate !== null && (r = n), n = n.sibling;
				r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
		}
	}
	function G(e) {
		var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
		if (t) for (var i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 65011712, r |= i.flags & 65011712, i.return = e, i = i.sibling;
		else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
		return e.subtreeFlags |= r, e.childLanes = n, t;
	}
	function Lc(e, t, n) {
		var r = t.pendingProps;
		switch (ki(t), t.tag) {
			case 16:
			case 15:
			case 0:
			case 11:
			case 7:
			case 8:
			case 12:
			case 9:
			case 14: return G(t), null;
			case 1: return G(t), null;
			case 3: return n = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Ki(ia), me(), n.pendingContext && (n.context = n.pendingContext, n.pendingContext = null), (e === null || e.child === null) && (Ri(t) ? Mc(t) : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Bi())), G(t), null;
			case 26:
				var a = t.type, o = t.memoizedState;
				return e === null ? (Mc(t), o === null ? (G(t), Nc(t, a, null, r, n)) : (G(t), Pc(t, o))) : o ? o === e.memoizedState ? (G(t), t.flags &= -16777217) : (Mc(t), G(t), Pc(t, o)) : (e = e.memoizedProps, e !== r && Mc(t), G(t), Nc(t, a, e, r, n)), null;
			case 27:
				if (ge(t), n = de.current, a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && Mc(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return G(t), null;
					}
					e = ue.current, Ri(t) ? Ii(t, e) : (e = ff(a, r, n), t.stateNode = e, Mc(t));
				}
				return G(t), null;
			case 5:
				if (ge(t), a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && Mc(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return G(t), null;
					}
					if (o = ue.current, Ri(t)) Ii(t, o);
					else {
						var s = Bd(de.current);
						switch (o) {
							case 1:
								o = s.createElementNS("http://www.w3.org/2000/svg", a);
								break;
							case 2:
								o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
								break;
							default: switch (a) {
								case "svg":
									o = s.createElementNS("http://www.w3.org/2000/svg", a);
									break;
								case "math":
									o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
									break;
								case "script":
									o = s.createElement("div"), o.innerHTML = "<script><\/script>", o = o.removeChild(o.firstChild);
									break;
								case "select":
									o = typeof r.is == "string" ? s.createElement("select", { is: r.is }) : s.createElement("select"), r.multiple ? o.multiple = !0 : r.size && (o.size = r.size);
									break;
								default: o = typeof r.is == "string" ? s.createElement(a, { is: r.is }) : s.createElement(a);
							}
						}
						o[ut] = t, o[dt] = r;
						a: for (s = t.child; s !== null;) {
							if (s.tag === 5 || s.tag === 6) o.appendChild(s.stateNode);
							else if (s.tag !== 4 && s.tag !== 27 && s.child !== null) {
								s.child.return = s, s = s.child;
								continue;
							}
							if (s === t) break a;
							for (; s.sibling === null;) {
								if (s.return === null || s.return === t) break a;
								s = s.return;
							}
							s.sibling.return = s.return, s = s.sibling;
						}
						t.stateNode = o;
						a: switch (Pd(o, a, r), a) {
							case "button":
							case "input":
							case "select":
							case "textarea":
								r = !!r.autoFocus;
								break a;
							case "img":
								r = !0;
								break a;
							default: r = !1;
						}
						r && Mc(t);
					}
				}
				return G(t), Nc(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null;
			case 6:
				if (e && t.stateNode != null) e.memoizedProps !== r && Mc(t);
				else {
					if (typeof r != "string" && t.stateNode === null) throw Error(i(166));
					if (e = de.current, Ri(t)) {
						if (e = t.stateNode, n = t.memoizedProps, r = null, a = ji, a !== null) switch (a.tag) {
							case 27:
							case 5: r = a.memoizedProps;
						}
						e[ut] = t, e = !!(e.nodeValue === n || r !== null && !0 === r.suppressHydrationWarning || Md(e.nodeValue, n)), e || Fi(t, !0);
					} else e = Bd(e).createTextNode(r), e[ut] = t, t.stateNode = e;
				}
				return G(t), null;
			case 31:
				if (n = t.memoizedState, e === null || e.memoizedState !== null) {
					if (r = Ri(t), n !== null) {
						if (e === null) {
							if (!r) throw Error(i(318));
							if (e = t.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(557));
							e[ut] = t;
						} else zi(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						G(t), e = !1;
					} else n = Bi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), e = !0;
					if (!e) return t.flags & 256 ? (oo(t), t) : (oo(t), null);
					if (t.flags & 128) throw Error(i(558));
				}
				return G(t), null;
			case 13:
				if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
					if (a = Ri(t), r !== null && r.dehydrated !== null) {
						if (e === null) {
							if (!a) throw Error(i(318));
							if (a = t.memoizedState, a = a === null ? null : a.dehydrated, !a) throw Error(i(317));
							a[ut] = t;
						} else zi(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						G(t), a = !1;
					} else a = Bi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = a), a = !0;
					if (!a) return t.flags & 256 ? (oo(t), t) : (oo(t), null);
				}
				return oo(t), t.flags & 128 ? (t.lanes = n, t) : (n = r !== null, e = e !== null && e.memoizedState !== null, n && (r = t.child, a = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (a = r.alternate.memoizedState.cachePool.pool), o = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (o = r.memoizedState.cachePool.pool), o !== a && (r.flags |= 2048)), n !== e && n && (t.child.flags |= 8192), Fc(t, t.updateQueue), G(t), null);
			case 4: return me(), e === null && Sd(t.stateNode.containerInfo), G(t), null;
			case 10: return Ki(t.type), G(t), null;
			case 19:
				if (M(so), r = t.memoizedState, r === null) return G(t), null;
				if (a = (t.flags & 128) != 0, o = r.rendering, o === null) if (a) Ic(r, !1);
				else {
					if (Wl !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null;) {
						if (o = co(e), o !== null) {
							for (t.flags |= 128, Ic(r, !1), e = o.updateQueue, t.updateQueue = e, Fc(t, e), t.subtreeFlags = 0, e = n, n = t.child; n !== null;) li(n, e), n = n.sibling;
							return N(so, so.current & 1 | 2), H && Ei(t, r.treeForkCount), t.child;
						}
						e = e.sibling;
					}
					r.tail !== null && ke() > tu && (t.flags |= 128, a = !0, Ic(r, !1), t.lanes = 4194304);
				}
				else {
					if (!a) if (e = co(o), e !== null) {
						if (t.flags |= 128, a = !0, e = e.updateQueue, t.updateQueue = e, Fc(t, e), Ic(r, !0), r.tail === null && r.tailMode === "hidden" && !o.alternate && !H) return G(t), null;
					} else 2 * ke() - r.renderingStartTime > tu && n !== 536870912 && (t.flags |= 128, a = !0, Ic(r, !1), t.lanes = 4194304);
					r.isBackwards ? (o.sibling = t.child, t.child = o) : (e = r.last, e === null ? t.child = o : e.sibling = o, r.last = o);
				}
				return r.tail === null ? (G(t), null) : (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ke(), e.sibling = null, n = so.current, N(so, a ? n & 1 | 2 : n & 1), H && Ei(t, r.treeForkCount), e);
			case 22:
			case 23: return oo(t), $a(), r = t.memoizedState !== null, e === null ? r && (t.flags |= 8192) : e.memoizedState !== null !== r && (t.flags |= 8192), r ? n & 536870912 && !(t.flags & 128) && (G(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : G(t), n = t.updateQueue, n !== null && Fc(t, n.retryQueue), n = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== n && (t.flags |= 2048), e !== null && M(ha), null;
			case 24: return n = null, e !== null && (n = e.memoizedState.cache), t.memoizedState.cache !== n && (t.flags |= 2048), Ki(ia), G(t), null;
			case 25: return null;
			case 30: return null;
		}
		throw Error(i(156, t.tag));
	}
	function Rc(e, t) {
		switch (ki(t), t.tag) {
			case 1: return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 3: return Ki(ia), me(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
			case 26:
			case 27:
			case 5: return ge(t), null;
			case 31:
				if (t.memoizedState !== null) {
					if (oo(t), t.alternate === null) throw Error(i(340));
					zi();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 13:
				if (oo(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
					if (t.alternate === null) throw Error(i(340));
					zi();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 19: return M(so), null;
			case 4: return me(), null;
			case 10: return Ki(t.type), null;
			case 22:
			case 23: return oo(t), $a(), e !== null && M(ha), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 24: return Ki(ia), null;
			case 25: return null;
			default: return null;
		}
	}
	function zc(e, t) {
		switch (ki(t), t.tag) {
			case 3:
				Ki(ia), me();
				break;
			case 26:
			case 27:
			case 5:
				ge(t);
				break;
			case 4:
				me();
				break;
			case 31:
				t.memoizedState !== null && oo(t);
				break;
			case 13:
				oo(t);
				break;
			case 19:
				M(so);
				break;
			case 10:
				Ki(t.type);
				break;
			case 22:
			case 23:
				oo(t), $a(), e !== null && M(ha);
				break;
			case 24: Ki(ia);
		}
	}
	function Bc(e, t) {
		try {
			var n = t.updateQueue, r = n === null ? null : n.lastEffect;
			if (r !== null) {
				var i = r.next;
				n = i;
				do {
					if ((n.tag & e) === e) {
						r = void 0;
						var a = n.create, o = n.inst;
						r = a(), o.destroy = r;
					}
					n = n.next;
				} while (n !== i);
			}
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function Vc(e, t, n) {
		try {
			var r = t.updateQueue, i = r === null ? null : r.lastEffect;
			if (i !== null) {
				var a = i.next;
				r = a;
				do {
					if ((r.tag & e) === e) {
						var o = r.inst, s = o.destroy;
						if (s !== void 0) {
							o.destroy = void 0, i = t;
							var c = n, l = s;
							try {
								l();
							} catch (e) {
								Z(i, c, e);
							}
						}
					}
					r = r.next;
				} while (r !== a);
			}
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function Hc(e) {
		var t = e.updateQueue;
		if (t !== null) {
			var n = e.stateNode;
			try {
				Ja(t, n);
			} catch (t) {
				Z(e, e.return, t);
			}
		}
	}
	function Uc(e, t, n) {
		n.props = Gs(e.type, e.memoizedProps), n.state = e.memoizedState;
		try {
			n.componentWillUnmount();
		} catch (n) {
			Z(e, t, n);
		}
	}
	function Wc(e, t) {
		try {
			var n = e.ref;
			if (n !== null) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5:
						var r = e.stateNode;
						break;
					case 30:
						r = e.stateNode;
						break;
					default: r = e.stateNode;
				}
				typeof n == "function" ? e.refCleanup = n(r) : n.current = r;
			}
		} catch (n) {
			Z(e, t, n);
		}
	}
	function Gc(e, t) {
		var n = e.ref, r = e.refCleanup;
		if (n !== null) if (typeof r == "function") try {
			r();
		} catch (n) {
			Z(e, t, n);
		} finally {
			e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
		}
		else if (typeof n == "function") try {
			n(null);
		} catch (n) {
			Z(e, t, n);
		}
		else n.current = null;
	}
	function Kc(e) {
		var t = e.type, n = e.memoizedProps, r = e.stateNode;
		try {
			a: switch (t) {
				case "button":
				case "input":
				case "select":
				case "textarea":
					n.autoFocus && r.focus();
					break a;
				case "img": n.src ? r.src = n.src : n.srcSet && (r.srcset = n.srcSet);
			}
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	function qc(e, t, n) {
		try {
			var r = e.stateNode;
			Fd(r, e.type, n, t), r[dt] = t;
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	function Jc(e) {
		return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && Zd(e.type) || e.tag === 4;
	}
	function Yc(e) {
		a: for (;;) {
			for (; e.sibling === null;) {
				if (e.return === null || Jc(e.return)) return null;
				e = e.return;
			}
			for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
				if (e.tag === 27 && Zd(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue a;
				e.child.return = e, e = e.child;
			}
			if (!(e.flags & 2)) return e.stateNode;
		}
	}
	function Xc(e, t, n) {
		var r = e.tag;
		if (r === 5 || r === 6) e = e.stateNode, t ? (n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n).insertBefore(e, t) : (t = n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n, t.appendChild(e), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = rn));
		else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode, t = null), e = e.child, e !== null)) for (Xc(e, t, n), e = e.sibling; e !== null;) Xc(e, t, n), e = e.sibling;
	}
	function Zc(e, t, n) {
		var r = e.tag;
		if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
		else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode), e = e.child, e !== null)) for (Zc(e, t, n), e = e.sibling; e !== null;) Zc(e, t, n), e = e.sibling;
	}
	function Qc(e) {
		var t = e.stateNode, n = e.memoizedProps;
		try {
			for (var r = e.type, i = t.attributes; i.length;) t.removeAttributeNode(i[0]);
			Pd(t, r, n), t[ut] = e, t[dt] = n;
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	var $c = !1, el = !1, tl = !1, nl = typeof WeakSet == "function" ? WeakSet : Set, rl = null;
	function il(e, t) {
		if (e = e.containerInfo, Rd = sp, e = Er(e), Dr(e)) {
			if ("selectionStart" in e) var n = {
				start: e.selectionStart,
				end: e.selectionEnd
			};
			else a: {
				n = (n = e.ownerDocument) && n.defaultView || window;
				var r = n.getSelection && n.getSelection();
				if (r && r.rangeCount !== 0) {
					n = r.anchorNode;
					var a = r.anchorOffset, o = r.focusNode;
					r = r.focusOffset;
					try {
						n.nodeType, o.nodeType;
					} catch {
						n = null;
						break a;
					}
					var s = 0, c = -1, l = -1, u = 0, d = 0, f = e, p = null;
					b: for (;;) {
						for (var m; f !== n || a !== 0 && f.nodeType !== 3 || (c = s + a), f !== o || r !== 0 && f.nodeType !== 3 || (l = s + r), f.nodeType === 3 && (s += f.nodeValue.length), (m = f.firstChild) !== null;) p = f, f = m;
						for (;;) {
							if (f === e) break b;
							if (p === n && ++u === a && (c = s), p === o && ++d === r && (l = s), (m = f.nextSibling) !== null) break;
							f = p, p = f.parentNode;
						}
						f = m;
					}
					n = c === -1 || l === -1 ? null : {
						start: c,
						end: l
					};
				} else n = null;
			}
			n ||= {
				start: 0,
				end: 0
			};
		} else n = null;
		for (zd = {
			focusedElem: e,
			selectionRange: n
		}, sp = !1, rl = t; rl !== null;) if (t = rl, e = t.child, t.subtreeFlags & 1028 && e !== null) e.return = t, rl = e;
		else for (; rl !== null;) {
			switch (t = rl, o = t.alternate, e = t.flags, t.tag) {
				case 0:
					if (e & 4 && (e = t.updateQueue, e = e === null ? null : e.events, e !== null)) for (n = 0; n < e.length; n++) a = e[n], a.ref.impl = a.nextImpl;
					break;
				case 11:
				case 15: break;
				case 1:
					if (e & 1024 && o !== null) {
						e = void 0, n = t, a = o.memoizedProps, o = o.memoizedState, r = n.stateNode;
						try {
							var h = Gs(n.type, a);
							e = r.getSnapshotBeforeUpdate(h, o), r.__reactInternalSnapshotBeforeUpdate = e;
						} catch (e) {
							Z(n, n.return, e);
						}
					}
					break;
				case 3:
					if (e & 1024) {
						if (e = t.stateNode.containerInfo, n = e.nodeType, n === 9) ef(e);
						else if (n === 1) switch (e.nodeName) {
							case "HEAD":
							case "HTML":
							case "BODY":
								ef(e);
								break;
							default: e.textContent = "";
						}
					}
					break;
				case 5:
				case 26:
				case 27:
				case 6:
				case 4:
				case 17: break;
				default: if (e & 1024) throw Error(i(163));
			}
			if (e = t.sibling, e !== null) {
				e.return = t.return, rl = e;
				break;
			}
			rl = t.return;
		}
	}
	function al(e, t, n) {
		var r = n.flags;
		switch (n.tag) {
			case 0:
			case 11:
			case 15:
				bl(e, n), r & 4 && Bc(5, n);
				break;
			case 1:
				if (bl(e, n), r & 4) if (e = n.stateNode, t === null) try {
					e.componentDidMount();
				} catch (e) {
					Z(n, n.return, e);
				}
				else {
					var i = Gs(n.type, t.memoizedProps);
					t = t.memoizedState;
					try {
						e.componentDidUpdate(i, t, e.__reactInternalSnapshotBeforeUpdate);
					} catch (e) {
						Z(n, n.return, e);
					}
				}
				r & 64 && Hc(n), r & 512 && Wc(n, n.return);
				break;
			case 3:
				if (bl(e, n), r & 64 && (e = n.updateQueue, e !== null)) {
					if (t = null, n.child !== null) switch (n.child.tag) {
						case 27:
						case 5:
							t = n.child.stateNode;
							break;
						case 1: t = n.child.stateNode;
					}
					try {
						Ja(e, t);
					} catch (e) {
						Z(n, n.return, e);
					}
				}
				break;
			case 27: t === null && r & 4 && Qc(n);
			case 26:
			case 5:
				bl(e, n), t === null && r & 4 && Kc(n), r & 512 && Wc(n, n.return);
				break;
			case 12:
				bl(e, n);
				break;
			case 31:
				bl(e, n), r & 4 && dl(e, n);
				break;
			case 13:
				bl(e, n), r & 4 && fl(e, n), r & 64 && (e = n.memoizedState, e !== null && (e = e.dehydrated, e !== null && (n = Ju.bind(null, n), sf(e, n))));
				break;
			case 22:
				if (r = n.memoizedState !== null || $c, !r) {
					t = t !== null && t.memoizedState !== null || el, i = $c;
					var a = el;
					$c = r, (el = t) && !a ? Sl(e, n, (n.subtreeFlags & 8772) != 0) : bl(e, n), $c = i, el = a;
				}
				break;
			case 30: break;
			default: bl(e, n);
		}
	}
	function ol(e) {
		var t = e.alternate;
		t !== null && (e.alternate = null, ol(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && vt(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
	}
	var sl = null, cl = !1;
	function ll(e, t, n) {
		for (n = n.child; n !== null;) ul(e, t, n), n = n.sibling;
	}
	function ul(e, t, n) {
		if (ze && typeof ze.onCommitFiberUnmount == "function") try {
			ze.onCommitFiberUnmount(Re, n);
		} catch {}
		switch (n.tag) {
			case 26:
				el || Gc(n, t), ll(e, t, n), n.memoizedState ? n.memoizedState.count-- : n.stateNode && (n = n.stateNode, n.parentNode.removeChild(n));
				break;
			case 27:
				el || Gc(n, t);
				var r = sl, i = cl;
				Zd(n.type) && (sl = n.stateNode, cl = !1), ll(e, t, n), pf(n.stateNode), sl = r, cl = i;
				break;
			case 5: el || Gc(n, t);
			case 6:
				if (r = sl, i = cl, sl = null, ll(e, t, n), sl = r, cl = i, sl !== null) if (cl) try {
					(sl.nodeType === 9 ? sl.body : sl.nodeName === "HTML" ? sl.ownerDocument.body : sl).removeChild(n.stateNode);
				} catch (e) {
					Z(n, t, e);
				}
				else try {
					sl.removeChild(n.stateNode);
				} catch (e) {
					Z(n, t, e);
				}
				break;
			case 18:
				sl !== null && (cl ? (e = sl, Qd(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, n.stateNode), Np(e)) : Qd(sl, n.stateNode));
				break;
			case 4:
				r = sl, i = cl, sl = n.stateNode.containerInfo, cl = !0, ll(e, t, n), sl = r, cl = i;
				break;
			case 0:
			case 11:
			case 14:
			case 15:
				Vc(2, n, t), el || Vc(4, n, t), ll(e, t, n);
				break;
			case 1:
				el || (Gc(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function" && Uc(n, t, r)), ll(e, t, n);
				break;
			case 21:
				ll(e, t, n);
				break;
			case 22:
				el = (r = el) || n.memoizedState !== null, ll(e, t, n), el = r;
				break;
			default: ll(e, t, n);
		}
	}
	function dl(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
			e = e.dehydrated;
			try {
				Np(e);
			} catch (e) {
				Z(t, t.return, e);
			}
		}
	}
	function fl(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
			Np(e);
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function pl(e) {
		switch (e.tag) {
			case 31:
			case 13:
			case 19:
				var t = e.stateNode;
				return t === null && (t = e.stateNode = new nl()), t;
			case 22: return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new nl()), t;
			default: throw Error(i(435, e.tag));
		}
	}
	function ml(e, t) {
		var n = pl(e);
		t.forEach(function(t) {
			if (!n.has(t)) {
				n.add(t);
				var r = Yu.bind(null, e, t);
				t.then(r, r);
			}
		});
	}
	function hl(e, t) {
		var n = t.deletions;
		if (n !== null) for (var r = 0; r < n.length; r++) {
			var a = n[r], o = e, s = t, c = s;
			a: for (; c !== null;) {
				switch (c.tag) {
					case 27:
						if (Zd(c.type)) {
							sl = c.stateNode, cl = !1;
							break a;
						}
						break;
					case 5:
						sl = c.stateNode, cl = !1;
						break a;
					case 3:
					case 4:
						sl = c.stateNode.containerInfo, cl = !0;
						break a;
				}
				c = c.return;
			}
			if (sl === null) throw Error(i(160));
			ul(o, s, a), sl = null, cl = !1, o = a.alternate, o !== null && (o.return = null), a.return = null;
		}
		if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) _l(t, e), t = t.sibling;
	}
	var gl = null;
	function _l(e, t) {
		var n = e.alternate, r = e.flags;
		switch (e.tag) {
			case 0:
			case 11:
			case 14:
			case 15:
				hl(t, e), vl(e), r & 4 && (Vc(3, e, e.return), Bc(3, e), Vc(5, e, e.return));
				break;
			case 1:
				hl(t, e), vl(e), r & 512 && (el || n === null || Gc(n, n.return)), r & 64 && $c && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (n = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = n === null ? r : n.concat(r))));
				break;
			case 26:
				var a = gl;
				if (hl(t, e), vl(e), r & 512 && (el || n === null || Gc(n, n.return)), r & 4) {
					var o = n === null ? null : n.memoizedState;
					if (r = e.memoizedState, n === null) if (r === null) if (e.stateNode === null) {
						a: {
							r = e.type, n = e.memoizedProps, a = a.ownerDocument || a;
							b: switch (r) {
								case "title":
									o = a.getElementsByTagName("title")[0], (!o || o[_t] || o[ut] || o.namespaceURI === "http://www.w3.org/2000/svg" || o.hasAttribute("itemprop")) && (o = a.createElement(r), a.head.insertBefore(o, a.querySelector("head > title"))), Pd(o, r, n), o[ut] = e, Ct(o), r = o;
									break a;
								case "link":
									var s = Vf("link", "href", a).get(r + (n.href || ""));
									if (s) {
										for (var c = 0; c < s.length; c++) if (o = s[c], o.getAttribute("href") === (n.href == null || n.href === "" ? null : n.href) && o.getAttribute("rel") === (n.rel == null ? null : n.rel) && o.getAttribute("title") === (n.title == null ? null : n.title) && o.getAttribute("crossorigin") === (n.crossOrigin == null ? null : n.crossOrigin)) {
											s.splice(c, 1);
											break b;
										}
									}
									o = a.createElement(r), Pd(o, r, n), a.head.appendChild(o);
									break;
								case "meta":
									if (s = Vf("meta", "content", a).get(r + (n.content || ""))) {
										for (c = 0; c < s.length; c++) if (o = s[c], o.getAttribute("content") === (n.content == null ? null : "" + n.content) && o.getAttribute("name") === (n.name == null ? null : n.name) && o.getAttribute("property") === (n.property == null ? null : n.property) && o.getAttribute("http-equiv") === (n.httpEquiv == null ? null : n.httpEquiv) && o.getAttribute("charset") === (n.charSet == null ? null : n.charSet)) {
											s.splice(c, 1);
											break b;
										}
									}
									o = a.createElement(r), Pd(o, r, n), a.head.appendChild(o);
									break;
								default: throw Error(i(468, r));
							}
							o[ut] = e, Ct(o), r = o;
						}
						e.stateNode = r;
					} else Hf(a, e.type, e.stateNode);
					else e.stateNode = If(a, r, e.memoizedProps);
					else o === r ? r === null && e.stateNode !== null && qc(e, e.memoizedProps, n.memoizedProps) : (o === null ? n.stateNode !== null && (n = n.stateNode, n.parentNode.removeChild(n)) : o.count--, r === null ? Hf(a, e.type, e.stateNode) : If(a, r, e.memoizedProps));
				}
				break;
			case 27:
				hl(t, e), vl(e), r & 512 && (el || n === null || Gc(n, n.return)), n !== null && r & 4 && qc(e, e.memoizedProps, n.memoizedProps);
				break;
			case 5:
				if (hl(t, e), vl(e), r & 512 && (el || n === null || Gc(n, n.return)), e.flags & 32) {
					a = e.stateNode;
					try {
						Yt(a, "");
					} catch (t) {
						Z(e, e.return, t);
					}
				}
				r & 4 && e.stateNode != null && (a = e.memoizedProps, qc(e, a, n === null ? a : n.memoizedProps)), r & 1024 && (tl = !0);
				break;
			case 6:
				if (hl(t, e), vl(e), r & 4) {
					if (e.stateNode === null) throw Error(i(162));
					r = e.memoizedProps, n = e.stateNode;
					try {
						n.nodeValue = r;
					} catch (t) {
						Z(e, e.return, t);
					}
				}
				break;
			case 3:
				if (Bf = null, a = gl, gl = gf(t.containerInfo), hl(t, e), gl = a, vl(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
					Np(t.containerInfo);
				} catch (t) {
					Z(e, e.return, t);
				}
				tl && (tl = !1, yl(e));
				break;
			case 4:
				r = gl, gl = gf(e.stateNode.containerInfo), hl(t, e), vl(e), gl = r;
				break;
			case 12:
				hl(t, e), vl(e);
				break;
			case 31:
				hl(t, e), vl(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ml(e, r)));
				break;
			case 13:
				hl(t, e), vl(e), e.child.flags & 8192 && e.memoizedState !== null != (n !== null && n.memoizedState !== null) && ($l = ke()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ml(e, r)));
				break;
			case 22:
				a = e.memoizedState !== null;
				var l = n !== null && n.memoizedState !== null, u = $c, d = el;
				if ($c = u || a, el = d || l, hl(t, e), el = d, $c = u, vl(e), r & 8192) a: for (t = e.stateNode, t._visibility = a ? t._visibility & -2 : t._visibility | 1, a && (n === null || l || $c || el || xl(e)), n = null, t = e;;) {
					if (t.tag === 5 || t.tag === 26) {
						if (n === null) {
							l = n = t;
							try {
								if (o = l.stateNode, a) s = o.style, typeof s.setProperty == "function" ? s.setProperty("display", "none", "important") : s.display = "none";
								else {
									c = l.stateNode;
									var f = l.memoizedProps.style, p = f != null && f.hasOwnProperty("display") ? f.display : null;
									c.style.display = p == null || typeof p == "boolean" ? "" : ("" + p).trim();
								}
							} catch (e) {
								Z(l, l.return, e);
							}
						}
					} else if (t.tag === 6) {
						if (n === null) {
							l = t;
							try {
								l.stateNode.nodeValue = a ? "" : l.memoizedProps;
							} catch (e) {
								Z(l, l.return, e);
							}
						}
					} else if (t.tag === 18) {
						if (n === null) {
							l = t;
							try {
								var m = l.stateNode;
								a ? $d(m, !0) : $d(l.stateNode, !1);
							} catch (e) {
								Z(l, l.return, e);
							}
						}
					} else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
						t.child.return = t, t = t.child;
						continue;
					}
					if (t === e) break a;
					for (; t.sibling === null;) {
						if (t.return === null || t.return === e) break a;
						n === t && (n = null), t = t.return;
					}
					n === t && (n = null), t.sibling.return = t.return, t = t.sibling;
				}
				r & 4 && (r = e.updateQueue, r !== null && (n = r.retryQueue, n !== null && (r.retryQueue = null, ml(e, n))));
				break;
			case 19:
				hl(t, e), vl(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ml(e, r)));
				break;
			case 30: break;
			case 21: break;
			default: hl(t, e), vl(e);
		}
	}
	function vl(e) {
		var t = e.flags;
		if (t & 2) {
			try {
				for (var n, r = e.return; r !== null;) {
					if (Jc(r)) {
						n = r;
						break;
					}
					r = r.return;
				}
				if (n == null) throw Error(i(160));
				switch (n.tag) {
					case 27:
						var a = n.stateNode;
						Zc(e, Yc(e), a);
						break;
					case 5:
						var o = n.stateNode;
						n.flags & 32 && (Yt(o, ""), n.flags &= -33), Zc(e, Yc(e), o);
						break;
					case 3:
					case 4:
						var s = n.stateNode.containerInfo;
						Xc(e, Yc(e), s);
						break;
					default: throw Error(i(161));
				}
			} catch (t) {
				Z(e, e.return, t);
			}
			e.flags &= -3;
		}
		t & 4096 && (e.flags &= -4097);
	}
	function yl(e) {
		if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
			var t = e;
			yl(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
		}
	}
	function bl(e, t) {
		if (t.subtreeFlags & 8772) for (t = t.child; t !== null;) al(e, t.alternate, t), t = t.sibling;
	}
	function xl(e) {
		for (e = e.child; e !== null;) {
			var t = e;
			switch (t.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					Vc(4, t, t.return), xl(t);
					break;
				case 1:
					Gc(t, t.return);
					var n = t.stateNode;
					typeof n.componentWillUnmount == "function" && Uc(t, t.return, n), xl(t);
					break;
				case 27: pf(t.stateNode);
				case 26:
				case 5:
					Gc(t, t.return), xl(t);
					break;
				case 22:
					t.memoizedState === null && xl(t);
					break;
				case 30:
					xl(t);
					break;
				default: xl(t);
			}
			e = e.sibling;
		}
	}
	function Sl(e, t, n) {
		for (n &&= (t.subtreeFlags & 8772) != 0, t = t.child; t !== null;) {
			var r = t.alternate, i = e, a = t, o = a.flags;
			switch (a.tag) {
				case 0:
				case 11:
				case 15:
					Sl(i, a, n), Bc(4, a);
					break;
				case 1:
					if (Sl(i, a, n), r = a, i = r.stateNode, typeof i.componentDidMount == "function") try {
						i.componentDidMount();
					} catch (e) {
						Z(r, r.return, e);
					}
					if (r = a, i = r.updateQueue, i !== null) {
						var s = r.stateNode;
						try {
							var c = i.shared.hiddenCallbacks;
							if (c !== null) for (i.shared.hiddenCallbacks = null, i = 0; i < c.length; i++) qa(c[i], s);
						} catch (e) {
							Z(r, r.return, e);
						}
					}
					n && o & 64 && Hc(a), Wc(a, a.return);
					break;
				case 27: Qc(a);
				case 26:
				case 5:
					Sl(i, a, n), n && r === null && o & 4 && Kc(a), Wc(a, a.return);
					break;
				case 12:
					Sl(i, a, n);
					break;
				case 31:
					Sl(i, a, n), n && o & 4 && dl(i, a);
					break;
				case 13:
					Sl(i, a, n), n && o & 4 && fl(i, a);
					break;
				case 22:
					a.memoizedState === null && Sl(i, a, n), Wc(a, a.return);
					break;
				case 30: break;
				default: Sl(i, a, n);
			}
			t = t.sibling;
		}
	}
	function Cl(e, t) {
		var n = null;
		e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== n && (e != null && e.refCount++, n != null && oa(n));
	}
	function wl(e, t) {
		e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && oa(e));
	}
	function Tl(e, t, n, r) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) El(e, t, n, r), t = t.sibling;
	}
	function El(e, t, n, r) {
		var i = t.flags;
		switch (t.tag) {
			case 0:
			case 11:
			case 15:
				Tl(e, t, n, r), i & 2048 && Bc(9, t);
				break;
			case 1:
				Tl(e, t, n, r);
				break;
			case 3:
				Tl(e, t, n, r), i & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && oa(e)));
				break;
			case 12:
				if (i & 2048) {
					Tl(e, t, n, r), e = t.stateNode;
					try {
						var a = t.memoizedProps, o = a.id, s = a.onPostCommit;
						typeof s == "function" && s(o, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
					} catch (e) {
						Z(t, t.return, e);
					}
				} else Tl(e, t, n, r);
				break;
			case 31:
				Tl(e, t, n, r);
				break;
			case 13:
				Tl(e, t, n, r);
				break;
			case 23: break;
			case 22:
				a = t.stateNode, o = t.alternate, t.memoizedState === null ? a._visibility & 2 ? Tl(e, t, n, r) : (a._visibility |= 2, Dl(e, t, n, r, (t.subtreeFlags & 10256) != 0 || !1)) : a._visibility & 2 ? Tl(e, t, n, r) : Ol(e, t), i & 2048 && Cl(o, t);
				break;
			case 24:
				Tl(e, t, n, r), i & 2048 && wl(t.alternate, t);
				break;
			default: Tl(e, t, n, r);
		}
	}
	function Dl(e, t, n, r, i) {
		for (i &&= (t.subtreeFlags & 10256) != 0 || !1, t = t.child; t !== null;) {
			var a = e, o = t, s = n, c = r, l = o.flags;
			switch (o.tag) {
				case 0:
				case 11:
				case 15:
					Dl(a, o, s, c, i), Bc(8, o);
					break;
				case 23: break;
				case 22:
					var u = o.stateNode;
					o.memoizedState === null ? (u._visibility |= 2, Dl(a, o, s, c, i)) : u._visibility & 2 ? Dl(a, o, s, c, i) : Ol(a, o), i && l & 2048 && Cl(o.alternate, o);
					break;
				case 24:
					Dl(a, o, s, c, i), i && l & 2048 && wl(o.alternate, o);
					break;
				default: Dl(a, o, s, c, i);
			}
			t = t.sibling;
		}
	}
	function Ol(e, t) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) {
			var n = e, r = t, i = r.flags;
			switch (r.tag) {
				case 22:
					Ol(n, r), i & 2048 && Cl(r.alternate, r);
					break;
				case 24:
					Ol(n, r), i & 2048 && wl(r.alternate, r);
					break;
				default: Ol(n, r);
			}
			t = t.sibling;
		}
	}
	var kl = 8192;
	function Al(e, t, n) {
		if (e.subtreeFlags & kl) for (e = e.child; e !== null;) jl(e, t, n), e = e.sibling;
	}
	function jl(e, t, n) {
		switch (e.tag) {
			case 26:
				Al(e, t, n), e.flags & kl && e.memoizedState !== null && Gf(n, gl, e.memoizedState, e.memoizedProps);
				break;
			case 5:
				Al(e, t, n);
				break;
			case 3:
			case 4:
				var r = gl;
				gl = gf(e.stateNode.containerInfo), Al(e, t, n), gl = r;
				break;
			case 22:
				e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = kl, kl = 16777216, Al(e, t, n), kl = r) : Al(e, t, n));
				break;
			default: Al(e, t, n);
		}
	}
	function Ml(e) {
		var t = e.alternate;
		if (t !== null && (e = t.child, e !== null)) {
			t.child = null;
			do
				t = e.sibling, e.sibling = null, e = t;
			while (e !== null);
		}
	}
	function Nl(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				rl = r, Il(r, e);
			}
			Ml(e);
		}
		if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) Pl(e), e = e.sibling;
	}
	function Pl(e) {
		switch (e.tag) {
			case 0:
			case 11:
			case 15:
				Nl(e), e.flags & 2048 && Vc(9, e, e.return);
				break;
			case 3:
				Nl(e);
				break;
			case 12:
				Nl(e);
				break;
			case 22:
				var t = e.stateNode;
				e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, Fl(e)) : Nl(e);
				break;
			default: Nl(e);
		}
	}
	function Fl(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				rl = r, Il(r, e);
			}
			Ml(e);
		}
		for (e = e.child; e !== null;) {
			switch (t = e, t.tag) {
				case 0:
				case 11:
				case 15:
					Vc(8, t, t.return), Fl(t);
					break;
				case 22:
					n = t.stateNode, n._visibility & 2 && (n._visibility &= -3, Fl(t));
					break;
				default: Fl(t);
			}
			e = e.sibling;
		}
	}
	function Il(e, t) {
		for (; rl !== null;) {
			var n = rl;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					Vc(8, n, t);
					break;
				case 23:
				case 22:
					if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
						var r = n.memoizedState.cachePool.pool;
						r != null && r.refCount++;
					}
					break;
				case 24: oa(n.memoizedState.cache);
			}
			if (r = n.child, r !== null) r.return = n, rl = r;
			else a: for (n = e; rl !== null;) {
				r = rl;
				var i = r.sibling, a = r.return;
				if (ol(r), r === n) {
					rl = null;
					break a;
				}
				if (i !== null) {
					i.return = a, rl = i;
					break a;
				}
				rl = a;
			}
		}
	}
	var Ll = {
		getCacheForType: function(e) {
			var t = Qi(ia), n = t.data.get(e);
			return n === void 0 && (n = e(), t.data.set(e, n)), n;
		},
		cacheSignal: function() {
			return Qi(ia).controller.signal;
		}
	}, Rl = typeof WeakMap == "function" ? WeakMap : Map, K = 0, q = null, J = null, Y = 0, X = 0, zl = null, Bl = !1, Vl = !1, Hl = !1, Ul = 0, Wl = 0, Gl = 0, Kl = 0, ql = 0, Jl = 0, Yl = 0, Xl = null, Zl = null, Ql = !1, $l = 0, eu = 0, tu = Infinity, nu = null, ru = null, iu = 0, au = null, ou = null, su = 0, cu = 0, lu = null, uu = null, du = 0, fu = null;
	function pu() {
		return K & 2 && Y !== 0 ? Y & -Y : k.T === null ? st() : dd();
	}
	function mu() {
		if (Jl === 0) if (!(Y & 536870912) || H) {
			var e = Ke;
			Ke <<= 1, !(Ke & 3932160) && (Ke = 262144), Jl = e;
		} else Jl = 536870912;
		return e = eo.current, e !== null && (e.flags |= 32), Jl;
	}
	function hu(e, t, n) {
		(e === q && (X === 2 || X === 9) || e.cancelPendingCommit !== null) && (Su(e, 0), yu(e, Y, Jl, !1)), et(e, n), (!(K & 2) || e !== q) && (e === q && (!(K & 2) && (Kl |= n), Wl === 4 && yu(e, Y, Jl, !1)), rd(e));
	}
	function gu(e, t, n) {
		if (K & 6) throw Error(i(327));
		var r = !n && (t & 127) == 0 && (t & e.expiredLanes) === 0 || Xe(e, t), a = r ? Au(e, t) : Ou(e, t, !0), o = r;
		do {
			if (a === 0) {
				Vl && !r && yu(e, t, 0, !1);
				break;
			} else {
				if (n = e.current.alternate, o && !vu(n)) {
					a = Ou(e, t, !1), o = !1;
					continue;
				}
				if (a === 2) {
					if (o = t, e.errorRecoveryDisabledLanes & o) var s = 0;
					else s = e.pendingLanes & -536870913, s = s === 0 ? s & 536870912 ? 536870912 : 0 : s;
					if (s !== 0) {
						t = s;
						a: {
							var c = e;
							a = Xl;
							var l = c.current.memoizedState.isDehydrated;
							if (l && (Su(c, s).flags |= 256), s = Ou(c, s, !1), s !== 2) {
								if (Hl && !l) {
									c.errorRecoveryDisabledLanes |= o, Kl |= o, a = 4;
									break a;
								}
								o = Zl, Zl = a, o !== null && (Zl === null ? Zl = o : Zl.push.apply(Zl, o));
							}
							a = s;
						}
						if (o = !1, a !== 2) continue;
					}
				}
				if (a === 1) {
					Su(e, 0), yu(e, t, 0, !0);
					break;
				}
				a: {
					switch (r = e, o = a, o) {
						case 0:
						case 1: throw Error(i(345));
						case 4: if ((t & 4194048) !== t) break;
						case 6:
							yu(r, t, Jl, !Bl);
							break a;
						case 2:
							Zl = null;
							break;
						case 3:
						case 5: break;
						default: throw Error(i(329));
					}
					if ((t & 62914560) === t && (a = $l + 300 - ke(), 10 < a)) {
						if (yu(r, t, Jl, !Bl), Ye(r, 0, !0) !== 0) break a;
						su = t, r.timeoutHandle = Kd(_u.bind(null, r, n, Zl, nu, Ql, t, Jl, Kl, Yl, Bl, o, "Throttled", -0, 0), a);
						break a;
					}
					_u(r, n, Zl, nu, Ql, t, Jl, Kl, Yl, Bl, o, null, -0, 0);
				}
			}
			break;
		} while (1);
		rd(e);
	}
	function _u(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
		if (e.timeoutHandle = -1, d = t.subtreeFlags, d & 8192 || (d & 16785408) == 16785408) {
			d = {
				stylesheets: null,
				count: 0,
				imgCount: 0,
				imgBytes: 0,
				suspenseyImages: [],
				waitingForImages: !0,
				waitingForViewTransition: !1,
				unsuspend: rn
			}, jl(t, a, d);
			var m = (a & 62914560) === a ? $l - ke() : (a & 4194048) === a ? eu - ke() : 0;
			if (m = qf(d, m), m !== null) {
				su = a, e.cancelPendingCommit = m(Lu.bind(null, e, t, a, n, r, i, o, s, c, u, d, null, f, p)), yu(e, a, o, !l);
				return;
			}
		}
		Lu(e, t, a, n, r, i, o, s, c);
	}
	function vu(e) {
		for (var t = e;;) {
			var n = t.tag;
			if ((n === 0 || n === 11 || n === 15) && t.flags & 16384 && (n = t.updateQueue, n !== null && (n = n.stores, n !== null))) for (var r = 0; r < n.length; r++) {
				var i = n[r], a = i.getSnapshot;
				i = i.value;
				try {
					if (!xr(a(), i)) return !1;
				} catch {
					return !1;
				}
			}
			if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
			else {
				if (t === e) break;
				for (; t.sibling === null;) {
					if (t.return === null || t.return === e) return !0;
					t = t.return;
				}
				t.sibling.return = t.return, t = t.sibling;
			}
		}
		return !0;
	}
	function yu(e, t, n, r) {
		t &= ~ql, t &= ~Kl, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
		for (var i = t; 0 < i;) {
			var a = 31 - Ve(i), o = 1 << a;
			r[a] = -1, i &= ~o;
		}
		n !== 0 && nt(e, n, t);
	}
	function bu() {
		return K & 6 ? !0 : (id(0, !1), !1);
	}
	function xu() {
		if (J !== null) {
			if (X === 0) var e = J.return;
			else e = J, Wi = Ui = null, Do(e), ka = null, Aa = 0, e = J;
			for (; e !== null;) zc(e.alternate, e), e = e.return;
			J = null;
		}
	}
	function Su(e, t) {
		var n = e.timeoutHandle;
		n !== -1 && (e.timeoutHandle = -1, qd(n)), n = e.cancelPendingCommit, n !== null && (e.cancelPendingCommit = null, n()), su = 0, xu(), q = e, J = n = ci(e.current, null), Y = t, X = 0, zl = null, Bl = !1, Vl = Xe(e, t), Hl = !1, Yl = Jl = ql = Kl = Gl = Wl = 0, Zl = Xl = null, Ql = !1, t & 8 && (t |= t & 32);
		var r = e.entangledLanes;
		if (r !== 0) for (e = e.entanglements, r &= t; 0 < r;) {
			var i = 31 - Ve(r), a = 1 << i;
			t |= e[i], r &= ~a;
		}
		return Ul = t, Qr(), n;
	}
	function Cu(e, t) {
		U = null, k.H = Ls, t === ya || t === xa ? (t = Da(), X = 3) : t === ba ? (t = Da(), X = 4) : X = t === tc ? 8 : typeof t == "object" && t && typeof t.then == "function" ? 6 : 1, zl = t, J === null && (Wl = 1, Ys(e, gi(t, e.current)));
	}
	function wu() {
		var e = eo.current;
		return e === null ? !0 : (Y & 4194048) === Y ? to === null : (Y & 62914560) === Y || Y & 536870912 ? e === to : !1;
	}
	function Tu() {
		var e = k.H;
		return k.H = Ls, e === null ? Ls : e;
	}
	function Eu() {
		var e = k.A;
		return k.A = Ll, e;
	}
	function Du() {
		Wl = 4, Bl || (Y & 4194048) !== Y && eo.current !== null || (Vl = !0), !(Gl & 134217727) && !(Kl & 134217727) || q === null || yu(q, Y, Jl, !1);
	}
	function Ou(e, t, n) {
		var r = K;
		K |= 2;
		var i = Tu(), a = Eu();
		(q !== e || Y !== t) && (nu = null, Su(e, t)), t = !1;
		var o = Wl;
		a: do
			try {
				if (X !== 0 && J !== null) {
					var s = J, c = zl;
					switch (X) {
						case 8:
							xu(), o = 6;
							break a;
						case 3:
						case 2:
						case 9:
						case 6:
							eo.current === null && (t = !0);
							var l = X;
							if (X = 0, zl = null, Pu(e, s, c, l), n && Vl) {
								o = 0;
								break a;
							}
							break;
						default: l = X, X = 0, zl = null, Pu(e, s, c, l);
					}
				}
				ku(), o = Wl;
				break;
			} catch (t) {
				Cu(e, t);
			}
		while (1);
		return t && e.shellSuspendCounter++, Wi = Ui = null, K = r, k.H = i, k.A = a, J === null && (q = null, Y = 0, Qr()), o;
	}
	function ku() {
		for (; J !== null;) Mu(J);
	}
	function Au(e, t) {
		var n = K;
		K |= 2;
		var r = Tu(), a = Eu();
		q !== e || Y !== t ? (nu = null, tu = ke() + 500, Su(e, t)) : Vl = Xe(e, t);
		a: do
			try {
				if (X !== 0 && J !== null) {
					t = J;
					var o = zl;
					b: switch (X) {
						case 1:
							X = 0, zl = null, Pu(e, t, o, 1);
							break;
						case 2:
						case 9:
							if (Ca(o)) {
								X = 0, zl = null, Nu(t);
								break;
							}
							t = function() {
								X !== 2 && X !== 9 || q !== e || (X = 7), rd(e);
							}, o.then(t, t);
							break a;
						case 3:
							X = 7;
							break a;
						case 4:
							X = 5;
							break a;
						case 7:
							Ca(o) ? (X = 0, zl = null, Nu(t)) : (X = 0, zl = null, Pu(e, t, o, 7));
							break;
						case 5:
							var s = null;
							switch (J.tag) {
								case 26: s = J.memoizedState;
								case 5:
								case 27:
									var c = J;
									if (s ? Wf(s) : c.stateNode.complete) {
										X = 0, zl = null;
										var l = c.sibling;
										if (l !== null) J = l;
										else {
											var u = c.return;
											u === null ? J = null : (J = u, Fu(u));
										}
										break b;
									}
							}
							X = 0, zl = null, Pu(e, t, o, 5);
							break;
						case 6:
							X = 0, zl = null, Pu(e, t, o, 6);
							break;
						case 8:
							xu(), Wl = 6;
							break a;
						default: throw Error(i(462));
					}
				}
				ju();
				break;
			} catch (t) {
				Cu(e, t);
			}
		while (1);
		return Wi = Ui = null, k.H = r, k.A = a, K = n, J === null ? (q = null, Y = 0, Qr(), Wl) : 0;
	}
	function ju() {
		for (; J !== null && !De();) Mu(J);
	}
	function Mu(e) {
		var t = jc(e.alternate, e, Ul);
		e.memoizedProps = e.pendingProps, t === null ? Fu(e) : J = t;
	}
	function Nu(e) {
		var t = e, n = t.alternate;
		switch (t.tag) {
			case 15:
			case 0:
				t = hc(n, t, t.pendingProps, t.type, void 0, Y);
				break;
			case 11:
				t = hc(n, t, t.pendingProps, t.type.render, t.ref, Y);
				break;
			case 5: Do(t);
			default: zc(n, t), t = J = li(t, Ul), t = jc(n, t, Ul);
		}
		e.memoizedProps = e.pendingProps, t === null ? Fu(e) : J = t;
	}
	function Pu(e, t, n, r) {
		Wi = Ui = null, Do(t), ka = null, Aa = 0;
		var i = t.return;
		try {
			if (ec(e, i, t, n, Y)) {
				Wl = 1, Ys(e, gi(n, e.current)), J = null;
				return;
			}
		} catch (t) {
			if (i !== null) throw J = i, t;
			Wl = 1, Ys(e, gi(n, e.current)), J = null;
			return;
		}
		t.flags & 32768 ? (H || r === 1 ? e = !0 : Vl || Y & 536870912 ? e = !1 : (Bl = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = eo.current, r !== null && r.tag === 13 && (r.flags |= 16384))), Iu(t, e)) : Fu(t);
	}
	function Fu(e) {
		var t = e;
		do {
			if (t.flags & 32768) {
				Iu(t, Bl);
				return;
			}
			e = t.return;
			var n = Lc(t.alternate, t, Ul);
			if (n !== null) {
				J = n;
				return;
			}
			if (t = t.sibling, t !== null) {
				J = t;
				return;
			}
			J = t = e;
		} while (t !== null);
		Wl === 0 && (Wl = 5);
	}
	function Iu(e, t) {
		do {
			var n = Rc(e.alternate, e);
			if (n !== null) {
				n.flags &= 32767, J = n;
				return;
			}
			if (n = e.return, n !== null && (n.flags |= 32768, n.subtreeFlags = 0, n.deletions = null), !t && (e = e.sibling, e !== null)) {
				J = e;
				return;
			}
			J = e = n;
		} while (e !== null);
		Wl = 6, J = null;
	}
	function Lu(e, t, n, r, a, o, s, c, l) {
		e.cancelPendingCommit = null;
		do
			Hu();
		while (iu !== 0);
		if (K & 6) throw Error(i(327));
		if (t !== null) {
			if (t === e.current) throw Error(i(177));
			if (o = t.lanes | t.childLanes, o |= Zr, tt(e, n, o, s, c, l), e === q && (J = q = null, Y = 0), ou = t, au = e, su = n, cu = o, lu = a, uu = r, t.subtreeFlags & 10256 || t.flags & 10256 ? (e.callbackNode = null, e.callbackPriority = 0, Xu(Ne, function() {
				return Uu(), null;
			})) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) != 0, t.subtreeFlags & 13878 || r) {
				r = k.T, k.T = null, a = A.p, A.p = 2, s = K, K |= 4;
				try {
					il(e, t, n);
				} finally {
					K = s, A.p = a, k.T = r;
				}
			}
			iu = 1, Ru(), zu(), Bu();
		}
	}
	function Ru() {
		if (iu === 1) {
			iu = 0;
			var e = au, t = ou, n = (t.flags & 13878) != 0;
			if (t.subtreeFlags & 13878 || n) {
				n = k.T, k.T = null;
				var r = A.p;
				A.p = 2;
				var i = K;
				K |= 4;
				try {
					_l(t, e);
					var a = zd, o = Er(e.containerInfo), s = a.focusedElem, c = a.selectionRange;
					if (o !== s && s && s.ownerDocument && Tr(s.ownerDocument.documentElement, s)) {
						if (c !== null && Dr(s)) {
							var l = c.start, u = c.end;
							if (u === void 0 && (u = l), "selectionStart" in s) s.selectionStart = l, s.selectionEnd = Math.min(u, s.value.length);
							else {
								var d = s.ownerDocument || document, f = d && d.defaultView || window;
								if (f.getSelection) {
									var p = f.getSelection(), m = s.textContent.length, h = Math.min(c.start, m), g = c.end === void 0 ? h : Math.min(c.end, m);
									!p.extend && h > g && (o = g, g = h, h = o);
									var _ = wr(s, h), v = wr(s, g);
									if (_ && v && (p.rangeCount !== 1 || p.anchorNode !== _.node || p.anchorOffset !== _.offset || p.focusNode !== v.node || p.focusOffset !== v.offset)) {
										var y = d.createRange();
										y.setStart(_.node, _.offset), p.removeAllRanges(), h > g ? (p.addRange(y), p.extend(v.node, v.offset)) : (y.setEnd(v.node, v.offset), p.addRange(y));
									}
								}
							}
						}
						for (d = [], p = s; p = p.parentNode;) p.nodeType === 1 && d.push({
							element: p,
							left: p.scrollLeft,
							top: p.scrollTop
						});
						for (typeof s.focus == "function" && s.focus(), s = 0; s < d.length; s++) {
							var b = d[s];
							b.element.scrollLeft = b.left, b.element.scrollTop = b.top;
						}
					}
					sp = !!Rd, zd = Rd = null;
				} finally {
					K = i, A.p = r, k.T = n;
				}
			}
			e.current = t, iu = 2;
		}
	}
	function zu() {
		if (iu === 2) {
			iu = 0;
			var e = au, t = ou, n = (t.flags & 8772) != 0;
			if (t.subtreeFlags & 8772 || n) {
				n = k.T, k.T = null;
				var r = A.p;
				A.p = 2;
				var i = K;
				K |= 4;
				try {
					al(e, t.alternate, t);
				} finally {
					K = i, A.p = r, k.T = n;
				}
			}
			iu = 3;
		}
	}
	function Bu() {
		if (iu === 4 || iu === 3) {
			iu = 0, Oe();
			var e = au, t = ou, n = su, r = uu;
			t.subtreeFlags & 10256 || t.flags & 10256 ? iu = 5 : (iu = 0, ou = au = null, Vu(e, e.pendingLanes));
			var i = e.pendingLanes;
			if (i === 0 && (ru = null), ot(n), t = t.stateNode, ze && typeof ze.onCommitFiberRoot == "function") try {
				ze.onCommitFiberRoot(Re, t, void 0, (t.current.flags & 128) == 128);
			} catch {}
			if (r !== null) {
				t = k.T, i = A.p, A.p = 2, k.T = null;
				try {
					for (var a = e.onRecoverableError, o = 0; o < r.length; o++) {
						var s = r[o];
						a(s.value, { componentStack: s.stack });
					}
				} finally {
					k.T = t, A.p = i;
				}
			}
			su & 3 && Hu(), rd(e), i = e.pendingLanes, n & 261930 && i & 42 ? e === fu ? du++ : (du = 0, fu = e) : du = 0, id(0, !1);
		}
	}
	function Vu(e, t) {
		(e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, oa(t)));
	}
	function Hu() {
		return Ru(), zu(), Bu(), Uu();
	}
	function Uu() {
		if (iu !== 5) return !1;
		var e = au, t = cu;
		cu = 0;
		var n = ot(su), r = k.T, a = A.p;
		try {
			A.p = 32 > n ? 32 : n, k.T = null, n = lu, lu = null;
			var o = au, s = su;
			if (iu = 0, ou = au = null, su = 0, K & 6) throw Error(i(331));
			var c = K;
			if (K |= 4, Pl(o.current), El(o, o.current, s, n), K = c, id(0, !1), ze && typeof ze.onPostCommitFiberRoot == "function") try {
				ze.onPostCommitFiberRoot(Re, o);
			} catch {}
			return !0;
		} finally {
			A.p = a, k.T = r, Vu(e, t);
		}
	}
	function Wu(e, t, n) {
		t = gi(n, t), t = Zs(e.stateNode, t, 2), e = Va(e, t, 2), e !== null && (et(e, 2), rd(e));
	}
	function Z(e, t, n) {
		if (e.tag === 3) Wu(e, e, n);
		else for (; t !== null;) {
			if (t.tag === 3) {
				Wu(t, e, n);
				break;
			} else if (t.tag === 1) {
				var r = t.stateNode;
				if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (ru === null || !ru.has(r))) {
					e = gi(n, e), n = Qs(2), r = Va(t, n, 2), r !== null && ($s(n, r, t, e), et(r, 2), rd(r));
					break;
				}
			}
			t = t.return;
		}
	}
	function Gu(e, t, n) {
		var r = e.pingCache;
		if (r === null) {
			r = e.pingCache = new Rl();
			var i = /* @__PURE__ */ new Set();
			r.set(t, i);
		} else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
		i.has(n) || (Hl = !0, i.add(n), e = Ku.bind(null, e, t, n), t.then(e, e));
	}
	function Ku(e, t, n) {
		var r = e.pingCache;
		r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & n, e.warmLanes &= ~n, q === e && (Y & n) === n && (Wl === 4 || Wl === 3 && (Y & 62914560) === Y && 300 > ke() - $l ? !(K & 2) && Su(e, 0) : ql |= n, Yl === Y && (Yl = 0)), rd(e);
	}
	function qu(e, t) {
		t === 0 && (t = Qe()), e = ti(e, t), e !== null && (et(e, t), rd(e));
	}
	function Ju(e) {
		var t = e.memoizedState, n = 0;
		t !== null && (n = t.retryLane), qu(e, n);
	}
	function Yu(e, t) {
		var n = 0;
		switch (e.tag) {
			case 31:
			case 13:
				var r = e.stateNode, a = e.memoizedState;
				a !== null && (n = a.retryLane);
				break;
			case 19:
				r = e.stateNode;
				break;
			case 22:
				r = e.stateNode._retryCache;
				break;
			default: throw Error(i(314));
		}
		r !== null && r.delete(t), qu(e, n);
	}
	function Xu(e, t) {
		return Te(e, t);
	}
	var Zu = null, Qu = null, $u = !1, ed = !1, td = !1, nd = 0;
	function rd(e) {
		e !== Qu && e.next === null && (Qu === null ? Zu = Qu = e : Qu = Qu.next = e), ed = !0, $u || ($u = !0, ud());
	}
	function id(e, t) {
		if (!td && ed) {
			td = !0;
			do
				for (var n = !1, r = Zu; r !== null;) {
					if (!t) if (e !== 0) {
						var i = r.pendingLanes;
						if (i === 0) var a = 0;
						else {
							var o = r.suspendedLanes, s = r.pingedLanes;
							a = (1 << 31 - Ve(42 | e) + 1) - 1, a &= i & ~(o & ~s), a = a & 201326741 ? a & 201326741 | 1 : a ? a | 2 : 0;
						}
						a !== 0 && (n = !0, ld(r, a));
					} else a = Y, a = Ye(r, r === q ? a : 0, r.cancelPendingCommit !== null || r.timeoutHandle !== -1), !(a & 3) || Xe(r, a) || (n = !0, ld(r, a));
					r = r.next;
				}
			while (n);
			td = !1;
		}
	}
	function ad() {
		od();
	}
	function od() {
		ed = $u = !1;
		var e = 0;
		nd !== 0 && Gd() && (e = nd);
		for (var t = ke(), n = null, r = Zu; r !== null;) {
			var i = r.next, a = sd(r, t);
			a === 0 ? (r.next = null, n === null ? Zu = i : n.next = i, i === null && (Qu = n)) : (n = r, (e !== 0 || a & 3) && (ed = !0)), r = i;
		}
		iu !== 0 && iu !== 5 || id(e, !1), nd !== 0 && (nd = 0);
	}
	function sd(e, t) {
		for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, a = e.pendingLanes & -62914561; 0 < a;) {
			var o = 31 - Ve(a), s = 1 << o, c = i[o];
			c === -1 ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = Ze(s, t)) : c <= t && (e.expiredLanes |= s), a &= ~s;
		}
		if (t = q, n = Y, n = Ye(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r = e.callbackNode, n === 0 || e === t && (X === 2 || X === 9) || e.cancelPendingCommit !== null) return r !== null && r !== null && Ee(r), e.callbackNode = null, e.callbackPriority = 0;
		if (!(n & 3) || Xe(e, n)) {
			if (t = n & -n, t === e.callbackPriority) return t;
			switch (r !== null && Ee(r), ot(n)) {
				case 2:
				case 8:
					n = Me;
					break;
				case 32:
					n = Ne;
					break;
				case 268435456:
					n = Fe;
					break;
				default: n = Ne;
			}
			return r = cd.bind(null, e), n = Te(n, r), e.callbackPriority = t, e.callbackNode = n, t;
		}
		return r !== null && r !== null && Ee(r), e.callbackPriority = 2, e.callbackNode = null, 2;
	}
	function cd(e, t) {
		if (iu !== 0 && iu !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
		var n = e.callbackNode;
		if (Hu() && e.callbackNode !== n) return null;
		var r = Y;
		return r = Ye(e, e === q ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r === 0 ? null : (gu(e, r, t), sd(e, ke()), e.callbackNode != null && e.callbackNode === n ? cd.bind(null, e) : null);
	}
	function ld(e, t) {
		if (Hu()) return null;
		gu(e, t, !0);
	}
	function ud() {
		Yd(function() {
			K & 6 ? Te(je, ad) : od();
		});
	}
	function dd() {
		if (nd === 0) {
			var e = la;
			e === 0 && (e = Ge, Ge <<= 1, !(Ge & 261888) && (Ge = 256)), nd = e;
		}
		return nd;
	}
	function fd(e) {
		return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : nn("" + e);
	}
	function pd(e, t) {
		var n = t.ownerDocument.createElement("input");
		return n.name = t.name, n.value = t.value, e.id && n.setAttribute("form", e.id), t.parentNode.insertBefore(n, t), e = new FormData(e), n.parentNode.removeChild(n), e;
	}
	function md(e, t, n, r, i) {
		if (t === "submit" && n && n.stateNode === i) {
			var a = fd((i[dt] || null).action), o = r.submitter;
			o && (t = (t = o[dt] || null) ? fd(t.formAction) : o.getAttribute("formAction"), t !== null && (a = t, o = null));
			var s = new Tn("action", "action", null, r, i);
			e.push({
				event: s,
				listeners: [{
					instance: null,
					listener: function() {
						if (r.defaultPrevented) {
							if (nd !== 0) {
								var e = o ? pd(i, o) : new FormData(i);
								Cs(n, {
									pending: !0,
									data: e,
									method: i.method,
									action: a
								}, null, e);
							}
						} else typeof a == "function" && (s.preventDefault(), e = o ? pd(i, o) : new FormData(i), Cs(n, {
							pending: !0,
							data: e,
							method: i.method,
							action: a
						}, a, e));
					},
					currentTarget: i
				}]
			});
		}
	}
	for (var hd = 0; hd < qr.length; hd++) {
		var gd = qr[hd];
		Jr(gd.toLowerCase(), "on" + (gd[0].toUpperCase() + gd.slice(1)));
	}
	Jr(zr, "onAnimationEnd"), Jr(Br, "onAnimationIteration"), Jr(Vr, "onAnimationStart"), Jr("dblclick", "onDoubleClick"), Jr("focusin", "onFocus"), Jr("focusout", "onBlur"), Jr(Hr, "onTransitionRun"), Jr(Ur, "onTransitionStart"), Jr(Wr, "onTransitionCancel"), Jr(Gr, "onTransitionEnd"), Dt("onMouseEnter", ["mouseout", "mouseover"]), Dt("onMouseLeave", ["mouseout", "mouseover"]), Dt("onPointerEnter", ["pointerout", "pointerover"]), Dt("onPointerLeave", ["pointerout", "pointerover"]), Et("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Et("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Et("onBeforeInput", [
		"compositionend",
		"keypress",
		"textInput",
		"paste"
	]), Et("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Et("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Et("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
	var _d = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), vd = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(_d));
	function yd(e, t) {
		t = (t & 4) != 0;
		for (var n = 0; n < e.length; n++) {
			var r = e[n], i = r.event;
			r = r.listeners;
			a: {
				var a = void 0;
				if (t) for (var o = r.length - 1; 0 <= o; o--) {
					var s = r[o], c = s.instance, l = s.currentTarget;
					if (s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Yr(e);
					}
					i.currentTarget = null, a = c;
				}
				else for (o = 0; o < r.length; o++) {
					if (s = r[o], c = s.instance, l = s.currentTarget, s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Yr(e);
					}
					i.currentTarget = null, a = c;
				}
			}
		}
	}
	function Q(e, t) {
		var n = t[pt];
		n === void 0 && (n = t[pt] = /* @__PURE__ */ new Set());
		var r = e + "__bubble";
		n.has(r) || (Cd(t, e, 2, !1), n.add(r));
	}
	function bd(e, t, n) {
		var r = 0;
		t && (r |= 4), Cd(n, e, r, t);
	}
	var xd = "_reactListening" + Math.random().toString(36).slice(2);
	function Sd(e) {
		if (!e[xd]) {
			e[xd] = !0, wt.forEach(function(t) {
				t !== "selectionchange" && (vd.has(t) || bd(t, !1, e), bd(t, !0, e));
			});
			var t = e.nodeType === 9 ? e : e.ownerDocument;
			t === null || t[xd] || (t[xd] = !0, bd("selectionchange", !1, t));
		}
	}
	function Cd(e, t, n, r) {
		switch (mp(t)) {
			case 2:
				var i = cp;
				break;
			case 8:
				i = lp;
				break;
			default: i = up;
		}
		n = i.bind(null, t, n, e), i = void 0, !mn || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (i = !0), r ? i === void 0 ? e.addEventListener(t, n, !0) : e.addEventListener(t, n, {
			capture: !0,
			passive: i
		}) : i === void 0 ? e.addEventListener(t, n, !1) : e.addEventListener(t, n, { passive: i });
	}
	function wd(e, t, n, r, i) {
		var a = r;
		if (!(t & 1) && !(t & 2) && r !== null) a: for (;;) {
			if (r === null) return;
			var s = r.tag;
			if (s === 3 || s === 4) {
				var c = r.stateNode.containerInfo;
				if (c === i) break;
				if (s === 4) for (s = r.return; s !== null;) {
					var l = s.tag;
					if ((l === 3 || l === 4) && s.stateNode.containerInfo === i) return;
					s = s.return;
				}
				for (; c !== null;) {
					if (s = yt(c), s === null) return;
					if (l = s.tag, l === 5 || l === 6 || l === 26 || l === 27) {
						r = a = s;
						continue a;
					}
					c = c.parentNode;
				}
			}
			r = r.return;
		}
		dn(function() {
			var r = a, i = on(n), s = [];
			a: {
				var c = Kr.get(e);
				if (c !== void 0) {
					var l = Tn, u = e;
					switch (e) {
						case "keypress": if (bn(n) === 0) break a;
						case "keydown":
						case "keyup":
							l = I;
							break;
						case "focusin":
							u = "focus", l = Nn;
							break;
						case "focusout":
							u = "blur", l = Nn;
							break;
						case "beforeblur":
						case "afterblur":
							l = Nn;
							break;
						case "click": if (n.button === 2) break a;
						case "auxclick":
						case "dblclick":
						case "mousedown":
						case "mousemove":
						case "mouseup":
						case "mouseout":
						case "mouseover":
						case "contextmenu":
							l = jn;
							break;
						case "drag":
						case "dragend":
						case "dragenter":
						case "dragexit":
						case "dragleave":
						case "dragover":
						case "dragstart":
						case "drop":
							l = Mn;
							break;
						case "touchcancel":
						case "touchend":
						case "touchmove":
						case "touchstart":
							l = Un;
							break;
						case zr:
						case Br:
						case Vr:
							l = Pn;
							break;
						case Gr:
							l = Wn;
							break;
						case "scroll":
						case "scrollend":
							l = Dn;
							break;
						case "wheel":
							l = Gn;
							break;
						case "copy":
						case "cut":
						case "paste":
							l = Fn;
							break;
						case "gotpointercapture":
						case "lostpointercapture":
						case "pointercancel":
						case "pointerdown":
						case "pointermove":
						case "pointerout":
						case "pointerover":
						case "pointerup":
							l = Hn;
							break;
						case "toggle":
						case "beforetoggle": l = Kn;
					}
					var d = (t & 4) != 0, f = !d && (e === "scroll" || e === "scrollend"), p = d ? c === null ? null : c + "Capture" : c;
					d = [];
					for (var m = r, h; m !== null;) {
						var g = m;
						if (h = g.stateNode, g = g.tag, g !== 5 && g !== 26 && g !== 27 || h === null || p === null || (g = fn(m, p), g != null && d.push(Td(m, g, h))), f) break;
						m = m.return;
					}
					0 < d.length && (c = new l(c, u, null, n, i), s.push({
						event: c,
						listeners: d
					}));
				}
			}
			if (!(t & 7)) {
				a: {
					if (c = e === "mouseover" || e === "pointerover", l = e === "mouseout" || e === "pointerout", c && n !== an && (u = n.relatedTarget || n.fromElement) && (yt(u) || u[ft])) break a;
					if ((l || c) && (c = i.window === i ? i : (c = i.ownerDocument) ? c.defaultView || c.parentWindow : window, l ? (u = n.relatedTarget || n.toElement, l = r, u = u ? yt(u) : null, u !== null && (f = o(u), d = u.tag, u !== f || d !== 5 && d !== 27 && d !== 6) && (u = null)) : (l = null, u = r), l !== u)) {
						if (d = jn, g = "onMouseLeave", p = "onMouseEnter", m = "mouse", (e === "pointerout" || e === "pointerover") && (d = Hn, g = "onPointerLeave", p = "onPointerEnter", m = "pointer"), f = l == null ? c : xt(l), h = u == null ? c : xt(u), c = new d(g, m + "leave", l, n, i), c.target = f, c.relatedTarget = h, g = null, yt(i) === r && (d = new d(p, m + "enter", u, n, i), d.target = h, d.relatedTarget = f, g = d), f = g, l && u) b: {
							for (d = Dd, p = l, m = u, h = 0, g = p; g; g = d(g)) h++;
							g = 0;
							for (var _ = m; _; _ = d(_)) g++;
							for (; 0 < h - g;) p = d(p), h--;
							for (; 0 < g - h;) m = d(m), g--;
							for (; h--;) {
								if (p === m || m !== null && p === m.alternate) {
									d = p;
									break b;
								}
								p = d(p), m = d(m);
							}
							d = null;
						}
						else d = null;
						l !== null && Od(s, c, l, d, !1), u !== null && f !== null && Od(s, f, u, d, !0);
					}
				}
				a: {
					if (c = r ? xt(r) : window, l = c.nodeName && c.nodeName.toLowerCase(), l === "select" || l === "input" && c.type === "file") var v = dr;
					else if (ar(c)) if (fr) v = yr;
					else {
						v = _r;
						var y = gr;
					}
					else l = c.nodeName, !l || l.toLowerCase() !== "input" || c.type !== "checkbox" && c.type !== "radio" ? r && $t(r.elementType) && (v = dr) : v = vr;
					if (v &&= v(e, r)) {
						or(s, v, n, i);
						break a;
					}
					y && y(e, c, r), e === "focusout" && r && c.type === "number" && r.memoizedProps.value != null && Gt(c, "number", c.value);
				}
				switch (y = r ? xt(r) : window, e) {
					case "focusin":
						(ar(y) || y.contentEditable === "true") && (kr = y, Ar = r, jr = null);
						break;
					case "focusout":
						jr = Ar = kr = null;
						break;
					case "mousedown":
						Mr = !0;
						break;
					case "contextmenu":
					case "mouseup":
					case "dragend":
						Mr = !1, Nr(s, n, i);
						break;
					case "selectionchange": if (Or) break;
					case "keydown":
					case "keyup": Nr(s, n, i);
				}
				var b;
				if (Jn) b: {
					switch (e) {
						case "compositionstart":
							var x = "onCompositionStart";
							break b;
						case "compositionend":
							x = "onCompositionEnd";
							break b;
						case "compositionupdate":
							x = "onCompositionUpdate";
							break b;
					}
					x = void 0;
				}
				else tr ? $n(e, n) && (x = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (x = "onCompositionStart");
				x && (Xn && n.locale !== "ko" && (tr || x !== "onCompositionStart" ? x === "onCompositionEnd" && tr && (b = yn()) : (gn = i, _n = "value" in gn ? gn.value : gn.textContent, tr = !0)), y = Ed(r, x), 0 < y.length && (x = new In(x, e, null, n, i), s.push({
					event: x,
					listeners: y
				}), b ? x.data = b : (b = er(n), b !== null && (x.data = b)))), (b = Yn ? nr(e, n) : rr(e, n)) && (x = Ed(r, "onBeforeInput"), 0 < x.length && (y = new In("onBeforeInput", "beforeinput", null, n, i), s.push({
					event: y,
					listeners: x
				}), y.data = b)), md(s, e, r, n, i);
			}
			yd(s, t);
		});
	}
	function Td(e, t, n) {
		return {
			instance: e,
			listener: t,
			currentTarget: n
		};
	}
	function Ed(e, t) {
		for (var n = t + "Capture", r = []; e !== null;) {
			var i = e, a = i.stateNode;
			if (i = i.tag, i !== 5 && i !== 26 && i !== 27 || a === null || (i = fn(e, n), i != null && r.unshift(Td(e, i, a)), i = fn(e, t), i != null && r.push(Td(e, i, a))), e.tag === 3) return r;
			e = e.return;
		}
		return [];
	}
	function Dd(e) {
		if (e === null) return null;
		do
			e = e.return;
		while (e && e.tag !== 5 && e.tag !== 27);
		return e || null;
	}
	function Od(e, t, n, r, i) {
		for (var a = t._reactName, o = []; n !== null && n !== r;) {
			var s = n, c = s.alternate, l = s.stateNode;
			if (s = s.tag, c !== null && c === r) break;
			s !== 5 && s !== 26 && s !== 27 || l === null || (c = l, i ? (l = fn(n, a), l != null && o.unshift(Td(n, l, c))) : i || (l = fn(n, a), l != null && o.push(Td(n, l, c)))), n = n.return;
		}
		o.length !== 0 && e.push({
			event: t,
			listeners: o
		});
	}
	var kd = /\r\n?/g, Ad = /\u0000|\uFFFD/g;
	function jd(e) {
		return (typeof e == "string" ? e : "" + e).replace(kd, "\n").replace(Ad, "");
	}
	function Md(e, t) {
		return t = jd(t), jd(e) === t;
	}
	function $(e, t, n, r, a, o) {
		switch (n) {
			case "children":
				typeof r == "string" ? t === "body" || t === "textarea" && r === "" || Yt(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && Yt(e, "" + r);
				break;
			case "className":
				Nt(e, "class", r);
				break;
			case "tabIndex":
				Nt(e, "tabindex", r);
				break;
			case "dir":
			case "role":
			case "viewBox":
			case "width":
			case "height":
				Nt(e, n, r);
				break;
			case "style":
				Qt(e, r, o);
				break;
			case "data": if (t !== "object") {
				Nt(e, "data", r);
				break;
			}
			case "src":
			case "href":
				if (r === "" && (t !== "a" || n !== "href")) {
					e.removeAttribute(n);
					break;
				}
				if (r == null || typeof r == "function" || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = nn("" + r), e.setAttribute(n, r);
				break;
			case "action":
			case "formAction":
				if (typeof r == "function") {
					e.setAttribute(n, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
					break;
				} else typeof o == "function" && (n === "formAction" ? (t !== "input" && $(e, t, "name", a.name, a, null), $(e, t, "formEncType", a.formEncType, a, null), $(e, t, "formMethod", a.formMethod, a, null), $(e, t, "formTarget", a.formTarget, a, null)) : ($(e, t, "encType", a.encType, a, null), $(e, t, "method", a.method, a, null), $(e, t, "target", a.target, a, null)));
				if (r == null || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = nn("" + r), e.setAttribute(n, r);
				break;
			case "onClick":
				r != null && (e.onclick = rn);
				break;
			case "onScroll":
				r != null && Q("scroll", e);
				break;
			case "onScrollEnd":
				r != null && Q("scrollend", e);
				break;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						e.innerHTML = n;
					}
				}
				break;
			case "multiple":
				e.multiple = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "muted":
				e.muted = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "defaultValue":
			case "defaultChecked":
			case "innerHTML":
			case "ref": break;
			case "autoFocus": break;
			case "xlinkHref":
				if (r == null || typeof r == "function" || typeof r == "boolean" || typeof r == "symbol") {
					e.removeAttribute("xlink:href");
					break;
				}
				n = nn("" + r), e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", n);
				break;
			case "contentEditable":
			case "spellCheck":
			case "draggable":
			case "value":
			case "autoReverse":
			case "externalResourcesRequired":
			case "focusable":
			case "preserveAlpha":
				r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "" + r) : e.removeAttribute(n);
				break;
			case "inert":
			case "allowFullScreen":
			case "async":
			case "autoPlay":
			case "controls":
			case "default":
			case "defer":
			case "disabled":
			case "disablePictureInPicture":
			case "disableRemotePlayback":
			case "formNoValidate":
			case "hidden":
			case "loop":
			case "noModule":
			case "noValidate":
			case "open":
			case "playsInline":
			case "readOnly":
			case "required":
			case "reversed":
			case "scoped":
			case "seamless":
			case "itemScope":
				r && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "") : e.removeAttribute(n);
				break;
			case "capture":
			case "download":
				!0 === r ? e.setAttribute(n, "") : !1 !== r && r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "cols":
			case "rows":
			case "size":
			case "span":
				r != null && typeof r != "function" && typeof r != "symbol" && !isNaN(r) && 1 <= r ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "rowSpan":
			case "start":
				r == null || typeof r == "function" || typeof r == "symbol" || isNaN(r) ? e.removeAttribute(n) : e.setAttribute(n, r);
				break;
			case "popover":
				Q("beforetoggle", e), Q("toggle", e), Mt(e, "popover", r);
				break;
			case "xlinkActuate":
				Pt(e, "http://www.w3.org/1999/xlink", "xlink:actuate", r);
				break;
			case "xlinkArcrole":
				Pt(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", r);
				break;
			case "xlinkRole":
				Pt(e, "http://www.w3.org/1999/xlink", "xlink:role", r);
				break;
			case "xlinkShow":
				Pt(e, "http://www.w3.org/1999/xlink", "xlink:show", r);
				break;
			case "xlinkTitle":
				Pt(e, "http://www.w3.org/1999/xlink", "xlink:title", r);
				break;
			case "xlinkType":
				Pt(e, "http://www.w3.org/1999/xlink", "xlink:type", r);
				break;
			case "xmlBase":
				Pt(e, "http://www.w3.org/XML/1998/namespace", "xml:base", r);
				break;
			case "xmlLang":
				Pt(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", r);
				break;
			case "xmlSpace":
				Pt(e, "http://www.w3.org/XML/1998/namespace", "xml:space", r);
				break;
			case "is":
				Mt(e, "is", r);
				break;
			case "innerText":
			case "textContent": break;
			default: (!(2 < n.length) || n[0] !== "o" && n[0] !== "O" || n[1] !== "n" && n[1] !== "N") && (n = en.get(n) || n, Mt(e, n, r));
		}
	}
	function Nd(e, t, n, r, a, o) {
		switch (n) {
			case "style":
				Qt(e, r, o);
				break;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						e.innerHTML = n;
					}
				}
				break;
			case "children":
				typeof r == "string" ? Yt(e, r) : (typeof r == "number" || typeof r == "bigint") && Yt(e, "" + r);
				break;
			case "onScroll":
				r != null && Q("scroll", e);
				break;
			case "onScrollEnd":
				r != null && Q("scrollend", e);
				break;
			case "onClick":
				r != null && (e.onclick = rn);
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "innerHTML":
			case "ref": break;
			case "innerText":
			case "textContent": break;
			default: if (!Tt.hasOwnProperty(n)) a: {
				if (n[0] === "o" && n[1] === "n" && (a = n.endsWith("Capture"), t = n.slice(2, a ? n.length - 7 : void 0), o = e[dt] || null, o = o == null ? null : o[n], typeof o == "function" && e.removeEventListener(t, o, a), typeof r == "function")) {
					typeof o != "function" && o !== null && (n in e ? e[n] = null : e.hasAttribute(n) && e.removeAttribute(n)), e.addEventListener(t, r, a);
					break a;
				}
				n in e ? e[n] = r : !0 === r ? e.setAttribute(n, "") : Mt(e, n, r);
			}
		}
	}
	function Pd(e, t, n) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "img":
				Q("error", e), Q("load", e);
				var r = !1, a = !1, o;
				for (o in n) if (n.hasOwnProperty(o)) {
					var s = n[o];
					if (s != null) switch (o) {
						case "src":
							r = !0;
							break;
						case "srcSet":
							a = !0;
							break;
						case "children":
						case "dangerouslySetInnerHTML": throw Error(i(137, t));
						default: $(e, t, o, s, n, null);
					}
				}
				a && $(e, t, "srcSet", n.srcSet, n, null), r && $(e, t, "src", n.src, n, null);
				return;
			case "input":
				Q("invalid", e);
				var c = o = s = a = null, l = null, u = null;
				for (r in n) if (n.hasOwnProperty(r)) {
					var d = n[r];
					if (d != null) switch (r) {
						case "name":
							a = d;
							break;
						case "type":
							s = d;
							break;
						case "checked":
							l = d;
							break;
						case "defaultChecked":
							u = d;
							break;
						case "value":
							o = d;
							break;
						case "defaultValue":
							c = d;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (d != null) throw Error(i(137, t));
							break;
						default: $(e, t, r, d, n, null);
					}
				}
				Wt(e, o, c, l, u, s, a, !1);
				return;
			case "select":
				for (a in Q("invalid", e), r = s = o = null, n) if (n.hasOwnProperty(a) && (c = n[a], c != null)) switch (a) {
					case "value":
						o = c;
						break;
					case "defaultValue":
						s = c;
						break;
					case "multiple": r = c;
					default: $(e, t, a, c, n, null);
				}
				t = o, n = s, e.multiple = !!r, t == null ? n != null && Kt(e, !!r, n, !0) : Kt(e, !!r, t, !1);
				return;
			case "textarea":
				for (s in Q("invalid", e), o = a = r = null, n) if (n.hasOwnProperty(s) && (c = n[s], c != null)) switch (s) {
					case "value":
						r = c;
						break;
					case "defaultValue":
						a = c;
						break;
					case "children":
						o = c;
						break;
					case "dangerouslySetInnerHTML":
						if (c != null) throw Error(i(91));
						break;
					default: $(e, t, s, c, n, null);
				}
				Jt(e, r, a, o);
				return;
			case "option":
				for (l in n) if (n.hasOwnProperty(l) && (r = n[l], r != null)) switch (l) {
					case "selected":
						e.selected = r && typeof r != "function" && typeof r != "symbol";
						break;
					default: $(e, t, l, r, n, null);
				}
				return;
			case "dialog":
				Q("beforetoggle", e), Q("toggle", e), Q("cancel", e), Q("close", e);
				break;
			case "iframe":
			case "object":
				Q("load", e);
				break;
			case "video":
			case "audio":
				for (r = 0; r < _d.length; r++) Q(_d[r], e);
				break;
			case "image":
				Q("error", e), Q("load", e);
				break;
			case "details":
				Q("toggle", e);
				break;
			case "embed":
			case "source":
			case "link": Q("error", e), Q("load", e);
			case "area":
			case "base":
			case "br":
			case "col":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "track":
			case "wbr":
			case "menuitem":
				for (u in n) if (n.hasOwnProperty(u) && (r = n[u], r != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML": throw Error(i(137, t));
					default: $(e, t, u, r, n, null);
				}
				return;
			default: if ($t(t)) {
				for (d in n) n.hasOwnProperty(d) && (r = n[d], r !== void 0 && Nd(e, t, d, r, n, void 0));
				return;
			}
		}
		for (c in n) n.hasOwnProperty(c) && (r = n[c], r != null && $(e, t, c, r, n, null));
	}
	function Fd(e, t, n, r) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "input":
				var a = null, o = null, s = null, c = null, l = null, u = null, d = null;
				for (m in n) {
					var f = n[m];
					if (n.hasOwnProperty(m) && f != null) switch (m) {
						case "checked": break;
						case "value": break;
						case "defaultValue": l = f;
						default: r.hasOwnProperty(m) || $(e, t, m, null, r, f);
					}
				}
				for (var p in r) {
					var m = r[p];
					if (f = n[p], r.hasOwnProperty(p) && (m != null || f != null)) switch (p) {
						case "type":
							o = m;
							break;
						case "name":
							a = m;
							break;
						case "checked":
							u = m;
							break;
						case "defaultChecked":
							d = m;
							break;
						case "value":
							s = m;
							break;
						case "defaultValue":
							c = m;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (m != null) throw Error(i(137, t));
							break;
						default: m !== f && $(e, t, p, m, r, f);
					}
				}
				Ut(e, s, c, l, u, d, o, a);
				return;
			case "select":
				for (o in m = s = c = p = null, n) if (l = n[o], n.hasOwnProperty(o) && l != null) switch (o) {
					case "value": break;
					case "multiple": m = l;
					default: r.hasOwnProperty(o) || $(e, t, o, null, r, l);
				}
				for (a in r) if (o = r[a], l = n[a], r.hasOwnProperty(a) && (o != null || l != null)) switch (a) {
					case "value":
						p = o;
						break;
					case "defaultValue":
						c = o;
						break;
					case "multiple": s = o;
					default: o !== l && $(e, t, a, o, r, l);
				}
				t = c, n = s, r = m, p == null ? !!r != !!n && (t == null ? Kt(e, !!n, n ? [] : "", !1) : Kt(e, !!n, t, !0)) : Kt(e, !!n, p, !1);
				return;
			case "textarea":
				for (c in m = p = null, n) if (a = n[c], n.hasOwnProperty(c) && a != null && !r.hasOwnProperty(c)) switch (c) {
					case "value": break;
					case "children": break;
					default: $(e, t, c, null, r, a);
				}
				for (s in r) if (a = r[s], o = n[s], r.hasOwnProperty(s) && (a != null || o != null)) switch (s) {
					case "value":
						p = a;
						break;
					case "defaultValue":
						m = a;
						break;
					case "children": break;
					case "dangerouslySetInnerHTML":
						if (a != null) throw Error(i(91));
						break;
					default: a !== o && $(e, t, s, a, r, o);
				}
				qt(e, p, m);
				return;
			case "option":
				for (var h in n) if (p = n[h], n.hasOwnProperty(h) && p != null && !r.hasOwnProperty(h)) switch (h) {
					case "selected":
						e.selected = !1;
						break;
					default: $(e, t, h, null, r, p);
				}
				for (l in r) if (p = r[l], m = n[l], r.hasOwnProperty(l) && p !== m && (p != null || m != null)) switch (l) {
					case "selected":
						e.selected = p && typeof p != "function" && typeof p != "symbol";
						break;
					default: $(e, t, l, p, r, m);
				}
				return;
			case "img":
			case "link":
			case "area":
			case "base":
			case "br":
			case "col":
			case "embed":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "source":
			case "track":
			case "wbr":
			case "menuitem":
				for (var g in n) p = n[g], n.hasOwnProperty(g) && p != null && !r.hasOwnProperty(g) && $(e, t, g, null, r, p);
				for (u in r) if (p = r[u], m = n[u], r.hasOwnProperty(u) && p !== m && (p != null || m != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML":
						if (p != null) throw Error(i(137, t));
						break;
					default: $(e, t, u, p, r, m);
				}
				return;
			default: if ($t(t)) {
				for (var _ in n) p = n[_], n.hasOwnProperty(_) && p !== void 0 && !r.hasOwnProperty(_) && Nd(e, t, _, void 0, r, p);
				for (d in r) p = r[d], m = n[d], !r.hasOwnProperty(d) || p === m || p === void 0 && m === void 0 || Nd(e, t, d, p, r, m);
				return;
			}
		}
		for (var v in n) p = n[v], n.hasOwnProperty(v) && p != null && !r.hasOwnProperty(v) && $(e, t, v, null, r, p);
		for (f in r) p = r[f], m = n[f], !r.hasOwnProperty(f) || p === m || p == null && m == null || $(e, t, f, p, r, m);
	}
	function Id(e) {
		switch (e) {
			case "css":
			case "script":
			case "font":
			case "img":
			case "image":
			case "input":
			case "link": return !0;
			default: return !1;
		}
	}
	function Ld() {
		if (typeof performance.getEntriesByType == "function") {
			for (var e = 0, t = 0, n = performance.getEntriesByType("resource"), r = 0; r < n.length; r++) {
				var i = n[r], a = i.transferSize, o = i.initiatorType, s = i.duration;
				if (a && s && Id(o)) {
					for (o = 0, s = i.responseEnd, r += 1; r < n.length; r++) {
						var c = n[r], l = c.startTime;
						if (l > s) break;
						var u = c.transferSize, d = c.initiatorType;
						u && Id(d) && (c = c.responseEnd, o += u * (c < s ? 1 : (s - l) / (c - l)));
					}
					if (--r, t += 8 * (a + o) / (i.duration / 1e3), e++, 10 < e) break;
				}
			}
			if (0 < e) return t / e / 1e6;
		}
		return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
	}
	var Rd = null, zd = null;
	function Bd(e) {
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	function Vd(e) {
		switch (e) {
			case "http://www.w3.org/2000/svg": return 1;
			case "http://www.w3.org/1998/Math/MathML": return 2;
			default: return 0;
		}
	}
	function Hd(e, t) {
		if (e === 0) switch (t) {
			case "svg": return 1;
			case "math": return 2;
			default: return 0;
		}
		return e === 1 && t === "foreignObject" ? 0 : e;
	}
	function Ud(e, t) {
		return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
	}
	var Wd = null;
	function Gd() {
		var e = window.event;
		return e && e.type === "popstate" ? e === Wd ? !1 : (Wd = e, !0) : (Wd = null, !1);
	}
	var Kd = typeof setTimeout == "function" ? setTimeout : void 0, qd = typeof clearTimeout == "function" ? clearTimeout : void 0, Jd = typeof Promise == "function" ? Promise : void 0, Yd = typeof queueMicrotask == "function" ? queueMicrotask : Jd === void 0 ? Kd : function(e) {
		return Jd.resolve(null).then(e).catch(Xd);
	};
	function Xd(e) {
		setTimeout(function() {
			throw e;
		});
	}
	function Zd(e) {
		return e === "head";
	}
	function Qd(e, t) {
		var n = t, r = 0;
		do {
			var i = n.nextSibling;
			if (e.removeChild(n), i && i.nodeType === 8) if (n = i.data, n === "/$" || n === "/&") {
				if (r === 0) {
					e.removeChild(i), Np(t);
					return;
				}
				r--;
			} else if (n === "$" || n === "$?" || n === "$~" || n === "$!" || n === "&") r++;
			else if (n === "html") pf(e.ownerDocument.documentElement);
			else if (n === "head") {
				n = e.ownerDocument.head, pf(n);
				for (var a = n.firstChild; a;) {
					var o = a.nextSibling, s = a.nodeName;
					a[_t] || s === "SCRIPT" || s === "STYLE" || s === "LINK" && a.rel.toLowerCase() === "stylesheet" || n.removeChild(a), a = o;
				}
			} else n === "body" && pf(e.ownerDocument.body);
			n = i;
		} while (n);
		Np(t);
	}
	function $d(e, t) {
		var n = e;
		e = 0;
		do {
			var r = n.nextSibling;
			if (n.nodeType === 1 ? t ? (n._stashedDisplay = n.style.display, n.style.display = "none") : (n.style.display = n._stashedDisplay || "", n.getAttribute("style") === "" && n.removeAttribute("style")) : n.nodeType === 3 && (t ? (n._stashedText = n.nodeValue, n.nodeValue = "") : n.nodeValue = n._stashedText || ""), r && r.nodeType === 8) if (n = r.data, n === "/$") {
				if (e === 0) break;
				e--;
			} else n !== "$" && n !== "$?" && n !== "$~" && n !== "$!" || e++;
			n = r;
		} while (n);
	}
	function ef(e) {
		var t = e.firstChild;
		for (t && t.nodeType === 10 && (t = t.nextSibling); t;) {
			var n = t;
			switch (t = t.nextSibling, n.nodeName) {
				case "HTML":
				case "HEAD":
				case "BODY":
					ef(n), vt(n);
					continue;
				case "SCRIPT":
				case "STYLE": continue;
				case "LINK": if (n.rel.toLowerCase() === "stylesheet") continue;
			}
			e.removeChild(n);
		}
	}
	function tf(e, t, n, r) {
		for (; e.nodeType === 1;) {
			var i = n;
			if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
				if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
			} else if (!r) if (t === "input" && e.type === "hidden") {
				var a = i.name == null ? null : "" + i.name;
				if (i.type === "hidden" && e.getAttribute("name") === a) return e;
			} else return e;
			else if (!e[_t]) switch (t) {
				case "meta":
					if (!e.hasAttribute("itemprop")) break;
					return e;
				case "link":
					if (a = e.getAttribute("rel"), a === "stylesheet" && e.hasAttribute("data-precedence") || a !== i.rel || e.getAttribute("href") !== (i.href == null || i.href === "" ? null : i.href) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin) || e.getAttribute("title") !== (i.title == null ? null : i.title)) break;
					return e;
				case "style":
					if (e.hasAttribute("data-precedence")) break;
					return e;
				case "script":
					if (a = e.getAttribute("src"), (a !== (i.src == null ? null : i.src) || e.getAttribute("type") !== (i.type == null ? null : i.type) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin)) && a && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
					return e;
				default: return e;
			}
			if (e = cf(e.nextSibling), e === null) break;
		}
		return null;
	}
	function nf(e, t, n) {
		if (t === "") return null;
		for (; e.nodeType !== 3;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !n || (e = cf(e.nextSibling), e === null)) return null;
		return e;
	}
	function rf(e, t) {
		for (; e.nodeType !== 8;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = cf(e.nextSibling), e === null)) return null;
		return e;
	}
	function af(e) {
		return e.data === "$?" || e.data === "$~";
	}
	function of(e) {
		return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
	}
	function sf(e, t) {
		var n = e.ownerDocument;
		if (e.data === "$~") e._reactRetry = t;
		else if (e.data !== "$?" || n.readyState !== "loading") t();
		else {
			var r = function() {
				t(), n.removeEventListener("DOMContentLoaded", r);
			};
			n.addEventListener("DOMContentLoaded", r), e._reactRetry = r;
		}
	}
	function cf(e) {
		for (; e != null; e = e.nextSibling) {
			var t = e.nodeType;
			if (t === 1 || t === 3) break;
			if (t === 8) {
				if (t = e.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F") break;
				if (t === "/$" || t === "/&") return null;
			}
		}
		return e;
	}
	var lf = null;
	function uf(e) {
		e = e.nextSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "/$" || n === "/&") {
					if (t === 0) return cf(e.nextSibling);
					t--;
				} else n !== "$" && n !== "$!" && n !== "$?" && n !== "$~" && n !== "&" || t++;
			}
			e = e.nextSibling;
		}
		return null;
	}
	function df(e) {
		e = e.previousSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "$" || n === "$!" || n === "$?" || n === "$~" || n === "&") {
					if (t === 0) return e;
					t--;
				} else n !== "/$" && n !== "/&" || t++;
			}
			e = e.previousSibling;
		}
		return null;
	}
	function ff(e, t, n) {
		switch (t = Bd(n), e) {
			case "html":
				if (e = t.documentElement, !e) throw Error(i(452));
				return e;
			case "head":
				if (e = t.head, !e) throw Error(i(453));
				return e;
			case "body":
				if (e = t.body, !e) throw Error(i(454));
				return e;
			default: throw Error(i(451));
		}
	}
	function pf(e) {
		for (var t = e.attributes; t.length;) e.removeAttributeNode(t[0]);
		vt(e);
	}
	var mf = /* @__PURE__ */ new Map(), hf = /* @__PURE__ */ new Set();
	function gf(e) {
		return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
	}
	var _f = A.d;
	A.d = {
		f: vf,
		r: yf,
		D: Sf,
		C: Cf,
		L: wf,
		m: Tf,
		X: Df,
		S: Ef,
		M: Of
	};
	function vf() {
		var e = _f.f(), t = bu();
		return e || t;
	}
	function yf(e) {
		var t = bt(e);
		t !== null && t.tag === 5 && t.type === "form" ? Ts(t) : _f.r(e);
	}
	var bf = typeof document > "u" ? null : document;
	function xf(e, t, n) {
		var r = bf;
		if (r && typeof t == "string" && t) {
			var i = Ht(t);
			i = "link[rel=\"" + e + "\"][href=\"" + i + "\"]", typeof n == "string" && (i += "[crossorigin=\"" + n + "\"]"), hf.has(i) || (hf.add(i), e = {
				rel: e,
				crossOrigin: n,
				href: t
			}, r.querySelector(i) === null && (t = r.createElement("link"), Pd(t, "link", e), Ct(t), r.head.appendChild(t)));
		}
	}
	function Sf(e) {
		_f.D(e), xf("dns-prefetch", e, null);
	}
	function Cf(e, t) {
		_f.C(e, t), xf("preconnect", e, t);
	}
	function wf(e, t, n) {
		_f.L(e, t, n);
		var r = bf;
		if (r && e && t) {
			var i = "link[rel=\"preload\"][as=\"" + Ht(t) + "\"]";
			t === "image" && n && n.imageSrcSet ? (i += "[imagesrcset=\"" + Ht(n.imageSrcSet) + "\"]", typeof n.imageSizes == "string" && (i += "[imagesizes=\"" + Ht(n.imageSizes) + "\"]")) : i += "[href=\"" + Ht(e) + "\"]";
			var a = i;
			switch (t) {
				case "style":
					a = Af(e);
					break;
				case "script": a = Pf(e);
			}
			mf.has(a) || (e = h({
				rel: "preload",
				href: t === "image" && n && n.imageSrcSet ? void 0 : e,
				as: t
			}, n), mf.set(a, e), r.querySelector(i) !== null || t === "style" && r.querySelector(jf(a)) || t === "script" && r.querySelector(Ff(a)) || (t = r.createElement("link"), Pd(t, "link", e), Ct(t), r.head.appendChild(t)));
		}
	}
	function Tf(e, t) {
		_f.m(e, t);
		var n = bf;
		if (n && e) {
			var r = t && typeof t.as == "string" ? t.as : "script", i = "link[rel=\"modulepreload\"][as=\"" + Ht(r) + "\"][href=\"" + Ht(e) + "\"]", a = i;
			switch (r) {
				case "audioworklet":
				case "paintworklet":
				case "serviceworker":
				case "sharedworker":
				case "worker":
				case "script": a = Pf(e);
			}
			if (!mf.has(a) && (e = h({
				rel: "modulepreload",
				href: e
			}, t), mf.set(a, e), n.querySelector(i) === null)) {
				switch (r) {
					case "audioworklet":
					case "paintworklet":
					case "serviceworker":
					case "sharedworker":
					case "worker":
					case "script": if (n.querySelector(Ff(a))) return;
				}
				r = n.createElement("link"), Pd(r, "link", e), Ct(r), n.head.appendChild(r);
			}
		}
	}
	function Ef(e, t, n) {
		_f.S(e, t, n);
		var r = bf;
		if (r && e) {
			var i = St(r).hoistableStyles, a = Af(e);
			t ||= "default";
			var o = i.get(a);
			if (!o) {
				var s = {
					loading: 0,
					preload: null
				};
				if (o = r.querySelector(jf(a))) s.loading = 5;
				else {
					e = h({
						rel: "stylesheet",
						href: e,
						"data-precedence": t
					}, n), (n = mf.get(a)) && Rf(e, n);
					var c = o = r.createElement("link");
					Ct(c), Pd(c, "link", e), c._p = new Promise(function(e, t) {
						c.onload = e, c.onerror = t;
					}), c.addEventListener("load", function() {
						s.loading |= 1;
					}), c.addEventListener("error", function() {
						s.loading |= 2;
					}), s.loading |= 4, Lf(o, t, r);
				}
				o = {
					type: "stylesheet",
					instance: o,
					count: 1,
					state: s
				}, i.set(a, o);
			}
		}
	}
	function Df(e, t) {
		_f.X(e, t);
		var n = bf;
		if (n && e) {
			var r = St(n).hoistableScripts, i = Pf(e), a = r.get(i);
			a || (a = n.querySelector(Ff(i)), a || (e = h({
				src: e,
				async: !0
			}, t), (t = mf.get(i)) && zf(e, t), a = n.createElement("script"), Ct(a), Pd(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function Of(e, t) {
		_f.M(e, t);
		var n = bf;
		if (n && e) {
			var r = St(n).hoistableScripts, i = Pf(e), a = r.get(i);
			a || (a = n.querySelector(Ff(i)), a || (e = h({
				src: e,
				async: !0,
				type: "module"
			}, t), (t = mf.get(i)) && zf(e, t), a = n.createElement("script"), Ct(a), Pd(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function kf(e, t, n, r) {
		var a = (a = de.current) ? gf(a) : null;
		if (!a) throw Error(i(446));
		switch (e) {
			case "meta":
			case "title": return null;
			case "style": return typeof n.precedence == "string" && typeof n.href == "string" ? (t = Af(n.href), n = St(a).hoistableStyles, r = n.get(t), r || (r = {
				type: "style",
				instance: null,
				count: 0,
				state: null
			}, n.set(t, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			case "link":
				if (n.rel === "stylesheet" && typeof n.href == "string" && typeof n.precedence == "string") {
					e = Af(n.href);
					var o = St(a).hoistableStyles, s = o.get(e);
					if (s || (a = a.ownerDocument || a, s = {
						type: "stylesheet",
						instance: null,
						count: 0,
						state: {
							loading: 0,
							preload: null
						}
					}, o.set(e, s), (o = a.querySelector(jf(e))) && !o._p && (s.instance = o, s.state.loading = 5), mf.has(e) || (n = {
						rel: "preload",
						as: "style",
						href: n.href,
						crossOrigin: n.crossOrigin,
						integrity: n.integrity,
						media: n.media,
						hrefLang: n.hrefLang,
						referrerPolicy: n.referrerPolicy
					}, mf.set(e, n), o || Nf(a, e, n, s.state))), t && r === null) throw Error(i(528, ""));
					return s;
				}
				if (t && r !== null) throw Error(i(529, ""));
				return null;
			case "script": return t = n.async, n = n.src, typeof n == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Pf(n), n = St(a).hoistableScripts, r = n.get(t), r || (r = {
				type: "script",
				instance: null,
				count: 0,
				state: null
			}, n.set(t, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			default: throw Error(i(444, e));
		}
	}
	function Af(e) {
		return "href=\"" + Ht(e) + "\"";
	}
	function jf(e) {
		return "link[rel=\"stylesheet\"][" + e + "]";
	}
	function Mf(e) {
		return h({}, e, {
			"data-precedence": e.precedence,
			precedence: null
		});
	}
	function Nf(e, t, n, r) {
		e.querySelector("link[rel=\"preload\"][as=\"style\"][" + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
			return r.loading |= 1;
		}), t.addEventListener("error", function() {
			return r.loading |= 2;
		}), Pd(t, "link", n), Ct(t), e.head.appendChild(t));
	}
	function Pf(e) {
		return "[src=\"" + Ht(e) + "\"]";
	}
	function Ff(e) {
		return "script[async]" + e;
	}
	function If(e, t, n) {
		if (t.count++, t.instance === null) switch (t.type) {
			case "style":
				var r = e.querySelector("style[data-href~=\"" + Ht(n.href) + "\"]");
				if (r) return t.instance = r, Ct(r), r;
				var a = h({}, n, {
					"data-href": n.href,
					"data-precedence": n.precedence,
					href: null,
					precedence: null
				});
				return r = (e.ownerDocument || e).createElement("style"), Ct(r), Pd(r, "style", a), Lf(r, n.precedence, e), t.instance = r;
			case "stylesheet":
				a = Af(n.href);
				var o = e.querySelector(jf(a));
				if (o) return t.state.loading |= 4, t.instance = o, Ct(o), o;
				r = Mf(n), (a = mf.get(a)) && Rf(r, a), o = (e.ownerDocument || e).createElement("link"), Ct(o);
				var s = o;
				return s._p = new Promise(function(e, t) {
					s.onload = e, s.onerror = t;
				}), Pd(o, "link", r), t.state.loading |= 4, Lf(o, n.precedence, e), t.instance = o;
			case "script": return o = Pf(n.src), (a = e.querySelector(Ff(o))) ? (t.instance = a, Ct(a), a) : (r = n, (a = mf.get(o)) && (r = h({}, n), zf(r, a)), e = e.ownerDocument || e, a = e.createElement("script"), Ct(a), Pd(a, "link", r), e.head.appendChild(a), t.instance = a);
			case "void": return null;
			default: throw Error(i(443, t.type));
		}
		else t.type === "stylesheet" && !(t.state.loading & 4) && (r = t.instance, t.state.loading |= 4, Lf(r, n.precedence, e));
		return t.instance;
	}
	function Lf(e, t, n) {
		for (var r = n.querySelectorAll("link[rel=\"stylesheet\"][data-precedence],style[data-precedence]"), i = r.length ? r[r.length - 1] : null, a = i, o = 0; o < r.length; o++) {
			var s = r[o];
			if (s.dataset.precedence === t) a = s;
			else if (a !== i) break;
		}
		a ? a.parentNode.insertBefore(e, a.nextSibling) : (t = n.nodeType === 9 ? n.head : n, t.insertBefore(e, t.firstChild));
	}
	function Rf(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.title ??= t.title;
	}
	function zf(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.integrity ??= t.integrity;
	}
	var Bf = null;
	function Vf(e, t, n) {
		if (Bf === null) {
			var r = /* @__PURE__ */ new Map(), i = Bf = /* @__PURE__ */ new Map();
			i.set(n, r);
		} else i = Bf, r = i.get(n), r || (r = /* @__PURE__ */ new Map(), i.set(n, r));
		if (r.has(e)) return r;
		for (r.set(e, null), n = n.getElementsByTagName(e), i = 0; i < n.length; i++) {
			var a = n[i];
			if (!(a[_t] || a[ut] || e === "link" && a.getAttribute("rel") === "stylesheet") && a.namespaceURI !== "http://www.w3.org/2000/svg") {
				var o = a.getAttribute(t) || "";
				o = e + o;
				var s = r.get(o);
				s ? s.push(a) : r.set(o, [a]);
			}
		}
		return r;
	}
	function Hf(e, t, n) {
		e = e.ownerDocument || e, e.head.insertBefore(n, t === "title" ? e.querySelector("head > title") : null);
	}
	function Uf(e, t, n) {
		if (n === 1 || t.itemProp != null) return !1;
		switch (e) {
			case "meta":
			case "title": return !0;
			case "style":
				if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "") break;
				return !0;
			case "link":
				if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError) break;
				switch (t.rel) {
					case "stylesheet": return e = t.disabled, typeof t.precedence == "string" && e == null;
					default: return !0;
				}
			case "script": if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string") return !0;
		}
		return !1;
	}
	function Wf(e) {
		return !(e.type === "stylesheet" && !(e.state.loading & 3));
	}
	function Gf(e, t, n, r) {
		if (n.type === "stylesheet" && (typeof r.media != "string" || !1 !== matchMedia(r.media).matches) && !(n.state.loading & 4)) {
			if (n.instance === null) {
				var i = Af(r.href), a = t.querySelector(jf(i));
				if (a) {
					t = a._p, typeof t == "object" && t && typeof t.then == "function" && (e.count++, e = Jf.bind(e), t.then(e, e)), n.state.loading |= 4, n.instance = a, Ct(a);
					return;
				}
				a = t.ownerDocument || t, r = Mf(r), (i = mf.get(i)) && Rf(r, i), a = a.createElement("link"), Ct(a);
				var o = a;
				o._p = new Promise(function(e, t) {
					o.onload = e, o.onerror = t;
				}), Pd(a, "link", r), n.instance = a;
			}
			e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(n, t), (t = n.state.preload) && !(n.state.loading & 3) && (e.count++, n = Jf.bind(e), t.addEventListener("load", n), t.addEventListener("error", n));
		}
	}
	var Kf = 0;
	function qf(e, t) {
		return e.stylesheets && e.count === 0 && Xf(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(n) {
			var r = setTimeout(function() {
				if (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, 6e4 + t);
			0 < e.imgBytes && Kf === 0 && (Kf = 62500 * Ld());
			var i = setTimeout(function() {
				if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend)) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, (e.imgBytes > Kf ? 50 : 800) + t);
			return e.unsuspend = n, function() {
				e.unsuspend = null, clearTimeout(r), clearTimeout(i);
			};
		} : null;
	}
	function Jf() {
		if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
			if (this.stylesheets) Xf(this, this.stylesheets);
			else if (this.unsuspend) {
				var e = this.unsuspend;
				this.unsuspend = null, e();
			}
		}
	}
	var Yf = null;
	function Xf(e, t) {
		e.stylesheets = null, e.unsuspend !== null && (e.count++, Yf = /* @__PURE__ */ new Map(), t.forEach(Zf, e), Yf = null, Jf.call(e));
	}
	function Zf(e, t) {
		if (!(t.state.loading & 4)) {
			var n = Yf.get(e);
			if (n) var r = n.get(null);
			else {
				n = /* @__PURE__ */ new Map(), Yf.set(e, n);
				for (var i = e.querySelectorAll("link[data-precedence],style[data-precedence]"), a = 0; a < i.length; a++) {
					var o = i[a];
					(o.nodeName === "LINK" || o.getAttribute("media") !== "not all") && (n.set(o.dataset.precedence, o), r = o);
				}
				r && n.set(null, r);
			}
			i = t.instance, o = i.getAttribute("data-precedence"), a = n.get(o) || r, a === r && n.set(null, i), n.set(o, i), this.count++, r = Jf.bind(this), i.addEventListener("load", r), i.addEventListener("error", r), a ? a.parentNode.insertBefore(i, a.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(i, e.firstChild)), t.state.loading |= 4;
		}
	}
	var Qf = {
		$$typeof: C,
		Provider: null,
		Consumer: null,
		_currentValue: se,
		_currentValue2: se,
		_threadCount: 0
	};
	function $f(e, t, n, r, i, a, o, s, c) {
		this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = $e(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = $e(0), this.hiddenUpdates = $e(null), this.identifierPrefix = r, this.onUncaughtError = i, this.onCaughtError = a, this.onRecoverableError = o, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.incompleteTransitions = /* @__PURE__ */ new Map();
	}
	function ep(e, t, n, r, i, a, o, s, c, l, u, d) {
		return e = new $f(e, t, n, o, c, l, u, d, s), t = 1, !0 === a && (t |= 24), a = oi(3, null, null, t), e.current = a, a.stateNode = e, t = aa(), t.refCount++, e.pooledCache = t, t.refCount++, a.memoizedState = {
			element: r,
			isDehydrated: n,
			cache: t
		}, Ra(a), e;
	}
	function tp(e) {
		return e ? (e = ii, e) : ii;
	}
	function np(e, t, n, r, i, a) {
		i = tp(i), r.context === null ? r.context = i : r.pendingContext = i, r = Ba(t), r.payload = { element: n }, a = a === void 0 ? null : a, a !== null && (r.callback = a), n = Va(e, r, t), n !== null && (hu(n, e, t), Ha(n, e, t));
	}
	function rp(e, t) {
		if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
			var n = e.retryLane;
			e.retryLane = n !== 0 && n < t ? n : t;
		}
	}
	function ip(e, t) {
		rp(e, t), (e = e.alternate) && rp(e, t);
	}
	function ap(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = ti(e, 67108864);
			t !== null && hu(t, e, 67108864), ip(e, 67108864);
		}
	}
	function op(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = pu();
			t = at(t);
			var n = ti(e, t);
			n !== null && hu(n, e, t), ip(e, t);
		}
	}
	var sp = !0;
	function cp(e, t, n, r) {
		var i = k.T;
		k.T = null;
		var a = A.p;
		try {
			A.p = 2, up(e, t, n, r);
		} finally {
			A.p = a, k.T = i;
		}
	}
	function lp(e, t, n, r) {
		var i = k.T;
		k.T = null;
		var a = A.p;
		try {
			A.p = 8, up(e, t, n, r);
		} finally {
			A.p = a, k.T = i;
		}
	}
	function up(e, t, n, r) {
		if (sp) {
			var i = dp(r);
			if (i === null) wd(e, t, r, fp, n), Cp(e, r);
			else if (Tp(i, e, t, n, r)) r.stopPropagation();
			else if (Cp(e, r), t & 4 && -1 < Sp.indexOf(e)) {
				for (; i !== null;) {
					var a = bt(i);
					if (a !== null) switch (a.tag) {
						case 3:
							if (a = a.stateNode, a.current.memoizedState.isDehydrated) {
								var o = Je(a.pendingLanes);
								if (o !== 0) {
									var s = a;
									for (s.pendingLanes |= 2, s.entangledLanes |= 2; o;) {
										var c = 1 << 31 - Ve(o);
										s.entanglements[1] |= c, o &= ~c;
									}
									rd(a), !(K & 6) && (tu = ke() + 500, id(0, !1));
								}
							}
							break;
						case 31:
						case 13: s = ti(a, 2), s !== null && hu(s, a, 2), bu(), ip(a, 2);
					}
					if (a = dp(r), a === null && wd(e, t, r, fp, n), a === i) break;
					i = a;
				}
				i !== null && r.stopPropagation();
			} else wd(e, t, r, null, n);
		}
	}
	function dp(e) {
		return e = on(e), pp(e);
	}
	var fp = null;
	function pp(e) {
		if (fp = null, e = yt(e), e !== null) {
			var t = o(e);
			if (t === null) e = null;
			else {
				var n = t.tag;
				if (n === 13) {
					if (e = s(t), e !== null) return e;
					e = null;
				} else if (n === 31) {
					if (e = c(t), e !== null) return e;
					e = null;
				} else if (n === 3) {
					if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
					e = null;
				} else t !== e && (e = null);
			}
		}
		return fp = e, null;
	}
	function mp(e) {
		switch (e) {
			case "beforetoggle":
			case "cancel":
			case "click":
			case "close":
			case "contextmenu":
			case "copy":
			case "cut":
			case "auxclick":
			case "dblclick":
			case "dragend":
			case "dragstart":
			case "drop":
			case "focusin":
			case "focusout":
			case "input":
			case "invalid":
			case "keydown":
			case "keypress":
			case "keyup":
			case "mousedown":
			case "mouseup":
			case "paste":
			case "pause":
			case "play":
			case "pointercancel":
			case "pointerdown":
			case "pointerup":
			case "ratechange":
			case "reset":
			case "resize":
			case "seeked":
			case "submit":
			case "toggle":
			case "touchcancel":
			case "touchend":
			case "touchstart":
			case "volumechange":
			case "change":
			case "selectionchange":
			case "textInput":
			case "compositionstart":
			case "compositionend":
			case "compositionupdate":
			case "beforeblur":
			case "afterblur":
			case "beforeinput":
			case "blur":
			case "fullscreenchange":
			case "focus":
			case "hashchange":
			case "popstate":
			case "select":
			case "selectstart": return 2;
			case "drag":
			case "dragenter":
			case "dragexit":
			case "dragleave":
			case "dragover":
			case "mousemove":
			case "mouseout":
			case "mouseover":
			case "pointermove":
			case "pointerout":
			case "pointerover":
			case "scroll":
			case "touchmove":
			case "wheel":
			case "mouseenter":
			case "mouseleave":
			case "pointerenter":
			case "pointerleave": return 8;
			case "message": switch (Ae()) {
				case je: return 2;
				case Me: return 8;
				case Ne:
				case Pe: return 32;
				case Fe: return 268435456;
				default: return 32;
			}
			default: return 32;
		}
	}
	var hp = !1, gp = null, _p = null, vp = null, yp = /* @__PURE__ */ new Map(), bp = /* @__PURE__ */ new Map(), xp = [], Sp = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
	function Cp(e, t) {
		switch (e) {
			case "focusin":
			case "focusout":
				gp = null;
				break;
			case "dragenter":
			case "dragleave":
				_p = null;
				break;
			case "mouseover":
			case "mouseout":
				vp = null;
				break;
			case "pointerover":
			case "pointerout":
				yp.delete(t.pointerId);
				break;
			case "gotpointercapture":
			case "lostpointercapture": bp.delete(t.pointerId);
		}
	}
	function wp(e, t, n, r, i, a) {
		return e === null || e.nativeEvent !== a ? (e = {
			blockedOn: t,
			domEventName: n,
			eventSystemFlags: r,
			nativeEvent: a,
			targetContainers: [i]
		}, t !== null && (t = bt(t), t !== null && ap(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, i !== null && t.indexOf(i) === -1 && t.push(i), e);
	}
	function Tp(e, t, n, r, i) {
		switch (t) {
			case "focusin": return gp = wp(gp, e, t, n, r, i), !0;
			case "dragenter": return _p = wp(_p, e, t, n, r, i), !0;
			case "mouseover": return vp = wp(vp, e, t, n, r, i), !0;
			case "pointerover":
				var a = i.pointerId;
				return yp.set(a, wp(yp.get(a) || null, e, t, n, r, i)), !0;
			case "gotpointercapture": return a = i.pointerId, bp.set(a, wp(bp.get(a) || null, e, t, n, r, i)), !0;
		}
		return !1;
	}
	function Ep(e) {
		var t = yt(e.target);
		if (t !== null) {
			var n = o(t);
			if (n !== null) {
				if (t = n.tag, t === 13) {
					if (t = s(n), t !== null) {
						e.blockedOn = t, ct(e.priority, function() {
							op(n);
						});
						return;
					}
				} else if (t === 31) {
					if (t = c(n), t !== null) {
						e.blockedOn = t, ct(e.priority, function() {
							op(n);
						});
						return;
					}
				} else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
					e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
					return;
				}
			}
		}
		e.blockedOn = null;
	}
	function Dp(e) {
		if (e.blockedOn !== null) return !1;
		for (var t = e.targetContainers; 0 < t.length;) {
			var n = dp(e.nativeEvent);
			if (n === null) {
				n = e.nativeEvent;
				var r = new n.constructor(n.type, n);
				an = r, n.target.dispatchEvent(r), an = null;
			} else return t = bt(n), t !== null && ap(t), e.blockedOn = n, !1;
			t.shift();
		}
		return !0;
	}
	function Op(e, t, n) {
		Dp(e) && n.delete(t);
	}
	function kp() {
		hp = !1, gp !== null && Dp(gp) && (gp = null), _p !== null && Dp(_p) && (_p = null), vp !== null && Dp(vp) && (vp = null), yp.forEach(Op), bp.forEach(Op);
	}
	function Ap(e, n) {
		e.blockedOn === n && (e.blockedOn = null, hp || (hp = !0, t.unstable_scheduleCallback(t.unstable_NormalPriority, kp)));
	}
	var jp = null;
	function Mp(e) {
		jp !== e && (jp = e, t.unstable_scheduleCallback(t.unstable_NormalPriority, function() {
			jp === e && (jp = null);
			for (var t = 0; t < e.length; t += 3) {
				var n = e[t], r = e[t + 1], i = e[t + 2];
				if (typeof r != "function") {
					if (pp(r || n) === null) continue;
					break;
				}
				var a = bt(n);
				a !== null && (e.splice(t, 3), t -= 3, Cs(a, {
					pending: !0,
					data: i,
					method: n.method,
					action: r
				}, r, i));
			}
		}));
	}
	function Np(e) {
		function t(t) {
			return Ap(t, e);
		}
		gp !== null && Ap(gp, e), _p !== null && Ap(_p, e), vp !== null && Ap(vp, e), yp.forEach(t), bp.forEach(t);
		for (var n = 0; n < xp.length; n++) {
			var r = xp[n];
			r.blockedOn === e && (r.blockedOn = null);
		}
		for (; 0 < xp.length && (n = xp[0], n.blockedOn === null);) Ep(n), n.blockedOn === null && xp.shift();
		if (n = (e.ownerDocument || e).$$reactFormReplay, n != null) for (r = 0; r < n.length; r += 3) {
			var i = n[r], a = n[r + 1], o = i[dt] || null;
			if (typeof a == "function") o || Mp(n);
			else if (o) {
				var s = null;
				if (a && a.hasAttribute("formAction")) {
					if (i = a, o = a[dt] || null) s = o.formAction;
					else if (pp(i) !== null) continue;
				} else s = o.action;
				typeof s == "function" ? n[r + 1] = s : (n.splice(r, 3), r -= 3), Mp(n);
			}
		}
	}
	function Pp() {
		function e(e) {
			e.canIntercept && e.info === "react-transition" && e.intercept({
				handler: function() {
					return new Promise(function(e) {
						return i = e;
					});
				},
				focusReset: "manual",
				scroll: "manual"
			});
		}
		function t() {
			i !== null && (i(), i = null), r || setTimeout(n, 20);
		}
		function n() {
			if (!r && !navigation.transition) {
				var e = navigation.currentEntry;
				e && e.url != null && navigation.navigate(e.url, {
					state: e.getState(),
					info: "react-transition",
					history: "replace"
				});
			}
		}
		if (typeof navigation == "object") {
			var r = !1, i = null;
			return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(n, 100), function() {
				r = !0, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), i !== null && (i(), i = null);
			};
		}
	}
	function Fp(e) {
		this._internalRoot = e;
	}
	Ip.prototype.render = Fp.prototype.render = function(e) {
		var t = this._internalRoot;
		if (t === null) throw Error(i(409));
		var n = t.current;
		np(n, pu(), e, t, null, null);
	}, Ip.prototype.unmount = Fp.prototype.unmount = function() {
		var e = this._internalRoot;
		if (e !== null) {
			this._internalRoot = null;
			var t = e.containerInfo;
			np(e.current, 2, null, e, null, null), bu(), t[ft] = null;
		}
	};
	function Ip(e) {
		this._internalRoot = e;
	}
	Ip.prototype.unstable_scheduleHydration = function(e) {
		if (e) {
			var t = st();
			e = {
				blockedOn: null,
				target: e,
				priority: t
			};
			for (var n = 0; n < xp.length && t !== 0 && t < xp[n].priority; n++);
			xp.splice(n, 0, e), n === 0 && Ep(e);
		}
	};
	var Lp = n.version;
	if (Lp !== "19.2.7") throw Error(i(527, Lp, "19.2.7"));
	A.findDOMNode = function(e) {
		var t = e._reactInternals;
		if (t === void 0) throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
		return e = d(t), e = e === null ? null : p(e), e = e === null ? null : e.stateNode, e;
	};
	var Rp = {
		bundleType: 0,
		version: "19.2.7",
		rendererPackageName: "react-dom",
		currentDispatcherRef: k,
		reconcilerVersion: "19.2.7"
	};
	if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
		var zp = __REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!zp.isDisabled && zp.supportsFiber) try {
			Re = zp.inject(Rp), ze = zp;
		} catch {}
	}
	e.createRoot = function(e, t) {
		if (!a(e)) throw Error(i(299));
		var n = !1, r = "", o = Ks, s = qs, c = Js;
		return t != null && (!0 === t.unstable_strictMode && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (o = t.onUncaughtError), t.onCaughtError !== void 0 && (s = t.onCaughtError), t.onRecoverableError !== void 0 && (c = t.onRecoverableError)), t = ep(e, 1, !1, null, null, n, r, null, o, s, c, Pp), e[ft] = t.current, Sd(e), new Fp(t);
	};
})), g = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = h();
})), _ = /* @__PURE__ */ c(u()), v = g(), y = (e) => typeof e == "string", b = () => {
	let e, t, n = new Promise((n, r) => {
		e = n, t = r;
	});
	return n.resolve = e, n.reject = t, n;
}, x = (e) => e == null ? "" : String(e), S = (e, t, n) => {
	e.forEach((e) => {
		t[e] && (n[e] = t[e]);
	});
}, C = /###/g, w = (e) => e && e.includes("###") ? e.replace(C, ".") : e, T = (e) => !e || y(e), E = (e, t, n) => {
	let r = y(t) ? t.split(".") : t, i = 0;
	for (; i < r.length - 1;) {
		if (T(e)) return {};
		let t = w(r[i]);
		!e[t] && n && (e[t] = new n()), e = Object.prototype.hasOwnProperty.call(e, t) ? e[t] : {}, ++i;
	}
	return T(e) ? {} : {
		obj: e,
		k: w(r[i])
	};
}, ee = (e, t, n) => {
	let { obj: r, k: i } = E(e, t, Object);
	if (r !== void 0 || t.length === 1) {
		r[i] = n;
		return;
	}
	let a = t[t.length - 1], o = t.slice(0, t.length - 1), s = E(e, o, Object);
	for (; s.obj === void 0 && o.length;) a = `${o[o.length - 1]}.${a}`, o = o.slice(0, o.length - 1), s = E(e, o, Object), s?.obj && s.obj[`${s.k}.${a}`] !== void 0 && (s.obj = void 0);
	s.obj[`${s.k}.${a}`] = n;
}, D = (e, t, n, r) => {
	let { obj: i, k: a } = E(e, t, Object);
	i[a] = i[a] || [], i[a].push(n);
}, te = (e, t) => {
	let { obj: n, k: r } = E(e, t);
	if (n && Object.prototype.hasOwnProperty.call(n, r)) return n[r];
}, ne = (e, t, n) => {
	let r = te(e, n);
	return r === void 0 ? te(t, n) : r;
}, re = (e, t, n) => {
	for (let r in t) r !== "__proto__" && r !== "constructor" && (Object.prototype.hasOwnProperty.call(e, r) ? y(e[r]) || e[r] instanceof String || y(t[r]) || t[r] instanceof String ? n && (e[r] = t[r]) : re(e[r], t[r], n) : e[r] = t[r]);
	return e;
}, O = (e) => e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), ie = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;",
	"/": "&#x2F;"
}, ae = (e) => y(e) ? e.replace(/[&<>"'\/]/g, (e) => ie[e]) : e, oe = class {
	constructor(e) {
		this.capacity = e, this.regExpMap = /* @__PURE__ */ new Map(), this.regExpQueue = [];
	}
	getRegExp(e) {
		let t = this.regExpMap.get(e);
		if (t !== void 0) return t;
		let n = new RegExp(e);
		return this.regExpQueue.length === this.capacity && this.regExpMap.delete(this.regExpQueue.shift()), this.regExpMap.set(e, n), this.regExpQueue.push(e), n;
	}
}, k = [
	" ",
	",",
	"?",
	"!",
	";"
], A = new oe(20), se = (e, t, n) => {
	t ||= "", n ||= "";
	let r = k.filter((e) => !t.includes(e) && !n.includes(e));
	if (r.length === 0) return !0;
	let i = A.getRegExp(`(${r.map((e) => e === "?" ? "\\?" : e).join("|")})`), a = !i.test(e);
	if (!a) {
		let t = e.indexOf(n);
		t > 0 && !i.test(e.substring(0, t)) && (a = !0);
	}
	return a;
}, ce = (e, t, n = ".") => {
	if (!e) return;
	if (e[t]) return Object.prototype.hasOwnProperty.call(e, t) ? e[t] : void 0;
	let r = t.split(n), i = e;
	for (let e = 0; e < r.length;) {
		if (!i || typeof i != "object") return;
		let t, a = "";
		for (let o = e; o < r.length; ++o) if (o !== e && (a += n), a += r[o], t = i[a], t !== void 0) {
			if ([
				"string",
				"number",
				"boolean"
			].includes(typeof t) && o < r.length - 1) continue;
			e += o - e + 1;
			break;
		}
		i = t;
	}
	return i;
}, le = (e) => e?.replace(/_/g, "-"), j = {
	type: "logger",
	log(e) {
		this.output("log", e);
	},
	warn(e) {
		this.output("warn", e);
	},
	error(e) {
		this.output("error", e);
	},
	output(e, t) {
		console?.[e]?.apply?.(console, t);
	}
}, M = new class e {
	constructor(e, t = {}) {
		this.init(e, t);
	}
	init(e, t = {}) {
		this.prefix = t.prefix || "i18next:", this.logger = e || j, this.options = t, this.debug = t.debug;
	}
	log(...e) {
		return this.forward(e, "log", "", !0);
	}
	warn(...e) {
		return this.forward(e, "warn", "", !0);
	}
	error(...e) {
		return this.forward(e, "error", "");
	}
	deprecate(...e) {
		return this.forward(e, "warn", "WARNING DEPRECATED: ", !0);
	}
	forward(e, t, n, r) {
		return r && !this.debug ? null : (e = e.map((e) => y(e) ? e.replace(/[\r\n\x00-\x1F\x7F]/g, " ") : e), y(e[0]) && (e[0] = `${n}${this.prefix} ${e[0]}`), this.logger[t](e));
	}
	create(t) {
		return new e(this.logger, {
			prefix: `${this.prefix}:${t}:`,
			...this.options
		});
	}
	clone(t) {
		return t ||= this.options, t.prefix = t.prefix || this.prefix, new e(this.logger, t);
	}
}(), N = class {
	constructor() {
		this.observers = {};
	}
	on(e, t) {
		return e.split(" ").forEach((e) => {
			this.observers[e] || (this.observers[e] = /* @__PURE__ */ new Map());
			let n = this.observers[e].get(t) || 0;
			this.observers[e].set(t, n + 1);
		}), this;
	}
	off(e, t) {
		if (this.observers[e]) {
			if (!t) {
				delete this.observers[e];
				return;
			}
			this.observers[e].delete(t);
		}
	}
	once(e, t) {
		let n = (...r) => {
			t(...r), this.off(e, n);
		};
		return this.on(e, n), this;
	}
	emit(e, ...t) {
		this.observers[e] && Array.from(this.observers[e].entries()).forEach(([e, n]) => {
			for (let r = 0; r < n; r++) e(...t);
		}), this.observers["*"] && Array.from(this.observers["*"].entries()).forEach(([n, r]) => {
			for (let i = 0; i < r; i++) n(e, ...t);
		});
	}
}, ue = class extends N {
	constructor(e, t = {
		ns: ["translation"],
		defaultNS: "translation"
	}) {
		super(), this.data = e || {}, this.options = t, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.options.ignoreJSONStructure === void 0 && (this.options.ignoreJSONStructure = !0);
	}
	addNamespaces(e) {
		this.options.ns.includes(e) || this.options.ns.push(e);
	}
	removeNamespaces(e) {
		let t = this.options.ns.indexOf(e);
		t > -1 && this.options.ns.splice(t, 1);
	}
	getResource(e, t, n, r = {}) {
		let i = r.keySeparator === void 0 ? this.options.keySeparator : r.keySeparator, a = r.ignoreJSONStructure === void 0 ? this.options.ignoreJSONStructure : r.ignoreJSONStructure, o;
		e.includes(".") ? o = e.split(".") : (o = [e, t], n && (Array.isArray(n) ? o.push(...n) : y(n) && i ? o.push(...n.split(i)) : o.push(n)));
		let s = te(this.data, o);
		return !s && !t && !n && e.includes(".") && (e = o[0], t = o[1], n = o.slice(2).join(".")), s || !a || !y(n) ? s : ce(this.data?.[e]?.[t], n, i);
	}
	addResource(e, t, n, r, i = { silent: !1 }) {
		let a = i.keySeparator === void 0 ? this.options.keySeparator : i.keySeparator, o = [e, t];
		n && (o = o.concat(a ? n.split(a) : n)), e.includes(".") && (o = e.split("."), r = t, t = o[1]), this.addNamespaces(t), ee(this.data, o, r), i.silent || this.emit("added", e, t, n, r);
	}
	addResources(e, t, n, r = { silent: !1 }) {
		for (let r in n) (y(n[r]) || Array.isArray(n[r])) && this.addResource(e, t, r, n[r], { silent: !0 });
		r.silent || this.emit("added", e, t, n);
	}
	addResourceBundle(e, t, n, r, i, a = {
		silent: !1,
		skipCopy: !1
	}) {
		let o = [e, t];
		e.includes(".") && (o = e.split("."), r = n, n = t, t = o[1]), this.addNamespaces(t);
		let s = te(this.data, o) || {};
		a.skipCopy || (n = JSON.parse(JSON.stringify(n))), r ? re(s, n, i) : s = {
			...s,
			...n
		}, ee(this.data, o, s), a.silent || this.emit("added", e, t, n);
	}
	removeResourceBundle(e, t) {
		this.hasResourceBundle(e, t) && delete this.data[e][t], this.removeNamespaces(t), this.emit("removed", e, t);
	}
	hasResourceBundle(e, t) {
		return this.getResource(e, t) !== void 0;
	}
	getResourceBundle(e, t) {
		return t ||= this.options.defaultNS, this.getResource(e, t);
	}
	getDataByLanguage(e) {
		return this.data[e];
	}
	hasLanguageSomeTranslations(e) {
		let t = this.getDataByLanguage(e);
		return !!(t && Object.keys(t) || []).find((e) => t[e] && Object.keys(t[e]).length > 0);
	}
	toJSON() {
		return this.data;
	}
}, P = {
	processors: {},
	addPostProcessor(e) {
		this.processors[e.name] = e;
	},
	handle(e, t, n, r, i) {
		return e.forEach((e) => {
			t = this.processors[e]?.process(t, n, r, i) ?? t;
		}), t;
	}
}, de = Symbol("i18next/PATH_KEY");
function fe() {
	let e = [], t = Object.create(null), n;
	return t.get = (r, i) => (n?.revoke?.(), i === de ? e : (e.push(i), n = Proxy.revocable(r, t), n.proxy)), Proxy.revocable(Object.create(null), t).proxy;
}
function pe(e, t) {
	let { [de]: n } = e(fe()), r = t?.keySeparator ?? ".", i = t?.nsSeparator ?? ":", a = t?.enableSelector === "strict";
	if (n.length > 1 && i) {
		let e = t?.ns, o = a ? Array.isArray(e) ? e : e ? [e] : null : Array.isArray(e) ? e : null;
		if (o && (a ? o : o.length > 1 ? o.slice(1) : []).includes(n[0])) return `${n[0]}${i}${n.slice(1).join(r)}`;
	}
	return n.join(r);
}
var me = (e) => !y(e) && typeof e != "boolean" && typeof e != "number", he = class e extends N {
	constructor(e, t = {}) {
		super(), S([
			"resourceStore",
			"languageUtils",
			"pluralResolver",
			"interpolator",
			"backendConnector",
			"i18nFormat",
			"utils"
		], e, this), this.options = t, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.logger = M.create("translator"), this.checkedLoadedFor = {};
	}
	changeLanguage(e) {
		e && (this.language = e);
	}
	exists(e, t = { interpolation: {} }) {
		let n = { ...t };
		if (e == null) return !1;
		let r = this.resolve(e, n);
		if (r?.res === void 0) return !1;
		let i = me(r.res);
		return !(n.returnObjects === !1 && i);
	}
	extractFromKey(e, t) {
		let n = t.nsSeparator === void 0 ? this.options.nsSeparator : t.nsSeparator;
		n === void 0 && (n = ":");
		let r = t.keySeparator === void 0 ? this.options.keySeparator : t.keySeparator, i = t.ns || this.options.defaultNS || [], a = n && e.includes(n), o = !this.options.userDefinedKeySeparator && !t.keySeparator && !this.options.userDefinedNsSeparator && !t.nsSeparator && !se(e, n, r);
		if (a && !o) {
			let t = e.match(this.interpolator.nestingRegexp);
			if (t && t.length > 0) return {
				key: e,
				namespaces: y(i) ? [i] : i
			};
			let a = e.split(n);
			(n !== r || n === r && this.options.ns.includes(a[0])) && (i = a.shift()), e = a.join(r);
		}
		return {
			key: e,
			namespaces: y(i) ? [i] : i
		};
	}
	translate(t, n, r) {
		let i = typeof n == "object" ? { ...n } : n;
		if (typeof i != "object" && this.options.overloadTranslationOptionHandler && (i = this.options.overloadTranslationOptionHandler(arguments)), typeof i == "object" && (i = { ...i }), i ||= {}, t == null) return "";
		typeof t == "function" && (t = pe(t, {
			...this.options,
			...i
		})), Array.isArray(t) || (t = [String(t)]), t = t.map((e) => typeof e == "function" ? pe(e, {
			...this.options,
			...i
		}) : String(e));
		let a = i.returnDetails === void 0 ? this.options.returnDetails : i.returnDetails, o = i.keySeparator === void 0 ? this.options.keySeparator : i.keySeparator, { key: s, namespaces: c } = this.extractFromKey(t[t.length - 1], i), l = c[c.length - 1], u = i.nsSeparator === void 0 ? this.options.nsSeparator : i.nsSeparator;
		u === void 0 && (u = ":");
		let d = i.lng || this.language, f = i.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
		if (d?.toLowerCase() === "cimode") return f ? a ? {
			res: `${l}${u}${s}`,
			usedKey: s,
			exactUsedKey: s,
			usedLng: d,
			usedNS: l,
			usedParams: this.getUsedParamsDetails(i)
		} : `${l}${u}${s}` : a ? {
			res: s,
			usedKey: s,
			exactUsedKey: s,
			usedLng: d,
			usedNS: l,
			usedParams: this.getUsedParamsDetails(i)
		} : s;
		let p = this.resolve(t, i), m = p?.res, h = p?.usedKey || s, g = p?.exactUsedKey || s, _ = [
			"[object Number]",
			"[object Function]",
			"[object RegExp]"
		], v = i.joinArrays === void 0 ? this.options.joinArrays : i.joinArrays, b = !this.i18nFormat || this.i18nFormat.handleAsObject, x = i.count !== void 0 && !y(i.count), S = e.hasDefaultValue(i), C = x ? this.pluralResolver.getSuffix(d, i.count, i) : "", w = i.ordinal && x ? this.pluralResolver.getSuffix(d, i.count, { ordinal: !1 }) : "", T = x && !i.ordinal && i.count === 0, E = T && i[`defaultValue${this.options.pluralSeparator}zero`] || i[`defaultValue${C}`] || i[`defaultValue${w}`] || i.defaultValue, ee = m;
		b && !m && S && (ee = E);
		let D = me(ee), te = Object.prototype.toString.apply(ee);
		if (b && ee && D && !_.includes(te) && !(y(v) && Array.isArray(ee))) {
			if (!i.returnObjects && !this.options.returnObjects) {
				this.options.returnedObjectHandler || this.logger.warn("accessing an object - but returnObjects options is not enabled!");
				let e = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(h, ee, {
					...i,
					ns: c
				}) : `key '${s} (${this.language})' returned an object instead of string.`;
				return a ? (p.res = e, p.usedParams = this.getUsedParamsDetails(i), p) : e;
			}
			if (o) {
				let e = Array.isArray(ee), t = e ? [] : {}, n = e ? g : h;
				for (let e in ee) if (Object.prototype.hasOwnProperty.call(ee, e)) {
					let r = `${n}${o}${e}`;
					S && !m ? t[e] = this.translate(r, {
						...i,
						defaultValue: me(E) ? E[e] : void 0,
						joinArrays: !1,
						ns: c
					}) : t[e] = this.translate(r, {
						...i,
						joinArrays: !1,
						ns: c
					}), t[e] === r && (t[e] = ee[e]);
				}
				m = t;
			}
		} else if (b && y(v) && Array.isArray(m)) m = m.join(v), m &&= this.extendTranslation(m, t, i, r);
		else {
			let e = !1, n = !1;
			!this.isValidLookup(m) && S && (e = !0, m = E), this.isValidLookup(m) || (n = !0, m = s);
			let a = (i.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey) && n ? void 0 : m, c = S && E !== m && this.options.updateMissing;
			if (n || e || c) {
				if (this.logger.log(c ? "updateKey" : "missingKey", d, l, x && !c ? `${s}${this.pluralResolver.getSuffix(d, i.count, i)}` : s, c ? E : m), o) {
					let e = this.resolve(s, {
						...i,
						keySeparator: !1
					});
					e && e.res && this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
				}
				let e = [], t = this.languageUtils.getFallbackCodes(this.options.fallbackLng, i.lng || this.language);
				if (this.options.saveMissingTo === "fallback" && t && t[0]) for (let n = 0; n < t.length; n++) e.push(t[n]);
				else this.options.saveMissingTo === "all" ? e = this.languageUtils.toResolveHierarchy(i.lng || this.language) : e.push(i.lng || this.language);
				let n = (e, t, n) => {
					let r = S && n !== m ? n : a;
					this.options.missingKeyHandler ? this.options.missingKeyHandler(e, l, t, r, c, i) : this.backendConnector?.saveMissing && this.backendConnector.saveMissing(e, l, t, r, c, i), this.emit("missingKey", e, l, t, m);
				};
				this.options.saveMissing && (this.options.saveMissingPlurals && x ? e.forEach((e) => {
					let t = this.pluralResolver.getSuffixes(e, i);
					T && i[`defaultValue${this.options.pluralSeparator}zero`] && !t.includes(`${this.options.pluralSeparator}zero`) && t.push(`${this.options.pluralSeparator}zero`), t.forEach((t) => {
						n([e], s + t, i[`defaultValue${t}`] || E);
					});
				}) : n(e, s, E));
			}
			m = this.extendTranslation(m, t, i, p, r), n && m === s && this.options.appendNamespaceToMissingKey && (m = `${l}${u}${s}`), (n || e) && this.options.parseMissingKeyHandler && (m = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${l}${u}${s}` : s, e ? m : void 0, i));
		}
		return a ? (p.res = m, p.usedParams = this.getUsedParamsDetails(i), p) : m;
	}
	extendTranslation(e, t, n, r, i) {
		if (this.i18nFormat?.parse) e = this.i18nFormat.parse(e, {
			...this.options.interpolation.defaultVariables,
			...n
		}, n.lng || this.language || r.usedLng, r.usedNS, r.usedKey, { resolved: r });
		else if (!n.skipInterpolation) {
			n.interpolation && this.interpolator.init({
				...n,
				interpolation: {
					...this.options.interpolation,
					...n.interpolation
				}
			});
			let a = y(e) && (n?.interpolation?.skipOnVariables === void 0 ? this.options.interpolation.skipOnVariables : n.interpolation.skipOnVariables), o;
			if (a) {
				let t = e.match(this.interpolator.nestingRegexp);
				o = t && t.length;
			}
			let s = n.replace && !y(n.replace) ? n.replace : n;
			if (this.options.interpolation.defaultVariables && (s = {
				...this.options.interpolation.defaultVariables,
				...s
			}), e = this.interpolator.interpolate(e, s, n.lng || this.language || r.usedLng, n), a) {
				let t = e.match(this.interpolator.nestingRegexp), r = t && t.length;
				o < r && (n.nest = !1);
			}
			!n.lng && r && r.res && (n.lng = this.language || r.usedLng), n.nest !== !1 && (e = this.interpolator.nest(e, (...e) => i?.[0] === e[0] && !n.context ? (this.logger.warn(`It seems you are nesting recursively key: ${e[0]} in key: ${t[0]}`), null) : this.translate(...e, t), n)), n.interpolation && this.interpolator.reset();
		}
		let a = n.postProcess || this.options.postProcess, o = y(a) ? [a] : a;
		return e != null && o?.length && n.applyPostProcessor !== !1 && (e = P.handle(o, e, t, this.options && this.options.postProcessPassResolved ? {
			i18nResolved: {
				...r,
				usedParams: this.getUsedParamsDetails(n)
			},
			...n
		} : n, this)), e;
	}
	resolve(e, t = {}) {
		let n, r, i, a, o;
		return y(e) && (e = [e]), Array.isArray(e) && (e = e.map((e) => typeof e == "function" ? pe(e, {
			...this.options,
			...t
		}) : e)), e.forEach((e) => {
			if (this.isValidLookup(n)) return;
			let s = this.extractFromKey(e, t), c = s.key;
			r = c;
			let l = s.namespaces;
			this.options.fallbackNS && (l = l.concat(this.options.fallbackNS));
			let u = t.count !== void 0 && !y(t.count), d = u && !t.ordinal && t.count === 0, f = t.context !== void 0 && (y(t.context) || typeof t.context == "number") && t.context !== "", p = t.lngs ? t.lngs : this.languageUtils.toResolveHierarchy(t.lng || this.language, t.fallbackLng);
			l.forEach((e) => {
				this.isValidLookup(n) || (o = e, !this.checkedLoadedFor[`${p[0]}-${e}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(o) && (this.checkedLoadedFor[`${p[0]}-${e}`] = !0, this.logger.warn(`key "${r}" for languages "${p.join(", ")}" won't get resolved as namespace "${o}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!")), p.forEach((r) => {
					if (this.isValidLookup(n)) return;
					a = r;
					let o = [c];
					if (this.i18nFormat?.addLookupKeys) this.i18nFormat.addLookupKeys(o, c, r, e, t);
					else {
						let e;
						u && (e = this.pluralResolver.getSuffix(r, t.count, t));
						let n = `${this.options.pluralSeparator}zero`, i = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
						if (u && (t.ordinal && e.startsWith(i) && o.push(c + e.replace(i, this.options.pluralSeparator)), o.push(c + e), d && o.push(c + n)), f) {
							let r = `${c}${this.options.contextSeparator || "_"}${t.context}`;
							o.push(r), u && (t.ordinal && e.startsWith(i) && o.push(r + e.replace(i, this.options.pluralSeparator)), o.push(r + e), d && o.push(r + n));
						}
					}
					let s;
					for (; s = o.pop();) this.isValidLookup(n) || (i = s, n = this.getResource(r, e, s, t));
				}));
			});
		}), {
			res: n,
			usedKey: r,
			exactUsedKey: i,
			usedLng: a,
			usedNS: o
		};
	}
	isValidLookup(e) {
		return e !== void 0 && !(!this.options.returnNull && e === null) && !(!this.options.returnEmptyString && e === "");
	}
	getResource(e, t, n, r = {}) {
		return this.i18nFormat?.getResource ? this.i18nFormat.getResource(e, t, n, r) : this.resourceStore.getResource(e, t, n, r);
	}
	getUsedParamsDetails(e = {}) {
		let t = [
			"defaultValue",
			"ordinal",
			"context",
			"replace",
			"lng",
			"lngs",
			"fallbackLng",
			"ns",
			"keySeparator",
			"nsSeparator",
			"returnObjects",
			"returnDetails",
			"joinArrays",
			"postProcess",
			"interpolation"
		], n = e.replace && !y(e.replace), r = n ? e.replace : e;
		if (n && e.count !== void 0 && (r = {
			...r,
			count: e.count
		}), this.options.interpolation.defaultVariables && (r = {
			...this.options.interpolation.defaultVariables,
			...r
		}), !n) {
			r = { ...r };
			for (let e of t) delete r[e];
		}
		return r;
	}
	static hasDefaultValue(e) {
		for (let t in e) if (Object.prototype.hasOwnProperty.call(e, t) && t.startsWith("defaultValue") && e[t] !== void 0) return !0;
		return !1;
	}
}, ge = class {
	constructor(e) {
		this.options = e, this.supportedLngs = this.options.supportedLngs || !1, this.logger = M.create("languageUtils");
	}
	getScriptPartFromCode(e) {
		if (e = le(e), !e || !e.includes("-")) return null;
		let t = e.split("-");
		return t.length === 2 || (t.pop(), t[t.length - 1].toLowerCase() === "x") ? null : this.formatLanguageCode(t.join("-"));
	}
	getLanguagePartFromCode(e) {
		if (e = le(e), !e || !e.includes("-")) return e;
		let t = e.split("-");
		return this.formatLanguageCode(t[0]);
	}
	formatLanguageCode(e) {
		if (y(e) && e.includes("-")) {
			let t;
			try {
				t = Intl.getCanonicalLocales(e)[0];
			} catch {}
			return t && this.options.lowerCaseLng && (t = t.toLowerCase()), t || (this.options.lowerCaseLng ? e.toLowerCase() : e);
		}
		return this.options.cleanCode || this.options.lowerCaseLng ? e.toLowerCase() : e;
	}
	isSupportedCode(e) {
		return (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) && (e = this.getLanguagePartFromCode(e)), !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.includes(e);
	}
	getBestMatchFromCodes(e) {
		if (!e) return null;
		let t;
		return e.forEach((e) => {
			if (t) return;
			let n = this.formatLanguageCode(e);
			(!this.options.supportedLngs || this.isSupportedCode(n)) && (t = n);
		}), !t && this.options.supportedLngs && e.forEach((e) => {
			if (t) return;
			let n = this.getScriptPartFromCode(e);
			if (this.isSupportedCode(n)) return t = n;
			let r = this.getLanguagePartFromCode(e);
			if (this.isSupportedCode(r)) return t = r;
			t = this.options.supportedLngs.find((e) => e === r ? !0 : !e.includes("-") && !r.includes("-") ? !1 : !!(e.includes("-") && !r.includes("-") && e.slice(0, e.indexOf("-")) === r || e.startsWith(r) && r.length > 1));
		}), t ||= this.getFallbackCodes(this.options.fallbackLng)[0], t;
	}
	getFallbackCodes(e, t) {
		if (!e) return [];
		if (typeof e == "function" && (e = e(t)), y(e) && (e = [e]), Array.isArray(e)) return e;
		if (!t) return e.default || [];
		let n = e[t];
		return n ||= e[this.getScriptPartFromCode(t)], n ||= e[this.formatLanguageCode(t)], n ||= e[this.getLanguagePartFromCode(t)], n ||= e.default, n || [];
	}
	toResolveHierarchy(e, t) {
		let n = this.getFallbackCodes((t === !1 ? [] : t) || this.options.fallbackLng || [], e), r = [], i = (e) => {
			e && (this.isSupportedCode(e) ? r.push(e) : this.logger.warn(`rejecting language code not found in supportedLngs: ${e}`));
		};
		return y(e) && (e.includes("-") || e.includes("_")) ? (this.options.load !== "languageOnly" && i(this.formatLanguageCode(e)), this.options.load !== "languageOnly" && this.options.load !== "currentOnly" && i(this.getScriptPartFromCode(e)), this.options.load !== "currentOnly" && i(this.getLanguagePartFromCode(e))) : y(e) && i(this.formatLanguageCode(e)), n.forEach((e) => {
			r.includes(e) || i(this.formatLanguageCode(e));
		}), r;
	}
}, _e = {
	zero: 0,
	one: 1,
	two: 2,
	few: 3,
	many: 4,
	other: 5
}, ve = {
	select: (e) => e === 1 ? "one" : "other",
	resolvedOptions: () => ({ pluralCategories: ["one", "other"] })
}, ye = class {
	constructor(e, t = {}) {
		this.languageUtils = e, this.options = t, this.logger = M.create("pluralResolver"), this.pluralRulesCache = {};
	}
	clearCache() {
		this.pluralRulesCache = {};
	}
	getRule(e, t = {}) {
		let n = le(e === "dev" ? "en" : e), r = t.ordinal ? "ordinal" : "cardinal", i = JSON.stringify({
			cleanedCode: n,
			type: r
		});
		if (i in this.pluralRulesCache) return this.pluralRulesCache[i];
		let a;
		try {
			a = new Intl.PluralRules(n, { type: r });
		} catch {
			if (typeof Intl > "u") return this.logger.error("No Intl support, please use an Intl polyfill!"), ve;
			if (!e.match(/-|_/)) return ve;
			let n = this.languageUtils.getLanguagePartFromCode(e);
			a = this.getRule(n, t);
		}
		return this.pluralRulesCache[i] = a, a;
	}
	needsPlural(e, t = {}) {
		let n = this.getRule(e, t);
		return n ||= this.getRule("dev", t), n?.resolvedOptions().pluralCategories.length > 1;
	}
	getPluralFormsOfKey(e, t, n = {}) {
		return this.getSuffixes(e, n).map((e) => `${t}${e}`);
	}
	getSuffixes(e, t = {}) {
		let n = this.getRule(e, t);
		return n ||= this.getRule("dev", t), n ? n.resolvedOptions().pluralCategories.sort((e, t) => _e[e] - _e[t]).map((e) => `${this.options.prepend}${t.ordinal ? `ordinal${this.options.prepend}` : ""}${e}`) : [];
	}
	getSuffix(e, t, n = {}) {
		let r = this.getRule(e, n);
		return r ? `${this.options.prepend}${n.ordinal ? `ordinal${this.options.prepend}` : ""}${r.select(t)}` : (this.logger.warn(`no plural rule found for: ${e}`), this.getSuffix("dev", t, n));
	}
}, be = (e, t, n, r = ".", i = !0) => {
	let a = ne(e, t, n);
	return !a && i && y(n) && (a = ce(e, n, r), a === void 0 && (a = ce(t, n, r))), a;
}, xe = (e) => e.replace(/\$/g, "$$$$"), Se = class {
	constructor(e = {}) {
		this.logger = M.create("interpolator"), this.options = e, this.format = e?.interpolation?.format || ((e) => e), this.init(e);
	}
	init(e = {}) {
		e.interpolation ||= { escapeValue: !0 };
		let { escape: t, escapeValue: n, useRawValueToEscape: r, prefix: i, prefixEscaped: a, suffix: o, suffixEscaped: s, formatSeparator: c, unescapeSuffix: l, unescapePrefix: u, nestingPrefix: d, nestingPrefixEscaped: f, nestingSuffix: p, nestingSuffixEscaped: m, nestingOptionsSeparator: h, maxReplaces: g, alwaysFormat: _ } = e.interpolation;
		this.escape = t === void 0 ? ae : t, this.escapeValue = n === void 0 ? !0 : n, this.useRawValueToEscape = r === void 0 ? !1 : r, this.prefix = i ? O(i) : a || "{{", this.suffix = o ? O(o) : s || "}}", this.formatSeparator = c || ",", this.unescapePrefix = l ? "" : u ? O(u) : "-", this.unescapeSuffix = this.unescapePrefix ? "" : l ? O(l) : "", this.nestingPrefix = d ? O(d) : f || O("$t("), this.nestingSuffix = p ? O(p) : m || O(")"), this.nestingOptionsSeparator = h || ",", this.maxReplaces = g || 1e3, this.alwaysFormat = _ === void 0 ? !1 : _, this.resetRegExp();
	}
	reset() {
		this.options && this.init(this.options);
	}
	resetRegExp() {
		let e = (e, t) => e?.source === t ? (e.lastIndex = 0, e) : new RegExp(t, "g");
		this.regexp = e(this.regexp, `${this.prefix}(.+?)${this.suffix}`), this.regexpUnescape = e(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`), this.nestingRegexp = e(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
	}
	interpolate(e, t, n, r) {
		let i, a, o, s = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {}, c = (e) => {
			if (!e.includes(this.formatSeparator)) {
				let i = be(t, s, e, this.options.keySeparator, this.options.ignoreJSONStructure);
				return this.alwaysFormat ? this.format(i, void 0, n, {
					...r,
					...t,
					interpolationkey: e
				}) : i;
			}
			let i = e.split(this.formatSeparator), a = i.shift().trim(), o = i.join(this.formatSeparator).trim();
			return this.format(be(t, s, a, this.options.keySeparator, this.options.ignoreJSONStructure), o, n, {
				...r,
				...t,
				interpolationkey: a
			});
		};
		this.resetRegExp(), !this.escapeValue && typeof e == "string" && /\$t\([^)]*\{[^}]*\{\{/.test(e) && this.logger.warn("nesting options string contains interpolated variables with escapeValue: false — if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.");
		let l = r?.missingInterpolationHandler || this.options.missingInterpolationHandler, u = r?.interpolation?.skipOnVariables === void 0 ? this.options.interpolation.skipOnVariables : r.interpolation.skipOnVariables;
		return [{
			regex: this.regexpUnescape,
			safeValue: (e) => e
		}, {
			regex: this.regexp,
			safeValue: (e) => this.escapeValue ? this.escape(e) : e
		}].forEach((t) => {
			for (o = 0; i = t.regex.exec(e);) {
				let n = i[1].trim();
				if (a = c(n), a === void 0) if (typeof l == "function") {
					let t = l(e, i, r);
					a = y(t) ? t : "";
				} else if (r && Object.prototype.hasOwnProperty.call(r, n)) a = "";
				else if (u) {
					a = i[0];
					continue;
				} else this.logger.warn(`missed to pass in variable ${n} for interpolating ${e}`), a = "";
				else !y(a) && !this.useRawValueToEscape && (a = x(a));
				let s = t.safeValue(a);
				if (e = e.replace(i[0], xe(s)), u ? (t.regex.lastIndex += s.length, t.regex.lastIndex -= i[0].length) : t.regex.lastIndex = 0, o++, o >= this.maxReplaces) break;
			}
		}), e;
	}
	nest(e, t, n = {}) {
		let r, i, a, o = (e, t) => {
			let n = this.nestingOptionsSeparator;
			if (!e.includes(n)) return e;
			let r = e.split(RegExp(`${O(n)}[ ]*{`)), i = `{${r[1]}`;
			e = r[0], i = this.interpolate(i, a);
			let o = i.match(/'/g), s = i.match(/"/g);
			((o?.length ?? 0) % 2 == 0 && !s || (s?.length ?? 0) % 2 != 0) && (i = i.replace(/'/g, "\""));
			try {
				a = JSON.parse(i), t && (a = {
					...t,
					...a
				});
			} catch (t) {
				return this.logger.warn(`failed parsing options string in nesting for key ${e}`, t), `${e}${n}${i}`;
			}
			return a.defaultValue && a.defaultValue.includes(this.prefix) && delete a.defaultValue, e;
		};
		for (; r = this.nestingRegexp.exec(e);) {
			let s = [];
			a = { ...n }, a = a.replace && !y(a.replace) ? a.replace : a, a.applyPostProcessor = !1, delete a.defaultValue;
			let c = /{.*}/s.test(r[1]) ? r[1].lastIndexOf("}") + 1 : r[1].indexOf(this.formatSeparator);
			if (c !== -1 && (s = r[1].slice(c).split(this.formatSeparator).map((e) => e.trim()).filter(Boolean), r[1] = r[1].slice(0, c)), i = t(o.call(this, r[1].trim(), a), a), i && r[0] === e && !y(i)) return i;
			y(i) || (i = x(i)), i ||= (this.logger.warn(`missed to resolve ${r[1]} for nesting ${e}`), ""), s.length && (i = s.reduce((e, t) => this.format(e, t, n.lng, {
				...n,
				interpolationkey: r[1].trim()
			}), i.trim())), e = e.replace(r[0], i), this.regexp.lastIndex = 0;
		}
		return e;
	}
}, Ce = (e) => {
	let t = e.toLowerCase().trim(), n = {};
	if (e.includes("(")) {
		let r = e.split("(");
		t = r[0].toLowerCase().trim();
		let i = r[1].slice(0, -1);
		t === "currency" && !i.includes(":") ? n.currency ||= i.trim() : t === "relativetime" && !i.includes(":") ? n.range ||= i.trim() : i.split(";").forEach((e) => {
			if (e) {
				let [t, ...r] = e.split(":"), i = r.join(":").trim().replace(/^'+|'+$/g, ""), a = t.trim();
				n[a] || (n[a] = i), i === "false" && (n[a] = !1), i === "true" && (n[a] = !0), isNaN(i) || (n[a] = parseInt(i, 10));
			}
		});
	}
	return {
		formatName: t,
		formatOptions: n
	};
}, we = (e) => {
	let t = {};
	return (n, r, i) => {
		let a = i;
		i && i.interpolationkey && i.formatParams && i.formatParams[i.interpolationkey] && i[i.interpolationkey] && (a = {
			...a,
			[i.interpolationkey]: void 0
		});
		let o = r + JSON.stringify(a), s = t[o];
		return s || (s = e(le(r), i), t[o] = s), s(n);
	};
}, Te = (e) => (t, n, r) => e(le(n), r)(t), Ee = class {
	constructor(e = {}) {
		this.logger = M.create("formatter"), this.options = e, this.init(e);
	}
	init(e, t = { interpolation: {} }) {
		this.formatSeparator = t.interpolation.formatSeparator || ",";
		let n = t.cacheInBuiltFormats ? we : Te;
		this.formats = {
			number: n((e, t) => {
				let n = new Intl.NumberFormat(e, { ...t });
				return (e) => n.format(e);
			}),
			currency: n((e, t) => {
				let n = new Intl.NumberFormat(e, {
					...t,
					style: "currency"
				});
				return (e) => n.format(e);
			}),
			datetime: n((e, t) => {
				let n = new Intl.DateTimeFormat(e, { ...t });
				return (e) => n.format(e);
			}),
			relativetime: n((e, t) => {
				let n = new Intl.RelativeTimeFormat(e, { ...t });
				return (e) => n.format(e, t.range || "day");
			}),
			list: n((e, t) => {
				let n = new Intl.ListFormat(e, { ...t });
				return (e) => n.format(e);
			})
		};
	}
	add(e, t) {
		this.formats[e.toLowerCase().trim()] = t;
	}
	addCached(e, t) {
		this.formats[e.toLowerCase().trim()] = we(t);
	}
	format(e, t, n, r = {}) {
		if (!t || e == null) return e;
		let i = t.split(this.formatSeparator), a = [];
		for (let e = 0; e < i.length; e++) {
			let t = i[e];
			for (; t.indexOf("(") > -1 && !t.includes(")") && e + 1 < i.length;) t = `${t}${this.formatSeparator}${i[++e]}`;
			a.push(t);
		}
		return a.reduce((e, t) => {
			let { formatName: i, formatOptions: a } = Ce(t);
			if (this.formats[i]) {
				let t = e;
				try {
					let o = r?.formatParams?.[r.interpolationkey] || {}, s = o.locale || o.lng || r.locale || r.lng || n;
					t = this.formats[i](e, s, {
						...a,
						...r,
						...o
					});
				} catch (e) {
					this.logger.warn(e);
				}
				return t;
			} else this.logger.warn(`there was no format function for ${i}`);
			return e;
		}, e);
	}
}, De = (e, t) => {
	e.pending[t] !== void 0 && (delete e.pending[t], e.pendingCount--);
}, Oe = class extends N {
	constructor(e, t, n, r = {}) {
		super(), this.backend = e, this.store = t, this.services = n, this.languageUtils = n.languageUtils, this.options = r, this.logger = M.create("backendConnector"), this.waitingReads = [], this.maxParallelReads = r.maxParallelReads || 10, this.readingCalls = 0, this.maxRetries = r.maxRetries >= 0 ? r.maxRetries : 5, this.retryTimeout = r.retryTimeout >= 1 ? r.retryTimeout : 350, this.state = {}, this.queue = [], this.backend?.init?.(n, r.backend, r);
	}
	queueLoad(e, t, n, r) {
		let i = {}, a = {}, o = {}, s = {};
		return e.forEach((e) => {
			let r = !0;
			t.forEach((t) => {
				let o = `${e}|${t}`;
				!n.reload && this.store.hasResourceBundle(e, t) ? this.state[o] = 2 : this.state[o] < 0 || (this.state[o] === 1 ? a[o] === void 0 && (a[o] = !0) : (this.state[o] = 1, r = !1, a[o] === void 0 && (a[o] = !0), i[o] === void 0 && (i[o] = !0), s[t] === void 0 && (s[t] = !0)));
			}), r || (o[e] = !0);
		}), (Object.keys(i).length || Object.keys(a).length) && this.queue.push({
			pending: a,
			pendingCount: Object.keys(a).length,
			loaded: {},
			errors: [],
			callback: r
		}), {
			toLoad: Object.keys(i),
			pending: Object.keys(a),
			toLoadLanguages: Object.keys(o),
			toLoadNamespaces: Object.keys(s)
		};
	}
	loaded(e, t, n) {
		let r = e.split("|"), i = r[0], a = r[1];
		t && this.emit("failedLoading", i, a, t), !t && n && this.store.addResourceBundle(i, a, n, void 0, void 0, { skipCopy: !0 }), this.state[e] = t ? -1 : 2, t && n && (this.state[e] = 0);
		let o = {};
		this.queue.forEach((n) => {
			D(n.loaded, [i], a), De(n, e), t && n.errors.push(t), n.pendingCount === 0 && !n.done && (Object.keys(n.loaded).forEach((e) => {
				o[e] || (o[e] = {});
				let t = n.loaded[e];
				t.length && t.forEach((t) => {
					o[e][t] === void 0 && (o[e][t] = !0);
				});
			}), n.done = !0, n.errors.length ? n.callback(n.errors) : n.callback());
		}), this.emit("loaded", o), this.queue = this.queue.filter((e) => !e.done);
	}
	read(e, t, n, r = 0, i = this.retryTimeout, a) {
		if (!e.length) return a(null, {});
		if (this.readingCalls >= this.maxParallelReads) {
			this.waitingReads.push({
				lng: e,
				ns: t,
				fcName: n,
				tried: r,
				wait: i,
				callback: a
			});
			return;
		}
		this.readingCalls++;
		let o = (o, s) => {
			if (this.readingCalls--, this.waitingReads.length > 0) {
				let e = this.waitingReads.shift();
				this.read(e.lng, e.ns, e.fcName, e.tried, e.wait, e.callback);
			}
			if (o && s && r < this.maxRetries) {
				setTimeout(() => {
					this.read(e, t, n, r + 1, i * 2, a);
				}, i);
				return;
			}
			a(o, s);
		}, s = this.backend[n].bind(this.backend);
		if (s.length === 2) {
			try {
				let n = s(e, t);
				n && typeof n.then == "function" ? n.then((e) => o(null, e)).catch(o) : o(null, n);
			} catch (e) {
				o(e);
			}
			return;
		}
		return s(e, t, o);
	}
	prepareLoading(e, t, n = {}, r) {
		if (!this.backend) return this.logger.warn("No backend was added via i18next.use. Will not load resources."), r && r();
		y(e) && (e = this.languageUtils.toResolveHierarchy(e)), y(t) && (t = [t]);
		let i = this.queueLoad(e, t, n, r);
		if (!i.toLoad.length) return i.pending.length || r(), null;
		i.toLoad.forEach((e) => {
			this.loadOne(e);
		});
	}
	load(e, t, n) {
		this.prepareLoading(e, t, {}, n);
	}
	reload(e, t, n) {
		this.prepareLoading(e, t, { reload: !0 }, n);
	}
	loadOne(e, t = "") {
		let n = e.split("|"), r = n[0], i = n[1];
		this.read(r, i, "read", void 0, void 0, (n, a) => {
			n && this.logger.warn(`${t}loading namespace ${i} for language ${r} failed`, n), !n && a && this.logger.log(`${t}loaded namespace ${i} for language ${r}`, a), this.loaded(e, n, a);
		});
	}
	saveMissing(e, t, n, r, i, a = {}, o = () => {}) {
		if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(t)) {
			this.logger.warn(`did not save key "${n}" as the namespace "${t}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
			return;
		}
		if (!(n == null || n === "")) {
			if (this.backend?.create) {
				let s = {
					...a,
					isUpdate: i
				}, c = this.backend.create.bind(this.backend);
				if (c.length < 6) try {
					let i;
					i = c.length === 5 ? c(e, t, n, r, s) : c(e, t, n, r), i && typeof i.then == "function" ? i.then((e) => o(null, e)).catch(o) : o(null, i);
				} catch (e) {
					o(e);
				}
				else c(e, t, n, r, o, s);
			}
			!e || !e[0] || this.store.addResource(e[0], t, n, r);
		}
	}
}, ke = () => ({
	debug: !1,
	initAsync: !0,
	ns: ["translation"],
	defaultNS: ["translation"],
	fallbackLng: ["dev"],
	fallbackNS: !1,
	supportedLngs: !1,
	nonExplicitSupportedLngs: !1,
	load: "all",
	preload: !1,
	keySeparator: ".",
	nsSeparator: ":",
	pluralSeparator: "_",
	contextSeparator: "_",
	enableSelector: !1,
	partialBundledLanguages: !1,
	saveMissing: !1,
	updateMissing: !1,
	saveMissingTo: "fallback",
	saveMissingPlurals: !0,
	missingKeyHandler: !1,
	missingInterpolationHandler: !1,
	postProcess: !1,
	postProcessPassResolved: !1,
	returnNull: !1,
	returnEmptyString: !0,
	returnObjects: !1,
	joinArrays: !1,
	returnedObjectHandler: !1,
	parseMissingKeyHandler: !1,
	appendNamespaceToMissingKey: !1,
	appendNamespaceToCIMode: !1,
	overloadTranslationOptionHandler: (e) => {
		let t = {};
		if (typeof e[1] == "object" && (t = e[1]), y(e[1]) && (t.defaultValue = e[1]), y(e[2]) && (t.tDescription = e[2]), typeof e[2] == "object" || typeof e[3] == "object") {
			let n = e[3] || e[2];
			Object.keys(n).forEach((e) => {
				t[e] = n[e];
			});
		}
		return t;
	},
	interpolation: {
		escapeValue: !0,
		prefix: "{{",
		suffix: "}}",
		formatSeparator: ",",
		unescapePrefix: "-",
		nestingPrefix: "$t(",
		nestingSuffix: ")",
		nestingOptionsSeparator: ",",
		maxReplaces: 1e3,
		skipOnVariables: !0
	},
	cacheInBuiltFormats: !0
}), Ae = (e) => (y(e.ns) && (e.ns = [e.ns]), y(e.fallbackLng) && (e.fallbackLng = [e.fallbackLng]), y(e.fallbackNS) && (e.fallbackNS = [e.fallbackNS]), e.supportedLngs && !e.supportedLngs.includes("cimode") && (e.supportedLngs = e.supportedLngs.concat(["cimode"])), e), je = () => {}, Me = (e) => {
	Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach((t) => {
		typeof e[t] == "function" && (e[t] = e[t].bind(e));
	});
}, Ne = class e extends N {
	constructor(e = {}, t) {
		if (super(), this.options = Ae(e), this.services = {}, this.logger = M, this.modules = { external: [] }, Me(this), t && !this.isInitialized && !e.isClone) {
			if (!this.options.initAsync) return this.init(e, t), this;
			setTimeout(() => {
				this.init(e, t);
			}, 0);
		}
	}
	init(e = {}, t) {
		this.isInitializing = !0, typeof e == "function" && (t = e, e = {}), e.defaultNS == null && e.ns && (y(e.ns) ? e.defaultNS = e.ns : e.ns.includes("translation") || (e.defaultNS = e.ns[0]));
		let n = ke();
		this.options = {
			...n,
			...this.options,
			...Ae(e)
		}, this.options.interpolation = {
			...n.interpolation,
			...this.options.interpolation
		}, e.keySeparator !== void 0 && (this.options.userDefinedKeySeparator = e.keySeparator), e.nsSeparator !== void 0 && (this.options.userDefinedNsSeparator = e.nsSeparator), typeof this.options.overloadTranslationOptionHandler != "function" && (this.options.overloadTranslationOptionHandler = n.overloadTranslationOptionHandler);
		let r = (e) => e ? typeof e == "function" ? new e() : e : null;
		if (!this.options.isClone) {
			this.modules.logger ? M.init(r(this.modules.logger), this.options) : M.init(null, this.options);
			let e;
			e = this.modules.formatter ? this.modules.formatter : Ee;
			let t = new ge(this.options);
			this.store = new ue(this.options.resources, this.options);
			let n = this.services;
			n.logger = M, n.resourceStore = this.store, n.languageUtils = t, n.pluralResolver = new ye(t, { prepend: this.options.pluralSeparator }), e && (n.formatter = r(e), n.formatter.init && n.formatter.init(n, this.options), this.options.interpolation.format = n.formatter.format.bind(n.formatter)), n.interpolator = new Se(this.options), n.utils = { hasLoadedNamespace: this.hasLoadedNamespace.bind(this) }, n.backendConnector = new Oe(r(this.modules.backend), n.resourceStore, n, this.options), n.backendConnector.on("*", (e, ...t) => {
				this.emit(e, ...t);
			}), this.modules.languageDetector && (n.languageDetector = r(this.modules.languageDetector), n.languageDetector.init && n.languageDetector.init(n, this.options.detection, this.options)), this.modules.i18nFormat && (n.i18nFormat = r(this.modules.i18nFormat), n.i18nFormat.init && n.i18nFormat.init(this)), this.translator = new he(this.services, this.options), this.translator.on("*", (e, ...t) => {
				this.emit(e, ...t);
			}), this.modules.external.forEach((e) => {
				e.init && e.init(this);
			});
		}
		if (this.format = this.options.interpolation.format, t ||= je, this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
			let e = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
			e.length > 0 && e[0] !== "dev" && (this.options.lng = e[0]);
		}
		!this.services.languageDetector && !this.options.lng && this.logger.warn("init: no languageDetector is used and no lng is defined"), [
			"getResource",
			"hasResourceBundle",
			"getResourceBundle",
			"getDataByLanguage"
		].forEach((e) => {
			this[e] = (...t) => this.store[e](...t);
		}), [
			"addResource",
			"addResources",
			"addResourceBundle",
			"removeResourceBundle"
		].forEach((e) => {
			this[e] = (...t) => (this.store[e](...t), this);
		});
		let i = b(), a = () => {
			let e = (e, n) => {
				this.isInitializing = !1, this.isInitialized && !this.initializedStoreOnce && this.logger.warn("init: i18next is already initialized. You should call init just once!"), this.isInitialized = !0, this.options.isClone || this.logger.log("initialized", this.options), this.emit("initialized", this.options), i.resolve(n), t(e, n);
			};
			if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized) return e(null, this.t.bind(this));
			this.changeLanguage(this.options.lng, e);
		};
		return this.options.resources || !this.options.initAsync ? a() : setTimeout(a, 0), i;
	}
	loadResources(e, t = je) {
		let n = t, r = y(e) ? e : this.language;
		if (typeof e == "function" && (n = e), !this.options.resources || this.options.partialBundledLanguages) {
			if (r?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return n();
			let e = [], t = (t) => {
				t && t !== "cimode" && this.services.languageUtils.toResolveHierarchy(t).forEach((t) => {
					t !== "cimode" && (e.includes(t) || e.push(t));
				});
			};
			r ? t(r) : this.services.languageUtils.getFallbackCodes(this.options.fallbackLng).forEach((e) => t(e)), this.options.preload?.forEach?.((e) => t(e)), this.services.backendConnector.load(e, this.options.ns, (e) => {
				!e && !this.resolvedLanguage && this.language && this.setResolvedLanguage(this.language), n(e);
			});
		} else n(null);
	}
	reloadResources(e, t, n) {
		let r = b();
		return typeof e == "function" && (n = e, e = void 0), typeof t == "function" && (n = t, t = void 0), e ||= this.languages, t ||= this.options.ns, n ||= je, this.services.backendConnector.reload(e, t, (e) => {
			r.resolve(), n(e);
		}), r;
	}
	use(e) {
		if (!e) throw Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
		if (!e.type) throw Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
		return e.type === "backend" && (this.modules.backend = e), (e.type === "logger" || e.log && e.warn && e.error) && (this.modules.logger = e), e.type === "languageDetector" && (this.modules.languageDetector = e), e.type === "i18nFormat" && (this.modules.i18nFormat = e), e.type === "postProcessor" && P.addPostProcessor(e), e.type === "formatter" && (this.modules.formatter = e), e.type === "3rdParty" && this.modules.external.push(e), this;
	}
	setResolvedLanguage(e) {
		if (!(!e || !this.languages) && !["cimode", "dev"].includes(e)) {
			for (let e = 0; e < this.languages.length; e++) {
				let t = this.languages[e];
				if (!["cimode", "dev"].includes(t) && this.store.hasLanguageSomeTranslations(t)) {
					this.resolvedLanguage = t;
					break;
				}
			}
			!this.resolvedLanguage && !this.languages.includes(e) && this.store.hasLanguageSomeTranslations(e) && (this.resolvedLanguage = e, this.languages.unshift(e));
		}
	}
	changeLanguage(e, t) {
		this.isLanguageChangingTo = e;
		let n = b();
		this.emit("languageChanging", e);
		let r = (e) => {
			this.language = e, this.languages = this.services.languageUtils.toResolveHierarchy(e), this.resolvedLanguage = void 0, this.setResolvedLanguage(e);
		}, i = (i, a) => {
			a ? this.isLanguageChangingTo === e && (r(a), this.translator.changeLanguage(a), this.isLanguageChangingTo = void 0, this.emit("languageChanged", a), this.logger.log("languageChanged", a)) : this.isLanguageChangingTo = void 0, n.resolve((...e) => this.t(...e)), t && t(i, (...e) => this.t(...e));
		}, a = (t) => {
			!e && !t && this.services.languageDetector && (t = []);
			let n = y(t) ? t : t && t[0], a = this.store.hasLanguageSomeTranslations(n) ? n : this.services.languageUtils.getBestMatchFromCodes(y(t) ? [t] : t);
			a && (this.language || r(a), this.translator.language || this.translator.changeLanguage(a), this.services.languageDetector?.cacheUserLanguage?.(a)), this.loadResources(a, (e) => {
				i(e, a);
			});
		};
		return !e && this.services.languageDetector && !this.services.languageDetector.async ? a(this.services.languageDetector.detect()) : !e && this.services.languageDetector && this.services.languageDetector.async ? this.services.languageDetector.detect.length === 0 ? this.services.languageDetector.detect().then(a) : this.services.languageDetector.detect(a) : a(e), n;
	}
	getFixedT(e, t, n, r) {
		let i = r?.scopeNs, a = (e, t, ...r) => {
			let o;
			o = typeof t == "object" ? { ...t } : this.options.overloadTranslationOptionHandler([e, t].concat(r)), o.lng = o.lng || a.lng, o.lngs = o.lngs || a.lngs;
			let s = o.ns !== void 0 && o.ns !== null;
			o.ns = o.ns || a.ns, o.keyPrefix !== "" && (o.keyPrefix = o.keyPrefix || n || a.keyPrefix);
			let c = {
				...this.options,
				...o
			};
			Array.isArray(i) && !s && (c.ns = i), typeof o.keyPrefix == "function" && (o.keyPrefix = pe(o.keyPrefix, c));
			let l = this.options.keySeparator || ".", u;
			return o.keyPrefix && Array.isArray(e) ? u = e.map((e) => (typeof e == "function" && (e = pe(e, c)), `${o.keyPrefix}${l}${e}`)) : (typeof e == "function" && (e = pe(e, c)), u = o.keyPrefix ? `${o.keyPrefix}${l}${e}` : e), this.t(u, o);
		};
		return y(e) ? a.lng = e : a.lngs = e, a.ns = t, a.keyPrefix = n, a;
	}
	t(...e) {
		return this.translator?.translate(...e);
	}
	exists(...e) {
		return this.translator?.exists(...e);
	}
	setDefaultNamespace(e) {
		this.options.defaultNS = e;
	}
	hasLoadedNamespace(e, t = {}) {
		if (!this.isInitialized) return this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages), !1;
		if (!this.languages || !this.languages.length) return this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages), !1;
		let n = t.lng || this.resolvedLanguage || this.languages[0], r = this.options ? this.options.fallbackLng : !1, i = this.languages[this.languages.length - 1];
		if (n.toLowerCase() === "cimode") return !0;
		let a = (e, t) => {
			let n = this.services.backendConnector.state[`${e}|${t}`];
			return n === -1 || n === 0 || n === 2;
		};
		if (t.precheck) {
			let e = t.precheck(this, a);
			if (e !== void 0) return e;
		}
		return !!(this.hasResourceBundle(n, e) || !this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages || a(n, e) && (!r || a(i, e)));
	}
	loadNamespaces(e, t) {
		let n = b();
		return this.options.ns ? (y(e) && (e = [e]), e.forEach((e) => {
			this.options.ns.includes(e) || this.options.ns.push(e);
		}), this.loadResources((e) => {
			n.resolve(), t && t(e);
		}), n) : (t && t(), Promise.resolve());
	}
	loadLanguages(e, t) {
		let n = b();
		y(e) && (e = [e]);
		let r = this.options.preload || [], i = e.filter((e) => !r.includes(e) && this.services.languageUtils.isSupportedCode(e));
		return i.length ? (this.options.preload = r.concat(i), this.loadResources((e) => {
			n.resolve(), t && t(e);
		}), n) : (t && t(), Promise.resolve());
	}
	dir(e) {
		if (e ||= this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language), !e) return "rtl";
		try {
			let t = new Intl.Locale(e);
			if (t && t.getTextInfo) {
				let e = t.getTextInfo();
				if (e && e.direction) return e.direction;
			}
		} catch {}
		let t = /* @__PURE__ */ "ar.shu.sqr.ssh.xaa.yhd.yud.aao.abh.abv.acm.acq.acw.acx.acy.adf.ads.aeb.aec.afb.ajp.apc.apd.arb.arq.ars.ary.arz.auz.avl.ayh.ayl.ayn.ayp.bbz.pga.he.iw.ps.pbt.pbu.pst.prp.prd.ug.ur.ydd.yds.yih.ji.yi.hbo.men.xmn.fa.jpr.peo.pes.prs.dv.sam.ckb".split("."), n = this.services?.languageUtils || new ge(ke());
		return e.toLowerCase().indexOf("-latn") > 1 ? "ltr" : t.includes(n.getLanguagePartFromCode(e)) || e.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
	}
	static createInstance(t = {}, n) {
		let r = new e(t, n);
		return r.createInstance = e.createInstance, r;
	}
	cloneInstance(t = {}, n = je) {
		let r = t.forkResourceStore;
		r && delete t.forkResourceStore;
		let i = {
			...this.options,
			...t,
			isClone: !0
		}, a = new e(i);
		if ((t.debug !== void 0 || t.prefix !== void 0) && (a.logger = a.logger.clone(t)), [
			"store",
			"services",
			"language"
		].forEach((e) => {
			a[e] = this[e];
		}), a.services = { ...this.services }, a.services.utils = { hasLoadedNamespace: a.hasLoadedNamespace.bind(a) }, r && (a.store = new ue(Object.keys(this.store.data).reduce((e, t) => (e[t] = { ...this.store.data[t] }, e[t] = Object.keys(e[t]).reduce((n, r) => (n[r] = { ...e[t][r] }, n), e[t]), e), {}), i), a.services.resourceStore = a.store), t.interpolation) {
			let e = {
				...ke().interpolation,
				...this.options.interpolation,
				...t.interpolation
			}, n = {
				...i,
				interpolation: e
			};
			a.services.interpolator = new Se(n);
		}
		return a.translator = new he(a.services, i), a.translator.on("*", (e, ...t) => {
			a.emit(e, ...t);
		}), a.init(i, n), a.translator.options = i, a.translator.backendConnector.services.utils = { hasLoadedNamespace: a.hasLoadedNamespace.bind(a) }, a;
	}
	toJSON() {
		return {
			options: this.options,
			store: this.store,
			language: this.language,
			languages: this.languages,
			resolvedLanguage: this.resolvedLanguage
		};
	}
}.createInstance(), Pe = Ne.createInstance;
Ne.dir, Ne.init, Ne.loadResources, Ne.reloadResources, Ne.use, Ne.changeLanguage, Ne.getFixedT, Ne.t, Ne.exists, Ne.setDefaultNamespace, Ne.hasLoadedNamespace, Ne.loadNamespaces, Ne.loadLanguages;
//#endregion
//#region ../summaries/node_modules/react-i18next/dist/es/utils.js
var Fe = (e, t, n, r) => {
	let i = [n, {
		code: t,
		...r || {}
	}];
	if (e?.services?.logger?.forward) return e.services.logger.forward(i, "warn", "react-i18next::", !0);
	He(i[0]) && (i[0] = `react-i18next:: ${i[0]}`), e?.services?.logger?.warn ? e.services.logger.warn(...i) : console?.warn && console.warn(...i);
}, Ie = {}, Le = (e, t, n, r) => {
	He(n) && Ie[n] || (He(n) && (Ie[n] = /* @__PURE__ */ new Date()), Fe(e, t, n, r));
}, Re = (e, t) => () => {
	if (e.isInitialized) t();
	else {
		let n = () => {
			setTimeout(() => {
				e.off("initialized", n);
			}, 0), t();
		};
		e.on("initialized", n);
	}
}, ze = (e, t, n) => {
	e.loadNamespaces(t, Re(e, n));
}, Be = (e, t, n, r) => {
	if (He(n) && (n = [n]), e.options.preload && e.options.preload.indexOf(t) > -1) return ze(e, n, r);
	n.forEach((t) => {
		e.options.ns.indexOf(t) < 0 && e.options.ns.push(t);
	}), e.loadLanguages(t, Re(e, r));
}, Ve = (e, t, n = {}) => !t.languages || !t.languages.length ? (Le(t, "NO_LANGUAGES", "i18n.languages were undefined or empty", { languages: t.languages }), !0) : t.hasLoadedNamespace(e, {
	lng: n.lng,
	precheck: (t, r) => {
		if (n.bindI18n && n.bindI18n.indexOf("languageChanging") > -1 && t.services.backendConnector.backend && t.isLanguageChangingTo && !r(t.isLanguageChangingTo, e)) return !1;
	}
}), He = (e) => typeof e == "string", Ue = (e) => typeof e == "object" && !!e, We = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g, Ge = {
	"&amp;": "&",
	"&#38;": "&",
	"&lt;": "<",
	"&#60;": "<",
	"&gt;": ">",
	"&#62;": ">",
	"&apos;": "'",
	"&#39;": "'",
	"&quot;": "\"",
	"&#34;": "\"",
	"&nbsp;": " ",
	"&#160;": " ",
	"&copy;": "©",
	"&#169;": "©",
	"&reg;": "®",
	"&#174;": "®",
	"&hellip;": "…",
	"&#8230;": "…",
	"&#x2F;": "/",
	"&#47;": "/"
}, Ke = (e) => Ge[e], qe = {
	bindI18n: "languageChanged",
	bindI18nStore: "",
	transEmptyNodeValue: "",
	transSupportBasicHtmlNodes: !0,
	transWrapTextNodes: "",
	transKeepBasicHtmlNodesFor: [
		"br",
		"strong",
		"i",
		"p"
	],
	useSuspense: !0,
	unescape: (e) => e.replace(We, Ke),
	transDefaultProps: void 0
}, Je = (e = {}) => {
	qe = {
		...qe,
		...e
	};
}, Ye = () => qe, Xe, Ze = (e) => {
	Xe = e;
}, Qe = () => Xe, $e = {
	type: "3rdParty",
	init(e) {
		Je(e.options.react), Ze(e);
	}
}, et = (0, _.createContext)(), tt = class {
	constructor() {
		this.usedNamespaces = {};
	}
	addUsedNamespaces(e) {
		e.forEach((e) => {
			this.usedNamespaces[e] || (this.usedNamespaces[e] = !0);
		});
	}
	getUsedNamespaces() {
		return Object.keys(this.usedNamespaces);
	}
}, nt = /* @__PURE__ */ o(((e) => {
	var t = u();
	function n(e, t) {
		return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
	}
	var r = typeof Object.is == "function" ? Object.is : n, i = t.useState, a = t.useEffect, o = t.useLayoutEffect, s = t.useDebugValue;
	function c(e, t) {
		var n = t(), r = i({ inst: {
			value: n,
			getSnapshot: t
		} }), c = r[0].inst, u = r[1];
		return o(function() {
			c.value = n, c.getSnapshot = t, l(c) && u({ inst: c });
		}, [
			e,
			n,
			t
		]), a(function() {
			return l(c) && u({ inst: c }), e(function() {
				l(c) && u({ inst: c });
			});
		}, [e]), s(n), n;
	}
	function l(e) {
		var t = e.getSnapshot;
		e = e.value;
		try {
			var n = t();
			return !r(e, n);
		} catch {
			return !0;
		}
	}
	function d(e, t) {
		return t();
	}
	var f = typeof window > "u" || window.document === void 0 || window.document.createElement === void 0 ? d : c;
	e.useSyncExternalStore = t.useSyncExternalStore === void 0 ? f : t.useSyncExternalStore;
})), rt = (/* @__PURE__ */ o(((e, t) => {
	t.exports = nt();
})))(), it = {
	t: (e, t) => {
		if (He(t)) return t;
		if (Ue(t) && He(t.defaultValue)) return t.defaultValue;
		if (typeof e == "function") return "";
		if (Array.isArray(e)) {
			let t = e[e.length - 1];
			return typeof t == "function" ? "" : t;
		}
		return e;
	},
	ready: !1
}, at = () => () => {}, ot = (e, t = {}) => {
	let { i18n: n } = t, { i18n: r, defaultNS: i } = (0, _.useContext)(et) || {}, a = n || r || Qe();
	a && !a.reportNamespaces && (a.reportNamespaces = new tt()), a || Le(a, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.");
	let o = (0, _.useMemo)(() => ({
		...Ye(),
		...a?.options?.react,
		...t
	}), [a, t]), { useSuspense: s, keyPrefix: c } = o, l = e || i || a?.options?.defaultNS, u = He(l) ? [l] : l || ["translation"], d = (0, _.useMemo)(() => u, u);
	a?.reportNamespaces?.addUsedNamespaces?.(d);
	let f = (0, _.useRef)(0), p = (0, _.useCallback)((e) => {
		if (!a) return at;
		let { bindI18n: t, bindI18nStore: n } = o, r = () => {
			f.current += 1, e();
		};
		return t && a.on(t, r), n && a.store.on(n, r), () => {
			t && t.split(" ").forEach((e) => a.off(e, r)), n && n.split(" ").forEach((e) => a.store.off(e, r));
		};
	}, [a, o]), m = (0, _.useRef)(), h = (0, _.useCallback)(() => {
		if (!a) return it;
		let e = !!(a.isInitialized || a.initializedStoreOnce) && d.every((e) => Ve(e, a, o)), n = t.lng || a.language, r = f.current, i = m.current;
		if (i && i.ready === e && i.lng === n && i.keyPrefix === c && i.revision === r) return i;
		let s = {
			t: a.getFixedT(n, o.nsMode === "fallback" ? d : d[0], c, { scopeNs: d }),
			ready: e,
			lng: n,
			keyPrefix: c,
			revision: r
		};
		return m.current = s, s;
	}, [
		a,
		d,
		c,
		o,
		t.lng
	]), [g, v] = (0, _.useState)(0), { t: y, ready: b } = (0, rt.useSyncExternalStore)(p, h, h);
	(0, _.useEffect)(() => {
		if (a && !b && !s) {
			let e = () => v((e) => e + 1);
			t.lng ? Be(a, t.lng, d, e) : ze(a, d, e);
		}
	}, [
		a,
		t.lng,
		d,
		b,
		s,
		g
	]);
	let x = a || {}, S = (0, _.useRef)(null), C = (0, _.useRef)(), w = (e) => {
		let t = Object.getOwnPropertyDescriptors(e);
		t.__original && delete t.__original;
		let n = Object.create(Object.getPrototypeOf(e), t);
		if (!Object.prototype.hasOwnProperty.call(n, "__original")) try {
			Object.defineProperty(n, "__original", {
				value: e,
				writable: !1,
				enumerable: !1,
				configurable: !1
			});
		} catch {}
		return n;
	}, T = (0, _.useMemo)(() => {
		let e = x, t = e?.language, n = e;
		e && (S.current && S.current.__original === e && C.current === t ? n = S.current : (n = w(e), S.current = n, C.current = t));
		let r = !b && !s ? (...e) => (Le(a, "USE_T_BEFORE_READY", "useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t."), y(...e)) : y, i = [
			r,
			n,
			b
		];
		return i.t = r, i.i18n = n, i.ready = b, i;
	}, [
		y,
		x,
		b,
		x.resolvedLanguage,
		x.language,
		x.languages
	]);
	if (a && s && !b) {
		let e = !1;
		try {
			e = !1;
		} catch {}
		throw e && Le(a, "SUSPENDED_WHILE_LOADING", "useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook"), new Promise((e) => {
			let n = () => e();
			t.lng ? Be(a, t.lng, d, n) : ze(a, d, n);
		});
	}
	return T;
};
//#endregion
//#region ../summaries/node_modules/react-i18next/dist/es/I18nextProvider.js
function st({ i18n: e, defaultNS: t, children: n }) {
	let r = (0, _.useMemo)(() => ({
		i18n: e,
		defaultNS: t
	}), [e, t]);
	return (0, _.createElement)(et.Provider, { value: r }, n);
}
//#endregion
//#region \0virtual:live-strings
var ct = {
	oats: {
		conversation: {
			legend: {
				label: "What the marks mean",
				open: "Open",
				topic: "New topic",
				marked: "Marked"
			},
			contourSummary: "{{minutes}} minutes, {{questions}} questions asked ({{unresolved}} still unanswered), the subject turned {{shifts}} times, and the room came back to {{returns}} threads.",
			contourEmpty: "Nothing recorded yet."
		},
		flow: {
			title: "Conversation flow",
			viewLabel: "Flow view",
			mode: {
				lanes: "Lanes",
				graph: "Graph"
			},
			empty: "Topics appear here as the conversation moves.",
			caption: {
				topics_one: "{{count}} topic",
				topics_other: "{{count}} topics",
				returns_one: "{{count}} return to an earlier topic",
				returns_other: "{{count}} returns to earlier topics",
				topicsReturns: "{{topics}}, {{returns}}"
			},
			state: {
				live: "Now",
				open: "Open",
				resolved: "Resolved",
				dropped: "Dropped"
			},
			back_one: "Back {{count}}×",
			back_other: "Back {{count}}×",
			lanesLabel: "Topics in the order raised",
			graphLabel_one: "Graph of {{count}} topic raised so far",
			graphLabel_other: "Graph of {{count}} topics raised so far",
			nodeName: "{{label}}, {{state}}",
			nodeNameBack: "{{label}}, {{state}}, {{back}}",
			quote: "“{{text}}”",
			noQuote: "Nothing recent to quote.",
			earlier: "Came up in earlier conversations:"
		},
		intelligence: {
			noTranscript: "No transcript yet.",
			speakerYou: "You",
			speakerRoom: "Room",
			speakerN: "Speaker {{n}}",
			nameSpeaker: "Name {{speaker}}",
			talkTime: {
				label: "Talk time",
				show: "Show only what {{speaker}} said",
				only: "Only what {{speaker}} said",
				everyone: "Show everyone",
				unattributed: "Not attributed"
			}
		},
		review: {
			title: "What this left open",
			tally: "{{asked}} asked, {{answered}} answered",
			openThreads_one: "{{count}} thread still open: {{threads}}",
			openThreads_other: "{{count}} threads still open: {{threads}}",
			showAnswers: "Show the answers",
			hideAnswers: "Hide the answers",
			addNote: "Add a note",
			noteLabel: "Note for the moment at {{time}}",
			removeMark: "Remove",
			removeMarkLabel: "Remove the mark at {{time}}",
			markedTurn: "Marked.",
			markedTitle: "Marked moments"
		}
	},
	questionCard: {
		now: "now",
		state: {
			asked: "Open",
			answered: "Answered",
			uncertain: "Uncertain",
			silence: "Unanswered",
			denied: "Unknown"
		},
		searched: "Searched",
		dismiss: "Dismiss question",
		earlier: "{{count}} earlier",
		collapse: "Show fewer",
		undo: "Undo dismiss",
		announced: "New question: {{question}}",
		announcedAgain: "Asked again, {{count}} times now: {{question}}",
		announcedBatch: "{{count}} new questions, latest: {{question}}",
		searchedHost: "Searched on {{host}}",
		check: {
			checking: "Checking your context",
			checkingSources: "Checking {{sources}}",
			right: "That's right",
			wrong: "Wait, that's wrong",
			answer: "Found it",
			quote: "“{{quote}}”",
			openSource: "Open {{source}}",
			announced: {
				right: "That's right: {{answer}}. From {{source}}.",
				wrong: "Wait, that's wrong: {{answer}}. From {{source}}.",
				answer: "Found it: {{answer}}. From {{source}}."
			},
			checkingAgent: "Asking Claude Code"
		}
	},
	topicGraph: { search: "Search" },
	demo: {
		replay: {
			play: "Play",
			pause: "Pause",
			position: "Time in the conversation",
			at: "{{at}} of {{length}}"
		},
		questions: { replay: "Replay" }
	}
}, lt = [
	{
		name: "--tw-translate-x",
		syntax: "*",
		inherits: !1,
		initialValue: "0"
	},
	{
		name: "--tw-translate-y",
		syntax: "*",
		inherits: !1,
		initialValue: "0"
	},
	{
		name: "--tw-translate-z",
		syntax: "*",
		inherits: !1,
		initialValue: "0"
	},
	{
		name: "--tw-rotate-x",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-rotate-y",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-rotate-z",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-skew-x",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-skew-y",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-space-y-reverse",
		syntax: "*",
		inherits: !1,
		initialValue: "0"
	},
	{
		name: "--tw-divide-y-reverse",
		syntax: "*",
		inherits: !1,
		initialValue: "0"
	},
	{
		name: "--tw-border-style",
		syntax: "*",
		inherits: !1,
		initialValue: "solid"
	},
	{
		name: "--tw-leading",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-font-weight",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-ordinal",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-slashed-zero",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-numeric-figure",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-numeric-spacing",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-numeric-fraction",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-shadow",
		syntax: "*",
		inherits: !1,
		initialValue: "0 0 #0000"
	},
	{
		name: "--tw-shadow-color",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-shadow-alpha",
		syntax: "<percentage>",
		inherits: !1,
		initialValue: "100%"
	},
	{
		name: "--tw-inset-shadow",
		syntax: "*",
		inherits: !1,
		initialValue: "0 0 #0000"
	},
	{
		name: "--tw-inset-shadow-color",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-inset-shadow-alpha",
		syntax: "<percentage>",
		inherits: !1,
		initialValue: "100%"
	},
	{
		name: "--tw-ring-color",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-ring-shadow",
		syntax: "*",
		inherits: !1,
		initialValue: "0 0 #0000"
	},
	{
		name: "--tw-inset-ring-color",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-inset-ring-shadow",
		syntax: "*",
		inherits: !1,
		initialValue: "0 0 #0000"
	},
	{
		name: "--tw-ring-inset",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-ring-offset-width",
		syntax: "<length>",
		inherits: !1,
		initialValue: "0px"
	},
	{
		name: "--tw-ring-offset-color",
		syntax: "*",
		inherits: !1,
		initialValue: "#fff"
	},
	{
		name: "--tw-ring-offset-shadow",
		syntax: "*",
		inherits: !1,
		initialValue: "0 0 #0000"
	},
	{
		name: "--tw-outline-style",
		syntax: "*",
		inherits: !1,
		initialValue: "solid"
	},
	{
		name: "--tw-blur",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-brightness",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-contrast",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-grayscale",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-hue-rotate",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-invert",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-opacity",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-saturate",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-sepia",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-drop-shadow",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-drop-shadow-color",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-drop-shadow-alpha",
		syntax: "<percentage>",
		inherits: !1,
		initialValue: "100%"
	},
	{
		name: "--tw-drop-shadow-size",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-duration",
		syntax: "*",
		inherits: !1
	},
	{
		name: "--tw-scale-x",
		syntax: "*",
		inherits: !1,
		initialValue: "1"
	},
	{
		name: "--tw-scale-y",
		syntax: "*",
		inherits: !1,
		initialValue: "1"
	},
	{
		name: "--tw-scale-z",
		syntax: "*",
		inherits: !1,
		initialValue: "1"
	}
], ut = {
	kind: "oats-sample-conversation",
	version: 1,
	meta: {
		id: "launch-readiness-review",
		sample: !0,
		description: "Sample conversation: a 30-minute launch readiness review at Pellwood, a fictional software company. Nine invented people.",
		company: "Pellwood (fictional)",
		participants: [
			{
				name: "Maya",
				role: "Product lead, chairs the review"
			},
			{
				name: "Theo",
				role: "Engineering lead"
			},
			{
				name: "Ines",
				role: "Backend engineer"
			},
			{
				name: "Jun",
				role: "Product designer"
			},
			{
				name: "Ruth",
				role: "Security lead"
			},
			{
				name: "Marcus",
				role: "Head of sales"
			},
			{
				name: "Grace",
				role: "Support lead"
			},
			{
				name: "Omar",
				role: "Data analyst"
			},
			{
				name: "Lena",
				role: "Marketing lead"
			}
		],
		startedAt: 17918208e5,
		endedAt: 1791822552556,
		summarizedAt: 1791822593556,
		placement: { endedAgoMinutes: 120 },
		generatedBy: "demo/build-fixtures.mjs"
	},
	note: /* @__PURE__ */ JSON.parse("{\"title\":\"Enterprise launch review: SSO gates the date\",\"content\":\"\",\"note_type\":\"meeting\",\"transcript\":[{\"id\":\"seg-mv5fs6xk-1\",\"text\":\"Okay, launch readiness review for Pellwood Enterprise. The launch date on the plan is still Tuesday the 3rd.\",\"source\":\"mic\",\"timestamp\":1791820803534,\"startMs\":3534,\"endMs\":12383,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-2\",\"text\":\"By the end of this, either we confirm the launch date, or we know the one thing that would move the date.\",\"source\":\"mic\",\"timestamp\":1791820813063,\"startMs\":13063,\"endMs\":23835,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-3\",\"text\":\"The launch checklist is at nineteen of twenty-three. The four open launch items are all on today's agenda.\",\"source\":\"mic\",\"timestamp\":1791820824694,\"startMs\":24694,\"endMs\":33564,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-4\",\"text\":\"And the launch page copy is done, pending the final launch date.\",\"source\":\"mic\",\"timestamp\":1791820834941,\"startMs\":34941,\"endMs\":41181,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-5\",\"text\":\"Theo, short version from engineering first, then we go topic by topic.\",\"source\":\"mic\",\"timestamp\":1791820841953,\"startMs\":41953,\"endMs\":48171,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-6\",\"text\":\"Sure. Most of the launch scope is done.\",\"source\":\"mic\",\"timestamp\":1791820849247,\"startMs\":49247,\"endMs\":53872,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-7\",\"text\":\"Billing, the activity log, the new admin console. All merged, all on staging since Friday.\",\"source\":\"mic\",\"timestamp\":1791820854701,\"startMs\":54701,\"endMs\":63203,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-8\",\"text\":\"Load testing came back green on Sunday. Four times the beta traffic, and staging held up fine.\",\"source\":\"mic\",\"timestamp\":1791820863965,\"startMs\":63965,\"endMs\":73680,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-9\",\"text\":\"So the launch scope itself is in good shape for the 3rd.\",\"source\":\"mic\",\"timestamp\":1791820874281,\"startMs\":74281,\"endMs\":81266,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-10\",\"text\":\"There's one item that worries me, and I'll get to it in a minute.\",\"source\":\"mic\",\"timestamp\":1791820881888,\"startMs\":81888,\"endMs\":89920,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-11\",\"text\":\"Is Tuesday the 3rd the date I should plan around?\",\"source\":\"mic\",\"timestamp\":1791820890694,\"startMs\":90694,\"endMs\":95898,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-12\",\"text\":\"For now, yes. We lock it on Friday.\",\"source\":\"mic\",\"timestamp\":1791820897123,\"startMs\":97123,\"endMs\":101224,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-13\",\"text\":\"We lock the launch date right after this review and the board meeting.\",\"source\":\"mic\",\"timestamp\":1791820901887,\"startMs\":101887,\"endMs\":108402,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-14\",\"text\":\"And the launch date really matters on my side. Three signed customers have kickoffs booked the week of the 3rd.\",\"source\":\"mic\",\"timestamp\":1791820909251,\"startMs\":109251,\"endMs\":118686,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-15\",\"text\":\"If the launch slips, I'm the one calling them. One of those kickoffs is Corbel.\",\"source\":\"mic\",\"timestamp\":1791820919748,\"startMs\":119748,\"endMs\":126892,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-16\",\"text\":\"Understood. Grace, Lena, raise anything that hangs on the exact launch date.\",\"source\":\"mic\",\"timestamp\":1791820928129,\"startMs\":128129,\"endMs\":134117,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-17\",\"text\":\"Only the help articles. They go live with the launch, and I'd like a day of buffer before the launch date.\",\"source\":\"mic\",\"timestamp\":1791820935092,\"startMs\":135092,\"endMs\":146460,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-18\",\"text\":\"Same here. Everything on my side hangs on the launch date, so the earlier we lock it, the better.\",\"source\":\"mic\",\"timestamp\":1791820947285,\"startMs\":147285,\"endMs\":156461,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-19\",\"text\":\"My whole launch calendar says the 3rd. Moving the date costs me a few awkward emails, but it's doable.\",\"source\":\"mic\",\"timestamp\":1791820957414,\"startMs\":157414,\"endMs\":166528,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-20\",\"text\":\"Okay. Theo, go ahead. The item that worries you.\",\"source\":\"mic\",\"timestamp\":1791820967895,\"startMs\":167895,\"endMs\":172504,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-21\",\"text\":\"Right. The real blocker is SSO. SAML login, specifically.\",\"source\":\"mic\",\"timestamp\":1791820973690,\"startMs\":173690,\"endMs\":178804,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-22\",\"text\":\"SAML login works with two of our three identity providers. SSO on the third provider fails.\",\"source\":\"mic\",\"timestamp\":1791820979463,\"startMs\":179463,\"endMs\":188062,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-23\",\"text\":\"It fails on signed assertions. The identity provider sends a perfectly valid response, we reject it, and the user lands back on the login page.\",\"source\":\"mic\",\"timestamp\":1791820988953,\"startMs\":188953,\"endMs\":202121,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-24\",\"text\":\"And that third identity provider is the one most of the big prospects use.\",\"source\":\"mic\",\"timestamp\":1791821003245,\"startMs\":203245,\"endMs\":211087,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-25\",\"text\":\"Walk us through the SSO failure. Ines, you found it.\",\"source\":\"mic\",\"timestamp\":1791821011958,\"startMs\":211958,\"endMs\":216922,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-26\",\"text\":\"Yeah. The SAML failure is clock skew, mostly.\",\"source\":\"mic\",\"timestamp\":1791821018092,\"startMs\":218092,\"endMs\":222011,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-27\",\"text\":\"Their SAML assertions arrive a few seconds early, and our SAML library rejects anything early.\",\"source\":\"mic\",\"timestamp\":1791821022977,\"startMs\":222977,\"endMs\":230332,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-28\",\"text\":\"So an assertion stamped three seconds in the future counts as invalid, and the SSO login fails.\",\"source\":\"mic\",\"timestamp\":1791821031268,\"startMs\":231268,\"endMs\":239733,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-29\",\"text\":\"We can loosen that. The SSO fix itself is small. Testing it against every identity provider is the slow part.\",\"source\":\"mic\",\"timestamp\":1791821040342,\"startMs\":240342,\"endMs\":251028,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-30\",\"text\":\"Each identity provider wants its own test tenant, and the third one took us nine days to set up.\",\"source\":\"mic\",\"timestamp\":1791821051739,\"startMs\":251739,\"endMs\":261933,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-31\",\"text\":\"Nine days just to get a test tenant. That identity provider is not exactly in a hurry.\",\"source\":\"mic\",\"timestamp\":1791821062887,\"startMs\":262887,\"endMs\":270430,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-32\",\"text\":\"The SSO fix is on a branch already. Twelve lines, plus a setting for the SAML clock tolerance.\",\"source\":\"mic\",\"timestamp\":1791821071477,\"startMs\":271477,\"endMs\":281257,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-33\",\"text\":\"And the SAML library added the same clock tolerance setting last month, so we're not inventing anything.\",\"source\":\"mic\",\"timestamp\":1791821081987,\"startMs\":281987,\"endMs\":290343,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-34\",\"text\":\"Um, the SSO setup screen in the admin console is ready, by the way. Admins upload the SAML metadata file and test the connection.\",\"source\":\"mic\",\"timestamp\":1791821091386,\"startMs\":291386,\"endMs\":305059,\"speaker\":\"speaker_8\",\"speakerName\":\"Jun\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-35\",\"text\":\"Nice. Thanks, Jun.\",\"source\":\"mic\",\"timestamp\":1791821106269,\"startMs\":306269,\"endMs\":308116,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-36\",\"text\":\"If the SAML test fails, the setup screen shows the raw SAML error, though. Admins will hate that.\",\"source\":\"mic\",\"timestamp\":1791821109023,\"startMs\":309023,\"endMs\":319116,\"speaker\":\"speaker_8\",\"speakerName\":\"Jun\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-37\",\"text\":\"Just so everyone hears it, I won't sign off on SSO until the signed assertion fix has been through a security review.\",\"source\":\"mic\",\"timestamp\":1791821120398,\"startMs\":320398,\"endMs\":332255,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-38\",\"text\":\"Totally fair.\",\"source\":\"mic\",\"timestamp\":1791821133439,\"startMs\":333439,\"endMs\":334751,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-39\",\"text\":\"Loosening clock tolerance on SAML is exactly the kind of change that opens a replay window.\",\"source\":\"mic\",\"timestamp\":1791821135540,\"startMs\":335540,\"endMs\":344198,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-40\",\"text\":\"So two minutes of SAML clock tolerance, max, logged, and an alert on any skew above thirty seconds.\",\"source\":\"mic\",\"timestamp\":1791821144800,\"startMs\":344800,\"endMs\":354464,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-41\",\"text\":\"Two minutes is fine. Most of the clock skew we saw was under ten seconds.\",\"source\":\"mic\",\"timestamp\":1791821155103,\"startMs\":355103,\"endMs\":362308,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-42\",\"text\":\"One test tenant drifted forty seconds, but that was a misconfigured clock on their side, not ours.\",\"source\":\"mic\",\"timestamp\":1791821162957,\"startMs\":362957,\"endMs\":371040,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-43\",\"text\":\"I also want every SSO login in the activity log, successes and failures, with the identity provider.\",\"source\":\"mic\",\"timestamp\":1791821171597,\"startMs\":371597,\"endMs\":381200,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-44\",\"text\":\"Fair. Logging SSO login events is an hour of work.\",\"source\":\"mic\",\"timestamp\":1791821181765,\"startMs\":381765,\"endMs\":387658,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-45\",\"text\":\"Ines and I can pair on the SSO fix tomorrow, so the SSO review starts early.\",\"source\":\"mic\",\"timestamp\":1791821188389,\"startMs\":388389,\"endMs\":397529,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-46\",\"text\":\"So the SSO fix lands by Thursday the 29th, if nothing else catches fire.\",\"source\":\"mic\",\"timestamp\":1791821198551,\"startMs\":398551,\"endMs\":406218,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-47\",\"text\":\"Then Ruth needs two days for the SSO review.\",\"source\":\"mic\",\"timestamp\":1791821207042,\"startMs\":407042,\"endMs\":411941,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-48\",\"text\":\"Two working days for the SSO review. So Monday the 2nd, at the earliest.\",\"source\":\"mic\",\"timestamp\":1791821213168,\"startMs\":413168,\"endMs\":421117,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-49\",\"text\":\"That's one day of slack. Zero, really.\",\"source\":\"mic\",\"timestamp\":1791821222559,\"startMs\":422559,\"endMs\":425941,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-50\",\"text\":\"Yeah. It's tight.\",\"source\":\"mic\",\"timestamp\":1791821227516,\"startMs\":427516,\"endMs\":429292,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-51\",\"text\":\"And SCIM provisioning is out of scope. SSO login only, accounts still get created by hand.\",\"source\":\"mic\",\"timestamp\":1791821230568,\"startMs\":430568,\"endMs\":440172,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-52\",\"text\":\"Right. SCIM can wait for next quarter.\",\"source\":\"mic\",\"timestamp\":1791821241435,\"startMs\":441435,\"endMs\":445604,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-53\",\"text\":\"Corbel won't care about SCIM. Corbel cares about SSO login on day one.\",\"source\":\"mic\",\"timestamp\":1791821247198,\"startMs\":447198,\"endMs\":453325,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-54\",\"text\":\"Another dependency. The SOC 2 audit.\",\"source\":\"mic\",\"timestamp\":1791821254661,\"startMs\":454661,\"endMs\":458230,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-55\",\"text\":\"The SOC 2 audit window closes on the 31st, and SSO is in scope for the audit.\",\"source\":\"mic\",\"timestamp\":1791821259204,\"startMs\":459204,\"endMs\":468557,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-56\",\"text\":\"The SOC 2 readiness check flagged two audit gaps. Both are closed now, with evidence.\",\"source\":\"mic\",\"timestamp\":1791821269595,\"startMs\":469595,\"endMs\":478105,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-57\",\"text\":\"The SOC 2 audit covers May through October. Six months of evidence, and most of it is in good shape.\",\"source\":\"mic\",\"timestamp\":1791821279033,\"startMs\":479033,\"endMs\":490922,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-58\",\"text\":\"Do we have a date from the auditors yet?\",\"source\":\"mic\",\"timestamp\":1791821291716,\"startMs\":491716,\"endMs\":495985,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-59\",\"text\":\"I don't know yet.\",\"source\":\"mic\",\"timestamp\":1791821296631,\"startMs\":496631,\"endMs\":499168,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-60\",\"text\":\"Kestrel still hasn't confirmed the SOC 2 audit fieldwork dates.\",\"source\":\"mic\",\"timestamp\":1791821300001,\"startMs\":500001,\"endMs\":505774,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-61\",\"text\":\"They said this week. I've asked twice.\",\"source\":\"mic\",\"timestamp\":1791821306640,\"startMs\":506640,\"endMs\":510748,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-62\",\"text\":\"And the SOC 2 report won't exist until December. Kestrel writes the audit report after the window closes.\",\"source\":\"mic\",\"timestamp\":1791821311675,\"startMs\":511675,\"endMs\":522072,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-63\",\"text\":\"Can we mention SOC 2 in the announcement?\",\"source\":\"mic\",\"timestamp\":1791821323582,\"startMs\":523582,\"endMs\":527607,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-64\",\"text\":\"Hmm.\",\"source\":\"mic\",\"timestamp\":1791821329143,\"startMs\":529143,\"endMs\":529947,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-65\",\"text\":\"December is way too late for the SOC 2 report. Every security questionnaire asks for it.\",\"source\":\"mic\",\"timestamp\":1791821331365,\"startMs\":531365,\"endMs\":538676,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-66\",\"text\":\"Corbel's procurement team asked for the SOC 2 report last Thursday. Arden asked on Monday.\",\"source\":\"mic\",\"timestamp\":1791821339631,\"startMs\":539631,\"endMs\":546367,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-67\",\"text\":\"Right, but there's a bridge letter. The audit firm can issue a bridge letter that covers the gap until the SOC 2 report lands.\",\"source\":\"mic\",\"timestamp\":1791821347977,\"startMs\":547977,\"endMs\":561087,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-68\",\"text\":\"So the bridge letter has to cover us until the SOC 2 report lands.\",\"source\":\"mic\",\"timestamp\":1791821362669,\"startMs\":562669,\"endMs\":569598,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-69\",\"text\":\"For most buyers, it will.\",\"source\":\"mic\",\"timestamp\":1791821370940,\"startMs\":570940,\"endMs\":573905,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-70\",\"text\":\"Corbel's security team accepted a bridge letter from their last vendor. Arden, I honestly can't say.\",\"source\":\"mic\",\"timestamp\":1791821374659,\"startMs\":574659,\"endMs\":583651,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-71\",\"text\":\"Arden's security team is stricter than Corbel's, for the record.\",\"source\":\"mic\",\"timestamp\":1791821384310,\"startMs\":584310,\"endMs\":588981,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-72\",\"text\":\"But Kestrel only issues the bridge letter once the audit fieldwork starts.\",\"source\":\"mic\",\"timestamp\":1791821390160,\"startMs\":590160,\"endMs\":596967,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-73\",\"text\":\"So the SOC 2 report and the bridge letter both wait on the audit firm.\",\"source\":\"mic\",\"timestamp\":1791821398431,\"startMs\":598431,\"endMs\":605437,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-74\",\"text\":\"Pretty much. The audit firm is the bottleneck for the whole SOC 2 timeline.\",\"source\":\"mic\",\"timestamp\":1791821406138,\"startMs\":606138,\"endMs\":613937,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-75\",\"text\":\"If the audit slips into November, the bridge letter slips with it.\",\"source\":\"mic\",\"timestamp\":1791821414567,\"startMs\":614567,\"endMs\":621224,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-76\",\"text\":\"Okay. So we need the auditors on site before the 3rd.\",\"source\":\"mic\",\"timestamp\":1791821422001,\"startMs\":622001,\"endMs\":627403,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-77\",\"text\":\"Ideally the week before. I'll chase Kestrel on the fieldwork dates again today.\",\"source\":\"mic\",\"timestamp\":1791821428511,\"startMs\":628511,\"endMs\":635599,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-78\",\"text\":\"So does any of this move the launch date?\",\"source\":\"mic\",\"timestamp\":1791821437011,\"startMs\":637011,\"endMs\":641576,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-79\",\"text\":\"Honestly, I'd push it a week.\",\"source\":\"mic\",\"timestamp\":1791821443073,\"startMs\":643073,\"endMs\":646492,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-80\",\"text\":\"A week. Theo, three customers have kickoffs that week.\",\"source\":\"mic\",\"timestamp\":1791821448011,\"startMs\":648011,\"endMs\":652349,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-81\",\"text\":\"And I'd rather move a kickoff than launch something half-broken.\",\"source\":\"mic\",\"timestamp\":1791821453694,\"startMs\":653694,\"endMs\":659165,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-82\",\"text\":\"It's not half-broken. It's one edge case for one group of customers.\",\"source\":\"mic\",\"timestamp\":1791821459262,\"startMs\":659262,\"endMs\":665000,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-83\",\"text\":\"An edge case your biggest customers live in, Marcus.\",\"source\":\"mic\",\"timestamp\":1791821465081,\"startMs\":665081,\"endMs\":670069,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-84\",\"text\":\"Then we fix the edge case. We don't move the launch for it.\",\"source\":\"mic\",\"timestamp\":1791821470865,\"startMs\":670865,\"endMs\":676845,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-85\",\"text\":\"Okay, okay. Hold on.\",\"source\":\"mic\",\"timestamp\":1791821478312,\"startMs\":678312,\"endMs\":680567,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-86\",\"text\":\"Honestly, a calm launch beats a fast launch.\",\"source\":\"mic\",\"timestamp\":1791821482103,\"startMs\":682103,\"endMs\":686460,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-87\",\"text\":\"Nobody is deciding the launch date in the next two minutes.\",\"source\":\"mic\",\"timestamp\":1791821487963,\"startMs\":687963,\"endMs\":693988,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-88\",\"text\":\"Let's get the full picture first, and come back to the launch date at the end.\",\"source\":\"mic\",\"timestamp\":1791821495022,\"startMs\":695022,\"endMs\":703673,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-89\",\"text\":\"Fine.\",\"source\":\"mic\",\"timestamp\":1791821504783,\"startMs\":704783,\"endMs\":705464,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-90\",\"text\":\"Fine by me.\",\"source\":\"mic\",\"timestamp\":1791821506295,\"startMs\":706295,\"endMs\":708060,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-91\",\"text\":\"Okay. Discounts, list pricing, seat minimums, and the enterprise tier.\",\"source\":\"mic\",\"timestamp\":1791821508758,\"startMs\":708758,\"endMs\":713941,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-92\",\"text\":\"Pricing first, then discounts.\",\"source\":\"mic\",\"timestamp\":1791821514713,\"startMs\":714713,\"endMs\":716680,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-93\",\"text\":\"The enterprise list price is forty-eight dollars a seat per month, fifty seat minimum, billed annually.\",\"source\":\"mic\",\"timestamp\":1791821517434,\"startMs\":717434,\"endMs\":724559,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-94\",\"text\":\"And the list price is working. Nobody has pushed back on forty-eight, and the new pricing page converts better than the old one.\",\"source\":\"mic\",\"timestamp\":1791821525385,\"startMs\":725385,\"endMs\":735685,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-95\",\"text\":\"The two big incumbents charge sixty-five and seventy a seat, so the enterprise pricing is an easy conversation.\",\"source\":\"mic\",\"timestamp\":1791821536367,\"startMs\":736367,\"endMs\":744668,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-96\",\"text\":\"The pricing isn't the problem. Discounts are.\",\"source\":\"mic\",\"timestamp\":1791821545550,\"startMs\":745550,\"endMs\":748943,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-97\",\"text\":\"I have three enterprise deals asking for a forty percent discount.\",\"source\":\"mic\",\"timestamp\":1791821549906,\"startMs\":749906,\"endMs\":755098,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-98\",\"text\":\"Forty percent is not a discount. That's a different price.\",\"source\":\"mic\",\"timestamp\":1791821556095,\"startMs\":756095,\"endMs\":761612,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-99\",\"text\":\"It's a different price for logos we need on the website.\",\"source\":\"mic\",\"timestamp\":1791821561747,\"startMs\":761747,\"endMs\":766991,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-100\",\"text\":\"We agreed the enterprise discount cap was twenty-five percent. In September. All of us.\",\"source\":\"mic\",\"timestamp\":1791821568151,\"startMs\":768151,\"endMs\":775489,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-101\",\"text\":\"We agreed that cap before Greywater asked for three hundred seats.\",\"source\":\"mic\",\"timestamp\":1791821576499,\"startMs\":776499,\"endMs\":782040,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-102\",\"text\":\"Three hundred seats at list price is a hundred and seventy thousand a year. Even with forty percent off, it's the biggest deal we've ever signed.\",\"source\":\"mic\",\"timestamp\":1791821582653,\"startMs\":782653,\"endMs\":795109,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-103\",\"text\":\"And it sets the pricing for every finance team that hears about it. Discounts leak, Marcus.\",\"source\":\"mic\",\"timestamp\":1791821595698,\"startMs\":795698,\"endMs\":803542,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-104\",\"text\":\"Sorry, are these discounts on the seat price or on the whole contract?\",\"source\":\"mic\",\"timestamp\":1791821604248,\"startMs\":804248,\"endMs\":812206,\"speaker\":\"speaker_8\",\"speakerName\":\"Jun\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-105\",\"text\":\"On the seat price only.\",\"source\":\"mic\",\"timestamp\":1791821613427,\"startMs\":813427,\"endMs\":815936,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-106\",\"text\":\"The platform fee always stays at list price. Eight thousand a year, flat.\",\"source\":\"mic\",\"timestamp\":1791821616731,\"startMs\":816731,\"endMs\":822990,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-107\",\"text\":\"Okay, let's make the discount concrete. What's the floor on the discount?\",\"source\":\"mic\",\"timestamp\":1791821624027,\"startMs\":824027,\"endMs\":830359,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-108\",\"text\":\"Twenty-five percent standard, thirty with a two-year term.\",\"source\":\"mic\",\"timestamp\":1791821631556,\"startMs\":831556,\"endMs\":835637,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-109\",\"text\":\"Anything deeper comes to you and finance, deal by deal.\",\"source\":\"mic\",\"timestamp\":1791821636544,\"startMs\":836544,\"endMs\":841681,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-110\",\"text\":\"I can live with that discount floor. Thirty with a two-year term, and nothing deeper without a signed case study.\",\"source\":\"mic\",\"timestamp\":1791821643086,\"startMs\":843086,\"endMs\":853383,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-111\",\"text\":\"A case study I can get. Greywater already offered one.\",\"source\":\"mic\",\"timestamp\":1791821654863,\"startMs\":854863,\"endMs\":859721,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-112\",\"text\":\"Then Greywater gets thirty percent and a two-year term, and the rest of the discount waits for the case study.\",\"source\":\"mic\",\"timestamp\":1791821661026,\"startMs\":861026,\"endMs\":871690,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-113\",\"text\":\"And Arden offered a three-year term in exchange for the discount. That one I actually like.\",\"source\":\"mic\",\"timestamp\":1791821672893,\"startMs\":872893,\"endMs\":880263,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-114\",\"text\":\"A three-year term changes the discount math. Bring me the Arden numbers before you agree to anything.\",\"source\":\"mic\",\"timestamp\":1791821681298,\"startMs\":881298,\"endMs\":889618,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-115\",\"text\":\"Deal. I'll put the discount floor in the pricing doc today.\",\"source\":\"mic\",\"timestamp\":1791821690342,\"startMs\":890342,\"endMs\":895360,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-116\",\"text\":\"One more pricing thing. Halden wants monthly pricing instead of annual billing, and the pricing doc doesn't allow it.\",\"source\":\"mic\",\"timestamp\":1791821696004,\"startMs\":896004,\"endMs\":904622,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-117\",\"text\":\"Good. Annual billing stays in the pricing. Monthly billing lost us money on the old pricing model.\",\"source\":\"mic\",\"timestamp\":1791821705260,\"startMs\":905260,\"endMs\":913593,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-118\",\"text\":\"For reference, the median discount across the beta conversions was eighteen percent.\",\"source\":\"mic\",\"timestamp\":1791821714212,\"startMs\":914212,\"endMs\":921199,\"speaker\":\"speaker_9\",\"speakerName\":\"Omar\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-119\",\"text\":\"Eighteen percent. Good, that helps the pricing story.\",\"source\":\"mic\",\"timestamp\":1791821721923,\"startMs\":921923,\"endMs\":925733,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-120\",\"text\":\"How many of the enterprise deals in the pipeline need SSO?\",\"source\":\"mic\",\"timestamp\":1791821726993,\"startMs\":926993,\"endMs\":932750,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-121\",\"text\":\"Six of the nine.\",\"source\":\"mic\",\"timestamp\":1791821734082,\"startMs\":934082,\"endMs\":936140,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-122\",\"text\":\"Corbel and Arden both made it a hard requirement in the contract. The other four deals would take it in December.\",\"source\":\"mic\",\"timestamp\":1791821736836,\"startMs\":936836,\"endMs\":946897,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-123\",\"text\":\"Okay, back to SSO and that third identity provider, then.\",\"source\":\"mic\",\"timestamp\":1791821747822,\"startMs\":947822,\"endMs\":952753,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-124\",\"text\":\"Can we ship SSO behind a flag?\",\"source\":\"mic\",\"timestamp\":1791821753779,\"startMs\":953779,\"endMs\":957327,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-125\",\"text\":\"Yes, with a per-workspace flag.\",\"source\":\"mic\",\"timestamp\":1791821758474,\"startMs\":958474,\"endMs\":961521,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-126\",\"text\":\"We turn SSO on for those six accounts and leave the flag off for everyone else.\",\"source\":\"mic\",\"timestamp\":1791821762486,\"startMs\":962486,\"endMs\":971695,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-127\",\"text\":\"I'm fine with an SSO flag, as long as the security review still happens before any of the six switch it on.\",\"source\":\"mic\",\"timestamp\":1791821772608,\"startMs\":972608,\"endMs\":985676,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-128\",\"text\":\"Agreed. The SSO flag doesn't skip the security review.\",\"source\":\"mic\",\"timestamp\":1791821786444,\"startMs\":986444,\"endMs\":991568,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-129\",\"text\":\"And the flag gives us an off switch. If the third identity provider still misbehaves, we flip that account back to passwords.\",\"source\":\"mic\",\"timestamp\":1791821792884,\"startMs\":992884,\"endMs\":1004074,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-130\",\"text\":\"Good. That takes some pressure off.\",\"source\":\"mic\",\"timestamp\":1791821805463,\"startMs\":1005463,\"endMs\":1008795,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-131\",\"text\":\"Okay, data migration risk.\",\"source\":\"mic\",\"timestamp\":1791821809689,\"startMs\":1009689,\"endMs\":1012028,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-132\",\"text\":\"Right. The data migration is the big one for me.\",\"source\":\"mic\",\"timestamp\":1791821813067,\"startMs\":1013067,\"endMs\":1018143,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-133\",\"text\":\"The data migration moves every existing workspace onto the new permissions model.\",\"source\":\"mic\",\"timestamp\":1791821819152,\"startMs\":1019152,\"endMs\":1025143,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-134\",\"text\":\"We ran the data migration twice on a copy of production. 1,140 workspaces, three hours and twenty minutes end to end.\",\"source\":\"mic\",\"timestamp\":1791821826030,\"startMs\":1026030,\"endMs\":1036308,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-135\",\"text\":\"Four workspaces failed the data migration twice, all on orphaned records.\",\"source\":\"mic\",\"timestamp\":1791821837075,\"startMs\":1037075,\"endMs\":1042543,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-136\",\"text\":\"The orphaned records come from the old sharing feature. We delete them before the data migration, with a backup.\",\"source\":\"mic\",\"timestamp\":1791821843189,\"startMs\":1043189,\"endMs\":1052421,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-137\",\"text\":\"Those four we can fix by hand before the data migration starts.\",\"source\":\"mic\",\"timestamp\":1791821853826,\"startMs\":1053826,\"endMs\":1060658,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-138\",\"text\":\"What's the rollback if the migration fails halfway?\",\"source\":\"mic\",\"timestamp\":1791821862259,\"startMs\":1062259,\"endMs\":1066876,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-139\",\"text\":\"Every workspace gets its own snapshot.\",\"source\":\"mic\",\"timestamp\":1791821868411,\"startMs\":1068411,\"endMs\":1071368,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-140\",\"text\":\"The snapshot is taken right before that workspace migrates, and restoring one workspace takes about four minutes.\",\"source\":\"mic\",\"timestamp\":1791821872043,\"startMs\":1072043,\"endMs\":1080207,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-141\",\"text\":\"And we migrate fifty at a time, so a failure stops fifty, not the whole data migration.\",\"source\":\"mic\",\"timestamp\":1791821881307,\"startMs\":1081307,\"endMs\":1090339,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-142\",\"text\":\"How long does the full migration take on production?\",\"source\":\"mic\",\"timestamp\":1791821891774,\"startMs\":1091774,\"endMs\":1096289,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-143\",\"text\":\"Honestly, I don't know.\",\"source\":\"mic\",\"timestamp\":1791821897575,\"startMs\":1097575,\"endMs\":1099767,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-144\",\"text\":\"We've never run the data migration on the three biggest data sets, ten times the size of the copy.\",\"source\":\"mic\",\"timestamp\":1791821900491,\"startMs\":1100491,\"endMs\":1109997,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-145\",\"text\":\"That's the real risk with the migration. The data volume, not the code.\",\"source\":\"mic\",\"timestamp\":1791821910698,\"startMs\":1110698,\"endMs\":1117865,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-146\",\"text\":\"Greywater alone has four million ledger rows. The copy we tested the migration on had nothing close.\",\"source\":\"mic\",\"timestamp\":1791821918577,\"startMs\":1118577,\"endMs\":1126998,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-147\",\"text\":\"I can run the three biggest data sets on a separate copy this week, and have real migration numbers by Thursday.\",\"source\":\"mic\",\"timestamp\":1791821927883,\"startMs\":1127883,\"endMs\":1138176,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-148\",\"text\":\"Do that. And if the migration runs long, it happens on Saturday, with the old model still readable.\",\"source\":\"mic\",\"timestamp\":1791821939346,\"startMs\":1139346,\"endMs\":1148225,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-149\",\"text\":\"Makes sense. We'd start the migration Saturday morning and keep the old permissions model readable during the migration.\",\"source\":\"mic\",\"timestamp\":1791821949205,\"startMs\":1149205,\"endMs\":1157584,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-150\",\"text\":\"Each workspace goes read-only for about ten minutes while it migrates, with a migration banner instead of an error.\",\"source\":\"mic\",\"timestamp\":1791821958095,\"startMs\":1158095,\"endMs\":1168016,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-151\",\"text\":\"And we watch the migration on a dashboard. Error rate, batch time, data copied.\",\"source\":\"mic\",\"timestamp\":1791821968882,\"startMs\":1168882,\"endMs\":1176271,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-152\",\"text\":\"The migration dashboard pages me if the error rate passes one percent.\",\"source\":\"mic\",\"timestamp\":1791821977160,\"startMs\":1177160,\"endMs\":1183541,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-153\",\"text\":\"Every workspace owner gets an email about the migration window, with the read-only times.\",\"source\":\"mic\",\"timestamp\":1791821984095,\"startMs\":1184095,\"endMs\":1191576,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-154\",\"text\":\"And keep the migration snapshots for thirty days after. Auditors will ask.\",\"source\":\"mic\",\"timestamp\":1791821992237,\"startMs\":1192237,\"endMs\":1199088,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-155\",\"text\":\"Thirty days of snapshots is fine. Snapshot storage is cheap compared to a failed migration.\",\"source\":\"mic\",\"timestamp\":1791822000155,\"startMs\":1200155,\"endMs\":1207569,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-156\",\"text\":\"The permissions migration is the only step with no undo button, apart from the snapshots.\",\"source\":\"mic\",\"timestamp\":1791822008576,\"startMs\":1208576,\"endMs\":1215969,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-157\",\"text\":\"Okay, support staffing and the support queue.\",\"source\":\"mic\",\"timestamp\":1791822017255,\"startMs\":1217255,\"endMs\":1220878,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-158\",\"text\":\"Right. Support staffing is my biggest worry. We have four support agents, and two are out that week.\",\"source\":\"mic\",\"timestamp\":1791822022065,\"startMs\":1222065,\"endMs\":1231276,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-159\",\"text\":\"One support agent is on parental leave, and one is at her sister's wedding.\",\"source\":\"mic\",\"timestamp\":1791822032058,\"startMs\":1232058,\"endMs\":1239415,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-160\",\"text\":\"So two support agents cover the enterprise queue and the regular queue, in the busiest support week of the year.\",\"source\":\"mic\",\"timestamp\":1791822039987,\"startMs\":1239987,\"endMs\":1250637,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-161\",\"text\":\"Last launch, support tickets tripled in the first two days, and the support queue never really recovered that week.\",\"source\":\"mic\",\"timestamp\":1791822051254,\"startMs\":1251254,\"endMs\":1261387,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-162\",\"text\":\"Who's on call for support escalations that week?\",\"source\":\"mic\",\"timestamp\":1791822062076,\"startMs\":1262076,\"endMs\":1266139,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-163\",\"text\":\"Ines and me as primary.\",\"source\":\"mic\",\"timestamp\":1791822066939,\"startMs\":1266939,\"endMs\":1270042,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-164\",\"text\":\"Ruth backs us up on support escalations, in shifts.\",\"source\":\"mic\",\"timestamp\":1791822070941,\"startMs\":1270941,\"endMs\":1276194,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-165\",\"text\":\"That covers engineering. I still need people on the support queue in the evenings.\",\"source\":\"mic\",\"timestamp\":1791822077289,\"startMs\":1277289,\"endMs\":1285009,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-166\",\"text\":\"Can engineering cover the evening support queue that week?\",\"source\":\"mic\",\"timestamp\":1791822085757,\"startMs\":1285757,\"endMs\":1290890,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-167\",\"text\":\"Hmm.\",\"source\":\"mic\",\"timestamp\":1791822091583,\"startMs\":1291583,\"endMs\":1292348,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-168\",\"text\":\"Let's take the evening support queue offline. Grace, send me the gaps in the support schedule.\",\"source\":\"mic\",\"timestamp\":1791822092925,\"startMs\":1292925,\"endMs\":1300653,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-169\",\"text\":\"Will do. And I want support macros written before the 3rd, for the support agents.\",\"source\":\"mic\",\"timestamp\":1791822101287,\"startMs\":1301287,\"endMs\":1308932,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-170\",\"text\":\"I'll pull the support tickets from the last launch, so the support macros match real tickets.\",\"source\":\"mic\",\"timestamp\":1791822109639,\"startMs\":1309639,\"endMs\":1317990,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-171\",\"text\":\"Last launch the support agents answered setup questions with screenshots. This time every support macro links to the setup guide.\",\"source\":\"mic\",\"timestamp\":1791822118997,\"startMs\":1318997,\"endMs\":1329627,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-172\",\"text\":\"And the support queue gets a priority lane for the six SSO accounts.\",\"source\":\"mic\",\"timestamp\":1791822130407,\"startMs\":1330407,\"endMs\":1337437,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-173\",\"text\":\"Good. A priority lane in the support queue makes sense.\",\"source\":\"mic\",\"timestamp\":1791822138126,\"startMs\":1338126,\"endMs\":1343593,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-174\",\"text\":\"I'd also like an engineer in the support channel the first morning, to unblock the support agents fast.\",\"source\":\"mic\",\"timestamp\":1791822145148,\"startMs\":1345148,\"endMs\":1354952,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-175\",\"text\":\"That one's easy. Theo, put an engineer in the support channel, for the support queue.\",\"source\":\"mic\",\"timestamp\":1791822156532,\"startMs\":1356532,\"endMs\":1364532,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-176\",\"text\":\"Done. Ines covers the first support morning, I cover the afternoon.\",\"source\":\"mic\",\"timestamp\":1791822165883,\"startMs\":1365883,\"endMs\":1371738,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-177\",\"text\":\"And the support agents get a half-day of SSO training on Thursday, so the support queue isn't learning live.\",\"source\":\"mic\",\"timestamp\":1791822172601,\"startMs\":1372601,\"endMs\":1382669,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-178\",\"text\":\"Beta feedback and the import bug.\",\"source\":\"mic\",\"timestamp\":1791822183710,\"startMs\":1383710,\"endMs\":1386914,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-179\",\"text\":\"The beta feedback is mostly good, apart from the import bug. Large CSV files time out, and the import screen just says something went wrong.\",\"source\":\"mic\",\"timestamp\":1791822187833,\"startMs\":1387833,\"endMs\":1402376,\"speaker\":\"speaker_8\",\"speakerName\":\"Jun\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-180\",\"text\":\"How many beta accounts hit the import bug?\",\"source\":\"mic\",\"timestamp\":1791822203262,\"startMs\":1403262,\"endMs\":1407498,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-181\",\"text\":\"Fourteen of the 212 beta accounts.\",\"source\":\"mic\",\"timestamp\":1791822209094,\"startMs\":1409094,\"endMs\":1412734,\"speaker\":\"speaker_9\",\"speakerName\":\"Omar\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-182\",\"text\":\"Eleven of those were importing CSV files over 50,000 rows. The other three had a byte order mark in the CSV file.\",\"source\":\"mic\",\"timestamp\":1791822213537,\"startMs\":1413537,\"endMs\":1426356,\"speaker\":\"speaker_9\",\"speakerName\":\"Omar\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-183\",\"text\":\"And the import bug isn't really a timeout. The importer drops the last chunk of any CSV file bigger than one upload chunk.\",\"source\":\"mic\",\"timestamp\":1791822227199,\"startMs\":1427199,\"endMs\":1437667,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-184\",\"text\":\"So the import says it failed, but most rows actually landed. Partial imports that look complete.\",\"source\":\"mic\",\"timestamp\":1791822238430,\"startMs\":1438430,\"endMs\":1445800,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-185\",\"text\":\"Did any of those beta accounts lose data for good?\",\"source\":\"mic\",\"timestamp\":1791822247023,\"startMs\":1447023,\"endMs\":1452540,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-186\",\"text\":\"No idea, honestly.\",\"source\":\"mic\",\"timestamp\":1791822253681,\"startMs\":1453681,\"endMs\":1455670,\"speaker\":\"speaker_9\",\"speakerName\":\"Omar\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-187\",\"text\":\"I only have the import error logs, not the customer data.\",\"source\":\"mic\",\"timestamp\":1791822256468,\"startMs\":1456468,\"endMs\":1463390,\"speaker\":\"speaker_9\",\"speakerName\":\"Omar\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-188\",\"text\":\"I can check. We keep the raw CSV uploads, so we can replay all fourteen imports.\",\"source\":\"mic\",\"timestamp\":1791822264691,\"startMs\":1464691,\"endMs\":1472387,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-189\",\"text\":\"The import fix merged, and the fixed importer is in release candidate three.\",\"source\":\"mic\",\"timestamp\":1791822273370,\"startMs\":1473370,\"endMs\":1479879,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-190\",\"text\":\"And we added a test with a sixty thousand row CSV file, so the import bug can't come back quietly.\",\"source\":\"mic\",\"timestamp\":1791822281247,\"startMs\":1481247,\"endMs\":1492967,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-191\",\"text\":\"Good. Replay the fourteen imports this week, and the import error needs a clearer message.\",\"source\":\"mic\",\"timestamp\":1791822293826,\"startMs\":1493826,\"endMs\":1501910,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-192\",\"text\":\"Agreed. I'll have new copy for the import error message tomorrow.\",\"source\":\"mic\",\"timestamp\":1791822303019,\"startMs\":1503019,\"endMs\":1509759,\"speaker\":\"speaker_8\",\"speakerName\":\"Jun\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-193\",\"text\":\"Send the new copy to me too. Half of those fourteen customers opened tickets about the import bug.\",\"source\":\"mic\",\"timestamp\":1791822310897,\"startMs\":1510897,\"endMs\":1520809,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-194\",\"text\":\"Halden Freight hit the import bug three times in one week. They're the loudest of the fourteen.\",\"source\":\"mic\",\"timestamp\":1791822321940,\"startMs\":1521940,\"endMs\":1529919,\"speaker\":\"speaker_7\",\"speakerName\":\"Ines\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-195\",\"text\":\"Halden opened four support tickets about the import bug. The last import ticket was not friendly.\",\"source\":\"mic\",\"timestamp\":1791822331309,\"startMs\":1531309,\"endMs\":1540273,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-196\",\"text\":\"Then Halden gets a personal email about the import fix, from me, today.\",\"source\":\"mic\",\"timestamp\":1791822341812,\"startMs\":1541812,\"endMs\":1548466,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-197\",\"text\":\"And the import progress bar will show rows imported, so a partial import is visible.\",\"source\":\"mic\",\"timestamp\":1791822349902,\"startMs\":1549902,\"endMs\":1558139,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-198\",\"text\":\"The announcement, then, and the news embargo.\",\"source\":\"mic\",\"timestamp\":1791822358847,\"startMs\":1558847,\"endMs\":1562411,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-199\",\"text\":\"Right. For the announcement, I'd move the news embargo to Wednesday.\",\"source\":\"mic\",\"timestamp\":1791822363668,\"startMs\":1563668,\"endMs\":1569364,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-200\",\"text\":\"The analyst briefing is on Tuesday, so the news should land after the briefing, on Wednesday.\",\"source\":\"mic\",\"timestamp\":1791822370298,\"startMs\":1570298,\"endMs\":1578199,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-201\",\"text\":\"So the news embargo lifts at nine on Wednesday the 4th. Customers get access on the 3rd, and the announcement goes out on the 4th.\",\"source\":\"mic\",\"timestamp\":1791822379098,\"startMs\":1579098,\"endMs\":1591067,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-202\",\"text\":\"So customers get a quiet day before the news hits. I like that, actually.\",\"source\":\"mic\",\"timestamp\":1791822392440,\"startMs\":1592440,\"endMs\":1599093,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-203\",\"text\":\"Exactly. And the news story has real quotes in it.\",\"source\":\"mic\",\"timestamp\":1791822400170,\"startMs\":1600170,\"endMs\":1605259,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-204\",\"text\":\"Two trade outlets have the story under the news embargo already.\",\"source\":\"mic\",\"timestamp\":1791822406036,\"startMs\":1606036,\"endMs\":1611634,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-205\",\"text\":\"Good. Keep those trade outlets close.\",\"source\":\"mic\",\"timestamp\":1791822413243,\"startMs\":1613243,\"endMs\":1616457,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-206\",\"text\":\"Legal approved two of the quotes for the news story.\",\"source\":\"mic\",\"timestamp\":1791822417797,\"startMs\":1617797,\"endMs\":1622633,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-207\",\"text\":\"The blog post and the customer email are ready. The news release is with legal until Thursday.\",\"source\":\"mic\",\"timestamp\":1791822423495,\"startMs\":1623495,\"endMs\":1631514,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-208\",\"text\":\"And the news embargo means the trade outlets can't publish before nine on Wednesday.\",\"source\":\"mic\",\"timestamp\":1791822432305,\"startMs\":1632305,\"endMs\":1638938,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-209\",\"text\":\"And the news embargo gives sales a morning to call the kickoff customers first.\",\"source\":\"mic\",\"timestamp\":1791822439495,\"startMs\":1639495,\"endMs\":1645802,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-210\",\"text\":\"Please keep SOC 2 out of the news release for now.\",\"source\":\"mic\",\"timestamp\":1791822446839,\"startMs\":1646839,\"endMs\":1653123,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-211\",\"text\":\"Already done. Nothing about the audit in the news release until it's real.\",\"source\":\"mic\",\"timestamp\":1791822454560,\"startMs\":1654560,\"endMs\":1660655,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-212\",\"text\":\"And thank you for Wednesday. That gives us a day to breathe before the news.\",\"source\":\"mic\",\"timestamp\":1791822461656,\"startMs\":1661656,\"endMs\":1669181,\"speaker\":\"speaker_5\",\"speakerName\":\"Grace\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-213\",\"text\":\"Okay, back to the launch date, then. Here's my proposal.\",\"source\":\"mic\",\"timestamp\":1791822470079,\"startMs\":1670079,\"endMs\":1675139,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-214\",\"text\":\"We hold the launch date. Tuesday the 3rd.\",\"source\":\"mic\",\"timestamp\":1791822475827,\"startMs\":1675827,\"endMs\":1679823,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-215\",\"text\":\"If the SSO piece slips past Monday, the launch date moves a week, and we say so on Monday, not on launch morning.\",\"source\":\"mic\",\"timestamp\":1791822480429,\"startMs\":1680429,\"endMs\":1691523,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-216\",\"text\":\"I can commit to that.\",\"source\":\"mic\",\"timestamp\":1791822492639,\"startMs\":1692639,\"endMs\":1695585,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-217\",\"text\":\"Theo, the Monday check is yours. Fix merged, review signed, or the launch date moves.\",\"source\":\"mic\",\"timestamp\":1791822496803,\"startMs\":1696803,\"endMs\":1704950,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-218\",\"text\":\"Understood. Monday at ten, before standup.\",\"source\":\"mic\",\"timestamp\":1791822506158,\"startMs\":1706158,\"endMs\":1709545,\"speaker\":\"speaker_3\",\"speakerName\":\"Theo\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-219\",\"text\":\"I can live with that. I'll warn the three kickoff customers today that the launch date could move.\",\"source\":\"mic\",\"timestamp\":1791822510426,\"startMs\":1710426,\"endMs\":1719124,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-220\",\"text\":\"And I'll tell Corbel the 3rd is likely, not promised.\",\"source\":\"mic\",\"timestamp\":1791822519881,\"startMs\":1719881,\"endMs\":1724997,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-221\",\"text\":\"Works for me.\",\"source\":\"mic\",\"timestamp\":1791822526006,\"startMs\":1726006,\"endMs\":1727940,\"speaker\":\"speaker_6\",\"speakerName\":\"Ruth\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-222\",\"text\":\"I'll hold both launch dates in the calendar until Monday.\",\"source\":\"mic\",\"timestamp\":1791822529082,\"startMs\":1729082,\"endMs\":1734173,\"speaker\":\"speaker_2\",\"speakerName\":\"Lena\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-223\",\"text\":\"Great. The launch date holds at the 3rd, with a hard check on Monday. Thanks, everyone.\",\"source\":\"mic\",\"timestamp\":1791822535097,\"startMs\":1735097,\"endMs\":1743220,\"speaker\":\"speaker_1\",\"speakerName\":\"Maya\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false},{\"id\":\"seg-mv5fs6xk-224\",\"text\":\"Wait, one more. Are we still doing the launch webinar on the 5th?\",\"source\":\"mic\",\"timestamp\":1791822544072,\"startMs\":1744072,\"endMs\":1749956,\"speaker\":\"speaker_4\",\"speakerName\":\"Marcus\",\"speakerIsPlaceholder\":false,\"speakerStatus\":\"locked\",\"speakerLocked\":false}],\"enhanced_content\":\"The team reviewed launch readiness for Pellwood Enterprise and kept Tuesday the 3rd as the launch date, on condition that the SSO fix and its security review are finished by Monday the 2nd.\\n\\n## Threads\\n- **Launch date vs. SSO.** SAML login fails on one of three identity providers, the one most large prospects use, because signed assertions arrive with clock skew. The fix is small; testing it and Ruth's review make Monday the 2nd the earliest sign-off, which leaves one day of slack. Six of the nine enterprise deals need SSO on day one.\\n- **SOC 2 timing.** SSO is in scope for the audit, the report will not exist until December, and Kestrel has not confirmed fieldwork dates. A bridge letter would cover most buyers, but only once fieldwork starts.\\n- **Enterprise pricing.** The list price ($48 a seat a month, 50-seat minimum) is holding. The pressure is on discounts: three deals are asking for 40% off, Greywater among them at 300 seats.\\n- **Migration and beta risk.** The permissions migration took 3h20m on a copy of production (4 of 1,140 workspaces failed) but has never run against the three largest workspaces. The CSV import bug hit 14 of 212 beta accounts; whether any data was lost is still unknown.\\n\\n## Decisions Made\\n- Hold Tuesday the 3rd, with a hard check on Monday the 2nd. If the SSO fix or its review is not done, the launch moves a week and the team hears on Monday.\\n- Ship SSO behind a per-workspace flag, switched on for the six accounts only after the security review.\\n- Discount floor: 25% standard, 30% with a two-year term. Anything deeper needs Maya, finance and a signed case study.\\n- Announce on Wednesday the 4th, the day after the analyst briefing, and keep SOC 2 out of the news release until the bridge letter exists.\\n\\n## Action Items\\n- [ ] Theo: signed-assertion fix by Thursday the 29th, with clock tolerance capped at two minutes and logged.\\n- [ ] Ruth: security review of the fix; chase Kestrel for fieldwork dates.\\n- [ ] Ines: run the migration on the three largest workspaces and report timings by Thursday; replay the 14 failed imports.\\n- [ ] Marcus: add the discount floor to the pricing doc; warn the three kickoff customers that the date could move.\\n- [ ] Grace: send Maya the gaps in the evening support schedule.\\n- [ ] Jun: new copy for the import error message.\\n\\n## Follow-ups\\n- Who covers the evening support queue that week.\\n- Whether the launch webinar on the 5th still goes ahead.\",\"enhancement_prompt\":\"Transform the provided content into clean, well-structured notes in markdown. Preserve the user's intent and all substantive information. Remove filler, small talk, false starts, and redundant content. For personal notes, improve grammar and structure for readability. For meeting transcripts, extract key discussion points, decisions, action items, and follow-ups.\",\"enhanced_at_content_hash\":\"68570-[{\\\"id\\\":\\\"seg-mv5fs6xk-1\\\",\\\"text\\\":\\\"Okay, launch readi\",\"conversation_topics\":{\"nodes\":[{\"id\":1,\"label\":\"launch date\",\"words\":[\"launch\",\"date\",\"3rd\",\"kickoff\",\"monday\",\"edge\",\"case\",\"customer\"],\"durationMs\":288155,\"utteranceIds\":[\"seg-mv5fs6xk-1\",\"seg-mv5fs6xk-2\",\"seg-mv5fs6xk-3\",\"seg-mv5fs6xk-4\",\"seg-mv5fs6xk-5\",\"seg-mv5fs6xk-6\",\"seg-mv5fs6xk-7\",\"seg-mv5fs6xk-8\",\"seg-mv5fs6xk-9\",\"seg-mv5fs6xk-10\",\"seg-mv5fs6xk-11\",\"seg-mv5fs6xk-12\",\"seg-mv5fs6xk-13\",\"seg-mv5fs6xk-14\",\"seg-mv5fs6xk-15\",\"seg-mv5fs6xk-16\",\"seg-mv5fs6xk-17\",\"seg-mv5fs6xk-18\",\"seg-mv5fs6xk-19\",\"seg-mv5fs6xk-20\",\"seg-mv5fs6xk-77\",\"seg-mv5fs6xk-78\",\"seg-mv5fs6xk-79\",\"seg-mv5fs6xk-80\",\"seg-mv5fs6xk-81\",\"seg-mv5fs6xk-82\",\"seg-mv5fs6xk-83\",\"seg-mv5fs6xk-84\",\"seg-mv5fs6xk-85\",\"seg-mv5fs6xk-213\",\"seg-mv5fs6xk-214\",\"seg-mv5fs6xk-215\",\"seg-mv5fs6xk-216\",\"seg-mv5fs6xk-217\",\"seg-mv5fs6xk-218\",\"seg-mv5fs6xk-219\",\"seg-mv5fs6xk-220\",\"seg-mv5fs6xk-221\",\"seg-mv5fs6xk-222\",\"seg-mv5fs6xk-223\",\"seg-mv5fs6xk-224\"],\"firstAt\":1791820803534,\"lastAt\":1791822544072,\"returns\":2,\"state\":\"resolved\"},{\"id\":2,\"label\":\"SSO\",\"words\":[\"sso\",\"identity\",\"provider\",\"saml\",\"login\",\"clock\",\"tolerance\",\"fix\"],\"durationMs\":256878,\"utteranceIds\":[\"seg-mv5fs6xk-21\",\"seg-mv5fs6xk-22\",\"seg-mv5fs6xk-23\",\"seg-mv5fs6xk-24\",\"seg-mv5fs6xk-25\",\"seg-mv5fs6xk-26\",\"seg-mv5fs6xk-27\",\"seg-mv5fs6xk-28\",\"seg-mv5fs6xk-29\",\"seg-mv5fs6xk-30\",\"seg-mv5fs6xk-31\",\"seg-mv5fs6xk-32\",\"seg-mv5fs6xk-33\",\"seg-mv5fs6xk-34\",\"seg-mv5fs6xk-35\",\"seg-mv5fs6xk-36\",\"seg-mv5fs6xk-37\",\"seg-mv5fs6xk-38\",\"seg-mv5fs6xk-39\",\"seg-mv5fs6xk-40\",\"seg-mv5fs6xk-41\",\"seg-mv5fs6xk-42\",\"seg-mv5fs6xk-43\",\"seg-mv5fs6xk-44\",\"seg-mv5fs6xk-45\",\"seg-mv5fs6xk-46\",\"seg-mv5fs6xk-47\",\"seg-mv5fs6xk-48\",\"seg-mv5fs6xk-49\",\"seg-mv5fs6xk-50\",\"seg-mv5fs6xk-51\"],\"firstAt\":1791820973690,\"lastAt\":1791821230568,\"returns\":0,\"state\":\"dropped\"},{\"id\":3,\"label\":\"SOC\",\"words\":[\"soc\",\"audit\",\"bridge\",\"letter\",\"report\",\"firm\",\"corbel\",\"fieldwork\"],\"durationMs\":180566,\"utteranceIds\":[\"seg-mv5fs6xk-52\",\"seg-mv5fs6xk-53\",\"seg-mv5fs6xk-54\",\"seg-mv5fs6xk-55\",\"seg-mv5fs6xk-56\",\"seg-mv5fs6xk-57\",\"seg-mv5fs6xk-58\",\"seg-mv5fs6xk-59\",\"seg-mv5fs6xk-60\",\"seg-mv5fs6xk-61\",\"seg-mv5fs6xk-62\",\"seg-mv5fs6xk-63\",\"seg-mv5fs6xk-64\",\"seg-mv5fs6xk-65\",\"seg-mv5fs6xk-66\",\"seg-mv5fs6xk-67\",\"seg-mv5fs6xk-68\",\"seg-mv5fs6xk-69\",\"seg-mv5fs6xk-70\",\"seg-mv5fs6xk-71\",\"seg-mv5fs6xk-72\",\"seg-mv5fs6xk-73\",\"seg-mv5fs6xk-74\",\"seg-mv5fs6xk-75\",\"seg-mv5fs6xk-76\"],\"firstAt\":1791821241435,\"lastAt\":1791821422001,\"returns\":0,\"state\":\"dropped\"},{\"id\":4,\"label\":\"discount\",\"words\":[\"discount\",\"pricing\",\"list\",\"price\",\"forty\",\"percent\",\"seat\",\"enterprise\"],\"durationMs\":254733,\"utteranceIds\":[\"seg-mv5fs6xk-86\",\"seg-mv5fs6xk-87\",\"seg-mv5fs6xk-88\",\"seg-mv5fs6xk-89\",\"seg-mv5fs6xk-90\",\"seg-mv5fs6xk-91\",\"seg-mv5fs6xk-92\",\"seg-mv5fs6xk-93\",\"seg-mv5fs6xk-94\",\"seg-mv5fs6xk-95\",\"seg-mv5fs6xk-96\",\"seg-mv5fs6xk-97\",\"seg-mv5fs6xk-98\",\"seg-mv5fs6xk-99\",\"seg-mv5fs6xk-100\",\"seg-mv5fs6xk-101\",\"seg-mv5fs6xk-102\",\"seg-mv5fs6xk-103\",\"seg-mv5fs6xk-104\",\"seg-mv5fs6xk-105\",\"seg-mv5fs6xk-106\",\"seg-mv5fs6xk-107\",\"seg-mv5fs6xk-108\",\"seg-mv5fs6xk-109\",\"seg-mv5fs6xk-110\",\"seg-mv5fs6xk-111\",\"seg-mv5fs6xk-112\",\"seg-mv5fs6xk-113\",\"seg-mv5fs6xk-114\",\"seg-mv5fs6xk-115\",\"seg-mv5fs6xk-116\",\"seg-mv5fs6xk-117\",\"seg-mv5fs6xk-118\",\"seg-mv5fs6xk-119\",\"seg-mv5fs6xk-120\",\"seg-mv5fs6xk-121\",\"seg-mv5fs6xk-122\"],\"firstAt\":1791821482103,\"lastAt\":1791821736836,\"returns\":0,\"state\":\"resolved\"},{\"id\":5,\"label\":\"data migration\",\"words\":[\"data\",\"migration\",\"workspace\",\"flag\",\"sso\",\"twice\",\"biggest\",\"set\"],\"durationMs\":244415,\"utteranceIds\":[\"seg-mv5fs6xk-123\",\"seg-mv5fs6xk-124\",\"seg-mv5fs6xk-125\",\"seg-mv5fs6xk-126\",\"seg-mv5fs6xk-127\",\"seg-mv5fs6xk-128\",\"seg-mv5fs6xk-129\",\"seg-mv5fs6xk-130\",\"seg-mv5fs6xk-131\",\"seg-mv5fs6xk-132\",\"seg-mv5fs6xk-133\",\"seg-mv5fs6xk-134\",\"seg-mv5fs6xk-135\",\"seg-mv5fs6xk-136\",\"seg-mv5fs6xk-137\",\"seg-mv5fs6xk-138\",\"seg-mv5fs6xk-139\",\"seg-mv5fs6xk-140\",\"seg-mv5fs6xk-141\",\"seg-mv5fs6xk-142\",\"seg-mv5fs6xk-143\",\"seg-mv5fs6xk-144\",\"seg-mv5fs6xk-145\",\"seg-mv5fs6xk-146\",\"seg-mv5fs6xk-147\",\"seg-mv5fs6xk-148\",\"seg-mv5fs6xk-149\",\"seg-mv5fs6xk-150\",\"seg-mv5fs6xk-151\",\"seg-mv5fs6xk-152\",\"seg-mv5fs6xk-153\",\"seg-mv5fs6xk-154\"],\"firstAt\":1791821747822,\"lastAt\":1791821992237,\"returns\":0,\"state\":\"resolved\"},{\"id\":6,\"label\":\"support queue\",\"words\":[\"support\",\"queue\",\"agent\",\"macro\",\"evening\",\"cover\",\"priority\",\"lane\"],\"durationMs\":183555,\"utteranceIds\":[\"seg-mv5fs6xk-155\",\"seg-mv5fs6xk-156\",\"seg-mv5fs6xk-157\",\"seg-mv5fs6xk-158\",\"seg-mv5fs6xk-159\",\"seg-mv5fs6xk-160\",\"seg-mv5fs6xk-161\",\"seg-mv5fs6xk-162\",\"seg-mv5fs6xk-163\",\"seg-mv5fs6xk-164\",\"seg-mv5fs6xk-165\",\"seg-mv5fs6xk-166\",\"seg-mv5fs6xk-167\",\"seg-mv5fs6xk-168\",\"seg-mv5fs6xk-169\",\"seg-mv5fs6xk-170\",\"seg-mv5fs6xk-171\",\"seg-mv5fs6xk-172\",\"seg-mv5fs6xk-173\",\"seg-mv5fs6xk-174\",\"seg-mv5fs6xk-175\",\"seg-mv5fs6xk-176\",\"seg-mv5fs6xk-177\",\"seg-mv5fs6xk-178\"],\"firstAt\":1791822000155,\"lastAt\":1791822183710,\"returns\":0,\"state\":\"resolved\"},{\"id\":7,\"label\":\"import bug\",\"words\":[\"import\",\"bug\",\"csv\",\"file\",\"error\",\"beta\",\"account\",\"row\"],\"durationMs\":162069,\"utteranceIds\":[\"seg-mv5fs6xk-179\",\"seg-mv5fs6xk-180\",\"seg-mv5fs6xk-181\",\"seg-mv5fs6xk-182\",\"seg-mv5fs6xk-183\",\"seg-mv5fs6xk-184\",\"seg-mv5fs6xk-185\",\"seg-mv5fs6xk-186\",\"seg-mv5fs6xk-187\",\"seg-mv5fs6xk-188\",\"seg-mv5fs6xk-189\",\"seg-mv5fs6xk-190\",\"seg-mv5fs6xk-191\",\"seg-mv5fs6xk-192\",\"seg-mv5fs6xk-193\",\"seg-mv5fs6xk-194\",\"seg-mv5fs6xk-195\",\"seg-mv5fs6xk-196\",\"seg-mv5fs6xk-197\"],\"firstAt\":1791822187833,\"lastAt\":1791822349902,\"returns\":0,\"state\":\"resolved\"},{\"id\":8,\"label\":\"news embargo\",\"words\":[\"news\",\"embargo\",\"wednesday\",\"trade\",\"outlet\",\"release\",\"customer\",\"announcement\"],\"durationMs\":102809,\"utteranceIds\":[\"seg-mv5fs6xk-198\",\"seg-mv5fs6xk-199\",\"seg-mv5fs6xk-200\",\"seg-mv5fs6xk-201\",\"seg-mv5fs6xk-202\",\"seg-mv5fs6xk-203\",\"seg-mv5fs6xk-204\",\"seg-mv5fs6xk-205\",\"seg-mv5fs6xk-206\",\"seg-mv5fs6xk-207\",\"seg-mv5fs6xk-208\",\"seg-mv5fs6xk-209\",\"seg-mv5fs6xk-210\",\"seg-mv5fs6xk-211\",\"seg-mv5fs6xk-212\"],\"firstAt\":1791822358847,\"lastAt\":1791822461656,\"returns\":0,\"state\":\"open\"}],\"edges\":[{\"from\":1,\"to\":2,\"weight\":1,\"kind\":\"new\"},{\"from\":2,\"to\":3,\"weight\":1,\"kind\":\"new\"},{\"from\":3,\"to\":1,\"weight\":1,\"kind\":\"return\"},{\"from\":1,\"to\":4,\"weight\":1,\"kind\":\"new\"},{\"from\":4,\"to\":5,\"weight\":1,\"kind\":\"new\"},{\"from\":5,\"to\":6,\"weight\":1,\"kind\":\"new\"},{\"from\":6,\"to\":7,\"weight\":1,\"kind\":\"new\"},{\"from\":7,\"to\":8,\"weight\":1,\"kind\":\"new\"},{\"from\":8,\"to\":1,\"weight\":1,\"kind\":\"return\"}]},\"conversation_marks\":[{\"id\":\"m-1791821024677\",\"at\":1791821024677,\"note\":\"\"},{\"id\":\"m-1791821764386\",\"at\":1791821764386,\"note\":\"SSO behind a per-workspace flag, on for the six accounts only\"},{\"id\":\"m-1791822537597\",\"at\":1791822537597,\"note\":\"Hold the 3rd; hard check Monday the 2nd\"}],\"conversation_loudness\":{\"v\":1,\"runs\":[{\"at\":1791820800000,\"b\":\"goWFnKewr6+vrquvoquurausrK+traypma2srq20r7GvqYiqr6ytra6cpa2xp5eWkaipq66slK2srq6usaqol6uusa6qrK2uq6mmsrGuq62snK+vq7Gvrauolamur6+piqWsr6yMqq2sqayvo6avsK6uqrGysaeTrLOxsa+uqoupr62rqZmMpaynqa2sr6uqq6ylpLKysK2srKmsp5+uqqKYlpypq6OCqK6uq6KVsK2trqmRm5utra2tr6yRqK2xrq2vmKysrKuspouprKuroqurrZSrr7KwroqnrqiqjKesr66uq6ygpamtrKuqr6yqoa2oqKmsqqqprKyVrKetra6rsKqqrYutr6+urrGro5uqqqytr7GwrqyfoZSWl5+sqamhnqammqapp6elp6inp6eOpqyTp6imp6epmqSjpJOcpZmYn62rq6uqqZiMnKearaywq6uprKicm6uqq5inrKuro6Wrqqmqra2fqayrrKypqqmeqqmmq66tq6mtoK2vqqurqJ+orK+vsKycqqacq6qsr6+rrJ+rsa2ol4ShqqirqaWZqpWitLKfiJytnZurqq2qraelpq2aobCusKqIq7OypKqypZmtrKaWpayvqayvrq2pp5enrK2sraqqr5aqr6iprK2tqaqoq6qZsLCyrZ2uqZqoqKeYp6uWr62spZWpqq2tqq+vraipkJeaqq6mh6aMqLOzubSutrKZsLS0r7CupoSoqqawp6apq66qqqmslpirqrKwsKqkhayqqJWrrKmqmqmvrKansrGysY+iqKipqa2rjKOvsrKura+kpKqsraqopaWYqauqrK2rm66xsrKzo5asraeqrKijh6OtsK2nhqirrKSGt7qvsrSXuba6ubi4vbzDwsC4tbC7upzBwru6vrWPr7iziKWtrq+ghKupo6uqrYyrq66wrK6urqmOo6Kqlq2srKirlK+qoK2vq6ussK2mq66vrayqr6+yraavr6+pr6+yqZ6xra6Nra6xs62Wsbm2srCyvLi3urqVrre2tbi5uK+qub+7u76pubm8r6CfqLO5uLa1o7m5urS1t7Ksn6qoqaikpaSSpK+xlK6yr6mlrIyrrrCxq66goK6wr6ufrrGzsqqHra6xr6uprLCur6OKsK6tsayFqq6trqmtrrOwq6qKs7Cpm6uurqWosKuxr6moq6iksK6ysKassq6vsrGzsqipsbGqraywq6qeo6ippaimlq+zsayHrKyqrKyrh6qrm6+usLKxrq6urKiPq66xrK6OsLGwo6GvraWeqK2bp7Cvsa6mmKuorK+qqa2qqqqoq6akr6yrqqeJqaysramsqqypqaiTn62ppJOoqY+kpqqqr5ijrKqmq62WpqqqrKerr6uko5+qrKuwq6ajqauqqqysqqqjj6yqrKyurqaIoKqsq6eKoq2rmKarrK+uq6isnaOqrayaq6mqqqKPrK+vrZKWqaidq62pmJieqKeqlaytrKyqpJycrKmsq6qsrqmMp6CrrKiqra2nqpmir6+urK2rr7Cen6qqmpaZpKyjqq2tr7Gvra+uqY6qrauqqaysoaSqqK2vrKWlrKytq6yvn6Ksra+rq6yUpq2vrqipqqmgq6mpqKiusI2hq6msiaeuqqyura2sr6Corayvrqmpo6arqqquqrCrq6msoqurrq2rrKmqqaSoqqyqmaivq5KkoKytq5unqqmspqmrrJWnpp+rqJqkqqusra2urqylrayrqKqtrZqtrKytrq6wp4uora6uqqupqqasqKWqqamqqKyho66vsK+ohKeprKiuq66tqKuJnKqrrautr6ufhKutrq2pq5isrKuxraqrrqyqmbCtq46opKepqKSepqeopKWYkZmnr6yspIWgpqinm6iqp6iopKaopZalqZ6lqa6qqq2rq6yqqZqrrquqqKqphqetra6qopKlpJqpqKejqqmclKqoqqysq6qfmqyqq66rqYqqsa6urautq6uvraqOrKyrrayuq6aGpKalpqelo4WrqqmrqK6sr6+rh6eoq6ysq6epiIyjrKaqrquil5OQsbGuq66vq4Sora2trK2vq5quqaupiqCvsK6roJWiq6qvo5ilm6euq6yrqK+vm6msrJSdq66unJujmaStrqusoayvqq6urYeosK2jjautrauojqWrrrCvq62lpaqqoaivsKCwr7SxrquOqquuqrCvlJirsK2trKWVra+sqqyvrJusr6+wsJyeqK+opK+rrbKvr6yqra6kk6msqourq6+qqLGxrYuirqujp7OurK6ur62unJ6ysrSyj6qnjKmvqaqrnaqurKKorrCwnqywsrKssZCGiA==\"}]},\"open_questions\":6}"),
	events: [
		{
			id: 1,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-11"],
			text: "Is Tuesday the 3rd the date I should plan around?",
			metadata: {
				state: "answered",
				groupKey: "3rd around date plan tuesday",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791820896842
		},
		{
			id: 2,
			kind: "response",
			parentEventId: 1,
			segmentIds: ["seg-mv5fs6xk-12"],
			text: "For now, yes. We lock it on Friday.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791820902119
		},
		{
			id: 3,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-58"],
			text: "Do we have a date from the auditors yet?",
			metadata: {
				state: "denied",
				groupKey: "auditor date yet",
				occurrence: 1,
				confidence: .85,
				source: "local"
			},
			createdAt: 1791821296887
		},
		{
			id: 4,
			kind: "response",
			parentEventId: 3,
			segmentIds: ["seg-mv5fs6xk-59"],
			text: "I don't know yet.",
			metadata: {
				reason: "denied",
				trigger: "next_utterance",
				outcome: "denied",
				source: "local"
			},
			createdAt: 1791821299992
		},
		{
			id: 5,
			kind: "search_suggestion",
			parentEventId: 3,
			segmentIds: ["seg-mv5fs6xk-58"],
			text: "Do we have a date from the auditors yet?",
			metadata: {
				query: "Do we have a date from the auditors yet?",
				confidence: .85,
				reason: "denied",
				state: "shown",
				source: "local",
				auto: !1
			},
			createdAt: 1791821299992
		},
		{
			id: 6,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-63"],
			text: "Can we mention SOC 2 in the announcement?",
			metadata: {
				state: "silence",
				groupKey: "2 announcement mention soc",
				occurrence: 1,
				confidence: .8,
				source: "local"
			},
			createdAt: 1791821328498
		},
		{
			id: 7,
			kind: "response",
			parentEventId: 6,
			segmentIds: ["seg-mv5fs6xk-64"],
			text: "Hmm.",
			metadata: {
				reason: "silence",
				trigger: "next_utterance",
				outcome: "silence",
				source: "local"
			},
			createdAt: 1791821330693
		},
		{
			id: 8,
			kind: "search_suggestion",
			parentEventId: 6,
			segmentIds: ["seg-mv5fs6xk-63"],
			text: "Can we mention SOC 2 in the announcement?",
			metadata: {
				query: "Can we mention SOC 2 in the announcement?",
				confidence: .8,
				reason: "silence",
				state: "shown",
				source: "local",
				auto: !1
			},
			createdAt: 1791821330693
		},
		{
			id: 9,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-78"],
			text: "So does any of this move the launch date?",
			metadata: {
				state: "answered",
				groupKey: "date launch move",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791821442491
		},
		{
			id: 10,
			kind: "response",
			parentEventId: 9,
			segmentIds: ["seg-mv5fs6xk-79"],
			text: "Honestly, I'd push it a week.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791821447356
		},
		{
			id: 11,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-104"],
			text: "Sorry, are these discounts on the seat price or on the whole contract?",
			metadata: {
				state: "answered",
				groupKey: "contract discount price seat sorry whole",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791821613274
		},
		{
			id: 12,
			kind: "response",
			parentEventId: 11,
			segmentIds: ["seg-mv5fs6xk-105"],
			text: "On the seat price only.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791821616759
		},
		{
			id: 13,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-107"],
			text: "What's the floor on the discount?",
			metadata: {
				state: "answered",
				groupKey: "discount floor what'",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791821631354
		},
		{
			id: 14,
			kind: "response",
			parentEventId: 13,
			segmentIds: ["seg-mv5fs6xk-108"],
			text: "Twenty-five percent standard, thirty with a two-year term.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791821636531
		},
		{
			id: 15,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-120"],
			text: "How many of the enterprise deals in the pipeline need SSO?",
			metadata: {
				state: "answered",
				groupKey: "deal enterprise many need pipeline sso",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791821733719
		},
		{
			id: 16,
			kind: "response",
			parentEventId: 15,
			segmentIds: ["seg-mv5fs6xk-121"],
			text: "Six of the nine.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791821736943
		},
		{
			id: 17,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-124"],
			text: "Can we ship SSO behind a flag?",
			metadata: {
				state: "answered",
				groupKey: "behind flag ship sso",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791821758197
		},
		{
			id: 18,
			kind: "response",
			parentEventId: 17,
			segmentIds: ["seg-mv5fs6xk-125"],
			text: "Yes, with a per-workspace flag.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791821762368
		},
		{
			id: 19,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-138"],
			text: "What's the rollback if the migration fails halfway?",
			metadata: {
				state: "answered",
				groupKey: "fail halfway migration rollback what'",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791821867794
		},
		{
			id: 20,
			kind: "response",
			parentEventId: 19,
			segmentIds: ["seg-mv5fs6xk-139"],
			text: "Every workspace gets its own snapshot.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791821872211
		},
		{
			id: 21,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-142"],
			text: "How long does the full migration take on production?",
			metadata: {
				state: "denied",
				groupKey: "full long migration production take",
				occurrence: 1,
				confidence: .85,
				source: "local"
			},
			createdAt: 1791821897202
		},
		{
			id: 22,
			kind: "response",
			parentEventId: 21,
			segmentIds: ["seg-mv5fs6xk-143"],
			text: "Honestly, I don't know.",
			metadata: {
				reason: "denied",
				trigger: "next_utterance",
				outcome: "denied",
				source: "local"
			},
			createdAt: 1791821900576
		},
		{
			id: 23,
			kind: "search_suggestion",
			parentEventId: 21,
			segmentIds: ["seg-mv5fs6xk-142"],
			text: "How long does the full migration take on production?",
			metadata: {
				query: "How long does the full migration take on production?",
				confidence: .85,
				reason: "denied",
				state: "shown",
				source: "local",
				auto: !1
			},
			createdAt: 1791821900576
		},
		{
			id: 24,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-162"],
			text: "Who's on call for support escalations that week?",
			metadata: {
				state: "answered",
				groupKey: "call escalation support week who'",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791822067032
		},
		{
			id: 25,
			kind: "response",
			parentEventId: 24,
			segmentIds: ["seg-mv5fs6xk-163"],
			text: "Ines and me as primary.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791822070892
		},
		{
			id: 26,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-166"],
			text: "Can engineering cover the evening support queue that week?",
			metadata: {
				state: "silence",
				groupKey: "cover engineering evening queue support week",
				occurrence: 1,
				confidence: .8,
				source: "local"
			},
			createdAt: 1791822091831
		},
		{
			id: 27,
			kind: "response",
			parentEventId: 26,
			segmentIds: ["seg-mv5fs6xk-167"],
			text: "Hmm.",
			metadata: {
				reason: "silence",
				trigger: "next_utterance",
				outcome: "silence",
				source: "local"
			},
			createdAt: 1791822093092
		},
		{
			id: 28,
			kind: "search_suggestion",
			parentEventId: 26,
			segmentIds: ["seg-mv5fs6xk-166"],
			text: "Can engineering cover the evening support queue that week?",
			metadata: {
				query: "Can engineering cover the evening support queue that week?",
				confidence: .8,
				reason: "silence",
				state: "shown",
				source: "local",
				auto: !1
			},
			createdAt: 1791822093092
		},
		{
			id: 29,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-180"],
			text: "How many beta accounts hit the import bug?",
			metadata: {
				state: "answered",
				groupKey: "account beta bug hit import many",
				occurrence: 1,
				confidence: .75,
				source: "local"
			},
			createdAt: 1791822208399
		},
		{
			id: 30,
			kind: "response",
			parentEventId: 29,
			segmentIds: ["seg-mv5fs6xk-181"],
			text: "Fourteen of the 212 beta accounts.",
			metadata: {
				reason: "answered",
				trigger: "next_utterance",
				outcome: "answered",
				source: "local"
			},
			createdAt: 1791822213608
		},
		{
			id: 31,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-185"],
			text: "Did any of those beta accounts lose data for good?",
			metadata: {
				state: "denied",
				groupKey: "account beta data good lose",
				occurrence: 1,
				confidence: .85,
				source: "local"
			},
			createdAt: 1791822253498
		},
		{
			id: 32,
			kind: "response",
			parentEventId: 31,
			segmentIds: ["seg-mv5fs6xk-186"],
			text: "No idea, honestly.",
			metadata: {
				reason: "denied",
				trigger: "next_utterance",
				outcome: "denied",
				source: "local"
			},
			createdAt: 1791822256470
		},
		{
			id: 33,
			kind: "search_suggestion",
			parentEventId: 31,
			segmentIds: ["seg-mv5fs6xk-185"],
			text: "Did any of those beta accounts lose data for good?",
			metadata: {
				query: "Did any of those beta accounts lose data for good?",
				confidence: .85,
				reason: "denied",
				state: "shown",
				source: "local",
				auto: !1
			},
			createdAt: 1791822256470
		},
		{
			id: 34,
			kind: "question",
			parentEventId: null,
			segmentIds: ["seg-mv5fs6xk-224"],
			text: "Are we still doing the launch webinar on the 5th?",
			metadata: {
				state: "asked",
				groupKey: "5th doing launch still webinar",
				occurrence: 1
			},
			createdAt: 1791822550931
		}
	],
	replay: {
		voices: {
			Maya: { gain: 1.04 },
			Theo: { gain: 1 },
			Ines: { gain: .92 },
			Jun: { gain: .72 },
			Ruth: { gain: .9 },
			Marcus: { gain: 1.18 },
			Grace: { gain: .95 },
			Omar: { gain: .78 },
			Lena: { gain: 1.02 }
		},
		loud: {
			"seg-mv5fs6xk-65": 1.3,
			"seg-mv5fs6xk-80": 1.8,
			"seg-mv5fs6xk-81": 1.75,
			"seg-mv5fs6xk-82": 2.05,
			"seg-mv5fs6xk-83": 1.9,
			"seg-mv5fs6xk-84": 1.95,
			"seg-mv5fs6xk-85": 1.6,
			"seg-mv5fs6xk-98": 1.5,
			"seg-mv5fs6xk-99": 1.65,
			"seg-mv5fs6xk-100": 1.55,
			"seg-mv5fs6xk-101": 1.75,
			"seg-mv5fs6xk-102": 1.45,
			"seg-mv5fs6xk-103": 1.4
		},
		stopAtMs: 1752556
	}
};
function dt(e) {
	let t = e;
	if (typeof e == "string") {
		if (!e.trim()) return [];
		try {
			t = JSON.parse(e);
		} catch {
			return [];
		}
	}
	return Array.isArray(t) ? t.filter((e) => e && Number.isFinite(e.at)).map((e) => ({
		id: typeof e.id == "string" && e.id ? e.id : `m-${e.at}`,
		at: e.at,
		note: typeof e.note == "string" ? e.note.slice(0, 280) : ""
	})).sort((e, t) => e.at - t.at) : [];
}
function ft(e, t) {
	if (!e || !Number.isFinite(e.at) || !Array.isArray(t)) return null;
	let n = null, r = Infinity;
	for (let i of t) {
		if (!i || !Number.isFinite(i.timestamp)) continue;
		let t = Math.abs(i.timestamp - e.at);
		(t < r || t === r && i.timestamp < n.timestamp) && (n = i, r = t);
	}
	return n;
}
//#endregion
//#region src/helpers/conversationGraph.mjs
function pt(e) {
	return typeof e == "string" && e.trim() ? e.trim() : null;
}
function mt(e) {
	let t = e?.metadata?.state;
	return t === "shown" || t === "opened" || t === "dismissed" || t === "expired" ? t : null;
}
function ht(e) {
	return pt(e?.metadata?.reason);
}
function gt(e) {
	let t = Array.isArray(e) ? e : [], n = /* @__PURE__ */ new Map(), r = [];
	for (let e of t) e.kind === "question" && n.set(e.id, {
		key: `q${e.id}`,
		question: e,
		response: null,
		suggestion: null,
		createdAt: e.createdAt
	});
	for (let e of t) {
		if (e.kind === "question") continue;
		let t = e.parentEventId == null ? void 0 : n.get(e.parentEventId);
		if (t) {
			e.kind === "response" ? (!t.response || e.createdAt >= t.response.createdAt) && (t.response = e) : e.kind === "search_suggestion" && (!t.suggestion || e.createdAt >= t.suggestion.createdAt) && (t.suggestion = e), t.createdAt = Math.min(t.createdAt, e.createdAt);
			continue;
		}
		r.push({
			key: `${e.kind}${e.id}`,
			question: null,
			response: e.kind === "response" ? e : null,
			suggestion: e.kind === "search_suggestion" ? e : null,
			createdAt: e.createdAt
		});
	}
	return [...n.values(), ...r].sort((e, t) => e.createdAt === t.createdAt ? (e.question?.id ?? e.response?.id ?? e.suggestion?.id ?? 0) - (t.question?.id ?? t.response?.id ?? t.suggestion?.id ?? 0) : e.createdAt - t.createdAt);
}
//#endregion
//#region src/helpers/conversationReview.mjs
function _t(e) {
	let t = ht(e.response);
	return t === "answered" ? "answered" : t === "uncertain_response" ? "uncertain" : t === "silence" ? "silence" : t === "denied" || t === "denied_knowledge" ? "denied" : e.response ? "uncertain" : "open";
}
function vt({ events: e, topics: t } = {}) {
	let n = gt(Array.isArray(e) ? e : []), r = 0, i = 0, a = [], o = [];
	for (let e of n) {
		if (!e.question) continue;
		let t = _t(e), n = mt(e.suggestion) === "opened";
		if (n && (i += 1), t === "answered") {
			r += 1, o.push({
				key: e.key,
				question: String(e.question.text ?? "").trim(),
				reply: String(e.response?.text ?? "").trim(),
				segmentId: e.response?.segmentIds?.[0] ?? e.question.segmentIds?.[0] ?? null
			});
			continue;
		}
		a.push({
			key: e.key,
			question: String(e.question.text ?? "").trim(),
			outcome: t,
			segmentId: e.question.segmentIds?.[0] ?? null,
			searched: n,
			at: e.createdAt
		});
	}
	let s = n.filter((e) => e.question).length, c = (Array.isArray(t) ? t : []).filter((e) => e && (e.state === "open" || e.state === "dropped")).map((e) => ({
		id: e.id,
		label: String(e.label ?? "").trim()
	})).filter((e) => e.label);
	return {
		unresolved: a,
		answers: o,
		answered: r,
		asked: s,
		searched: i,
		openThreads: c,
		empty: s === 0 && c.length === 0
	};
}
function yt(e, t = []) {
	let n = /* @__PURE__ */ new Map();
	for (let e of Array.isArray(t) ? t : []) e?.id != null && Number.isFinite(e.timestamp) && n.set(String(e.id), e.timestamp);
	let r = [];
	for (let t of gt(Array.isArray(e) ? e : [])) {
		if (!t.question) continue;
		let e = (t.question.segmentIds ?? []).map(String), i = n.get(e[0]) ?? t.question.createdAt;
		Number.isFinite(i) && r.push({
			id: t.question.id,
			key: t.key,
			at: i,
			outcome: _t(t),
			segmentIds: e
		});
	}
	return r;
}
function bt(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of gt(Array.isArray(e) ? e : [])) {
		let e = n.question?.segmentIds?.[0];
		e == null || t.has(String(e)) || t.set(String(e), _t(n));
	}
	return t;
}
var xt = 45 * 6e4, St = 120, Ct = 1e3, wt = 1440 * 6e4;
function Tt(e) {
	return new Date(e).toISOString().slice(0, 19).replace("T", " ");
}
function Et(e) {
	return !!e && typeof e == "object" && !Array.isArray(e);
}
function Dt(e) {
	if (!Et(e) || e.kind !== "oats-sample-conversation") throw Error("Not a sample conversation fixture");
	if (e.version !== 1) throw Error(`Unsupported sample fixture version: ${e.version}`);
	let { meta: t, note: n, events: r } = e;
	if (!Et(t) || typeof t.id != "string" || !t.id.trim()) throw Error("Sample fixture has no id");
	if (!Number.isFinite(t.startedAt) || !Number.isFinite(t.endedAt)) throw Error(`Sample fixture ${t.id} has no times`);
	if (!Et(n) || !Array.isArray(n.transcript) || !n.transcript.length) throw Error(`Sample fixture ${t.id} has no transcript`);
	if (!Array.isArray(r)) throw Error(`Sample fixture ${t.id} has no events`);
}
function Ot(e, { now: t = Date.now() } = {}) {
	let { meta: n } = e, r = n.endedAt - n.startedAt, i = Et(n.placement) ? n.placement : {}, a, o = /^(\d{1,2}):(\d{2})$/.exec(String(i.at ?? ""));
	if (Number.isFinite(i.daysAgo) && o) {
		let e = /* @__PURE__ */ new Date(t - i.daysAgo * wt);
		for (e.setHours(Number(o[1]), Number(o[2]), 0, 0); i.weekdays && (e.getDay() === 0 || e.getDay() === 6);) e.setDate(e.getDate() - 1);
		a = e.getTime();
	} else {
		let e = Number.isFinite(i.endedAgoMinutes) ? i.endedAgoMinutes * 6e4 : St * 6e4;
		a = t - Math.max(e, xt) - r;
	}
	let s = t - xt - r;
	return Math.floor(Math.min(a, s) / Ct) * Ct;
}
function kt(e, { now: t = Date.now() } = {}) {
	Dt(e);
	let { meta: n, note: r } = e, i = Ot(e, { now: t }), a = i - n.startedAt, o = (e) => Number.isFinite(e) ? e + a : e, s = r.transcript.map((e) => ({
		...e,
		timestamp: o(e.timestamp)
	})), c = Et(r.conversation_topics) ? {
		...r.conversation_topics,
		nodes: (r.conversation_topics.nodes ?? []).map((e) => ({
			...e,
			firstAt: o(e.firstAt),
			lastAt: o(e.lastAt)
		}))
	} : null, l = Array.isArray(r.conversation_marks) ? r.conversation_marks.map((e) => ({
		...e,
		id: e.id === `m-${e.at}` ? `m-${o(e.at)}` : e.id,
		at: o(e.at)
	})) : null, u = Et(r.conversation_loudness) ? {
		...r.conversation_loudness,
		runs: (r.conversation_loudness.runs ?? []).map((e) => ({
			...e,
			at: o(e.at)
		}))
	} : null, d = Number.isFinite(n.summarizedAt) ? n.summarizedAt : n.endedAt;
	return {
		sampleId: n.id,
		startedAt: i,
		endedAt: o(n.endedAt),
		group: typeof n.group == "string" && n.group.trim() ? n.group.trim() : null,
		note: {
			title: String(r.title ?? ""),
			content: String(r.content ?? ""),
			note_type: "meeting",
			transcript: JSON.stringify(s),
			enhanced_content: r.enhanced_content ?? null,
			enhancement_prompt: r.enhancement_prompt ?? null,
			enhanced_at_content_hash: r.enhanced_at_content_hash ?? null,
			conversation_topics: c ? JSON.stringify(c) : null,
			conversation_marks: l && l.length ? JSON.stringify(l) : null,
			conversation_loudness: u ? JSON.stringify(u) : null,
			open_questions: Number.isInteger(r.open_questions) ? r.open_questions : null,
			created_at: Tt(i),
			updated_at: Tt(o(d))
		},
		events: e.events.map((e) => ({
			id: e.id,
			kind: e.kind,
			parentEventId: e.parentEventId ?? null,
			segmentIds: Array.isArray(e.segmentIds) ? e.segmentIds.map(String) : [],
			text: String(e.text ?? ""),
			metadata: Et(e.metadata) ? e.metadata : {},
			createdAt: o(e.createdAt)
		}))
	};
}
//#endregion
//#region src/helpers/oatsTour.mjs
function At(e) {
	if (typeof e != "string" || !e.trim()) return null;
	try {
		let t = JSON.parse(e);
		return !t || !Array.isArray(t.nodes) || !Array.isArray(t.edges) ? null : {
			...t,
			nodes: t.nodes.map((e) => e?.state === "live" ? {
				...e,
				state: "open"
			} : e)
		};
	} catch {
		return null;
	}
}
function jt(e, { now: t = Date.now() } = {}) {
	let n = kt(e, { now: t }), r = At(n.note.conversation_topics), i = [];
	try {
		let e = JSON.parse(String(n.note.transcript ?? "[]"));
		Array.isArray(e) && (i = e);
	} catch {
		i = [];
	}
	return {
		title: String(n.note.title ?? ""),
		startedAt: n.startedAt,
		segments: i,
		snapshot: r,
		topics: r?.nodes ?? [],
		moments: dt(n.note.conversation_marks),
		loudness: typeof n.note.conversation_loudness == "string" ? n.note.conversation_loudness : null,
		events: n.events.map((e) => ({
			...e,
			noteId: 0
		})).sort((e, t) => e.createdAt - t.createdAt || e.id - t.id)
	};
}
var Mt = [
	0,
	600,
	2200
], Nt = Mt.length - 1;
function Pt(e) {
	for (let t = 2; t < e.length; t += 1) if (e[t].outcome === "denied" && e[t - 1].outcome === "answered" && e[t - 2].outcome === "answered") return e.slice(t - 2, t + 1);
	return e.slice(-3);
}
function Ft(e, { now: t, step: n = Nt }) {
	let r = new Map(e.events.filter((e) => e.kind === "question").map((e) => [e.id, e])), i = Pt(yt(e.events, e.segments));
	if (!i.length) return [];
	let a = i[i.length - 1].at;
	return (n >= 1 ? i : i.slice(0, -1)).map((e, o) => {
		let s = r.get(e.id), c = o !== i.length - 1 || n >= Nt, l = e.outcome === "open" ? "asked" : e.outcome;
		return {
			id: `tour-${e.key}`,
			question: String(s?.text ?? "").trim(),
			state: c ? l : "asked",
			groupKey: String(s?.metadata?.groupKey ?? e.key),
			occurrence: Number(s?.metadata?.occurrence) || 1,
			searched: !1,
			suggestionId: null,
			createdAt: t - Math.max(0, a - e.at)
		};
	});
}
//#endregion
//#region ../summaries/node_modules/clsx/dist/clsx.mjs
function It(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") if (Array.isArray(e)) {
		var i = e.length;
		for (t = 0; t < i; t++) e[t] && (n = It(e[t])) && (r && (r += " "), r += n);
	} else for (n in e) e[n] && (r && (r += " "), r += n);
	return r;
}
function Lt() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = It(e)) && (r && (r += " "), r += t);
	return r;
}
//#endregion
//#region ../summaries/node_modules/class-variance-authority/dist/index.mjs
var Rt = (e) => typeof e == "boolean" ? `${e}` : e === 0 ? "0" : e, zt = Lt, Bt = (e, t) => (n) => {
	if (t?.variants == null) return zt(e, n?.class, n?.className);
	let { variants: r, defaultVariants: i } = t, a = Object.keys(r).map((e) => {
		let t = n?.[e], a = i?.[e];
		if (t === null) return null;
		let o = Rt(t) || Rt(a);
		return r[e][o];
	}), o = n && Object.entries(n).reduce((e, t) => {
		let [n, r] = t;
		return r === void 0 || (e[n] = r), e;
	}, {});
	return zt(e, a, t?.compoundVariants?.reduce((e, t) => {
		let { class: n, className: r, ...a } = t;
		return Object.entries(a).every((e) => {
			let [t, n] = e;
			return Array.isArray(n) ? n.includes({
				...i,
				...o
			}[t]) : {
				...i,
				...o
			}[t] === n;
		}) ? [
			...e,
			n,
			r
		] : e;
	}, []), n?.class, n?.className);
}, Vt = (e, t) => {
	let n = Array(e.length + t.length);
	for (let t = 0; t < e.length; t++) n[t] = e[t];
	for (let r = 0; r < t.length; r++) n[e.length + r] = t[r];
	return n;
}, Ht = (e, t) => ({
	classGroupId: e,
	validator: t
}), Ut = (e = /* @__PURE__ */ new Map(), t = null, n) => ({
	nextPart: e,
	validators: t,
	classGroupId: n
}), Wt = "-", Gt = [], Kt = "arbitrary..", qt = (e) => {
	let t = Xt(e), { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e;
	return {
		getClassGroupId: (e) => {
			if (e.startsWith("[") && e.endsWith("]")) return Yt(e);
			let n = e.split(Wt);
			return Jt(n, +(n[0] === "" && n.length > 1), t);
		},
		getConflictingClassGroupIds: (e, t) => {
			if (t) {
				let t = r[e], i = n[e];
				return t ? i ? Vt(i, t) : t : i || Gt;
			}
			return n[e] || Gt;
		}
	};
}, Jt = (e, t, n) => {
	if (e.length - t === 0) return n.classGroupId;
	let r = e[t], i = n.nextPart.get(r);
	if (i) {
		let n = Jt(e, t + 1, i);
		if (n) return n;
	}
	let a = n.validators;
	if (a === null) return;
	let o = t === 0 ? e.join(Wt) : e.slice(t).join(Wt), s = a.length;
	for (let e = 0; e < s; e++) {
		let t = a[e];
		if (t.validator(o)) return t.classGroupId;
	}
}, Yt = (e) => e.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
	let t = e.slice(1, -1), n = t.indexOf(":"), r = t.slice(0, n);
	return r ? Kt + r : void 0;
})(), Xt = (e) => {
	let { theme: t, classGroups: n } = e;
	return Zt(n, t);
}, Zt = (e, t) => {
	let n = Ut();
	for (let r in e) {
		let i = e[r];
		Qt(i, n, r, t);
	}
	return n;
}, Qt = (e, t, n, r) => {
	let i = e.length;
	for (let a = 0; a < i; a++) {
		let i = e[a];
		$t(i, t, n, r);
	}
}, $t = (e, t, n, r) => {
	if (typeof e == "string") {
		en(e, t, n);
		return;
	}
	if (typeof e == "function") {
		tn(e, t, n, r);
		return;
	}
	nn(e, t, n, r);
}, en = (e, t, n) => {
	let r = e === "" ? t : rn(t, e);
	r.classGroupId = n;
}, tn = (e, t, n, r) => {
	if (an(e)) {
		Qt(e(r), t, n, r);
		return;
	}
	t.validators === null && (t.validators = []), t.validators.push(Ht(n, e));
}, nn = (e, t, n, r) => {
	let i = Object.entries(e), a = i.length;
	for (let e = 0; e < a; e++) {
		let [a, o] = i[e];
		Qt(o, rn(t, a), n, r);
	}
}, rn = (e, t) => {
	let n = e, r = t.split(Wt), i = r.length;
	for (let e = 0; e < i; e++) {
		let t = r[e], i = n.nextPart.get(t);
		i || (i = Ut(), n.nextPart.set(t, i)), n = i;
	}
	return n;
}, an = (e) => "isThemeGetter" in e && e.isThemeGetter === !0, on = (e) => {
	if (e < 1) return {
		get: () => void 0,
		set: () => {}
	};
	let t = 0, n = Object.create(null), r = Object.create(null), i = (i, a) => {
		n[i] = a, t++, t > e && (t = 0, r = n, n = Object.create(null));
	};
	return {
		get(e) {
			let t = n[e];
			if (t !== void 0) return t;
			if ((t = r[e]) !== void 0) return i(e, t), t;
		},
		set(e, t) {
			e in n ? n[e] = t : i(e, t);
		}
	};
}, sn = "!", cn = ":", ln = [], un = (e, t, n, r, i) => ({
	modifiers: e,
	hasImportantModifier: t,
	baseClassName: n,
	maybePostfixModifierPosition: r,
	isExternal: i
}), dn = (e) => {
	let { prefix: t, experimentalParseClassName: n } = e, r = (e) => {
		let t = [], n = 0, r = 0, i = 0, a, o = e.length;
		for (let s = 0; s < o; s++) {
			let o = e[s];
			if (n === 0 && r === 0) {
				if (o === cn) {
					t.push(e.slice(i, s)), i = s + 1;
					continue;
				}
				if (o === "/") {
					a = s;
					continue;
				}
			}
			o === "[" ? n++ : o === "]" ? n-- : o === "(" ? r++ : o === ")" && r--;
		}
		let s = t.length === 0 ? e : e.slice(i), c = s, l = !1;
		s.endsWith(sn) ? (c = s.slice(0, -1), l = !0) : s.startsWith(sn) && (c = s.slice(1), l = !0);
		let u = a && a > i ? a - i : void 0;
		return un(t, l, c, u);
	};
	if (t) {
		let e = t + cn, n = r;
		r = (t) => t.startsWith(e) ? n(t.slice(e.length)) : un(ln, !1, t, void 0, !0);
	}
	if (n) {
		let e = r;
		r = (t) => n({
			className: t,
			parseClassName: e
		});
	}
	return r;
}, fn = (e) => {
	let t = /* @__PURE__ */ new Map();
	return e.orderSensitiveModifiers.forEach((e, n) => {
		t.set(e, 1e6 + n);
	}), (e) => {
		let n = [], r = [];
		for (let i = 0; i < e.length; i++) {
			let a = e[i], o = a[0] === "[", s = t.has(a);
			o || s ? (r.length > 0 && (r.sort(), n.push(...r), r = []), n.push(a)) : r.push(a);
		}
		return r.length > 0 && (r.sort(), n.push(...r)), n;
	};
}, pn = (e) => ({
	cache: on(e.cacheSize),
	parseClassName: dn(e),
	sortModifiers: fn(e),
	postfixLookupClassGroupIds: mn(e),
	...qt(e)
}), mn = (e) => {
	let t = Object.create(null), n = e.postfixLookupClassGroups;
	if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0;
	return t;
}, hn = /\s+/, gn = (e, t) => {
	let { parseClassName: n, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: a, postfixLookupClassGroupIds: o } = t, s = [], c = e.trim().split(hn), l = "";
	for (let e = c.length - 1; e >= 0; --e) {
		let t = c[e], { isExternal: u, modifiers: d, hasImportantModifier: f, baseClassName: p, maybePostfixModifierPosition: m } = n(t);
		if (u) {
			l = t + (l.length > 0 ? " " + l : l);
			continue;
		}
		let h = !!m, g;
		if (h) {
			g = r(p.substring(0, m));
			let e = g && o[g] ? r(p) : void 0;
			e && e !== g && (g = e, h = !1);
		} else g = r(p);
		if (!g) {
			if (!h) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			if (g = r(p), !g) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			h = !1;
		}
		let _ = d.length === 0 ? "" : d.length === 1 ? d[0] : a(d).join(":"), v = f ? _ + sn : _, y = v + g;
		if (s.indexOf(y) > -1) continue;
		s.push(y);
		let b = i(g, h);
		for (let e = 0; e < b.length; ++e) {
			let t = b[e];
			s.push(v + t);
		}
		l = t + (l.length > 0 ? " " + l : l);
	}
	return l;
}, _n = (...e) => {
	let t = 0, n, r, i = "";
	for (; t < e.length;) (n = e[t++]) && (r = vn(n)) && (i && (i += " "), i += r);
	return i;
}, vn = (e) => {
	if (typeof e == "string") return e;
	let t, n = "";
	for (let r = 0; r < e.length; r++) e[r] && (t = vn(e[r])) && (n && (n += " "), n += t);
	return n;
}, yn = (e, ...t) => {
	let n, r, i, a, o = (o) => (n = pn(t.reduce((e, t) => t(e), e())), r = n.cache.get, i = n.cache.set, a = s, s(o)), s = (e) => {
		let t = r(e);
		if (t) return t;
		let a = gn(e, n);
		return i(e, a), a;
	};
	return a = o, (...e) => a(_n(...e));
}, bn = [], xn = (e) => {
	let t = (t) => t[e] || bn;
	return t.isThemeGetter = !0, t;
}, Sn = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Cn = /^\((?:(\w[\w-]*):)?(.+)\)$/i, wn = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, Tn = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, En = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, Dn = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, On = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, kn = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, An = (e) => wn.test(e), F = (e) => !!e && !Number.isNaN(Number(e)), jn = (e) => !!e && Number.isInteger(Number(e)), Mn = (e) => e.endsWith("%") && F(e.slice(0, -1)), Nn = (e) => Tn.test(e), Pn = () => !0, Fn = (e) => En.test(e) && !Dn.test(e), In = () => !1, Ln = (e) => On.test(e), Rn = (e) => kn.test(e), zn = (e) => !I(e) && !L(e), Bn = (e) => e.startsWith("@container") && (e[10] === "/" && e[11] !== void 0 || e[11] === "s" && e[16] !== void 0 && e.startsWith("-size/", 10) || e[11] === "n" && e[18] !== void 0 && e.startsWith("-normal/", 10)), Vn = (e) => nr(e, or, In), I = (e) => Sn.test(e), Hn = (e) => nr(e, sr, Fn), Un = (e) => nr(e, cr, F), Wn = (e) => nr(e, ur, Pn), Gn = (e) => nr(e, lr, In), Kn = (e) => nr(e, ir, In), qn = (e) => nr(e, ar, Rn), Jn = (e) => nr(e, dr, Ln), L = (e) => Cn.test(e), Yn = (e) => rr(e, sr), Xn = (e) => rr(e, lr), Zn = (e) => rr(e, ir), Qn = (e) => rr(e, or), $n = (e) => rr(e, ar), er = (e) => rr(e, dr, !0), tr = (e) => rr(e, ur, !0), nr = (e, t, n) => {
	let r = Sn.exec(e);
	return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, rr = (e, t, n = !1) => {
	let r = Cn.exec(e);
	return r ? r[1] ? t(r[1]) : n : !1;
}, ir = (e) => e === "position" || e === "percentage", ar = (e) => e === "image" || e === "url", or = (e) => e === "length" || e === "size" || e === "bg-size", sr = (e) => e === "length", cr = (e) => e === "number", lr = (e) => e === "family-name", ur = (e) => e === "number" || e === "weight", dr = (e) => e === "shadow", fr = /*#__PURE__*/ yn(() => {
	let e = xn("color"), t = xn("font"), n = xn("text"), r = xn("font-weight"), i = xn("tracking"), a = xn("leading"), o = xn("breakpoint"), s = xn("container"), c = xn("spacing"), l = xn("radius"), u = xn("shadow"), d = xn("inset-shadow"), f = xn("text-shadow"), p = xn("drop-shadow"), m = xn("blur"), h = xn("perspective"), g = xn("aspect"), _ = xn("ease"), v = xn("animate"), y = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	], b = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	], x = () => [
		...b(),
		L,
		I
	], S = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	], C = () => [
		"auto",
		"contain",
		"none"
	], w = () => [
		L,
		I,
		c
	], T = () => [
		An,
		"full",
		"auto",
		...w()
	], E = () => [
		jn,
		"none",
		"subgrid",
		L,
		I
	], ee = () => [
		"auto",
		{ span: [
			"full",
			jn,
			L,
			I
		] },
		jn,
		L,
		I
	], D = () => [
		jn,
		"auto",
		L,
		I
	], te = () => [
		"auto",
		"min",
		"max",
		"fr",
		L,
		I
	], ne = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	], re = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	], O = () => ["auto", ...w()], ie = () => [
		An,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], ae = () => [
		An,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...w()
	], oe = () => [
		An,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], k = () => [
		e,
		L,
		I
	], A = () => [
		...b(),
		Zn,
		Kn,
		{ position: [L, I] }
	], se = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }], ce = () => [
		"auto",
		"cover",
		"contain",
		Qn,
		Vn,
		{ size: [L, I] }
	], le = () => [
		Mn,
		Yn,
		Hn
	], j = () => [
		"",
		"none",
		"full",
		l,
		L,
		I
	], M = () => [
		"",
		F,
		Yn,
		Hn
	], N = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	], ue = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	], P = () => [
		F,
		Mn,
		Zn,
		Kn
	], de = () => [
		"",
		"none",
		m,
		L,
		I
	], fe = () => [
		"none",
		F,
		L,
		I
	], pe = () => [
		"none",
		F,
		L,
		I
	], me = () => [
		F,
		L,
		I
	], he = () => [
		An,
		"full",
		...w()
	];
	return {
		cacheSize: 500,
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [Nn],
			breakpoint: [Nn],
			color: [Pn],
			container: [Nn],
			"drop-shadow": [Nn],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [zn],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [Nn],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [Nn],
			shadow: [Nn],
			spacing: ["px", F],
			text: [Nn],
			"text-shadow": [Nn],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			aspect: [{ aspect: [
				"auto",
				"square",
				An,
				I,
				L,
				g
			] }],
			container: ["container"],
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				L,
				I
			] }],
			"container-named": [Bn],
			columns: [{ columns: [
				F,
				I,
				L,
				s
			] }],
			"break-after": [{ "break-after": y() }],
			"break-before": [{ "break-before": y() }],
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			box: [{ box: ["border", "content"] }],
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			sr: ["sr-only", "not-sr-only"],
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			isolation: ["isolate", "isolation-auto"],
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			"object-position": [{ object: x() }],
			overflow: [{ overflow: S() }],
			"overflow-x": [{ "overflow-x": S() }],
			"overflow-y": [{ "overflow-y": S() }],
			overscroll: [{ overscroll: C() }],
			"overscroll-x": [{ "overscroll-x": C() }],
			"overscroll-y": [{ "overscroll-y": C() }],
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			inset: [{ inset: T() }],
			"inset-x": [{ "inset-x": T() }],
			"inset-y": [{ "inset-y": T() }],
			start: [{
				"inset-s": T(),
				start: T()
			}],
			end: [{
				"inset-e": T(),
				end: T()
			}],
			"inset-bs": [{ "inset-bs": T() }],
			"inset-be": [{ "inset-be": T() }],
			top: [{ top: T() }],
			right: [{ right: T() }],
			bottom: [{ bottom: T() }],
			left: [{ left: T() }],
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			z: [{ z: [
				jn,
				"auto",
				L,
				I
			] }],
			basis: [{ basis: [
				An,
				"full",
				"auto",
				s,
				...w()
			] }],
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			flex: [{ flex: [
				F,
				An,
				"auto",
				"initial",
				"none",
				I
			] }],
			grow: [{ grow: [
				"",
				F,
				L,
				I
			] }],
			shrink: [{ shrink: [
				"",
				F,
				L,
				I
			] }],
			order: [{ order: [
				jn,
				"first",
				"last",
				"none",
				L,
				I
			] }],
			"grid-cols": [{ "grid-cols": E() }],
			"col-start-end": [{ col: ee() }],
			"col-start": [{ "col-start": D() }],
			"col-end": [{ "col-end": D() }],
			"grid-rows": [{ "grid-rows": E() }],
			"row-start-end": [{ row: ee() }],
			"row-start": [{ "row-start": D() }],
			"row-end": [{ "row-end": D() }],
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			"auto-cols": [{ "auto-cols": te() }],
			"auto-rows": [{ "auto-rows": te() }],
			gap: [{ gap: w() }],
			"gap-x": [{ "gap-x": w() }],
			"gap-y": [{ "gap-y": w() }],
			"justify-content": [{ justify: [...ne(), "normal"] }],
			"justify-items": [{ "justify-items": [...re(), "normal"] }],
			"justify-self": [{ "justify-self": ["auto", ...re()] }],
			"align-content": [{ content: ["normal", ...ne()] }],
			"align-items": [{ items: [...re(), { baseline: ["", "last"] }] }],
			"align-self": [{ self: [
				"auto",
				...re(),
				{ baseline: ["", "last"] }
			] }],
			"place-content": [{ "place-content": ne() }],
			"place-items": [{ "place-items": [...re(), "baseline"] }],
			"place-self": [{ "place-self": ["auto", ...re()] }],
			p: [{ p: w() }],
			px: [{ px: w() }],
			py: [{ py: w() }],
			ps: [{ ps: w() }],
			pe: [{ pe: w() }],
			pbs: [{ pbs: w() }],
			pbe: [{ pbe: w() }],
			pt: [{ pt: w() }],
			pr: [{ pr: w() }],
			pb: [{ pb: w() }],
			pl: [{ pl: w() }],
			m: [{ m: O() }],
			mx: [{ mx: O() }],
			my: [{ my: O() }],
			ms: [{ ms: O() }],
			me: [{ me: O() }],
			mbs: [{ mbs: O() }],
			mbe: [{ mbe: O() }],
			mt: [{ mt: O() }],
			mr: [{ mr: O() }],
			mb: [{ mb: O() }],
			ml: [{ ml: O() }],
			"space-x": [{ "space-x": w() }],
			"space-x-reverse": ["space-x-reverse"],
			"space-y": [{ "space-y": w() }],
			"space-y-reverse": ["space-y-reverse"],
			size: [{ size: ie() }],
			"inline-size": [{ inline: ["auto", ...ae()] }],
			"min-inline-size": [{ "min-inline": ["auto", ...ae()] }],
			"max-inline-size": [{ "max-inline": ["none", ...ae()] }],
			"block-size": [{ block: ["auto", ...oe()] }],
			"min-block-size": [{ "min-block": ["auto", ...oe()] }],
			"max-block-size": [{ "max-block": ["none", ...oe()] }],
			w: [{ w: [
				s,
				"screen",
				...ie()
			] }],
			"min-w": [{ "min-w": [
				s,
				"screen",
				"none",
				...ie()
			] }],
			"max-w": [{ "max-w": [
				s,
				"screen",
				"none",
				"prose",
				{ screen: [o] },
				...ie()
			] }],
			h: [{ h: [
				"screen",
				"lh",
				...ie()
			] }],
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...ie()
			] }],
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				...ie()
			] }],
			"font-size": [{ text: [
				"base",
				n,
				Yn,
				Hn
			] }],
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			"font-style": ["italic", "not-italic"],
			"font-weight": [{ font: [
				r,
				tr,
				Wn
			] }],
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				Mn,
				I
			] }],
			"font-family": [{ font: [
				Xn,
				Gn,
				t
			] }],
			"font-features": [{ "font-features": [I] }],
			"fvn-normal": ["normal-nums"],
			"fvn-ordinal": ["ordinal"],
			"fvn-slashed-zero": ["slashed-zero"],
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			tracking: [{ tracking: [
				i,
				L,
				I
			] }],
			"line-clamp": [{ "line-clamp": [
				F,
				"none",
				L,
				Un
			] }],
			leading: [{ leading: [a, ...w()] }],
			"list-image": [{ "list-image": [
				"none",
				L,
				I
			] }],
			"list-style-position": [{ list: ["inside", "outside"] }],
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				L,
				I
			] }],
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			"placeholder-color": [{ placeholder: k() }],
			"text-color": [{ text: k() }],
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			"text-decoration-style": [{ decoration: [...N(), "wavy"] }],
			"text-decoration-thickness": [{ decoration: [
				F,
				"from-font",
				"auto",
				L,
				Hn
			] }],
			"text-decoration-color": [{ decoration: k() }],
			"underline-offset": [{ "underline-offset": [
				F,
				"auto",
				L,
				I
			] }],
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			indent: [{ indent: w() }],
			"tab-size": [{ tab: [
				jn,
				L,
				I
			] }],
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				L,
				I
			] }],
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			content: [{ content: [
				"none",
				L,
				I
			] }],
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			"bg-position": [{ bg: A() }],
			"bg-repeat": [{ bg: se() }],
			"bg-size": [{ bg: ce() }],
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						jn,
						L,
						I
					],
					radial: [
						"",
						L,
						I
					],
					conic: [
						jn,
						L,
						I
					]
				},
				$n,
				qn
			] }],
			"bg-color": [{ bg: k() }],
			"gradient-from-pos": [{ from: le() }],
			"gradient-via-pos": [{ via: le() }],
			"gradient-to-pos": [{ to: le() }],
			"gradient-from": [{ from: k() }],
			"gradient-via": [{ via: k() }],
			"gradient-to": [{ to: k() }],
			rounded: [{ rounded: j() }],
			"rounded-s": [{ "rounded-s": j() }],
			"rounded-e": [{ "rounded-e": j() }],
			"rounded-t": [{ "rounded-t": j() }],
			"rounded-r": [{ "rounded-r": j() }],
			"rounded-b": [{ "rounded-b": j() }],
			"rounded-l": [{ "rounded-l": j() }],
			"rounded-ss": [{ "rounded-ss": j() }],
			"rounded-se": [{ "rounded-se": j() }],
			"rounded-ee": [{ "rounded-ee": j() }],
			"rounded-es": [{ "rounded-es": j() }],
			"rounded-tl": [{ "rounded-tl": j() }],
			"rounded-tr": [{ "rounded-tr": j() }],
			"rounded-br": [{ "rounded-br": j() }],
			"rounded-bl": [{ "rounded-bl": j() }],
			"border-w": [{ border: M() }],
			"border-w-x": [{ "border-x": M() }],
			"border-w-y": [{ "border-y": M() }],
			"border-w-s": [{ "border-s": M() }],
			"border-w-e": [{ "border-e": M() }],
			"border-w-bs": [{ "border-bs": M() }],
			"border-w-be": [{ "border-be": M() }],
			"border-w-t": [{ "border-t": M() }],
			"border-w-r": [{ "border-r": M() }],
			"border-w-b": [{ "border-b": M() }],
			"border-w-l": [{ "border-l": M() }],
			"divide-x": [{ "divide-x": M() }],
			"divide-x-reverse": ["divide-x-reverse"],
			"divide-y": [{ "divide-y": M() }],
			"divide-y-reverse": ["divide-y-reverse"],
			"border-style": [{ border: [
				...N(),
				"hidden",
				"none"
			] }],
			"divide-style": [{ divide: [
				...N(),
				"hidden",
				"none"
			] }],
			"border-color": [{ border: k() }],
			"border-color-x": [{ "border-x": k() }],
			"border-color-y": [{ "border-y": k() }],
			"border-color-s": [{ "border-s": k() }],
			"border-color-e": [{ "border-e": k() }],
			"border-color-bs": [{ "border-bs": k() }],
			"border-color-be": [{ "border-be": k() }],
			"border-color-t": [{ "border-t": k() }],
			"border-color-r": [{ "border-r": k() }],
			"border-color-b": [{ "border-b": k() }],
			"border-color-l": [{ "border-l": k() }],
			"divide-color": [{ divide: k() }],
			"outline-style": [{ outline: [
				...N(),
				"none",
				"hidden"
			] }],
			"outline-offset": [{ "outline-offset": [
				F,
				L,
				I
			] }],
			"outline-w": [{ outline: [
				"",
				F,
				Yn,
				Hn
			] }],
			"outline-color": [{ outline: k() }],
			shadow: [{ shadow: [
				"",
				"none",
				u,
				er,
				Jn
			] }],
			"shadow-color": [{ shadow: k() }],
			"inset-shadow": [{ "inset-shadow": [
				"none",
				d,
				er,
				Jn
			] }],
			"inset-shadow-color": [{ "inset-shadow": k() }],
			"ring-w": [{ ring: M() }],
			"ring-w-inset": ["ring-inset"],
			"ring-color": [{ ring: k() }],
			"ring-offset-w": [{ "ring-offset": [F, Hn] }],
			"ring-offset-color": [{ "ring-offset": k() }],
			"inset-ring-w": [{ "inset-ring": M() }],
			"inset-ring-color": [{ "inset-ring": k() }],
			"text-shadow": [{ "text-shadow": [
				"none",
				f,
				er,
				Jn
			] }],
			"text-shadow-color": [{ "text-shadow": k() }],
			opacity: [{ opacity: [
				F,
				L,
				I
			] }],
			"mix-blend": [{ "mix-blend": [
				...ue(),
				"plus-darker",
				"plus-lighter"
			] }],
			"bg-blend": [{ "bg-blend": ue() }],
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			"mask-image-linear-pos": [{ "mask-linear": [F] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": P() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": P() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": k() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": k() }],
			"mask-image-t-from-pos": [{ "mask-t-from": P() }],
			"mask-image-t-to-pos": [{ "mask-t-to": P() }],
			"mask-image-t-from-color": [{ "mask-t-from": k() }],
			"mask-image-t-to-color": [{ "mask-t-to": k() }],
			"mask-image-r-from-pos": [{ "mask-r-from": P() }],
			"mask-image-r-to-pos": [{ "mask-r-to": P() }],
			"mask-image-r-from-color": [{ "mask-r-from": k() }],
			"mask-image-r-to-color": [{ "mask-r-to": k() }],
			"mask-image-b-from-pos": [{ "mask-b-from": P() }],
			"mask-image-b-to-pos": [{ "mask-b-to": P() }],
			"mask-image-b-from-color": [{ "mask-b-from": k() }],
			"mask-image-b-to-color": [{ "mask-b-to": k() }],
			"mask-image-l-from-pos": [{ "mask-l-from": P() }],
			"mask-image-l-to-pos": [{ "mask-l-to": P() }],
			"mask-image-l-from-color": [{ "mask-l-from": k() }],
			"mask-image-l-to-color": [{ "mask-l-to": k() }],
			"mask-image-x-from-pos": [{ "mask-x-from": P() }],
			"mask-image-x-to-pos": [{ "mask-x-to": P() }],
			"mask-image-x-from-color": [{ "mask-x-from": k() }],
			"mask-image-x-to-color": [{ "mask-x-to": k() }],
			"mask-image-y-from-pos": [{ "mask-y-from": P() }],
			"mask-image-y-to-pos": [{ "mask-y-to": P() }],
			"mask-image-y-from-color": [{ "mask-y-from": k() }],
			"mask-image-y-to-color": [{ "mask-y-to": k() }],
			"mask-image-radial": [{ "mask-radial": [L, I] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": P() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": P() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": k() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": k() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": b() }],
			"mask-image-conic-pos": [{ "mask-conic": [F] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": P() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": P() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": k() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": k() }],
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			"mask-position": [{ mask: A() }],
			"mask-repeat": [{ mask: se() }],
			"mask-size": [{ mask: ce() }],
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			"mask-image": [{ mask: [
				"none",
				L,
				I
			] }],
			filter: [{ filter: [
				"",
				"none",
				L,
				I
			] }],
			blur: [{ blur: de() }],
			brightness: [{ brightness: [
				F,
				L,
				I
			] }],
			contrast: [{ contrast: [
				F,
				L,
				I
			] }],
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				p,
				er,
				Jn
			] }],
			"drop-shadow-color": [{ "drop-shadow": k() }],
			grayscale: [{ grayscale: [
				"",
				F,
				L,
				I
			] }],
			"hue-rotate": [{ "hue-rotate": [
				F,
				L,
				I
			] }],
			invert: [{ invert: [
				"",
				F,
				L,
				I
			] }],
			saturate: [{ saturate: [
				F,
				L,
				I
			] }],
			sepia: [{ sepia: [
				"",
				F,
				L,
				I
			] }],
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				L,
				I
			] }],
			"backdrop-blur": [{ "backdrop-blur": de() }],
			"backdrop-brightness": [{ "backdrop-brightness": [
				F,
				L,
				I
			] }],
			"backdrop-contrast": [{ "backdrop-contrast": [
				F,
				L,
				I
			] }],
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				F,
				L,
				I
			] }],
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				F,
				L,
				I
			] }],
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				F,
				L,
				I
			] }],
			"backdrop-opacity": [{ "backdrop-opacity": [
				F,
				L,
				I
			] }],
			"backdrop-saturate": [{ "backdrop-saturate": [
				F,
				L,
				I
			] }],
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				F,
				L,
				I
			] }],
			"border-collapse": [{ border: ["collapse", "separate"] }],
			"border-spacing": [{ "border-spacing": w() }],
			"border-spacing-x": [{ "border-spacing-x": w() }],
			"border-spacing-y": [{ "border-spacing-y": w() }],
			"table-layout": [{ table: ["auto", "fixed"] }],
			caption: [{ caption: ["top", "bottom"] }],
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				L,
				I
			] }],
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			duration: [{ duration: [
				F,
				"initial",
				L,
				I
			] }],
			ease: [{ ease: [
				"linear",
				"initial",
				_,
				L,
				I
			] }],
			delay: [{ delay: [
				F,
				L,
				I
			] }],
			animate: [{ animate: [
				"none",
				v,
				L,
				I
			] }],
			backface: [{ backface: ["hidden", "visible"] }],
			perspective: [{ perspective: [
				h,
				L,
				I
			] }],
			"perspective-origin": [{ "perspective-origin": x() }],
			rotate: [{ rotate: fe() }],
			"rotate-x": [{ "rotate-x": fe() }],
			"rotate-y": [{ "rotate-y": fe() }],
			"rotate-z": [{ "rotate-z": fe() }],
			scale: [{ scale: pe() }],
			"scale-x": [{ "scale-x": pe() }],
			"scale-y": [{ "scale-y": pe() }],
			"scale-z": [{ "scale-z": pe() }],
			"scale-3d": ["scale-3d"],
			skew: [{ skew: me() }],
			"skew-x": [{ "skew-x": me() }],
			"skew-y": [{ "skew-y": me() }],
			transform: [{ transform: [
				L,
				I,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			"transform-origin": [{ origin: x() }],
			"transform-style": [{ transform: ["3d", "flat"] }],
			translate: [{ translate: he() }],
			"translate-x": [{ "translate-x": he() }],
			"translate-y": [{ "translate-y": he() }],
			"translate-z": [{ "translate-z": he() }],
			"translate-none": ["translate-none"],
			zoom: [{ zoom: [
				jn,
				L,
				I
			] }],
			accent: [{ accent: k() }],
			appearance: [{ appearance: ["none", "auto"] }],
			"caret-color": [{ caret: k() }],
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				L,
				I
			] }],
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			"scrollbar-thumb-color": [{ "scrollbar-thumb": k() }],
			"scrollbar-track-color": [{ "scrollbar-track": k() }],
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			"scroll-m": [{ "scroll-m": w() }],
			"scroll-mx": [{ "scroll-mx": w() }],
			"scroll-my": [{ "scroll-my": w() }],
			"scroll-ms": [{ "scroll-ms": w() }],
			"scroll-me": [{ "scroll-me": w() }],
			"scroll-mbs": [{ "scroll-mbs": w() }],
			"scroll-mbe": [{ "scroll-mbe": w() }],
			"scroll-mt": [{ "scroll-mt": w() }],
			"scroll-mr": [{ "scroll-mr": w() }],
			"scroll-mb": [{ "scroll-mb": w() }],
			"scroll-ml": [{ "scroll-ml": w() }],
			"scroll-p": [{ "scroll-p": w() }],
			"scroll-px": [{ "scroll-px": w() }],
			"scroll-py": [{ "scroll-py": w() }],
			"scroll-ps": [{ "scroll-ps": w() }],
			"scroll-pe": [{ "scroll-pe": w() }],
			"scroll-pbs": [{ "scroll-pbs": w() }],
			"scroll-pbe": [{ "scroll-pbe": w() }],
			"scroll-pt": [{ "scroll-pt": w() }],
			"scroll-pr": [{ "scroll-pr": w() }],
			"scroll-pb": [{ "scroll-pb": w() }],
			"scroll-pl": [{ "scroll-pl": w() }],
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			"snap-stop": [{ snap: ["normal", "always"] }],
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			"touch-pz": ["touch-pinch-zoom"],
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				L,
				I
			] }],
			fill: [{ fill: ["none", ...k()] }],
			"stroke-w": [{ stroke: [
				F,
				Yn,
				Hn,
				Un
			] }],
			stroke: [{ stroke: ["none", ...k()] }],
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": ["right", "left"],
			"inset-y": ["top", "bottom"],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: ["pr", "pl"],
			py: ["pt", "pb"],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: ["mr", "ml"],
			my: ["mt", "mb"],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": ["border-w-r", "border-w-l"],
			"border-w-y": ["border-w-t", "border-w-b"],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": ["border-color-r", "border-color-l"],
			"border-color-y": ["border-color-t", "border-color-b"],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": ["scroll-mr", "scroll-ml"],
			"scroll-my": ["scroll-mt", "scroll-mb"],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": ["scroll-pr", "scroll-pl"],
			"scroll-py": ["scroll-pt", "scroll-pb"],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
});
//#endregion
//#region src/components/lib/utils.ts
function R(...e) {
	return fr(Lt(e));
}
//#endregion
//#region ../summaries/node_modules/react/cjs/react-jsx-runtime.production.js
var pr = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.fragment");
	function r(e, n, r) {
		var i = null;
		if (r !== void 0 && (i = "" + r), n.key !== void 0 && (i = "" + n.key), "key" in n) for (var a in r = {}, n) a !== "key" && (r[a] = n[a]);
		else r = n;
		return n = r.ref, {
			$$typeof: t,
			type: e,
			key: i,
			ref: n === void 0 ? null : n,
			props: r
		};
	}
	e.Fragment = n, e.jsx = r, e.jsxs = r;
})), z = (/* @__PURE__ */ o(((e, t) => {
	t.exports = pr();
})))(), mr = Bt([
	"inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap",
	"rounded-md border px-2 py-0.5 text-xs font-medium",
	"[&>svg]:pointer-events-none [&>svg]:size-3"
].join(" "), {
	variants: { variant: {
		default: "border-transparent bg-primary text-primary-foreground",
		secondary: "border-transparent bg-secondary text-secondary-foreground",
		destructive: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
		outline: "border-border text-foreground",
		success: "border-transparent bg-success/10 text-success dark:bg-success/15",
		warning: "border-transparent bg-warning/10 text-warning dark:bg-warning/15",
		info: "border-transparent bg-info/10 text-info dark:bg-info/15",
		recording: "border-transparent bg-recording/10 text-recording dark:bg-recording/15",
		brand: "border-transparent bg-primary/15 text-brand-ink dark:bg-primary/15"
	} },
	defaultVariants: { variant: "secondary" }
});
function hr({ className: e, variant: t, ...n }) {
	return /* @__PURE__ */ (0, z.jsx)("span", {
		"data-slot": "badge",
		className: R(mr({ variant: t }), e),
		...n
	});
}
//#endregion
//#region src/components/ui/card.tsx
function gr({ className: e, ...t }) {
	return /* @__PURE__ */ (0, z.jsx)("div", {
		"data-slot": "card",
		className: R("flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xs", e),
		...t
	});
}
function _r({ className: e, ...t }) {
	return /* @__PURE__ */ (0, z.jsx)("div", {
		"data-slot": "card-header",
		className: R("flex flex-col gap-1 px-5 pt-5", e),
		...t
	});
}
function vr({ className: e, ...t }) {
	return /* @__PURE__ */ (0, z.jsx)("div", {
		"data-slot": "card-title",
		className: R("text-sm font-semibold leading-none", e),
		...t
	});
}
function yr({ className: e, ...t }) {
	return /* @__PURE__ */ (0, z.jsx)("div", {
		"data-slot": "card-footer",
		className: R("flex items-center gap-2 border-t border-border px-5 py-3", e),
		...t
	});
}
//#endregion
//#region src/components/ui/view-switch.tsx
function br({ value: e, onValueChange: t, options: n, className: r, "aria-label": i }) {
	let a = _.useRef([]), o = _.useRef(null), [s, c] = _.useState(null), [l, u] = _.useState(!1), [d, f] = _.useState(null), p = Math.max(0, n.findIndex((t) => t.value === e));
	_.useLayoutEffect(() => {
		let e = () => {
			let e = a.current[p];
			e && c({
				left: e.offsetLeft,
				width: e.offsetWidth
			});
		};
		e();
		let t = new ResizeObserver(e);
		return o.current && t.observe(o.current), () => t.disconnect();
	}, [p, n.length]), _.useEffect(() => {
		s && !l && u(!0);
	}, [s, l]);
	let m = (e) => {
		f(n[e].value), t(n[e].value);
	};
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		ref: o,
		role: "radiogroup",
		"aria-label": i,
		onKeyDown: (e) => {
			let t = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
			if (!t) return;
			e.preventDefault();
			let r = (p + t + n.length) % n.length;
			m(r), a.current[r]?.focus();
		},
		className: R("relative inline-flex h-9 items-center rounded-lg bg-muted p-[3px] isolate", r),
		children: [s && /* @__PURE__ */ (0, z.jsx)("span", {
			"aria-hidden": "true",
			className: R("oats-view-indicator absolute top-[3px] bottom-[3px] left-0 -z-10 rounded-md", !l && "[transition:none]"),
			style: {
				width: s.width,
				transform: `translateX(${s.left}px)`
			}
		}), n.map((e, t) => {
			let n = t === p, r = e.icon;
			return /* @__PURE__ */ (0, z.jsxs)("button", {
				ref: (e) => {
					a.current[t] = e;
				},
				type: "button",
				role: "radio",
				"aria-checked": n,
				tabIndex: n ? 0 : -1,
				onClick: () => m(t),
				className: R("inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium", "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50", n ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"),
				children: [/* @__PURE__ */ (0, z.jsx)(r, {
					"aria-hidden": "true",
					className: R("size-3.5 shrink-0", n && d === e.value && "oats-view-glyph")
				}, n && d === e.value ? "chosen" : "rest"), e.label]
			}, e.value);
		})]
	});
}
//#endregion
//#region src/helpers/chartDither.mjs
var xr = Object.freeze([
	0,
	8,
	2,
	10,
	12,
	4,
	14,
	6,
	3,
	11,
	1,
	9,
	15,
	7,
	13,
	5
]);
function Sr(e) {
	return e > 0 ? Math.min(16, Math.max(0, Math.ceil(e * 16 - .5))) : 0;
}
function Cr(e, t) {
	let n = Number.isFinite(e) ? e : 0, r = Number.isFinite(t) ? t : n, i = Math.max(Sr(n), Sr(r)), a = [];
	for (let e = 1; e <= i; e += 1) {
		let t = (e - .5) / 16, i = 0, o = 1;
		if (n !== r) {
			let e = (t - n) / (r - n);
			r < n ? o = Math.min(1, e) : i = Math.max(0, e);
		}
		o > i && a.push({
			step: e,
			density: e / 16,
			start: i,
			end: o
		});
	}
	return a;
}
//#endregion
//#region src/helpers/chartCurve.mjs
function wr(e) {
	let t = e.length;
	if (t < 2) return e.map(() => 0);
	let n = [], r = [];
	for (let i = 0; i < t - 1; i += 1) n[i] = e[i + 1].x - e[i].x, r[i] = n[i] ? (e[i + 1].y - e[i].y) / n[i] : 0;
	let i = Array(t);
	i[0] = r[0], i[t - 1] = r[t - 2];
	for (let e = 1; e < t - 1; e += 1) {
		let t = r[e - 1], a = r[e];
		if (t * a <= 0) {
			i[e] = 0;
			continue;
		}
		let o = 2 * n[e] + n[e - 1], s = n[e] + 2 * n[e - 1];
		i[e] = (o + s) / (o / t + s / a);
	}
	return i;
}
function Tr(e, t, n) {
	let r = e.length;
	if (!r) return 0;
	if (r === 1 || n <= e[0].x) return e[0].y;
	if (n >= e[r - 1].x) return e[r - 1].y;
	let i = 0, a = r - 1;
	for (; a - i > 1;) {
		let t = i + a >> 1;
		e[t].x <= n ? i = t : a = t;
	}
	let o = e[i], s = e[a], c = s.x - o.x;
	if (!c) return o.y;
	let l = (n - o.x) / c, u = l * l, d = u * l;
	return (2 * d - 3 * u + 1) * o.y + (d - 2 * u + l) * c * t[i] + (-2 * d + 3 * u) * s.y + (d - u) * c * t[a];
}
var Er = 2, Dr = 2.6, Or = .18, kr = {
	answered: "solid",
	denied: "solid",
	uncertain: "soft",
	asked: "ring",
	silence: "ring"
};
function Ar(e) {
	return Math.round(e * 1e4) / 1e4;
}
function jr(e) {
	return e < 0 ? 0 : e > 1 ? 1 : e;
}
function Mr(e) {
	if (!e) return 0;
	let t = (e.match(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g) || []).length;
	return e.replace(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g, " ").split(/\s+/).filter(Boolean).length + t;
}
function Nr({ utterances: e, at: t, span: n }) {
	let r = Array(96).fill(0), i = n / 96;
	for (let n of e) {
		let e = Mr(n.text);
		if (e <= 0) continue;
		let a = t(n.timestamp) * 96, o = e / Dr * 1e3, s = Math.max(1, o / i), c = e / s;
		for (let e = 0; e < s; e += 1) {
			let t = Math.floor(a + e);
			if (!(t < 0)) {
				if (t >= 96) break;
				r[t] += c * Math.min(1, s - e);
			}
		}
	}
	let a = r.map((e, t) => {
		let n = 0, i = 0;
		for (let e = -2; e <= Er; e += 1) {
			let a = t + e;
			a < 0 || a >= 96 || (n += r[a], i += 1);
		}
		return n / i;
	}), o = Math.max(...a, 0);
	return a.map((e, t) => {
		let n = o > 0 ? e / o : 0;
		return {
			x: Ar(t / 95),
			y: Ar(n),
			quiet: n <= Or
		};
	});
}
function Pr(e, t, n, r, i, a) {
	if (!(i > r) || !(t > 0)) return;
	let o = Math.max(0, Math.floor((r - e) / t));
	for (let s = o; s < n; s += 1) {
		let n = e + s * t;
		if (n >= i) break;
		let o = Math.min(n + t, i) - Math.max(n, r);
		o > 0 && a(s, o);
	}
}
function Fr({ utterances: e, levels: t, firstAt: n, span: r }) {
	let i = r / 96, a = Array(96).fill(0);
	for (let t of e) {
		let e = Mr(t.text);
		if (e <= 0) continue;
		let r = Number.isFinite(t.durationMs) && t.durationMs > 0 ? t.durationMs : e / Dr * 1e3, o = e / r;
		Pr(n, i, 96, t.timestamp, t.timestamp + r, (e, t) => {
			a[e] += o * t;
		});
	}
	let o = Array(96).fill(0), s = Array(96).fill(0);
	for (let e of t) {
		if (!Number.isFinite(e?.at) || !Number.isFinite(e?.level)) continue;
		let t = e.at, r = e.at + Lr, a = e.level * e.level;
		for (let e = Math.max(0, Math.floor((t - n) / i)); e < 96; e += 1) {
			let c = n + e * i;
			if (c >= r) break;
			let l = Math.min(c + i, r) - Math.max(c, t);
			l > 0 && (o[e] += a * l, s[e] += l);
		}
	}
	let c = Vr(t, Infinity), l = i / 1e3;
	return Gr(a.map((e, t) => Wr(e, l, s[t] ? Math.sqrt(o[t] / s[t]) : null, c))).map((e, t) => ({
		x: Ar(t / 95),
		y: Ar(e),
		quiet: e <= Or
	}));
}
function Ir({ utterances: e = [], questions: t = [], topics: n = [], moments: r = [], levels: i = [], now: a, startedAt: o }) {
	let s = e.filter((e) => Number.isFinite(e?.timestamp)).sort((e, t) => e.timestamp - t.timestamp), c = Number.isFinite(o) ? o : s.length ? s[0].timestamp : null, l = Number.isFinite(a) ? a : s.length ? s[s.length - 1].timestamp : null;
	if (c === null || l === null || l <= c) return {
		points: [],
		marks: [],
		shifts: [],
		returns: [],
		moments: [],
		span: 0,
		start: 0,
		empty: !0
	};
	let u = l - c, d = (e) => jr((e - c) / u), f = s.filter((e) => e.timestamp >= c && e.timestamp <= l), p = (Array.isArray(i) ? i : []).filter((e) => Number.isFinite(e?.at) && Number.isFinite(e?.level) && e.at + 1e3 > c && e.at < l).length ? Fr({
		utterances: f,
		levels: i,
		firstAt: c,
		span: u
	}) : Nr({
		utterances: f,
		at: d,
		span: u
	});
	return {
		points: p,
		marks: t.filter((e) => Number.isFinite(e?.createdAt)).filter((e) => e.createdAt >= c && e.createdAt <= l).sort((e, t) => e.createdAt - t.createdAt).map((e) => {
			let t = Ar(d(e.createdAt)), n = Math.min(95, Math.floor(t * 96));
			return {
				id: e.id ?? `q-${e.createdAt}`,
				x: t,
				y: p[n]?.y ?? 0,
				state: e.state ?? "asked",
				fill: kr[e.state] ?? kr.asked,
				question: e.question ?? "",
				groupKey: e.groupKey ?? e.id ?? `q-${e.createdAt}`,
				occurrence: e.occurrence ?? 1
			};
		}),
		shifts: n.filter((e) => Number.isFinite(e?.startedAt)).filter((e) => e.startedAt > c && e.startedAt <= l).sort((e, t) => e.startedAt - t.startedAt).map((e) => ({
			id: e.id ?? `t-${e.startedAt}`,
			x: Ar(d(e.startedAt)),
			label: e.label ?? "",
			state: e.state ?? "open"
		})),
		returns: n.filter((e) => Number.isFinite(e?.startedAt) && Number.isFinite(e?.lastTouchedAt)).filter((e) => e.lastTouchedAt > e.startedAt).filter((e) => e.startedAt >= c && e.lastTouchedAt <= l).filter((e) => e.lastTouchedAt - e.startedAt > u / 96).map((e) => ({
			id: e.id ?? `r-${e.startedAt}`,
			from: Ar(d(e.startedAt)),
			to: Ar(d(e.lastTouchedAt)),
			label: e.label ?? "",
			state: e.state ?? "open"
		})),
		moments: (Array.isArray(r) ? r : []).filter((e) => Number.isFinite(e?.at)).filter((e) => e.at >= c && e.at <= l).sort((e, t) => e.at - t.at).map((e) => ({
			id: e.id ?? `m-${e.at}`,
			x: Ar(d(e.at)),
			at: e.at,
			note: e.note ?? ""
		})),
		span: u,
		start: c,
		empty: !1
	};
}
var Lr = 1e3, Rr = 3, zr = 600;
function Br(e, t) {
	if (!e.length) return 0;
	let n = Math.round(t * (e.length - 1));
	return e[Math.min(e.length - 1, Math.max(0, n))];
}
function Vr(e, t = zr) {
	let n = (Array.isArray(e) ? e : []).slice(-t).map((e) => e?.level).filter((e) => Number.isFinite(e)), r = Float64Array.from(n).sort(), i = Br(r, .2), a = Br(r, .97);
	return {
		floor: i,
		range: Math.max(a - i, .01)
	};
}
var Hr = .22, Ur = .8;
function Wr(e, t, n, { floor: r, range: i }) {
	let a = jr(e / t / Rr);
	if (n === null) return a;
	let o = jr((n - r) / i) ** +Ur;
	return e > 0 ? Math.max(o, Math.min(a, Hr)) : o;
}
function Gr(e, t = () => !1) {
	return e.map((n, r) => {
		let i = 0, a = 0;
		for (let n = -1; n <= 1; n += 1) {
			let o = r + n;
			if (o < 0 || o >= e.length || t(o)) continue;
			let s = n === 0 ? 2 : 1;
			i += e[o] * s, a += s;
		}
		return a ? i / a : 0;
	});
}
//#endregion
//#region src/components/conversation/questionMarks.ts
var Kr = {
	answered: "success",
	denied: "warning",
	uncertain: "warning",
	asked: "muted",
	silence: "muted"
};
function qr(e) {
	return kr[e] ?? "ring";
}
function Jr(e) {
	return Kr[e] ?? "muted";
}
function Yr(e) {
	let t = qr(e);
	return t === "ring" ? "open" : t === "soft" ? "hedged" : Jr(e) === "success" ? "answered" : "unknown";
}
var Xr = {
	success: "--color-success",
	warning: "--color-warning",
	muted: "--color-muted-foreground"
}, B = {
	line: 1.5,
	rule: 1,
	dot: 4,
	ring: 2,
	focusDot: 5
}, Zr = .12, Qr = .35, $r = Math.PI * 2, ei = "\"Inter Variable\", \"Inter\", ui-sans-serif, system-ui, sans-serif";
function ti(e) {
	let t = getComputedStyle(e), n = (e, n) => t.getPropertyValue(e).trim() || n;
	return {
		ink: n("--color-foreground", "#09090b"),
		quiet: n("--color-muted-foreground", "#71717a"),
		rule: n("--color-border", "#e4e4e7"),
		card: n("--color-card", "#ffffff"),
		background: n("--color-background", "#ffffff"),
		honey: n("--color-primary", "#f5a30f"),
		success: n(Xr.success, "#16a34a"),
		warning: n(Xr.warning, "#c2410c"),
		sans: n("--font-family-sans", ei)
	};
}
var ni = (e, t) => Object.keys(e).every((n) => e[n] === t[n]), ri = /* @__PURE__ */ new Set(), ii = null, ai = null;
function oi(e, t) {
	return ii ||= ti(e), t(ii), ri.add(t), ai || (ai = new MutationObserver(() => {
		let e = ti(document.documentElement);
		if (!(ii && ni(ii, e))) {
			ii = e;
			for (let t of ri) t(e);
		}
	}), ai.observe(document.documentElement, {
		attributes: !0,
		attributeFilter: ["class", "data-theme"]
	})), () => {
		ri.delete(t), ri.size === 0 && (ai?.disconnect(), ai = null, ii = null);
	};
}
function si(e, t) {
	let n = new ResizeObserver((n) => {
		let r = n[n.length - 1];
		if (!r) return;
		let i = r.contentBoxSize?.[0], a = i ? i.inlineSize : r.contentRect.width, o = i ? i.blockSize : r.contentRect.height;
		if (!a || !o) return;
		let s = window.devicePixelRatio || 1, c = Math.min(s, 2), l = c === s ? r.devicePixelContentBoxSize?.[0] : void 0, u = l && Math.abs(l.inlineSize - a * c) < 2 && Math.abs(l.blockSize - o * c) < 2, d = u ? l.inlineSize : Math.round(a * c), f = u ? l.blockSize : Math.round(o * c);
		(e.width !== d || e.height !== f) && (e.width = d, e.height = f);
		let p = c === s ? "pixelated" : "auto";
		e.style.imageRendering !== p && (e.style.imageRendering = p);
		let m = e.getContext("2d");
		m && (m.setTransform(1, 0, 0, 1, 0, 0), m.clearRect(0, 0, d, f), m.setTransform(c, 0, 0, c, 0, 0), t({
			ctx: m,
			width: a,
			height: o,
			ratio: c
		}));
	});
	try {
		n.observe(e, { box: "device-pixel-content-box" });
	} catch {
		n.observe(e);
	}
	return () => n.disconnect();
}
function ci(e, t, n, r, i, a = B.dot, { focus: o = !1 } = {}) {
	e.beginPath(), e.arc(t, n, a + B.ring, 0, $r), e.fillStyle = o ? i.honey : i.card, e.fill(), o && (e.beginPath(), e.arc(t, n, a, 0, $r), e.fillStyle = i.card, e.fill());
	let s = r === "answered" ? i.success : r === "unknown" ? i.warning : r === "plain" ? i.quiet : r === "now" || r === "selected" ? i.honey : null;
	if (e.beginPath(), e.arc(t, n, a, 0, $r), s) {
		e.fillStyle = s, e.fill();
		return;
	}
	let c = r === "hedged" ? i.warning : i.quiet;
	r === "hedged" && (e.save(), e.globalAlpha = Qr, e.fillStyle = c, e.fill(), e.restore()), e.beginPath(), e.arc(t, n, a - B.line / 2, 0, $r), e.lineWidth = B.line, e.strokeStyle = c, e.stroke();
}
function li(e, t, n = wr(t)) {
	for (let r = 0; r < t.length - 1; r += 1) {
		let i = t[r], a = t[r + 1], o = (a.x - i.x) / 3;
		e.bezierCurveTo(i.x + o, i.y + n[r] * o, a.x - o, a.y - n[r + 1] * o, a.x, a.y);
	}
}
var ui = /* @__PURE__ */ new Map(), di = /* @__PURE__ */ new WeakMap();
function fi(e, t) {
	let n = `${e}|${t}`, r = ui.get(n);
	if (!r) {
		r = typeof OffscreenCanvas == "function" ? new OffscreenCanvas(4, 4) : Object.assign(document.createElement("canvas"), {
			width: 4,
			height: 4
		});
		let i = r.getContext("2d");
		i && (i.fillStyle = t, xr.forEach((t, n) => {
			t < e && i.fillRect(n % 4, Math.floor(n / 4), 1, 1);
		})), ui.size >= 256 && ui.clear(), ui.set(n, r);
	}
	return r;
}
function pi(e, t, n) {
	let r = di.get(e);
	r || (r = /* @__PURE__ */ new Map(), di.set(e, r));
	let i = `${t}|${n}`, a = r.get(i);
	if (!a) {
		if (a = e.createPattern(fi(t, n), "repeat") ?? void 0, !a) return null;
		r.size >= 256 && r.clear(), r.set(i, a);
	}
	return a;
}
function mi(e, t) {
	if (!t) return {
		x: 0,
		y: 0
	};
	let n = e.getTransform(), r = (e) => (Math.round(e) % 4 + 4) % 4;
	return {
		x: r(n.a * t.x + n.c * t.y + n.e),
		y: r(n.b * t.x + n.d * t.y + n.f)
	};
}
function hi(e, t, n, r, i = {}) {
	let a = mi(e, i.origin);
	if (typeof r == "function") {
		gi(e, t, n, r, a);
		return;
	}
	let o = Sr(r);
	if (!o) return;
	let s = pi(e, o, n);
	s && (e.save(), e.beginPath(), t(e), e.setTransform(1, 0, 0, 1, a.x, a.y), e.imageSmoothingEnabled = !1, e.fillStyle = s, e.fill(), e.restore());
}
function gi(e, t, n, r, i) {
	let { width: a, height: o } = e.canvas, s = e.getTransform().inverse(), c = /* @__PURE__ */ new Map(), l = (e, t, n, r) => {
		let i = c.get(e);
		i || (i = new Path2D(), c.set(e, i)), i.rect(t, n, r, 4);
	};
	for (let e = i.y ? -4 : 0; e + i.y < o; e += 4) {
		let t = 0, n = 0;
		for (let o = i.x ? -4 : 0;; o += 4) {
			let c = o + i.x < a, u = 0;
			if (c) {
				let t = o + i.x + 4 / 2, n = e + i.y + 4 / 2;
				u = Sr(r(s.a * t + s.c * n + s.e, s.b * t + s.d * n + s.f));
			}
			if (u !== t && (t && l(t, n, e, o - n), t = u, n = o), !c) break;
		}
	}
	if (c.size) {
		e.save(), e.beginPath(), t(e), e.clip(), e.setTransform(1, 0, 0, 1, i.x, i.y), e.imageSmoothingEnabled = !1;
		for (let [t, r] of c) {
			let i = pi(e, t, n);
			i && (e.fillStyle = i, e.fill(r));
		}
		e.restore();
	}
}
function _i(e, t, n, r, i, a = {}) {
	for (let o of Cr(r, i)) hi(e, (e) => t(e, o.start, o.end), n, o.density, a);
}
function vi(e, t, n) {
	e.save(), e.beginPath(), t(e), e.globalAlpha = Zr, e.fillStyle = n, e.fill(), e.restore();
}
function yi(e) {
	return !!(e && e.label && (e.durationMs ?? 0) >= 4e3);
}
var bi = 14, xi = .08, Si = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function Ci(e) {
	return Si((e.state === "dropped" ? .9 : e.state === "open" ? .7 : .25) + Math.min(.25, (e.returns ?? 0) * .08));
}
function wi({ snapshot: e = null, startedAt: t = 0, now: n = 0, maxNodes: r = bi } = {}) {
	let i = Array.isArray(e?.nodes) ? e.nodes : [], a = Math.max(1, n - t), o = i.filter(yi).sort((e, t) => (t.durationMs ?? 0) - (e.durationMs ?? 0)).slice(0, r).sort((e, t) => (e.firstAt ?? 0) - (t.firstAt ?? 0));
	if (!o.length) return {
		points: [],
		links: [],
		empty: !0
	};
	let s = o.map((e) => {
		let n = (e.firstAt ?? t) - t;
		return {
			id: e.id,
			label: e.label,
			state: e.state,
			returns: e.returns ?? 0,
			durationMs: e.durationMs ?? 0,
			utteranceIds: Array.isArray(e.utteranceIds) ? e.utteranceIds : [],
			x: xi + Si(n / a) * (1 - xi * 2),
			y: xi + (1 - Ci(e)) * (1 - xi * 2)
		};
	}), c = new Map(s.map((e) => [e.id, e])), l = [];
	for (let t of Array.isArray(e?.edges) ? e.edges : []) {
		let e = c.get(t?.from), n = c.get(t?.to);
		!e || !n || e === n || l.push({
			from: e.id,
			to: n.id,
			kind: t.kind === "return" ? "return" : "new",
			x1: e.x,
			y1: e.y,
			x2: n.x,
			y2: n.y
		});
	}
	return {
		points: s,
		links: l,
		empty: !1
	};
}
function Ti() {
	return 12;
}
var Ei = 6.6, Di = 16, Oi = 6, ki = 2, Ai = (e, t) => e.x1 < t.x2 && t.x1 < e.x2 && e.y1 < t.y2 && t.y1 < e.y2, ji = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
function V(e) {
	let t = String(e ?? "").trim().replace(/\s+/g, " "), n = t.includes(" "), r = n ? t.split(" ") : ji.test(t) ? Array.from(t) : [t];
	if (r.length < 2) return null;
	let i = (e) => e.join(n ? " " : ""), a = null, o = Infinity;
	for (let e = 1; e < r.length; e += 1) {
		let t = i(r.slice(0, e)), n = i(r.slice(e)), s = Math.max(Array.from(t).length, Array.from(n).length);
		s <= o && (a = [t, n], o = s);
	}
	return a;
}
function H(e, { width: t = 0, height: n = 0, charPx: r = Ei, plateX: i = 0, plateY: a = 0 } = {}) {
	let o = Array.isArray(e) ? e : [];
	if (!(t > 0 && n > 0)) return new Map(o.map((e) => [e.id, {
		side: "right",
		align: "center",
		hidden: !1
	}]));
	let s = o.map((e) => {
		let r = Ti(e) / 2, i = e.x * t, a = e.y * n;
		return {
			id: e.id,
			x1: i - r,
			x2: i + r,
			y1: a - r,
			y2: a + r,
			cx: i,
			cy: a,
			half: r
		};
	}), c = [], l = /* @__PURE__ */ new Map(), u = [...o].sort((e, t) => (t.durationMs ?? 0) - (e.durationMs ?? 0));
	for (let e of u) {
		let o = s.find((t) => t.id === e.id), u = String(e.label ?? "").length * r, d = o.cy - Di / 2, f = o.cy + Di / 2, p = o.cy - o.half - ki, m = o.cy + o.half + ki, h = [
			{
				align: "center",
				x1: o.cx - u / 2
			},
			{
				align: "end",
				x1: o.cx + o.half - u
			},
			{
				align: "start",
				x1: o.cx - o.half
			}
		], g = [
			{
				side: "right",
				align: "center",
				x1: o.cx + o.half + Oi,
				y1: d,
				y2: f
			},
			{
				side: "left",
				align: "center",
				x1: o.cx - o.half - Oi - u,
				y1: d,
				y2: f
			},
			...h.map((e) => ({
				side: "above",
				...e,
				y1: p - Di,
				y2: p
			})),
			...h.map((e) => ({
				side: "below",
				...e,
				y1: m,
				y2: m + Di
			}))
		].map((e) => ({
			...e,
			x2: e.x1 + u
		})), _ = (e) => ({
			x1: e.x1 - i,
			x2: e.x2 + i,
			y1: e.y1 - a,
			y2: e.y2 + a
		}), v = (r) => r.x1 >= 0 && r.x2 <= t && r.y1 >= 0 && r.y2 <= n && !c.some((e) => Ai(_(r), e)) && !s.some((t) => t.id !== e.id && Ai(_(r), t)), y = g.find(v), b = y ? null : V(e.label);
		if (b) {
			let e = Math.max(...b.map((e) => Array.from(e).length)) * r, t = Di * 2, n = [
				{
					align: "center",
					x1: o.cx - e / 2
				},
				{
					align: "end",
					x1: o.cx + o.half - e
				},
				{
					align: "start",
					x1: o.cx - o.half
				}
			];
			y = [
				{
					side: "right",
					align: "center",
					x1: o.cx + o.half + Oi,
					y1: o.cy - t / 2,
					y2: o.cy + t / 2
				},
				{
					side: "left",
					align: "center",
					x1: o.cx - o.half - Oi - e,
					y1: o.cy - t / 2,
					y2: o.cy + t / 2
				},
				...n.map((e) => ({
					side: "above",
					...e,
					y1: p - t,
					y2: p
				})),
				...n.map((e) => ({
					side: "below",
					...e,
					y1: m,
					y2: m + t
				}))
			].map((t) => ({
				...t,
				x2: t.x1 + e
			})).find(v);
		}
		y ? (c.push(y), l.set(e.id, {
			side: y.side,
			align: y.align,
			hidden: !1,
			...b && y ? { lines: b } : {}
		})) : l.set(e.id, {
			side: "right",
			align: "center",
			hidden: !0
		});
	}
	return l;
}
function Mi(e, t) {
	if (!e?.utteranceIds?.length || !Array.isArray(t)) return null;
	let n = new Set(e.utteranceIds);
	for (let e = t.length - 1; e >= 0; --e) {
		let r = t[e];
		if (r && n.has(r.id) && String(r.text || "").trim()) return r;
	}
	return null;
}
//#endregion
//#region src/helpers/conversationFlow.mjs
var Ni = (e) => Math.round(e * 10) / 10;
function Pi(e, t, n, r, i) {
	let a = Math.hypot(n - e, r - t) || 1;
	return {
		x: e + (n - e) / a * i,
		y: t + (r - t) / a * i
	};
}
function Fi({ x1: e = 0, y1: t = 0, x2: n = 0, y2: r = 0, r1: i = 0, r2: a = 0, bow: o = .2, maxBow: s = 28 } = {}) {
	let c = n - e, l = r - t, u = Math.hypot(c, l);
	if (!(u > i + a)) return null;
	let d = Math.min(s, u * o), f = (e + n) / 2 - l / u * d, p = (t + r) / 2 + c / u * d, m = Pi(e, t, f, p, i), h = Pi(n, r, f, p, a);
	return `M ${Ni(m.x)} ${Ni(m.y)} Q ${Ni(f)} ${Ni(p)} ${Ni(h.x)} ${Ni(h.y)}`;
}
function Ii(e) {
	if (!Number.isFinite(e) || e < 0) return "";
	let t = Math.floor(e / 1e3), n = String(t % 60).padStart(2, "0"), r = Math.floor(t / 60) % 60, i = Math.floor(t / 3600);
	return i ? `${i}:${String(r).padStart(2, "0")}:${n}` : `${r}:${n}`;
}
//#endregion
//#region src/helpers/topicLanes.mjs
var Li = 2e4, Ri = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function zi(e) {
	let { startMs: t, endMs: n } = e ?? {};
	return Number.isFinite(t) && Number.isFinite(n) && n > t ? n - t : 0;
}
function Bi({ snapshot: e = null, segments: t = null, start: n = NaN, end: r = NaN, live: i = !1, minRunMs: a = Li } = {}) {
	let o = (Array.isArray(e?.nodes) ? e.nodes : []).filter(yi).sort((e, t) => (e.firstAt ?? 0) - (t.firstAt ?? 0) || e.id - t.id), s = /* @__PURE__ */ new Map();
	for (let e of o) for (let t of Array.isArray(e.utteranceIds) ? e.utteranceIds : []) s.set(String(t), e.id);
	let c = (Array.isArray(t) ? t : []).filter((e) => Number.isFinite(e?.timestamp)), l = Number.isFinite(n) ? n : c.reduce((e, t) => Math.min(e, t.timestamp), Infinity), u = Number.isFinite(r) ? r : c.reduce((e, t) => Math.max(e, t.timestamp + zi(t)), -Infinity), d = Number.isFinite(l) && Number.isFinite(u), f = d ? Math.max(1, u - l) : 0, p = d ? c.filter((e) => s.has(String(e.id))).filter((e) => e.timestamp >= l && e.timestamp <= u).map((e) => ({
		at: e.timestamp,
		topic: s.get(String(e.id))
	})).sort((e, t) => e.at - t.at) : [], m = [];
	for (let e of p) {
		let t = m[m.length - 1];
		t && t.topic === e.topic || m.push({
			topic: e.topic,
			startAt: e.at,
			endAt: e.at
		});
	}
	for (let e = 0; e < m.length; e += 1) m[e].endAt = e + 1 < m.length ? m[e + 1].startAt : u;
	let h = /* @__PURE__ */ new Map();
	for (let e of m) {
		let t = h.get(e.topic);
		(!t || e.endAt - e.startAt > t.endAt - t.startAt) && h.set(e.topic, e);
	}
	let g = new Map(o.map((e) => [e.id, Math.max(0, e.returns ?? 0)])), _ = /* @__PURE__ */ new Map(), v = /* @__PURE__ */ new Set();
	for (let e of m) v.has(e.topic) && _.set(e.topic, [..._.get(e.topic) ?? [], e]), v.add(e.topic);
	let y = /* @__PURE__ */ new Set();
	for (let [e, t] of _) {
		let n = [...t].sort((e, t) => t.endAt - t.startAt - (e.endAt - e.startAt));
		for (let t of n.slice(0, g.get(e) ?? 0)) y.add(t);
	}
	let b = [], x = null;
	for (let [e, t] of m.entries()) {
		let n = { ...t };
		x !== null && (n.startAt = x, x = null);
		let r = b[b.length - 1];
		if (n.endAt - n.startAt < a && h.get(t.topic) !== t && !y.has(t) && !(i && e === m.length - 1)) {
			r ? r.endAt = n.endAt : x = n.startAt;
			continue;
		}
		if (r && r.topic === n.topic) {
			r.endAt = n.endAt;
			continue;
		}
		b.push(n);
	}
	let S = (e) => Ri((e - l) / f), C = b.map((e) => ({
		topic: e.topic,
		from: S(e.startAt),
		to: S(e.endAt)
	})), w = [], T = /* @__PURE__ */ new Set();
	for (let [e, t] of C.entries()) T.has(t.topic) && w.push({
		topic: t.topic,
		previous: C[e - 1].topic,
		at: t.from
	}), T.add(t.topic);
	let E = /* @__PURE__ */ new Map();
	for (let e of w) E.set(e.topic, (E.get(e.topic) ?? 0) + 1);
	return {
		rows: o.map((e) => ({
			id: e.id,
			label: String(e.label),
			state: e.state,
			durationMs: e.durationMs ?? 0,
			back: E.get(e.id) ?? 0
		})),
		runs: C,
		returns: w,
		now: i && C.length ? C[C.length - 1].topic : null,
		start: d ? l : 0,
		end: d ? u : 0,
		span: f,
		empty: o.length === 0
	};
}
function Vi(e, t) {
	let n = Array.isArray(e?.runs) ? e.runs : [];
	if (!n.length || !Number.isFinite(t) || !(e.span > 0)) return null;
	let r = (t - e.start) / e.span, i = n[0], a = Infinity;
	for (let [e, t] of n.entries()) {
		let o = e === n.length - 1;
		if (r >= t.from && (r < t.to || o && r === t.to)) return t;
		let s = r < t.from ? t.from - r : r - t.to;
		s < a && (i = t, a = s);
	}
	return i;
}
var Hi = (e) => Math.round(e * 10) / 10;
function Ui({ runs: e = [], rows: t = /* @__PURE__ */ new Map(), width: n = 0, rowHeight: r = 30, bend: i = 7 } = {}) {
	if (!(n > 0)) return null;
	let a = (Array.isArray(e) ? e : []).filter((e) => t.has(e.topic));
	if (!a.length) return null;
	let o = (e) => Ri(e) * n, s = (e) => t.get(e.topic) * r + r / 2, c = (e) => (o(e.to) - o(e.from)) / 2, l = a[0], u = `M ${Hi(o(l.from))} ${Hi(s(l))}`;
	for (let e = 1; e < a.length; e += 1) {
		let t = a[e - 1], n = a[e], r = o(n.from), l = Math.max(0, Math.min(i, c(t), c(n)));
		u += ` L ${Hi(r - l)} ${Hi(s(t))}`, u += ` C ${Hi(r)} ${Hi(s(t))} ${Hi(r)} ${Hi(s(n))} ${Hi(r + l)} ${Hi(s(n))}`;
	}
	let d = a[a.length - 1];
	return u += ` L ${Hi(o(d.to))} ${Hi(s(d))}`, u;
}
//#endregion
//#region src/helpers/ledgerDate.mjs
function Wi(e, { locale: t } = {}) {
	if (!Number.isFinite(e) || e <= 0) return "";
	let n = Math.max(1, Math.round(e / 6e4)), r = Math.floor(n / 60), i = n % 60;
	return typeof Intl.DurationFormat == "function" ? new Intl.DurationFormat(t, { style: "short" }).format(r ? i ? {
		hours: r,
		minutes: i
	} : { hours: r } : { minutes: i }) : new Intl.NumberFormat(t, {
		style: "unit",
		unit: "minute",
		unitDisplay: "short"
	}).format(n);
}
//#endregion
//#region src/components/conversation/StateMark.tsx
var Gi = {
	success: {
		fill: "bg-success",
		soft: "bg-success/35",
		ring: "border-success"
	},
	warning: {
		fill: "bg-warning",
		soft: "bg-warning/35",
		ring: "border-warning"
	},
	muted: {
		fill: "bg-muted-foreground",
		soft: "bg-muted-foreground/35",
		ring: "border-muted-foreground"
	}
};
function Ki({ state: e, className: t = "mt-[5px]" }) {
	let n = qr(e), r = Gi[Jr(e)];
	return /* @__PURE__ */ (0, z.jsx)("span", {
		"aria-hidden": "true",
		className: R("size-2 shrink-0 rounded-full", n === "solid" && r.fill, n !== "solid" && R("border-[1.5px]", r.ring), n === "soft" && r.soft, t)
	});
}
//#endregion
//#region ../summaries/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
var qi = (...e) => e.filter((e, t, n) => !!e && e.trim() !== "" && n.indexOf(e) === t).join(" ").trim(), Ji = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), Yi = (e) => e.replace(/^([A-Z])|[\s-_]+(\w)/g, (e, t, n) => n ? n.toUpperCase() : t.toLowerCase()), Xi = (e) => {
	let t = Yi(e);
	return t.charAt(0).toUpperCase() + t.slice(1);
}, Zi = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, Qi = (e) => {
	for (let t in e) if (t.startsWith("aria-") || t === "role" || t === "title") return !0;
	return !1;
}, $i = (0, _.createContext)({}), ea = () => (0, _.useContext)($i), ta = (0, _.forwardRef)(({ color: e, size: t, strokeWidth: n, absoluteStrokeWidth: r, className: i = "", children: a, iconNode: o, ...s }, c) => {
	let { size: l = 24, strokeWidth: u = 2, absoluteStrokeWidth: d = !1, color: f = "currentColor", className: p = "" } = ea() ?? {}, m = r ?? d ? Number(n ?? u) * 24 / Number(t ?? l) : n ?? u;
	return (0, _.createElement)("svg", {
		ref: c,
		...Zi,
		width: t ?? l ?? Zi.width,
		height: t ?? l ?? Zi.height,
		stroke: e ?? f,
		strokeWidth: m,
		className: qi("lucide", p, i),
		...!a && !Qi(s) && { "aria-hidden": "true" },
		...s
	}, [...o.map(([e, t]) => (0, _.createElement)(e, t)), ...Array.isArray(a) ? a : [a]]);
}), na = (e, t) => {
	let n = (0, _.forwardRef)(({ className: n, ...r }, i) => (0, _.createElement)(ta, {
		ref: i,
		iconNode: t,
		className: qi(`lucide-${Ji(Xi(e))}`, `lucide-${e}`, n),
		...r
	}));
	return n.displayName = Xi(e), n;
}, ra = na("book-open", [["path", {
	d: "M12 7v14",
	key: "1akyts"
}], ["path", {
	d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
	key: "ruj8y"
}]]), ia = na("bookmark", [["path", {
	d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
	key: "oz39mx"
}]]), aa = na("chevron-down", [["path", {
	d: "m6 9 6 6 6-6",
	key: "qrunsl"
}]]), oa = na("chevron-up", [["path", {
	d: "m18 15-6-6-6 6",
	key: "153udz"
}]]), sa = na("circle-check", [["circle", {
	cx: "12",
	cy: "12",
	r: "10",
	key: "1mglay"
}], ["path", {
	d: "m9 12 2 2 4-4",
	key: "dzmm74"
}]]), ca = na("file-text", [
	["path", {
		d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
		key: "1oefj6"
	}],
	["path", {
		d: "M14 2v5a1 1 0 0 0 1 1h5",
		key: "wfsgrz"
	}],
	["path", {
		d: "M10 9H8",
		key: "b1mrlr"
	}],
	["path", {
		d: "M16 13H8",
		key: "t4e002"
	}],
	["path", {
		d: "M16 17H8",
		key: "z1uh3a"
	}]
]), la = na("link-2", [
	["path", {
		d: "M9 17H7A5 5 0 0 1 7 7h2",
		key: "8i5ue5"
	}],
	["path", {
		d: "M15 7h2a5 5 0 1 1 0 10h-2",
		key: "1b9ql8"
	}],
	["line", {
		x1: "8",
		x2: "16",
		y1: "12",
		y2: "12",
		key: "1jonct"
	}]
]), ua = na("messages-square", [["path", {
	d: "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
	key: "1n2ejm"
}], ["path", {
	d: "M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1",
	key: "1qfcsi"
}]]), da = na("network", [
	["rect", {
		x: "16",
		y: "16",
		width: "6",
		height: "6",
		rx: "1",
		key: "4q2zg0"
	}],
	["rect", {
		x: "2",
		y: "16",
		width: "6",
		height: "6",
		rx: "1",
		key: "8cvhb9"
	}],
	["rect", {
		x: "9",
		y: "2",
		width: "6",
		height: "6",
		rx: "1",
		key: "1egb70"
	}],
	["path", {
		d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3",
		key: "1jsf9p"
	}],
	["path", {
		d: "M12 12V8",
		key: "2874zd"
	}]
]), fa = na("pause", [["rect", {
	x: "14",
	y: "3",
	width: "5",
	height: "18",
	rx: "1",
	key: "kaeet6"
}], ["rect", {
	x: "5",
	y: "3",
	width: "5",
	height: "18",
	rx: "1",
	key: "1wsw3u"
}]]), pa = na("play", [["path", {
	d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
	key: "10ikf1"
}]]), ma = na("rotate-ccw", [["path", {
	d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
	key: "1357e3"
}], ["path", {
	d: "M3 3v5h5",
	key: "1xhq8a"
}]]), ha = na("search", [["path", {
	d: "m21 21-4.34-4.34",
	key: "14j7rj"
}], ["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}]]), ga = na("triangle-alert", [
	["path", {
		d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
		key: "wmoenq"
	}],
	["path", {
		d: "M12 9v4",
		key: "juzpu7"
	}],
	["path", {
		d: "M12 17h.01",
		key: "p32p05"
	}]
]), _a = na("undo-2", [["path", {
	d: "M9 14 4 9l5-5",
	key: "102s5s"
}], ["path", {
	d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
	key: "f3b9sd"
}]]), va = na("users", [
	["path", {
		d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
		key: "1yyitq"
	}],
	["path", {
		d: "M16 3.128a4 4 0 0 1 0 7.744",
		key: "16gr8j"
	}],
	["path", {
		d: "M22 21v-2a4 4 0 0 0-3-3.87",
		key: "kshegd"
	}],
	["circle", {
		cx: "9",
		cy: "7",
		r: "4",
		key: "nufk8"
	}]
]), ya = na("x", [["path", {
	d: "M18 6 6 18",
	key: "1bl5f8"
}], ["path", {
	d: "m6 6 12 12",
	key: "d8bk6v"
}]]), ba = na("lanes", [
	["path", {
		d: "M3 5h3c2 0 2 7 4 7",
		key: "lanes-1"
	}],
	["path", {
		d: "M10 12h2c2 0 2 7 4 7",
		key: "lanes-2"
	}],
	["path", {
		d: "M16 19h1c2 0 2-14 4-14",
		key: "lanes-3"
	}]
]);
function xa(e) {
	return [{
		value: "lanes",
		label: e("oats.flow.mode.lanes"),
		icon: ba
	}, {
		value: "graph",
		label: e("oats.flow.mode.graph"),
		icon: da
	}];
}
function Sa(e, t) {
	switch (t) {
		case "live": return e("oats.flow.state.live");
		case "open": return e("oats.flow.state.open");
		case "resolved": return e("oats.flow.state.resolved");
		default: return e("oats.flow.state.dropped");
	}
}
function Ca(e, { topics: t, returns: n }) {
	if (!t) return null;
	let r = e("oats.flow.caption.topics", { count: t });
	return n ? e("oats.flow.caption.topicsReturns", {
		topics: r,
		returns: e("oats.flow.caption.returns", { count: n })
	}) : r;
}
//#endregion
//#region src/components/conversation/TopicLanes.tsx
var wa = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function Ta(e) {
	let t = e?.parentElement ?? null;
	for (; t && !/(auto|scroll)/.test(getComputedStyle(t).overflowY);) t = t.parentElement;
	return t;
}
function Ea({ lanes: e, selected: t, onSelect: n, live: r = !1, questions: i, inset: a = "px-5", className: o }) {
	let { t: s, i18n: c } = ot(), l = (0, _.useRef)(null), u = (0, _.useRef)(null), { rows: d, runs: f } = e, [p, m] = (0, _.useState)(0);
	(0, _.useLayoutEffect)(() => {
		let e = u.current;
		if (!e) return;
		let t = (e) => m((t) => t === e ? t : e);
		t(e.getBoundingClientRect().width);
		let n = new ResizeObserver(([e]) => t(e.contentRect.width));
		return n.observe(e), () => n.disconnect();
	}, []);
	let h = (0, _.useMemo)(() => new Map(d.map((e, t) => [e.id, t])), [d]), g = d.length * 30, v = (0, _.useMemo)(() => Ui({
		runs: f,
		rows: h,
		width: p
	}), [
		f,
		h,
		p
	]), y = (e) => e * 30 + 30 / 2, b = f[f.length - 1], x = r && b && h.has(b.topic) ? {
		x: b.to,
		row: h.get(b.topic)
	} : null, S = (0, _.useMemo)(() => !i?.length || !(e.span > 0) ? [] : i.flatMap((t) => {
		let n = Vi(e, t.at);
		if (!n || !h.has(n.topic)) return [];
		let r = wa((t.at - e.start) / e.span);
		return [{
			id: t.id,
			state: t.state,
			x: r,
			row: h.get(n.topic)
		}];
	}).sort((e, t) => Number(qr(t.state) === "ring") - Number(qr(e.state) === "ring")), [
		i,
		e,
		h
	]), C = r ? e.now : null;
	(0, _.useEffect)(() => {
		let e = l.current, t = C == null ? void 0 : h.get(C), n = Ta(e);
		if (!e || t === void 0 || !n) return;
		let r = e.getBoundingClientRect().top - n.getBoundingClientRect().top + n.scrollTop + t * 30;
		r < n.scrollTop ? n.scrollTop = r : r + 30 > n.scrollTop + n.clientHeight && (n.scrollTop = r + 30 - n.clientHeight);
	}, [C, h]);
	let w = c.language;
	return /* @__PURE__ */ (0, z.jsxs)("ul", {
		ref: l,
		"aria-label": s("oats.flow.lanesLabel"),
		className: R("grid grid-cols-[fit-content(min(15rem,34%))_minmax(0,1fr)_max-content] gap-x-3", o),
		style: { gridTemplateRows: `repeat(${d.length}, 30px)` },
		children: [d.map((i, o) => {
			let c = i.id === t, l = r && i.id === e.now, u = Sa(s, l ? "live" : i.state === "live" ? "open" : i.state), d = i.back > 0 ? s("oats.flow.nodeNameBack", {
				label: i.label,
				state: u,
				back: s("oats.flow.back", { count: i.back })
			}) : s("oats.flow.nodeName", {
				label: i.label,
				state: u
			});
			return /* @__PURE__ */ (0, z.jsx)("li", {
				className: R("col-span-full grid grid-cols-subgrid", o > 0 && "border-t border-border"),
				style: { gridRow: o + 1 },
				children: /* @__PURE__ */ (0, z.jsxs)("button", {
					type: "button",
					"aria-pressed": c,
					onClick: () => n(i.id),
					className: R("group col-span-full grid grid-cols-subgrid items-center text-left outline-none", a, "transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none", "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50", c && "bg-muted hover:bg-muted"),
					children: [
						/* @__PURE__ */ (0, z.jsx)("span", {
							className: "sr-only",
							children: d
						}),
						/* @__PURE__ */ (0, z.jsx)("span", {
							"aria-hidden": "true",
							className: "flex min-w-0 items-center gap-2",
							children: /* @__PURE__ */ (0, z.jsx)("span", {
								onMouseEnter: (e) => {
									let t = e.currentTarget;
									t.title = t.scrollWidth > t.clientWidth ? i.label : "";
								},
								className: R("truncate text-[13px]", l && "font-medium text-foreground", !l && (r && !c ? "text-muted-foreground group-hover:text-foreground" : "text-foreground")),
								children: i.label
							})
						}),
						/* @__PURE__ */ (0, z.jsx)("span", { "aria-hidden": "true" }),
						/* @__PURE__ */ (0, z.jsx)("span", {
							className: "text-right text-[13px] tabular-nums text-muted-foreground",
							children: Wi(i.durationMs, { locale: w })
						})
					]
				})
			}, i.id);
		}), /* @__PURE__ */ (0, z.jsx)("li", {
			"aria-hidden": "true",
			className: "pointer-events-none relative col-start-2",
			style: { gridRow: `1 / span ${d.length}` },
			children: /* @__PURE__ */ (0, z.jsxs)("div", {
				ref: u,
				className: "oats-lanes-draw absolute inset-0",
				children: [
					p > 0 && v && /* @__PURE__ */ (0, z.jsx)("svg", {
						width: "100%",
						height: "100%",
						viewBox: `0 0 ${p} ${g}`,
						preserveAspectRatio: "none",
						className: "absolute inset-0 overflow-visible",
						children: /* @__PURE__ */ (0, z.jsx)("path", {
							d: v,
							fill: "none",
							stroke: "var(--color-muted-foreground)",
							strokeWidth: B.line,
							strokeLinecap: "round",
							strokeLinejoin: "round",
							vectorEffect: "non-scaling-stroke"
						})
					}),
					S.map((e) => /* @__PURE__ */ (0, z.jsx)("span", {
						className: "absolute flex -translate-x-1/2 -translate-y-1/2 rounded-full bg-card",
						style: {
							left: `${e.x * 100}%`,
							top: y(e.row),
							padding: B.ring
						},
						children: /* @__PURE__ */ (0, z.jsx)(Ki, {
							state: e.state,
							className: "block"
						})
					}, e.id)),
					x && /* @__PURE__ */ (0, z.jsx)("span", {
						className: "absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary",
						style: {
							left: `${x.x * 100}%`,
							top: y(x.row),
							width: B.dot * 2,
							height: B.dot * 2,
							boxShadow: `0 0 0 ${B.ring}px var(--color-card)`
						}
					})
				]
			})
		})]
	});
}
//#endregion
//#region src/components/conversation/ConversationFlow.tsx
var Da = {
	live: "bg-primary",
	open: "bg-muted-foreground",
	resolved: "bg-muted-foreground",
	dropped: "border-[1.5px] border-muted-foreground bg-card"
}, Oa = 6.9, ka = 2, Aa = 6, ja = 2, Ma = 4, Na = [], Pa = [];
function Fa(e, t) {
	let n = Aa + B.dot, r = ja + B.dot;
	return e === "left" ? `translate(calc(-100% + ${n}px), -50%)` : e === "right" ? `translate(${-n}px, -50%)` : `translate(${t === "start" ? `${-n}px` : t === "end" ? `calc(-100% + ${n}px)` : "-50%"}, ${e === "above" ? `calc(-100% + ${r}px)` : `${-r}px`})`;
}
var Ia = {
	right: "flex-row gap-2",
	left: "flex-row-reverse gap-2",
	above: "flex-col-reverse gap-1",
	below: "flex-col gap-1"
}, La = {
	center: "items-center",
	start: "items-start",
	end: "items-end"
}, Ra = {
	center: "items-center text-center",
	start: "items-start text-left",
	end: "items-end text-right"
};
function za(e) {
	let t = 0;
	for (let n of e?.nodes ?? []) t = Math.max(t, n?.lastAt ?? 0);
	return t;
}
function Ba(e) {
	let t = Infinity;
	for (let n of e?.nodes ?? []) t = Math.min(t, n?.firstAt ?? Infinity);
	return Number.isFinite(t) ? t : 0;
}
function Va({ snapshot: e, segments: t = Na, startedAt: n, suggestions: r = Pa, live: i = !1, now: a, view: o, onViewChange: s, compact: c = !1, className: l }) {
	let { t: u } = ot(), d = (0, _.useId)(), f = n === void 0 ? i ? null : Ba(e) : n, p = (0, _.useMemo)(() => Bi({
		snapshot: e,
		segments: t,
		start: i && typeof f == "number" ? f : NaN,
		end: i ? a ?? Date.now() : NaN,
		live: i
	}), [
		e,
		t,
		f,
		i,
		a
	]), m = (0, _.useMemo)(() => wi({
		snapshot: e,
		startedAt: f ?? 0,
		now: i ? a ?? Date.now() : za(e)
	}), [
		e,
		f,
		i,
		a
	]), h = p.empty, g = Ca(u, o === "graph" ? {
		topics: m.points.length,
		returns: m.links.filter((e) => e.kind === "return").length
	} : {
		topics: p.rows.length,
		returns: p.returns.length
	}), [v, y] = (0, _.useState)(null), [b, x] = (0, _.useState)(!1), S = (e) => {
		x(!0), y((t) => t === e ? null : e);
	}, C = (0, _.useMemo)(() => e?.nodes?.find((e) => e?.id === v) ?? null, [e, v]), w = (0, _.useMemo)(() => Mi(C, t), [C, t]), T = w && typeof w.timestamp == "number" && typeof f == "number" ? Ii(w.timestamp - f) : "", E = (0, _.useMemo)(() => {
		let e = /* @__PURE__ */ new Set();
		return r.filter((t) => t.kind !== "adjacent" || !t.label || e.has(t.label) ? !1 : (e.add(t.label), !0));
	}, [r]);
	return /* @__PURE__ */ (0, z.jsxs)(gr, {
		role: "region",
		"aria-labelledby": d,
		className: R("gap-0 overflow-hidden", l),
		children: [
			/* @__PURE__ */ (0, z.jsxs)(_r, {
				className: "shrink-0 flex-row flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-4",
				children: [/* @__PURE__ */ (0, z.jsxs)("div", {
					className: "flex min-h-8 min-w-0 flex-col justify-center gap-1.5",
					children: [
						/* @__PURE__ */ (0, z.jsx)(vr, {
							id: d,
							children: u("oats.flow.title")
						}),
						g && /* @__PURE__ */ (0, z.jsx)("p", {
							className: "text-[13px] text-muted-foreground",
							children: g
						}),
						h && /* @__PURE__ */ (0, z.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: u("oats.flow.empty")
						})
					]
				}), /* @__PURE__ */ (0, z.jsx)(br, {
					className: "h-8",
					"aria-label": u("oats.flow.viewLabel"),
					value: o,
					onValueChange: s,
					options: xa(u)
				})]
			}),
			!h && /* @__PURE__ */ (0, z.jsxs)(z.Fragment, { children: [/* @__PURE__ */ (0, z.jsx)("div", {
				className: "min-h-0 overflow-y-auto border-t border-border",
				style: o === "lanes" ? { maxHeight: 8.5 * 30 } : void 0,
				children: o === "lanes" ? /* @__PURE__ */ (0, z.jsx)(Ea, {
					lanes: p,
					selected: v,
					onSelect: S,
					live: i
				}) : /* @__PURE__ */ (0, z.jsx)(Ha, {
					map: m,
					compact: c,
					selected: v,
					onSelect: S
				})
			}), b && /* @__PURE__ */ (0, z.jsx)("div", {
				className: R("shrink-0 border-t border-border px-5", c ? "pb-2 pt-2" : "pb-3 pt-2.5"),
				children: /* @__PURE__ */ (0, z.jsx)("p", {
					className: "line-clamp-2 h-10 text-[13px] leading-5 text-muted-foreground",
					children: C && /* @__PURE__ */ (0, z.jsxs)(z.Fragment, { children: [
						/* @__PURE__ */ (0, z.jsx)("span", {
							className: "font-medium text-foreground",
							children: C.label
						}),
						T && /* @__PURE__ */ (0, z.jsx)("span", {
							className: "ml-2 tabular-nums",
							children: T
						}),
						/* @__PURE__ */ (0, z.jsx)("span", {
							className: "ml-2",
							children: w ? u("oats.flow.quote", { text: String(w.text ?? "").trim() }) : u("oats.flow.noQuote")
						})
					] })
				})
			})] }),
			E.length > 0 && /* @__PURE__ */ (0, z.jsxs)(yr, {
				className: "shrink-0 flex-wrap gap-2 text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, z.jsx)("span", { children: u("oats.flow.earlier") }), E.map((e) => /* @__PURE__ */ (0, z.jsx)(hr, {
					variant: "outline",
					children: e.label
				}, e.label))]
			})
		]
	});
}
function Ha({ map: e, compact: t, selected: n, onSelect: r }) {
	let { t: i } = ot(), a = (0, _.useRef)(null), [o, s] = (0, _.useState)({
		width: 0,
		height: 0
	});
	(0, _.useLayoutEffect)(() => {
		let e = a.current;
		if (!e) return;
		let t = (e, t) => s((n) => n.width === e && n.height === t ? n : {
			width: e,
			height: t
		}), { width: n, height: r } = e.getBoundingClientRect();
		t(n, r);
		let i = new ResizeObserver(([e]) => t(e.contentRect.width, e.contentRect.height));
		return i.observe(e), () => i.disconnect();
	}, []);
	let c = (0, _.useMemo)(() => H(e.points, {
		...o,
		charPx: Oa,
		plateX: Aa,
		plateY: Ma
	}), [e.points, o]), l = B.dot + B.ring + ka;
	return /* @__PURE__ */ (0, z.jsx)("div", {
		className: R("px-5 pb-1", t ? "pt-3" : "pt-4"),
		children: /* @__PURE__ */ (0, z.jsxs)("div", {
			ref: a,
			className: R("relative w-full", t ? "h-28" : "h-56"),
			children: [o.width > 0 && /* @__PURE__ */ (0, z.jsx)("svg", {
				"aria-hidden": "true",
				width: "100%",
				height: "100%",
				viewBox: `0 0 ${o.width} ${o.height}`,
				preserveAspectRatio: "none",
				className: "absolute inset-0 overflow-visible",
				children: [...e.links].sort((e, t) => Number(e.kind === "return") - Number(t.kind === "return")).map((e) => {
					let t = Fi({
						x1: e.x1 * o.width,
						y1: e.y1 * o.height,
						x2: e.x2 * o.width,
						y2: e.y2 * o.height,
						r1: l,
						r2: l
					});
					return t ? /* @__PURE__ */ (0, z.jsx)("path", {
						d: t,
						fill: "none",
						stroke: e.kind === "return" ? "var(--color-foreground)" : "var(--color-muted-foreground)",
						strokeWidth: B.line,
						strokeLinecap: "round",
						vectorEffect: "non-scaling-stroke"
					}, `${e.from}-${e.to}`) : null;
				})
			}), /* @__PURE__ */ (0, z.jsx)("ul", {
				className: "absolute inset-0",
				"aria-label": i("oats.flow.graphLabel", { count: e.points.length }),
				children: e.points.map((e) => {
					let t = e.id === n, a = e.state === "live", { side: o, align: s, hidden: l, lines: u } = c.get(e.id) ?? {
						side: "right",
						align: "center",
						hidden: !1
					}, d = Sa(i, e.state), f = e.returns > 0 ? i("oats.flow.nodeNameBack", {
						label: e.label,
						state: d,
						back: i("oats.flow.back", { count: e.returns })
					}) : i("oats.flow.nodeName", {
						label: e.label,
						state: d
					});
					return /* @__PURE__ */ (0, z.jsx)("li", {
						className: "absolute",
						style: {
							left: `${e.x * 100}%`,
							top: `${e.y * 100}%`
						},
						children: /* @__PURE__ */ (0, z.jsxs)("button", {
							type: "button",
							"aria-pressed": t,
							"aria-label": f,
							title: l ? e.label : void 0,
							onClick: () => r(e.id),
							style: { transform: Fa(o, s) },
							className: R("group flex min-h-6 rounded-md px-1.5 py-0.5 text-[13px] leading-4 whitespace-nowrap", Ia[o] ?? Ia.right, o === "left" || o === "right" ? "items-center" : La[s] ?? La.center, "outline-none transition-colors duration-150 motion-reduce:transition-none", "focus-visible:ring-[3px] focus-visible:ring-ring/50", t ? "bg-muted text-foreground" : a ? "bg-card font-medium text-foreground hover:bg-muted" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground", t && a && "font-medium"),
							children: [/* @__PURE__ */ (0, z.jsx)("span", {
								"aria-hidden": "true",
								className: R("inline-block shrink-0 rounded-full ring-2", t ? "ring-muted" : "ring-card group-hover:ring-muted", Da[e.state] ?? Da.dropped),
								style: {
									width: B.dot * 2,
									height: B.dot * 2
								}
							}), /* @__PURE__ */ (0, z.jsx)("span", {
								"aria-hidden": "true",
								className: l ? "sr-only" : u ? R("flex flex-col", Ra[o === "left" ? "end" : o === "right" ? "start" : s]) : void 0,
								children: !l && u ? u.map((e, t) => /* @__PURE__ */ (0, z.jsx)("span", { children: e }, t)) : e.label
							})]
						})
					}, e.id);
				})
			})]
		})
	});
}
//#endregion
//#region src/components/demo/DemoFlow.tsx
var Ua = [];
function Wa({ conversation: e, className: t }) {
	let [n, r] = (0, _.useState)("lanes");
	return /* @__PURE__ */ (0, z.jsx)(Va, {
		snapshot: e.snapshot,
		segments: e.segments,
		suggestions: Ua,
		view: n,
		onViewChange: r,
		className: t
	});
}
//#endregion
//#region ../summaries/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
function Ga(e, t) {
	if (typeof e == "function") return e(t);
	e != null && (e.current = t);
}
function Ka(...e) {
	return (t) => {
		let n = !1, r = e.map((e) => {
			let r = Ga(e, t);
			return !n && typeof r == "function" && (n = !0), r;
		});
		if (n) return () => {
			for (let t = 0; t < r.length; t++) {
				let n = r[t];
				typeof n == "function" ? n() : Ga(e[t], null);
			}
		};
	};
}
function qa(...e) {
	return _.useCallback(Ka(...e), e);
}
//#endregion
//#region ../summaries/node_modules/@radix-ui/react-slot/dist/index.mjs
// @__NO_SIDE_EFFECTS__
function Ja(e) {
	let t = _.forwardRef((t, n) => {
		let { children: r, ...i } = t, a = null, o = !1, s = [];
		no(r) && typeof oo == "function" && (r = oo(r._payload)), _.Children.forEach(r, (e) => {
			if (eo(e)) {
				o = !0;
				let t = e, n = "child" in t.props ? t.props.child : t.props.children;
				no(n) && typeof oo == "function" && (n = oo(n._payload)), a = Za(t, n), s.push(a?.props?.children);
			} else s.push(e);
		}), a ? a = _.cloneElement(a, void 0, s) : !o && _.Children.count(r) === 1 && _.isValidElement(r) && (a = r);
		let c = a ? $a(a) : void 0, l = qa(n, c);
		if (!a) {
			if (r || r === 0) throw Error(o ? ao(e) : io(e));
			return r;
		}
		let u = Qa(i, a.props ?? {});
		return a.type !== _.Fragment && (u.ref = n ? l : c), _.cloneElement(a, u);
	});
	return t.displayName = `${e}.Slot`, t;
}
var Ya = /* @__PURE__ */ Ja("Slot"), Xa = Symbol.for("radix.slottable"), Za = (e, t) => {
	if ("child" in e.props) {
		let t = e.props.child;
		return _.isValidElement(t) ? _.cloneElement(t, void 0, e.props.children(t.props.children)) : null;
	}
	return _.isValidElement(t) ? t : null;
};
function Qa(e, t) {
	let n = { ...t };
	for (let r in t) {
		let i = e[r], a = t[r];
		/^on[A-Z]/.test(r) ? i && a ? n[r] = (...e) => {
			let t = a(...e);
			return i(...e), t;
		} : i && (n[r] = i) : r === "style" ? n[r] = {
			...i,
			...a
		} : r === "className" && (n[r] = [i, a].filter(Boolean).join(" "));
	}
	return {
		...e,
		...n
	};
}
function $a(e) {
	let t = Object.getOwnPropertyDescriptor(e.props, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning;
	return n ? e.ref : (t = Object.getOwnPropertyDescriptor(e, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
function eo(e) {
	return _.isValidElement(e) && typeof e.type == "function" && "__radixId" in e.type && e.type.__radixId === Xa;
}
var to = Symbol.for("react.lazy");
function no(e) {
	return typeof e == "object" && !!e && "$$typeof" in e && e.$$typeof === to && "_payload" in e && ro(e._payload);
}
function ro(e) {
	return typeof e == "object" && !!e && "then" in e;
}
var io = (e) => `${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`, ao = (e) => `${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`, oo = _.use, so = Bt([
	"inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap",
	"rounded-md text-sm font-medium",
	"transition-[color,background-color,border-color,box-shadow,transform] duration-150",
	"active:scale-[0.98] motion-reduce:active:scale-100",
	"outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
	"disabled:pointer-events-none disabled:opacity-50",
	"aria-invalid:border-destructive aria-invalid:ring-destructive/20",
	"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
].join(" "), {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
			destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/30",
			success: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
			record: "bg-recording text-recording-foreground shadow-xs hover:bg-recording/90 focus-visible:ring-recording/30",
			outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/20 dark:hover:bg-input/40",
			"outline-flat": "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
			secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
			ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60",
			link: "h-auto px-0 text-foreground underline-offset-4 hover:underline",
			social: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground"
		},
		size: {
			default: "h-9 px-4 has-[>svg]:px-3",
			sm: "h-8 gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
			xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
			lg: "h-10 px-6 has-[>svg]:px-4",
			icon: "size-9",
			"icon-sm": "size-8",
			"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3.5"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function co({ className: e, variant: t, size: n, asChild: r = !1, ...i }) {
	return /* @__PURE__ */ (0, z.jsx)(r ? Ya : "button", {
		"data-slot": "button",
		className: R(so({
			variant: t,
			size: n,
			className: e
		})),
		...i
	});
}
//#endregion
//#region src/utils/searchHost.ts
function lo(e) {
	if (!e) return "";
	try {
		return new URL(e).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
//#endregion
//#region src/helpers/questionAnnouncement.mjs
function U(e, t) {
	let n = [];
	for (let r of e ?? []) !r?.id || t.has(r.id) || n.push(r);
	if (!n.length) return null;
	let r = n.map((e) => e.id), i = n.filter((e) => e.question);
	if (!i.length) return {
		ids: r,
		question: "",
		occurrence: 1,
		count: 0
	};
	let a = i[i.length - 1];
	return {
		ids: r,
		question: a.question,
		occurrence: Number.isFinite(a.occurrence) ? a.occurrence : 1,
		count: i.length
	};
}
var W = /* @__PURE__ */ new Set([
	"right",
	"wrong",
	"answer"
]);
function uo(e, t) {
	let n = [], r = null;
	for (let i of e ?? []) !i?.id || t.has(i.id) || !W.has(i.check?.state) || (n.push(i.id), r = i);
	return r ? {
		ids: n,
		state: r.check.state,
		answer: String(r.check.answer || ""),
		source: String(r.check.source?.label || "")
	} : null;
}
function fo(e, t) {
	let n = Math.max(0, Math.round((t - e) / 1e3));
	return n < 15 ? { kind: "now" } : n < 60 ? {
		kind: "ago",
		label: `${n}s`
	} : {
		kind: "ago",
		label: `${Math.round(n / 60)}m`
	};
}
//#endregion
//#region src/components/conversation/ConversationSignalRail.tsx
var po = 4, mo = 24;
function ho(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.groupKey);
		e ? e.push(n) : t.set(n.groupKey, [n]);
	}
	let n = (e) => e[e.length - 1].createdAt;
	return [...t.entries()].map(([e, t]) => ({
		key: e,
		cards: t.sort((e, t) => e.createdAt - t.createdAt)
	})).sort((e, t) => n(e.cards) - n(t.cards));
}
var go = {
	right: {
		badge: "success",
		icon: sa
	},
	wrong: {
		badge: "warning",
		icon: ga
	},
	answer: {
		badge: "info",
		icon: ra
	}
};
function _o({ source: e, quote: t, onOpenSource: n }) {
	let { t: r } = ot(), i = e.kind === "file" ? ca : e.kind === "link" ? la : ua, a = n && (e.kind === "file" || e.kind === "link") ? () => n(e) : null, o = r("questionCard.check.quote", { quote: t });
	return a ? /* @__PURE__ */ (0, z.jsxs)(co, {
		type: "button",
		variant: "ghost",
		size: "xs",
		onClick: a,
		title: o,
		"aria-label": r("questionCard.check.openSource", { source: e.label }),
		className: "-mx-2 max-w-full justify-start text-muted-foreground",
		children: [/* @__PURE__ */ (0, z.jsx)(i, { "aria-hidden": "true" }), /* @__PURE__ */ (0, z.jsx)("span", {
			className: "truncate",
			children: e.label
		})]
	}) : /* @__PURE__ */ (0, z.jsxs)("span", {
		title: o,
		className: "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
		children: [/* @__PURE__ */ (0, z.jsx)(i, {
			"aria-hidden": "true",
			className: "size-3.5 shrink-0"
		}), /* @__PURE__ */ (0, z.jsx)("span", {
			className: "truncate",
			children: e.label
		})]
	});
}
function vo({ check: e, onOpenSource: t }) {
	let { t: n } = ot();
	if (e.state === "checking") return /* @__PURE__ */ (0, z.jsxs)("div", {
		className: "mt-2 grid gap-1.5",
		children: [/* @__PURE__ */ (0, z.jsx)("p", {
			className: "text-xs text-muted-foreground",
			children: e.by === "agent" ? e.sources?.length ? n("questionCard.check.checkingSources", { sources: e.sources.join(", ") }) : n("questionCard.check.checkingAgent") : n("questionCard.check.checking")
		}), /* @__PURE__ */ (0, z.jsx)("span", {
			"aria-hidden": "true",
			className: "h-2.5 w-2/3 rounded-full bg-muted motion-safe:animate-pulse"
		})]
	});
	let r = go[e.state], i = r.icon;
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		className: "mt-2 grid min-w-0 gap-1",
		children: [/* @__PURE__ */ (0, z.jsxs)("div", {
			className: "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
			children: [/* @__PURE__ */ (0, z.jsxs)(hr, {
				variant: r.badge,
				children: [/* @__PURE__ */ (0, z.jsx)(i, { "aria-hidden": "true" }), n(`questionCard.check.${e.state}`)]
			}), /* @__PURE__ */ (0, z.jsx)("span", {
				className: "min-w-0 text-[13px] font-medium text-foreground",
				children: e.answer
			})]
		}), /* @__PURE__ */ (0, z.jsx)(_o, {
			source: e.source,
			quote: e.quote,
			onOpenSource: t
		})]
	});
}
function yo({ card: e, now: t, nested: n, searchHost: r, onSearch: i, onOpenSource: a }) {
	let { t: o } = ot();
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		className: "flex items-start gap-3",
		children: [/* @__PURE__ */ (0, z.jsx)(Ki, {
			state: e.state,
			className: "mt-1.5"
		}), /* @__PURE__ */ (0, z.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [
				/* @__PURE__ */ (0, z.jsx)("p", {
					className: R("text-pretty leading-snug text-foreground", n ? "text-[13px]" : "text-sm font-medium"),
					children: e.question
				}),
				/* @__PURE__ */ (0, z.jsxs)("div", {
					className: "mt-1 flex min-h-6 items-center gap-2 text-xs text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, z.jsx)("span", { children: o(`questionCard.state.${e.state}`) }),
						/* @__PURE__ */ (0, z.jsx)("span", {
							"aria-hidden": "true",
							children: "·"
						}),
						/* @__PURE__ */ (0, z.jsx)("span", {
							className: "tabular-nums",
							children: (() => {
								let n = fo(e.createdAt, t);
								return n.kind === "now" ? o("questionCard.now") : n.label;
							})()
						}),
						/* @__PURE__ */ (0, z.jsx)("span", { className: "flex-1" }),
						e.searched ? /* @__PURE__ */ (0, z.jsx)("span", { children: (() => {
							let t = lo(e.searchBaseUrl || "") || r;
							return t ? o("questionCard.searchedHost", { host: t }) : o("questionCard.searched");
						})() }) : i ? /* @__PURE__ */ (0, z.jsxs)(co, {
							type: "button",
							variant: "ghost",
							size: "xs",
							onClick: () => i(e),
							className: "-my-1 text-muted-foreground",
							children: [/* @__PURE__ */ (0, z.jsx)(ha, { "aria-hidden": "true" }), o("topicGraph.search")]
						}) : null
					]
				}),
				e.check && /* @__PURE__ */ (0, z.jsx)(vo, {
					check: e.check,
					onOpenSource: a
				})
			]
		})]
	});
}
function bo({ group: e, now: t, index: n, searchHost: r, onDismiss: i, onSearch: a, onOpenSource: o, onFocus: s }) {
	let { t: c } = ot(), [l, ...u] = e.cards;
	return /* @__PURE__ */ (0, z.jsxs)("li", {
		className: "oats-enter relative py-3 first:pt-0 last:pb-0",
		style: { animationDelay: `${n * mo}ms` },
		onMouseEnter: () => s(e.key),
		onMouseLeave: () => s(null),
		onFocus: () => s(e.key),
		onBlur: () => s(null),
		children: [
			/* @__PURE__ */ (0, z.jsx)("div", {
				className: "pr-8",
				children: /* @__PURE__ */ (0, z.jsx)(yo, {
					card: l,
					now: t,
					nested: !1,
					searchHost: r,
					onSearch: a,
					onOpenSource: o
				})
			}),
			u.length > 0 && /* @__PURE__ */ (0, z.jsx)("div", {
				className: "ml-[3px] mt-2.5 space-y-2.5 border-l border-border pl-4",
				children: u.map((e) => /* @__PURE__ */ (0, z.jsx)(yo, {
					card: e,
					now: t,
					nested: !0,
					searchHost: r,
					onSearch: a,
					onOpenSource: o
				}, e.id))
			}),
			/* @__PURE__ */ (0, z.jsx)(co, {
				type: "button",
				variant: "ghost",
				size: "icon-xs",
				"aria-label": c("questionCard.dismiss"),
				onClick: () => i(e.cards),
				className: R("absolute right-0 text-muted-foreground", n === 0 ? "-top-0.5" : "top-2.5"),
				children: /* @__PURE__ */ (0, z.jsx)(ya, { "aria-hidden": "true" })
			})
		]
	});
}
function xo({ cards: e, onFocus: t, announceOnly: n = !1, searchHost: r = "", onSearch: i, onDismiss: a, onOpenSource: o, className: s }) {
	let { t: c } = ot(), [l, u] = (0, _.useState)(/* @__PURE__ */ new Set()), [d, f] = (0, _.useState)(null), [p, m] = (0, _.useState)(!1), [h, g] = (0, _.useState)(() => Date.now());
	(0, _.useEffect)(() => {
		let e = window.setInterval(() => g(Date.now()), 15e3);
		return () => window.clearInterval(e);
	}, []);
	let v = (0, _.useMemo)(() => ho(e.filter((e) => !l.has(e.id))), [e, l]), y = (0, _.useCallback)((e) => {
		u((t) => {
			let n = new Set(t);
			for (let t of e) n.add(t.id);
			return n;
		}), f(e), a?.(e);
	}, [a]), b = (0, _.useCallback)(() => {
		let e = d;
		e && (f(null), u((t) => {
			let n = new Set(t);
			for (let t of e) n.delete(t.id);
			return n;
		}));
	}, [d]);
	(0, _.useEffect)(() => {
		if (!d) return;
		let e = window.setTimeout(() => f(null), 6e3);
		return () => window.clearTimeout(e);
	}, [d]);
	let x = (0, _.useRef)(/* @__PURE__ */ new Set()), [S, C] = (0, _.useState)(null);
	(0, _.useEffect)(() => {
		let t = U(e, x.current);
		if (t) {
			for (let e of t.ids) x.current.add(e);
			t.count > 0 && C(t);
		}
	}, [e]);
	let w = S ? S.count > 1 ? c("questionCard.announcedBatch", {
		count: S.count,
		question: S.question
	}) : S.occurrence > 1 ? c("questionCard.announcedAgain", {
		count: S.occurrence,
		question: S.question
	}) : c("questionCard.announced", { question: S.question }) : "", T = (0, _.useRef)(/* @__PURE__ */ new Set()), [E, ee] = (0, _.useState)("");
	(0, _.useEffect)(() => {
		let t = uo(e, T.current);
		if (t) {
			for (let e of t.ids) T.current.add(e);
			ee(c(`questionCard.check.announced.${t.state}`, {
				answer: t.answer,
				source: t.source
			}));
		}
	}, [e, c]);
	let D = Math.max(0, v.length - po), te = [...v].reverse(), ne = p ? te : te.slice(0, po);
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		className: R("mt-6 flex w-full flex-col gap-3", s),
		children: [
			/* @__PURE__ */ (0, z.jsx)("p", {
				"aria-live": "polite",
				className: "sr-only",
				children: w
			}),
			/* @__PURE__ */ (0, z.jsx)("p", {
				"aria-live": "polite",
				className: "sr-only",
				children: E
			}),
			n || !v.length && !d ? null : /* @__PURE__ */ (0, z.jsxs)(z.Fragment, { children: [
				d && /* @__PURE__ */ (0, z.jsxs)(co, {
					type: "button",
					variant: "ghost",
					size: "xs",
					onClick: b,
					className: "self-start text-muted-foreground",
					children: [/* @__PURE__ */ (0, z.jsx)(_a, { "aria-hidden": "true" }), c("questionCard.undo")]
				}),
				D > 0 && /* @__PURE__ */ (0, z.jsxs)(co, {
					type: "button",
					variant: "ghost",
					size: "xs",
					onClick: () => m((e) => !e),
					"aria-expanded": p,
					className: "self-start text-muted-foreground",
					children: [/* @__PURE__ */ (0, z.jsx)(oa, {
						"aria-hidden": "true",
						className: R("transition-transform", p && "rotate-180")
					}), p ? c("questionCard.collapse") : c("questionCard.earlier", { count: D })]
				}),
				/* @__PURE__ */ (0, z.jsx)("ol", {
					className: "divide-y divide-border",
					children: ne.map((e, n) => /* @__PURE__ */ (0, z.jsx)(bo, {
						group: e,
						now: h,
						index: n,
						searchHost: r,
						onDismiss: y,
						onSearch: i,
						onOpenSource: o,
						onFocus: t
					}, e.key))
				})
			] })
		]
	});
}
//#endregion
//#region src/components/demo/demoMotion.ts
var So = () => typeof window < "u" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === !0;
//#endregion
//#region src/components/demo/useInView.ts
function Co(e, t = .25) {
	let [n, r] = (0, _.useState)(!1);
	return (0, _.useEffect)(() => {
		let n = e.current;
		if (!n) return;
		if (typeof IntersectionObserver > "u") {
			r(!0);
			return;
		}
		let i = new IntersectionObserver((e) => r(e[e.length - 1]?.isIntersecting ?? !1), { threshold: t });
		return i.observe(n), () => i.disconnect();
	}, [e, t]), n;
}
//#endregion
//#region src/components/demo/DemoQuestions.tsx
var wo = () => {};
function To({ conversation: e, replay: t = !1 }) {
	let { t: n } = ot(), [r] = (0, _.useState)(So), [i, a] = (0, _.useState)(() => Date.now()), [o, s] = (0, _.useState)(() => r ? Nt : 0), [c, l] = (0, _.useState)(0), u = (0, _.useRef)(null), d = Co(u, .5), [f, p] = (0, _.useState)(!t);
	(0, _.useEffect)(() => {
		d && p(!0);
	}, [d]), (0, _.useEffect)(() => {
		if (r || !f) return;
		let e = Mt.slice(1).map((e, t) => window.setTimeout(() => s(t + 1), e));
		return () => e.forEach((e) => window.clearTimeout(e));
	}, [
		r,
		f,
		c
	]);
	let m = (0, _.useMemo)(() => Ft(e, {
		now: i,
		step: o
	}), [
		e,
		i,
		o
	]);
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		ref: u,
		children: [/* @__PURE__ */ (0, z.jsx)(xo, {
			cards: m,
			onFocus: wo,
			className: "mt-0"
		}, c), t && !r && /* @__PURE__ */ (0, z.jsxs)(co, {
			type: "button",
			variant: "ghost",
			size: "sm",
			onClick: () => {
				s(0), a(Date.now()), l((e) => e + 1);
			},
			className: "-ml-2.5 mt-4 text-muted-foreground",
			children: [/* @__PURE__ */ (0, z.jsx)(ma, { "aria-hidden": "true" }), n("demo.questions.replay")]
		})]
	});
}
//#endregion
//#region src/components/conversation/ConversationContour.tsx
var Eo = .5, Do = .08, Oo = B.focusDot + B.ring + 1, ko = 10;
function Ao(e) {
	let t = e.length;
	if (t < 2) return e.map((e) => e.y);
	let n = (e[t - 1].x - e[0].x) / (t - 1) || 1, r = Math.max(1, Math.round(ko / n)), i = (e) => Math.max(0, e - r), a = (e) => Math.min(t - 1, e + r), o = e.map((t, n) => {
		let r = Infinity;
		for (let t = i(n); t <= a(n); t += 1) r = Math.min(r, e[t].y);
		return r;
	});
	return o.map((e, t) => {
		let n = 0;
		for (let e = i(t); e <= a(t); e += 1) n += o[e];
		return n / (a(t) - i(t) + 1);
	});
}
function jo({ contour: e, className: t, height: n = 96, showMarks: r = !0, label: i, focusedGroup: a = null, onPick: o, pickLabel: s }) {
	let c = (0, _.useRef)(null), [l, u] = (0, _.useState)(null), [d, f] = (0, _.useState)(null), p = !!o && !e.empty && e.span > 0, m = (t) => (e.start ?? 0) + t * e.span;
	(0, _.useEffect)(() => {
		let e = c.current;
		if (e) return oi(e, u);
	}, []), (0, _.useEffect)(() => {
		let t = c.current;
		if (!t || !l) return;
		let n = (n) => {
			t.style.transition = "none";
			let r = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
			if (!e.live || r || !e.span) {
				t.style.transform = "";
				return;
			}
			let i = (e.start ?? 0) + e.span - Lr, a = Math.min(1, Math.max(0, (Date.now() - i) / Lr));
			t.style.transform = `translateX(${(-a * n).toFixed(2)}px)`, t.offsetWidth, t.style.transition = `transform ${Math.round((1 - a) * Lr)}ms linear`, t.style.transform = `translateX(${(-n).toFixed(2)}px)`;
		};
		return si(t, ({ ctx: t, width: i, height: o }) => {
			let s = e.live ? Math.max(1, e.points.length) : 0, c = e.live ? i * (s / (s + 1)) : i;
			if (!c || !o) return;
			n(c / Math.max(1, s));
			let u = Math.round(o - (r ? 14 : 3)), d = Math.max(4, u - (r ? Oo : 3)), f = (e) => u - e * d, p = (e) => e * (c - 1), m = e.live ? Math.min(c, Math.max(0, p(e.sessionX ?? 0))) : 0, h = (e) => {
				t.beginPath(), t.moveTo(e, u + .5), t.lineTo(i, u + .5), t.lineWidth = B.rule, t.lineCap = "butt", t.strokeStyle = l.rule, t.stroke();
			};
			if (e.empty || !e.points.length) {
				h(0);
				return;
			}
			let g = (e.live ? e.points.filter((e) => !e.before) : e.points).map((e) => ({
				x: p(e.x),
				y: f(e.y)
			})), _ = wr(g), v = g[0], y = g[g.length - 1], b = (e) => {
				e.moveTo(v.x, u), e.lineTo(v.x, v.y), li(e, g, _), e.lineTo(y.x, u), e.closePath();
			};
			if (g.length > 1 && o < 24) vi(t, b, l.quiet);
			else if (g.length > 1) {
				let n = Ao(g), r = (e, t) => n[t] + e * (u - n[t]);
				t.save(), t.beginPath(), b(t), t.clip(), _i(t, (e, t, n) => {
					if (t <= 0 ? (e.moveTo(v.x, 0), e.lineTo(y.x, 0)) : g.forEach((n, i) => e.lineTo(n.x, r(t, i))), n >= 1) e.lineTo(y.x, u), e.lineTo(v.x, u);
					else for (let t = g.length - 1; t >= 0; --t) e.lineTo(g[t].x, r(n, t));
					e.closePath();
				}, l.quiet, Eo, Do, e.live ? { origin: {
					x: p(e.sessionX ?? 0),
					y: 0
				} } : {}), t.restore();
			}
			if (h(m), t.lineWidth = B.rule, t.lineCap = "butt", e.live && r) {
				t.strokeStyle = l.rule, t.beginPath();
				for (let n of e.ticks ?? []) {
					let e = Math.round(p(n.x)) + .5;
					e < m || (t.moveTo(e, u + 1), t.lineTo(e, u + 4));
				}
				t.stroke();
			}
			if (r) {
				t.strokeStyle = l.quiet, t.beginPath();
				for (let n of e.shifts) {
					let e = Math.round(p(n.x)) + .5;
					t.moveTo(e, u - 3), t.lineTo(e, u + 4);
				}
				t.stroke();
			}
			if (g.length > 1 && (t.beginPath(), t.moveTo(v.x, v.y), li(t, g, _), t.lineWidth = B.line, t.lineCap = "round", t.lineJoin = "round", t.strokeStyle = l.quiet, t.stroke()), !r) return;
			t.fillStyle = l.ink;
			for (let n of e.moments ?? []) {
				let e = Math.min(c - 4, Math.max(4, Math.round(p(n.x)))) + .5;
				t.beginPath(), t.moveTo(e, u + 5), t.lineTo(e + 3.5, u + 11), t.lineTo(e - 3.5, u + 11), t.closePath(), t.fill();
			}
			let x = (e) => a !== null && e.groupKey === a, S = (e) => x(e) ? 2 : Yr(e.state) === "open" ? 0 : 1, C = [...e.marks].sort((e, t) => S(e) - S(t) || e.x - t.x);
			for (let e of C) {
				let n = x(e), r = n ? B.focusDot : B.dot, i = r + B.ring, a = Math.min(c - i, Math.max(i, p(e.x)));
				ci(t, a, g.length ? Tr(g, _, a) : u, Yr(e.state), l, r, { focus: n });
			}
		});
	}, [
		e,
		l,
		r,
		a
	]);
	let h = /* @__PURE__ */ (0, z.jsx)("canvas", {
		ref: c,
		role: i ? "img" : void 0,
		"aria-label": i,
		"aria-hidden": i ? void 0 : !0,
		className: R("block w-full", p ? "cursor-pointer" : void 0, !p && !e.live && t),
		style: e.live ? {
			height: n,
			width: `calc(100% * ${(e.points.length + 1) / Math.max(1, e.points.length)})`,
			willChange: "transform"
		} : { height: n },
		onPointerMove: p ? (e) => {
			let t = e.currentTarget.getBoundingClientRect();
			f(Math.min(1, Math.max(0, (e.clientX - t.left) / t.width)));
		} : void 0,
		onPointerLeave: p ? () => f(null) : void 0,
		onClick: p ? (e) => {
			let t = e.currentTarget.getBoundingClientRect(), n = Math.min(1, Math.max(0, (e.clientX - t.left) / t.width));
			o?.(m(n));
		} : void 0
	});
	return e.live ? /* @__PURE__ */ (0, z.jsx)("div", {
		className: R("overflow-hidden", t),
		children: h
	}) : p ? /* @__PURE__ */ (0, z.jsxs)("div", {
		className: R("relative", t),
		children: [h, d !== null && /* @__PURE__ */ (0, z.jsx)("div", {
			"aria-hidden": "true",
			className: "pointer-events-none absolute inset-y-0 w-px bg-primary",
			style: { left: `${d * 100}%` },
			children: s && /* @__PURE__ */ (0, z.jsx)("span", {
				className: "absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-muted-foreground",
				children: s(m(d))
			})
		})]
	}) : h;
}
//#endregion
//#region src/components/conversation/contourLabel.ts
function Mo(e, t) {
	if (e.empty) return t("oats.conversation.contourEmpty");
	if (e.summary) return t("oats.conversation.contourSummary", e.summary);
	let n = e.marks.filter((e) => e.state === "asked" || e.state === "silence" || e.state === "denied").length;
	return t("oats.conversation.contourSummary", {
		minutes: Math.max(1, Math.round(e.span / 6e4)),
		questions: e.marks.length,
		unresolved: n,
		shifts: e.shifts.length,
		returns: e.returns.length
	});
}
//#endregion
//#region src/helpers/conversationLoudness.mjs
var No = 1e3, Po = -90, Fo = 1;
function Io(e) {
	return e ? 10 ** ((Po + (e - 1) / 254 * 90) / 20) : null;
}
function Lo(e) {
	let t = atob(e), n = new Uint8Array(t.length);
	for (let e = 0; e < t.length; e += 1) n[e] = t.charCodeAt(e);
	return n;
}
function Ro(e) {
	if (typeof e != "string" || !e) return [];
	try {
		let t = JSON.parse(e);
		return !t || t.v !== Fo || !Array.isArray(t.runs) ? [] : t.runs.filter((e) => e && Number.isFinite(e.at) && typeof e.b == "string" && e.b);
	} catch {
		return [];
	}
}
function zo(e) {
	let t = [];
	for (let n of Ro(e)) {
		let e;
		try {
			e = Lo(n.b);
		} catch {
			continue;
		}
		for (let r = 0; r < e.length; r += 1) {
			let i = Io(e[r]);
			i !== null && t.push({
				at: n.at + r * No,
				level: i
			});
		}
	}
	return t.sort((e, t) => e.at - t.at);
}
//#endregion
//#region src/components/conversation/useContour.ts
var Bo = [], Vo = [];
function Ho(e) {
	return e.map((e) => ({
		id: String(e.id),
		label: e.label,
		state: e.state,
		startedAt: e.firstAt,
		lastTouchedAt: e.returns > 0 ? e.lastAt : e.firstAt
	}));
}
function Uo(e) {
	return e.map((e) => ({
		id: e.id,
		text: e.text,
		timestamp: e.timestamp,
		durationMs: Number.isFinite(e.startMs) && Number.isFinite(e.endMs) ? e.endMs - e.startMs : void 0
	}));
}
function Wo(e, t) {
	return t ? e === "answered" ? "answered" : e === "uncertain_response" ? "uncertain" : e === "silence" ? "silence" : "denied" : "asked";
}
function Go(e, t, n = Bo, r = Vo, i = null) {
	return (0, _.useMemo)(() => {
		let a = gt(t).filter((e) => e.question).map((e) => ({
			id: e.key,
			question: e.question?.text ?? "",
			state: Wo(ht(e.response), !!e.response),
			createdAt: e.question?.createdAt ?? e.createdAt,
			groupKey: e.key,
			occurrence: 1
		})).filter((e) => Number.isFinite(e.createdAt));
		return Ir({
			utterances: Uo(e),
			questions: a,
			topics: Ho(n),
			moments: r,
			levels: zo(i)
		});
	}, [
		e,
		t,
		n,
		r,
		i
	]);
}
//#endregion
//#region src/helpers/speakerTurns.mjs
function Ko(e) {
	let t = /^speaker_(\d+)$/.exec(String(e ?? ""));
	return t ? Number(t[1]) : null;
}
function qo(e) {
	if (!e) return null;
	let t = typeof e.speakerName == "string" ? e.speakerName.trim() : "";
	if (t && !e.speakerIsPlaceholder) return {
		kind: "name",
		name: t
	};
	let n = Ko(e.speaker);
	return n ? {
		kind: "number",
		n
	} : e.speaker === "room" ? null : { kind: e.source === "mic" ? "you" : "room" };
}
//#endregion
//#region src/utils/speakerLabel.ts
function Jo(e, t) {
	let n = qo(e);
	return n ? n.kind === "name" ? n.name : n.kind === "number" ? t("oats.intelligence.speakerN", { n: n.n }) : n.kind === "you" ? t("oats.intelligence.speakerYou") : t("oats.intelligence.speakerRoom") : null;
}
//#endregion
//#region src/components/charts/DitherBar.tsx
var Yo = .5;
function Xo({ className: e }) {
	let t = (0, _.useRef)(null), [n, r] = (0, _.useState)(null);
	return (0, _.useEffect)(() => {
		let e = t.current;
		if (e) return oi(e, r);
	}, []), (0, _.useEffect)(() => {
		let e = t.current;
		if (!(!e || !n)) return si(e, ({ ctx: e, width: t, height: r }) => {
			hi(e, (e) => e.roundRect(0, 0, t, r, Math.min(r, t) / 2), n.quiet, Yo);
		});
	}, [n]), /* @__PURE__ */ (0, z.jsx)("canvas", {
		ref: t,
		"aria-hidden": "true",
		className: R("block size-full", e)
	});
}
//#endregion
//#region src/components/conversation/TalkTime.tsx
function Zo({ talk: e, selected: t, onSelect: n, className: r }) {
	let { t: i, i18n: a } = ot(), o = (0, _.useMemo)(() => new Intl.NumberFormat(a.language, { style: "percent" }), [a.language]);
	if (e.speakers.length < 2) return null;
	let s = [...e.speakers.map((e) => ({
		key: e.key,
		ms: e.ms,
		percent: e.percent,
		label: Jo(e.segment, i) ?? ""
	})), ...e.unattributedMs > 0 ? [{
		key: null,
		ms: e.unattributedMs,
		percent: e.unattributedPercent,
		label: i("oats.intelligence.talkTime.unattributed")
	}] : []], c = Math.max(...s.map((e) => e.ms)), l = Math.ceil(s.length / 2), u = "col-span-3 grid grid-cols-subgrid items-center px-1.5 py-1";
	return /* @__PURE__ */ (0, z.jsx)("div", {
		role: "group",
		"aria-label": i("oats.intelligence.talkTime.label"),
		className: R("@container", r),
		children: /* @__PURE__ */ (0, z.jsx)("ul", {
			className: "-mx-1.5 grid grid-flow-row-dense grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto] gap-x-3 text-[13px] text-foreground @min-[420px]:grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto_0.25rem_minmax(0,max-content)_minmax(0,1fr)_auto]",
			children: s.map((e, r) => {
				let a = e.key !== null && t === e.key, s = /* @__PURE__ */ (0, z.jsxs)(z.Fragment, { children: [
					/* @__PURE__ */ (0, z.jsx)("span", {
						className: R("max-w-40 truncate", a && "font-medium"),
						children: e.label
					}),
					/* @__PURE__ */ (0, z.jsx)("span", {
						"aria-hidden": "true",
						className: "flex h-1.5 min-w-0",
						children: /* @__PURE__ */ (0, z.jsx)("span", {
							className: R("h-1.5 min-w-1.5 overflow-hidden rounded-[3px]", e.key === null && "bg-border", a && "bg-primary"),
							style: { width: `${e.ms / c * 100}%` },
							children: e.key !== null && !a && /* @__PURE__ */ (0, z.jsx)(Xo, {})
						})
					}),
					/* @__PURE__ */ (0, z.jsx)("span", {
						className: "text-right font-medium tabular-nums",
						children: o.format(e.percent / 100)
					})
				] }), d = r < l ? "@min-[420px]:col-start-1" : "@min-[420px]:col-start-5";
				if (e.key === null) return /* @__PURE__ */ (0, z.jsx)("li", {
					className: R(u, d),
					children: s
				}, "unattributed");
				let f = e.key;
				return /* @__PURE__ */ (0, z.jsx)("li", {
					className: R("col-span-3 grid grid-cols-subgrid", d),
					children: /* @__PURE__ */ (0, z.jsx)("button", {
						type: "button",
						"aria-pressed": a,
						title: a ? i("oats.intelligence.talkTime.everyone") : i("oats.intelligence.talkTime.show", { speaker: e.label }),
						onClick: () => n(f),
						className: R(u, "rounded-md text-left outline-none transition-colors", "hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"),
						children: s
					})
				}, f);
			})
		})
	});
}
//#endregion
//#region src/components/ui/input.tsx
function Qo({ className: e, type: t, ...n }) {
	return /* @__PURE__ */ (0, z.jsx)("input", {
		type: t,
		"data-slot": "input",
		className: R("flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs", "transition-[color,box-shadow,border-color] outline-none", "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground", "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground", "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50", "dark:bg-input/20", "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", "aria-invalid:border-destructive aria-invalid:ring-destructive/20", e),
		...n
	});
}
//#endregion
//#region src/helpers/talkTime.mjs
function $o(e) {
	let t = qo(e);
	return t ? t.kind === "name" ? `name:${t.name}` : t.kind === "number" ? `number:${t.n}` : t.kind : null;
}
function es(e) {
	let t = e.reduce((e, t) => e + t, 0);
	if (!(t > 0)) return e.map(() => 0);
	let n = e.map((e) => e / t * 100), r = n.map(Math.floor), i = 100 - r.reduce((e, t) => e + t, 0), a = n.map((e, t) => ({
		index: t,
		remainder: e - Math.floor(e)
	})).sort((e, t) => t.remainder - e.remainder || e.index - t.index);
	for (let { index: e } of a) {
		if (i <= 0) break;
		r[e] += 1, --i;
	}
	return r;
}
function ts(e) {
	let t = /* @__PURE__ */ new Map(), n = 0, r = 0;
	for (let i of Array.isArray(e) ? e : []) {
		if (!i || !Number.isFinite(i.startMs) || !Number.isFinite(i.endMs)) continue;
		let e = i.endMs - i.startMs;
		if (!(e > 0)) continue;
		let a = $o(i);
		if (!a) {
			n += e;
			continue;
		}
		let o = t.get(a);
		o ? o.ms += e : t.set(a, {
			key: a,
			ms: e,
			segment: i,
			order: r++
		});
	}
	let i = [...t.values()].sort((e, t) => t.ms - e.ms || e.order - t.order), a = i.reduce((e, t) => e + t.ms, 0) + n, o = es([...i.map((e) => e.ms), n]);
	return {
		totalMs: a,
		speakers: i.map((e, t) => ({
			key: e.key,
			ms: e.ms,
			percent: o[t],
			segment: e.segment
		})),
		unattributedMs: n,
		unattributedPercent: o[i.length]
	};
}
//#endregion
//#region src/helpers/searchFold.mjs
var ns = /\p{M}/gu;
function rs(e) {
	return String(e ?? "").normalize("NFD").replace(ns, "").toLocaleLowerCase();
}
function is(e) {
	let t = String(e ?? ""), n = "", r = [];
	for (let e = 0; e < t.length;) {
		let i = String.fromCodePoint(t.codePointAt(e)), a = rs(i);
		for (let t = 0; t < a.length; t += 1) r.push(e);
		n += a, e += i.length;
	}
	return r.push(t.length), {
		folded: n,
		origin: r
	};
}
function as(e, t) {
	let n = rs(String(t ?? "").trim());
	if (!n) return [];
	let { folded: r, origin: i } = is(e), a = [];
	for (let e = 0;;) {
		let t = r.indexOf(n, e);
		if (t === -1) break;
		let o = i[t], s = Math.max(i[t + n.length], o + 1);
		a.push([o, s]), e = t + n.length;
	}
	return a;
}
//#endregion
//#region src/utils/conversationSearch.ts
function os(e, t) {
	let n = as(e, t);
	if (!n.length) return [{
		text: e,
		match: !1
	}];
	let r = [], i = 0;
	for (let [t, a] of n) t > i && r.push({
		text: e.slice(i, t),
		match: !1
	}), r.push({
		text: e.slice(t, a),
		match: !0
	}), i = a;
	return i < e.length && r.push({
		text: e.slice(i),
		match: !1
	}), r;
}
//#endregion
//#region src/components/conversation/Transcript.tsx
function ss({ segments: e, fallback: t = "", query: n = "", scrollToId: r, events: i, moments: a, currentMatch: o = null, speaker: s = null, onRenameSpeaker: c }) {
	let { t: l } = ot(), u = (0, _.useRef)(null), d = (0, _.useRef)(null);
	(0, _.useEffect)(() => {
		let e = d.current?.querySelectorAll("mark") ?? [];
		if (e.forEach((e, t) => {
			t === o ? e.setAttribute("data-current", "") : e.removeAttribute("data-current");
		}), o == null) return;
		let t = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		e[o]?.scrollIntoView({
			block: "center",
			behavior: t ? "auto" : "smooth"
		});
	}, [o, n]);
	let f = (0, _.useMemo)(() => bt(i), [i]), p = (0, _.useMemo)(() => {
		let t = /* @__PURE__ */ new Set();
		for (let n of a) {
			let r = ft(n, e);
			r?.id != null && t.add(String(r.id));
		}
		return t;
	}, [a, e]);
	if ((0, _.useEffect)(() => {
		if (!u.current) return;
		let e = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		u.current.scrollIntoView({
			block: "center",
			behavior: e ? "auto" : "smooth"
		});
	}, [r, e]), !e.length) return /* @__PURE__ */ (0, z.jsx)("div", {
		ref: d,
		children: /* @__PURE__ */ (0, z.jsx)("article", {
			className: "whitespace-pre-wrap text-[15px] leading-7 text-foreground/90",
			children: /* @__PURE__ */ (0, z.jsx)(ls, {
				text: t,
				query: n
			})
		})
	});
	let m = e.find((e) => Number.isFinite(e.timestamp))?.timestamp, h = 0;
	return /* @__PURE__ */ (0, z.jsx)("div", {
		ref: d,
		children: /* @__PURE__ */ (0, z.jsx)("ol", { children: e.map((t, i) => {
			if (s && $o(t) !== s) return null;
			let a = h === 0;
			h += 1;
			let o = Number.isFinite(t.timestamp) && Number.isFinite(m) ? Ii(Math.max(0, t.timestamp - m)) : null, d = r != null && String(t.id) === r, g = f.get(String(t.id)), _ = p.has(String(t.id)), v = i > 0 ? e[i - 1] : null, y = !v || Jo(v, l) !== Jo(t, l);
			return /* @__PURE__ */ (0, z.jsxs)("li", {
				ref: d ? u : void 0,
				className: R("grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 rounded-md", !a && (y ? "mt-5" : "mt-1.5"), d && "-mx-2 bg-muted/70 px-2 py-1"),
				children: [/* @__PURE__ */ (0, z.jsxs)("span", {
					"aria-hidden": "true",
					className: R("flex items-center justify-end gap-1.5 self-start text-xs leading-5 tabular-nums text-muted-foreground", y ? "pt-0" : "pt-1"),
					children: [
						_ && /* @__PURE__ */ (0, z.jsx)(ia, { className: "size-3 fill-current text-foreground" }),
						g && /* @__PURE__ */ (0, z.jsx)(Ki, {
							state: g === "open" ? "asked" : g,
							className: ""
						}),
						o ?? ""
					]
				}), /* @__PURE__ */ (0, z.jsxs)("div", {
					className: "min-w-0",
					children: [y && /* @__PURE__ */ (0, z.jsx)(cs, {
						segment: t,
						onRename: c
					}), /* @__PURE__ */ (0, z.jsxs)("p", {
						title: o ?? void 0,
						className: "max-w-[70ch] text-[15px] leading-7 text-foreground/90",
						children: [_ && /* @__PURE__ */ (0, z.jsxs)("span", {
							className: "sr-only",
							children: [l("oats.review.markedTurn"), " "]
						}), /* @__PURE__ */ (0, z.jsx)(ls, {
							text: String(t.text ?? ""),
							query: n
						})]
					})]
				})]
			}, t.id);
		}) })
	});
}
function cs({ segment: e, onRename: t }) {
	let { t: n } = ot(), [r, i] = (0, _.useState)(!1), a = Jo(e, n);
	if (!a) return null;
	let o = !!(t && e.speaker && /^speaker_\d+$/.test(e.speaker)), s = (n) => {
		i(!1);
		let r = n.replace(/\s+/g, " ").trim().slice(0, 60);
		e.speaker && t?.(e.speaker, r);
	};
	return r ? /* @__PURE__ */ (0, z.jsx)(Qo, {
		autoFocus: !0,
		defaultValue: e.speakerIsPlaceholder ? "" : e.speakerName ?? "",
		placeholder: a,
		"aria-label": n("oats.intelligence.nameSpeaker", { speaker: a }),
		maxLength: 60,
		spellCheck: !1,
		onBlur: (e) => s(e.currentTarget.value),
		onKeyDown: (e) => {
			e.key === "Enter" && e.currentTarget.blur(), e.key === "Escape" && i(!1);
		},
		className: "mb-1 h-7 w-48 px-2 text-[13px]"
	}) : /* @__PURE__ */ (0, z.jsxs)("span", {
		className: "block select-none text-[13px] font-medium leading-5 text-foreground",
		children: [o ? /* @__PURE__ */ (0, z.jsx)("button", {
			type: "button",
			onClick: () => i(!0),
			"aria-label": n("oats.intelligence.nameSpeaker", { speaker: a }),
			title: n("oats.intelligence.nameSpeaker", { speaker: a }),
			className: "rounded-sm outline-none decoration-muted-foreground/50 underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50",
			children: a
		}) : a, /* @__PURE__ */ (0, z.jsx)("span", {
			className: "sr-only",
			children: ": "
		})]
	});
}
function ls({ text: e, query: t }) {
	let n = (0, _.useRef)(null), r = (0, _.useMemo)(() => os(e, t), [e, t]);
	(0, _.useEffect)(() => {
		if (!n.current) return;
		let e = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		n.current.scrollIntoView({
			block: "center",
			behavior: e ? "auto" : "smooth"
		});
	}, [r]);
	let i = !1;
	return /* @__PURE__ */ (0, z.jsx)(z.Fragment, { children: r.map((e, t) => {
		if (!e.match) return /* @__PURE__ */ (0, z.jsx)("span", { children: e.text }, t);
		let r = !i;
		return i = !0, /* @__PURE__ */ (0, z.jsx)("mark", {
			ref: r ? (e) => {
				n.current = e;
			} : void 0,
			className: "rounded-sm bg-highlight px-0.5 text-foreground data-[current]:bg-highlight-strong",
			children: e.text
		}, t);
	}) });
}
function us({ label: e, onEveryone: t }) {
	let { t: n } = ot();
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		className: "mb-4 flex items-center gap-2 text-[13px] text-muted-foreground",
		children: [
			/* @__PURE__ */ (0, z.jsx)(va, {
				"aria-hidden": "true",
				className: "size-4 shrink-0"
			}),
			/* @__PURE__ */ (0, z.jsx)("span", {
				className: "min-w-0 truncate",
				children: n("oats.intelligence.talkTime.only", { speaker: e })
			}),
			/* @__PURE__ */ (0, z.jsx)(co, {
				variant: "ghost",
				size: "sm",
				className: "-my-1 ml-auto shrink-0",
				onClick: t,
				children: n("oats.intelligence.talkTime.everyone")
			})
		]
	});
}
//#endregion
//#region src/components/demo/DemoVoices.tsx
function ds({ conversation: e }) {
	let { t } = ot(), n = (0, _.useMemo)(() => ts(e.segments), [e.segments]), [r, i] = (0, _.useState)(null), a = n.speakers.find((e) => e.key === r) ?? null;
	return /* @__PURE__ */ (0, z.jsxs)("div", { children: [/* @__PURE__ */ (0, z.jsx)(gr, {
		className: "px-5 py-4",
		children: /* @__PURE__ */ (0, z.jsx)(Zo, {
			talk: n,
			selected: a?.key ?? null,
			onSelect: (e) => i((t) => t === e ? null : e)
		})
	}), a && /* @__PURE__ */ (0, z.jsxs)("div", {
		className: "oats-enter mt-6 px-1",
		children: [/* @__PURE__ */ (0, z.jsx)(us, {
			label: Jo(a.segment, t),
			onEveryone: () => i(null)
		}), /* @__PURE__ */ (0, z.jsx)(ss, {
			segments: e.segments,
			events: e.events,
			moments: e.moments,
			speaker: a.key
		})]
	})] });
}
//#endregion
//#region src/components/conversation/ConversationReview.tsx
var fs = {
	asked: "secondary",
	silence: "secondary",
	uncertain: "warning",
	denied: "warning",
	answered: "success"
};
function ps({ events: e, topics: t, onOpenTurn: n }) {
	let { t: r } = ot(), i = (0, _.useMemo)(() => vt({
		events: e,
		topics: t
	}), [e, t]), [a, o] = (0, _.useState)(!1);
	return (0, _.useEffect)(() => o(!1), [e]), i.empty ? null : /* @__PURE__ */ (0, z.jsxs)(gr, {
		className: "gap-0 overflow-hidden",
		children: [
			/* @__PURE__ */ (0, z.jsxs)(_r, {
				className: "flex-row items-center justify-between gap-4 pb-4",
				children: [/* @__PURE__ */ (0, z.jsx)(vr, { children: r("oats.review.title") }), /* @__PURE__ */ (0, z.jsx)("span", {
					className: "text-[13px] tabular-nums text-muted-foreground",
					children: r("oats.review.tally", {
						asked: i.asked,
						answered: i.answered
					})
				})]
			}),
			i.unresolved.length > 0 && /* @__PURE__ */ (0, z.jsx)("ul", {
				className: "divide-y divide-border border-t border-border",
				children: i.unresolved.map((e) => {
					let t = e.outcome === "open" ? "asked" : e.outcome, i = /* @__PURE__ */ (0, z.jsxs)(z.Fragment, { children: [/* @__PURE__ */ (0, z.jsx)("span", {
						className: "min-w-0 flex-1 text-sm leading-6 text-foreground",
						children: e.question
					}), /* @__PURE__ */ (0, z.jsxs)("span", {
						className: "flex shrink-0 items-center gap-1.5 pt-0.5",
						children: [e.searched && /* @__PURE__ */ (0, z.jsx)(hr, {
							variant: "info",
							children: r("questionCard.searched")
						}), /* @__PURE__ */ (0, z.jsx)(hr, {
							variant: fs[t] ?? "secondary",
							children: r(`questionCard.state.${t}`)
						})]
					})] });
					return /* @__PURE__ */ (0, z.jsx)("li", { children: n ? /* @__PURE__ */ (0, z.jsx)("button", {
						type: "button",
						onClick: () => n(e.segmentId),
						disabled: !e.segmentId,
						className: R("flex w-full items-start gap-4 px-5 py-3 text-left outline-none transition-colors", "focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50", e.segmentId ? "hover:bg-muted/60" : "cursor-default"),
						children: i
					}) : /* @__PURE__ */ (0, z.jsx)("div", {
						className: "flex w-full items-start gap-4 px-5 py-3",
						children: i
					}) }, e.key);
				})
			}),
			a && /* @__PURE__ */ (0, z.jsx)("ul", {
				className: "divide-y divide-border border-t border-border",
				children: i.answers.map((e) => /* @__PURE__ */ (0, z.jsxs)("li", {
					className: "px-5 py-3",
					children: [/* @__PURE__ */ (0, z.jsxs)("p", {
						className: "flex items-start gap-4 text-sm leading-6 text-foreground",
						children: [/* @__PURE__ */ (0, z.jsx)("span", {
							className: "min-w-0 flex-1",
							children: e.question
						}), /* @__PURE__ */ (0, z.jsx)(hr, {
							variant: "success",
							className: "mt-0.5",
							children: r("questionCard.state.answered")
						})]
					}), e.reply && n ? /* @__PURE__ */ (0, z.jsx)("button", {
						type: "button",
						onClick: () => n(e.segmentId),
						disabled: !e.segmentId,
						className: "mt-1 line-clamp-2 w-full rounded-sm text-left text-[13px] leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
						children: e.reply
					}) : e.reply ? /* @__PURE__ */ (0, z.jsx)("p", {
						className: "mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground",
						children: e.reply
					}) : null]
				}, e.key))
			}),
			(i.openThreads.length > 0 || i.answers.length > 0) && /* @__PURE__ */ (0, z.jsxs)(yr, {
				className: "justify-between gap-4 text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, z.jsx)("span", {
					className: "min-w-0",
					children: i.openThreads.length > 0 && r("oats.review.openThreads", {
						count: i.openThreads.length,
						threads: i.openThreads.map((e) => e.label).join(", ")
					})
				}), i.answers.length > 0 && /* @__PURE__ */ (0, z.jsxs)(co, {
					variant: "ghost",
					size: "sm",
					className: "-my-1 -mr-2 shrink-0",
					"aria-expanded": a,
					onClick: () => o((e) => !e),
					children: [r(a ? "oats.review.hideAnswers" : "oats.review.showAnswers"), /* @__PURE__ */ (0, z.jsx)(aa, {
						"aria-hidden": "true",
						className: R("transition-transform", a && "rotate-180")
					})]
				})]
			})
		]
	});
}
//#endregion
//#region src/components/demo/DemoOpen.tsx
function ms({ conversation: e }) {
	return /* @__PURE__ */ (0, z.jsx)(ps, {
		events: e.events,
		topics: e.topics
	});
}
//#endregion
//#region src/helpers/conversationReplay.mjs
var hs = 4e4, gs = 5e3;
function _s(e, t, n) {
	let r = new Map(t.map((e) => [e.id, e.firstAt])), i = /* @__PURE__ */ new Map();
	return e.map((e) => {
		if (e?.kind !== "return") return {
			edge: e,
			at: r.get(e?.to) ?? Infinity
		};
		let t = i.get(e.to) ?? 0;
		return i.set(e.to, t + 1), {
			edge: e,
			at: n.get(e.to)?.[t] ?? Infinity
		};
	});
}
function vs(e) {
	let t = (e?.segments ?? []).filter((e) => Number.isFinite(e?.timestamp)).sort((e, t) => e.timestamp - t.timestamp), n = Array.isArray(e?.snapshot?.nodes) ? e.snapshot.nodes : [], r = Bi({
		snapshot: e?.snapshot ?? null,
		segments: t
	}), i = t.length ? t[0].timestamp : 0, a = t.length ? Math.max(r.end, t[t.length - 1].timestamp) : 0, o = /* @__PURE__ */ new Map();
	for (let e of r.returns) {
		let t = r.start + e.at * r.span;
		o.set(e.topic, [...o.get(e.topic) ?? [], t]);
	}
	let s = new Map(t.map((e) => [String(e.id), e.timestamp])), c = Array.isArray(e?.events) ? e.events : [], l = Array.isArray(e?.snapshot?.edges) ? e.snapshot.edges : [];
	return {
		start: i,
		end: a,
		duration: Math.max(0, a - i),
		segments: t,
		nodes: n,
		edges: l,
		moves: _s(l, n, o),
		timeOf: s,
		returnsAt: o,
		events: [...c].sort((e, t) => e.createdAt - t.createdAt || e.id - t.id)
	};
}
function ys(e, t, n) {
	let r = 0;
	for (; r < e.segments.length && e.segments[r].timestamp <= t;) r += 1;
	return n && n.length === r ? n : e.segments.slice(0, r);
}
function bs(e, t, n) {
	let r = [];
	for (let i of e.nodes) {
		if (!Number.isFinite(i?.firstAt) || i.firstAt > t) continue;
		let a = Array.isArray(i.utteranceIds) ? i.utteranceIds : [], o = a.filter((n) => (e.timeOf.get(String(n)) ?? Infinity) <= t);
		if (!o.length) continue;
		let s = o.reduce((t, n) => Math.max(t, e.timeOf.get(String(n)) ?? t), i.firstAt), c = (e.returnsAt.get(i.id) ?? []).filter((e) => e <= t).length;
		r.push({
			...i,
			utteranceIds: o,
			lastAt: s,
			durationMs: Math.round((i.durationMs ?? 0) * o.length / Math.max(1, a.length)),
			returns: c,
			state: i.id === n ? "live" : "open"
		});
	}
	let i = new Set(r.map((e) => e.id));
	return {
		nodes: r,
		edges: e.moves.filter(({ edge: e, at: n }) => n <= t && i.has(e.from) && i.has(e.to)).map(({ edge: e }) => e)
	};
}
function xs(e, t) {
	for (let n = t.length - 1; n >= 0; --n) {
		let r = String(t[n].id), i = e.nodes.find((e) => (e.utteranceIds ?? []).some((e) => String(e) === r));
		if (i) return i.id;
	}
	return null;
}
function Ss(e, t, n) {
	let r = Math.min(e.duration, Math.max(0, Number(t) || 0)), i = e.start + r, a = r >= e.duration, o = ys(e, i, n?.segments), s = xs(e, o);
	return {
		at: r,
		now: i,
		finished: a,
		segments: o,
		events: e.events.filter((e) => e.createdAt <= i),
		snapshot: a ? {
			nodes: e.nodes,
			edges: e.edges
		} : bs(e, i, s)
	};
}
function Cs(e, t, n) {
	if (!e || e.empty || !(e.span > 0)) return e;
	let r = t.start + Math.min(t.duration, Math.max(0, Number(n) || 0)), i = Math.min(1, Math.max(0, (r - e.start) / e.span));
	if (i >= 1) return e;
	let a = e.points.filter((e) => e.x <= i), o = e.points.find((e) => e.x > i), s = a[a.length - 1];
	if (s && o && s.x < i) {
		let e = (i - s.x) / (o.x - s.x);
		a.push({
			x: i,
			y: s.y + (o.y - s.y) * e,
			quiet: s.quiet && o.quiet
		});
	}
	let c = /* @__PURE__ */ new Map();
	for (let e of t.events) {
		if (e.kind !== "response" || e.parentEventId == null) continue;
		let t = `q${e.parentEventId}`;
		c.set(t, Math.max(c.get(t) ?? -Infinity, e.createdAt));
	}
	let l = (e) => {
		let t = c.get(e.id);
		return t !== void 0 && t <= r ? e : {
			...e,
			state: "asked",
			fill: kr.asked
		};
	};
	return {
		...e,
		points: a.length > 1 ? a : [],
		empty: a.length < 2,
		marks: e.marks.filter((e) => e.x <= i).map(l),
		shifts: e.shifts.filter((e) => e.x <= i),
		returns: [],
		moments: (e.moments ?? []).filter((e) => e.x <= i)
	};
}
function ws(e, t, n) {
	if (!(e.duration > 0)) return 0;
	let r = e.duration / hs;
	return Math.min(e.duration, Math.max(0, t + Math.max(0, n) * r));
}
//#endregion
//#region src/components/demo/DemoReplay.tsx
var Ts = [], Es = 100, Ds = 33;
function Os({ conversation: e, from: t = 0 }) {
	let { t: n } = ot(), r = (0, _.useMemo)(() => vs(e), [e]), i = Go(e.segments, e.events, e.topics, e.moments, e.loudness), [a] = (0, _.useState)(So), [o, s] = (0, _.useState)(() => a ? r.duration : Math.min(r.duration, Math.max(0, t))), [c, l] = (0, _.useState)(() => !a), [u, d] = (0, _.useState)("lanes"), f = (0, _.useRef)(null), p = Co(f), m = (0, _.useRef)(o), h = (0, _.useRef)(!1);
	(0, _.useEffect)(() => {
		if (!c || !p) return;
		let e = 0, t = null, n = -Infinity, i = (a) => {
			let o = t === null ? 0 : Math.min(Es, a - t);
			t = a, h.current || (m.current = ws(r, m.current, o));
			let c = m.current >= r.duration;
			if ((c || a - n >= Ds) && (n = a, s(m.current)), c) {
				l(!1);
				return;
			}
			e = window.requestAnimationFrame(i);
		};
		return e = window.requestAnimationFrame(i), () => window.cancelAnimationFrame(e);
	}, [
		c,
		p,
		r
	]);
	let g = (0, _.useRef)(void 0), v = (0, _.useMemo)(() => Ss(r, o, g.current), [r, o]);
	(0, _.useEffect)(() => {
		g.current = v;
	}, [v]);
	let y = (0, _.useMemo)(() => Cs(i, r, o), [
		i,
		r,
		o
	]), b = (e) => {
		m.current = e, s(e);
	}, x = () => {
		if (c) {
			l(!1);
			return;
		}
		m.current >= r.duration && b(0), l(!0);
	}, S = n("demo.replay.at", {
		at: Ii(o),
		length: Ii(r.duration)
	});
	return /* @__PURE__ */ (0, z.jsxs)("div", {
		ref: f,
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ (0, z.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [
					/* @__PURE__ */ (0, z.jsx)(co, {
						type: "button",
						variant: "outline",
						size: "icon",
						"aria-label": n(c ? "demo.replay.pause" : "demo.replay.play"),
						onClick: x,
						className: "shrink-0",
						children: c ? /* @__PURE__ */ (0, z.jsx)(fa, { "aria-hidden": "true" }) : /* @__PURE__ */ (0, z.jsx)(pa, { "aria-hidden": "true" })
					}),
					/* @__PURE__ */ (0, z.jsx)("input", {
						type: "range",
						min: 0,
						max: r.duration,
						step: gs,
						value: o,
						"aria-label": n("demo.replay.position"),
						"aria-valuetext": S,
						onChange: (e) => b(Number(e.currentTarget.value)),
						onPointerDown: () => {
							h.current = !0;
						},
						onPointerUp: () => {
							h.current = !1;
						},
						onPointerCancel: () => {
							h.current = !1;
						},
						style: { "--played": `${r.duration ? o / r.duration * 100 : 0}%` },
						className: R("h-9 min-w-0 flex-1 cursor-pointer appearance-none rounded-md bg-transparent outline-none", "focus-visible:ring-[3px] focus-visible:ring-ring/50", "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full", "[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-muted-foreground)_var(--played),var(--color-border)_var(--played))]", "[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none", "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary", "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--color-card)]", "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border", "[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-muted-foreground", "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0", "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-[0_0_0_2px_var(--color-card)]")
					}),
					/* @__PURE__ */ (0, z.jsx)("span", {
						"aria-hidden": "true",
						className: "shrink-0 text-[13px] tabular-nums text-muted-foreground",
						children: S
					})
				]
			}),
			/* @__PURE__ */ (0, z.jsx)(gr, {
				className: "px-5 pb-3 pt-6",
				children: /* @__PURE__ */ (0, z.jsx)(jo, {
					contour: y,
					height: 80,
					label: Mo(y, n)
				})
			}),
			/* @__PURE__ */ (0, z.jsx)(Va, {
				live: !v.finished,
				snapshot: v.snapshot,
				segments: v.segments,
				startedAt: r.start,
				now: v.now,
				suggestions: Ts,
				view: u,
				onViewChange: d
			})
		]
	});
}
//#endregion
//#region site/src/live.js
var ks = 669e3, As = new URL("live.css", import.meta.url).href, js = Pe();
js.use($e).init({
	lng: "en",
	fallbackLng: "en",
	resources: { en: { translation: ct } },
	initAsync: !1,
	interpolation: { escapeValue: !1 },
	returnEmptyString: !0,
	returnNull: !1
});
for (let e of lt) try {
	window.CSS?.registerProperty?.(e);
} catch {}
var Ms = jt(ut), Ns = {
	hero: () => (0, _.createElement)(Os, {
		conversation: Ms,
		from: ks
	}),
	map: () => (0, _.createElement)(Os, { conversation: Ms }),
	topics: () => (0, _.createElement)(Wa, { conversation: Ms }),
	questions: () => (0, _.createElement)(To, {
		conversation: Ms,
		replay: !0
	}),
	after: () => (0, _.createElement)("div", { className: "flex flex-col gap-6" }, (0, _.createElement)(ms, { conversation: Ms }), (0, _.createElement)(ds, { conversation: Ms }))
};
function Ps({ onDrawn: e, children: t }) {
	return (0, _.useEffect)(() => e(), [e]), t;
}
function Fs(e) {
	let t = Ns[e.dataset.liveSlot];
	if (!t || e.querySelector(":scope > .live-host")) return Promise.resolve(!1);
	let n = document.createElement("div");
	n.className = "live-host";
	let r = n.attachShadow({ mode: "open" }), i = document.createElement("link");
	i.rel = "stylesheet", i.href = As;
	let a = new Promise((e, t) => {
		i.addEventListener("load", e, { once: !0 }), i.addEventListener("error", t, { once: !0 });
	}), o = document.createElement("div");
	o.className = "live-root", r.append(i, o), e.append(n);
	let s, c = new Promise((e) => {
		s = e;
	});
	return (0, v.createRoot)(o).render((0, _.createElement)(_.StrictMode, null, (0, _.createElement)(st, { i18n: js }, (0, _.createElement)(Ps, { onDrawn: s }, t())))), Promise.all([
		a,
		c,
		document.fonts?.ready
	]).then(() => (e.dataset.live = "ready", !0));
}
//#endregion
export { ks as HERO_FROM_MS, Fs as mount };
