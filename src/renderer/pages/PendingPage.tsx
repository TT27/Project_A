interface PendingPageProps {
  title: string;
  description: string;
}

/** Shown for workflow steps that need a project or an earlier step to be completed first. */
export function PendingPage({ title, description }: PendingPageProps) {
  return (
    <div className="content-inner">
      <div className="page-header">
        <h1>{title}</h1>
      </div>
      <div className="placeholder-panel" role="status">
        {description}
      </div>
    </div>
  );
}
