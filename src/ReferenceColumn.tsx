import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { SidebarDivider } from "./SidebarDivider";

export function ReferenceColumn({
  width,
  onResize,
  label,
  hint,
  title,
  messageTitle,
  dateTitle,
  hidden,
  children,
}: {
  width: number;
  onResize: (width: number) => void;
  label: string;
  hint: string;
  title: string;
  messageTitle: string;
  dateTitle: string;
  hidden: boolean;
  children: (heading: ReactNode) => ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width) setAvailable(entry.contentRect.width);
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  const max = Math.min(800, Math.max(100, available - 220));
  const actualWidth = Math.min(max, Math.max(100, width));
  return (
    <section
      ref={ref}
      className="history-panel"
      hidden={hidden}
      style={{ "--refs-width": `${actualWidth}px` } as CSSProperties}
    >
      {children(
        <div className="history-columns">
          <span className="refs-heading">
            {title}
            <SidebarDivider
              className="reference-resizer"
              width={actualWidth}
              min={100}
              max={Math.floor(max)}
              label={label}
              hint={hint}
              onResize={onResize}
              onReset={() => onResize(150)}
            />
          </span>
          <span className="message-heading">{messageTitle}</span>
          <span>{dateTitle}</span>
        </div>,
      )}
    </section>
  );
}
