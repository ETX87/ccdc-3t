// Bo loc con dang vien thuoc (DESIGN_SYSTEM.md 6.3) - so dem trong ngoac lay tu du lieu that.
export function FilterTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="task-filter-tabs">
      {tabs.map((t) => (
        <button key={t.key} type="button" className={`task-tab-btn ${value === t.key ? "active" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && ` (${t.count})`}
        </button>
      ))}
    </div>
  );
}
