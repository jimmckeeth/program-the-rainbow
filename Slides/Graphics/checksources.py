import os
import re
import sys

MD_FILE = "ImageSourcesCredits.md"
DIRECTORY = "."
EXTENSIONS = (".webp", ".svg", ".jpg", ".png", ".pdf", ".ai")

def get_actual_files():
    files = [f for f in os.listdir(DIRECTORY) if f.lower().endswith(EXTENSIONS)]
    return set(files)

def parse_md(content):
    sections = {
        "header": "",
        "included": [],
        "missing": [],
        "unlisted": []
    }
    
    # Split by headers
    parts = re.split(r'(^##\s+.*$)', content, flags=re.MULTILINE)
    
    sections["header"] = parts[0].strip()
    
    current_section = None
    for i in range(1, len(parts), 2):
        header = parts[i].strip()
        body = parts[i+1] # Keep whitespace/newlines
        
        if "Included Images" in header:
            target_key = "included"
        elif "Missing Images" in header:
            target_key = "missing"
        elif "Unlisted Images" in header:
            target_key = "unlisted"
        else:
            target_key = None
            
        if target_key:
            entries = []
            current_entry = None
            
            # Use a more careful line-by-line parsing
            # Only a line starting with '*' (no leading space) is a new entry
            for line in body.splitlines():
                if line.startswith('*'):
                    if current_entry:
                        entries.append(current_entry)
                    current_entry = line
                elif current_entry is not None:
                    current_entry += "\n" + line
                elif line.strip(): # Text before the first entry
                    # Skip the boilerplate text like "These images don't have a local file."
                    # as we will re-add it during reconstruction.
                    if "These images" not in line and "present, but lack source" not in line:
                        # If there's something else, maybe prepend it to header?
                        pass
            
            if current_entry:
                entries.append(current_entry)
            
            sections[target_key] = entries
            
    return sections

def extract_filename(entry):
    # Match '* [filename](link)' or '* filename'
    match = re.search(r'\*\s+(?:\[([^\]]+)\]|([^*\[\s][^*]*?\.(?:' + '|'.join(e[1:] for e in EXTENSIONS) + ')))', entry, re.IGNORECASE)
    if match:
        return match.group(1) or match.group(2)
    return None

def find_match(filename, actual_files):
    filename = filename.strip()
    if filename in actual_files:
        return filename
    
    # Try fuzzy matches (spaces vs underscores)
    variants = [
        filename.replace(' ', '_'),
        filename.replace('_', ' '),
        filename.replace('-', '_'),
        filename.replace('_', '-')
    ]
    
    for v in variants:
        if v in actual_files:
            return v
            
    # Try extension mismatch (common in this project: png -> webp)
    base, ext = os.path.splitext(filename)
    for actual in actual_files:
        a_base, a_ext = os.path.splitext(actual)
        # Normalize bases for comparison
        nb = base.replace(' ', '_').replace('-', '_').lower()
        na = a_base.replace(' ', '_').replace('-', '_').lower()
        if nb == na:
            return actual
            
    return None

def main():
    if not os.path.exists(MD_FILE):
        print(f"Error: {MD_FILE} not found.")
        sys.exit(1)
        
    with open(MD_FILE, 'r') as f:
        content = f.read()
        
    actual_files = get_actual_files()
    sections = parse_md(content)
    
    # We want to keep original Included entries first, 
    # then append found Missing entries at the bottom of Included.
    new_included = []
    new_missing = []
    
    documented_files = set()
    
    # Process Included
    for entry in sections["included"]:
        filename = extract_filename(entry)
        if not filename:
            new_included.append(entry)
            continue
            
        match = find_match(filename, actual_files)
        if match:
            new_included.append(entry)
            documented_files.add(match)
            documented_files.add(filename) # Also mark original name as documented
        else:
            new_missing.append(entry)
            documented_files.add(filename)

    # Process Missing (move to included if found)
    for entry in sections["missing"]:
        filename = extract_filename(entry)
        if not filename:
            # Check if it was already moved or if it's just a stray line
            # If it's a bullet, keep it in missing for now
            new_missing.append(entry)
            continue
            
        match = find_match(filename, actual_files)
        if match:
            new_included.append(entry)
            documented_files.add(match)
            documented_files.add(filename)
        else:
            # Still missing
            new_missing.append(entry)
            documented_files.add(filename)

    # Identify Unlisted Images
    new_unlisted = []
    for f in sorted(actual_files):
        if f not in documented_files:
            # Double check with normalization
            nf = f.replace(' ', '_').replace('-', '_').lower()
            found = False
            for doc in documented_files:
                nd = doc.replace(' ', '_').replace('-', '_').lower()
                if nf == nd:
                    found = True
                    break
            if not found:
                new_unlisted.append(f"* {f}")

    # Reconstruct the file
    with open(MD_FILE, 'w') as f:
        f.write(sections["header"] + "\n\n")
        
        f.write("## Included Images\n\n")
        for entry in new_included:
            f.write(entry.strip() + "\n")
        f.write("\n")
        
        f.write("## Missing Images\n\n")
        f.write("These images don't have a local file.\n\n")
        for entry in new_missing:
            f.write(entry.strip() + "\n")
        f.write("\n")
        
        f.write("## Unlisted Images\n\n")
        f.write("These images are present, but lack source information.\n\n")
        for entry in new_unlisted:
            f.write(entry.strip() + "\n")

    print(f"Updated {MD_FILE}")

if __name__ == "__main__":
    main()
