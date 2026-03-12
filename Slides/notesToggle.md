# Speaker Notes Toggle for Reveal.js

This feature adds a toggle button (📝) to the Reveal.js control cluster, allowing users to show or hide speaker notes on slides that contain them.

## Features

- **Toggle Button**: A 📝 icon appears in the control cluster (lower-right) on slides with notes.
- **Smart Visibility**: The button only appears when the current slide has speaker notes.
- **Auto-Hide**: When navigating to a slide without notes, the notes panel automatically hides.
- **State Persistence**: Your preference (shown or hidden) is remembered as you navigate between slides that have notes.
- **Integration**: Synchronizes with `SLConfig.deck.user.settings.present_notes` for consistency with slides.com exported settings.

## Usage

The `notesToggle.py` script automates the process of adding this feature to Reveal.js HTML files.

### Requirements

- Python 3.x

### Command Line Usage

```bash
python3 notesToggle.py <path_to_html_file>
```

You can also pass multiple files:

```bash
python3 notesToggle.py slide1.html slide2.html
```

### What the script does

1.  **Updates Reveal.js Configuration**: It changes the `showNotes` setting in `Reveal.initialize` to use the dynamic `SLConfig.deck.user.settings.present_notes` value.
2.  **Injects Toggle Logic**: It appends a self-contained JavaScript block after `Reveal.initialize` that handles the button creation, styling, and event listeners.

## Manual Installation (Technical Details)

If you prefer to add this manually, you need to:

1.  Ensure `Reveal.initialize` includes `showNotes: SLConfig.deck.user.settings.present_notes`.
2.  Add a script that:
    - Locates the `.reveal > aside.controls` element.
    - Creates a button with `class="notes-toggle"`.
    - Hooks into the `Reveal.on('slidechanged')` event to update visibility.
    - Uses `Reveal.configure({ showNotes: ... })` to toggle the panel.
