const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = 'C:/Users/ArielD/UA-automation/screenshots/redesign-ref';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  
  try {
    await page.goto('https://goatuaactivity.vercel.app/dashboard/v2', { waitUntil: 'networkidle', timeout: 30000 });
    
    const bodyText = await page.textContent('body');
    if (bodyText.includes('password')) {
      await page.fill('input[type="password"]', 'GoAt123!');
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle' });
    }
    
    await page.waitForTimeout(2000);
    
    // Detailed visual analysis
    const analysis = await page.evaluate(() => {
      const result = {
        sidebarStyle: {},
        headerStyle: {},
        metricPills: [],
        filterButtons: [],
        chartProperties: {},
        tableProperties: {},
        colorScheme: {},
        typography: {}
      };
      
      // Analyze sidebar
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        const style = window.getComputedStyle(sidebar);
        result.sidebarStyle = {
          width: sidebar.clientWidth,
          bg: style.backgroundColor,
          border: style.borderRight,
          color: style.color
        };
      }
      
      // Get all distinct text colors and backgrounds
      const allElements = document.querySelectorAll('*');
      const colorSet = new Set();
      const bgSet = new Set();
      const fontSet = new Set();
      
      allElements.forEach(el => {
        if (el.offsetHeight > 0 && el.offsetWidth > 0) {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          const color = style.color;
          const font = style.fontFamily;
          
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') bgSet.add(bg);
          if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') colorSet.add(color);
          if (font && font !== 'serif') fontSet.add(font.slice(0, 50));
        }
      });
      
      result.colorScheme.uniqueBackgrounds = Array.from(bgSet).slice(0, 10);
      result.colorScheme.uniqueTextColors = Array.from(colorSet).slice(0, 10);
      result.typography.fontFamilies = Array.from(fontSet).slice(0, 5);
      
      // Find metric cards
      const metricCards = document.querySelectorAll('[class*="metric"], [class*="stat"], [class*="card"]');
      metricCards.forEach((card, i) => {
        if (i < 10) {
          const style = window.getComputedStyle(card);
          const text = card.textContent.trim().slice(0, 40);
          if (text.length > 5) {
            result.metricPills.push({
              text,
              bg: style.backgroundColor,
              borderRadius: style.borderRadius,
              padding: style.padding
            });
          }
        }
      });
      
      // Find filter buttons
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn, i) => {
        if (i < 15) {
          const style = window.getComputedStyle(btn);
          const text = btn.textContent.trim();
          if (text && text.length > 1 && text.length < 50) {
            result.filterButtons.push({
              text,
              bg: style.backgroundColor,
              color: style.color,
              padding: style.padding
            });
          }
        }
      });
      
      // Analyze table
      const table = document.querySelector('table');
      if (table) {
        const rows = table.querySelectorAll('tr');
        result.tableProperties = {
          headerCount: table.querySelectorAll('th').length,
          rowCount: rows.length,
          firstRowText: rows.length > 1 ? rows[1].textContent.trim().slice(0, 50) : 'N/A'
        };
      }
      
      return result;
    });
    
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'detailed-analysis.json'), JSON.stringify(analysis, null, 2));
    console.log('Analysis saved to detailed-analysis.json');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
