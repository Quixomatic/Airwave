import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@airwave/ui/components/alert-dialog";
import { Button } from "@airwave/ui/components/button";
import { useCallback, useState, type ReactNode } from "react";

type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * A promise-based confirm dialog — a proper in-app replacement for `window.confirm`, built on the base-lyra
 * {@link AlertDialog}.
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * // ...render {dialog} once in the component...
 * if (await confirm({ title: "Stop this run?", destructive: true })) doIt();
 * ```
 *
 * `confirm()` resolves `true` on confirm and `false` on cancel / backdrop / Escape.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }, []);

  const dialog = (
    <AlertDialog open={pending != null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        {pending && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.title}</AlertDialogTitle>
              {pending.description && (
                <AlertDialogDescription>{pending.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" size="sm" onClick={() => settle(false)}>
                {pending.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                size="sm"
                variant={pending.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
