import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

export function FlatSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="flat-select">
      <select {...props} />
      <ChevronDown size={13} aria-hidden="true" />
    </span>
  );
}
