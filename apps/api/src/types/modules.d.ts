declare module 'cors'
declare module 'morgan'

declare namespace Express {
  interface Request {
    auth?: {
      id: string
      username: string
      role: 'admin' | 'user'
    }
  }
}
