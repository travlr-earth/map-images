// HTTP port. Both verbs accept standard fetch RequestInit options plus an
// overall timeout after which the request is aborted.
export interface IHttp {
  get(
    url: string,
    options?: RequestInit,
    timeoutMs?: number,
  ): Promise<Response>;
  post(
    url: string,
    body: string,
    options?: RequestInit,
    timeoutMs?: number,
  ): Promise<Response>;
}
