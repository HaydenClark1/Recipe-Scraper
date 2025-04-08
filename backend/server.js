const cheerio = require("cheerio");
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const port = 7000;

app.use(cors());
app.use(express.json());

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

    for (let el of scripts) {
      try {
        const raw = $(el).html();
        const parsed = JSON.parse(raw);
        const found = findRecipeLike(parsed);

        if (found) {
          recipeData = found;
          ingredients = findIngredients(recipeData);
          instructions = findInstructions(parsed)
          if (instructions){
            instructionTexts = instructions.map(step => step.text);
            
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
      instructions: instructionTexts || "No instructions Found"
    });
  } catch (err) {
    console.error("💥 Scraping failed:", err.message);
    return res.status(500).json({ error: "Failed to scrape recipe" });
  }
});

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

function findInstructions (obj) {
  console.log(obj)
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

  return null;

}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
