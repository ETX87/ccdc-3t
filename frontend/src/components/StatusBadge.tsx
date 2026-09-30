type Tone = "neutral" | "success" | "warning" | "danger";

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}
