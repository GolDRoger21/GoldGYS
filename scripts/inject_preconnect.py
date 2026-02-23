import os
import glob
import re

directory = r"c:\Users\Gol D. Roger\OneDrive\Belgeler\GitHub\public"
html_files = glob.glob(f"{directory}/**/*.html", recursive=True)

preconnect_tags = """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://www.gstatic.com" crossorigin>
"""

for file_path in html_files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove existing ones to prevent duplicates
    content = re.sub(r'<link[^>]*rel=["\']preconnect["\'][^>]*href=["\']https://fonts\.googleapis\.com["\'][^>]*>', '', content)
    content = re.sub(r'<link[^>]*rel=["\']preconnect["\'][^>]*href=["\']https://fonts\.gstatic\.com["\'][^>]*>', '', content)
    content = re.sub(r'<link[^>]*rel=["\']preconnect["\'][^>]*href=["\']https://www\.gstatic\.com["\'][^>]*>', '', content)

    # Insert right after <head> or <meta charset>
    if "<head>" in content:
        content = content.replace("<head>", "<head>\n" + preconnect_tags, 1)
    elif '<meta charset="UTF-8">' in content:
        content = content.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + preconnect_tags, 1)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print(f"Updated {len(html_files)} HTML files with preconnect hints.")
