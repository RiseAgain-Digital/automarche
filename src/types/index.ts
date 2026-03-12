import type { Prisma } from "@prisma/client";
export type { FaturaStatus, DiscrepancyStatus, TaskStatus, Shift } from "@prisma/client";

// Prisma model types derived from the generated client
export type User = Prisma.UserGetPayload<Record<string, never>>;
export type Session = Prisma.SessionGetPayload<Record<string, never>>;
export type Account = Prisma.AccountGetPayload<Record<string, never>>;
export type Verification = Prisma.VerificationGetPayload<Record<string, never>>;
export type Produto = Prisma.ProdutoGetPayload<Record<string, never>>;
export type Fatura = Prisma.FaturaGetPayload<Record<string, never>>;
export type FaturaItem = Prisma.FaturaItemGetPayload<Record<string, never>>;
export type ScanItem = Prisma.ScanItemGetPayload<Record<string, never>>;
export type Discrepancy = Prisma.DiscrepancyGetPayload<Record<string, never>>;
export type Task = Prisma.TaskGetPayload<Record<string, never>>;
export type TaskTimeEntry = Prisma.TaskTimeEntryGetPayload<Record<string, never>>;

// API Response utilities
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Fatura with relations
export interface FaturaWithRelations {
  id: string;
  number: string;
  supplier: string | null;
  status: string;
  imageUrl: string | null;
  ocrData: unknown;
  totalInvoice: string | null;
  totalScanned: string | null;
  notes: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  items: FaturaItemData[];
  scanItems: ScanItemData[];
  discrepancies: DiscrepancyData[];
  tasks: TaskData[];
  _count?: {
    items: number;
    scanItems: number;
    discrepancies: number;
    tasks: number;
  };
}

export interface FaturaItemData {
  id: string;
  faturaId: string;
  produtoId: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: string;
  unitPrice: string;
  total: string;
  createdAt: Date;
}

export interface ScanItemData {
  id: string;
  faturaId: string;
  produtoId: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: string;
  scannedAt: Date;
  createdAt: Date;
}

export interface DiscrepancyData {
  id: string;
  faturaId: string;
  productCode: string | null;
  productName: string | null;
  invoiceQty: string;
  scannedQty: string;
  difference: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  shift: string | null;
  priority: number;
  dueDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  faturaId: string | null;
  createdById: string;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  timeEntries?: {
    id: string;
    startTime: string;
    endTime: string | null;
    duration: number | null;
  }[];
}

export interface ProdutoData {
  id: string;
  code: string;
  name: string;
  unit: string;
  price: string | null;
  category: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Dashboard metrics
export interface DashboardMetrics {
  totalFaturas: number;
  aguardandoRevisao: number;
  aprovadasHoje: number;
  aprovadasOntem: number;
  totalProdutos: number;
  faturasEsteMes: number;
  faturasUltimoMes: number;
  faturasByStatus: Record<string, number>;
}

// Status color mapping types
export type FaturaStatusKey =
  | "RECEBIDO"
  | "EM_PICAGEM"
  | "BLOQUEADO"
  | "EM_VALORIZACAO"
  | "DIVERGENCIA"
  | "VALIDADO";

export type TaskStatusKey = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
