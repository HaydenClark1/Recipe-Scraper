import { apiClient } from './client.js'

export const signup = (email, password) =>
  apiClient('/auth/signup', { email, password })

export const login = (email, password) =>
  apiClient('/auth/login', { email, password })
