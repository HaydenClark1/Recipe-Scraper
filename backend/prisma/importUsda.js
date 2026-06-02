const fs = require('fs')
const path = require('path')
const csvParser = require('csv-parser')
const { PrismaClient } = require('@prisma/client')

// USDA FoodData Central nutrient IDs (values are per 100g)
const ENERGY_IDS = [1008, 2047, 2048] // kcal: Energy, then Atwater General/Specific
const PROTEIN_ID = 1003
const FAT_ID = 1004
const CARB_ID = 1005

function pickEnergy(nutrientMap) {
  for (const id of ENERGY_IDS) {
    if (nutrientMap[id] != null) return nutrientMap[id]
  }
  return null
}

function buildFoodRow(food, nutrientMap) {
  return {
    fdcId: Number(food.fdc_id),
    description: food.description,
    dataType: food.data_type,
    category: food.food_category_id ? String(food.food_category_id) : null,
    calories: pickEnergy(nutrientMap),
    protein: nutrientMap[PROTEIN_ID] ?? null,
    fat: nutrientMap[FAT_ID] ?? null,
    carbs: nutrientMap[CARB_ID] ?? null,
  }
}

const WANTED_TYPES = new Set(['sr_legacy_food', 'foundation_food'])
const WANTED_NUTRIENTS = new Set([...ENERGY_IDS, PROTEIN_ID, FAT_ID, CARB_ID].map(String))

function streamCsv(filePath, onRow) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', onRow)
      .on('end', resolve)
      .on('error', reject)
  })
}

async function importUsda(dataDir, prisma) {
  // Pass 1: collect wanted foods (SR Legacy + Foundation)
  const foods = new Map() // fdc_id (string) -> food row
  await streamCsv(path.join(dataDir, 'food.csv'), (row) => {
    if (WANTED_TYPES.has(row.data_type)) foods.set(row.fdc_id, row)
  })
  console.log(`Found ${foods.size} SR Legacy + Foundation foods`)

  // Pass 2: collect the 4 nutrients for those foods only
  const nutrients = new Map() // fdc_id (string) -> { [nutrientId]: amount }
  await streamCsv(path.join(dataDir, 'food_nutrient.csv'), (row) => {
    if (!foods.has(row.fdc_id)) return
    if (!WANTED_NUTRIENTS.has(row.nutrient_id)) return
    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) return
    const map = nutrients.get(row.fdc_id) || {}
    map[Number(row.nutrient_id)] = amount
    nutrients.set(row.fdc_id, map)
  })

  // Build rows
  const rows = []
  for (const [, food] of foods) {
    rows.push(buildFoodRow(food, nutrients.get(food.fdc_id) || {}))
  }

  // Wipe + batch insert
  await prisma.food.deleteMany()
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.food.createMany({ data: rows.slice(i, i + BATCH) })
  }
  console.log(`Imported ${rows.length} foods into MSSQL`)
  return rows.length
}

module.exports = { pickEnergy, buildFoodRow, importUsda, ENERGY_IDS, PROTEIN_ID, FAT_ID, CARB_ID }

// CLI entry: node prisma/importUsda.js <path-to-extracted-usda-csv-dir>
if (require.main === module) {
  const dataDir = process.argv[2] || process.env.USDA_DATA_DIR
  if (!dataDir) {
    console.error('Usage: node prisma/importUsda.js <path-to-extracted-usda-csv-dir>')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  importUsda(dataDir, prisma)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Import failed:', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}
