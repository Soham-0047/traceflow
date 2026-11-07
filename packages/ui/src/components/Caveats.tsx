export function Caveats({ items }: { items: string[] }) {
  return (
    <details className="caveats">
      <summary>What this cannot show</summary>
      <ul>
        {items.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </details>
  );
}
