import { chromium } from "playwright";
import { createLogger } from "../logs/logger.js";

const log = createLogger("service:scraper");

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  status: "success" | "error";
  error?: string;
}

/**
 * Simple scraper to extract text from a website.
 */
export async function scrapeWebsite(url: string): Promise<ScrapeResult> {
  log.info("Scraping website", { url });
  
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    });
    const page = await context.newPage();
    
    // Go to URL with timeout
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    
    const title = await page.title();
    
    // Extract main text content
    const content = await page.evaluate(() => {
      // Remove scripts, styles, and nav/footer if possible
      const elementsToRemove = document.querySelectorAll("script, style, nav, footer, header, iframe");
      elementsToRemove.forEach(el => el.remove());
      
      return document.body.innerText;
    });
    
    return {
      url,
      title,
      content: content.replace(/\s+/g, " ").trim().slice(0, 10000), // Cap at 10k chars
      status: "success"
    };
  } catch (error) {
    log.error("Failed to scrape website", { url, error: error instanceof Error ? error.message : String(error) });
    return {
      url,
      title: "",
      content: "",
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
