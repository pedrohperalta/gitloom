import { useEffect, useRef, useState, type ReactNode } from "react";
import { SidebarDivider } from "./SidebarDivider";

export function WorkspaceSplit({
  percent,
  onResize,
  label,
  hint,
  valueText,
  children,
}: {
  percent: number;
  onResize: (percent: number) => void;
  label: string;
  hint: string;
  valueText: (percent: number) => string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setAvailable(Math.max(0, entry.contentRect.width - 18));
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  // Keep both panels usable when a saved proportion meets a smaller window.
  // The preferred proportion is retained and restored when space becomes available.
  const min = Math.max(available * 0.2, Math.min(280, available / 2));
  const max = Math.min(
    available * 0.8,
    Math.max(min, available - Math.min(300, available / 2)),
  );
  const width = Math.min(max, Math.max(min, (available * percent) / 100));
  return (
    <div
      className="workspace"
      ref={ref}
      style={{ gridTemplateColumns: `${width}px 18px minmax(0, 1fr)` }}
    >
      {children}
      <SidebarDivider
        className="sidebar-resizer workspace-resizer"
        width={Math.round(width)}
        min={Math.ceil(min)}
        max={Math.floor(max)}
        label={label}
        hint={`${valueText(available ? (width / available) * 100 : percent)} · ${hint}`}
        valueText={valueText(available ? (width / available) * 100 : percent)}
        onResize={(next) =>
          available > 0 &&
          onResize(
            Math.min(
              80,
              Math.max(20, Math.round((next / available) * 10000) / 100),
            ),
          )
        }
        onReset={() => onResize(58.33)}
      />
    </div>
  );
}
