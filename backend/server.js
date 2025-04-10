const cheerio = require("cheerio");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const XLSX = require('xlsx');
const Fuse = require('fuse.js');

const app = express();
const port = 7000;

app.use(cors());
app.use(express.json());


// Read Recipies from Excel File and store
const workbook = XLSX.readFile("FoodData.csv");
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet);




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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
