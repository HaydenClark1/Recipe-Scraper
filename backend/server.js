const cheerio = require("cheerio");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Fuse = require('fuse.js');
const fs = require('fs');
const csvParser = require('csv-parser');
require("dotenv").config();
const jwt = require("jsonwebtoken");

const { Parser } = require("json2csv");
const {Readable} = require("stream");

const { scrapeRecipe } = require("./scraper");

const app = express();

app.use(cors());
app.use(express.json());


// Read Recipies from Excel File and store
let jsonData = [];


(async () => {
  jsonData = await loadCSVFromGitHub();
  console.log(jsonData);
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

/**
 * Used to try and find the ingredients to be used to highlight in instructions page.
 */
app.post("/parse-ingredients-api", async (req,res) => {
    const apiKey = process.env.spoon;

    if(!apiKey){
      return res.status(500).json({ error: "API key missing from environment" });
    }

    console.log("API KEY: " , apiKey);

    const { ingredients } = req.body;

    try {
      const response = await fetch(
        `https://api.spoonacular.com/recipes/parseIngredients?apiKey=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            ingredientList: Array.isArray(ingredients) ? ingredients.join('\n') : ingredients,
            servings: 1,
          }),
        }
      );
  
      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      console.error("Spoonacular request failed:", err.message);
      res.status(500).json({ error: "Failed to fetch data from Spoonacular" });
    }

})

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
app.get("/", (req, res) => {
  res.send("Backend is up!");
});
