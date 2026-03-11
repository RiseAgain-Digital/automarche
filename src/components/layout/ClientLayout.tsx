"use client";

import { X, Loader2 } from "lucide-react";
import { ImportProvider, useImport } from "@/lib/import-context";

function ImportBanner() {
  const { importState, setImportState } = useImport();
  if (!importState) return null;

  return (
    <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-200 text-blue-700 text-sm px-4 py-2.5">
      {!importState.done && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      )}
      <span className="flex-1">{importState.message}</span>
      {importState.done && (
        <button onClick={() => setImportState(null)} className="shrink-0 p-0.5 rounded hover:bg-blue-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ImportProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
        <ImportBanner />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ImportProvider>
  );
}
