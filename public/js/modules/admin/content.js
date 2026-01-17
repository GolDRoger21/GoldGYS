import { db } from "../../firebase-config.js";
import { 
    collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global Değişkenler
let modalElement = null;
let questionForm = null;
let currentOnculler = []; // Öncülleri hafızada tutmak için

export function initContentPage() {
    console.log("GYS İçerik Modülü Başlatılıyor...");
    renderContentInterface();
    loadQuestions();
}

// 1. ARAYÜZ OLUŞTURMA (HTML Enjeksiyonu)
function renderContentInterface() {
    const container = document.getElementById('section-content');
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2>📚 Soru Bankası Yönetimi</h2>
                <p class="text-muted text-sm">Soru Ekleme, Düzenleme ve Toplu İşlemler</p>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="document.querySelector('[data-tab=\\'importer\\']').click()">📥 Excel/JSON Yükle</button>
                <button id="btnNewQuestion" class="btn btn-primary">➕ Yeni Soru Ekle</button>
            </div>
        </div>
        
        <div class="card mb-4" style="background: var(--bg-panel); border:1px solid var(--border-color);">
            <div class="row align-items-end">
                <div class="col-md-4">
                    <label class="text-muted text-sm">Ders / Konu</label>
                    <select id="filterCategory" class="form-control">
                        <option value="">Tümü</option>
                        <option value="Ceza Muhakemesi Hukuku">Ceza Muhakemesi Hukuku</option>
                        <option value="Anayasa Hukuku">Anayasa Hukuku</option>
                        <option value="İdare Hukuku">İdare Hukuku</option>
                        <option value="Devlet Memurları Kanunu">Devlet Memurları Kanunu</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <button id="btnRefresh" class="btn btn-secondary w-100">🔄 Yenile</button>
                </div>
            </div>
        </div>

        <div id="questionsListGrid" class="questions-grid">
            <p class="text-center text-muted">Sorular yükleniyor...</p>
        </div>

        <div id="questionModal" class="modal-overlay" style="display:none;">
            <div class="modal-content admin-modal-content">
                <div class="modal-header">
                    <h3 id="modalTitle">Soru Düzenle</h3>
                    <button id="btnCloseModal" class="close-btn">&times;</button>
                </div>
                
                <form id="questionForm" class="modal-body-scroll">
                    <input type="hidden" id="editQuestionId">

                    <div class="row">
                        <div class="col-md-6 form-group">
                            <label>Ders / Kategori</label>
                            <input type="text" id="inpCategory" class="form-control" list="categoryList" placeholder="Kategori Seçin veya Yazın" required>
                            <datalist id="categoryList">
                                <option value="Ceza Muhakemesi Hukuku">
                                <option value="Anayasa Hukuku">
                                <option value="İdare Hukuku">
                                <option value="Devlet Memurları Kanunu">
                                <option value="Ceza Hukuku Genel">
                            </datalist>
                        </div>
                        <div class="col-md-3 form-group">
                            <label>Zorluk (1-5)</label>
                            <input type="number" id="inpDifficulty" class="form-control" min="1" max="5" value="3">
                        </div>
                        <div class="col-md-3 form-group">
                            <label>Soru Tipi</label>
                            <select id="inpType" class="form-control">
                                <option value="standard">Standart</option>
                                <option value="oncullu">Öncüllü (I, II, III)</option>
                            </select>
                        </div>
                    </div>

                    <div id="onculluArea" class="card p-3 mb-3" style="display:none; border:1px solid var(--gold-primary);">
                        <label style="color:var(--gold-primary)">Öncüller (Sırasıyla)</label>
                        <div id="oncullerList"></div>
                        <div class="d-flex gap-2 mt-2">
                            <input type="text" id="inpNewOncul" class="form-control" placeholder="Örn: I. Sanık 5 yıl denetime tabi tutulur.">
                            <button type="button" id="btnAddOncul" class="btn btn-sm btn-secondary">Ekle</button>
                        </div>
                        <div class="form-group mt-3">
                            <label>Soru Kökü</label>
                            <input type="text" id="inpQuestionRoot" class="form-control" placeholder="Örn: Aşağıdaki ifadelerden hangileri doğrudur?">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Soru Metni / Paragraf</label>
                        <textarea id="inpText" class="form-control" rows="4" required></textarea>
                    </div>

                    <div class="row">
                        <div class="col-md-6 form-group"><input type="text" id="inpOptA" class="form-control" placeholder="A Seçeneği" required></div>
                        <div class="col-md-6 form-group"><input type="text" id="inpOptB" class="form-control" placeholder="B Seçeneği" required></div>
                        <div class="col-md-6 form-group"><input type="text" id="inpOptC" class="form-control" placeholder="C Seçeneği" required></div>
                        <div class="col-md-6 form-group"><input type="text" id="inpOptD" class="form-control" placeholder="D Seçeneği" required></div>
                        <div class="col-md-6 form-group"><input type="text" id="inpOptE" class="form-control" placeholder="E Seçeneği" required></div>
                        <div class="col-md-6 form-group">
                            <select id="inpCorrect" class="form-control bg-success text-white" required>
                                <option value="" disabled selected>Doğru Cevabı Seç</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                            </select>
                        </div>
                    </div>

                    <div class="card p-3 mt-3" style="background: rgba(255,255,255,0.05);">
                        <h4 style="color:var(--gold-primary); margin-bottom:10px;">💡 Detaylı Çözüm Verileri</h4>
                        
                        <div class="form-group">
                            <label>Analiz (Detaylı Açıklama)</label>
                            <textarea id="inpSolAnaliz" class="form-control" rows="3"></textarea>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6 form-group">
                                <label>Mevzuat Dayanağı</label>
                                <input type="text" id="inpSolDayanak" class="form-control" placeholder="Örn: CMK m. 231/5">
                            </div>
                            <div class="col-md-6 form-group">
                                <label>Hap Bilgi (Özet)</label>
                                <input type="text" id="inpSolHap" class="form-control" placeholder="Örn: HAGB = 5 yıl denetim.">
                            </div>
                        </div>

                        <div class="form-group">
                            <label style="color:#ef4444">Sınav Tuzağı (Dikkat)</label>
                            <input type="text" id="inpSolTuzak" class="form-control" placeholder="Örn: Denetim süresi 3 yıl değildir.">
                        </div>
                    </div>

                    <div class="row mt-3">
                        <div class="col-md-4 form-group">
                            <label>Kanun Kodu</label>
                            <input type="text" id="inpLegCode" class="form-control" placeholder="Örn: 5271">
                        </div>
                        <div class="col-md-4 form-group">
                            <label>Kanun Adı</label>
                            <input type="text" id="inpLegName" class="form-control" placeholder="Örn: CMK">
                        </div>
                        <div class="col-md-4 form-group">
                            <label>Madde No</label>
                            <input type="text" id="inpLegArt" class="form-control" placeholder="Örn: 231">
                        </div>
                    </div>
                    
                    <div class="form-group mt-3">
                        <label>Etiketler (Virgülle Ayırın)</label>
                        <input type="text" id="inpTags" class="form-control" placeholder="Örn: anayasa, temel haklar, 2024">
                    </div>

                    <div class="form-actions mt-4 text-right">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                        <button type="submit" class="btn btn-success">💾 Kaydet</button>
                    </div>
                </form>
            </div>
        </div>
        
        <style>
            .modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; justify-content:center; align-items:center; }
            .admin-modal-content { background: var(--bg-panel); width: 90%; max-width: 900px; height: 90vh; border-radius: 12px; display:flex; flex-direction:column; border: 1px solid var(--border-color); }
            .modal-header { padding: 1.5rem; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; }
            .modal-body-scroll { padding: 1.5rem; overflow-y: auto; flex:1; }
            .close-btn { background:none; border:none; color:white; font-size:1.5rem; cursor:pointer; }
            .oncul-item { display:flex; justify-content:space-between; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:4px; }
        </style>
    `;

    // Global Elementleri Bağla
    modalElement = document.getElementById('questionModal');
    questionForm = document.getElementById('questionForm');

    // Event Listenerlar
    document.getElementById('btnNewQuestion').addEventListener('click', () => openQuestionEditor());
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnRefresh').addEventListener('click', loadQuestions);
    document.getElementById('inpType').addEventListener('change', toggleQuestionType);
    document.getElementById('btnAddOncul').addEventListener('click', addOncul);
    questionForm.addEventListener('submit', handleSaveQuestion);
    
    // Global Fonksiyonları Window'a Ata (HTML onclick için)
    window.removeOnculInternal = removeOncul;
    window.openQuestionEditorInternal = openQuestionEditor;
    window.closeModal = closeModal;
}

// 2. MODAL İŞLEMLERİ

// Tipi Değiştirince Arayüzü Güncelle
function toggleQuestionType() {
    const type = document.getElementById('inpType').value;
    const area = document.getElementById('onculluArea');
    if(type === 'oncullu') {
        area.style.display = 'block';
    } else {
        area.style.display = 'none';
    }
}

// Öncül Ekleme
function addOncul() {
    const input = document.getElementById('inpNewOncul');
    const val = input.value.trim();
    if(!val) return;

    currentOnculler.push(val);
    renderOnculler();
    input.value = '';
    input.focus();
}

// Öncül Silme
function removeOncul(index) {
    currentOnculler.splice(index, 1);
    renderOnculler();
}

// Öncülleri Ekrana Basma
function renderOnculler() {
    const list = document.getElementById('oncullerList');
    list.innerHTML = '';
    currentOnculler.forEach((text, index) => {
        const div = document.createElement('div');
        div.className = 'oncul-item';
        div.innerHTML = `<span>${text}</span> <button type="button" class="btn btn-sm btn-danger" onclick="window.removeOnculInternal(${index})">Sil</button>`;
        list.appendChild(div);
    });
}

// Modalı Aç
export async function openQuestionEditor(questionId = null) {
    modalElement.style.display = 'flex';
    const title = document.getElementById('modalTitle');
    questionForm.reset();
    currentOnculler = [];
    renderOnculler();

    if (questionId) {
        title.innerText = "Soruyu Düzenle";
        document.getElementById('editQuestionId').value = questionId;
        
        // Veriyi Getir
        try {
            const docSnap = await getDoc(doc(db, "questions", questionId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Temel Alanlar
                document.getElementById('inpCategory').value = data.category || '';
                document.getElementById('inpDifficulty').value = data.difficulty || 3;
                document.getElementById('inpType').value = data.type || 'standard';
                document.getElementById('inpText').value = data.text || '';
                document.getElementById('inpTags').value = data.tags ? data.tags.join(', ') : '';
                
                // Seçenekler
                if(Array.isArray(data.options)) {
                    // Array formatındaysa (yeni yapı)
                    const map = {};
                    data.options.forEach(o => map[o.id] = o.text);
                    document.getElementById('inpOptA').value = map['A'] || '';
                    document.getElementById('inpOptB').value = map['B'] || '';
                    document.getElementById('inpOptC').value = map['C'] || '';
                    document.getElementById('inpOptD').value = map['D'] || '';
                    document.getElementById('inpOptE').value = map['E'] || '';
                } else {
                    // Eski map yapısı
                    document.getElementById('inpOptA').value = data.options?.A || '';
                    document.getElementById('inpOptB').value = data.options?.B || '';
                    document.getElementById('inpOptC').value = data.options?.C || '';
                    document.getElementById('inpOptD').value = data.options?.D || '';
                    document.getElementById('inpOptE').value = data.options?.E || '';
                }
                
                document.getElementById('inpCorrect').value = data.correctOption;

                // Öncüllü Soru Verileri
                if(data.type === 'oncullu') {
                    currentOnculler = data.onculler || [];
                    document.getElementById('inpQuestionRoot').value = data.questionRoot || '';
                    renderOnculler();
                }
                toggleQuestionType();

                // Çözüm Verileri
                const sol = data.solution || {};
                document.getElementById('inpSolAnaliz').value = sol.analiz || '';
                document.getElementById('inpSolDayanak').value = sol.dayanakText || '';
                document.getElementById('inpSolHap').value = sol.hap || '';
                document.getElementById('inpSolTuzak').value = sol.tuzak || '';

                // Mevzuat Verileri
                const leg = data.legislationRef || {};
                document.getElementById('inpLegCode').value = leg.code || '';
                document.getElementById('inpLegName').value = leg.name || '';
                document.getElementById('inpLegArt').value = leg.article || '';
            }
        } catch (e) {
            console.error("Hata:", e);
        }
    } else {
        title.innerText = "Yeni Soru Ekle";
        document.getElementById('editQuestionId').value = "";
        toggleQuestionType();
    }
}

function closeModal() {
    modalElement.style.display = 'none';
}

// 3. KAYDETME İŞLEMİ (Veri Yapısına Uygun)
async function handleSaveQuestion(e) {
    e.preventDefault();
    const id = document.getElementById('editQuestionId').value;
    
    // Veri Yapısını Oluştur (Verdiğin JSON formatına birebir uygun)
    const questionData = {
        category: document.getElementById('inpCategory').value,
        difficulty: parseInt(document.getElementById('inpDifficulty').value),
        type: document.getElementById('inpType').value,
        text: document.getElementById('inpText').value,
        tags: document.getElementById('inpTags').value.split(',').map(t => t.trim()).filter(Boolean),
        isActive: true,
        isFlaggedForReview: false,
        
        // Seçenekleri Array Olarak Kaydet (Frontend ile uyumlu)
        options: [
            { id: "A", text: document.getElementById('inpOptA').value },
            { id: "B", text: document.getElementById('inpOptB').value },
            { id: "C", text: document.getElementById('inpOptC').value },
            { id: "D", text: document.getElementById('inpOptD').value },
            { id: "E", text: document.getElementById('inpOptE').value }
        ],
        correctOption: document.getElementById('inpCorrect').value,
        
        // Gelişmiş Çözüm Objesi
        solution: {
            analiz: document.getElementById('inpSolAnaliz').value,
            dayanakText: document.getElementById('inpSolDayanak').value,
            hap: document.getElementById('inpSolHap').value,
            tuzak: document.getElementById('inpSolTuzak').value
        },
        
        // Mevzuat Referansı
        legislationRef: {
            code: document.getElementById('inpLegCode').value,
            name: document.getElementById('inpLegName').value,
            article: document.getElementById('inpLegArt').value
        },
        
        updatedAt: serverTimestamp()
    };

    // Öncüllü ise ek alanları ekle
    if (questionData.type === 'oncullu') {
        questionData.onculler = currentOnculler;
        questionData.questionRoot = document.getElementById('inpQuestionRoot').value;
    } else {
        questionData.onculler = [];
        questionData.questionRoot = null;
    }

    try {
        if (id) {
            await updateDoc(doc(db, "questions", id), questionData);
            alert("Soru başarıyla güncellendi.");
        } else {
            questionData.createdAt = serverTimestamp();
            await addDoc(collection(db, "questions"), questionData);
            alert("Yeni soru başarıyla eklendi.");
        }
        closeModal();
        loadQuestions(); // Listeyi yenile
    } catch (error) {
        console.error("Kaydetme hatası:", error);
        alert("Hata: " + error.message);
    }
}

// 4. LİSTELEME
async function loadQuestions() {
    const list = document.getElementById('questionsListGrid');
    const category = document.getElementById('filterCategory').value;
    list.innerHTML = '<div class="text-center p-4">Yükleniyor...</div>';

    // Sorgu oluştur
    let q = query(collection(db, "questions"), orderBy("updatedAt", "desc"), limit(50));
    
    try {
        const snapshot = await getDocs(q);
        list.innerHTML = '';
        
        if(snapshot.empty) {
            list.innerHTML = '<div class="text-center p-4">Hiç soru bulunamadı.</div>';
            return;
        }

        let count = 0;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Basit client-side filtreleme (Firestore index yetmezse diye)
            if(category && data.category !== category && !data.category.includes(category)) return;

            count++;
            const card = document.createElement('div');
            card.className = 'card mb-2 p-3';
            // Öncüllü ise sol tarafı altın sarısı, değilse normal
            card.style.borderLeft = data.type === 'oncullu' ? '4px solid var(--gold-primary)' : '4px solid var(--border-color)';
            
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div style="flex:1;">
                        <span class="badge" style="background: #333">${data.category}</span>
                        <span class="badge ${data.type === 'oncullu' ? 'warning' : 'secondary'}">${data.type === 'oncullu' ? 'Öncüllü' : 'Standart'}</span>
                        <h5 class="mt-2 text-truncate" style="max-width: 90%; font-size:1rem;">${data.text}</h5>
                        <div class="text-muted text-sm mt-1">
                             ${data.legislationRef?.name ? `<span class="mr-2">⚖️ ${data.legislationRef.name} m.${data.legislationRef.article}</span>` : ''}
                             ${data.tags && data.tags.length > 0 ? `🏷️ ${data.tags.slice(0,3).join(', ')}` : ''}
                        </div>
                    </div>
                    <div class="text-right pl-3" style="min-width: 100px;">
                        <button class="btn btn-sm btn-primary" onclick="window.openQuestionEditorInternal('${docSnap.id}')">✏️ Düzenle</button>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });

        if (count === 0) {
            list.innerHTML = '<div class="text-center p-4">Bu kategoride soru bulunamadı.</div>';
        }

    } catch (e) {
        console.error(e);
        list.innerHTML = `<div class="text-danger">Yükleme Hatası: ${e.message}</div>`;
    }
}