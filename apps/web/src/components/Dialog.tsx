"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog({ open, onOpenChange, title, description, children, footer, wide = false }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[rgb(10_8_6/0.55)] backdrop-blur-[6px]" />
        <D.Content className={`glass-solid pf-fade-up fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius)] p-5 sm:p-7 ${wide ? "max-w-2xl" : "max-w-md"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-xl font-bold tracking-tight">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="pf-press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface-inner text-muted hover:bg-surface-hover hover:text-fg" aria-label="Close"><X size={16} /></D.Close>
          </div>
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
