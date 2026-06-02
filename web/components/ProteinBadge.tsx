"use client";

import { computeProteinPer100kcal, formatGrams, type Nutrition, RATING_COLORS, ratingFor, VERDICTS, KJ_PER_KCAL } from "@/lib/rating";

type Props = {
  nutrition: Nutrition | null;
  size?: "sm" | "lg";
};

export function ProteinBadge({ nutrition, size = "sm" }: Props) {
  if (!nutrition || nutrition.noData) {
    return (
      <PillShell rating="na" tooltip="No nutrition info published for this product." size={size}>
        <span className="font-bold">—</span>
        <span className="ml-1 text-[10px] font-bold uppercase opacity-85 tracking-wider">g P / 100 kcal</span>
      </PillShell>
    );
  }
  const density = computeProteinPer100kcal(nutrition);
  if (!density) {
    return (
      <PillShell rating="na" tooltip="Insufficient nutrition data — no energy value published." size={size}>
        <span className="font-bold">—</span>
        <span className="ml-1 text-[10px] font-bold uppercase opacity-85 tracking-wider">g P / 100 kcal</span>
      </PillShell>
    );
  }
  const rating = ratingFor(density.value);
  const valueText = Number.isFinite(density.value) ? formatGrams(density.value) : "∞";
  const tooltip = buildTooltip(nutrition, density.value, rating);

  return (
    <PillShell rating={rating} tooltip={tooltip} size={size}>
      <span className={size === "lg" ? "text-xl font-extrabold" : "font-extrabold"}>{valueText}</span>
      <span className="ml-1 text-[10px] font-bold uppercase opacity-85 tracking-wider">g P / 100 kcal</span>
    </PillShell>
  );
}

function PillShell({ rating, tooltip, size, children }: { rating: ReturnType<typeof ratingFor>; tooltip: string; size: "sm" | "lg"; children: React.ReactNode }) {
  const c = RATING_COLORS[rating];
  const padding = size === "lg" ? "px-3 py-1.5" : "px-2.5 py-1";
  return (
    <span
      title={tooltip}
      className={`inline-flex items-baseline rounded-full leading-none whitespace-nowrap ${padding} shadow-sm cursor-help`}
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

function buildTooltip(info: Nutrition, value: number, rating: ReturnType<typeof ratingFor>): string {
  const lines: string[] = [];
  lines.push(VERDICTS[rating]);
  if (Number.isFinite(value)) {
    lines.push(`${formatGrams(value)} g of protein per 100 kcal`);
  } else {
    lines.push("∞ g of protein per 100 kcal");
    lines.push("(no caloric energy)");
  }
  if (info.proteinPer100g != null || info.energyKjPer100g != null) {
    lines.push("");
    lines.push("Per 100g");
    if (info.proteinPer100g != null) lines.push(`    ${info.proteinPer100g} g protein`);
    if (info.energyKjPer100g != null) {
      const kcal = Math.round(info.energyKjPer100g / KJ_PER_KCAL);
      lines.push(`    ${kcal} kcal`);
    }
  }
  if (info.proteinPerServing != null || info.energyKjPerServing != null) {
    lines.push("");
    lines.push(info.servingSize ? `Per serve (${info.servingSize})` : "Per serve");
    if (info.proteinPerServing != null) lines.push(`    ${info.proteinPerServing} g protein`);
    if (info.energyKjPerServing != null) {
      const kcal = Math.round(info.energyKjPerServing / KJ_PER_KCAL);
      lines.push(`    ${kcal} kcal`);
    }
  }
  return lines.join("\n");
}
