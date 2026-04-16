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
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
      await page.waitForNavigation({ waitUntil: 'networkidle' });
    }
    
    await page.waitForTimeout(2000);
    
    // Extract detailed design information
    const designData = await page.evaluate(() => {
      const data = {
        chartInfo: null,
        metricPills: [],
        tableHeaders: [],
        buttons: [],
        colors: new Set(),
        fonts: new Set(),
        cssVariables: {}
      };
      
      // Check for chart library
      const canvas = document.querySelector('canvas');
      const svgs = document.querySelectorAll('svg');
      
      if (canvas) {
        data.chartInfo = 'Canvas detected (Chart.js, ApexCharts, or similar)';
      }
      if (svgs.length > 0) {
        data.chartInfo = `SVG elements found (${svgs.length}) - likely Recharts or D3`;
      }
      
      // Extract metric pills
      const pills = document.querySelectorAll('[role="button"], button, [class*="pill"], [class*="metric"], [class*="tab"]');
      pills.forEach((pill, i) => {
        if (i < 20) {
          const style = window.getComputedStyle(pill);
          const text = pill.textContent.trim().slice(0, 30);
          data.metricPills.push({
            text,
            bg: style.backgroundColor,
            color: style.color,
            borderRadius: style.borderRadius,
            padding: style.padding,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            classes: pill.className.slice(0, 100)
          });
        }
      });
      
      // Extract table headers
      const headers = document.querySelectorAll('th, [role="columnheader"]');
      headers.forEach((h, i) => {
        if (i < 15) {
          const style = window.getComputedStyle(h);
          data.tableHeaders.push({
            text: h.textContent.trim().slice(0, 30),
            bg: style.backgroundColor,
            color: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            textTransform: style.textTransform,
            classes: h.className.slice(0, 100)
          });
        }
      });
      
      // Extract button styles
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn, i) => {
        if (i < 15) {
          const style = window.getComputedStyle(btn);
          data.buttons.push({
            text: btn.textContent.trim().slice(0, 30),
            bg: style.backgroundColor,
            color: style.color,
            borderRadius: style.borderRadius,
            padding: style.padding,
            fontSize: style.fontSize,
            classes: btn.className.slice(0, 100)
          });
        }
      });
      
      // Extract CSS variables
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      for (let i = 0; i < styles.length; i++) {
        const prop = styles[i];
        if (prop.startsWith('--')) {
          const val = styles.getPropertyValue(prop).trim();
          if (val) {
            data.cssVariables[prop] = val;
          }
        }
      }
      
      // Collect all colors
      document.querySelectorAll('*').forEach(el => {
        const bg = window.getComputedStyle(el).backgroundColor;
        const color = window.getComputedStyle(el).color;
        if (bg && bg !== 'rgba(0, 0, 0, 0)') data.colors.add(bg);
        if (color && color !== 'rgba(0, 0, 0, 0)') data.colors.add(color);
      });
      
      return {
        chartInfo: data.chartInfo,
        metricPills: data.metricPills,
        tableHeaders: data.tableHeaders,
        buttons: data.buttons,
        cssVariables: data.cssVariables,
        uniqueColors: Array.from(data.colors).slice(0, 30)
      };
    });
    
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'design-details.json'), JSON.stringify(designData, null, 2));
    console.log('Design details extracted');
    console.log('Chart:', designData.chartInfo);
    console.log('Metric pills:', designData.metricPills.length);
    console.log('Table headers:', designData.tableHeaders.length);
    console.log('Buttons:', designData.buttons.length);
    console.log('Colors found:', designData.uniqueColors.length);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
