//#region src/helpers/oatsMarkMotion.mjs
var e = .64, t = .8;
function n(e) {
	return 1 - (1 - e) ** 3;
}
function r(e) {
	let r = Math.min(1, Math.max(0, e)), i = Math.min(1, r / t), a = 4 * Math.PI * n(i), o = r < .8 ? 150 * Math.sin(Math.PI * i) : 0, s = (r - t) / (1 - t);
	return {
		phi: a,
		hop: o,
		squash: r >= .8 && r < 1 ? Math.sin(Math.PI * s) * (1 - .4 * s) : 0,
		lean: 9 * Math.sin(2 * Math.PI * i) * (1 - i)
	};
}
function i(t) {
	let n = Math.cos(t), r = Math.sin(t);
	return Math.sqrt(n * n + e * e * r * r);
}
//#endregion
//#region src/helpers/grainDither.mjs
var a = Object.freeze([
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
function o(e, t) {
	return (a[(t & 3) * 4 + (e & 3)] + .5) / 16;
}
var s = Object.freeze([
	"#8d3d00",
	"#b86400",
	"#e18e08",
	"#ffbe49"
].map((e) => Object.freeze([
	1,
	3,
	5
].map((t) => parseInt(e.slice(t, t + 2), 16)))));
function c(e, t, n) {
	let r = Math.min(1, Math.max(0, e)) * (n - 1), i = Math.floor(r);
	return Math.min(n - 1, i + +(r - i > t));
}
function l(e, t, n = s) {
	let r = n.length;
	for (let i = 0, a = 0, s = 0; i < e.length; i += 4) {
		if (e[i + 3] > 0) {
			let t = n[c(e[i] / 255, o(a, s), r)];
			e[i] = t[0], e[i + 1] = t[1], e[i + 2] = t[2];
		}
		a += 1, a === t && (a = 0, s += 1);
	}
}
var u = Object.freeze([
	58,
	28,
	0
]), d = .3;
function f(e, t, { cx: n, cy: r, rx: i, ry: a, strength: s }) {
	if (!(i > 0 && a > 0 && s > 0)) return;
	let c = e.length / 4 / t, l = Math.max(0, Math.floor(r - a)), f = Math.min(c - 1, Math.ceil(r + a)), p = Math.max(0, Math.floor(n - i)), m = Math.min(t - 1, Math.ceil(n + i)), h = Math.round(d * 255);
	for (let c = l; c <= f; c += 1) for (let l = p; l <= m; l += 1) {
		let d = (c * t + l) * 4;
		if (e[d + 3] > 0) continue;
		let f = (l + .5 - n) / i, p = (c + .5 - r) / a;
		s * (1 - Math.sqrt(f * f + p * p)) / .3 > o(l, c) && (e[d] = u[0], e[d + 1] = u[1], e[d + 2] = u[2], e[d + 3] = h);
	}
}
//#endregion
//#region src/components/shell/grainCanvas.ts
var p = {
	phi: 0,
	hop: 0,
	squash: 0,
	lean: 0
}, m = {
	body: [
		[0, .94],
		[.36, .82],
		[.72, .62],
		[1, .34]
	],
	shade: .28,
	bounce: .12,
	crease: .7,
	lip: .35,
	rim: .35
}, h = 512, g = 512, _ = 344, v = 240, y = "M512 168 C584 168 752 326 752 512 C752 700 588 856 512 856 C436 856 272 700 272 512 C272 326 440 168 512 168 Z", b = {
	x: 272,
	y: 168,
	width: 480,
	height: 688
}, x = -18, S = .34, C = 252, w = 772, T = 880, E = {
	y: 920,
	rx: 236,
	ry: 36,
	strength: .3
};
function D(e) {
	let t = Math.sin(e), n = new Path2D();
	for (let e = 0; e <= 16; e += 1) {
		let r = C + (w - C) * e / 16, i = (r - g) / _, a = h + v * Math.sqrt(Math.max(0, 1 - i * i)) * t;
		e === 0 ? n.moveTo(a, r) : n.lineTo(a, r);
	}
	return n;
}
var O = null;
function k() {
	if (!O) {
		let e = new Path2D(y), t = new Path2D();
		t.addPath(e, new DOMMatrix().scaleSelf(1 / b.width, 1 / b.height).translateSelf(-b.x, -b.y)), O = {
			outline: e,
			outlineInBox: t,
			crease: D(S)
		};
	}
	return O;
}
function A(e) {
	let t = Math.min(1, Math.max(0, e / .35));
	return t * t * (3 - 2 * t);
}
var j = (e, t = 1) => {
	let n = Math.round(Math.min(1, Math.max(0, e)) * 255);
	return `rgba(${n}, ${n}, ${n}, ${t})`;
};
function M(e, [t, n], [r, i]) {
	let a = r - t, o = i - n, s = a * a + o * o, c = a / (b.width * s), l = o / (b.height * s), u = c * c + l * l, d = b.x + t * b.width, f = b.y + n * b.height;
	return e.createLinearGradient(d, f, d + c / u, f + l / u);
}
function N(e, t, n, r, a = !1) {
	let { outline: o, outlineInBox: s, crease: c } = k(), u = Math.min(t, n) / 1024, d = (t - 1024 * u) / 2, p = (n - 1024 * u) / 2;
	e.setTransform(1, 0, 0, 1, 0, 0), e.globalCompositeOperation = "source-over", e.globalAlpha = 1, e.filter = "none", e.lineCap = "round", e.lineJoin = "round", e.clearRect(0, 0, t, n);
	let _ = 1 + .06 * r.squash, v = 1 - .08 * r.squash;
	e.setTransform(new DOMMatrix().translateSelf(d, p).scaleSelf(u, u).translateSelf(0, -r.hop).translateSelf(h, T).scaleSelf(_, v).translateSelf(-512, -880).translateSelf(h, g).rotateSelf(x + r.lean).scaleSelf(1, i(r.phi)).translateSelf(-512, -512)), e.save(), e.transform(b.width, 0, 0, b.height, b.x, b.y);
	let y = e.createRadialGradient(.33, .22, 0, .36, .26, .84);
	for (let [e, t] of m.body) y.addColorStop(e, j(t));
	e.fillStyle = y, e.fill(s), e.restore(), e.globalCompositeOperation = "source-atop";
	let C = M(e, [.15, .1], [.95, .92]);
	C.addColorStop(.45, j(0, 0)), C.addColorStop(1, j(0, m.shade)), e.fillStyle = C, e.fill(o);
	let w = M(e, [0, 1], [.75, .25]);
	w.addColorStop(0, j(1, m.bounce)), w.addColorStop(.55, j(1, 0)), e.strokeStyle = w, e.lineWidth = 44, e.stroke(o);
	let D = A(Math.cos(r.phi));
	if (D > 0) {
		let t = 1 / u, n = Math.max(30, 1.25 * t), r = Math.max(10, .75 * t), i = .4 * (n + r) * Math.cos(S);
		e.filter = `blur(${(4 * u).toFixed(2)}px)`, e.globalAlpha = m.crease * D, e.strokeStyle = j(0), e.lineWidth = n, e.stroke(c), e.translate(-i, 0), e.globalAlpha = m.lip * D, e.strokeStyle = j(1), e.lineWidth = r, e.stroke(c), e.translate(i, 0), e.globalAlpha = 1, e.filter = "none";
	}
	e.strokeStyle = j(0, m.rim), e.lineWidth = 12, e.stroke(o), e.globalCompositeOperation = "source-over";
	let O = e.getImageData(0, 0, t, n);
	if (l(O.data, t), a) {
		let e = Math.min(1, r.hop / 150), n = u * (1 - .35 * e);
		f(O.data, t, {
			cx: d + h * u,
			cy: p + E.y * u,
			rx: E.rx * n,
			ry: E.ry * n,
			strength: E.strength * (1 - .55 * e)
		});
	}
	e.putImageData(O, 0, 0);
}
//#endregion
//#region site/src/mark.js
var P = [
	[
		122,
		49,
		0
	],
	[
		178,
		94,
		0
	],
	[
		236,
		154,
		18
	],
	[
		255,
		206,
		104
	]
], F = new Map(s.map((e, t) => [e.join(","), P[t]])), I = 110, L = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function R(e, { shadow: t = !1, toss: n = "none", interactive: i = !1 } = {}) {
	let a = document.createElement("canvas"), o = a.getContext("2d", { willReadFrequently: !0 }), s = p, c = 0;
	function l() {
		let n = e.width;
		if (!n || !o) return;
		let r = Math.max(1, Math.round(n / I)), i = Math.max(8, Math.floor(n / r));
		a.width = i, a.height = i, N(o, i, i, s, t);
		let c = o.getImageData(0, 0, i, i), l = c.data;
		for (let e = 0; e < l.length; e += 4) {
			if (l[e + 3] === 0) continue;
			let t = F.get(`${l[e]},${l[e + 1]},${l[e + 2]}`);
			t && ([l[e], l[e + 1], l[e + 2]] = t);
		}
		o.putImageData(c, 0, 0);
		let u = e.getContext("2d"), d = i * r, f = Math.floor((n - d) / 2);
		u.setTransform(1, 0, 0, 1, 0, 0), u.clearRect(0, 0, e.width, e.height), u.imageSmoothingEnabled = !1, u.drawImage(a, f, f, d, d);
	}
	function u() {
		let t = window.devicePixelRatio || 1, n = Math.round(e.clientWidth * t);
		n && (e.width !== n || e.height !== n) && (e.width = n, e.height = n, l());
	}
	function d() {
		if (L()) return;
		cancelAnimationFrame(c);
		let e = performance.now(), t = (n) => {
			let i = Math.min(1, (n - e) / 1150);
			s = r(i), l(), i < 1 && (c = requestAnimationFrame(t));
		};
		c = requestAnimationFrame(t);
	}
	if (u(), new ResizeObserver(u).observe(e), window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.("change", u), n === "load") {
		let t = new IntersectionObserver((e) => {
			e.some((e) => e.isIntersecting) && (t.disconnect(), window.setTimeout(d, 350));
		});
		t.observe(e);
	}
	return i && (e.closest("button") || e).addEventListener("click", d), { spin: d };
}
//#endregion
//#region site/src/field.js
var z = "\nattribute vec2 position;\nvoid main() { gl_Position = vec4(position, 0.0, 1.0); }\n", B = "\nprecision highp float;\nuniform vec2 size;\nuniform float time;\nuniform float scale;\n\nfloat hash(vec2 p) {\n  p = fract(p * vec2(0.1031, 0.1030));\n  p += dot(p, p.yx + 33.33);\n  return fract((p.x + p.y) * p.x);\n}\n\nfloat noise(vec2 p) {\n  vec2 i = floor(p);\n  vec2 f = fract(p);\n  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);\n  float a = hash(i);\n  float b = hash(i + vec2(1.0, 0.0));\n  float c = hash(i + vec2(0.0, 1.0));\n  float d = hash(i + vec2(1.0, 1.0));\n  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;\n}\n\nfloat fbm(vec2 p) {\n  float value = 0.0;\n  float amplitude = 0.5;\n  for (int octave = 0; octave < 4; octave++) {\n    value += amplitude * noise(p);\n    p *= 2.03;\n    amplitude *= 0.5;\n  }\n  return value / 0.9375;\n}\n\nfloat bayer(vec2 pixel) {\n  vec2 q = mod(floor(pixel), 4.0);\n  float i = q.y * 4.0 + q.x;\n  float m[16];\n  m[0] = 0.0; m[1] = 8.0; m[2] = 2.0; m[3] = 10.0;\n  m[4] = 12.0; m[5] = 4.0; m[6] = 14.0; m[7] = 6.0;\n  m[8] = 3.0; m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;\n  m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;\n  float v = 0.0;\n  for (int k = 0; k < 16; k++) { if (float(k) == i) v = m[k]; }\n  return (v + 0.5) / 16.0 - 0.5;\n}\n\nvoid main() {\n  vec2 pixel = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);\n  vec2 p = pixel / scale;\n  float t = time;\n  float qx = fbm(p + vec2(0.07 * t, -0.05 * t));\n  float qy = fbm(p + vec2(5.2 - 0.04 * t, 1.3 + 0.06 * t));\n  float value = fbm(p + 1.8 * vec2(qx, qy) + vec2(0.03 * t, -0.02 * t));\n  float grey = 243.0 + 7.0 * (value * 2.0 - 1.0) + bayer(gl_FragCoord.xy);\n  float level = clamp(floor(grey + 0.5), 0.0, 255.0) / 255.0;\n  gl_FragColor = vec4(vec3(level), 1.0);\n}\n", V = 640, H = 1e3 / 30;
function U(e, t, n) {
	let r = e.createShader(t);
	if (e.shaderSource(r, n), e.compileShader(r), !e.getShaderParameter(r, e.COMPILE_STATUS)) throw Error(e.getShaderInfoLog(r));
	return r;
}
function W(e) {
	let t = e.getContext("webgl", {
		antialias: !1,
		alpha: !1,
		powerPreference: "low-power"
	});
	if (!t) return !1;
	let n;
	try {
		if (n = t.createProgram(), t.attachShader(n, U(t, t.VERTEX_SHADER, z)), t.attachShader(n, U(t, t.FRAGMENT_SHADER, B)), t.linkProgram(n), !t.getProgramParameter(n, t.LINK_STATUS)) throw Error(t.getProgramInfoLog(n));
	} catch (e) {
		return console.warn("field:", e), !1;
	}
	t.useProgram(n);
	let r = t.createBuffer();
	t.bindBuffer(t.ARRAY_BUFFER, r), t.bufferData(t.ARRAY_BUFFER, new Float32Array([
		-1,
		-1,
		1,
		-1,
		-1,
		1,
		1,
		1
	]), t.STATIC_DRAW);
	let i = t.getAttribLocation(n, "position");
	t.enableVertexAttribArray(i), t.vertexAttribPointer(i, 2, t.FLOAT, !1, 0, 0);
	let a = t.getUniformLocation(n, "size"), o = t.getUniformLocation(n, "time"), s = t.getUniformLocation(n, "scale"), c = 1;
	function l() {
		c = Math.min(window.devicePixelRatio || 1, 1.5);
		let n = Math.max(1, Math.round(e.clientWidth * c)), r = Math.max(1, Math.round(e.clientHeight * c));
		(e.width !== n || e.height !== r) && (e.width = n, e.height = r, t.viewport(0, 0, n, r), f(d()));
	}
	let u = performance.now(), d = () => (performance.now() - u) / 1e3 + 40;
	function f(n) {
		t.uniform2f(a, e.width, e.height), t.uniform1f(o, n), t.uniform1f(s, V * c), t.drawArrays(t.TRIANGLE_STRIP, 0, 4);
	}
	let p = window.matchMedia?.("(prefers-reduced-motion: reduce)"), m = !1, h = 0, g = 0;
	function _(e) {
		h = 0, !(!m || document.hidden || p?.matches) && (e - g >= H && (g = e, f(d())), h = requestAnimationFrame(_));
	}
	function v() {
		!h && m && !document.hidden && !p?.matches && (h = requestAnimationFrame(_));
	}
	return l(), new ResizeObserver(l).observe(e), new IntersectionObserver((e) => {
		m = e.some((e) => e.isIntersecting), v();
	}).observe(e), document.addEventListener("visibilitychange", v), p?.addEventListener?.("change", () => {
		f(d()), v();
	}), e.classList.add("is-live"), !0;
}
//#endregion
//#region site/src/download.js
var G = "https://github.com/alexgaoth/oats/releases", K = {
	arm64: `${G}/latest/download/Oats-arm64.dmg`,
	x64: `${G}/latest/download/Oats-x64.dmg`
};
function q() {
	let e = navigator.userAgentData?.platform || navigator.platform || "";
	return /mac/i.test(e) && !(navigator.maxTouchPoints > 1);
}
async function J() {
	try {
		let e = await navigator.userAgentData?.getHighEntropyValues?.(["architecture"]);
		if (e?.architecture === "arm") return "arm64";
		if (e?.architecture === "x86") return "x64";
	} catch {}
	try {
		let e = document.createElement("canvas").getContext("webgl"), t = e?.getExtension("WEBGL_debug_renderer_info"), n = t ? String(e.getParameter(t.UNMASKED_RENDERER_WEBGL)) : "";
		if (/Apple M\d/i.test(n)) return "arm64";
		if (/Intel|AMD|Radeon|NVIDIA/i.test(n)) return "x64";
	} catch {}
	return null;
}
async function Y() {
	let e = q();
	document.documentElement.dataset.platform = e ? "mac" : "other";
	let t = (e ? await J() : null) === "x64" ? "x64" : "arm64";
	for (let e of document.querySelectorAll("[data-download]")) {
		let n = e.dataset.download === "primary" ? t : e.dataset.download;
		e.href = K[n], e.dataset.download === "primary" && (e.dataset.arch = n);
	}
	for (let e of document.querySelectorAll("[data-arch-label]")) e.textContent = t === "x64" ? "Intel" : "Apple Silicon";
	for (let e of document.querySelectorAll("[data-other-arch]")) {
		let n = t === "x64" ? "arm64" : "x64";
		e.href = K[n], e.textContent = n === "x64" ? "Intel Mac? Get the Intel build" : "On Apple Silicon? Get that build";
	}
}
//#endregion
//#region site/src/site.js
for (let e of document.querySelectorAll("canvas[data-mark]")) R(e, {
	shadow: e.dataset.mark === "large",
	toss: e.dataset.toss || "none",
	interactive: e.hasAttribute("data-interactive")
});
for (let e of document.querySelectorAll("canvas[data-field]")) W(e);
Y();
var X = document.querySelector("#film video");
function Z() {
	X && (X.closest("section")?.scrollIntoView({
		behavior: "smooth",
		block: "center"
	}), X.play().catch(() => {}));
}
for (let e of document.querySelectorAll("[data-play-film]")) e.addEventListener("click", (e) => {
	e.preventDefault(), Z();
});
X?.addEventListener("play", () => X.closest(".film")?.classList.add("is-playing"));
//#endregion
