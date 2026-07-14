/**
 * Transport-neutral error for the shared service layer. Services throw this;
 * each transport maps it to its own error shape (tRPC → TRPCError, REST → HTTP
 * status) so business logic isn't coupled to tRPC. See [[thin-api-endpoints]].
 */
export class ApiError extends Error {
  /** HTTP-style status the transport can map (404, 412, 400, 403, …). */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const notFound = (message: string) => new ApiError(404, message);
export const preconditionFailed = (message: string) => new ApiError(412, message);
export const badRequest = (message: string) => new ApiError(400, message);
