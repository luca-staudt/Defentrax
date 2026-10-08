export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-body text-center py-5">
        <div className="avatar-md mx-auto mb-3">
          <div className="avatar-title bg-primary-subtle text-primary rounded-circle fs-24">
            <i className="ri-shield-check-line"></i>
          </div>
        </div>
        <h5 className="mb-1">{title}</h5>
        {description ? <p className="text-muted mb-0">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
