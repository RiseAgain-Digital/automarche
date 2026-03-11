"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as XLSX from "xlsx";
import {
  Plus,
  Upload,
  Search,
  Pencil,
  Trash2,
  Package,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ProdutoData } from "@/types";

// Keep schema input === output to satisfy useForm<T> + zodResolver(schema) with Zod v4
const produtoSchema = z.object({
  code: z.string().min(1, "Código é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  unit: z.string().min(1),
  // Store price as string to keep input type identical to output type
  price: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  active: z.boolean(),
});

type ProdutoForm = z.infer<typeof produtoSchema>;

async function fetchProdutos(
  page: number,
  search: string
): Promise<{ data: ProdutoData[]; total: number; totalPages: number }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "15",
    ...(search ? { search } : {}),
  });
  const res = await fetch(`/api/produtos?${params.toString()}`);
  if (!res.ok) throw new Error("Erro ao buscar produtos");
  return res.json();
}

const unitOptions = ["UN", "KG", "CX", "LT", "MT", "PC", "DZ", "FD"];

function ProdutoFields({
  register,
  errors,
}: {
  register: ReturnType<typeof useForm<ProdutoForm>>["register"];
  errors: ReturnType<typeof useForm<ProdutoForm>>["formState"]["errors"];
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Código *
          </label>
          <input
            {...register("code")}
            type="text"
            placeholder="Ex: PRD-001"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.code ? "border-red-400" : "border-slate-300"
            }`}
          />
          {errors.code && (
            <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Unidade
          </label>
          <select
            {...register("unit")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Nome *
        </label>
        <input
          {...register("name")}
          type="text"
          placeholder="Nome do produto"
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.name ? "border-red-400" : "border-slate-300"
          }`}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Preço (R$)
          </label>
          <input
            {...register("price")}
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Categoria
          </label>
          <input
            {...register("category")}
            type="text"
            placeholder="Ex: Hortifruti"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          {...register("active")}
          type="checkbox"
          id="active-field"
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="active-field" className="text-sm text-slate-700">
          Produto ativo
        </label>
      </div>
    </>
  );
}

export default function ProdutosPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editProduto, setEditProduto] = useState<ProdutoData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["produtos", page, search],
    queryFn: () => fetchProdutos(page, search),
    placeholderData: (prev) => prev,
  });

  const toApiPayload = (data: ProdutoForm) => ({
    ...data,
    price: data.price ? parseFloat(data.price) || null : null,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProdutoForm) => {
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiPayload(data)),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Erro ao criar produto");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      setIsCreateOpen(false);
      createForm.reset({ unit: "UN", active: true });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: ProdutoForm & { id: string }) => {
      const res = await fetch(`/api/produtos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiPayload(data)),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Erro ao atualizar produto");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      setEditProduto(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/produtos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir produto");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      setDeleteConfirm(null);
    },
  });

  const createForm = useForm<ProdutoForm>({
    resolver: zodResolver(produtoSchema),
    defaultValues: { unit: "UN", active: true },
  });

  const editForm = useForm<ProdutoForm>({
    resolver: zodResolver(produtoSchema),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const openEdit = (produto: ProdutoData) => {
    setEditProduto(produto);
    editForm.reset({
      code: produto.code,
      name: produto.name,
      unit: produto.unit,
      price: produto.price ?? null,
      category: produto.category,
      active: produto.active,
    });
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus("Lendo arquivo...");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

      // Find header row (the one with ITM in column 0)
      const headerIdx = rawRows.findIndex((row) => Array.isArray(row) && row[0] === "ITM");

      let produtos: { code: string; name: string; unit: string; price: number | null; category: string | null; active: boolean }[];

      if (headerIdx !== -1) {
        // Mercalys format: ITM | EAN | DESIGN | PC | PVP | STOCK | MRG | IVA | NOM
        produtos = (rawRows.slice(headerIdx + 1) as unknown[][])
          .map((row) => ({
            code: String(row[0] ?? "").trim(),
            name: String(row[2] ?? "").trim(),
            unit: "UN",
            price: row[4] !== "" && row[4] !== undefined ? Number(row[4]) || null : null,
            category: String(row[8] ?? "").trim() || null,
            active: true,
          }))
          .filter((p) => p.code.length > 5 && p.name.length > 0);
      } else {
        // Generic format: try common column name variants
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        produtos = rows
          .map((row) => ({
            code: String(row["Código"] ?? row["codigo"] ?? row["code"] ?? row["CODE"] ?? row["ITM"] ?? "").trim(),
            name: String(row["Nome"] ?? row["nome"] ?? row["name"] ?? row["NAME"] ?? row["DESIGN"] ?? "").trim(),
            unit: String(row["Unidade"] ?? row["unidade"] ?? row["unit"] ?? "UN").trim() || "UN",
            price: row["Preço"] ?? row["preco"] ?? row["price"] ?? row["PVP"]
              ? parseFloat(String(row["Preço"] ?? row["preco"] ?? row["price"] ?? row["PVP"]).replace(",", ".")) || null
              : null,
            category: String(row["Categoria"] ?? row["categoria"] ?? row["category"] ?? row["NOM"] ?? "").trim() || null,
            active: true,
          }))
          .filter((p) => p.code && p.name);
      }

      if (produtos.length === 0) {
        setImportStatus("Nenhum produto válido encontrado. Verifique o arquivo.");
        return;
      }

      // Send all at once — the server handles batching internally so this
      // request completes even if the user navigates away before it finishes.
      setImportStatus(`Importando ${produtos.length} produtos...`);
      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(produtos),
      });
      if (!res.ok) throw new Error("Erro na importação");
      const json = await res.json();

      setImportStatus(json.message ?? `${produtos.length} produtos importados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      setTimeout(() => setImportStatus(null), 5000);
    } catch (err) {
      setImportStatus(`Erro: ${err instanceof Error ? err.message : "Falha na importação"}`);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const produtos = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Produtos</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} produto{total !== 1 ? "s" : ""} cadastrado
            {total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleExcelImport}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Importar Excel
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Import status */}
      {importStatus && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3">
          <span className="flex-1">{importStatus}</span>
          <button onClick={() => setImportStatus(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-5 flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por código, nome ou categoria..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        {search && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setSearchInput("");
              setPage(1);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {[
                "Código",
                "Nome",
                "Unidade",
                "Preço",
                "Categoria",
                "Status",
                "Ações",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : produtos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Package className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-slate-400 text-sm">
                    Nenhum produto encontrado
                  </p>
                </td>
              </tr>
            ) : (
              produtos.map((produto) => (
                <tr
                  key={produto.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                    {produto.code}
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium max-w-48 truncate">
                    {produto.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{produto.unit}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {produto.price
                      ? `R$ ${parseFloat(produto.price)
                          .toFixed(2)
                          .replace(".", ",")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {produto.category ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {produto.active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        <CheckCircle className="h-3 w-3" />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                        <XCircle className="h-3 w-3" />
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(produto)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(produto.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Página {page} de {totalPages} ({total} resultados)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          createForm.reset({ unit: "UN", active: true });
        }}
        title="Novo Produto"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreateOpen(false);
                createForm.reset({ unit: "UN", active: true });
              }}
            >
              Cancelar
            </Button>
            <Button
              form="create-produto-form"
              type="submit"
              loading={createMutation.isPending}
            >
              Criar Produto
            </Button>
          </div>
        }
      >
        {createMutation.isError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {createMutation.error?.message}
          </div>
        )}
        <form
          id="create-produto-form"
          onSubmit={createForm.handleSubmit((data) =>
            createMutation.mutate(data)
          )}
          className="space-y-4"
        >
          <ProdutoFields
            register={createForm.register}
            errors={createForm.formState.errors}
          />
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editProduto}
        onClose={() => setEditProduto(null)}
        title="Editar Produto"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditProduto(null)}>
              Cancelar
            </Button>
            <Button
              form="edit-produto-form"
              type="submit"
              loading={updateMutation.isPending}
            >
              Salvar Alterações
            </Button>
          </div>
        }
      >
        {updateMutation.isError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {updateMutation.error?.message}
          </div>
        )}
        <form
          id="edit-produto-form"
          onSubmit={editForm.handleSubmit((data) =>
            editProduto &&
            updateMutation.mutate({ ...data, id: editProduto.id })
          )}
          className="space-y-4"
        >
          <ProdutoFields
            register={editForm.register}
            errors={editForm.formState.errors}
          />
        </form>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirmar Exclusão"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                deleteConfirm && deleteMutation.mutate(deleteConfirm)
              }
              loading={deleteMutation.isPending}
            >
              Excluir
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Tem certeza que deseja excluir este produto? Esta ação não pode ser
          desfeita.
        </p>
      </Modal>
    </div>
  );
}
