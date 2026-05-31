import { createContext, useContext, useState } from 'react'

const RecipeContext = createContext(null)

export function RecipeProvider({ children }) {
  const [recipe, setRecipe] = useState(null)
  return (
    <RecipeContext.Provider value={{ recipe, setRecipe }}>
      {children}
    </RecipeContext.Provider>
  )
}

export function useRecipe() {
  return useContext(RecipeContext)
}
