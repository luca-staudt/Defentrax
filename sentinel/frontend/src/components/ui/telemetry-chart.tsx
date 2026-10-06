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

  const baseVolume = eventsTotal > 0 ? eventsTotal : 36580;
  const baseAlerts = alertsCount > 0 ? alertsCount : 12;

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
    <div className="rounded-xl border border-zinc-800 bg-[#0c1017] p-5">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-white">
            24-Hour Telemetry Volume
          </h4>
          <p className="font-mono text-xs text-zinc-400">
            {eventsTotal ? `${eventsTotal.toLocaleString()} total events recorded` : "Awaiting agent stream"}
          </p>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          Peak: {maxEvents.toLocaleString()} eps
        </span>
      </div>

      <div className="mt-4">
        <svg viewBox={`0 0 500 ${height}`} className="w-full overflow-visible">
          <defs>
            <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="0" y1="20" x2="500" y2="20" stroke="#1f2937" strokeDasharray="2 2" />
          <line x1="0" y1={height / 2} x2="500" y2={height / 2} stroke="#1f2937" strokeDasharray="2 2" />
          <line x1="0" y1={height - 10} x2="500" y2={height - 10} stroke="#1f2937" />

          {/* Area & Stroke */}
          <path d={areaD} fill="url(#telemetryGrad)" />
          <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="1.5" />

          {/* Points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === i ? 4 : 2}
              fill={hoveredIdx === i ? "#ffffff" : "#38bdf8"}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-zinc-500">
          <span>00:00 UTC</span>
          {hoveredIdx !== null ? (
            <span className="font-medium text-sky-400">
              {data[hoveredIdx].time} — {data[hoveredIdx].events.toLocaleString()} events ({data[hoveredIdx].threats} alerts)
            </span>
          ) : (
            <span>Hover point for details</span>
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
  const calculatedScore = score !== undefined
    ? score
    : Math.max(12, Math.min(100, 100 - (alertsOpen * 6) - (criticalAlerts * 12)));

  const radius = 46;
  const circ = 2 * Math.PI * radius;
  const strokeDashoffset = circ - (calculatedScore / 100) * (circ * 0.75);

  const isGood = calculatedScore >= 80;
  const isFair = calculatedScore >= 50 && calculatedScore < 80;
  const strokeColor = isGood ? "#10b981" : isFair ? "#f59e0b" : "#f43f5e";
  const statusLabel = isGood ? "Nominal" : isFair ? "Degraded" : "Critical";

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-[#0c1017] p-5">
      <div className="w-full flex items-center justify-between border-b border-zinc-800 pb-3 mb-2">
        <h4 className="text-sm font-semibold text-white">Security Posture</h4>
        <span className="font-mono text-xs font-medium text-zinc-300">
          {statusLabel}
        </span>
      </div>

      <div className="relative flex items-center justify-center my-3">
        <svg width="120" height="120" className="-rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="#1f2937"
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
            strokeLinecap="round"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke={strokeColor}
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={circ}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-white">{calculatedScore}</span>
          <span className="font-mono text-[10px] text-zinc-500 uppercase">Score</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-2 text-center font-mono text-xs border-t border-zinc-800 pt-3">
        <div>
          <span className="text-zinc-500 block text-[10px] uppercase">Open Alerts</span>
          <span className="font-medium text-zinc-200">{alertsOpen}</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px] uppercase">Critical</span>
          <span className="font-medium text-rose-400">{criticalAlerts}</span>
        </div>
      </div>
    </div>
  );
}
