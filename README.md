# Recipe Scraper
Tired of scrolling through endless stories, popups, and ads just to get to a recipe? So was I.

Recipe Scraper is a clean, minimalist web app that extracts the actual recipe and ingredients from cluttered cooking blogs and websites—no fluff, no distractions, just the ingredients and steps you need.

## Features
  - Automatically strips away long intros and ads
  - Shows only the core recipe: ingredients, instructions, and cook time, and a picture if found
  - Supports URLs from many major recipe sites
  - Has built in dataframe of over 13,000 recipies that can be searched for


## How It Works
Just paste a link to a recipe blog, and let our scraper do the magic. It parses the page, grabs the structured recipe data (when available), and presents it in a clean, readable format.

## Tech Stack
  - Node.js backend server
  - Cheerio for scraping
  - Natural Langauge Processing (Fuse.js)
  - React Native frontend
  - Docker deployment

## Important
Currently this is still in progress, if you wish to test this application out, you will need to change server variable in Search.js and Homescreen.js to match your public ipv4 address.
