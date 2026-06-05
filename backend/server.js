const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Fuse = require('fuse.js');
const fs = require('fs');
const csvParser = require('csv-parser');
require("dotenv").config();
const { Parser } = require("json2csv");
const {Readable} = require("stream");

const { execSync } = require("child_process");
const { scrapeRecipe } = require("./scraper");
const { combineNutrition } = require("./nutrition/combine");
const { searchFood: fatsecretSearch, searchFoods: fatsecretSearchFoods } = require("./nutrition/fatsecretClient");
const { loadFoods, buildIndex, makeUsdaSearch, makeUsdaSearchMany } = require("./nutrition/usdaClient");
const { makeFoodResolver, makeFoodsResolver } = require("./nutrition/foodResolver");
const { importUsda } = require("./prisma/importUsda");
const { PrismaClient } = require("@prisma/client");
const { createAuthRouter } = require("./auth/authRoutes");
const { createSavedRecipeRouter } = require("./recipes/savedRecipeRoutes");
const { makeAuthMiddleware } = require("./auth/authMiddleware");
const { verifyToken } = require("./auth/tokens");

const app = express();

app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

// Default: FatSecret-only until USDA index loads (or if it fails).
let resolveFood = makeFoodResolver({ usdaSearch: async () => null, fatsecretSearch });
const fatsecretSearchMany = async (q) => { const r = await fatsecretSearch(q); return r ? [r] : []; };
let resolveFoods = makeFoodsResolver({ usdaSearchMany: async () => [], fatsecretSearchMany });

async function ensureSchema() {
  try {
    execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  } catch (err) {
    console.warn("Schema push failed (will try to continue):", err.message);
  }
}

async function initNutrition() {
  try {
    let foods = await loadFoods(prisma);

    // Auto-seed if the Food table is empty and USDA_DATA_DIR is provided.
    if (foods.length === 0 && process.env.USDA_DATA_DIR) {
      console.log("Food table empty — importing USDA data from", process.env.USDA_DATA_DIR);
      await importUsda(process.env.USDA_DATA_DIR, prisma);
      foods = await loadFoods(prisma);
    } else if (foods.length === 0) {
      console.warn("Food table is empty. Set USDA_DATA_DIR and restart to auto-import, or run: USDA_DATA_DIR=<path> npm run db:import");
    }

    if (foods.length > 0) {
      const index = buildIndex(foods);
      resolveFood = makeFoodResolver({ usdaSearch: makeUsdaSearch(index, foods), fatsecretSearch });
      resolveFoods = makeFoodsResolver({ usdaSearchMany: makeUsdaSearchMany(index, foods), fatsecretSearchMany });
      console.log(`USDA nutrition index loaded: ${foods.length} foods`);
    } else {
      console.warn("USDA index unavailable, using FatSecret-only");
    }
  } catch (err) {
    console.warn("USDA index unavailable, using FatSecret-only:", err.message);
  }
}


app.use("/auth", createAuthRouter(prisma));
app.use("/saved-recipes", createSavedRecipeRouter(prisma, makeAuthMiddleware(verifyToken)));

// Read Recipies from Excel File and store
let jsonData = [];


(async () => {
  await ensureSchema();
  jsonData = await loadCSVFromGitHub();
  await initNutrition();
  const port = process.env.PORT || 7000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
})();


/**
 * Loads the CSV of presaved recipes from my github repo into an array
 * @returns an array of recipies if found or an empty array if there was an error
 */
async function loadCSVFromGitHub() {
  const csvUrl = 'https://raw.githubusercontent.com/HaydenClark1/Recipe-Scraper/main/backend/FoodData.csv';

  try {
    const response = await axios.get(csvUrl);
    const stream = Readable.from(response.data);
    
    return new Promise((resolve, reject) => {
      const results = [];
      stream
        .pipe(csvParser())
        .on('data', (row) => results.push(row))
        .on('end', () => {
          console.log(`CSV loaded with ${results.length} rows`);
          resolve(results);
        })
        .on('error', reject);
    });
  } catch (err) {
    console.error("Failed to load CSV from GitHub:", err.message);
    return [];
  }
}



/**
 * Given a URL will scrape the recipe to try to find the ingredients, instructions, and any image of the recipe.
 * Assumes that the recipe data is located in the scripts of a webpage.
 * 
 */

app.post("/scrape-recipe", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const recipe = await scrapeRecipe(url);
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }
    return res.status(200).json(recipe);
  } catch (err) {
    console.error("Scraping failed:", err.message);
    return res.status(500).json({ error: "Failed to scrape recipe" });
  }
});

app.post("/search-recipies", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const {search} = req.body
  console.log(search)
  if( !search || search.trim() === "" ){
    return res.status(400).json({message: "Search term required"})
  }
  
  const fuse = new Fuse(jsonData, {
    keys:['Title'],
    threshold:0.2,
    includes:true,
  });


  const results = fuse.search(search)
  const topResults = results.slice(0, 100);

  // Map
  const recipes = topResults.map(result => result.item);

  res.status(200).json({ recipes });
})

app.post('/save-recipe', async (req,res) => {
  const {recipe} = req.body

  // Check if already in database
  if (recipe.image.startsWith("https://raw.githubusercontent.com")){
    console.log("Already in database")
    return res.status(400).json({message: "Recipe already in database"})
  }
 


  const newRow = {
    Title: recipe.title,
    Cleaned_Ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.join('\n')
      : recipe.ingredients,
      Instructions: Array.isArray(recipe.instructions)
      ? recipe.instructions.join('\n')
      : recipe.instructions,
    Image_Name: recipe.image
  }
  
  jsonData.push(newRow);

  // Convert updated data to CSV
  const fields = Object.keys(newRow); // or a static array of headers
  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(jsonData);

  // Write CSV back to file
  fs.writeFileSync("FoodData.csv", csv, { encoding: 'utf8' });
  

  return res.status(200).json({message: 'Recipe saved'})

})

app.get('/search-foods', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const source = (req.query.source || 'local').toString();
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  try {
    let foods;
    if (source === 'web') {
      try { foods = await fatsecretSearchFoods(q); } catch { foods = []; }
    } else {
      foods = await resolveFoods(q);
    }
    return res.status(200).json({ foods });
  } catch (err) {
    console.error('Food search failed:', err.message);
    return res.status(500).json({ error: 'Failed to search foods' });
  }
});

app.post('/get-nutrition', async (req, res) => {
  const { ingredients, servings, overrides } = req.body;
  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: "ingredients array is required" });
  }
  if (overrides !== undefined && !Array.isArray(overrides)) {
    return res.status(400).json({ error: "overrides must be an array" });
  }
  try {
    const result = await combineNutrition(ingredients, servings, { searchFood: resolveFood, overrides });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Nutrition combine failed:", err);
    return res.status(500).json({ error: "Failed to fetch nutrition info" });
  }
});
app.get("/", (req, res) => {
  res.send("Backend is up!");
});
