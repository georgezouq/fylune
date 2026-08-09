/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
function Root({ label, surfaceRef, className = "", children, ...props }) {
  return <section ref={surfaceRef} className={`content-surface ${className}`} aria-label={label} {...props}>{children}</section>;
}

function Header({ className = "", children, ...props }) {
  return <header className={`content-toolbar content-surface-header ${className}`} {...props}>{children}</header>;
}

function Panel({ as: Component = "main", panelRef, className = "", children, ...props }) {
  return <Component ref={panelRef} className={`content-surface-panel ${className}`} {...props}>{children}</Component>;
}

export const ContentSurface = { Root, Header, Panel };
