import axios from "axios";
import { create } from "zustand";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiErrorMessage } from "./error-message";
export const useStore = create((set) => ({
  user: null,
  theme: localStorage.getItem("dp-theme") || "light",
  saving: 0,
  error: "",
  toast: "",
  setUser: (user) => set({ user }),
  setError: (error) => set({ error: apiErrorMessage(error) }),
  notify: (toast) => {
    set({ toast });
    setTimeout(() => set({ toast: "" }), 4500);
  },
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "light" ? "dark" : "light";
      localStorage.setItem("dp-theme", theme);
      return { theme };
    }),
}));
export const api = axios.create({ baseURL: "/api", withCredentials: true });
api.interceptors.request.use((c) => {
  if (c.method !== "get") useStore.setState((s) => ({ saving: s.saving + 1 }));
  return c;
});
api.interceptors.response.use(
  (r) => {
    if (r.config.method !== "get")
      useStore.setState((s) => ({ saving: Math.max(0, s.saving - 1) }));
    return r;
  },
  (e) => {
    if (e.config?.method !== "get")
      useStore.setState((s) => ({ saving: Math.max(0, s.saving - 1) }));
    if (e.response?.status === 401) useStore.setState({ user: null });
    return Promise.reject(e);
  },
);
export const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000, refetchOnWindowFocus: true },
  },
});
export const useData = (key, url, enabled = true) =>
  useQuery({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: async () => (await api.get(url)).data,
    enabled,
  });
export function useWrite() {
  const qc = useQueryClient();
  return async (method, url, data, message = "Saved") => {
    try {
      const result = (await api[method](url, data)).data;
      await qc.invalidateQueries();
      useStore.getState().notify(message);
      return result;
    } catch (e) {
      useStore.getState().setError(e);
      throw e;
    }
  };
}
export const params = (obj) =>
  new URLSearchParams(
    Object.entries(obj).filter(([, v]) => v !== "" && v != null),
  ).toString();
