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
    
    // Extract comprehensive DOM structure
    const domData = await page.evaluate(() => {
      const result = {
        metricPillar: {
          description: 'Top metric pill bar',
          structure: [],
          colors: {}
        },
        timeToggle: {
          description: 'Day/Wk/Mo toggle',
          structure: [],
          activeStyle: {}
        },
        chartArea: {
          description: 'Chart visualization',
          svgCount: 0,
          canvasCount: 0,
          libraries: []
        },
        tableArea: {
          description: 'Data table',
          headers: [],
          rows: [],
          drillStyle: {}
        }
      };
      
      // Find metric pills
      const metricContainer = document.querySelector('[class*="metric"], [class*="pill"], [class*="stat"]');
      if (metricContainer) {
        const pills = metricContainer.querySelectorAll('button, [role="button"], [class*="pill"]');
        pills.forEach(pill => {
          const style = window.getComputedStyle(pill);
          result.metricPillar.structure.push({
            tag: pill.tagName,
            text: pill.textContent.trim().slice(0, 30),
            class: pill.className.slice(0, 150),
            bg: style.backgroundColor,
            color: style.color,
            borderRadius: style.borderRadius,
            padding: style.padding,
            fontSize: style.fontSize
          });
        });
      }
      
      // Find time toggle
      const timeToggle = document.querySelector('[role="tablist"], [class*="toggle"], [class*="granular"]');
      if (timeToggle) {
        const buttons = timeToggle.querySelectorAll('button, [role="tab"]');
        buttons.forEach(btn => {
          const style = window.getComputedStyle(btn);
          const isActive = btn.getAttribute('aria-selected') === 'true' || btn.classList.contains('active');
          result.timeToggle.structure.push({
            text: btn.textContent.trim(),
            active: isActive,
            class: btn.className.slice(0, 150),
            bg: style.backgroundColor,
            color: style.color,
            borderRadius: style.borderRadius,
            padding: style.padding
          });
        });
      }
      
      // Chart analysis
      result.chartArea.svgCount = document.querySelectorAll('svg').length;
      result.chartArea.canvasCount = document.querySelectorAll('canvas').length;
      
      // Check for chart library signatures
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const src = script.src || '';
        if (src.includes('recharts')) result.chartArea.libraries.push('Recharts');
        if (src.includes('chart.js')) result.chartArea.libraries.push('Chart.js');
        if (src.includes('apexcharts')) result.chartArea.libraries.push('ApexCharts');
      });
      
      // Table structure
      const table = document.querySelector('table, [role="grid"], [role="table"]');
      if (table) {
        const headers = table.querySelectorAll('th, [role="columnheader"]');
        headers.forEach(h => {
          const style = window.getComputedStyle(h);
          result.tableArea.headers.push({
            text: h.textContent.trim(),
            class: h.className.slice(0, 150),
            bg: style.backgroundColor,
            color: style.color,
            textTransform: style.textTransform,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight
          });
        });
        
        const rows = table.querySelectorAll('tr, [role="row"]');
        rows.forEach((row, i) => {
          if (i < 3) {
            const style = window.getComputedStyle(row);
            const cells = row.querySelectorAll('td, [role="cell"]');
            result.tableArea.rows.push({
              cells: cells.length,
              text: row.textContent.trim().slice(0, 100),
              hasBorder: style.borderBottom !== 'none'
            });
          }
        });
      }
      
      // Check for drill-down chevrons
      const chevrons = document.querySelectorAll('[class*="chevron"], [class*="expand"], svg[class*="arrow"]');
      if (chevrons.length > 0) {
        const chevron = chevrons[0];
        const style = window.getComputedStyle(chevron);
        result.tableArea.drillStyle = {
          tag: chevron.tagName,
          class: chevron.className.slice(0, 150),
          size: `${chevron.clientWidth}x${chevron.clientHeight}`,
          color: style.color
        };
      }
      
      return result;
    });
    
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'dom-structure.json'), JSON.stringify(domData, null, 2));
    console.log('DOM structure extracted');
    console.log(JSON.stringify(domData, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
