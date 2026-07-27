// v6.01 — shared unsaved-changes guard for all edit surfaces.
// Surfaces track their own dirty state (snapshot compare); this hook intercepts
// close attempts and offers Save / Discard / Keep editing.
import { useState, useCallback, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

export function useUnsavedGuard({
  dirty,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  onDiscard: () => void;
  onSave?: () => void;
}): { requestClose: () => void; guard: ReactNode } {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setConfirmOpen(true);
    else onDiscard();
  }, [dirty, onDiscard]);

  const guard = (
    <UnsavedDialog
      open={confirmOpen}
      onKeep={() => setConfirmOpen(false)}
      onDiscard={() => { setConfirmOpen(false); onDiscard(); }}
      onSave={onSave ? () => { setConfirmOpen(false); onSave(); } : undefined}
    />
  );

  return { requestClose, guard };
}

// Registry for inline (non-dialog) edit surfaces — e.g. admin settings panels
// guarded on tab switches. Children register their dirty check + save action;
// the parent asks the registry before allowing navigation.
export type DirtyRegistry = {
  register: (key: string, entry: { isDirty: () => boolean; save: () => void }) => void;
  unregister: (key: string) => void;
  dirty: () => boolean;
  saveAll: () => void;
};

export function createDirtyRegistry(): DirtyRegistry {
  const entries = new Map<string, { isDirty: () => boolean; save: () => void }>();
  return {
    register: (key, entry) => { entries.set(key, entry); },
    unregister: (key) => { entries.delete(key); },
    dirty: () => {
      let d = false;
      entries.forEach((e) => { if (e.isDirty()) d = true; });
      return d;
    },
    saveAll: () => {
      entries.forEach((e) => { if (e.isDirty()) e.save(); });
    },
  };
}

export function UnsavedDialog({
  open,
  onKeep,
  onDiscard,
  onSave,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
  onSave?: () => void;
}) {
  const { t } = useLang();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onKeep(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-unsaved">
        <DialogHeader>
          <DialogTitle className="text-base">{t("unsavedTitle")}</DialogTitle>
          <DialogDescription>{t("unsavedBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {onSave && (
            <Button onClick={onSave} data-testid="button-unsaved-save">
              {t("unsavedSave")}
            </Button>
          )}
          <Button variant="destructive" onClick={onDiscard} data-testid="button-unsaved-discard">
            {t("unsavedDiscard")}
          </Button>
          <Button variant="outline" onClick={onKeep} data-testid="button-unsaved-keep">
            {t("unsavedKeep")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
