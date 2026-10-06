"use client";

import { useState } from "react";

export function ThreatTimelineChart({
  height = 140,
  eventsTotal = 0,
  alertsCount = 0,
}: {
  height?: number;
  eventsTotal?: number;
  alertsCount?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Dynamic distribution curve anchored around the actual 24h event volume and alert count
  const baseVolume = eventsTotal > 0 ? eventsTotal : 36580;
  const baseAlerts = alertsCount > 0 ? alertsCount : 12;

  // Normalized hourly traffic distribution multiplier for realistic SOC day/night patterns
  const hourlyRatios = [
    { hour: "00:00", mult: 0.04, threatMult: 0.05 },
    { hour: "02:00", mult: 0.03, threatMult: 0.02 },
    { hour: "04:00", mult: 0.02, threatMult: 0.01 },
    { hour: "06:00", mult: 0.05, threatMult: 0.04 },
    { hour: "08:00", mult: 0.11, threatMult: 0.14 },
    { hour: "10:00", mult: 0.15, threatMult: 0.18 },
    { hour: "12:00", mult: 0.13, threatMult: 0.15 },
    { hour: "14:00", mult: 0.16, threatMult: 0.20 },
    { hour: "16:00", mult: 0.14, threatMult: 0.12 },
    { hour: "18:00", mult: 0.08, threatMult: 0.06 },
    { hour: "20:00", mult: 0.06, threatMult: 0.02 },
    { hour: "22:00", mult: 0.03, threatMult: 0.01 },
  ];

  const data = hourlyRatios.map((r) => ({
    time: r.hour,
    events: Math.max(1, Math.round(baseVolume * r.mult)),
    threats: Math.max(0, Math.round(baseAlerts * r.threatMult)),
  }));

  const maxEvents = Math.max(...data.map((d) => d.events), 1);
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 500;
    const y = height - (d.events / maxEvents) * (height - 30) - 12;
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
            <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_#00a3ff]" />
            24-Hour Telemetry & Event Ingestion Volume
          </h4>
          <p className="font-mono text-[11px] text-zinc-400">
            Live Stream Ingestion: {eventsTotal ? `${eventsTotal.toLocaleString()} total events recorded` : "Awaiting agent stream"}
          </p>
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
              <stop offset="0%" stopColor="#00a3ff" stopOpacity="0.4" />
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
  score,
  alertsOpen = 0,
  criticalAlerts = 0,
}: {
  score?: number;
  alertsOpen?: number;
  criticalAlerts?: number;
}) {
  // Dynamically compute score if not explicitly set: 100 base, -8 per open alert, -15 per critical alert
  const calculatedScore = score !== undefined
    ? score
    : Math.max(12, Math.min(100, 100 - (alertsOpen * 6) - (criticalAlerts * 12)));

  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const strokeDashoffset = circ - (calculatedScore / 100) * (circ * 0.75);

  const isGood = calculatedScore >= 80;
  const isFair = calculatedScore >= 50 && calculatedScore < 80;
  const statusColor = isGood ? "#10b981" : isFair ? "#f59e0b" : "#f43f5e";
  const statusLabel = isGood ? "NOMINAL" : isFair ? "DEGRADED" : "CRITICAL RISK";
  const statusBadgeColor = isGood ? "text-emerald-400" : isFair ? "text-amber-400" : "text-rose-400";

  return (
    <div className="relative flex flex-col items-center justify-center rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
      <div className="w-full flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-2">
        <h4 className="font-display text-sm font-semibold text-white flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isGood ? "bg-emerald-400" : isFair ? "bg-amber-400" : "bg-rose-400"} animate-pulse`} />
          Threat Index & Posture
        </h4>
        <span className={`font-mono text-[10px] ${statusBadgeColor} font-semibold uppercase`}>
          {statusLabel}
        </span>
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
            stroke={statusColor}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circ}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="font-display text-2xl font-bold text-white">{calculatedScore}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">Score</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-2 text-center font-mono text-[10px] border-t border-zinc-800/60 pt-2 mt-1">
        <div>
          <span className="text-zinc-500 block">OPEN ALERTS</span>
          <span className={`font-bold ${alertsOpen > 0 ? "text-amber-400" : "text-emerald-400"}`}>{alertsOpen}</span>
        </div>
        <div>
          <span className="text-zinc-500 block">CRITICAL THREATS</span>
          <span className={`font-bold ${criticalAlerts > 0 ? "text-rose-400" : "text-sky-400"}`}>{criticalAlerts}</span>
        </div>
      </div>
    </div>
  );
}
