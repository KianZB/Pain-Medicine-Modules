# Pain Medicine Learning Modules

This is a starter Quarto website.

## Netlify deployment

Netlify uses `netlify.toml` to install Quarto, render the website, and publish
the generated `_site` directory. The Quarto build plugin runs `quarto render`
during deployment; no separate build command is needed in the Netlify settings.
The repository contains Quarto source files, so publishing it directly without
rendering does not provide the `index.html` homepage.

## How to use

1. Unzip this folder.
2. Open the unzipped `pain-medicine-modules` folder in VS Code.
3. In VS Code, open Terminal → New Terminal.
4. Run:

```bash
quarto preview
```

5. A local website preview should open in your browser.

## How to add your Twine case

1. Open your case in Twine.
2. Export/publish it as an `.html` file.
3. Put that `.html` file inside the `cases` folder.
4. Link to it from `modules.qmd`.

Example:

```markdown
[Launch chronic low back pain case](cases/chronic-low-back-pain.html){.btn .btn-primary target="_blank"}
```

