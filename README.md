# Workday Auto Apply 🚀

A local, privacy-focused browser automation tool designed to reliably fill out job applications on the **Workday** platform (`myworkdayjobs.com`). 

Built with **Node.js**, **Playwright**, and **Playwright Stealth** to bypass anti-bot detections while maintaining 100% user privacy and safety.

---

## 🛡️ Safety & Privacy Guarantee

- **100% Local & Private:** Runs entirely on your local machine. No external servers, no cloud telemetry, no credential leakage.
- **Safety Handover Protocol:** The script will automatically navigate and fill Contact Information, Experience, Education, Skills, and Questionnaires. However, **it will NEVER click the final "Submit" button**. It will pause execution on the final **Review** page, allowing you to thoroughly inspect all details and manually submit when ready.
- **Session Persistence:** Uses a dedicated Chromium profile directory (`./browser-profile`). Once you log into a company's Workday portal, your session is remembered for future applications with that company.

---

## 📁 Project Structure

```
workday_auto_apply/
├── package.json         # Project dependencies (playwright, stealth plugin)
├── config.json          # Your structured resume & profile information
├── automation.js        # Main automated workflow engine
├── my_resume.pdf        # (Your PDF resume to be uploaded)
└── README.md            # Setup and execution guide
```

---

## ⚡ Quick Start Guide

### 1. Install Dependencies

Open your terminal in this directory and install the required packages:

```bash
npm install
```

If you don't already have Chromium installed for Playwright, run:

```bash
npx playwright install chromium
```

### 2. Configure Your Profile & Resume

1. **Place your PDF resume:** Copy your resume into the project root named `my_resume.pdf` (or customize the path in `config.json` under `settings.resumePath`).
2. **Update `config.json`:** Open `config.json` and fill in:
   - `personalInfo`: Name, email, phone number, address.
   - `workHistory`: Array of your past positions with titles, dates, and bullet points.
   - `education`: University, degree, dates, and GPA.
   - `skills`: List of skill keywords to input.
   - `voluntaryDisclosures`: Default responses for diversity, veteran, and disability questionnaires.
   - `commonQuestions`: Standard answers for work authorization, sponsorship, notice period, etc.

### 3. Run the Automation

Run the script by providing the direct URL to the Workday job posting:

```bash
node automation.js "<WORKDAY_JOB_POSTING_URL>"
```

#### Example:
```bash
node automation.js "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Senior-Software-Engineer_JR19827"
```

---

## 🔄 How the Workflow Operates

1. **Launches Headful Browser:** Opens a visible Chrome window using your persistent profile (`./browser-profile`).
2. **Navigates & Clicks Apply:** Opens the job page and clicks "Apply" / "Autofill with Resume".
3. **Login Handshake:** If the Workday tenant asks you to sign in or create an account, the script will pause in the terminal and prompt you to log in. Once logged in, press `[ENTER]` in the terminal to continue.
4. **Resume Upload:** Finds the drop zone/file input and attaches `./my_resume.pdf`.
5. **Form Mapping:**
   - Populates contact information using `data-automation-id` selectors.
   - Dynamically adds repeaters for work history and education.
   - Matches Workday custom React dropdowns (Country, State, Degree, Phone Type).
6. **Error Recovery:** If a mandatory field is missing or produces a validation error, the script highlights it and pauses in the terminal so you can fix it in the browser without crashing.
7. **Review & Handover:** When reaching the final "Review" page, the script halts and turns control over to you. Inspect everything, make final tweaks, and press the final **Submit** button yourself.

---

## ⚙️ Configuration Reference (`config.json`)

| Setting Key | Type | Description |
| :--- | :--- | :--- |
| `userDataDir` | string | Path to browser profile directory (default: `./browser-profile`) |
| `headless` | boolean | Set to `false` to watch automation in headful mode (recommended) |
| `slowMo` | number | Milliseconds delay between actions for human-like pacing (default: `80`) |
| `resumePath` | string | Relative or absolute path to your local PDF resume |
| `actionTimeout` | number | Timeout in ms for finding DOM elements (default: `15000`) |

---

## 🛠️ Troubleshooting

- **Selector Changes:** Workday tenants may slightly vary their custom attributes. If a field fails to fill automatically, you can edit it live in the headful browser or press `[ENTER]` when prompted.
- **Persistent Profile Reset:** If you ever want to clear stored cookies or start with a fresh browser session, simply delete the generated `./browser-profile` folder.
