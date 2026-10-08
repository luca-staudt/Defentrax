"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ApexOptions } from "apexcharts";
import { countSeverity } from "@/lib/alerts";
import { useI18n } from "@/lib/i18n";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

/** Velzon palette, mapped so severity reads the same on every chart. */
const SEVERITY_COLORS = ["#f06548", "#f7b84b", "#299cdb", "#0ab39c", "#878a99"];
const BRAND = "#405189";

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

export function OpenAlertsDonut({ counts }: { counts: Record<string, number> | undefined }) {
  const mode = useChartMode();
  const { t } = useI18n();
  const colors = palette(mode);
  const series = SEVERITIES.map((level) => countSeverity(counts, level));
  const total = series.reduce((sum, value) => sum + value, 0);
  const openLabel = t("dash.openTotal");

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "donut",
        background: "transparent",
        foreColor: colors.fore,
        fontFamily: "inherit",
        toolbar: { show: false },
        animations: { enabled: true, speed: 550 },
      },
      labels: SEVERITIES.map((level) => severityLabel(t, level)),
      colors: SEVERITY_COLORS,
      legend: {
        position: "bottom",
        fontSize: "13px",
        labels: { colors: colors.fore },
        markers: { offsetX: -2 },
      },
      dataLabels: { enabled: false },
      stroke: { width: 0 },
      tooltip: { theme: mode },
      theme: { mode },
      plotOptions: {
        pie: {
          donut: {
            size: "72%",
            labels: {
              show: true,
              name: { color: colors.muted, fontSize: "13px" },
              value: {
                color: colors.fore,
                fontSize: "22px",
                fontWeight: 600,
              },
              total: {
                show: true,
                showAlways: true,
                label: openLabel,
                color: colors.muted,
                fontSize: "13px",
                formatter: () => String(total),
              },
            },
          },
        },
      },
    }),
    [colors.fore, colors.muted, mode, openLabel, t, total],
  );

  return (
    <div className="apex-charts">
      <Chart key={mode} type="donut" height={320} series={series} options={options} />
    </div>
  );
}

export function EventsSeverityChart({ counts }: { counts: Record<string, number> | undefined }) {
  const mode = useChartMode();
  const { t } = useI18n();
  const colors = palette(mode);
  const categories = SEVERITIES.map((level) => severityLabel(t, level));
  const series = [{ name: t("dash.events"), data: SEVERITIES.map((level) => countSeverity(counts, level)) }];

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "bar",
        background: "transparent",
        foreColor: colors.fore,
        fontFamily: "inherit",
        toolbar: { show: false },
        animations: { enabled: true, speed: 550 },
      },
      colors: SEVERITY_COLORS,
      plotOptions: {
        bar: {
          borderRadius: 4,
          columnWidth: "46%",
          distributed: true,
        },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: {
        borderColor: colors.grid,
        strokeDashArray: 4,
      },
      xaxis: {
        categories,
        labels: { style: { colors: SEVERITIES.map(() => colors.muted), fontSize: "12px" } },
        axisBorder: { color: colors.grid },
        axisTicks: { color: colors.grid },
      },
      yaxis: {
        min: 0,
        labels: { style: { colors: colors.muted } },
      },
      tooltip: { theme: mode },
      theme: { mode },
    }),
    [categories, colors.fore, colors.grid, colors.muted, mode],
  );

  return (
    <div className="apex-charts">
      <Chart key={mode} type="bar" height={320} series={series} options={options} />
    </div>
  );
}

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
        animations: { enabled: true, speed: 550 },
      },
      colors: [BRAND],
      labels: [coverageLabel],
      stroke: { lineCap: "round" },
      plotOptions: {
        radialBar: {
          hollow: { size: "64%" },
          track: { background: colors.track },
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
