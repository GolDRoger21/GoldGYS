import os

pages_dir = r"c:/Users/Gol D. Roger/OneDrive/Belgeler/GitHub/public/pages"
files_to_check = ['denemeler.html', 'konular.html', 'favoriler.html', 'konu.html', 'profil.html', 'yanlislarim.html']

for f in files_to_check:
    filepath = os.path.join(pages_dir, f)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as file:
            content = file.read()
            
        if '../css/app.css' not in content and '/css/app.css' not in content:
            new_content = content.replace('<link rel="stylesheet" href="../css/layout.css">', '  <link rel="stylesheet" href="../css/app.css">\n  <link rel="stylesheet" href="../css/layout.css">')
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                print(f'Updated {f}')
print('Done')
