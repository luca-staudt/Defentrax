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

  const baseVolume = eventsTotal > 0 ? eventsTotal : 0;
  const baseAlerts = alertsCount > 0 ? alertsCount : 0;

  const hourlyRatios = [
    { hour: "00:00", mult: 0.04, threatMult: 0.05 },
    { hour: "02:00", mult: 0.03, threatMult: 0.02 },
    { hour: "04:00", mult: 0.02, threatMult: 0.01 },
    { hour: "06:00", mult: 0.05, threatMult: 0.04 },
    { hour: "08:00", mult: 0.11, threatMult: 0.14 },
    { hour: "10:00", mult: 0.15, threatMult: 0.18 },
    { hour: "12:00", mult: 0.13, threatMult: 0.15 },
    { hour: "14:00", mult: 0.16, threatMult: 0.2 },
    { hour: "16:00", mult: 0.14, threatMult: 0.12 },
    { hour: "18:00", mult: 0.08, threatMult: 0.06 },
    { hour: "20:00", mult: 0.06, threatMult: 0.02 },
    { hour: "22:00", mult: 0.03, threatMult: 0.01 },
  ];

  const data = hourlyRatios.map((r) => ({
    time: r.hour,
    events: Math.max(0, Math.round(baseVolume * r.mult)),
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
    <div className="card">
      <div className="card-header align-items-center d-flex">
        <h4 className="card-title mb-0 flex-grow-1">24-Hour Telemetry Volume</h4>
        <span className="text-muted">Peak: {maxEvents.toLocaleString()}</span>
      </div>
      <div className="card-body">
        <p className="text-muted">
          {eventsTotal ? `${eventsTotal.toLocaleString()} total events recorded` : "Awaiting agent stream"}
        </p>
        <svg viewBox={`0 0 500 ${height}`} style={{ width: "100%", overflow: "visible" }}>
          <defs>
            <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#405189" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#405189" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#telemetryGrad)" />
          <path d={pathD} fill="none" stroke="#405189" strokeWidth="1.5" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === i ? 4 : 2}
              fill="#405189"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>
        <div className="d-flex justify-content-between text-muted fs-12 mt-2">
          <span>00:00 UTC</span>
          <span>
            {hoveredIdx !== null
              ? `${data[hoveredIdx].time} — ${data[hoveredIdx].events.toLocaleString()} events (${data[hoveredIdx].threats} alerts)`
              : "Hover a point for details"}
          </span>
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
  const calculatedScore =
    score !== undefined ? score : Math.max(12, Math.min(100, 100 - alertsOpen * 6 - criticalAlerts * 12));

  const radius = 46;
  const circ = 2 * Math.PI * radius;
  const strokeDashoffset = circ - (calculatedScore / 100) * (circ * 0.75);
  const isGood = calculatedScore >= 80;
  const isFair = calculatedScore >= 50 && calculatedScore < 80;
  const strokeColor = isGood ? "#0ab39c" : isFair ? "#f7b84b" : "#f06548";
  const statusLabel = isGood ? "Nominal" : isFair ? "Degraded" : "Critical";

  return (
    <div className="card">
      <div className="card-header align-items-center d-flex">
        <h4 className="card-title mb-0 flex-grow-1">Security Posture</h4>
        <span className="badge bg-primary-subtle text-primary">{statusLabel}</span>
      </div>
      <div className="card-body text-center">
        <div className="position-relative d-inline-block">
          <svg width="120" height="120" style={{ transform: "rotate(-90deg)" }}>
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke="currentColor"
              className="text-muted"
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
            />
          </svg>
          <div className="position-absolute top-50 start-50 translate-middle text-center">
            <h4 className="mb-0">{calculatedScore}</h4>
            <span className="text-muted fs-12">Score</span>
          </div>
        </div>
        <div className="row mt-3">
          <div className="col-6">
            <p className="text-muted mb-1">Open Alerts</p>
            <h5 className="mb-0">{alertsOpen}</h5>
          </div>
          <div className="col-6">
            <p className="text-muted mb-1">Critical</p>
            <h5 className="mb-0 text-danger">{criticalAlerts}</h5>
          </div>
        </div>
      </div>
    </div>
  );
}
