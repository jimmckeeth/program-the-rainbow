#!/usr/bin/env python3
import sys
import re
import os

"""
notesToggle.py - A script to add a speaker notes toggle to Reveal.js slideshows.
Specifically designed for slides exported from slides.com.
"""

TOGGLE_SCRIPT = """
			// Speaker Notes Toggle
			(function() {
				const hasNotes = (slide) => {
					if (!slide) return false;
					const id = slide.getAttribute('data-id');
					return !!(window.SLConfig && SLConfig.deck && SLConfig.deck.notes && SLConfig.deck.notes[id] && SLConfig.deck.notes[id].trim() !== "");
				};

				const addNotesToggle = () => {
					const controls = document.querySelector('.reveal > aside.controls') || document.querySelector('.reveal > .controls');
					
					if (!controls) {
						setTimeout(addNotesToggle, 500);
						return;
					}

					if (!document.querySelector('.notes-toggle')) {
						controls.style.overflow = 'visible';
						
						const toggle = document.createElement('button');
						toggle.className = 'notes-toggle';
						toggle.setAttribute('aria-label', 'Toggle speaker notes');
						toggle.setAttribute('type', 'button');
						
						Object.assign(toggle.style, {
							position: 'absolute',
							left: '-70px',
							bottom: '32px',
							background: 'none',
							border: 'none',
							fontSize: '24px',
							lineHeight: '1',
							padding: '4px',
							cursor: 'pointer',
							opacity: '0.6',
							zIndex: '10000',
							pointerEvents: 'auto',
							visibility: 'visible',
							transition: 'opacity 0.2s, transform 0.2s',
							display: 'none' 
						});
						
						toggle.innerHTML = '📝';
						toggle.title = 'Toggle Speaker Notes';

						const updateToggleVisibility = () => {
							const currentSlide = Reveal.getCurrentSlide();
							const slideHasNotes = hasNotes(currentSlide);
							const masterShowNotes = !!(window.SLConfig && SLConfig.deck && SLConfig.deck.user && SLConfig.deck.user.settings && SLConfig.deck.user.settings.present_notes);
							
							// Only show the toggle button on slides that actually have notes
							toggle.style.display = slideHasNotes ? 'block' : 'none';
							
							if (slideHasNotes) {
								toggle.style.opacity = masterShowNotes ? '1' : '0.6';
								toggle.style.transform = masterShowNotes ? 'scale(1.2)' : 'scale(1)';
								
								// If we are on a slide with notes, show them ONLY if master setting is ON
								if (Reveal.getConfig().showNotes !== masterShowNotes) {
									Reveal.configure({ showNotes: masterShowNotes });
								}
							} else {
								// Automatically hide notes panel if slide has no notes
								if (Reveal.getConfig().showNotes !== false) {
									Reveal.configure({ showNotes: false });
								}
							}
						};

						// Initial state
						updateToggleVisibility();
						
						toggle.addEventListener('mouseover', () => {
							toggle.style.opacity = '1';
						});
						toggle.addEventListener('mouseout', () => {
							const masterShowNotes = !!(window.SLConfig && SLConfig.deck && SLConfig.deck.user && SLConfig.deck.user.settings && SLConfig.deck.user.settings.present_notes);
							toggle.style.opacity = masterShowNotes ? '1' : '0.6';
						});
						
						toggle.addEventListener('click', (e) => {
							e.preventDefault();
							e.stopPropagation();
							const currentMaster = !!(window.SLConfig && SLConfig.deck && SLConfig.deck.user && SLConfig.deck.user.settings && SLConfig.deck.user.settings.present_notes);
							const newShowNotes = !currentMaster;
							
							// Update master setting
							if (window.SLConfig && SLConfig.deck && SLConfig.deck.user && SLConfig.deck.user.settings) {
								SLConfig.deck.user.settings.present_notes = newShowNotes;
							}
							
							// Apply to Reveal
							Reveal.configure({ showNotes: newShowNotes });
							
							updateToggleVisibility();
						});
						
						controls.appendChild(toggle);
						
						Reveal.on('slidechanged', updateToggleVisibility);
					}
				};

				if (Reveal.isReady()) {
					addNotesToggle();
				} else {
					Reveal.on('ready', addNotesToggle);
				}
			})();
"""

def apply_toggle(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update showNotes in Reveal.initialize
    # Look for showNotes: false or showNotes: true
    if 'showNotes: SLConfig.deck.user.settings.present_notes' not in content:
        content = re.sub(
            r'(showNotes:\s*)(true|false)',
            r'\1SLConfig.deck.user.settings.present_notes',
            content
        )

    # 2. Inject the toggle script
    # We want to inject it after the Reveal.initialize call
    if '// Speaker Notes Toggle' not in content:
        # Find the end of Reveal.initialize({...});
        marker = 'plugins: [ RevealZoom, RevealNotes, RevealMarkdown, RevealHighlight ]\n\t\t\t});'
        if marker in content:
            new_script = TOGGLE_SCRIPT
            content = content.replace(marker, marker + "\n" + new_script)
        else:
            # Fallback: try to find any Reveal.initialize closing
            content = re.sub(
                r'(Reveal\.initialize\(\{.*?\}\);)',
                r'\1\n' + TOGGLE_SCRIPT.replace('\\', '\\\\').replace('$', '\\$'),
                content,
                flags=re.DOTALL
            )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Successfully added speaker notes toggle to {file_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 notesToggle.py <path_to_html_file>")
    else:
        for arg in sys.argv[1:]:
            apply_toggle(arg)
