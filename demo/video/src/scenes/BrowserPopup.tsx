import React from "react";
import { interpolate, Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../brand/theme";

/**
 * The browser coming forward with the search Oats opened (auto-search: a
 * question met "I don't know"), and going again. A plain Chrome-like window:
 * the address bar shows the URL the app built from the search host and the
 * question; the page is neutral result lines, not anybody's results page.
 * `at` is when it opens (scene seconds), `hold` how long it stays.
 */
export const BrowserPopup: React.FC<{
  at: number;
  hold: number;
  query: string;
  searchBaseUrl: string;
  /** Where its top-left corner sits in the frame, and its size. */
  x: number;
  y: number;
  width: number;
  height: number;
}> = ({ at, hold, query, searchBaseUrl, x, y, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - at;
  if (t < 0 || t > hold + 0.3) return null;
  const open = interpolate(t, [0, 0.24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const close = interpolate(t, [hold, hold + 0.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const opacity = open * (1 - close);
  const scale = 0.94 + 0.06 * open - 0.03 * close;

  let host = "google.com";
  let shownUrl = "";
  try {
    const url = new URL(searchBaseUrl || "https://www.google.com/search");
    url.searchParams.set("q", query);
    host = url.hostname.replace(/^www\./, "");
    shownUrl = `${host}${url.pathname}${url.search}`;
  } catch {
    shownUrl = `${host}/search?q=${encodeURIComponent(query)}`;
  }

  const ink = "#1f1f1f";
  const quiet = "#5f6368";
  const line = "#e3e3e3";
  const bar = (w: number, h = 12, color = line) => (
    <div style={{ width: w, height: h, borderRadius: h / 2, background: color }} />
  );
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "50% 40%",
        borderRadius: 14,
        overflow: "hidden",
        background: "#ffffff",
        boxShadow: "0 30px 80px rgba(0,0,0,0.22), 0 6px 18px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.10)",
        fontFamily: theme.font,
        color: ink,
      }}
    >
      {/* Tab strip: the traffic lights and one tab. */}
      <div style={{ height: 46, background: "#e9ecf1", display: "flex", alignItems: "flex-end", paddingLeft: 16, gap: 18 }}>
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
            <div key={color} style={{ width: 12, height: 12, borderRadius: 6, background: color }} />
          ))}
        </div>
        <div
          style={{
            height: 36,
            width: 300,
            background: "#ffffff",
            borderRadius: "10px 10px 0 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid ${quiet}`, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{query}</span>
        </div>
      </div>
      {/* Toolbar: back, forward, reload, and the address bar. */}
      <div style={{ height: 50, display: "flex", alignItems: "center", gap: 16, padding: "0 16px", borderBottom: `1px solid ${line}` }}>
        <span style={{ color: quiet, fontSize: 20 }}>←</span>
        <span style={{ color: "#c4c7c5", fontSize: 20 }}>→</span>
        <span style={{ color: quiet, fontSize: 18 }}>↻</span>
        <div
          style={{
            flex: 1,
            height: 34,
            borderRadius: 17,
            background: "#f1f3f4",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            fontSize: 15,
            color: quiet,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ color: ink }}>{shownUrl.slice(0, host.length)}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{shownUrl.slice(host.length)}</span>
        </div>
      </div>
      {/* The page: the question in a search field, then result lines. */}
      <div style={{ padding: "28px 40px", display: "grid", gap: 26 }}>
        <div
          style={{
            width: Math.min(640, width - 80),
            height: 46,
            borderRadius: 23,
            border: `1px solid ${line}`,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            fontSize: 16,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {query}
        </div>
        {[0.62, 0.5, 0.56].map((share, index) => (
          <div key={index} style={{ display: "grid", gap: 10 }}>
            {bar(140, 10, "#ececec")}
            {bar(Math.round((width - 80) * share), 16, "#d7e3fb")}
            {bar(Math.round((width - 80) * 0.78), 10)}
            {bar(Math.round((width - 80) * 0.66), 10)}
          </div>
        ))}
      </div>
    </div>
  );
};
