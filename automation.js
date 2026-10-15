/**
 * Workday Job Application Automation Script
 * ============================================================================
 * Privacy-focused, local browser automation tool designed for "myworkdayjobs.com".
 * Uses Playwright with stealth evasions and persistent session context.
 *
 * SAFETY GUARANTEE: Handover protocol triggers on the final Review page.
 * The script will NEVER click the final "Submit" button automatically.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Register stealth plugin with Playwright
chromium.use(stealth);

// Setup interactive terminal prompt helper
function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

// Utility: Sleep helper with small random jitter for human-like timing
const sleep = (ms, jitter = 0) => {
  const randomDelay = ms + (jitter > 0 ? Math.floor(Math.random() * jitter) : 0);
  return new Promise((resolve) => setTimeout(resolve, randomDelay));
};

// Console log stylers
const log = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  step: (step, title) =>
    console.log(`\n\x1b[35m=== STEP ${step}: ${title.toUpperCase()} ===\x1b[0m`),
  handover: () => {
    console.log(`\n\x1b[42m\x1b[30m======================================================================\x1b[0m`);
    console.log(`\x1b[32m🛡️  SAFETY HANDOVER PROTOCOL REACHED\x1b[0m`);
    console.log(`\x1b[1mApplication form has been filled. You are on the Review/Submit page.\x1b[0m`);
    console.log(`\x1b[33mAs designed, this script will NEVER click 'Submit' automatically.\x1b[0m`);
    console.log(`\x1b[36m👉 Please inspect all answers in the open browser.\x1b[0m`);
    console.log(`\x1b[36m👉 When you are completely satisfied, click 'Submit' yourself.\x1b[0m`);
    console.log(`\x1b[42m\x1b[30m======================================================================\x1b[0m\n`);
  },
};

class WorkdayAutomator {
  constructor(configPath) {
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    this.config = JSON.parse(rawConfig);
    this.context = null;
    this.page = null;
  }

  /**
   * 1. Initialize persistent browser context with anti-bot evasion
   */
  async initBrowser() {
    const settings = this.config.settings || {};
    const userDataDir = path.resolve(settings.userDataDir || './browser-profile');

    log.info(`Initializing persistent browser context at: ${userDataDir}`);

    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: settings.headless || false,
      slowMo: settings.slowMo || 80,
      viewport: null, // Natural full-screen view
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    this.page.setDefaultTimeout(settings.actionTimeout || 15000);
    this.page.setDefaultNavigationTimeout(settings.navigationTimeout || 60000);

    log.success('Persistent browser session launched successfully.');
  }

  /**
   * Safe text typing helper with fallback selectors
   */
  async fillField(selectors, value, fieldName = 'Field') {
    if (!value && value !== false && value !== 0) return false;
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorList) {
      try {
        const el = this.page.locator(selector).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.scrollIntoViewIfNeeded();
          await el.click();
          await el.fill('');
          await el.pressSequentially(String(value), { delay: 40 });
          log.info(`Filled [${fieldName}]: "${value}"`);
          return true;
        }
      } catch (err) {
        // Try next selector
      }
    }
    log.warn(`Could not locate field [${fieldName}]. Will skip or allow manual edit.`);
    return false;
  }

  /**
   * Intelligent dropdown selector for Workday's custom React combobox/listbox
   */
  async selectWorkdayDropdown(triggerSelectors, targetValue, fieldName = 'Dropdown') {
    if (!targetValue) return false;
    const triggers = Array.isArray(triggerSelectors) ? triggerSelectors : [triggerSelectors];

    for (const triggerSelector of triggers) {
      try {
        const trigger = this.page.locator(triggerSelector).first();
        if (!(await trigger.isVisible({ timeout: 2000 }))) continue;

        await trigger.scrollIntoViewIfNeeded();
        log.info(`Opening dropdown for [${fieldName}]...`);
        await trigger.click();
        await sleep(400);

        // Check if there's an active search input inside the opened popover
        const searchInput = this.page
          .locator('[role="listbox"] input, [data-automation-id="searchBox"], input[type="search"]')
          .first();

        if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await searchInput.fill(targetValue);
          await sleep(500);
        }

        // Look for matching option in the popup listbox
        const optionSelectors = [
          `[role="option"]:has-text("${targetValue}")`,
          `[data-automation-id="menuItem"]:has-text("${targetValue}")`,
          `li:has-text("${targetValue}")`,
          `div[role="option"] >> text="${targetValue}"`,
        ];

        let selected = false;
        for (const optSel of optionSelectors) {
          const option = this.page.locator(optSel).first();
          if (await option.isVisible({ timeout: 1500 }).catch(() => false)) {
            await option.click();
            log.success(`Selected option for [${fieldName}]: "${targetValue}"`);
            selected = true;
            await sleep(300);
            break;
          }
        }

        if (selected) return true;

        // Fallback: If no direct match, try pressing Enter if combobox
        await this.page.keyboard.press('Enter').catch(() => {});
      } catch (err) {
        // Try next selector
      }
    }

    log.warn(`Could not set dropdown [${fieldName}] to "${targetValue}".`);
    return false;
  }

  /**
   * Helper to click checkboxes/radios safely
   */
  async clickOption(selector, label = 'Option') {
    try {
      const el = this.page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        log.info(`Clicked ${label}`);
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  }

  /**
   * Check for validation errors on current page and pause for user fix
   */
  async checkAndHandleValidationErrors() {
    const errorBanner = this.page.locator(
      '[data-automation-id="error-banner"], [aria-invalid="true"], .WFOF, .WEOF'
    );
    const count = await errorBanner.count();
    if (count > 0) {
      log.warn(`Detected ${count} validation/required field indicator(s) on current page!`);
      console.log(
        '\x1b[33m[ACTION REQUIRED] Please review the highlighted red field(s) in your browser window.\x1b[0m'
      );
      await promptUser('Press [ENTER] in this terminal once you have adjusted the field(s)...');
    }
  }

  /**
   * Advance to the next wizard page
   */
  async clickNextButton() {
    await this.checkAndHandleValidationErrors();

    const nextSelectors = [
      'button[data-automation-id="bottom-navigation-next-button"]',
      'button[data-automation-id="page-navigation-next-button"]',
      'button:has-text("Save and Continue")',
      'button:has-text("Next")',
    ];

    for (const sel of nextSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        log.info('Advancing to next page...');
        await btn.click();
        await sleep(1500, 500);
        await this.page.waitForLoadState('networkidle').catch(() => {});
        return true;
      }
    }

    log.warn('Could not find standard Next/Continue button.');
    return false;
  }

  /**
   * Check if current view is the Review or Final page
   */
  async isReviewPage() {
    const reviewIndicators = [
      'h2:has-text("Review")',
      'h1:has-text("Review")',
      '[data-automation-id="reviewPage"]',
      'button[data-automation-id="bottom-navigation-submit-button"]',
      'button[data-automation-id="page-navigation-submit-button"]',
      'button:has-text("Submit")',
    ];

    for (const sel of reviewIndicators) {
      const el = this.page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 2. Resume Upload Handler
   */
  async handleResumeUpload() {
    log.step(2, 'Resume Upload');
    const resumePath = path.resolve(this.config.settings.resumePath || './my_resume.pdf');

    if (!fs.existsSync(resumePath)) {
      log.warn(`Resume file not found at: ${resumePath}`);
      log.warn('Skipping automatic resume upload. Please attach your resume manually in the browser.');
      return false;
    }

    log.info(`Found local resume at: ${resumePath}`);

    const fileInputSelectors = [
      'input[type="file"]',
      '[data-automation-id="file-upload-input-drop-zone"] input',
      '[data-automation-id="file-upload-drop-zone"] input',
    ];

    let uploaded = false;
    for (const sel of fileInputSelectors) {
      try {
        const fileInput = this.page.locator(sel).first();
        if (await fileInput.count() > 0) {
          log.info('Attaching PDF resume to upload element...');
          await fileInput.setInputFiles(resumePath);
          uploaded = true;
          log.success('Resume file attached.');
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }

    if (!uploaded) {
      log.warn('Could not find standard file input element for resume. You can drag and drop it manually.');
    } else {
      // Wait for Workday upload progress bar to finish
      log.info('Waiting for upload processing to finalize...');
      await sleep(3000, 1000);
    }

    return uploaded;
  }

  /**
   * 3. Fill Contact Information Section
   */
  async fillContactInformation() {
    log.step(3, 'Contact Information');
    const info = this.config.personalInfo || {};

    // First Name & Last Name
    await this.fillField(
      [
        'input[data-automation-id="legalNameSection_firstName"]',
        'input[name*="firstName"]',
        'input[id*="firstName"]',
      ],
      info.firstName,
      'First Name'
    );

    await this.fillField(
      [
        'input[data-automation-id="legalNameSection_lastName"]',
        'input[name*="lastName"]',
        'input[id*="lastName"]',
      ],
      info.lastName,
      'Last Name'
    );

    // Address
    await this.fillField(
      [
        'input[data-automation-id="addressSection_addressLine1"]',
        'input[name*="addressLine1"]',
      ],
      info.addressLine1,
      'Address Line 1'
    );

    await this.fillField(
      [
        'input[data-automation-id="addressSection_city"]',
        'input[name*="city"]',
      ],
      info.city,
      'City'
    );

    await this.fillField(
      [
        'input[data-automation-id="addressSection_postalCode"]',
        'input[name*="postalCode"]',
      ],
      info.postalCode,
      'Postal Code'
    );

    // Country & State dropdowns
    if (info.country) {
      await this.selectWorkdayDropdown(
        [
          'button[data-automation-id="addressSection_country"]',
          'div[data-automation-id="addressSection_country"] button',
          'button[aria-haspopup="listbox"]:has-text("Country")',
        ],
        info.country,
        'Country'
      );
    }

    if (info.state) {
      await this.selectWorkdayDropdown(
        [
          'button[data-automation-id="addressSection_countryRegion"]',
          'div[data-automation-id="addressSection_countryRegion"] button',
          'button[aria-haspopup="listbox"]:has-text("State")',
        ],
        info.state,
        'State/Region'
      );
    }

    // Email & Phone
    await this.fillField(
      ['input[data-automation-id="email"]', 'input[type="email"]'],
      info.email,
      'Email'
    );

    await this.fillField(
      [
        'input[data-automation-id="phone-number"]',
        'input[data-automation-id="phoneNumber"]',
        'input[type="tel"]',
      ],
      info.phone,
      'Phone Number'
    );

    if (info.phoneDeviceType) {
      await this.selectWorkdayDropdown(
        [
          'button[data-automation-id="phone-device-type"]',
          'button[data-automation-id="phoneDeviceType"]',
        ],
        info.phoneDeviceType,
        'Phone Device Type'
      );
    }
  }

  /**
   * 4. Fill Work History & Repeaters
   */
  async fillWorkExperience() {
    log.step(4, 'Work Experience & History');
    const jobs = this.config.workHistory || [];
    if (jobs.length === 0) return;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      log.info(`Configuring Work Experience entry ${i + 1}/${jobs.length}: ${job.title} @ ${job.company}`);

      // If entry > 0 or if "Add" button exists, trigger the repeater
      const addBtn = this.page
        .locator(
          'button[data-automation-id="addWorkExperience"], button:has-text("Add Work Experience"), button:has-text("Add Another")'
        )
        .first();

      if (await addBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await addBtn.click();
        await sleep(1000);
      }

      // Target the current block (last added section container or indexed fields)
      const experienceSections = this.page.locator('[data-automation-id="workExperienceSection"], fieldset');
      const container = (await experienceSections.count()) > i
        ? experienceSections.nth(i)
        : this.page;

      // Job Title
      const titleInput = container.locator(
        'input[data-automation-id="jobTitle"], input[id*="jobTitle"]'
      ).first();
      if (await titleInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        await titleInput.fill(job.title);
      }

      // Company
      const companyInput = container.locator(
        'input[data-automation-id="company"], input[id*="company"]'
      ).first();
      if (await companyInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        await companyInput.fill(job.company);
      }

      // Location
      const locationInput = container.locator(
        'input[data-automation-id="location"], input[id*="location"]'
      ).first();
      if (await locationInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        await locationInput.fill(job.location || '');
      }

      // Currently Work Here
      if (job.currentlyWorkHere) {
        const currentCheckbox = container.locator(
          'input[data-automation-id="currentlyWorkHere"], input[type="checkbox"][id*="currentlyWorkHere"]'
        ).first();
        if (await currentCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
          if (!(await currentCheckbox.isChecked())) {
            await currentCheckbox.check();
          }
        }
      }

      // Start Date (Month / Year)
      if (job.startDate) {
        const startMonth = container.locator('input[data-automation-id="startDate-month"], input[id*="startDate-month"]').first();
        if (await startMonth.isVisible({ timeout: 1000 }).catch(() => false)) {
          await startMonth.fill(job.startDate.month || '');
        }
        const startYear = container.locator('input[data-automation-id="startDate-year"], input[id*="startDate-year"]').first();
        if (await startYear.isVisible({ timeout: 1000 }).catch(() => false)) {
          await startYear.fill(job.startDate.year || '');
        }
      }

      // End Date (if not currently working here)
      if (!job.currentlyWorkHere && job.endDate) {
        const endMonth = container.locator('input[data-automation-id="endDate-month"], input[id*="endDate-month"]').first();
        if (await endMonth.isVisible({ timeout: 1000 }).catch(() => false)) {
          await endMonth.fill(job.endDate.month || '');
        }
        const endYear = container.locator('input[data-automation-id="endDate-year"], input[id*="endDate-year"]').first();
        if (await endYear.isVisible({ timeout: 1000 }).catch(() => false)) {
          await endYear.fill(job.endDate.year || '');
        }
      }

      // Role Description
      const descArea = container.locator(
        'textarea[data-automation-id="description"], textarea[id*="description"]'
      ).first();
      if (await descArea.isVisible({ timeout: 1500 }).catch(() => false)) {
        await descArea.fill(job.description || '');
      }

      await sleep(500);
    }
  }

  /**
   * 5. Fill Education Section
   */
  async fillEducation() {
    log.step(5, 'Education History');
    const schools = this.config.education || [];
    if (schools.length === 0) return;

    for (let i = 0; i < schools.length; i++) {
      const edu = schools[i];
      log.info(`Filling Education entry: ${edu.degree} @ ${edu.school}`);

      const addBtn = this.page
        .locator('button[data-automation-id="addEducation"], button:has-text("Add Education")')
        .first();

      if (await addBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await addBtn.click();
        await sleep(800);
      }

      const eduSections = this.page.locator('[data-automation-id="educationSection"], fieldset');
      const container = (await eduSections.count()) > i ? eduSections.nth(i) : this.page;

      // School
      const schoolInput = container.locator('input[data-automation-id="school"], input[id*="school"]').first();
      if (await schoolInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        await schoolInput.fill(edu.school);
      }

      // Degree Dropdown or Input
      if (edu.degree) {
        const degreeDropdown = container.locator('button[data-automation-id="degree"]').first();
        if (await degreeDropdown.isVisible({ timeout: 1000 }).catch(() => false)) {
          await this.selectWorkdayDropdown(degreeDropdown, edu.degree, 'Degree');
        } else {
          const degreeInput = container.locator('input[data-automation-id="degree"]').first();
          if (await degreeInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await degreeInput.fill(edu.degree);
          }
        }
      }

      // Field of Study
      const fieldInput = container.locator('input[data-automation-id="field-of-study"], input[id*="field-of-study"]').first();
      if (await fieldInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fieldInput.fill(edu.fieldOfStudy || '');
      }

      // GPA
      const gpaInput = container.locator('input[data-automation-id="gpa"], input[id*="gpa"]').first();
      if (await gpaInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await gpaInput.fill(edu.gpa || '');
      }

      await sleep(400);
    }
  }

  /**
   * 6. Fill Skills Tags
   */
  async fillSkills() {
    const skills = this.config.skills || [];
    if (skills.length === 0) return;

    const skillInput = this.page
      .locator('[data-automation-id="skillsSection"] input, input[data-automation-id="skills-search-input"]')
      .first();

    if (await skillInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      log.info(`Adding ${skills.length} skills to profile...`);
      for (const skill of skills) {
        try {
          await skillInput.fill(skill);
          await sleep(400);
          await this.page.keyboard.press('Enter');
          await sleep(200);
        } catch (e) {
          // ignore individual skill insert failure
        }
      }
    }
  }

  /**
   * 7. Handle Questionnaire & Voluntary Disclosures (Smart Matching)
   */
  async handleQuestionnaireAndDisclosures() {
    const questions = {
      ...(this.config.commonQuestions || {}),
      ...(this.config.voluntaryDisclosures || {}),
    };

    // Answer common radio/combobox questions based on keywords
    for (const [key, answer] of Object.entries(questions)) {
      if (!answer) continue;

      try {
        // Try to match dropdowns with question labels
        const dropdownMatches = this.page.locator(
          `div:has-text("${key}") >> button[aria-haspopup="listbox"]`
        );
        if (await dropdownMatches.count() > 0) {
          await this.selectWorkdayDropdown(dropdownMatches.first(), answer, key);
        }

        // Try to match radio button group options (e.g. Yes / No)
        const radioOption = this.page
          .locator(`label:has-text("${answer}") input[type="radio"], input[type="radio"][value="${answer}"]`)
          .first();

        if (await radioOption.isVisible({ timeout: 800 }).catch(() => false)) {
          await radioOption.check().catch(() => {});
          log.info(`Selected questionnaire radio [${key}]: ${answer}`);
        }
      } catch (e) {
        // Continue silently
      }
    }
  }

  /**
   * Main orchestrator to drive through the multi-step application
   */
  async applyToJob(jobUrl) {
    await this.initBrowser();

    log.step(1, 'Navigating to Job Posting');
    log.info(`Opening URL: ${jobUrl}`);
    await this.page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Click initial "Apply" or "Autofill with Resume" button if present
    const applyButtons = [
      'a[data-automation-id="adventureButton"]',
      'a[data-automation-id="applyButton"]',
      'button:has-text("Apply")',
      'a:has-text("Apply")',
      'button:has-text("Autofill with Resume")',
      'a:has-text("Autofill with Resume")',
    ];

    for (const sel of applyButtons) {
      const btn = this.page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        log.info(`Clicking initial apply trigger: "${sel}"`);
        await btn.click();
        await sleep(2000);
        break;
      }
    }

    // Check if user is redirected to Sign In / Create Account modal
    const loginIndicator = this.page.locator(
      'input[data-automation-id="email"], input[type="password"]'
    ).first();

    if (await loginIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
      log.warn('Workday login/registration page detected.');
      console.log(
        '\x1b[33m[ACTION REQUIRED] Please log in or create an account in the opened browser window.\x1b[0m'
      );
      await promptUser('Once logged in and the application form appears, press [ENTER] here...');
    }

    // Process through form pages sequentially
    let pageCount = 0;
    const MAX_PAGES = 10;

    while (pageCount < MAX_PAGES) {
      pageCount++;
      await sleep(1500);

      // Check if we reached the final Review / Submit page
      if (await this.isReviewPage()) {
        log.handover();
        await promptUser('Press [ENTER] to exit the script after you have submitted the application.');
        break;
      }

      log.info(`Processing application page step #${pageCount}...`);

      // 1. Resume upload if present on current step
      await this.handleResumeUpload();

      // 2. Contact Information fields
      await this.fillContactInformation();

      // 3. Work Experience repeaters
      await this.fillWorkExperience();

      // 4. Education repeaters
      await this.fillEducation();

      // 5. Skills
      await this.fillSkills();

      // 6. Questionnaire & Disclosures
      await this.handleQuestionnaireAndDisclosures();

      // Check for Review page again before advancing
      if (await this.isReviewPage()) {
        log.handover();
        await promptUser('Press [ENTER] to exit the script after you have submitted the application.');
        break;
      }

      // Advance to next page
      const advanced = await this.clickNextButton();
      if (!advanced) {
        // If no Next button found, we may be on Review page or stuck
        if (await this.isReviewPage()) {
          log.handover();
          await promptUser('Press [ENTER] to exit the script after you have submitted the application.');
          break;
        } else {
          log.warn('No Next button detected. Handing over control for inspection.');
          await promptUser('Navigate manually or fix errors, then press [ENTER] to continue automation...');
        }
      }
    }

    log.success('Automation session finished.');
  }
}

// CLI Execution Entry Point
(async () => {
  const args = process.argv.slice(2);
  const targetUrl = args[0];

  console.log(`
\x1b[36m╔══════════════════════════════════════════════════════════════════╗
║              WORKDAY JOB APPLICATION AUTOMATION                  ║
║           Local & Privacy-Focused • Playwright Stealth           ║
╚══════════════════════════════════════════════════════════════════╝\x1b[0m
  `);

  if (!targetUrl) {
    log.error('Missing target Job URL argument!');
    console.log('\nUsage:');
    console.log('  node automation.js <Workday_Job_URL>\n');
    console.log('Example:');
    console.log('  node automation.js "https://company.wd1.myworkdayjobs.com/en-US/careers/job/123"\n');
    process.exit(1);
  }

  const configPath = path.resolve(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    log.error(`Config file not found at: ${configPath}`);
    process.exit(1);
  }

  const automator = new WorkdayAutomator(configPath);

  try {
    await automator.applyToJob(targetUrl);
  } catch (error) {
    log.error(`Automation error encountered: ${error.message}`);
    console.error(error);
    await promptUser('\n[PAUSED DUE TO ERROR] Inspect browser and press [ENTER] to close...');
  }
})();
