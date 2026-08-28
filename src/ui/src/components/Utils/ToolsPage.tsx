import { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import "../../styles/admin-tools.css";

// Frame for the contributor tooling pages (Settings → contributor / user
// roles / user stats / infra stats). Gates on role client-side so a
// bookmarked URL shows a plain message instead of a wall of 403 errors —
// the backend enforces it regardless.
export function ToolsPage({ title, sub, action, contributorOnly = true, children }: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  contributorOnly?: boolean;
  children: ReactNode;
}) {
  const { currentRole } = useAuth()!;
  const allowed = !contributorOnly || currentRole === "contributor";
  return (
    <main className="page tools-page">
      <div className="tools-inner">
        <div className="tools-header">
          <h1 className="tools-title">{title}</h1>
          {action}
        </div>
        {sub && <p className="tools-sub">{sub}</p>}
        {allowed ? children : <p className="tools-empty">contributors only.</p>}
      </div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tools-section">
      <h2 className="tools-section-title">{title}</h2>
      {children}
    </section>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <span className={`tools-badge tools-badge-${role}`}>{role}</span>;
}
