import { useId, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function SidebarSection({
  id,
  title,
  count,
  collapsed,
  onToggle,
  actions,
  children,
  nested = false,
}: {
  id: string;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: (id: string) => void;
  actions?: ReactNode;
  children: ReactNode;
  nested?: boolean;
}) {
  const contentId = useId();
  return (
    <section
      className={`repository-section ${nested ? "nested-section" : ""} ${id === "recents" ? "recents-section" : ""}`}
      aria-label={title}
    >
      <div className="sidebar-label section-heading">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          aria-label={title}
          onClick={() => onToggle(id)}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="section-title">{title}</span>
          <span className="section-count">{count}</span>
        </button>
        {actions}
      </div>
      <div id={contentId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
