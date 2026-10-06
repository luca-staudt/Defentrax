"use client";

import { useState } from "react";

export function ThreatTimelineChart({
  height = 140,
}: {
  height?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // 12-point realistic 24h SIEM telemetry throughput data
  const data = [
    { time: "00:00", events: 1420, threats: 3 },
    { time: "02:00", events: 890, threats: 1 },
    { time: "04:00", events: 650, threats: 0 },
    { time: "06:00", events: 1120, threats: 2 },
    { time: "08:00", events: 3450, threats: 8 },
    { time: "10:00", events: 5120, threats: 14 },
    { time: "12:00", events: 4890, threats: 11 },
    { time: "14:00", events: 6100, threats: 19 },
    { time: "16:00", events: 5400, threats: 12 },
    { time: "18:00", events: 4200, threats: 7 },
    { time: "20:00", events: 3100, threats: 5 },
    { time: "22:00", events: 2150, threats: 4 },
  ];

  const maxEvents = Math.max(...data.map((d) => d.events));
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 500;
    const y = height - (d.events / maxEvents) * (height - 25) - 10;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, "");

  const areaD = `${pathD} L 500 ${height} L 0 ${height} Z`;

  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <div>
          <h4 className="font-display text-sm font-semibold text-white flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            24-Hour Telemetry & Event Ingestion Volume
          </h4>
          <p className="font-mono text-[11px] text-zinc-400">Stream buffer from endpoint agents</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-950/40 px-2 py-0.5 text-[10px] font-mono text-sky-300">
            Peak: {maxEvents.toLocaleString()} eps
          </span>
        </div>
      </div>

      <div className="mt-4">
        <svg viewBox={`0 0 500 ${height}`} className="w-full overflow-visible">
          <defs>
            <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00a3ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00a3ff" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="0" y1="20" x2="500" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="0" y1={height / 2} x2="500" y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="0" y1={height - 10} x2="500" y2={height - 10} stroke="#1e293b" />

          {/* Filled Area */}
          <path d={areaD} fill="url(#telemetryGrad)" />

          {/* Smooth Line */}
          <path d={pathD} fill="none" stroke="#00a3ff" strokeWidth="2.5" />

          {/* Data Points */}
          {points.map((p, i) => (
            <g key={i} className="cursor-pointer" onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 5 : 3}
                fill={hoveredIdx === i ? "#ffffff" : "#00a3ff"}
                stroke="#030712"
                strokeWidth="2"
                className="transition-all"
              />
            </g>
          ))}
        </svg>

        {/* Hover readout */}
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-zinc-500">
          <span>00:00 UTC</span>
          {hoveredIdx !== null ? (
            <span className="font-semibold text-sky-400">
              {data[hoveredIdx].time} — {data[hoveredIdx].events.toLocaleString()} events ({data[hoveredIdx].threats} alerts)
            </span>
          ) : (
            <span>Hover point for rate breakdown</span>
          )}
          <span>22:00 UTC</span>
        </div>
      </div>
    </div>
  );
}

export function SecurityPostureGauge({
  score = 94,
}: {
  score?: number;
}) {
  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const strokeDashoffset = circ - (score / 100) * (circ * 0.75);

  return (
    <div className="relative flex flex-col items-center justify-center rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
      <div className="w-full flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-2">
        <h4 className="font-display text-sm font-semibold text-white flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Threat Index & Posture
        </h4>
        <span className="font-mono text-[10px] text-emerald-400 font-semibold uppercase">NOMINAL</span>
      </div>

      <div className="relative flex items-center justify-center my-2">
        <svg width="128" height="128" className="-rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="#1e293b"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
            strokeLinecap="round"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="#10b981"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circ}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="font-display text-2xl font-bold text-white">{score}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">Score</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-2 text-center font-mono text-[10px] border-t border-zinc-800/60 pt-2 mt-1">
        <div>
          <span className="text-zinc-500 block">MITRE COVERAGE</span>
          <span className="text-sky-400 font-bold">88.4%</span>
        </div>
        <div>
          <span className="text-zinc-500 block">MTTD (MEAN TIME)</span>
          <span className="text-emerald-400 font-bold">1.8s</span>
        </div>
      </div>
    </div>
  );
}
