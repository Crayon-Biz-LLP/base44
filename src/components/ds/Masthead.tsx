import React from "react";
import { cn } from "cn";

interface MastheadProps {
  title: string;
  subtitle?: string;
  description?: string;
  className?: string;
}

export function Masthead({ title, subtitle, description, className }: MastheadProps) {
  return (
    <div className={cn("flex flex-col gap-1 pb-6 border-b border-slate-100 mb-6", className)}>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <h2 className="text-lg font-medium text-slate-600">{subtitle}</h2>}
      {description && <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>}
    </div>
  );
}