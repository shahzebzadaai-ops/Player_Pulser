import { METRIC_DEFINITIONS } from "@/domain/reporting";

export function MetricDefinitions() {
  return (
    <details className="mt-4 rounded-xl border border-line bg-card px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">Metric definitions</summary>
      <dl className="mt-3 space-y-2">
        {METRIC_DEFINITIONS.map((item) => (
          <div key={item.name}>
            <dt className="font-medium">{item.name}</dt>
            <dd className="text-muted">{item.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
