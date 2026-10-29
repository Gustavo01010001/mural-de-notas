export class HttpError extends Error {
  // details: dados extras que vão junto na resposta (ex.: a versão atual num conflito de edição)
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
