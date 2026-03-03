"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function EditableCell({
  value,
  onBlur,
  placeholder,
  className,
  inputClassName,
}: {
  value: string;
  onBlur: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const lastSubmittedValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setLocal((prev) => {
        if (value === lastSubmittedValueRef.current) {
          lastSubmittedValueRef.current = null;
          return value;
        }
        if (lastSubmittedValueRef.current != null) return prev;
        if (value !== prev) return value;
        return prev;
      });
    }
  }, [value, editing]);

  const handleBlur = () => {
    setEditing(false);
    if (local !== value) {
      lastSubmittedValueRef.current = local;
      onBlur(local);
    }
  };

  if (editing) {
    return (
      <Input
        className={cn("min-w-[120px] h-7 text-center text-sm lg:h-8", inputClassName)}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === "Enter" && handleBlur()}
        autoFocus
      />
    );
  }

  const displayValue = local || (placeholder ?? "");
  return (
    <button
      type="button"
      className={cn(
        "min-w-[120px] block w-full rounded border border-transparent px-2 py-1 text-center text-sm hover:border-input hover:bg-muted/50 lg:py-1.5",
        !displayValue && "text-muted-foreground",
        className
      )}
      onClick={() => setEditing(true)}
    >
      {displayValue}
    </button>
  );
}
