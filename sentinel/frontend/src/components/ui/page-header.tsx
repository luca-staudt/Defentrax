export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="col-12">
        <div className="page-title-box d-sm-flex align-items-center justify-content-between">
          <h4 className="mb-sm-0">{title}</h4>
          {actions ? <div className="page-title-right">{actions}</div> : null}
        </div>
        {subtitle ? <p className="text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
