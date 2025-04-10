const cheerio = require("cheerio");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const XLSX = require('xlsx');
const Fuse = require('fuse.js');
const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require("json2csv");


const app = express();
const port = 7000;

app.use(cors());
app.use(express.json());


// Read Recipies from Excel File and store
let jsonData = [];

fs.createReadStream("FoodData.csv", { encoding: 'utf8' })
  .pipe(csv())
  .on("data", (row) => {
    jsonData.push(row);
  })
  .on("end", () => {
    
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
    console.log("✅ CSV loaded into memory using csv-parser");
});





app.post("/scrape-recipe", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]').toArray();

    let recipeData = null;
    let ingredients = null;
    let instructions = null;
    let instructionTexts = null;
    let image = null;

    for (let el of scripts) {
      try {
        const raw = $(el).html();
        const parsed = JSON.parse(raw);
        const found = findRecipeLike(parsed);
        if (found) {
          recipeData = found;
          ingredients = findIngredients(recipeData);
          instructions = findInstructions(parsed,$)
        

          if (instructions){
            instructionTexts = instructions.map(step => step.text);
            instructionTexts = splitInstructions(instructionTexts)
          }

          if (Array.isArray(recipeData.image)) {
            const last = recipeData.image[0];
            image = typeof last === "string" ? last : last.url || null
          } else if (typeof recipeData.image === "object" && recipeData.image.url) {
            image = recipeData.image.url;
          }
          
          break;
        }
      } catch (e) {
        console.log("⚠️ Error parsing script:", e.message);
      }
    }

    if (!recipeData) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    return res.status(200).json({
      title: recipeData.name || "N/A",
      ingredients: ingredients || [],
      prepTime: recipeData.prepTime || "N/A",
      totalTime: recipeData.totalTime || "N/A",
      servings: recipeData.recipeYield || "N/A",
      category: recipeData.recipeCategory || [],
      cuisine: recipeData.recipeCuisine || [],
      instructions: instructionTexts || "No instructions Found",
      image: image || null
    });
  } catch (err) {
    console.error("💥 Scraping failed:", err.message);
    return res.status(500).json({ error: "Failed to scrape recipe" });
  }
});

function splitInstructions(instructions){
  const splitFallback = [];

  instructions.forEach(step => {
    const parts = step.split(/(?=\d+\.\s)/g);
    parts.forEach(p => {
      const trimmed = p.trim();
      if (trimmed.length > 0) {
        splitFallback.push(trimmed);
      }
    });
  });

  return splitFallback;
}

function findRecipeLike(obj) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findRecipeLike(item);
      if (result) return result;
    }
  } else if (typeof obj === "object" && obj !== null) {
    const type = obj["@type"];
    if (
      typeof type === "string" &&
      type.toLowerCase().includes("recipe")
    ) {
      return obj;
    }

    if (
      Array.isArray(type) &&
      type.some(t => typeof t === "string" && t.toLowerCase().includes("recipe"))
    ) {
      return obj;
    }

    for (const key in obj) {
      const result = findRecipeLike(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

function findIngredients(obj) {
  const possibleKeys = [
    "recipeingredient",
    "ingredients",
    "ingredientList",
    "items",
    "components"
  ];

  if (typeof obj !== "object" || obj === null) return null;

  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (possibleKeys.some(k => lowerKey.includes(k))) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    const nested = findIngredients(obj[key]);
    if (nested) return nested;
  }

  return null;
}

function findInstructions (obj,$ = null) {
  const possibleKeys = [
    "instructions",
    "recipeinstructions",
    "steps",
    "directions"
  
  ];

  if (typeof obj !== "object" || obj === null) return null;

  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (possibleKeys.some(k => lowerKey.includes(k))) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    const nested = findInstructions(obj[key]);
    if (nested) return nested;
  }

  // DOM fallback using Cheerio
  if ($) {
    const fallback = [];

    // Try common instruction selectors (from many recipe plugins)
    const selectors = [
      'li[class*="instruction"]',
      '[class*="instruction"] li',
      '[class*="direction"] li',
      'ol li',
      'ul li'
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const text = $(el).text().trim();
        if (text && !fallback.includes(text)) {
          fallback.push(text);
        }
      });

      if (fallback.length > 0) break; // stop once something is found
    }

    if (fallback.length) return fallback;
  }

  return null;

}


app.post("/search-recipies", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const {search} = req.body
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

app.post('/get-nutrition', async (req,res) => {
  const {ingredients} = req.body
  try {
    const results = await Promise.all(
      ingredients.map(async (ingredient) => {
        return await fatSecretApi(ingredient);
      })
    );

    res.status(200).json({ nutrition: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch nutrition info' });
  }
});

const fatSecretApi = async (ingredient) => {
  const secrets =  require('./api-keys.json');
  const accessToken = secrets.access_token;

  const response = await fetch("https://platform.fatsecret.com/rest/server.api",{
    method: "POST",
    headers: {
      'Authorization' : `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body : new URLSearchParams({
      method: 'foods.search',
      search_expression: ingredient,
      format: 'json',
    })
  })
  const data = await response.json()
  
  const foodLists = data?.foods.food;

  if(Array.isArray(foodLists) && foodLists.length > 0){
    const firstItem = foodLists[0];
    console.log(firstItem)
    return {
      name: firstItem.food_name,
      description: firstItem.food_description,
      brand: firstItem.brand_name || "Generic"
    }

  }
}
