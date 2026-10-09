"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ApexOptions } from "apexcharts";
import { countSeverity } from "@/lib/alerts";
import { useI18n } from "@/lib/i18n";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

const BRAND = "#405189";
const TEAL = "#0ab39c";

function severityLabel(t: (key: string) => string, severity: string) {
  return t(`dash.sev.${severity}`);
}

function useChartMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const read = () => {
      const value = document.documentElement.getAttribute("data-bs-theme");
      setMode(value === "light" ? "light" : "dark");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });
    return () => observer.disconnect();
  }, []);

  return mode;
}

function palette(mode: "light" | "dark") {
  const dark = mode === "dark";
  return {
    fore: dark ? "#ced4da" : "#212529",
    muted: "#878a99",
    grid: dark ? "rgba(255,255,255,0.08)" : "#e9ebec",
    track: dark ? "rgba(255,255,255,0.08)" : "#e9ebec",
  };
}

/** Severity comparison as a smooth line chart (open alerts vs 24h events). */
export function SeverityLine({
  alerts,
  events,
}: {
  alerts: Record<string, number> | undefined;
  events: Record<string, number> | undefined;
}) {
  const mode = useChartMode();
  const { t } = useI18n();
  const colors = palette(mode);
  const categories = SEVERITIES.map((level) => severityLabel(t, level));
  const series = [
    { name: t("dash.open"), data: SEVERITIES.map((level) => countSeverity(alerts, level)) },
    { name: t("dash.events"), data: SEVERITIES.map((level) => countSeverity(events, level)) },
  ];

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "line",
        background: "transparent",
        foreColor: colors.fore,
        fontFamily: "inherit",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, speed: 650, easing: "easeinout" },
      },
      colors: [BRAND, TEAL],
      stroke: { width: 3, curve: "smooth" },
      markers: { size: 4, strokeWidth: 0, hover: { size: 6 } },
      dataLabels: { enabled: false },
      grid: {
        borderColor: colors.grid,
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        padding: { left: 8, right: 8 },
      },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: SEVERITIES.map(() => colors.muted), fontSize: "12px" } },
      },
      yaxis: {
        min: 0,
        forceNiceScale: true,
        labels: {
          style: { colors: colors.muted, fontSize: "12px" },
          formatter: (value: number) => `${Math.round(value)}`,
        },
      },
      legend: {
        position: "bottom",
        fontSize: "13px",
        labels: { colors: colors.fore },
      },
      tooltip: { theme: mode, shared: true, intersect: false },
      theme: { mode },
    }),
    [categories, colors.fore, colors.grid, colors.muted, mode],
  );

  return (
    <div className="apex-charts">
      <Chart key={mode} type="line" height={340} series={series} options={options} />
    </div>
  );
}

/** @deprecated Prefer SeverityLine — kept as alias during the dashboard chart swap. */
export const SeverityRadar = SeverityLine;

export function CoverageRadial({ active, total }: { active: number; total: number }) {
  const mode = useChartMode();
  const { t } = useI18n();
  const colors = palette(mode);
  const percent = total > 0 ? Math.round((active / total) * 100) : 0;
  const coverageLabel = t("dash.coverage");

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "radialBar",
        background: "transparent",
        foreColor: colors.fore,
        fontFamily: "inherit",
        toolbar: { show: false },
        animations: { enabled: true, speed: 700 },
      },
      colors: [BRAND],
      labels: [coverageLabel],
      fill: {
        type: "gradient",
        gradient: {
          shade: mode === "dark" ? "dark" : "light",
          type: "horizontal",
          gradientToColors: [TEAL],
          stops: [0, 100],
        },
      },
      stroke: { lineCap: "round" },
      plotOptions: {
        radialBar: {
          hollow: { size: "64%" },
          track: {
            background: colors.track,
            strokeWidth: "100%",
            margin: 4,
          },
          dataLabels: {
            name: { offsetY: -8, color: colors.muted, fontSize: "13px" },
            value: {
              color: colors.fore,
              fontSize: "28px",
              fontWeight: 600,
              formatter: (value: number) => `${Math.round(Number(value))}%`,
            },
          },
        },
      },
      tooltip: { theme: mode },
      theme: { mode },
    }),
    [colors.fore, colors.muted, colors.track, coverageLabel, mode],
  );

  return (
    <div className="apex-charts">
      <Chart key={mode} type="radialBar" height={280} series={[percent]} options={options} />
      <p className="text-muted text-center mb-0">
        {active.toLocaleString()} {active === 1 ? t("dash.activeAgent") : t("dash.activeAgents")} / {total.toLocaleString()}{" "}
        {total === 1 ? t("dash.serverOne") : t("dash.serverMany")}
      </p>
    </div>
  );
}
