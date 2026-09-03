import type { NextFunction, Request, Response } from 'express'
import type { AccountRole } from '../shared/index.js'
import { verifyAuthToken } from '../services/authService.js'

const readBearerToken = (request: Request) => {
  const authorization = request.header('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Missing bearer token')
  }

  return authorization.slice('Bearer '.length).trim()
}

export const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  try {
    request.auth = verifyAuthToken(readBearerToken(request))
    next()
  } catch (error) {
    response.status(401).json({ message: (error as Error).message || 'Unauthorized' })
  }
}

export const requireRole = (role: AccountRole) => {
  return (request: Request, response: Response, next: NextFunction) => {
    requireAuth(request, response, () => {
      if (request.auth?.role !== role) {
        return response.status(403).json({ message: 'Forbidden' })
      }

      next()
    })
  }
}

export const requireAdmin = requireRole('admin')
export const requireUser = requireRole('user')
