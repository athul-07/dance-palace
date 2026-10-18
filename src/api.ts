import axios from "axios";
import { create } from "zustand";
import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { apiErrorMessage } from "../shared/api-errors";
export const useApp = create<{
  theme: string;
  pending: number;
  error: string;
  notice: string;
  set: (v: any) => void;
}>((set) => ({ theme: "light", pending: 0, error: "", notice: "", set }));
export const api = axios.create({ baseURL: "/api", withCredentials: true });
api.interceptors.request.use((config) => {
  if (config.method !== "get")
    useApp.setState((s) => ({ pending: s.pending + 1, error: "", notice: "" }));
  return config;
});
api.interceptors.response.use(
  (r) => {
    if (r.config.method !== "get")
      useApp.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    return r;
  },
  (e) => {
    if (e.config?.method !== "get")
      useApp.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    if (e.response?.status !== 401)
      useApp.setState({ error: apiErrorMessage(e) });
    else if (e.config?.url !== "/auth/login")
      client.setQueryData(["/auth/me", undefined], null);
    return Promise.reject(e);
  },
);
export const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
export function useData(path: string, params?: any, enabled = true) {
  return useQuery<any>({
    queryKey: [path, params],
    queryFn: async () => (await api.get(path, { params })).data,
    enabled,
  });
}
export function useWrite() {
  return useMutation({
    mutationFn: async ({
      path,
      data,
      method = "post",
    }: {
      path: string;
      data?: any;
      method?: string;
    }) => (await api.request({ url: path, data, method })).data,
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}
export const notify = (notice: string) => useApp.setState({ notice });
