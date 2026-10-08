export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="card">
      <div className="card-body text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">{label}</span>
        </div>
        <p className="text-muted mt-3 mb-0">{label}</p>
      </div>
    </div>
  );
}
