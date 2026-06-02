import { createContext, useContext, useState, useEffect } from 'react'
import { getToken, setToken, clearToken } from '../api/client.js'
import * as authApi from '../api/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getToken().then((t) => {
      setTokenState(t)
      setLoading(false)
    })
  }, [])

  const login = async (email, password) => {
    const { token, user } = await authApi.login(email, password)
    await setToken(token)
    setTokenState(token)
    setUser(user)
  }

  const signup = async (email, password) => {
    const { token, user } = await authApi.signup(email, password)
    await setToken(token)
    setTokenState(token)
    setUser(user)
  }

  const logout = async () => {
    await clearToken()
    setTokenState(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ token, user, loading, isAuthenticated: !!token, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
