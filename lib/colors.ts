export const COLORS = [
  { id: "rose", label: "Rose", className: "bg-rose-600" },
  { id: "orange", label: "Orange", className: "bg-orange-600" },
  { id: "amber", label: "Amber", className: "bg-amber-600" },
  { id: "emerald", label: "Emerald", className: "bg-emerald-600" },
  { id: "sky", label: "Sky", className: "bg-sky-600" },
  { id: "indigo", label: "Indigo", className: "bg-indigo-600" },
  { id: "violet", label: "Violet", className: "bg-violet-600" },
  { id: "slate", label: "Slate", className: "bg-slate-600" },
] as const;

export type ColorId = (typeof COLORS)[number]["id"];

export const COLOR_IDS = COLORS.map((color) => color.id) as [
  ColorId,
  ...ColorId[],
];

export const DEFAULT_COLOR: ColorId = "indigo";

export function colorClass(id: ColorId): string {
  const color = COLORS.find((candidate) => candidate.id === id);
  return color === undefined ? COLORS[0].className : color.className;
}
