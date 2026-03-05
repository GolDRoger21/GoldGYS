import re
import os
import base64

base_dir = r"c:\Users\Gol D. Roger\OneDrive\Belgeler\GitHub\docs\Kitap\Anayasa"
input_file = os.path.join(base_dir, "anayasa.html")
output_file = os.path.join(base_dir, "anayasa_baski_hazir.html")

with open(input_file, "r", encoding="utf-8") as f:
    text = f.read()

watermark_svg = """<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 0 L100 20 L100 70 C100 100 50 120 50 120 C50 120 0 100 0 70 L0 20 Z" fill="#d4af37"/>
    <path d="M50 8 L90 25 L90 68 C90 92 50 108 50 108 C50 108 10 92 10 68 L10 25 Z" fill="#121c26"/>
    <path d="M75 50 L75 80 L50 80 C30 80 20 65 20 50 C20 35 30 20 50 20 C65 20 72 30 72 30 L62 38 C62 38 58 32 50 32 C38 32 35 42 35 50 C35 58 38 68 50 68 L62 68 L62 55 L45 55 L45 45 L75 45 Z" fill="#d4af37"/>
</svg>"""
encoded_logo = base64.b64encode(watermark_svg.encode('utf-8')).decode('utf-8')
logo_data_uri = f"data:image/svg+xml;base64,{encoded_logo}"

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Türkiye Cumhuriyeti Anayasası - Goldgys Kapak ve Rehber</title>
    <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@300;400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --gold-primary: #d4af37;
            --gold-light: #f3e5ab;
            --gold-dark: #aa8c2c;
            --navy-dark: #121c26;
            --navy-light: #1f2d3d;
            --paper-white: #ffffff;
            --text-color: #2b2b2b;
            --exam-highlight: #fff9e6;
            --exam-border: #d4af37;
            --critical-bg: #fff5f5;
            --critical-border: #e63946;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body {
            font-family: 'Lora', serif;
            color: var(--text-color);
            background-color: var(--paper-white);
            font-size: 11pt;
            line-height: 1.6;
        }

        /* PAGED.JS PRINT SETUP */
        @page {
            size: A4;
            margin: 20mm 20mm 22mm 20mm;
            
            @bottom-left {
                content: "goldgys.web.app";
                font-family: 'Montserrat', sans-serif;
                font-weight: 800;
                font-size: 8pt;
                color: var(--navy-light);
            }
            @bottom-center {
                content: "✧ GOLDGYS ✧";
                font-family: 'Playfair Display', serif;
                font-weight: 900;
                font-style: italic;
                font-size: 10pt;
                letter-spacing: 4px;
                color: var(--gold-dark);
            }
            @bottom-right {
                content: counter(page);
                font-family: 'Montserrat', sans-serif;
                font-weight: 800;
                font-size: 9pt;
                color: var(--gold-primary);
            }
        }

        .pagedjs_margin-bottom-right > .pagedjs_margin-content {
            background: var(--navy-dark) !important;
            color: var(--gold-primary) !important;
            padding: 4px 14px !important;
            border-radius: 4px !important;
            font-weight: 800 !important;
            font-size: 0.9rem !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin-bottom: 2mm !important;
            margin-left: auto !important; /* Fixes right alignment */
            width: max-content !important;
            min-width: 0 !important;
            flex: 0 0 auto !important;
        }

        /* Watermark safely injected via Base64 URI */
        .pagedjs_page_content::before {
             content: "";
             position: absolute; top: 0; left: 0; right: 0; bottom: 0;
             background-image: url('__LOGO_DATA_URI__'); background-repeat: no-repeat;
             background-position: center; background-size: 55%;
             opacity: 0.04; z-index: -1; pointer-events: none;
        }

        /* Inner border for ALL content pages */
        .pagedjs_page_content::after {
             content: "";
             position: absolute; top: -5mm; left: -5mm; right: -5mm; bottom: -5mm;
             border: 1px solid rgba(212, 175, 55, 0.4);
             pointer-events: none;
             z-index: 10;
        }

        @page cover-page {
            margin: 0;
            @bottom-left { content: none; }
            @bottom-center { content: none; }
            @bottom-right { content: none; }
        }

        /* Disable universal border & watermark ONLY on cover page */
        .pagedjs_cover-page_page .pagedjs_page_content::before,
        .pagedjs_cover-page_page .pagedjs_page_content::after {
            display: none !important;
        }

        /* ================= KAPAK SAYFASI TASARIMI ================= */
        .cover-page {
            page: cover-page;
            background-color: var(--navy-dark) !important;
            background-image: radial-gradient(circle at center, #1f2d3d 0%, #121c26 100%) !important;
            color: var(--gold-light);
            padding: 15mm;
            height: 297mm;
            width: 100%;
            display: block;
            box-sizing: border-box;
            position: relative;
        }

        /* ================= FRONT MATTER & PAGINATION ================= */
        @page front-matter {
            @bottom-right {
                content: counter(page, upper-roman);
            }
        }
        
        @page main-content {
            @bottom-right {
                content: " ";
            }
        }

        .cover-watermark {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            opacity: 0.04;
            pointer-events: none;
            z-index: 1;
            fill: var(--gold-primary);
        }

        .cover-inner {
            border: 3px double var(--gold-primary);
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            padding: 30mm 15mm;
            text-align: center;
            position: relative;
            z-index: 2;
        }

        .svg-logo {
            width: 130px;
            height: auto;
            margin-bottom: 25px;
            filter: drop-shadow(0 10px 15px rgba(0,0,0,0.6));
        }

        .brand-text {
            font-family: 'Montserrat', sans-serif;
            font-weight: 800;
            letter-spacing: 0.35em;
            color: var(--gold-primary);
            font-size: 1.1rem;
            text-transform: uppercase;
        }

        .cover-main-title {
            font-family: 'Playfair Display', serif;
            font-size: 4.5rem;
            font-weight: 900;
            color: var(--paper-white);
            line-height: 1.1;
            letter-spacing: 3px;
            margin: 30px 0 10px 0;
            text-shadow: 0 4px 15px rgba(0,0,0,0.8);
        }

        .cover-sub-title {
            font-family: 'Playfair Display', serif;
            font-size: 2.2rem;
            font-weight: 700;
            color: var(--gold-primary);
            letter-spacing: 8px;
            margin-top: 5px;
        }

        .cover-divider {
            width: 80px;
            height: 2px;
            background: var(--gold-primary);
            margin: 35px auto;
        }

        .cover-badge {
            background: var(--gold-primary);
            color: var(--navy-dark);
            padding: 10px 25px;
            font-family: 'Montserrat', sans-serif;
            font-weight: 800;
            font-size: 0.95rem;
            letter-spacing: 2px;
            border-radius: 50px;
            margin-top: 10px;
            display: inline-block;
            box-shadow: 0 5px 20px rgba(212, 175, 55, 0.3);
        }

        /* ================= REHBER VE KÜNYE SAYFALARI (CUSTOM) ================= */
        .custom-page {
            page: front-matter;
            background: transparent;
            width: 100%;
            height: 100%;
            position: relative;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            break-before: page;
        }

        .custom-page:first-of-type {
            counter-reset: page 1;
        }

        .content-area {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .guide-title {
            font-family: 'Playfair Display', serif;
            font-size: 2.2rem;
            font-weight: 900;
            color: var(--navy-dark);
            text-align: center;
            margin-bottom: 25px;
            border-top: 1px solid rgba(212, 175, 55, 0.3);
            border-bottom: 2px solid var(--gold-primary);
            padding: 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .intro-text-guide {
            font-size: 1.05rem;
            text-align: justify;
            margin-bottom: 20px;
            color: #374151;
        }

        .guide-box {
            background: var(--exam-highlight);
            border: 1px solid var(--gold-light);
            border-left: 6px solid var(--gold-primary);
            padding: 15px 20px;
            margin-bottom: 20px;
            border-radius: 0 8px 8px 0;
            box-shadow: 0 4px 6px rgba(0,0,0,0.02);
            break-inside: avoid;
        }

        .guide-box h4 {
            font-family: 'Montserrat', sans-serif;
            color: var(--navy-dark);
            margin-bottom: 6px;
            font-size: 1.05rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .guide-box p {
            font-size: 0.95rem;
            color: #4b5563;
            line-height: 1.6;
        }

        .guide-box.syllabus { background: #f8fafc; border-color: #e2e8f0; border-left-color: var(--navy-dark); }
        .guide-box.syllabus h4 { color: var(--navy-dark); }
        
        .syllabus-list { list-style: none; margin-top: 8px; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e2e8f0; }
        .syllabus-list li { display: flex; justify-content: space-between; font-family: 'Montserrat', sans-serif; font-size: 0.9rem; font-weight: 600; padding: 4px 0; border-bottom: 1px dashed #cbd5e1; }
        .syllabus-list li:last-child { border-bottom: none; }

        .guide-box.critical { background: var(--critical-bg); border-color: #fca5a5; border-left-color: var(--critical-border); }
        .guide-box.critical h4 { color: var(--critical-border); }

        .imprint-container { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
        .imprint-logo { width: 60px; margin-bottom: 20px; opacity: 0.8; }
        .imprint-section { padding: 30px; background: rgba(255, 255, 255, 0.8); border: 1px dashed var(--gold-primary); max-width: 80%; }

        /* ================= ANA İÇERİK (ANAYASA) TASARIMI ================= */
        .content { 
            page: main-content;
            margin-top: 1rem; 
            break-inside: auto; 
        }

        h1.kisim-baslik {
            font-family: 'Playfair Display', serif;
            font-size: 26pt;
            text-align: center;
            text-transform: uppercase;
            color: var(--navy-dark);
            margin-top: 2rem;
            margin-bottom: 2rem;
            border-bottom: 2px solid var(--gold-primary);
            padding-bottom: 0.5rem;
            break-before: always;
            break-after: avoid;
            break-inside: avoid;
            font-weight: 900;
        }

        h1.kisim-baslik:first-child {
            break-before: avoid;
        }

        h2.bolum-baslik {
            font-family: 'Montserrat', sans-serif;
            font-size: 16pt;
            text-align: center;
            color: var(--navy-light);
            margin-top: 2.5rem;
            margin-bottom: 1.5rem;
            font-weight: 800;
            letter-spacing: 2px;
            break-after: avoid;
            break-inside: avoid;
        }

        h2.ana-baslik {
            font-family: 'Montserrat', sans-serif;
            font-size: 15pt;
            text-align: center;
            color: var(--navy-dark);
            margin-top: 2rem;
            margin-bottom: 1.5rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            break-after: avoid;
            break-inside: avoid;
        }

        h3.konu-baslik {
            font-family: 'Montserrat', sans-serif;
            font-size: 13pt;
            color: var(--navy-dark);
            margin-top: 2.5rem;
            margin-bottom: 1.5rem;
            border-left: 4px solid var(--gold-primary);
            padding-left: 12px;
            break-after: avoid;
            break-inside: avoid;
        }

        .madde-kutu {
            margin-top: 0.6rem;
            margin-bottom: 0.6rem;
            background: #fff;
            break-inside: auto;
        }

        p {
            margin-top: 0.3rem;
            margin-bottom: 0.5rem;
            text-align: justify;
            text-justify: inter-word;
            break-inside: auto;
        }

        .madde-paragraf { font-size: 10.5pt; color: var(--text-color); line-height: 1.5; font-family: 'Lora', serif; }
        .madde-paragraf strong { color: var(--navy-dark); font-weight: 700; font-family: 'Montserrat', sans-serif; font-size: 10.5pt;}
        .normal-paragraf { margin-bottom: 1rem; font-size: 10.5pt; line-height: 1.5;}
        ul, ol { margin-left: 1.5rem; margin-bottom: 1rem; font-size: 10.5pt;}
        li { margin-bottom: 0.5rem; text-align: justify; break-inside: auto; }

        /* VURGU SİSTEMİ (HIGHLIGHTS) */
        .exam-keyword-auth {
            color: var(--navy-dark);
            font-weight: 800;
            background-color: rgba(31, 45, 61, 0.08); /* Soft navy background */
            padding: 0 4px;
            border-radius: 3px;
            border-bottom: 2px solid var(--navy-light);
            display: inline-block;
            line-height: 1.2;
        }
        .exam-keyword-ratio {
            color: #c62828; /* Deep red */
            font-weight: 800;
            background-color: class;
            background-color: rgba(198, 40, 40, 0.08); /* Soft red background */
            padding: 0 4px;
            border-radius: 3px;
            border-bottom: 2px solid #ef5350;
            display: inline-block;
            line-height: 1.2;
        }
        .exam-keyword-time {
            color: var(--gold-dark);
            font-weight: 800;
            background-color: rgba(212, 175, 55, 0.12); /* Soft gold background */
            padding: 0 4px;
            border-radius: 3px;
            border-bottom: 2px solid var(--gold-primary);
            display: inline-block;
            line-height: 1.2;
        }

        /* TOC Design */
        .toc { page: front-matter; padding-top: 2rem; break-before: page; }
        .toc-heading { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 900; text-align: center; margin-bottom: 2rem; color: var(--navy-dark); border-bottom: 2px solid var(--gold-primary); padding-bottom: 1rem; text-transform: uppercase; }
        .toc-list { list-style: none; padding: 0; margin: 0; }
        .toc-item { font-size: 1.05rem; line-height: 1.5; margin-bottom: 0.3rem; position: relative; overflow: hidden; font-family: 'Lora', serif;}
        .toc-item a { text-decoration: none; color: var(--text-color); display: block; width: 100%; position: relative; }
        .toc-title-text { background: var(--paper-white); padding-right: 5px; position: relative; z-index: 2; font-weight: 600; }
        .toc-dots { position: absolute; left: 0; bottom: 0.2rem; z-index: 1; letter-spacing: 2px; color: #cbd5e1; white-space: nowrap; pointer-events: none; }
        .toc-page { float: right; background: var(--paper-white); padding-left: 5px; position: relative; z-index: 2; font-weight: bold; color: var(--navy-dark); font-family: 'Montserrat', sans-serif;}
        .toc-kisim { font-weight: 800; margin-top: 1.5rem; font-size: 1.25rem; color: var(--navy-dark); font-family: 'Montserrat', sans-serif; }
        .toc-bolum { margin-left: 1.5rem; font-weight: 700; margin-top: 1rem; color: var(--navy-light); font-family: 'Montserrat', sans-serif; }
        .toc-baslik { margin-left: 3rem; font-weight: 600; }
    </style>
</head>
<body>

    <!-- 1. SAYFA: PREMİUM KAPAK -->
    <div class="cover-page">
        <svg class="cover-watermark" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 0 L100 20 L100 70 C100 100 50 120 50 120 C50 120 0 100 0 70 L0 20 Z" fill="#d4af37"/>
            <path d="M50 8 L90 25 L90 68 C90 92 50 108 50 108 C50 108 10 92 10 68 L10 25 Z" fill="#121c26"/>
            <path d="M75 50 L75 80 L50 80 C30 80 20 65 20 50 C20 35 30 20 50 20 C65 20 72 30 72 30 L62 38 C62 38 58 32 50 32 C38 32 35 42 35 50 C35 58 38 68 50 68 L62 68 L62 55 L45 55 L45 45 L75 45 Z" fill="#d4af37"/>
        </svg>

        <div class="cover-inner">
            <div style="margin-top: 30px;">
                <svg class="svg-logo" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 0 L100 20 L100 70 C100 100 50 120 50 120 C50 120 0 100 0 70 L0 20 Z" fill="#d4af37"/>
                    <path d="M50 8 L90 25 L90 68 C90 92 50 108 50 108 C50 108 10 92 10 68 L10 25 Z" fill="#121c26"/>
                    <path d="M75 50 L75 80 L50 80 C30 80 20 65 20 50 C20 35 30 20 50 20 C65 20 72 30 72 30 L62 38 C62 38 58 32 50 32 C38 32 35 42 35 50 C35 58 38 68 50 68 L62 68 L62 55 L45 55 L45 45 L75 45 Z" fill="#d4af37"/>
                </svg>
                <div class="brand-text">Goldgys Hukuk Akademisi</div>
            </div>
            
            <div>
                <h1 class="cover-main-title">TÜRKİYE<br>CUMHURİYETİ</h1>
                <h2 class="cover-sub-title">ANAYASASI</h2>
                <div class="cover-divider"></div>
                <div class="cover-badge">ADALET BAKANLIĞI GYS ÖZEL SÜRÜMÜ</div>
            </div>

            <div style="margin-bottom: 30px;">
                <p style="font-family: 'Montserrat', sans-serif; font-weight: 500; letter-spacing: 4px; text-align: center; font-size: 1.15rem; color: #fff;">2026 GÜNCEL İÇERİK</p>
                <p style="font-family: 'Lora', serif; font-style: italic; color: #9ca3af; margin-top: 15px; text-align: center; font-size: 0.95rem;">
                    Adalet Bakanlığı Görevde Yükselme ve Unvan Değişikliği Sınavlarına<br>Hazırlık İçin Özel Olarak Dizilmiştir
                </p>
            </div>
        </div>
    </div>

    <!-- 2. SAYFA: OKUMA VE SINAV REHBERİ -->
    <div class="custom-page">
        <div class="content-area">
            <h2 class="guide-title">Okuma ve Sınav Rehberi</h2>
            
            <p class="intro-text-guide">
                Elinizdeki bu eser, <strong>Adalet Bakanlığı Görevde Yükselme Sınavı'na (GYS)</strong> hazırlanan adaylar için <strong>Goldgys Hukuk Akademisi</strong> tarafından özel olarak dizilmiştir. Sınavda zaman ve odak kazanmanızı sağlamak amacıyla yalnızca müfredata dahil olan maddeler (1 - 160 arası) özenle tasnif edilmiştir.
            </p>

            <div class="guide-box syllabus">
                <h4>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    GYS Anayasa Soru Dağılımı
                </h4>
                <p>Görevde yükselme ortak sınav konuları kapsamında Anayasa'dan <strong>toplam 6 adet soru</strong> gelmektedir. Sorumlu olduğunuz kısımlar ve resmi soru ağırlıkları şu şekildedir:</p>
                <ul class="syllabus-list">
                    <li><span>a) Genel Esaslar</span> <span style="color: var(--gold-dark);">2 Soru</span></li>
                    <li><span>b) Temel Hak ve Ödevler</span> <span style="color: var(--gold-dark);">2 Soru</span></li>
                    <li><span>c) Cumhuriyetin Temel Organları</span> <span style="color: var(--gold-dark);">2 Soru</span></li>
                </ul>
            </div>

            <div class="guide-box">
                <h4>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    GYS Odaklı Altın Vurgular
                </h4>
                <p>Kitabın ilerleyen sayfalarında, metin içerisinde arka planı renklendirilmiş kelimeler (örn: <span class="exam-keyword-auth">Cumhurbaşkanı</span>, <span class="exam-keyword-time">onbeş gün</span>, <span class="exam-keyword-ratio">üçte iki</span>); sınav ve mülakatlarda en sık soru gelen, ayırt edici kısımlardır. Yeni nesil premium tasarımımızla bu öğeler altın, lacivert ve kırmızı mühürler şeklinde kodlanmış olup, görsel hafızanızı doğrudan doğru cevaplara odaklayacaktır.</p>
            </div>

            <div class="guide-box critical">
                <h4>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e63946" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    Kritik Hükümler
                </h4>
                <p>Kırmızı renkli oranlar veya süreler, sınavlarda çeldirici olarak kullanılan istisnai durumları ve mutlak suretle bilinmesi gereken temel yapı taşlarını vurgulamaktadır.</p>
            </div>
        </div>
    </div>

    <!-- 3. SAYFA: KÜNYE VE İMZA -->
    <div class="custom-page">
        <div class="imprint-container">
            <svg class="imprint-logo" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 0 L100 20 L100 70 C100 100 50 120 50 120 C50 120 0 100 0 70 L0 20 Z" fill="#d4af37"/>
                <path d="M50 8 L90 25 L90 68 C90 92 50 108 50 108 C50 108 10 92 10 68 L10 25 Z" fill="#121c26"/>
                <path d="M75 50 L75 80 L50 80 C30 80 20 65 20 50 C20 35 30 20 50 20 C65 20 72 30 72 30 L62 38 C62 38 58 32 50 32 C38 32 35 42 35 50 C35 58 38 68 50 68 L62 68 L62 55 L45 55 L45 45 L75 45 Z" fill="#d4af37"/>
            </svg>

            <div class="imprint-section">
                <p style="font-family: 'Montserrat', sans-serif; font-weight: 800; color: var(--navy-dark); margin-bottom: 20px; font-size: 1.1rem; letter-spacing: 2px; text-align: center;">GOLDGYS HUKUK AKADEMİSİ YAYINLARI</p>
                <p style="margin-bottom: 5px; color: #4b5563; text-align: center;"><strong>İçerik Editörlüğü & Tasarım:</strong></p>
                <p style="font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 900; font-style: italic; color: var(--gold-dark); margin-bottom: 30px; text-align: center;">Gol D. Roger</p>
                <div style="width: 50px; height: 2px; background: var(--gold-primary); margin: 0 auto 30px auto;"></div>
                <p style="font-family: 'Lora', serif; font-size: 0.95rem; color: #374151; margin-bottom: 25px; text-align: center;">
                    GYS'ye yönelik daha fazla ders notu, test ve güncel döküman için sitemizi ziyaret edin.
                </p>
                <p style="font-family: 'Montserrat', sans-serif; font-size: 0.8rem; opacity: 0.6; line-height: 1.8; text-align: center;">
                    © 2026 Goldgys Project.<br>
                    Bu belge izinsiz çoğaltılamaz ve ticari amaçla kullanılamaz.
                </p>
            </div>
        </div>
    </div>

    <!-- Table of Contents Container -->
    <div class="toc" id="toc-container">
        <h2 class="toc-heading">İÇİNDEKİLER</h2>
        <ul class="toc-list" id="toc-list-container">
            {toc}
        </ul>
    </div>

    <!-- Main Content -->
    <div class="content" id="main-content">
        {content}
    </div>

    <script>
        // Fallback for Page Numbers since Paged.js target-counter can fail with complex DOM
        class tocPageNumbering extends Paged.Handler {
            constructor(chunker, polisher, caller) {
                super(chunker, polisher, caller);
            }

            afterRendered(pages) {
                const tocLinks = document.querySelectorAll('.toc-item a');
                tocLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (!href || !href.startsWith('#')) return;
                    
                    const targetId = href.substring(1);
                    const targetElement = document.getElementById(targetId);
                    
                    if (targetElement) {
                        const page = targetElement.closest('.pagedjs_page');
                        if (page) {
                            // Adjust for the 3 custom pages at the start (Cover, Guide, Imprint)
                            let rawPageNum = parseInt(page.getAttribute('data-page-number')) || 0;
                            // Let's just use the raw page number mapped directly
                            const pageNumSpan = link.querySelector('.toc-page-num');
                            if(pageNumSpan) {
                                pageNumSpan.textContent = pageNumberToDisplay(rawPageNum);
                            }
                        }
                    }
                });
            }
        }
        function pageNumberToDisplay(num) {
            // Paged.js global absolute pages: 
            // Cover(1), Guide(2), Imprint(3), TOC(4-9). 
            // Main Content (Kisım 1) starts at Absolute Page 10, which corresponds to Arabic Page 1.
            let offset = 9;
            return num - offset > 0 ? num - offset : num;
        }

        class customPageNumbers extends Paged.Handler {
            constructor(chunker, polisher, caller) {
                super(chunker, polisher, caller);
            }
            afterPageLayout(pageElement, page, breakToken) {
                let rawNum = parseInt(pageElement.getAttribute('data-page-number')) || 0;
                if (rawNum > 9) {
                    let badge = pageElement.querySelector('.pagedjs_margin-bottom-right > .pagedjs_margin-content');
                    if (badge) {
                        badge.textContent = (rawNum - 9).toString();
                        // Important: force opacity/visibility in case Chromium skips rendering
                        badge.style.opacity = '1';
                    }
                }
            }
        }

        Paged.registerHandlers(tocPageNumbering);
        Paged.registerHandlers(customPageNumbers);
    </script>
</body>
</html>
"""

def apply_exam_highlights(text_node):
    # Highlight authorities
    authorities = [
        "Türkiye Büyük Millet Meclisi", "Cumhurbaşkanı", "Anayasa Mahkemesi",
        "Yargıtay", "Danıştay", "Uyuşmazlık Mahkemesi", "Sayıştay", "Yüksek Seçim Kurulu",
        "Hakimler ve Savcılar Kurulu", "Milli Güvenlik Kurulu", "Bakanlar Kurulu",
        "Genelkurmay Başkanı", "Diyanet İşleri Başkanlığı", "Devlet Denetleme Kurulu",
        "Yükseköğretim Kurulu", "Yükseköğretim Denetleme Kurulu", "Radyo ve Televizyon Üst Kurulu",
        "Atatürk Kültür, Dil ve Tarih Yüksek Kurumu", "Milli İstihbarat Teşkilatı",
        "Cumhurbaşkanlığı Kararnamesi", "Olağanüstü hal"
    ]
    for auth in authorities:
        # Catch the authority name plus any immediate alphabetical suffixes
        text_node = re.sub(rf'\b({auth}[a-zA-ZçğıöşüÇĞIÖŞÜ]*)\b', r'<span class="exam-keyword-auth">\1</span>', text_node, flags=re.IGNORECASE)
    
    # Ratios and Majorities
    ratios = ["salt çoğunluğu", "salt çoğunluğunun", "salt çoğunlukla", "üçte iki", "üçte ikisi", "beşte üçü", "beşte üçünün", "dörtte üçü", "dörtte üçünün", "tam sayısı", "nitelikli çoğunluk", "onda biri", "onda birinin", "beşte biri", "beşte birinin"]
    for ratio in ratios:
        text_node = re.sub(rf'\b({ratio}[a-zA-ZçğıöşüÇĞIÖŞÜ]*)\b', r'<span class="exam-keyword-ratio">\1</span>', text_node, flags=re.IGNORECASE)
    
    # Times (days, months, years)
    text_node = re.sub(r'\b(\d+\s*(?:gün|ay|yıl|saat|hafta)[a-zA-ZçğıöşüÇĞIÖŞÜ]*)\b', r'<span class="exam-keyword-time">\1</span>', text_node, flags=re.IGNORECASE)
    text_node = re.sub(r'\b((?:bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|onbeş|yirmi|otuz|kırk|kırkbeş|elli|altmış|yetmiş|seksen|doksan)\s*(?:gün|ay|yıl)[a-zA-ZçğıöşüÇĞIÖŞÜ]*)\b', r'<span class="exam-keyword-time">\1</span>', text_node, flags=re.IGNORECASE)
    
    # Ages
    text_node = re.sub(r'\b(\d+\s*yaş[a-zA-ZçğıöşüÇĞIÖŞÜ]*)\b', r'<span class="exam-keyword-time">\1</span>', text_node, flags=re.IGNORECASE)
    text_node = re.sub(r'\b((?:onsekiz|yirmibeş|otuz|kırk|altmışbeş)\s*yaş[a-zA-ZçğıöşüÇĞIÖŞÜ]*)\b', r'<span class="exam-keyword-time">\1</span>', text_node, flags=re.IGNORECASE)
    
    return text_node

lines = text.splitlines()

processed_html = ""
toc_html = ""
current_kisim = 0
current_bolum = 0
current_baslik = 0
current_madde = 0
expecting_subtitle = False

for line in lines:
    line = line.strip()
    if not line:
        continue
        
    # Remove Legal Amendment Notes completely
    line = re.sub(r'\([^)]*?\d{1,2}/\d{1,2}/\d{4}-\d+[^)]*?\)\s*', '', line)
    line = re.sub(r'\(Mülga[^)]*?\)\s*', '', line, flags=re.IGNORECASE)
    line = re.sub(r'\(Ek[^)]*?\)\s*', '', line, flags=re.IGNORECASE)
    line = line.strip()
    
    if not line:
        continue
        
    if re.match(r'^(BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ).*KISIM$', line, re.IGNORECASE):
        current_kisim += 1
        processed_html += f'\n<h1 class="kisim-baslik" id="kisim-{current_kisim}">{line}</h1>\n'
        toc_html += f'<li class="toc-item toc-kisim"><a href="#kisim-{current_kisim}"><span class="toc-title-text">{line}</span><span class="toc-dots"> . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . </span><span class="toc-page"><span class="toc-page-num"></span></span></a></li>\n'
        expecting_subtitle = True
    elif re.match(r'^(BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ).*BÖLÜM$', line, re.IGNORECASE):
         current_bolum += 1
         processed_html += f'\n<h2 class="bolum-baslik" id="bolum-{current_bolum}">{line}</h2>\n'
         toc_html += f'<li class="toc-item toc-bolum"><a href="#bolum-{current_bolum}"><span class="toc-title-text">{line}</span><span class="toc-dots"> . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . </span><span class="toc-page"><span class="toc-page-num"></span></span></a></li>\n'
         expecting_subtitle = True
    elif re.match(r'^([IXV]+|[A-Z])\.\s+(.+)', line):
        current_baslik += 1
        processed_html += f'\n<h3 class="konu-baslik" id="konu-{current_baslik}">{line}</h3>\n'
        toc_html += f'<li class="toc-item toc-baslik"><a href="#konu-{current_baslik}"><span class="toc-title-text">{line}</span><span class="toc-dots"> . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . </span><span class="toc-page"><span class="toc-page-num"></span></span></a></li>\n'
        expecting_subtitle = False
    elif (line.isupper() and len(line) > 4 and not line.startswith("MADDE")) or (expecting_subtitle and not line.lower().startswith("madde")):
        processed_html += f'\n<h2 class="ana-baslik">{line}</h2>\n'
        expecting_subtitle = False
    elif line.lower().startswith("madde"):
        expecting_subtitle = False
        processed_html += f'\n<div class="madde-kutu">\n'
        madde_match = re.search(r'^(Madde \d+\s*(?:–|-)?)\s*(.*)', line, re.IGNORECASE)
        if madde_match:
            madde_no = madde_match.group(1).strip()
            madde_icerik = apply_exam_highlights(madde_match.group(2).strip())
            processed_html += f'  <p class="madde-paragraf"><strong>{madde_no}</strong> {madde_icerik}</p>\n</div>\n'
        else:
           processed_html += f'  <p class="madde-paragraf"><strong>{line}</strong></p>\n</div>\n'
    else:
        expecting_subtitle = False
        line_icerik = apply_exam_highlights(line)
        processed_html += f'<p class="normal-paragraf">{line_icerik}</p>\n'

final_html = HTML_TEMPLATE.replace("{content}", processed_html).replace("{toc}", toc_html).replace("__LOGO_DATA_URI__", logo_data_uri)

with open(output_file, "w", encoding="utf-8") as f:
    f.write(final_html)

print(f"Başarıyla oluşturuldu: {output_file}")
