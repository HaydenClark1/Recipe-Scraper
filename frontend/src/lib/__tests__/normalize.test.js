import { describe, it, expect } from 'vitest'
import { normalizeScraped, normalizeSearchResult } from '../normalize.js'

describe('normalizeScraped', () => {
  it('maps scrape response to normalized shape', () => {
    const input = {
      title: 'Banana Bread',
      image: 'https://example.com/img.jpg',
      ingredients: ['2 bananas', '1 cup flour'],
      instructions: ['Mix everything', 'Bake at 350'],
      prepTime: 'PT10M',
      totalTime: 'PT1H',
      servings: '8 servings',
      category: ['Bread'],
      cuisine: 'American',
    }
    const result = normalizeScraped(input)
    expect(result.title).toBe('Banana Bread')
    expect(result.image).toBe('https://example.com/img.jpg')
    expect(result.ingredients).toEqual(['2 bananas', '1 cup flour'])
    expect(result.instructions).toEqual(['Mix everything', 'Bake at 350'])
    expect(result.prepTime).toBe('PT10M')
    expect(result.totalTime).toBe('PT1H')
    expect(result.servings).toBe('8 servings')
    expect(result.category).toEqual(['Bread'])
    expect(result.cuisine).toEqual(['American'])
    expect(result.source).toBe('scrape')
    expect(typeof result.id).toBe('string')
    expect(result.id.length).toBeGreaterThan(0)
  })

  it('converts "N/A" strings to null', () => {
    const input = {
      title: 'Test',
      image: null,
      ingredients: [],
      instructions: [],
      prepTime: 'N/A',
      totalTime: 'N/A',
      servings: 'N/A',
      category: [],
      cuisine: [],
    }
    const result = normalizeScraped(input)
    expect(result.prepTime).toBeNull()
    expect(result.totalTime).toBeNull()
    expect(result.servings).toBeNull()
  })

  it('treats non-array instructions string as empty array', () => {
    const input = {
      title: 'Test',
      image: null,
      ingredients: [],
      instructions: 'No instructions Found',
      prepTime: null,
      totalTime: null,
      servings: null,
      category: [],
      cuisine: [],
    }
    const result = normalizeScraped(input)
    expect(result.instructions).toEqual([])
  })
})

describe('normalizeSearchResult', () => {
  it('splits comma-separated Cleaned_Ingredients into array', () => {
    const input = {
      Title: 'Pasta',
      Cleaned_Ingredients: "['1 cup pasta', '2 tbsp oil']",
      Instructions: 'Boil pasta\nDrain and serve',
      Image_Name: 'https://raw.githubusercontent.com/example/img.jpg',
    }
    const result = normalizeSearchResult(input)
    expect(result.title).toBe('Pasta')
    expect(result.ingredients).toContain('1 cup pasta')
    expect(result.ingredients).toContain('2 tbsp oil')
    expect(result.source).toBe('search')
    expect(result.image).toBe('https://raw.githubusercontent.com/example/img.jpg')
  })

  it('splits newline-separated Instructions into array', () => {
    const input = {
      Title: 'Soup',
      Cleaned_Ingredients: 'water',
      Instructions: 'Boil water\nAdd salt\nServe hot',
      Image_Name: '',
    }
    const result = normalizeSearchResult(input)
    expect(result.instructions).toEqual(['Boil water', 'Add salt', 'Serve hot'])
    expect(result.image).toBeNull()
  })

  it('falls back to numbered-step split when no newlines', () => {
    const input = {
      Title: 'Eggs',
      Cleaned_Ingredients: '',
      Instructions: '1. Crack eggs 2. Fry in pan 3. Serve',
      Image_Name: null,
    }
    const result = normalizeSearchResult(input)
    expect(result.instructions.length).toBeGreaterThan(1)
  })

  it('generates stable id from title and image', () => {
    const input = {
      Title: 'Cake',
      Cleaned_Ingredients: '',
      Instructions: '',
      Image_Name: 'img.jpg',
    }
    expect(normalizeSearchResult(input).id).toBe(normalizeSearchResult(input).id)
  })
})
