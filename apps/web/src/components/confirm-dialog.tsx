import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@airwave/ui/components/alert-dialog";
import { Button } from "@airwave/ui/components/button";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { useCallback, useState, type ReactNode } from "react";

type ConfirmOptions = {
  title: ReactNode;
  /** Short muted text under the title (rendered inside the description paragraph — keep it inline-level). */
  description?: ReactNode;
  /**
   * A bespoke content area rendered between the header and the footer — for richer confirmations that need
   * block content (lists, tables, a net-outcome summary) rather than a single line of description text.
   */
  body?: ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  destructive?: boolean;
  /**
   * Require the user to type an exact phrase (e.g. "DELETE") before the confirm button enables — for the
   * heavier, irreversible actions like removing a media source and everything built from it.
   */
  challenge?: {
    match: string;
    /** Label above the input. Defaults to `Type {match} to confirm`. */
    label?: ReactNode;
    placeholder?: string;
  };
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
 * `confirm()` resolves `true` on confirm and `false` on cancel / backdrop / Escape. Pass `challenge` to
 * gate the confirm button behind a typed phrase.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [typed, setTyped] = useState("");

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setPending({ ...options, resolve });
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }, []);

  const armed = !pending?.challenge || typed.trim() === pending.challenge.match;

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
            {pending.body && <div className="px-6 pb-2">{pending.body}</div>}
            {pending.challenge && (
              <div className="space-y-1.5 px-6 pb-4">
                <Label htmlFor="confirm-challenge">
                  {pending.challenge.label ?? `Type ${pending.challenge.match} to confirm`}
                </Label>
                <Input
                  id="confirm-challenge"
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={pending.challenge.placeholder ?? pending.challenge.match}
                />
              </div>
            )}
            <AlertDialogFooter>
              <Button variant="outline" size="sm" onClick={() => settle(false)}>
                {pending.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                size="sm"
                variant={pending.destructive ? "destructive" : "default"}
                disabled={!armed}
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
