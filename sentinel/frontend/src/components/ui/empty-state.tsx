export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-6 py-12 text-center">
      <p className="font-display text-lg text-zinc-200">{title}</p>
      {description ? (
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      ) : null}
    </div>
  );
}
