const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = 'C:/Users/ArielD/UA-automation/screenshots/redesign-ref';

// Ensure directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  
  try {
    // Step 1: Navigate to login
    console.log('Navigating to dashboard...');
    await page.goto('https://goatuaactivity.vercel.app/dashboard/v2', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Check if we're on login page
    const bodyText = await page.textContent('body');
    if (bodyText.includes('password') || bodyText.includes('Password')) {
      console.log('On login page, entering password...');
      await page.fill('input[type="password"]', 'GoAt123!');
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
      await page.waitForNavigation({ waitUntil: 'networkidle' });
    }
    
    // Wait for dashboard to load
    await page.waitForTimeout(2000);
    
    // Step 2: Capture full page at level 0 (Apps)
    console.log('Capturing level 0 (Apps)...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'v2-level0-apps.png'),
      fullPage: false
    });
    
    // Step 3: Save full HTML
    console.log('Saving HTML...');
    const html = await page.content();
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'page.html'), html);
    
    // Step 4: Extract computed styles
    console.log('Extracting styles...');
    const styles = await page.evaluate(() => {
      const result = {
        colors: {},
        fonts: {},
        elements: []
      };
      
      // Get top-level styles
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      
      let elem;
      let depth = 0;
      const maxDepth = 4;
      
      const traverse = (node, d) => {
        if (d > maxDepth) return;
        
        const style = window.getComputedStyle(node);
        const tag = node.tagName.toLowerCase();
        const classes = node.className;
        
        const bg = style.backgroundColor;
        const color = style.color;
        const fontSize = style.fontSize;
        const fontFamily = style.fontFamily;
        const borderRadius = style.borderRadius;
        const boxShadow = style.boxShadow;
        const display = style.display;
        
        // Collect unique colors
        if (bg && bg !== 'rgba(0, 0, 0, 0)') {
          const key = `bg_${tag}`;
          if (!result.colors[key]) result.colors[key] = bg;
        }
        if (color && color !== 'rgba(0, 0, 0, 0)') {
          const key = `text_${tag}`;
          if (!result.colors[key]) result.colors[key] = color;
        }
        
        // Collect unique fonts
        if (fontFamily && fontFamily !== 'serif') {
          result.fonts[fontFamily] = true;
        }
        
        // Add element info
        if (d <= 2) {
          result.elements.push({
            tag,
            classes: classes ? classes.split(' ').slice(0, 3) : [],
            depth: d,
            bg: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : null,
            color: color && color !== 'rgba(0, 0, 0, 0)' ? color : null,
            fontSize,
            fontFamily,
            borderRadius: borderRadius !== '0px' ? borderRadius : null,
            boxShadow: boxShadow !== 'none' ? boxShadow : null,
            display
          });
        }
        
        for (let child of node.children) {
          traverse(child, d + 1);
        }
      };
      
      traverse(document.body, 0);
      return result;
    });
    
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'styles.json'), JSON.stringify(styles, null, 2));
    
    // Step 5: Look for drill-down chevron and click it
    console.log('Looking for drill-down chevrons...');
    const chevrons = await page.locator('button:has-text(">"), [class*="chevron"], svg[class*="chevron"]').count();
    console.log(`Found ${chevrons} potential chevrons`);
    
    if (chevrons > 0) {
      // Click first chevron (Urban Heat)
      const firstChevron = await page.locator('button:has-text(">"), [class*="chevron"], svg[class*="chevron"]').first();
      if (await firstChevron.isVisible()) {
        console.log('Clicking first chevron (Urban Heat)...');
        await firstChevron.click();
        await page.waitForTimeout(500);
        
        // Screenshot level 1 (OS)
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'v2-level1-os.png'),
          fullPage: false
        });
        
        // Try clicking second level chevron (iOS)
        const secondChevron = await page.locator('button:has-text(">"), [class*="chevron"], svg[class*="chevron"]').nth(1);
        if (await secondChevron.isVisible()) {
          console.log('Clicking second chevron (iOS)...');
          await secondChevron.click();
          await page.waitForTimeout(500);
          
          // Screenshot level 2 (Media Source)
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, 'v2-level2-mediasource.png'),
            fullPage: false
          });
        }
      }
    }
    
    console.log('Capture complete!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
