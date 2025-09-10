import React, { useEffect, useRef } from "react";

/* =========================
   Canvas Charts (unchanged)
   ========================= */

export function BarChart({ labels = [], values = [], width = 700, height = 220 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return; // strict-mode guard
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const W = width,
      H = height,
      pad = 40;
    const max = Math.max(1, ...values);
    const bw = (W - pad * 2) / Math.max(labels.length, 1);

    ctx.font = "12px system-ui";
    ctx.fillStyle = "#cfe0ff";
    ctx.strokeStyle = "#2a3c6a";
    ctx.beginPath();
    ctx.moveTo(pad, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.moveTo(pad, H - pad);
    ctx.lineTo(pad, pad);
    ctx.stroke();

    values.forEach((v, i) => {
      const h = (H - pad * 2) * (v / max);
      const x = pad + i * bw + bw * 0.15;
      const y = H - pad - h;
      ctx.fillStyle = "#3b6fff";
      ctx.fillRect(x, y, bw * 0.7, h);
      ctx.fillStyle = "#cfe0ff";
      ctx.fillText(labels[i] ?? "", x, H - pad + 14);
      ctx.fillText(String(v), x, y - 4);
    });
  }, [labels, values, width, height]);

  return <canvas ref={ref} width={width} height={height} />;
}

export function MultiLineChart({ labels = [], series = [], width = 700, height = 220 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const W = width,
      H = height,
      pad = 40;
    const max = Math.max(1, ...series.flatMap((s) => s.data));

    ctx.strokeStyle = "#2a3c6a";
    ctx.beginPath();
    ctx.moveTo(pad, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.moveTo(pad, H - pad);
    ctx.lineTo(pad, pad);
    ctx.stroke();

    const stepX = (W - pad * 2) / Math.max(1, labels.length - 1);

    series.forEach((s, si) => {
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (H - pad * 2) * (v / max);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = si % 2 ? "#61d0ff" : "#3b6fff";
      ctx.stroke();
      ctx.fillStyle = "#cfe0ff";
      ctx.fillText(s.label, W - pad - 100, pad + 14 * si + 4);
    });

    labels.forEach((lab, i) => ctx.fillText(lab, pad + i * stepX - 8, H - pad + 14));
  }, [labels, series, width, height]);

  return <canvas ref={ref} width={width} height={height} />;
}

/* =========================
   NEW SVG Funnel (custom design)
   - Centered, stepped trapezoids
   - Smooth gradients per step
   - Labels + values + optional %
   - Looks great in dark UI
   ========================= */

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function hexToRgb(hex) {
  const s = hex.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(c1, c2, t) {
  const A = hexToRgb(c1);
  const B = hexToRgb(c2);
  return `rgb(${lerp(A.r, B.r, t)},${lerp(A.g, B.g, t)},${lerp(A.b, B.b, t)})`;
}

export function FunnelChart({
  labels = [],
  values = [],
  width = 1200,
  height = 260,
  showPercent = true,
  colors = ["#3b6fff", "#61d0ff"], // start -> end
  gap = 12,
  padding = 26,
}) {
  const n = Math.min(labels.length, values.length);
  const max = Math.max(1, ...values.slice(0, n));

  const W = width;
  const H = height;
  const padTop = padding;
  const padBot = padding;

  // widths scale between 35% and 92% of container width
  const minRatio = 0.35;
  const maxRatio = 0.92;
  const widthFor = (v) => W * (minRatio + (maxRatio - minRatio) * (v / max));

  const stepH = (H - padTop - padBot - gap * (n - 1)) / Math.max(n, 1);

  const startColor = colors[0];
  const endColor = colors[1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ maxWidth: "100%", display: "block" }}
    >
      <defs>
        {Array.from({ length: n }).map((_, i) => {
          const t = n <= 1 ? 0 : i / (n - 1);
          const c1 = mix(startColor, endColor, t * 0.6);
          const c2 = mix(startColor, endColor, 0.4 + t * 0.6);
          return (
            <linearGradient id={`fgrad-${i}`} key={i} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={c1} />
              <stop offset="100%" stopColor={c2} />
            </linearGradient>
          );
        })}
        <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="2" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* background guide */}
      <rect
        x="0"
        y="0"
        width={W}
        height={H}
        rx="14"
        ry="14"
        fill="transparent"
        stroke="rgba(31,41,90,0.35)"
        strokeDasharray="4 6"
      />

      {Array.from({ length: n }).map((_, i) => {
        const top = padTop + i * (stepH + gap);
        const nextVal = i < n - 1 ? values[i + 1] : values[i] * 0.85;

        const wTop = widthFor(values[i]);
        const wBot = widthFor(nextVal);

        const xTopL = (W - wTop) / 2;
        const xTopR = xTopL + wTop;
        const xBotL = (W - wBot) / 2;
        const xBotR = xBotL + wBot;
        const yTop = top;
        const yBot = top + stepH;

        // slight rounding via quadratic curves
        const r = Math.min(10, stepH / 3);

        const d = `
          M ${xTopL + r} ${yTop}
          L ${xTopR - r} ${yTop}
          Q ${xTopR} ${yTop} ${xTopR - (xTopR - xBotR) / 2} ${yTop + stepH / 2}
          L ${xBotR - r} ${yBot}
          L ${xBotL + r} ${yBot}
          Q ${xBotL} ${yBot} ${xTopL + (xBotL - xTopL) / 2} ${yTop + stepH / 2}
          Z
        `;

        const label = labels[i] ?? "";
        const val = Number(values[i] ?? 0);
        const pct =
          showPercent && i > 0 && values[0] > 0
            ? Math.round((val / values[0]) * 100)
            : null;

        return (
          <g key={i} filter="url(#soft)">
            <path d={d} fill={`url(#fgrad-${i})`} stroke="#1f294a" strokeWidth="1.25" />
            <text
              x={W / 2}
              y={yTop + stepH / 2 - 2}
              textAnchor="middle"
              fill="#0f162b"
              fontSize="13"
              fontWeight="700"
              style={{ pointerEvents: "none" }}
            >
              {label}
            </text>
            <text
              x={W / 2}
              y={yTop + stepH / 2 + 14}
              textAnchor="middle"
              fill="#e8ecf3"
              fontSize="12"
              style={{ pointerEvents: "none", opacity: 0.95 }}
            >
              {val.toLocaleString()}
              {pct !== null ? `  •  ${pct}%` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
