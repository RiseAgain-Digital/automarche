"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package2, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });

      if (result.error) {
        setServerError(
          result.error.message ?? "Credenciais inválidas. Tente novamente."
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Erro ao realizar login. Verifique sua conexão.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 px-8 py-8 text-center">
            <div className="flex justify-center mb-3">
              <div className="p-3 bg-blue-600 rounded-xl">
                <Package2 className="h-7 w-7 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              automarche
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Sistema de Gestão de Faturas
            </p>
          </div>

          {/* Form */}
          <div className="px-8 py-7">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Bem-vindo de volta
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Faça login para acessar o sistema
            </p>

            {serverError && (
              <div className="mb-4 flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  {...register("email")}
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className={`
                    w-full rounded-lg border bg-white text-slate-900 text-sm
                    placeholder:text-slate-400
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    transition-colors px-3 py-2.5
                    ${errors.email ? "border-red-400" : "border-slate-300 hover:border-slate-400"}
                  `}
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`
                      w-full rounded-lg border bg-white text-slate-900 text-sm
                      placeholder:text-slate-400
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      transition-colors px-3 py-2.5 pr-10
                      ${errors.password ? "border-red-400" : "border-slate-300 hover:border-slate-400"}
                    `}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-600">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isSubmitting ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          automarche &copy; {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
