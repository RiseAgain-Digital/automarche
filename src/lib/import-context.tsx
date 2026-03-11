"use client";

import { createContext, useContext, useState } from "react";

type ImportState = {
  message: string;
  done: boolean; // false = in progress (no dismiss), true = finished (can dismiss)
} | null;

type ImportContextValue = {
  importState: ImportState;
  setImportState: (state: ImportState) => void;
};

const ImportContext = createContext<ImportContextValue>({
  importState: null,
  setImportState: () => {},
});

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [importState, setImportState] = useState<ImportState>(null);
  return (
    <ImportContext.Provider value={{ importState, setImportState }}>
      {children}
    </ImportContext.Provider>
  );
}

export const useImport = () => useContext(ImportContext);
