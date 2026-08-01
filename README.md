# Strange Minds Moral-Status Map

An interactive, uncertainty-sensitive map of possible moral status across digital, biological, human, and post-human entities.

## Live site

Once GitHub Pages finishes deploying, open:

**https://esseestethan.github.io/Moral-Status/**

## What the map does

- Maps credence-weighted moral-status grounds against degree or tier of moral status.
- Represents entities as probability clouds and 95% credible regions rather than fixed points.
- Compares linear, sigmoid, threshold, and multi-criterial theories.
- Distinguishes full personhood from supra, or more-than-full, moral status.
- Lets users edit entities, grounds, confidence, and precautionary assumptions.
- Generates provisional duties from both degree and dominant grounds.

## Local development

```bash
npm install
npm run dev
```

The source is stored in ordered files under `src/chunks/`. The build script joins them into `src/main.jsx` before running Vite.

## Deployment

Every push to `main` triggers `.github/workflows/deploy-pages.yml`, which builds the app and publishes `dist/` to GitHub Pages.

## Epistemic status

The numerical defaults are illustrative inputs for structured deliberation, not settled empirical estimates or moral verdicts. The tool operationalizes competing philosophical views without adjudicating among them.
