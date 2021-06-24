export class ServerUtilError extends Error {
  response: object

  constructor(message: string, response: object) {
    super(message)
    this.response = response
  }
}
