const axios = require('axios')
const puppeteer = require('puppeteer')

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
}

async function fetchHtmlWithPuppeteer(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setUserAgent(BROWSER_HEADERS['User-Agent'])
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    return await page.content()
  } finally {
    await browser.close()
  }
}

async function fetchHtml(url) {
  try {
    const { data } = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
    })
    return data
  } catch (err) {
    if (err.response?.status === 403) {
      return fetchHtmlWithPuppeteer(url)
    }
    throw err
  }
}

module.exports = { fetchHtml }
