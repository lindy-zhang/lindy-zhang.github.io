# Editing your own site — a real guide, not a black box

Your whole site is **one HTML file** (`index.html`) with CSS and JavaScript inside it,
plus a folder of photos (`assets/`) and one extra page (`projects/attention-visualizer.html`).
No build step, no framework, no `npm install`. You open the file, you edit text, you save,
you refresh your browser. That's it.

## 1. Set yourself up (10 minutes, one time)

1. **Install VS Code** — [code.visualstudio.com](https://code.visualstudio.com). It's free, and it's
   what most engineers use to edit code, including plain HTML/CSS.
2. **Install the "Live Server" extension** inside VS Code (click the Extensions icon on the left
   sidebar — looks like four squares — search "Live Server" by Ritwick Dey, click Install).
   This gives you a live preview that auto-refreshes every time you save.
3. **Open the `site` folder** in VS Code: `File → Open Folder…` and select the folder this file
   is in.
4. Right-click `index.html` in the file list → **"Open with Live Server."** A browser tab opens
   showing your actual site. Leave it open — every time you save a change, it refreshes automatically.

## 2. How the file is organized

Open `index.html`. It has three parts, in this order:

- **`<style>` block near the top** — this is all your CSS (colors, fonts, spacing, layout).
- **`<body>` further down** — this is your actual content, wrapped in `<section>` tags. Each
  section has an `id` (like `id="about"`) that matches a nav link at the top of the page.
- **`<script>` block near the bottom** — the ticker text and the live Cambridge/Taipei clock.

Everything is labeled — search (Cmd/Ctrl+F in VS Code) for `id="work"` and you'll land exactly
on your experience section, for example.

## 3. Common edits

**Change text.** Find the words you want to change (Cmd/Ctrl+F helps a lot) and just type over
them. Text sits between tags like `<p>your text here</p>` or `<h4>your text here</h4>` — edit
what's *between* the tags, don't touch the `<...>` parts themselves.

**Swap a photo.** Every photo is one line like:
```html
<img src="assets/tennis-action.jpg" alt="Lindy playing tennis doubles">
```
Drop your new photo into the `assets` folder, then change `tennis-action.jpg` to your new
filename. Keep `alt="..."` accurate — it's what screen readers and Google read when the image
can't load.

**Add a new "Training Log" entry.** In the Log section, find a `<div class="log-entry">…</div>`
block and copy the whole thing (open tag to close tag), paste it right below, and edit the date,
heading, description, and photo inside your copy.

**Add a new "Results Sheet" (experience) entry.** Same idea — copy a whole
`<div class="result-row">…</div>` block, paste it, edit the org name, dates, role, and bullet
points. Bullets are `<li>your bullet</li>` lines inside the `<ul>`.

**Add a new project to "Builds."** Copy one `<a class="build">…</a>` block inside
`.builds-grid`, paste it, and edit the tag/title/description/link (`href="..."`).

**Change a color.** Near the very top of the `<style>` block there's a `:root { ... }` list —
these are your named colors (`--paper`, `--ink`, `--red`, `--hi` for the highlighter yellow,
etc). Change the hex value once here and it updates *everywhere* that color is used on the
page — that's the whole point of defining them in one place.

**Change a font.** The `<link href="https://fonts.googleapis.com/...">` line in `<head>` is
pulling three fonts from Google Fonts. Go to [fonts.google.com](https://fonts.google.com), pick
a font, click "Get font," copy the `<link>` snippet it gives you, and swap it in. Then update
the `font-family` names in the CSS (search for `Big Shoulders Display`, `Work Sans`, or
`JetBrains Mono` to find every place a font is referenced).

## 4. Publishing it live (GitHub Pages, free, ~10 minutes)

You already have a GitHub account. Here's the fastest path to a real URL:

1. Go to [github.com/new](https://github.com/new) and create a repository named exactly
   `lindy-zhang.github.io` (your GitHub username + `.github.io` — this exact naming is what
   makes GitHub host it automatically).
2. On your computer, open a terminal in your `site` folder and run:
   ```bash
   git init
   git add .
   git commit -m "first version of my site"
   git branch -M main
   git remote add origin https://github.com/lindy-zhang/lindy-zhang.github.io.git
   git push -u origin main
   ```
3. Wait about a minute, then visit **https://lindy-zhang.github.io** — it's live.
4. Every time you want to update the live site: save your edits, then from that same folder run:
   ```bash
   git add .
   git commit -m "describe what you changed"
   git push
   ```
   That's the entire deploy process, forever. No build, no hosting bill.

## 5. If you get stuck

- **Something looks broken after an edit:** you probably left a tag unclosed. Every `<div ...>`
  needs a matching `</div>` somewhere below it, same for `<section>`, `<a>`, `<ul>`, etc. VS Code
  will usually show a red squiggle near the mismatch.
- **A photo isn't showing up:** check that the filename in `src="assets/..."` *exactly* matches
  the file in your `assets` folder, including capitalization and `.jpg` vs `.JPG`.
- **You want to try something risky:** just duplicate `index.html` first (e.g.
  `index-backup.html`) before you experiment, so you always have a working copy to fall back to.
