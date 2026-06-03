const OAuth = require('oauth-1.0a')
const crypto = require('crypto')

const ENDPOINT = 'https://platform.fatsecret.com/rest/server.api'

function pickFood(data) {
  const food = data && data.foods && data.foods.food
  if (!food) return null
  if (Array.isArray(food)) return food.length ? food[0] : null
  return food
}

function pickFoods(data) {
  const food = data && data.foods && data.foods.food
  if (!food) return []
  return Array.isArray(food) ? food : [food]
}

function makeOAuth() {
  return OAuth({
    consumer: {
      key: process.env.FATSECRET_CONSUMER_KEY,
      secret: process.env.FATSECRET_CONSUMER_SECRET,
    },
    signature_method: 'HMAC-SHA1',
    hash_function: (base, key) =>
      crypto.createHmac('sha1', key).update(base).digest('base64'),
  })
}

// 2-legged OAuth 1.0 (no token). Sign the request, then send method params
// and oauth_* params together as the GET query string.
async function requestFoods(name) {
  const oauth = makeOAuth()
  const data = { method: 'foods.search', search_expression: name, format: 'json' }
  const oauthParams = oauth.authorize({ url: ENDPOINT, method: 'GET', data })
  const qs = new URLSearchParams({ ...data, ...oauthParams }).toString()

  const res = await fetch(`${ENDPOINT}?${qs}`, { method: 'GET' })
  if (!res.ok) throw new Error(`FatSecret HTTP ${res.status}`)
  const json = await res.json()
  if (json && json.error) throw new Error(`FatSecret error: ${json.error.message || 'unknown'}`)
  return json
}

async function searchFood(name) {
  return pickFood(await requestFoods(name))
}

async function searchFoods(name) {
  return pickFoods(await requestFoods(name)).map((f) => ({
    food_name: f.food_name,
    food_description: f.food_description,
  }))
}

module.exports = { searchFood, searchFoods, pickFood, pickFoods, ENDPOINT }
