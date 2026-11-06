import { useEffect, useRef, useState, type ReactNode } from "react";
import { SidebarDivider } from "./SidebarDivider";

export const defaultChangesPanelWidth = 400;
export function WorkspaceSplit({
  changesWidth,
  onResize,
  label,
  hint,
  valueText,
  children,
}: {
  changesWidth: number;
  onResize: (changesWidth: number) => void;
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
  // The changes column keeps a fixed width. Extra window width goes to the graph.
  const changesMin = 300;
  const historyFloor = 360;
  const maxChanges = Math.max(changesMin, available - historyFloor);
  const resolvedChanges = available
    ? Math.min(maxChanges, Math.max(changesMin, changesWidth))
    : changesWidth;
  const historyWidth = Math.max(0, available - resolvedChanges);
  const historyMin = Math.max(0, available - maxChanges);
  const historyMax = Math.max(historyMin, available - changesMin);
  const historyPercent = available ? (historyWidth / available) * 100 : 0;
  return (
    <div
      className="workspace"
      ref={ref}
      style={{
        gap: 0,
        gridTemplateColumns: available
          ? `${historyWidth}px 18px ${resolvedChanges}px`
          : `minmax(0, 1fr) 18px ${changesWidth}px`,
      }}
    >
      {children}
      <SidebarDivider
        className="sidebar-resizer workspace-resizer"
        width={Math.round(historyWidth)}
        min={Math.ceil(historyMin)}
        max={Math.floor(historyMax)}
        label={label}
        hint={`${valueText(historyPercent)} · ${hint}`}
        valueText={valueText(historyPercent)}
        onResize={(next) =>
          available > 0 && onResize(Math.round(available - next))
        }
        onReset={() => onResize(defaultChangesPanelWidth)}
      />
    </div>
  );
}
