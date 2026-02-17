import type { ReactNode } from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface FullscreenModalShellProps {
  children: ReactNode;
  className?: string;
}

export function FullscreenModalShell({ children, className }: FullscreenModalShellProps) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        '!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-screen !max-w-none !flex !flex-col !gap-0 rounded-none border-0 p-0 overflow-hidden',
        className
      )}
    >
      {children}
    </DialogContent>
  );
}
