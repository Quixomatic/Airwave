import { getToken, hasServerUrl } from "./auth";

export function sessionRoute(): "/setup" | "/login" | "/guide" {
  if (!hasServerUrl()) return "/setup";
  return getToken() ? "/guide" : "/login";
}
