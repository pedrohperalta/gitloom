import { useRef, useState } from "react";

export function SidebarDivider({
  width,
  min,
  max,
  label,
  hint,
  onResize,
  onReset,
  className = "sidebar-resizer",
  valueText,
}: {
  className?: string;
  valueText?: string;
  width: number;
  min: number;
  max: number;
  label: string;
  hint: string;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const resize = (next: number) =>
    onResize(Math.round(Math.min(max, Math.max(min, next))));
  return (
    <div
      className={className}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={valueText}
      title={hint}
      data-dragging={dragging}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (drag.current)
          resize(drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        if (
          !["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        if (event.key === "Enter") onReset();
        else
          resize(
            event.key === "Home"
              ? min
              : event.key === "End"
                ? max
                : width +
                  (event.key === "ArrowLeft" ? -1 : 1) *
                    (event.shiftKey ? 30 : 10),
          );
      }}
    />
  );
}
