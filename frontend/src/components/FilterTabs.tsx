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
      {tabs.map((tab) => (
        <button key={tab.key} type="button" className={`task-tab-btn ${value === tab.key ? "active" : ""}`} onClick={() => onChange(tab.key)}>
          {tab.label}
          {tab.count != null && ` (${tab.count})`}
        </button>
      ))}
    </div>
  );
}
