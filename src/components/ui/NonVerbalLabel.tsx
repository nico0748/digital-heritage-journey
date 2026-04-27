import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export function NonVerbalLabel({
  icon: Icon,
  label,
  className,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.3em]",
        className,
      )}
    >
      <Icon size={14} />
      {label}
    </span>
  );
}
